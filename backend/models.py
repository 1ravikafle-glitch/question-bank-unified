from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, JSON, Index, Float
from sqlalchemy.sql import func
import database

Base = database.Base

# Use JSONB on PostgreSQL for indexing; JSON on SQLite
if database.is_postgres:
    from sqlalchemy.dialects.postgresql import JSONB
    JSONType = JSONB
else:
    JSONType = JSON


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    question_number = Column(Integer, index=True, nullable=False)
    question_text = Column(Text, nullable=False)
    options = Column(JSONType)
    correct_answer = Column(String(1), nullable=False)
    category = Column(String(100), nullable=True)
    difficulty = Column(String(20), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        Index("ix_questions_category", "category"),
    )


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id = Column(Integer, primary_key=True, index=True)
    user_identifier = Column(String(100), nullable=True)
    score = Column(Integer, nullable=False)
    total_questions = Column(Integer, nullable=False)
    percentage = Column(Integer, nullable=False)
    answers = Column(JSONType)
    incorrect_questions = Column(JSONType)
    completed_at = Column(DateTime(timezone=True), server_default=func.now())
    # Mock-exam scoring detail (null/0 = plain practice, pre-feature rows).
    raw_score = Column(Integer, nullable=True)
    negative_marking = Column(Float, nullable=True)

    __table_args__ = (
        Index("ix_quiz_attempts_user", "user_identifier"),
        Index("ix_quiz_attempts_user_completed", "user_identifier", "completed_at"),
    )


class WrongQuestionQueue(Base):
    __tablename__ = "wrong_question_queue"

    id = Column(Integer, primary_key=True, index=True)
    user_identifier = Column(String(100), nullable=False)
    question_id = Column(Integer, nullable=False)
    source_attempt_id = Column(Integer, nullable=True)
    added_at = Column(DateTime(timezone=True), server_default=func.now())
    cleared_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_wrong_queue_user_active", "user_identifier", "cleared_at"),
        Index("ix_wrong_queue_user_question", "user_identifier", "question_id"),
    )


class UserProgress(Base):
    __tablename__ = "user_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_identifier = Column(String(100), nullable=True)
    question_id = Column(Integer, nullable=False)
    is_correct = Column(Boolean, nullable=False)
    attempted_at = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_user_progress_user", "user_identifier"),
        Index("ix_user_progress_user_question", "user_identifier", "question_id"),
        Index("ix_user_progress_user_attempted", "user_identifier", "attempted_at"),
    )


class CategoryMeta(Base):
    """Admin-assigned display metadata per category (emoji icon)."""

    __tablename__ = "category_meta"

    category = Column(String(200), primary_key=True)
    emoji = Column(String(16), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Bookmark(Base):
    """User-saved questions for later revision."""

    __tablename__ = "bookmarks"

    id = Column(Integer, primary_key=True, index=True)
    user_identifier = Column(String(100), nullable=False)
    question_id = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_bookmarks_user", "user_identifier"),
        Index("ix_bookmarks_user_question", "user_identifier", "question_id", unique=True),
    )
