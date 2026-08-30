from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Dict, List, Optional
import models
import database
import schemas
import random

router = APIRouter(prefix="/quiz", tags=["quiz"])

@router.post("/submit", response_model=schemas.QuizResult)
def submit_quiz(
    submission: schemas.QuizSubmission,
    db: Session = Depends(database.get_db)
):
    if not submission.answers:
        raise HTTPException(status_code=400, detail="No answers provided")

    # Determine username: use provided username or default to anonymous
    username = submission.username if submission.username else "anonymous"

    question_ids = list(submission.answers.keys())
    questions = db.query(models.Question).filter(models.Question.id.in_(question_ids)).all()

    if len(questions) != len(question_ids):
        raise HTTPException(status_code=400, detail="Some question IDs are invalid")

    score = 0
    correct_answers = {}
    incorrect_questions = []

    for question in questions:
        selected_answer = submission.answers.get(question.id, "").lower()
        correct_answer = question.correct_answer.lower()
        is_correct = selected_answer == correct_answer

        correct_answers[question.id] = is_correct

        if is_correct:
            score += 1
        else:
            incorrect_questions.append(question.id)

    total_questions = len(questions)
    percentage = int((score / total_questions) * 100) if total_questions > 0 else 0

    # Save quiz attempt
    quiz_attempt = models.QuizAttempt(
        user_identifier=username,
        score=score,
        total_questions=total_questions,
        percentage=percentage,
        answers=submission.answers,
        incorrect_questions=incorrect_questions
    )
    db.add(quiz_attempt)
    db.flush()  # get quiz_attempt.id for source_reference

    # Save individual question progress
    for question in questions:
        selected_answer = submission.answers.get(question.id, "").lower()
        correct_answer = question.correct_answer.lower()
        is_correct = selected_answer == correct_answer

        user_progress = models.UserProgress(
            user_identifier=username,
            question_id=question.id,
            is_correct=is_correct
        )
        db.add(user_progress)

    # Populate wrong-question queue for later practice
    if incorrect_questions:
        for qid in incorrect_questions:
            # Skip if already in queue and not yet cleared
            existing = db.query(models.WrongQuestionQueue).filter(
                models.WrongQuestionQueue.user_identifier == username,
                models.WrongQuestionQueue.question_id == qid,
                models.WrongQuestionQueue.cleared_at.is_(None)
            ).first()
            if not existing:
                db.add(models.WrongQuestionQueue(
                    user_identifier=username,
                    question_id=qid,
                    source_attempt_id=quiz_attempt.id
                ))

    db.commit()

    return schemas.QuizResult(
        score=score,
        total_questions=total_questions,
        percentage=percentage,
        correct_answers=correct_answers,
        incorrect_questions=incorrect_questions
    )

def _calc_stats(progress_rows, questions_by_id: Dict[int, models.Question]):
    """Compute attempted/correct/accuracy + category breakdown from progress rows."""
    attempted_qids = {r.question_id for r in progress_rows}
    attempted = len(attempted_qids)
    correct = sum(1 for r in progress_rows if r.is_correct)
    accuracy = int((correct / len(progress_rows) * 100)) if progress_rows else 0

    cat_stats: Dict[str, Dict[str, int]] = {}
    for r in progress_rows:
        q = questions_by_id.get(r.question_id)
        cat = (q.category if q and q.category else "Uncategorized")
        b = cat_stats.setdefault(cat, {"attempted": 0, "correct": 0})
        b["attempted"] += 1
        if r.is_correct:
            b["correct"] += 1

    categories = [
        {
            "category": c,
            "attempted": s["attempted"],
            "correct": s["correct"],
            "accuracy": int(s["correct"] / s["attempted"] * 100) if s["attempted"] else 0,
        }
        for c, s in sorted(cat_stats.items())
    ]
    return {"attempted": attempted, "correct": correct, "accuracy": accuracy, "categories": categories}


@router.get("/progress/{user_identifier}")
def get_user_progress(user_identifier: str, db: Session = Depends(database.get_db)):
    """Lifetime + weekly progress stats."""
    from datetime import datetime, timedelta

    total_questions = db.query(models.Question).count()

    # --- All-time rows ---
    all_rows = db.query(models.UserProgress).filter(
        models.UserProgress.user_identifier == user_identifier
    ).all()

    # Build question lookup for category info
    all_qids = list({r.question_id for r in all_rows})
    questions_by_id = {
        q.id: q for q in db.query(models.Question).filter(models.Question.id.in_(all_qids)).all()
    } if all_qids else {}

    lifetime = _calc_stats(all_rows, questions_by_id)

    # --- Weekly rows (Monday 00:00 → now) ---
    now = datetime.utcnow()
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    weekly_rows = [r for r in all_rows if r.attempted_at and r.attempted_at >= week_start]
    weekly = _calc_stats(weekly_rows, questions_by_id)

    # Recent attempts
    recent_attempts = db.query(models.QuizAttempt).filter(
        models.QuizAttempt.user_identifier == user_identifier
    ).order_by(models.QuizAttempt.completed_at.desc()).limit(10).all()

    return {
        "total_questions": total_questions,
        # Lifetime (unchanging)
        "lifetime_attempted": lifetime["attempted"],
        "lifetime_correct": lifetime["correct"],
        "lifetime_accuracy": lifetime["accuracy"],
        "lifetime_categories": lifetime["categories"],
        # Weekly (resets each Monday)
        "weekly_attempted": weekly["attempted"],
        "weekly_correct": weekly["correct"],
        "weekly_accuracy": weekly["accuracy"],
        "weekly_categories": weekly["categories"],
        "week_start": week_start.isoformat(),
        # Backward-compat aliases
        "attempted": lifetime["attempted"],
        "correct": lifetime["correct"],
        "accuracy": lifetime["accuracy"],
        "category_breakdown": lifetime["categories"],
        "recent_attempts": [
            {
                "id": a.id,
                "score": a.score,
                "total_questions": a.total_questions,
                "percentage": a.percentage,
                "completed_at": a.completed_at.isoformat() if a.completed_at else None,
                "incorrect_questions": a.incorrect_questions or [],
            }
            for a in recent_attempts
        ],
    }

