"""llm_client behavior with a fake Anthropic client (free, offline)."""
from types import SimpleNamespace

import pytest

from app.schemas.tailoring import KeywordCoverage
from app.services import llm_client
from app.services.llm_client import LLMError, generate_structured


def _fake_client(stop_reason, text=None):
    content = [SimpleNamespace(type="text", text=text)] if text is not None else []
    response = SimpleNamespace(stop_reason=stop_reason, content=content)
    create = lambda **kwargs: response
    return SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(create=create)))


@pytest.fixture
def use_fake(monkeypatch):
    def install(stop_reason, text=None):
        monkeypatch.setattr(llm_client, "get_client", lambda: _fake_client(stop_reason, text))

    return install


def test_parses_valid_json(use_fake):
    use_fake("end_turn", '{"matched": ["Python"], "missing": []}')
    assert generate_structured("sys", "user", KeywordCoverage).matched == ["Python"]


@pytest.mark.parametrize("stop_reason", ["refusal", "max_tokens"])
def test_bad_stop_reasons_raise(use_fake, stop_reason):
    use_fake(stop_reason, "{}")
    with pytest.raises(LLMError):
        generate_structured("sys", "user", KeywordCoverage)


def test_no_text_raises(use_fake):
    use_fake("end_turn")
    with pytest.raises(LLMError):
        generate_structured("sys", "user", KeywordCoverage)
