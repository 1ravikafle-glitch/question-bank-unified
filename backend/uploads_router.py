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
import sys
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


def _ensure_contrib_kind_column():
    """ADD COLUMN migration for contribution_requests.kind (idempotent).

    create_all() only creates missing tables, so a deployment that already has
    contribution_requests never gains the column. Guarded by a column check so
    running it on every boot is safe on both SQLite and Postgres.
    """
    try:
        from sqlalchemy import inspect, text as _text

        insp = inspect(database.engine)
        try:
            cols = {c["name"] for c in insp.get_columns("contribution_requests")}
        except Exception:
            return  # table doesn't exist yet — create_all covers it
        if "kind" not in cols:
            with database.engine.begin() as conn:
                conn.execute(
                    _text("ALTER TABLE contribution_requests ADD COLUMN kind TEXT")
                )
            print("[UPLOAD] contribution_requests (+1 col: kind)", file=sys.stderr)
    except Exception as e:
        print(f"[UPLOAD] kind migration skipped: {e}", file=sys.stderr)


_ensure_contrib_kind_column()

# The two things a contributor can send. Anything else is coerced to the
# default so a hand-crafted request can't smuggle an unknown value into the
# admin review list.
CONTRIB_KINDS = ("past_paper", "questions")


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
    caller: Tuple[str, bool] = Depends(session.require_user),
):
    """Parse-only preview: counts + first questions, nothing saved.

    Requires a session. This depended on session.current_user (which never
    raises), so ANY anonymous caller could make the server do unbounded
    parsing work — 30 files took 5.7s. Do not revert.
    """
    if len(files) > MAX_FILES_PER_REQUEST:
        raise HTTPException(
            status_code=400,
            detail=f"At most {MAX_FILES_PER_REQUEST} files per request (got {len(files)}).",
        )
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
        # id tie-break for same-second submissions.
        .order_by(models.ContributionRequest.created_at.desc(), models.ContributionRequest.id.desc())
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


# ── Public past papers list (approved contributions) ────────────────────────────
@router.get("/past-papers")
def list_past_papers(
    db: Session = Depends(database.get_db),
    # No auth required - public list of approved papers
):
    """List all approved contribution papers for viewing/downloading."""
    rows = (
        db.query(models.ContributionRequest)
        .filter(models.ContributionRequest.status == "approved")
        .order_by(models.ContributionRequest.reviewed_at.desc(), models.ContributionRequest.id.desc())
        .all()
    )
    return {
        "papers": [
            {
                "id": r.id,
                "filename": r.filename,
                "category": r.category,
                "kind": r.kind or "questions",
                "question_count": r.question_count,
                "with_answer": r.with_answer,
                "approved_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
                "payload": r.payload,  # Full parsed questions for viewing
            }
            for r in rows
        ],
    }


def _paper_docx(r: models.ContributionRequest) -> bytes:
    """Rebuild a downloadable DOCX for an approved contribution.

    The uploaded original is never stored - only the parsed questions are, so
    that approving a contribution inserts exactly what was reviewed. The paper
    is therefore re-rendered from that payload rather than replayed from disk.
    """
    from docx import Document
    from docx.shared import Pt

    doc = Document()
    # Headings strip the extension: "report.docx" as a title reads wrong.
    base = (r.filename or "").rsplit(".", 1)[0] or "Past question paper"
    doc.add_heading(base, level=1)
    meta = []
    if r.category:
        meta.append(f"Category: {r.category}")
    meta.append(f"Questions: {r.question_count}")
    meta.append(f"With answer: {'yes' if r.with_answer else 'no'}")
    doc.add_paragraph("  |  ".join(meta))

    rows = r.payload if isinstance(r.payload, list) else []
    for i, q in enumerate(rows, 1):
        if not isinstance(q, dict):
            continue
        # Bare "N. " rather than "Q1. ": docx_parser keys question starts off
        # `^\d+\.\s`, so a paper someone downloads here can be re-uploaded here
        # and still parse into the same three questions.
        doc.add_paragraph(
            f"{i}. {q.get('question_text') or q.get('question') or ''}".strip()
        )
        opts = q.get("options") or {}
        if isinstance(opts, dict):
            for key in sorted(opts):
                line = opts[key]
                if not line:
                    continue
                doc.add_paragraph(
                    line if str(line).lower().startswith(f"{key}.") else f"{key}. {line}",
                    style="List Bullet",
                )
        elif isinstance(opts, list):
            for j, line in enumerate(opts):
                if line:
                    doc.add_paragraph(
                        f"{chr(97 + j)}. {line}",
                        style="List Bullet",
                    )
        ans = q.get("answer") or q.get("correct_answer") or q.get("correct")
        if ans:
            doc.add_paragraph(f"Answer: {ans}")
        doc.add_paragraph("")

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


@router.get("/past-papers/{paper_id}/download")
def download_past_paper(
    paper_id: int,
    db: Session = Depends(database.get_db),
):
    """Serve an approved paper as a DOCX built from its stored questions.

    Public, like the list: these are already-approved papers. The filename
    keeps the .docx suffix regardless of what the contributor originally sent,
    because that is genuinely what this response contains.
    """
    from fastapi.responses import Response

    row = (
        db.query(models.ContributionRequest)
        .filter(
            models.ContributionRequest.id == paper_id,
            models.ContributionRequest.status == "approved",
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="That paper is not available.")

    data = _paper_docx(row)
    base = (row.filename or f"past-paper-{paper_id}").rsplit(".", 1)[0]
    # RFC 5987 form so a Nepali/Devanagari title survives the header intact.
    from urllib.parse import quote

    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition":
                f"attachment; filename=\"{base}.docx\"; "
                f"filename*=UTF-8''{quote(base)}.docx",
            "Content-Length": str(len(data)),
        },
    )


@router.post("/requests")
async def submit_request(
    files: List[UploadFile] = File(...),
    category: Optional[str] = Form(None),
    # What the file IS, not what it contains: a whole past paper, or a loose
    # set of questions. Admin review is identical either way; the distinction
    # is what the Past Papers page lists.
    kind: Optional[str] = Form(None),
    db: Session = Depends(database.get_db),
    caller: Tuple[str, bool] = Depends(session.require_user),
):
    """Submit a PDF/DOCX for admin review. Writes nothing to the bank."""
    username = caller[0]
    contrib_kind = kind if kind in CONTRIB_KINDS else "questions"

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
            kind=contrib_kind,
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
