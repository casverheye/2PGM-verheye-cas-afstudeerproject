import os
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from supabase import create_client

load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")
supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not supabase_url or not supabase_anon_key or not supabase_service_role_key:
    raise RuntimeError(
        "Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY in backend .env"
    )

supabase = create_client(supabase_url, supabase_anon_key)
db = create_client(supabase_url, supabase_service_role_key)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
):
    token = credentials.credentials
    try:
        result = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = result.user
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid token")

    return user


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/me")
def me(user=Depends(get_current_user)):
    return {"id": user.id, "email": user.email}


def review_is_due(next_review_at: str | None) -> bool:
    if next_review_at is None:
        return True
    text = str(next_review_at).replace("Z", "+00:00")
    due_at = datetime.fromisoformat(text)
    if due_at.tzinfo is None:
        due_at = due_at.replace(tzinfo=timezone.utc)
    return due_at <= datetime.now(timezone.utc)


@app.get("/learn-queue")
def learn_queue(user=Depends(get_current_user)):
    kp_rows = (
        db.table("knowledge_points")
        .select("id, topic_id, title")
        .eq("topic_id", "addition")
        .order("sort_order")
        .limit(1)
        .execute()
    )
    if not kp_rows.data:
        raise HTTPException(status_code=404, detail="No knowledge point for addition")

    kp = kp_rows.data[0]
    progress_rows = (
        db.table("user_progress")
        .select("status, next_review_at")
        .eq("user_id", user.id)
        .eq("knowledge_point_id", kp["id"])
        .limit(1)
        .execute()
    )

    kind = "lesson"
    can_start = True
    if progress_rows.data and progress_rows.data[0]["status"] == "completed":
        kind = "review"
        can_start = review_is_due(progress_rows.data[0]["next_review_at"])

    return {
        "items": [
            {
                "topic_id": kp["topic_id"],
                "title": kp["title"],
                "kind": kind,
                "can_start": can_start,
            }
        ]
    }


@app.get("/topics/{topic_id}/next-problem")
def next_problem(topic_id: str, user=Depends(get_current_user)):
    kp_rows = (
        db.table("knowledge_points")
        .select("id")
        .eq("topic_id", topic_id)
        .order("sort_order")
        .limit(1)
        .execute()
    )
    if not kp_rows.data:
        raise HTTPException(status_code=404, detail="No knowledge point for this topic")

    kp_id = kp_rows.data[0]["id"]

    problem_rows = (
        db.table("problems")
        .select("id, prompt, choice_a, choice_b, choice_c, choice_d, choice_e")
        .eq("knowledge_point_id", kp_id)
        .eq("role", "practice")
        .order("sort_order")
        .execute()
    )
    if not problem_rows.data:
        raise HTTPException(status_code=404, detail="No practice problem")

    problem_ids = [row["id"] for row in problem_rows.data]
    history_rows = (
        db.table("answer_history")
        .select("problem_id, created_at")
        .eq("user_id", user.id)
        .in_("problem_id", problem_ids)
        .order("created_at", desc=True)
        .execute()
    )
    answered_ids = {row["problem_id"] for row in history_rows.data}

    for row in problem_rows.data:
        if row["id"] not in answered_ids:
            return row

    latest_id = history_rows.data[0]["problem_id"]
    for row in problem_rows.data:
        if row["id"] != latest_id:
            return row

    return problem_rows.data[0]


class AnswerIn(BaseModel):
    problem_id: int
    chosen_choice: str


@app.post("/answers")
def submit_answer(body: AnswerIn, user=Depends(get_current_user)):
    if body.chosen_choice not in ("a", "b", "c", "d", "e"):
        raise HTTPException(status_code=400, detail="chosen_choice must be a, b, c, d, or e")

    problem_rows = (
        db.table("problems")
        .select("id, correct_choice, knowledge_point_id")
        .eq("id", body.problem_id)
        .limit(1)
        .execute()
    )
    if not problem_rows.data:
        raise HTTPException(status_code=404, detail="Problem not found")

    problem = problem_rows.data[0]
    correct_choice = problem["correct_choice"]
    kp_id = problem["knowledge_point_id"]
    is_correct = body.chosen_choice == correct_choice

    db.table("answer_history").insert(
        {
            "user_id": user.id,
            "problem_id": body.problem_id,
            "chosen_choice": body.chosen_choice,
            "is_correct": is_correct,
        }
    ).execute()

    progress_rows = (
        db.table("user_progress")
        .select("consecutive_correct, status, next_review_at")
        .eq("user_id", user.id)
        .eq("knowledge_point_id", kp_id)
        .limit(1)
        .execute()
    )
    old_streak = 0
    old_status = None
    old_next_review_at = None
    if progress_rows.data:
        old_streak = progress_rows.data[0]["consecutive_correct"]
        old_status = progress_rows.data[0]["status"]
        old_next_review_at = progress_rows.data[0]["next_review_at"]

    if is_correct:
        new_streak = old_streak + 1
    else:
        new_streak = 0

    next_review_at = old_next_review_at
    if new_streak >= 2:
        status = "completed"
        first_pass = old_status != "completed" or old_next_review_at is None
        if first_pass:
            next_review_at = (
                datetime.now(timezone.utc) + timedelta(days=1)
            ).isoformat()
    else:
        status = "in_progress"

    progress = {
        "user_id": user.id,
        "knowledge_point_id": kp_id,
        "consecutive_correct": new_streak,
        "status": status,
        "next_review_at": next_review_at,
    }
    if progress_rows.data:
        db.table("user_progress").update(
            {
                "consecutive_correct": new_streak,
                "status": status,
                "next_review_at": next_review_at,
            }
        ).eq("user_id", user.id).eq("knowledge_point_id", kp_id).execute()
    else:
        db.table("user_progress").insert(progress).execute()

    return {
        "is_correct": is_correct,
        "correct_choice": correct_choice,
        "consecutive_correct": new_streak,
        "status": status,
        "next_review_at": next_review_at,
    }
