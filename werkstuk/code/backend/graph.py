"""Knowledge graph: topics, knowledge points, prerequisite and encompassing
edges, plus per-user snapshots of where a student stands on each topic."""

from dataclasses import dataclass
from datetime import datetime

from db import db
from learning import (
    PREREQ_OK_THRESHOLD,
    UNSTABLE_THRESHOLD,
    decayed_mastery,
    parse_ts,
)


# How much implicit practice an encompassing edge gives the basic topic
# when the admin does not set a weight.
ENCOMPASSING_DEFAULT_WEIGHT = 0.3


@dataclass(frozen=True)
class Course:
    id: str
    title: str
    description: str | None
    sort_order: int
    listed: bool  # False = Admin-only; students do not see this course


@dataclass(frozen=True)
class KnowledgePoint:
    id: int
    topic_id: str
    title: str
    sort_order: int


@dataclass(frozen=True)
class Graph:
    courses: dict[str, Course]  # course_id -> course, ordered by sort_order
    topics: dict[str, str]  # topic_id -> title
    course_for_topic: dict[str, str]  # topic_id -> course_id
    topics_by_course: dict[str, list[str]]  # course_id -> its topic ids
    kps_by_topic: dict[str, list[KnowledgePoint]]  # ordered by sort_order
    kp_by_id: dict[int, KnowledgePoint]
    prereqs_for: dict[str, list[str]]  # topic -> its prerequisites
    dependents_of: dict[str, list[str]]  # topic -> topics that require it
    encompasses: dict[str, list[tuple[str, float]]]  # advanced -> [(basic, weight)]


@dataclass
class KpState:
    """Snapshot of one knowledge point for one user at one moment."""

    kp: KnowledgePoint
    row: dict | None  # user_progress row, None when never touched
    effective_mastery: float
    started: bool
    mastered: bool
    halted: bool
    due: bool
    unstable: bool
    overdue_days: float


@dataclass(frozen=True)
class WeakPrerequisite:
    topic_id: str
    title: str
    effective_mastery: float
    kp_id: int
    kp_title: str


def load_graph() -> Graph:
    """Load the whole knowledge graph (small; a few dozen rows).

    Always loads every course: prerequisite and encompassing edges may cross
    course boundaries, so scoping happens in the selector, not here.
    """
    course_rows = (
        db.table("courses")
        .select("id, title, description, sort_order, listed")
        .order("sort_order")
        .execute()
        .data
    )
    topic_rows = db.table("topics").select("id, title, course_id").execute().data
    kp_rows = (
        db.table("knowledge_points")
        .select("id, topic_id, title, sort_order")
        .order("sort_order")
        .execute()
        .data
    )
    edge_rows = (
        db.table("topic_edges")
        .select("from_topic_id, to_topic_id, kind, weight")
        .execute()
        .data
    )

    kps = [
        KnowledgePoint(
            id=row["id"],
            topic_id=row["topic_id"],
            title=row["title"],
            sort_order=row["sort_order"],
        )
        for row in kp_rows
    ]
    kps_by_topic: dict[str, list[KnowledgePoint]] = {}
    for kp in kps:
        kps_by_topic.setdefault(kp.topic_id, []).append(kp)
    for topic_kps in kps_by_topic.values():
        topic_kps.sort(key=lambda kp: kp.sort_order)

    prereqs_for: dict[str, list[str]] = {}
    dependents_of: dict[str, list[str]] = {}
    encompasses: dict[str, list[tuple[str, float]]] = {}
    for edge in edge_rows:
        if edge["kind"] == "prerequisite":
            prereqs_for.setdefault(edge["to_topic_id"], []).append(
                edge["from_topic_id"]
            )
            dependents_of.setdefault(edge["from_topic_id"], []).append(
                edge["to_topic_id"]
            )
        elif edge["kind"] == "encompassing":
            # practicing FROM implicitly practices TO with this weight
            encompasses.setdefault(edge["from_topic_id"], []).append(
                (edge["to_topic_id"], edge["weight"] or ENCOMPASSING_DEFAULT_WEIGHT)
            )

    courses = {
        row["id"]: Course(
            id=row["id"],
            title=row["title"],
            description=row.get("description"),
            sort_order=row["sort_order"],
            listed=bool(row.get("listed", True)),
        )
        for row in course_rows
    }
    topics_by_course: dict[str, list[str]] = {course_id: [] for course_id in courses}
    for row in topic_rows:
        topics_by_course.setdefault(row["course_id"], []).append(row["id"])

    return Graph(
        courses=courses,
        topics={row["id"]: row["title"] for row in topic_rows},
        course_for_topic={row["id"]: row["course_id"] for row in topic_rows},
        topics_by_course=topics_by_course,
        kps_by_topic=kps_by_topic,
        kp_by_id={kp.id: kp for kp in kps},
        prereqs_for=prereqs_for,
        dependents_of=dependents_of,
        encompasses=encompasses,
    )


