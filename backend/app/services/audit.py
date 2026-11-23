"""Audit trail. Records who changed what. Audit rows are never edited or deleted through the API."""
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import AuditLog

SENSITIVE_KEYS = {"password", "password_hash", "reset_token_hash", "token", "token_version"}


def _clean(values: dict | None) -> dict | None:
    if values is None:
        return None
    out = {}
    for k, v in values.items():
        if k in SENSITIVE_KEYS:
            continue
        if isinstance(v, Decimal):
            v = str(v)
        elif isinstance(v, (date, datetime)):
            v = v.isoformat()
        out[k] = v
    return out


def snapshot(obj, fields: list[str]) -> dict:
    return _clean({f: getattr(obj, f, None) for f in fields})


def log_action(
    db: Session,
    *,
    user_id: int | None,
    action: str,
    entity_type: str,
    entity_id=None,
    summary: str | None = None,
    old: dict | None = None,
    new: dict | None = None,
    ip: str | None = None,
) -> None:
    db.add(
        AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            summary=summary[:255] if summary else None,
            old_values=_clean(old),
            new_values=_clean(new),
            ip_address=ip,
        )
    )
