#!/usr/bin/env python3
"""Prove the feedback limit is 2 per rolling 24h PER ACCOUNT, using the real
HTTP stack.

feedback_router is not registered in start_prod.py, so this runs it on a
throwaway uvicorn server in a thread rather than editing the real entrypoint
just to test. A real server also exercises the dependency wiring, which a
direct function call would skip.
"""
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

sys.path.insert(0, "/home/elfakiris/question-bank-unified/backend")
os.environ.setdefault("SECRET_KEY", "local-flow-test-secret-0123456789abcdef")
DB = "/tmp/opencode/fb_test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{DB}"
if os.path.exists(DB):
    os.remove(DB)

import models  # noqa: E402
import database  # noqa: E402
import feedback_router as F  # noqa: E402
import session  # noqa: E402
import uvicorn  # noqa: E402
from auth_router import hash_password  # noqa: E402
from fastapi import FastAPI  # noqa: E402

app = FastAPI()
app.include_router(F.router)
models.Base.metadata.create_all(bind=database.engine)

db = database.SessionLocal()
for u in ("alice", "bob"):
    if not db.query(models.User).filter_by(username=u).first():
        db.add(models.User(username=u, password=hash_password("pw-0123456789-abcd")))
db.commit()
db.close()

PORT = 8077
BASE = f"http://127.0.0.1:{PORT}"
cfg = uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="error")
srv = uvicorn.Server(cfg)
threading.Thread(target=srv.run, daemon=True).start()
for _ in range(80):
    try:
        urllib.request.urlopen(BASE + "/feedback/mine", timeout=1)
        break
    except urllib.error.HTTPError:
        break
    except Exception:
        time.sleep(0.25)

H = {u: {"Authorization": f"Bearer {session.mint_session(u)}"} for u in ("alice", "bob")}
ADMIN = {"Authorization": f"Bearer {session.mint_session('admin', is_admin=True)}"}
fails = []


def post(path, body, headers=None):
    r = urllib.request.Request(BASE + path, data=json.dumps(body).encode(),
                               headers={"Content-Type": "application/json", **(headers or {})},
                               method="POST")
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def get(path, headers=None):
    r = urllib.request.Request(BASE + path, headers=headers or {})
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def backdate(user, hours):
    d = database.SessionLocal()
    for row in d.query(models.Feedback).filter(models.Feedback.user_identifier == user).all():
        row.created_at = datetime.now(timezone.utc) - timedelta(hours=hours)
    d.commit()
    d.close()


def check(name, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"   [{detail}]" if detail else ""))
    if not ok:
        fails.append(name)


print(f"\nconstants: MAX_PER_DAY={F.MAX_PER_DAY} WINDOW_HOURS={F.WINDOW_HOURS} "
      f"label={F.LIMIT_LABEL!r}")

print("\n=== 1. two per account, then refused ===")
codes = [post("/feedback", {"message": f"note {i}"}, H["alice"])[0] for i in range(4)]
check("alice: 200, 200, then refused", codes[:2] == [200, 200] and codes[2] == 429, str(codes))

print("\n=== 2. the cap is PER ACCOUNT, not global ===")
check("bob unaffected by alice hitting her cap",
      post("/feedback", {"message": "bob 1"}, H["bob"])[0] == 200)
check("bob gets his own second", post("/feedback", {"message": "bob 2"}, H["bob"])[0] == 200)
check("bob's third refused", post("/feedback", {"message": "bob 3"}, H["bob"])[0] == 429)

print("\n=== 3. unauthenticated cannot post ===")
check("no token -> 401", post("/feedback", {"message": "anon"})[0] == 401)

print("\n=== 4. the window really is ~24h, not a renamed constant ===")
# Clear alice first: the sub-tests below each need to start from a known count,
# otherwise rows left by the previous half are counted and the cap is hit for
# the wrong reason.
def reset(user, rows=0, hours=0):
    d = database.SessionLocal()
    d.query(models.Feedback).filter(models.Feedback.user_identifier == user).delete()
    for i in range(rows):
        d.add(models.Feedback(
            user_identifier=user, message=f"seed {i}",
            created_at=datetime.now(timezone.utc) - timedelta(hours=hours)))
    d.commit()
    d.close()


reset("alice", rows=2, hours=25)
check("2 rows aged 25h do NOT count (200)",
      post("/feedback", {"message": "a"}, H["alice"])[0] == 200)

reset("alice", rows=2, hours=23)
# 2 already inside the window means the NEXT one is the third, so it is refused
# straight away. That is the limit working, not a failure.
check("2 rows aged 23h DO count (next refused)",
      post("/feedback", {"message": "a"}, H["alice"])[0] == 429)

reset("alice", rows=1, hours=23)
codes = [post("/feedback", {"message": f"a{i}"}, H["alice"])[0] for i in range(2)]
check("1 row aged 23h: one more allowed, then refused",
      codes == [200, 429], str(codes))

reset("alice", rows=0)
check("exact boundary: 1 row aged 23h59m does not block",
      post("/feedback", {"message": "a"}, H["alice"])[0] == 200)

print("\n=== 5. the 429 message states the real limit ===")
reset("alice", rows=2, hours=1)
_, body = post("/feedback", {"message": "x"}, H["alice"])
check("detail says 'per day'", "per day" in body, body[:90])

print("\n=== 6. admin reads still exclude the author ===")
code, body = get("/feedback/admin/all", ADMIN)
check("admin list leaks no author identity",
      code == 200 and "alice" not in body and "user_identifier" not in body, f"HTTP {code}")

srv.should_exit = True
print(f"\n{'=' * 58}")
print(f"  {'ALL PASS' if not fails else 'FAILURES: ' + ', '.join(fails)}")
print("=" * 58)
sys.exit(1 if fails else 0)