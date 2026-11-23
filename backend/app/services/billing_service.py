"""Automated billing engine: preview, generate, issue, cancel, overdue sweep and reminders.

All money maths lives in tariff_calc; this module adds the database rules:
- one non-cancelled bill per connection per billing period (enforced by a UNIQUE key too)
- tariff rates are frozen onto every bill (tariff_snapshot + bill_items)
- unpaid balances of earlier bills are carried forward, with a late fee if they were overdue
"""
from __future__ import annotations

import calendar
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequest, Conflict, NotFound
from app.models import Bill, BillItem, ElectricityConnection, MeterReading, TariffPlan
from app.models.billing import OPEN_BILL_STATUSES
from app.services import settings_service as ss
from app.services.audit import log_action
from app.services.notifications import notify_customer
from app.services.tariff_calc import BillCalculation, TariffError, calculate_bill, money, tariff_snapshot

ZERO = Decimal("0")


def period_bounds(period: str) -> tuple[date, date]:
    try:
        y, m = (int(x) for x in period.split("-"))
        start = date(y, m, 1)
    except Exception as exc:
        raise BadRequest("Billing period must look like YYYY-MM.") from exc
    return start, date(y, m, calendar.monthrange(y, m)[1])


def tariff_valid_for(tariff: TariffPlan, period: str) -> bool:
    start, end = period_bounds(period)
    if tariff.status != "active":
        return False
    if tariff.effective_from > end:
        return False
    return tariff.effective_to is None or tariff.effective_to >= start


def _open_previous_bills(db: Session, connection_id: int, period: str) -> list[Bill]:
    return list(
        db.scalars(
            select(Bill).where(
                Bill.connection_id == connection_id,
                Bill.billing_period < period,
                Bill.status.in_(OPEN_BILL_STATUSES),
                Bill.carried_forward_to_id.is_(None),
                Bill.balance_due > 0,
            )
        ).all()
    )


def _resolve_reading(db: Session, reading_id: int | None, connection_id: int | None, period: str | None) -> MeterReading:
    if reading_id:
        reading = db.get(MeterReading, reading_id)
    elif connection_id and period:
        reading = db.scalar(
            select(MeterReading).where(MeterReading.connection_id == connection_id, MeterReading.billing_period == period)
        )
    else:
        raise BadRequest("Provide a reading_id, or a connection_id with a billing_period.")
    if not reading:
        raise NotFound("No meter reading found for this connection and billing period. Enter the reading first.")
    return reading


def compute_for_reading(
    db: Session,
    reading: MeterReading,
    *,
    discount=0,
    extra_charges=0,
    issue_date: date | None = None,
) -> tuple[BillCalculation, dict, list[Bill], TariffPlan]:
    conn: ElectricityConnection = reading.connection
    if conn.status in ("pending", "disconnected"):
        raise BadRequest(f"Connection {conn.connection_code} is {conn.status}; it cannot be billed.")
    tariff = conn.tariff_plan
    if not tariff_valid_for(tariff, reading.billing_period):
        raise BadRequest(
            f"Tariff '{tariff.name}' is not active/effective for {reading.billing_period}. Assign a valid tariff first."
        )
    snap = tariff_snapshot(tariff)
    issue_date = issue_date or date.today()
    prev_bills = _open_previous_bills(db, conn.id, reading.billing_period)
    outstanding = sum((b.balance_due for b in prev_bills), ZERO)
    overdue_amount = sum((b.balance_due for b in prev_bills if b.due_date < issue_date), ZERO)
    late_fee = money(overdue_amount * ss.get_decimal(db, "late_fee_percent") / Decimal(100))
    try:
        calc = calculate_bill(
            reading.units_consumed,
            snap,
            previous_outstanding=outstanding,
            late_fee=late_fee,
            discount=discount,
            extra_charges=extra_charges,
        )
    except TariffError as exc:
        raise BadRequest(str(exc)) from exc
    return calc, snap, prev_bills, tariff


def calc_to_dict(calc: BillCalculation) -> dict:
    return {
        "units_consumed": float(calc.units),
        "consumption_charge": float(calc.consumption_charge),
        "fixed_charge": float(calc.fixed_charge),
        "additional_charges": float(calc.additional_charges),
        "tax_rate": float(calc.tax_rate),
        "tax_amount": float(calc.tax_amount),
        "late_fee": float(calc.late_fee),
        "discount": float(calc.discount),
        "previous_outstanding": float(calc.previous_outstanding),
        "total_amount": float(calc.total_amount),
        "items": [
            {
                "item_type": l.item_type,
                "description": l.description,
                "units": float(l.units) if l.units is not None else None,
                "rate": float(l.rate) if l.rate is not None else None,
                "amount": float(l.amount),
            }
            for l in calc.lines
        ],
    }


