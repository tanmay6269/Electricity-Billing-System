"""Logging setup. Never log passwords, tokens or full personal details."""
import logging
import os
from logging.handlers import RotatingFileHandler

from app.core.config import settings


def setup_logging() -> None:
    os.makedirs(os.path.dirname(settings.LOG_FILE) or ".", exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")
    root = logging.getLogger()
    root.setLevel(settings.LOG_LEVEL)
    if not any(isinstance(h, RotatingFileHandler) for h in root.handlers):
        fh = RotatingFileHandler(settings.LOG_FILE, maxBytes=2_000_000, backupCount=3, encoding="utf-8")
        fh.setFormatter(fmt)
        root.addHandler(fh)
        sh = logging.StreamHandler()
        sh.setFormatter(fmt)
        root.addHandler(sh)
