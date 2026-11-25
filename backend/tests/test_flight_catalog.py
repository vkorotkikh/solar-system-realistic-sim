"""Flight vehicle catalog: every number carries its source (design check 7, first half).

A catalog number is {value, low, high, source}. The loader refuses a flown,
ground-tested or published-design number with no source, an estimate or derived
number whose range is a single point, and any value outside its own range.
Fiction-tier vehicles may carry unsourced numbers.
"""

from __future__ import annotations

import copy
import json

import numpy as np
import pytest

from flight.catalog import CatalogError, UnknownVehicle, get_vehicle, load_catalog
from flight.vehicle import to_stage

SOURCE = {"kind": "secondary", "url": "https://example.org/spec", "retrieved": "2026-11-18", "note": ""}


def num(value, low=None, high=None, source=SOURCE):
    """A catalog number; low and high default to the value itself."""
    return {"value": value, "low": value if low is None else low, "high": value if high is None else high,
            "source": source}


def entry(tier: str = "flown") -> dict:
    return {
        "name": "Test lander",
        "tier": tier,
        "structures": [
            {"name": "body", "mass_kg": num(1_000.0), "com_m": num([0.0, 0.0, 2.0]),
             "inertia_kg_m2": num([100.0, 100.0, 50.0, 0.0, 0.0, 0.0])},
        ],
        "tanks": [
            {"name": "main", "capacity_kg": num(4_000.0), "radius_m": num(1.0), "length_m": num(2.0),
             "aft_end_m": num([0.0, 0.0, 0.5])},
        ],
        "engines": [
            {"name": "main", "position_m": num([0.0, 0.0, 0.0]), "axis": [0.0, 0.0, 1.0],
             "thrust_n": num(20_000.0), "isp_vac_s": num(320.0), "throttle_min": num(0.4),
             "throttle_max": num(1.0), "swivel_limit_deg": num(8.0), "feeds": [{"tank": "main", "share": 1.0}]},
        ],
    }


def write(tmp_path, vehicles: dict):
    path = tmp_path / "catalog.json"
    path.write_text(json.dumps({"schema_version": 1, "vehicles": vehicles}))
    return path


def test_a_sourced_entry_loads_with_each_number_at_its_value(tmp_path) -> None:
    raw = entry()
    raw["structures"][0]["mass_kg"] = num(1_000.0, low=900.0, high=1_200.0)
    vehicle = load_catalog(write(tmp_path, {"lander": raw}))["lander"]
    assert vehicle.vehicle_id == "lander"
    assert vehicle.structures[0].mass_kg == 1_000.0
    assert vehicle.tanks[0].capacity_kg == 4_000.0
    assert list(vehicle.tanks[0].aft_end_m) == [0.0, 0.0, 0.5]
    assert vehicle.engines[0].feeds == (("main", 1.0),)


def _refusal(tmp_path, raw: dict) -> CatalogError:
    with pytest.raises(CatalogError) as caught:
        load_catalog(write(tmp_path, {"lander": raw}))
    return caught.value


@pytest.mark.parametrize("tier", ["flown", "ground-tested", "published-design"])
def test_an_unsourced_number_is_refused_below_the_fiction_tier(tmp_path, tier: str) -> None:
    raw = entry(tier)
    raw["engines"][0]["thrust_n"] = num(20_000.0, source=None)
    error = _refusal(tmp_path, raw)
    assert error.code == "unsourced_number"
    assert error.path == "lander.engines[0].thrust_n"


def test_a_fiction_tier_vehicle_may_carry_unsourced_numbers(tmp_path) -> None:
    raw = entry("fiction")
    raw["engines"][0]["thrust_n"] = num(5.0e9, source=None)
    assert load_catalog(write(tmp_path, {"torch": raw}))["torch"].engines[0].thrust_n == 5.0e9


@pytest.mark.parametrize("bounds", [(1_100.0, 1_200.0), (800.0, 900.0)])
def test_a_value_outside_its_own_range_is_refused(tmp_path, bounds) -> None:
    raw = entry()
    raw["structures"][0]["mass_kg"] = num(1_000.0, low=bounds[0], high=bounds[1])
    error = _refusal(tmp_path, raw)
    assert error.code == "value_outside_range"
    assert error.path == "lander.structures[0].mass_kg"


@pytest.mark.parametrize("kind", ["estimate", "derived"])
def test_an_estimate_or_derived_number_needs_a_real_range(tmp_path, kind: str) -> None:
    raw = entry()
    raw["structures"][0]["mass_kg"] = num(1_000.0, source={**SOURCE, "kind": kind, "note": "dry mass"})
    assert _refusal(tmp_path, raw).code == "point_range_for_uncertain_number"


def test_a_derived_number_must_state_its_formula(tmp_path) -> None:
    raw = entry()
    raw["tanks"][0]["length_m"] = num(2.0, low=1.9, high=2.1, source={**SOURCE, "kind": "derived", "note": ""})
    error = _refusal(tmp_path, raw)
    assert error.code == "derived_without_formula"
    assert error.path == "lander.tanks[0].length_m"