def preview(db: Session, *, reading_id=None, connection_id=None, billing_period=None, discount=0, extra_charges=0) -> dict:
    reading = _resolve_reading(db, reading_id, connection_id, billing_period)
    _ensure_not_billed(db, reading.connection_id, reading.billing_period)
    calc, snap, prev_bills, tariff = compute_for_reading(db, reading, discount=discount, extra_charges=extra_charges)
    conn = reading.connection
    issue = date.today()
    return {
        "customer": {"id": conn.customer.id, "code": conn.customer.customer_code, "name": conn.customer.full_name},
        "connection": {"id": conn.id, "code": conn.connection_code, "meter_number": conn.meter.meter_number},
        "billing_period": reading.billing_period,
        "reading_id": reading.id,
        "previous_reading": float(reading.previous_reading),
        "current_reading": float(reading.current_reading),
        "tariff": {"id": tariff.id, "name": tariff.name, "billing_method": tariff.billing_method},
        "issue_date": issue.isoformat(),
        "due_date": (issue + timedelta(days=ss.get_int(db, "bill_due_days"))).isoformat(),
        "carried_forward_invoices": [b.invoice_number for b in prev_bills],
        **calc_to_dict(calc),
    }


def _ensure_not_billed(db: Session, connection_id: int, period: str) -> None:
    existing = db.scalar(select(Bill).where(Bill.active_period_key == f"{connection_id}:{period}"))
    if existing:
        raise Conflict(
            f"A bill ({existing.invoice_number}) already exists for this connection and period {period}. "
            "Cancel it first if it must be regenerated."
        )


def _invoice_number(db: Session, conn: ElectricityConnection, period: str) -> str:
    prefix = ss.get_setting(db, "invoice_prefix") or "INV"
    base = f"{prefix}-{period.replace('-', '')}-{conn.id:05d}"
    candidate, n = base, 1
    while db.scalar(select(Bill.id).where(Bill.invoice_number == candidate)):
        n += 1
        candidate = f"{base}-R{n}"
    return candidate


def _write_items(bill: Bill, calc: BillCalculation) -> None:
    bill.items.clear()
    for i, l in enumerate(calc.lines):
        bill.items.append(
            BillItem(item_type=l.item_type, description=l.description, units=l.units, rate=l.rate, amount=l.amount, sort_order=i)
        )


def _apply_calc(bill: Bill, calc: BillCalculation) -> None:
    bill.units_consumed = calc.units
    bill.consumption_charge = calc.consumption_charge
    bill.fixed_charge = calc.fixed_charge
    bill.additional_charges = calc.additional_charges
    bill.tax_amount = calc.tax_amount
    bill.late_fee = calc.late_fee
    bill.discount = calc.discount
    bill.previous_outstanding = calc.previous_outstanding
    bill.total_amount = calc.total_amount
    bill.balance_due = money(calc.total_amount - (bill.amount_paid or ZERO))
    _write_items(bill, calc)


def generate_bill(
    db: Session,
    *,
    user_id: int | None,
    reading_id: int | None = None,
    connection_id: int | None = None,
    billing_period: str | None = None,
    discount=0,
    extra_charges=0,
    as_draft: bool = False,
    notify: bool = True,
    remarks: str | None = None,
    issue_date: date | None = None,
    commit: bool = True,
) -> Bill:
    reading = _resolve_reading(db, reading_id, connection_id, billing_period)
    _ensure_not_billed(db, reading.connection_id, reading.billing_period)
    issue_date = issue_date or date.today()
    calc, snap, prev_bills, tariff = compute_for_reading(
        db, reading, discount=discount, extra_charges=extra_charges, issue_date=issue_date
    )
    conn = reading.connection
    bill = Bill(
        invoice_number=_invoice_number(db, conn, reading.billing_period),
        customer_id=conn.customer_id,
        connection_id=conn.id,
        reading_id=reading.id,
        tariff_plan_id=tariff.id,
        billing_period=reading.billing_period,
        active_period_key=f"{conn.id}:{reading.billing_period}",
        previous_reading=reading.previous_reading,
        current_reading=reading.current_reading,
        amount_paid=ZERO,
        issue_date=issue_date,
        due_date=issue_date + timedelta(days=ss.get_int(db, "bill_due_days")),
        status="draft" if as_draft else ("pending" if notify else "generated"),
        tariff_snapshot=snap,
        remarks=remarks,
        created_by=user_id,
    )
    _apply_calc(bill, calc)
    db.add(bill)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise Conflict("A bill already exists for this connection and billing period.") from exc

    if not as_draft:
        _finalize(db, bill, prev_bills, notify)
    log_action(
        db, user_id=user_id, action="bill.generate" if not as_draft else "bill.draft", entity_type="bill",
        entity_id=bill.id, summary=f"{bill.invoice_number} for {conn.connection_code} {bill.billing_period}",
        new={"total_amount": bill.total_amount, "status": bill.status},
    )
    if commit:
        db.commit()
        db.refresh(bill)
    return bill


