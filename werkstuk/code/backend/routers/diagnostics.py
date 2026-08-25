"""Adaptive placement diagnostic, one per course.

Every not-yet-mastered topic in the active course is probed: three questions
and pass on at least two. A pass credits only that topic. A fail leaves it
for lessons. We do not infer neighbours or unasked doors (passing Division
does not complete Multiplication). Ends with a placed student model.

Already-mastered topics (for example from an earlier course) are skipped, so
placement never overwrites real progress.
"""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from db import db
from graph import Graph, kp_states, load_graph, topic_completed
from learning import get_progress_map, new_progress_row, now_utc, save_progress
from placement import (
    PROBE_PASS_MIN,
    QUESTIONS_PER_TOPIC,
    session_answered_count,
    session_progress_pct,
)
from gates import require_no_active_quiz
from problems import get_problem_or_404, problem_payload
from user_settings import get_active_course_id

router = APIRouter()

# placement marks topics as "conditionally mastered": just above the mastery
# threshold with a short interval, so an early review verifies the placement
PLACED_MASTERY = 0.82
PLACED_STABILITY_DAYS = 3.0


class DiagnosticAnswerIn(BaseModel):
    problem_id: int
    chosen_choice: str


def _topic_order(graph: Graph) -> list[str]:
    """Topics sorted by prerequisite depth (roots first)."""
    depths: dict[str, int] = {}

    def depth_of(topic_id: str, trail: set[str]) -> int:
        if topic_id in depths:
            return depths[topic_id]
        if topic_id in trail:
            return 0  # defensive: cycles should not exist
        prereqs = graph.prereqs_for.get(topic_id, [])
        value = (
            0
            if not prereqs
            else 1 + max(depth_of(p, trail | {topic_id}) for p in prereqs)
        )
        depths[topic_id] = value
        return value

    for topic_id in graph.topics:
        depth_of(topic_id, set())
    return sorted(graph.topics, key=lambda t: (depths[t], t))


def _ladder_topics(
    graph: Graph, course_id: str, progress: dict[int, dict], now
) -> list[str]:
    """Every topic in this course that is not already mastered, easiest first."""
    course_topics = set(graph.topics_by_course.get(course_id, []))
    return [
        topic_id
        for topic_id in _topic_order(graph)
        if topic_id in course_topics
        and graph.kps_by_topic.get(topic_id)
        and not topic_completed(kp_states(topic_id, graph, progress, now))
    ]


def _probe_questions(graph: Graph, topic_id: str) -> list[int]:
    """First three practice items (low sort_order). Lessons use 20+ instead."""
    kp = graph.kps_by_topic[topic_id][0]
    rows = (
        db.table("problems")
        .select("id")
        .eq("knowledge_point_id", kp.id)
        .eq("role", "practice")
        .order("sort_order")
        .limit(QUESTIONS_PER_TOPIC)
        .execute()
        .data
    )
    return [row["id"] for row in rows]


def _current_problem(state: dict) -> dict:
    problem = get_problem_or_404(state["questions"][state["question_index"]])
    return problem_payload(problem)


def _start_probe(state: dict, graph: Graph) -> bool:
    """Point the session at the next course topic. Returns False when done."""
    index = state["probes"]
    if index >= len(state["order"]):
        return False
    state["current"] = state["order"][index]
    state["questions"] = _probe_questions(graph, state["current"])
    state["question_index"] = 0
    state["results"] = []
    return True


def _save_state(session_id: int, state: dict) -> None:
    db.table("diagnostic_sessions").update({"state": state}).eq(
        "id", session_id
    ).execute()


def _finalize(session_id: int, state: dict, user_id: str) -> dict:
    now = now_utc()
    graph = load_graph()
    existing = get_progress_map(user_id)
    for topic_id in state["known"]:
        for kp in graph.kps_by_topic.get(topic_id, []):
            if kp.id in existing:
                # never let placement overwrite real practice history
                continue
            row = new_progress_row(user_id, kp.id)
            row.update(
                {
                    "status": "completed",
                    "mastery": PLACED_MASTERY,
                    "stability": PLACED_STABILITY_DAYS,
                    "success_count": 1,
                    "consecutive_correct": 1,
                    "last_practiced_at": now.isoformat(),
                    "srs_interval_days": int(PLACED_STABILITY_DAYS),
                    "next_review_at": (
                        now + timedelta(days=PLACED_STABILITY_DAYS)
                    ).isoformat(),
                }
            )
            save_progress(row)
    db.table("diagnostic_sessions").update(
        {"status": "completed", "state": state, "completed_at": now.isoformat()}
    ).eq("id", session_id).execute()
    return {
        "done": True,
        "known_topics": [
            {"topic_id": t, "title": graph.topics.get(t, t)} for t in state["known"]
        ],
        "message": (
            "Placement complete. Topics you passed here are marked as "
            "conditionally mastered and will be verified with an early review. "
            "Topics you did not pass stay for lessons."
        ),
    }


