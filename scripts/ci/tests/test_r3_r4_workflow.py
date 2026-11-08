"""Repository wiring for the blocking science and compiled frontend lanes."""

import hashlib
import json
from pathlib import Path
import re
import subprocess

import pytest
import yaml


ROOT = Path(__file__).parents[3]
WORKFLOW = ROOT / ".github/workflows/r3-r4-science.yml"
FRONTEND_WORKFLOW = ROOT / ".github/workflows/frontend-ui.yml"

# Script tests the pinned backend environment cannot run. Each needs a package
# that ci/backend-test-requirements.txt does not install: the SpiceyPy tests
# would only skip ("skipped is not a scientific pass"), the other fails at import.
NOT_IN_CI = {
    "test_moon_source_exception_independent_review.py": "needs SpiceyPy",
    "test_moon_source_exceptions.py": "needs SpiceyPy",
    "test_moon_spk_clean_checkout.py": "needs SpiceyPy",
    "test_moon_spk_repairs.py": "needs SpiceyPy",
    "test_solar_main_frame_verifier.py": "needs the Python playwright package",
}


def test_workflow_installs_pinned_environment_and_runs_exact_all_lane():
    document = yaml.safe_load(WORKFLOW.read_text())
    jobs = document["jobs"]
    assert set(jobs) == {"r3-r4-science", "backend-tests"}
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
    assert setup["with"] == {
        "python-version": "3.12.13",
        "cache": "pip",
        "cache-dependency-path": "ci/r3-r4-requirements.txt",
    }
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
    assert 'test "$(npm --version)" = "10.9.8"' in commands
    assert "npm test" in commands
    assert "npm run build" in commands
    assert "npm run typecheck:ratchet" in commands
    assert all(not step.get("continue-on-error", False) for step in steps)


def test_backend_job_uses_pinned_python_and_runs_the_full_suite():
    document = yaml.safe_load(WORKFLOW.read_text())
    job = document["jobs"]["backend-tests"]

    assert job["runs-on"] == "ubuntu-24.04"
    assert job["timeout-minutes"] == 30
    assert job["permissions"] == {"contents": "read"}
    steps = job["steps"]
    checkout = next(step for step in steps if step.get("uses", "").startswith("actions/checkout@"))
    assert checkout["with"] == {
        "fetch-depth": 0,
        "persist-credentials": False,
    }
    setup = next(step for step in steps if step.get("uses", "").startswith("actions/setup-python@"))
    assert setup["with"] == {
        "python-version": "3.12.13",
        "cache": "pip",
        "cache-dependency-path": "ci/backend-test-requirements.txt",
    }
    commands = "\n".join(step.get("run", "") for step in steps)
    assert "python -m pip install -r ci/backend-test-requirements.txt" in commands
    assert "python -m pytest -q backend/tests" in commands
    preflight = "python -m pytest -q scripts/test_moon_repairs.py::test_real_extension_rebuild_is_byte_identical_without_network"
    runs = [step.get("run", "") for step in steps]
    preflight_steps = [step for step in steps if step.get("run") == preflight]
    assert [step.get("env", {}) for step in preflight_steps] == [{}, {"NPY_DISABLE_CPU_FEATURES": "X86_V4,AVX512_ICL,AVX512_SPR"}]
    assert all(steps.index(step) < runs.index("python -m pytest -q backend/tests") for step in preflight_steps)
    assert all("if" not in step for step in preflight_steps)
    assert job["env"]["OPENBLAS_CORETYPE"] == "Nehalem"
    assert job["env"]["OPENBLAS_NUM_THREADS"] == "1"
    assert job["env"]["OPENBLAS_L2_SIZE"] == "256"
    profile = 'python scripts/ci/catalog_numerical_profile.py --require-core Nehalem --require-l2-kib 256 --probe-output "$RUNNER_TEMP/catalog-numerical"'
    profile_index = _command_index(steps, profile)
    guard_tests = "python -m pytest --noconftest -q scripts/ci/tests/test_catalog_numerical_profile.py"
    assert _command_index(steps, guard_tests) < profile_index
    assert profile_index < runs.index(preflight)
    evidence = next(step for step in steps if step.get("uses", "").startswith("actions/upload-artifact@"))
    assert evidence["if"] == "always()"
    assert evidence["with"]["path"] == "${{ runner.temp }}/catalog-numerical/"
    assert evidence["with"]["retention-days"] == 14
    assert all(not step.get("continue-on-error", False) for step in steps)


