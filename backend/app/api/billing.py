from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, get_customer_profile, require_staff
from app.core.exceptions import NotFound
from app.models import Bill, Customer, ElectricityConnection, Payment, User
from app.schemas.billing import BillRequestIn, CancelIn, DraftUpdateIn, MonthlyBillingIn, bill_out
from app.schemas.common import PERIOD_RE
from app.schemas.payment import payment_out
from app.services import billing_service as bs
from app.services import settings_service as ss
from app.services.pdf_service import invoice_pdf
from app.utils.exporters import csv_response, pdf_response
from app.utils.pagination import PageParams, apply_sort, like, paginate

router = APIRouter(tags=["Billing"])

SORTS = {"invoice_number": Bill.invoice_number, "billing_period": Bill.billing_period, "total_amount": Bill.total_amount,
         "balance_due": Bill.balance_due, "due_date": Bill.due_date, "issue_date": Bill.issue_date,
         "units_consumed": Bill.units_consumed, "status": Bill.status}


def company(db: Session) -> dict:
    return {"name": ss.get_setting(db, "company_name"), "address": ss.get_setting(db, "company_address"),
            "phone": ss.get_setting(db, "company_phone"), "email": ss.get_setting(db, "company_email"),
            "payment_instructions": ss.get_setting(db, "payment_instructions")}


@router.post("/api/billing/preview")
def preview(body: BillRequestIn, _: User = Depends(require_staff), db: Session = Depends(get_db)):
    return bs.preview(db, reading_id=body.reading_id, connection_id=body.connection_id,
                      billing_period=body.billing_period, discount=body.discount, extra_charges=body.extra_charges)


@router.post("/api/billing/generate", status_code=201)
def generate(body: BillRequestIn, staff: User = Depends(require_staff), db: Session = Depends(get_db)):
    bill = bs.generate_bill(db, user_id=staff.id, reading_id=body.reading_id, connection_id=body.connection_id,
                            billing_period=body.billing_period, discount=body.discount, extra_charges=body.extra_charges,
                            as_draft=body.as_draft, notify=body.notify, remarks=body.remarks)
    return bill_out(bill, detail=True)


@router.post("/api/billing/generate-monthly")
def generate_monthly(body: MonthlyBillingIn, staff: User = Depends(require_staff), db: Session = Depends(get_db)):
    return bs.generate_monthly(db, user_id=staff.id, billing_period=body.billing_period,
                               connection_ids=body.connection_ids, notify=body.notify, as_draft=body.as_draft)


@router.post("/api/billing/run-reminders")
def run_reminders(_: User = Depends(require_staff), db: Session = Depends(get_db)):
    overdue = bs.mark_overdue_bills(db)
    due_soon = bs.send_due_soon_reminders(db)
    return {"marked_overdue": overdue, "due_soon_reminders": due_soon}


def _filtered(db, user, search, status, billing_period, customer_id, customer_type, date_from, date_to):
    stmt = select(Bill).join(Customer, Bill.customer_id == Customer.id) \
        .join(ElectricityConnection, Bill.connection_id == ElectricityConnection.id)
    if user.role_name == "customer":
        stmt = stmt.where(Bill.customer_id == get_customer_profile(db, user).id, Bill.status != "draft")
    elif customer_id:
        stmt = stmt.where(Bill.customer_id == customer_id)
    if search:
        t = like(search)
        stmt = stmt.where(or_(Bill.invoice_number.ilike(t, escape="\\"), Customer.full_name.ilike(t, escape="\\"),
                              Customer.customer_code.ilike(t, escape="\\"),
                              ElectricityConnection.connection_code.ilike(t, escape="\\")))
    if status:
        stmt = stmt.where(Bill.status == status)
    if billing_period:
        stmt = stmt.where(Bill.billing_period == billing_period)
    if customer_type:
        stmt = stmt.where(Customer.customer_type == customer_type)
    if date_from:
        stmt = stmt.where(Bill.issue_date >= date_from)
    if date_to:
        stmt = stmt.where(Bill.issue_date <= date_to)
    return stmt


STATUS_RE = "^(draft|generated|pending|partially_paid|paid|overdue|cancelled)$"


