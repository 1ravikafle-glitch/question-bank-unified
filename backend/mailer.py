"""Outbound email for password resets. Free forever at the tiers we target.

Two transports, chosen by MAIL_TRANSPORT, both configured purely through the
environment so there is no vendor lock-in and no code change to switch.

SMTP, which works anywhere including a laptop:

    MAIL_TRANSPORT=smtp
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=you@gmail.com
    SMTP_PASS=<Google app password>
    SMTP_FROM=you@gmail.com

HTTPS send API, required on hosts that block outbound SMTP:

    MAIL_TRANSPORT=api
    MAIL_API_URL=https://api.brevo.com/v3/smtp/email
    MAIL_API_KEY=<provider api key>
    SMTP_FROM=you@yourdomain

Render's free tier blocks outbound TCP to ports 25, 465 and 587 on every web
service, so no SMTP relay can be reached from there at all: the connect sits
until it times out, identically for every provider, which looks like a
credentials problem and is not one. Port 443 is not blocked, so an HTTPS send
API is the only transport that works on that host.

When nothing is configured the mailer stays disabled and ``send`` returns
False; callers still write the reset link to the server log so an operator can
complete a reset manually instead of failing the request.
"""

import os
import smtplib
import sys
from email.message import EmailMessage


def transport() -> str:
    """Which transport to use. Explicit wins; otherwise infer.

    An SMTP_HOST alone still selects SMTP so existing deployments keep working
    untouched. An API URL with no SMTP_HOST selects the API path.
    """
    explicit = (os.getenv("MAIL_TRANSPORT") or "").strip().lower()
    if explicit in ("api", "http", "https"):
        return "api"
    if explicit == "smtp":
        return "smtp"
    if (os.getenv("MAIL_API_URL") or "").strip() and not (os.getenv("SMTP_HOST") or "").strip():
        return "api"
    return "smtp"


def _api_ready() -> tuple[bool, str]:
    """Whether the HTTPS transport has everything it needs, plus why not."""
    url = (os.getenv("MAIL_API_URL") or "").strip()
    key = (os.getenv("MAIL_API_KEY") or "").strip()
    sender = (os.getenv("SMTP_FROM") or "").strip()
    if not url:
        return False, "MAIL_API_URL not set"
    if not key:
        return False, "MAIL_API_KEY not set"
    if not sender:
        return False, "SMTP_FROM not set"
    if not url.lower().startswith("https://"):
        return False, "MAIL_API_URL must be https"
    return True, ""


def configured() -> bool:
    """True only when a send could actually succeed.

    Previously this was just HOST + FROM, so a deployment missing
    SMTP_USER/SMTP_PASS still advertised "email delivery: true" while every
    send failed authentication and nothing was ever delivered. The UI then told
    the user a code was on its way. Credentials are now required for any host
    that is not local, which is every real SMTP relay.
    """
    sender = (os.getenv("SMTP_FROM") or "").strip()
    if not sender:
        return False
    if transport() == "api":
        ready, _ = _api_ready()
        return ready
    host = (os.getenv("SMTP_HOST") or "").strip()
    if not host:
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
    sender = (os.getenv("SMTP_FROM") or "").strip()
    if transport() == "api":
        ready, why = _api_ready()
        return {
            "configured": bool(sender) and ready,
            "transport": "api",
            "host": (os.getenv("MAIL_API_URL") or "").strip() or None,
            "port": "443",
            "user": None,
            "from": sender or None,
            "reason": None if (sender and ready) else (why or "SMTP_FROM not set"),
        }
    return {
        "configured": configured(),
        "transport": "smtp",
        "host": host or None,
        "port": (os.getenv("SMTP_PORT") or "587").strip(),
        "user": (os.getenv("SMTP_USER") or "").strip() or None,
        "from": sender or None,
        "reason": None if configured() else (
            "SMTP_HOST/SMTP_FROM not set" if not (host and sender)
            else "SMTP_USER/SMTP_PASS not set (the host needs credentials)"
        ),
    }


