"""End-to-end test of the adaptive learning loop against a running backend.

Simulates a student in the three-course catalog:
- placed into Arithmetic Foundations via a full-course diagnostic,
- learns to the end of that course (with repetition compression),
- switches to Fractions & Decimals, halts, gets remediated across courses,
- switches back and finds Arithmetic exactly as they left it.

Run with the backend up (uvicorn main:app --reload):
    python test_flow.py
Creates a throwaway user and deletes all its data afterwards.
"""

from datetime import datetime, timedelta, timezone

from db import db, supabase
from test_helpers import api, check, passed_count, raw, wipe_user

TEST_EMAIL = "adaptive-test@example.com"
TEST_PASSWORD = "adaptive-test-password-123"

ARITHMETIC_TOPICS = {
    "place_value",
    "addition",
    "subtraction",
    "multiplication",
    "division",
    "two_digit_multiplication",
    "rounding",
    "factors",
    "estimating",
}
FRACTIONS_TOPICS = {
    "fractions",
    "fraction_addition",
    "decimals",
    "fraction_subtraction",
    "comparing_fractions",
}
PERCENTAGES_TOPICS = {
    "percent_meaning",
    "percent_of",
    "percent_conversions",
}

def correct_choice_of(problem_id: int) -> str:
    rows = (
        db.table("problems")
        .select("correct_choice")
        .eq("id", problem_id)
        .limit(1)
        .execute()
        .data
    )
    return rows[0]["correct_choice"]


def wrong_choice_of(problem_id: int) -> str:
    right = correct_choice_of(problem_id)
    return next(letter for letter in "abcde" if letter != right)


def topic_of_problem(problem_id: int) -> str:
    rows = (
        db.table("problems")
        .select("knowledge_point_id, knowledge_points(topic_id)")
        .eq("id", problem_id)
        .limit(1)
        .execute()
        .data
    )
    return rows[0]["knowledge_points"]["topic_id"]


def complete_topic(token: str, topic_id: str, max_steps: int = 40):
    """Answer correctly until the topic is fully mastered."""
    last = None
    for _ in range(max_steps):
        step = api(token, "GET", f"/topics/{topic_id}/next-problem")
        if step["kind"] in ("example", "intro"):
            continue  # teaching step; progress row now exists after example
        last = api(
            token,
            "POST",
            "/answers",
            {
                "problem_id": step["problem"]["id"],
                "chosen_choice": correct_choice_of(step["problem"]["id"]),
            },
        )
        if last["topic_completed"]:
            return last
    raise AssertionError(f"topic {topic_id} did not complete in {max_steps} steps")


def task_topics(tasks: list[dict]) -> set[str]:
    return {task["topic_id"] for task in tasks if task.get("topic_id")}


