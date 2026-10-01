from fastapi import APIRouter, Depends, HTTPException
from typing import Tuple
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional
import models
import database
import session

router = APIRouter(prefix="/notes", tags=["notes"])


class NoteUpsert(BaseModel):
    user_identifier: str
    question_id: int = Field(..., ge=1, le=9223372036854775807)
    text: str = ""


def _username(caller: Tuple[str, bool], supplied: str) -> str:
    """Own data only.

    This used to be `caller[0] or (supplied or "anonymous")`, and every route
    below depended on session.current_user (which NEVER raises). An anonymous
    caller could therefore read, write and DELETE any named user's notes just by
    putting their name in the path/body. Do not revert.
    """
    return caller[0]


@router.get("/{user_identifier}")
def list_notes(
    user_identifier: str,
    db: Session = Depends(database.get_db),
    caller: Tuple[str, bool] = Depends(session.require_user),
):
    """All personal notes as {question_id: text} (empty text rows omitted)."""
    user_identifier = _username(caller, user_identifier)
    rows = (
        db.query(models.QuestionNote)
        .filter(models.QuestionNote.user_identifier == user_identifier)
        .all()
    )
    return {
        "notes": {r.question_id: r.text for r in rows if r.text},
        "count": len(rows),
    }


@router.put("")
def upsert_note(
    payload: NoteUpsert,
    db: Session = Depends(database.get_db),
    caller: Tuple[str, bool] = Depends(session.require_user),
):
    """Save (or clear, when text is empty) a personal note on a question."""
    user_identifier = _username(caller, payload.user_identifier)
    text = (payload.text or "").strip()
    # Clearing is allowed for an already-stored note even if the question was
    # since deleted - otherwise the user could never get rid of the orphan.
    row = (
        db.query(models.QuestionNote)
        .filter(
            models.QuestionNote.user_identifier == user_identifier,
            models.QuestionNote.question_id == payload.question_id,
        )
        .first()
    )
    if not text:
        if row:
            try:
                db.delete(row)
                db.commit()
            except Exception:
                db.rollback()
                raise HTTPException(status_code=500, detail="Failed to clear note")
        return {"saved": False, "cleared": True}

    # Writing a note for a question that does not exist creates data nothing
    # can ever display or attach to, and it stays in the user's note count
    # forever. Mirrors the 404 that /bookmarks/toggle already returns.
    question_exists = (
        db.query(models.Question.id)
        .filter(models.Question.id == payload.question_id)
        .first()
    )
    if not question_exists:
        raise HTTPException(status_code=404, detail="Question not found")

    try:
        if row:
            row.text = text
        else:
            db.add(
                models.QuestionNote(
                    user_identifier=user_identifier,
                    question_id=payload.question_id,
                    text=text,
                )
            )
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save note")
    return {"saved": True, "cleared": False}
