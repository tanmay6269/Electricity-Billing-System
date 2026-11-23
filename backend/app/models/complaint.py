from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, utcnow

COMPLAINT_CATEGORIES = ("incorrect_bill", "meter_issue", "power_supply", "payment_issue", "connection_issue", "other")
COMPLAINT_STATUSES = ("submitted", "under_review", "assigned", "in_progress", "resolved", "closed")
COMPLAINT_PRIORITIES = ("low", "medium", "high", "critical")


class Complaint(TimestampMixin, Base):
    __tablename__ = "complaints"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    complaint_code: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True, nullable=False)
    connection_id: Mapped[int | None] = mapped_column(ForeignKey("electricity_connections.id"))
    category: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[str] = mapped_column(String(10), default="medium", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="submitted", index=True, nullable=False)
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    resolution_notes: Mapped[str | None] = mapped_column(Text)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)

    customer: Mapped["Customer"] = relationship(lazy="joined")  # noqa: F821
    connection: Mapped["ElectricityConnection | None"] = relationship()  # noqa: F821
    assignee: Mapped["User | None"] = relationship(lazy="joined")  # noqa: F821
    updates: Mapped[list["ComplaintUpdate"]] = relationship(
        back_populates="complaint", cascade="all, delete-orphan", order_by="ComplaintUpdate.id", lazy="selectin"
    )


class ComplaintUpdate(Base):
    __tablename__ = "complaint_updates"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    complaint_id: Mapped[int] = mapped_column(
        ForeignKey("complaints.id", ondelete="CASCADE"), index=True, nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    complaint: Mapped[Complaint] = relationship(back_populates="updates")
    author: Mapped["User | None"] = relationship(lazy="joined")  # noqa: F821
