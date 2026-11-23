"""Test fixtures: an isolated SQLite database rebuilt for every test."""
import os
from datetime import date, timedelta
from decimal import Decimal

os.environ["DATABASE_URL"] = "sqlite:///./test_ebms.db"
os.environ["ENVIRONMENT"] = "test"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-pytest-only-0123456789"
os.environ["BCRYPT_ROUNDS"] = "4"
os.environ["EMAIL_ENABLED"] = "false"
os.environ["LOG_FILE"] = "logs/test.log"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.auth import forgot_limiter, login_limiter  # noqa: E402
from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Customer, ElectricityConnection, Meter, Role, TariffPlan, TariffSlab, User  # noqa: E402
from app.services.settings_service import ensure_defaults  # noqa: E402

PW = {"admin": "Admin@123", "staff": "Staff@123", "customer": "Customer@123"}


@pytest.fixture()
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    login_limiter.clear()
    forgot_limiter.clear()
    session = SessionLocal()
    seed_minimal(session)
    yield session
    session.close()


@pytest.fixture()
def client(db):
    with TestClient(app) as c:
        yield c


def seed_minimal(db):
    roles = {n: Role(name=n) for n in ("admin", "staff", "customer")}
    db.add_all(roles.values())
    db.flush()
    db.add_all([
        User(email="admin@electricity.com", full_name="Admin", role_id=roles["admin"].id, password_hash=hash_password(PW["admin"])),
        User(email="staff@electricity.com", full_name="Staff", role_id=roles["staff"].id, password_hash=hash_password(PW["staff"])),
    ])
    t = TariffPlan(code="RES-T", name="Residential Test", customer_category="residential", billing_method="slab",
                   fixed_charge=Decimal("50"), tax_rate=Decimal("5"), additional_charges=Decimal("0"),
                   effective_from=date(2020, 1, 1), status="active")
    for a, b, r in [(0, 100, "4"), (100, 200, "6"), (200, 300, "7"), (300, None, "8")]:
        t.slabs.append(TariffSlab(from_unit=a, to_unit=b, rate=Decimal(r)))
    db.add(t)
    ensure_defaults(db)
    db.flush()
    for i, email in enumerate(["customer@electricity.com", "other@example.com"], start=1):
        u = User(email=email, full_name=f"Customer {i}", role_id=roles["customer"].id, password_hash=hash_password(PW["customer"]))
        db.add(u)
        db.flush()
        c = Customer(customer_code=f"CUST-{i:05d}", user_id=u.id, full_name=f"Customer {i}", email=email, phone="9876543210",
                     address="1 Test Street", city="Jaipur", state="Rajasthan", postal_code="302001",
                     customer_type="residential", status="active")
        db.add(c)
        db.flush()
        m = Meter(meter_number=f"MTR-T{i}", initial_reading=Decimal("12450"), status="working")
        db.add(m)
        db.flush()
        db.add(ElectricityConnection(connection_code=f"CON-{i:05d}", customer_id=c.id, meter_id=m.id, tariff_plan_id=t.id,
                                     connection_type="residential", sanctioned_load_kw=Decimal("5"),
                                     installation_date=date(2024, 1, 1), status="active", address="1 Test Street"))
    db.commit()


def login(client, email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture()
def admin_h(client):
    return login(client, "admin@electricity.com", PW["admin"])


@pytest.fixture()
def staff_h(client):
    return login(client, "staff@electricity.com", PW["staff"])


@pytest.fixture()
def customer_h(client):
    return login(client, "customer@electricity.com", PW["customer"])


@pytest.fixture()
def other_h(client):
    return login(client, "other@example.com", PW["customer"])


def past_period(months_back: int = 1) -> str:
    d = date.today().replace(day=1)
    for _ in range(months_back):
        d = (d - timedelta(days=1)).replace(day=1)
    return f"{d.year:04d}-{d.month:02d}"


def add_reading(client, h, connection_id, period, current):
    y, m = int(period[:4]), int(period[5:])
    rd = min(date.today(), (date(y + (m // 12), m % 12 + 1, 1) - timedelta(days=1)))
    return client.post("/api/readings", headers=h, json={"connection_id": connection_id, "billing_period": period,
                                                          "current_reading": current, "reading_date": rd.isoformat()})
