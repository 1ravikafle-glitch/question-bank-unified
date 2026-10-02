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
    """True only when a send could actually succeed.

    Previously this was just HOST + FROM, so a deployment missing
    SMTP_USER/SMTP_PASS still advertised "email delivery: true" while every
    send failed authentication and nothing was ever delivered. The UI then told
    the user a code was on its way. Credentials are now required for any host
    that is not local, which is every real SMTP relay.
    """
    host = (os.getenv("SMTP_HOST") or "").strip()
    sender = (os.getenv("SMTP_FROM") or "").strip()
    if not host or not sender:
        return False
    if _is_local(host):
        return True
    return bool((os.getenv("SMTP_USER") or "").strip() and (os.getenv("SMTP_PASS") or "").strip())


def _is_local(host: str) -> bool:
    h = host.lower()
    return h in ("localhost", "127.0.0.1", "::1", "mailhog", "mailpit") or h.startswith("mail") and "." not in h


def status() -> dict:
    """Operator-facing summary. Never includes the password."""
    host = (os.getenv("SMTP_HOST") or "").strip()
    return {
        "configured": configured(),
        "host": host or None,
        "port": (os.getenv("SMTP_PORT") or "587").strip(),
        "user": (os.getenv("SMTP_USER") or "").strip() or None,
        "from": (os.getenv("SMTP_FROM") or "").strip() or None,
        "reason": None if configured() else (
            "SMTP_HOST/SMTP_FROM not set" if not (host and (os.getenv("SMTP_FROM") or "").strip())
            else "SMTP_USER/SMTP_PASS not set (the host needs credentials)"
        ),
    }


def selftest() -> bool:
    """Connect and authenticate once at boot.

    Without this a wrong app password is invisible: the API still answers
    "on its way" and only the log mentions the failure, usually long after
    someone reported the code never arrived. This prints the outcome at deploy
    time so the cause is obvious in the service log.
    """
    st = status()
    if not st["configured"]:
        print(f"[MAIL] disabled: {st['reason']} (reset codes go to the log instead)", file=sys.stderr)
        return False
    port = int(st["port"])
    user = (os.getenv("SMTP_USER") or "").strip()
    pw = (os.getenv("SMTP_PASS") or "").strip()
    try:
        with smtplib.SMTP(st["host"], port, timeout=20) as smtp:
            smtp.ehlo()
            if smtp.has_extn("starttls"):
                smtp.starttls()
                smtp.ehlo()
            if user and pw:
                smtp.login(user, pw)
        print(f"[MAIL] ready: {st['host']}:{port} as {st['from']}", file=sys.stderr)
        return True
    except Exception as e:
        print(f"[MAIL] NOT READY: {st['host']}:{port} as {st['from']} -> {type(e).__name__}: {e}", file=sys.stderr)
        return False


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
        st = status()
        print(
            f"[MAIL] send FAILED to={to} via {st['host']}:{st['port']} as {st['from']} "
            f"-> {type(e).__name__}: {e}",
            file=sys.stderr,
        )
        return False
