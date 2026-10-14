"""OpenAPI contract guard (Phase 3.5, item 3.5.0 / decision D23).

Freezes the public API contract: every operation present in the committed
baseline (``tests/contract/openapi_baseline.json``) must still exist with an
identical NORMALISED definition. New operations are allowed; changing,
renaming or removing an existing one fails.

Normalisation inlines every ``$ref`` and drops ``title``, ``operationId``,
``summary``, ``description`` and ``tags`` everywhere, so renaming Python
symbols or docstrings does not fail the test, while any change to parameters,
request body, response schema or response status codes does.

To intentionally regenerate the baseline (requires approval):

    docker compose exec back python -m scripts.update_openapi_baseline
"""

import json
from pathlib import Path

from app.main import app

_BASELINE_PATH = (
    Path(__file__).resolve().parent / "contract" / "openapi_baseline.json"
)

_DROP_KEYS = {"title", "operationId", "summary", "description", "tags"}
_HTTP_METHODS = {"get", "put", "post", "delete", "options", "head", "patch", "trace"}


def _resolve_ref(root: dict, ref: str):
    node = root
    for part in ref.lstrip("#/").split("/"):
        node = node[part]
    return node


def _normalise(node, root: dict):
    if isinstance(node, dict):
        if "$ref" in node:
            return _normalise(_resolve_ref(root, node["$ref"]), root)
        return {
            key: _normalise(value, root)
            for key, value in node.items()
            if key not in _DROP_KEYS
        }
    if isinstance(node, list):
        return [_normalise(item, root) for item in node]
    return node


def _operations(spec: dict) -> dict:
    operations: dict = {}
    for path, item in spec.get("paths", {}).items():
        shared_params = item.get("parameters", [])
        for method, operation in item.items():
            if method.lower() not in _HTTP_METHODS:
                continue
            merged = dict(operation)
            merged["parameters"] = shared_params + operation.get("parameters", [])
            operations[(method.upper(), path)] = _normalise(merged, spec)
    return operations


def test_openapi_contract_is_frozen():
    baseline = json.loads(_BASELINE_PATH.read_text(encoding="utf-8"))
    current = app.openapi()

    baseline_ops = _operations(baseline)
    current_ops = _operations(current)

    changed = []
    for key, expected in baseline_ops.items():
        actual = current_ops.get(key)
        if actual is None:
            changed.append(f"{key[0]} {key[1]}: missing")
        elif json.dumps(actual, sort_keys=True, ensure_ascii=False) != json.dumps(
            expected, sort_keys=True, ensure_ascii=False
        ):
            changed.append(f"{key[0]} {key[1]}: changed")

    assert not changed, (
        "The public API contract changed for these operations:\n  "
        + "\n  ".join(sorted(changed))
        + "\n\nAn existing operation may not change without approval. If the "
        "change is intentional, regenerate the baseline with:\n"
        "    docker compose exec back python -m "
        "scripts.update_openapi_baseline\n"
        "and commit tests/contract/openapi_baseline.json."
    )
