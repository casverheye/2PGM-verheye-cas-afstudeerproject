import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
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
        .limit(1)
        .execute()
    )
    if not problem_rows.data:
        raise HTTPException(status_code=404, detail="No practice problem")

    return problem_rows.data[0]
