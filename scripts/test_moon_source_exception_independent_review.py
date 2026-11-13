"""Independent native source review that needs SpiceyPy, plus bit-exact rebuilds.

A local lane, not wired into CI (see scripts/ci/tests/test_r3_r4_workflow.py). It
runs offline with the pinned backend requirements plus SpiceyPy 8.3.0; set
SOLAR_MOON_REVIEW_REQUIRE_NATIVE=1 to fail instead of skip without SpiceyPy. The
byte-identical rebuilds match the committed artifacts only on the BLAS kernels they
were generated with, not under CI's pinned Nehalem profile. The shared pinned-input
fixtures and the SpiceyPy-free controls live in test_moon_source_exception_inputs.py.
"""
import base64
import json
import os
from pathlib import Path
import sys

import numpy as np
import pytest

if os.environ.get("SOLAR_MOON_REVIEW_REQUIRE_NATIVE") == "1":
    import spiceypy as spice
else:
    spice = pytest.importorskip(
        "spiceypy",
        reason="optional native review requires SpiceyPy; skipped is not a scientific pass",
    )

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import generate_s2023_s38_ephemeris as vectors
import repair_spk_moon_ephemeris as native
from generate_moon_repairs import encoded
from test_moon_source_exception_inputs import digest, offline, rebuilt, write_evidence  # noqa: F401 (fixtures)

NATIVE_ORACLE = ROOT / "backend/tests/fixtures/daphnis_independent_spk_review_oracle.json"
DAY = 86400.0
START, END = 2451545.0, 2469807.5


@pytest.fixture(scope="module")
def original_native(tmp_path_factory):
    capture = json.loads((ROOT / "backend/tests/fixtures/daphnis_legacy_spk_capture.json").read_bytes())
    raw = base64.b64decode(capture["kernel_base64"], validate=True)
    assert digest(raw) == capture["sha256"]
    assert len(raw) == capture["kernel_bytes"] == 9216
    path = tmp_path_factory.mktemp("independent-original-spk") / "source.bsp"
    path.write_bytes(raw)
    handle = spice.dafopr(str(path))
    try:
        spice.dafbfs(handle)
        segments = []
        while spice.daffna():
            descriptor = spice.dafgs()
            dc, ic = spice.dafus(descriptor, 2, 6)
            assert list(ic[:4]) == [635, 699, 1, 17]
            segments.append((dc.copy(), descriptor.copy()))
        assert len(segments) == 3
        handoffs = [float(dc[0] / DAY + START) for dc, _ in segments[1:]]
        rng = np.random.default_rng(635)
        fresh = []
        for dc, _ in segments:
            lo, hi = max(START, dc[0] / DAY + START), min(END, dc[1] / DAY + START)
            fresh.extend(rng.uniform(lo + 0.01, hi - 0.01, 64).tolist())
        training = set(np.arange(START - 0.375, END + 0.625, 0.5))
        assert not training.intersection(fresh)
        epochs = {START, END, *fresh}
        for jd in handoffs:
            epochs.update([float(np.nextafter(jd, -np.inf)), jd, float(np.nextafter(jd, np.inf))])
            epochs.update(jd + offset for offset in [-0.251, -0.125, -1e-6, 1e-6, 0.125, 0.251])
        rows = []
        for jd in sorted(epochs):
            et = (jd - START) * DAY
            eligible = [(i, desc) for i, (dc, desc) in enumerate(segments) if dc[0] <= et <= dc[1]]
            assert eligible
            index, desc = eligible[-1]
            frame, state, center = spice.spkpvn(handle, desc[:5], et)
            assert frame == 1 and center == 699
            state = spice.sxform("J2000", "ECLIPJ2000", et) @ state
            rows.append({"jdTdb": jd, "nativeSegment": index, "positionKm": state[:3].tolist(), "velocityKmS": state[3:].tolist()})
        jumps = []
        for index, jd in enumerate(handoffs):
            et = (jd - START) * DAY
            left = spice.spkpvn(handle, segments[index][1][:5], et)[1]
            right = spice.spkpvn(handle, segments[index + 1][1][:5], et)[1]
            jumps.append({"jdTdb": jd, "positionJumpKm": float(np.linalg.norm(right[:3] - left[:3])),
                          "velocityJumpMPerS": float(np.linalg.norm(right[3:] - left[3:]) * 1000)})
        result = {"source": "Original embedded SAT393 bytes, independent direct SPKPVN evaluation",
                  "kernelSha256": digest(raw), "spiceypy": spice.__version__, "freshRandomEpochs": len(fresh),
                  "descriptorCoverageJd": [float(segments[0][0][0] / DAY + START), float(segments[-1][0][1] / DAY + START)],
                  "handoffs": jumps, "rows": rows}
        write_evidence("native-oracle.json", result)
        return result, raw, capture
    finally:
        spice.dafcls(handle)