def test_backend_job_runs_catalog_script_guards_and_classifies_every_script_test():
    document = yaml.safe_load(WORKFLOW.read_text())
    commands = [step.get("run", "") for step in document["jobs"]["backend-tests"]["steps"]]
    script_runs = [command for command in commands if "scripts/test_" in command and "::" not in command]
    assert len(script_runs) == 1
    assert script_runs[0].startswith(
        "python -m pytest -v --durations=20 -o faulthandler_timeout=120 "
    )
    wired = set(re.findall(r"scripts/(test_\w+\.py)", script_runs[0]))
    present = {path.name for path in (ROOT / "scripts").glob("test_*.py")}
    assert not wired & set(NOT_IN_CI)
    assert present == wired | set(NOT_IN_CI), "wire every scripts/test_*.py into CI or list why not"
    joined = "\n".join(commands)
    assert "python scripts/generate_moon_physical_radii.py --check" in joined
    assert "python scripts/build_asteroid_phase1_dataset.py --offline --check" in joined


def test_workflow_is_blocking_on_push_and_pull_request():
    document = yaml.safe_load(WORKFLOW.read_text())
    triggers = document.get("on", document.get(True))  # PyYAML 1.1 treats `on` as bool.
    assert set(triggers) == {"push", "pull_request", "workflow_dispatch"}


def _production_job():
    jobs = yaml.safe_load(FRONTEND_WORKFLOW.read_text())["jobs"]
    assert "production-artifact" in jobs, "Compiled acceptance must be a blocking job"
    return jobs["production-artifact"]


def _command_index(steps, command):
    matches = [index for index, step in enumerate(steps) if step.get("run", "").strip() == command]
    assert len(matches) == 1, f"Expected one unconditional command: {command}"
    assert "if" not in steps[matches[0]], f"Release command must not be skipped: {command}"
    return matches[0]


@pytest.mark.parametrize("event", ["push", "pull_request"])
def test_frontend_acceptance_runs_for_test_and_distribution_changes(event):
    document = yaml.safe_load(FRONTEND_WORKFLOW.read_text())
    triggers = document.get("on", document.get(True))
    required_paths = {
        "tests/production/**",
        "public/**",
        "LICENSE",
        "NOTICE.md",
        "docs/distribution-policy.md",
    }
    assert required_paths <= set(triggers[event]["paths"])
    assert not triggers[event].get("paths-ignore")


def test_compiled_acceptance_is_blocking_with_pinned_tools_and_ordered_checks():
    job = _production_job()
    assert job["runs-on"] == "ubuntu-24.04"
    assert job["timeout-minutes"] == 15
    assert job["permissions"] == {"contents": "read"}
    assert job.get("continue-on-error", False) is False
    assert "if" not in job
    assert "needs" not in job
    steps = job["steps"]
    assert all(step.get("continue-on-error", False) is False for step in steps)
    assert all("if" not in step for step in steps if not step.get("uses", "").startswith("actions/upload-artifact@"))
    checkout = next(step for step in steps if step.get("uses", "").startswith("actions/checkout@"))
    assert checkout["with"]["persist-credentials"] is False
    setup = next(step for step in steps if step.get("uses", "").startswith("actions/setup-node@"))
    assert setup["with"]["node-version"] == "22.23.2"
    assert setup["with"]["cache"] == "npm"
    assert setup["with"]["cache-dependency-path"] == "package-lock.json"
    commands = [
        "npm install --global npm@10.9.8",
        'node -e "if(process.version !== \'v22.23.2\') process.exit(1)" && test "$(npm --version)" = 10.9.8',
        "npm ci",
        "npx playwright install --with-deps chromium",
        "npm run typecheck",
        "npm run build",
        "npm run test:production",
    ]
    indices = [_command_index(steps, command) for command in commands]
    assert indices == sorted(indices), "Install and strict check must precede build and compiled acceptance"
    build = steps[_command_index(steps, "npm run build")]
    assert build["env"]["VITE_BACKEND_ORIGIN"] == ""


