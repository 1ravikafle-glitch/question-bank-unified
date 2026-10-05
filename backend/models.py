from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    Text,
    JSON,
    Index,
    Float,
    LargeBinary,
)
from sqlalchemy.sql import func
import database
import json as _json

Base = database.Base

# Use JSONB on PostgreSQL for indexing; JSON on SQLite
if database.is_postgres:
    from sqlalchemy.dialects.postgresql import JSONB
    JSONType = JSONB
else:
    JSONType = JSON


def usable_options(raw) -> dict:
    """Parse stored options (plain or double-encoded JSON) to a dict.

    Rows with fewer than 2 options are defective (e.g. '{}') and must
    never reach a quiz or the bank — answering them is impossible.
    """
    v = raw
    for _ in range(3):
        if isinstance(v, dict):
            break
        if isinstance(v, str):
            try:
                v = _json.loads(v)
            except Exception:
                break
        else:
            break
    return v if isinstance(v, dict) else {}


def is_usable_question(q) -> bool:
    return len(usable_options(getattr(q, "options", None))) >= 2


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    # Nullable: an account created through Google sign-in has no password.
    # Local accounts carry a bcrypt hash; Google-only accounts carry the
    # NO_PASSWORD sentinel so no code path can ever match an empty string.
    password = Column(String(100), nullable=True)
    # Google's stable account id (the token's "sub" claim). Set once, then
    # trusted as the identity key so a renamed Google account still maps back.
    google_sub = Column(String(64), nullable=True, index=True)
    email = Column(String(255), nullable=True)
    # Epoch seconds. Bumped on password reset/change; session tokens minted
    # before this instant stop verifying, which is what makes a reset actually
    # revoke every device.
    sessions_valid_from = Column(Integer, nullable=True)
    # Public member number, e.g. "FR-1042". Distinct from `username`: this is
    # an identifier you can show someone or write on paper, and it never
    # changes. Login accepts either one. Assigned at registration when the
    # user leaves it blank. Do not treat it as a secret.
    user_id = Column(String(20), nullable=True, unique=True, index=True)
    # Manual registration NEVER verifies the address - by design. The address
    # is only used later to deliver a password-reset code, and possession of an
    # unverified address grants no access to an existing account because the
    # code has to be read from the mailbox.
    #
    # INTEGER (0/1), NOT Boolean. This bit us in production: the model said
    # Boolean while auth_migrations had ALTERed the existing table to INTEGER,
    # and SQLite does not care about type names so every local test passed,
    # while Postgres refused a boolean literal into an integer column and
    # broke ALL registrations. Keep this Integer and the migration DDL in
    # sync. Do not revert.
    email_verified = Column(Integer, nullable=False, default=0, server_default="0")
    # Keyed HMAC-SHA256 of the normalised address (see email_crypto). The
    # `email` column above holds a Fernet token, which is non-deterministic and
    # therefore cannot be searched for equality — this is the column every
    # "which account owns this address" lookup compares. Unique, so two
    # accounts can never share one inbox.
    email_hash = Column(String(64), nullable=True, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PasswordResetToken(Base):
    """One-shot password reset codes.

    Only the SHA-256 of the code is stored, so a database leak does not hand an
    attacker working reset links. Used_at makes every code single-use.
    """

    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_identifier = Column(String(100), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(Integer, nullable=False)
    # Short numeric/alpha code the user types, hashed the same way. Optional:
    # rows with code_hash set are OTP challenges, rows without are the
    # high-entropy reset token minted after a code is verified.
    code_hash = Column(String(64), nullable=True, index=True)
    # Failed code submissions. Hard-capped so a short code cannot be brute
    # forced; the cap invalidates the challenge rather than just refusing.
    attempts = Column(Integer, nullable=False, default=0, server_default="0")
    # What the code authorises: "reset" (change a password) or "verify" (prove
    # you own the address on a signup, which mints the member ID). The two
    # codes are stored in the same table, so without this a code typed into the
    # verification box would also be accepted at the password-reset endpoint.
    # Defaults to "reset" so every row written before this column existed keeps
    # its original meaning.
    purpose = Column(String(16), nullable=False, default="reset", server_default="reset")
    used_at = Column(Integer, nullable=True)
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
    explanation = Column(Text, nullable=True)
    source = Column(String(60), nullable=True, default="bank")
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
    # Exam papers leave blanks unanswered. Persisted so the "N blank, no
    # penalty" line still renders when the result is reloaded from history.
    skipped_questions = Column(JSONType, nullable=True)
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


class Reference(Base):
    """Book and source credits shown in the About section.

    The question bank draws heavily on published forestry references; this
    table is the admin-managed list the About page renders. Empty by design
    until the admin adds entries - About shows a placeholder meanwhile.
    """

    __tablename__ = "references"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(300), nullable=False)
    author = Column(String(300), nullable=True)
    detail = Column(String(300), nullable=True)
    url = Column(String(500), nullable=True)
    position = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Contributor(Base):
    """People credited under "Special Contribution" in the About section.

    A table rather than a hardcoded list so the credits can grow, be
    reordered or be withdrawn by the admin without a deploy. role is a short
    optional note ("Question curation", "Design") and stays empty for a plain
    credit. create_all() creates the table on boot; the founding entries are
    seeded only while it is empty.
    """

    __tablename__ = "contributors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    role = Column(String(200), nullable=True)
    position = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Feedback(Base):
    """User suggestions, anonymous to everyone except the author.

    user_identifier is stored so the author sees their own thread and replies,
    and so the rate limit works - but it is NEVER serialized to admin reads.
    Admin sees the message, the reply thread, and timestamps only.
    """

    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_identifier = Column(String(100), nullable=False, index=True)
    message = Column(String(2000), nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    admin_reply = Column(String(2000), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    replied_at = Column(DateTime(timezone=True), nullable=True)


class Quote(Base):
    """Motivational line shown on the dashboard (random pick)."""

    __tablename__ = "quotes"

    id = Column(Integer, primary_key=True, index=True)
    text = Column(Text, nullable=False, unique=True)


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


class QuestionNote(Base):
    """Personal user note attached to a question (one per user+question)."""

    __tablename__ = "question_notes"

    id = Column(Integer, primary_key=True, index=True)
    user_identifier = Column(String(100), nullable=False)
    question_id = Column(Integer, nullable=False)
    text = Column(Text, nullable=False, default="")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_notes_user", "user_identifier"),
        Index("ix_notes_user_question", "user_identifier", "question_id", unique=True),
    )


class ContributionRequest(Base):
    """A contributor's PDF/DOCX waiting for admin review.

    Contributors never write to `questions` directly. The parsed questions are
    parked here as JSON; an admin approval is what actually inserts them into
    the bank. A contributor may hold at most MAX_PENDING_CONTRIBUTIONS of these
    at once — each accept OR reject moves one out of 'pending' and frees a slot.
    """

    __tablename__ = "contribution_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_identifier = Column(String(100), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    # Display title for the Past Papers list. Admin-editable, and separate from
    # `filename` because "IMG_4471.pdf" is a filename, not a title. NULL falls
    # back to the filename with its extension stripped.
    title = Column(String(300), nullable=True)
    # The uploaded file itself, byte for byte, for kind == "pdf".
    #
    # Only whole-PDF contributions keep their original bytes. Everything else is
    # parsed into `payload` and the original is discarded, so that approving a
    # contribution inserts exactly what the admin reviewed rather than replaying
    # something that was still on disk. A whole PDF has no reviewable question
    # list at all, so there is nothing to parse and nothing to insert: the file
    # IS the deliverable, and it has to be stored to be served.
    #
    # LargeBinary rather than a filesystem path: Render's disk is ephemeral, so
    # an uploaded file written to /tmp is gone on the next deploy.
    pdf_bytes = Column(LargeBinary, nullable=True)
    pdf_pages = Column(Integer, nullable=True)
    pdf_size = Column(Integer, nullable=True)
    category = Column(String(100), nullable=True)
    # pending | approved | rejected
    status = Column(String(20), nullable=False, default="pending", index=True)
    question_count = Column(Integer, nullable=False, default=0)
    with_answer = Column(Integer, nullable=False, default=0)
    # Parsed questions, held until approved.
    payload = Column(JSONType)
    # What the contributor said this file is: "past_paper" (a complete past
    # question paper) or "questions" (a loose set of MCQs). Presentation only —
    # admin review is identical for both. NULL on rows predating the column.
    kind = Column(String(20), nullable=True)
    # Shown to the contributor when status == 'rejected'.
    admin_note = Column(Text, nullable=True)
    reviewed_by = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_contrib_user_status", "user_identifier", "status"),
    )
