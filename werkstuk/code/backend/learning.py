"""Student model: the per-(user, knowledge point) memory state and its math.

Each progress row tracks:
- mastery:   0..1, estimated strength at the moment of the last practice
- stability: days; controls both forgetting speed (half-life = 2 * stability)
             and the review interval (next review after `stability` days)
- learning_rate: per-student per-KP speed, derived from their success/fail ratio

Effective mastery right now = mastery * 0.5 ** (days_since_practice / (2 * stability)),
so at the scheduled review moment effective mastery is ~0.71 * mastery (still healthy),
and it becomes "unstable" (below 0.5) only when a review is badly overdue.

Progress rows are plain dicts that mirror the `user_progress` table, because they
travel straight to and from Supabase upserts.
"""

from datetime import datetime, timedelta, timezone

from db import db

MASTERY_THRESHOLD = 0.8  # KP counts as mastered at/above this
UNSTABLE_THRESHOLD = 0.5  # previously mastered KP decayed below this => urgent
PREREQ_OK_THRESHOLD = 0.6  # prerequisite strength needed during remediation checks
LEARN_GAIN = 0.4  # base mastery gain for a correct answer
MIN_STABILITY = 0.5
MAX_STABILITY = 365.0
HALF_LIFE_FACTOR = 2.0  # half-life = HALF_LIFE_FACTOR * stability
HALT_FAIL_STREAK = 3  # consecutive wrong answers in a lesson => halt
LESSON_SITTING_CAP = 8  # mixed lesson answers on one KP before we pause
LESSON_SITTING_GAP_MINUTES = 10
LESSON_SITTING_DETAIL = (
    "That's enough practice on this skill for now. "
    "Your progress is saved. Continue later from Learn."
)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def parse_ts(text) -> datetime | None:
    if text is None:
        return None
    value = str(text).replace("Z", "+00:00")
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def days_since(ts, now: datetime) -> float | None:
    parsed = parse_ts(ts)
    if parsed is None:
        return None
    return max((now - parsed).total_seconds() / 86400.0, 0.0)


def decayed_mastery(row: dict, now: datetime) -> float:
    """Effective mastery right now, after forgetting."""
    mastery = row.get("mastery") or 0.0
    stability = max(row.get("stability") or 1.0, MIN_STABILITY)
    elapsed = days_since(row.get("last_practiced_at"), now)
    if elapsed is None or mastery <= 0:
        return mastery
    return mastery * 0.5 ** (elapsed / (HALF_LIFE_FACTOR * stability))


def compute_learning_rate(successes: int, fails: int) -> float:
    """1.0 = average. Struggling students get < 1 (slower gains, shorter
    intervals); consistently strong students get up to 1.5."""
    ratio = (successes + 1.0) / (successes + fails + 2.0)
    return min(max(2.0 * ratio, 0.5), 1.5)


def new_progress_row(user_id: str, kp_id: int) -> dict:
    return {
        "user_id": user_id,
        "knowledge_point_id": kp_id,
        "consecutive_correct": 0,
        "status": "in_progress",
        "next_review_at": None,
        "srs_interval_days": None,
        "mastery": 0.0,
        "stability": 1.0,
        "success_count": 0,
        "fail_count": 0,
        "implicit_credit": 0.0,
        "learning_rate": 1.0,
        "last_practiced_at": None,
    }


