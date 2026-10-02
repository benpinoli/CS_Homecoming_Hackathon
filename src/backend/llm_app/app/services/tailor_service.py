"""Two-step pipeline: analyze the job posting, then tailor the profile to it."""
import json

from app.config import get_settings
from app.schemas.job import JobPosting
from app.schemas.tailoring import JobAnalysis, TailoredResume, TailorResponse
from app.services.llm_client import generate_structured
from app.services.prompt_loader import load_prompt


def _to_json(data) -> str:
    return json.dumps(data, indent=2, ensure_ascii=False)


def analyze_job(job: JobPosting) -> JobAnalysis:
    user_content = f"<job_posting>\n{_to_json(job.model_dump(exclude_none=True))}\n</job_posting>"
    return generate_structured(load_prompt("job_analysis_system"), user_content, JobAnalysis)


def tailor_resume(profile: dict, job: JobPosting, instructions: str | None = None) -> TailorResponse:
    analysis = analyze_job(job)

    parts = [
        f"<candidate_profile>\n{_to_json(profile)}\n</candidate_profile>",
        f"<job_analysis>\n{analysis.model_dump_json(indent=2)}\n</job_analysis>",
        f"<job_posting>\n{_to_json(job.model_dump(exclude_none=True))}\n</job_posting>",
    ]
    if instructions:
        parts.append(f"<user_instructions>\n{instructions}\n</user_instructions>")

    resume = generate_structured(load_prompt("tailor_system"), "\n\n".join(parts), TailoredResume)
    return TailorResponse(job_analysis=analysis, resume=resume, model=get_settings().anthropic_model)
