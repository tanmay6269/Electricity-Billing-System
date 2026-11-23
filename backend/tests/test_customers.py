NEW = {"full_name": "Test Person", "email": "test.person@example.com", "phone": "9812345678", "address": "22 New Colony",
       "city": "Jaipur", "state": "Rajasthan", "postal_code": "302020", "customer_type": "commercial",
       "connection": {"meter_number": "MTR-NEW-1", "tariff_plan_id": 1, "sanctioned_load_kw": 10,
                      "installation_date": "2025-01-10", "initial_reading": 100}}


def test_customer_crud(client, staff_h):
    r = client.post("/api/customers", headers=staff_h, json=NEW)
    assert r.status_code == 201, r.text
    c = r.json()
    assert c["customer_code"].startswith("CUST-") and c["connection_code"].startswith("CON-")
    assert c["meter_number"] == "MTR-NEW-1"

    r = client.get("/api/customers", headers=staff_h, params={"search": "MTR-NEW"})
    assert r.json()["total"] == 1
    r = client.get("/api/customers", headers=staff_h, params={"customer_type": "commercial"})
    assert r.json()["total"] == 1

    r = client.put(f"/api/customers/{c['id']}", headers=staff_h, json={"city": "Kota"})
    assert r.status_code == 200 and r.json()["city"] == "Kota"

    assert client.get(f"/api/customers/{c['id']}/profile", headers=staff_h).status_code == 200
    assert client.delete(f"/api/customers/{c['id']}", headers=staff_h).status_code == 200
    assert client.get(f"/api/customers/{c['id']}", headers=staff_h).status_code == 404


def test_customer_validation(client, staff_h):
    bad = {**NEW, "phone": "12345", "email": "x2@example.com"}
    r = client.post("/api/customers", headers=staff_h, json=bad)
    assert r.status_code == 422 and "phone" in r.json()["detail"]


def test_duplicate_meter_rejected(client, staff_h):
    client.post("/api/customers", headers=staff_h, json=NEW)
    r = client.post("/api/customers", headers=staff_h, json={**NEW, "email": "another@example.com"})
    assert r.status_code == 409


def test_pagination_and_sorting(client, staff_h):
    r = client.get("/api/customers", headers=staff_h, params={"page_size": 1, "sort_by": "full_name", "sort_dir": "asc"})
    body = r.json()
    assert body["total"] == 2 and body["pages"] == 2 and len(body["items"]) == 1
    assert body["items"][0]["full_name"] == "Customer 1"


def test_customer_csv_export(client, staff_h):
    r = client.get("/api/customers/export", headers=staff_h)
    assert r.status_code == 200 and "text/csv" in r.headers["content-type"]
    assert "Customer ID" in r.text
