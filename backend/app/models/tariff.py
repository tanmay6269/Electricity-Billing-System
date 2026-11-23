from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin

BILLING_METHODS = ("flat", "slab")


class TariffPlan(TimestampMixin, Base):
    __tablename__ = "tariff_plans"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    customer_category: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    billing_method: Mapped[str] = mapped_column(String(10), default="slab", nullable=False)
    flat_rate: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    fixed_charge: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0, nullable=False)  # electricity duty %
    additional_charges: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    additional_charges_label: Mapped[str | None] = mapped_column(String(80))
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10), default="active", index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    slabs: Mapped[list["TariffSlab"]] = relationship(
        back_populates="tariff", cascade="all, delete-orphan", order_by="TariffSlab.from_unit", lazy="selectin"
    )


class TariffSlab(Base):
    """A slab covers units in (from_unit, to_unit]. to_unit NULL means 'and above'."""

    __tablename__ = "tariff_slabs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tariff_plan_id: Mapped[int] = mapped_column(
        ForeignKey("tariff_plans.id", ondelete="CASCADE"), index=True, nullable=False
    )
    from_unit: Mapped[int] = mapped_column(Integer, nullable=False)
    to_unit: Mapped[int | None] = mapped_column(Integer)
    rate: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)

    tariff: Mapped[TariffPlan] = relationship(back_populates="slabs")
