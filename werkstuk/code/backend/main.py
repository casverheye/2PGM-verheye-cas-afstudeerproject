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

SRS_INTERVAL_DAYS = [1, 3, 7, 16, 35]


def next_srs_interval_days(previous_days: int | None) -> int:
    if previous_days is None:
        return SRS_INTERVAL_DAYS[0]
    for index, days in enumerate(SRS_INTERVAL_DAYS):
        if previous_days <= days:
            if index + 1 < len(SRS_INTERVAL_DAYS):
                return SRS_INTERVAL_DAYS[index + 1]
            return SRS_INTERVAL_DAYS[-1]
    return SRS_INTERVAL_DAYS[-1]


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
        .select("id, topic_id, title, sort_order")
        .order("sort_order")
        .execute()
    )
    if not kp_rows.data:
        raise HTTPException(status_code=404, detail="No knowledge points")

    kp_by_topic = {}
    for row in kp_rows.data:
        if row["topic_id"] not in kp_by_topic:
            kp_by_topic[row["topic_id"]] = row

    kp_ids = [row["id"] for row in kp_by_topic.values()]
    progress_rows = (
        db.table("user_progress")
        .select("knowledge_point_id, status, next_review_at")
        .eq("user_id", user.id)
        .in_("knowledge_point_id", kp_ids)
        .execute()
    )
    progress_by_kp = {row["knowledge_point_id"]: row for row in progress_rows.data}

    edge_rows = (
        db.table("topic_edges")
        .select("from_topic_id, to_topic_id, kind")
        .eq("kind", "prerequisite")
        .execute()
    )
    prereqs_for: dict[str, list[str]] = {}
    for edge in edge_rows.data:
        prereqs_for.setdefault(edge["to_topic_id"], []).append(edge["from_topic_id"])

    def topic_is_completed(topic_id: str) -> bool:
        kp = kp_by_topic.get(topic_id)
        if kp is None:
            return False
        progress = progress_by_kp.get(kp["id"])
        return bool(progress and progress["status"] == "completed")

    items = []
    for topic_id, kp in kp_by_topic.items():
        unlocked = all(
            topic_is_completed(prereq_id)
            for prereq_id in prereqs_for.get(topic_id, [])
        )
        progress = progress_by_kp.get(kp["id"])
        completed = bool(progress and progress["status"] == "completed")
        if completed:
            kind = "review"
            can_start = review_is_due(progress["next_review_at"])
        else:
            kind = "lesson"
            can_start = unlocked
        items.append(
            {
                "topic_id": topic_id,
                "title": kp["title"],
                "kind": kind,
                "can_start": can_start,
            }
        )

    return {"items": items}


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

    edge_rows = (
        db.table("topic_edges")
        .select("from_topic_id")
        .eq("to_topic_id", topic_id)
        .eq("kind", "prerequisite")
        .execute()
    )
    for edge in edge_rows.data:
        prereq_kp_rows = (
            db.table("knowledge_points")
            .select("id")
            .eq("topic_id", edge["from_topic_id"])
            .order("sort_order")
            .limit(1)
            .execute()
        )
        if not prereq_kp_rows.data:
            raise HTTPException(
                status_code=403,
                detail="Prerequisites are not met",
            )
        prereq_progress = (
            db.table("user_progress")
            .select("status")
            .eq("user_id", user.id)
            .eq("knowledge_point_id", prereq_kp_rows.data[0]["id"])
            .limit(1)
            .execute()
        )
        if (
            not prereq_progress.data
            or prereq_progress.data[0]["status"] != "completed"
        ):
            raise HTTPException(
                status_code=403,
                detail="Prerequisites are not met",
            )

    progress_rows = (
        db.table("user_progress")
        .select("status, next_review_at")
        .eq("user_id", user.id)
        .eq("knowledge_point_id", kp_id)
        .limit(1)
        .execute()
    )
    if progress_rows.data and progress_rows.data[0]["status"] == "completed":
        if not review_is_due(progress_rows.data[0]["next_review_at"]):
            raise HTTPException(
                status_code=403,
                detail="Review is not due yet",
            )

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
        .select("consecutive_correct, status, next_review_at, srs_interval_days")
        .eq("user_id", user.id)
        .eq("knowledge_point_id", kp_id)
        .limit(1)
        .execute()
    )
    old_streak = 0
    old_status = None
    old_next_review_at = None
    old_interval_days = None
    if progress_rows.data:
        old_streak = progress_rows.data[0]["consecutive_correct"]
        old_status = progress_rows.data[0]["status"]
        old_next_review_at = progress_rows.data[0]["next_review_at"]
        old_interval_days = progress_rows.data[0]["srs_interval_days"]

    if is_correct:
        new_streak = old_streak + 1
    else:
        new_streak = 0

    next_review_at = old_next_review_at
    interval_days = old_interval_days
    if new_streak >= 2:
        status = "completed"
        first_pass = old_status != "completed" or old_next_review_at is None
        if first_pass:
            interval_days = SRS_INTERVAL_DAYS[0]
            next_review_at = (
                datetime.now(timezone.utc) + timedelta(days=interval_days)
            ).isoformat()
        elif review_is_due(old_next_review_at):
            base_days = old_interval_days if old_interval_days is not None else 1
            interval_days = next_srs_interval_days(base_days)
            next_review_at = (
                datetime.now(timezone.utc) + timedelta(days=interval_days)
            ).isoformat()
    else:
        status = "in_progress"

    progress = {
        "user_id": user.id,
        "knowledge_point_id": kp_id,
        "consecutive_correct": new_streak,
        "status": status,
        "next_review_at": next_review_at,
        "srs_interval_days": interval_days,
    }
    if progress_rows.data:
        db.table("user_progress").update(
            {
                "consecutive_correct": new_streak,
                "status": status,
                "next_review_at": next_review_at,
                "srs_interval_days": interval_days,
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
        "srs_interval_days": interval_days,
    }