def course_is_listed(graph: Graph, course_id: str | None) -> bool:
    """True when students may see this course (nav, graph, Learn)."""
    if not course_id:
        return False
    course = graph.courses.get(course_id)
    return course is not None and course.listed


def topic_is_listed(graph: Graph, topic_id: str) -> bool:
    return course_is_listed(graph, graph.course_for_topic.get(topic_id))


def kp_states(
    topic_id: str, graph: Graph, progress: dict[int, dict], now: datetime
) -> list[KpState]:
    """Per-KP snapshot for one topic: effective mastery, due/unstable flags."""
    states = []
    for kp in graph.kps_by_topic.get(topic_id, []):
        row = progress.get(kp.id)
        if row is None:
            states.append(
                KpState(
                    kp=kp,
                    row=None,
                    effective_mastery=0.0,
                    started=False,
                    mastered=False,
                    halted=False,
                    due=False,
                    unstable=False,
                    overdue_days=0.0,
                )
            )
            continue

        effective = decayed_mastery(row, now)
        mastered = row["status"] == "completed"
        due_at = parse_ts(row.get("next_review_at"))
        due = mastered and (due_at is None or due_at <= now)
        unstable = mastered and effective < UNSTABLE_THRESHOLD
        overdue_days = 0.0
        if mastered and due_at is not None and due_at <= now:
            overdue_days = (now - due_at).total_seconds() / 86400.0
        states.append(
            KpState(
                kp=kp,
                row=row,
                effective_mastery=effective,
                started=True,
                mastered=mastered,
                halted=row["status"] == "halted",
                due=due or unstable,
                unstable=unstable,
                overdue_days=overdue_days,
            )
        )
    return states


def topic_completed(states: list[KpState]) -> bool:
    return bool(states) and all(state.mastered for state in states)


def course_completed(
    course_id: str, graph: Graph, progress: dict[int, dict], now: datetime
) -> bool:
    """True when every topic in the course is mastered."""
    topic_ids = graph.topics_by_course.get(course_id, [])
    if not topic_ids:
        return False
    return all(
        topic_completed(kp_states(topic_id, graph, progress, now))
        for topic_id in topic_ids
    )


def recommended_next_course(
    course_id: str, graph: Graph, progress: dict[int, dict], now: datetime
) -> Course | None:
    """The next catalog course after this one that is not finished yet.

    Catalog order is `sort_order`. We do not skip ahead to a later unfinished
    course if the immediate next one is still open.
    """
    ordered = [course for course in graph.courses.values() if course.listed]
    ids = [course.id for course in ordered]
    if course_id not in ids:
        return None
    for later in ordered[ids.index(course_id) + 1 :]:
        if not course_completed(later.id, graph, progress, now):
            return later
    return None


def prereqs_met(
    topic_id: str, graph: Graph, progress: dict[int, dict], now: datetime
) -> bool:
    for prereq_id in graph.prereqs_for.get(topic_id, []):
        if not topic_completed(kp_states(prereq_id, graph, progress, now)):
            return False
    return True


def find_weak_prerequisites(
    topic_id: str, graph: Graph, progress: dict[int, dict], now: datetime
) -> list[WeakPrerequisite]:
    """Walk the prerequisite graph backwards (any depth) and return topics
    whose weakest KP is below PREREQ_OK_THRESHOLD, weakest first."""
    weak: list[WeakPrerequisite] = []
    visited: set[str] = set()
    queue = list(graph.prereqs_for.get(topic_id, []))
    while queue:
        candidate = queue.pop(0)
        if candidate in visited:
            continue
        visited.add(candidate)
        states = kp_states(candidate, graph, progress, now)
        if states:
            weakest = min(states, key=lambda state: state.effective_mastery)
            if weakest.effective_mastery < PREREQ_OK_THRESHOLD:
                weak.append(
                    WeakPrerequisite(
                        topic_id=candidate,
                        title=graph.topics.get(candidate, candidate),
                        effective_mastery=weakest.effective_mastery,
                        kp_id=weakest.kp.id,
                        kp_title=weakest.kp.title,
                    )
                )
        queue.extend(graph.prereqs_for.get(candidate, []))
    weak.sort(key=lambda item: item.effective_mastery)
    return weak
