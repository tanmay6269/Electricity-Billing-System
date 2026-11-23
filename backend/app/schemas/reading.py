from datetime import date
from decimal import Decimal

from pydantic import Field

from app.schemas.common import PERIOD_RE, StrictModel, d, f


class ReadingCreateIn(StrictModel):
    connection_id: int
    billing_period: str = Field(pattern=PERIOD_RE)
    current_reading: Decimal = Field(ge=0, le=Decimal("9999999999"))
    reading_date: date
    reading_type: str = Field("manual", pattern="^(manual|simulated)$")
    remarks: str | None = Field(None, max_length=500)


class ReadingUpdateIn(StrictModel):
    current_reading: Decimal | None = Field(None, ge=0, le=Decimal("9999999999"))
    reading_date: date | None = None
    remarks: str | None = Field(None, max_length=500)
    reason: str = Field(min_length=5, max_length=255)


class SimulateIn(StrictModel):
    billing_period: str = Field(pattern=PERIOD_RE)


def reading_out(r) -> dict:
    return {
        "id": r.id,
        "connection_id": r.connection_id,
        "connection_code": r.connection.connection_code,
        "customer_id": r.customer_id,
        "customer_code": r.customer.customer_code,
        "customer_name": r.customer.full_name,
        "meter_number": r.connection.meter.meter_number,
        "billing_period": r.billing_period,
        "previous_reading": f(r.previous_reading),
        "current_reading": f(r.current_reading),
        "units_consumed": f(r.units_consumed),
        "reading_date": d(r.reading_date),
        "reading_type": r.reading_type,
        "entered_by": r.entered_by_user.full_name if r.entered_by_user else None,
        "remarks": r.remarks,
        "created_at": d(r.created_at),
        "updated_at": d(r.updated_at),
    }
