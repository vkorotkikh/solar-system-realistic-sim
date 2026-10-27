"""Real subprocess negative controls for scientific mutation-kill evidence."""

from __future__ import annotations

import json

import pytest

from test_verify_r3_r4_runner import _fixture, _run


def _gate(tmp_path, **fixture_options):
    repo, manifest = _fixture(tmp_path, **fixture_options)
    artifacts = repo / "artifacts"
    result = _run(
        "--repo", str(repo), "--manifest", str(manifest),
        "--artifacts", str(artifacts), "all",
    )
    return result, artifacts


@pytest.mark.parametrize("exception", ["RuntimeError", "ValueError", "Exception"])
def test_marker_bearing_nonassertion_is_not_a_kill(tmp_path, exception):
    result, artifacts = _gate(tmp_path, test_body=(
        "def test_invariant():\n"
        "    if science.calibrated_value() != 2:\n"
        f"        raise {exception}('SCIENCE-001 not a scientific assertion')\n"
    ))
    assert result.returncode != 0, result.stdout + result.stderr
    assert "call-phase AssertionError" in result.stderr
    assert not (artifacts / "summary.json").exists()


@pytest.mark.parametrize("marker_location", ["stdout", "stderr", "source"])
def test_marker_outside_actual_exception_is_not_a_kill(tmp_path, marker_location):
    output = {
        "stdout": "    print('SCIENCE-001')\n",
        "stderr": "    import sys\n    print('SCIENCE-001', file=sys.stderr)\n",
        "source": "",
    }[marker_location]
    result, artifacts = _gate(tmp_path, test_body=(
        "def test_invariant():\n" + output
        + "    assert science.calibrated_value() == 2  # SCIENCE-001 source only\n"
    ))
    assert result.returncode != 0, result.stdout + result.stderr
    assert "expected assertion regex did not match" in result.stderr
    assert not (artifacts / "summary.json").exists()


@pytest.mark.parametrize("phase", ["setup", "teardown"])
def test_marker_assertion_outside_call_is_not_a_kill(tmp_path, phase):
    assertion = "    assert science.calibrated_value() == 2, 'SCIENCE-001 wrong phase'\n"
    body = (
        "import pytest\n"
        "@pytest.fixture(autouse=True)\n"
        "def phase_failure():\n"
        + (assertion + "    yield\n" if phase == "setup" else "    yield\n" + assertion)
        + "def test_invariant():\n    science.calibrated_value()\n"
    )
    result, artifacts = _gate(tmp_path, test_body=body)
    assert result.returncode != 0, result.stdout + result.stderr
    assert "not killed by one test assertion" in result.stderr
    assert not (artifacts / "summary.json").exists()


@pytest.mark.parametrize("outcome", ["skip", "xfail"])
def test_runtime_non_evidence_outcome_is_not_a_kill(tmp_path, outcome):
    result, artifacts = _gate(tmp_path, test_body=(
        "import pytest\n"
        "def test_invariant():\n"
        "    if science.calibrated_value() != 2:\n"
        f"        pytest.{outcome}('SCIENCE-001 non-evidence outcome')\n"
    ))
    assert result.returncode != 0, result.stdout + result.stderr
    assert "skip" in result.stderr.lower()
    assert not (artifacts / "summary.json").exists()


def test_same_file_execution_does_not_prove_changed_hunk_execution(tmp_path):
    source = (
        "def calibrated_value():\n    return 2\n\n"
        "def unrelated():\n    return 42\n"
    )
    result, artifacts = _gate(tmp_path, production_body=source, test_body=(
        "from pathlib import Path\n"
        "def test_invariant():\n"
        "    science.unrelated()\n"
        "    assert 'return 3' not in Path(science.__file__).read_text(), 'SCIENCE-001 unreachable'\n"
    ))
    assert result.returncode != 0, result.stdout + result.stderr
    assert "altered production hunk was not executed" in result.stderr
    assert not (artifacts / "summary.json").exists()


