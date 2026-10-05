from fastapi import APIRouter, Depends, HTTPException, Query, Path
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Annotated, List, Optional
import models
import database
import schemas
import hashlib
import json
import app_cache

# Read-only endpoints share one cache (memory now, Redis via REDIS_URL).
#
# The question bank changes ONLY through admin upload/category edits, and every
# one of those busts the whole "q:" namespace (see admin_router). So the TTL
# is not the correctness mechanism - invalidation is. 24h merely bounds
# staleness if a bust is ever missed. Per-user data has its own keys/TTLs.
_QTTL = 86400

def _get_cached(key: str):
    return app_cache.get("q:" + key)

def _set_cached(key: str, val):
    app_cache.set("q:" + key, val, _QTTL)


def warm_bank_cache(db) -> int:
    """Load every bank fact into the cache in a single GROUP BY.

    Called once at startup (see main.py) and after every admin write that
    busts the namespace. Returns the question total. Failure is silent by
    design: an unwarm cache is merely slow, never wrong - the endpoints
    populate it on demand exactly as before.
    """
    from sqlalchemy import func as _func

    try:
        rows = (
            db.query(models.Question.category, _func.count(models.Question.id))
            .group_by(models.Question.category)
            .all()
        )
    except Exception:
        return 0
    counts = {r[0] or "Uncategorized": r[1] for r in rows}
    total = sum(counts.values())
    cats = sorted(c for c in counts if c != "Uncategorized")
    try:
        _set_cached("category-counts", counts)
        _set_cached("count:None:None", {"count": total})
        _set_cached("categories", cats)
    except Exception:
        pass
    return total


def _normalize_options(questions):
    """SQLite stores options as a JSON string; normalize to dict for validation."""
    for q in questions:
        try:
            if isinstance(q.options, str):
                q.options = json.loads(q.options)
        except Exception:
            pass
    return questions


class QuestionIdsRequest(BaseModel):
    question_ids: List[Annotated[int, Field(ge=1, le=9223372036854775807)]]


class DeltaSyncRequest(BaseModel):
    known_ids: List[Annotated[int, Field(ge=1, le=9223372036854775807)]] = []
    last_sync: Optional[str] = None
    limit: int = 500


# Default emoji per known category (admin overrides via CategoryMeta).
DEFAULT_CATEGORY_EMOJI = {
    "Silviculture": "🌱",
    "Biodiversity & Wildlife Management": "🌿",
    "Soil Conservation And Watershed Management": "🏔️",
    "Forestry Research & Forest Survey": "📊",
    "Forest Management": "🌲",
    "Forest Utilization": "🪵",
    "Forest Law & Policy": "⚖️",
    "OfficerPracticeQns": "🏛️",
    "RangerPracticeQns": "🎖️",
    "GKPracticeQns": "🧠",
    "IQPracticeQns": "🧩",
    "लुम्बिनी प्रदेश वन ऐन, २०७८": "📜",
    "लुम्बिनी सुशासन ऐन एवम् नियमावली": "📜",
    " लुम्बिनी सुशासन ऐन एवम् नियमावली": "📜",
}


router = APIRouter(prefix="/questions", tags=["questions"])


# Style fix, applied once to pre-existing rows: the bundled quotes used em
# dashes as punchy separators ("X — Y"). They read as AI-generated tics, so
# seed_quotes.py now uses periods and colons instead - and this updates rows
# that were seeded before the change. Idempotent: rows without an em dash are
# untouched, and re-running changes nothing.
_QUOTE_FIXES = [
    ("Study like the result depends on it — it does.",
     "Study like the result depends on it. It does."),
    ("Read, recall, repeat — that is the whole secret.",
     "Read, recall, repeat: that is the whole secret."),
    ("Focus is a muscle — train it daily.",
     "Focus is a muscle. Train it daily."),
    ("Read actively — question every line.",
     "Read actively. Question every line."),
    ("Fear fades with familiarity — practice more.",
     "Fear fades with familiarity. Practice more."),
    ("Confusion today, clarity tomorrow — keep going.",
     "Confusion today, clarity tomorrow. Keep going."),
    ("Compare, contrast, connect — then remember.",
     "Compare, contrast, connect. Then remember."),
    ("Previous papers are prophecy — solve them.",
     "Previous papers are prophecy. Solve them."),
    ("Keep your streak alive — one quiz a day.",
     "Keep your streak alive: one quiz a day."),
    ("Finish what you start — every session counts.",
     "Finish what you start. Every session counts."),
]


