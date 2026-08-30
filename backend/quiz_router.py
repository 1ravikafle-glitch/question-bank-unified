from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc
from typing import Dict, List, Optional
from datetime import datetime, timezone, timedelta
import models
import database
import schemas
import sys
import random

router = APIRouter(prefix="/quiz", tags=["quiz"])


def _normalize_answers(answers: Dict) -> Dict[int, str]:
    """Convert answer dict to {int_key: str_value} consistently."""
    return {int(k): str(v).strip().lower() for k, v in answers.items()}


@router.post("/submit", response_model=schemas.QuizResult)
def submit_quiz(
    submission: schemas.QuizSubmission,
    db: Session = Depends(database.get_db),
):
    if not submission.answers:
        raise HTTPException(status_code=400, detail="No answers provided")

    username = submission.username if submission.username else "anonymous"
    answers = _normalize_answers(submission.answers)
    question_ids = list(answers.keys())

    questions = db.query(models.Question).filter(models.Question.id.in_(question_ids)).all()
    if len(questions) != len(question_ids):
        found = {q.id for q in questions}
        missing = set(question_ids) - found
        raise HTTPException(status_code=400, detail=f"Questions not found: {missing}")

    questions_by_id = {q.id: q for q in questions}

    score = 0
    correct_answers = {}
    incorrect_questions = []

    for qid, selected in answers.items():
        is_correct = selected == questions_by_id[qid].correct_answer.strip().lower()
        correct_answers[qid] = is_correct
        if is_correct:
            score += 1
        else:
            incorrect_questions.append(qid)

    total = len(questions)
    percentage = int((score / total) * 100) if total > 0 else 0

    # ── Write everything in one transaction ─────────────────────────────────
    try:
        # 1. Save quiz attempt (history record — always new row)
        quiz_attempt = models.QuizAttempt(
            user_identifier=username,
            score=score,
            total_questions=total,
            percentage=percentage,
            answers=answers,
            incorrect_questions=incorrect_questions,
        )
        db.add(quiz_attempt)
        db.flush()

        # 2. Save per-question progress (one row per attempt = full history)
        for qid, selected in answers.items():
            is_correct = selected == questions_by_id[qid].correct_answer.strip().lower()
            db.add(models.UserProgress(
                user_identifier=username,
                question_id=qid,
                is_correct=is_correct,
            ))

        # 3. Update wrong-question queue atomically
        #    3a. Clear entries the user just got RIGHT
        right_qids = [qid for qid, ic in correct_answers.items() if ic]
        if right_qids:
            db.query(models.WrongQuestionQueue).filter(
                models.WrongQuestionQueue.user_identifier == username,
                models.WrongQuestionQueue.question_id.in_(right_qids),
                models.WrongQuestionQueue.cleared_at.is_(None),
            ).update({"cleared_at": sqlfunc.now()}, synchronize_session="fetch")

        #    3b. Add new entries for WRONG answers (skip if already in queue)
        if incorrect_questions:
            existing = db.query(models.WrongQuestionQueue.question_id).filter(
                models.WrongQuestionQueue.user_identifier == username,
                models.WrongQuestionQueue.question_id.in_(incorrect_questions),
                models.WrongQuestionQueue.cleared_at.is_(None),
            ).all()
            existing_ids = {r[0] for r in existing}
            for qid in incorrect_questions:
                if qid not in existing_ids:
                    db.add(models.WrongQuestionQueue(
                        user_identifier=username,
                        question_id=qid,
                        source_attempt_id=quiz_attempt.id,
                    ))

        # 4. COMMIT — if this fails, nothing is saved (atomic)
        db.commit()
        print(f"[QUIZ] {username}: {score}/{total} ({percentage}%) — committed", file=sys.stderr)

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        print(f"[QUIZ] {username}: COMMIT FAILED — {e}", file=sys.stderr)
        raise HTTPException(status_code=500, detail=f"Failed to save quiz: {str(e)}")

    return schemas.QuizResult(
        score=score,
        total_questions=total,
        percentage=percentage,
        correct_answers=correct_answers,
        incorrect_questions=incorrect_questions,
    )


