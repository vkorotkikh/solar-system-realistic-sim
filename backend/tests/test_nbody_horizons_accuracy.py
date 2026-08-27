"""Offline scientific regression gates against committed JPL Horizons vectors."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

pytest.importorskip("rebound")

from data.bodies import ALL_BODIES
from sim.rebound_nbody import AU_KM, DAYS_PER_YEAR, REBOUNDEngine, SECONDS_PER_DAY


FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "nbody_horizons_validation.json"
TRUTH = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
INNER_BODY_IDS = {"mercury", "venus", "earth", "mars"}
OUTER_BODY_IDS = {"jupiter", "saturn", "uranus", "neptune", "pluto"}

# These envelopes cover 1990--2050 residual force-model error with margin. They
# are intentionally far below the pre-fix 232,000 km Earth and 60.2 million km
# Saturn failures, but do not pretend this Newtonian reduced model is DE441.
POSITION_LIMIT_KM = {"inner": 10_000.0, "outer": 1_500.0}
VELOCITY_LIMIT_M_S = {"inner": 10.0, "outer": 0.5}


def _norm(values: list[float]) -> float:
    return math.sqrt(sum(component * component for component in values))


def _relative_error(
    state: dict,
    truth: dict,
    body_id: str,
) -> tuple[float, float]:
    model_body = state["bodies"][body_id]
    model_sun = state["bodies"]["sun"]
    truth_body = truth[body_id]
    truth_sun = truth["sun"]
    position_delta = [
        (model_body["pos"][idx] - model_sun["pos"][idx])
        - (truth_body["position_au"][idx] - truth_sun["position_au"][idx])
        for idx in range(3)
    ]
    velocity_delta = [
        (model_body["vel"][idx] - model_sun["vel"][idx])
        - (
            truth_body["velocity_au_per_day"][idx]
            - truth_sun["velocity_au_per_day"][idx]
        )
        for idx in range(3)
    ]
    return (
        _norm(position_delta) * AU_KM,
        _norm(velocity_delta) * AU_KM * 1_000.0 / SECONDS_PER_DAY,
    )


@pytest.mark.parametrize("epoch", TRUTH["epochs"], ids=lambda epoch: epoch["label"])
def test_default_ias15_model_stays_inside_multi_epoch_horizons_envelope(epoch) -> None:
    engine = REBOUNDEngine(integrator="ias15")
    engine.initialize(ALL_BODIES, start_jd=epoch["jd_tdb"])
    state = engine.get_state()

    assert state["jd"] == pytest.approx(epoch["jd_tdb"], abs=1e-8)
    for body_id in sorted(INNER_BODY_IDS | OUTER_BODY_IDS):
        position_error_km, velocity_error_m_s = _relative_error(
            state,
            epoch["bodies"],
            body_id,
        )
        band = "inner" if body_id in INNER_BODY_IDS else "outer"
        assert position_error_km < POSITION_LIMIT_KM[band], (
            f"{body_id} at {epoch['label']}: {position_error_km:.3f} km"
        )
        assert velocity_error_m_s < VELOCITY_LIMIT_M_S[band], (
            f"{body_id} at {epoch['label']}: {velocity_error_m_s:.6f} m/s"
        )


def test_reported_2026_earth_and_saturn_defect_is_closed() -> None:
    epoch = next(item for item in TRUTH["epochs"] if item["label"] == "2026-08-23")
    engine = REBOUNDEngine(integrator="ias15")
    engine.initialize(ALL_BODIES, start_jd=epoch["jd_tdb"])
    state = engine.get_state()

    earth_error_km, _ = _relative_error(state, epoch["bodies"], "earth")
    saturn_system_error_km, _ = _relative_error(state, epoch["bodies"], "saturn")

    # Earth is target 399 because the hidden Moon is integrated explicitly.
    # Saturn is target 6, matching the system-barycenter particle disclosed by
    # force_models.initial_conditions.horizons_targets.
    assert TRUTH["target_contract"]["earth"]["horizons_target_id"] == "399"
    assert TRUTH["target_contract"]["saturn"]["horizons_target_id"] == "6"
    assert earth_error_km < 2_000.0
    assert saturn_system_error_km < 100.0

    # The public Saturn particle is intentionally the system barycenter, but
    # also gate the apples-to-apples visible planet-center metric from the
    # original defect report. The remaining offset is real satellite reflex
    # motion, not a mislabeled osculating state.
    proxy = TRUTH["planet_center_proxy_checks"][0]
    assert proxy["horizons_target_id"] == "699"
    model_saturn_heliocentric = [
        state["bodies"]["saturn"]["pos"][idx]
        - state["bodies"]["sun"]["pos"][idx]
        for idx in range(3)
    ]
    saturn_center_error_km = _norm(
        [
            model_saturn_heliocentric[idx] - proxy["position_au"][idx]
            for idx in range(3)
        ]
    ) * AU_KM
    assert saturn_center_error_km < 500.0


def test_hidden_moon_preserves_the_earth_moon_relative_state() -> None:
    check = TRUTH["internal_particle_checks"][0]
    epoch = next(item for item in TRUTH["epochs"] if item["jd_tdb"] == check["jd_tdb"])
    engine = REBOUNDEngine(integrator="ias15")
    engine.initialize(ALL_BODIES, start_jd=check["jd_tdb"])

    assert check["body_id"] == "moon"
    assert check["relative_to_body_id"] == "earth"
    assert engine.sim is not None
    earth_particle = engine.sim.particles[engine.body_ids.index("earth")]
    # Internal particles are appended after all public particles and are not
    # serialized as independently selectable application bodies.
    moon_particle = engine.sim.particles[len(engine.body_ids)]
    truth_earth = epoch["bodies"]["earth"]
    position_delta = [
        (getattr(moon_particle, axis) - getattr(earth_particle, axis))
        - (check["position_au"][idx] - truth_earth["position_au"][idx])
        for idx, axis in enumerate(("x", "y", "z"))
    ]
    velocity_delta = [
        (
            (getattr(moon_particle, axis) - getattr(earth_particle, axis))
            / DAYS_PER_YEAR
        )
        - (
            check["velocity_au_per_day"][idx]
            - truth_earth["velocity_au_per_day"][idx]
        )
        for idx, axis in enumerate(("vx", "vy", "vz"))
    ]

    assert _norm(position_delta) * AU_KM < 600.0
    assert _norm(velocity_delta) * AU_KM * 1_000.0 / SECONDS_PER_DAY < 2.0


def test_checkpoint_seek_reproduces_the_direct_2026_solution() -> None:
    target = next(item for item in TRUTH["epochs"] if item["label"] == "2026-08-23")
    future = next(item for item in TRUTH["epochs"] if item["label"] == "2050-01-01")

    direct = REBOUNDEngine(integrator="ias15")
    direct.initialize(ALL_BODIES, start_jd=target["jd_tdb"])
    direct_state = direct.get_state()

    sought = REBOUNDEngine(integrator="ias15")
    sought.initialize(ALL_BODIES)
    sought.set_julian_date(future["jd_tdb"])
    sought.set_julian_date(target["jd_tdb"])
    sought_state = sought.get_state()

    assert sought_state["jd"] == pytest.approx(target["jd_tdb"], abs=1e-8)
    for body_id in ("earth", "saturn"):
        assert sought_state["bodies"][body_id]["pos"] == pytest.approx(
            direct_state["bodies"][body_id]["pos"], abs=1e-10
        )
        assert sought_state["bodies"][body_id]["vel"] == pytest.approx(
            direct_state["bodies"][body_id]["vel"], abs=1e-10
        )
        position_error_km, velocity_error_m_s = _relative_error(
            sought_state, target["bodies"], body_id
        )
        limit_band = "inner" if body_id == "earth" else "outer"
        assert position_error_km < POSITION_LIMIT_KM[limit_band]
        assert velocity_error_m_s < VELOCITY_LIMIT_M_S[limit_band]
