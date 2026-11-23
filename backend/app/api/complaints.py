from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import client_ip, get_current_user, get_customer_profile, require_staff
from app.core.exceptions import BadRequest, NotFound
from app.models import Complaint, ComplaintUpdate, Customer, ElectricityConnection, Role, User
from app.models.base import utcnow
from app.schemas.complaint import ComplaintAssignIn, ComplaintCreateIn, ComplaintStatusIn, complaint_out
from app.services.audit import log_action
from app.services.notifications import notify_customer, notify_user
from app.utils.codes import assign_code
from app.utils.pagination import PageParams, apply_sort, like, paginate

router = APIRouter(prefix="/api/complaints", tags=["Complaints"])

SORTS = {"created_at": Complaint.created_at, "priority": Complaint.priority, "status": Complaint.status,
         "updated_at": Complaint.updated_at}

# Allowed workflow moves. Closed is final.
TRANSITIONS = {
    "submitted": {"under_review", "assigned", "in_progress", "resolved", "closed"},
    "under_review": {"assigned", "in_progress", "resolved", "closed"},
    "assigned": {"in_progress", "under_review", "resolved", "closed"},
    "in_progress": {"resolved", "assigned", "closed"},
    "resolved": {"closed", "in_progress"},
    "closed": set(),
}