def test_original_native_descriptors_and_legacy_qualification(original_native):
    oracle, raw, capture = original_native
    fixture_bytes = NATIVE_ORACLE.read_bytes()
    assert json.loads(fixture_bytes) == oracle
    assert fixture_bytes == (json.dumps(oracle, indent=2, allow_nan=False) + "\n").encode("utf-8")
    assert len(oracle["rows"]) == 212 and oracle["freshRandomEpochs"] == 192
    assert oracle["kernelSha256"] == capture["sha256"] == digest(raw)
    body = json.loads((ROOT / "src/data/moonEphemerisDaphnis.json").read_bytes())["bodies"]["daphnis"]
    assert body["sourceDiscontinuities"] == [row["jdTdb"] for row in oracle["handoffs"]]
    assert body["sourceDomain"]["descriptorCoverageJd"] == oracle["descriptorCoverageJd"]
    assert body["sourceDomain"]["modelCoverageJd"] == [START, END]
    assert body["sourceDomain"]["observationsThrough"] == "2016-07-16"
    assert body["sourceDomain"]["kernelRelease"] == "2016-10-11"
    assert b"2016 July 16" in raw and b"Created 2016-10-11" in raw
    assert "not_current_numerical_solution" in capture["source_quality"]
    assert body["validation"]["boundaryContinuity"]["runtimeStateContinuous"] is False
    for actual, expected in zip(body["validation"]["boundaryContinuity"]["sourceDiscontinuities"], oracle["handoffs"], strict=True):
        assert actual["selection"] == "right-hand"
        assert actual["positionJumpKm"] == pytest.approx(expected["positionJumpKm"], abs=1e-8)
        assert actual["velocityJumpMPerS"] == pytest.approx(expected["velocityJumpMPerS"], abs=1e-8)


def test_s2023_offline_rebuild_is_byte_identical(rebuilt):
    body, trace = rebuilt
    raw = encoded(vectors.artifact(body))
    assert raw == vectors.OUTPUT.read_bytes()
    assert body["validation"]["accuracyLimits"] == {"positionKm": 500.0, "velocityMPerS": 10.0}
    write_evidence("s2023-rebuild.json", {"sha256": digest(raw), "fitIterations": len(trace), "fitEdgeHashes": trace,
                   "postSelectionCrossValidation": body["validation"]["postSelectionCrossValidation"]})


def test_daphnis_offline_rebuild_is_byte_identical(tmp_path, monkeypatch):
    monkeypatch.setattr(native, "CACHE", tmp_path / "absent-cache")
    monkeypatch.setattr(native, "OFFLINE", True)
    body = native.generate(635)
    shipped = json.loads((ROOT / "src/data/moonEphemerisDaphnis.json").read_bytes())["bodies"]["daphnis"]
    assert encoded(body) == encoded(shipped)
    assert not native.CACHE.exists()
    assert body["validation"]["accuracyLimits"] == {"positionKm": 136.5, "velocityMPerS": 10.0}