@router.get("/api/bills")
def list_bills(
    params: PageParams = Depends(),
    search: str | None = Query(None, max_length=100),
    status: str | None = Query(None, pattern=STATUS_RE),
    billing_period: str | None = Query(None, pattern=PERIOD_RE),
    customer_id: int | None = None,
    customer_type: str | None = Query(None, pattern="^(residential|commercial|industrial)$"),
    date_from: date | None = None,
    date_to: date | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    bs.mark_overdue_bills(db)
    stmt = _filtered(db, user, search, status, billing_period, customer_id, customer_type, date_from, date_to)
    stmt = apply_sort(stmt, params, SORTS, Bill.issue_date.desc())
    return paginate(db, stmt, params, bill_out)


@router.get("/api/bills/export")
def export_bills(
    search: str | None = Query(None, max_length=100),
    status: str | None = Query(None, pattern=STATUS_RE),
    billing_period: str | None = Query(None, pattern=PERIOD_RE),
    customer_type: str | None = Query(None, pattern="^(residential|commercial|industrial)$"),
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    stmt = _filtered(db, user, search, status, billing_period, None, customer_type, None, None).order_by(Bill.issue_date.desc())
    rows = [bill_out(b) for b in db.scalars(stmt).unique()]
    cols = [{"key": k, "label": l} for k, l in [
        ("invoice_number", "Invoice"), ("customer_code", "Customer ID"), ("customer_name", "Customer"),
        ("connection_code", "Connection"), ("billing_period", "Period"), ("units_consumed", "Units"),
        ("consumption_charge", "Consumption Charge"), ("fixed_charge", "Fixed"), ("tax_amount", "Duty"),
        ("late_fee", "Late Fee"), ("previous_outstanding", "Prev. Outstanding"), ("discount", "Discount"),
        ("total_amount", "Total"), ("amount_paid", "Paid"), ("balance_due", "Balance"), ("issue_date", "Issued"),
        ("due_date", "Due"), ("status", "Status")]]
    return csv_response(f"bills_{date.today()}.csv", cols, rows)


def _get(db: Session, bill_id: int, user: User) -> Bill:
    b = db.get(Bill, bill_id)
    if not b:
        raise NotFound("Bill not found.")
    if user.role_name == "customer" and (b.customer_id != get_customer_profile(db, user).id or b.status == "draft"):
        raise NotFound("Bill not found.")
    return b


@router.get("/api/bills/{bill_id}")
def get_bill(bill_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    b = _get(db, bill_id, user)
    data = bill_out(b, detail=True)
    data["payments"] = [payment_out(p) for p in db.scalars(select(Payment).where(Payment.bill_id == b.id)
                                                            .order_by(Payment.payment_date.desc())).unique()]
    if b.carried_forward_to_id:
        nb = db.get(Bill, b.carried_forward_to_id)
        data["carried_forward_to_invoice"] = nb.invoice_number if nb else None
    data["carried_from"] = [{"id": x.id, "invoice_number": x.invoice_number} for x in
                            db.scalars(select(Bill).where(Bill.carried_forward_to_id == b.id)).unique()]
    return data


@router.get("/api/bills/{bill_id}/pdf")
def bill_pdf(bill_id: int, inline: bool = False, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    b = _get(db, bill_id, user)
    return pdf_response(f"{b.invoice_number}.pdf", invoice_pdf(b, company(db)), inline=inline)


@router.put("/api/bills/{bill_id}")
def edit_draft(bill_id: int, body: DraftUpdateIn, staff: User = Depends(require_staff), db: Session = Depends(get_db)):
    b = _get(db, bill_id, staff)
    return bill_out(bs.update_draft(db, b, user_id=staff.id, discount=body.discount, extra_charges=body.extra_charges,
                                    remarks=body.remarks), detail=True)


@router.post("/api/bills/{bill_id}/issue")
def issue(bill_id: int, staff: User = Depends(require_staff), db: Session = Depends(get_db)):
    return bill_out(bs.issue_draft(db, _get(db, bill_id, staff), user_id=staff.id), detail=True)


@router.post("/api/bills/{bill_id}/cancel")
def cancel(bill_id: int, body: CancelIn, staff: User = Depends(require_staff), db: Session = Depends(get_db)):
    return bill_out(bs.cancel_bill(db, _get(db, bill_id, staff), user_id=staff.id, reason=body.reason), detail=True)


@router.post("/api/bills/{bill_id}/notify")
def notify(bill_id: int, staff: User = Depends(require_staff), db: Session = Depends(get_db)):
    bs.send_bill_notification(db, _get(db, bill_id, staff), user_id=staff.id)
    return {"message": "Bill notification sent to the customer."}
