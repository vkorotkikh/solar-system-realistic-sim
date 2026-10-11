"""Risk service: Monte Carlo mission uncertainty envelopes."""

from __future__ import annotations

import random
from typing import Any, Callable, Dict, List


def _quantile(sorted_values: List[float], q: float) -> float:
    if not sorted_values:
        return 0.0
    q = max(0.0, min(1.0, q))
    if len(sorted_values) == 1:
        return sorted_values[0]
    idx = q * (len(sorted_values) - 1)
    lo = int(idx)
    hi = min(len(sorted_values) - 1, lo + 1)
    frac = idx - lo
    return sorted_values[lo] * (1.0 - frac) + sorted_values[hi] * frac


class RiskService:
    """Runs deterministic-seed Monte Carlo sweeps over mission uncertainties."""

    def run_monte_carlo(
        self,
        *,
        base_total_delta_v_km_s: float,
        base_total_time_days: float,
        base_returned_payload_kg: float,
        base_arrival_jd: float,
        reclose: Callable[[float, float], Dict[str, Any]],
        samples: int = 300,
        seed: int = 7,
        ephemeris_sigma_fraction: float = 0.01,
        thrust_sigma_fraction: float = 0.04,
        extraction_sigma_fraction: float = 0.12,
    ) -> Dict[str, Any]:
        samples = max(30, min(50_000, int(samples)))
        rng = random.Random(int(seed))

        dv_sigma = max(0.0, float(ephemeris_sigma_fraction)) + max(0.0, float(thrust_sigma_fraction))
        time_sigma = max(0.0, float(ephemeris_sigma_fraction)) * 0.6 + max(0.0, float(thrust_sigma_fraction)) * 0.9
        payload_sigma = max(0.0, float(extraction_sigma_fraction)) + max(0.0, float(thrust_sigma_fraction)) * 0.35

        dv_samples: List[float] = []
        time_samples: List[float] = []
        payload_samples: List[float] = []
        arrival_samples: List[float] = []
        margin_samples: List[float] = []

        failure_count = 0

        for _ in range(samples):
            dv_factor = max(0.5, 1.0 + rng.gauss(0.0, dv_sigma))
            time_factor = max(0.4, 1.0 + rng.gauss(0.0, time_sigma))
            payload_factor = max(0.0, 1.0 + rng.gauss(0.0, payload_sigma))

            dv = max(0.0, base_total_delta_v_km_s * dv_factor)
            time_days = max(0.0, base_total_time_days * time_factor)
            payload = max(0.0, base_returned_payload_kg * payload_factor)
            arrival_jd = base_arrival_jd + (time_days - base_total_time_days)

            # Re-close the staged rocket equation for this sample: every burn scaled by the
            # sampled delta-v factor, carrying the planned cargo (or less, if less was mined).
            # A plan short of delta-v therefore fails here instead of scoring 0% risk.
            budget = reclose(dv_factor, min(payload, base_returned_payload_kg))
            margin = float(budget.get("propellantMarginKg", 0.0))

            if payload <= 0.0 or not budget.get("feasible", False):
                failure_count += 1

            dv_samples.append(dv)
            time_samples.append(time_days)
            payload_samples.append(payload)
            arrival_samples.append(arrival_jd)
            margin_samples.append(margin)

        dv_samples.sort()
        time_samples.sort()
        payload_samples.sort()
        arrival_samples.sort()
        margin_samples.sort()

        return {
            "samples": samples,
            "seed": int(seed),
            "failureProbability": failure_count / samples,
            "envelopes": {
                "deltaV_km_s": {
                    "p05": _quantile(dv_samples, 0.05),
                    "p50": _quantile(dv_samples, 0.50),
                    "p95": _quantile(dv_samples, 0.95),
                },
                "timeDays": {
                    "p05": _quantile(time_samples, 0.05),
                    "p50": _quantile(time_samples, 0.50),
                    "p95": _quantile(time_samples, 0.95),
                },
                "returnedPayloadKg": {
                    "p05": _quantile(payload_samples, 0.05),
                    "p50": _quantile(payload_samples, 0.50),
                    "p95": _quantile(payload_samples, 0.95),
                },
                "arrivalJd": {
                    "p05": _quantile(arrival_samples, 0.05),
                    "p50": _quantile(arrival_samples, 0.50),
                    "p95": _quantile(arrival_samples, 0.95),
                },
                "propellantMarginKg": {
                    "p05": _quantile(margin_samples, 0.05),
                    "p50": _quantile(margin_samples, 0.50),
                    "p95": _quantile(margin_samples, 0.95),
                },
            },
        }


__all__ = ["RiskService"]
