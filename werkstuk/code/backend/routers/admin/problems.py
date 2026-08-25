"""Admin question routes. Only these write correct_choice, and only through
FastAPI with the service-role key; the browser never sends the anon key here."""

from fastapi import APIRouter, Depends, HTTPException

from auth import require_admin
from db import db

from .guards import (
    CHOICES,
    ROLES,
    fetch_one,
    insert_or_conflict,
    problem_blocked,
    refuse,
)
from .models import ProblemIn, ProblemPatch

router = APIRouter()


def _check_problem_fields(correct_choice: str | None, role: str | None) -> None:
    if correct_choice is not None and correct_choice not in CHOICES:
        raise HTTPException(status_code=400, detail="correct_choice must be a, b, c, d, or e")
    if role is not None and role not in ROLES:
        raise HTTPException(status_code=400, detail="role must be example or practice")


@router.post("/problems")
def create_problem(body: ProblemIn, _user=Depends(require_admin)):
    _check_problem_fields(body.correct_choice, body.role)
    if fetch_one("knowledge_points", "id", body.knowledge_point_id, "id") is None:
        raise HTTPException(status_code=404, detail="Unknown knowledge point")
    row = insert_or_conflict(
        "problems",
        {
            "knowledge_point_id": body.knowledge_point_id,
            "prompt": body.prompt.strip(),
            "choice_a": body.choice_a.strip(),
            "choice_b": body.choice_b.strip(),
            "choice_c": body.choice_c.strip(),
            "choice_d": body.choice_d.strip(),
            "choice_e": body.choice_e.strip(),
            "correct_choice": body.correct_choice,
            "role": body.role,
            "sort_order": body.sort_order,
            "explanation": body.explanation,
            "difficulty": body.difficulty,
        },
    )
    return {"problem": row}


@router.patch("/problems/{problem_id}")
def patch_problem(problem_id: int, body: ProblemPatch, _user=Depends(require_admin)):
    if fetch_one("problems", "id", problem_id, "id") is None:
        raise HTTPException(status_code=404, detail="Unknown problem")
    _check_problem_fields(body.correct_choice, body.role)
    patch = body.model_dump(exclude_unset=True)
    for key in (
        "prompt",
        "choice_a",
        "choice_b",
        "choice_c",
        "choice_d",
        "choice_e",
    ):
        if key in patch and isinstance(patch[key], str):
            patch[key] = patch[key].strip()
    if not patch:
        raise HTTPException(status_code=400, detail="Nothing to update")
    row = db.table("problems").update(patch).eq("id", problem_id).execute().data[0]
    return {"problem": row}


@router.delete("/problems/{problem_id}")
def delete_problem(problem_id: int, _user=Depends(require_admin)):
    if fetch_one("problems", "id", problem_id, "id") is None:
        raise HTTPException(status_code=404, detail="Unknown problem")
    reason = problem_blocked(problem_id)
    if reason:
        refuse(reason)
    db.table("problems").delete().eq("id", problem_id).execute()
    return {"ok": True}
