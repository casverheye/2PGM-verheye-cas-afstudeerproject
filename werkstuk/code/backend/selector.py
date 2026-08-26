"""Adaptive task selector.

Builds a ranked list of candidate tasks for a student **within one course**.
Every task carries a `value` score (rough proxy for expected learning value
per minute) and a human-readable `reasons` list so decisions stay explainable.

Scoping rule: candidate lessons, reviews, and quizzes come only from the
active course, but prerequisite checks always look at the whole graph.
Mastery belongs to the student, not to a course, so knowledge earned in one
course unlocks material in another. When a course topic is blocked by an
unmastered prerequisite that lives in a different course, a FOUNDATION task
points the student at that prerequisite instead of leaving a dead end.

Tasks are plain dicts because they are API payloads, not domain objects.
"""

from db import db
from gates import active_quiz_id, has_completed_diagnostic
from graph import (
    Graph,
    course_completed,
    course_is_listed,
    find_weak_prerequisites,
    kp_states,
    load_graph,
    prereqs_met,
    topic_completed,
)
from learning import (
    PREREQ_OK_THRESHOLD,
    get_progress_map,
    now_utc,
)
from placement import session_progress_pct

ESTIMATED_MINUTES = {
    "DIAGNOSTIC": 5,
    "NEW_LESSON": 5,
    "PRACTICE": 4,
    "REVIEW": 2,
    "REMEDIAL_REVIEW": 3,
    "FOUNDATION": 5,
    "QUIZ": 5,
}

QUIZ_CHECKPOINT_EVERY = 3
QUIZ_QUESTIONS_PER_TOPIC = 2
QUIZ_MIN_MASTERY = 0.25

# encompassing edges at/above this weight count as a full substitute for a
# separate review of the encompassed topic
COMPRESSION_MIN_WEIGHT = 0.4


def _topic_progress_pct(states) -> int:
    """0–100 from current mastery of the topic's knowledge points."""
    if not states:
        return 0
    average = sum(state.effective_mastery for state in states) / len(states)
    return min(100, round(average * 100))


def _quiz_progress_pct(quiz_id: int) -> int:
    rows = (
        db.table("quiz_questions")
        .select("is_correct")
        .eq("quiz_id", quiz_id)
        .execute()
        .data
    )
    if not rows:
        return 0
    answered = sum(1 for row in rows if row["is_correct"] is not None)
    return min(100, round(100 * answered / len(rows)))


def _task(
    task_type: str, title: str, reasons: list[str], value: float, **extra
) -> dict:
    extra.setdefault("progress_pct", 0)
    return {
        "type": task_type,
        "title": title,
        "reasons": reasons,
        "value": round(value, 1),
        "estimated_minutes": ESTIMATED_MINUTES.get(task_type, 4),
        **extra,
    }


def _prerequisites(graph: Graph, topic_id: str) -> list[dict]:
    """Direct prerequisite topics, as explanation-only Learn-card links."""
    items = []
    for prereq_id in graph.prereqs_for.get(topic_id, []):
        course_id = graph.course_for_topic.get(prereq_id)
        if prereq_id not in graph.topics or course_id is None:
            continue
        items.append(
            {
                "id": prereq_id,
                "title": graph.topics[prereq_id],
                "course_id": course_id,
            }
        )
    return items


def _topics_similar(a: str, b: str, graph: Graph) -> bool:
    """Similar = directly connected or sharing a direct prerequisite.
    Used to avoid interleaving two easily-confused topics back to back."""
    if a == b:
        return True
    prereqs_a = set(graph.prereqs_for.get(a, []))
    prereqs_b = set(graph.prereqs_for.get(b, []))
    if a in prereqs_b or b in prereqs_a:
        return True
    return bool(prereqs_a & prereqs_b)


def _interleave(tasks: list[dict], graph: Graph) -> list[dict]:
    """Greedy reorder: keep value order, but avoid putting two similar topics
    next to each other when a later candidate can be pulled forward."""
    ordered: list[dict] = []
    remaining = list(tasks)
    while remaining:
        pick_index = 0
        if ordered:
            previous_topic = ordered[-1].get("topic_id")
            if previous_topic:
                for index, candidate in enumerate(remaining):
                    candidate_topic = candidate.get("topic_id")
                    if candidate_topic is None or not _topics_similar(
                        previous_topic, candidate_topic, graph
                    ):
                        pick_index = index
                        break
        ordered.append(remaining.pop(pick_index))
    return ordered


