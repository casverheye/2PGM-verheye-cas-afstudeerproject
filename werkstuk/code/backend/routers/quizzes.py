"""Mixed quizzes: two questions per learned topic, interleaved.

Quiz answers are graded through POST /answers and feed the student model.
Keys stay on the server until the sitting is finished.
"""

import random

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from db import db
from gates import active_quiz_id, has_completed_diagnostic
from graph import kp_states, load_graph
from learning import get_progress_map, now_utc
from problems import pick_practice_problem, problem_payload
from selector import (
    QUIZ_MIN_MASTERY,
    QUIZ_QUESTIONS_PER_TOPIC,
    eligible_quiz_topics,
    quiz_due_kind,
)
from user_settings import get_active_course_id

router = APIRouter()


@router.get("/quizzes/active")
def active_quiz(user=Depends(get_current_user)):
    """Used by the client to bounce back into an unfinished sitting."""
    quiz_id = active_quiz_id(user.id)
    return {"active": quiz_id is not None, "quiz_id": quiz_id}


@router.post("/quizzes")
def create_quiz(user=Depends(get_current_user)):
    graph = load_graph()
    course_id = get_active_course_id(user.id, graph)
    if not has_completed_diagnostic(user.id, course_id):
        raise HTTPException(
            status_code=403,
            detail="Finish the placement diagnostic before starting a quiz.",
        )

    open_id = active_quiz_id(user.id)
    if open_id is not None:
        return get_quiz(open_id, user)

    now = now_utc()
    progress = get_progress_map(user.id)
    kind = quiz_due_kind(user.id, course_id, graph, progress, now)
    if kind is None:
        raise HTTPException(status_code=400, detail="No quiz is due yet")

    topic_ids = eligible_quiz_topics(course_id, graph, progress, now)
    if len(topic_ids) < 2:
        raise HTTPException(
            status_code=400, detail="Not enough learned topics for a mixed quiz"
        )

    chosen: list[tuple[str, object]] = []
    for topic_id in topic_ids:
        states = [
            state
            for state in kp_states(topic_id, graph, progress, now)
            if state.started
            and not state.halted
            and state.effective_mastery >= QUIZ_MIN_MASTERY
        ]
        states.sort(key=lambda state: (not state.due, state.effective_mastery))
        if not states:
            continue
        if len(states) >= QUIZ_QUESTIONS_PER_TOPIC:
            picked = states[:QUIZ_QUESTIONS_PER_TOPIC]
        else:
            picked = [states[0]] * QUIZ_QUESTIONS_PER_TOPIC
        for state in picked:
            chosen.append((topic_id, state))

    ordered = _interleave_quiz_items(chosen)

    quiz_rows = (
        db.table("quizzes")
        .insert({"user_id": user.id, "course_id": course_id})
        .execute()
        .data
    )
    quiz_id = quiz_rows[0]["id"]
    used_problem_ids: set[int] = set()
    for index, (topic_id, state) in enumerate(ordered, start=1):
        problem = pick_practice_problem(user.id, state.kp.id, used_problem_ids)
        used_problem_ids.add(problem["id"])
        db.table("quiz_questions").insert(
            {
                "quiz_id": quiz_id,
                "problem_id": problem["id"],
                "sort_order": index,
            }
        ).execute()

    return get_quiz(quiz_id, user)


def _interleave_quiz_items(
    chosen: list[tuple[str, object]],
) -> list[tuple[str, object]]:
    """One pass per question-slot, shuffled topic order.

    With at least two topics and two questions each, round-robin never
    puts the same topic twice in a row. A greedy leftover pick can.
    """
    by_topic: dict[str, list] = {}
    order: list[str] = []
    for topic_id, state in chosen:
        if topic_id not in by_topic:
            order.append(topic_id)
            by_topic[topic_id] = []
        by_topic[topic_id].append(state)
    random.shuffle(order)
    depth = max((len(items) for items in by_topic.values()), default=0)
    ordered: list[tuple[str, object]] = []
    for round_index in range(depth):
        for topic_id in order:
            items = by_topic[topic_id]
            if round_index < len(items):
                ordered.append((topic_id, items[round_index]))
    return ordered


def _quiz_recap(quiz_id: int, user_id: str, graph) -> list[dict]:
    question_rows = (
        db.table("quiz_questions")
        .select("id, problem_id, sort_order, is_correct")
        .eq("quiz_id", quiz_id)
        .order("sort_order")
        .execute()
        .data
    )
    history_rows = (
        db.table("answer_history")
        .select("problem_id, chosen_choice")
        .eq("user_id", user_id)
        .eq("quiz_id", quiz_id)
        .eq("context", "quiz")
        .execute()
        .data
    )
    chosen_by_problem = {
        row["problem_id"]: row["chosen_choice"] for row in history_rows
    }
    recap = []
    for question in question_rows:
        problem = (
            db.table("problems")
            .select(
                "id, prompt, knowledge_point_id, correct_choice, explanation, "
                "choice_a, choice_b, choice_c, choice_d, choice_e"
            )
            .eq("id", question["problem_id"])
            .limit(1)
            .execute()
            .data
        )
        if not problem:
            continue
        row = problem[0]
        kp = graph.kp_by_id.get(row["knowledge_point_id"])
        topic_id = kp.topic_id if kp else ""
        recap.append(
            {
                "topic_id": topic_id,
                "topic_title": graph.topics.get(topic_id, topic_id),
                "prompt": row["prompt"],
                "chosen_choice": chosen_by_problem.get(row["id"]),
                "correct_choice": row["correct_choice"],
                "is_correct": question["is_correct"],
                "explanation": row.get("explanation"),
                "choice_a": row["choice_a"],
                "choice_b": row["choice_b"],
                "choice_c": row["choice_c"],
                "choice_d": row["choice_d"],
                "choice_e": row["choice_e"],
            }
        )
    return recap


@router.get("/quizzes/{quiz_id}")
def get_quiz(quiz_id: int, user=Depends(get_current_user)):
    quiz_rows = (
        db.table("quizzes")
        .select("id, user_id, status, score")
        .eq("id", quiz_id)
        .limit(1)
        .execute()
        .data
    )
    if not quiz_rows or quiz_rows[0]["user_id"] != user.id:
        raise HTTPException(status_code=404, detail="Quiz not found")
    quiz = quiz_rows[0]

    question_rows = (
        db.table("quiz_questions")
        .select("id, problem_id, sort_order, is_correct")
        .eq("quiz_id", quiz_id)
        .order("sort_order")
        .execute()
        .data
    )
    answered = sum(1 for q in question_rows if q["is_correct"] is not None)

    next_question = None
    recap = None
    if quiz["status"] == "completed":
        recap = _quiz_recap(quiz_id, user.id, load_graph())
    else:
        pending = next((q for q in question_rows if q["is_correct"] is None), None)
        if pending is not None:
            problem_rows = (
                db.table("problems")
                .select("id, prompt, choice_a, choice_b, choice_c, choice_d, choice_e")
                .eq("id", pending["problem_id"])
                .limit(1)
                .execute()
                .data
            )
            next_question = {
                "quiz_question_id": pending["id"],
                "problem": problem_payload(problem_rows[0]),
            }

    return {
        "quiz_id": quiz["id"],
        "status": quiz["status"],
        "score": round(quiz["score"] * 100) if quiz["score"] is not None else None,
        "total": len(question_rows),
        "answered": answered,
        "next_question": next_question,
        "recap": recap,
    }
