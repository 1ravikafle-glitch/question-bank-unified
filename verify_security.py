#!/usr/bin/env python3
"""Security regression suite. Every check is an attack, not an assertion.

Run against the local harness (gflow.sh, port 8011). Exits non-zero if any
check regresses, so it can be re-run after future changes.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("BASE", "http://127.0.0.1:8011")
results = []


def req(path, method="GET", body=None, headers=None, raw_path=False):
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    h = {"Content-Type": "application/json"}
    h.update(headers or {})
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            return resp.status, resp.read(), dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)
    except Exception as e:  # noqa: BLE001
        return 0, str(e).encode(), {}


def curl_raw(path):
    """Literal path, no client-side normalisation -- this is the traversal test."""
    p = subprocess.run(
        ["curl", "-s", "--path-as-is", "--max-time", "10", "-o", "-",
         "-w", "\n__CODE__%{http_code}", f"{BASE}{path}"],
        capture_output=True, text=True,
    )
    body, _, code = p.stdout.rpartition("\n__CODE__")
    return code.strip(), body


def check(name, passed, detail=""):
    results.append((name, passed, detail))
    print(f"  {'PASS' if passed else 'FAIL'}  {name}" + (f"   [{detail}]" if detail else ""))


print("\n=== 1. PATH TRAVERSAL (was: unauthenticated .env + Postgres password) ===")
for path in ("/desktop/../../.env", "/mobile/../../.env", "/desktop/../../start_prod.py",
             "/desktop/../../backend/models.py", "/desktop/../../../etc/passwd",
             "/mobile/../../../../etc/hostname"):
    code, body = curl_raw(path)
    leaked = any(s in body for s in ("DATABASE_URL", "npg_", "ADMIN_PASSWORD", "root:x:"))
    check(f"traversal blocked: {path}", code == "404" and not leaked, f"HTTP {code}")

print("\n=== 2. LEGITIMATE ASSETS STILL SERVED (the fix must not break the app) ===")
for path in ("/desktop/", "/mobile/", "/desktop/forestry-logo.png"):
    code, _, _ = req(path)
    check(f"still served: {path}", code == 200, f"HTTP {code}")

print("\n=== 3. SECURITY HEADERS ===")
_, _, h = req("/desktop/")
csp = h.get("content-security-policy", "")
check("CSP present", bool(csp), f"{len(csp)} bytes")
for directive, want in (("object-src 'none'", True), ("base-uri 'self'", True),
                        ("form-action 'self'", True), ("frame-ancestors 'none'", True)):
    check(f"CSP has {directive}", (directive in csp) == want)
check("X-Frame-Options DENY on documents", h.get("x-frame-options") == "DENY")
check("nosniff present", h.get("x-content-type-options") == "nosniff")
check("deprecated X-XSS-Protection removed", "x-xss-protection" not in {k.lower() for k in h})
code, _, h2 = req("/desktop/", headers={"X-Forwarded-Proto": "https"})
check("HSTS sent behind TLS proxy", "max-age=31536000" in h2.get("strict-transport-security", ""))

print("\n=== 4. PDF ENDPOINT MAY BE FRAMED BY THE APP ONLY ===")
tok = json.loads(req("/auth/login", "POST",
                     {"username": "localadmin", "password": "local-admin-pw-0123456789"})[1])
t = tok.get("session_token", "")
code, _, ph = req("/uploads/past-papers/1/file", headers={"Authorization": f"Bearer {t}"})
check("PDF: frame-ancestors 'self' (else the viewer breaks)",
      "frame-ancestors 'self'" in ph.get("content-security-policy", ""))
check("PDF: X-Frame-Options SAMEORIGIN", ph.get("x-frame-options") == "SAMEORIGIN")

print("\n=== 5. LOGIN THROTTLE: per-account ===")
codes = [req("/auth/login", "POST", {"username": "throttle-probe", "password": "x"})[0] for _ in range(10)]
check("brute force on one account is stopped", 429 in codes, f"sequence {codes}")

print("\n=== 6. LOGIN THROTTLE: per-IP (credential spraying) ===")
codes = []
for i in range(50):
    codes.append(req("/auth/login", "POST", {"username": f"spray-{i}", "password": "x"})[0])
check("spraying across many usernames is capped", codes.count(429) > 0,
      f"{codes.count(401)} accepted-then-rejected, {codes.count(429)} throttled")

print("\n=== 7. sso/refresh IS NOT AN UNTHROTTLED PASSWORD ORACLE ===")
codes = [req("/auth/sso/refresh", "POST", {"username": "sso-probe", "password": "x"})[0] for _ in range(10)]
check("sso/refresh throttled", 429 in codes, f"sequence {codes}")

print("\n=== 8. AN ATTACKER MUST NOT BE ABLE TO LOCK OUT REAL USERS ===")
# The exact scenario that a pre-emptive IP 429 got wrong: deliberately burn this
# IP's failure budget, THEN try a correct password. A correct login must still
# succeed, or an attacker can deny service to the admin with 40 wrong guesses.
burned = 0
for i in range(70):
    c = req("/auth/login", "POST", {"username": f"burn-{i}", "password": "x"})[0]
    if c == 429:
        burned += 1
        break
check("IP failure budget can be exhausted", burned == 1, "attacker reached the ceiling")
after = [req("/auth/login", "POST",
             {"username": "localadmin", "password": "local-admin-pw-0123456789"})[0]
         for _ in range(3)]
check("CORRECT login still works after that",
      all(c == 200 for c in after), f"{after}")
check("spraying from a spent IP is still refused",
      req("/auth/login", "POST", {"username": "spray-after", "password": "x"})[0] == 429)

print("\n=== 9. HOST HEADER CANNOT POISON THE RESET LINK ===")
sys.path.insert(0, "/home/elfakiris/question-bank-unified/backend")
os.environ.setdefault("SECRET_KEY", "local-flow-test-secret-0123456789abcdef")
os.environ["PUBLIC_BASE_URL"] = ""
import auth_router as A  # noqa: E402


class _R:
    def __init__(s, h):
        s.headers = {"host": h}
        s.url = type("U", (), {"scheme": "https"})()


evil = A._reset_base_url(_R("evil.example.com"))
check("attacker Host ignored", "evil.example.com" not in evil, f"-> {evil}")
check("localhost still works for dev", "localhost" in A._reset_base_url(_R("localhost:8000")))
check("prod host still works",
      "forestry-pscpreparation" in A._reset_base_url(_R("forestry-pscpreparation.onrender.com")))

print("\n=== 10. NO PLAINTEXT HTTP FROM THE APP ===")
bad = subprocess.run(
    ["grep", "-rn", "http://", "/home/elfakiris/question-bank-unified/frontend-desktop/src",
     "/home/elfakiris/question-bank-unified/frontend-mobile/src",
     "--include=*.ts", "--include=*.tsx"],
    capture_output=True, text=True).stdout
lines = [l for l in bad.splitlines()
         if "http://" in l and "localhost" not in l and "127.0.0.1" not in l
         and "w3.org" not in l and "schema.org" not in l and "xmlns" not in l]
check("no plaintext http:// origins in app source", not lines, f"{len(lines)} found")
for l in lines[:3]:
    print("        ", l[:110])

print("\n=== 11. SERVICE WORKER DOES NOT CACHE CROSS-ACCOUNT DATA ===")
sw = open("/home/elfakiris/question-bank-unified/sw.js").read()
check("attempt detail excluded from cache", "/quiz/attempt/" in sw)
check("dashboard excluded from cache", "path === '/quiz/dashboard'" in sw)
check("cache name bumped to v10", "forestry-v10" in sw)
for app in ("frontend-desktop", "frontend-mobile"):
    off = open(f"/home/elfakiris/question-bank-unified/{app}/src/utils/offline.ts").read()
    check(f"{app} cache name in sync", "forestry-v10" in off)

print("\n=== 12. NO PLAINTEXT COMPARISON OF A SECRET ===")
ar = open("/home/elfakiris/question-bank-unified/backend/auth_router.py").read()
check("admin password uses compare_digest",
      "hmac.compare_digest(password, ADMIN_PASSWORD)" in ar)
check("no bare 'password != ADMIN_PASSWORD'", "password != ADMIN_PASSWORD" not in ar)

failed = [n for n, ok_, _ in results if not ok_]
print(f"\n{'=' * 62}")
print(f"  {len(results) - len(failed)}/{len(results)} checks passed")
if failed:
    print("  FAILED:")
    for n in failed:
        print(f"    - {n}")
print("=" * 62)
sys.exit(1 if failed else 0)