"""Placement diagnostic session math, shared by the diagnostics router and
the task selector.

A session's state is a plain dict stored on `diagnostic_sessions.state`.
These helpers only do arithmetic on that dict; reading and writing the row
stays in the diagnostics router. This module must not import from routers/
so the selector can use it without a circular import.
"""

QUESTIONS_PER_TOPIC = 3
PROBE_PASS_MIN = 2  # a topic probe passes with at least 2 of 3 correct


def _question_total(state: dict) -> int:
    return max(len(state.get("order") or []), 1) * QUESTIONS_PER_TOPIC


def session_answered_count(state: dict) -> int:
    return (state.get("probes") or 0) * QUESTIONS_PER_TOPIC + (
        state.get("question_index") or 0
    )


def session_progress_pct(state: dict) -> int:
    """How far an unfinished diagnostic has gone, 0-99 until it completes."""
    total = _question_total(state)
    if total <= 0:
        return 0
    return min(99, round(100 * session_answered_count(state) / total))
