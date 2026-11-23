from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import client_ip, get_current_user, require_staff
from app.core.exceptions import BadRequest, Conflict, Forbidden, NotFound
from app.models import AuditLog, ElectricityConnection, TariffPlan, TariffSlab, User
from app.schemas.tariff import TariffIn, TariffStatusIn, tariff_out
from app.services import settings_service as ss
from app.services.audit import log_action
from app.services.tariff_calc import TariffError, calculate_bill, tariff_snapshot, validate_slabs

router = APIRouter(prefix="/api/tariffs", tags=["Tariffs"])


def _can_manage(db: Session, user: User) -> None:
    if user.role_name == "admin":
        return
    if user.role_name == "staff" and ss.get_bool(db, "staff_can_manage_tariffs"):
        return
    raise Forbidden("Only administrators can change tariff settings.")


def _usage(db: Session, tariff_id: int) -> int:
    return db.scalar(select(func.count(ElectricityConnection.id)).where(ElectricityConnection.tariff_plan_id == tariff_id,
                                                                       ElectricityConnection.deleted_at.is_(None))) or 0


def _apply(t: TariffPlan, body: TariffIn) -> None:
    if body.billing_method == "slab":
        try:
            validate_slabs([s.model_dump() for s in body.slabs])
        except TariffError as exc:
            raise BadRequest(str(exc)) from exc
    for k, v in body.model_dump(exclude={"slabs"}).items():
        setattr(t, k, v)
    t.slabs.clear()
    if body.billing_method == "slab":
        for s in sorted(body.slabs, key=lambda x: x.from_unit):
            t.slabs.append(TariffSlab(from_unit=s.from_unit, to_unit=s.to_unit, rate=s.rate))
    else:
        t.flat_rate = body.flat_rate


@router.get("")
def list_tariffs(
    status: str | None = Query(None, pattern="^(active|inactive)$"),
    customer_category: str | None = Query(None, pattern="^(residential|commercial|industrial)$"),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(TariffPlan)
    if status:
        stmt = stmt.where(TariffPlan.status == status)
    if customer_category:
        stmt = stmt.where(TariffPlan.customer_category == customer_category)
    rows = db.scalars(stmt.order_by(TariffPlan.customer_category, TariffPlan.name)).all()
    return [tariff_out(t, _usage(db, t.id)) for t in rows]


@router.get("/{tariff_id}")
def get_tariff(tariff_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.get(TariffPlan, tariff_id)
    if not t:
        raise NotFound("Tariff not found.")
    return tariff_out(t, _usage(db, t.id))


@router.get("/{tariff_id}/history")
def tariff_history(tariff_id: int, _: User = Depends(require_staff), db: Session = Depends(get_db)):
    rows = db.scalars(select(AuditLog).where(AuditLog.entity_type == "tariff", AuditLog.entity_id == str(tariff_id))
                      .order_by(AuditLog.created_at.desc())).unique().all()
    return [{"id": a.id, "action": a.action, "summary": a.summary, "old_values": a.old_values, "new_values": a.new_values,
             "by": a.user.full_name if a.user else "System", "created_at": a.created_at.isoformat()} for a in rows]


@router.get("/{tariff_id}/calculate")
def calculate(tariff_id: int, units: float = Query(ge=0, le=10_000_000), _: User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    """Bill estimator for a number of units (used by the tariff page and customers)."""
    t = db.get(TariffPlan, tariff_id)
    if not t:
        raise NotFound("Tariff not found.")
    from app.services.billing_service import calc_to_dict
    return calc_to_dict(calculate_bill(units, tariff_snapshot(t)))


@router.post("", status_code=201)
def create_tariff(body: TariffIn, request: Request, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    _can_manage(db, user)
    if db.scalar(select(TariffPlan.id).where(TariffPlan.code == body.code)):
        raise Conflict("A tariff with this code already exists.")
    t = TariffPlan()
    _apply(t, body)
    db.add(t)
    db.flush()
    log_action(db, user_id=user.id, action="tariff.create", entity_type="tariff", entity_id=t.id,
               summary=f"{t.code} {t.name}", new=tariff_snapshot(t), ip=client_ip(request))
    db.commit()
    db.refresh(t)
    return tariff_out(t, 0)


@router.put("/{tariff_id}")
def update_tariff(tariff_id: int, body: TariffIn, request: Request, user: User = Depends(require_staff),
                  db: Session = Depends(get_db)):
    """Issued bills keep their own frozen copy of the rates, so editing a tariff only affects future bills."""
    _can_manage(db, user)
    t = db.get(TariffPlan, tariff_id)
    if not t:
        raise NotFound("Tariff not found.")
    if body.code != t.code and db.scalar(select(TariffPlan.id).where(TariffPlan.code == body.code)):
        raise Conflict("A tariff with this code already exists.")
    old = tariff_snapshot(t)
    _apply(t, body)
    db.flush()
    db.refresh(t)
    log_action(db, user_id=user.id, action="tariff.update", entity_type="tariff", entity_id=t.id,
               summary=f"{t.code} {t.name}", old=old, new=tariff_snapshot(t), ip=client_ip(request))
    db.commit()
    return tariff_out(t, _usage(db, t.id))


@router.put("/{tariff_id}/status")
def set_status(tariff_id: int, body: TariffStatusIn, request: Request, user: User = Depends(require_staff),
               db: Session = Depends(get_db)):
    _can_manage(db, user)
    t = db.get(TariffPlan, tariff_id)
    if not t:
        raise NotFound("Tariff not found.")
    if body.status == "inactive" and _usage(db, t.id):
        raise BadRequest("This tariff is assigned to connections. Move them to another tariff first.")
    old = t.status
    t.status = body.status
    log_action(db, user_id=user.id, action="tariff.status", entity_type="tariff", entity_id=t.id,
               summary=f"{t.code}: {old} -> {body.status}", ip=client_ip(request))
    db.commit()
    return tariff_out(t, _usage(db, t.id))
