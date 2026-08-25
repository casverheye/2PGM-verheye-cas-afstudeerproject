"""Shared checks for the admin routers.

Everything here answers one of two questions the backoffice keeps asking:
"does this row exist?" and "may the admin still change or delete it?"
Plus the Ready checklist counting that list/course/topic views share.
"""

import re

from fastapi import HTTPException
from postgrest import APIError

from db import db
from graph import load_graph
from problems import CHOICE_LETTERS, LESSON_BANK_MIN_SORT

_SLUG = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
# Same letters the student API uses; the source of truth is problems.py.
CHOICES = frozenset(CHOICE_LETTERS)
ROLES = frozenset({"example", "practice"})


def valid_slug(value: str, label: str) -> str:
    slug = value.strip()
    if not _SLUG.match(slug):
        raise HTTPException(
            status_code=400,
            detail=f"{label} must be a lowercase slug (letters, numbers, underscore)",
        )
    return slug


def fetch_one(table: str, column: str, value, columns: str = "*") -> dict | None:
    rows = (
        db.table(table).select(columns).eq(column, value).limit(1).execute().data
    )
    return rows[0] if rows else None


def exists(table: str, column: str, value) -> bool:
    key = "user_id" if table == "user_settings" else "id"
    return fetch_one(table, column, value, key) is not None


def conflict():
    raise HTTPException(status_code=409, detail="That id already exists")


def insert_or_conflict(table: str, row: dict) -> dict:
    try:
        rows = db.table(table).insert(row).execute().data
    except APIError as error:
        if error.code == "23505":  # Postgres: unique constraint violated
            conflict()
        raise  # anything else is a real DB problem, not a duplicate id
    if not rows:
        conflict()
    return rows[0]


def refuse(reason: str) -> None:
    raise HTTPException(status_code=409, detail=reason)


def problem_blocked(problem_id: int) -> str | None:
    if exists("answer_history", "problem_id", problem_id):
        return "This problem has student answers"
    if exists("quiz_questions", "problem_id", problem_id):
        return "This problem is on a quiz"
    return None


def kp_blocked(kp_id: int) -> str | None:
    if exists("user_progress", "knowledge_point_id", kp_id):
        return "A student has progress on this knowledge point"
    problem_rows = (
        db.table("problems").select("id").eq("knowledge_point_id", kp_id).execute().data
    )
    for row in problem_rows:
        reason = problem_blocked(row["id"])
        if reason:
            return reason
    return None


def topic_blocked(topic_id: str) -> str | None:
    kp_rows = (
        db.table("knowledge_points").select("id").eq("topic_id", topic_id).execute().data
    )
    for row in kp_rows:
        reason = kp_blocked(row["id"])
        if reason:
            return reason
    return None


def course_blocked(course_id: str) -> str | None:
    topic_rows = (
        db.table("topics")
        .select("id, course_id")
        .eq("course_id", course_id)
        .execute()
        .data
    )
    topic_ids = [row["id"] for row in topic_rows]
    kp_rows = (
        db.table("knowledge_points")
        .select("id, topic_id")
        .in_("topic_id", topic_ids)
        .execute()
        .data
        if topic_ids
        else []
    )
    kp_ids = [row["id"] for row in kp_rows]
    problem_rows = (
        db.table("problems")
        .select("id, knowledge_point_id")
        .in_("knowledge_point_id", kp_ids)
        .execute()
        .data
        if kp_ids
        else []
    )
    if course_id in course_ids_in_use(
        [course_id], topic_rows, kp_rows, problem_rows
    ):
        return "This course is already in use"
    return None


def prereq_cycle(from_id: str, to_id: str) -> bool:
    """True if adding 'to requires from' would loop."""
    if from_id == to_id:
        return True
    graph = load_graph()
    seen: set[str] = set()
    queue = list(graph.prereqs_for.get(from_id, []))
    while queue:
        current = queue.pop(0)
        if current == to_id:
            return True
        if current in seen:
            continue
        seen.add(current)
        queue.extend(graph.prereqs_for.get(current, []))
    return False


def counts_from_rows(rows: list) -> dict:
    """Ready rule: ≥1 example, ≥3 probes (practice, sort < 20), ≥1 bank (practice, sort ≥ 20)."""
    examples = sum(1 for row in rows if row["role"] == "example")
    probes = sum(
        1
        for row in rows
        if row["role"] == "practice" and (row.get("sort_order") or 0) < LESSON_BANK_MIN_SORT
    )
    bank = sum(
        1
        for row in rows
        if row["role"] == "practice" and (row.get("sort_order") or 0) >= LESSON_BANK_MIN_SORT
    )
    return {
        "examples": examples,
        "probes": probes,
        "bank": bank,
        "ready": examples >= 1 and probes >= 3 and bank >= 1,
    }


