from datetime import timedelta

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import client_ip, get_current_user
from app.core.exceptions import BadRequest, Forbidden, Unauthorized
from app.core.security import create_access_token, hash_password, hash_token, new_reset_token, verify_password
from app.middleware.rate_limit import RateLimiter
from app.models import Customer, User
from app.models.base import utcnow
from app.schemas.auth import ChangePasswordIn, ForgotPasswordIn, LoginIn, ResetPasswordIn, user_out
from app.services.audit import log_action
from app.services.email import send_email

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
login_limiter = RateLimiter(settings.LOGIN_RATE_LIMIT, settings.LOGIN_RATE_WINDOW_SECONDS)
forgot_limiter = RateLimiter(5, 900)

# Constant-time-ish defence: verify against a dummy hash when the user does not exist.
_DUMMY_HASH = hash_password("Dummy@Password1")


def _me(db: Session, user: User) -> dict:
    data = user_out(user)
    if user.role_name == "customer":
        c = db.scalar(select(Customer).where(Customer.user_id == user.id))
        data["customer_id"] = c.id if c else None
        data["customer_code"] = c.customer_code if c else None
    return data


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    ip = client_ip(request) or "unknown"
    key = f"{ip}:{body.email.lower()}"
    login_limiter.hit(key)
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower(), User.deleted_at.is_(None)))
    valid = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not valid:
        raise Unauthorized("Invalid email or password.")
    if not user.is_active:
        raise Forbidden("This account has been deactivated. Contact the administrator.")
    login_limiter.reset(key)
    user.last_login_at = utcnow()
    log_action(db, user_id=user.id, action="auth.login", entity_type="user", entity_id=user.id, ip=ip)
    db.commit()
    token, expires_in = create_access_token(user.id, user.role_name, user.token_version)
    return {"access_token": token, "token_type": "bearer", "expires_in": expires_in, "user": _me(db, user)}


@router.post("/logout")
def logout(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Bumping the token version invalidates every token issued to this user.
    user.token_version += 1
    log_action(db, user_id=user.id, action="auth.logout", entity_type="user", entity_id=user.id, ip=client_ip(request))
    db.commit()
    return {"message": "Logged out."}


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _me(db, user)


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordIn, request: Request, db: Session = Depends(get_db)):
    forgot_limiter.hit(client_ip(request) or "unknown")
    generic = {"message": "If an account exists for this email, a password reset link has been sent."}
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower(), User.deleted_at.is_(None)))
    if not user or not user.is_active:
        return generic
    raw, hashed = new_reset_token()
    user.reset_token_hash = hashed
    user.reset_token_expires_at = utcnow() + timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES)
    link = f"{settings.FRONTEND_URL}/reset-password?token={raw}"
    send_email(user.email, "Reset your password",
               f"Use this link within {settings.RESET_TOKEN_EXPIRE_MINUTES} minutes to reset your password:\n{link}")
    log_action(db, user_id=user.id, action="auth.forgot_password", entity_type="user", entity_id=user.id,
               ip=client_ip(request))
    db.commit()
    if settings.DEV_SHOW_RESET_LINK and not settings.is_production:
        return {**generic, "dev_reset_link": link}
    return generic


@router.post("/reset-password")
def reset_password(body: ResetPasswordIn, request: Request, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.reset_token_hash == hash_token(body.token)))
    if not user or not user.reset_token_expires_at or user.reset_token_expires_at < utcnow():
        raise BadRequest("This reset link is invalid or has expired. Request a new one.")
    user.password_hash = hash_password(body.new_password)
    user.reset_token_hash = None
    user.reset_token_expires_at = None
    user.token_version += 1
    log_action(db, user_id=user.id, action="auth.reset_password", entity_type="user", entity_id=user.id,
               ip=client_ip(request))
    db.commit()
    return {"message": "Password updated. You can now log in."}


@router.post("/change-password")
def change_password(body: ChangePasswordIn, request: Request, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise BadRequest("Current password is incorrect.")
    if body.current_password == body.new_password:
        raise BadRequest("New password must be different from the current one.")
    user.password_hash = hash_password(body.new_password)
    user.token_version += 1
    log_action(db, user_id=user.id, action="auth.change_password", entity_type="user", entity_id=user.id,
               ip=client_ip(request))
    db.commit()
    token, expires_in = create_access_token(user.id, user.role_name, user.token_version)
    return {"message": "Password changed.", "access_token": token, "expires_in": expires_in}
