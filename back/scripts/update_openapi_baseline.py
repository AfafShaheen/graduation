"""Regenerate the OpenAPI contract baseline (Phase 3.5, item 3.5.0 / D23).

The baseline is a snapshot of ``app.openapi()`` consumed by
``tests/test_openapi_contract.py`` to freeze the public API contract. Later
changes must only ADD operations; changing or removing an existing one
requires approval and an intentional regeneration with this script.

Usage (inside the back container):

    docker compose exec back python -m scripts.update_openapi_baseline
"""

import json
from pathlib import Path

from app.main import app

BASELINE_PATH = (
    Path(__file__).resolve().parents[1]
    / "tests"
    / "contract"
    / "openapi_baseline.json"
)


def main() -> None:
    spec = app.openapi()
    BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
    BASELINE_PATH.write_text(
        json.dumps(spec, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote OpenAPI baseline to {BASELINE_PATH}")


if __name__ == "__main__":
    main()
