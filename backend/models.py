from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, JSON
from sqlalchemy.sql import func
import database

Base = database.Base

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
    options = Column(JSON)  # Store options as JSON object
    correct_answer = Column(String(1), nullable=False)  # a, b, c, or d
    category = Column(String(100), nullable=True)
    difficulty = Column(String(20), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id = Column(Integer, primary_key=True, index=True)
    user_identifier = Column(String(100), nullable=True)  # For localStorage tracking
    score = Column(Integer, nullable=False)
    total_questions = Column(Integer, nullable=False)
    percentage = Column(Integer, nullable=False)
    answers = Column(JSON)  # Store user answers
    incorrect_questions = Column(JSON)  # Store list of wrong question IDs
    completed_at = Column(DateTime(timezone=True), server_default=func.now())

class WrongQuestionQueue(Base):
    __tablename__ = "wrong_question_queue"

    id = Column(Integer, primary_key=True, index=True)
    user_identifier = Column(String(100), nullable=False, index=True)
    question_id = Column(Integer, nullable=False, index=True)
    source_attempt_id = Column(Integer, nullable=True)  # Which quiz attempt caused this
    added_at = Column(DateTime(timezone=True), server_default=func.now())
    cleared_at = Column(DateTime(timezone=True), nullable=True)  # When re-practiced

class UserProgress(Base):
    __tablename__ = "user_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_identifier = Column(String(100), nullable=True, index=True)
    question_id = Column(Integer, nullable=False, index=True)
    is_correct = Column(Boolean, nullable=False)
    attempted_at = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True), nullable=True)