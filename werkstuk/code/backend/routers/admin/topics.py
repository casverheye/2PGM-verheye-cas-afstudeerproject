"""Admin topic routes: create under a course, detail with checklist and
graph arrows, rename/intro edits, and guarded delete."""

from fastapi import APIRouter, Depends, HTTPException

from auth import require_admin
from db import db
from graph import load_graph

from .guards import (
    conflict,
    delete_topic_unused,
    fetch_one,
    insert_or_conflict,
    topic_checklist,
    valid_slug,
)
from .models import TopicIn, TopicPatch

router = APIRouter()


@router.post("/courses/{course_id}/topics")
def create_topic(course_id: str, body: TopicIn, _user=Depends(require_admin)):
    if fetch_one("courses", "id", course_id, "id") is None:
        raise HTTPException(status_code=404, detail="Unknown course")
    topic_id = valid_slug(body.id, "Topic id")
    if fetch_one("topics", "id", topic_id, "id"):
        conflict()
    row = insert_or_conflict(
        "topics",
        {
            "id": topic_id,
            "title": body.title.strip(),
            "course_id": course_id,
            "intro": body.intro or "",
        },
    )
    return {"topic": row}


@router.get("/topics/{topic_id}")
def get_topic(topic_id: str, _user=Depends(require_admin)):
    topic = fetch_one("topics", "id", topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Unknown topic")
    course = fetch_one("courses", "id", topic["course_id"], "id, title")
    check = topic_checklist(topic_id, topic.get("intro") or "")
    edge_rows = [
        row
        for row in (
            db.table("topic_edges")
            .select("id, from_topic_id, to_topic_id, kind, weight")
            .execute()
            .data
        )
        if row["from_topic_id"] == topic_id or row["to_topic_id"] == topic_id
    ]
    graph = load_graph()
    all_topics = [
        {
            "id": item_id,
            "title": title,
            "course_id": graph.course_for_topic.get(item_id),
            "course_title": (
                graph.courses[graph.course_for_topic[item_id]].title
                if graph.course_for_topic.get(item_id) in graph.courses
                else None
            ),
        }
        for item_id, title in graph.topics.items()
        if item_id != topic_id
    ]
    return {
        "topic": {
            "id": topic["id"],
            "title": topic["title"],
            "course_id": topic["course_id"],
            "intro": topic.get("intro") or "",
        },
        "course": course,
        "checklist": check,
        "knowledge_points": check["kps"],
        "edges": edge_rows,
        "all_topics": all_topics,
    }


@router.patch("/topics/{topic_id}")
def patch_topic(topic_id: str, body: TopicPatch, _user=Depends(require_admin)):
    if fetch_one("topics", "id", topic_id, "id") is None:
        raise HTTPException(status_code=404, detail="Unknown topic")
    patch = body.model_dump(exclude_unset=True)
    if "title" in patch:
        patch["title"] = patch["title"].strip()
    if not patch:
        raise HTTPException(status_code=400, detail="Nothing to update")
    row = db.table("topics").update(patch).eq("id", topic_id).execute().data[0]
    return {"topic": row}


@router.delete("/topics/{topic_id}")
def delete_topic(topic_id: str, _user=Depends(require_admin)):
    if fetch_one("topics", "id", topic_id, "id") is None:
        raise HTTPException(status_code=404, detail="Unknown topic")
    delete_topic_unused(topic_id)
    return {"ok": True}
