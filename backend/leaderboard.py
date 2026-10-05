"""Weekly global ranking.

Reads the append-only `user_progress` history (one row per question per
attempt, stamped with attempted_at) and ranks every eligible account for the
current Sunday-to-Sunday window. No extra table: the history the app already
writes is exactly what a weekly leaderboard needs, including questions a
user has since got right.

Three rules, all deliberate:

1. Eligibility is volume in the window, not lifetime. A rank has to be
   earned inside the week it applies to, or someone could coast on last
   month's effort. Distinct questions attempted must be strictly greater
   than MIN_DISTINCT_QUESTIONS - "more than 500", so 501 qualifies.

2. Accuracy is the multiplier, so it decides the order. Volume only scales
   the result and with a logarithm, which means grinding the whole bank
   cannot overtake simply being accurate. Someone on 3,301 questions at 60%
   scores 211; someone at 85% scores 299.

3. Names are masked before they leave the server. Nobody else ever receives a
   real name, so there is nothing about another account in the response, the
   DOM or a devtools tab. The one exception is the requesting account's own
   row, which is unmasked: seeing your own handle is how you recognise it.
"""
import math
import os
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

import app_cache
import database
import models
from sqlalchemy import func, select

try:
    from zoneinfo import ZoneInfo

    _TZ = ZoneInfo(os.environ.get("LEADERBOARD_TZ") or "Asia/Kathmandu")
except Exception:  # no tzdata on this host: Nepal is a fixed +05:45
    _TZ = timezone(timedelta(hours=5, minutes=45))

MIN_DISTINCT_QUESTIONS = 500
LEADERBOARD_TTL_SECONDS = 300
TOP_N = 100