def _finalize(db: Session, bill: Bill, prev_bills: list[Bill], notify: bool) -> None:
    for old in prev_bills:
        old.carried_forward_to_id = bill.id
    if notify:
        notify_customer(
            db, bill.customer, "bill_generated", "New electricity bill generated",
            f"Your bill {bill.invoice_number} for {bill.billing_period} of Rs {bill.total_amount} is due on "
            f"{bill.due_date.strftime('%d %b %Y')}.",
            link=f"/portal/bills/{bill.id}",
        )


def update_draft(db: Session, bill: Bill, *, user_id: int, discount=None, extra_charges=None, remarks=None) -> Bill:
    if bill.status != "draft":
        raise BadRequest("Only draft bills can be edited.")
    reading = db.get(MeterReading, bill.reading_id)
    current_extra = bill.additional_charges - Decimal(str(bill.tariff_snapshot.get("additional_charges") or 0))
    calc, snap, _, _ = compute_for_reading(
        db, reading,
        discount=bill.discount if discount is None else discount,
        extra_charges=current_extra if extra_charges is None else extra_charges,
        issue_date=bill.issue_date,
    )
    old = {"total_amount": bill.total_amount, "discount": bill.discount, "additional_charges": bill.additional_charges}
    bill.tariff_snapshot = snap
    _apply_calc(bill, calc)
    if remarks is not None:
        bill.remarks = remarks
    log_action(db, user_id=user_id, action="bill.update_draft", entity_type="bill", entity_id=bill.id,
               summary=bill.invoice_number, old=old,
               new={"total_amount": bill.total_amount, "discount": bill.discount, "additional_charges": bill.additional_charges})
    db.commit()
    db.refresh(bill)
    return bill


def issue_draft(db: Session, bill: Bill, *, user_id: int, notify: bool = True) -> Bill:
    if bill.status != "draft":
        raise BadRequest("Only draft bills can be issued.")
    reading = db.get(MeterReading, bill.reading_id)
    today = date.today()
    extra = bill.additional_charges - Decimal(str(bill.tariff_snapshot.get("additional_charges") or 0))
    calc, snap, prev_bills, _ = compute_for_reading(db, reading, discount=bill.discount, extra_charges=extra, issue_date=today)
    bill.tariff_snapshot = snap
    bill.issue_date = today
    bill.due_date = today + timedelta(days=ss.get_int(db, "bill_due_days"))
    _apply_calc(bill, calc)
    bill.status = "pending" if notify else "generated"
    _finalize(db, bill, prev_bills, notify)
    log_action(db, user_id=user_id, action="bill.issue", entity_type="bill", entity_id=bill.id, summary=bill.invoice_number)
    db.commit()
    db.refresh(bill)
    return bill


def cancel_bill(db: Session, bill: Bill, *, user_id: int, reason: str) -> Bill:
    if bill.status == "cancelled":
        raise BadRequest("Bill is already cancelled.")
    if bill.amount_paid > 0:
        raise BadRequest("This bill has payments recorded. Refund them before cancelling.")
    if not reason or len(reason.strip()) < 5:
        raise BadRequest("Please give a cancellation reason (at least 5 characters).")
    later = db.scalar(
        select(Bill.id).where(
            Bill.connection_id == bill.connection_id, Bill.billing_period > bill.billing_period, Bill.status != "cancelled"
        )
    )
    if later:
        raise BadRequest("A later bill exists for this connection. Cancel the latest bill first.")
    old_status = bill.status
    # Release balances that had been carried into this bill
    for old in db.scalars(select(Bill).where(Bill.carried_forward_to_id == bill.id)).all():
        old.carried_forward_to_id = None
    bill.status = "cancelled"
    bill.cancel_reason = reason.strip()
    bill.active_period_key = None
    bill.balance_due = ZERO
    log_action(db, user_id=user_id, action="bill.cancel", entity_type="bill", entity_id=bill.id,
               summary=f"{bill.invoice_number}: {reason.strip()}", old={"status": old_status}, new={"status": "cancelled"})
    db.commit()
    db.refresh(bill)
    return bill