@pytest.mark.parametrize("value", [float("nan"), float("inf")])
def test_a_non_finite_value_is_refused_even_with_finite_bounds(tmp_path, value: float) -> None:
    raw = entry()
    raw["tanks"][0]["radius_m"] = num(value, low=0.5, high=1.5)
    assert _refusal(tmp_path, raw).code == "non_finite_number"


def test_an_engine_fed_by_a_missing_tank_is_refused(tmp_path) -> None:
    raw = entry()
    raw["engines"][0]["feeds"] = [{"tank": "header", "share": 1.0}]
    assert _refusal(tmp_path, raw).code == "unknown_tank"


def test_an_engine_whose_tank_shares_do_not_sum_to_one_is_refused(tmp_path) -> None:
    raw = entry()
    raw["tanks"].append(copy.deepcopy(raw["tanks"][0]) | {"name": "second"})
    raw["engines"][0]["feeds"] = [{"tank": "main", "share": 0.7}, {"tank": "second", "share": 0.2}]
    assert _refusal(tmp_path, raw).code == "feed_shares_not_one"


@pytest.mark.parametrize(
    "key, value, code",
    [
        ("thrust_n", 0.0, "thrust_not_positive"),
        ("thrust_n", -20_000.0, "thrust_not_positive"),
        ("isp_vac_s", 0.0, "isp_not_positive"),
    ],
)
def test_an_engine_with_no_thrust_or_no_exhaust_speed_is_refused(tmp_path, key: str, value: float, code: str) -> None:
    """A sourced zero is still a zero: the loader builds through the shared builder.
    Mutation caught: the loader making the vehicle itself, past the builder's checks."""
    raw = entry()
    raw["engines"][0][key] = num(value)
    error = _refusal(tmp_path, raw)
    assert (error.code, error.path) == (code, f"lander.engines[0].{key}")


def test_a_missing_source_is_reported_before_a_physical_fault(tmp_path) -> None:
    """Provenance is its own step and runs first; the physical checks then run on the
    parsed parts. Mutation caught: the feed checks back in front of the engine's numbers."""
    raw = entry()
    raw["engines"][0]["feeds"] = [{"tank": "header", "share": 1.0}]
    raw["engines"][0]["thrust_n"] = num(20_000.0, source=None)
    assert _refusal(tmp_path, raw).code == "unsourced_number"


def test_an_unknown_tier_is_refused(tmp_path) -> None:
    assert _refusal(tmp_path, entry("concept-art")).code == "unknown_tier"


def test_engine_limits_that_are_not_published_load_as_unknown(tmp_path) -> None:
    raw = entry()
    for key in ("throttle_min", "throttle_max", "swivel_limit_deg"):
        del raw["engines"][0][key]
    engine = load_catalog(write(tmp_path, {"lander": raw}))["lander"].engines[0]
    assert (engine.throttle_min, engine.throttle_max, engine.swivel_limit_deg) == (None, None, None)


def test_a_published_engine_limit_is_still_held_to_the_rules(tmp_path) -> None:
    raw = entry()
    raw["engines"][0]["swivel_limit_deg"] = num(8.0, source=None)
    assert _refusal(tmp_path, raw).code == "unsourced_number"


def test_every_shipped_vehicle_obeys_the_rules_and_is_found_by_id() -> None:
    ship = get_vehicle("starship-block3-ship")
    assert ship.tier == "flown"
    assert ship.name == "Starship ship, Block 3"


def test_an_unknown_vehicle_id_is_named_in_the_error() -> None:
    with pytest.raises(UnknownVehicle) as caught:
        get_vehicle("enterprise")
    assert caught.value.vehicle_id == "enterprise"


def test_the_shipped_starship_carries_1600_t_split_at_a_mixture_ratio_of_3_6() -> None:
    """1,600 t (Wikipedia, Block 3) split 3.6 : 1 gives 1,252,173.9 kg of oxygen and
    347,826.1 kg of methane; equal-thrust engines at 350 s and 380 s give a stage
    specific impulse of 2 / (1/350 + 1/380) = 364.3836 s."""
    ship = get_vehicle("starship-block3-ship")
    capacities = {tank.name: tank.capacity_kg for tank in ship.tanks}
    assert capacities == pytest.approx({"lox": 1_252_173.913, "ch4": 347_826.087})
    assert len(ship.engines) == 6
    assert to_stage(ship, np.array([1_252_173.913, 347_826.087])).isp_s == pytest.approx(364.3835616, rel=1e-9)


def test_a_source_of_unknown_kind_is_refused(tmp_path) -> None:
    raw = entry()
    raw["tanks"][0]["capacity_kg"] = num(4_000.0, source={**SOURCE, "kind": "forum post"})
    assert _refusal(tmp_path, raw).code == "unknown_source_kind"
