"""Offline, exact-time ACE forecast/observation comparison; not app calibration.

Preregistered pairing: the existing 2026-10-10..14 AGONG/ACE forecast, no
interpolation or lag search, positive finite speed, NOAA dsflag == 0, exact UTC
hour tags. The forecast's six-hour cadence and observation's hourly product
are retained as distinct sampling definitions. No fitted accuracy threshold.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "agent-notes/solar-reference-2026-10-14"
CAPTURE = ROOT / "agent-notes/solar-wind-overlap-2026-10-14"


def epoch(value: str) -> datetime:
    # Both producer APIs document UTC; their raw JSON omits the suffix.
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def valid_speed(value: object) -> bool:
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value) and value > 0


def compare(forecast: dict, observations: list[dict]) -> dict:
    if forecast.get("sat") != "ACE" or forecast.get("input_map") != "AGONG":
        raise ValueError("expected the declared AGONG/ACE forecast product")
    observed = {}
    for row in observations:
        if row.get("dsflag") != 0 or not valid_speed(row.get("speed")):
            continue
        time = epoch(row["time_tag"])
        if time in observed:
            raise ValueError("duplicate accepted observation timestamp")
        observed[time] = row["speed"]
    pairs, missing = [], []
    seen = set()
    usable = 0
    for row in forecast["solarwind"]:
        time = epoch(row["time"])
        if time in seen:
            raise ValueError("duplicate forecast timestamp")
        seen.add(time)
        if not valid_speed(row.get("Vp")):
            continue
        usable += 1
        if time not in observed:
            missing.append(time.isoformat())
            continue
        prediction, observation = row["Vp"], observed[time]
        pairs.append({"timeUtc": time.isoformat(), "forecastKmS": prediction,
                      "observedKmS": observation, "residualKmS": prediction-observation})
    residuals = [p["residualKmS"] for p in pairs]
    count = len(residuals)
    return {
        "schema": "external_wsa_ace_overlap_v1", "spacecraft": "ACE",
        "forecastModel": "NASA WSA AGONG ensemble, four-day-ahead product",
        "observationProduct": "NOAA ACE SWEPAM hourly, dsflag=0",
        "pairing": "exact UTC tag, no lag/interpolation/fit",
        "forecastRows": len(forecast["solarwind"]), "usableForecastRows": usable,
        "acceptedObservationRows": len(observed), "matchedRows": count,
        "coverageOfUsableForecast": count/usable if usable else 0,
        "missingObservationTimes": missing, "pairs": pairs,
        "meanBiasKmS": sum(residuals)/count if count else None,
        "meanAbsoluteErrorKmS": sum(map(abs, residuals))/count if count else None,
        "rootMeanSquareErrorKmS": math.sqrt(sum(r*r for r in residuals)/count) if count else None,
        "applicationCalibrationPassed": False,
        "scope": "External-model observational comparison only. No production PFSS/WSA outputs were evaluated.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--observations", type=Path, default=CAPTURE / "ace_swepam_1h.json")
    parser.add_argument("--forecast", type=Path, default=REFERENCE / "nasa_wsa_ace.json")
    args = parser.parse_args()
    forecast_bytes, observation_bytes = args.forecast.read_bytes(), args.observations.read_bytes()
    result = compare(json.loads(forecast_bytes), json.loads(observation_bytes))
    result["forecastSha256"] = hashlib.sha256(forecast_bytes).hexdigest()
    result["observationSha256"] = hashlib.sha256(observation_bytes).hexdigest()
    print(json.dumps(result, indent=2, allow_nan=False))
    if not result["matchedRows"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
