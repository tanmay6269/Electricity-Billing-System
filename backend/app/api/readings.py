import csv
import io
from datetime import date, datetime

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import client_ip, get_current_user, get_customer_profile, require_staff
from app.core.exceptions import BadRequest, NotFound
from app.models import AuditLog, Customer, ElectricityConnection, Meter, MeterReading, User
from app.schemas.common import PERIOD_RE
from app.schemas.reading import ReadingCreateIn, ReadingUpdateIn, SimulateIn, reading_out
from app.services import reading_service as rs
from app.services.audit import log_action
from app.utils.exporters import csv_response
from app.utils.pagination import PageParams, apply_sort, like, paginate

router = APIRouter(prefix="/api/readings", tags=["Meter Readings"])

SORTS = {"billing_period": MeterReading.billing_period, "reading_date": MeterReading.reading_date,
         "units_consumed": MeterReading.units_consumed, "current_reading": MeterReading.current_reading,
         "created_at": MeterReading.created_at}


def _filtered(db, user, search, billing_period, reading_type, connection_id, customer_id):
    stmt = select(MeterReading).join(ElectricityConnection, MeterReading.connection_id == ElectricityConnection.id) \
        .join(Customer, MeterReading.customer_id == Customer.id).join(Meter, MeterReading.meter_id == Meter.id)
    if user.role_name == "customer":
        stmt = stmt.where(MeterReading.customer_id == get_customer_profile(db, user).id)
    elif customer_id:
        stmt = stmt.where(MeterReading.customer_id == customer_id)
    if search:
        t = like(search)
        stmt = stmt.where(or_(Customer.full_name.ilike(t, escape="\\"), Customer.customer_code.ilike(t, escape="\\"),
                              ElectricityConnection.connection_code.ilike(t, escape="\\"), Meter.meter_number.ilike(t, escape="\\")))
    if billing_period:
        stmt = stmt.where(MeterReading.billing_period == billing_period)
    if reading_type:
        stmt = stmt.where(MeterReading.reading_type == reading_type)
    if connection_id:
        stmt = stmt.where(MeterReading.connection_id == connection_id)
    return stmt


