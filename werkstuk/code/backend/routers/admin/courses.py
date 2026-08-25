"""Admin course routes: catalog list with Ready counts, CRUD, delete-check."""

from fastapi import APIRouter, Depends, HTTPException

from auth import require_admin
from db import db

from .guards import (
    checklist_from_maps,
    conflict,
    course_blocked,
    course_ids_in_use,
    delete_topic_unused,
    fetch_one,
    insert_or_conflict,
    refuse,
    rows_by,
    valid_slug,
)
from .models import CourseIn, CoursePatch

router = APIRouter()


@router.get("/courses")
def list_courses(_user=Depends(require_admin)):
    rows = (
        db.table("courses")
        .select("id, title, description, sort_order, listed")
        .order("sort_order")
        .execute()
        .data
    )
    topic_rows = db.table("topics").select("id, course_id, intro").execute().data
    kp_rows = (
        db.table("knowledge_points").select("id, topic_id, title, sort_order").execute().data
    )
    problem_rows = (
        db.table("problems")
        .select("id, knowledge_point_id, role, sort_order")
        .execute()
        .data
    )
    topics_by_course = rows_by(topic_rows, "course_id")
    kps_by_topic = rows_by(kp_rows, "topic_id")
    problems_by_kp = rows_by(problem_rows, "knowledge_point_id")
    in_use = course_ids_in_use(
        [course["id"] for course in rows], topic_rows, kp_rows, problem_rows
    )
    items = []
    for course in rows:
        topics = topics_by_course.get(course["id"], [])
        teachable = 0
        for topic in topics:
            check = checklist_from_maps(
                topic.get("intro") or "",
                topic["id"],
                kps_by_topic,
                problems_by_kp,
            )
            if check["teachable"]:
                teachable += 1
        items.append(
            {
                **course,
                "topic_count": len(topics),
                "teachable_count": teachable,
                "in_use": course["id"] in in_use,
            }
        )
    return {"courses": items}


@router.post("/courses")
def create_course(body: CourseIn, _user=Depends(require_admin)):
    course_id = valid_slug(body.id, "Course id")
    if fetch_one("courses", "id", course_id, "id"):
        conflict()
    row = insert_or_conflict(
        "courses",
        {
            "id": course_id,
            "title": body.title.strip(),
            "description": (body.description or "").strip() or None,
            "sort_order": body.sort_order,
            "listed": False,
        },
    )
    return {"course": row}


@router.get("/courses/{course_id}")
def get_course(course_id: str, _user=Depends(require_admin)):
    course = fetch_one("courses", "id", course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Unknown course")
    topic_rows = (
        db.table("topics")
        .select("id, title, intro, course_id")
        .eq("course_id", course_id)
        .execute()
        .data
    )
    topic_ids = [row["id"] for row in topic_rows]
    kp_rows = (
        db.table("knowledge_points")
        .select("id, topic_id, title, sort_order")
        .in_("topic_id", topic_ids)
        .execute()
        .data
        if topic_ids
        else []
    )
    kp_ids = [row["id"] for row in kp_rows]
    problem_rows = (
        db.table("problems")
        .select("id, knowledge_point_id, role, sort_order")
        .in_("knowledge_point_id", kp_ids)
        .execute()
        .data
        if kp_ids
        else []
    )
    kps_by_topic = rows_by(kp_rows, "topic_id")
    problems_by_kp = rows_by(problem_rows, "knowledge_point_id")
    in_use = course_id in course_ids_in_use(
        [course_id], topic_rows, kp_rows, problem_rows
    )
    topics = []
    for topic in topic_rows:
        check = checklist_from_maps(
            topic.get("intro") or "",
            topic["id"],
            kps_by_topic,
            problems_by_kp,
        )
        topics.append(
            {
                "id": topic["id"],
                "title": topic["title"],
                "intro": topic.get("intro") or "",
                "teachable": check["teachable"],
                "checklist": check,
            }
        )
    return {
        "course": {**course, "in_use": in_use},
        "topics": topics,
    }


@router.patch("/courses/{course_id}")
def patch_course(course_id: str, body: CoursePatch, _user=Depends(require_admin)):
    current = fetch_one("courses", "id", course_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Unknown course")
    patch = body.model_dump(exclude_unset=True)
    if "title" in patch:
        patch["title"] = patch["title"].strip()
    if "description" in patch and patch["description"] is not None:
        patch["description"] = patch["description"].strip() or None
    if patch.get("listed") is False and current.get("listed"):
        if course_blocked(course_id):
            refuse("This course is already in use")
    if not patch:
        raise HTTPException(status_code=400, detail="Nothing to update")
    row = db.table("courses").update(patch).eq("id", course_id).execute().data[0]
    return {"course": row}


@router.delete("/courses/{course_id}")
def delete_course(course_id: str, _user=Depends(require_admin)):
    if fetch_one("courses", "id", course_id, "id") is None:
        raise HTTPException(status_code=404, detail="Unknown course")
    reason = course_blocked(course_id)
    if reason:
        refuse(reason)
    topic_rows = (
        db.table("topics").select("id").eq("course_id", course_id).execute().data
    )
    for topic in topic_rows:
        delete_topic_unused(topic["id"])
    db.table("courses").delete().eq("id", course_id).execute()
    return {"ok": True}


@router.get("/courses/{course_id}/delete-check")
def course_delete_check(course_id: str, _user=Depends(require_admin)):
    """Why a course cannot be deleted, or null when unused children can go with it."""
    if fetch_one("courses", "id", course_id, "id") is None:
        raise HTTPException(status_code=404, detail="Unknown course")
    return {"blocked": course_blocked(course_id)}