def _fix_quote_dashes(db) -> None:
    """Replace em dashes in already-seeded quotes. Runs inside get_random_quote
    so it executes against whichever database is actually serving, exactly once
    per process boot at most (rows stop matching after the first pass)."""
    try:
        rows = db.query(models.Quote).filter(models.Quote.text.like("%—%")).all()
    except Exception:
        return
    if not rows:
        return
    fixed = 0
    for row in rows:
        text = row.text
        for old, new in _QUOTE_FIXES:
            if old in text:
                text = text.replace(old, new)
        # Any other em dash a custom quote may hold becomes a period break.
        if "—" in text:
            text = text.replace(" — ", ". ").replace("—", "")
        if text != row.text:
            row.text = text
            fixed += 1
    try:
        db.commit()
    except Exception:
        db.rollback()
        return
    if fixed:
        import sys as _sys

        print(f"[QUOTES] punctuation fixed on {fixed} row(s)", file=_sys.stderr)


@router.get("/quote/random")
def get_random_quote(db: Session = Depends(database.get_db)):
    """One random motivational line for the dashboard greeting slot."""
    from sqlalchemy import func as _func
    import models as _m

    # Style fix for rows seeded before the punctuation change.
    try:
        _fix_quote_dashes(db)
    except Exception:
        pass
    # Seed once from the bundled bank when empty.
    try:
        if db.query(_m.Quote).count() == 0:
            from seed_quotes import QUOTES

            db.add_all([_m.Quote(text=q) for q in QUOTES])
            db.commit()
    except Exception:
        db.rollback()
    row = db.query(_m.Quote).order_by(_func.random()).first()
    if row is None:
        return {"text": ""}
    return {"text": row.text}


# NOTE the trailing slash on the two credit routes below. The SPA catch-all in
# start_prod.py answers any path it recognises before FastAPI can redirect a
# slashless request, so a route declared "/references" is unreachable via
# "/references/" - the client gets index.html back, axios fails to parse it,
# and the .catch() swallows it. That is why the working routes here
# ("/count/", "/categories/", "/category-counts/") all carry a slash.


@router.get("/references/")
def get_references(db: Session = Depends(database.get_db)):
    """Book/source credits for the About section. Same for every user and
    changed only by admin writes (which bust the key), so it is cached like
    the other bank facts."""
    cached = _get_cached("references")
    if cached is not None:
        return cached
    try:
        rows = (
            db.query(models.Reference)
            .order_by(models.Reference.position, models.Reference.id)
            .all()
        )
        result = {"references": [
            {"id": r.id, "title": r.title, "author": r.author,
             "detail": r.detail, "url": r.url} for r in rows
        ]}
    except Exception:
        # Table predates this deployment (create_all runs at boot, but a
        # request can arrive first): empty list, not a 500.
        result = {"references": []}
    _set_cached("references", result)
    return result


@router.get("/contributors/")
def get_contributors(db: Session = Depends(database.get_db)):
    """Special-contribution credits for the About section.

    Identical for every user and changed only by admin writes (which bust the
    key), so it is cached exactly like the other bank facts.
    """
    cached = _get_cached("contributors")
    if cached is not None:
        return cached
    try:
        rows = (
            db.query(models.Contributor)
            .order_by(models.Contributor.position, models.Contributor.id)
            .all()
        )
        result = {"contributors": [
            {"id": c.id, "name": c.name, "role": c.role} for c in rows
        ]}
    except Exception:
        # A request can beat create_all() on a brand-new deploy; an empty
        # list, not a 500.
        result = {"contributors": []}
    _set_cached("contributors", result)
    return result


@router.get("/category-meta")
def get_category_meta(db: Session = Depends(database.get_db)):
    """Public: emoji per category (defaults merged with admin overrides)."""
    cache_key = "category-meta"
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached
    merged = dict(DEFAULT_CATEGORY_EMOJI)
    try:
        for row in db.query(models.CategoryMeta).all():
            if row.emoji:
                merged[row.category] = row.emoji
            elif row.category in merged:
                del merged[row.category]
    except Exception:
        pass
    result = {"emoji": merged}
    _set_cached(cache_key, result)
    return result


