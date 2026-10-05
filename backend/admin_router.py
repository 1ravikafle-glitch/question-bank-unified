import io
import os
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Header, Query, Path
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func, text

import models
import database
import session
import app_cache
from docx_parser import extract_questions_and_answers, guess_category_from_filename

router = APIRouter(prefix="/admin", tags=["admin"])

# Admin identity comes from the environment ONLY — there is deliberately no
# built-in fallback. A hardcoded default meant every deployment that forgot to
# set ADMIN_USERNAME/ADMIN_PASSWORD shipped with a publicly known admin login
# (and the value is permanently in git history, so it must never be reintroduced).
# Unset => no admin exists => admin routes are unreachable. Fail closed.
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "").strip()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "").strip()
ADMIN_USERS = [ADMIN_USERNAME.lower()] if ADMIN_USERNAME else []
if not ADMIN_USERNAME or not ADMIN_PASSWORD:
    import sys as _sys
    print(
        "[admin] WARNING: ADMIN_USERNAME/ADMIN_PASSWORD not set — admin access "
        "is disabled. Set both in the environment to enable it.",
        file=_sys.stderr,
    )





class RenameCategoryRequest(BaseModel):
    old_name: str
    new_name: str


class CategoryMetaRequest(BaseModel):
    category: str
    emoji: Optional[str] = None


class ReferenceRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    author: Optional[str] = Field(default=None, max_length=300)
    detail: Optional[str] = Field(default=None, max_length=300)
    url: Optional[str] = Field(default=None, max_length=500)
    position: int = 0


class ContributorRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    role: Optional[str] = Field(default=None, max_length=200)
    position: int = 0


@router.get("/references")
def admin_list_references(db: Session = Depends(database.get_db), admin_user: str = Depends(session.require_admin)):
    rows = db.query(models.Reference).order_by(models.Reference.position, models.Reference.id).all()
    return {"references": [
        {"id": r.id, "title": r.title, "author": r.author, "detail": r.detail,
         "url": r.url, "position": r.position} for r in rows
    ]}


