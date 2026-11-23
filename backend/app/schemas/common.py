"""Shared helpers for request validation and response serialization."""
import re
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

PHONE_RE = re.compile(r"^[6-9]\d{9}$")
PIN_RE = re.compile(r"^\d{6}$")
PERIOD_RE = r"^\d{4}-(0[1-9]|1[0-2])$"


class StrictModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


def f(v) -> float | None:
    return float(v) if isinstance(v, Decimal) else v


def d(v) -> str | None:
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    return v


def check_phone(v: str) -> str:
    v = re.sub(r"[\s-]", "", v or "")
    if v.startswith("+91"):
        v = v[3:]
    if not PHONE_RE.match(v):
        raise ValueError("Enter a valid 10-digit Indian mobile number.")
    return v


def check_pin(v: str) -> str:
    if not PIN_RE.match(v or ""):
        raise ValueError("Postal code must be 6 digits.")
    return v
