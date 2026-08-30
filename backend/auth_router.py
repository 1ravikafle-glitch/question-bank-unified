from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import os
import database
import models
import bcrypt

router = APIRouter(prefix="/auth", tags=["auth"])

# Admin credentials — set via env vars or use defaults
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "Elfak").strip()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Kafle").strip()
ADMIN_USERS = [ADMIN_USERNAME.lower()]


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


class AuthRequest(BaseModel):
    username: str
    password: str

class AuthResponse(BaseModel):
    user_identifier: str
    is_new: bool


@router.post("/login", response_model=AuthResponse)
def login(req: AuthRequest, db: Session = Depends(database.get_db)):
    username = req.username.strip()
    password = req.password.strip()

    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password are required")

    # Admin login — verify exact credentials
    if username.lower() == ADMIN_USERNAME.lower():
        if password != ADMIN_PASSWORD:
            raise HTTPException(status_code=401, detail="Incorrect admin password")
        # Ensure admin user exists in database
        existing = db.query(models.User).filter(models.User.username == ADMIN_USERNAME).first()
        if not existing:
            admin_user = models.User(username=ADMIN_USERNAME, password=hash_password(ADMIN_PASSWORD))
            db.add(admin_user)
            db.commit()
        return AuthResponse(user_identifier=ADMIN_USERNAME, is_new=False)

    # Regular user login
    existing = db.query(models.User).filter(models.User.username == username).first()

    if existing:
        # Check if password is already hashed (bcrypt hashes start with $2)
        if existing.password.startswith('$2'):
            # New hashed password — verify with bcrypt
            if not verify_password(password, existing.password):
                raise HTTPException(status_code=401, detail="Incorrect password for this username")
        else:
            # Legacy plain-text password — verify and migrate to hash
            if existing.password != password:
                raise HTTPException(status_code=401, detail="Incorrect password for this username")
            # Migrate to hashed password
            existing.password = hash_password(password)
            db.commit()
        return AuthResponse(user_identifier=username, is_new=False)

    # New user — auto-create account with hashed password
    new_user = models.User(username=username, password=hash_password(password))
    db.add(new_user)
    db.commit()
    return AuthResponse(user_identifier=username, is_new=True)


# Admin-only helper
def verify_admin_user(x_admin_user: Optional[str] = Header(None)):
    if not x_admin_user or x_admin_user.strip().lower() not in ADMIN_USERS:
        raise HTTPException(status_code=403, detail="Access denied: admin only")
    return x_admin_user.strip()


@router.get("/users")
def list_users(db: Session = Depends(database.get_db), admin_user: str = Depends(verify_admin_user)):
    """Admin-only: list all users."""
    users = db.query(models.User).all()
    return {"users": [{"id": u.id, "username": u.username, "created_at": str(u.created_at)} for u in users]}


@router.get("/users/{username}/progress")
def get_user_progress(username: str, db: Session = Depends(database.get_db), admin_user: str = Depends(verify_admin_user)):
    """Admin: view a specific user's progress and quiz history."""
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")

    # Get quiz attempts
    attempts = (
        db.query(models.QuizAttempt)
        .filter(models.QuizAttempt.user_identifier == username)
        .order_by(models.QuizAttempt.completed_at.desc())
        .all()
    )

    # Get progress per question
    progress_records = (
        db.query(models.UserProgress)
        .filter(models.UserProgress.user_identifier == username)
        .all()
    )

    total_attempted = len(set(r.question_id for r in progress_records))
    total_correct = sum(1 for r in progress_records if r.is_correct)
    total_attempts = len(attempts)

    # Get wrong queue count
    wrong_count = (
        db.query(models.WrongQuestionQueue)
        .filter(
            models.WrongQuestionQueue.user_identifier == username,
            models.WrongQuestionQueue.cleared_at.is_(None)
        ).count()
    )

    # Category breakdown
    from sqlalchemy import func as sqlfunc, Integer as SAInteger
    cat_stats = (
        db.query(
            models.Question.category,
            sqlfunc.count(models.UserProgress.id).label('attempted'),
            sqlfunc.sum(sqlfunc.cast(models.UserProgress.is_correct, SAInteger)).label('correct')
        )
        .join(models.Question, models.UserProgress.question_id == models.Question.id)
        .filter(models.UserProgress.user_identifier == username)
        .group_by(models.Question.category)
        .all()
    )

    return {
        "username": username,
        "created_at": str(user.created_at),
        "total_attempts": total_attempts,
        "total_attempted": total_attempted,
        "total_correct": total_correct or 0,
        "accuracy": round((total_correct / total_attempted * 100), 1) if total_attempted > 0 else 0,
        "wrong_queue_count": wrong_count,
        "category_breakdown": [
            {
                "category": cs[0],
                "attempted": cs[1],
                "correct": cs[2] or 0,
                "accuracy": round((cs[2] / cs[1] * 100), 1) if cs[1] > 0 else 0,
            }
            for cs in cat_stats
        ],
        "recent_attempts": [
            {
                "id": a.id,
                "score": a.score,
                "total_questions": a.total_questions,
                "percentage": a.percentage,
                "completed_at": str(a.completed_at),
            }
            for a in attempts[:20]
        ],
    }


@router.delete("/users/{username}")
def delete_user(username: str, db: Session = Depends(database.get_db), admin_user: str = Depends(verify_admin_user)):
    """Admin: delete a user and all their data."""
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")

    # Delete user data
    db.query(models.UserProgress).filter(models.UserProgress.user_identifier == username).delete()
    db.query(models.WrongQuestionQueue).filter(models.WrongQuestionQueue.user_identifier == username).delete()
    db.query(models.QuizAttempt).filter(models.QuizAttempt.user_identifier == username).delete()
    db.delete(user)
    db.commit()

    return {"deleted": username}
