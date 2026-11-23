"""Email sending. Disabled by default: messages are only noted in the log (recipient masked)."""
import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

log = logging.getLogger("email")


def mask_email(email: str) -> str:
    if not email or "@" not in email:
        return "***"
    name, domain = email.split("@", 1)
    return f"{name[:1]}***@{domain}"


def send_email(to: str, subject: str, body: str) -> bool:
    if not settings.EMAIL_ENABLED or not settings.SMTP_HOST:
        log.info("Email disabled - would send '%s' to %s", subject, mask_email(to))
        return False
    msg = EmailMessage()
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
            if settings.SMTP_USE_TLS:
                smtp.starttls()
            if settings.SMTP_USERNAME:
                smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            smtp.send_message(msg)
        log.info("Email '%s' sent to %s", subject, mask_email(to))
        return True
    except Exception as exc:  # never break the business flow because of email
        log.warning("Email '%s' to %s failed: %s", subject, mask_email(to), type(exc).__name__)
        return False
