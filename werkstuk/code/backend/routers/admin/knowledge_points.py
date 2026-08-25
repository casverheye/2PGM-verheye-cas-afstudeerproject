"""Admin knowledge-point routes: create under a topic, detail with the
question bank (including correct answers), rename, and guarded delete."""

from fastapi import APIRouter, Depends, HTTPException

from auth import require_admin
from db import db

from .guards import fetch_one, insert_or_conflict, kp_blocked, kp_counts, refuse
from .models import KpIn, KpPatch

router = APIRouter()


@router.post("/topics/{topic_id}/knowledge-points")
def create_kp(topic_id: str, body: KpIn, _user=Depends(require_admin)):
    if fetch_one("topics", "id", topic_id, "id") is None:
        raise HTTPException(status_code=404, detail="Unknown topic")
    row = insert_or_conflict(
        "knowledge_points",
        {
            "topic_id": topic_id,
            "title": body.title.strip(),
            "sort_order": body.sort_order,
        },
    )
    return {"knowledge_point": row}


@router.get("/knowledge-points/{kp_id}")
def get_kp(kp_id: int, _user=Depends(require_admin)):
    kp = fetch_one("knowledge_points", "id", kp_id)
    if kp is None:
        raise HTTPException(status_code=404, detail="Unknown knowledge point")
    topic = fetch_one("topics", "id", kp["topic_id"], "id, title, course_id")
    problems = (
        db.table("problems")
        .select(
            "id, knowledge_point_id, prompt, choice_a, choice_b, choice_c, "
            "choice_d, choice_e, correct_choice, role, sort_order, explanation, difficulty"
        )
        .eq("knowledge_point_id", kp_id)
        .order("role")
        .order("sort_order")
        .execute()
        .data
    )
    return {
        "knowledge_point": kp,
        "topic": topic,
        "counts": kp_counts(kp_id),
        "problems": problems,
    }


@router.patch("/knowledge-points/{kp_id}")
def patch_kp(kp_id: int, body: KpPatch, _user=Depends(require_admin)):
    if fetch_one("knowledge_points", "id", kp_id, "id") is None:
        raise HTTPException(status_code=404, detail="Unknown knowledge point")
    patch = body.model_dump(exclude_unset=True)
    if "title" in patch:
        patch["title"] = patch["title"].strip()
    if not patch:
        raise HTTPException(status_code=400, detail="Nothing to update")
    row = (
        db.table("knowledge_points").update(patch).eq("id", kp_id).execute().data[0]
    )
    return {"knowledge_point": row}


@router.delete("/knowledge-points/{kp_id}")
def delete_kp(kp_id: int, _user=Depends(require_admin)):
    if fetch_one("knowledge_points", "id", kp_id, "id") is None:
        raise HTTPException(status_code=404, detail="Unknown knowledge point")
    reason = kp_blocked(kp_id)
    if reason:
        refuse(reason)
    db.table("problems").delete().eq("knowledge_point_id", kp_id).execute()
    db.table("knowledge_points").delete().eq("id", kp_id).execute()
    return {"ok": True}