def week_window(now: Optional[datetime] = None) -> Tuple[datetime, datetime]:
    """The current Sunday-to-Sunday window, in the leaderboard timezone.

    Sunday 00:00 through the next Sunday 00:00, so the board empties and
    rebuilds exactly once a week. `now` is read in the leaderboard timezone
    rather than UTC, otherwise the boundary would land at 06:00 Nepal time
    for part of the year.
    """
    now = now or datetime.now(_TZ)
    if now.tzinfo is None:
        now = now.replace(tzinfo=_TZ)
    local = now.astimezone(_TZ)
    # weekday(): Monday=0 .. Sunday=6. Days since the last Sunday.
    days_since_sunday = (local.weekday() + 1) % 7
    start_local = (local - timedelta(days=days_since_sunday)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return start_local, start_local + timedelta(days=7)


def mask_name(name: Optional[str]) -> str:
    """'Elfak' -> 'E***k'. Fixed-width so the mask leaks no length.

    A single character cannot be masked on both ends without revealing
    everything, so it is shown whole; two characters keep both.
    """
    if not name:
        return "A***?"
    cleaned = name.strip()
    if not cleaned:
        return "A***?"
    # Use the given name only: a masked surname would still narrow the field.
    token = cleaned.split()[0]
    if len(token) <= 1:
        return token
    if len(token) == 2:
        return f"{token[0]}***{token[1]}"
    return f"{token[0]}***{token[-1]}"


def score_for(accuracy_pct: float, distinct_questions: int) -> float:
    """accuracy x (1 + log10(distinct questions)), rounded to 1dp.

    The rounding is part of the contract, not presentation tidiness: the
    breakdown printed next to the score is generated from this same function,
    so a row whose arithmetic does not add up would be a row that cannot be
    checked by the person reading it.
    """
    if distinct_questions <= 0:
        return 0.0
    return round(accuracy_pct * (1.0 + math.log10(distinct_questions)), 1)


def breakdown_for(accuracy_pct: float, distinct_questions: int) -> str:
    """The arithmetic, spelled out, so the number is not a black box.

    Both the percentages and the result printed here are the exact values that
    produced the score, so multiplying them by hand gives the number shown.
    """
    return (
        f"{accuracy_pct:.1f}% x (1 + log10 {distinct_questions:,})"
        f" = {score_for(accuracy_pct, distinct_questions):.1f} pts"
    )


def ensure_indexes() -> None:
    """Index attempted_at on its own.

    create_all() only builds missing tables, so adding this to the model
    would not help an existing database - and the weekly rollup filters on
    attempted_at before grouping by user.
    """
    try:
        insp = __import__("sqlalchemy").inspect(database.engine)
        names = {i["name"] for i in insp.get_indexes("user_progress")}
        if "ix_user_progress_attempted_at" not in names:
            with database.engine.begin() as conn:
                conn.execute(
                    __import__("sqlalchemy").text(
                        "CREATE INDEX ix_user_progress_attempted_at ON user_progress (attempted_at)"
                    )
                )
    except Exception as exc:
        print(f"[LEADERBOARD] attempted_at index skipped: {exc}")


def compute(viewer: Optional[str] = None) -> dict:
    start, end = week_window()
    cache_key = f"leaderboard:{start.isoformat()}"
    cached = app_cache.get(cache_key)
    if cached is not None:
        rows = cached
    else:
        ensure_indexes()
        answered = func.count()
        distinct_q = func.count(func.distinct(models.UserProgress.question_id))
        correct = func.sum(
            func.cast(models.UserProgress.is_correct, __import__("sqlalchemy").Integer)
        )
        stmt = (
            select(
                models.UserProgress.user_identifier,
                answered.label("answered"),
                distinct_q.label("distinct_questions"),
                correct.label("correct"),
            )
            .where(
                models.UserProgress.attempted_at >= start,
                models.UserProgress.attempted_at < end,
                models.UserProgress.user_identifier.isnot(None),
            )
            .group_by(models.UserProgress.user_identifier)
            .having(distinct_q > MIN_DISTINCT_QUESTIONS)
        )
        rows = [
            {
                "user_identifier": r.user_identifier,
                "answered": int(r.answered or 0),
                "distinct_questions": int(r.distinct_questions or 0),
                "correct": int(r.correct or 0),
            }
            for r in database.SessionLocal().execute(stmt).all()
        ]
        app_cache.set(cache_key, rows, LEADERBOARD_TTL_SECONDS)

    # Rank before slicing: the viewer's own row must be findable even when
    # they are outside the top N.
    scored = []
    for r in rows:
        # Round the accuracy FIRST, then score it. Scoring the raw ratio and
        # displaying the rounded one is how a breakdown ends up printing an
        # equation that does not produce the number beside it.
        accuracy = round((r["correct"] / r["answered"] * 100.0) if r["answered"] else 0.0, 1)
        scored.append(
            {
                "user_identifier": r["user_identifier"],
                "name": mask_name(r["user_identifier"]),
                "questions": r["distinct_questions"],
                "answered": r["answered"],
                "correct": r["correct"],
                "accuracy": accuracy,
                "score": score_for(accuracy, r["distinct_questions"]),
            }
        )
    # Score desc, then accuracy desc, then more questions, then name, so the
    # order is total and stable between reloads.
    scored.sort(key=lambda x: (-x["score"], -x["accuracy"], -x["questions"], x["name"]))
    for i, row in enumerate(scored, start=1):
        row["rank"] = i

    top = scored[:TOP_N]
    viewer_row = next((r for r in scored if viewer and r["user_identifier"] == viewer), None)

    # Unmask the viewer's own row and nobody else's. Your own handle is not a
    # secret from you, and seeing it is the only way to recognise your row
    # without a "this is you" label sitting next to a name you already know.
    # Every other account stays masked, and the substitution happens here so no
    # unmasked name ever exists in the response for another account.
    for row in top:
        row["is_you"] = bool(viewer and row["user_identifier"] == viewer)
        if row["is_you"]:
            row["name"] = row["user_identifier"]
        row["breakdown"] = breakdown_for(row["accuracy"], row["questions"])
        row.pop("user_identifier", None)
    if viewer_row and viewer_row not in top:
        viewer_row = dict(viewer_row)
        viewer_row["is_you"] = True
        viewer_row["name"] = viewer_row.pop("user_identifier")
        viewer_row["breakdown"] = breakdown_for(viewer_row["accuracy"], viewer_row["questions"])

    return {
        "window": {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "timezone": str(_TZ),
            "label": f"{start.strftime('%d %b')} – {(end - timedelta(days=1)).strftime('%d %b')}",
        },
        "eligibility": {"min_distinct_questions": MIN_DISTINCT_QUESTIONS},
        "formula": "score = accuracy% x (1 + log10(distinct questions))",
        "rows": top,
        "eligible_count": len(scored),
        "you": viewer_row,
    }
