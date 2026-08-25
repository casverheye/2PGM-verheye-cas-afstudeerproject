"""Admin graph-arrow routes: prerequisite and encompassing edges."""

from fastapi import APIRouter, Depends, HTTPException

from auth import require_admin
from db import db
from graph import ENCOMPASSING_DEFAULT_WEIGHT

from .guards import fetch_one, insert_or_conflict, prereq_cycle
from .models import EdgeIn

router = APIRouter()

KINDS = frozenset({"prerequisite", "encompassing"})


@router.post("/edges")
def create_edge(body: EdgeIn, _user=Depends(require_admin)):
    if body.kind not in KINDS:
        raise HTTPException(status_code=400, detail="kind must be prerequisite or encompassing")
    if fetch_one("topics", "id", body.from_topic_id, "id") is None:
        raise HTTPException(status_code=404, detail="Unknown from topic")
    if fetch_one("topics", "id", body.to_topic_id, "id") is None:
        raise HTTPException(status_code=404, detail="Unknown to topic")
    if body.from_topic_id == body.to_topic_id:
        raise HTTPException(status_code=400, detail="A topic cannot link to itself")
    if body.kind == "prerequisite" and prereq_cycle(body.from_topic_id, body.to_topic_id):
        raise HTTPException(status_code=400, detail="That prerequisite would create a cycle")
    already = (
        db.table("topic_edges")
        .select("id")
        .eq("from_topic_id", body.from_topic_id)
        .eq("to_topic_id", body.to_topic_id)
        .eq("kind", body.kind)
        .limit(1)
        .execute()
        .data
    )
    if already:
        raise HTTPException(status_code=409, detail="That arrow already exists")
    weight = body.weight
    if body.kind == "encompassing" and weight is None:
        weight = ENCOMPASSING_DEFAULT_WEIGHT
    row = insert_or_conflict(
        "topic_edges",
        {
            "from_topic_id": body.from_topic_id,
            "to_topic_id": body.to_topic_id,
            "kind": body.kind,
            "weight": weight,
        },
    )
    return {"edge": row}


@router.delete("/edges/{edge_id}")
def delete_edge(edge_id: int, _user=Depends(require_admin)):
    if fetch_one("topic_edges", "id", edge_id, "id") is None:
        raise HTTPException(status_code=404, detail="Unknown edge")
    db.table("topic_edges").delete().eq("id", edge_id).execute()
    return {"ok": True}
