"""User uploads: signed-in users contribute PDF/DOCX question papers.

Contributor flow (non-admin): /uploads/parse previews what was found (no
writes), then /uploads/requests parks the parsed questions as a PENDING
request. Nothing reaches the question bank until an admin approves it via
/admin/contributions/{id}/approve. A contributor may hold at most
MAX_PENDING_CONTRIBUTIONS (5) awaiting review; each accept or reject frees a
slot, and a rejection carries a reason back to the contributor.

Admin flow: /uploads/import commits straight into the bank (unlimited, no
queue), tagged source=user:<admin> so admin content stays distinguishable
from the curated bank. Same dedupe rules for both paths.
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

# A contributor may hold at most this many requests awaiting review. Each admin
# accept OR reject moves one out of 'pending' and frees a slot. Admins bypass
# this entirely (they import straight into the bank). Do not revert.
MAX_PENDING_CONTRIBUTIONS = 5

# Per-request resource guards. MAX_BYTES only bounds a single FILE, so an
# anonymous or impatient caller could otherwise post unbounded files in one
# request and make the server do unbounded parsing work.
MAX_FILES_PER_REQUEST = 5
MAX_QUESTIONS_PER_UPLOAD = 2000


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
    admin_user: str = Depends(session.require_admin),
):
    """Parse + insert straight into the bank. ADMIN ONLY, unlimited, no queue.

    Contributors must use /uploads/requests instead so an admin reviews their
    upload first. This endpoint used to depend on ``current_user`` (which never
    raises) and fall back to ``username = "anonymous"``, so ANY anonymous
    caller could write rows into the live question bank. Do not revert.
    """
    username = admin_user
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


# ── Contributor review queue ────────────────────────────────────────────────
# Contributors park parsed questions here; an admin approval is the only thing
# that inserts them into the bank. See module docstring for the quota rule.

@router.get("/requests/mine")
def my_requests(
    db: Session = Depends(database.get_db),
    caller: Tuple[str, bool] = Depends(session.require_user),
):
    """The caller's own requests, newest first, with any rejection reason."""
    rows = (
        db.query(models.ContributionRequest)
        .filter(models.ContributionRequest.user_identifier == caller[0])
        .order_by(models.ContributionRequest.created_at.desc())
        .all()
    )
    pending = sum(1 for r in rows if r.status == "pending")
    return {
        "pending": pending,
        "max_pending": MAX_PENDING_CONTRIBUTIONS,
        "remaining": max(0, MAX_PENDING_CONTRIBUTIONS - pending),
        "requests": [
            {
                "id": r.id,
                "filename": r.filename,
                "category": r.category,
                "status": r.status,
                "question_count": r.question_count,
                "with_answer": r.with_answer,
                # Only meaningful on a rejection.
                "admin_note": r.admin_note,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
            }
            for r in rows
        ],
    }


@router.post("/requests")
async def submit_request(
    files: List[UploadFile] = File(...),
    category: Optional[str] = Form(None),
    db: Session = Depends(database.get_db),
    caller: Tuple[str, bool] = Depends(session.require_user),
):
    """Submit a PDF/DOCX for admin review. Writes nothing to the bank."""
    username = caller[0]

    def pending_count() -> int:
        return (
            db.query(models.ContributionRequest)
            .filter(
                models.ContributionRequest.user_identifier == username,
                models.ContributionRequest.status == "pending",
            )
            .count()
        )

    if pending_count() >= MAX_PENDING_CONTRIBUTIONS:
        raise HTTPException(
            status_code=429,
            detail=(
                f"You already have {pending_count()} uploads waiting for review "
                f"(max {MAX_PENDING_CONTRIBUTIONS}). An admin must accept or "
                f"reject one before you can send another."
            ),
        )

    # Resource guards. These bound CPU/memory per request, not just per file.
    if len(files) > MAX_FILES_PER_REQUEST:
        raise HTTPException(
            status_code=400,
            detail=f"At most {MAX_FILES_PER_REQUEST} files per request (got {len(files)}).",
        )
    if sum(f.size or 0 for f in files) > MAX_BYTES * MAX_FILES_PER_REQUEST:
        raise HTTPException(status_code=400, detail="Total upload size too large.")

    # Per-file outcomes. One bad file must not discard its valid siblings —
    # /uploads/parse already reports per-file errors, so this matches it.
    created = []
    rejected: List[dict] = []
    for upload in files:
        raw = await upload.read()
        if len(raw) > MAX_BYTES:
            rejected.append({"filename": upload.filename or "", "error": "File over 10MB"})
            continue
        try:
            parsed, cat = _parse_upload(upload.filename or "", raw, category)
        except HTTPException as e:
            rejected.append({"filename": upload.filename or "", "error": e.detail})
            continue
        except Exception as e:
            rejected.append({"filename": upload.filename or "", "error": f"Failed to parse: {e}"})
            continue

        # Cap the stored blob: MAX_BYTES only bounds the FILE, and a 200-page
        # PDF can parse to ~26k questions (~8MB of JSON) from a legal upload.
        if len(parsed) > MAX_QUESTIONS_PER_UPLOAD:
            rejected.append({
                "filename": upload.filename or "",
                "error": f"Too many questions ({len(parsed)}); max {MAX_QUESTIONS_PER_UPLOAD}.",
            })
            continue

        with_answer = sum(1 for q in parsed if q.get("correct_answer"))
        # An answer-less paper can never import anything, so don't let it burn
        # a quota slot and a full admin review cycle.
        if with_answer == 0:
            rejected.append({
                "filename": upload.filename or "",
                "error": "No questions with answers were found — nothing would be imported.",
            })
            continue

        row = models.ContributionRequest(
            user_identifier=username,
            filename=(upload.filename or "upload")[:255],
            category=cat,
            status="pending",
            question_count=len(parsed),
            with_answer=with_answer,
            # Park the parsed questions; they only reach the bank on approval.
            payload=[
                {
                    "question_number": q.get("question_number", 0),
                    "question_text": q.get("question_text", ""),
                    "options": q.get("options", {}),
                    "correct_answer": q.get("correct_answer", ""),
                }
                for q in parsed
            ],
        )
        db.add(row)
        created.append(row)
        # Re-check the cap PER FILE. It used to be checked once per request, so
        # a single POST with many files created many rows and sailed past the
        # limit of 5. Do not revert.
        if pending_count() + len(created) >= MAX_PENDING_CONTRIBUTIONS:
            break

    if not created:
        # Nothing survived — do not leave the rejected files unaccounted for.
        if rejected:
            raise HTTPException(
                status_code=400,
                detail="; ".join(f"{r['filename']}: {r['error']}" for r in rejected),
            )
        raise HTTPException(status_code=400, detail="No usable files in request.")

    try:
        db.commit()
        for row in created:
            db.refresh(row)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not save your submission. Please retry.")
    return {
        "rejected": rejected,
        "submitted": [
            {
                "id": r.id,
                "filename": r.filename,
                "category": r.category,
                "question_count": r.question_count,
                "with_answer": r.with_answer,
            }
            for r in created
        ],
        "status": "pending_review",
    }
