"""Problem data access shared by lessons, quizzes, the diagnostic, and the
course catalog."""

from fastapi import HTTPException

from db import db

CHOICE_LETTERS = ("a", "b", "c", "d", "e")
PROBLEM_COLUMNS = "id, prompt, choice_a, choice_b, choice_c, choice_d, choice_e"
# Worked examples may show their answer, so they select two extra columns.
EXAMPLE_COLUMNS = PROBLEM_COLUMNS + ", correct_choice, explanation"
# Catalog convention: sort_order 1–3 are placement probes. 20+ is the
# lesson/review bank so a new lesson does not replay the diagnostic.
LESSON_BANK_MIN_SORT = 20


def problem_payload(problem: dict, include_explanation: bool = False) -> dict:
    """The safe subset of a problem row that may go to the browser.
    `correct_choice` is only ever added explicitly (worked examples)."""
    payload = {
        key: problem[key]
        for key in (
            "id",
            "prompt",
            "choice_a",
            "choice_b",
            "choice_c",
            "choice_d",
            "choice_e",
        )
    }
    if include_explanation:
        payload["explanation"] = problem.get("explanation")
    return payload


def first_example(kp_id: int) -> dict | None:
    """The knowledge point's worked example (lowest sort_order), or None."""
    rows = (
        db.table("problems")
        .select(EXAMPLE_COLUMNS)
        .eq("knowledge_point_id", kp_id)
        .eq("role", "example")
        .order("sort_order")
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def example_payload(row: dict) -> dict:
    """A worked example is the one payload allowed to reveal its answer."""
    payload = problem_payload(row, include_explanation=True)
    payload["correct_choice"] = row["correct_choice"]
    return payload


def get_problem_or_404(problem_id: int, columns: str = PROBLEM_COLUMNS) -> dict:
    rows = (
        db.table("problems")
        .select(columns)
        .eq("id", problem_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Problem not found")
    return rows[0]


def pick_practice_problem(
    user_id: str, kp_id: int, exclude_ids: set[int] | None = None
) -> dict:
    """Next practice problem for a knowledge point.

    Prefer the lesson bank (sort_order 20+), then other unanswered items,
    then the least-recently answered. Placement answers live in the same
    history table, so those probe items are skipped until the lesson bank
    is exhausted. Never repeats the item just shown.
    """
    skip = exclude_ids or set()
    all_rows = (
        db.table("problems")
        .select(PROBLEM_COLUMNS + ", sort_order")
        .eq("knowledge_point_id", kp_id)
        .eq("role", "practice")
        .order("sort_order")
        .execute()
        .data
    )
    problem_rows = [row for row in all_rows if row["id"] not in skip] or all_rows
    if not problem_rows:
        raise HTTPException(status_code=404, detail="No practice problem")

    problem_ids = [row["id"] for row in problem_rows]
    history_rows = (
        db.table("answer_history")
        .select("problem_id, created_at")
        .eq("user_id", user_id)
        .in_("problem_id", problem_ids)
        .order("created_at", desc=True)
        .execute()
        .data
    )
    answered_ids = {row["problem_id"] for row in history_rows}

    unanswered = [row for row in problem_rows if row["id"] not in answered_ids]
    if unanswered:
        lesson_bank = [
            row
            for row in unanswered
            if (row.get("sort_order") or 0) >= LESSON_BANK_MIN_SORT
        ]
        return lesson_bank[0] if lesson_bank else unanswered[0]

    latest_id = history_rows[0]["problem_id"]
    last_seen: dict[int, str] = {}
    for entry in reversed(history_rows):
        last_seen[entry["problem_id"]] = entry["created_at"]
    candidates = [row for row in problem_rows if row["id"] != latest_id]
    if not candidates:
        candidates = problem_rows
    candidates.sort(key=lambda row: last_seen.get(row["id"], ""))
    return candidates[0]
