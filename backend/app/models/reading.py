from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin

READING_TYPES = ("manual", "simulated", "imported")


class MeterReading(TimestampMixin, Base):
    __tablename__ = "meter_readings"
    __table_args__ = (UniqueConstraint("connection_id", "billing_period", name="uq_reading_connection_period"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    connection_id: Mapped[int] = mapped_column(ForeignKey("electricity_connections.id"), index=True, nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True, nullable=False)
    meter_id: Mapped[int] = mapped_column(ForeignKey("meters.id"), nullable=False)
    billing_period: Mapped[str] = mapped_column(String(7), index=True, nullable=False)  # YYYY-MM
    previous_reading: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    current_reading: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    units_consumed: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    reading_date: Mapped[date] = mapped_column(Date, nullable=False)
    reading_type: Mapped[str] = mapped_column(String(12), default="manual", index=True, nullable=False)
    entered_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    remarks: Mapped[str | None] = mapped_column(Text)

    connection: Mapped["ElectricityConnection"] = relationship(lazy="joined")  # noqa: F821
    customer: Mapped["Customer"] = relationship(lazy="joined")  # noqa: F821
    entered_by_user: Mapped["User | None"] = relationship(lazy="joined")  # noqa: F821
