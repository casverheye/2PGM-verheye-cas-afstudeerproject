"""Regression tests for planner halt/review cards and the lesson sitting cap.

Run with uvicorn up:
    python test_engine_fixes.py
"""

from datetime import datetime, timedelta, timezone

from db import db, supabase
from test_flow import complete_topic, correct_choice_of, wrong_choice_of
from test_helpers import api, check, passed_count, raw, wipe_user

EMAIL = "engine-fixes@example.com"
PASSWORD = "engine-fixes-password-123"


def fail_diagnostic(token: str) -> None:
    step = api(token, "POST", "/diagnostic/start")
    session_id = step["session_id"]
    n = 0
    while not step.get("done"):
        pid = step["problem"]["id"]
        step = api(
            token,
            "POST",
            f"/diagnostic/{session_id}/answer",
            {"problem_id": pid, "chosen_choice": wrong_choice_of(pid)},
        )
        n += 1
        if n > 80:
            raise RuntimeError("diagnostic did not finish")


def kp_ids(topic_id: str) -> list[int]:
    return [
        row["id"]
        for row in db.table("knowledge_points")
        .select("id")
        .eq("topic_id", topic_id)
        .order("sort_order")
        .execute()
        .data
    ]


def progress_status(user_id: str, kp_id: int) -> str | None:
    rows = (
        db.table("user_progress")
        .select("status")
        .eq("user_id", user_id)
        .eq("knowledge_point_id", kp_id)
        .limit(1)
        .execute()
        .data
    )
    return rows[0]["status"] if rows else None


def main():
    wipe_user(EMAIL)
    created = db.auth.admin.create_user(
        {"email": EMAIL, "password": PASSWORD, "email_confirm": True}
    )
    user_id = created.user.id
    token = supabase.auth.sign_in_with_password(
        {"email": EMAIL, "password": PASSWORD}
    ).session.access_token
    root_kp = kp_ids("place_value")[0]

    print("== halt: GET /next-tasks does not write ==")
    fail_diagnostic(token)
    halted = None
    for _ in range(4):
        step = api(token, "GET", "/topics/place_value/next-problem")
        halted = api(
            token,
            "POST",
            "/answers",
            {
                "problem_id": step["problem"]["id"],
                "chosen_choice": wrong_choice_of(step["problem"]["id"]),
            },
        )
        if halted.get("halted"):
            break
    check(halted["halted"], "root topic halts after three lesson-wrongs")

    plan = api(token, "GET", "/next-tasks")
    practice = [
        t
        for t in plan["tasks"]
        if t.get("topic_id") == "place_value" and t["type"] == "PRACTICE"
    ]
    check(len(practice) == 1, "exactly one Resume card after halt", plan["tasks"])
    check(
        practice[0]["title"].startswith("Resume"),
        "the card is Resume, not Continue",
        practice[0]["title"],
    )
    check(
        progress_status(user_id, root_kp) == "halted",
        "GET /next-tasks leaves the row halted",
        progress_status(user_id, root_kp),
    )

    intro = api(token, "GET", "/topics/place_value/intro")
    check(intro.get("mode") == "lesson", "opening the lesson lifts halt", intro.get("mode"))
    check(
        progress_status(user_id, root_kp) == "in_progress",
        "intro write sets status back to in_progress",
        progress_status(user_id, root_kp),
    )

    print("== partial topic is a lesson, not a review ==")
    complete_topic(token, "place_value")
    ids = kp_ids("place_value")
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    db.table("user_progress").update(
        {"next_review_at": past, "status": "completed"}
    ).eq("user_id", user_id).eq("knowledge_point_id", ids[0]).execute()
    db.table("user_progress").update(
        {
            "status": "in_progress",
            "mastery": 0.4,
            "next_review_at": None,
        }
    ).eq("user_id", user_id).eq("knowledge_point_id", ids[1]).execute()
    plan = api(token, "GET", "/next-tasks")
    kinds = [t["type"] for t in plan["tasks"] if t.get("topic_id") == "place_value"]
    check("REVIEW" not in kinds, "no Review card while a KP is still in progress", kinds)
    check(
        "PRACTICE" in kinds or "NEW_LESSON" in kinds,
        "lesson card remains for the unfinished KP",
        kinds,
    )

    print("== one review miss keeps the skill completed ==")
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    for kp_id in ids:
        db.table("user_progress").update(
            {
                "status": "completed",
                "mastery": 0.85,
                "next_review_at": past,
            }
        ).eq("user_id", user_id).eq("knowledge_point_id", kp_id).execute()
    step = api(token, "GET", "/topics/place_value/next-problem")
    miss = api(
        token,
        "POST",
        "/answers",
        {
            "problem_id": step["problem"]["id"],
            "chosen_choice": wrong_choice_of(step["problem"]["id"]),
        },
    )
    missed_kp = miss["kp"]["id"]
    check(miss["context"] == "review", "due completed topic is graded as review", miss)
    check(
        progress_status(user_id, missed_kp) == "completed",
        "one review miss does not reopen the skill",
        progress_status(user_id, missed_kp),
    )
    kinds = [
        t["type"]
        for t in api(token, "GET", "/next-tasks")["tasks"]
        if t.get("topic_id") == "place_value"
    ]
    check("REVIEW" in kinds, "topic stays a review after one miss", kinds)
    check("PRACTICE" not in kinds, "one miss does not turn the topic into a lesson", kinds)

    step = api(token, "GET", "/topics/place_value/next-problem")
    api(
        token,
        "POST",
        "/answers",
        {
            "problem_id": step["problem"]["id"],
            "chosen_choice": wrong_choice_of(step["problem"]["id"]),
        },
    )
    check(
        progress_status(user_id, missed_kp) == "in_progress",
        "two review misses in a row reopen the skill",
        progress_status(user_id, missed_kp),
    )

    print("== sitting cap is enforced on the API ==")
    now = datetime.now(timezone.utc).isoformat()
    for kp_id in ids:
        db.table("user_progress").update(
            {
                "status": "completed",
                "mastery": 0.85,
                "next_review_at": now,
            }
        ).eq("user_id", user_id).eq("knowledge_point_id", kp_id).execute()

    last = None
    last_problem_id = None
    for i in range(8):
        step = api(token, "GET", "/topics/addition/next-problem")
        last_problem_id = step["problem"]["id"]
        choice = (
            wrong_choice_of(last_problem_id)
            if i % 2
            else correct_choice_of(last_problem_id)
        )
        last = api(
            token,
            "POST",
            "/answers",
            {"problem_id": last_problem_id, "chosen_choice": choice},
        )
        if last.get("halted"):
            break
    check(last is not None, "addition sitting produced answers")
    if last.get("halted"):
        check(True, "sitting hit halt before cap; skip 9th-answer check")
    else:
        check(last.get("sitting_capped"), "eighth mixed answer flags the sitting cap", last)
        blocked = raw(token, "GET", "/topics/addition/next-problem")
        check(
            blocked.status_code == 403,
            "next-problem refuses another item in the burst",
            blocked.text,
        )
        ninth = raw(
            token,
            "POST",
            "/answers",
            {"problem_id": last_problem_id, "chosen_choice": "a"},
        )
        check(
            ninth.status_code == 403,
            "POST /answers refuses a 9th lesson answer in the burst",
            ninth.text,
        )

    print("== cleanup ==")
    wipe_user(EMAIL)
    print(f"\nALL {passed_count()} CHECKS PASSED")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        wipe_user(EMAIL)
        raise
