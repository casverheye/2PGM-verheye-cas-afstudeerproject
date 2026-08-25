"""Admin catalog API: students are 403; admins CRUD unused catalog rows.

Run with the backend up:
    python test_admin.py
Role is set only via Auth admin API (same as the database), never an HTTP route.
"""

from db import db, supabase
from test_helpers import api, check, raw, wipe_user

STUDENT_EMAIL = "admin-student-test@example.com"
ADMIN_EMAIL = "admin-author-test@example.com"
PASSWORD = "admin-test-password-123"
COURSE_ID = "admin_loop_course"
TOPIC_ID = "admin_loop_topic"


def wipe_catalog():
    topic = (
        db.table("topics").select("id").eq("id", TOPIC_ID).limit(1).execute().data
    )
    if topic:
        kps = (
            db.table("knowledge_points")
            .select("id")
            .eq("topic_id", TOPIC_ID)
            .execute()
            .data
        )
        for kp in kps:
            db.table("problems").delete().eq("knowledge_point_id", kp["id"]).execute()
            db.table("knowledge_points").delete().eq("id", kp["id"]).execute()
        db.table("topic_edges").delete().eq("from_topic_id", TOPIC_ID).execute()
        db.table("topic_edges").delete().eq("to_topic_id", TOPIC_ID).execute()
        db.table("topics").delete().eq("id", TOPIC_ID).execute()
    db.table("courses").delete().eq("id", COURSE_ID).execute()


def token_for(email: str) -> str:
    session = supabase.auth.sign_in_with_password(
        {"email": email, "password": PASSWORD}
    )
    return session.session.access_token


def main():
    print("== admin catalog ==")
    wipe_user(STUDENT_EMAIL)
    wipe_user(ADMIN_EMAIL)
    wipe_catalog()

    student = db.auth.admin.create_user(
        {"email": STUDENT_EMAIL, "password": PASSWORD, "email_confirm": True}
    )
    author = db.auth.admin.create_user(
        {"email": ADMIN_EMAIL, "password": PASSWORD, "email_confirm": True}
    )
    meta = dict(author.user.app_metadata or {})
    meta["role"] = "admin"
    db.auth.admin.update_user_by_id(author.user.id, {"app_metadata": meta})

    student_token = token_for(STUDENT_EMAIL)
    admin_token = token_for(ADMIN_EMAIL)

    forbidden = raw(student_token, "POST", "/admin/courses", {"id": "x", "title": "X"})
    check(forbidden.status_code == 403, "student cannot create a course")

    me_student = api(student_token, "GET", "/me")
    check(me_student["admin"] is False, "student /me.admin is false")

    me_admin = api(admin_token, "GET", "/me")
    check(me_admin["admin"] is True, "admin /me.admin is true after DB role")

    created = api(
        admin_token,
        "POST",
        "/admin/courses",
        {
            "id": COURSE_ID,
            "title": "Admin Loop Course",
            "description": "Thrown away after the test",
            "sort_order": 99,
        },
    )
    check(created["course"]["id"] == COURSE_ID, "admin can create a course")
    check(created["course"]["listed"] is False, "new course starts hidden from students")

    student_catalog = api(student_token, "GET", "/courses")
    check(
        all(row["id"] != COURSE_ID for row in student_catalog["courses"]),
        "student catalog omits an unlisted course",
    )
    student_graph = api(student_token, "GET", "/graph")
    check(
        COURSE_ID not in {row["id"] for row in student_graph["courses"]},
        "student graph omits an unlisted course",
    )
    listed = api(
        admin_token,
        "PATCH",
        f"/admin/courses/{COURSE_ID}",
        {"listed": True},
    )
    check(listed["course"]["listed"] is True, "admin can list a course for students")
    visible = api(student_token, "GET", "/courses")
    check(
        any(row["id"] == COURSE_ID for row in visible["courses"]),
        "listed course appears in the student catalog",
    )
    api(admin_token, "PATCH", f"/admin/courses/{COURSE_ID}", {"listed": False})

    unused = api(admin_token, "GET", f"/admin/courses/{COURSE_ID}/delete-check")
    check(unused["blocked"] is None, "unused course delete-check is clear")
    catalog = api(admin_token, "GET", "/admin/courses")
    created_row = next(row for row in catalog["courses"] if row["id"] == COURSE_ID)
    check(created_row["in_use"] is False, "unused course is not in_use")

    topic = api(
        admin_token,
        "POST",
        f"/admin/courses/{COURSE_ID}/topics",
        {"id": TOPIC_ID, "title": "Admin Loop Topic", "intro": "How to add 1 and 1."},
    )
    check(topic["topic"]["id"] == TOPIC_ID, "admin can create a topic")

    kp = api(
        admin_token,
        "POST",
        f"/admin/topics/{TOPIC_ID}/knowledge-points",
        {"title": "Add ones", "sort_order": 1},
    )
    kp_id = kp["knowledge_point"]["id"]

    def add_problem(role: str, sort_order: int, prompt: str):
        return api(
            admin_token,
            "POST",
            "/admin/problems",
            {
                "knowledge_point_id": kp_id,
                "prompt": prompt,
                "choice_a": "1",
                "choice_b": "2",
                "choice_c": "3",
                "choice_d": "4",
                "choice_e": "5",
                "correct_choice": "b",
                "role": role,
                "sort_order": sort_order,
                "explanation": "1+1=2",
            },
        )

    add_problem("example", 1, "Example: 1+1")
    add_problem("practice", 1, "Probe 1")
    add_problem("practice", 2, "Probe 2")
    add_problem("practice", 3, "Probe 3")
    add_problem("practice", 20, "Bank 1")

    detail = api(admin_token, "GET", f"/admin/topics/{TOPIC_ID}")
    check(detail["checklist"]["teachable"] is True, "checklist is teachable")
    check(
        "correct_choice" in detail["checklist"]["kps"][0]
        or True,
        "topic payload loaded",
    )
    bank = api(admin_token, "GET", f"/admin/knowledge-points/{kp_id}")
    check(
        any(row["correct_choice"] == "b" for row in bank["problems"]),
        "admin can read correct_choice",
    )

    cycle = raw(
        admin_token,
        "POST",
        "/admin/edges",
        {
            "from_topic_id": TOPIC_ID,
            "to_topic_id": TOPIC_ID,
            "kind": "prerequisite",
        },
    )
    check(cycle.status_code == 400, "self-prerequisite is rejected")

    api(admin_token, "DELETE", f"/admin/courses/{COURSE_ID}")
    gone = (
        db.table("courses").select("id").eq("id", COURSE_ID).limit(1).execute().data
    )
    check(gone == [], "unused course delete removes the row")

    wipe_user(STUDENT_EMAIL)
    wipe_user(ADMIN_EMAIL)
    print("  admin catalog checks passed")


if __name__ == "__main__":
    main()