@router.post("", status_code=201)
def create_complaint(body: ComplaintCreateIn, request: Request, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    if user.role_name == "customer":
        customer = get_customer_profile(db, user)
    else:
        if not body.customer_id:
            raise BadRequest("Choose the customer this complaint is for.")
        customer = db.get(Customer, body.customer_id)
        if not customer or customer.deleted_at:
            raise NotFound("Customer not found.")
    if body.connection_id:
        conn = db.get(ElectricityConnection, body.connection_id)
        if not conn or conn.customer_id != customer.id:
            raise BadRequest("The selected connection does not belong to this customer.")
    c = Complaint(customer_id=customer.id, connection_id=body.connection_id, category=body.category, subject=body.subject,
                  description=body.description, priority=body.priority, status="submitted")
    assign_code(db, c, "complaint_code", "CMP")
    c.updates.append(ComplaintUpdate(status="submitted", note="Complaint submitted", updated_by=user.id))
    log_action(db, user_id=user.id, action="complaint.create", entity_type="complaint", entity_id=c.id,
               summary=f"{c.complaint_code}: {c.subject}", ip=client_ip(request))
    # Tell staff a new complaint arrived
    staff_ids = db.scalars(select(User.id).join(Role).where(Role.name.in_(("admin", "staff")), User.is_active.is_(True))).all()
    for sid in staff_ids:
        notify_user(db, sid, "complaint_new", "New complaint", f"{c.complaint_code} from {customer.full_name}: {c.subject}",
                    link=f"/app/complaints/{c.id}")
    notify_customer(db, customer, "complaint_status", "Complaint received",
                    f"We received your complaint {c.complaint_code}. We will keep you updated.",
                    link=f"/portal/complaints/{c.id}", email=False)
    db.commit()
    db.refresh(c)
    return complaint_out(c, detail=True)


@router.get("")
def list_complaints(
    params: PageParams = Depends(),
    search: str | None = Query(None, max_length=100),
    status: str | None = Query(None, pattern="^(submitted|under_review|assigned|in_progress|resolved|closed)$"),
    category: str | None = Query(None, pattern="^(incorrect_bill|meter_issue|power_supply|payment_issue|connection_issue|other)$"),
    priority: str | None = Query(None, pattern="^(low|medium|high|critical)$"),
    assigned_to_me: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Complaint).join(Customer, Complaint.customer_id == Customer.id)
    if user.role_name == "customer":
        stmt = stmt.where(Complaint.customer_id == get_customer_profile(db, user).id)
    if search:
        t = like(search)
        stmt = stmt.where(or_(Complaint.complaint_code.ilike(t, escape="\\"), Complaint.subject.ilike(t, escape="\\"),
                              Customer.full_name.ilike(t, escape="\\"), Customer.customer_code.ilike(t, escape="\\")))
    if status:
        stmt = stmt.where(Complaint.status == status)
    if category:
        stmt = stmt.where(Complaint.category == category)
    if priority:
        stmt = stmt.where(Complaint.priority == priority)
    if assigned_to_me and user.role_name != "customer":
        stmt = stmt.where(Complaint.assigned_to == user.id)
    stmt = apply_sort(stmt, params, SORTS, Complaint.created_at.desc())
    return paginate(db, stmt, params, complaint_out)


def _get(db: Session, complaint_id: int, user: User) -> Complaint:
    c = db.get(Complaint, complaint_id)
    if not c:
        raise NotFound("Complaint not found.")
    if user.role_name == "customer" and c.customer_id != get_customer_profile(db, user).id:
        raise NotFound("Complaint not found.")
    return c


@router.get("/{complaint_id}")
def get_complaint(complaint_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return complaint_out(_get(db, complaint_id, user), detail=True)


@router.put("/{complaint_id}/status")
def update_status(complaint_id: int, body: ComplaintStatusIn, request: Request, staff: User = Depends(require_staff),
                  db: Session = Depends(get_db)):
    c = _get(db, complaint_id, staff)
    if body.status == c.status:
        raise BadRequest(f"Complaint is already {body.status.replace('_', ' ')}.")
    if body.status not in TRANSITIONS[c.status]:
        raise BadRequest(f"Cannot move a complaint from {c.status.replace('_', ' ')} to {body.status.replace('_', ' ')}.")
    if body.status in ("resolved", "closed") and not (body.resolution_notes or c.resolution_notes):
        raise BadRequest("Add resolution notes before resolving or closing a complaint.")
    if body.status == "assigned" and not c.assigned_to:
        raise BadRequest("Assign a staff member first.")
    old = c.status
    c.status = body.status
    if body.resolution_notes:
        c.resolution_notes = body.resolution_notes
    if body.status == "resolved":
        c.resolved_at = utcnow()
    c.updates.append(ComplaintUpdate(status=body.status, note=body.note or body.resolution_notes, updated_by=staff.id))
    log_action(db, user_id=staff.id, action="complaint.status", entity_type="complaint", entity_id=c.id,
               summary=f"{c.complaint_code}: {old} -> {body.status}", ip=client_ip(request))
    notify_customer(db, c.customer, "complaint_status", "Complaint status updated",
                    f"Your complaint {c.complaint_code} is now '{body.status.replace('_', ' ')}'."
                    + (f" Note: {body.note}" if body.note else ""), link=f"/portal/complaints/{c.id}")
    db.commit()
    db.refresh(c)
    return complaint_out(c, detail=True)


@router.put("/{complaint_id}/assign")
def assign(complaint_id: int, body: ComplaintAssignIn, request: Request, staff: User = Depends(require_staff),
           db: Session = Depends(get_db)):
    c = _get(db, complaint_id, staff)
    if c.status == "closed":
        raise BadRequest("Closed complaints cannot be reassigned.")
    assignee = db.get(User, body.assigned_to)
    if not assignee or assignee.role_name not in ("admin", "staff") or not assignee.is_active:
        raise BadRequest("Choose an active staff member.")
    c.assigned_to = assignee.id
    if body.priority:
        c.priority = body.priority
    if c.status in ("submitted", "under_review"):
        c.status = "assigned"
    c.updates.append(ComplaintUpdate(status=c.status, note=body.note or f"Assigned to {assignee.full_name}", updated_by=staff.id))
    log_action(db, user_id=staff.id, action="complaint.assign", entity_type="complaint", entity_id=c.id,
               summary=f"{c.complaint_code} assigned to {assignee.full_name}", ip=client_ip(request))
    notify_user(db, assignee.id, "complaint_assigned", "Complaint assigned to you", f"{c.complaint_code}: {c.subject}",
                link=f"/app/complaints/{c.id}")
    notify_customer(db, c.customer, "complaint_status", "Complaint assigned",
                    f"Your complaint {c.complaint_code} has been assigned to our team.", link=f"/portal/complaints/{c.id}",
                    email=False)
    db.commit()
    db.refresh(c)
    return complaint_out(c, detail=True)