def kp_counts(kp_id: int) -> dict:
    rows = (
        db.table("problems")
        .select("id, role, sort_order")
        .eq("knowledge_point_id", kp_id)
        .execute()
        .data
    )
    return counts_from_rows(rows)


def rows_by(rows: list, key: str) -> dict:
    grouped: dict = {}
    for row in rows:
        grouped.setdefault(row[key], []).append(row)
    return grouped


def checklist_from_maps(
    intro: str, topic_id: str, kps_by_topic: dict, problems_by_kp: dict
) -> dict:
    kp_rows = sorted(
        kps_by_topic.get(topic_id, []),
        key=lambda row: row.get("sort_order") or 0,
    )
    kps = []
    for row in kp_rows:
        counts = counts_from_rows(problems_by_kp.get(row["id"], []))
        kps.append(
            {
                "id": row["id"],
                "title": row["title"],
                "sort_order": row["sort_order"],
                **counts,
            }
        )
    intro_ok = bool((intro or "").strip())
    teachable = intro_ok and bool(kps) and all(item["ready"] for item in kps)
    return {
        "intro": intro_ok,
        "knowledge_points": bool(kps),
        "teachable": teachable,
        "kps": kps,
    }


def course_ids_in_use(
    course_ids: list[str],
    topic_rows: list,
    kp_rows: list,
    problem_rows: list,
) -> set[str]:
    """Which of these courses a student is using, with a few table reads
    instead of one query per row."""
    wanted = set(course_ids)
    used: set[str] = set()
    if not wanted:
        return used

    topic_to_course = {
        row["id"]: row["course_id"]
        for row in topic_rows
        if row.get("course_id") in wanted
    }
    kp_to_course = {
        row["id"]: topic_to_course[row["topic_id"]]
        for row in kp_rows
        if row["topic_id"] in topic_to_course
    }
    problem_to_course = {
        row["id"]: kp_to_course[row["knowledge_point_id"]]
        for row in problem_rows
        if row["knowledge_point_id"] in kp_to_course
    }

    for row in db.table("user_settings").select("active_course_id").execute().data:
        course_id = row.get("active_course_id")
        if course_id in wanted:
            used.add(course_id)
    for row in db.table("quizzes").select("course_id").execute().data:
        course_id = row.get("course_id")
        if course_id in wanted:
            used.add(course_id)
    for row in db.table("diagnostic_sessions").select("course_id").execute().data:
        course_id = row.get("course_id")
        if course_id in wanted:
            used.add(course_id)
    for row in db.table("user_progress").select("knowledge_point_id").execute().data:
        course_id = kp_to_course.get(row["knowledge_point_id"])
        if course_id:
            used.add(course_id)
    for row in db.table("answer_history").select("problem_id").execute().data:
        course_id = problem_to_course.get(row["problem_id"])
        if course_id:
            used.add(course_id)
    for row in db.table("quiz_questions").select("problem_id").execute().data:
        course_id = problem_to_course.get(row["problem_id"])
        if course_id:
            used.add(course_id)
    return used


def topic_checklist(topic_id: str, intro: str) -> dict:
    kp_rows = (
        db.table("knowledge_points")
        .select("id, title, sort_order, topic_id")
        .eq("topic_id", topic_id)
        .order("sort_order")
        .execute()
        .data
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
    return checklist_from_maps(
        intro,
        topic_id,
        {topic_id: kp_rows},
        rows_by(problem_rows, "knowledge_point_id"),
    )


def delete_topic_unused(topic_id: str) -> None:
    """Delete a topic and its children, refusing when a student used any of it."""
    reason = topic_blocked(topic_id)
    if reason:
        refuse(reason)
    kp_rows = (
        db.table("knowledge_points").select("id").eq("topic_id", topic_id).execute().data
    )
    for kp in kp_rows:
        db.table("problems").delete().eq("knowledge_point_id", kp["id"]).execute()
        db.table("knowledge_points").delete().eq("id", kp["id"]).execute()
    db.table("topic_edges").delete().eq("from_topic_id", topic_id).execute()
    db.table("topic_edges").delete().eq("to_topic_id", topic_id).execute()
    db.table("topics").delete().eq("id", topic_id).execute()
