"""Pinned S2023_S38 source inputs and review controls that need no SpiceyPy.

CI runs these under its pinned numerical profile. The SpiceyPy and bit-exact
rebuild checks stay in test_moon_source_exception_independent_review.py, which
imports the shared fixtures below.
Only review evidence and pytest temporary files are written. Set
SOLAR_MOON_REVIEW_EVIDENCE_DIR to retain an earlier evidence directory unchanged.
"""
import copy
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import sys
from urllib.parse import parse_qsl, urlencode

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import generate_s2023_s38_ephemeris as vectors

EVIDENCE = Path(os.environ.get(
    "SOLAR_MOON_REVIEW_EVIDENCE_DIR", str(ROOT / "artifacts/moon-source-independent-review")
))


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def write_evidence(name, value):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / name).write_text(json.dumps(value, indent=2, allow_nan=False) + "\n")


def forbid_network(*args, **kwargs):
    raise AssertionError("Independent review forbids network acquisition")


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    monkeypatch.setattr(socket, "create_connection", forbid_network)
    monkeypatch.setattr(socket.socket, "connect", forbid_network)
    monkeypatch.setattr(vectors.fit, "urlopen", forbid_network)
    monkeypatch.setattr("urllib.request.urlopen", forbid_network)


@pytest.fixture(scope="module")
def pinned():
    manifest_bytes = (vectors.INPUTS / "manifest.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    data = {}
    for key, entry in manifest["sets"].items():
        packed = (vectors.INPUTS / entry["path"]).read_bytes()
        assert digest(packed) == entry["gzipSha256"]
        raw = gzip.decompress(packed)
        assert digest(raw) == entry["rowsSha256"]
        values = np.frombuffer(raw, dtype="<f8").reshape(-1, 7)
        assert len(values) == entry["rowCount"]
        assert np.isfinite(values).all()
        data[key] = values
    return data, manifest, digest(manifest_bytes)


@pytest.fixture(scope="module")
def rebuilt(tmp_path_factory):
    trace = []
    original = vectors.fit.fit_cartesian_states

    def observe(*args, **kwargs):
        trace.append(digest(np.asarray(kwargs["segment_edges"], dtype="<f8").tobytes()))
        return original(*args, **kwargs)

    unused_cache = tmp_path_factory.mktemp("independent-offline") / "absent-cache"
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(vectors.fit, "CACHE", unused_cache)
        patch.setattr(vectors.fit, "urlopen", forbid_network)
        patch.setattr(socket.socket, "connect", forbid_network)
        patch.setattr(vectors.fit, "fit_cartesian_states", observe)
        body = vectors.generate()
    assert not unused_cache.exists()
    return body, trace


def test_original_vector_pin_chunks_and_query_epochs(pinned):
    data, manifest, manifest_hash = pinned
    request_count = 0
    for key, entry in manifest["sets"].items():
        cursor = 0
        for request in entry["requests"]:
            count = request["rowCount"]
            chunk = data[key][cursor:cursor + count]
            assert digest(chunk.tobytes()) == request["rowsSha256"]
            query = request["query"]
            assert dict(parse_qsl(request["encodedQuery"])) == query
            assert digest(request["encodedQuery"].encode("ascii")) == request["cacheKey"]
            assert all(query.get(k) == v for k, v in vectors.PARAMS.items())
            header = request["providerHeader"]
            assert re.search(r"Target body name:\s*S2023_S38 \(65273\)\s*\{source: sat455_merged_DE440\}", header)
            assert re.search(r"Center body name:\s*Saturn \(699\)\s*\{source: sat455_merged_DE440\}", header)
            assert "GEOMETRIC cartesian states" in header and "Ecliptic of J2000.0" in header
            assert re.fullmatch("[a-f0-9]{64}", request["rawResponseSha256"])
            assert request["rawResponseBytes"] > 0
            if "TLIST" in query:
                expected = np.array([float(v) for v in query["TLIST"].split()])
                assert query["TLIST_TYPE"] == "JD"
            else:
                start = float(query["START_TIME"].removeprefix("JD"))
                stop = float(query["STOP_TIME"].removeprefix("JD"))
                amount, unit = query["STEP_SIZE"].split()
                step = float(amount) * {"m": 1 / 1440, "h": 1 / 24, "d": 1}[unit]
                expected = start + np.arange(count) * step
                assert expected[-1] == stop
            np.testing.assert_array_equal(chunk[:, 0], expected)
            cursor += count
            request_count += 1
        assert cursor == len(data[key])
    assert request_count == 115
    body = json.loads(vectors.OUTPUT.read_bytes())["bodies"]["s2023_s38"]
    assert json.loads(body["provenance"]["query"])["manifestSha256"] == manifest_hash
    assert body["validation"]["postSelectionCrossValidation"]["rowsSha256"] == digest(data["audit"].tobytes())
    write_evidence("pinned-source-summary.json", {"manifestSha256": manifest_hash, "requestsChecked": request_count,
                   "setRows": {key: len(rows) for key, rows in data.items()},
                   "originalHttpEnvelopesAvailableInAssignedCache": 0,
                   "scope": "Normalized pinned provider vectors and retained headers; not a rehash of unavailable HTTP/cache envelopes"})


def test_audit_is_disjoint_from_fit_selection_endpoints_and_seven_date_oracle(pinned):
    data, _, _ = pinned
    catalog_oracle = json.loads(vectors.fit.ORACLE.read_bytes())
    oracle = next(body for body in catalog_oracle["bodies"].values() if body["name"] == "S2023_S38")
    reserved = {row["jd_tdb"] for row in oracle["states"]}
    assert len(reserved) == 7
    for name in ["source", "dense_source", "held", "dense_held", "endpoints", "hyperbolic"]:
        reserved.update(data[name][:, 0])
    audit = data["audit"][:, 0]
    assert len(audit) == len(set(audit)) == 6891
    assert not set(audit).intersection(reserved)


def test_hyperbolic_osculation_is_in_original_geometric_pin(pinned):
    row = pinned[0]["hyperbolic"][0]
    assert row[0] == 2451805.125
    r, v, gm = row[1:4], row[4:7], 3.793120623436167e7
    energy = float(v @ v) / 2 - gm / np.linalg.norm(r)
    eccentricity = np.linalg.norm(np.cross(v, np.cross(r, v)) / gm - r / np.linalg.norm(r))
    assert energy > 0
    assert eccentricity == pytest.approx(1.001396285462024, abs=2e-12)
    write_evidence("hyperbolic-source.json", {"jdTdb": float(row[0]), "specificEnergyKm2S2": float(energy), "eccentricity": float(eccentricity)})


def test_failed_audit_rejects_without_selecting_a_different_model(rebuilt, pinned, monkeypatch):
    _, original_trace = rebuilt
    data, manifest, _ = pinned
    altered = dict(data)
    altered["audit"] = data["audit"].copy()
    altered["audit"][0, 1] += 1e8
    trace = []
    original = vectors.fit.fit_cartesian_states

    def observe(*args, **kwargs):
        trace.append(digest(np.asarray(kwargs["segment_edges"], dtype="<f8").tobytes()))
        return original(*args, **kwargs)

    monkeypatch.setattr(vectors, "inputs", lambda: (altered, manifest))
    monkeypatch.setattr(vectors.fit, "fit_cartesian_states", observe)
    with pytest.raises(RuntimeError, match="post-selection cross-validation failed"):
        vectors.generate()
    assert trace == original_trace
    write_evidence("audit-rejection-control.json", {"auditStatePerturbationKm": 1e8,
                   "sameFitIterationCount": len(trace), "sameFitEdgeHashes": True,
                   "scope": "Negative acceptance control, not a provider observation or scientific accuracy pass"})


@pytest.mark.parametrize("mutation", ["provider-center", "request-epochs", "raw-response-hash", "schema-version"])
def test_pinned_provenance_mutations_fail_closed(pinned, tmp_path, monkeypatch, mutation):
    _, original, _ = pinned
    manifest = copy.deepcopy(original)
    request = manifest["sets"]["source"]["requests"][0]
    if mutation == "provider-center":
        request["providerHeader"] = request["providerHeader"].replace("Saturn (699)", "Jupiter (599)")
    elif mutation == "request-epochs":
        request["query"]["START_TIME"] = "JD2451546.0625"
        request["encodedQuery"] = urlencode(request["query"])
        request["cacheKey"] = digest(request["encodedQuery"].encode("ascii"))
    elif mutation == "raw-response-hash":
        request["rawResponseSha256"] = "not-a-sha256"
    else:
        manifest["schemaVersion"] = 999
    for entry in manifest["sets"].values():
        (tmp_path / entry["path"]).symlink_to(vectors.INPUTS / entry["path"])
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    monkeypatch.setattr(vectors, "INPUTS", tmp_path)
    with pytest.raises(ValueError):
        vectors.inputs()


def test_vector_capture_rejects_source_identity_mutation():
    _, manifest = vectors.inputs()
    header = manifest["sets"]["source"]["requests"][0]["providerHeader"]
    with pytest.raises(ValueError, match="identity"):
        vectors.parse_vectors(header.replace("(65273)", "(65272)") + "$$SOE\n$$EOE", np.array([]))
