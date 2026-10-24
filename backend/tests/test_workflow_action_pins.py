"""TOOL063: repository workflows must not resolve external steps through mutable tags."""
from pathlib import Path
import re

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize(("filename", "expected_actions"), [
    ("frontend-ui.yml", {"actions/checkout", "actions/setup-node", "actions/upload-artifact"}),
    ("r3-r4-science.yml", {"actions/checkout", "actions/setup-node", "actions/setup-python", "actions/upload-artifact"}),
])
def test_workflow_external_actions_use_full_commit_ids(filename, expected_actions):
    document = yaml.safe_load((ROOT / ".github/workflows" / filename).read_text())
    uses = [step["uses"] for job in document["jobs"].values() for step in job.get("steps", []) if "uses" in step]
    assert {value.split("@", 1)[0] for value in uses} == expected_actions
    unpinned = [value for value in uses if not re.fullmatch(r"[^@\s]+@[0-9a-f]{40}", value)]
    assert unpinned == [], f"Mutable action references in {filename}: {unpinned}"
