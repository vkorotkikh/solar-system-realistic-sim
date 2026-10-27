"""Smoke-test entrypoint for episode planning orchestration."""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Sequence

from . import EpisodeRunner, SAMPLE_EPISODE_FAMILIES


def _family_lookup(names: Sequence[str] | None) -> list:
    if not names:
        return list(SAMPLE_EPISODE_FAMILIES)

    normalized = {name.strip().lower() for name in names}
    families = [family for family in SAMPLE_EPISODE_FAMILIES if family.name in normalized]
    missing = sorted(normalized.difference(family.name for family in SAMPLE_EPISODE_FAMILIES))
    if missing:
        raise ValueError(f"Unknown families: {', '.join(missing)}. Available: "
                         f"{', '.join(family.name for family in SAMPLE_EPISODE_FAMILIES)}")
    return families


def run_smoke_test(names: Sequence[str] | None = None) -> dict[str, Any]:
    families = _family_lookup(names)
    runner = EpisodeRunner()
    return runner.run_summary(families)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a local smoke test for the EPO episode families.")
    parser.add_argument(
        "--family",
        action="append",
        help="Filter to one or more families (repeatable). Defaults to all."
    )
    parser.add_argument("--compact", action="store_true", help="Emit compact JSON output.")
    args = parser.parse_args()

    try:
        results = run_smoke_test(args.family)
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(2)

    indent = None if args.compact else 2
    print(json.dumps(results, indent=indent))
    totals = results["totals"]
    passed = (totals["total"] > 0 and totals["passed"] == totals["total"]
              and totals["failed"] == 0 and totals["exceptions"] == 0)
    raise SystemExit(0 if passed else 1)


if __name__ == "__main__":
    main()
