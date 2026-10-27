"""Offline verification probes at HEAD for SCN-012/019/020/045/052/053/056/063/064.
Run: cd <repo> && PYTHONPATH=backend /tmp/solar-pr3-backend-venv/bin/python agent-notes/ISSUE_TRACKER_MERGED_2026-10-10_EVIDENCE/mission/probe_head.py
Exit 0 = observations captured. No network (urlopen stubbed), no product writes.
"""
import json, math, subprocess, sys, threading, time, urllib.request

HEAD = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
out = {"head": HEAD}

def no_network(*a, **k):
    raise RuntimeError("network disabled by verifier probe")
urllib.request.urlopen = no_network

from mission.vehicle_service import VehicleService, VehicleDefinition, StageDefinition, default_vehicle
from mission.risk_service import RiskService
from data.bodies import ALL_BODIES
from benchmark.accuracy import benchmark_against_references, render_accuracy_report_markdown
from sim.rebound_nbody import REBOUNDEngine, SUPPORTED_JD_MAX_TDB, SUPPORTED_JD_MIN_TDB
from mission.epo.config import EpisodeConfig, EpisodeFamily, EpisodeFamilyPolicy
from mission.epo.runners import EpisodeRunner
from trajectory.lambert import solve_lambert_universal, MAX_LAMBERT_REVOLUTIONS
from mission.orbital import MU_SUN_AU3_DAY2
import rebound

# ---- SCN-052 reserve partition
v = VehicleService()
vehicle = VehicleDefinition("single", [StageDefinition("stage", 100, 1000, 300)])
single = v.evaluate_burn_budget(vehicle, payload_mass_kg=100, burns_km_s=[4.8], reserve_fraction=.05)
split = v.evaluate_burn_budget(vehicle, payload_mass_kg=100, burns_km_s=[2.4, 2.4], reserve_fraction=.05)
quarters = v.evaluate_burn_budget(vehicle, payload_mass_kg=100, burns_km_s=[1.2] * 4, reserve_fraction=.05)
out["scn052_reserve_partition"] = {
    "single_4_8": {"feasible": single["feasible"], "unmet": single["totalUnmetDeltaV_km_s"], "used": single["totalPropellantUsedKg"]},
    "two_2_4": {"feasible": split["feasible"], "unmet": split["totalUnmetDeltaV_km_s"], "used": split["totalPropellantUsedKg"],
                "remaining_kg": 1000 - split["totalPropellantUsedKg"]},
    "four_1_2": {"feasible": quarters["feasible"], "used": quarters["totalPropellantUsedKg"], "remaining_kg": 1000 - quarters["totalPropellantUsedKg"]},
    "required_reserve_kg": 50,
}

# ---- SCN-019 cargo in return ledger
empty = v.evaluate_burn_budget(default_vehicle(), payload_mass_kg=6500, burns_km_s=[1.5, 1.0], reserve_fraction=.05)
laden = v.evaluate_burn_budget(default_vehicle(), payload_mass_kg=6500, burns_km_s=[1.5, 1.0], reserve_fraction=.05, cargo_added_kg=[0, 5000])
out["scn019_cargo_ledger"] = {
    "return_burn_prop_empty": empty["burns"][1]["propellantUsedKg"],
    "return_burn_prop_laden_5t": laden["burns"][1]["propellantUsedKg"],
    "cargoAddedKg_reported": laden["burns"][1]["cargoAddedKg"],
}

# ---- SCN-020 infeasible budget -> risk; and propellantMarginKg counting jettisoned fuel
infeasible = v.evaluate_burn_budget(default_vehicle(), payload_mass_kg=1000, burns_km_s=[100, 100])
def reclose(dv_factor, cargo_kg):
    return v.evaluate_burn_budget(default_vehicle(), payload_mass_kg=1000, burns_km_s=[100 * dv_factor, 100 * dv_factor], cargo_added_kg=[0, cargo_kg])
risk = RiskService().run_monte_carlo(base_total_delta_v_km_s=200, base_total_time_days=100, base_returned_payload_kg=1000,
                                     base_arrival_jd=2451645, reclose=reclose, samples=30,
                                     ephemeris_sigma_fraction=0, thrust_sigma_fraction=0, extraction_sigma_fraction=0)
out["scn020_infeasible_risk"] = {
    "feasible": infeasible["feasible"], "unmet_km_s": infeasible["totalUnmetDeltaV_km_s"],
    "propellantMarginKg": infeasible["propellantMarginKg"],
    "onboard_prop_remaining_kg": sum(s["propellant_mass_kg"] - s["propellant_used_kg"] for s in infeasible["stageTelemetry"] if not s["jettisoned"]),
    "all_stages_jettisoned": all(s["jettisoned"] for s in infeasible["stageTelemetry"]),
    "failureProbability": risk["failureProbability"],
    "margin_p50_in_risk_envelope": risk["envelopes"]["propellantMarginKg"]["p50"],
}

# ---- SCN-012 benchmark
r = benchmark_against_references(ALL_BODIES, ephemeris_provider="kepler")
out["scn012_benchmark"] = {k: r.get(k) for k in ["scenarioCount", "comparableScenarioCount", "validationCoverage", "meanAbsErrorKmS", "passRate"]}
out["scn012_benchmark"]["fixedStateReferences"] = {k: r["fixedStateReferences"][k] for k in ["count", "passCount", "maxAbsErrorKmS"]}
out["scn012_benchmark"]["report_lines"] = [l for l in render_accuracy_report_markdown(r).splitlines() if "error" in l.lower() or "coverage" in l.lower() or "Pass rate" in l or "Fixed-state" in l]