def send_bill_notification(db: Session, bill: Bill, *, user_id: int) -> Bill:
    if bill.status in ("draft", "cancelled"):
        raise BadRequest("Draft or cancelled bills cannot be sent.")
    notify_customer(
        db, bill.customer, "bill_generated", f"Bill {bill.invoice_number}",
        f"Your electricity bill for {bill.billing_period}: Rs {bill.total_amount}, balance Rs {bill.balance_due}, "
        f"due {bill.due_date.strftime('%d %b %Y')}.",
        link=f"/portal/bills/{bill.id}",
    )
    if bill.status == "generated":
        bill.status = "pending"
    log_action(db, user_id=user_id, action="bill.notify", entity_type="bill", entity_id=bill.id, summary=bill.invoice_number)
    db.commit()
    return bill


def refresh_bill_status(bill: Bill, today: date | None = None) -> None:
    """Recompute payment status from the numbers. Draft/cancelled are left alone."""
    if bill.status in ("draft", "cancelled"):
        return
    today = today or date.today()
    if bill.balance_due <= 0:
        bill.status = "paid"
    elif bill.due_date < today:
        bill.status = "overdue"
    elif bill.amount_paid > 0:
        bill.status = "partially_paid"
    elif bill.status not in ("generated", "pending"):
        bill.status = "pending"


def mark_overdue_bills(db: Session, today: date | None = None) -> int:
    today = today or date.today()
    bills = db.scalars(
        select(Bill).where(
            Bill.status.in_(("generated", "pending", "partially_paid")),
            Bill.due_date < today,
            Bill.balance_due > 0,
            Bill.carried_forward_to_id.is_(None),
        )
    ).all()
    for b in bills:
        b.status = "overdue"
        notify_customer(
            db, b.customer, "bill_overdue", "Bill overdue",
            f"Bill {b.invoice_number} (Rs {b.balance_due} due) passed its due date. A late payment charge may apply.",
            link=f"/portal/bills/{b.id}", dedupe_key=f"overdue:{b.id}", email=False,
        )
    if bills:
        db.commit()
    return len(bills)


def send_due_soon_reminders(db: Session, today: date | None = None) -> int:
    today = today or date.today()
    horizon = today + timedelta(days=ss.get_int(db, "due_soon_days"))
    bills = db.scalars(
        select(Bill).where(
            Bill.status.in_(("generated", "pending", "partially_paid")),
            and_(Bill.due_date >= today, Bill.due_date <= horizon),
            Bill.balance_due > 0,
            Bill.carried_forward_to_id.is_(None),
        )
    ).all()
    sent = 0
    for b in bills:
        if notify_customer(
            db, b.customer, "bill_due_soon", "Bill due soon",
            f"Bill {b.invoice_number} of Rs {b.balance_due} is due on {b.due_date.strftime('%d %b %Y')}.",
            link=f"/portal/bills/{b.id}", dedupe_key=f"due_soon:{b.id}", email=False,
        ):
            sent += 1
    db.commit()
    return sent


def generate_monthly(
    db: Session, *, user_id: int, billing_period: str, connection_ids: list[int] | None = None, notify: bool = True,
    as_draft: bool = False,
) -> dict:
    """Bill every reading in the period that has no bill yet. Each bill is its own transaction."""
    period_bounds(billing_period)
    q = select(MeterReading).where(MeterReading.billing_period == billing_period)
    if connection_ids:
        q = q.where(MeterReading.connection_id.in_(connection_ids))
    readings = db.scalars(q).all()
    created, skipped, failed = [], [], []
    for r in readings:
        code = r.connection.connection_code
        if db.scalar(select(Bill.id).where(Bill.active_period_key == f"{r.connection_id}:{billing_period}")):
            skipped.append({"connection": code, "reason": "Already billed"})
            continue
        try:
            bill = generate_bill(db, user_id=user_id, reading_id=r.id, notify=notify, as_draft=as_draft)
            created.append({"connection": code, "invoice_number": bill.invoice_number, "total_amount": float(bill.total_amount)})
        except Exception as exc:  # report per-connection problems instead of aborting the whole run
            db.rollback()
            failed.append({"connection": code, "reason": getattr(exc, "message", str(exc))})
    missing = []
    active = db.scalars(select(ElectricityConnection).where(ElectricityConnection.status == "active",
                                                            ElectricityConnection.deleted_at.is_(None))).all()
    read_ids = {r.connection_id for r in readings}
    for c in active:
        if c.id not in read_ids and (not connection_ids or c.id in connection_ids):
            missing.append({"connection": c.connection_code, "reason": "No meter reading for this period"})
    return {"billing_period": billing_period, "created": created, "skipped": skipped, "failed": failed, "missing_readings": missing}
