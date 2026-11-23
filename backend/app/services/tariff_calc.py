"""Pure tariff / bill arithmetic. No database access here, so it is easy to unit test.

All money uses Decimal and is rounded half-up to 2 decimals (paise).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

TWO = Decimal("0.01")


def money(value) -> Decimal:
    return Decimal(str(value)).quantize(TWO, rounding=ROUND_HALF_UP)


def fmt_units(value) -> str:
    v = Decimal(str(value))
    return f"{int(v)}" if v == v.to_integral_value() else f"{v.quantize(TWO)}"


def D(value) -> Decimal:
    return Decimal(str(value if value is not None else 0))


@dataclass
class Line:
    item_type: str
    description: str
    amount: Decimal
    units: Decimal | None = None
    rate: Decimal | None = None


@dataclass
class BillCalculation:
    units: Decimal
    consumption_lines: list[Line]
    consumption_charge: Decimal
    fixed_charge: Decimal
    additional_charges: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    late_fee: Decimal
    discount: Decimal
    previous_outstanding: Decimal
    total_amount: Decimal
    lines: list[Line] = field(default_factory=list)


class TariffError(ValueError):
    pass


def validate_slabs(slabs: list[dict]) -> None:
    """Slabs must start at 0, be contiguous, increasing, and only the last may be open-ended."""
    if not slabs:
        raise TariffError("A slab tariff needs at least one slab.")
    ordered = sorted(slabs, key=lambda s: s["from_unit"])
    if int(ordered[0]["from_unit"]) != 0:
        raise TariffError("The first slab must start at 0 units.")
    for i, s in enumerate(ordered):
        if D(s["rate"]) < 0:
            raise TariffError("Slab rates cannot be negative.")
        to_unit = s.get("to_unit")
        last = i == len(ordered) - 1
        if to_unit is None and not last:
            raise TariffError("Only the last slab can be open-ended ('and above').")
        if to_unit is not None and int(to_unit) <= int(s["from_unit"]):
            raise TariffError(f"Slab {i + 1}: 'to' units must be greater than 'from' units.")
        if not last and int(ordered[i + 1]["from_unit"]) != int(to_unit):
            raise TariffError(f"Slab {i + 2} must start exactly where slab {i + 1} ends ({to_unit}).")


def consumption_lines(units: Decimal, snapshot: dict) -> list[Line]:
    """Progressive slab billing: each portion of consumption is billed at its own slab rate."""
    units = D(units)
    if units < 0:
        raise TariffError("Units consumed cannot be negative.")
    method = snapshot.get("billing_method", "slab")
    if method == "flat":
        rate = D(snapshot.get("flat_rate"))
        return [Line("flat", f"Energy charge: {fmt_units(units)} units @ Rs {rate.normalize():f}/unit", money(units * rate), units, rate)]

    lines: list[Line] = []
    for slab in sorted(snapshot.get("slabs", []), key=lambda s: s["from_unit"]):
        lower = D(slab["from_unit"])
        upper = D(slab["to_unit"]) if slab.get("to_unit") is not None else None
        top = units if upper is None else min(units, upper)
        portion = top - lower
        if portion <= 0:
            continue
        rate = D(slab["rate"])
        label = f"{int(lower) + 1}-{int(upper)}" if upper is not None else f"Above {int(lower)}"
        lines.append(Line("slab", f"Slab {label} units: {fmt_units(portion)} @ Rs {rate.normalize():f}/unit", money(portion * rate), portion, rate))
    return lines


def calculate_bill(
    units,
    snapshot: dict,
    *,
    previous_outstanding=0,
    late_fee=0,
    discount=0,
    extra_charges=0,
) -> BillCalculation:
    """Total = Consumption + Fixed + Additional + Tax + Late fee + Previous outstanding - Discount.

    Electricity duty (tax) applies to consumption + fixed + additional charges.
    """
    units = D(units)
    c_lines = consumption_lines(units, snapshot)
    consumption = money(sum((l.amount for l in c_lines), Decimal("0")))
    fixed = money(snapshot.get("fixed_charge", 0))
    additional = money(D(snapshot.get("additional_charges", 0)) + D(extra_charges))
    tax_rate = D(snapshot.get("tax_rate", 0))
    taxable = consumption + fixed + additional
    tax = money(taxable * tax_rate / Decimal(100))
    late_fee = money(late_fee)
    discount = money(discount)
    prev = money(previous_outstanding)
    if discount < 0 or late_fee < 0 or prev < 0:
        raise TariffError("Discount, late fee and outstanding cannot be negative.")
    if discount > taxable + tax:
        raise TariffError("Discount cannot exceed the current month's charges.")
    total = money(taxable + tax + late_fee + prev - discount)

    lines = list(c_lines)
    lines.append(Line("fixed", "Fixed charge", fixed))
    if additional:
        lines.append(Line("additional", snapshot.get("additional_charges_label") or "Additional charges", additional))
    lines.append(Line("tax", f"Electricity duty @ {tax_rate}%", tax, rate=tax_rate))
    if late_fee:
        lines.append(Line("late_fee", "Late payment charge", late_fee))
    if prev:
        lines.append(Line("outstanding", "Previous outstanding balance", prev))
    if discount:
        lines.append(Line("discount", "Discount", -discount))

    return BillCalculation(units, c_lines, consumption, fixed, additional, tax_rate, tax, late_fee, discount, prev, total, lines)


def tariff_snapshot(tariff) -> dict:
    """Freeze the tariff rates onto a bill so later tariff edits never change issued invoices."""
    return {
        "tariff_id": tariff.id,
        "code": tariff.code,
        "name": tariff.name,
        "customer_category": tariff.customer_category,
        "billing_method": tariff.billing_method,
        "flat_rate": str(tariff.flat_rate) if tariff.flat_rate is not None else None,
        "fixed_charge": str(tariff.fixed_charge),
        "tax_rate": str(tariff.tax_rate),
        "additional_charges": str(tariff.additional_charges),
        "additional_charges_label": tariff.additional_charges_label,
        "slabs": [
            {"from_unit": s.from_unit, "to_unit": s.to_unit, "rate": str(s.rate)} for s in tariff.slabs
        ],
        "effective_from": tariff.effective_from.isoformat(),
    }
