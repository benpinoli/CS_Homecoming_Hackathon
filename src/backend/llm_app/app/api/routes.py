from fastapi import APIRouter, HTTPException

from app.schemas.tailoring import AnalyzeJobRequest, JobAnalysis, TailorRequest, TailorResponse
from app.services import tailor_service
from app.services.llm_client import LLMError

router = APIRouter(prefix="/api")


@router.get("/health")
def health():
    return {"status": "ok"}


@router.post("/analyze-job", response_model=JobAnalysis)
def analyze_job(req: AnalyzeJobRequest):
    try:
        return tailor_service.analyze_job(req.job)
    except LLMError as e:
        raise HTTPException(502, str(e))


@router.post("/tailor", response_model=TailorResponse)
def tailor(req: TailorRequest):
    try:
        return tailor_service.tailor_resume(req.profile, req.job, req.instructions)
    except LLMError as e:
        raise HTTPException(502, str(e))
