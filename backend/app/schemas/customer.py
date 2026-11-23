from datetime import date
from decimal import Decimal

from pydantic import EmailStr, Field, field_validator

from app.schemas.common import StrictModel, check_phone, check_pin, d, f

CTYPE = "^(residential|commercial|industrial)$"


class InitialConnectionIn(StrictModel):
    meter_number: str = Field(min_length=4, max_length=30, pattern=r"^[A-Za-z0-9-]+$")
    tariff_plan_id: int
    sanctioned_load_kw: Decimal = Field(gt=0, le=10000)
    installation_date: date
    initial_reading: Decimal = Field(default=Decimal("0"), ge=0)
    connection_type: str | None = Field(None, pattern=CTYPE)


class CustomerCreateIn(StrictModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str
    address: str = Field(min_length=5, max_length=255)
    city: str = Field(min_length=2, max_length=80)
    state: str = Field(min_length=2, max_length=80)
    postal_code: str
    customer_type: str = Field(pattern=CTYPE)
    status: str = Field("active", pattern="^(active|inactive|suspended)$")
    profile_picture_url: str | None = Field(None, max_length=500)
    create_login: bool = False
    login_password: str | None = None
    connection: InitialConnectionIn | None = None

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        return check_phone(v)

    @field_validator("postal_code")
    @classmethod
    def _pin(cls, v):
        return check_pin(v)


class CustomerUpdateIn(StrictModel):
    full_name: str | None = Field(None, min_length=2, max_length=120)
    email: EmailStr | None = None
    phone: str | None = None
    address: str | None = Field(None, min_length=5, max_length=255)
    city: str | None = Field(None, min_length=2, max_length=80)
    state: str | None = Field(None, min_length=2, max_length=80)
    postal_code: str | None = None
    customer_type: str | None = Field(None, pattern=CTYPE)
    status: str | None = Field(None, pattern="^(active|inactive|suspended)$")
    profile_picture_url: str | None = Field(None, max_length=500)

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        return check_phone(v) if v else v

    @field_validator("postal_code")
    @classmethod
    def _pin(cls, v):
        return check_pin(v) if v else v


class CustomerSelfUpdateIn(StrictModel):
    """Fields a customer may change on their own profile."""
    phone: str | None = None
    address: str | None = Field(None, min_length=5, max_length=255)
    city: str | None = Field(None, min_length=2, max_length=80)
    state: str | None = Field(None, min_length=2, max_length=80)
    postal_code: str | None = None
    profile_picture_url: str | None = Field(None, max_length=500)

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        return check_phone(v) if v else v

    @field_validator("postal_code")
    @classmethod
    def _pin(cls, v):
        return check_pin(v) if v else v


def customer_out(c, primary_conn=None) -> dict:
    conn = primary_conn
    if conn is None:
        live = [x for x in (c.connections or []) if not x.deleted_at]
        conn = live[0] if live else None
    return {
        "id": c.id,
        "customer_code": c.customer_code,
        "full_name": c.full_name,
        "email": c.email,
        "phone": c.phone,
        "address": c.address,
        "city": c.city,
        "state": c.state,
        "postal_code": c.postal_code,
        "customer_type": c.customer_type,
        "status": c.status,
        "profile_picture_url": c.profile_picture_url,
        "has_login": c.user_id is not None,
        "created_at": d(c.created_at),
        "connection_count": len([x for x in (c.connections or []) if not x.deleted_at]),
        "connection_id": conn.id if conn else None,
        "connection_code": conn.connection_code if conn else None,
        "meter_number": conn.meter.meter_number if conn else None,
        "connection_date": d(conn.installation_date) if conn else None,
        "tariff_plan": conn.tariff_plan.name if conn else None,
        "sanctioned_load_kw": f(conn.sanctioned_load_kw) if conn else None,
    }
