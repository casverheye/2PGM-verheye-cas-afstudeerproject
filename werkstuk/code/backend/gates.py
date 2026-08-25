"""Gates that routes check before letting a student act.

Two rules the whole app enforces:
- An unfinished quiz locks Learn, lessons, and the graph until it is done,
  so quiz answers are always given without lesson notes.
- Lessons, reviews, and quizzes in a course stay locked until that course's
  placement diagnostic is finished.
"""

from fastapi import HTTPException

from db import db

QUIZ_IN_PROGRESS_DETAIL = "Finish your quiz before other Learn work."


def active_quiz_id(user_id: str) -> int | None:
    """Id of this user's unfinished quiz, if any. One open quiz at a time,
    across courses, so switching course cannot skip it."""
    rows = (
        db.table("quizzes")
        .select("id")
        .eq("user_id", user_id)
        .eq("status", "active")
        .limit(1)
        .execute()
        .data
    )
    return rows[0]["id"] if rows else None


def require_no_active_quiz(user_id: str) -> None:
    if active_quiz_id(user_id) is not None:
        raise HTTPException(status_code=403, detail=QUIZ_IN_PROGRESS_DETAIL)


def has_completed_diagnostic(user_id: str, course_id: str) -> bool:
    """True after a finished placement test for this course.

    An abandoned (still active) session does not count: the student must
    finish placement before lessons, reviews, or quizzes unlock.
    """
    rows = (
        db.table("diagnostic_sessions")
        .select("id")
        .eq("user_id", user_id)
        .eq("course_id", course_id)
        .eq("status", "completed")
        .limit(1)
        .execute()
        .data
    )
    return bool(rows)
