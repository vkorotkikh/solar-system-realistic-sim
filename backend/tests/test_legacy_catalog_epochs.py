"""B001: osculating elements must retain their actual source epoch."""
from copy import deepcopy
import csv
import hashlib
import io
import json
from pathlib import Path

import pytest

from data.bodies import ALL_BODIES
from mission.ephemeris_service import EphemerisService, EphemerisTargetUnsupported
from mission.orbital import sample_body_state_from_elements
from trajectory.budget import PlanningContext
from trajectory.contracts import TrajectoryRequestRejected, validate_plan_request


LEGACY_IDS = (
    "ceres", "vesta", "pallas", "hygiea", "juno", "psyche", "eunomia",
    "europa52", "interamnia704", "davida511", "iris7", "eris", "makemake",
    "haumea", "sedna", "quaoar", "orcus", "gonggong",
)
BY_ID = {body["id"]: body for body in ALL_BODIES}
SOURCE = json.loads((Path(__file__).parent / "fixtures/legacy_catalog_horizons_2461000.json").read_text())


@pytest.mark.parametrize("body_id", LEGACY_IDS)
def test_legacy_elements_declare_the_jpl_source_epoch(body_id):
    assert BY_ID[body_id]["orbit"].get("epoch_jd") == 2461000.5


@pytest.mark.parametrize("body_id", LEGACY_IDS)
def test_legacy_elements_match_captured_jpl_elements_not_relabeled_old_values(body_id):
    source = SOURCE["bodies"][body_id]
    raw = source["elements_raw_response"]
    assert hashlib.sha256(raw.encode()).hexdigest() == source["elements_response_sha256"]
    result = json.loads(raw)["result"]
    assert "Center body name: Sun (10)" in result
    assert "Reference frame : Ecliptic of J2000.0" in result
    row = next(csv.reader(io.StringIO(result.split("$$SOE")[1].split("$$EOE")[0].strip())))
    # Horizons ELEMENTS CSV: JD, calendar, EC, QR, IN, OM, W, Tp, N, MA, TA, A, AD, PR.
    for field, index in {"epoch_jd": 0, "e": 2, "i_deg": 4, "ascending_node_deg": 5,
                         "arg_periapsis_deg": 6, "mean_anomaly_deg": 9,
                         "a_au": 11, "period_days": 13}.items():
        assert BY_ID[body_id]["orbit"].get(field) == float(row[index]), (body_id, field)


@pytest.mark.parametrize("body_id", LEGACY_IDS)
def test_legacy_local_state_matches_independent_jpl_vector_at_source_epoch(body_id):
    state = sample_body_state_from_elements(BY_ID[body_id], 2461000.5)
    reference = SOURCE["bodies"][body_id]["vector_reference"]["states"][0]
    assert state["position"] == pytest.approx(reference["position_au"], abs=1e-10, rel=0)
    assert state["velocity"] == pytest.approx(reference["velocity_au_per_day"], abs=1e-12, rel=0)


def test_legacy_rebound_states_match_independent_jpl_vectors_at_source_epoch():
    pytest.importorskip("rebound")
    from sim.rebound_nbody import REBOUNDEngine

    engine = REBOUNDEngine()
    engine.initialize(ALL_BODIES, start_jd=2461000.5)
    states = engine.get_state()["bodies"]
    for body_id in LEGACY_IDS:
        reference = SOURCE["bodies"][body_id]["vector_reference"]["states"][0]
        position = [p - s for p, s in zip(states[body_id]["pos"], states["sun"]["pos"])]
        velocity = [v - s for v, s in zip(states[body_id]["vel"], states["sun"]["vel"])]
        # Allow 15 km / 0.2 mm/s for backward/forward N-body integration and the
        # Sun-only GM used for massless catalog bodies (Horizons includes body GM).
        assert position == pytest.approx(reference["position_au"], abs=1e-7, rel=0), body_id
        assert velocity == pytest.approx(reference["velocity_au_per_day"], abs=1e-10, rel=0), body_id
        quality = states[body_id]["ephemeris_quality"]
        assert quality["epoch_provenance"] == "declared"
        assert quality["initial_epoch_jd_tdb"] == 2461000.5


def _undeclared_body():
    body = deepcopy(BY_ID["ceres"])
    body["orbit"].pop("epoch_jd", None)
    return body


def test_element_sampler_rejects_an_undeclared_epoch():
    with pytest.raises(ValueError, match="epoch_jd"):
        sample_body_state_from_elements(_undeclared_body(), 2461000.5)


def test_planner_rejects_an_endpoint_with_undeclared_epoch():
    with pytest.raises(TrajectoryRequestRejected) as caught:
        validate_plan_request(
            [BY_ID["earth"], _undeclared_body()], from_id="earth", to_id="ceres",
            departure_jd=2461000.5, objective="min_time", max_assists=0,
            assist_pool=[], default_assist_pool=[],
        )
    assert caught.value.code == "trajectory_invalid_endpoint_body"


def test_local_ephemeris_preflight_rejects_an_undeclared_epoch():
    service = EphemerisService(
        [_undeclared_body()], provider="kepler", context=PlanningContext.with_timeout(10),
    )
    with pytest.raises(EphemerisTargetUnsupported):
        service.preflight(["ceres"])


def test_rebound_rejects_an_undeclared_element_epoch():
    pytest.importorskip("rebound")
    from sim.rebound_nbody import REBOUNDEngine

    engine = REBOUNDEngine()
    with pytest.raises(ValueError, match="epoch_jd"):
        engine.initialize([BY_ID["sun"], _undeclared_body()])
