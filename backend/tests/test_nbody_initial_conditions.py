from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import pytest

from data.initial_conditions import (
    DEFAULT_INITIAL_CONDITIONS_PATH,
    InitialConditionsError,
    REQUIRED_DYNAMICAL_BODY_IDS,
    load_nbody_initial_conditions,
)
from sim import rebound_nbody
from sim.rebound_nbody import DAYS_PER_YEAR, J2000_JD, REBOUNDEngine


def _fixture_payload() -> dict[str, Any]:
    return json.loads(DEFAULT_INITIAL_CONDITIONS_PATH.read_text(encoding="utf-8"))


def _write_fixture(tmp_path: Path, payload: dict[str, Any]) -> Path:
    path = tmp_path / "initial-conditions.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_committed_initial_conditions_have_complete_provenance() -> None:
    conditions = load_nbody_initial_conditions()

    assert set(conditions.bodies) == set(REQUIRED_DYNAMICAL_BODY_IDS)
    assert conditions.epoch_jd_tdb == J2000_JD
    assert conditions.input_origin == "solar_system_barycenter"
    assert conditions.input_orientation == "ecliptic_j2000"
    assert conditions.reference_system == "ICRF"
    assert conditions.position_unit == "AU"
    assert conditions.velocity_unit == "AU/day"
    assert conditions.bodies["earth"].horizons_target_id == "399"
    assert conditions.bodies["moon"].horizons_target_id == "301"
    assert conditions.bodies["saturn"].horizons_target_id == "6"
    assert conditions.bodies["earth"].target_name == "Earth"
    assert len(conditions.gm_source_sha256) == 64
    assert all(
        len(body.result_fingerprint_sha256) == 64
        for body in conditions.bodies.values()
    )


@pytest.mark.parametrize(
    "mutate, match",
    [
        (lambda payload: payload["bodies"].pop("saturn"), "missing=.*saturn"),
        (
            lambda payload: payload["epoch"].update({"jd_tdb": 2_451_546.0}),
            "epoch.jd_tdb",
        ),
        (
            lambda payload: payload["input_frame"].update(
                {"velocity_unit": "km/s"}
            ),
            "velocity_unit",
        ),
        (
            lambda payload: payload["bodies"]["earth"].update(
                {"velocity_au_per_day": [0.0, "not-finite", 0.0]}
            ),
            "velocity_au_per_day",
        ),
        (
            lambda payload: payload["bodies"]["earth"].update(
                {"horizons_target_id": "3"}
            ),
            "horizons_target_id",
        ),
        (
            lambda payload: payload["provenance"]["query"].update(
                {"CENTER": "500@10"}
            ),
            "provenance.query.CENTER",
        ),
        (
            lambda payload: payload["bodies"]["earth"]["position_au"].__setitem__(
                0, payload["bodies"]["earth"]["position_au"][0] + 1e-9
            ),
            "scientific_payload_sha256",
        ),
    ],
)
def test_initial_conditions_fail_closed_on_invalid_scientific_inputs(
    tmp_path: Path,
    mutate,
    match: str,
) -> None:
    payload = _fixture_payload()
    mutate(payload)

    with pytest.raises(InitialConditionsError, match=match):
        load_nbody_initial_conditions(_write_fixture(tmp_path, payload))


def test_initial_conditions_reject_duplicate_json_keys(tmp_path: Path) -> None:
    path = tmp_path / "duplicate.json"
    path.write_text('{"schema_version": 1, "schema_version": 1}', encoding="utf-8")

    with pytest.raises(InitialConditionsError, match="duplicate JSON key"):
        load_nbody_initial_conditions(path)


class _RecordingParticle:
    def __init__(self, kwargs: dict[str, Any]) -> None:
        self.x = float(kwargs.get("x", 0.0))
        self.y = float(kwargs.get("y", 0.0))
        self.z = float(kwargs.get("z", 0.0))
        self.vx = float(kwargs.get("vx", 0.0))
        self.vy = float(kwargs.get("vy", 0.0))
        self.vz = float(kwargs.get("vz", 0.0))


class _RecordingSimulation:
    instances: list["_RecordingSimulation"] = []

    def __init__(self) -> None:
        self.t = 0.0
        self.units = ("yr", "AU", "Msun")
        self.G = 0.0
        self.integrator = "ias15"
        self.dt = 0.0
        self.particles: list[_RecordingParticle] = []
        self.add_calls: list[dict[str, Any]] = []
        self.integrate_history: list[float] = []
        type(self).instances.append(self)

    def add(self, **kwargs: Any) -> None:
        self.add_calls.append(dict(kwargs))
        self.particles.append(_RecordingParticle(kwargs))

    def move_to_com(self) -> None:
        return

    def energy(self) -> float:
        return -1.0

    def integrate(self, target: float) -> None:
        self.t = float(target)
        self.integrate_history.append(float(target))


class _RecordingRebound:
    __version__ = "test-double"
    Simulation = _RecordingSimulation


