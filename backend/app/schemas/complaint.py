from pydantic import Field

from app.schemas.common import StrictModel, d

CATS = "^(incorrect_bill|meter_issue|power_supply|payment_issue|connection_issue|other)$"
STATUSES = "^(submitted|under_review|assigned|in_progress|resolved|closed)$"


class ComplaintCreateIn(StrictModel):
    category: str = Field(pattern=CATS)
    subject: str = Field(min_length=5, max_length=200)
    description: str = Field(min_length=10, max_length=4000)
    priority: str = Field("medium", pattern="^(low|medium|high|critical)$")
    connection_id: int | None = None
    customer_id: int | None = None  # staff may raise a complaint on behalf of a customer


class ComplaintStatusIn(StrictModel):
    status: str = Field(pattern=STATUSES)
    note: str | None = Field(None, max_length=2000)
    resolution_notes: str | None = Field(None, max_length=4000)


class ComplaintAssignIn(StrictModel):
    assigned_to: int
    priority: str | None = Field(None, pattern="^(low|medium|high|critical)$")
    note: str | None = Field(None, max_length=2000)


def complaint_out(c, detail: bool = False) -> dict:
    data = {
        "id": c.id,
        "complaint_code": c.complaint_code,
        "customer_id": c.customer_id,
        "customer_code": c.customer.customer_code,
        "customer_name": c.customer.full_name,
        "connection_id": c.connection_id,
        "connection_code": c.connection.connection_code if c.connection else None,
        "category": c.category,
        "subject": c.subject,
        "priority": c.priority,
        "status": c.status,
        "assigned_to": c.assigned_to,
        "assigned_to_name": c.assignee.full_name if c.assignee else None,
        "created_at": d(c.created_at),
        "updated_at": d(c.updated_at),
        "resolved_at": d(c.resolved_at),
    }
    if detail:
        data["description"] = c.description
        data["resolution_notes"] = c.resolution_notes
        data["timeline"] = [
            {"id": u.id, "status": u.status, "note": u.note, "by": u.author.full_name if u.author else "System",
             "by_role": u.author.role_name if u.author else None, "created_at": d(u.created_at)}
            for u in c.updates
        ]
    return data