# ---- SCN-053 REBOUND step past upper bound
e = REBOUNDEngine(); e.initialize(ALL_BODIES[:10], start_jd=SUPPORTED_JD_MAX_TDB); e.step(1)
try:
    e.set_julian_date(SUPPORTED_JD_MAX_TDB + 1); seek = "accepted"
except ValueError as ex:
    seek = str(ex)
e2 = REBOUNDEngine(); e2.initialize(ALL_BODIES[:10], start_jd=SUPPORTED_JD_MIN_TDB); e2.step(-1)
out["scn053_rebound_step"] = {"max_supported_jd": SUPPORTED_JD_MAX_TDB, "after_step_plus1_jd": e.get_julian_date(),
                              "fidelity_after_step": e.get_state()["fidelity"], "same_epoch_seek": seek,
                              "min_supported_jd": SUPPORTED_JD_MIN_TDB, "after_step_minus1_jd": e2.get_julian_date(),
                              "fidelity_after_neg_step": e2.get_state()["fidelity"]}

# ---- SCN-056 EPO single-family policy
result = {"status": "ok", "recommendation": {"missionScore": -100, "risk": {"failureProbability": .9}}, "verification": {"valid": False}}
family = EpisodeFamily("strict", "audit", EpisodeFamilyPolicy(min_mission_score=100, max_failure_probability=.01, require_verifier_valid=True), (EpisodeConfig("one", "strict", {}),))
runner = EpisodeRunner(); runner.planner = type("FakePlanner", (), {"plan": lambda self, p: result})()
direct = runner.run_family(family).as_dict()
runner2 = EpisodeRunner(); runner2.planner = runner.planner
aggregate = runner2.run_families([family]).to_dict()
out["scn056_epo_policy"] = {"direct_run_family": direct, "run_families": aggregate}

# ---- SCN-064 / SCN-045 Lambert near-antiparallel with independent REBOUND endpoint
n = math.sqrt(MU_SUN_AU3_DAY2); ms = 149597870700 / 86400
rows = []
for degrees in [90, 170, 179, 179.9, 179.99, 179.999, 179.9999, 179.99999, 179.999999, 180, 180.000001, 180.0001, 181, 190, 270]:
    theta = math.radians(degrees); r2 = [math.cos(theta), math.sin(theta), 0]
    if degrees == 180: r2 = [-1, 0, 0]
    sol = solve_lambert_universal([1, 0, 0], r2, theta / n)
    row = {"angle_deg": degrees, "solved": sol is not None}
    if sol:
        sim = rebound.Simulation(); sim.G = MU_SUN_AU3_DAY2; sim.integrator = "ias15"; sim.add(m=1)
        sim.add(m=0, x=1, vx=sol["v1"][0], vy=sol["v1"][1], vz=sol["v1"][2]); sim.integrate(theta / n); p = sim.particles[1]
        row.update({"endpoint_miss_km": math.dist([p.x, p.y, p.z], r2) * 149597870.7,
                    "v1_error_m_s": math.dist(sol["v1"], [0, n, 0]) * ms,
                    "rootResidualDays": sol["rootResidualDays"], "transferAngleDeg": sol["transferAngleDeg"]})
    rows.append(row)
out["scn064_lambert_antiparallel"] = rows
# SCN-045 capability: multi-rev now supported?
mr = solve_lambert_universal([1, 0, 0], [0, 1, 0], 2 * math.pi / n + (math.pi / 2) / n, revolutions=1, branch="low")
out["scn045_capability"] = {"MAX_LAMBERT_REVOLUTIONS": MAX_LAMBERT_REVOLUTIONS, "one_rev_solved": mr is not None,
                            "one_rev_v1_err_m_s": (math.dist(mr["v1"], [0, n, 0]) * ms) if mr else None,
                            "exact_180_returns": "None" if rows[9]["solved"] is False else "solution"}

# ---- SCN-063 Horizons transport stall (urlopen stubbed; no network)
from mission.ephemeris_service import EphemerisService, HORIZONS_CONCURRENCY_LIMIT
from trajectory.budget import PlanningContext
release = threading.Event(); entered = threading.Event(); closed = threading.Event(); calls = []
class LocalResponse:
    def __enter__(self): return self
    def __exit__(self, *a): closed.set()
    def read(self, limit):
        entered.set()
        if len(calls) == 1:
            if not release.wait(1): raise RuntimeError("fail-safe released blocked transport")
        return b"local-body"
def fake_open(request, timeout):
    calls.append({"timeout_s": timeout}); return LocalResponse()
def request_once(label):
    svc = EphemerisService([], provider="horizons", context=PlanningContext.with_timeout(2)); t = time.monotonic()
    try:
        b = svc._run_horizons_request(urllib.request.Request("https://offline.invalid/probe"), timeout_s=.05, body_id="earth", jd=2451545)
        return {"label": label, "elapsed_s": round(time.monotonic() - t, 4), "status": "success", "body": b.decode(), "outbound_calls": len(calls)}
    except Exception as ex:
        return {"label": label, "elapsed_s": round(time.monotonic() - t, 4), "status": type(ex).__name__, "message": str(ex), "outbound_calls": len(calls)}
urllib.request.urlopen = fake_open
try:
    first = request_once("first_stalled_read"); entered.wait(.1)
    second = request_once("second_while_first_blocked")
    release.set(); closed.wait(.5)
    third = request_once("third_after_release")
    out["scn063_transport"] = {"HORIZONS_CONCURRENCY_LIMIT": HORIZONS_CONCURRENCY_LIMIT, "requests": [first, second, third]}
finally:
    release.set(); urllib.request.urlopen = no_network
    for w in threading.enumerate():
        if w.name == "horizons-transport": w.join(timeout=.5)

print(json.dumps(out, indent=1, default=str))