def test_setup_only_execution_does_not_prove_call_reachability(tmp_path):
    result, artifacts = _gate(tmp_path, test_body=(
        "import pytest\n"
        "@pytest.fixture\n"
        "def value():\n    return science.calibrated_value()\n"
        "def test_invariant(value):\n"
        "    assert value == 2, 'SCIENCE-001 setup-only execution'\n"
    ))
    assert result.returncode != 0, result.stdout + result.stderr
    assert "altered production hunk was not executed" in result.stderr
    assert not (artifacts / "summary.json").exists()


@pytest.mark.parametrize("execute_both", [False, True])
def test_every_changed_hunk_requires_execution(tmp_path, execute_both):
    source = (
        "def calibrated_value():\n    return 2\n"
        + "\n" * 10 + "def second_value():\n    return 5\n"
    )
    mutated = source.replace("return 2", "return 3").replace("return 5", "return 6")
    result, artifacts = _gate(
        tmp_path, production_body=source, mutation_source=mutated, test_body=(
            "def test_invariant():\n"
            "    value = science.calibrated_value()\n"
            + ("    science.second_value()\n" if execute_both else "")
            + "    assert value == 2, 'SCIENCE-001 both hunks required'\n"
        ),
    )
    if not execute_both:
        assert result.returncode != 0, result.stdout + result.stderr
        assert "altered production hunk was not executed" in result.stderr
        assert not (artifacts / "summary.json").exists()
        return
    assert result.returncode == 0, result.stdout + result.stderr
    evidence = json.loads((artifacts / "mutant-wrong-calibration.evidence.json").read_text())
    assert len(evidence["hunks"]) == 2
    assert all(hunk["executed_lines"] for hunk in evidence["hunks"])


@pytest.mark.parametrize("change", ["comment", "deletion"])
def test_hunk_without_added_executable_line_fails_closed(tmp_path, change):
    source = "def calibrated_value():\n    # original comment\n    return 2\n"
    mutated = source.replace(
        "    # original comment\n", "    # changed comment\n" if change == "comment" else "",
    )
    result, artifacts = _gate(
        tmp_path, production_body=source, mutation_source=mutated, test_body=(
            "from pathlib import Path\n"
            "def test_invariant():\n"
            "    science.calibrated_value()\n"
            "    assert 'original comment' in Path(science.__file__).read_text(), 'SCIENCE-001 no executable change'\n"
        ),
    )
    assert result.returncode != 0, result.stdout + result.stderr
    assert "no added executable-line candidates" in result.stderr
    assert not (artifacts / "summary.json").exists()


def test_disabled_call_tracer_fails_closed(tmp_path):
    result, artifacts = _gate(tmp_path, test_body=(
        "import sys\n"
        "def test_invariant():\n"
        "    value = science.calibrated_value()\n"
        "    sys.settrace(None)\n"
        "    assert value == 2, 'SCIENCE-001 interrupted trace'\n"
    ))
    assert result.returncode != 0, result.stdout + result.stderr
    assert "call-phase execution tracer was replaced" in result.stderr
    assert not (artifacts / "summary.json").exists()


def test_actual_assertion_and_call_hunk_execution_have_structured_evidence(tmp_path):
    result, artifacts = _gate(tmp_path)
    assert result.returncode == 0, result.stdout + result.stderr
    evidence = json.loads((artifacts / "mutant-wrong-calibration.evidence.json").read_text())
    assert evidence["schema_version"] == 1
    assert evidence["node"] == "test_science.py::test_invariant"
    assert evidence["trace_intact"] is True
    assert [(report["phase"], report["outcome"]) for report in evidence["reports"]] == [
        ("setup", "passed"), ("call", "failed"), ("teardown", "passed"),
    ]
    failure = evidence["reports"][1]
    assert failure["exception_type"] == "builtins.AssertionError"
    assert failure["is_assertion_error"] is True
    assert "SCIENCE-001" in failure["exception_message"]
    assert evidence["hunks"] == [
        {"path": "science.py", "lines": [2], "executed_lines": [2]},
    ]


def test_inherited_mutation_request_cannot_poison_baseline(tmp_path, monkeypatch):
    monkeypatch.setenv("R3_R4_MUTATION_REQUEST", "not verifier-owned JSON")
    result, _ = _gate(tmp_path)
    assert result.returncode == 0, result.stdout + result.stderr
