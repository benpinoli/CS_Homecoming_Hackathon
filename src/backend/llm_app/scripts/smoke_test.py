"""End-to-end check against the real Claude API (costs a little per run).

Usage, from src/backend/llm_app:
    python scripts/smoke_test.py PROFILE_JSON [JOB_JSON]

JOB_JSON defaults to data/jobs/sample_job.json. The result is saved to
data/output/ and every bullet is checked against the profile's fact ids.
"""
import json
import sys
from datetime import datetime
from pathlib import Path

LLM_APP_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(LLM_APP_DIR))

from app.schemas.job import JobPosting  # noqa: E402
from app.services.tailor_service import tailor_resume  # noqa: E402
from app.services.validation import collect_fact_ids, find_unsupported_bullets  # noqa: E402


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    profile = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    job_path = Path(sys.argv[2]) if len(sys.argv) > 2 else LLM_APP_DIR / "data/jobs/sample_job.json"
    job = JobPosting.model_validate_json(job_path.read_text(encoding="utf-8"))

    print(f"Profile has {len(collect_fact_ids(profile))} facts. Calling Claude...")
    result = tailor_resume(profile, job)

    out = LLM_APP_DIR / "data/output" / f"tailored_{datetime.now():%Y%m%d_%H%M%S}.json"
    out.write_text(result.model_dump_json(indent=2), encoding="utf-8")

    resume = result.resume
    print(f"\nModel: {result.model}")
    print(f"Entries: {len(resume.entries)}, bullets: {sum(len(e.bullets) for e in resume.entries)}")
    print(f"Keywords matched: {resume.keyword_coverage.matched}")
    print(f"Keywords missing: {resume.keyword_coverage.missing}")
    print(f"Saved to {out}")

    problems = find_unsupported_bullets(resume, profile)
    if problems:
        print(f"\nFAIL: {len(problems)} unsupported bullet(s):")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("\nPASS: every bullet cites facts that exist in the profile.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
