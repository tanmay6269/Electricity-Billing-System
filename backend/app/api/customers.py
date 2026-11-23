from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (client_ip, ensure_can_view_customer, get_current_user, get_customer_profile, require_customer,
                           require_staff)
from app.core.exceptions import BadRequest, Conflict, NotFound
from app.core.security import PASSWORD_RULE_TEXT, hash_password, is_strong_password
from app.models import Bill, Complaint, Customer, ElectricityConnection, Meter, MeterReading, Payment, Role, TariffPlan, User
from app.models.base import utcnow
from app.models.billing import OPEN_BILL_STATUSES
from app.schemas.billing import bill_out
from app.schemas.complaint import complaint_out
from app.schemas.connection import connection_out
from app.schemas.customer import CustomerCreateIn, CustomerSelfUpdateIn, CustomerUpdateIn, customer_out
from app.schemas.payment import payment_out
from app.schemas.reading import reading_out
from app.services.audit import log_action, snapshot
from app.utils.codes import assign_code
from app.utils.exporters import csv_response
from app.utils.pagination import PageParams, apply_sort, like, paginate

router = APIRouter(prefix="/api/customers", tags=["Customers"])

CUSTOMER_FIELDS = ["full_name", "email", "phone", "address", "city", "state", "postal_code", "customer_type", "status",
                   "profile_picture_url"]


def _filtered(search, customer_type, status):
    stmt = select(Customer).where(Customer.deleted_at.is_(None))
    if search:
        term = like(search)
        conn_match = select(ElectricityConnection.customer_id).join(Meter).where(
            or_(ElectricityConnection.connection_code.ilike(term, escape="\\"), Meter.meter_number.ilike(term, escape="\\"))
        )
        stmt = stmt.where(or_(Customer.full_name.ilike(term, escape="\\"), Customer.customer_code.ilike(term, escape="\\"),
                              Customer.email.ilike(term, escape="\\"), Customer.phone.ilike(term, escape="\\"),
                              Customer.id.in_(conn_match)))
    if customer_type:
        stmt = stmt.where(Customer.customer_type == customer_type)
    if status:
        stmt = stmt.where(Customer.status == status)
    return stmt


SORTS = {"full_name": Customer.full_name, "customer_code": Customer.customer_code, "created_at": Customer.created_at,
         "customer_type": Customer.customer_type, "status": Customer.status, "city": Customer.city}


