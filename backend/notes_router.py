from fastapi import APIRouter, Depends, HTTPException
from typing import Tuple
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
import models
import database
import session

router = APIRouter(prefix="/notes", tags=["notes"])


class NoteUpsert(BaseModel):
    user_identifier: str
    question_id: int
    text: str = ""


def _username(caller: Tuple[None, bool], supplied: str) -> str:
    return caller[0] or (supplied or "anonymous")


@router.get("/{user_identifier}")
def list_notes(
    user_identifier: str,
    db: Session = Depends(database.get_db),
    caller: Tuple[None, bool] = Depends(session.current_user),
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
    caller: Tuple[None, bool] = Depends(session.current_user),
):
    """Save (or clear, when text is empty) a personal note on a question."""
    user_identifier = _username(caller, payload.user_identifier)
    text = (payload.text or "").strip()
    try:
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
                db.delete(row)
            db.commit()
            return {"saved": False, "cleared": True}
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
