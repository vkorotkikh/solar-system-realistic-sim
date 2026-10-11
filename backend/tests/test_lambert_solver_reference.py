from __future__ import annotations

import math

import pytest

from data.bodies import ALL_BODIES
from mission.orbital import au_per_day_to_km_per_sec, vector_length, vector_sub
from trajectory import solve_direct_lambert
import trajectory.lambert as lambert_module
from trajectory.lambert import (
    compute_lambert_leg_from_state_vectors,
    solve_lambert_universal,
)


REFERENCE_CASES = [
    {
        "id": "earth_mars_2024_fixed_endpoints",
        "r1": [0.9120457741704595, 0.4017022899591658, -2.830441325259657e-05],
        "r2": [-1.607847787605373, -0.3025050116456996, 0.03308892347008972],
        "planet_v1": [-0.007212521515210686, 0.01567281442891806, -1.541071427312292e-06],
        "planet_v2": [0.003109828453605448, -0.01255618988918836, -0.0003393940223853737],
        "tof_days": 260.0,
        "expected_total_dv_km_s": 7.639904701677509,
        "expected_transfer_angle_deg": 166.8345336204948,
    },
    {
        "id": "earth_venus_2024_fixed_endpoints",
        "r1": [-0.9824376247640041, -0.1808935193495299, 1.84020766894128e-05],
        "r2": [-0.6838264169899463, 0.2184413585854887, 0.04245735222015213],
        "planet_v1": [0.002829427155196596, -0.01698317917619136, 1.234430075466624e-06],
        "planet_v2": [-0.006250980526896094, -0.01935973001633599, 9.480654340837796e-05],
        "tof_days": 120.0,
        "expected_total_dv_km_s": 39.98888538847343,
        "expected_transfer_angle_deg": 331.66548252421484,
    },
    {
        "id": "earth_jupiter_2024_fixed_endpoints",
        "r1": [0.008151276475401696, 0.9837058799134961, -5.499713147485686e-05],
        "r2": [-2.789614808707851, 4.469251058607579, 0.04384845796838015],
        "planet_v1": [-0.01748053011622634, 7.195553578930532e-05, -5.42433363337878e-07],
        "planet_v2": [-0.006495102834922474, -0.003646773713444555, 0.0001604466728075558],
        "tof_days": 900.0,
        "expected_total_dv_km_s": 51.63443026920253,
        "expected_transfer_angle_deg": 32.44949396638357,
    },
]


@pytest.mark.parametrize("case", REFERENCE_CASES, ids=[case["id"] for case in REFERENCE_CASES])
def test_lambert_solver_matches_fixed_endpoint_reference_cases(case: dict) -> None:
    solution = solve_lambert_universal(case["r1"], case["r2"], case["tof_days"], prograde=True)

    assert solution is not None
    assert solution["revolutions"] == 0
    assert solution["pathSense"] == "prograde"
    assert solution["rootResidualDays"] < 2e-5
    assert solution["transferAngleDeg"] == pytest.approx(case["expected_transfer_angle_deg"])

    delta_v_depart = au_per_day_to_km_per_sec(
        vector_length(vector_sub(solution["v1"], case["planet_v1"]))
    )
    delta_v_arrive = au_per_day_to_km_per_sec(
        vector_length(vector_sub(case["planet_v2"], solution["v2"]))
    )
    total_delta_v = delta_v_depart + delta_v_arrive
    assert total_delta_v == pytest.approx(case["expected_total_dv_km_s"], rel=0.0, abs=2e-6)


def test_lambert_solver_rejects_an_exhausted_uncertified_root() -> None:
    case = REFERENCE_CASES[0]

    solution = solve_lambert_universal(
        case["r1"],
        case["r2"],
        case["tof_days"],
        prograde=True,
        max_iter=0,
        tol_days=1e-12,
    )

    assert solution is None


@pytest.mark.parametrize("entry_point", ["solver", "state_vectors"])
def test_lambert_vector_validation_reads_at_most_four_values(entry_point: str) -> None:
    consumed = 0

    def poison_vector():
        nonlocal consumed
        while True:
            consumed += 1
            if consumed > 4:
                raise AssertionError("Lambert validation consumed an unbounded vector")
            yield float(consumed)

    with pytest.raises(ValueError, match="three finite values"):
        if entry_point == "solver":
            solve_lambert_universal(poison_vector(), [1.0, 0.0, 0.0], 100.0)
        else:
            compute_lambert_leg_from_state_vectors(
                poison_vector(),
                [0.0, 1.0, 0.0],
                [1.0, 0.0, 0.0],
                [0.0, 1.0, 0.0],
                100.0,
            )

    assert consumed == 4


