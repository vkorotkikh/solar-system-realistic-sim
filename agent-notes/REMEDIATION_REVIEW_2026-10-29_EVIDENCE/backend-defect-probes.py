"""Retained reproductions: a true result confirms the baseline defect exists."""
import json
import math

from mission.mining_service import MiningService
from mission.risk_service import RiskService
from sim.solar_active_regions import (
    CYCLE_25_START_JD,
    CYCLE_DAYS,
    build_active_regions,
    region_lifetime,
    region_polarity_dirs,
)

results = []
risk = RiskService().run_monte_carlo(
    base_total_delta_v_km_s=3,
    base_total_time_days=900,
    base_returned_payload_kg=1000,
    base_arrival_jd=2461000.5,
    reclose=lambda factor, cargo: {"feasible": False, "propellantMarginKg": -1},
    samples=30,
    seed=3,
    ephemeris_sigma_fraction=0,
    thrust_sigma_fraction=0,
    extraction_sigma_fraction=0,
)
results.append({
    "id": "SCN-020",
    "failureProbability": risk["failureProbability"],
    "returnedPayloadKg": risk["envelopes"]["returnedPayloadKg"],
    "expectedReturnedPayloadKg": 0,
    "defectReproduced": risk["failureProbability"] == 1
    and risk["envelopes"]["returnedPayloadKg"]["p50"] == 1000,
})

mining = MiningService().evaluate_campaign(
    target_body_id="probe",
    mining_days=10,
    ore_grade=1,
    extraction_rate_kg_day=100,
    refining_yield=1,
    storage_loss_rate_per_day=0.1,
    available_power_kw=100,
    power_required_kw_per_kg_day=1,
    transport_delay_days=0,
)
expected = 100 * (-math.expm1(-0.1 * 10)) / 0.1
results.append({
    "id": "SCN-019",
    "productionKgDay": 100,
    "miningDays": 10,
    "storageLossRatePerDay": 0.1,
    "actualMiningEndStockKg": mining["storablePayloadKg"],
    "constantProductionIntegratedStockKg": expected,
    "defectReproduced": abs(mining["storablePayloadKg"] - expected) > 200,
})

regions = build_active_regions(base_tube_count=64)
cases = []
for cycle, hemisphere, expected_sign in [
    (24, 1, -1), (24, -1, 1),
    (25, 1, 1), (25, -1, -1),
    (26, 1, -1), (26, -1, 1),
]:
    region = next(r for r in regions if r.hemisphere_sign == hemisphere)
    jd = CYCLE_25_START_JD + (cycle - 25) * CYCLE_DAYS + 300
    _, birth, lifetime = region_lifetime(region, jd)
    actual = region_polarity_dirs(region, birth + lifetime / 2)[-1]
    cases.append({
        "cycle": cycle,
        "hemisphere": hemisphere,
        "expectedLeadingSign": expected_sign,
        "actualLeadingSign": actual,
    })
results.append({
    "id": "SCN-075",
    "cases": cases,
    "reference": "https://ntrs.nasa.gov/api/citations/20250006012/downloads/pivot_250521_submitted.pdf",
    "defectReproduced": all(
        row["actualLeadingSign"] == -row["expectedLeadingSign"] for row in cases
    ),
})

print(json.dumps(results, indent=2))
assert all(result["defectReproduced"] for result in results)
