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
# TTL 60s; admin upload invalidates the whole "q:" namespace.
_QTTL = 60

def _get_cached(key: str):
    return app_cache.get("q:" + key)

def _set_cached(key: str, val):
    app_cache.set("q:" + key, val, _QTTL)


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


@router.get("/quote/random")
def get_random_quote(db: Session = Depends(database.get_db)):
    """One random motivational line for the dashboard greeting slot."""
    from sqlalchemy import func as _func
    import models as _m

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

    questions = query.offset(skip).limit(limit).all()
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
