"""Dashboard KPIs and chart series, all computed from database records."""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import Bill, Complaint, Customer, ElectricityConnection, MeterReading, Payment
from app.models.billing import OPEN_BILL_STATUSES


def month_expr(db: Session, col):
    """'YYYY-MM' from a date/datetime column, for SQLite, PostgreSQL and MySQL."""
    dialect = db.get_bind().dialect.name
    if dialect == "sqlite":
        return func.strftime("%Y-%m", col)
    if dialect == "postgresql":
        return func.to_char(col, "YYYY-MM")
    return func.date_format(col, "%Y-%m")


def year_expr(db: Session, col):
    dialect = db.get_bind().dialect.name
    if dialect == "sqlite":
        return func.strftime("%Y", col)
    if dialect == "postgresql":
        return func.to_char(col, "YYYY")
    return func.date_format(col, "%Y")


def period_of(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def shift_period(period: str, months: int) -> str:
    y, m = (int(x) for x in period.split("-"))
    total = y * 12 + (m - 1) + months
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


def period_range(period_from: str | None, period_to: str | None, default_months: int = 12) -> tuple[str, str]:
    to = period_to or period_of(date.today())
    frm = period_from or shift_period(to, -(default_months - 1))
    if frm > to:
        frm, to = to, frm
    return frm, to


def _periods(frm: str, to: str) -> list[str]:
    out, p = [], frm
    while p <= to and len(out) < 120:
        out.append(p)
        p = shift_period(p, 1)
    return out


def _change(curr: float, prev: float) -> float | None:
    if not prev:
        return None
    return round((curr - prev) / prev * 100, 1)


def dashboard_kpis(db: Session) -> dict:
    today = date.today()
    this_p, last_p = period_of(today), shift_period(period_of(today), -1)
    m = lambda col: month_expr(db, col)  # noqa: E731

    customers = db.scalar(select(func.count(Customer.id)).where(Customer.deleted_at.is_(None))) or 0
    new_this = db.scalar(select(func.count(Customer.id)).where(Customer.deleted_at.is_(None), m(Customer.created_at) == this_p)) or 0
    new_last = db.scalar(select(func.count(Customer.id)).where(Customer.deleted_at.is_(None), m(Customer.created_at) == last_p)) or 0
    active_conn = db.scalar(select(func.count(ElectricityConnection.id)).where(
        ElectricityConnection.status == "active", ElectricityConnection.deleted_at.is_(None))) or 0
    total_conn = db.scalar(select(func.count(ElectricityConnection.id)).where(ElectricityConnection.deleted_at.is_(None))) or 0

    bills_this = db.scalar(select(func.count(Bill.id)).where(Bill.status.notin_(("cancelled", "draft")), m(Bill.issue_date) == this_p)) or 0
    bills_last = db.scalar(select(func.count(Bill.id)).where(Bill.status.notin_(("cancelled", "draft")), m(Bill.issue_date) == last_p)) or 0

    ok = Payment.status == "successful"
    revenue = float(db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(ok)) or 0)
    rev_this = float(db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(ok, m(Payment.payment_date) == this_p)) or 0)
    rev_last = float(db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(ok, m(Payment.payment_date) == last_p)) or 0)

    open_q = (Bill.status.in_(OPEN_BILL_STATUSES), Bill.carried_forward_to_id.is_(None), Bill.balance_due > 0)
    pending_amt = float(db.scalar(select(func.coalesce(func.sum(Bill.balance_due), 0)).where(*open_q)) or 0)
    pending_cnt = db.scalar(select(func.count(Bill.id)).where(*open_q)) or 0
    overdue_cnt = db.scalar(select(func.count(Bill.id)).where(Bill.status == "overdue", Bill.carried_forward_to_id.is_(None))) or 0
    overdue_amt = float(db.scalar(select(func.coalesce(func.sum(Bill.balance_due), 0)).where(
        Bill.status == "overdue", Bill.carried_forward_to_id.is_(None))) or 0)

    latest_p = db.scalar(select(func.max(MeterReading.billing_period))) or this_p
    units_latest = float(db.scalar(select(func.coalesce(func.sum(MeterReading.units_consumed), 0)).where(MeterReading.billing_period == latest_p)) or 0)
    units_prev = float(db.scalar(select(func.coalesce(func.sum(MeterReading.units_consumed), 0)).where(
        MeterReading.billing_period == shift_period(latest_p, -1))) or 0)
    units_total = float(db.scalar(select(func.coalesce(func.sum(MeterReading.units_consumed), 0))) or 0)

    open_c = db.scalar(select(func.count(Complaint.id)).where(Complaint.status.notin_(("resolved", "closed")))) or 0
    open_c_last = db.scalar(select(func.count(Complaint.id)).where(m(Complaint.created_at) == last_p)) or 0
    new_c_this = db.scalar(select(func.count(Complaint.id)).where(m(Complaint.created_at) == this_p)) or 0

    return {
        "current_period": this_p,
        "total_customers": {"value": customers, "new_this_month": new_this, "change_pct": _change(new_this, new_last),
                            "note": f"{new_this} new this month"},
        "active_connections": {"value": active_conn, "total": total_conn, "note": f"of {total_conn} connections"},
        "bills_this_month": {"value": bills_this, "previous": bills_last, "change_pct": _change(bills_this, bills_last)},
        "total_revenue": {"value": revenue, "this_month": rev_this, "previous": rev_last, "change_pct": _change(rev_this, rev_last)},
        "pending_payments": {"value": pending_amt, "count": pending_cnt},
        "overdue_bills": {"value": overdue_cnt, "amount": overdue_amt},
        "units_consumed": {"value": units_total, "latest_period": latest_p, "latest": units_latest, "previous": units_prev,
                           "change_pct": _change(units_latest, units_prev)},
        "open_complaints": {"value": open_c, "new_this_month": new_c_this, "change_pct": _change(new_c_this, open_c_last)},
    }


