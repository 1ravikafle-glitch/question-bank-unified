import io
import os
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

import models
import database
from docx_parser import extract_questions_and_answers, guess_category_from_filename

router = APIRouter(prefix="/admin", tags=["admin"])

# Admin usernames — only these users can access admin endpoints
ADMIN_USERS = ['elfak']


def verify_admin(x_admin_user: Optional[str] = Header(None)):
    """Dependency: verify the requesting user is an admin."""
    if not x_admin_user:
        raise HTTPException(status_code=401, detail="Admin authentication required")
    if x_admin_user.strip().lower() not in ADMIN_USERS:
        raise HTTPException(status_code=403, detail="Access denied: admin only")
    return x_admin_user.strip()


class RenameCategoryRequest(BaseModel):
    old_name: str
    new_name: str


@router.post("/upload-docx")
async def upload_docx(
    files: List[UploadFile] = File(...),
    category: Optional[str] = Form(None),
    db: Session = Depends(database.get_db),
    admin_user: str = Depends(verify_admin),
):
    """
    Upload one or more .docx question-bank files. Each file is parsed for
    numbered questions (1. ...), lettered options (a] ... d]) and a trailing
    answer key (e.g. "1a 2b 3c ..."), then inserted into the database.

    If `category` is not supplied, it is guessed from the filename
    (falls back to "General").

    Questions are deduplicated by (question_text, category) so re-uploading
    the same file is safe.
    """
    results = []
    total_imported = 0
    total_skipped = 0

    for upload in files:
        if not upload.filename.lower().endswith(".docx"):
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

        db.commit()
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
def list_categories(db: Session = Depends(database.get_db), admin_user: str = Depends(verify_admin)):
    """Return all distinct categories with question counts."""
    rows = (
        db.query(models.Question.category, func.count(models.Question.id))
        .group_by(models.Question.category)
        .all()
    )
    return [{"name": r[0], "count": r[1]} for r in rows if r[0]]


@router.put("/categories/rename")
def rename_category(payload: RenameCategoryRequest, db: Session = Depends(database.get_db), admin_user: str = Depends(verify_admin)):
    """Rename a category across all questions."""
    old = payload.old_name.strip()
    new = payload.new_name.strip()
    if not old or not new:
        raise HTTPException(status_code=400, detail="old_name and new_name are required")
    if old == new:
        raise HTTPException(status_code=400, detail="New name is the same as the old name")

    # Check old category exists
    count = db.query(models.Question).filter(models.Question.category == old).count()
    if count == 0:
        raise HTTPException(status_code=404, detail=f"Category '{old}' not found")

    # Check new name doesn't already exist
    existing = db.query(models.Question).filter(models.Question.category == new).count()
    if existing > 0:
        raise HTTPException(status_code=400, detail=f"Category '{new}' already exists")

    # Rename all questions with old category
    updated = db.query(models.Question).filter(models.Question.category == old).update({"category": new})
    db.commit()

    return {"renamed": old, "to": new, "questions_updated": updated}


@router.delete("/categories/{category_name}")
def delete_category(category_name: str, db: Session = Depends(database.get_db), admin_user: str = Depends(verify_admin)):
    """
    Delete a category and all questions within it.
    This operation cannot be undone.
    """
    category_name = category_name.strip()
    if not category_name:
        raise HTTPException(status_code=400, detail="Category name is required")

    # Check if category exists
    count = db.query(models.Question).filter(models.Question.category == category_name).count()
    if count == 0:
        raise HTTPException(status_code=404, detail=f"Category '{category_name}' not found")

    # Delete all questions in this category
    deleted = db.query(models.Question).filter(models.Question.category == category_name).delete()
    db.commit()

    return {"deleted_category": category_name, "questions_deleted": deleted}


@router.get("/questions")
def list_all_questions_for_admin(
    skip: int = 0,
    limit: int = 1000,
    category: Optional[str] = None,
    db: Session = Depends(database.get_db),
    admin_user: str = Depends(verify_admin),
):
    """Full question list for the admin edit view (no truncation surprises)."""
    query = db.query(models.Question)
    if category:
        query = query.filter(models.Question.category == category)
    questions = query.order_by(models.Question.id).offset(skip).limit(limit).all()
    return questions


@router.put("/questions/{question_id}")
def update_question(question_id: int, payload: dict, db: Session = Depends(database.get_db), admin_user: str = Depends(verify_admin)):
    """
    Edit a previously-uploaded question. Accepts a partial update: any of
    question_number, question_text, options, correct_answer, category,
    difficulty. Used to manually fix parsing errors from a .docx import.
    """
    question = db.query(models.Question).filter(models.Question.id == question_id).first()
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")

    allowed_fields = {"question_number", "question_text", "options", "correct_answer", "category", "difficulty"}
    updates = {k: v for k, v in payload.items() if k in allowed_fields}

    if "correct_answer" in updates and updates["correct_answer"]:
        updates["correct_answer"] = str(updates["correct_answer"]).strip().lower()[:1]

    if "options" in updates and updates["options"] is not None:
        if not isinstance(updates["options"], dict):
            raise HTTPException(status_code=400, detail="options must be an object of letter -> text")
        updates["options"] = {str(k).strip().lower(): str(v) for k, v in updates["options"].items()}

    for field, value in updates.items():
        setattr(question, field, value)

    db.commit()
    db.refresh(question)
    return question
