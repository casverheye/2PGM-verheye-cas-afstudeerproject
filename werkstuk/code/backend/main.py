import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import create_client

load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")
if not supabase_url or not supabase_anon_key:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_ANON_KEY in backend .env")

supabase = create_client(supabase_url, supabase_anon_key)

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
