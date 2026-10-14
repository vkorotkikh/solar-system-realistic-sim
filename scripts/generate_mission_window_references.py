"""Capture/reproduce independent Lambert references without importing the application solver.

Run with Python 3.12, lamberthub==1.0.0, numpy==2.2.6, scipy==1.15.3,
numba==0.61.2, llvmlite==0.44.0. Default mode reuses archived Horizons JSON;
--capture explicitly refreshes the six provider artifacts. No GMAT/Orekit/Tudat
execution is claimed. Izzo and Gooding must agree, and DOP853 must reach arrival.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import urllib.parse
import urllib.request

import numpy as np
from lamberthub import gooding1990, izzo2015
from scipy.integrate import solve_ivp

ROOT = Path(__file__).resolve().parents[1] / "backend" / "benchmark"
MU = 0.0002959122082855911  # Declared solar two-body parameter, AU^3/day^2.
AU_KM = 149_597_870.7
COMMANDS = {"earth": "399", "mars": "499", "venus": "299", "jupiter": "599"}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Horizons capture redirects are forbidden")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capture", action="store_true")
    args = parser.parse_args()
    scenarios_path = ROOT / "reference_scenarios.json"
    scenarios = json.loads(scenarios_path.read_text())
    for scenario in scenarios:
        states = []
        captures = []
        for body, jd, label in (
            (scenario["from_id"], scenario["departure_jd"], "departure"),
            (scenario["to_id"], scenario["arrival_jd"], "arrival"),
        ):
            params = dict(format="json", COMMAND=COMMANDS[body], CENTER="500@10",
                          MAKE_EPHEM="YES", EPHEM_TYPE="VECTORS", TLIST=str(jd),
                          OUT_UNITS="AU-D", REF_PLANE="ECLIPTIC", REF_SYSTEM="ICRF",
                          VEC_CORR="NONE", VEC_TABLE="2", CSV_FORMAT="YES")
            url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(params)
            path = ROOT / "artifacts" / f"{scenario['id']}__horizons_{label}.json"
            if args.capture:
                with urllib.request.build_opener(NoRedirect()).open(url, timeout=20) as response:
                    raw = response.read(2 * 1024 * 1024 + 1)
                if len(raw) > 2 * 1024 * 1024:
                    raise ValueError("oversized provider capture")
                path.write_bytes(raw)
            raw = path.read_bytes()
            payload = json.loads(raw)
            result = payload["result"]
            assert f"({COMMANDS[body]})" in result.split("Target body name:")[1].splitlines()[0]
            assert "(10)" in result.split("Center body name:")[1].splitlines()[0]
            assert "Ecliptic of J2000.0" in result and "JDTDB" in result and "AU-D" in result
            row = result.split("$$SOE")[1].split("$$EOE")[0].strip().split(",")
            assert float(row[0]) == jd
            state = np.array([float(value) for value in row[2:8]])
            assert state.shape == (6,) and np.isfinite(state).all()
            states.append(state)
            captures.append(dict(path=str(path.relative_to(ROOT)), sha256=hashlib.sha256(raw).hexdigest(),
                                 request_url=url, target_id=COMMANDS[body], jd_tdb=jd,
                                 signature=payload["signature"]))
        start, end = states
        tof = scenario["arrival_jd"] - scenario["departure_jd"]
        v1, v2 = izzo2015(MU, start[:3], end[:3], tof, M=0, prograde=True, low_path=True,
                         atol=1e-12, rtol=1e-12)
        g1, g2 = gooding1990(MU, start[:3], end[:3], tof, M=0, prograde=True, low_path=True,
                            atol=1e-12, rtol=1e-12)
        agreement = max(np.linalg.norm(v1-g1), np.linalg.norm(v2-g2)) * AU_KM / 86400
        assert agreement < 1e-8
        def dynamics(t, y):
            return np.r_[y[3:], -MU * y[:3] / np.linalg.norm(y[:3])**3]
        propagated = solve_ivp(dynamics, (0, tof), np.r_[start[:3], v1], method="DOP853",
                               rtol=2e-13, atol=1e-14)
        miss_km = np.linalg.norm(propagated.y[:3, -1] - end[:3]) * AU_KM
        assert propagated.success and miss_km < 0.1
        reference = dict(
            scenario_id=scenario["id"], departure_jd=scenario["departure_jd"], arrival_jd=scenario["arrival_jd"],
            mu_au3_day2=MU, start_state_au_day=start.tolist(), end_state_au_day=end.tolist(),
            expected_v1_au_day=v1.tolist(), expected_v2_au_day=v2.tolist(),
            total_v_infinity_km_s=float((np.linalg.norm(v1-start[3:])+np.linalg.norm(v2-end[3:]))*AU_KM/86400),
            tolerance_km_s=1e-4, oracle_agreement_km_s=float(agreement), propagated_miss_km=float(miss_km),
            contract=dict(central_body="sun", state_source="archived JPL Horizons", state_center="sun_center",
                          reference_frame="ecliptic_j2000", time_scale="TDB", corrections="NONE",
                          position_units="AU", velocity_units="AU/day", prograde=True, revolutions=0,
                          path="zero-revolution prograde", delta_v_metric="sum of endpoint v-infinity magnitudes; not propulsive burns"),
            provenance=dict(oracles=["lamberthub.izzo2015", "lamberthub.gooding1990"],
                            versions={p: importlib.metadata.version(p) for p in ("lamberthub", "numpy", "scipy", "numba", "llvmlite")},
                            sources=["https://arxiv.org/abs/1403.2705v2", "https://doi.org/10.1007/BF00049511",
                                     "https://github.com/jorgepiloto/lamberthub/tree/v1.0.0",
                                     "https://ssd-api.jpl.nasa.gov/doc/horizons.html"], captures=captures))
        artifact = ROOT / "artifacts" / f"{scenario['id']}__independent.json"
        data = (json.dumps(reference, indent=2) + "\n").encode()
        artifact.write_bytes(data)
        scenario["independent_reference"] = dict(artifact_path=str(artifact.relative_to(ROOT)),
                                                 artifact_sha256=hashlib.sha256(data).hexdigest())
        print(scenario["id"], f"v-infinity={reference['total_v_infinity_km_s']:.9f} km/s",
              f"Izzo/Gooding difference={agreement:.3e} km/s; propagated miss={miss_km:.6f} km")
    scenarios_path.write_text(json.dumps(scenarios, indent=2) + "\n")


if __name__ == "__main__":
    main()
