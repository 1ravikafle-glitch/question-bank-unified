from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
import models
import database
import schemas
import hashlib
import json
import time

# Simple in-memory cache for read-only endpoints
_cache = {}
_cache_ttl = 60  # seconds

def _get_cached(key: str):
    if key in _cache:
        val, ts = _cache[key]
        if time.time() - ts < _cache_ttl:
            return val
    return None

def _set_cached(key: str, val):
    _cache[key] = (val, time.time())


class QuestionIdsRequest(BaseModel):
    question_ids: List[int]


class DeltaSyncRequest(BaseModel):
    known_ids: List[int] = []
    last_sync: Optional[str] = None


router = APIRouter(prefix="/questions", tags=["questions"])


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
    return questions


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
def get_question(question_id: int, db: Session = Depends(database.get_db)):
    question = db.query(models.Question).filter(models.Question.id == question_id).first()
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")
    return question


@router.post("/by-ids/", response_model=List[schemas.Question])
def get_questions_by_ids(
    payload: QuestionIdsRequest,
    db: Session = Depends(database.get_db),
):
    if not payload.question_ids:
        return []
    questions = db.query(models.Question).filter(models.Question.id.in_(payload.question_ids)).all()
    id_to_question = {q.id: q for q in questions}
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
    questions = query.order_by(models.Question.id.asc()).limit(500).all()
    return questions