def main():
    print("== setup ==")
    wipe_user(TEST_EMAIL)
    created = db.auth.admin.create_user(
        {"email": TEST_EMAIL, "password": TEST_PASSWORD, "email_confirm": True}
    )
    user_id = created.user.id
    session = supabase.auth.sign_in_with_password(
        {"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    token = session.session.access_token
    print(f"  test user {user_id}")

    print("== 0. catalog explanations are readable before placement ==")
    catalog = api(
        token, "GET", "/courses/arithmetic/topics/two_digit_multiplication"
    )
    check(
        catalog["topic"]["id"] == "two_digit_multiplication",
        "catalog returns the requested topic",
        catalog["topic"],
    )
    check(
        len(catalog["topic"]["intro"]) > 40,
        "catalog returns teaching text",
        catalog["topic"]["intro"][:80],
    )
    check(
        "correct_choice" not in catalog["topic"],
        "catalog topic object does not include answers",
        catalog["topic"].keys(),
    )
    check(
        len(catalog["examples"]) > 0,
        "catalog includes worked examples",
        catalog.get("examples"),
    )
    check(
        catalog["examples"][0].get("correct_choice") in list("abcde"),
        "worked example includes the answer key",
        catalog["examples"][0],
    )

    print("== 0b. knowledge graph is the full catalog ==")
    knowledge = api(token, "GET", "/graph")
    node_ids = {node["id"] for node in knowledge["nodes"]}
    course_ids = {course["id"] for course in knowledge["courses"]}
    check(
        "arithmetic" in course_ids
        and "fractions_decimals" in course_ids
        and "percentages" in course_ids,
        "graph lists all three courses",
        knowledge["courses"],
    )
    check(
        ARITHMETIC_TOPICS <= node_ids
        and FRACTIONS_TOPICS <= node_ids
        and PERCENTAGES_TOPICS <= node_ids,
        "graph nodes include every topic from every course",
        node_ids,
    )
    check(
        all("correct_choice" not in node for node in knowledge["nodes"]),
        "graph nodes do not include answers",
        knowledge["nodes"][0].keys() if knowledge["nodes"] else None,
    )
    prereq_edges = [
        edge for edge in knowledge["edges"] if edge["kind"] == "prerequisite"
    ]
    encompassing_edges = [
        edge for edge in knowledge["edges"] if edge["kind"] == "encompassing"
    ]
    check(len(prereq_edges) > 0, "graph includes prerequisite edges", knowledge["edges"])
    check(
        len(encompassing_edges) > 0,
        "graph includes encompassing edges",
        knowledge["edges"],
    )
    enc_pairs = {
        (edge["from_id"], edge["to_id"]) for edge in encompassing_edges
    }
    check(
        ("subtraction", "addition") in enc_pairs,
        "subtraction encompasses addition",
        enc_pairs,
    )
    check(
        ("division", "multiplication") in enc_pairs,
        "division encompasses multiplication",
        enc_pairs,
    )
    check(
        ("addition", "place_value") in enc_pairs,
        "addition encompasses place value",
        enc_pairs,
    )
    course_of = {node["id"]: node["course_id"] for node in knowledge["nodes"]}
    cross = [
        edge
        for edge in knowledge["edges"]
        if course_of.get(edge["from_id"]) != course_of.get(edge["to_id"])
    ]
    check(len(cross) > 0, "graph includes at least one cross-course edge", cross)

    print("== 1. new student lands in the first course with a diagnostic ==")
    plan = api(token, "GET", "/next-tasks")
    check(
        plan["course"]["id"] == "arithmetic",
        "first course auto-activated for a brand-new student",
        plan["course"],
    )
    check(
        any(task["type"] == "DIAGNOSTIC" for task in plan["tasks"]),
        "diagnostic offered to brand-new student",
        plan["tasks"],
    )
    check(
        all(task["type"] == "DIAGNOSTIC" for task in plan["tasks"]),
        "lessons stay locked until placement is finished",
        plan["tasks"],
    )

    print("== 2. full-course diagnostic (knows the basics up to subtraction) ==")
    can_answer = {
        "place_value",
        "addition",
        "rounding",
        "subtraction",
        "estimating",
    }
    step = api(token, "POST", "/diagnostic/start")
    session_id = step["session_id"]
    asked = 0
    probed = set()
    while not step["done"]:
        problem = step["problem"]
        topic = topic_of_problem(problem["id"])
        probed.add(topic)
        choice = (
            correct_choice_of(problem["id"])
            if topic in can_answer
            else wrong_choice_of(problem["id"])
        )
        step = api(
            token,
            "POST",
            f"/diagnostic/{session_id}/answer",
            {"problem_id": problem["id"], "chosen_choice": choice},
        )
        asked += 1
    known = {item["topic_id"] for item in step["known_topics"]}
    check(
        probed == ARITHMETIC_TOPICS,
        "every arithmetic topic was probed",
        probed,
    )
    check(
        known == can_answer,
        "only passed probes are credited",
        known,
    )
    check(
        "multiplication" not in known,
        "failed multiplication probe is not credited",
        known,
    )
    check(
        asked == len(ARITHMETIC_TOPICS) * 3,
        "three questions per course topic",
        asked,
    )

    print("== 3. selector recommends the frontier lesson, scoped to the course ==")
    tasks = api(token, "GET", "/next-tasks")["tasks"]
    check(
        not any(task["type"] == "DIAGNOSTIC" for task in tasks),
        "no diagnostic after placement",
    )
    new_lessons = [task for task in tasks if task["type"] == "NEW_LESSON"]
    check(
        any(task["topic_id"] == "multiplication" for task in new_lessons),
        "multiplication (the frontier) offered as new lesson",
        new_lessons,
    )
    check(
        task_topics(tasks) <= ARITHMETIC_TOPICS,
        "tasks never reference another course's topics",
        task_topics(tasks),
    )
    check(
        all(task["reasons"] for task in tasks),
        "every task carries explainable reasons",
    )

    print("== 4. learn multiplication, then division ==")
    result = complete_topic(token, "multiplication")
    check(result["topic_completed"], "multiplication mastered through practice")
    check(result["next_review_at"] is not None, "review scheduled after mastery")
    calendar = api(token, "GET", "/calendar")
    check(
        len(calendar["practiced"]) > 0,
        "calendar lists practice timestamps",
        calendar["practiced"][:3],
    )
    check(
        len(calendar["reviews"]) > 0,
        "calendar lists scheduled reviews",
        calendar["reviews"][:3],
    )
    result = complete_topic(token, "division")
    check(result["topic_completed"], "division mastered")

    print("== 5. force reviews due + implicit repetition ==")
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    addition_kps = (
        db.table("knowledge_points").select("id").eq("topic_id", "addition").execute().data
    )
    for kp in addition_kps:
        db.table("user_progress").update({"next_review_at": yesterday}).eq(
            "user_id", user_id
        ).eq("knowledge_point_id", kp["id"]).execute()
    tasks = api(token, "GET", "/next-tasks")["tasks"]
    addition_review = next(
        (t for t in tasks if t["type"] == "REVIEW" and t["topic_id"] == "addition"),
        None,
    )
    check(addition_review is not None, "due review for addition appears", tasks)
    check(
        any("implicitly" in reason.lower() for reason in addition_review["reasons"]),
        "review notes it can be covered by an encompassing lesson (compression)",
        addition_review["reasons"],
    )

    teaching = api(token, "GET", "/topics/two_digit_multiplication/intro")
    check(teaching["kind"] == "intro", "lesson opens with teaching text")
    check(len(teaching["intro"]) > 40, "intro explains the method")
    check(teaching["example"] is not None, "intro includes a worked example")
    step = api(token, "GET", "/topics/two_digit_multiplication/next-problem")
    check(step["kind"] == "practice", "after intro, next-problem is practice")
    answer = api(
        token,
        "POST",
        "/answers",
        {
            "problem_id": step["problem"]["id"],
            "chosen_choice": correct_choice_of(step["problem"]["id"]),
        },
    )
    check(answer["explanation"], "answer feedback includes an explanation")
    implicit_topics = {u["topic_id"] for u in answer["implicit_updates"]}
    check(
        {"multiplication", "addition"} <= implicit_topics,
        "correct answer propagated implicit credit over encompassing edges",
        answer["implicit_updates"],
    )
    tasks = api(token, "GET", "/next-tasks")["tasks"]
    check(
        not any(
            t["type"] == "REVIEW" and t["topic_id"] == "addition" for t in tasks
        ),
        "addition review satisfied implicitly (repetition compression)",
    )
    complete_topic(token, "two_digit_multiplication")
    complete_topic(token, "estimating")
    complete_topic(token, "factors")

    print("== 6. course catalog + switching ==")
    courses = {c["id"]: c for c in api(token, "GET", "/courses")["courses"]}
    check(
        {"arithmetic", "fractions_decimals", "percentages"} <= set(courses),
        "catalog lists the three main courses",
        courses.keys(),
    )
    check(courses["arithmetic"]["is_active"], "arithmetic is the active course")
    check(
        courses["arithmetic"]["topics_completed"] == 9
        and courses["arithmetic"]["topics_total"] == 9,
        "arithmetic fully completed (9/9 topics)",
        courses["arithmetic"],
    )
    idle = api(token, "GET", "/next-tasks")
    check(
        idle.get("next_review_at") is not None,
        "completed course still has a scheduled review",
        idle.get("next_review_at"),
    )
    check(
        (idle.get("next_course") or {}).get("id") == "fractions_decimals",
        "completed arithmetic recommends the next catalog course",
        idle.get("next_course"),
    )
    check(
        not courses["fractions_decimals"]["started"],
        "second course untouched so far",
        courses["fractions_decimals"],
    )

    switched = api(token, "POST", "/courses/fractions_decimals/activate")
    check(
        switched["active"]["id"] == "fractions_decimals",
        "switched to Fractions & Decimals",
    )
    plan = api(token, "GET", "/next-tasks")
    check(
        plan["course"]["id"] == "fractions_decimals",
        "plan now scoped to the new course",
    )
    check(
        any(task["type"] == "DIAGNOSTIC" for task in plan["tasks"]),
        "fresh course offers its own diagnostic",
    )
    check(
        all(task["type"] == "DIAGNOSTIC" for task in plan["tasks"]),
        "second-course lessons stay locked until its diagnostic is finished",
        plan["tasks"],
    )
    db.table("diagnostic_sessions").insert(
        {
            "user_id": user_id,
            "course_id": "fractions_decimals",
            "status": "completed",
            "state": {},
        }
    ).execute()
    plan = api(token, "GET", "/next-tasks")
    lesson_topics = {
        t["topic_id"] for t in plan["tasks"] if t["type"] == "NEW_LESSON"
    }
    check(
        lesson_topics == {"fractions"},
        "only the unlocked course topic is offered (fractions)",
        lesson_topics,
    )

    print("== 7. halting + remediation across the course boundary ==")
    division_kp = (
        db.table("knowledge_points").select("id").eq("topic_id", "division").execute().data
    )[0]["id"]
    db.table("user_progress").update(
        {"mastery": 0.4, "next_review_at": yesterday}
    ).eq("user_id", user_id).eq("knowledge_point_id", division_kp).execute()

    step = api(token, "GET", "/topics/fractions/next-problem")
    if step["kind"] in ("example", "intro"):
        step = api(token, "GET", "/topics/fractions/next-problem")
    halted = None
    for _ in range(4):
        halted = api(
            token,
            "POST",
            "/answers",
            {
                "problem_id": step["problem"]["id"],
                "chosen_choice": wrong_choice_of(step["problem"]["id"]),
            },
        )
        if halted["halted"]:
            break
        step = api(token, "GET", "/topics/fractions/next-problem")
    check(halted["halted"], "lesson halts after repeated mistakes", halted)
    check(
        "division" in (halted["halt_reason"] or "").lower(),
        "halt identifies the weak prerequisite",
        halted["halt_reason"],
    )
    tasks = api(token, "GET", "/next-tasks")["tasks"]
    remedial = next((t for t in tasks if t["type"] == "REMEDIAL_REVIEW"), None)
    check(remedial is not None, "remedial review task generated", tasks)
    check(
        remedial["topic_id"] == "division",
        "remediation targets the weak prerequisite in the other course",
        remedial,
    )

    # do the remedial review: answer division correctly until it recovers
    for _ in range(5):
        step = api(token, "GET", "/topics/division/next-problem")
        api(
            token,
            "POST",
            "/answers",
            {
                "problem_id": step["problem"]["id"],
                "chosen_choice": correct_choice_of(step["problem"]["id"]),
            },
        )
        tasks = api(token, "GET", "/next-tasks")["tasks"]
        if not any(t["type"] == "REMEDIAL_REVIEW" for t in tasks):
            break
    resumed = next(
        (
            t
            for t in tasks
            if t["type"] == "PRACTICE" and t.get("topic_id") == "fractions"
        ),
        None,
    )
    check(resumed is not None, "fractions lesson un-halted after remediation", tasks)
    check(
        sum(
            1
            for t in tasks
            if t["type"] == "PRACTICE" and t.get("topic_id") == "fractions"
        )
        == 1,
        "halt resume is a single Practice card, not Resume plus Continue",
        tasks,
    )
    api(token, "GET", "/topics/fractions/intro")

    print("== 8. switching back: course A is exactly as the student left it ==")
    api(token, "POST", "/courses/arithmetic/activate")
    plan = api(token, "GET", "/next-tasks")
    check(plan["course"]["id"] == "arithmetic", "back in arithmetic")
    check(
        task_topics(plan["tasks"]) <= ARITHMETIC_TOPICS,
        "no fractions-course tasks leak into arithmetic",
        task_topics(plan["tasks"]),
    )
    check(
        not any(t["type"] == "DIAGNOSTIC" for t in plan["tasks"]),
        "no diagnostic again after returning (progress remembered)",
    )

    print("== 9. mixed quiz in the active course feeds the student model ==")
    quiz = api(token, "POST", "/quizzes")
    check(quiz["total"] >= 6, "quiz has two questions per learned topic", quiz["total"])
    check(quiz.get("recap") in (None, []), "no recap while the quiz is open", quiz.get("recap"))
    plan = api(token, "GET", "/next-tasks")
    check(
        len(plan["tasks"]) == 1 and plan["tasks"][0]["type"] == "QUIZ",
        "unfinished quiz is the only Learn task",
        plan["tasks"],
    )
    blocked = raw(token, "GET", "/topics/addition/intro")
    check(
        blocked.status_code == 403,
        "lessons blocked while a quiz is active",
        blocked.text,
    )
    blocked_graph = raw(token, "GET", "/graph")
    check(
        blocked_graph.status_code == 403,
        "graph blocked while a quiz is active",
        blocked_graph.text,
    )
    seen_topics = []
    while quiz["next_question"]:
        question = quiz["next_question"]
        seen_topics.append(topic_of_problem(question["problem"]["id"]))
        answer = api(
            token,
            "POST",
            "/answers",
            {
                "problem_id": question["problem"]["id"],
                "chosen_choice": correct_choice_of(question["problem"]["id"]),
                "quiz_question_id": question["quiz_question_id"],
            },
        )
        check(
            "correct_choice" not in answer,
            "quiz answers do not reveal the key until the recap",
            answer.keys(),
        )
        quiz = api(token, "GET", f"/quizzes/{quiz['quiz_id']}")
    check(quiz["status"] == "completed", "quiz completed")
    check(quiz["score"] == 100, "quiz scored", quiz["score"])
    check(
        isinstance(quiz.get("recap"), list) and len(quiz["recap"]) == quiz["total"],
        "finished quiz returns a per-question recap",
        quiz.get("recap"),
    )
    check(
        set(seen_topics) <= ARITHMETIC_TOPICS,
        "quiz drew questions only from the active course",
        seen_topics,
    )
    check(
        len(set(seen_topics)) >= 2
        and all(a != b for a, b in zip(seen_topics, seen_topics[1:])),
        "quiz interleaves topics (no topic twice in a row)",
        seen_topics,
    )
    check(answer["context"] == "quiz", "quiz answers recorded with quiz context")

    print("== 10. per-course library views ==")
    queue = api(token, "GET", "/learn-queue")
    check(len(queue["items"]) == 9, "arithmetic library lists its 9 topics", len(queue["items"]))
    check(
        all("mastery_pct" in item and "state" in item for item in queue["items"]),
        "library exposes per-topic state and mastery",
    )
    api(token, "POST", "/courses/fractions_decimals/activate")
    queue = api(token, "GET", "/learn-queue")
    check(
        len(queue["items"]) == 5 and queue["course"]["id"] == "fractions_decimals",
        "fractions course lists its own 5 topics",
        queue["items"],
    )
    fractions_item = next(i for i in queue["items"] if i["topic_id"] == "fractions")
    check(
        fractions_item["state"] == "in_progress",
        "fractions kept its own independent state",
        fractions_item,
    )
    courses = {c["id"]: c for c in api(token, "GET", "/courses")["courses"]}
    check(
        courses["arithmetic"]["topics_completed"] >= 6
        and courses["fractions_decimals"]["started"]
        and courses["fractions_decimals"]["topics_completed"] == 0,
        "course progress tracked independently per course",
        courses,
    )

    print("== cleanup ==")
    wipe_user(TEST_EMAIL)
    print(f"\nALL {passed_count()} CHECKS PASSED")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        wipe_user(TEST_EMAIL)
        raise
