"""Payments (Demo Payment Mode - no real money moves). Every change runs in one DB transaction."""
from __future__ import annotations

import secrets
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequest, NotFound
from app.models import Bill, Payment
from app.models.billing import OPEN_BILL_STATUSES
from app.models.base import utcnow
from app.services.audit import log_action
from app.services.billing_service import refresh_bill_status
from app.services.notifications import notify_customer
from app.services.tariff_calc import money

ZERO = Decimal("0")


def _new_codes(db: Session) -> tuple[str, str]:
    stamp = utcnow().strftime("%Y%m%d%H%M%S")
    while True:
        txn = f"TXN{stamp}{secrets.token_hex(3).upper()}"
        if not db.scalar(select(Payment.id).where(Payment.transaction_id == txn)):
            break
    return f"PAY-{stamp}-{secrets.token_hex(2).upper()}", txn


def _lock_bill(db: Session, bill_id: int) -> Bill:
    bill = db.scalar(select(Bill).where(Bill.id == bill_id).with_for_update())
    if not bill:
        raise NotFound("Bill not found.")
    return bill


def record_payment(
    db: Session,
    *,
    bill_id: int,
    amount,
    method: str,
    user_id: int | None,
    outcome: str = "successful",
    remarks: str | None = None,
    payment_date: datetime | None = None,
    commit: bool = True,
) -> Payment:
    bill = _lock_bill(db, bill_id)
    if bill.status not in OPEN_BILL_STATUSES:
        raise BadRequest(f"Bill {bill.invoice_number} is {bill.status.replace('_', ' ')} and cannot accept payments.")
    if bill.carried_forward_to_id:
        newer = db.get(Bill, bill.carried_forward_to_id)
        raise BadRequest(f"This balance was carried into bill {newer.invoice_number}. Please pay that bill instead.")
    amount = money(amount)
    if amount <= 0:
        raise BadRequest("Payment amount must be greater than zero.")
    if amount > bill.balance_due:
        raise BadRequest(f"Amount exceeds the balance due (Rs {bill.balance_due}).")

    code, txn = _new_codes(db)
    payment = Payment(
        payment_code=code,
        transaction_id=txn,
        bill_id=bill.id,
        customer_id=bill.customer_id,
        amount=amount,
        method=method,
        status=outcome,
        payment_date=payment_date or utcnow(),
        remarks=remarks,
        recorded_by=user_id,
    )
    db.add(payment)
    db.flush()

    if outcome == "successful":
        payment.receipt_number = f"RCPT-{payment.id:07d}"
        bill.amount_paid = money(bill.amount_paid + amount)
        bill.balance_due = money(bill.total_amount - bill.amount_paid)
        refresh_bill_status(bill)
        if bill.status == "paid":
            _settle_carried_bills(db, bill)
        notify_customer(
            db, bill.customer, "payment_successful", "Payment successful",
            f"Rs {amount} received for bill {bill.invoice_number}. Transaction {txn}. "
            f"Remaining balance Rs {bill.balance_due}.",
            link=f"/portal/payments",
        )
    elif outcome == "failed":
        notify_customer(
            db, bill.customer, "payment_failed", "Payment failed",
            f"Your payment of Rs {amount} for bill {bill.invoice_number} failed. No amount was deducted (demo).",
            link=f"/portal/bills/{bill.id}", email=False,
        )

    log_action(
        db, user_id=user_id, action=f"payment.{outcome}", entity_type="payment", entity_id=payment.id,
        summary=f"{txn} Rs {amount} via {method} for {bill.invoice_number}",
        new={"bill_status": bill.status, "balance_due": bill.balance_due},
    )
    if commit:
        db.commit()
        db.refresh(payment)
    return payment


def _settle_carried_bills(db: Session, bill: Bill) -> None:
    """When a bill that absorbed older balances is fully paid, the older bills are settled too."""
    for old in db.scalars(select(Bill).where(Bill.carried_forward_to_id == bill.id)).all():
        if old.balance_due > 0:
            old.balance_due = ZERO
            old.status = "paid"
            _settle_carried_bills(db, old)


def refund_payment(db: Session, payment: Payment, *, user_id: int, reason: str) -> Payment:
    if payment.status != "successful":
        raise BadRequest("Only successful payments can be refunded.")
    if not reason or len(reason.strip()) < 5:
        raise BadRequest("Please give a refund reason (at least 5 characters).")
    bill = _lock_bill(db, payment.bill_id)
    if bill.carried_forward_to_id or db.scalar(select(Bill.id).where(Bill.carried_forward_to_id == bill.id)):
        raise BadRequest("Refunds are not allowed on bills linked to carried-forward balances.")
    payment.status = "refunded"
    payment.remarks = ((payment.remarks or "") + f" | Refunded: {reason.strip()}").strip(" |")
    bill.amount_paid = money(bill.amount_paid - payment.amount)
    bill.balance_due = money(bill.total_amount - bill.amount_paid)
    if bill.status == "paid":
        bill.status = "pending"
    refresh_bill_status(bill)
    log_action(db, user_id=user_id, action="payment.refund", entity_type="payment", entity_id=payment.id,
               summary=f"{payment.transaction_id}: {reason.strip()}")
    notify_customer(db, bill.customer, "payment_refunded", "Payment refunded",
                    f"Payment {payment.transaction_id} of Rs {payment.amount} was refunded (demo).", email=False)
    db.commit()
    db.refresh(payment)
    return payment