@router.get("")
def list_customers(
    params: PageParams = Depends(),
    search: str | None = Query(None, max_length=100),
    customer_type: str | None = Query(None, pattern="^(residential|commercial|industrial)$"),
    status: str | None = Query(None, pattern="^(active|inactive|suspended)$"),
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    stmt = apply_sort(_filtered(search, customer_type, status), params, SORTS, Customer.created_at.desc())
    return paginate(db, stmt, params, customer_out)


@router.get("/export")
def export_customers(
    search: str | None = Query(None, max_length=100),
    customer_type: str | None = Query(None, pattern="^(residential|commercial|industrial)$"),
    status: str | None = Query(None, pattern="^(active|inactive|suspended)$"),
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    rows = [customer_out(c) for c in db.scalars(_filtered(search, customer_type, status).order_by(Customer.id)).unique()]
    cols = [{"key": k, "label": l} for k, l in [
        ("customer_code", "Customer ID"), ("full_name", "Full Name"), ("email", "Email"), ("phone", "Phone"),
        ("address", "Address"), ("city", "City"), ("state", "State"), ("postal_code", "Postal Code"),
        ("customer_type", "Type"), ("connection_code", "Connection ID"), ("meter_number", "Meter Number"),
        ("connection_date", "Connection Date"), ("tariff_plan", "Tariff Plan"), ("status", "Status"),
        ("created_at", "Created")]]
    return csv_response(f"customers_{date.today()}.csv", cols, rows)


# ---- Customer self-service (must be declared before /{customer_id}) ----
@router.get("/me")
def my_profile(user: User = Depends(require_customer), db: Session = Depends(get_db)):
    return _profile(db, get_customer_profile(db, user))


@router.put("/me")
def update_my_profile(body: CustomerSelfUpdateIn, request: Request, user: User = Depends(require_customer),
                      db: Session = Depends(get_db)):
    c = get_customer_profile(db, user)
    old = snapshot(c, CUSTOMER_FIELDS)
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(c, k, v)
    if body.phone:
        user.phone = body.phone
    log_action(db, user_id=user.id, action="customer.self_update", entity_type="customer", entity_id=c.id,
               old=old, new=snapshot(c, CUSTOMER_FIELDS), ip=client_ip(request))
    db.commit()
    return customer_out(c)


def _get(db: Session, customer_id: int) -> Customer:
    c = db.get(Customer, customer_id)
    if not c or c.deleted_at:
        raise NotFound("Customer not found.")
    return c


def _profile(db: Session, c: Customer) -> dict:
    conns = [x for x in c.connections if not x.deleted_at]
    bills = db.scalars(select(Bill).where(Bill.customer_id == c.id).order_by(Bill.billing_period.desc(), Bill.id.desc())).unique().all()
    payments = db.scalars(select(Payment).where(Payment.customer_id == c.id).order_by(Payment.payment_date.desc())).unique().all()
    readings = db.scalars(select(MeterReading).where(MeterReading.customer_id == c.id)
                          .order_by(MeterReading.billing_period.desc())).unique().all()
    complaints = db.scalars(select(Complaint).where(Complaint.customer_id == c.id).order_by(Complaint.created_at.desc())).unique().all()
    open_bills = [b for b in bills if b.status in OPEN_BILL_STATUSES and not b.carried_forward_to_id]
    current = next((b for b in bills if b.status not in ("cancelled", "draft")), None)
    return {
        "customer": customer_out(c),
        "connections": [connection_out(x) for x in conns],
        "latest_reading": reading_out(readings[0]) if readings else None,
        "current_bill": bill_out(current) if current else None,
        "total_paid": float(sum(p.amount for p in payments if p.status == "successful")),
        "outstanding_balance": float(sum(b.balance_due for b in open_bills)),
        "consumption_history": [{"billing_period": r.billing_period, "units": float(r.units_consumed),
                                 "connection_code": r.connection.connection_code} for r in reversed(readings[:24])],
        "bills": [bill_out(b) for b in bills[:24]],
        "payments": [payment_out(p) for p in payments[:24]],
        "complaints": [complaint_out(x) for x in complaints[:20]],
    }


@router.get("/{customer_id}")
def get_customer(customer_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ensure_can_view_customer(db, user, customer_id)
    return customer_out(_get(db, customer_id))


@router.get("/{customer_id}/profile")
def customer_profile(customer_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ensure_can_view_customer(db, user, customer_id)
    return _profile(db, _get(db, customer_id))


@router.post("", status_code=201)
def create_customer(body: CustomerCreateIn, request: Request, staff: User = Depends(require_staff),
                    db: Session = Depends(get_db)):
    data = body.model_dump(exclude={"create_login", "login_password", "connection"})
    data["email"] = data["email"].lower()
    c = Customer(**data)
    if body.create_login:
        if not body.login_password or not is_strong_password(body.login_password):
            raise BadRequest(f"Login password: {PASSWORD_RULE_TEXT}")
        if db.scalar(select(User.id).where(func.lower(User.email) == c.email)):
            raise Conflict("A login with this email already exists.")
        role_id = db.scalar(select(Role.id).where(Role.name == "customer"))
        u = User(email=c.email, full_name=c.full_name, phone=c.phone, role_id=role_id,
                 password_hash=hash_password(body.login_password))
        db.add(u)
        db.flush()
        c.user_id = u.id
    assign_code(db, c, "customer_code", "CUST")

    if body.connection:
        ic = body.connection
        tariff = db.get(TariffPlan, ic.tariff_plan_id)
        if not tariff or tariff.status != "active":
            raise BadRequest("Choose an active tariff plan.")
        if db.scalar(select(Meter.id).where(Meter.meter_number == ic.meter_number.upper())):
            raise Conflict("This meter number is already registered.")
        meter = Meter(meter_number=ic.meter_number.upper(), initial_reading=ic.initial_reading,
                      installed_on=ic.installation_date, status="working")
        db.add(meter)
        db.flush()
        conn = ElectricityConnection(customer_id=c.id, meter_id=meter.id, tariff_plan_id=tariff.id,
                                     connection_type=ic.connection_type or c.customer_type,
                                     sanctioned_load_kw=ic.sanctioned_load_kw, installation_date=ic.installation_date,
                                     status="active", address=f"{c.address}, {c.city}, {c.state} {c.postal_code}")
        assign_code(db, conn, "connection_code", "CON")
    log_action(db, user_id=staff.id, action="customer.create", entity_type="customer", entity_id=c.id,
               summary=f"{c.customer_code} {c.full_name}", new=snapshot(c, CUSTOMER_FIELDS), ip=client_ip(request))
    db.commit()
    db.refresh(c)
    return customer_out(c)


@router.put("/{customer_id}")
def update_customer(customer_id: int, body: CustomerUpdateIn, request: Request, staff: User = Depends(require_staff),
                    db: Session = Depends(get_db)):
    c = _get(db, customer_id)
    old = snapshot(c, CUSTOMER_FIELDS)
    changes = body.model_dump(exclude_unset=True)
    for k, v in changes.items():
        if v is None:
            continue
        setattr(c, k, v.lower() if k == "email" else v)
    log_action(db, user_id=staff.id, action="customer.update", entity_type="customer", entity_id=c.id,
               summary=c.customer_code, old=old, new=snapshot(c, CUSTOMER_FIELDS), ip=client_ip(request))
    db.commit()
    db.refresh(c)
    return customer_out(c)


@router.delete("/{customer_id}")
def delete_customer(customer_id: int, request: Request, staff: User = Depends(require_staff), db: Session = Depends(get_db)):
    """Soft delete: history (bills, payments) is kept for audit; open balances block deletion."""
    c = _get(db, customer_id)
    owing = db.scalar(select(func.count(Bill.id)).where(Bill.customer_id == c.id, Bill.status.in_(OPEN_BILL_STATUSES),
                                                        Bill.carried_forward_to_id.is_(None), Bill.balance_due > 0))
    if owing:
        raise BadRequest("This customer has unpaid bills. Settle or cancel them before deleting.")
    c.deleted_at = utcnow()
    c.status = "inactive"
    for conn in c.connections:
        if not conn.deleted_at:
            conn.status = "disconnected"
            conn.deleted_at = utcnow()
    if c.user_id:
        u = db.get(User, c.user_id)
        u.is_active = False
        u.token_version += 1
    log_action(db, user_id=staff.id, action="customer.delete", entity_type="customer", entity_id=c.id,
               summary=f"{c.customer_code} {c.full_name}", ip=client_ip(request))
    db.commit()
    return {"message": "Customer deleted."}
