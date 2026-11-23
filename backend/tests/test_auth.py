from app.models import User


def test_login_success_and_me(client):
    r = client.post("/api/auth/login", json={"email": "admin@electricity.com", "password": "Admin@123"})
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["role"] == "admin"
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200 and me.json()["email"] == "admin@electricity.com"


def test_login_wrong_password(client):
    r = client.post("/api/auth/login", json={"email": "admin@electricity.com", "password": "nope"})
    assert r.status_code == 401
    assert "Invalid" in r.json()["detail"]


def test_password_is_hashed(db):
    u = db.query(User).filter_by(email="admin@electricity.com").one()
    assert u.password_hash != "Admin@123" and u.password_hash.startswith("$2")


def test_protected_route_requires_token(client):
    assert client.get("/api/customers").status_code == 401
    assert client.get("/api/customers", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_logout_invalidates_token(client, admin_h):
    assert client.post("/api/auth/logout", headers=admin_h).status_code == 200
    assert client.get("/api/auth/me", headers=admin_h).status_code == 401


def test_login_rate_limit(client):
    for _ in range(5):
        client.post("/api/auth/login", json={"email": "staff@electricity.com", "password": "bad"})
    r = client.post("/api/auth/login", json={"email": "staff@electricity.com", "password": "Staff@123"})
    assert r.status_code == 429


def test_deactivated_account_cannot_login(client, admin_h, db):
    staff = db.query(User).filter_by(email="staff@electricity.com").one()
    r = client.put(f"/api/users/{staff.id}", headers=admin_h, json={"is_active": False})
    assert r.status_code == 200
    r = client.post("/api/auth/login", json={"email": "staff@electricity.com", "password": "Staff@123"})
    assert r.status_code == 403


def test_forgot_and_reset_password_flow(client):
    r = client.post("/api/auth/forgot-password", json={"email": "staff@electricity.com"})
    assert r.status_code == 200
    token = r.json()["dev_reset_link"].split("token=")[1]
    weak = client.post("/api/auth/reset-password", json={"token": token, "new_password": "weak"})
    assert weak.status_code == 422
    ok = client.post("/api/auth/reset-password", json={"token": token, "new_password": "NewStaff@456"})
    assert ok.status_code == 200
    again = client.post("/api/auth/reset-password", json={"token": token, "new_password": "Other@4567"})
    assert again.status_code == 400  # token is single-use
    assert client.post("/api/auth/login", json={"email": "staff@electricity.com", "password": "NewStaff@456"}).status_code == 200


def test_forgot_password_unknown_email_is_generic(client):
    r = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    assert r.status_code == 200 and "dev_reset_link" not in r.json()


def test_change_password(client, staff_h):
    r = client.post("/api/auth/change-password", headers=staff_h,
                    json={"current_password": "Staff@123", "new_password": "Changed@789"})
    assert r.status_code == 200
    assert client.get("/api/auth/me", headers=staff_h).status_code == 401  # old token revoked
