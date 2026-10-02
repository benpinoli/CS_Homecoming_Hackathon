"""Checks that output models stay compatible with Claude structured outputs."""
from app.schemas.tailoring import JobAnalysis, TailoredResume


def _walk_objects(schema: dict):
    if schema.get("type") == "object":
        yield schema
    for value in schema.values():
        if isinstance(value, dict):
            yield from _walk_objects(value)
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    yield from _walk_objects(item)


def test_output_schemas_are_strict():
    for model in (JobAnalysis, TailoredResume):
        for obj in _walk_objects(model.model_json_schema()):
            assert obj.get("additionalProperties") is False, model.__name__
            assert set(obj.get("required", [])) == set(obj["properties"]), model.__name__