def test_compiled_acceptance_retains_the_tested_dist_and_failure_evidence():
    steps = _production_job()["steps"]
    provenance = next(step for step in steps if step.get("id") == "production-provenance")
    assert "if" not in provenance
    assert _command_index(steps, "npm run build") < steps.index(provenance)
    assert steps.index(provenance) < _command_index(steps, "npm run test:production")
    uploads = [step for step in steps if step.get("uses", "").startswith("actions/upload-artifact@")]
    assert len(uploads) == 1
    upload = uploads[0]
    assert steps.index(upload) > _command_index(steps, "npm run test:production")
    assert upload["if"] in {"always()", "${{ always() }}"}
    artifact = upload["with"]
    assert artifact["retention-days"] == 14
    assert artifact["if-no-files-found"] == "warn"
    assert {
        "dist/",
        "artifacts/production/",
        "playwright-report/production-4185/",
        "test-results/production-4185/",
    } <= set(artifact["path"].splitlines())
    for identity in ("${{ github.sha }}", "${{ github.run_id }}", "${{ github.run_attempt }}"):
        assert identity in artifact["name"]


def test_provenance_command_hashes_actual_checkout_lock_and_sorted_dist_files(tmp_path):
    steps = _production_job()["steps"]
    provenance = next(step for step in steps if step.get("id") == "production-provenance")
    lock = b'{"lockfileVersion":3}\n'
    (tmp_path / "package-lock.json").write_bytes(lock)
    assets = {"assets/z.js": b"export const ready = true;\n", "a.bin": bytes([0, 255, 10])}
    for relative, data in assets.items():
        target = tmp_path / "dist" / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    subprocess.run(["git", "init", "--quiet"], cwd=tmp_path, check=True)
    subprocess.run(["git", "add", "package-lock.json"], cwd=tmp_path, check=True)
    subprocess.run(
        ["git", "-c", "user.name=CI contract", "-c", "user.email=ci@example.invalid", "commit", "--quiet", "-m", "Fixture"],
        cwd=tmp_path,
        check=True,
    )
    source_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=tmp_path, text=True).strip()
    source_tree = subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], cwd=tmp_path, text=True).strip()

    subprocess.run(
        ["bash", "-e", "-o", "pipefail", "-c", provenance["run"]],
        cwd=tmp_path,
        check=True,
        capture_output=True,
        text=True,
    )

    manifest = json.loads((tmp_path / "artifacts/production/provenance.json").read_text())
    assert manifest["source"] == {"sha": source_sha, "tree": source_tree}
    assert manifest["lockfile"] == {"path": "package-lock.json", "sha256": hashlib.sha256(lock).hexdigest()}
    assert manifest["toolchain"] == {"node": "v22.23.2", "npm": "10.9.8"}
    assert manifest["dist"]["directory"] == "dist"
    assert manifest["dist"]["files"] == [
        {"path": "a.bin", "bytes": 3, "sha256": hashlib.sha256(assets["a.bin"]).hexdigest()},
        {"path": "assets/z.js", "bytes": 27, "sha256": hashlib.sha256(assets["assets/z.js"]).hexdigest()},
    ]
    assert {relative: (tmp_path / "dist" / relative).read_bytes() for relative in assets} == assets


def test_existing_frontend_jobs_and_four_browser_projects_remain_blocking():
    jobs = yaml.safe_load(FRONTEND_WORKFLOW.read_text())["jobs"]
    assert {"ui", "browser"} <= jobs.keys()
    for name in ("ui", "browser"):
        assert jobs[name].get("continue-on-error", False) is False
        assert "if" not in jobs[name]
        assert all(step.get("continue-on-error", False) is False for step in jobs[name]["steps"])
    browser = jobs["browser"]
    assert browser["needs"] == "ui"
    assert browser["strategy"]["fail-fast"] is False
    matrix = browser["strategy"]["matrix"]
    assert not matrix.get("exclude")
    assert {entry["project"]: entry["browser"] for entry in matrix["include"]} == {
        "chromium": "chromium",
        "chromium-tab-zoom": "chromium",
        "firefox": "firefox",
        "webkit": "webkit",
    }
    _command_index(browser["steps"], "npm run test:browser -- --project=${{ matrix.project }}")
