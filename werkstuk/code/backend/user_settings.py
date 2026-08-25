"""Per-user app settings: which course the student is working in.

The active course is server-owned state: the selector, learn queue, quizzes,
and the diagnostic all scope themselves to it, so it must not live in the
browser. One row per user, created lazily on first use.
"""

from db import db
from graph import Graph
from learning import now_utc


def get_active_course_id(user_id: str, graph: Graph) -> str:
    """The user's active course, defaulting to the first course on first use."""
    rows = (
        db.table("user_settings")
        .select("active_course_id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
    )
    course_id = rows[0]["active_course_id"] if rows else None
    current = graph.courses.get(course_id) if course_id else None
    if current is not None and current.listed:
        return current.id

    default = next(
        (course for course in graph.courses.values() if course.listed),
        next(iter(graph.courses.values()), None),
    )
    if default is None:
        raise RuntimeError("No courses in the catalog")
    set_active_course_id(user_id, default.id)
    return default.id


def set_active_course_id(user_id: str, course_id: str) -> None:
    db.table("user_settings").upsert(
        {
            "user_id": user_id,
            "active_course_id": course_id,
            "updated_at": now_utc().isoformat(),
        },
        on_conflict="user_id",
    ).execute()
