"""Meter reading rules: no going backwards, one reading per connection per period, audited edits."""
from __future__ import annotations

import random
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequest, Conflict, NotFound
from app.models import Bill, ElectricityConnection, MeterReading
from app.services.audit import log_action, snapshot
from app.services.billing_service import period_bounds
from app.services.tariff_calc import money

READING_FIELDS = ["billing_period", "previous_reading", "current_reading", "units_consumed", "reading_date", "remarks"]

# Typical simulated monthly units per connection type (min, max)
SIM_RANGES = {"residential": (60, 420), "commercial": (350, 1600), "industrial": (2500, 9000)}


def last_reading(db: Session, connection_id: int, before_period: str | None = None) -> MeterReading | None:
    q = select(MeterReading).where(MeterReading.connection_id == connection_id)
    if before_period:
        q = q.where(MeterReading.billing_period < before_period)
    return db.scalar(q.order_by(MeterReading.billing_period.desc()).limit(1))


def previous_value(db: Session, conn: ElectricityConnection, period: str) -> Decimal:
    prev = last_reading(db, conn.id, period)
    return prev.current_reading if prev else conn.meter.initial_reading


def create_reading(
    db: Session,
    *,
    connection_id: int,
    billing_period: str,
    current_reading,
    reading_date: date,
    reading_type: str,
    user_id: int | None,
    remarks: str | None = None,
    commit: bool = True,
) -> MeterReading:
    conn = db.get(ElectricityConnection, connection_id)
    if not conn or conn.deleted_at:
        raise NotFound("Connection not found.")
    if conn.status in ("pending", "disconnected"):
        raise BadRequest(f"Connection {conn.connection_code} is {conn.status}; readings cannot be recorded.")
    start, end = period_bounds(billing_period)
    if reading_date < start:
        raise BadRequest("Reading date cannot be before the start of the billing period.")
    if reading_date > date.today():
        raise BadRequest("Reading date cannot be in the future.")
    if db.scalar(select(MeterReading.id).where(MeterReading.connection_id == conn.id,
                                               MeterReading.billing_period == billing_period)):
        raise Conflict(f"A reading for {conn.connection_code} in {billing_period} already exists.")
    later = db.scalar(select(MeterReading.id).where(MeterReading.connection_id == conn.id,
                                                    MeterReading.billing_period > billing_period))
    if later:
        raise BadRequest("A reading for a later period already exists. Readings must be entered in order.")

    prev = previous_value(db, conn, billing_period)
    current = money(current_reading)
    if current < prev:
        raise BadRequest(f"Current reading ({current}) cannot be lower than the previous reading ({prev}).")

    reading = MeterReading(
        connection_id=conn.id,
        customer_id=conn.customer_id,
        meter_id=conn.meter_id,
        billing_period=billing_period,
        previous_reading=prev,
        current_reading=current,
        units_consumed=money(current - prev),
        reading_date=reading_date,
        reading_type=reading_type,
        entered_by=user_id,
        remarks=remarks,
    )
    db.add(reading)
    db.flush()
    log_action(db, user_id=user_id, action="reading.create", entity_type="meter_reading", entity_id=reading.id,
               summary=f"{conn.connection_code} {billing_period}: {prev} -> {current}",
               new=snapshot(reading, READING_FIELDS))
    if commit:
        db.commit()
        db.refresh(reading)
    return reading


def update_reading(db: Session, reading: MeterReading, *, user_id: int, current_reading=None, reading_date=None,
                   remarks=None, reason: str) -> MeterReading:
    if not reason or len(reason.strip()) < 5:
        raise BadRequest("A reason for the change is required (at least 5 characters).")
    billed = db.scalar(select(Bill).where(Bill.reading_id == reading.id, Bill.status.notin_(("cancelled", "draft"))))
    if billed:
        raise BadRequest(f"This reading is already billed on {billed.invoice_number}. Cancel that bill before editing.")
    if db.scalar(select(MeterReading.id).where(MeterReading.connection_id == reading.connection_id,
                                               MeterReading.billing_period > reading.billing_period)):
        raise BadRequest("Only the latest reading of a connection can be edited.")
    old = snapshot(reading, READING_FIELDS)
    if current_reading is not None:
        current = money(current_reading)
        if current < reading.previous_reading:
            raise BadRequest(f"Current reading cannot be lower than the previous reading ({reading.previous_reading}).")
        reading.current_reading = current
        reading.units_consumed = money(current - reading.previous_reading)
    if reading_date is not None:
        if reading_date > date.today():
            raise BadRequest("Reading date cannot be in the future.")
        reading.reading_date = reading_date
    if remarks is not None:
        reading.remarks = remarks
    # A draft bill built on this reading must be recalculated, so remove it.
    for draft in db.scalars(select(Bill).where(Bill.reading_id == reading.id, Bill.status == "draft")).all():
        db.delete(draft)
    log_action(db, user_id=user_id, action="reading.update", entity_type="meter_reading", entity_id=reading.id,
               summary=f"Edited: {reason.strip()}", old=old, new=snapshot(reading, READING_FIELDS))
    db.commit()
    db.refresh(reading)
    return reading


def simulate_period(db: Session, *, billing_period: str, user_id: int, seed: int | None = None) -> dict:
    """Generate realistic simulated readings for every active connection missing one in this period."""
    start, end = period_bounds(billing_period)
    rng = random.Random(seed)
    reading_date = min(end, date.today())
    if reading_date < start:
        raise BadRequest("Cannot simulate readings for a future billing period.")
    created, skipped = [], []
    conns = db.scalars(select(ElectricityConnection).where(ElectricityConnection.status == "active",
                                                           ElectricityConnection.deleted_at.is_(None))).all()
    for c in conns:
        try:
            lo, hi = SIM_RANGES.get(c.connection_type, (80, 400))
            prev = previous_value(db, c, billing_period)
            units = Decimal(rng.randint(lo, hi))
            r = create_reading(db, connection_id=c.id, billing_period=billing_period, current_reading=prev + units,
                               reading_date=reading_date, reading_type="simulated", user_id=user_id,
                               remarks="Simulated reading (demo)", commit=False)
            db.commit()
            created.append({"connection": c.connection_code, "units": float(r.units_consumed)})
        except Exception as exc:
            db.rollback()
            skipped.append({"connection": c.connection_code, "reason": getattr(exc, "message", str(exc))})
    return {"billing_period": billing_period, "created": created, "skipped": skipped}
