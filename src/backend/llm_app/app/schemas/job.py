"""Job posting data as produced by the web scraper.

The scraper's exact output format isn't fixed yet, so only a few fields are
named; anything else the scraper emits is kept (extra="allow") and passed
through to the LLM.
"""
from pydantic import BaseModel, ConfigDict


class JobPosting(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str | None = None
    source_url: str | None = None
    title: str | None = None
    company: str | None = None
    location: str | None = None
    description: str | None = None
    requirements: list[str] | None = None
    preferred_qualifications: list[str] | None = None
