"""App assembly: middleware, health/auth endpoints, and the domain routers.

Module layout:
- learning.py       student model math + progress persistence
- graph.py          knowledge graph (courses, topics, KPs) + per-user snapshots
- selector.py       adaptive task selection (the "what next?" engine)
- user_settings.py  per-user active course
- problems.py       problem data access shared across routers
- routers/          one endpoint module per domain
"""

import os

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from auth import get_current_user, is_admin
from routers import admin, answers, courses, diagnostics, lessons, quizzes, tasks

app = FastAPI(title="Mathlete API")


def frontend_origins() -> list[str]:
    raw = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
    return [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(courses.router)
app.include_router(tasks.router)
app.include_router(lessons.router)
app.include_router(answers.router)
app.include_router(quizzes.router)
app.include_router(diagnostics.router)
app.include_router(admin.router)


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/me")
def me(user=Depends(get_current_user)):
    return {"id": user.id, "email": user.email, "admin": is_admin(user)}
