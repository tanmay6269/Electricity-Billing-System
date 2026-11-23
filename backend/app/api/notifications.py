from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.exceptions import NotFound
from app.models import Notification, User
from app.utils.pagination import PageParams, paginate

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


def n_out(n: Notification) -> dict:
    return {"id": n.id, "type": n.type, "title": n.title, "message": n.message, "link": n.link, "is_read": n.is_read,
            "created_at": n.created_at.isoformat()}


@router.get("")
def list_notifications(params: PageParams = Depends(), unread_only: bool = False,
                       type: str | None = Query(None, max_length=30),
                       user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    if type:
        stmt = stmt.where(Notification.type == type)
    return paginate(db, stmt.order_by(Notification.created_at.desc(), Notification.id.desc()), params, n_out)


@router.get("/unread-count")
def unread_count(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = db.scalar(select(func.count(Notification.id)).where(Notification.user_id == user.id, Notification.is_read.is_(False)))
    return {"count": n or 0}


@router.put("/read-all")
def mark_all_read(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.user_id == user.id, Notification.is_read.is_(False)).values(is_read=True))
    db.commit()
    return {"message": "All notifications marked as read."}


@router.put("/{notification_id}/read")
def mark_read(notification_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = db.get(Notification, notification_id)
    if not n or n.user_id != user.id:
        raise NotFound("Notification not found.")
    n.is_read = True
    db.commit()
    return n_out(n)
