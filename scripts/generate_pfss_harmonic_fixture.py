#!/usr/bin/env python3
"""Offline immutable oracle; run with Python 3.12.13, numpy==2.5.2, scipy==1.18.0.

Regenerate explicitly with --write, or verify byte-for-byte with --check.
This script intentionally has no dependency on the production harmonic code.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import platform

import numpy as np
import scipy
from scipy.special import lpmv


LOCKED_VERSIONS = {"python": "3.12.13", "numpy": "2.5.2", "scipy": "1.18.0"}
FIXTURE = Path(__file__).resolve().parents[1] / "backend/tests/fixtures/pfss/harmonics_schmidt_v1.json"


def build_fixture():
    versions = {"python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__}
    if versions != LOCKED_VERSIONS:
        raise RuntimeError(f"Oracle requires {LOCKED_VERSIONS}; got {versions}")
    mu = np.array([-0.9, -0.5, 0.0, 0.5, 0.9])
    modes = []
    for l in range(16):
        for m in range(l + 1):
            normalization = math.sqrt((1 if m == 0 else 2) * math.factorial(l - m) / math.factorial(l + m))
            # lpmv includes (-1)^m (Condon-Shortley); remove it explicitly.
            raw = (-1)**m * lpmv(m, l, mu)
            previous = (-1)**m * lpmv(m, l - 1, mu) if l > m else np.zeros_like(mu)
            derivative = (l * mu * raw - (l + m) * previous) / np.sqrt(1 - mu**2)
            modes.append({"l": l, "m": m, "values": (normalization * raw).tolist(),
                          "theta_derivatives": (normalization * derivative).tolist()})
    payload = {"mu": mu.tolist(), "lmax": 15, "modes": modes}
    payload_hash = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return {"convention": "schmidt-quasi-normalized-no-cs-v1", "versions": versions,
            "generator_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "payload_sha256": payload_hash, **payload}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    generated = (json.dumps(build_fixture(), indent=2, allow_nan=False) + "\n").encode()
    if args.write:
        FIXTURE.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE.write_bytes(generated)
        print(f"Wrote {FIXTURE}")
    elif FIXTURE.read_bytes() != generated:
        raise SystemExit("Fixture differs from locked oracle regeneration")
    else:
        print("Fixture matches locked oracle byte-for-byte")


if __name__ == "__main__":
    main()
