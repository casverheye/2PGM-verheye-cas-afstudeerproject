"""Request bodies for the admin routes."""

from pydantic import BaseModel, Field


class CourseIn(BaseModel):
    id: str
    title: str
    description: str | None = None
    sort_order: int = 1
    listed: bool = False


class CoursePatch(BaseModel):
    title: str | None = None
    description: str | None = None
    sort_order: int | None = None
    listed: bool | None = None


class TopicIn(BaseModel):
    id: str
    title: str
    intro: str = ""


class TopicPatch(BaseModel):
    title: str | None = None
    intro: str | None = None


class KpIn(BaseModel):
    title: str
    sort_order: int = 1


class KpPatch(BaseModel):
    title: str | None = None
    sort_order: int | None = None


class ProblemIn(BaseModel):
    knowledge_point_id: int
    prompt: str
    choice_a: str
    choice_b: str
    choice_c: str
    choice_d: str
    choice_e: str
    correct_choice: str
    role: str
    sort_order: int = 1
    explanation: str | None = None
    difficulty: float = 1.0


class ProblemPatch(BaseModel):
    prompt: str | None = None
    choice_a: str | None = None
    choice_b: str | None = None
    choice_c: str | None = None
    choice_d: str | None = None
    choice_e: str | None = None
    correct_choice: str | None = None
    role: str | None = None
    sort_order: int | None = None
    explanation: str | None = None
    difficulty: float | None = None


class EdgeIn(BaseModel):
    from_topic_id: str
    to_topic_id: str
    kind: str
    weight: float | None = Field(default=None)
