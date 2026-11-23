from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.billing import company
from app.core.database import get_db
from app.core.deps import require_staff
from app.models import User
from app.services import report_service as rpt
from app.services.billing_service import mark_overdue_bills
from app.services.pdf_service import table_report_pdf
from app.utils.exporters import csv_response, pdf_response

router = APIRouter(prefix="/api/reports", tags=["Reports"])


def filters(
    date_from: date | None = None,
    date_to: date | None = None,
    year: int | None = Query(None, ge=2000, le=2100),
    month: int | None = Query(None, ge=1, le=12),
    customer_type: str | None = Query(None, pattern="^(residential|commercial|industrial)$"),
    status: str | None = Query(None, max_length=20, pattern="^[a-z_]+$"),
    tariff_id: int | None = None,
) -> rpt.ReportFilters:
    return rpt.ReportFilters(date_from, date_to, year, month, customer_type, status, tariff_id)


@router.get("")
def list_reports(_: User = Depends(require_staff)):
    return [{"key": k, "title": fn.__name__} for k, fn in rpt.REPORTS.items()]


@router.get("/{key}")
def run_report(key: str, format: str = Query("json", pattern="^(json|csv|pdf)$"),
               f: rpt.ReportFilters = Depends(filters), _: User = Depends(require_staff), db: Session = Depends(get_db)):
    mark_overdue_bills(db)
    data = rpt.build(db, key, f)
    fname = f"{key}_report_{date.today()}"
    if format == "csv":
        return csv_response(f"{fname}.csv", data["columns"], data["rows"])
    if format == "pdf":
        pdf = table_report_pdf(data["title"], data["columns"], data["rows"], company(db), f.describe(), data.get("summary"))
        return pdf_response(f"{fname}.pdf", pdf)
    return {**data, "filters": f.describe()}