def _sample_bodies() -> list[dict[str, Any]]:
    return [
        {"id": "sun", "type": "star", "mass_kg": 1.98847e30},
        {
            "id": "earth",
            "type": "planet",
            "mass_kg": 5.97237e24,
            "orbit": {
                "a_au": 1.0,
                "e": 0.0167,
                "i_deg": 0.0,
                "ascending_node_deg": 0.0,
                "arg_periapsis_deg": 0.0,
                "mean_anomaly_deg": 123.0,
                "period_days": 365.25,
                "epoch_jd": J2000_JD,
            },
        },
        {
            "id": "test-rock",
            "type": "asteroid",
            "mass_kg": 1.0e20,
            "orbit": {
                "a_au": 2.5,
                "e": 0.1,
                "i_deg": 3.0,
                "ascending_node_deg": 4.0,
                "arg_periapsis_deg": 5.0,
                "mean_anomaly_deg": 6.0,
                "period_days": 1_443.0,
                "epoch_jd": J2000_JD,
            },
        },
    ]


def test_engine_seeds_cartesian_states_with_matching_gm_and_units(monkeypatch) -> None:
    monkeypatch.setattr(rebound_nbody, "rebound", _RecordingRebound())
    _RecordingSimulation.instances.clear()
    conditions = load_nbody_initial_conditions()

    engine = REBOUNDEngine()
    engine.initialize(_sample_bodies())
    sim = engine.sim
    assert isinstance(sim, _RecordingSimulation)

    sun_call, earth_call, rock_call, moon_call = sim.add_calls
    assert "a" not in sun_call
    assert "a" not in earth_call
    assert earth_call["x"] == conditions.bodies["earth"].position_au[0]
    assert earth_call["vx"] == pytest.approx(
        conditions.bodies["earth"].velocity_au_per_day[0] * DAYS_PER_YEAR,
        rel=0.0,
        abs=1e-15,
    )
    assert earth_call["m"] == pytest.approx(
        conditions.bodies["earth"].gm_km3_s2 / conditions.sun_gm_km3_s2,
        rel=1e-15,
    )
    assert moon_call["m"] == pytest.approx(
        conditions.bodies["moon"].gm_km3_s2 / conditions.sun_gm_km3_s2,
        rel=1e-15,
    )

    # Unproven catalog elements remain displayable but cannot perturb the
    # provenance-controlled active model.
    assert rock_call["a"] == 2.5
    assert rock_call["m"] == 0.0
    assert rock_call["M"] == pytest.approx(math.radians(6.0))
    assert engine.list_body_ids() == ["sun", "earth", "test-rock"]


def test_non_j2000_start_integrates_once_from_canonical_epoch(monkeypatch) -> None:
    monkeypatch.setattr(rebound_nbody, "rebound", _RecordingRebound())
    _RecordingSimulation.instances.clear()
    start_jd = J2000_JD + 123.0

    engine = REBOUNDEngine()
    engine.initialize(_sample_bodies(), start_jd=start_jd)
    sim = engine.sim
    assert isinstance(sim, _RecordingSimulation)

    assert sim.integrate_history == [pytest.approx(123.0 / DAYS_PER_YEAR)]
    rock_call = sim.add_calls[2]
    assert rock_call["M"] == pytest.approx(math.radians(6.0))
    assert engine.get_julian_date() == pytest.approx(start_jd)


def test_failed_fixture_reload_does_not_destroy_live_simulation(
    monkeypatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(rebound_nbody, "rebound", _RecordingRebound())
    engine = REBOUNDEngine()
    engine.initialize(_sample_bodies())
    original_sim = engine.sim
    original_ids = engine.list_body_ids()

    engine._initial_conditions_path = tmp_path / "missing.json"
    with pytest.raises(InitialConditionsError, match="unable to read"):
        engine.initialize(_sample_bodies())

    assert engine.sim is original_sim
    assert engine.list_body_ids() == original_ids


def test_readiness_requires_valid_initial_conditions(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(rebound_nbody, "rebound", _RecordingRebound())
    engine = REBOUNDEngine(initial_conditions_path=tmp_path / "missing.json")

    readiness = engine.readiness_status()
    assert readiness["available"] is False
    assert readiness["dependency"]["available"] is True
    assert readiness["initial_conditions"]["available"] is False
    assert "unable to read" in readiness["error"]


def test_state_metadata_discloses_targets_scope_and_output_origin(monkeypatch) -> None:
    monkeypatch.setattr(rebound_nbody, "rebound", _RecordingRebound())
    engine = REBOUNDEngine()
    engine.initialize(_sample_bodies())

    initial = engine.get_state()["force_models"]["initial_conditions"]
    assert initial["status"] == "loaded"
    assert initial["horizons_targets"]["earth"] == "399"
    assert initial["horizons_targets"]["saturn"] == "6"
    assert initial["dynamical_target_names"]["earth"] == "Earth"
    assert initial["internal_gravity_body_ids"] == ["moon"]
    assert initial["approximate_elements_are_massless"] is True
    assert initial["output_origin"] == "integrated_particle_barycenter"
    assert len(initial["scientific_payload_sha256"]) == 64
    assert engine.get_state()["jd_time_scale"] == "TDB"
    assert engine.fidelity_level == "high"
    assert REBOUNDEngine(integrator="whfast").fidelity_level == "normal"
