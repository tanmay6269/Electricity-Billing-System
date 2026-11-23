from tests.conftest import add_reading, past_period


def _bill(client, h, conn, period, current, **extra):
    assert add_reading(client, h, conn, period, current).status_code == 201
    r = client.post("/api/billing/generate", headers=h, json={"connection_id": conn, "billing_period": period, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def test_preview_matches_generated_bill(client, staff_h):
    period = past_period(1)
    add_reading(client, staff_h, 1, period, 12610)  # 160 units
    p = client.post("/api/billing/preview", headers=staff_h, json={"connection_id": 1, "billing_period": period}).json()
    assert p["consumption_charge"] == 760 and p["total_amount"] == 850.5
    b = client.post("/api/billing/generate", headers=staff_h, json={"connection_id": 1, "billing_period": period}).json()
    assert b["total_amount"] == p["total_amount"] and b["status"] == "pending"
    assert sum(i["amount"] for i in b["items"]) == b["total_amount"]


def test_duplicate_billing_prevented(client, staff_h):
    period = past_period(1)
    _bill(client, staff_h, 1, period, 12610)
    r = client.post("/api/billing/generate", headers=staff_h, json={"connection_id": 1, "billing_period": period})
    assert r.status_code == 409


def test_cancel_then_regenerate(client, staff_h):
    period = past_period(1)
    b = _bill(client, staff_h, 1, period, 12610)
    assert client.post(f"/api/bills/{b['id']}/cancel", headers=staff_h, json={"reason": "no"}).status_code == 422
    assert client.post(f"/api/bills/{b['id']}/cancel", headers=staff_h, json={"reason": "Wrong reading"}).status_code == 200
    r = client.post("/api/billing/generate", headers=staff_h, json={"connection_id": 1, "billing_period": period})
    assert r.status_code == 201 and r.json()["invoice_number"] != b["invoice_number"]


def test_tariff_change_does_not_alter_issued_bill(client, staff_h, admin_h):
    b = _bill(client, staff_h, 1, past_period(1), 12610)
    t = client.get("/api/tariffs/1", headers=admin_h).json()
    body = {k: t[k] for k in ("code", "name", "customer_category", "billing_method", "flat_rate", "tax_rate",
                              "additional_charges", "additional_charges_label", "effective_from", "effective_to",
                              "status", "description")}
    body.update(fixed_charge=999, slabs=[{"from_unit": 0, "to_unit": None, "rate": 50}])
    assert client.put("/api/tariffs/1", headers=admin_h, json=body).status_code == 200
    again = client.get(f"/api/bills/{b['id']}", headers=staff_h).json()
    assert again["total_amount"] == b["total_amount"]
    assert again["tariff_snapshot"]["fixed_charge"] == "50.00"


def test_partial_then_full_payment(client, staff_h, customer_h):
    b = _bill(client, staff_h, 1, past_period(1), 12610)  # 850.50
    p1 = client.post("/api/payments/demo", headers=customer_h, json={"bill_id": b["id"], "amount": 500, "method": "upi"})
    assert p1.status_code == 201 and p1.json()["demo_mode"] is True
    bill = client.get(f"/api/bills/{b['id']}", headers=customer_h).json()
    assert bill["status"] == "partially_paid" and bill["balance_due"] == 350.5
    over = client.post("/api/payments/demo", headers=customer_h, json={"bill_id": b["id"], "amount": 400, "method": "upi"})
    assert over.status_code == 400
    p2 = client.post("/api/payments/demo", headers=customer_h, json={"bill_id": b["id"], "amount": 350.5, "method": "upi"})
    assert p2.status_code == 201
    bill = client.get(f"/api/bills/{b['id']}", headers=customer_h).json()
    assert bill["status"] == "paid" and bill["balance_due"] == 0
    receipt = client.get(f"/api/payments/{p2.json()['id']}/receipt", headers=customer_h)
    assert receipt.status_code == 200 and receipt.headers["content-type"] == "application/pdf"
    assert client.post("/api/payments/demo", headers=customer_h,
                       json={"bill_id": b["id"], "amount": 1, "method": "upi"}).status_code == 400


def test_failed_demo_payment_leaves_balance(client, staff_h, customer_h):
    b = _bill(client, staff_h, 1, past_period(1), 12610)
    r = client.post("/api/payments/demo", headers=customer_h,
                    json={"bill_id": b["id"], "amount": 100, "method": "credit_card", "simulate": "failure"})
    assert r.status_code == 201 and r.json()["status"] == "failed"
    assert client.get(f"/api/bills/{b['id']}", headers=customer_h).json()["balance_due"] == 850.5


def test_outstanding_carried_forward(client, staff_h):
    b1 = _bill(client, staff_h, 1, past_period(2), 12610)  # 850.50 unpaid
    client.post("/api/payments", headers=staff_h, json={"bill_id": b1["id"], "amount": 350.5, "method": "cash"})
    b2 = _bill(client, staff_h, 1, past_period(1), 12690)  # 80 units -> 320 + 50 + 18.5 = 388.50
    assert b2["previous_outstanding"] == 500
    assert b2["total_amount"] == round(388.5 + 500 + b2["late_fee"], 2)
    old = client.get(f"/api/bills/{b1['id']}", headers=staff_h).json()
    assert old["carried_forward_to_id"] == b2["id"]
    # paying the old bill is redirected to the new one
    r = client.post("/api/payments", headers=staff_h, json={"bill_id": b1["id"], "amount": 10, "method": "cash"})
    assert r.status_code == 400
    # paying the new bill in full settles the old one too
    client.post(f"/api/payments/mark-paid/{b2['id']}", headers=staff_h, json={"method": "cash"})
    assert client.get(f"/api/bills/{b1['id']}", headers=staff_h).json()["status"] == "paid"
    profile = client.get("/api/customers/1/profile", headers=staff_h).json()
    assert profile["outstanding_balance"] == 0


def test_zero_consumption_bill(client, staff_h):
    b = _bill(client, staff_h, 1, past_period(1), 12450)
    assert b["units_consumed"] == 0 and b["total_amount"] == 52.5


def test_draft_edit_and_issue(client, staff_h):
    period = past_period(1)
    add_reading(client, staff_h, 1, period, 12610)
    d = client.post("/api/billing/generate", headers=staff_h,
                    json={"connection_id": 1, "billing_period": period, "as_draft": True}).json()
    assert d["status"] == "draft"
    e = client.put(f"/api/bills/{d['id']}", headers=staff_h, json={"discount": 50}).json()
    assert e["total_amount"] == 800.5
    i = client.post(f"/api/bills/{d['id']}/issue", headers=staff_h).json()
    assert i["status"] == "pending" and i["total_amount"] == 800.5


def test_monthly_generation_and_pdf(client, staff_h):
    period = past_period(1)
    add_reading(client, staff_h, 1, period, 12610)
    add_reading(client, staff_h, 2, period, 12700)
    r = client.post("/api/billing/generate-monthly", headers=staff_h, json={"billing_period": period}).json()
    assert len(r["created"]) == 2
    r2 = client.post("/api/billing/generate-monthly", headers=staff_h, json={"billing_period": period}).json()
    assert len(r2["created"]) == 0 and len(r2["skipped"]) == 2
    bills = client.get("/api/bills", headers=staff_h).json()["items"]
    pdf = client.get(f"/api/bills/{bills[0]['id']}/pdf", headers=staff_h)
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"


def test_reports_and_dashboard(client, staff_h):
    _bill(client, staff_h, 1, past_period(1), 12610)
    assert client.get("/api/analytics/dashboard", headers=staff_h).status_code == 200
    for key in ("revenue", "annual-revenue", "customers", "consumption", "pending", "overdue", "payments", "tariffs",
                "complaints", "categories"):
        r = client.get(f"/api/reports/{key}", headers=staff_h)
        assert r.status_code == 200, key
    assert client.get("/api/reports/pending", headers=staff_h, params={"format": "pdf"}).content[:4] == b"%PDF"
    assert "text/csv" in client.get("/api/reports/pending", headers=staff_h, params={"format": "csv"}).headers["content-type"]


def test_complaint_workflow(client, customer_h, staff_h):
    c = client.post("/api/complaints", headers=customer_h, json={"category": "meter_issue", "subject": "Meter blank",
                                                                  "description": "Display is blank since morning"}).json()
    assert c["status"] == "submitted"
    staff_id = client.get("/api/users/assignable", headers=staff_h).json()[0]["id"]
    client.put(f"/api/complaints/{c['id']}/assign", headers=staff_h, json={"assigned_to": staff_id})
    bad = client.put(f"/api/complaints/{c['id']}/status", headers=staff_h, json={"status": "resolved"})
    assert bad.status_code == 400  # needs resolution notes
    ok = client.put(f"/api/complaints/{c['id']}/status", headers=staff_h,
                    json={"status": "resolved", "resolution_notes": "Meter replaced"})
    assert ok.status_code == 200 and len(ok.json()["timeline"]) == 3
    notes = client.get("/api/notifications", headers=customer_h).json()
    assert any(n["type"] == "complaint_status" for n in notes["items"])
    assert client.get("/api/notifications/unread-count", headers=customer_h).json()["count"] >= 1
    client.put("/api/notifications/read-all", headers=customer_h)
    assert client.get("/api/notifications/unread-count", headers=customer_h).json()["count"] == 0
