"""In-app notifications (plus optional email)."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Customer, Notification, User
from app.services.email import send_email


def notify_user(
    db: Session,
    user_id: int | None,
    type_: str,
    title: str,
    message: str,
    link: str | None = None,
    dedupe_key: str | None = None,
    email: bool = False,
) -> Notification | None:
    if not user_id:
        return None
    if dedupe_key:
        exists = db.scalar(
            select(Notification.id).where(Notification.user_id == user_id, Notification.dedupe_key == dedupe_key)
        )
        if exists:
            return None
    n = Notification(user_id=user_id, type=type_, title=title, message=message, link=link, dedupe_key=dedupe_key)
    db.add(n)
    if email:
        user = db.get(User, user_id)
        if user:
            send_email(user.email, title, message)
    return n


def notify_customer(db: Session, customer: Customer, type_: str, title: str, message: str, link=None, dedupe_key=None, email=True):
    return notify_user(db, customer.user_id, type_, title, message, link, dedupe_key, email)
