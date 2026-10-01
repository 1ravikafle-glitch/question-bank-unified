"""Outbound email for password resets. Free forever at the tiers we target.

SMTP is configured purely through the environment, so there is no vendor
lock-in and no code change to switch provider:

    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=you@gmail.com
    SMTP_PASS=<Google app password>
    SMTP_FROM=you@gmail.com

A Gmail app password with an @gmail.com account covers 500 messages a day at
no cost, which is far beyond a reset-email workload. When SMTP is unset the
mailer stays disabled and ``send`` returns False; callers still write the reset
link to the server log so an operator can complete a reset manually instead of
failing the request.
"""

import os
import smtplib
import sys
from email.message import EmailMessage


def configured() -> bool:
    return bool((os.getenv("SMTP_HOST") or "").strip() and (os.getenv("SMTP_FROM") or "").strip())


def send(to: str, subject: str, body: str) -> bool:
    """Best-effort send. Never raises: a mail outage must not 500 the API."""
    if not configured():
        print("[MAIL] SMTP not configured, skipping send", file=sys.stderr)
        return False
    host = (os.getenv("SMTP_HOST") or "").strip()
    port = int((os.getenv("SMTP_PORT") or "587").strip())
    user = (os.getenv("SMTP_USER") or "").strip()
    pw = (os.getenv("SMTP_PASS") or "").strip()
    sender = (os.getenv("SMTP_FROM") or user or "").strip()

    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    try:
        with smtplib.SMTP(host, port, timeout=20) as smtp:
            smtp.starttls()
            if user and pw:
                smtp.login(user, pw)
            smtp.send_message(msg)
        return True
    except Exception as e:
        print(f"[MAIL] send failed ({to}): {e}", file=sys.stderr)
        return False
