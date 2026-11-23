"""Demo data seeder.

Usage (from backend/):
    python -m seed.seed           # seed an empty database
    python -m seed.seed --reset   # DROP all tables, recreate and seed

All people, phone numbers and addresses below are fictional. Emails use example.com.
The data is created through the real services (readings -> bills -> payments) so every
figure is internally consistent: units = current - previous, bills follow the tariff,
unpaid balances carry forward with late fees, and payments update balances.
"""
from __future__ import annotations

import argparse
import random
import sys
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import func, select, update

from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
import app.models  # noqa: F401
from app.models import (AuditLog, Bill, Complaint, ComplaintUpdate, Customer, ElectricityConnection, Meter, MeterReading,
                        Notification, Payment, Role, TariffPlan, TariffSlab, User)
from app.services import billing_service as bs
from app.services import payment_service as ps
from app.services import reading_service as rs
from app.services.settings_service import ensure_defaults
from app.services.tariff_calc import money
from app.utils.codes import assign_code

RNG = random.Random(42)
TODAY = date.today()


def month_add(y: int, m: int, k: int) -> tuple[int, int]:
    t = y * 12 + (m - 1) + k
    return t // 12, t % 12 + 1


# Six complete months ending last month
LAST_Y, LAST_M = month_add(TODAY.year, TODAY.month, -1)
PERIODS = [f"{y:04d}-{m:02d}" for y, m in (month_add(LAST_Y, LAST_M, -i) for i in range(5, -1, -1))]

CUSTOMERS = [
    # name, type, city, state, pin, behaviour, load kW, tariff code
    ("Aarav Sharma", "residential", "Jaipur", "Rajasthan", "302017", "recent_unpaid", 3, "RES-STD"),
    ("Priya Verma", "residential", "Jaipur", "Rajasthan", "302015", "good", 4, "RES-STD"),
    ("Rohan Mehta", "residential", "Jaipur", "Rajasthan", "302020", "late", 5, "RES-STD"),
    ("Sneha Iyer", "residential", "Udaipur", "Rajasthan", "313001", "partial", 3, "RES-STD"),
    ("Vikram Singh", "residential", "Jodhpur", "Rajasthan", "342001", "defaulter", 6, "RES-STD"),
    ("Ananya Gupta", "residential", "Ajmer", "Rajasthan", "305001", "good", 2, "RES-LIFE"),
    ("Karan Malhotra", "residential", "Jaipur", "Rajasthan", "302004", "good", 5, "RES-STD"),
    ("Meera Nair", "residential", "Kota", "Rajasthan", "324005", "recent_unpaid", 3, "RES-STD"),
    ("Arjun Reddy", "residential", "Jaipur", "Rajasthan", "302021", "good", 7, "RES-STD"),
    ("Kavya Joshi", "residential", "Bikaner", "Rajasthan", "334001", "recent_partial", 2, "RES-LIFE"),
    ("Ishaan Kapoor", "residential", "Jaipur", "Rajasthan", "302018", "good", 4, "RES-STD"),
    ("Diya Agarwal", "residential", "Alwar", "Rajasthan", "301001", "late", 3, "RES-STD"),
    ("Aditya Rao", "residential", "Jaipur", "Rajasthan", "302012", "recent_unpaid", 5, "RES-STD"),
    ("Neha Choudhary", "residential", "Sikar", "Rajasthan", "332001", "good", 3, "RES-LIFE"),
    ("Sunrise Bakery & Cafe", "commercial", "Jaipur", "Rajasthan", "302001", "good", 12, "COM-STD"),
    ("Galaxy Electronics", "commercial", "Jodhpur", "Rajasthan", "342003", "partial", 18, "COM-STD"),
    ("Hotel Aravali Inn", "commercial", "Udaipur", "Rajasthan", "313004", "good", 35, "COM-FLAT"),
    ("City Care Clinic", "commercial", "Jaipur", "Rajasthan", "302016", "recent_unpaid", 15, "COM-STD"),
    ("Blue Lotus Boutique", "commercial", "Ajmer", "Rajasthan", "305004", "late", 8, "COM-FLAT"),
    ("Rathore Textiles Pvt Ltd", "industrial", "Bhilwara", "Rajasthan", "311001", "good", 95, "IND-LT"),
    ("Shree Cement Works (Demo)", "industrial", "Kota", "Rajasthan", "324007", "defaulter", 150, "IND-LT"),
    ("Marwar Agro Foods", "industrial", "Jodhpur", "Rajasthan", "342005", "recent_partial", 70, "IND-LT"),
]
NEW_CUSTOMERS = [  # joined recently: connection pending / no bills yet
    ("Rahul Bansal", "residential", "Jaipur", "Rajasthan", "302019", 4, "RES-STD", "pending"),
    ("Tanvi Saxena", "residential", "Kota", "Rajasthan", "324009", 3, "RES-LIFE", "active"),
]
STREETS = ["MG Road", "Station Road", "Civil Lines", "Malviya Nagar", "Vaishali Nagar", "Raja Park", "Shastri Nagar",
           "C-Scheme", "Mansarovar", "Tonk Road", "Sardarpura", "Fatehpura", "Industrial Area Phase II", "Ring Road"]
