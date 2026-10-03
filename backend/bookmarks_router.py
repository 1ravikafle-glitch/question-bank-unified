from fastapi import APIRouter, Depends, HTTPException
from typing import Tuple
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import List
import models
import database
import session

router = APIRouter(prefix="/bookmarks", tags=["bookmarks"])


class ToggleRequest(BaseModel):
    user_identifier: str
    question_id: int = Field(..., ge=1, le=9223372036854775807)


def _username(caller: Tuple[str, bool], supplied: str) -> str:
    """Own data only.

    This used to be `caller[0] or (supplied or "anonymous")`, and every route
    below depended on session.current_user (which NEVER raises). An anonymous
    caller could therefore read, write and DELETE any named user's bookmarks just by
    putting their name in the path/body. Do not revert.
    """
    return caller[0]


@router.get("/{user_identifier}")
def list_bookmarks(
    user_identifier: str,
    db: Session = Depends(database.get_db),
    caller: Tuple[str, bool] = Depends(session.require_user),
):
    """Bookmarked questions, newest first, with total count."""
    user_identifier = _username(caller, user_identifier)
    rows = (
        db.query(models.Bookmark)
        .filter(models.Bookmark.user_identifier == user_identifier)
        # created_at alone is not enough to order by. SQLite renders the
        # server_default as CURRENT_TIMESTAMP, which has one-second resolution,
        # so every bookmark added in the same second ties and the sort falls
        # back to whatever the engine emits (in practice rowid/insertion
        # order). id is monotonic, so it breaks ties by true recency. Do not
        # drop it - rapid bookmarking would otherwise come back shuffled.
        .order_by(models.Bookmark.created_at.desc(), models.Bookmark.id.desc())
        .all()
    )
    ids = [r.question_id for r in rows]
    questions = (
        db.query(models.Question).filter(models.Question.id.in_(ids)).all()
        if ids
        else []
    )
    by_id = {q.id: q for q in questions}
    ordered = [by_id[i] for i in ids if i in by_id]
    return {"questions": ordered, "count": len(ordered)}


@router.get("/ids/{user_identifier}")
def bookmark_ids(
    user_identifier: str,
    db: Session = Depends(database.get_db),
    caller: Tuple[str, bool] = Depends(session.require_user),
):
    """Lightweight id set for marking bookmarked state in lists."""
    user_identifier = _username(caller, user_identifier)
    rows = (
        db.query(models.Bookmark.question_id)
        .filter(models.Bookmark.user_identifier == user_identifier)
        .all()
    )
    return {"ids": [r[0] for r in rows], "count": len(rows)}


@router.post("/toggle")
def toggle_bookmark(
    payload: ToggleRequest,
    db: Session = Depends(database.get_db),
    caller: Tuple[str, bool] = Depends(session.require_user),
):
    user_identifier = _username(caller, payload.user_identifier)
    existing = (
        db.query(models.Bookmark)
        .filter(
            models.Bookmark.user_identifier == user_identifier,
            models.Bookmark.question_id == payload.question_id,
        )
        .first()
    )
    try:
        if existing:
            db.delete(existing)
            bookmarked = False
        else:
            # Ignore unknown question ids instead of 500ing.
            q = (
                db.query(models.Question.id)
                .filter(models.Question.id == payload.question_id)
                .first()
            )
            if not q:
                raise HTTPException(status_code=404, detail="Question not found")
            db.add(
                models.Bookmark(
                    user_identifier=user_identifier,
                    question_id=payload.question_id,
                )
            )
            bookmarked = True
        db.commit()
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to toggle bookmark")
    count = (
        db.query(models.Bookmark)
        .filter(models.Bookmark.user_identifier == user_identifier)
        .count()
    )
    # Bookmarks feed the dashboard badge — bust the user's progress cache
    # so counts stay fresh (cheap: progress refetches on next visit).
    try:
        import app_cache

        app_cache.delete("prog:" + user_identifier)
    except Exception:
        pass
    try:
        import quiz_router
        quiz_router.drop_dashboard_cache(caller[0])
    except Exception:
        pass
    return {"bookmarked": bookmarked, "count": count}


@router.delete("/user/{user_identifier}")
def clear_bookmarks(
    user_identifier: str,
    db: Session = Depends(database.get_db),
    caller: Tuple[str, bool] = Depends(session.require_user),
):
    """Remove all bookmarks for a user (unbookmark-all)."""
    user_identifier = _username(caller, user_identifier)
    try:
        cleared = (
            db.query(models.Bookmark)
            .filter(models.Bookmark.user_identifier == user_identifier)
            .delete()
        )
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to clear bookmarks")
    try:
        import app_cache

        app_cache.delete("prog:" + user_identifier)
    except Exception:
        pass
    try:
        import quiz_router
        quiz_router.drop_dashboard_cache(caller[0])
    except Exception:
        pass
    return {"cleared": cleared}
