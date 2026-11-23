from tests.conftest import add_reading, past_period


def test_units_calculated_from_previous_reading(client, staff_h):
    r = add_reading(client, staff_h, 1, past_period(1), 12610)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["previous_reading"] == 12450 and body["units_consumed"] == 160


def test_current_lower_than_previous_rejected(client, staff_h):
    r = add_reading(client, staff_h, 1, past_period(1), 12000)
    assert r.status_code == 400 and "lower" in r.json()["detail"]


def test_duplicate_period_rejected(client, staff_h):
    assert add_reading(client, staff_h, 1, past_period(1), 12600).status_code == 201
    assert add_reading(client, staff_h, 1, past_period(1), 12700).status_code == 409


def test_readings_chain_previous_value(client, staff_h):
    add_reading(client, staff_h, 1, past_period(2), 12550)
    r = add_reading(client, staff_h, 1, past_period(1), 12700)
    assert r.json()["previous_reading"] == 12550 and r.json()["units_consumed"] == 150


def test_edit_requires_reason_and_is_audited(client, staff_h, admin_h):
    rid = add_reading(client, staff_h, 1, past_period(1), 12600).json()["id"]
    assert client.put(f"/api/readings/{rid}", headers=staff_h, json={"current_reading": 12620}).status_code == 422
    r = client.put(f"/api/readings/{rid}", headers=staff_h, json={"current_reading": 12620, "reason": "Typo corrected"})
    assert r.status_code == 200 and r.json()["units_consumed"] == 170
    detail = client.get(f"/api/readings/{rid}", headers=staff_h).json()
    assert any(h["action"] == "reading.update" for h in detail["history"])
    logs = client.get("/api/audit-logs", headers=admin_h, params={"entity_type": "meter_reading"}).json()
    assert logs["total"] >= 2


def test_billed_reading_cannot_be_edited(client, staff_h):
    period = past_period(1)
    rid = add_reading(client, staff_h, 1, period, 12600).json()["id"]
    client.post("/api/billing/generate", headers=staff_h, json={"reading_id": rid})
    r = client.put(f"/api/readings/{rid}", headers=staff_h, json={"current_reading": 12650, "reason": "Late change"})
    assert r.status_code == 400


def test_simulated_readings(client, staff_h):
    r = client.post("/api/readings/simulate", headers=staff_h, json={"billing_period": past_period(1)})
    assert r.status_code == 200 and len(r.json()["created"]) == 2


def test_csv_import(client, staff_h):
    csv_text = f"connection_id,billing_period,current_reading,reading_date\nCON-00001,{past_period(1)},12700,{past_period(1)}-20\nCON-99999,{past_period(1)},1,{past_period(1)}-20\n"
    r = client.post("/api/readings/import", headers=staff_h, files={"file": ("r.csv", csv_text, "text/csv")})
    assert r.status_code == 200
    assert len(r.json()["created"]) == 1 and len(r.json()["errors"]) == 1
