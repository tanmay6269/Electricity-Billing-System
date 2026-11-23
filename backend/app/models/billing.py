from datetime import date
from decimal import Decimal

from sqlalchemy import JSON, Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin

BILL_STATUSES = ("draft", "generated", "pending", "partially_paid", "paid", "overdue", "cancelled")
# Bills that still expect money from the customer
OPEN_BILL_STATUSES = ("generated", "pending", "partially_paid", "overdue")


class Bill(TimestampMixin, Base):
    __tablename__ = "bills"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    invoice_number: Mapped[str] = mapped_column(String(30), unique=True, index=True, nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True, nullable=False)
    connection_id: Mapped[int] = mapped_column(ForeignKey("electricity_connections.id"), index=True, nullable=False)
    reading_id: Mapped[int] = mapped_column(ForeignKey("meter_readings.id"), index=True, nullable=False)
    tariff_plan_id: Mapped[int] = mapped_column(ForeignKey("tariff_plans.id"), nullable=False)
    billing_period: Mapped[str] = mapped_column(String(7), index=True, nullable=False)
    # "<connection_id>:<period>" for every non-cancelled bill, NULL once cancelled.
    # The UNIQUE index gives database-level duplicate billing prevention (NULLs never collide).
    active_period_key: Mapped[str | None] = mapped_column(String(40), unique=True)

    previous_reading: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    current_reading: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    units_consumed: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    consumption_charge: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    fixed_charge: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    additional_charges: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    late_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    previous_outstanding: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    balance_due: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    tariff_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    # When an unpaid balance is rolled into a newer bill, the old bill points to it.
    carried_forward_to_id: Mapped[int | None] = mapped_column(ForeignKey("bills.id"))
    cancel_reason: Mapped[str | None] = mapped_column(Text)
    remarks: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    customer: Mapped["Customer"] = relationship(lazy="joined")  # noqa: F821
    connection: Mapped["ElectricityConnection"] = relationship(lazy="joined")  # noqa: F821
    items: Mapped[list["BillItem"]] = relationship(
        back_populates="bill", cascade="all, delete-orphan", order_by="BillItem.sort_order", lazy="selectin"
    )


class BillItem(Base):
    __tablename__ = "bill_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bill_id: Mapped[int] = mapped_column(ForeignKey("bills.id", ondelete="CASCADE"), index=True, nullable=False)
    item_type: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[str] = mapped_column(String(200), nullable=False)
    units: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    rate: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    bill: Mapped[Bill] = relationship(back_populates="items")
