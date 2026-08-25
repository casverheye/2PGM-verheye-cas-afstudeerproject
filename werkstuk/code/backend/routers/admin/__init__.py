"""Catalog backoffice. Admin is app_metadata.role == admin, set only in the DB.

Student routes stay read-only for catalog. These writes go through FastAPI
so correct_choice never uses the Vite anon key. There is no endpoint that
promotes a user to admin.

One module per resource (courses, topics, knowledge points, problems, edges).
Shared checks live in guards.py, request bodies in models.py. All URLs are
identical to the old single-file router.
"""

from fastapi import APIRouter

from . import courses, edges, knowledge_points, problems, topics

router = APIRouter(prefix="/admin", tags=["admin"])

router.include_router(courses.router)
router.include_router(topics.router)
router.include_router(knowledge_points.router)
router.include_router(problems.router)
router.include_router(edges.router)
