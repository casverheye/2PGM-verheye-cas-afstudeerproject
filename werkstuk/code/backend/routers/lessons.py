"""Lesson engine: teaching text, then a worked example or practice problem.

The intro is stored on `topics.intro`. Practice grading stays on /answers.
The browser never receives `correct_choice` on practice problems.
"""

from dataclasses import dataclass

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from db import db
from graph import (
    Graph,
    KpState,
    find_weak_prerequisites,
    kp_states,
    load_graph,
    prereqs_met,
    topic_completed,
    topic_is_listed,
)
from learning import (
    MASTERY_THRESHOLD,
    get_progress_map,
    new_progress_row,
    now_utc,
    save_progress,
)
from gates import QUIZ_IN_PROGRESS_DETAIL, active_quiz_id, has_completed_diagnostic
from problems import (
    example_payload,
    first_example,
    pick_practice_problem,
    problem_payload,
)

router = APIRouter()


@dataclass
class TopicSession:
    graph: Graph
    topic_id: str
    mode: str
    current: KpState


def _open_topic(topic_id: str, user) -> TopicSession:
    """Same gates as a lesson: known topic, not halted, prereqs or review."""
    now = now_utc()
    graph = load_graph()
    if topic_id not in graph.topics or not topic_is_listed(graph, topic_id):
        raise HTTPException(status_code=404, detail="Unknown topic")
    course_id = graph.course_for_topic.get(topic_id)
    if course_id and not has_completed_diagnostic(user.id, course_id):
        raise HTTPException(
            status_code=403,
            detail="Finish the placement diagnostic before starting lessons.",
        )
    if active_quiz_id(user.id) is not None:
        raise HTTPException(status_code=403, detail=QUIZ_IN_PROGRESS_DETAIL)
    progress = get_progress_map(user.id)
    states = kp_states(topic_id, graph, progress, now)
    if not states:
        raise HTTPException(status_code=404, detail="No knowledge point for this topic")

    if any(state.halted for state in states):
        weak = find_weak_prerequisites(topic_id, graph, progress, now)
        if weak:
            detail = (
                "This lesson is halted. Strengthen the prerequisite "
                f"'{weak[0].title}' first (see Learn)."
            )
        else:
            detail = "This lesson is halted. Check Learn for the next step."
        raise HTTPException(status_code=403, detail=detail)

    completed = topic_completed(states)
    if not completed and not prereqs_met(topic_id, graph, progress, now):
        raise HTTPException(status_code=403, detail="Prerequisites are not met")

    if completed:
        mode = "review"
        due_states = [state for state in states if state.due]
        pool = due_states or states
        current = min(pool, key=lambda state: state.effective_mastery)
    else:
        mode = "lesson"
        current = next(state for state in states if not state.mastered)

    return TopicSession(graph=graph, topic_id=topic_id, mode=mode, current=current)


def _kp_payload(state: KpState) -> dict:
    return {
        "id": state.kp.id,
        "title": state.kp.title,
        "mastery_pct": round(state.effective_mastery * 100),
        "threshold_pct": round(MASTERY_THRESHOLD * 100),
    }


def _topic_body(session: TopicSession) -> dict:
    return {
        "mode": session.mode,
        "topic": {
            "id": session.topic_id,
            "title": session.graph.topics[session.topic_id],
        },
        "kp": _kp_payload(session.current),
    }


@router.get("/topics/{topic_id}/intro")
def lesson_intro(topic_id: str, user=Depends(get_current_user)):
    """Teaching text plus the current skill's worked example.

    Does not create a progress row. Reviews still get this payload so the
    client can skip the page. New and continued lessons both get the text,
    so a student who comes back (after a halt, or mid-lesson) can reread it.
    """
    session = _open_topic(topic_id, user)
    rows = (
        db.table("topics")
        .select("intro")
        .eq("id", topic_id)
        .limit(1)
        .execute()
        .data
    )
    example = first_example(session.current.kp.id)
    return {
        "kind": "intro",
        **_topic_body(session),
        "intro": rows[0]["intro"] if rows else "",
        "example": example_payload(example) if example else None,
        "resume": session.current.row is not None,
    }


@router.get("/topics/{topic_id}/next-problem")
def next_problem(topic_id: str, user=Depends(get_current_user)):
    """Next practice problem. Teaching text and the worked example live on
    `/intro` so a student can reread them after a halt or mid-lesson."""
    session = _open_topic(topic_id, user)
    kp = session.current.kp
    if session.current.row is None:
        save_progress(new_progress_row(user.id, kp.id))

    problem = pick_practice_problem(user.id, kp.id)
    return {
        "kind": "practice",
        **_topic_body(session),
        "problem": problem_payload(problem),
    }
