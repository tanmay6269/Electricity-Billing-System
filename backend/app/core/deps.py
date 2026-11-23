"""Authentication & authorization dependencies. Permissions are enforced here, on the backend."""
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import Forbidden, NotFound, Unauthorized
from app.core.security import decode_access_token
from app.models import Customer, User

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)
) -> User:
    if not creds:
        raise Unauthorized("Not authenticated.")
    try:
        payload = decode_access_token(creds.credentials)
        user_id = int(payload["sub"])
    except Exception as exc:
        raise Unauthorized("Session expired or invalid. Please log in again.") from exc
    user = db.get(User, user_id)
    if not user or user.deleted_at or not user.is_active:
        raise Unauthorized("Account is not active.")
    if payload.get("tv") != user.token_version:
        raise Unauthorized("Session has ended. Please log in again.")
    return user


def require_roles(*roles: str):
    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role_name not in roles:
            raise Forbidden("You do not have permission to perform this action.")
        return user

    return checker


require_admin = require_roles("admin")
require_staff = require_roles("admin", "staff")
require_customer = require_roles("customer")


def get_customer_profile(db: Session, user: User) -> Customer:
    customer = db.scalar(select(Customer).where(Customer.user_id == user.id, Customer.deleted_at.is_(None)))
    if not customer:
        raise NotFound("No customer account is linked to this login.")
    return customer


def ensure_can_view_customer(db: Session, user: User, customer_id: int) -> None:
    """Customers may only see their own records - checked on every request, not just in the UI."""
    if user.role_name == "customer":
        own = get_customer_profile(db, user)
        if own.id != customer_id:
            raise NotFound("Record not found.")  # 404 rather than 403 so ids cannot be probed


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None
