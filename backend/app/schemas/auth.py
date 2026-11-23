from pydantic import EmailStr, Field, field_validator

from app.core.security import PASSWORD_RULE_TEXT, is_strong_password
from app.schemas.common import StrictModel, check_phone


def _strong(v: str) -> str:
    if not is_strong_password(v):
        raise ValueError(PASSWORD_RULE_TEXT)
    return v


class LoginIn(StrictModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordIn(StrictModel):
    email: EmailStr


class ResetPasswordIn(StrictModel):
    token: str = Field(min_length=10, max_length=200)
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _v(cls, v):
        return _strong(v)


class ChangePasswordIn(StrictModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _v(cls, v):
        return _strong(v)


class StaffCreateIn(StrictModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str | None = None
    role: str = Field(pattern="^(admin|staff)$")
    password: str

    @field_validator("password")
    @classmethod
    def _p(cls, v):
        return _strong(v)

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        return check_phone(v) if v else v


class StaffUpdateIn(StrictModel):
    full_name: str | None = Field(None, min_length=2, max_length=120)
    phone: str | None = None
    role: str | None = Field(None, pattern="^(admin|staff)$")
    is_active: bool | None = None

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        return check_phone(v) if v else v


class AdminResetPasswordIn(StrictModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _v(cls, v):
        return _strong(v)


def user_out(u) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "full_name": u.full_name,
        "phone": u.phone,
        "role": u.role_name,
        "is_active": u.is_active,
        "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
        "created_at": u.created_at.isoformat(),
    }
