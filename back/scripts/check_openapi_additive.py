"""Additive OpenAPI contract checker (Phase 3.5, item B6).

Verifies that the CURRENT application contract (``app.openapi()``) is a
strict, backwards-compatible SUPERSET of the committed baseline
(``tests/contract/openapi_baseline.json``).

It FAILS (exit code 1) when a change would break existing clients:

* an operation present in the baseline is missing now;
* a property of an existing request or response schema was removed;
* a property or parameter type changed;
* a new property/parameter became REQUIRED in an existing operation;
* a response status code or a parameter was removed;
* an ``enum`` value was removed.

It PASSES (and prints every addition) for purely additive changes:

* brand-new operations;
* new optional properties / parameters / response status codes;
* new ``enum`` values.

The normalisation mirrors ``tests/test_openapi_contract.py``.

Usage (inside the back container):

    docker compose exec back python -m scripts.check_openapi_additive
"""

import json
import sys
from pathlib import Path

from app.main import app

_BASELINE_PATH = (
    Path(__file__).resolve().parent.parent
    / "tests"
    / "contract"
    / "openapi_baseline.json"
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


def _diff_schema(base, cur, path, failures, additions):
    if isinstance(base, dict) and isinstance(cur, dict):
        btype = base.get("type")
        ctype = cur.get("type")
        if btype is not None and ctype is not None and btype != ctype:
            failures.append(f"{path}: type changed {btype} -> {ctype}")
            return
        if base.get("format") and cur.get("format") and base["format"] != cur["format"]:
            failures.append(f"{path}: format changed {base['format']} -> {cur['format']}")

        benum = base.get("enum")
        cenum = cur.get("enum")
        if isinstance(benum, list) and isinstance(cenum, list):
            for value in benum:
                if value not in cenum:
                    failures.append(f"{path}: enum value {value!r} removed")
            for value in cenum:
                if value not in benum:
                    additions.append(f"{path}: enum value {value!r} added")

        breq = base.get("required")
        creq = cur.get("required")
        if isinstance(breq, list) and isinstance(creq, list):
            for name in sorted(set(creq) - set(breq)):
                failures.append(f"{path}: {name} became required")

        if isinstance(base.get("properties"), dict):
            cprops = cur.get("properties")
            if not isinstance(cprops, dict):
                failures.append(f"{path}: properties removed")
                return
            for name, bsub in base["properties"].items():
                if name not in cprops:
                    failures.append(f"{path}.{name}: property removed")
                else:
                    _diff_schema(bsub, cprops[name], f"{path}.{name}", failures, additions)
            for name in cprops:
                if name not in base["properties"]:
                    optional = not isinstance(creq, list) or name not in creq
                    additions.append(f"{path}.{name}: property added (optional={optional})")
            return

        for comb in ("allOf", "anyOf", "oneOf"):
            if comb in base:
                bsubs = base[comb]
                csubs = cur.get(comb)
                if not isinstance(csubs, list) or len(csubs) < len(bsubs):
                    failures.append(f"{path}: {comb} loses branches")
                else:
                    for index, bsub in enumerate(bsubs):
                        _diff_schema(
                            bsub, csubs[index], f"{path}.{comb}[{index}]", failures, additions
                        )
                return

        if "items" in base:
            citems = cur.get("items")
            if not isinstance(citems, dict):
                failures.append(f"{path}: items schema removed")
                return
            _diff_schema(base["items"], citems, path + "[]", failures, additions)
            return

        for key, bsub in base.items():
            if key not in cur:
                failures.append(f"{path}.{key}: removed")
            else:
                _diff_schema(bsub, cur[key], f"{path}.{key}", failures, additions)
        for key in cur:
            if key not in base:
                additions.append(f"{path}.{key}: added")
    elif isinstance(base, list) and isinstance(cur, list):
        for index, bsub in enumerate(base):
            if index < len(cur):
                _diff_schema(bsub, cur[index], f"{path}[{index}]", failures, additions)
            else:
                failures.append(f"{path}[{index}]: entry removed")
        if len(cur) > len(base):
            additions.append(f"{path}: {len(cur) - len(base)} entry(ies) added")
    elif base != cur:
        failures.append(f"{path}: value changed {base!r} -> {cur!r}")


def _diff_parameters(label, base_params, cur_params, failures, additions):
    def index(params):
        return {(p.get("name"), p.get("in")): p for p in params}

    base_index = index(base_params)
    cur_index = index(cur_params)

    for key, bparam in base_index.items():
        cparam = cur_index.get(key)
        if cparam is None:
            failures.append(f"{label}: parameter {key[0]} (in {key[1]}) removed")
            continue
        if cparam.get("required") and not bparam.get("required"):
            failures.append(f"{label}: parameter {key[0]} became required")
        if isinstance(bparam.get("schema"), dict) and isinstance(cparam.get("schema"), dict):
            _diff_schema(
                bparam["schema"],
                cparam["schema"],
                f"{label} param {key[0]}",
                failures,
                additions,
            )

    for key, cparam in cur_index.items():
        if key not in base_index:
            if cparam.get("required"):
                failures.append(f"{label}: new parameter {key[0]} is required")
            else:
                additions.append(f"{label}: parameter {key[0]} added")


def _diff_responses(label, base_op, cur_op, failures, additions):
    base_responses = base_op.get("responses", {})
    cur_responses = cur_op.get("responses", {})
    for code, bresp in base_responses.items():
        cresp = cur_responses.get(code)
        if cresp is None:
            failures.append(f"{label}: response status {code} removed")
        else:
            _diff_schema(bresp, cresp, f"{label} response {code}", failures, additions)
    for code in cur_responses:
        if code not in base_responses:
            additions.append(f"{label}: response status {code} added")


def _diff_request_body(label, base_op, cur_op, failures, additions):
    base_body = base_op.get("requestBody")
    cur_body = cur_op.get("requestBody")
    if base_body is not None and cur_body is None:
        failures.append(f"{label}: request body removed")
    elif cur_body is not None:
        if base_body is None:
            if cur_body.get("required"):
                failures.append(f"{label}: new required request body")
            else:
                additions.append(f"{label}: request body added")
        else:
            _diff_schema(base_body, cur_body, f"{label} request body", failures, additions)


def main() -> int:
    baseline = json.loads(_BASELINE_PATH.read_text(encoding="utf-8"))
    current = app.openapi()

    base_ops = _operations(baseline)
    cur_ops = _operations(current)

    failures: list[str] = []
    additions: list[str] = []

    for key in sorted(set(base_ops) | set(cur_ops)):
        label = f"{key[0]} {key[1]}"
        if key not in cur_ops:
            failures.append(f"{label}: operation removed")
            continue
        if key not in base_ops:
            additions.append(f"{label}: new operation")
            continue
        base_op = base_ops[key]
        cur_op = cur_ops[key]
        _diff_parameters(label, base_op.get("parameters", []), cur_op.get("parameters", []), failures, additions)
        _diff_request_body(label, base_op, cur_op, failures, additions)
        _diff_responses(label, base_op, cur_op, failures, additions)

    if additions:
        print(f"Additive changes detected ({len(additions)}, allowed):")
        for line in sorted(set(additions)):
            print(f"  + {line}")

    if failures:
        print(
            f"Breaking OpenAPI changes detected ({len(failures)}):",
            file=sys.stderr,
        )
        for line in sorted(set(failures)):
            print(f"  - {line}", file=sys.stderr)
        return 1

    print(
        f"OK: the contract is additive - {len(set(additions))} addition(s), "
        "0 breaking change(s)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
