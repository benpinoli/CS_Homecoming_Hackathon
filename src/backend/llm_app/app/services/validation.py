"""Post-checks on LLM output that don't need the model."""
from app.schemas.tailoring import TailoredResume


def collect_fact_ids(node) -> set[str]:
    """Find every fact id in a profile (dicts that have both `id` and `assertion_status`)."""
    ids: set[str] = set()
    if isinstance(node, dict):
        if "id" in node and "assertion_status" in node:
            ids.add(node["id"])
        for value in node.values():
            ids |= collect_fact_ids(value)
    elif isinstance(node, list):
        for item in node:
            ids |= collect_fact_ids(item)
    return ids


def find_unsupported_bullets(resume: TailoredResume, profile: dict) -> list[str]:
    """Return bullets that cite no facts or cite fact ids missing from the profile."""
    known = collect_fact_ids(profile)
    problems = []
    for entry in resume.entries:
        for bullet in entry.bullets:
            missing = [fid for fid in bullet.source_fact_ids if fid not in known]
            if not bullet.source_fact_ids:
                problems.append(f"[{entry.title}] no sources: {bullet.text}")
            elif missing:
                problems.append(f"[{entry.title}] unknown fact ids {missing}: {bullet.text}")
    return problems
