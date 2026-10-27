"""Capture the real runner's Kuiper wire object for the frontend contract gate.

Run from the repository root with its CI backend requirements:
PYTHONPATH=backend uv run --python 3.12.13 --with-requirements \
ci/backend-test-requirements.txt python scripts/capture_kuiper_client_fixture.py

Stdout is the unmodified runner state plus capture provenance. No server source
or wire format is patched. The RNG seed only makes activation reproducible.
"""
import json
import time
from unittest.mock import patch

import numpy as np
from data.bodies import ALL_BODIES
from server import SimulationRunner
from sim.kuiper import KuiperBeltEngine
from sim.rebound_nbody import REBOUNDEngine


def capture():
    engine = REBOUNDEngine(integrator="whfast")
    engine.initialize(ALL_BODIES)
    runner = SimulationRunner(engine)
    runner.paused = True
    runner.kuiper = KuiperBeltEngine(particle_count=32)
    rng = np.random.default_rng(20261014)
    try:
        with patch("sim.kuiper.np.random.default_rng", return_value=rng):
            runner.send_command({"type": "activate_kuiper", "center": [43.0, 0.0, 0.0], "spread": 5.0})
            runner.start()
            deadline = time.monotonic() + 5.0
            while time.monotonic() < deadline:
                error = runner.get_response()
                if error and error.get("type") == "error":
                    raise RuntimeError(error)
                state = runner.get_latest_state()
                if state and "kuiper" in state:
                    assert isinstance(state["kuiper"], dict)
                    assert state["kuiper"]["binary_pairs"]
                    return {
                        "capture": {
                            "producer": "server.SimulationRunner._loop -> KuiperBeltEngine.get_state",
                            "main_engine": "REBOUNDEngine/whfast",
                            "particle_count": 32,
                            "rng_seed": 20261014,
                            "paused": True,
                        },
                        "state": state,
                    }
                time.sleep(0.01)
            raise TimeoutError("runner did not deliver an activated Kuiper payload within five seconds")
    finally:
        if not runner.stop():
            raise RuntimeError("fixture runner did not terminate")


if __name__ == "__main__":
    print(json.dumps(capture(), allow_nan=False, indent=2))
