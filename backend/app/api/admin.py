"""Audit logs (read-only) and system settings (admin only)."""
from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings as app_settings
from app.core.database import get_db
from app.core.deps import client_ip, get_current_user, require_admin
from app.core.exceptions import BadRequest
from app.models import AuditLog, SystemSetting, User
from app.schemas.common import StrictModel
from app.services import settings_service as ss
from app.services.audit import log_action
from app.utils.pagination import PageParams, like, paginate

router = APIRouter(tags=["Administration"])


def a_out(a: AuditLog) -> dict:
    return {"id": a.id, "action": a.action, "entity_type": a.entity_type, "entity_id": a.entity_id, "summary": a.summary,
            "old_values": a.old_values, "new_values": a.new_values, "ip_address": a.ip_address,
            "user": a.user.full_name if a.user else "System", "user_role": a.user.role_name if a.user else None,
            "created_at": a.created_at.isoformat()}


@router.get("/api/audit-logs")
def audit_logs(params: PageParams = Depends(), search: str | None = Query(None, max_length=100),
               entity_type: str | None = Query(None, max_length=40), action: str | None = Query(None, max_length=50),
               user_id: int | None = None, date_from: date | None = None, date_to: date | None = None,
               _: User = Depends(require_admin), db: Session = Depends(get_db)):
    stmt = select(AuditLog)
    if search:
        t = like(search)
        stmt = stmt.where(or_(AuditLog.summary.ilike(t, escape="\\"), AuditLog.action.ilike(t, escape="\\"),
                              AuditLog.entity_id == search))
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if action:
        stmt = stmt.where(AuditLog.action.ilike(like(action), escape="\\"))
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if date_from:
        stmt = stmt.where(func.date(AuditLog.created_at) >= date_from)
    if date_to:
        stmt = stmt.where(func.date(AuditLog.created_at) <= date_to)
    return paginate(db, stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()), params, a_out)


@router.get("/api/audit-logs/entity-types")
def entity_types(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return sorted(db.scalars(select(AuditLog.entity_type).distinct()).all())


class SettingsIn(StrictModel):
    values: dict[str, str]


@router.get("/api/settings")
def get_settings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = {s.key: s for s in db.scalars(select(SystemSetting)).all()}
    public = {"company_name", "company_address", "company_phone", "company_email", "payment_instructions"}
    out = []
    for key, (default, desc) in ss.DEFAULT_SETTINGS.items():
        if user.role_name != "admin" and key not in public:
            continue
        out.append({"key": key, "value": rows[key].value if key in rows else default, "description": desc})
    return {"settings": out, "email_enabled": app_settings.EMAIL_ENABLED, "environment": app_settings.ENVIRONMENT}


@router.put("/api/settings")
def update_settings(body: SettingsIn, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    numeric = {"bill_due_days": (1, 90), "late_fee_percent": (0, 25), "due_soon_days": (1, 30)}
    changed = {}
    for key, value in body.values.items():
        if key not in ss.DEFAULT_SETTINGS:
            raise BadRequest(f"Unknown setting: {key}")
        value = value.strip()
        if not value:
            raise BadRequest(f"{key} cannot be empty.")
        if key in numeric:
            try:
                num = float(value)
            except ValueError as exc:
                raise BadRequest(f"{key} must be a number.") from exc
            lo, hi = numeric[key]
            if not lo <= num <= hi:
                raise BadRequest(f"{key} must be between {lo} and {hi}.")
        if key == "staff_can_manage_tariffs" and value.lower() not in ("true", "false"):
            raise BadRequest("staff_can_manage_tariffs must be true or false.")
        row = db.scalar(select(SystemSetting).where(SystemSetting.key == key))
        if row is None:
            row = SystemSetting(key=key, value=value, description=ss.DEFAULT_SETTINGS[key][1])
            db.add(row)
        if row.value != value:
            changed[key] = {"old": row.value, "new": value}
        row.value = value
    if changed:
        log_action(db, user_id=admin.id, action="settings.update", entity_type="settings",
                   summary=", ".join(changed.keys()), old={k: v["old"] for k, v in changed.items()},
                   new={k: v["new"] for k, v in changed.items()}, ip=client_ip(request))
    db.commit()
    return {"message": "Settings saved.", "changed": list(changed.keys())}