@router.post("/references")
def admin_add_reference(payload: ReferenceRequest, db: Session = Depends(database.get_db), admin_user: str = Depends(session.require_admin)):
    try:
        row = models.Reference(
            title=payload.title.strip(),
            author=(payload.author or "").strip() or None,
            detail=(payload.detail or "").strip() or None,
            url=(payload.url or "").strip() or None,
            position=int(payload.position or 0),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        app_cache.delete("q:references")
        return {"id": row.id}
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to add reference")


@router.put("/references/{ref_id}")
def admin_update_reference(ref_id: int, payload: ReferenceRequest, db: Session = Depends(database.get_db), admin_user: str = Depends(session.require_admin)):
    try:
        row = db.query(models.Reference).filter(models.Reference.id == ref_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Reference not found")
        row.title = payload.title.strip()
        row.author = (payload.author or "").strip() or None
        row.detail = (payload.detail or "").strip() or None
        row.url = (payload.url or "").strip() or None
        row.position = int(payload.position or 0)
        db.commit()
        app_cache.delete("q:references")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update reference")


@router.delete("/references/{ref_id}")
def admin_delete_reference(ref_id: int = Path(...), db: Session = Depends(database.get_db), admin_user: str = Depends(session.require_admin)):
    try:
        row = db.query(models.Reference).filter(models.Reference.id == ref_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Reference not found")
        db.delete(row)
        db.commit()
        app_cache.delete("q:references")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete reference")


@router.get("/category-meta")
def admin_get_category_meta(db: Session = Depends(database.get_db), admin_user: str = Depends(session.require_admin)):
    rows = db.query(models.CategoryMeta).all()
    return {"emoji": {r.category: r.emoji for r in rows}}


@router.put("/category-meta")
def admin_set_category_meta(payload: CategoryMetaRequest, db: Session = Depends(database.get_db), admin_user: str = Depends(session.require_admin)):
    name = (payload.category or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="category is required")
    emoji = (payload.emoji or "").strip() or None
    try:
        row = db.query(models.CategoryMeta).filter(models.CategoryMeta.category == name).first()
        if row:
            row.emoji = emoji
        else:
            db.add(models.CategoryMeta(category=name, emoji=emoji))
        db.commit()
        app_cache.delete("q:category-meta")
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save category emoji")
    return {"category": name, "emoji": emoji}


@router.post("/upload-docx")
async def upload_docx(
    files: List[UploadFile] = File(...),
    category: Optional[str] = Form(None),
    db: Session = Depends(database.get_db),
    admin_user: str = Depends(session.require_admin),
):
    results = []
    total_imported = 0
    total_skipped = 0

    for upload in files:
        if not upload.filename or not upload.filename.lower().endswith(".docx"):
            results.append({
                "filename": upload.filename,
                "error": "Only .docx files are supported",
            })
            continue

        raw = await upload.read()
        try:
            parsed_questions = extract_questions_and_answers(io.BytesIO(raw))
        except Exception as e:
            results.append({
                "filename": upload.filename,
                "error": f"Failed to parse file: {e}",
            })
            continue

        file_category = category or guess_category_from_filename(upload.filename)

        imported = 0
        skipped = 0
        skipped_no_answer = 0

        for q in parsed_questions:
            if not q.get("correct_answer"):
                skipped_no_answer += 1
                continue

            existing = db.query(models.Question).filter(
                models.Question.question_text == q["question_text"],
                models.Question.category == file_category,
            ).first()
            if existing:
                skipped += 1
                continue

            question = models.Question(
                question_number=q["question_number"],
                question_text=q["question_text"],
                options=q.get("options", {}),
                correct_answer=q["correct_answer"].lower(),
                category=file_category,
                difficulty=None,
            )
            db.add(question)
            imported += 1

        try:
            db.commit()
            app_cache.delete_prefix("q:")
            try:
                import questions_router

                questions_router.warm_bank_cache(db)
            except Exception:
                pass
        except Exception:
            db.rollback()
            results.append({
                "filename": upload.filename,
                "error": "Database commit failed",
            })
            continue

        total_imported += imported
        total_skipped += skipped + skipped_no_answer

        results.append({
            "filename": upload.filename,
            "category": file_category,
            "questions_found": len(parsed_questions),
            "imported": imported,
            "skipped_duplicate": skipped,
            "skipped_no_answer_key": skipped_no_answer,
        })

    if total_imported == 0 and all("error" in r for r in results):
        raise HTTPException(status_code=400, detail={"results": results})

    return {
        "total_imported": total_imported,
        "total_skipped": total_skipped,
        "files": results,
    }


@router.get("/categories")
def list_categories(
    db: Session = Depends(database.get_db),
    admin_user: str = Depends(session.require_admin),
):
    rows = (
        db.query(models.Question.category, func.count(models.Question.id))
        .group_by(models.Question.category)
        .all()
    )
    return [{"name": r[0], "count": r[1]} for r in rows if r[0]]


@router.put("/categories/rename")
def rename_category(payload: RenameCategoryRequest, db: Session = Depends(database.get_db), admin_user: str = Depends(session.require_admin)):
    old = payload.old_name.strip()
    new = payload.new_name.strip()
    if not old or not new:
        raise HTTPException(status_code=400, detail="old_name and new_name are required")
    if old == new:
        raise HTTPException(status_code=400, detail="New name is the same as the old name")

    count = db.query(models.Question).filter(models.Question.category == old).count()
    if count == 0:
        # Fall back to whitespace-tolerant match (catches leading/trailing-space variants)
        candidates = [
            r[0] for r in db.query(models.Question.category).distinct().all() if r[0]
        ]
        tolerants = [c for c in candidates if c.strip() == old]
        if len(tolerants) == 1:
            old = tolerants[0]
            count = db.query(models.Question).filter(models.Question.category == old).count()
        else:
            hint = f" Close matches: {tolerants}" if tolerants else ""
            raise HTTPException(status_code=404, detail=f"Category '{payload.old_name.strip()}' not found.{hint}")

    existing = db.query(models.Question).filter(models.Question.category == new).count()
    if existing > 0:
        raise HTTPException(status_code=400, detail=f"Category '{new}' already exists")

    try:
        updated = db.query(models.Question).filter(models.Question.category == old).update({"category": new})
        # Carry any admin emoji over to the new name
        meta = db.query(models.CategoryMeta).filter(models.CategoryMeta.category == old).first()
        if meta:
            target = db.query(models.CategoryMeta).filter(models.CategoryMeta.category == new).first()
            if target:
                if not target.emoji:
                    target.emoji = meta.emoji
                db.delete(meta)
            else:
                meta.category = new
        db.commit()
        app_cache.delete_prefix("q:")
        try:
            import questions_router

            questions_router.warm_bank_cache(db)
        except Exception:
            pass
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to rename category")
    try:
        app_cache.delete_prefix("q:")
        try:
            import questions_router

            questions_router.warm_bank_cache(db)
        except Exception:
            pass
    except Exception:
        pass

    return {"renamed": old, "to": new, "questions_updated": updated}


class MergeCategoryRequest(BaseModel):
    source: str
    target: str


@router.put("/categories/merge")
def merge_categories(payload: MergeCategoryRequest, db: Session = Depends(database.get_db), admin_user: str = Depends(session.require_admin)):
    """Move all questions from one existing category into another (for duplicates)."""
    source = (payload.source or "").strip()
    target = (payload.target or "").strip()
    if not source or not target:
        raise HTTPException(status_code=400, detail="source and target are required")
    if source == target:
        raise HTTPException(status_code=400, detail="Source and target are the same")
    sc = db.query(models.Question).filter(models.Question.category == source).count()
    if sc == 0:
        raise HTTPException(status_code=404, detail=f"Source category '{source}' not found")
    tc = db.query(models.Question).filter(models.Question.category == target).count()
    if tc == 0:
        raise HTTPException(status_code=404, detail=f"Target category '{target}' not found")
    try:
        moved = db.query(models.Question).filter(models.Question.category == source).update({"category": target})
        smeta = db.query(models.CategoryMeta).filter(models.CategoryMeta.category == source).first()
        if smeta:
            tmeta = db.query(models.CategoryMeta).filter(models.CategoryMeta.category == target).first()
            if tmeta:
                if not tmeta.emoji:
                    tmeta.emoji = smeta.emoji
                db.delete(smeta)
            else:
                smeta.category = target
        db.commit()
        app_cache.delete_prefix("q:")
        try:
            import questions_router

            questions_router.warm_bank_cache(db)
        except Exception:
            pass
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to merge categories")
    try:
        app_cache.delete_prefix("q:")
        try:
            import questions_router

            questions_router.warm_bank_cache(db)
        except Exception:
            pass
    except Exception:
        pass
    return {"merged_from": source, "merged_to": target, "questions_moved": moved}


@router.delete("/categories/{category_name}")
def delete_category(category_name: str, db: Session = Depends(database.get_db), admin_user: str = Depends(session.require_admin)):
    category_name = category_name.strip()
    if not category_name:
        raise HTTPException(status_code=400, detail="Category name is required")

    count = db.query(models.Question).filter(models.Question.category == category_name).count()
    if count == 0:
        raise HTTPException(status_code=404, detail=f"Category '{category_name}' not found")

    try:
        deleted = db.query(models.Question).filter(models.Question.category == category_name).delete()
        db.commit()
        app_cache.delete_prefix("q:")
        try:
            import questions_router

            questions_router.warm_bank_cache(db)
        except Exception:
            pass
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete category")
    try:
        app_cache.delete_prefix("q:")
        try:
            import questions_router

            questions_router.warm_bank_cache(db)
        except Exception:
            pass
    except Exception:
        pass

    return {"deleted_category": category_name, "questions_deleted": deleted}


@router.get("/questions")
def list_all_questions_for_admin(
    skip: int = 0,
    limit: int = 1000,
    category: Optional[str] = None,
    db: Session = Depends(database.get_db),
    admin_user: str = Depends(session.require_admin),
):
    query = db.query(models.Question)
    if category:
        query = query.filter(models.Question.category == category)
    questions = query.order_by(models.Question.id).offset(skip).limit(limit).all()
    return questions


@router.put("/questions/{question_id}")
def update_question(payload: dict, question_id: int = Path(..., ge=1, le=9223372036854775807), db: Session = Depends(database.get_db), admin_user: str = Depends(session.require_admin)):
    question = db.query(models.Question).filter(models.Question.id == question_id).first()
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")

    allowed_fields = {"question_number", "question_text", "options", "correct_answer", "category", "difficulty", "explanation"}
    updates = {k: v for k, v in payload.items() if k in allowed_fields}

    if "correct_answer" in updates and updates["correct_answer"]:
        updates["correct_answer"] = str(updates["correct_answer"]).strip().lower()[:1]

    if "options" in updates and updates["options"] is not None:
        if not isinstance(updates["options"], dict):
            raise HTTPException(status_code=400, detail="options must be an object of letter -> text")
        updates["options"] = {str(k).strip().lower(): str(v) for k, v in updates["options"].items()}

    try:
        for field, value in updates.items():
            setattr(question, field, value)
        db.commit()
        app_cache.delete_prefix("q:")
        try:
            import questions_router

            questions_router.warm_bank_cache(db)
        except Exception:
            pass
        db.refresh(question)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update question")

    return question


@router.get("/contributors")
def admin_list_contributors(db: Session = Depends(database.get_db), admin_user: str = Depends(session.require_admin)):
    rows = db.query(models.Contributor).order_by(models.Contributor.position, models.Contributor.id).all()
    return {"contributors": [
        {"id": c.id, "name": c.name, "role": c.role, "position": c.position} for c in rows
    ]}


@router.post("/contributors")
def admin_add_contributor(payload: ContributorRequest, db: Session = Depends(database.get_db), admin_user: str = Depends(session.require_admin)):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    try:
        row = models.Contributor(
            name=name,
            role=(payload.role or "").strip() or None,
            position=int(payload.position or 0),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        app_cache.delete("q:contributors")
        return {"id": row.id}
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to add contributor")


@router.put("/contributors/{contrib_id}")
def admin_update_contributor(contrib_id: int, payload: ContributorRequest, db: Session = Depends(database.get_db), admin_user: str = Depends(session.require_admin)):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    try:
        row = db.query(models.Contributor).filter(models.Contributor.id == contrib_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Contributor not found")
        row.name = name
        row.role = (payload.role or "").strip() or None
        row.position = int(payload.position or 0)
        db.commit()
        app_cache.delete("q:contributors")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update contributor")


@router.delete("/contributors/{contrib_id}")
def admin_delete_contributor(contrib_id: int = Path(...), db: Session = Depends(database.get_db), admin_user: str = Depends(session.require_admin)):
    try:
        row = db.query(models.Contributor).filter(models.Contributor.id == contrib_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Contributor not found")
        db.delete(row)
        db.commit()
        app_cache.delete("q:contributors")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete contributor")


# ── Contributor review queue ────────────────────────────────────────────────
# Contributors cannot write to `questions` directly. They POST to
# /uploads/requests; an admin approves or rejects here. Approving is the ONLY
# path that inserts contributor questions into the bank. Admins who want to
# bypass review entirely use /admin/upload-docx or /uploads/import (unlimited).

class ReviewRequest(BaseModel):
    note: Optional[str] = Field(default=None, max_length=2000)


def _serialize_request(r: models.ContributionRequest, include_payload: bool = False):
    out = {
        "id": r.id,
        "user_identifier": r.user_identifier,
        "filename": r.filename,
        "category": r.category,
        "status": r.status,
        "question_count": r.question_count,
        "with_answer": r.with_answer,
        # NULL for rows written before the column existed; the UI treats that
        # as the older default rather than failing to render.
        "kind": r.kind,
        "admin_note": r.admin_note,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
    }
    if include_payload:
        rows = r.payload or []
        out["preview"] = [
            {
                "question_number": q.get("question_number", 0),
                "question_text": (q.get("question_text") or "")[:200],
                "options": q.get("options", {}),
                "correct_answer": q.get("correct_answer", ""),
            }
            for q in rows[:5]
        ]
    return out


@router.get("/contributions")
def list_contributions(
    status: Optional[str] = Query(default="pending"),
    db: Session = Depends(database.get_db),
    admin_user: str = Depends(session.require_admin),
):
    """Pending contributor uploads by default. Pass status=all for history."""
    q = db.query(models.ContributionRequest)
    if status and status != "all":
        q = q.filter(models.ContributionRequest.status == status)
    rows = q.order_by(models.ContributionRequest.created_at.asc()).all()
    return {
        "requests": [_serialize_request(r) for r in rows],
        "pending_total": db.query(models.ContributionRequest)
        .filter(models.ContributionRequest.status == "pending")
        .count(),
    }


@router.get("/contributions/{request_id}")
def get_contribution(
    request_id: int,
    db: Session = Depends(database.get_db),
    admin_user: str = Depends(session.require_admin),
):
    row = db.query(models.ContributionRequest).filter(models.ContributionRequest.id == request_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Request not found")
    return _serialize_request(row, include_payload=True)


@router.post("/contributions/{request_id}/approve")
def approve_contribution(
    request_id: int,
    body: ReviewRequest = ReviewRequest(),
    db: Session = Depends(database.get_db),
    admin_user: str = Depends(session.require_admin),
):
    """Approve: insert the parked questions into the bank, then mark approved.

    Dedupes on (question_text, category) exactly like the direct import path.
    Approving frees the contributor one of their 5 pending slots.
    """
    row = db.query(models.ContributionRequest).filter(models.ContributionRequest.id == request_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Request not found")
    if row.status != "pending":
        raise HTTPException(status_code=409, detail=f"Already {row.status}")

    imported = skipped_dup = skipped_no_answer = skipped_unusable = 0
    for q in row.payload or []:
        if not q.get("correct_answer"):
            skipped_no_answer += 1
            continue
        # Never insert an unanswerable question. The bank is expected to hold
        # only rows that models.is_usable_question() accepts (>=2 options);
        # this path used to insert options={} rows that every read endpoint
        # then filtered out. Do not revert.
        if len(models.usable_options(q.get("options"))) < 2:
            skipped_unusable += 1
            continue
        exists = (
            db.query(models.Question)
            .filter(
                models.Question.question_text == q["question_text"],
                models.Question.category == row.category,
            )
            .first()
        )
        if exists:
            skipped_dup += 1
            continue
        db.add(
            models.Question(
                question_number=q.get("question_number", 0),
                question_text=q["question_text"],
                options=q.get("options", {}),
                correct_answer=str(q["correct_answer"]).strip().lower()[:1],
                category=row.category,
                difficulty=None,
                source=f"user:{row.user_identifier}",
            )
        )
        imported += 1

    row.status = "approved"
    row.admin_note = body.note or None
    row.reviewed_by = admin_user
    row.reviewed_at = func.now()
    # Only PENDING requests need their parsed questions. Keeping the blob on a
    # decided row grows the table forever. Do not revert.
    # NOTE: a JSON column serialises Python None to the JSON literal 'null',
    # not SQL NULL, so clear it with an explicit UPDATE.
    # A JSON bind processor turns Python None into the JSON literal 'null',
    # so a Query.update() still stores text. Use literal SQL for a true NULL.
    db.execute(
        text("UPDATE contribution_requests SET payload = NULL WHERE id = :rid"),
        {"rid": row.id},
    )
    try:
        db.commit()
        app_cache.delete_prefix("q:")
        try:
            import questions_router

            questions_router.warm_bank_cache(db)
        except Exception:
            pass
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database commit failed")

    return {
        "id": row.id,
        "status": "approved",
        "imported": imported,
        "skipped_duplicate": skipped_dup,
        "skipped_no_answer": skipped_no_answer,
        "skipped_unusable": skipped_unusable,
    }


@router.post("/contributions/{request_id}/reject")
def reject_contribution(
    request_id: int,
    body: ReviewRequest = ReviewRequest(),
    db: Session = Depends(database.get_db),
    admin_user: str = Depends(session.require_admin),
):
    """Reject: nothing is inserted. The note is shown to the contributor.

    Rejecting also frees one of the contributor's 5 pending slots.
    """
    row = db.query(models.ContributionRequest).filter(models.ContributionRequest.id == request_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Request not found")
    if row.status != "pending":
        raise HTTPException(status_code=409, detail=f"Already {row.status}")

    # A rejection the contributor cannot understand is not a rejection. The UI
    # enforced this, but the endpoint did not, so any API call produced a bare
    # "rejected" with no explanation. Enforced server-side now.
    note = (body.note or "").strip()
    if not note:
        raise HTTPException(status_code=400, detail="A reason is required to reject an upload.")

    row.status = "rejected"
    row.admin_note = note[:2000]
    row.reviewed_by = admin_user
    row.reviewed_at = func.now()
    # A JSON bind processor turns Python None into the JSON literal 'null',
    # so a Query.update() still stores text. Use literal SQL for a true NULL.
    db.execute(
        text("UPDATE contribution_requests SET payload = NULL WHERE id = :rid"),
        {"rid": row.id},
    )
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database commit failed")
    return {"id": row.id, "status": "rejected"}
