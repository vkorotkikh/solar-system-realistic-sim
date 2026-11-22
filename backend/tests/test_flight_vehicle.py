"""Mass properties and the stage export (design tasks T1, T2; completions C6, C7).

Hand-worked test body: a 1,000 kg structure at z = 2 m with its own inertia
diag(100, 100, 50) kg m2, and a cylindrical tank of 4,000 kg capacity, radius 1 m,
length 2 m, aft face at z = 0.5 m. Propellant settles at the aft end, so a fill f
is a solid column of length 2f m whose own inertia is m R^2 / 2 about the axis and
m (3 R^2 + h^2) / 12 across it.

Full (4,000 kg): column z 0.5..2.5, centre 1.5. Mass 5,000 kg, centre
(1,000 * 2 + 4,000 * 1.5) / 5,000 = 1.6 m. Across: 100 + 1,000 * 0.4^2
+ 4,000 * (3 + 4) / 12 + 4,000 * 0.1^2 = 2,633.333; axial: 50 + 2,000 = 2,050.
Half (2,000 kg): column z 0.5..1.5, centre 1.0. Mass 3,000 kg, centre 4/3 m.
Across: 100 + 1,000 * (2/3)^2 + 2,000 * (3 + 1) / 12 + 2,000 * (1/3)^2 = 1,433.333;
axial: 50 + 1,000 = 1,050.
"""

from __future__ import annotations

import numpy as np
import pytest

from flight.vehicle import (
    CatalogError, Engine, MassModel, Structure, Tank, Vehicle, build_vehicle, tank_flow_kg_s, to_stage,
)

G0 = 9.80665


def _structure(name, mass, com, inertia=(0.0, 0.0, 0.0)):
    return Structure(name=name, mass_kg=mass, com_m=np.array(com, dtype=float), inertia_kg_m2=np.diag(inertia))


def _tank(name="main", capacity=4_000.0, radius=1.0, length=2.0, aft=(0.0, 0.0, 0.5)):
    return Tank(name=name, capacity_kg=capacity, radius_m=radius, length_m=length, aft_end_m=np.array(aft))


def _engine(name, thrust, isp, feeds):
    return Engine(name=name, position_m=np.zeros(3), axis=np.array([0.0, 0.0, 1.0]), thrust_n=thrust,
                  isp_vac_s=isp, throttle_min=0.4, throttle_max=1.0, swivel_limit_deg=8.0, feeds=feeds)


def _vehicle(structures, tanks=(), engines=()):
    return Vehicle(vehicle_id="test", name="Test", tier="flown", structures=tuple(structures),
                   tanks=tuple(tanks), engines=tuple(engines))


LANDER = _vehicle([_structure("body", 1_000.0, (0.0, 0.0, 2.0), (100.0, 100.0, 50.0))], [_tank()])


@pytest.mark.parametrize(
    "load, mass, com_z, across, axial",
    [
        (0.0, 1_000.0, 2.0, 100.0, 50.0),
        (2_000.0, 3_000.0, 4.0 / 3.0, 1_433.3333333333, 1_050.0),
        (4_000.0, 5_000.0, 1.6, 2_633.3333333333, 2_050.0),
    ],
)
def test_mass_centre_and_inertia_follow_the_fill(load, mass, com_z, across, axial) -> None:
    props = MassModel(LANDER).at(np.array([load]))
    assert props.mass_kg == pytest.approx(mass, rel=1e-12)
    assert props.com_m == pytest.approx([0.0, 0.0, com_z], abs=1e-12)
    assert props.inertia_kg_m2 == pytest.approx(np.diag([across, across, axial]), abs=1e-9)


def test_off_axis_masses_give_the_cross_product_of_inertia() -> None:
    """Two 1 kg points at (1, 0, 1) and (-1, 0, -1): centre at the origin; each adds
    |d|^2 E - d d^T = [[1, 0, -1], [0, 2, 0], [-1, 0, 1]], so Ixz = -2."""
    pair = _vehicle([_structure("a", 1.0, (1.0, 0.0, 1.0)), _structure("b", 1.0, (-1.0, 0.0, -1.0))])
    props = MassModel(pair).at(np.zeros(0))
    assert props.com_m == pytest.approx([0.0, 0.0, 0.0], abs=1e-15)
    assert props.inertia_kg_m2 == pytest.approx(np.array([[2.0, 0.0, -2.0], [0.0, 4.0, 0.0], [-2.0, 0.0, 2.0]]))


