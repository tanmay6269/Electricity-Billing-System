from tests.conftest import add_reading, past_period


def test_staff_cannot_manage_staff_accounts(client, staff_h):
    r = client.post("/api/users", headers=staff_h, json={"full_name": "Evil Admin", "email": "x@example.com",
                                                         "role": "admin", "password": "Strong@123"})
    assert r.status_code == 403
    assert client.get("/api/users", headers=staff_h).status_code == 403


def test_staff_cannot_view_audit_logs_or_change_settings(client, staff_h):
    assert client.get("/api/audit-logs", headers=staff_h).status_code == 403
    assert client.put("/api/settings", headers=staff_h, json={"values": {"bill_due_days": "5"}}).status_code == 403


def test_staff_cannot_change_tariffs_by_default(client, staff_h):
    r = client.put("/api/tariffs/1/status", headers=staff_h, json={"status": "inactive"})
    assert r.status_code == 403


def test_admin_can_allow_staff_tariffs(client, admin_h, staff_h):
    client.put("/api/settings", headers=admin_h, json={"values": {"staff_can_manage_tariffs": "true"}})
    t = client.get("/api/tariffs/1", headers=staff_h).json()
    body = {k: t[k] for k in ("code", "name", "customer_category", "billing_method", "flat_rate", "fixed_charge",
                              "tax_rate", "additional_charges", "additional_charges_label", "effective_from",
                              "effective_to", "status", "description")}
    body["slabs"] = [{"from_unit": s["from_unit"], "to_unit": s["to_unit"], "rate": s["rate"]} for s in t["slabs"]]
    body["fixed_charge"] = 60
    assert client.put("/api/tariffs/1", headers=staff_h, json=body).status_code == 200


def test_customer_cannot_use_staff_endpoints(client, customer_h):
    assert client.get("/api/customers", headers=customer_h).status_code == 403
    assert client.post("/api/billing/generate-monthly", headers=customer_h, json={"billing_period": "2026-01"}).status_code == 403
    assert client.get("/api/analytics/dashboard", headers=customer_h).status_code == 403


def test_customer_cannot_read_other_customers_data(client, staff_h, customer_h, other_h):
    period = past_period(1)
    assert add_reading(client, staff_h, 2, period, 12600).status_code == 201
    bill = client.post("/api/billing/generate", headers=staff_h, json={"connection_id": 2, "billing_period": period}).json()
    # customer 1 tries to open customer 2's bill / pdf / profile / connection
    assert client.get(f"/api/bills/{bill['id']}", headers=customer_h).status_code == 404
    assert client.get(f"/api/bills/{bill['id']}/pdf", headers=customer_h).status_code == 404
    assert client.get("/api/customers/2/profile", headers=customer_h).status_code == 404
    assert client.get("/api/connections/2", headers=customer_h).status_code == 404
    pay = client.post("/api/payments/demo", headers=customer_h, json={"bill_id": bill["id"], "amount": 10, "method": "upi"})
    assert pay.status_code == 404
    # the owner can
    assert client.get(f"/api/bills/{bill['id']}", headers=other_h).status_code == 200
    # list endpoints are scoped
    assert client.get("/api/bills", headers=customer_h).json()["total"] == 0
    assert client.get("/api/bills", headers=other_h).json()["total"] == 1
