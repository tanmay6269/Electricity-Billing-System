from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_staff
from app.models import User
from app.schemas.common import PERIOD_RE
from app.services import analytics_service as an
from app.services.billing_service import mark_overdue_bills

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


def _range(period_from: str | None = Query(None, pattern=PERIOD_RE), period_to: str | None = Query(None, pattern=PERIOD_RE),
           year: int | None = Query(None, ge=2000, le=2100)):
    if year:
        return f"{year}-01", f"{year}-12"
    return an.period_range(period_from, period_to)


@router.get("/dashboard")
def dashboard(rng: tuple = Depends(_range), _: User = Depends(require_staff), db: Session = Depends(get_db)):
    mark_overdue_bills(db)
    frm, to = rng
    return {
        "range": {"from": frm, "to": to},
        "kpis": an.dashboard_kpis(db),
        "consumption": an.consumption_series(db, frm, to),
        "revenue": an.revenue_series(db, frm, to),
        "billing": an.billing_series(db, frm, to),
        "bill_status": an.bill_status_breakdown(db, frm, to),
        "customer_growth": an.customer_growth(db, frm, to),
        "distribution": an.consumption_distribution(db, frm, to),
        **an.recent_activity(db),
        "generated_at": an.now_iso(),
    }


@router.get("/revenue")
def revenue(rng: tuple = Depends(_range), _: User = Depends(require_staff), db: Session = Depends(get_db)):
    frm, to = rng
    return {"range": {"from": frm, "to": to}, "revenue": an.revenue_series(db, frm, to), "billing": an.billing_series(db, frm, to)}


@router.get("/consumption")
def consumption(rng: tuple = Depends(_range), _: User = Depends(require_staff), db: Session = Depends(get_db)):
    frm, to = rng
    return {"range": {"from": frm, "to": to}, "consumption": an.consumption_series(db, frm, to),
            "distribution": an.consumption_distribution(db, frm, to)}


@router.get("/payments")
def payments(rng: tuple = Depends(_range), _: User = Depends(require_staff), db: Session = Depends(get_db)):
    frm, to = rng
    return {"range": {"from": frm, "to": to}, "bill_status": an.bill_status_breakdown(db, frm, to),
            "revenue": an.revenue_series(db, frm, to)}
