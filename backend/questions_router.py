from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
import models
import database
import schemas

class QuestionIdsRequest(BaseModel):
    question_ids: List[int]

router = APIRouter(prefix="/questions", tags=["questions"])

@router.get("/", response_model=List[schemas.Question])
def get_questions(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=10000),
    category: Optional[str] = None,
    difficulty: Optional[str] = None,
    db: Session = Depends(database.get_db)
):
    query = db.query(models.Question)

    if category:
        query = query.filter(models.Question.category == category)
    if difficulty:
        query = query.filter(models.Question.difficulty == difficulty)

    questions = query.offset(skip).limit(limit).all()
    return questions

@router.get("/{question_id}", response_model=schemas.Question)
def get_question(question_id: int, db: Session = Depends(database.get_db)):
    question = db.query(models.Question).filter(models.Question.id == question_id).first()
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")
    return question

@router.get("/count/")
def get_questions_count(
    category: Optional[str] = None,
    difficulty: Optional[str] = None,
    db: Session = Depends(database.get_db)
):
    query = db.query(models.Question)

    if category:
        query = query.filter(models.Question.category == category)
    if difficulty:
        query = query.filter(models.Question.difficulty == difficulty)

    count = query.count()
    return {"count": count}


@router.get("/categories/", response_model=List[str])
def get_categories(db: Session = Depends(database.get_db)):
    """Get distinct categories"""
    categories = db.query(models.Question.category).distinct().filter(models.Question.category.isnot(None)).all()
    return [category[0] for category in categories if category[0] is not None]


@router.post("/by-ids/", response_model=List[schemas.Question])
def get_questions_by_ids(
    payload: QuestionIdsRequest,
    db: Session = Depends(database.get_db)
):
    questions = db.query(models.Question).filter(models.Question.id.in_(payload.question_ids)).all()
    # Sort to match input order
    id_to_question = {q.id: q for q in questions}
    return [id_to_question[id] for id in payload.question_ids if id in id_to_question]