def _diagnostic_task(user_id: str, course_id: str) -> dict:
    active = (
        db.table("diagnostic_sessions")
        .select("state")
        .eq("user_id", user_id)
        .eq("course_id", course_id)
        .eq("status", "active")
        .limit(1)
        .execute()
        .data
    )
    if active:
        return _task(
            "DIAGNOSTIC",
            "Resume placement diagnostic",
            [
                "You left an unfinished placement test",
                "Answers already given are kept",
            ],
            100,
            progress_pct=session_progress_pct(active[0]["state"]),
        )
    return _task(
        "DIAGNOSTIC",
        "Placement diagnostic",
        [
            "No learning history yet",
            "A short probe for every topic in this course",
            "Skips topics you already mastered",
        ],
        100,
        progress_pct=0,
    )


def _resume_quiz_task(quiz_id: int) -> dict:
    return _task(
        "QUIZ",
        "Resume quiz",
        [
            "Finish this quiz before other Learn work",
            "Answers so far are saved",
        ],
        100,
        quiz_id=quiz_id,
        progress_pct=_quiz_progress_pct(quiz_id),
    )


def _lesson_completed_topic_count(
    user_id: str, course_id: str, graph: Graph, progress: dict, now
) -> int:
    """Topics in this course that are mastered and have at least one lesson answer."""
    history = (
        db.table("answer_history")
        .select("problem_id")
        .eq("user_id", user_id)
        .eq("context", "lesson")
        .execute()
        .data
    )
    if not history:
        return 0
    problem_ids = list({row["problem_id"] for row in history})
    problem_rows = (
        db.table("problems")
        .select("id, knowledge_point_id")
        .in_("id", problem_ids)
        .execute()
        .data
    )
    lesson_topics: set[str] = set()
    for row in problem_rows:
        kp = graph.kp_by_id.get(row["knowledge_point_id"])
        if kp is None:
            continue
        if graph.course_for_topic.get(kp.topic_id) == course_id:
            lesson_topics.add(kp.topic_id)
    return sum(
        1
        for topic_id in lesson_topics
        if topic_completed(kp_states(topic_id, graph, progress, now))
    )


def _completed_quiz_count(user_id: str, course_id: str) -> int:
    rows = (
        db.table("quizzes")
        .select("id")
        .eq("user_id", user_id)
        .eq("course_id", course_id)
        .eq("status", "completed")
        .execute()
        .data
    )
    return len(rows or [])


def quiz_sittings_owed(lesson_count: int, course_complete: bool) -> int:
    """How many mixed quizzes this course has earned.

    Checkpoints at 3, 6, 9, … lesson-finished topics. A full course always
    earns a final; if that finale lands on a checkpoint, they merge.
    """
    checkpoints = lesson_count // QUIZ_CHECKPOINT_EVERY
    if not course_complete:
        return checkpoints
    if lesson_count > 0 and lesson_count % QUIZ_CHECKPOINT_EVERY == 0:
        return checkpoints
    return checkpoints + 1


def eligible_quiz_topics(course_id: str, graph: Graph, progress: dict, now) -> list[str]:
    topic_ids = []
    for topic_id in graph.topics_by_course.get(course_id, []):
        states = kp_states(topic_id, graph, progress, now)
        if not states or any(state.halted for state in states):
            continue
        if any(
            state.started and state.effective_mastery >= QUIZ_MIN_MASTERY
            for state in states
        ):
            topic_ids.append(topic_id)
    return topic_ids


def quiz_due_kind(
    user_id: str, course_id: str, graph: Graph, progress: dict, now
) -> str | None:
    """'checkpoint', 'final', or None. Resume is handled separately."""
    lesson_n = _lesson_completed_topic_count(user_id, course_id, graph, progress, now)
    done = _completed_quiz_count(user_id, course_id)
    complete = course_completed(course_id, graph, progress, now)
    owed = quiz_sittings_owed(lesson_n, complete)
    if done >= owed:
        return None
    if complete and done == owed - 1:
        return "final"
    return "checkpoint"


def _quiz_task(user_id: str, course_id: str, graph: Graph, progress: dict, now) -> dict | None:
    open_id = active_quiz_id(user_id)
    if open_id is not None:
        return _resume_quiz_task(open_id)

    kind = quiz_due_kind(user_id, course_id, graph, progress, now)
    if kind is None:
        return None

    learned = eligible_quiz_topics(course_id, graph, progress, now)
    if len(learned) < 2:
        return None
    minutes = max(6, len(learned) * QUIZ_QUESTIONS_PER_TOPIC)
    if kind == "final":
        title = "Course quiz"
        reasons = [
            "Every topic in this course is completed",
            "A mixed quiz checks them together, without lesson notes",
        ]
    else:
        title = "Mixed quiz"
        reasons = [
            "Three more topics finished through lessons",
            "A mixed quiz checks learned topics together, without lesson notes",
        ]
    task = _task("QUIZ", title, reasons, 90)
    task["estimated_minutes"] = minutes
    return task


