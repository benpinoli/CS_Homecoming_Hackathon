"""Job posting data as produced by the web scraper.

Accepts web_scraper/scraper.py output as-is ({url, title, company, location,
job_description, source}). Anything else a caller sends is kept (extra="allow")
and passed through to the LLM.
"""
from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class JobPosting(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str | None = None
    source_url: str | None = Field(None, validation_alias=AliasChoices("source_url", "url"))
    title: str | None = None
    company: str | None = None
    location: str | None = None
    description: str | None = Field(None, validation_alias=AliasChoices("description", "job_description"))
    requirements: list[str] | None = None
    preferred_qualifications: list[str] | None = None