@router.get("/", response_model=List[schemas.Question])
def get_questions(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=10000),
    category: Optional[str] = None,
    difficulty: Optional[str] = None,
    db: Session = Depends(database.get_db),
):
    query = db.query(models.Question)

    if category:
        query = query.filter(models.Question.category == category)
    if difficulty:
        query = query.filter(models.Question.difficulty == difficulty)

    # ORDER BY is not cosmetic here. Without it Postgres may return rows in a
    # different order on every execution, and skip/limit paging then silently
    # DROPS rows between pages - measured on production: three pages of 1000
    # returned 2,999 of 3,298 rows. Any paged consumer (the admin manage list,
    # the library, offline sync) needs a deterministic order. Do not revert.
    questions = (
        query.order_by(models.Question.id).offset(skip).limit(limit).all()
    )
    return _normalize_options([q for q in questions if models.is_usable_question(q)])


@router.get("/count/")
def get_questions_count(
    category: Optional[str] = None,
    difficulty: Optional[str] = None,
    db: Session = Depends(database.get_db),
):
    cache_key = f"count:{category}:{difficulty}"
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    query = db.query(models.Question)

    if category:
        query = query.filter(models.Question.category == category)
    if difficulty:
        query = query.filter(models.Question.difficulty == difficulty)

    count = query.count()
    result = {"count": count}
    _set_cached(cache_key, result)
    return result


@router.get("/categories/", response_model=List[str])
def get_categories(db: Session = Depends(database.get_db)):
    cached = _get_cached("categories")
    if cached is not None:
        return cached

    categories = (
        db.query(models.Question.category)
        .distinct()
        .filter(models.Question.category.isnot(None))
        .all()
    )
    result = [category[0] for category in categories if category[0] is not None]
    _set_cached("categories", result)
    return result


@router.get("/category-counts/")
def get_category_counts(db: Session = Depends(database.get_db)):
    cached = _get_cached("category-counts")
    if cached is not None:
        return cached

    from sqlalchemy import func
    rows = (
        db.query(models.Question.category, func.count(models.Question.id))
        .group_by(models.Question.category)
        .all()
    )
    result = {r[0] or "Uncategorized": r[1] for r in rows}
    _set_cached("category-counts", result)
    return result


@router.get("/{question_id}", response_model=schemas.Question)
def get_question(question_id: int = Path(..., ge=1, le=9223372036854775807), db: Session = Depends(database.get_db)):
    question = db.query(models.Question).filter(models.Question.id == question_id).first()
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")
    _normalize_options([question])
    return question


@router.post("/by-ids/", response_model=List[schemas.Question])
def get_questions_by_ids(
    payload: QuestionIdsRequest,
    db: Session = Depends(database.get_db),
):
    if not payload.question_ids:
        return []
    questions = db.query(models.Question).filter(models.Question.id.in_(payload.question_ids)).all()
    usable = [q for q in questions if models.is_usable_question(q)]
    _normalize_options(usable)
    id_to_question = {q.id: q for q in usable}
    return [id_to_question[id] for id in payload.question_ids if id in id_to_question]


@router.get("/sync/version")
def get_sync_version(db: Session = Depends(database.get_db)):
    from sqlalchemy import func
    total = db.query(func.count(models.Question.id)).scalar() or 0
    latest = db.query(models.Question.id).order_by(models.Question.id.desc()).first()
    latest_id = latest[0] if latest else 0
    categories = (
        db.query(models.Question.category, func.count(models.Question.id))
        .group_by(models.Question.category)
        .all()
    )
    cat_hash = hashlib.md5(json.dumps({r[0]: r[1] for r in categories}, sort_keys=True).encode()).hexdigest()[:12]
    return {
        "total": total,
        "latest_id": latest_id,
        "categories_hash": cat_hash,
        "version": f"{latest_id}-{total}-{cat_hash}",
    }


@router.post("/sync/delta", response_model=List[schemas.Question])
def sync_delta(
    payload: DeltaSyncRequest,
    db: Session = Depends(database.get_db),
):
    query = db.query(models.Question)
    if payload.known_ids:
        query = query.filter(models.Question.id.notin_(payload.known_ids))
    limit = max(1, min(int(payload.limit or 500), 500))
    questions = query.order_by(models.Question.id.asc()).limit(limit).all()
    return questions
