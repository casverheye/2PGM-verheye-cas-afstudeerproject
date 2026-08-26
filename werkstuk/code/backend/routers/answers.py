"""POST /answers: the single write path into the student model.

Every graded answer (lesson, review, or quiz) flows through here:
grade -> record history -> explicit evidence -> halting check ->
implicit evidence over encompassing edges -> quiz bookkeeping.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from db import db
from graph import Graph, find_weak_prerequisites, kp_states, load_graph, topic_completed
from learning import (
    HALT_FAIL_STREAK,
    LESSON_SITTING_DETAIL,
    MASTERY_THRESHOLD,
    REVIEW_PASS_STREAK,
    apply_evidence,
    get_progress_map,
    lesson_sitting_exhausted,
    new_progress_row,
    now_utc,
    save_progress,
    trailing_correct_streak,
)
from gates import QUIZ_IN_PROGRESS_DETAIL, active_quiz_id
from problems import CHOICE_LETTERS

router = APIRouter()


class AnswerIn(BaseModel):
    problem_id: int
    chosen_choice: str
    quiz_question_id: int | None = None
    response_ms: int | None = None


def _fail_streak(user_id: str, kp_id: int) -> int:
    """Wrong answers in a row on this knowledge point, in a lesson only.

    Diagnostic, quiz, and review rows stay in `answer_history`, but they
    must not trip the halt. Halt means "this lesson is not working", not
    "the placement test went badly".
    """
    problem_rows = (
        db.table("problems").select("id").eq("knowledge_point_id", kp_id).execute().data
    )
    problem_ids = [row["id"] for row in problem_rows]
    history = (
        db.table("answer_history")
        .select("is_correct")
        .eq("user_id", user_id)
        .eq("context", "lesson")
        .in_("problem_id", problem_ids)
        .order("created_at", desc=True)
        .limit(HALT_FAIL_STREAK)
        .execute()
        .data
    )
    streak = 0
    for entry in history:
        if entry["is_correct"]:
            break
        streak += 1
    return streak


def _load_quiz_question(quiz_question_id: int, problem_id: int, user_id: str) -> dict:
    """Validate that the quiz question exists, belongs to this user's active
    quiz, matches the answered problem, and is still unanswered."""
    question_rows = (
        db.table("quiz_questions")
        .select("id, quiz_id, problem_id, is_correct")
        .eq("id", quiz_question_id)
        .limit(1)
        .execute()
        .data
    )
    if not question_rows:
        raise HTTPException(status_code=404, detail="Quiz question not found")
    question = question_rows[0]
    if question["problem_id"] != problem_id:
        raise HTTPException(status_code=400, detail="Problem does not match quiz question")
    if question["is_correct"] is not None:
        raise HTTPException(status_code=400, detail="Question already answered")

    quiz_rows = (
        db.table("quizzes")
        .select("id, user_id, status")
        .eq("id", question["quiz_id"])
        .limit(1)
        .execute()
        .data
    )
    if not quiz_rows or quiz_rows[0]["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if quiz_rows[0]["status"] != "active":
        raise HTTPException(status_code=400, detail="Quiz is already completed")
    return question


def _propagate_implicit_credit(
    topic_id: str, graph: Graph, progress: dict[int, dict], now
) -> list[dict]:
    """Fractional implicit repetition: a correct answer on an advanced topic
    partially refreshes the topics it encompasses."""
    updates = []
    for target_topic_id, weight in graph.encompasses.get(topic_id, []):
        for target_kp in graph.kps_by_topic.get(target_topic_id, []):
            target_row = progress.get(target_kp.id)
            if target_row is None or target_row["status"] == "halted":
                continue
            apply_evidence(target_row, True, weight, now, explicit=False)
            save_progress(target_row)
            updates.append(
                {
                    "topic_id": target_topic_id,
                    "kp_id": target_kp.id,
                    "kp_title": target_kp.title,
                    "weight": weight,
                    "mastery_pct": round(target_row["mastery"] * 100),
                    "next_review_at": target_row["next_review_at"],
                }
            )
    return updates


def _record_quiz_answer(question: dict, is_correct: bool, now) -> dict:
    """Mark the quiz question answered; complete and score the quiz when it
    was the last one."""
    db.table("quiz_questions").update({"is_correct": is_correct}).eq(
        "id", question["id"]
    ).execute()
    all_questions = (
        db.table("quiz_questions")
        .select("id, is_correct")
        .eq("quiz_id", question["quiz_id"])
        .execute()
        .data
    )
    remaining = sum(1 for q in all_questions if q["is_correct"] is None)
    score = None
    if remaining == 0:
        score = sum(1 for q in all_questions if q["is_correct"]) / len(all_questions)
        db.table("quizzes").update(
            {
                "status": "completed",
                "score": round(score, 3),
                "completed_at": now.isoformat(),
            }
        ).eq("id", question["quiz_id"]).execute()
    return {
        "quiz_id": question["quiz_id"],
        "completed": remaining == 0,
        "remaining": remaining,
        "score": round(score * 100) if score is not None else None,
    }


@router.post("/answers")
def submit_answer(body: AnswerIn, user=Depends(get_current_user)):
    if body.chosen_choice not in CHOICE_LETTERS:
        raise HTTPException(
            status_code=400, detail="chosen_choice must be a, b, c, d, or e"
        )

    problem_rows = (
        db.table("problems")
        .select("id, correct_choice, knowledge_point_id, explanation")
        .eq("id", body.problem_id)
        .limit(1)
        .execute()
        .data
    )
    if not problem_rows:
        raise HTTPException(status_code=404, detail="Problem not found")

    problem = problem_rows[0]
    kp_id = problem["knowledge_point_id"]
    is_correct = body.chosen_choice == problem["correct_choice"]
    now = now_utc()

    graph = load_graph()
    kp = graph.kp_by_id.get(kp_id)
    if kp is None:
        raise HTTPException(status_code=404, detail="Knowledge point not found")
    topic_id = kp.topic_id

    progress = get_progress_map(user.id)
    row = progress.get(kp_id) or new_progress_row(user.id, kp_id)
    was_completed = row.get("status") == "completed"
    previous_review_at = row.get("next_review_at")

    # validate quiz linkage before writing anything
    quiz_question = None
    if body.quiz_question_id is not None:
        quiz_question = _load_quiz_question(
            body.quiz_question_id, body.problem_id, user.id
        )
    elif active_quiz_id(user.id) is not None:
        raise HTTPException(status_code=403, detail=QUIZ_IN_PROGRESS_DETAIL)

    if quiz_question is not None:
        context = "quiz"
    elif was_completed:
        context = "review"
    else:
        context = "lesson"

    db.table("answer_history").insert(
        {
            "user_id": user.id,
            "problem_id": body.problem_id,
            "chosen_choice": body.chosen_choice,
            "is_correct": is_correct,
            "context": context,
            "quiz_id": quiz_question["quiz_id"] if quiz_question else None,
            "response_ms": body.response_ms,
        }
    ).execute()

    # explicit evidence on this knowledge point
    apply_evidence(row, is_correct, 1.0, now, explicit=True)

    review_streak = 0
    if context == "review":
        kp_ids = [item.id for item in graph.kps_by_topic.get(topic_id, [])]
        review_problems = (
            db.table("problems")
            .select("id")
            .in_("knowledge_point_id", kp_ids)
            .execute()
            .data
            if kp_ids
            else []
        )
        review_streak = trailing_correct_streak(
            user.id,
            [item["id"] for item in review_problems],
            "review",
        )
        # Keep the review due until two correct in a row this sitting.
        if is_correct and review_streak < REVIEW_PASS_STREAK:
            row["next_review_at"] = previous_review_at
            if was_completed and (row.get("mastery") or 0) >= MASTERY_THRESHOLD:
                row["status"] = "completed"

    # lesson halting: repeated failure stops the lesson and triggers remediation
    halted = False
    halt_reason = None
    if (
        not is_correct
        and context == "lesson"
        and _fail_streak(user.id, kp_id) >= HALT_FAIL_STREAK
    ):
        row["status"] = "halted"
        halted = True
        weak = find_weak_prerequisites(topic_id, graph, progress, now)
        if weak:
            halt_reason = (
                f"Halted after {HALT_FAIL_STREAK} mistakes in a row. Weakest "
                f"prerequisite: {weak[0].title}."
            )
        else:
            halt_reason = (
                f"Halted after {HALT_FAIL_STREAK} mistakes in a row. "
                "Take a break and resume from Learn."
            )
    sitting_capped = False
    sitting_cap_reason = None
    if context == "lesson" and not halted and lesson_sitting_exhausted(
        user.id, kp_id, row
    ):
        sitting_capped = True
        sitting_cap_reason = LESSON_SITTING_DETAIL
    save_progress(row)

    implicit_updates = []
    if is_correct:
        implicit_updates = _propagate_implicit_credit(topic_id, graph, progress, now)

    quiz_info = None
    if quiz_question is not None:
        quiz_info = _record_quiz_answer(quiz_question, is_correct, now)

    # Closed-book sitting: do not send the key or even right/wrong until
    # the quiz is finished. The student model is already updated above.
    if quiz_info is not None:
        return {
            "context": "quiz",
            "quiz": quiz_info,
        }

    fresh_states = kp_states(topic_id, graph, get_progress_map(user.id), now)
    if context == "review":
        sitting_done = review_streak >= REVIEW_PASS_STREAK
    else:
        sitting_done = topic_completed(fresh_states)

    return {
        "is_correct": is_correct,
        "correct_choice": problem["correct_choice"],
        "explanation": problem.get("explanation"),
        "context": context,
        "kp": {
            "id": kp_id,
            "title": kp.title,
            "mastery_pct": round(row["mastery"] * 100),
            "threshold_pct": round(MASTERY_THRESHOLD * 100),
            "mastered": row["status"] == "completed",
            "status": row["status"],
        },
        "topic_completed": sitting_done,
        "halted": halted,
        "halt_reason": halt_reason,
        "sitting_capped": sitting_capped,
        "sitting_cap_reason": sitting_cap_reason,
        "implicit_updates": implicit_updates,
        "next_review_at": row["next_review_at"],
        "quiz": quiz_info,
        "consecutive_correct": row["consecutive_correct"],
    }
