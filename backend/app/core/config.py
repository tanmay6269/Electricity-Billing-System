"""Application configuration loaded from environment variables / .env file."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "Electricity Billing Management System"
    ENVIRONMENT: str = "development"  # development | production | test

    # Database: SQLite for local development now; PostgreSQL planned for deployment.
    # PostgreSQL example: postgresql+psycopg2://ebms:password@localhost:5432/ebms
    DATABASE_URL: str = "sqlite:///./ebms_local.db"
    # Create missing tables at startup (handy locally). In production use Alembic migrations instead.
    AUTO_CREATE_TABLES: bool = True

    # Security
    JWT_SECRET_KEY: str = "change-me-in-env"
    JWT_ALGORITHM: str = "HS256"
    BCRYPT_ROUNDS: int = 12
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    RESET_TOKEN_EXPIRE_MINUTES: int = 30
    LOGIN_RATE_LIMIT: int = 5  # attempts
    LOGIN_RATE_WINDOW_SECONDS: int = 300

    # CORS (comma separated)
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    FRONTEND_URL: str = "http://localhost:5173"

    # Email (disabled by default: mails are written to the log instead)
    EMAIL_ENABLED: bool = False
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    EMAIL_FROM: str = "no-reply@powergrid-demo.local"

    # Local demo convenience: return the reset link in the API response (never in production)
    DEV_SHOW_RESET_LINK: bool = True

    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "logs/app.log"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
