from decimal import Decimal

import pytest

from app.services.tariff_calc import TariffError, calculate_bill, consumption_lines, validate_slabs

SLAB = {
    "billing_method": "slab", "fixed_charge": "50", "tax_rate": "5", "additional_charges": "0",
    "slabs": [{"from_unit": 0, "to_unit": 100, "rate": "4"}, {"from_unit": 100, "to_unit": 200, "rate": "6"},
              {"from_unit": 200, "to_unit": 300, "rate": "7"}, {"from_unit": 300, "to_unit": None, "rate": "8"}],
}


def test_zero_consumption_only_fixed_and_tax():
    c = calculate_bill(0, SLAB)
    assert c.consumption_charge == Decimal("0.00")
    assert c.tax_amount == Decimal("2.50")  # 5% of fixed 50
    assert c.total_amount == Decimal("52.50")


def test_normal_consumption_single_slab():
    c = calculate_bill(80, SLAB)
    assert c.consumption_charge == Decimal("320.00")


def test_example_from_spec_160_units_two_slabs():
    # 100 x 4 + 60 x 6 = 760
    c = calculate_bill(160, SLAB)
    assert c.consumption_charge == Decimal("760.00")
    assert len(c.consumption_lines) == 2
    assert c.total_amount == Decimal("850.50")  # 760 + 50 fixed + 5% duty (40.50)


def test_multiple_slabs_progressive():
    c = calculate_bill(250, SLAB)  # 400 + 600 + 350
    assert c.consumption_charge == Decimal("1350.00")


def test_high_consumption_top_slab():
    c = calculate_bill(1000, SLAB)  # 400 + 600 + 700 + 700*8
    assert c.consumption_charge == Decimal("7300.00")


def test_slab_boundary_exact():
    assert calculate_bill(100, SLAB).consumption_charge == Decimal("400.00")
    assert calculate_bill(101, SLAB).consumption_charge == Decimal("406.00")


def test_fractional_units():
    assert calculate_bill(Decimal("100.5"), SLAB).consumption_charge == Decimal("403.00")


def test_previous_outstanding_late_fee_and_discount():
    c = calculate_bill(160, SLAB, previous_outstanding=200, late_fee=4, discount=50)
    assert c.total_amount == Decimal("850.50") + 200 + 4 - 50


def test_discount_cannot_exceed_charges():
    with pytest.raises(TariffError):
        calculate_bill(10, SLAB, discount=10_000)


def test_flat_rate_billing():
    flat = {"billing_method": "flat", "flat_rate": "8.25", "fixed_charge": "300", "tax_rate": "8", "additional_charges": "0"}
    c = calculate_bill(400, flat)
    assert c.consumption_charge == Decimal("3300.00")
    assert c.tax_amount == Decimal("288.00")


def test_negative_units_rejected():
    with pytest.raises(TariffError):
        consumption_lines(-5, SLAB)


@pytest.mark.parametrize("slabs", [
    [],
    [{"from_unit": 10, "to_unit": 100, "rate": 1}],
    [{"from_unit": 0, "to_unit": 100, "rate": 1}, {"from_unit": 150, "to_unit": None, "rate": 2}],
    [{"from_unit": 0, "to_unit": None, "rate": 1}, {"from_unit": 100, "to_unit": None, "rate": 2}],
    [{"from_unit": 0, "to_unit": 100, "rate": -1}],
])
def test_invalid_slab_configs(slabs):
    with pytest.raises(TariffError):
        validate_slabs(slabs)
