from app.schemas.tailoring import KeywordCoverage, TailoredBullet, TailoredEntry, TailoredResume
from app.services.validation import collect_fact_ids, find_unsupported_bullets

PROFILE = {
    "work": [
        {
            "id": "work_1",
            "facts": [
                {"id": "fact_1", "key": "tools_used", "value": ["Python"], "assertion_status": "confirmed"},
                {"id": "fact_2", "key": "role", "value": "Intern", "assertion_status": "extracted"},
            ],
        }
    ]
}


def _resume(*bullets):
    entry = TailoredEntry(
        source_entity_id="work_1", section="experience", title="Intern",
        organization=None, dates=None, bullets=list(bullets),
    )
    return TailoredResume(
        headline=None, summary="", skills=[], entries=[entry],
        keyword_coverage=KeywordCoverage(matched=[], missing=[]), change_notes=[],
    )


def test_collect_fact_ids_ignores_entities():
    assert collect_fact_ids(PROFILE) == {"fact_1", "fact_2"}


def test_supported_bullet_passes():
    resume = _resume(TailoredBullet(text="Used Python.", source_fact_ids=["fact_1"]))
    assert find_unsupported_bullets(resume, PROFILE) == []


def test_flags_uncited_and_unknown_facts():
    resume = _resume(
        TailoredBullet(text="Led a team of 10.", source_fact_ids=[]),
        TailoredBullet(text="Cut costs 40%.", source_fact_ids=["fact_999"]),
    )
    assert len(find_unsupported_bullets(resume, PROFILE)) == 2