METHODS = ["upi", "debit_card", "credit_card", "net_banking", "cash", "upi", "upi"]


def last_id(db, model) -> int:
    return db.scalar(select(func.max(model.id))) or 0


def backdate(db, marks: dict, when: datetime) -> None:
    """Give rows created by the services a realistic timestamp instead of 'now'."""
    db.execute(update(Notification).where(Notification.id > marks["n"]).values(created_at=when))
    db.execute(update(AuditLog).where(AuditLog.id > marks["a"]).values(created_at=when))
    db.commit()


def marks_now(db) -> dict:
    return {"n": last_id(db, Notification), "a": last_id(db, AuditLog)}


def at(d: date, h=10, m=0) -> datetime:
    return datetime.combine(d, time(h, m))


def create_base(db):
    roles = {}
    for name, desc in [("admin", "Full system access"), ("staff", "Operations staff"), ("customer", "Electricity consumer")]:
        r = Role(name=name, description=desc)
        db.add(r)
        roles[name] = r
    db.flush()
    admin = User(email="admin@electricity.com", full_name="System Administrator", phone="9000000001",
                 role_id=roles["admin"].id, password_hash=hash_password("Admin@123"))
    staff = User(email="staff@electricity.com", full_name="Ravi Kumar (Billing Staff)", phone="9000000002",
                 role_id=roles["staff"].id, password_hash=hash_password("Staff@123"))
    field = User(email="field.officer@example.com", full_name="Pooja Yadav (Field Officer)", phone="9000000003",
                 role_id=roles["staff"].id, password_hash=hash_password("Staff@123"))
    db.add_all([admin, staff, field])
    ensure_defaults(db)
    db.commit()
    return roles, admin, staff, field


