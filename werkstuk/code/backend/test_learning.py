"""Unit tests for the student-model math in learning.py.

Pure in-memory tests (no database, no server):
    python test_learning.py
"""

from datetime import timedelta

from learning import (
    MASTERY_THRESHOLD,
    MIN_STABILITY,
    apply_evidence,
    compute_learning_rate,
    decayed_mastery,
    new_progress_row,
    now_utc,
)
from test_helpers import check, passed_count


def row_with(mastery: float, stability: float, days_ago: float, now, **extra) -> dict:
    row = new_progress_row("user", 1)
    row.update(
        {
            "mastery": mastery,
            "stability": stability,
            "last_practiced_at": (now - timedelta(days=days_ago)).isoformat(),
        }
    )
    row.update(extra)
    return row


def main():
    now = now_utc()

    print("== forgetting curve ==")
    fresh = row_with(0.8, 2.0, 0.0, now)
    check(abs(decayed_mastery(fresh, now) - 0.8) < 1e-6, "no decay at practice time")

    # half-life = 2 * stability, so after 4 days with stability 2 -> half
    aged = row_with(0.8, 2.0, 4.0, now)
    check(
        abs(decayed_mastery(aged, now) - 0.4) < 1e-6,
        "mastery halves after one half-life",
        decayed_mastery(aged, now),
    )
    never = new_progress_row("user", 1)
    check(decayed_mastery(never, now) == 0.0, "unpracticed KP has zero mastery")

    print("== correct answers ==")
    row = new_progress_row("user", 1)
    apply_evidence(row, True, 1.0, now)
    check(0.3 < row["mastery"] < 0.5, "first correct answer builds mastery", row["mastery"])
    check(row["success_count"] == 1 and row["consecutive_correct"] == 1, "counters updated")
    check(row["status"] == "in_progress", "one answer is not mastery")

    for _ in range(4):
        apply_evidence(row, True, 1.0, now)
    check(row["mastery"] >= MASTERY_THRESHOLD, "repeated success reaches mastery")
    check(row["status"] == "completed", "mastered KP marked completed")
    check(row["next_review_at"] is not None, "review scheduled once mastered")

    print("== spacing effect ==")
    crammed = row_with(0.6, 4.0, 0.0, now)
    spaced = row_with(0.6, 4.0, 4.0, now)
    apply_evidence(crammed, True, 1.0, now)
    apply_evidence(spaced, True, 1.0, now)
    check(
        spaced["stability"] > crammed["stability"],
        "spaced repetition grows stability more than cramming",
        (spaced["stability"], crammed["stability"]),
    )

    print("== wrong answers ==")
    row = row_with(0.9, 10.0, 0.0, now, status="completed", consecutive_correct=3)
    apply_evidence(row, False, 1.0, now)
    check(row["mastery"] < 0.5, "failure halves effective mastery", row["mastery"])
    check(row["stability"] < 10.0, "failure shrinks stability")
    check(row["consecutive_correct"] == 0, "failure resets the streak")
    check(row["status"] == "in_progress", "failed KP reopens for practice")

    weak = row_with(0.1, MIN_STABILITY, 0.0, now)
    for _ in range(10):
        apply_evidence(weak, False, 1.0, now)
    check(weak["stability"] >= MIN_STABILITY, "stability never drops below the floor")
    check(weak["mastery"] >= 0.0, "mastery never goes negative")

    print("== mixed answers never reach mastery ==")
    mixed = new_progress_row("user", 1)
    for index in range(20):
        apply_evidence(mixed, index % 2 == 0, 1.0, now)
    check(
        mixed["mastery"] < MASTERY_THRESHOLD,
        "alternating right/wrong never reaches 80% mastery",
        mixed["mastery"],
    )
    check(mixed["status"] == "in_progress", "mixed practice stays in progress")
    check(mixed["consecutive_correct"] <= 1, "a wrong answer resets the streak")

    print("== implicit (fractional) repetition ==")
    in_progress = row_with(0.75, 2.0, 0.0, now, status="in_progress")
    for _ in range(10):
        apply_evidence(in_progress, True, 0.6, now, explicit=False)
    check(
        in_progress["mastery"] < MASTERY_THRESHOLD,
        "implicit practice alone cannot complete a KP",
        in_progress["mastery"],
    )
    check(in_progress["status"] == "in_progress", "status unchanged by implicit credit")
    check(in_progress["success_count"] == 0, "implicit credit does not count as an attempt")
    check(in_progress["implicit_credit"] > 0, "implicit credit is tracked")

    mastered = row_with(0.85, 5.0, 3.0, now, status="completed")
    old_review = mastered["next_review_at"]
    apply_evidence(mastered, True, 0.6, now, explicit=False)
    check(mastered["status"] == "completed", "implicit credit keeps mastered KP completed")
    check(
        mastered["next_review_at"] is not None and mastered["next_review_at"] != old_review,
        "implicit credit pushes the next review outward (compression)",
    )

    print("== learning rate ==")
    check(compute_learning_rate(0, 0) == 1.0, "neutral start")
    check(compute_learning_rate(10, 0) > 1.0, "strong students speed up")
    check(compute_learning_rate(0, 10) < 1.0, "struggling students slow down")
    check(0.5 <= compute_learning_rate(0, 100) <= 1.5, "rate stays inside bounds")
    check(0.5 <= compute_learning_rate(100, 0) <= 1.5, "rate stays inside bounds (high)")

    print(f"\nALL {passed_count()} CHECKS PASSED")


if __name__ == "__main__":
    main()
