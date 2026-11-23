from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import client_ip, get_current_user, get_customer_profile, require_staff
from app.core.exceptions import BadRequest, Conflict, NotFound
from app.models import AuditLog, Customer, ElectricityConnection, Meter, TariffPlan, User
from app.schemas.connection import ChangeTariffIn, ConnectionCreateIn, ConnectionStatusIn, ConnectionUpdateIn, connection_out
from app.services.audit import log_action
from app.services.notifications import notify_customer
from app.utils.codes import assign_code
from app.utils.pagination import PageParams, apply_sort, like, paginate

router = APIRouter(prefix="/api/connections", tags=["Connections"])

SORTS = {"connection_code": ElectricityConnection.connection_code, "installation_date": ElectricityConnection.installation_date,
         "status": ElectricityConnection.status, "sanctioned_load_kw": ElectricityConnection.sanctioned_load_kw,
         "created_at": ElectricityConnection.created_at}


@router.get("")
def list_connections(
    params: PageParams = Depends(),
    search: str | None = Query(None, max_length=100),
    status: str | None = Query(None, pattern="^(active|pending|suspended|disconnected)$"),
    connection_type: str | None = Query(None, pattern="^(residential|commercial|industrial)$"),
    tariff_plan_id: int | None = None,
    customer_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(ElectricityConnection).join(Customer).join(Meter).where(ElectricityConnection.deleted_at.is_(None))
    if user.role_name == "customer":
        stmt = stmt.where(ElectricityConnection.customer_id == get_customer_profile(db, user).id)
    elif customer_id:
        stmt = stmt.where(ElectricityConnection.customer_id == customer_id)
    if search:
        t = like(search)
        stmt = stmt.where(or_(ElectricityConnection.connection_code.ilike(t, escape="\\"), Meter.meter_number.ilike(t, escape="\\"),
                              Customer.full_name.ilike(t, escape="\\"), Customer.customer_code.ilike(t, escape="\\")))
    if status:
        stmt = stmt.where(ElectricityConnection.status == status)
    if connection_type:
        stmt = stmt.where(ElectricityConnection.connection_type == connection_type)
    if tariff_plan_id:
        stmt = stmt.where(ElectricityConnection.tariff_plan_id == tariff_plan_id)
    stmt = apply_sort(stmt, params, SORTS, ElectricityConnection.created_at.desc())
    return paginate(db, stmt, params, connection_out)


def _get(db: Session, connection_id: int, user: User) -> ElectricityConnection:
    c = db.get(ElectricityConnection, connection_id)
    if not c or c.deleted_at:
        raise NotFound("Connection not found.")
    if user.role_name == "customer" and c.customer_id != get_customer_profile(db, user).id:
        raise NotFound("Connection not found.")
    return c


@router.get("/{connection_id}")
def get_connection(connection_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return connection_out(_get(db, connection_id, user))


@router.get("/{connection_id}/history")
def connection_history(connection_id: int, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    _get(db, connection_id, user)
    rows = db.scalars(select(AuditLog).where(AuditLog.entity_type == "connection", AuditLog.entity_id == str(connection_id))
                      .order_by(AuditLog.created_at.desc())).unique().all()
    return [{"id": a.id, "action": a.action, "summary": a.summary, "old_values": a.old_values, "new_values": a.new_values,
             "by": a.user.full_name if a.user else "System", "created_at": a.created_at.isoformat()} for a in rows]


@router.post("", status_code=201)
def create_connection(body: ConnectionCreateIn, request: Request, staff: User = Depends(require_staff),
                      db: Session = Depends(get_db)):
    customer = db.get(Customer, body.customer_id)
    if not customer or customer.deleted_at:
        raise NotFound("Customer not found.")
    tariff = db.get(TariffPlan, body.tariff_plan_id)
    if not tariff or tariff.status != "active":
        raise BadRequest("Choose an active tariff plan.")
    number = body.meter_number.upper()
    if db.scalar(select(Meter.id).where(Meter.meter_number == number)):
        raise Conflict("This meter number is already registered.")
    meter = Meter(meter_number=number, manufacturer=body.meter_manufacturer, initial_reading=body.initial_reading,
                  installed_on=body.installation_date, status="working")
    db.add(meter)
    db.flush()
    conn = ElectricityConnection(
        customer_id=customer.id, meter_id=meter.id, tariff_plan_id=tariff.id, connection_type=body.connection_type,
        sanctioned_load_kw=body.sanctioned_load_kw, installation_date=body.installation_date, status=body.status,
        address=body.address or f"{customer.address}, {customer.city}, {customer.state} {customer.postal_code}",
    )
    assign_code(db, conn, "connection_code", "CON")
    log_action(db, user_id=staff.id, action="connection.create", entity_type="connection", entity_id=conn.id,
               summary=f"{conn.connection_code} for {customer.customer_code}, meter {number}", ip=client_ip(request))
    db.commit()
    db.refresh(conn)
    return connection_out(conn)


@router.put("/{connection_id}")
def update_connection(connection_id: int, body: ConnectionUpdateIn, request: Request, staff: User = Depends(require_staff),
                      db: Session = Depends(get_db)):
    c = _get(db, connection_id, staff)
    old = {"connection_type": c.connection_type, "sanctioned_load_kw": str(c.sanctioned_load_kw), "address": c.address,
           "meter_status": c.meter.status}
    if body.connection_type:
        c.connection_type = body.connection_type
    if body.sanctioned_load_kw is not None:
        c.sanctioned_load_kw = body.sanctioned_load_kw
    if body.address:
        c.address = body.address
    if body.meter_status:
        c.meter.status = body.meter_status
    new = {"connection_type": c.connection_type, "sanctioned_load_kw": str(c.sanctioned_load_kw), "address": c.address,
           "meter_status": c.meter.status}
    log_action(db, user_id=staff.id, action="connection.update", entity_type="connection", entity_id=c.id,
               summary=c.connection_code, old=old, new=new, ip=client_ip(request))
    db.commit()
    return connection_out(c)


@router.put("/{connection_id}/status")
def change_status(connection_id: int, body: ConnectionStatusIn, request: Request, staff: User = Depends(require_staff),
                  db: Session = Depends(get_db)):
    c = _get(db, connection_id, staff)
    if c.status == body.status:
        raise BadRequest(f"Connection is already {body.status}.")
    old = c.status
    c.status = body.status
    log_action(db, user_id=staff.id, action="connection.status", entity_type="connection", entity_id=c.id,
               summary=f"{c.connection_code}: {old} -> {body.status} ({body.reason})", old={"status": old},
               new={"status": body.status}, ip=client_ip(request))
    notify_customer(db, c.customer, "connection_status", "Connection status changed",
                    f"Your connection {c.connection_code} is now {body.status}. Reason: {body.reason}",
                    link="/portal/connection")
    db.commit()
    return connection_out(c)


@router.put("/{connection_id}/tariff")
def change_tariff(connection_id: int, body: ChangeTariffIn, request: Request, staff: User = Depends(require_staff),
                  db: Session = Depends(get_db)):
    c = _get(db, connection_id, staff)
    t = db.get(TariffPlan, body.tariff_plan_id)
    if not t or t.status != "active":
        raise BadRequest("Choose an active tariff plan.")
    if t.id == c.tariff_plan_id:
        raise BadRequest("This tariff is already assigned.")
    old = c.tariff_plan.name
    c.tariff_plan_id = t.id
    db.flush()
    db.refresh(c)
    log_action(db, user_id=staff.id, action="connection.tariff", entity_type="connection", entity_id=c.id,
               summary=f"{c.connection_code}: tariff {old} -> {t.name}" + (f" ({body.reason})" if body.reason else ""),
               old={"tariff": old}, new={"tariff": t.name}, ip=client_ip(request))
    db.commit()
    return connection_out(c)
