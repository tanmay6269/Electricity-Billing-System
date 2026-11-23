from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin

CUSTOMER_TYPES = ("residential", "commercial", "industrial")
CUSTOMER_STATUSES = ("active", "inactive", "suspended")
CONNECTION_STATUSES = ("active", "pending", "suspended", "disconnected")
METER_STATUSES = ("working", "faulty", "replaced", "removed")


class Customer(TimestampMixin, Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_code: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), unique=True)
    full_name: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    city: Mapped[str] = mapped_column(String(80), nullable=False)
    state: Mapped[str] = mapped_column(String(80), nullable=False)
    postal_code: Mapped[str] = mapped_column(String(10), nullable=False)
    customer_type: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True, nullable=False)
    profile_picture_url: Mapped[str | None] = mapped_column(String(500))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)

    user: Mapped["User | None"] = relationship()  # noqa: F821
    connections: Mapped[list["ElectricityConnection"]] = relationship(back_populates="customer")


class Meter(TimestampMixin, Base):
    __tablename__ = "meters"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meter_number: Mapped[str] = mapped_column(String(30), unique=True, index=True, nullable=False)
    manufacturer: Mapped[str | None] = mapped_column(String(80))
    initial_reading: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    installed_on: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="working", nullable=False)


class ElectricityConnection(TimestampMixin, Base):
    __tablename__ = "electricity_connections"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    connection_code: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True, nullable=False)
    meter_id: Mapped[int] = mapped_column(ForeignKey("meters.id"), unique=True, nullable=False)
    tariff_plan_id: Mapped[int] = mapped_column(ForeignKey("tariff_plans.id"), index=True, nullable=False)
    connection_type: Mapped[str] = mapped_column(String(20), nullable=False)
    sanctioned_load_kw: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    installation_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True, nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)

    customer: Mapped[Customer] = relationship(back_populates="connections", lazy="joined")
    meter: Mapped[Meter] = relationship(lazy="joined")
    tariff_plan: Mapped["TariffPlan"] = relationship(lazy="joined")  # noqa: F821