def create_tariffs(db) -> dict[str, TariffPlan]:
    eff = date(TODAY.year - 1, 4, 1)
    specs = [
        ("RES-STD", "Residential Standard (LT-1)", "residential", "slab", None, "50", "5", "0", None,
         [(0, 100, "4"), (100, 200, "6"), (200, 300, "7"), (300, None, "8")], "active", None,
         "Progressive slab tariff for domestic consumers."),
        ("RES-LIFE", "Residential Lifeline (Low Usage)", "residential", "slab", None, "20", "0", "0", None,
         [(0, 50, "2.50"), (50, 150, "4.50"), (150, None, "6.50")], "active", None,
         "Subsidised slabs for small households."),
        ("RES-2024", "Residential Standard 2024 (old)", "residential", "slab", None, "40", "5", "0", None,
         [(0, 100, "3.75"), (100, 300, "5.75"), (300, None, "7.50")], "inactive", date(TODAY.year - 1, 3, 31),
         "Superseded by RES-STD. Kept for history."),
        ("COM-STD", "Commercial Standard (LT-2)", "commercial", "slab", None, "250", "8", "100", "Meter rent",
         [(0, 200, "7.50"), (200, 500, "8.50"), (500, None, "9.50")], "active", None, "Shops, offices and clinics."),
        ("COM-FLAT", "Commercial Flat Rate", "commercial", "flat", "8.25", "300", "8", "0", None, [], "active", None,
         "Single per-unit rate for hotels and large commercial users."),
        ("IND-LT", "Industrial Low Tension (LT-5)", "industrial", "slab", None, "1500", "10", "500", "Power factor surcharge",
         [(0, 1000, "7"), (1000, 5000, "7.75"), (5000, None, "8.50")], "active", None, "Small and medium industries."),
    ]
    out = {}
    for code, name, cat, method, flat, fixed, tax, add, add_label, slabs, status, eff_to, desc in specs:
        t = TariffPlan(code=code, name=name, customer_category=cat, billing_method=method,
                       flat_rate=Decimal(flat) if flat else None, fixed_charge=Decimal(fixed), tax_rate=Decimal(tax),
                       additional_charges=Decimal(add), additional_charges_label=add_label,
                       effective_from=eff if status == "active" else date(TODAY.year - 3, 4, 1), effective_to=eff_to,
                       status=status, description=desc)
        for a, b, r in slabs:
            t.slabs.append(TariffSlab(from_unit=a, to_unit=b, rate=Decimal(r)))
        db.add(t)
        out[code] = t
    db.commit()
    return out


def create_customer(db, roles, idx, name, ctype, city, state, pin, load, tariff, created: date, login_email=None,
                    conn_status="active"):
    slug = "".join(ch for ch in name.lower() if ch.isalnum())[:14]
    email = login_email or f"{slug}@example.com"
    phone = f"9{RNG.randint(100000000, 999999999)}"
    c = Customer(full_name=name, email=email, phone=phone, address=f"{RNG.randint(1, 250)}, {RNG.choice(STREETS)}",
                 city=city, state=state, postal_code=pin, customer_type=ctype, status="active")
    if login_email:
        u = User(email=login_email, full_name=name, phone=phone, role_id=roles["customer"].id,
                 password_hash=hash_password("Customer@123"))
        db.add(u)
        db.flush()
        c.user_id = u.id
    assign_code(db, c, "customer_code", "CUST")
    c.created_at = at(created, 11)
    initial = Decimal(RNG.randint(1000, 20000)) if ctype != "industrial" else Decimal(RNG.randint(50000, 400000))
    meter = Meter(meter_number=f"MTR{ {'residential': 'R', 'commercial': 'C', 'industrial': 'I'}[ctype] }{100000 + idx * 7:06d}".replace(" ", ""),
                  manufacturer=RNG.choice(["Secure Meters", "L&T", "Genus Power", "HPL Electric"]),
                  initial_reading=initial, installed_on=created, status="working")
    db.add(meter)
    db.flush()
    conn = ElectricityConnection(customer_id=c.id, meter_id=meter.id, tariff_plan_id=tariff.id, connection_type=ctype,
                                 sanctioned_load_kw=Decimal(load), installation_date=created, status=conn_status,
                                 address=f"{c.address}, {city}, {state} {pin}")
    assign_code(db, conn, "connection_code", "CON")
    conn.created_at = at(created, 12)
    db.commit()
    return c, conn


def units_for(ctype: str, period: str) -> int:
    month = int(period[5:])
    season = 1.35 if month in (4, 5, 6) else 1.15 if month in (7, 8, 9) else 0.9 if month in (12, 1, 2) else 1.0
    lo, hi = {"residential": (70, 360), "commercial": (300, 1400), "industrial": (2600, 8500)}[ctype]
    return int(RNG.randint(lo, hi) * season)


