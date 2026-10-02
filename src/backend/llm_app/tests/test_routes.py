"""Endpoint tests with the LLM mocked out (free, offline)."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.tailoring import (
    JobAnalysis,
    JobRequirement,
    KeywordCoverage,
    TailoredBullet,
    TailoredEntry,
    TailoredResume,
)
from app.services import tailor_service
from app.services.llm_client import LLMError

FAKE_ANALYSIS = JobAnalysis(
    role_title="Data Engineering Intern",
    company="Example Corp",
    seniority="intern",
    requirements=[JobRequirement(text="Python", category="hard_skill", importance="required")],
    keywords=["Python", "SQL"],
    summary="Builds data pipelines.",
)

FAKE_RESUME = TailoredResume(
    headline=None,
    summary="Student engineer with Python and SQL automation experience.",
    skills=["Python", "SQL"],
    entries=[
        TailoredEntry(
            source_entity_id="work_1",
            section="experience",
            title="Software Engineering Intern",
            organization="Example Logistics",
            dates="Jun 2026 - Aug 2026",
            bullets=[TailoredBullet(text="Automated shipment reports in Python and SQL.", source_fact_ids=["fact_1"])],
        )
    ],
    keyword_coverage=KeywordCoverage(matched=["Python", "SQL"], missing=[]),
    change_notes=[],
)

JOB = {"title": "Data Engineering Intern", "company": "Example Corp", "description": "Python and SQL."}


@pytest.fixture
def client(monkeypatch):
    def fake_generate(system, user_content, output_model):
        assert "<job_posting>" in user_content
        return FAKE_ANALYSIS if output_model is JobAnalysis else FAKE_RESUME

    monkeypatch.setattr(tailor_service, "generate_structured", fake_generate)
    return TestClient(app)


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_analyze_job(client):
    res = client.post("/api/analyze-job", json={"job": JOB})
    assert res.status_code == 200
    assert res.json()["keywords"] == ["Python", "SQL"]


def test_tailor(client):
    res = client.post("/api/tailor", json={"profile": {"profile_id": "p1"}, "job": JOB})
    assert res.status_code == 200
    body = res.json()
    assert body["resume"]["entries"][0]["bullets"][0]["source_fact_ids"] == ["fact_1"]
    assert body["job_analysis"]["role_title"] == "Data Engineering Intern"


def test_tailor_rejects_missing_profile(client):
    assert client.post("/api/tailor", json={"job": JOB}).status_code == 422


def test_llm_error_becomes_502(monkeypatch):
    def refuse(*args):
        raise LLMError("The model declined this request.")

    monkeypatch.setattr(tailor_service, "generate_structured", refuse)
    res = TestClient(app).post("/api/analyze-job", json={"job": JOB})
    assert res.status_code == 502