def apply_evidence(
    row: dict, correct: bool, weight: float, now: datetime, explicit: bool = True
) -> dict:
    """Fold one piece of evidence into a progress row (mutates and returns it).

    weight 1.0 = a real explicit answer on this KP.
    weight < 1  = implicit practice propagated over an encompassing edge.
    """
    stability = max(row.get("stability") or 1.0, MIN_STABILITY)
    effective = decayed_mastery(row, now)
    elapsed = days_since(row.get("last_practiced_at"), now) or 0.0
    learning_rate = row.get("learning_rate") or 1.0
    was_completed = row.get("status") == "completed"

    if correct:
        gain = min(LEARN_GAIN * weight * learning_rate, 0.95)
        mastery = effective + (1.0 - effective) * gain
        if elapsed >= 0.5 * stability:
            # properly spaced repetition: strong stability growth,
            # stronger when memory was still healthy (spacing effect)
            growth = 1.0 + (0.6 + effective) * weight
        else:
            # crammed / same-session practice: small growth only
            growth = 1.0 + 0.15 * weight
        stability = min(stability * growth, MAX_STABILITY)
    else:
        mastery = effective * (1.0 - 0.5 * weight)
        stability = max(stability * (1.0 - 0.4 * weight), MIN_STABILITY)

    if explicit:
        if correct:
            row["success_count"] = (row.get("success_count") or 0) + 1
            row["consecutive_correct"] = (row.get("consecutive_correct") or 0) + 1
        else:
            row["fail_count"] = (row.get("fail_count") or 0) + 1
            row["consecutive_correct"] = 0
        row["learning_rate"] = round(
            compute_learning_rate(row["success_count"], row["fail_count"]), 3
        )
    else:
        # implicit practice can refresh knowledge but never complete a KP
        # the student has not explicitly mastered
        if not was_completed:
            mastery = min(mastery, MASTERY_THRESHOLD - 0.01)
        row["implicit_credit"] = round((row.get("implicit_credit") or 0.0) + weight, 3)

    row["mastery"] = round(mastery, 4)
    row["stability"] = round(stability, 4)
    row["last_practiced_at"] = now.isoformat()

    if row["mastery"] >= MASTERY_THRESHOLD or (not explicit and was_completed):
        row["status"] = "completed"
        row["srs_interval_days"] = max(int(round(row["stability"])), 1)
        row["next_review_at"] = (now + timedelta(days=row["stability"])).isoformat()
    else:
        if row.get("status") != "halted":
            row["status"] = "in_progress"
        row["next_review_at"] = None
        row["srs_interval_days"] = None
    return row


def lesson_burst_count(user_id: str, kp_id: int) -> int:
    """Lesson answers in the current sitting on this knowledge point.

    A sitting is a burst: walk newest → oldest until two answers are more
    than LESSON_SITTING_GAP_MINUTES apart. Reviews and quizzes do not count.
    """
    problem_rows = (
        db.table("problems")
        .select("id")
        .eq("knowledge_point_id", kp_id)
        .execute()
        .data
    )
    problem_ids = [row["id"] for row in problem_rows]
    if not problem_ids:
        return 0
    rows = (
        db.table("answer_history")
        .select("created_at")
        .eq("user_id", user_id)
        .eq("context", "lesson")
        .in_("problem_id", problem_ids)
        .order("created_at", desc=True)
        .limit(40)
        .execute()
        .data
    )
    if not rows:
        return 0
    gap = timedelta(minutes=LESSON_SITTING_GAP_MINUTES)
    cursor = now_utc()
    count = 0
    for row in rows:
        stamp = parse_ts(row["created_at"])
        if stamp is None:
            break
        if cursor - stamp > gap:
            break
        count += 1
        cursor = stamp
    return count


def lesson_sitting_exhausted(user_id: str, kp_id: int, row: dict | None) -> bool:
    """True after a full mixed sitting (8, 16, … answers in this burst)
    if the skill is still not mastered. A new sitting can start afterwards."""
    if row is None:
        return False
    if row.get("status") in ("completed", "halted"):
        return False
    if (row.get("mastery") or 0) >= MASTERY_THRESHOLD:
        return False
    n = lesson_burst_count(user_id, kp_id)
    return n > 0 and n % LESSON_SITTING_CAP == 0


def get_progress_map(user_id: str) -> dict[int, dict]:
    """All progress rows for one user, keyed by knowledge point id."""
    rows = db.table("user_progress").select("*").eq("user_id", user_id).execute().data
    return {row["knowledge_point_id"]: row for row in rows}


def earliest_upcoming_review(
    progress: dict[int, dict], kp_ids: list[int], now: datetime
) -> datetime | None:
    """Soonest future review among these knowledge points, or None.

    Skips dates that are already due: those should already be tasks.
    """
    earliest = None
    for kp_id in kp_ids:
        row = progress.get(kp_id)
        if row is None:
            continue
        due_at = parse_ts(row.get("next_review_at"))
        if due_at is None or due_at <= now:
            continue
        if earliest is None or due_at < earliest:
            earliest = due_at
    return earliest


def save_progress(row: dict) -> None:
    payload = {
        key: row[key]
        for key in (
            "user_id",
            "knowledge_point_id",
            "consecutive_correct",
            "status",
            "next_review_at",
            "srs_interval_days",
            "mastery",
            "stability",
            "success_count",
            "fail_count",
            "implicit_credit",
            "learning_rate",
            "last_practiced_at",
        )
    }
    db.table("user_progress").upsert(
        payload, on_conflict="user_id,knowledge_point_id"
    ).execute()
