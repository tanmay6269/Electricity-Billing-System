from decimal import Decimal

from pydantic import Field, model_validator

from app.schemas.common import PERIOD_RE, StrictModel, d, f


class BillRequestIn(StrictModel):
    reading_id: int | None = None
    connection_id: int | None = None
    billing_period: str | None = Field(None, pattern=PERIOD_RE)
    discount: Decimal = Field(Decimal("0"), ge=0, le=Decimal("10000000"))
    extra_charges: Decimal = Field(Decimal("0"), ge=0, le=Decimal("10000000"))
    as_draft: bool = False
    notify: bool = True
    remarks: str | None = Field(None, max_length=500)

    @model_validator(mode="after")
    def _target(self):
        if not self.reading_id and not (self.connection_id and self.billing_period):
            raise ValueError("Choose a meter reading, or a connection and billing period.")
        return self


class MonthlyBillingIn(StrictModel):
    billing_period: str = Field(pattern=PERIOD_RE)
    connection_ids: list[int] | None = None
    notify: bool = True
    as_draft: bool = False


class DraftUpdateIn(StrictModel):
    discount: Decimal | None = Field(None, ge=0)
    extra_charges: Decimal | None = Field(None, ge=0)
    remarks: str | None = Field(None, max_length=500)


class CancelIn(StrictModel):
    reason: str = Field(min_length=5, max_length=500)


def bill_out(b, detail: bool = False) -> dict:
    data = {
        "id": b.id,
        "invoice_number": b.invoice_number,
        "customer_id": b.customer_id,
        "customer_code": b.customer.customer_code,
        "customer_name": b.customer.full_name,
        "customer_type": b.customer.customer_type,
        "connection_id": b.connection_id,
        "connection_code": b.connection.connection_code,
        "meter_number": b.connection.meter.meter_number,
        "billing_period": b.billing_period,
        "previous_reading": f(b.previous_reading),
        "current_reading": f(b.current_reading),
        "units_consumed": f(b.units_consumed),
        "consumption_charge": f(b.consumption_charge),
        "fixed_charge": f(b.fixed_charge),
        "additional_charges": f(b.additional_charges),
        "tax_amount": f(b.tax_amount),
        "late_fee": f(b.late_fee),
        "discount": f(b.discount),
        "previous_outstanding": f(b.previous_outstanding),
        "total_amount": f(b.total_amount),
        "amount_paid": f(b.amount_paid),
        "balance_due": f(b.balance_due),
        "issue_date": d(b.issue_date),
        "due_date": d(b.due_date),
        "status": b.status,
        "carried_forward_to_id": b.carried_forward_to_id,
        "tariff_name": (b.tariff_snapshot or {}).get("name"),
        "created_at": d(b.created_at),
    }
    if detail:
        c = b.customer
        data.update({
            "customer_address": f"{c.address}, {c.city}, {c.state} {c.postal_code}",
            "customer_email": c.email,
            "customer_phone": c.phone,
            "tariff_snapshot": b.tariff_snapshot,
            "cancel_reason": b.cancel_reason,
            "remarks": b.remarks,
            "items": [
                {"item_type": i.item_type, "description": i.description, "units": f(i.units), "rate": f(i.rate),
                 "amount": f(i.amount)} for i in b.items
            ],
        })
    return data
