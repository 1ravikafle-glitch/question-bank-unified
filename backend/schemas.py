from pydantic import BaseModel
from typing import Optional, Dict
from datetime import datetime


class QuestionBase(BaseModel):
    question_number: int
    question_text: str
    options: Optional[Dict[str, str]] = {}
    correct_answer: str
    category: Optional[str] = None
    difficulty: Optional[str] = None
    explanation: Optional[str] = None


class QuestionCreate(QuestionBase):
    pass


class QuestionUpdate(BaseModel):
    question_number: Optional[int] = None
    question_text: Optional[str] = None
    options: Optional[Dict[str, str]] = None
    correct_answer: Optional[str] = None
    category: Optional[str] = None
    difficulty: Optional[str] = None
    explanation: Optional[str] = None


class Question(QuestionBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class QuizAnswer(BaseModel):
    question_id: int
    selected_answer: str


class QuizSubmission(BaseModel):
    answers: Dict[int, str]
    username: Optional[str] = None
    # Mock-exam penalty per wrong answer (e.g. 0.2 Loksewa-style). 0 = plain practice.
    negative_marking: float = 0.0


class QuizResult(BaseModel):
    score: int
    total_questions: int
    percentage: int
    correct_answers: Dict[int, bool]
    incorrect_questions: list[int]
    # Echoed scoring detail for mock exams (absent/0 for plain practice).
    raw_score: Optional[int] = None
    negative_marking: float = 0.0
    skipped_questions: list[int] = []


class UserProgressBase(BaseModel):
    user_identifier: Optional[str] = None
    question_id: int
    is_correct: bool


class UserProgressCreate(UserProgressBase):
    pass


class UserProgress(UserProgressBase):
    id: int
    attempted_at: datetime
    reviewed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
