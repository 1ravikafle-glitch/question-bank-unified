"""User uploads: anyone signed in can contribute PDF/DOCX question papers.

Two-step flow: /uploads/parse previews what was found (no writes),
/uploads/import commits with source=user:<name> so user content stays
distinguishable from the curated bank. Same dedupe rules as admin import.
"""
import io
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Tuple

import models
import database
import session
import app_cache
from docx_parser import extract_questions_and_answers, guess_category_from_filename
from pdf_parser import extract_questions_and_answers_pdf

router = APIRouter(prefix="/uploads", tags=["uploads"])

MAX_BYTES = 10 * 1024 * 1024


def _parse_upload(filename: str, raw: bytes, category: Optional[str]):
    name = (filename or "").lower()
    if name.endswith(".docx"):
        parsed = extract_questions_and_answers(io.BytesIO(raw))
        cat = category or guess_category_from_filename(filename or "")
    elif name.endswith(".pdf"):
        cat = category or "Unknown"
        parsed = extract_questions_and_answers_pdf(raw, cat)
    else:
        raise HTTPException(status_code=400, detail="Only .pdf and .docx files are supported")
    return parsed, cat


def _to_preview(parsed):
    return [
        {
            "question_number": q.get("question_number", 0),
            "question_text": (q.get("question_text") or "")[:160],
            "options": q.get("options", {}),
            "correct_answer": q.get("correct_answer", ""),
            "has_answer": bool(q.get("correct_answer")),
        }
        for q in parsed[:5]
    ]


@router.post("/parse")
async def parse_upload(
    files: List[UploadFile] = File(...),
    category: Optional[str] = Form(None),
    db: Session = Depends(database.get_db),
    caller: Tuple[None, bool] = Depends(session.current_user),
):
    """Parse-only preview: counts + first questions, nothing saved."""
    out = []
    for upload in files:
        raw = await upload.read()
        if len(raw) > MAX_BYTES:
            out.append({"filename": upload.filename, "error": "File over 10MB"})
            continue
        try:
            parsed, cat = _parse_upload(upload.filename or "", raw, category)
        except HTTPException as e:
            out.append({"filename": upload.filename, "error": e.detail})
            continue
        except Exception as e:
            out.append({"filename": upload.filename, "error": f"Failed to parse file: {e}"})
            continue
        with_answer = sum(1 for q in parsed if q.get("correct_answer"))
        out.append(
            {
                "filename": upload.filename,
                "category": cat,
                "found": len(parsed),
                "with_answer": with_answer,
                "preview": _to_preview(parsed),
            }
        )
    return {"files": out}


@router.post("/import")
async def import_upload(
    files: List[UploadFile] = File(...),
    category: Optional[str] = Form(None),
    db: Session = Depends(database.get_db),
    caller: Tuple[str, bool] = Depends(session.require_user),
):
    """Parse + insert. Skips duplicates and answer-less questions.

    Requires a session. This used to depend on ``current_user`` (which never
    raises) and then fall back to ``username = "anonymous"``, so ANY anonymous
    caller could write rows into the live question bank. Do not revert.
    """
    username = caller[0]
    results = []
    total_imported = 0
    for upload in files:
        raw = await upload.read()
        if len(raw) > MAX_BYTES:
            results.append({"filename": upload.filename, "error": "File over 10MB"})
            continue
        try:
            parsed, cat = _parse_upload(upload.filename or "", raw, category)
        except HTTPException as e:
            results.append({"filename": upload.filename, "error": e.detail})
            continue
        except Exception as e:
            results.append({"filename": upload.filename, "error": f"Failed to parse file: {e}"})
            continue

        imported = skipped = skipped_no_answer = 0
        for q in parsed:
            if not q.get("correct_answer"):
                skipped_no_answer += 1
                continue
            exists = (
                db.query(models.Question)
                .filter(
                    models.Question.question_text == q["question_text"],
                    models.Question.category == cat,
                )
                .first()
            )
            if exists:
                skipped += 1
                continue
            db.add(
                models.Question(
                    question_number=q.get("question_number", 0),
                    question_text=q["question_text"],
                    options=q.get("options", {}),
                    correct_answer=str(q["correct_answer"]).strip().lower()[:1],
                    category=cat,
                    difficulty=None,
                    source=f"user:{username}",
                )
            )
            imported += 1
        try:
            db.commit()
            app_cache.delete_prefix("q:")
        except Exception:
            db.rollback()
            results.append({"filename": upload.filename, "error": "Database commit failed"})
            continue
        total_imported += imported
        results.append(
            {
                "filename": upload.filename,
                "category": cat,
                "imported": imported,
                "skipped_duplicate": skipped,
                "skipped_no_answer": skipped_no_answer,
            }
        )
    return {"files": results, "total_imported": total_imported}
