from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, utcnow

PAYMENT_METHODS = ("upi", "debit_card", "credit_card", "net_banking", "cash", "demo")
PAYMENT_STATUSES = ("pending", "successful", "failed", "refunded")


class Payment(TimestampMixin, Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    payment_code: Mapped[str] = mapped_column(String(30), unique=True, index=True, nullable=False)
    transaction_id: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    receipt_number: Mapped[str | None] = mapped_column(String(30), unique=True)
    bill_id: Mapped[int] = mapped_column(ForeignKey("bills.id"), index=True, nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    method: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(12), index=True, nullable=False)
    payment_date: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True, nullable=False)
    remarks: Mapped[str | None] = mapped_column(Text)
    recorded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    bill: Mapped["Bill"] = relationship(lazy="joined")  # noqa: F821
    customer: Mapped["Customer"] = relationship(lazy="joined")  # noqa: F821