@router.get("")
def list_readings(
    params: PageParams = Depends(),
    search: str | None = Query(None, max_length=100),
    billing_period: str | None = Query(None, pattern=PERIOD_RE),
    reading_type: str | None = Query(None, pattern="^(manual|simulated|imported)$"),
    connection_id: int | None = None,
    customer_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = _filtered(db, user, search, billing_period, reading_type, connection_id, customer_id)
    stmt = apply_sort(stmt, params, SORTS, MeterReading.billing_period.desc())
    return paginate(db, stmt, params, reading_out)


@router.get("/export")
def export_readings(
    search: str | None = Query(None, max_length=100),
    billing_period: str | None = Query(None, pattern=PERIOD_RE),
    reading_type: str | None = Query(None, pattern="^(manual|simulated|imported)$"),
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    stmt = _filtered(db, user, search, billing_period, reading_type, None, None).order_by(MeterReading.billing_period.desc())
    rows = [reading_out(r) for r in db.scalars(stmt).unique()]
    cols = [{"key": k, "label": l} for k, l in [
        ("id", "Reading ID"), ("customer_code", "Customer ID"), ("customer_name", "Customer"),
        ("connection_code", "Connection ID"), ("meter_number", "Meter Number"), ("billing_period", "Billing Period"),
        ("previous_reading", "Previous"), ("current_reading", "Current"), ("units_consumed", "Units"),
        ("reading_date", "Reading Date"), ("reading_type", "Type"), ("entered_by", "Entered By"), ("remarks", "Remarks")]]
    return csv_response(f"meter_readings_{date.today()}.csv", cols, rows)


@router.get("/next")
def next_reading_info(connection_id: int, billing_period: str = Query(pattern=PERIOD_RE),
                      user: User = Depends(require_staff), db: Session = Depends(get_db)):
    """Helps the entry form: shows the previous reading that will be used."""
    conn = db.get(ElectricityConnection, connection_id)
    if not conn or conn.deleted_at:
        raise NotFound("Connection not found.")
    existing = db.scalar(select(MeterReading).where(MeterReading.connection_id == conn.id,
                                                    MeterReading.billing_period == billing_period))
    return {"connection_code": conn.connection_code, "meter_number": conn.meter.meter_number,
            "customer_name": conn.customer.full_name, "previous_reading": float(rs.previous_value(db, conn, billing_period)),
            "already_recorded": existing is not None}


@router.post("", status_code=201)
def create_reading(body: ReadingCreateIn, staff: User = Depends(require_staff), db: Session = Depends(get_db)):
    r = rs.create_reading(db, connection_id=body.connection_id, billing_period=body.billing_period,
                          current_reading=body.current_reading, reading_date=body.reading_date,
                          reading_type=body.reading_type, user_id=staff.id, remarks=body.remarks)
    return reading_out(r)


@router.post("/simulate")
def simulate(body: SimulateIn, staff: User = Depends(require_staff), db: Session = Depends(get_db)):
    return rs.simulate_period(db, billing_period=body.billing_period, user_id=staff.id)


@router.post("/import")
async def import_readings(request: Request, file: UploadFile = File(...), staff: User = Depends(require_staff),
                          db: Session = Depends(get_db)):
    """CSV columns: connection_id (code like CON-00001) or meter_number, billing_period, current_reading, reading_date, remarks"""
    if not (file.filename or "").lower().endswith(".csv"):
        raise BadRequest("Please upload a .csv file.")
    raw = await file.read()
    if len(raw) > 2_000_000:
        raise BadRequest("File too large (max 2 MB).")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise BadRequest("File must be UTF-8 encoded CSV.") from exc
    reader = csv.DictReader(io.StringIO(text))
    created, errors = [], []
    for i, row in enumerate(reader, start=2):
        row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
        try:
            code = row.get("connection_id") or row.get("connection_code")
            conn = None
            if code:
                conn = db.scalar(select(ElectricityConnection).where(ElectricityConnection.connection_code == code.upper()))
            elif row.get("meter_number"):
                conn = db.scalar(select(ElectricityConnection).join(Meter).where(Meter.meter_number == row["meter_number"].upper()))
            if not conn:
                raise BadRequest("Unknown connection / meter")
            reading_date = datetime.strptime(row.get("reading_date") or date.today().isoformat(), "%Y-%m-%d").date()
            r = rs.create_reading(db, connection_id=conn.id, billing_period=row.get("billing_period", ""),
                                  current_reading=row.get("current_reading") or "x", reading_date=reading_date,
                                  reading_type="imported", user_id=staff.id, remarks=row.get("remarks") or "CSV import",
                                  commit=False)
            db.commit()
            created.append({"row": i, "connection": conn.connection_code, "units": float(r.units_consumed)})
        except Exception as exc:
            db.rollback()
            msg = getattr(exc, "message", None) or ("Invalid number or date" if "decimal" in str(type(exc)).lower()
                                                     or isinstance(exc, ValueError) else str(exc))
            errors.append({"row": i, "error": msg})
    log_action(db, user_id=staff.id, action="reading.import", entity_type="meter_reading",
               summary=f"CSV import: {len(created)} created, {len(errors)} errors", ip=client_ip(request))
    db.commit()
    return {"created": created, "errors": errors}


def _get(db: Session, reading_id: int, user: User) -> MeterReading:
    r = db.get(MeterReading, reading_id)
    if not r:
        raise NotFound("Reading not found.")
    if user.role_name == "customer" and r.customer_id != get_customer_profile(db, user).id:
        raise NotFound("Reading not found.")
    return r


@router.get("/{reading_id}")
def get_reading(reading_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = _get(db, reading_id, user)
    data = reading_out(r)
    if user.role_name != "customer":
        hist = db.scalars(select(AuditLog).where(AuditLog.entity_type == "meter_reading",
                                                 AuditLog.entity_id == str(r.id)).order_by(AuditLog.created_at)).unique().all()
        data["history"] = [{"action": a.action, "summary": a.summary, "old_values": a.old_values,
                            "new_values": a.new_values, "by": a.user.full_name if a.user else "System",
                            "created_at": a.created_at.isoformat()} for a in hist]
    return data


@router.put("/{reading_id}")
def update_reading(reading_id: int, body: ReadingUpdateIn, staff: User = Depends(require_staff),
                   db: Session = Depends(get_db)):
    r = _get(db, reading_id, staff)
    r = rs.update_reading(db, r, user_id=staff.id, current_reading=body.current_reading, reading_date=body.reading_date,
                          remarks=body.remarks, reason=body.reason)
    return reading_out(r)