def pay(db, bill: Bill, amount, when: datetime, method: str, user_id: int):
    m = marks_now(db)
    p = ps.record_payment(db, bill_id=bill.id, amount=amount, method=method, user_id=user_id, payment_date=when,
                          remarks="Online payment (demo)" if method != "cash" else "Paid at collection centre")
    p.created_at = when
    db.commit()
    backdate(db, m, when)
    return p


def run(reset: bool) -> None:
    if reset:
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.scalar(select(func.count(User.id))):
            print("Database already has data. Use --reset to wipe and reseed.")
            return
        roles, admin, staff, field = create_base(db)
        tariffs = create_tariffs(db)

        # ---- customers & connections ----
        first = PERIODS[0]
        join_start = date(TODAY.year - 1, 6, 1)
        join_end = date(int(first[:4]), int(first[5:]), 1) - timedelta(days=10)
        span = (join_end - join_start).days
        entries = []
        for i, (name, ctype, city, state, pin, beh, load, tcode) in enumerate(CUSTOMERS, start=1):
            created = join_start + timedelta(days=int(span * (i - 1) / len(CUSTOMERS)))
            login = "customer@electricity.com" if i == 1 else None
            c, conn = create_customer(db, roles, i, name, ctype, city, state, pin, load, tariffs[tcode], created, login)
            entries.append((c, conn, beh, i))
        for j, (name, ctype, city, state, pin, load, tcode, cstatus) in enumerate(NEW_CUSTOMERS, start=len(CUSTOMERS) + 1):
            created = TODAY - timedelta(days=12 if cstatus == "pending" else 25)
            create_customer(db, roles, j, name, ctype, city, state, pin, load, tariffs[tcode], created, None, cstatus)

        # A second connection for one commercial customer (customers can have several connections)
        bakery = entries[14][0]
        m2 = Meter(meter_number="MTRC900001", manufacturer="Genus Power", initial_reading=Decimal(5400),
                   installed_on=bakery.created_at.date(), status="working")
        db.add(m2)
        db.flush()
        c2 = ElectricityConnection(customer_id=bakery.id, meter_id=m2.id, tariff_plan_id=tariffs["COM-STD"].id,
                                   connection_type="commercial", sanctioned_load_kw=Decimal(6),
                                   installation_date=bakery.created_at.date(), status="active",
                                   address=f"Shop 2, {bakery.address}, {bakery.city}")
        assign_code(db, c2, "connection_code", "CON")
        db.commit()
        entries.append((bakery, c2, "good", 99))

        # ---- six months: readings -> bills -> payments, in time order ----
        for pi, period in enumerate(PERIODS):
            py, pm = int(period[:4]), int(period[5:])
            start, end = bs.period_bounds(period)
            ny, nm = month_add(py, pm, 1)
            is_last = pi == len(PERIODS) - 1
            for c, conn, beh, idx in entries:
                db.refresh(conn)
                # readings
                m = marks_now(db)
                prev = rs.previous_value(db, conn, period)
                reading = rs.create_reading(db, connection_id=conn.id, billing_period=period,
                                            current_reading=prev + units_for(conn.connection_type, period),
                                            reading_date=min(end, TODAY), reading_type="manual" if pi % 3 else "simulated",
                                            user_id=(staff if idx % 2 else field).id,
                                            remarks="Regular monthly reading" if pi % 3 else "Simulated reading (demo)")
                reading.created_at = at(min(end, TODAY), 16)
                db.commit()
                backdate(db, m, at(min(end, TODAY), 16))

                # billing cycle: group A billed on the 2nd, group B on the 12th of the next month
                issue = date(ny, nm, 2 if idx % 2 else 12)
                if issue > TODAY:
                    issue = TODAY
                m = marks_now(db)
                if is_last and idx == 7:
                    # leave one draft bill for the demo (edit -> issue workflow)
                    bill = bs.generate_bill(db, user_id=staff.id, reading_id=reading.id, as_draft=True, issue_date=issue)
                    bill.created_at = at(issue, 9)
                    db.commit()
                    backdate(db, m, at(issue, 9))
                    continue
                if pi == 2 and idx == 3:
                    # a bill cancelled because of a wrong reading, then regenerated
                    wrong = bs.generate_bill(db, user_id=staff.id, reading_id=reading.id, issue_date=issue)
                    bs.cancel_bill(db, wrong, user_id=admin.id, reason="Meter reading keyed in wrongly; re-verified on site")
                    reading = rs.update_reading(db, reading, user_id=staff.id,
                                                current_reading=reading.current_reading - 15,
                                                reason="Corrected after site re-verification")
                bill = bs.generate_bill(db, user_id=staff.id, reading_id=reading.id, issue_date=issue)
                bill.created_at = at(issue, 9)
                db.commit()
                backdate(db, m, at(issue, 9))

                # payments
                due = bill.due_date
                method = METHODS[(idx + pi) % len(METHODS)]
                total = bill.balance_due
                pay_day = issue + timedelta(days=RNG.randint(2, 11))

                def can(d: date) -> bool:
                    return d <= TODAY

                if beh == "good":
                    if can(pay_day):
                        pay(db, bill, total, at(pay_day, RNG.randint(9, 20)), method, staff.id if method == "cash" else None)
                elif beh == "late":
                    d = due + timedelta(days=3)
                    if can(d) and not is_last:
                        pay(db, bill, total, at(d, 18), method, None)
                elif beh == "partial":
                    if can(pay_day):
                        part = money(Decimal(int(total * Decimal("0.6") / 10) * 10))
                        if part > 0:
                            pay(db, bill, part, at(pay_day, 13), method, None)
                elif beh == "defaulter":
                    if pi < len(PERIODS) - 3 and can(pay_day):
                        pay(db, bill, total, at(pay_day, 12), method, None)
                elif beh == "recent_unpaid":
                    if not is_last and can(pay_day):
                        pay(db, bill, total, at(pay_day, 15), method, None)
                elif beh == "recent_partial":
                    if can(pay_day):
                        amt = total if not is_last else money(Decimal(int(total / 2 / 10) * 10))
                        if amt > 0:
                            pay(db, bill, amt, at(pay_day, 11), method, None)

        # one failed demo payment attempt for the demo customer
        demo_c = entries[0][0]
        open_bill = db.scalar(select(Bill).where(Bill.customer_id == demo_c.id, Bill.status.in_(("pending", "generated", "overdue")))
                              .order_by(Bill.id.desc()))
        if open_bill:
            m = marks_now(db)
            ps.record_payment(db, bill_id=open_bill.id, amount=open_bill.balance_due, method="credit_card",
                              user_id=demo_c.user_id, outcome="failed", remarks="Demo Payment Mode - simulated card decline")
            backdate(db, m, datetime.now() - timedelta(hours=5))

        bs.mark_overdue_bills(db)
        seed_complaints(db, entries, staff, field, admin)
        db.commit()
        summary(db)
    finally:
        db.close()