@pytest.mark.parametrize("load", [-1.0, 4_000.5, float("nan")])
def test_a_load_outside_the_tank_is_refused(load: float) -> None:
    with pytest.raises(ValueError):
        MassModel(LANDER).at(np.array([load]))


# Two engines: 20,000 N at 320 s draws 6.373226 kg/s from tank a; 10,000 N at 380 s
# draws 2.683464 kg/s split evenly between a and b.
TWIN = _vehicle(
    [_structure("body", 1_000.0, (0.0, 0.0, 2.0))],
    [_tank("a"), _tank("b", aft=(0.0, 0.0, 3.0))],
    [_engine("big", 20_000.0, 320.0, (("a", 1.0),)), _engine("small", 10_000.0, 380.0, (("a", 0.5), ("b", 0.5)))],
)


def test_each_tank_is_drained_by_the_engines_that_feed_it() -> None:
    assert tank_flow_kg_s(TWIN) == pytest.approx([7.714958190, 1.341731859], rel=1e-9)
    assert tank_flow_kg_s(TWIN, throttle=0.5) == pytest.approx([3.857479095, 0.670865930], rel=1e-9)


def test_the_stage_export_uses_total_thrust_over_total_flow() -> None:
    """30,000 N / (20,000 / 320 + 10,000 / 380) N/s = 337.778 s, not the 350 s average."""
    stage = to_stage(TWIN, np.array([3_000.0, 1_500.0]))
    assert stage.name == "Test"
    assert stage.dry_mass_kg == 1_000.0
    assert stage.propellant_mass_kg == 4_500.0
    assert stage.isp_s == pytest.approx(337.7777778, rel=1e-9)


def test_the_builder_makes_a_vehicle_from_plain_parts_with_no_catalog() -> None:
    """TWIN's parts, handed over with no catalog file and no sources: the built vehicle
    drains its tanks at the hand-worked rates above and weighs 1,000 kg dry.
    Rejects: a builder that needs sourced records, or that drops a part."""
    built = build_vehicle("twin", "Twin", "fiction", TWIN.structures, TWIN.tanks, TWIN.engines)
    assert (built.vehicle_id, built.name, built.tier, built.sources) == ("twin", "Twin", "fiction", {})
    assert tank_flow_kg_s(built) == pytest.approx([7.714958190, 1.341731859], rel=1e-9)
    assert MassModel(built).dry_mass == 1_000.0


@pytest.mark.parametrize(
    "thrust, isp, code, field",
    [
        (0.0, 320.0, "thrust_not_positive", "thrust_n"),
        (-20_000.0, 320.0, "thrust_not_positive", "thrust_n"),
        (float("nan"), 320.0, "thrust_not_positive", "thrust_n"),
        (20_000.0, 0.0, "isp_not_positive", "isp_vac_s"),
        (20_000.0, -320.0, "isp_not_positive", "isp_vac_s"),
    ],
)
def test_the_builder_refuses_an_engine_with_no_thrust_or_no_exhaust_speed(thrust, isp, code, field) -> None:
    """Mass flow is thrust / (g0 * isp): a zero isp divides by zero and a zero thrust
    drains nothing. The faulty engine is the second, so the path must name it.
    Mutations caught: the check removed; `>= 0` in place of `> 0` (the two zero rows)."""
    engines = (TWIN.engines[0], _engine("bad", thrust, isp, (("a", 1.0),)))
    with pytest.raises(CatalogError) as caught:
        build_vehicle("test", "Test", "flown", TWIN.structures, TWIN.tanks, engines)
    assert (caught.value.code, caught.value.path) == (code, f"test.engines[1].{field}")


@pytest.mark.parametrize(
    "feeds, code",
    [((("header", 1.0),), "unknown_tank"), ((("a", 0.7), ("b", 0.2)), "feed_shares_not_one")],
)
def test_the_builder_runs_the_feed_checks_itself(feeds, code) -> None:
    """A ship that does not come from a catalog file gets the same two feed checks.
    Mutation caught: the checks left in the catalog loader only."""
    with pytest.raises(CatalogError) as caught:
        build_vehicle("test", "Test", "flown", TWIN.structures, TWIN.tanks, (_engine("bad", 20_000.0, 320.0, feeds),))
    assert (caught.value.code, caught.value.path) == (code, "test.engines[0].feeds")