def _calc_stats(progress_rows, questions_by_id: Dict[int, models.Question]):
    attempted_qids = {r.question_id for r in progress_rows}
    attempted = len(attempted_qids)
    correct = sum(1 for r in progress_rows if r.is_correct)
    accuracy = int((correct / len(progress_rows) * 100)) if progress_rows else 0

    cat_stats: Dict[str, Dict[str, int]] = {}
    for r in progress_rows:
        q = questions_by_id.get(r.question_id)
        cat = q.category if q and q.category else "Uncategorized"
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
    total_questions = db.query(models.Question).count()

    all_rows = db.query(models.UserProgress).filter(
        models.UserProgress.user_identifier == user_identifier
    ).all()

    all_qids = list({r.question_id for r in all_rows})
    questions_by_id = {
        q.id: q for q in db.query(models.Question).filter(models.Question.id.in_(all_qids)).all()
    } if all_qids else {}

    lifetime = _calc_stats(all_rows, questions_by_id)

    now = datetime.now(timezone.utc)
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    weekly_rows = []
    for r in all_rows:
        if r.attempted_at:
            ts = r.attempted_at
            # SQLite stores naive datetimes; make them UTC-aware for comparison
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            if ts >= week_start:
                weekly_rows.append(r)
    weekly = _calc_stats(weekly_rows, questions_by_id)

    recent_attempts = db.query(models.QuizAttempt).filter(
        models.QuizAttempt.user_identifier == user_identifier
    ).order_by(models.QuizAttempt.completed_at.desc()).limit(10).all()

    return {
        "total_questions": total_questions,
        "lifetime_attempted": lifetime["attempted"],
        "lifetime_correct": lifetime["correct"],
        "lifetime_accuracy": lifetime["accuracy"],
        "lifetime_categories": lifetime["categories"],
        "weekly_attempted": weekly["attempted"],
        "weekly_correct": weekly["correct"],
        "weekly_accuracy": weekly["accuracy"],
        "weekly_categories": weekly["categories"],
        "week_start": week_start.isoformat(),
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
    rows = (
        db.query(models.UserProgress)
        .filter(models.UserProgress.user_identifier == user_identifier)
        .order_by(models.UserProgress.attempted_at.desc())
        .all()
    )
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
    db: Session = Depends(database.get_db),
):
    if count < 1:
        count = 1
    elif count > 100:
        count = 100

    query = db.query(models.Question)
    if category:
        query = query.filter(models.Question.category == category)
    if difficulty:
        query = query.filter(models.Question.difficulty == difficulty)

    all_questions = query.all()
    if not all_questions:
        raise HTTPException(status_code=404, detail="No questions found with given criteria")

    if len(all_questions) <= count:
        return all_questions
    return random.sample(all_questions, count)


@router.get("/attempt/{attempt_id}")
def get_attempt_detail(attempt_id: int, db: Session = Depends(database.get_db)):
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
    queue_rows = db.query(models.WrongQuestionQueue).filter(
        models.WrongQuestionQueue.user_identifier == user_identifier,
        models.WrongQuestionQueue.cleared_at.is_(None),
    ).all()

    question_ids = [row.question_id for row in queue_rows]
    if not question_ids:
        return {"questions": [], "count": 0}

    questions = db.query(models.Question).filter(models.Question.id.in_(question_ids)).all()
    id_to_q = {q.id: q for q in questions}
    ordered = [id_to_q[qid] for qid in question_ids if qid in id_to_q]

    return {"questions": ordered, "count": len(ordered)}


class ClearQueueRequest(BaseModel):
    user_identifier: str
    question_ids: List[int]


@router.post("/wrong-queue/clear")
def clear_wrong_queue(payload: ClearQueueRequest, db: Session = Depends(database.get_db)):
    try:
        db.query(models.WrongQuestionQueue).filter(
            models.WrongQuestionQueue.user_identifier == payload.user_identifier,
            models.WrongQuestionQueue.question_id.in_(payload.question_ids),
            models.WrongQuestionQueue.cleared_at.is_(None),
        ).update({"cleared_at": sqlfunc.now()}, synchronize_session="fetch")
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to clear queue")
    return {"cleared": len(payload.question_ids)}