def test_lambert_solver_meets_a_strict_time_of_flight_certificate() -> None:
    case = REFERENCE_CASES[1]
    tolerance_days = 1e-10

    solution = solve_lambert_universal(
        case["r1"],
        case["r2"],
        case["tof_days"],
        prograde=True,
        max_iter=100,
        tol_days=tolerance_days,
    )

    assert solution is not None
    assert solution["rootBracketed"] is True
    assert solution["rootResidualDays"] <= tolerance_days


def test_lambert_solver_rejects_close_but_unbracketed_coarse_sample(monkeypatch) -> None:
    case = REFERENCE_CASES[0]
    requested_tof = 260.0

    monkeypatch.setattr(
        lambert_module,
        "_tof_from_z",
        lambda *_args, **_kwargs: (requested_tof + 0.5, 1.0, 0.5, 1.0 / 6.0),
    )

    assert (
        solve_lambert_universal(
            case["r1"],
            case["r2"],
            requested_tof,
        )
        is None
    )


@pytest.mark.parametrize(
    "kwargs",
    [
        {"mu": 0.0},
        {"mu": -1.0},
        {"mu": float("nan")},
        {"tol_days": float("inf")},
        {"tol_days": 1.0},
        {"max_iter": True},
        {"max_iter": 513},
    ],
)
def test_lambert_solver_rejects_unsafe_numerical_controls(kwargs: dict) -> None:
    case = REFERENCE_CASES[0]

    with pytest.raises(ValueError):
        solve_lambert_universal(case["r1"], case["r2"], case["tof_days"], **kwargs)


def test_state_vector_wrapper_rejects_nonfinite_velocity() -> None:
    case = REFERENCE_CASES[0]

    with pytest.raises(ValueError, match="start_velocity"):
        lambert_module.compute_lambert_leg_from_state_vectors(
            case["r1"],
            [float("nan"), 0.0, 0.0],
            case["r2"],
            case["planet_v2"],
            case["tof_days"],
        )


@pytest.mark.parametrize("tof_days", [0.1, 1.0])
def test_very_short_short_way_tof_is_a_certified_hyperbolic_solution(tof_days: float) -> None:
    # These used to return None because the z grid stopped short of the hyperbolic roots. Every
    # positive TOF has a short-way solution (TOF -> 0 where y -> 0); it must still be certified.
    case = REFERENCE_CASES[0]

    solution = solve_lambert_universal(case["r1"], case["r2"], tof_days)

    assert solution is not None
    assert solution["rootBracketed"] is True
    assert solution["rootResidualDays"] <= 1.0e-4
    assert solution["z"] < 0.0


@pytest.mark.parametrize("tof_days", [1.0, 5.0, 20.0])
def test_sun_diving_arcs_are_not_solutions(tof_days: float) -> None:
    # A point mass allows any TOF: a near-parabolic arc sweeps Earth -> Venus the long way (331.7
    # deg) in a day by passing 0.0007 R_sun from the centre. Perihelia of 0.0007-0.34 R_sun are
    # inside the Sun, so these are explicit Nones; at 60 d perihelion is 6.4 R_sun and it solves.
    case = REFERENCE_CASES[1]
    assert case["expected_transfer_angle_deg"] > 180.0

    assert solve_lambert_universal(case["r1"], case["r2"], tof_days) is None
    assert solve_lambert_universal(case["r1"], case["r2"], tof_days, min_periapsis_au=0.0) is not None
    assert solve_lambert_universal(case["r1"], case["r2"], 60.0) is not None


@pytest.mark.parametrize("tof_days", [2.0, 5.0, 10.0])
def test_short_tof_solution_must_still_be_bracketed_and_certified(tof_days: float) -> None:
    case = REFERENCE_CASES[0]

    solution = solve_lambert_universal(case["r1"], case["r2"], tof_days)

    assert solution is not None
    assert solution["rootBracketed"] is True
    assert solution["rootResidualDays"] <= 1.0e-4


@pytest.mark.parametrize("tof_days", [2.0, 5.0, 10.0])
def test_original_short_tof_wrapper_regression_returns_only_certified_solutions(tof_days: float) -> None:
    departure_jd = 2_460_600.5

    result = solve_direct_lambert(
        ALL_BODIES,
        from_id="earth",
        to_id="mars",
        departure_jd=departure_jd,
        arrival_jd=departure_jd + tof_days,
        ephemeris_provider="kepler",
    )

    # The original regression returned an uncertified coarse sample. These short Earth-Mars arcs
    # do exist (fast hyperbolas, ~50 deg); whatever comes back must hit the requested TOF.
    solution = result["solution"]
    assert solution is not None, result.get("error")
    assert solution["rootBracketed"] is True
    assert solution["rootResidualDays"] <= 1.0e-4
    assert solution["computedTofDays"] == pytest.approx(tof_days, abs=1.0e-4)