@router.get("/question-history/{user_identifier}")
def get_question_history(user_identifier: str, db: Session = Depends(database.get_db)):
    """Return last 3 attempt results per question for performance indexing."""
    rows = (
        db.query(models.UserProgress)
        .filter(models.UserProgress.user_identifier == user_identifier)
        .order_by(models.UserProgress.attempted_at.desc())
        .all()
    )
    # Group by question_id, take last 3 per question
    history: Dict[int, List[bool]] = {}
    for r in rows:
        qid = r.question_id
        if qid not in history:
            history[qid] = []
        if len(history[qid]) < 3:
            history[qid].append(r.is_correct)
    return history


@router.get("/random/{count}")
def get_random_questions(
    count: int = 10,
    category: Optional[str] = None,
    difficulty: Optional[str] = None,
    db: Session = Depends(database.get_db)
):
    # Validate count
    if count < 1:
        count = 1
    elif count > 100:
        count = 100

    query = db.query(models.Question)

    if category:
        query = query.filter(models.Question.category == category)
    if difficulty:
        query = query.filter(models.Question.difficulty == difficulty)

    # Get all matching questions first
    all_questions = query.all()

    if not all_questions:
        raise HTTPException(status_code=404, detail="No questions found with given criteria")

    # Select random questions
    if len(all_questions) <= count:
        selected_questions = all_questions
    else:
        selected_questions = random.sample(all_questions, count)

    return selected_questions


@router.get("/attempt/{attempt_id}")
def get_attempt_detail(attempt_id: int, db: Session = Depends(database.get_db)):
    """Return full detail for a past quiz attempt: questions, user answers, correctness."""
    attempt = db.query(models.QuizAttempt).filter(models.QuizAttempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    user_answers = attempt.answers or {}
    question_ids = [int(qid) for qid in user_answers.keys()]
    questions = db.query(models.Question).filter(models.Question.id.in_(question_ids)).all()
    questions_by_id = {q.id: q for q in questions}

    analysis = []
    for qid in question_ids:
        q = questions_by_id.get(qid)
        if not q:
            continue
        selected = user_answers.get(str(qid), user_answers.get(qid, "")).lower()
        correct = q.correct_answer.lower()
        analysis.append({
            "question_id": qid,
            "question_number": q.question_number,
            "question_text": q.question_text,
            "options": q.options or {},
            "correct_answer": q.correct_answer,
            "selected_answer": selected,
            "is_correct": selected == correct,
            "category": q.category,
        })

    return {
        "id": attempt.id,
        "score": attempt.score,
        "total_questions": attempt.total_questions,
        "percentage": attempt.percentage,
        "completed_at": attempt.completed_at.isoformat() if attempt.completed_at else None,
        "analysis": analysis,
    }


@router.get("/wrong-queue/{user_identifier}")
def get_wrong_queue(user_identifier: str, db: Session = Depends(database.get_db)):
    """Get the wrong-question practice queue for a user."""
    queue_rows = db.query(models.WrongQuestionQueue).filter(
        models.WrongQuestionQueue.user_identifier == user_identifier,
        models.WrongQuestionQueue.cleared_at.is_(None)
    ).all()

    question_ids = [row.question_id for row in queue_rows]
    if not question_ids:
        return {"questions": [], "count": 0}

    questions = db.query(models.Question).filter(models.Question.id.in_(question_ids)).all()
    # Preserve queue order
    id_to_q = {q.id: q for q in questions}
    ordered = [id_to_q[qid] for qid in question_ids if qid in id_to_q]

    return {
        "questions": ordered,
        "count": len(ordered),
    }


class ClearQueueRequest(BaseModel):
    user_identifier: str
    question_ids: List[int]


@router.post("/wrong-queue/clear")
def clear_wrong_queue(
    payload: ClearQueueRequest,
    db: Session = Depends(database.get_db)
):
    """Mark queue entries as cleared after practice."""
    from sqlalchemy import func as sqlfunc
    db.query(models.WrongQuestionQueue).filter(
        models.WrongQuestionQueue.user_identifier == payload.user_identifier,
        models.WrongQuestionQueue.question_id.in_(payload.question_ids),
        models.WrongQuestionQueue.cleared_at.is_(None)
    ).update({"cleared_at": sqlfunc.now()})
    db.commit()
    return {"cleared": len(payload.question_ids)}
