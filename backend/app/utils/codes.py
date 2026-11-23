"""Human-friendly sequential codes (CUST-00001, CON-00001, MTR-..., CMP-...)."""
import uuid

from sqlalchemy.orm import Session


def temp_code() -> str:
    return "TMP-" + uuid.uuid4().hex[:12]


def assign_code(db: Session, obj, attr: str, prefix: str, width: int = 5) -> None:
    """Flush to obtain the id, then set the final code derived from it (collision-free)."""
    setattr(obj, attr, temp_code())
    db.add(obj)
    db.flush()
    setattr(obj, attr, f"{prefix}-{obj.id:0{width}d}")