def _timeout() -> float:
    """Seconds to wait on the SMTP connection.

    Default 12, not 20. A reachable relay completes in one to three seconds, so
    a longer wait buys nothing; what it does buy is 21 seconds of frozen UI on
    every signup and resend whenever the connection is blocked rather than
    refused. A blocked egress path or a relay that has silently dropped the
    client both present as a timeout, and the user waiting on the button is the
    one who pays for it. Override with SMTP_TIMEOUT when a deliberately slow
    relay needs more.
    """
    raw = (os.getenv("SMTP_TIMEOUT") or "").strip()
    try:
        val = float(raw)
    except ValueError:
        return 12.0
    return val if val > 0 else 12.0


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
        return smtplib.SMTP_SSL(host, port, timeout=_timeout())
    return smtplib.SMTP(host, port, timeout=_timeout())


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
    if st.get("transport") == "api":
        ready, why = _api_ready()
        _remember(None)
        if ready:
            print(f"[MAIL] ready: api via {st['host']} as {st['from']}", file=sys.stderr)
        else:
            print(f"[MAIL] NOT READY: api transport incomplete -> {why}", file=sys.stderr)
        return ready
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


def _send_via_api(to: str, subject: str, body: str) -> bool:
    """POST the message to an HTTPS send API.

    Exists because SMTP is unreachable on hosts that block ports 25/465/587,
    which includes Render's free tier. Port 443 is open, so this is the only
    transport that works there.

    The request shape is the near-universal transactional-send API used by
    Brevo, Mailjet, SendGrid v3 and Postmark's JSON mode: a sender, a single
    recipient list, a subject and both text bodies. The auth header is
    configurable because providers disagree on its shape - Brevo wants a bare
    api-key header, everyone else wants Authorization: Bearer.
    """
    import json as _json
    import urllib.request as _req
    import urllib.error as _err

    url = (os.getenv("MAIL_API_URL") or "").strip()
    key = (os.getenv("MAIL_API_KEY") or "").strip()
    header = (os.getenv("MAIL_API_KEY_HEADER") or "api-key").strip()
    scheme = (os.getenv("MAIL_API_KEY_SCHEME") or "").strip()
    sender = (os.getenv("SMTP_FROM") or "").strip()
    name = (os.getenv("MAIL_FROM_NAME") or "").strip()

    payload = {
        "sender": {"email": sender, "name": name} if name else {"email": sender},
        "to": [{"email": to}],
        "subject": subject,
        "textContent": body,
        "htmlContent": f"<p>{body.replace(chr(10), '<br/>')}</p>",
    }
    if (os.getenv("MAIL_FROM_NAME") or "").strip():
        payload["sender"] = {"email": sender, "name": (os.getenv("MAIL_FROM_NAME") or "").strip()}

    req = _req.Request(
        url,
        data=_json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            header: f"{scheme}{key}".strip(),
        },
        method="POST",
    )
    try:
        with _req.urlopen(req, timeout=_timeout()) as resp:
            code = resp.getcode()
            _remember(None)
            print(f"[MAIL] api accepted ({code}) via {url}", file=sys.stderr)
            return 200 <= int(code) < 300
    except _err.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8", "replace")[:300]
        except Exception:
            pass
        _remember(e)
        print(f"[MAIL] api REJECTED {e.code} {url} :: {detail}", file=sys.stderr)
        return False
    except Exception as e:
        _remember(e)
        print(f"[MAIL] api FAILED {url} -> {type(e).__name__}: {e}", file=sys.stderr)
        return False


def send(to: str, subject: str, body: str) -> bool:
    """Send a message. Never raises: a mail outage must not 500 the API.

    Returns True only when the relay accepted the message, so the caller can
    report a real delivery failure instead of a hopeful one.
    """
    if not configured():
        _remember(None)
        st = status()
        print(f"[MAIL] not configured ({st.get('reason')}), skipping send", file=sys.stderr)
        return False
    if transport() == "api":
        return _send_via_api(to, subject, body)
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
