"""Anonymous user feedback with private admin replies.

Privacy design (read the model docstring too):
- The author is authenticated (rate limit + own-thread visibility need it).
- Admin reads NEVER include user_identifier, and responses are shaped to
  exclude it structurally - not by forgetting a field, but because the admin
  serializer has no path to it.
- Authors see only their own threads (caller-scoped, like progress).
- 2 messages per rolling 6 hours per account. The count query is indexed.
"""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import List, Optional, Tuple

import models
import database
import session

router = APIRouter(prefix="/feedback", tags=["feedback"])

MAX_PER_WINDOW = 2
WINDOW_HOURS = 6
MAX_LEN = 2000
VALID_STATUSES = {"pending", "accepted", "applied", "rejected"}


class FeedbackCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=MAX_LEN)


class FeedbackReply(BaseModel):
    reply: str = Field(..., min_length=1, max_length=MAX_LEN)
    status: str = Field(default="applied")


def _window_start() -> datetime:
    return datetime.now(timezone.utc) - timedelta(hours=WINDOW_HOURS)


def _public_shape(r: models.Feedback) -> dict:
    """What the AUTHOR sees: full thread, no identity needed (it is theirs)."""
    return {
        "id": r.id,
        "message": r.message,
        "status": r.status,
        "admin_reply": r.admin_reply,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "replied_at": r.replied_at.isoformat() if r.replied_at else None,
    }


def _admin_shape(r: models.Feedback) -> dict:
    """What ADMIN sees: everything except who wrote it. user_identifier is
    deliberately unreachable here - there is no field for it to leak from."""
    return {
        "id": r.id,
        "message": r.message,
        "status": r.status,
        "admin_reply": r.admin_reply,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "replied_at": r.replied_at.isoformat() if r.replied_at else None,
    }


@router.post("")
def submit_feedback(
    payload: FeedbackCreate,
    db: Session = Depends(database.get_db),
    caller: Tuple[str, bool] = Depends(session.require_user),
):
    user = caller[0]
    text = (payload.message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Feedback cannot be empty.")
    recent = (
        db.query(models.Feedback)
        .filter(
            models.Feedback.user_identifier == user,
            models.Feedback.created_at >= _window_start(),
        )
        .count()
    )
    if recent >= MAX_PER_WINDOW:
        raise HTTPException(
            status_code=429,
            detail=f"Limit reached: {MAX_PER_WINDOW} suggestions per {WINDOW_HOURS} hours. Try again later.",
        )
    try:
        row = models.Feedback(user_identifier=user, message=text[:MAX_LEN])
        db.add(row)
        db.commit()
        db.refresh(row)
        return _public_shape(row)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not save feedback.")


@router.get("/mine")
def my_feedback(
    db: Session = Depends(database.get_db),
    caller: Tuple[str, bool] = Depends(session.require_user),
):
    """The caller's own threads with admin replies. Nothing else's."""
    user = caller[0]
    rows = (
        db.query(models.Feedback)
        .filter(models.Feedback.user_identifier == user)
        .order_by(models.Feedback.created_at.desc())
        .limit(50)
        .all()
    )
    return {"feedback": [_public_shape(r) for r in rows]}


@router.get("/admin/all")
def admin_list_feedback(
    db: Session = Depends(database.get_db),
    caller: Tuple[str, bool] = Depends(session.require_admin),
):
    """Every thread, newest first - with NO author identity (see _admin_shape)."""
    rows = (
        db.query(models.Feedback)
        .order_by(models.Feedback.created_at.desc())
        .limit(200)
        .all()
    )
    pending = (
        db.query(models.Feedback)
        .filter(models.Feedback.status == "pending")
        .count()
    )
    return {"feedback": [_admin_shape(r) for r in rows], "pending": pending}


@router.post("/admin/{fb_id}/reply")
def admin_reply_feedback(
    fb_id: int,
    payload: FeedbackReply,
    db: Session = Depends(database.get_db),
    caller: Tuple[str, bool] = Depends(session.require_admin),
):
    status = (payload.status or "").strip().lower()
    if status not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Status must be one of: {', '.join(sorted(VALID_STATUSES))}.",
        )
    try:
        row = db.query(models.Feedback).filter(models.Feedback.id == fb_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Feedback not found.")
        row.admin_reply = (payload.reply or "").strip()[:MAX_LEN]
        row.status = status
        row.replied_at = datetime.now(timezone.utc)
        db.commit()
        return _admin_shape(row)
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not save reply.")
