from datetime import date
from decimal import Decimal

from pydantic import Field, model_validator

from app.schemas.common import StrictModel, d, f


class SlabIn(StrictModel):
    from_unit: int = Field(ge=0)
    to_unit: int | None = Field(None, gt=0)
    rate: Decimal = Field(ge=0, le=1000)


class TariffIn(StrictModel):
    code: str = Field(min_length=2, max_length=30, pattern=r"^[A-Z0-9_-]+$")
    name: str = Field(min_length=3, max_length=120)
    customer_category: str = Field(pattern="^(residential|commercial|industrial)$")
    billing_method: str = Field(pattern="^(flat|slab)$")
    flat_rate: Decimal | None = Field(None, ge=0, le=1000)
    fixed_charge: Decimal = Field(ge=0, le=100000)
    tax_rate: Decimal = Field(ge=0, le=100)
    additional_charges: Decimal = Field(Decimal("0"), ge=0, le=100000)
    additional_charges_label: str | None = Field(None, max_length=80)
    effective_from: date
    effective_to: date | None = None
    status: str = Field("active", pattern="^(active|inactive)$")
    description: str | None = Field(None, max_length=1000)
    slabs: list[SlabIn] = []

    @model_validator(mode="after")
    def _check(self):
        if self.effective_to and self.effective_to < self.effective_from:
            raise ValueError("Expiry date must be after the effective date.")
        if self.billing_method == "flat" and self.flat_rate is None:
            raise ValueError("Flat-rate tariffs need a per-unit rate.")
        return self


class TariffStatusIn(StrictModel):
    status: str = Field(pattern="^(active|inactive)$")


def tariff_out(t, usage: int | None = None) -> dict:
    return {
        "id": t.id,
        "code": t.code,
        "name": t.name,
        "customer_category": t.customer_category,
        "billing_method": t.billing_method,
        "flat_rate": f(t.flat_rate),
        "fixed_charge": f(t.fixed_charge),
        "tax_rate": f(t.tax_rate),
        "additional_charges": f(t.additional_charges),
        "additional_charges_label": t.additional_charges_label,
        "effective_from": d(t.effective_from),
        "effective_to": d(t.effective_to),
        "status": t.status,
        "description": t.description,
        "slabs": [{"id": s.id, "from_unit": s.from_unit, "to_unit": s.to_unit, "rate": f(s.rate)} for s in t.slabs],
        "connections_using": usage,
        "updated_at": d(t.updated_at),
    }
