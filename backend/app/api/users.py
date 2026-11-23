"""Staff management (admin only). Staff cannot create admins or change their own permissions."""
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import client_ip, get_current_user, require_admin
from app.core.exceptions import BadRequest, Conflict, NotFound
from app.core.security import hash_password
from app.models import Role, User
from app.models.base import utcnow
from app.schemas.auth import AdminResetPasswordIn, StaffCreateIn, StaffUpdateIn, user_out
from app.schemas.common import StrictModel, check_phone
from app.services.audit import log_action, snapshot
from app.utils.pagination import PageParams, apply_sort, like, paginate

router = APIRouter(prefix="/api/users", tags=["Staff Management"])


class ProfileIn(StrictModel):
    full_name: str | None = None
    phone: str | None = None


@router.put("/me")
def update_my_profile(body: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.full_name is not None:
        if len(body.full_name) < 2:
            raise BadRequest("Name is too short.")
        user.full_name = body.full_name
    if body.phone:
        user.phone = check_phone(body.phone)
    db.commit()
    return user_out(user)


@router.get("")
def list_users(
    params: PageParams = Depends(),
    search: str | None = Query(None, max_length=100),
    role: str | None = Query(None, pattern="^(admin|staff)$"),
    is_active: bool | None = None,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    stmt = select(User).join(Role).where(Role.name.in_(("admin", "staff")), User.deleted_at.is_(None))
    if search:
        stmt = stmt.where(or_(User.full_name.ilike(like(search), escape="\\"), User.email.ilike(like(search), escape="\\")))
    if role:
        stmt = stmt.where(Role.name == role)
    if is_active is not None:
        stmt = stmt.where(User.is_active == is_active)
    stmt = apply_sort(stmt, params, {"full_name": User.full_name, "email": User.email, "created_at": User.created_at},
                      User.created_at.desc())
    return paginate(db, stmt, params, user_out)


@router.get("/assignable")
def assignable_staff(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(User).join(Role).where(Role.name.in_(("admin", "staff")), User.is_active.is_(True),
                                                    User.deleted_at.is_(None)).order_by(User.full_name)).all()
    return [{"id": u.id, "full_name": u.full_name, "role": u.role_name} for u in rows]


@router.post("", status_code=201)
def create_user(body: StaffCreateIn, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.scalar(select(User.id).where(func.lower(User.email) == body.email.lower())):
        raise Conflict("A user with this email already exists.")
    role = db.scalar(select(Role).where(Role.name == body.role))
    user = User(email=body.email.lower(), full_name=body.full_name, phone=body.phone, role_id=role.id,
                password_hash=hash_password(body.password))
    db.add(user)
    db.flush()
    log_action(db, user_id=admin.id, action="user.create", entity_type="user", entity_id=user.id,
               summary=f"Created {body.role} {user.full_name}", ip=client_ip(request))
    db.commit()
    return user_out(user)


def _get_staff(db: Session, user_id: int) -> User:
    u = db.get(User, user_id)
    if not u or u.deleted_at or u.role_name == "customer":
        raise NotFound("Staff user not found.")
    return u


@router.get("/{user_id}")
def get_user(user_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    return user_out(_get_staff(db, user_id))


@router.put("/{user_id}")
def update_user(user_id: int, body: StaffUpdateIn, request: Request, admin: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    u = _get_staff(db, user_id)
    if u.id == admin.id and (body.role not in (None, "admin") or body.is_active is False):
        raise BadRequest("You cannot remove your own admin role or deactivate yourself.")
    old = snapshot(u, ["full_name", "phone", "is_active"]) | {"role": u.role_name}
    if body.full_name is not None:
        u.full_name = body.full_name
    if body.phone is not None:
        u.phone = body.phone
    if body.role is not None and body.role != u.role_name:
        u.role_id = db.scalar(select(Role.id).where(Role.name == body.role))
        u.token_version += 1  # force re-login with new permissions
    if body.is_active is not None:
        u.is_active = body.is_active
        if not body.is_active:
            u.token_version += 1
    db.flush()
    db.refresh(u)
    log_action(db, user_id=admin.id, action="user.update", entity_type="user", entity_id=u.id, summary=u.full_name,
               old=old, new=snapshot(u, ["full_name", "phone", "is_active"]) | {"role": u.role_name}, ip=client_ip(request))
    db.commit()
    return user_out(u)


@router.post("/{user_id}/reset-password")
def admin_reset_password(user_id: int, body: AdminResetPasswordIn, request: Request,
                         admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u or u.deleted_at:
        raise NotFound("User not found.")
    u.password_hash = hash_password(body.new_password)
    u.token_version += 1
    log_action(db, user_id=admin.id, action="user.reset_password", entity_type="user", entity_id=u.id,
               summary=f"Password reset for {u.full_name}", ip=client_ip(request))
    db.commit()
    return {"message": "Password reset. The user must log in again."}


@router.delete("/{user_id}")
def delete_user(user_id: int, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = _get_staff(db, user_id)
    if u.id == admin.id:
        raise BadRequest("You cannot delete your own account.")
    u.deleted_at = utcnow()
    u.is_active = False
    u.token_version += 1
    log_action(db, user_id=admin.id, action="user.delete", entity_type="user", entity_id=u.id, summary=u.full_name,
               ip=client_ip(request))
    db.commit()
    return {"message": "User removed."}
