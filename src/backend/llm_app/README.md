# llm_app

FastAPI service that tailors a candidate's resume to a specific job using Claude.

Inputs:
- A candidate profile (the evidence-backed experience bank from `resume_json_builder`).
- A scraped job posting (from `web_scraper`).

Output: a tailored resume as JSON, where each bullet cites the profile fact IDs that back it, plus keyword coverage and notes on what changed.

## Layout

```
llm_app/
├── app/
│   ├── main.py              FastAPI app + CORS
│   ├── config.py            Settings loaded from llm_provider.env
│   ├── api/routes.py        HTTP endpoints
│   ├── schemas/             Pydantic models (job posting, LLM outputs, requests)
│   ├── services/
│   │   ├── llm_client.py    Anthropic SDK wrapper → validated Pydantic objects
│   │   ├── tailor_service.py  analyze job → tailor resume pipeline
│   │   └── prompt_loader.py
│   └── prompts/             System prompts as .md files
├── data/
│   ├── profiles/            Sample candidate profile JSON
│   ├── jobs/                Sample scraped job JSON
│   └── output/              Generated resumes (git-ignored)
├── tests/
├── requirements.txt
└── llm_provider.env.example
```

## Setup

```powershell
cd src/backend/llm_app
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy llm_provider.env.example llm_provider.env   # then add your API key
uvicorn app.main:app --reload --port 8000
```

Interactive docs: http://localhost:8000/docs

## Endpoints

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/health` | – | `{"status": "ok"}` |
| POST | `/api/analyze-job` | `{"job": {...}}` | Requirements, keywords, summary |
| POST | `/api/tailor` | `{"profile": {...}, "job": {...}, "instructions": "optional"}` | `{job_analysis, resume, model}` |

## Testing

1. **Unit tests (free, offline):** the LLM is mocked, so no API key or network is needed.
   ```powershell
   pytest
   ```
2. **Smoke test (real API call, costs a little):** tailors a real profile to a job, saves the result to `data/output/`, and fails if any bullet cites a fact ID that isn't in the profile.
   ```powershell
   python scripts/smoke_test.py ..\resume_json_builder\resume_bank_kit\example_profile.json
   python scripts/smoke_test.py <profile.json> <job.json>   # your own data
   ```
3. **Manually through the API:** run `uvicorn app.main:app --reload --port 8000`, open http://localhost:8000/docs, and use "Try it out" on `/api/tailor`.
