"""Report builders. Each returns {title, columns, rows, summary} built from live database records."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFound
from app.models import Bill, Complaint, Customer, ElectricityConnection, MeterReading, Payment, TariffPlan
from app.models.billing import OPEN_BILL_STATUSES
from app.services.analytics_service import month_expr, year_expr


@dataclass
class ReportFilters:
    date_from: date | None = None
    date_to: date | None = None
    year: int | None = None
    month: int | None = None
    customer_type: str | None = None
    status: str | None = None
    tariff_id: int | None = None

    def periods(self) -> tuple[str | None, str | None]:
        if self.year and self.month:
            p = f"{self.year:04d}-{self.month:02d}"
            return p, p
        if self.year:
            return f"{self.year:04d}-01", f"{self.year:04d}-12"
        frm = f"{self.date_from.year:04d}-{self.date_from.month:02d}" if self.date_from else None
        to = f"{self.date_to.year:04d}-{self.date_to.month:02d}" if self.date_to else None
        return frm, to

    def describe(self) -> str:
        parts = []
        frm, to = self.periods()
        if frm or to:
            parts.append(f"Period {frm or '...'} to {to or '...'}")
        if self.customer_type:
            parts.append(f"Type: {self.customer_type}")
        if self.status:
            parts.append(f"Status: {self.status}")
        if self.tariff_id:
            parts.append(f"Tariff #{self.tariff_id}")
        return " | ".join(parts)


def C(key, label, typ=None):
    return {"key": key, "label": label, "type": typ}


def _bill_period_filter(stmt, f: ReportFilters):
    frm, to = f.periods()
    if frm:
        stmt = stmt.where(Bill.billing_period >= frm)
    if to:
        stmt = stmt.where(Bill.billing_period <= to)
    if f.customer_type:
        stmt = stmt.where(Customer.customer_type == f.customer_type)
    if f.tariff_id:
        stmt = stmt.where(Bill.tariff_plan_id == f.tariff_id)
    return stmt


def revenue_monthly(db: Session, f: ReportFilters) -> dict:
    m = month_expr(db, Payment.payment_date)
    stmt = select(m.label("p"), func.count(Payment.id), func.sum(Payment.amount)).join(Customer, Payment.customer_id == Customer.id) \
        .where(Payment.status == "successful")
    frm, to = f.periods()
    if frm:
        stmt = stmt.where(m >= frm)
    if to:
        stmt = stmt.where(m <= to)
    if f.customer_type:
        stmt = stmt.where(Customer.customer_type == f.customer_type)
    rows = [{"period": p, "payments": n, "revenue": float(a or 0)} for p, n, a in db.execute(stmt.group_by(m).order_by(m)).all()]
    billed = dict(db.execute(_bill_period_filter(
        select(Bill.billing_period, func.sum(Bill.total_amount - Bill.previous_outstanding)).join(Customer, Bill.customer_id == Customer.id)
        .where(Bill.status.notin_(("cancelled", "draft"))), f).group_by(Bill.billing_period)).all())
    for r in rows:
        r["billed_for_period"] = float(billed.get(r["period"], 0) or 0)
    total = sum(r["revenue"] for r in rows)
    return {"title": "Monthly Revenue Report",
            "columns": [C("period", "Month"), C("payments", "Payments"), C("revenue", "Revenue Collected", "money"),
                        C("billed_for_period", "Billed (Period)", "money")],
            "rows": rows, "summary": {"Total collected": f"Rs {total:,.2f}", "Months": len(rows)}}


def revenue_annual(db: Session, f: ReportFilters) -> dict:
    y = year_expr(db, Payment.payment_date)
    collected = dict(db.execute(select(y, func.sum(Payment.amount)).where(Payment.status == "successful").group_by(y)).all())
    by = func.substr(Bill.billing_period, 1, 4)
    stmt = select(by, func.count(Bill.id), func.sum(Bill.total_amount - Bill.previous_outstanding), func.sum(Bill.units_consumed)) \
        .join(Customer, Bill.customer_id == Customer.id).where(Bill.status.notin_(("cancelled", "draft")))
    if f.customer_type:
        stmt = stmt.where(Customer.customer_type == f.customer_type)
    if f.year:
        stmt = stmt.where(by == str(f.year))
    rows = [{"year": yr, "bills": n, "units": float(u or 0), "billed": float(b or 0), "collected": float(collected.get(yr, 0) or 0)}
            for yr, n, b, u in db.execute(stmt.group_by(by).order_by(by)).all()]
    return {"title": "Annual Revenue Report",
            "columns": [C("year", "Year"), C("bills", "Bills"), C("units", "Units (kWh)"), C("billed", "Billed", "money"),
                        C("collected", "Collected", "money")], "rows": rows,
            "summary": {"Years": len(rows)}}


def customers_report(db: Session, f: ReportFilters) -> dict:
    stmt = select(Customer).where(Customer.deleted_at.is_(None))
    if f.customer_type:
        stmt = stmt.where(Customer.customer_type == f.customer_type)
    if f.status:
        stmt = stmt.where(Customer.status == f.status)
    billed = dict(db.execute(select(Bill.customer_id, func.sum(Bill.total_amount - Bill.previous_outstanding))
                             .where(Bill.status.notin_(("cancelled", "draft"))).group_by(Bill.customer_id)).all())
    paid = dict(db.execute(select(Payment.customer_id, func.sum(Payment.amount)).where(Payment.status == "successful")
                           .group_by(Payment.customer_id)).all())
    owed = dict(db.execute(select(Bill.customer_id, func.sum(Bill.balance_due)).where(
        Bill.status.in_(OPEN_BILL_STATUSES), Bill.carried_forward_to_id.is_(None)).group_by(Bill.customer_id)).all())
    rows = []
    for c in db.scalars(stmt.order_by(Customer.customer_code)).unique():
        rows.append({"customer_code": c.customer_code, "full_name": c.full_name, "customer_type": c.customer_type,
                     "city": c.city, "status": c.status, "connections": len([x for x in c.connections if not x.deleted_at]),
                     "total_billed": float(billed.get(c.id, 0) or 0), "total_paid": float(paid.get(c.id, 0) or 0),
                     "outstanding": float(owed.get(c.id, 0) or 0)})
    return {"title": "Customer Report",
            "columns": [C("customer_code", "Customer ID"), C("full_name", "Name"), C("customer_type", "Type"), C("city", "City"),
                        C("status", "Status"), C("connections", "Connections"), C("total_billed", "Billed", "money"),
                        C("total_paid", "Paid", "money"), C("outstanding", "Outstanding", "money")],
            "rows": rows, "summary": {"Customers": len(rows), "Outstanding": f"Rs {sum(r['outstanding'] for r in rows):,.2f}"}}


def consumption_report(db: Session, f: ReportFilters) -> dict:
    stmt = select(MeterReading.billing_period, Customer.customer_type, func.count(MeterReading.id),
                  func.sum(MeterReading.units_consumed), func.avg(MeterReading.units_consumed), func.max(MeterReading.units_consumed)) \
        .join(Customer, MeterReading.customer_id == Customer.id)
    frm, to = f.periods()
    if frm:
        stmt = stmt.where(MeterReading.billing_period >= frm)
    if to:
        stmt = stmt.where(MeterReading.billing_period <= to)
    if f.customer_type:
        stmt = stmt.where(Customer.customer_type == f.customer_type)
    if f.tariff_id:
        stmt = stmt.join(ElectricityConnection, MeterReading.connection_id == ElectricityConnection.id) \
            .where(ElectricityConnection.tariff_plan_id == f.tariff_id)
    rows = [{"period": p, "customer_type": t, "readings": n, "units": float(u or 0), "average": round(float(a or 0), 2),
             "max": float(mx or 0)}
            for p, t, n, u, a, mx in db.execute(stmt.group_by(MeterReading.billing_period, Customer.customer_type)
                                                .order_by(MeterReading.billing_period, Customer.customer_type)).all()]
    return {"title": "Electricity Consumption Report",
            "columns": [C("period", "Period"), C("customer_type", "Customer Type"), C("readings", "Readings"),
                        C("units", "Total Units (kWh)"), C("average", "Avg Units"), C("max", "Max Units")],
            "rows": rows, "summary": {"Total units": f"{sum(r['units'] for r in rows):,.2f} kWh"}}


def _bill_rows(db: Session, f: ReportFilters, statuses, title: str) -> dict:
    stmt = select(Bill).join(Customer, Bill.customer_id == Customer.id).where(
        Bill.status.in_(statuses), Bill.carried_forward_to_id.is_(None), Bill.balance_due > 0)
    stmt = _bill_period_filter(stmt, f)
    if f.status and f.status in statuses:
        stmt = stmt.where(Bill.status == f.status)
    today = date.today()
    rows = []
    for b in db.scalars(stmt.order_by(Bill.due_date)).unique():
        rows.append({"invoice_number": b.invoice_number, "customer_code": b.customer.customer_code,
                     "customer_name": b.customer.full_name, "phone": b.customer.phone, "billing_period": b.billing_period,
                     "total_amount": float(b.total_amount), "amount_paid": float(b.amount_paid),
                     "balance_due": float(b.balance_due), "due_date": b.due_date.isoformat(), "status": b.status,
                     "days_overdue": max(0, (today - b.due_date).days)})
    return {"title": title,
            "columns": [C("invoice_number", "Invoice"), C("customer_code", "Customer ID"), C("customer_name", "Customer"),
                        C("phone", "Phone"), C("billing_period", "Period"), C("total_amount", "Total", "money"),
                        C("amount_paid", "Paid", "money"), C("balance_due", "Balance", "money"), C("due_date", "Due Date"),
                        C("days_overdue", "Days Overdue"), C("status", "Status")],
            "rows": rows, "summary": {"Bills": len(rows), "Balance due": f"Rs {sum(r['balance_due'] for r in rows):,.2f}"}}


def pending_report(db, f):
    return _bill_rows(db, f, OPEN_BILL_STATUSES, "Pending Payments Report")


def overdue_report(db, f):
    return _bill_rows(db, f, ("overdue",), "Overdue Bills Report")


def payments_report(db: Session, f: ReportFilters) -> dict:
    stmt = select(Payment).join(Customer, Payment.customer_id == Customer.id)
    m = month_expr(db, Payment.payment_date)
    if f.date_from:
        stmt = stmt.where(func.date(Payment.payment_date) >= f.date_from)
    if f.date_to:
        stmt = stmt.where(func.date(Payment.payment_date) <= f.date_to)
    if f.year:
        stmt = stmt.where(year_expr(db, Payment.payment_date) == str(f.year))
    if f.year and f.month:
        stmt = stmt.where(m == f"{f.year:04d}-{f.month:02d}")
    if f.status:
        stmt = stmt.where(Payment.status == f.status)
    if f.customer_type:
        stmt = stmt.where(Customer.customer_type == f.customer_type)
    rows = [{"transaction_id": p.transaction_id, "payment_date": p.payment_date.strftime("%Y-%m-%d %H:%M"),
             "invoice_number": p.bill.invoice_number, "customer_code": p.customer.customer_code,
             "customer_name": p.customer.full_name, "method": p.method, "amount": float(p.amount), "status": p.status}
            for p in db.scalars(stmt.order_by(Payment.payment_date.desc())).unique()]
    ok = sum(r["amount"] for r in rows if r["status"] == "successful")
    return {"title": "Payment History Report",
            "columns": [C("transaction_id", "Transaction"), C("payment_date", "Date"), C("invoice_number", "Invoice"),
                        C("customer_code", "Customer ID"), C("customer_name", "Customer"), C("method", "Method"),
                        C("amount", "Amount", "money"), C("status", "Status")],
            "rows": rows, "summary": {"Payments": len(rows), "Successful total": f"Rs {ok:,.2f}"}}


def tariff_report(db: Session, f: ReportFilters) -> dict:
    stmt = select(TariffPlan)
    if f.customer_type:
        stmt = stmt.where(TariffPlan.customer_category == f.customer_type)
    if f.status:
        stmt = stmt.where(TariffPlan.status == f.status)
    if f.tariff_id:
        stmt = stmt.where(TariffPlan.id == f.tariff_id)
    usage = dict(db.execute(select(ElectricityConnection.tariff_plan_id, func.count(ElectricityConnection.id))
                            .where(ElectricityConnection.deleted_at.is_(None)).group_by(ElectricityConnection.tariff_plan_id)).all())
    billed = {t: (n, float(a or 0), float(u or 0)) for t, n, a, u in db.execute(
        select(Bill.tariff_plan_id, func.count(Bill.id), func.sum(Bill.total_amount - Bill.previous_outstanding), func.sum(Bill.units_consumed))
        .where(Bill.status.notin_(("cancelled", "draft"))).group_by(Bill.tariff_plan_id)).all()}
    rows = []
    for t in db.scalars(stmt.order_by(TariffPlan.customer_category)).all():
        slabs = ", ".join(f"{s.from_unit}-{s.to_unit if s.to_unit else '+'}: Rs {float(s.rate):g}" for s in t.slabs) \
            if t.billing_method == "slab" else f"Flat Rs {float(t.flat_rate or 0):g}/unit"
        n, amt, units = billed.get(t.id, (0, 0.0, 0.0))
        rows.append({"code": t.code, "name": t.name, "category": t.customer_category, "method": t.billing_method,
                     "rates": slabs, "fixed_charge": float(t.fixed_charge), "tax_rate": f"{float(t.tax_rate):g}%",
                     "status": t.status, "connections": usage.get(t.id, 0), "bills": n, "units": units, "billed": amt})
    return {"title": "Tariff Report",
            "columns": [C("code", "Code"), C("name", "Tariff"), C("category", "Category"), C("method", "Method"),
                        C("rates", "Rates"), C("fixed_charge", "Fixed", "money"), C("tax_rate", "Duty"), C("status", "Status"),
                        C("connections", "Connections"), C("bills", "Bills"), C("billed", "Billed", "money")],
            "rows": rows, "summary": {"Tariffs": len(rows)}}


def complaints_report(db: Session, f: ReportFilters) -> dict:
    stmt = select(Complaint).join(Customer, Complaint.customer_id == Customer.id)
    if f.date_from:
        stmt = stmt.where(func.date(Complaint.created_at) >= f.date_from)
    if f.date_to:
        stmt = stmt.where(func.date(Complaint.created_at) <= f.date_to)
    if f.year:
        stmt = stmt.where(year_expr(db, Complaint.created_at) == str(f.year))
    if f.status:
        stmt = stmt.where(Complaint.status == f.status)
    if f.customer_type:
        stmt = stmt.where(Customer.customer_type == f.customer_type)
    rows = []
    for c in db.scalars(stmt.order_by(Complaint.created_at.desc())).unique():
        days = ((c.resolved_at or c.updated_at) - c.created_at).days if c.status in ("resolved", "closed") else None
        rows.append({"complaint_code": c.complaint_code, "created_at": c.created_at.strftime("%Y-%m-%d"),
                     "customer_name": c.customer.full_name, "category": c.category.replace("_", " "), "subject": c.subject,
                     "priority": c.priority, "status": c.status, "assigned_to": c.assignee.full_name if c.assignee else None,
                     "resolution_days": days})
    open_n = len([r for r in rows if r["status"] not in ("resolved", "closed")])
    return {"title": "Complaint Report",
            "columns": [C("complaint_code", "ID"), C("created_at", "Date"), C("customer_name", "Customer"),
                        C("category", "Category"), C("subject", "Subject"), C("priority", "Priority"), C("status", "Status"),
                        C("assigned_to", "Assigned To"), C("resolution_days", "Days to Resolve")],
            "rows": rows, "summary": {"Complaints": len(rows), "Open": open_n}}


def category_report(db: Session, f: ReportFilters) -> dict:
    frm, to = f.periods()
    out = []
    for t in ("residential", "commercial", "industrial"):
        if f.customer_type and f.customer_type != t:
            continue
        customers = db.scalar(select(func.count(Customer.id)).where(Customer.customer_type == t, Customer.deleted_at.is_(None))) or 0
        conns = db.scalar(select(func.count(ElectricityConnection.id)).join(Customer).where(
            Customer.customer_type == t, ElectricityConnection.deleted_at.is_(None))) or 0
        bq = select(func.count(Bill.id), func.sum(Bill.units_consumed), func.sum(Bill.total_amount - Bill.previous_outstanding)) \
            .join(Customer, Bill.customer_id == Customer.id).where(Customer.customer_type == t, Bill.status.notin_(("cancelled", "draft")))
        if frm:
            bq = bq.where(Bill.billing_period >= frm)
        if to:
            bq = bq.where(Bill.billing_period <= to)
        n, units, billed = db.execute(bq).one()
        collected = db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).join(Customer, Payment.customer_id == Customer.id)
                              .where(Customer.customer_type == t, Payment.status == "successful")) or 0
        owed = db.scalar(select(func.coalesce(func.sum(Bill.balance_due), 0)).join(Customer, Bill.customer_id == Customer.id)
                         .where(Customer.customer_type == t, Bill.status.in_(OPEN_BILL_STATUSES),
                                Bill.carried_forward_to_id.is_(None))) or 0
        out.append({"customer_type": t, "customers": customers, "connections": conns, "bills": n or 0,
                    "units": float(units or 0), "billed": float(billed or 0), "collected": float(collected),
                    "outstanding": float(owed),
                    "avg_units_per_bill": round(float(units or 0) / n, 2) if n else 0})
    return {"title": "Customer Category Report",
            "columns": [C("customer_type", "Category"), C("customers", "Customers"), C("connections", "Connections"),
                        C("bills", "Bills"), C("units", "Units (kWh)"), C("avg_units_per_bill", "Avg Units/Bill"),
                        C("billed", "Billed", "money"), C("collected", "Collected", "money"),
                        C("outstanding", "Outstanding", "money")], "rows": out, "summary": {}}


REPORTS = {
    "revenue": revenue_monthly,
    "annual-revenue": revenue_annual,
    "customers": customers_report,
    "consumption": consumption_report,
    "pending": pending_report,
    "overdue": overdue_report,
    "payments": payments_report,
    "tariffs": tariff_report,
    "complaints": complaints_report,
    "categories": category_report,
}


def build(db: Session, key: str, f: ReportFilters) -> dict:
    fn = REPORTS.get(key)
    if not fn:
        raise NotFound("Unknown report.")
    return fn(db, f)
