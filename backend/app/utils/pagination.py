"""Shared pagination / sorting helpers. Every list endpoint returns:
{"items": [...], "total": n, "page": p, "page_size": s, "pages": k}
"""
import math
from collections.abc import Callable

from fastapi import Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy.sql import Select


class PageParams:
    def __init__(
        self,
        page: int = Query(1, ge=1),
        page_size: int = Query(10, ge=1, le=200),
        sort_by: str | None = Query(None, max_length=40),
        sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    ):
        self.page = page
        self.page_size = page_size
        self.sort_by = sort_by
        self.sort_dir = sort_dir


def apply_sort(stmt: Select, params: PageParams, allowed: dict, default) -> Select:
    """Only whitelisted columns can be sorted on (no raw user input reaches SQL)."""
    col = allowed.get(params.sort_by) if params.sort_by else None
    if col is None:
        return stmt.order_by(default)
    return stmt.order_by(col.asc() if params.sort_dir == "asc" else col.desc())


def paginate(db: Session, stmt: Select, params: PageParams, serializer: Callable) -> dict:
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.offset((params.page - 1) * params.page_size).limit(params.page_size)).unique().all()
    return {
        "items": [serializer(r) for r in rows],
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
        "pages": max(1, math.ceil(total / params.page_size)),
    }


def like(term: str) -> str:
    """Escape LIKE wildcards in user search text."""
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"
