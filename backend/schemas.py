from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime
import models
import database

class QuestionBase(BaseModel):
    question_number: int
    question_text: str
    options: Optional[Dict[str, str]] = {}
    correct_answer: str
    category: Optional[str] = None
    difficulty: Optional[str] = None

class QuestionCreate(QuestionBase):
    pass

class QuestionUpdate(BaseModel):
    question_number: Optional[int] = None
    question_text: Optional[str] = None
    options: Optional[Dict[str, str]] = None
    correct_answer: Optional[str] = None
    category: Optional[str] = None
    difficulty: Optional[str] = None

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
    answers: Dict[int, str]  # question_id: selected_answer
    username: Optional[str] = None

class QuizResult(BaseModel):
    score: int
    total_questions: int
    percentage: int
    correct_answers: Dict[int, bool]  # question_id: is_correct
    incorrect_questions: list[int]  # list of question_ids that were incorrect

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