def _active_step(session_id: int, state: dict) -> dict:
    return {
        "session_id": session_id,
        "done": False,
        "problem": _current_problem(state),
        "answered": session_answered_count(state),
        "progress_pct": session_progress_pct(state),
    }


@router.get("/diagnostic/current")
def current_diagnostic(user=Depends(get_current_user)):
    """Resume payload if a placement test is still open. Does not start one."""
    require_no_active_quiz(user.id)
    graph = load_graph()
    course_id = get_active_course_id(user.id, graph)
    active = (
        db.table("diagnostic_sessions")
        .select("id, state")
        .eq("user_id", user.id)
        .eq("course_id", course_id)
        .eq("status", "active")
        .limit(1)
        .execute()
        .data
    )
    if not active:
        return {"active": False}
    return {"active": True, **_active_step(active[0]["id"], active[0]["state"])}


@router.post("/diagnostic/start")
def start_diagnostic(user=Depends(get_current_user)):
    require_no_active_quiz(user.id)
    graph = load_graph()
    course_id = get_active_course_id(user.id, graph)

    active = (
        db.table("diagnostic_sessions")
        .select("id, state")
        .eq("user_id", user.id)
        .eq("course_id", course_id)
        .eq("status", "active")
        .limit(1)
        .execute()
        .data
    )
    if active:
        return _active_step(active[0]["id"], active[0]["state"])

    progress = get_progress_map(user.id)
    course_kp_ids = {
        kp.id
        for topic_id in graph.topics_by_course.get(course_id, [])
        for kp in graph.kps_by_topic.get(topic_id, [])
    }
    if any(kp_id in progress for kp_id in course_kp_ids):
        raise HTTPException(
            status_code=400,
            detail="Diagnostic is only available before you start learning in this course",
        )

    order = _ladder_topics(graph, course_id, progress, now_utc())
    if not order:
        raise HTTPException(
            status_code=400, detail="Nothing left to place in this course"
        )
    state = {
        "order": order,
        "known": [],
        "probes": 0,
        "current": None,
        "questions": [],
        "question_index": 0,
        "results": [],
    }
    _start_probe(state, graph)
    session_rows = (
        db.table("diagnostic_sessions")
        .insert({"user_id": user.id, "course_id": course_id, "state": state})
        .execute()
        .data
    )
    return _active_step(session_rows[0]["id"], state)


@router.post("/diagnostic/{session_id}/answer")
def diagnostic_answer(
    session_id: int, body: DiagnosticAnswerIn, user=Depends(get_current_user)
):
    require_no_active_quiz(user.id)
    session_rows = (
        db.table("diagnostic_sessions")
        .select("id, user_id, status, state")
        .eq("id", session_id)
        .limit(1)
        .execute()
        .data
    )
    if not session_rows or session_rows[0]["user_id"] != user.id:
        raise HTTPException(status_code=404, detail="Diagnostic session not found")
    if session_rows[0]["status"] != "active":
        raise HTTPException(status_code=400, detail="Diagnostic already completed")

    state = session_rows[0]["state"]
    expected_id = state["questions"][state["question_index"]]
    if body.problem_id != expected_id:
        raise HTTPException(status_code=400, detail="Unexpected problem")

    problem = get_problem_or_404(
        body.problem_id, "id, correct_choice, explanation"
    )
    is_correct = body.chosen_choice == problem["correct_choice"]
    feedback = {
        "is_correct": is_correct,
        "correct_choice": problem["correct_choice"],
        "explanation": problem.get("explanation"),
    }

    db.table("answer_history").insert(
        {
            "user_id": user.id,
            "problem_id": body.problem_id,
            "chosen_choice": body.chosen_choice,
            "is_correct": is_correct,
            "context": "diagnostic",
        }
    ).execute()

    state["results"].append(is_correct)
    state["question_index"] += 1

    graph = load_graph()

    # more questions left in the current probe
    if state["question_index"] < len(state["questions"]):
        _save_state(session_id, state)
        return {
            "done": False,
            **feedback,
            "problem": _current_problem(state),
        }

    # probe finished: 2-of-3 on this topic, then the next course topic
    passed = sum(1 for result in state["results"] if result) >= PROBE_PASS_MIN
    if passed:
        current = state["current"]
        if current not in state["known"]:
            state["known"].append(current)
    state["probes"] += 1

    if _start_probe(state, graph):
        _save_state(session_id, state)
        return {
            "done": False,
            **feedback,
            "problem": _current_problem(state),
        }

    result = _finalize(session_id, state, user.id)
    result.update(feedback)
    return result