AU_DAY_TO_KM_S = 149_597_870.7 / 86_400.0


def _departure_vinf_kms(solution: dict, circular_speed_au_day: float) -> float:
    vx, vy, vz = solution["v1"]
    return AU_DAY_TO_KM_S * math.sqrt(vx**2 + (vy - circular_speed_au_day) ** 2 + vz**2)


# Izzo 2015 (lamberthub 1.0.0) departure v_inf for 1.0 -> 1.1 AU, 90 deg, 900 d, relative to the
# circular velocity at r1 (agent-notes/CODEBASE_AUDIT_2026-09-24.md section 7.6).
@pytest.mark.parametrize(
    ("revolutions", "branch", "expected_kms"),
    [(0, "low", 33.200), (1, "low", 8.138), (1, "high", 27.070), (2, "low", 1.373), (2, "high", 19.171)],
)
def test_multi_revolution_solutions_match_izzo_2015(revolutions: int, branch: str, expected_kms: float) -> None:
    solution = solve_lambert_universal(
        [1.0, 0.0, 0.0], [0.0, 1.1, 0.0], 900.0, revolutions=revolutions, branch=branch, tol_days=1e-8
    )

    assert solution is not None
    assert solution["revolutions"] == revolutions
    assert _departure_vinf_kms(solution, math.sqrt(lambert_module.MU_SUN_AU3_DAY2)) == pytest.approx(
        expected_kms, abs=5e-4
    )


def test_two_revolution_low_path_closes_under_independent_two_body_integration() -> None:
    r1, r2, tof = [1.0, 0.0, 0.0], [0.0, 1.1, 0.0], 900.0
    solution = solve_lambert_universal(r1, r2, tof, revolutions=2, branch="low", tol_days=1e-10)
    assert solution is not None
    mu = lambert_module.MU_SUN_AU3_DAY2

    def accel(p: list[float]) -> list[float]:
        r3 = math.hypot(*p) ** 3
        return [-mu * c / r3 for c in p]

    position, velocity = list(r1), list(solution["v1"])
    steps = 36_000
    h = tof / steps
    for _ in range(steps):  # classical RK4, independent of the Lambert math
        k1v = accel(position); k1r = velocity
        k2v = accel([position[i] + 0.5 * h * k1r[i] for i in range(3)]); k2r = [velocity[i] + 0.5 * h * k1v[i] for i in range(3)]
        k3v = accel([position[i] + 0.5 * h * k2r[i] for i in range(3)]); k3r = [velocity[i] + 0.5 * h * k2v[i] for i in range(3)]
        k4v = accel([position[i] + h * k3r[i] for i in range(3)]); k4r = [velocity[i] + h * k3v[i] for i in range(3)]
        position = [position[i] + h / 6 * (k1r[i] + 2 * k2r[i] + 2 * k3r[i] + k4r[i]) for i in range(3)]
        velocity = [velocity[i] + h / 6 * (k1v[i] + 2 * k2v[i] + 2 * k3v[i] + k4v[i]) for i in range(3)]

    assert math.dist(position, r2) * 149_597_870.7 < 50.0  # km


@pytest.mark.parametrize(("tof_days", "expected_speed_kms"), [(10.0, 229.5), (5.0, 458.3)])
def test_fast_hyperbolic_transfers_are_found(tof_days: float, expected_speed_kms: float) -> None:
    # 1.0 -> 1.5 AU over 60 deg: the old 0.25-wide z grid stepped over the y = 0 boundary where
    # these roots live and reported no solution. Izzo 2015 gives |v1| = 229.5 and 458.3 km/s.
    r2 = [1.5 * math.cos(math.radians(60.0)), 1.5 * math.sin(math.radians(60.0)), 0.0]
    solution = solve_lambert_universal([1.0, 0.0, 0.0], r2, tof_days)

    assert solution is not None
    assert AU_DAY_TO_KM_S * math.hypot(*solution["v1"]) == pytest.approx(expected_speed_kms, abs=0.1)


def test_zero_revolution_branch_stays_below_four_pi_squared() -> None:
    # Very long single-arc TOF: the root sits just below 4 pi^2. The old grid ran to z = 40 and
    # could bracket across the singularity into the one-revolution branch while labelling it 0-rev.
    solution = solve_lambert_universal([1.0, 0.0, 0.0], [0.0, 1.1, 0.0], 40_000.0)

    assert solution is not None
    assert solution["revolutions"] == 0
    assert solution["z"] < lambert_module.FOUR_PI_SQUARED
