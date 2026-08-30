from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import models
import database
import questions_router
import quiz_router
import admin_router
import auth_router

# Create database tables
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(
    title="Question Bank API",
    description="API for Question Bank/MCQ Practice Application",
    version="1.0.0"
)

# Configure CORS — use * for same-origin (start_prod serves both), restrict in dev
is_production = os.getenv("RENDER") is not None or os.getenv("ENVIRONMENT") == "production"
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if is_production else ["http://localhost:5173", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(questions_router.router)
app.include_router(quiz_router.router)
app.include_router(admin_router.router)
app.include_router(auth_router.router)

@app.get("/")
def read_root():
    return {
        "message": "Question Bank API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/health")
def health_check():
    import database
    db_type = "postgresql" if database.is_postgres else "sqlite"
    user_count = 0
    question_count = 0
    try:
        db = database.SessionLocal()
        user_count = db.query(models.User).count()
        question_count = db.query(models.Question).count()
        db.close()
    except Exception as e:
        pass
    return {
        "status": "healthy",
        "database": db_type,
        "users": user_count,
        "questions": question_count,
    }
