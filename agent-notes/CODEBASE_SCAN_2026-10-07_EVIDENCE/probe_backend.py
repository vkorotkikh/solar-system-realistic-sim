"""Offline audit probes. Run from repo root with a requirements + httpx2 environment.

This reports observations; it is not a product regression suite or a passing gate.
Network access is refused so synthetic timings cannot be mistaken for live delivery.
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

def no_network(*args, **kwargs):
    raise OSError("Network disabled by audit probe")

urllib.request.urlopen = no_network

import numpy as np
from sim import pfss_magnetogram as pfss
from benchmark.accuracy import benchmark_against_references
from mission.vehicle_service import VehicleService, default_vehicle
from mission.risk_service import RiskService
from fastapi.testclient import TestClient
from starlette.requests import Request
import server

results = {}
x = np.array([0.5])
p = pfss._associated_legendre(4, x)
quadrature_x, quadrature_w = np.polynomial.legendre.leggauss(128)
polynomials = pfss._associated_legendre(4, quadrature_x)
results["pfss_basis"] = {
    "P2_at_half": float(p[(2, 0)][0]),
    "expected_P2": -0.125,
    "P3_at_half": float(p[(3, 0)][0]),
    "expected_P3": -0.4375,
    "integral_P0_P2": float(np.sum(quadrature_w * polynomials[(0, 0)] * polynomials[(2, 0)])),
    "expected_cross_integral": 0.0,
}

cards = ["SIMPLE  =                    T", "BITPIX  =                  -32",
         "NAXIS   =                    2", "NAXIS1  =                   12",
         "NAXIS2  =                   12", "END"]
header = "".join(card.ljust(80) for card in cards).ljust(2880).encode("ascii")
data = np.arange(144, dtype=">f4").tobytes()
fits = header + data + b"\0" * ((-len(data)) % 2880)
try:
    parsed = pfss._parse_fits_primary_image(fits)
    results["fits_reader"] = {"shape": list(parsed.shape) if parsed is not None else None}
except Exception as exc:
    results["fits_reader"] = {"error": type(exc).__name__, "message": str(exc), "numpy": np.__version__}

report = benchmark_against_references(server.ALL_BODIES, ephemeris_provider="kepler")
results["benchmark"] = {key: report.get(key) for key in (
    "scenarioCount", "comparableScenarioCount", "validationCoverage", "meanAbsErrorKmS", "passRate")}

def request(headers):
    return Request({"type": "http", "method": "GET", "path": "/solar/physics",
                    "headers": [(key.encode(), value.encode()) for key, value in headers.items()],
                    "client": ("127.0.0.1", 12345)})

server._solar_physics_rate_locks.clear()
accepted = 0
for i in range(50):
    server._enforce_solar_request_rate_limit(request({"x-forwarded-for": f"198.51.100.{i}"}))
    accepted += 1
results["solar_rate_identity"] = {"accepted_rotating_xff": accepted,
    "identities_retained": len(server._solar_physics_rate_locks),
    "configured_limit": server.SOLAR_PHYSICS_RATE_LIMIT_PER_WINDOW,
    "api_keys_configured": bool(server.SOLAR_PHYSICS_API_KEYS)}
server._solar_physics_rate_locks.clear()
for i in range(50):
    server._enforce_solar_request_rate_limit(request({"x-api-key": f"unvalidated-{i}"}))
results["solar_rate_identity"]["identities_from_unvalidated_keys"] = len(server._solar_physics_rate_locks)

with TestClient(server.app, raise_server_exceptions=False) as client:
    cors = client.options("/solar/physics", headers={"Origin": "http://localhost:4173",
                          "Access-Control-Request-Method": "GET"})
    results["preview_cors"] = {"status": cors.status_code,
        "allow_origin": cors.headers.get("access-control-allow-origin")}

budget = VehicleService().evaluate_burn_budget(default_vehicle(), payload_mass_kg=1000,
                                              burns_km_s=[100.0, 100.0])
risk = RiskService().run_monte_carlo(base_total_delta_v_km_s=200.0, base_total_time_days=100,
    base_returned_payload_kg=1000, base_arrival_jd=2460000,
    base_propellant_margin_kg=budget["propellantMarginKg"],
    ephemeris_sigma_fraction=0, thrust_sigma_fraction=0, extraction_sigma_fraction=0)
results["infeasible_risk_service_composition"] = {
    "vehicle_feasible": budget["feasible"], "propellant_margin_kg": budget["propellantMarginKg"],
    "failureProbability": risk["failureProbability"],
    "scope": "Service composition with zero uncertainty; not a full mission endpoint result"}

_, assimilation, _ = server.SOLAR_PHYSICS_MODEL._apply_realtime_forcing(
    0.8, "hybrid", {"combined_activity_proxy": 0.1, "silso": {"date": "2000-01-01"}})
results["zero_confidence_assimilation"] = {key: assimilation[key] for key in
    ("applied", "observed_confidence", "blend_weight", "blended_activity_index")}

pfss.fetch_gong_synoptic_map = lambda *args, **kwargs: None
started = time.perf_counter()
state = server.SOLAR_PHYSICS_MODEL.sample_state(2461320.12345, fidelity="high", max_features=180,
                                              forcing="hybrid", realtime_data=None)
results["solar_cold_offline"] = {"seconds": time.perf_counter() - started,
    "frontend_timeout_seconds": 2.6, "network": "disabled; GONG unavailable; no realtime data"}
print(json.dumps(results, indent=2))
