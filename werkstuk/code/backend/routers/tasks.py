"""Task selection and the topic library, scoped to the user's active course."""

from fastapi import APIRouter, Depends

from auth import get_current_user
from db import db
from graph import (
    course_completed,
    find_weak_prerequisites,
    kp_states,
    load_graph,
    prereqs_met,
    recommended_next_course,
    topic_completed,
)
from gates import active_quiz_id, has_completed_diagnostic
from learning import earliest_upcoming_review, get_progress_map, now_utc
from selector import build_tasks
from user_settings import get_active_course_id

router = APIRouter()


@router.get("/next-tasks")
def next_tasks(user=Depends(get_current_user)):
    """The adaptive plan: ranked tasks with explainable reasons."""
    graph = load_graph()
    course_id = get_active_course_id(user.id, graph)
    course = graph.courses[course_id]
    now = now_utc()
    progress = get_progress_map(user.id)
    kp_ids = [
        kp.id
        for topic_id in graph.topics_by_course.get(course_id, [])
        for kp in graph.kps_by_topic.get(topic_id, [])
    ]
    upcoming = earliest_upcoming_review(progress, kp_ids, now)
    later = None
    if active_quiz_id(user.id) is None and course_completed(
        course_id, graph, progress, now
    ):
        suggestion = recommended_next_course(course_id, graph, progress, now)
        if suggestion is not None:
            later = {"id": suggestion.id, "title": suggestion.title}
    return {
        "course": {"id": course.id, "title": course.title},
        "tasks": build_tasks(user.id, course_id, graph),
        "next_review_at": upcoming.isoformat() if upcoming else None,
        "next_course": later,
    }


@router.get("/learn-queue")
def learn_queue(user=Depends(get_current_user)):
    """Active course's topic library with per-topic state (user-agency view)."""
    now = now_utc()
    graph = load_graph()
    course_id = get_active_course_id(user.id, graph)
    course = graph.courses[course_id]
    progress = get_progress_map(user.id)
    placed = has_completed_diagnostic(user.id, course_id)
    quiz_lock = active_quiz_id(user.id) is not None

    items = []
    for topic_id in graph.topics_by_course.get(course_id, []):
        title = graph.topics[topic_id]
        states = kp_states(topic_id, graph, progress, now)
        if not states:
            continue
        mastered = sum(1 for state in states if state.mastered)
        completed = topic_completed(states)
        halted = any(state.halted for state in states)
        weak_halt = halted and bool(
            find_weak_prerequisites(topic_id, graph, progress, now)
        )
        started = any(state.started for state in states)
        unlocked = prereqs_met(topic_id, graph, progress, now)
        due = any(state.due for state in states)
        average_mastery = sum(state.effective_mastery for state in states) / len(
            states
        )

        if not placed:
            state_label = "locked"
        elif halted:
            state_label = "halted"
        elif completed:
            state_label = "completed"
        elif started:
            state_label = "in_progress"
        elif unlocked:
            state_label = "available"
        else:
            state_label = "locked"

        items.append(
            {
                "topic_id": topic_id,
                "title": title,
                "state": state_label,
                "kind": "review" if completed else "lesson",
                "can_start": placed
                and not quiz_lock
                and (
                    (completed and due)
                    or (halted and not weak_halt)
                    or (not completed and not halted and unlocked)
                ),
                "due_review": due,
                "mastery_pct": round(average_mastery * 100),
                "kp_mastered": mastered,
                "kp_total": len(states),
            }
        )
    return {
        "course": {"id": course.id, "title": course.title},
        "items": items,
    }


@router.get("/calendar")
def learning_calendar(user=Depends(get_current_user)):
    """Read-only month data for the active course.

    Reviews: `user_progress.next_review_at` for this course's knowledge points.
    Practiced days: `answer_history` rows whose problem belongs to this course.
    The browser turns timestamps into local calendar dates. Does not write.
    """
    graph = load_graph()
    course_id = get_active_course_id(user.id, graph)
    course_kp_ids = {
        kp.id
        for topic_id in graph.topics_by_course.get(course_id, [])
        for kp in graph.kps_by_topic.get(topic_id, [])
    }
    progress = get_progress_map(user.id)
    reviews = [
        row["next_review_at"]
        for kp_id, row in progress.items()
        if kp_id in course_kp_ids and row.get("next_review_at")
    ]
    history = (
        db.table("answer_history")
        .select("created_at, problem_id")
        .eq("user_id", user.id)
        .execute()
        .data
    )
    problem_ids = list({row["problem_id"] for row in history if row.get("problem_id")})
    kp_by_problem: dict[int, int] = {}
    if problem_ids:
        problem_rows = (
            db.table("problems")
            .select("id, knowledge_point_id")
            .in_("id", problem_ids)
            .execute()
            .data
        )
        kp_by_problem = {row["id"]: row["knowledge_point_id"] for row in problem_rows}
    practiced = [
        row["created_at"]
        for row in history
        if row.get("created_at")
        and kp_by_problem.get(row["problem_id"]) in course_kp_ids
    ]
    return {"reviews": reviews, "practiced": practiced}
