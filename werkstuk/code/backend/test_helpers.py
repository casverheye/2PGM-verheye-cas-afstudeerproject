"""Shared helpers for the runnable test scripts.

test_learning.py only uses check/passed_count (pure math, no database).
The live scripts (test_flow.py, test_admin.py) also use api/raw against a
running uvicorn and wipe_user against the real Supabase project.
"""

import httpx

API = "http://127.0.0.1:8000"

_checks_passed = 0


def check(condition: bool, label: str, detail=""):
    global _checks_passed
    if condition:
        _checks_passed += 1
        print(f"  PASS  {label}")
    else:
        raise AssertionError(f"FAIL  {label}  {detail}")


def passed_count() -> int:
    return _checks_passed


def raw(token: str, method: str, path: str, json=None) -> httpx.Response:
    return httpx.request(
        method,
        f"{API}{path}",
        json=json,
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )


def api(token: str, method: str, path: str, json=None):
    response = raw(token, method, path, json)
    if response.status_code >= 400:
        raise RuntimeError(f"{method} {path} -> {response.status_code}: {response.text}")
    return response.json()


def wipe_user(email: str) -> None:
    """Delete a test user and every row it owns, children first."""
    from db import db  # local import: keeps test_learning runnable without .env

    users = db.auth.admin.list_users()
    for user in users:
        if user.email == email:
            db.table("answer_history").delete().eq("user_id", user.id).execute()
            db.table("user_progress").delete().eq("user_id", user.id).execute()
            quiz_rows = (
                db.table("quizzes").select("id").eq("user_id", user.id).execute().data
            )
            for quiz in quiz_rows:
                db.table("quiz_questions").delete().eq("quiz_id", quiz["id"]).execute()
            db.table("quizzes").delete().eq("user_id", user.id).execute()
            db.table("diagnostic_sessions").delete().eq("user_id", user.id).execute()
            db.table("user_settings").delete().eq("user_id", user.id).execute()
            db.auth.admin.delete_user(user.id)
