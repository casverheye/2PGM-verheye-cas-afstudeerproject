"""Course catalog and switching the active course.

Progress numbers here are derived from the per-KP student model at read
time; no course progress is ever stored, so it cannot drift or be reset.
"""

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from db import db
from graph import Graph, kp_states, load_graph, prereqs_met, topic_completed
from gates import has_completed_diagnostic, require_no_active_quiz
from learning import get_progress_map, now_utc
from problems import example_payload, first_example
from user_settings import get_active_course_id, set_active_course_id

router = APIRouter()


def _topic_payload(topic_id: str, graph: Graph, progress: dict, now, placed: bool) -> dict:
    states = kp_states(topic_id, graph, progress, now)
    done = topic_completed(states) if states else False
    started = any(state.started for state in states)
    halted = any(state.halted for state in states)
    unlocked = prereqs_met(topic_id, graph, progress, now)
    can_open = placed and not halted and (done or unlocked)
    return {
        "id": topic_id,
        "title": graph.topics[topic_id],
        "course_id": graph.course_for_topic[topic_id],
        "completed": done,
        "started": started,
        "can_open": can_open,
        "kp_total": len(states),
        "kp_mastered": sum(1 for state in states if state.mastered),
    }


def _course_payload(course, graph: Graph, progress: dict, now, active_id: str, user_id: str) -> dict:
    topic_ids = graph.topics_by_course.get(course.id, [])
    placed = has_completed_diagnostic(user_id, course.id)
    topics = [
        _topic_payload(topic_id, graph, progress, now, placed) for topic_id in topic_ids
    ]
    return {
        "id": course.id,
        "title": course.title,
        "description": course.description,
        "topics_total": len(topic_ids),
        "topics_completed": sum(1 for topic in topics if topic["completed"]),
        "started": any(topic["started"] or topic["completed"] for topic in topics),
        "is_active": course.id == active_id,
        "topics": topics,
    }


def _student_course(graph: Graph, course_id: str):
    course = graph.courses.get(course_id)
    if course is None or not course.listed:
        raise HTTPException(status_code=404, detail="Unknown course")
    return course


@router.get("/courses")
def list_courses(user=Depends(get_current_user)):
    now = now_utc()
    graph = load_graph()
    progress = get_progress_map(user.id)
    active_id = get_active_course_id(user.id, graph)
    items = [
        _course_payload(course, graph, progress, now, active_id, user.id)
        for course in graph.courses.values()
        if course.listed
    ]
    return {"courses": items}


@router.get("/graph")
def knowledge_graph(user=Depends(get_current_user)):
    """Listed topics and edges. Unlisted courses stay in Admin only.

    Learn stays scoped to the active course. Progress colors are derived at
    read time; no extra table.
    """
    require_no_active_quiz(user.id)
    now = now_utc()
    graph = load_graph()
    progress = get_progress_map(user.id)
    listed = [course for course in graph.courses.values() if course.listed]
    placed = {
        course.id: has_completed_diagnostic(user.id, course.id) for course in listed
    }
    nodes = []
    for course in listed:
        for topic_id in graph.topics_by_course.get(course.id, []):
            body = _topic_payload(
                topic_id, graph, progress, now, placed[course.id]
            )
            nodes.append(body)
    listed_topics = {node["id"] for node in nodes}
    edges = []
    for to_id, from_ids in graph.prereqs_for.items():
        if to_id not in listed_topics:
            continue
        for from_id in from_ids:
            if from_id not in listed_topics:
                continue
            edges.append(
                {
                    "from_id": from_id,
                    "to_id": to_id,
                    "kind": "prerequisite",
                    "weight": 1.0,
                }
            )
    for from_id, targets in graph.encompasses.items():
        if from_id not in listed_topics:
            continue
        for to_id, weight in targets:
            if to_id not in listed_topics:
                continue
            edges.append(
                {
                    "from_id": from_id,
                    "to_id": to_id,
                    "kind": "encompassing",
                    "weight": weight,
                }
            )
    return {
        "courses": [{"id": course.id, "title": course.title} for course in listed],
        "nodes": nodes,
        "edges": edges,
    }


@router.get("/courses/{course_id}/topics/{topic_id}")
def get_course_topic(course_id: str, topic_id: str, user=Depends(get_current_user)):
    """Catalog explanation: title, teaching text, and worked examples.

    Blocked while a quiz is open. Does not create progress rows. Learn still
    uses `/topics/{id}/intro` and `/next-problem` for the real lesson.
    """
    require_no_active_quiz(user.id)
    graph = load_graph()
    _student_course(graph, course_id)
    if topic_id not in graph.topics_by_course.get(course_id, []):
        raise HTTPException(status_code=404, detail="Unknown topic")
    rows = (
        db.table("topics")
        .select("id, title, intro")
        .eq("id", topic_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Unknown topic")
    row = rows[0]
    examples = []
    for kp in graph.kps_by_topic.get(topic_id, []):
        example = first_example(kp.id)
        if example is None:
            continue
        payload = example_payload(example)
        payload["kp_title"] = kp.title
        examples.append(payload)
    return {
        "topic": {
            "id": row["id"],
            "title": row["title"],
            "intro": row["intro"] or "",
        },
        "examples": examples,
    }


@router.post("/courses/{course_id}/activate")
def activate_course(course_id: str, user=Depends(get_current_user)):
    graph = load_graph()
    course = _student_course(graph, course_id)
    set_active_course_id(user.id, course.id)
    return {"active": {"id": course.id, "title": course.title}}
