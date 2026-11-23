from datetime import date
from decimal import Decimal

from pydantic import Field

from app.schemas.common import StrictModel, d, f


class ConnectionCreateIn(StrictModel):
    customer_id: int
    meter_number: str = Field(min_length=4, max_length=30, pattern=r"^[A-Za-z0-9-]+$")
    meter_manufacturer: str | None = Field(None, max_length=80)
    initial_reading: Decimal = Field(default=Decimal("0"), ge=0)
    connection_type: str = Field(pattern="^(residential|commercial|industrial)$")
    sanctioned_load_kw: Decimal = Field(gt=0, le=10000)
    tariff_plan_id: int
    installation_date: date
    status: str = Field("active", pattern="^(active|pending|suspended|disconnected)$")
    address: str | None = Field(None, max_length=500)


class ConnectionUpdateIn(StrictModel):
    connection_type: str | None = Field(None, pattern="^(residential|commercial|industrial)$")
    sanctioned_load_kw: Decimal | None = Field(None, gt=0, le=10000)
    address: str | None = Field(None, min_length=5, max_length=500)
    meter_status: str | None = Field(None, pattern="^(working|faulty|replaced|removed)$")


class ConnectionStatusIn(StrictModel):
    status: str = Field(pattern="^(active|pending|suspended|disconnected)$")
    reason: str = Field(min_length=3, max_length=255)


class ChangeTariffIn(StrictModel):
    tariff_plan_id: int
    reason: str | None = Field(None, max_length=255)


def connection_out(c) -> dict:
    return {
        "id": c.id,
        "connection_code": c.connection_code,
        "customer_id": c.customer_id,
        "customer_code": c.customer.customer_code,
        "customer_name": c.customer.full_name,
        "meter_id": c.meter_id,
        "meter_number": c.meter.meter_number,
        "meter_status": c.meter.status,
        "meter_manufacturer": c.meter.manufacturer,
        "initial_reading": f(c.meter.initial_reading),
        "connection_type": c.connection_type,
        "sanctioned_load_kw": f(c.sanctioned_load_kw),
        "tariff_plan_id": c.tariff_plan_id,
        "tariff_plan": c.tariff_plan.name,
        "tariff_category": c.tariff_plan.customer_category,
        "installation_date": d(c.installation_date),
        "status": c.status,
        "address": c.address,
        "created_at": d(c.created_at),
    }
