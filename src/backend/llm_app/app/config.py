# load env vars
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

LLM_APP_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = LLM_APP_DIR / "llm_provider.env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    anthropic_api_key: str
    anthropic_model: str = "claude-opus-5-5"
    # low | medium | high | xhigh | max
    anthropic_effort: str = "low" # i changed this to low and max tokens lower, maybe change later
    anthropic_max_tokens: int = 10000
    # Re-runs a safety-declined request on a fallback model server-side.
    enable_refusal_fallback: bool = True

    # Comma-separated origins allowed to call the API (Vite dev server by default).
    cors_origins: str = "http://localhost:5173"

    data_dir: Path = LLM_APP_DIR / "data"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
