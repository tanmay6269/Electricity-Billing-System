from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, get_customer_profile, require_admin, require_staff
from app.core.exceptions import BadRequest, NotFound
from app.models import Bill, Customer, Payment, User
from app.schemas.payment import DemoPaymentIn, MarkPaidIn, RecordPaymentIn, RefundIn, payment_out
from app.services import payment_service as ps
from app.services.pdf_service import receipt_pdf
from app.api.billing import company
from app.utils.exporters import csv_response, pdf_response
from app.utils.pagination import PageParams, apply_sort, like, paginate

router = APIRouter(prefix="/api/payments", tags=["Payments"])

SORTS = {"payment_date": Payment.payment_date, "amount": Payment.amount, "status": Payment.status, "method": Payment.method}
METHOD_RE = "^(upi|debit_card|credit_card|net_banking|cash|demo)$"
STATUS_RE = "^(pending|successful|failed|refunded)$"


@router.post("/demo", status_code=201)
def demo_payment(body: DemoPaymentIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Demo Payment Mode: simulates a gateway. No real money is transferred."""
    bill = db.get(Bill, body.bill_id)
    if not bill:
        raise NotFound("Bill not found.")
    if user.role_name == "customer" and bill.customer_id != get_customer_profile(db, user).id:
        raise NotFound("Bill not found.")
    outcome = "successful" if body.simulate == "success" else "failed"
    p = ps.record_payment(db, bill_id=bill.id, amount=body.amount, method=body.method, user_id=user.id, outcome=outcome,
                          remarks="Demo Payment Mode - simulated online checkout")
    return {**payment_out(p), "demo_mode": True}


@router.post("", status_code=201)
def record_payment(body: RecordPaymentIn, staff: User = Depends(require_staff), db: Session = Depends(get_db)):
    if body.payment_date and body.payment_date.date() > date.today():
        raise BadRequest("Payment date cannot be in the future.")
    p = ps.record_payment(db, bill_id=body.bill_id, amount=body.amount, method=body.method, user_id=staff.id,
                          remarks=body.remarks or "Recorded by staff", payment_date=body.payment_date)
    return payment_out(p)


@router.post("/mark-paid/{bill_id}", status_code=201)
def mark_paid(bill_id: int, body: MarkPaidIn, staff: User = Depends(require_staff), db: Session = Depends(get_db)):
    bill = db.get(Bill, bill_id)
    if not bill:
        raise NotFound("Bill not found.")
    p = ps.record_payment(db, bill_id=bill.id, amount=bill.balance_due, method=body.method, user_id=staff.id,
                          remarks=body.remarks or "Marked as paid (full balance)")
    return payment_out(p)


def _filtered(db, user, search, status, method, customer_id, date_from, date_to):
    stmt = select(Payment).join(Customer, Payment.customer_id == Customer.id).join(Bill, Payment.bill_id == Bill.id)
    if user.role_name == "customer":
        stmt = stmt.where(Payment.customer_id == get_customer_profile(db, user).id)
    elif customer_id:
        stmt = stmt.where(Payment.customer_id == customer_id)
    if search:
        t = like(search)
        stmt = stmt.where(or_(Payment.transaction_id.ilike(t, escape="\\"), Payment.payment_code.ilike(t, escape="\\"),
                              Bill.invoice_number.ilike(t, escape="\\"), Customer.full_name.ilike(t, escape="\\"),
                              Customer.customer_code.ilike(t, escape="\\")))
    if status:
        stmt = stmt.where(Payment.status == status)
    if method:
        stmt = stmt.where(Payment.method == method)
    if date_from:
        stmt = stmt.where(func.date(Payment.payment_date) >= date_from)
    if date_to:
        stmt = stmt.where(func.date(Payment.payment_date) <= date_to)
    return stmt


@router.get("")
def list_payments(
    params: PageParams = Depends(),
    search: str | None = Query(None, max_length=100),
    status: str | None = Query(None, pattern=STATUS_RE),
    method: str | None = Query(None, pattern=METHOD_RE),
    customer_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = _filtered(db, user, search, status, method, customer_id, date_from, date_to)
    stmt = apply_sort(stmt, params, SORTS, Payment.payment_date.desc())
    result = paginate(db, stmt, params, payment_out)
    base = _filtered(db, user, search, status, method, customer_id, date_from, date_to).subquery()
    result["summary"] = {
        "successful_amount": float(db.scalar(select(func.coalesce(func.sum(base.c.amount), 0)).where(base.c.status == "successful")) or 0),
        "count": result["total"],
    }
    return result


@router.get("/export")
def export_payments(
    search: str | None = Query(None, max_length=100),
    status: str | None = Query(None, pattern=STATUS_RE),
    method: str | None = Query(None, pattern=METHOD_RE),
    date_from: date | None = None,
    date_to: date | None = None,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    stmt = _filtered(db, user, search, status, method, None, date_from, date_to).order_by(Payment.payment_date.desc())
    rows = [payment_out(p) for p in db.scalars(stmt).unique()]
    cols = [{"key": k, "label": l} for k, l in [
        ("payment_code", "Payment ID"), ("transaction_id", "Transaction ID"), ("invoice_number", "Invoice"),
        ("customer_code", "Customer ID"), ("customer_name", "Customer"), ("amount", "Amount"), ("method", "Method"),
        ("payment_date", "Date"), ("status", "Status"), ("receipt_number", "Receipt"), ("remarks", "Remarks")]]
    return csv_response(f"payments_{date.today()}.csv", cols, rows)


def _get(db: Session, payment_id: int, user: User) -> Payment:
    p = db.get(Payment, payment_id)
    if not p:
        raise NotFound("Payment not found.")
    if user.role_name == "customer" and p.customer_id != get_customer_profile(db, user).id:
        raise NotFound("Payment not found.")
    return p


@router.get("/{payment_id}")
def get_payment(payment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return payment_out(_get(db, payment_id, user))


@router.get("/{payment_id}/receipt")
def receipt(payment_id: int, inline: bool = False, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _get(db, payment_id, user)
    if p.status not in ("successful", "refunded") or not p.receipt_number:
        raise BadRequest("Receipts are only available for successful payments.")
    return pdf_response(f"{p.receipt_number}.pdf", receipt_pdf(p, company(db)), inline=inline)


@router.post("/{payment_id}/refund")
def refund(payment_id: int, body: RefundIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return payment_out(ps.refund_payment(db, _get(db, payment_id, admin), user_id=admin.id, reason=body.reason))
