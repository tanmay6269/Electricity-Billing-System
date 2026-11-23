"""Typed access to admin-editable system settings."""
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import SystemSetting

DEFAULT_SETTINGS: dict[str, tuple[str, str]] = {
    "company_name": ("PowerGrid Utility Services (Demo)", "Provider name shown on invoices"),
    "company_address": ("12 Energy Park Road, Sector 5, Jaipur, Rajasthan 302001", "Provider address on invoices"),
    "company_phone": ("1800-000-0000", "Customer care number"),
    "company_email": ("support@powergrid-demo.local", "Customer care email"),
    "invoice_prefix": ("INV", "Prefix for invoice numbers"),
    "bill_due_days": ("15", "Days between bill issue date and due date"),
    "late_fee_percent": ("2", "Late payment charge (%) on overdue amount carried into the next bill"),
    "due_soon_days": ("3", "Send 'bill due soon' reminders this many days before the due date"),
    "staff_can_manage_tariffs": ("false", "Allow staff to create/edit tariff plans"),
    "payment_instructions": (
        "Pay online through the customer portal (Demo Payment Mode) or at any PowerGrid collection centre. "
        "Quote your invoice number with every payment.",
        "Shown on invoices",
    ),
}


def get_setting(db: Session, key: str) -> str:
    row = db.scalar(select(SystemSetting).where(SystemSetting.key == key))
    if row:
        return row.value
    return DEFAULT_SETTINGS.get(key, ("", ""))[0]


def get_int(db: Session, key: str) -> int:
    try:
        return int(get_setting(db, key))
    except ValueError:
        return int(DEFAULT_SETTINGS[key][0])


def get_decimal(db: Session, key: str) -> Decimal:
    try:
        return Decimal(get_setting(db, key))
    except Exception:
        return Decimal(DEFAULT_SETTINGS[key][0])


def get_bool(db: Session, key: str) -> bool:
    return get_setting(db, key).strip().lower() in ("1", "true", "yes", "on")


def ensure_defaults(db: Session) -> None:
    existing = set(db.scalars(select(SystemSetting.key)).all())
    for key, (value, desc) in DEFAULT_SETTINGS.items():
        if key not in existing:
            db.add(SystemSetting(key=key, value=value, description=desc))
