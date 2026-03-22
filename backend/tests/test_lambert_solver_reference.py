from __future__ import annotations

import pytest

from mission.orbital import au_per_day_to_km_per_sec, vector_length, vector_sub
from trajectory.lambert import solve_lambert_universal


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
