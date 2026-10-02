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


def _open(host: str, port: int):
    """Open an SMTP session with the right transport for the port.

    Port 465 is implicit TLS: the handshake happens inside the TCP connection,
    so it needs SMTP_SSL. Opening it with the plain SMTP class and then calling
    starttls() fails with "wrong version number", and only STARTTLS is offered
    on 587. Previously only the 587 path existed, so a deployment configured
    for 465 - the port most guides list first - connected to nothing and every
    send failed while the API still answered "on its way".
    """
    if port == 465:
        return smtplib.SMTP_SSL(host, port, timeout=20)
    return smtplib.SMTP(host, port, timeout=20)


# The last send failure, so the API can report what actually happened instead of
# claiming a code is on its way for a message the relay refused.
_last_error = None


def _remember(exc) -> None:
    global _last_error
    _last_error = f"{type(exc).__name__}: {exc}" if exc else None


def last_error() -> str | None:
    """Most recent send/selftest failure, or None. Never contains the password."""
    return _last_error


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
        with _open(st["host"], port) as smtp:
            smtp.ehlo()
            if smtp.has_extn("starttls"):
                smtp.starttls()
                smtp.ehlo()
            if user and pw:
                smtp.login(user, pw)
        _remember(None)
        print(f"[MAIL] ready: {st['host']}:{port} as {st['from']}", file=sys.stderr)
        return True
    except Exception as e:
        _remember(e)
        print(f"[MAIL] NOT READY: {st['host']}:{port} as {st['from']} -> {type(e).__name__}: {e}", file=sys.stderr)
        if isinstance(e, smtplib.SMTPAuthenticationError):
            print("[MAIL] hint: Gmail rejects a normal account password. Use a "
                  "16-character App Password (Google Account > Security > "
                  "2-Step Verification > App passwords).", file=sys.stderr)
        return False


def send(to: str, subject: str, body: str) -> bool:
    """Send a message. Never raises: a mail outage must not 500 the API.

    Returns True only when the relay accepted the message, so the caller can
    report a real delivery failure instead of a hopeful one.
    """
    if not configured():
        _remember(None)
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
        with _open(host, port) as smtp:
            smtp.ehlo()
            if smtp.has_extn("starttls"):
                smtp.starttls()
                smtp.ehlo()
            if user and pw:
                smtp.login(user, pw)
            smtp.send_message(msg)
        _remember(None)
        return True
    except Exception as e:
        st = status()
        _remember(e)
        print(
            f"[MAIL] send FAILED to={to} via {st['host']}:{st['port']} as {st['from']} "
            f"-> {type(e).__name__}: {e}",
            file=sys.stderr,
        )
        if isinstance(e, smtplib.SMTPAuthenticationError):
            print(
                "[MAIL] hint: Gmail rejects a normal account password. Use a "
                "16-character App Password (Google Account > Security > "
                "2-Step Verification > App passwords).",
                file=sys.stderr,
            )
        return False
