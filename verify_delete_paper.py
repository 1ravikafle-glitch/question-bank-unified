#!/usr/bin/env python3
"""Prove admin-only paper deletion works and cannot be abused."""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8011"
fails = []


def call(method, path, tok=None, body=None):
    h = {"Content-Type": "application/json"}
    if tok:
        h["Authorization"] = f"Bearer {tok}"
    r = urllib.request.Request(BASE + path, method=method,
                               data=json.dumps(body).encode() if body is not None else None,
                               headers=h)
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {}


def check(name, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"   [{detail}]" if detail else ""))
    if not ok:
        fails.append(name)


def paper_id(title):
    """Find an APPROVED paper via the public list.

    Deliberately not used for pending papers: /uploads/past-papers only lists
    approved rows, so looking there for a pending one always returns None.
    """
    _, d = call("GET", "/uploads/past-papers")
    for p in d.get("papers", []):
        if p.get("title") == title:
            return p["id"]
    return None


def row_id(filename):
    """Look a row up in the table directly, whatever its status."""
    import database, models
    d = database.SessionLocal()
    row = d.query(models.ContributionRequest).filter(
        models.ContributionRequest.filename == filename).first()
    rid = row.id if row else None
    d.close()
    return rid


admin = json.loads(urllib.request.urlopen(urllib.request.Request(
    BASE + "/auth/login", data=json.dumps(
        {"username": "localadmin", "password": "local-admin-pw-0123456789"}).encode(),
    headers={"Content-Type": "application/json"})).read())["session_token"]

sys.path.insert(0, "/home/elfakiris/question-bank-unified/backend")
os.environ.setdefault("SECRET_KEY", "local-flow-test-secret-0123456789abcdef")
os.environ["DATABASE_URL"] = "sqlite:////tmp/opencode/gflow_test.db"
import database  # noqa: E402
import models  # noqa: E402
import session  # noqa: E402


def seed():
    """Create both fixtures. A regression suite has to be re-runnable, and the
    delete test consumes its own approved paper, so this cannot assume a clean
    starting state."""
    d = database.SessionLocal()
    for fn, st, title, size in (
        ("demo-approved.pdf", "approved", "Approved Demo Paper", 2059),
        ("demo-pending.pdf", "pending", "Pending Demo Paper", 523),
    ):
        if not d.query(models.ContributionRequest).filter_by(filename=fn).first():
            d.add(models.ContributionRequest(
                user_identifier="someone", filename=fn, kind="pdf", status=st,
                title=title, pdf_bytes=b"%PDF-1.4\n" + b"x" * (size - 9),
                pdf_pages=3, pdf_size=size))
    d.commit()
    d.close()


seed()
user = session.mint_session("elfak")

print("\n=== 1. the route exists and is admin-only ===")
# Use an id that does not exist for the "auth passed" probe. A real delete here
# would destroy the approved fixture that section 4 needs, which is exactly what
# happened the first time this ran.
check("anonymous DELETE refused (401/403)", call("DELETE", "/uploads/past-papers/999998")[0] in (401, 403))
check("signed-in non-admin refused (403)", call("DELETE", "/uploads/past-papers/999998", user)[0] == 403)
check("admin passes the auth gate (404, not 403)",
      call("DELETE", "/uploads/past-papers/999998", admin)[0] == 404)

print("\n=== 2. unknown id is 404 ===")
check("missing paper -> 404", call("DELETE", "/uploads/past-papers/999999", admin)[0] == 404)

print("\n=== 3. a PENDING paper cannot be deleted ===")
pid = row_id("demo-pending.pdf")
check("pending paper exists to test", pid is not None, f"id={pid}")
code, body = call("DELETE", f"/uploads/past-papers/{pid}", admin)
check("pending -> 409 with a usable reason", code == 409 and "approve or reject" in body.get("detail", ""),
      f"HTTP {code} {body.get('detail', '')[:70]}")
check("pending paper still there", row_id("demo-pending.pdf") is not None)

print("\n=== 4. an APPROVED paper is deleted, and its bytes go with it ===")
pid = paper_id("Approved Demo Paper")
check("approved paper exists to test", pid is not None, f"id={pid}")
before = paper_id("Approved Demo Paper")
code, body = call("DELETE", f"/uploads/past-papers/{pid}", admin)
check("approved -> 200", code == 200, f"HTTP {code} {str(body)[:80]}")
check("gone from the public list", paper_id("Approved Demo Paper") is None)
check("its file endpoint now 404s",
      call("GET", f"/uploads/past-papers/{before}/file", admin)[0] == 404)
check("response reports bytes freed", body.get("freed_bytes", 0) > 0, str(body.get("freed_bytes")))

print("\n=== 5. bytes are really gone from the row, not just hidden ===")
db = database.SessionLocal()
row = db.query(models.ContributionRequest).filter(
    models.ContributionRequest.id == before).first()
db.close()
check("no row survives in the database", row is None)

print(f"\n{'=' * 58}")
print(f"  {'ALL PASS' if not fails else 'FAILURES: ' + ', '.join(fails)}")
print("=" * 58)
sys.exit(1 if fails else 0)