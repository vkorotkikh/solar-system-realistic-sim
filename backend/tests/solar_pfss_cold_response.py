"""Run the real process/wire/response contracts with a cold native PFSS fixture.

This is numerical integration acceptance, NOT activation or observational/frame
validation of the guarded observed-forcing route. No runtime caps are changed.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
import tempfile
import time


def cold_response(*, fidelity, synthetic_baseline=False, contended=False):
    import server
    from fastapi.responses import JSONResponse
    from sim.pfss_evaluation import FIELD_BATCH_POINTS
    from sim.process_supervisor import SupervisedProcessRunner
    from sim.solar_process_worker import validate_solar_physics_result

    sys.path.insert(0, str(Path(__file__).parent / "fixtures"))
    timeout = server.SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS
    byte_cap = server.SOLAR_PHYSICS_PROCESS_MAX_RESULT_BYTES
    assert timeout <= server.SOLAR_PHYSICS_HTTP_TIMEOUT_HARD_MAX_SECONDS == 19.0
    payload = {"epoch_jd_tdb": 2461326.238888889, "fidelity": fidelity,
               "max_features": 256, "forcing": "synthetic", "live_data": False}
    report = {
        "schema": "solar-pfss-cold-response-v1", "request": payload,
        "fixture_injected": not synthetic_baseline, "observed_route_enabled": False,
        "timeout_seconds": timeout, "max_result_bytes": byte_cap,
        "evaluation_batch_positions": FIELD_BATCH_POINTS,
        "reported_shared_cpu_contention": contended,
        "load_average_before": list(os.getloadavg()),
        "memory_policy": "Existing bounded evaluation/WSA/JSON/wire limits; no numeric RSS cap is configured.",
    }
    env_keys = ("SCN041_COLD_NATIVE", "SCN041_COLD_METRICS")
    previous = {key: os.environ.get(key) for key in env_keys}
    with tempfile.TemporaryDirectory(prefix="solar-scn041-cold-") as scratch:
        metrics_path = Path(scratch) / "metrics.json"
        os.environ["SCN041_COLD_NATIVE"] = "0" if synthetic_baseline else "1"
        os.environ["SCN041_COLD_METRICS"] = str(metrics_path)
        runner = SupervisedProcessRunner(
            "pfss_cold_worker_target:execute", max_workers=1, max_queue=0,
            max_result_bytes=byte_cap, result_validator=validate_solar_physics_result,
        )
        started = time.perf_counter()
        try:
            future = runner.submit(payload, timeout_seconds=timeout)
            result = future.result(timeout=timeout + 2.0)
            body = JSONResponse(result).body
            report["complete_response_seconds"] = time.perf_counter() - started
            report["http_body_bytes"] = len(body)
            report["child"] = json.loads(metrics_path.read_text(encoding="ascii"))
            report["budget_passed"] = (
                report["complete_response_seconds"] <= timeout
                and report["child"]["wire_bytes"] <= byte_cap
                and len(body) <= byte_cap
                and (synthetic_baseline or report["child"]["solver_calls"] == 1)
            )
        except Exception as exc:
            report["complete_response_seconds"] = time.perf_counter() - started
            report["budget_passed"] = False
            report["failure"] = {"type": type(exc).__name__, "message": str(exc)}
            if metrics_path.exists():
                report["child"] = json.loads(metrics_path.read_text(encoding="ascii"))
        finally:
            runner.shutdown()
            report["runner_after_shutdown"] = runner.snapshot()
            for key, value in previous.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
    report["load_average_after"] = list(os.getloadavg())
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fidelity", choices=("high", "ultra"), default="high")
    parser.add_argument("--synthetic-baseline", action="store_true")
    parser.add_argument("--contended", action="store_true")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = cold_response(fidelity=args.fidelity,
                           synthetic_baseline=args.synthetic_baseline,
                           contended=args.contended)
    encoded = json.dumps(report, indent=2, allow_nan=False) + "\n"
    args.output.write_text(encoded, encoding="ascii")
    print(encoded, end="")
    if not report["budget_passed"]:
        raise SystemExit(2)