def seed_complaints(db, entries, staff, field, admin):
    data = [
        (0, "incorrect_bill", "Bill amount higher than usual",
         "My latest bill seems much higher than my normal usage. Please verify the meter reading.", "medium",
         ["under_review", "assigned", "in_progress"], None),
        (2, "power_supply", "Frequent power cuts in the evening",
         "There have been power cuts almost every evening between 7 and 9 pm for the last week.", "high",
         ["assigned", "in_progress", "resolved"], "Faulty feeder fuse replaced at the local transformer."),
        (4, "meter_issue", "Meter display not working",
         "The digital display on my meter has gone blank since Sunday.", "high", ["assigned"], None),
        (14, "payment_issue", "Payment deducted but bill shows unpaid",
         "I paid via UPI but the bill still shows as pending on the portal.", "critical",
         ["under_review", "resolved", "closed"], "Payment was reconciled with the transaction id; bill updated."),
        (16, "connection_issue", "Request to increase sanctioned load",
         "We are adding air conditioners and need the sanctioned load increased from 35 kW to 45 kW.", "low", [], None),
        (19, "other", "Need duplicate copy of last 6 bills",
         "Please share duplicate copies of the last six invoices for our auditors.", "low",
         ["in_progress", "resolved"], "Customer guided to download all invoices from the portal."),
        (8, "meter_issue", "Meter making buzzing noise", "The meter box makes a loud buzzing noise at night.", "medium",
         ["under_review"], None),
        (0, "power_supply", "Voltage fluctuation", "Lights flicker and voltage drops frequently in the afternoon.",
         "medium", [], None),
    ]
    for k, (ei, cat, subj, desc, prio, flow, resolution) in enumerate(data):
        c, conn, _, _ = entries[ei]
        created = datetime.now() - timedelta(days=26 - k * 3, hours=k)
        comp = Complaint(customer_id=c.id, connection_id=conn.id, category=cat, subject=subj, description=desc,
                         priority=prio, status="submitted")
        assign_code(db, comp, "complaint_code", "CMP")
        comp.created_at = created
        comp.updates.append(ComplaintUpdate(status="submitted", note="Complaint submitted", updated_by=c.user_id,
                                            created_at=created))
        t = created
        for st in flow:
            t = t + timedelta(hours=RNG.randint(5, 40))
            who = admin if st == "under_review" else (field if cat in ("meter_issue", "power_supply") else staff)
            if st == "assigned":
                comp.assigned_to = who.id
            note = {"under_review": "Complaint reviewed by the support desk", "assigned": f"Assigned to {who.full_name}",
                    "in_progress": "Technician visit scheduled", "resolved": resolution, "closed": "Closed after customer confirmation"}[st]
            comp.updates.append(ComplaintUpdate(status=st, note=note, updated_by=who.id, created_at=t))
            comp.status = st
            if st in ("resolved", "closed"):
                comp.resolution_notes = resolution
                comp.resolved_at = comp.resolved_at or t
            if c.user_id:
                db.add(Notification(user_id=c.user_id, type="complaint_status", title="Complaint status updated",
                                    message=f"Your complaint {comp.complaint_code} is now '{st.replace('_', ' ')}'.",
                                    link=f"/portal/complaints/{comp.id}", created_at=t))
        if comp.status in ("in_progress", "resolved", "closed") and not comp.assigned_to:
            comp.assigned_to = staff.id
        comp.updated_at = t
        for u in (admin, staff):
            db.add(Notification(user_id=u.id, type="complaint_new", title="New complaint",
                                message=f"{comp.complaint_code} from {c.full_name}: {subj}", link=f"/app/complaints/{comp.id}",
                                created_at=created, is_read=comp.status != "submitted"))
    db.commit()


def summary(db):
    counts = {
        "customers": db.scalar(select(func.count(Customer.id))),
        "connections": db.scalar(select(func.count(ElectricityConnection.id))),
        "readings": db.scalar(select(func.count(MeterReading.id))),
        "bills": db.scalar(select(func.count(Bill.id))),
        "payments": db.scalar(select(func.count(Payment.id))),
        "complaints": db.scalar(select(func.count(Complaint.id))),
        "notifications": db.scalar(select(func.count(Notification.id))),
    }
    statuses = dict(db.execute(select(Bill.status, func.count(Bill.id)).group_by(Bill.status)).all())
    print("Seed complete:", counts)
    print("Bill statuses:", statuses)
    print("Periods:", PERIODS[0], "to", PERIODS[-1])
    print("Logins: admin@electricity.com / Admin@123 | staff@electricity.com / Staff@123 | customer@electricity.com / Customer@123")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true", help="drop and recreate all tables first")
    run(ap.parse_args().reset)
    sys.exit(0)