def _actionable_external_prereqs(
    topic_id: str,
    course_id: str,
    graph: Graph,
    progress: dict[int, dict],
    now,
    states_by_topic: dict[str, list],
) -> list[str]:
    """Prerequisite topics outside this course that block `topic_id`, are not
    completed, and can be started right now (their own prerequisites are met)."""
    actionable: list[str] = []
    visited: set[str] = set()
    queue = list(graph.prereqs_for.get(topic_id, []))
    while queue:
        candidate = queue.pop(0)
        if candidate in visited:
            continue
        visited.add(candidate)
        states = states_by_topic.get(candidate, [])
        if topic_completed(states):
            continue
        if (
            graph.course_for_topic.get(candidate) != course_id
            and course_is_listed(graph, graph.course_for_topic.get(candidate))
            and not any(state.halted for state in states)
            and prereqs_met(candidate, graph, progress, now)
        ):
            actionable.append(candidate)
        queue.extend(graph.prereqs_for.get(candidate, []))
    return actionable


def build_tasks(user_id: str, course_id: str, graph: Graph | None = None) -> list[dict]:
    now = now_utc()
    if graph is None:
        graph = load_graph()
    progress = get_progress_map(user_id)
    tasks: list[dict] = []

    course_topic_ids = graph.topics_by_course.get(course_id, [])

    # Placement first: without a finished diagnostic the selector would also
    # offer Place value (no prerequisites), and the student could skip the test.
    if not has_completed_diagnostic(user_id, course_id):
        return [_diagnostic_task(user_id, course_id)]

    open_quiz_id = active_quiz_id(user_id)
    if open_quiz_id is not None:
        return [_resume_quiz_task(open_quiz_id)]

    # Snapshots for every topic (all courses): prerequisite and encompassing
    # checks may cross course boundaries even though candidates never do.
    states_by_topic = {
        topic_id: kp_states(topic_id, graph, progress, now)
        for topic_id in graph.topics
    }

    # Which course topics are candidates for new/continued learning? Needed
    # early so reviews can detect repetition-compression opportunities.
    learnable: dict[str, str] = {}  # topic_id -> "new" | "continue"
    for topic_id in course_topic_ids:
        states = states_by_topic[topic_id]
        if not states or topic_completed(states):
            continue
        if any(state.halted for state in states):
            continue
        if not prereqs_met(topic_id, graph, progress, now):
            continue
        started = any(state.started for state in states)
        learnable[topic_id] = "continue" if started else "new"

    # --- Foundation lessons for cross-course prerequisites ------------------
    # A course topic blocked by an unmastered prerequisite from another course
    # would otherwise be a dead end: the missing lesson never shows up in this
    # course's plan. Surface it explicitly.
    foundation_seen: set[str] = set()
    for topic_id in course_topic_ids:
        states = states_by_topic[topic_id]
        if not states or topic_completed(states):
            continue
        if any(state.halted for state in states):
            continue
        if prereqs_met(topic_id, graph, progress, now):
            continue
        for blocker_id in _actionable_external_prereqs(
            topic_id, course_id, graph, progress, now, states_by_topic
        ):
            if blocker_id in foundation_seen:
                continue
            foundation_seen.add(blocker_id)
            blocker_course = graph.courses.get(
                graph.course_for_topic.get(blocker_id, ""), None
            )
            reasons = [
                f"First startable step toward '{graph.topics[topic_id]}'",
                "Mastering it unlocks the next skills on that path",
            ]
            if blocker_course is not None:
                reasons.insert(
                    1, f"It belongs to the course '{blocker_course.title}'"
                )
            tasks.append(
                _task(
                    "FOUNDATION",
                    f"Foundation lesson: {graph.topics[blocker_id]}",
                    reasons,
                    55,
                    topic_id=blocker_id,
                    unlocks_topic_id=topic_id,
                    progress_pct=_topic_progress_pct(
                        states_by_topic.get(blocker_id, [])
                    ),
                )
            )

    # --- Remediation for halted lessons -----------------------------------
    for topic_id in course_topic_ids:
        states = states_by_topic[topic_id]
        halted_states = [state for state in states if state.halted]
        if not halted_states:
            continue
        title = graph.topics[topic_id]
        weak = find_weak_prerequisites(topic_id, graph, progress, now)
        if weak:
            target = weak[0]
            tasks.append(
                _task(
                    "REMEDIAL_REVIEW",
                    f"Remedial review: {target.title}",
                    [
                        f"Lesson '{title}' was halted after repeated mistakes",
                        f"Weakest prerequisite: {target.title} "
                        f"({target.kp_title} at {round(target.effective_mastery * 100)}%)",
                        f"Strengthening it should unblock '{title}'",
                    ],
                    90 + (PREREQ_OK_THRESHOLD - target.effective_mastery) * 20,
                    topic_id=target.topic_id,
                    blocked_topic_id=topic_id,
                    progress_pct=_topic_progress_pct(
                        states_by_topic.get(target.topic_id, [])
                    ),
                )
            )
        else:
            # Rows stay halted until the student opens the lesson. GET /next-tasks
            # only offers the resume card — it must not rewrite progress.
            tasks.append(
                _task(
                    "PRACTICE",
                    f"Resume lesson: {title}",
                    [
                        "This lesson was halted, but prerequisites look solid again",
                        "Resume with extra practice",
                    ],
                    75,
                    topic_id=topic_id,
                    progress_pct=_topic_progress_pct(states),
                )
            )

    # --- Due reviews -------------------------------------------------------
    for topic_id in course_topic_ids:
        states = states_by_topic[topic_id]
        # A half-finished topic is a lesson, not a review. Mixing both cards
        # for the same topic (one KP still in progress, another due) is wrong.
        if not topic_completed(states):
            continue
        due_states = [state for state in states if state.due]
        if not due_states:
            continue
        title = graph.topics[topic_id]
        worst = min(due_states, key=lambda state: state.effective_mastery)
        overdue = max(state.overdue_days for state in due_states)
        dependents = len(graph.dependents_of.get(topic_id, []))

        reasons = [
            f"Review due for {len(due_states)} knowledge point(s)",
            f"Current retention estimate: {round(worst.effective_mastery * 100)}%",
        ]
        value = 60 + min(overdue, 10.0) * 2 + dependents * 2
        if any(state.unstable for state in due_states):
            value += 15
            reasons.append("Retention dropped critically low (likely forgotten)")
        if overdue > 0.5:
            reasons.append(f"Overdue by {round(overdue, 1)} day(s)")
        if dependents:
            reasons.append(f"{dependents} other topic(s) build on this one")

        # Repetition compression: a learnable advanced topic that encompasses
        # this one refreshes it implicitly, so prefer the advanced task.
        covered_by = [
            advanced_id
            for advanced_id, targets in graph.encompasses.items()
            if advanced_id in learnable
            and any(
                target_id == topic_id and weight >= COMPRESSION_MIN_WEIGHT
                for target_id, weight in targets
            )
        ]
        if covered_by:
            covering_title = graph.topics[covered_by[0]]
            value -= 20
            # Keep due reviews above brand-new lessons (value 50).
            value = max(value, 52)
            reasons.append(
                f"Can be refreshed implicitly by working on '{covering_title}'"
            )

        tasks.append(
            _task(
                "REVIEW",
                f"Review: {title}",
                reasons,
                value,
                topic_id=topic_id,
                due_kp_ids=[state.kp.id for state in due_states],
                progress_pct=_topic_progress_pct(states),
            )
        )

    # --- Continue / start lessons -----------------------------------------
    for topic_id, kind in learnable.items():
        states = states_by_topic[topic_id]
        title = graph.topics[topic_id]
        if kind == "continue":
            tasks.append(
                _task(
                    "PRACTICE",
                    f"Continue lesson: {title}",
                    ["Continue this lesson"],
                    70,
                    topic_id=topic_id,
                    progress_pct=_topic_progress_pct(states),
                )
            )
        else:
            reasons = ["All prerequisites are mastered", "Unlocks new material"]
            value = 50.0
            # Compression bonus: starting this lesson also refreshes due topics.
            refreshed = []
            for target_id, weight in graph.encompasses.get(topic_id, []):
                target_states = states_by_topic.get(target_id, [])
                if any(state.due for state in target_states):
                    refreshed.append(graph.topics[target_id])
                    value += weight * 20
            if refreshed:
                reasons.append(
                    "Also implicitly refreshes due review(s): " + ", ".join(refreshed)
                )
            tasks.append(
                _task(
                    "NEW_LESSON",
                    f"New lesson: {title}",
                    reasons,
                    value,
                    topic_id=topic_id,
                    progress_pct=_topic_progress_pct(states),
                )
            )

    # --- Quiz ---------------------------------------------------------------
    quiz_task = _quiz_task(user_id, course_id, graph, progress, now)
    if quiz_task is not None:
        tasks.append(quiz_task)

    for task in tasks:
        topic_id = task.get("topic_id")
        if isinstance(topic_id, str):
            task["prerequisites"] = _prerequisites(graph, topic_id)

    tasks.sort(key=lambda task: task["value"], reverse=True)
    return _interleave(tasks, graph)