def consumption_series(db: Session, frm: str, to: str) -> list[dict]:
    rows = db.execute(
        select(MeterReading.billing_period, Customer.customer_type, func.sum(MeterReading.units_consumed))
        .join(Customer, MeterReading.customer_id == Customer.id)
        .where(MeterReading.billing_period.between(frm, to))
        .group_by(MeterReading.billing_period, Customer.customer_type)
    ).all()
    data = {p: {"period": p, "residential": 0.0, "commercial": 0.0, "industrial": 0.0, "total": 0.0} for p in _periods(frm, to)}
    for p, t, u in rows:
        if p in data:
            data[p][t] = float(u or 0)
            data[p]["total"] += float(u or 0)
    return list(data.values())


def revenue_series(db: Session, frm: str, to: str) -> list[dict]:
    m = month_expr(db, Payment.payment_date)
    rows = db.execute(select(m, func.sum(Payment.amount), func.count(Payment.id))
                      .where(Payment.status == "successful", m.between(frm, to)).group_by(m)).all()
    found = {p: (float(a or 0), c) for p, a, c in rows}
    return [{"period": p, "revenue": found.get(p, (0.0, 0))[0], "payments": found.get(p, (0.0, 0))[1]} for p in _periods(frm, to)]


def billing_series(db: Session, frm: str, to: str) -> list[dict]:
    rows = db.execute(
        select(Bill.billing_period, func.sum(Bill.total_amount - Bill.previous_outstanding), func.sum(Bill.amount_paid),
               func.count(Bill.id))
        .where(Bill.status.notin_(("cancelled", "draft")), Bill.billing_period.between(frm, to))
        .group_by(Bill.billing_period)
    ).all()
    found = {p: (float(b or 0), float(c or 0), n) for p, b, c, n in rows}
    return [{"period": p, "billed": found.get(p, (0, 0, 0))[0], "collected": found.get(p, (0, 0, 0))[1],
             "bills": found.get(p, (0, 0, 0))[2]} for p in _periods(frm, to)]


def bill_status_breakdown(db: Session, frm: str, to: str) -> list[dict]:
    rows = db.execute(
        select(Bill.status, func.count(Bill.id), func.sum(Bill.total_amount))
        .where(Bill.status.notin_(("cancelled", "draft")), Bill.billing_period.between(frm, to))
        .group_by(Bill.status)
    ).all()
    return [{"status": s, "count": c, "amount": float(a or 0)} for s, c, a in rows]


def customer_growth(db: Session, frm: str, to: str) -> list[dict]:
    m = month_expr(db, Customer.created_at)
    rows = dict(db.execute(select(m, func.count(Customer.id)).where(Customer.deleted_at.is_(None)).group_by(m)).all())
    base = db.scalar(select(func.count(Customer.id)).where(Customer.deleted_at.is_(None), m < frm)) or 0
    out, running = [], base
    for p in _periods(frm, to):
        running += rows.get(p, 0)
        out.append({"period": p, "new_customers": rows.get(p, 0), "total_customers": running})
    return out


def consumption_distribution(db: Session, frm: str, to: str) -> list[dict]:
    rows = db.execute(
        select(Customer.customer_type, func.sum(MeterReading.units_consumed), func.count(func.distinct(MeterReading.connection_id)))
        .join(Customer, MeterReading.customer_id == Customer.id)
        .where(MeterReading.billing_period.between(frm, to)).group_by(Customer.customer_type)
    ).all()
    bands = case(
        (MeterReading.units_consumed <= 100, "0-100"), (MeterReading.units_consumed <= 200, "101-200"),
        (MeterReading.units_consumed <= 300, "201-300"), (MeterReading.units_consumed <= 1000, "301-1000"), else_="1000+",
    )
    band_rows = db.execute(select(bands, func.count(MeterReading.id)).where(MeterReading.billing_period.between(frm, to))
                           .group_by(bands)).all()
    order = ["0-100", "101-200", "201-300", "301-1000", "1000+"]
    band_map = dict(band_rows)
    return {
        "by_type": [{"customer_type": t, "units": float(u or 0), "connections": n} for t, u, n in rows],
        "by_band": [{"band": b, "readings": band_map.get(b, 0)} for b in order],
    }


def recent_activity(db: Session) -> dict:
    bills = db.scalars(select(Bill).where(Bill.status != "draft").order_by(Bill.created_at.desc()).limit(6)).unique().all()
    pays = db.scalars(select(Payment).order_by(Payment.payment_date.desc()).limit(6)).unique().all()
    return {
        "recent_bills": [{"id": b.id, "invoice_number": b.invoice_number, "customer_name": b.customer.full_name,
                          "total_amount": float(b.total_amount), "status": b.status, "billing_period": b.billing_period}
                         for b in bills],
        "recent_payments": [{"id": p.id, "transaction_id": p.transaction_id, "customer_name": p.customer.full_name,
                             "amount": float(p.amount), "status": p.status, "method": p.method,
                             "payment_date": p.payment_date.isoformat()} for p in pays],
    }


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")
