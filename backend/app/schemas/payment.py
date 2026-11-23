from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.schemas.common import StrictModel, d, f

METHODS = "^(upi|debit_card|credit_card|net_banking|cash|demo)$"


class DemoPaymentIn(StrictModel):
    bill_id: int
    amount: Decimal = Field(gt=0, le=Decimal("100000000"))
    method: str = Field(pattern="^(upi|debit_card|credit_card|net_banking|demo)$")
    simulate: str = Field("success", pattern="^(success|failure)$")


class RecordPaymentIn(StrictModel):
    bill_id: int
    amount: Decimal = Field(gt=0, le=Decimal("100000000"))
    method: str = Field(pattern=METHODS)
    remarks: str | None = Field(None, max_length=500)
    payment_date: datetime | None = None


class MarkPaidIn(StrictModel):
    method: str = Field("cash", pattern=METHODS)
    remarks: str | None = Field(None, max_length=500)


class RefundIn(StrictModel):
    reason: str = Field(min_length=5, max_length=255)


def payment_out(p) -> dict:
    return {
        "id": p.id,
        "payment_code": p.payment_code,
        "transaction_id": p.transaction_id,
        "receipt_number": p.receipt_number,
        "bill_id": p.bill_id,
        "invoice_number": p.bill.invoice_number,
        "billing_period": p.bill.billing_period,
        "customer_id": p.customer_id,
        "customer_code": p.customer.customer_code,
        "customer_name": p.customer.full_name,
        "amount": f(p.amount),
        "method": p.method,
        "status": p.status,
        "payment_date": d(p.payment_date),
        "remarks": p.remarks,
        "bill_balance_due": f(p.bill.balance_due),
        "bill_status": p.bill.status,
    }
