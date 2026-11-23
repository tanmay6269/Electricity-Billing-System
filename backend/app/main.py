"""Electricity Billing Management System - FastAPI application entry point."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import (admin, analytics, auth, billing, complaints, connections, customers, notifications, payments,
                     readings, reports, tariffs, users)
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.exceptions import AppError
from app.core.logging import setup_logging
from app.middleware.security_headers import SecurityHeadersMiddleware

setup_logging()
log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(_: FastAPI):
    import app.models  # noqa: F401  (register models)
    from app.services.billing_service import mark_overdue_bills
    from app.services.settings_service import ensure_defaults

    if settings.AUTO_CREATE_TABLES:
        Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        try:
            ensure_defaults(db)
            db.commit()
            mark_overdue_bills(db)
        except Exception as exc:  # tables may not exist yet if migrations were not run
            log.warning("Startup housekeeping skipped: %s", type(exc).__name__)
    log.info("%s started (%s)", settings.APP_NAME, settings.ENVIRONMENT)
    yield


app = FastAPI(
    title="Electricity Billing Management System API",
    version="1.0.0",
    description="REST API for customers, connections, meter readings, tariffs, billing, payments (demo mode), "
                "complaints, notifications, analytics and reports.",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Content-Disposition"],
)


@app.exception_handler(AppError)
async def app_error_handler(_: Request, exc: AppError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message, "code": exc.code})


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    errors = []
    for e in exc.errors():
        field = ".".join(str(x) for x in e.get("loc", []) if x not in ("body", "query", "path"))
        msg = e.get("msg", "Invalid value").replace("Value error, ", "")
        errors.append({"field": field, "message": msg})
    first = errors[0] if errors else {"field": "", "message": "Invalid request"}
    detail = f"{first['field']}: {first['message']}" if first["field"] else first["message"]
    return JSONResponse(status_code=422, content={"detail": detail, "code": "validation_error", "errors": errors})


@app.exception_handler(StarletteHTTPException)
async def http_handler(_: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail, "code": "http_error"})


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong. Please try again.", "code": "server_error"})


for r in (auth, users, customers, connections, readings, tariffs, billing, payments, complaints, notifications,
          analytics, reports, admin):
    app.include_router(r.router)


@app.get("/api/health", tags=["Health"])
def health():
    return {"status": "ok", "app": settings.APP_NAME}
