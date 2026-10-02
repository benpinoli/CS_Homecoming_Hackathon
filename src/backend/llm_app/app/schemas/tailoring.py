"""Request/response models for resume tailoring.

The output models are sent to Claude as a JSON schema (structured outputs), so
they follow its rules: every object forbids extra keys, every field is
required (use `| None` for "may be empty"), and no numeric/length constraints.
"""
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.job import JobPosting


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---------- LLM output: job analysis ----------

class JobRequirement(_Strict):
    text: str
    category: Literal["hard_skill", "soft_skill", "experience", "education", "certification", "other"]
    importance: Literal["required", "preferred", "nice_to_have"]


class JobAnalysis(_Strict):
    role_title: str
    company: str | None
    seniority: str | None
    requirements: list[JobRequirement]
    keywords: list[str]
    summary: str


# ---------- LLM output: tailored resume ----------

class TailoredBullet(_Strict):
    text: str
    # Profile fact IDs that support this bullet; empty means unsupported.
    source_fact_ids: list[str]


class TailoredEntry(_Strict):
    source_entity_id: str
    section: Literal["experience", "project", "education", "leadership", "volunteering", "other"]
    title: str
    organization: str | None
    dates: str | None
    bullets: list[TailoredBullet]


class KeywordCoverage(_Strict):
    matched: list[str]
    missing: list[str]


class TailoredResume(_Strict):
    headline: str | None
    summary: str
    skills: list[str]
    entries: list[TailoredEntry]
    keyword_coverage: KeywordCoverage
    # Why entries were chosen, reordered or omitted; gaps the user could fill.
    change_notes: list[str]


# ---------- API request/response ----------

class AnalyzeJobRequest(BaseModel):
    job: JobPosting


class TailorRequest(BaseModel):
    # Evidence-backed profile from resume_json_builder (profile.schema.json).
    profile: dict[str, Any]
    job: JobPosting
    # Optional extra guidance from the user, e.g. "keep it to one page".
    instructions: str | None = None


class TailorResponse(BaseModel):
    job_analysis: JobAnalysis
    resume: TailoredResume
    model: str
