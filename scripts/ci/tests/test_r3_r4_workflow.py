"""Repository wiring for the blocking R3/R4 science lane."""

from pathlib import Path

import yaml


ROOT = Path(__file__).parents[3]
WORKFLOW = ROOT / ".github/workflows/r3-r4-science.yml"


def test_workflow_installs_pinned_environment_and_runs_exact_all_lane():
    document = yaml.safe_load(WORKFLOW.read_text())
    jobs = document["jobs"]
    assert set(jobs) == {"r3-r4-science"}
    job = jobs["r3-r4-science"]
    assert job["timeout-minutes"] == 15
    assert job["permissions"] == {"contents": "read"}
    assert job["env"] == {
        "PYTHONHASHSEED": "0",
        "OMP_NUM_THREADS": "1",
        "OPENBLAS_NUM_THREADS": "1",
        "MKL_NUM_THREADS": "1",
        "NUMEXPR_NUM_THREADS": "1",
        "TZ": "UTC",
    }
    steps = job["steps"]
    checkout = next(step for step in steps if step.get("uses", "").startswith("actions/checkout@"))
    assert checkout["with"]["fetch-depth"] == 0
    assert checkout["with"]["persist-credentials"] is False
    setup = next(step for step in steps if step.get("uses", "").startswith("actions/setup-python@"))
    assert setup["with"]["python-version"] == "3.12.13"
    setup_node = next(
        step for step in steps if step.get("uses", "").startswith("actions/setup-node@")
    )
    assert setup_node["with"] == {
        "node-version": "22.23.2",
        "cache": "npm",
        "cache-dependency-path": "package-lock.json",
    }
    commands = "\n".join(step.get("run", "") for step in steps)
    assert "python -m pip install -r ci/r3-r4-requirements.txt" in commands
    assert (
        "python -m pytest --noconftest -q "
        "scripts/ci/tests/test_verify_r3_r4_runner.py "
        "scripts/ci/tests/test_r3_r4_workflow.py"
    ) in commands
    assert "python scripts/ci/verify_r3_r4.py" in commands
    assert "--manifest ci/r3-r4-science-verification.json" in commands
    assert "--artifacts \"$RUNNER_TEMP/r3-r4-science-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT\"" in commands
    assert commands.rstrip().endswith("all")
    assert "npm ci --ignore-scripts" in commands
    assert "npm test" in commands
    assert "npm run build" in commands
    assert "npm run typecheck:ratchet" in commands
    assert all(not step.get("continue-on-error", False) for step in steps)


def test_workflow_is_blocking_on_push_and_pull_request():
    document = yaml.safe_load(WORKFLOW.read_text())
    triggers = document.get("on", document.get(True))  # PyYAML 1.1 treats `on` as bool.
    assert set(triggers) == {"push", "pull_request", "workflow_dispatch"}
