"""Offline external-model/ACE comparison, never an application calibration.

Uses exact UTC times and the same spacecraft; does not tune a lag, interpolate,
substitute the currently active spacecraft, or treat missing speeds as zero.
The optional ballistic calculation is an explicit constant-speed travel-time
assumption audit. It is not the application's missing heliospheric solver.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
RETAINED = ROOT / "agent-notes/solar-reference-2026-10-14"
EVIDENCE = ROOT / "agent-notes/SCN041_CLOSURE_2026-11-02_EVIDENCE"
OLD_SHA = "3eeb807edca46fc8206387f40797de80aaf59ca4ff667ee60255a7b04c6755c0"
NEW_SHA = "6960de2109f46e9f340b8d102e98f87ff71ca798a0c569004447df28e13fee19"
NARROW_SHA = "e863bd816f0027b57a60ddfc89981c828f8523e67c49aeeee816c2afd72d5def"
OBS_SHA = "12f89300b5c7dc67f3702fbd1ba459d8df3b531ff1d18b5f67ea915170e3fc3d"


def _positive_number(value):
    return type(value) in (int, float) and math.isfinite(value) and value > 0


def _utc(value):
    if not isinstance(value, str):
        raise ValueError("time must be a UTC timestamp")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    # These two providers document their unzoned ISO timestamps as UTC.
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def compare_exact_times(forecast, observations):
    satellite = forecast["sat"]
    if not isinstance(satellite, str) or not satellite:
        raise ValueError("forecast must identify its spacecraft")
    predicted, observed = {}, {}
    invalid_prediction = invalid_observation = other_spacecraft = 0
    for row in forecast["solarwind"]:
        if not _positive_number(row["Vp"]):
            invalid_prediction += 1
            continue
        time = _utc(row["time"])
        if time in predicted:
            raise ValueError("duplicate prediction time")
        predicted[time] = float(row["Vp"])
    for row in observations:
        if row["source"] != satellite:
            other_spacecraft += 1
            continue
        if (type(row["overall_quality"]) is not int or row["overall_quality"] != 0
                or not _positive_number(row["proton_speed"])):
            invalid_observation += 1
            continue
        time = _utc(row["time_tag"])
        if time in observed:
            raise ValueError("duplicate observation time")
        observed[time] = float(row["proton_speed"])
    times = sorted(predicted.keys() & observed.keys())
    pairs = [{"time_utc": time, "predicted_speed_kms": predicted[time],
              "observed_speed_kms": observed[time],
              "residual_kms": predicted[time] - observed[time]} for time in times]
    residuals = [pair["residual_kms"] for pair in pairs]
    metrics = None if not pairs else {
        "bias": math.fsum(residuals) / len(pairs),
        "mae": math.fsum(map(abs, residuals)) / len(pairs),
        "rmse": math.hypot(*residuals) / math.sqrt(len(pairs)),
    }
    return {
        "input_map": forecast["input_map"], "spacecraft": satellite,
        "comparison_policy": "exact_UTC_same_spacecraft_quality_zero_no_time_shift_v1",
        "observation_active_policy": "explicit spacecraft; active flag is not a science-quality flag",
        "valid_prediction_samples": len(predicted),
        "valid_observation_samples": len(observed),
        "invalid_prediction_samples": invalid_prediction,
        "invalid_observation_samples": invalid_observation,
        "other_spacecraft_samples": other_spacecraft,
        "matched_samples": len(pairs), "pairs": pairs, "metrics_kms": metrics,
        "unmatched_prediction_times_utc": sorted(predicted.keys() - observed.keys()),
        "application_speed_calibrated": False,
    }


def ballistic_travel_seconds(speed_kms, source_radius_km, target_radius_km):
    """Radial travel at a specified constant speed, with no acceleration/SIRs."""
    if (not all(_positive_number(v) for v in (speed_kms, source_radius_km, target_radius_km))
            or target_radius_km <= source_radius_km):
        raise ValueError("ballistic inputs must be finite positive with target beyond source")
    travel = (target_radius_km - source_radius_km) / speed_kms
    if not math.isfinite(travel):
        raise ValueError("ballistic travel time is not finite")
    return travel


def _load(path, expected_sha):
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected_sha:
        raise ValueError(f"pinned input hash mismatch: {path.name}")
    return json.loads(raw)


def build_report():
    old = _load(RETAINED / "nasa_wsa_ace.json", OLD_SHA)
    new = _load(EVIDENCE / "nasa_wsa_agong_ace_same_query_20261010_14.json", NEW_SHA)
    narrow = _load(EVIDENCE / "nasa_wsa_agong_ace_20261013_14.json", NARROW_SHA)
    observations = _load(RETAINED / "noaa_rtsw_wind_1m.json", OBS_SHA)
    revision_time = "2026-10-13T00:00:00"
    old_value = next(row["Vp"] for row in old["solarwind"] if row["time"] == revision_time)
    new_value = next(row["Vp"] for row in new["solarwind"] if row["time"] == revision_time)
    narrow_value = next(row["Vp"] for row in narrow["solarwind"] if row["time"] == revision_time)
    # IAU nominal solar radius and exact astronomical unit, both expressed in km.
    solar_radius_km, au_km = 695700.0, 149597870.7
    return {
        "schema": "scn041_external_speed_and_travel_audit_v1",
        "source_hashes": {"old_forecast": OLD_SHA, "new_forecast": NEW_SHA,
                          "narrow_query_forecast": NARROW_SHA, "observation": OBS_SHA},
        "original_retained_comparison": compare_exact_times(old, observations),
        "retrospective_external_comparison": compare_exact_times(new, observations),
        "historical_revision": {"time_utc": revision_time + "Z", "original_speed_kms": old_value,
                                "new_speed_kms": new_value, "identical_query_parameters": True,
                                "issue_time_available": False},
        "query_window_sensitivity": {"time_utc": revision_time + "Z",
                                     "oct10_to_oct14_speed_kms": new_value,
                                     "oct13_to_oct14_speed_kms": narrow_value,
                                     "interpretation": "Same nominal point differs by query window; the API does not specify aggregation bin boundaries."},
        "ballistic_assumption_audit": {
            "model": "constant_radial_speed_no_acceleration_no_stream_interaction",
            "source_radius_solar": 2.51, "target_radius_au": 1.0,
            "target_is_actual_ACE_ephemeris": False,
            "nominal_solar_radius_km": solar_radius_km, "astronomical_unit_km": au_km,
            "trial_speeds": [{"speed_kms": speed,
                              "travel_days": ballistic_travel_seconds(speed, 2.51 * solar_radius_km, au_km) / 86400}
                             for speed in (250, 400, 800)],
            "used_to_shift_observations_or_optimize_a_lag": False,
        },
        "application_speed_calibrated": False,
        "application_one_au_propagation_validated": False,
        "limitations": [
            "Three same-spacecraft point comparisons of a retrospective external AGONG ensemble product; no application prediction is compared.",
            "The forecast source is ADAPT/GONG, not the retained GONG_Z map, and has no individual map or ensemble-member identity.",
            "The historical API response changed between captures and supplies no forecast issuance time; operational lead-time skill is not established.",
            "Changing the query start also changes a boundary timestamp's ensemble-average speed; the exact query and response bytes must be retained.",
            "No speed acceptance budget was preregistered. These descriptive residuals do not define a pass.",
            "A source-surface speed is not an independently observed speed at ACE. The application lacks an SCS/radius adapter, target ephemeris, and validated propagation.",
            "The constant-speed travel calculation is an assumption audit, not an implemented forecast or an observational validation.",
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    encoded = json.dumps(build_report(), indent=2, sort_keys=True, allow_nan=False) + "\n"
    if args.output:
        args.output.write_text(encoded)
    print(encoded, end="")
