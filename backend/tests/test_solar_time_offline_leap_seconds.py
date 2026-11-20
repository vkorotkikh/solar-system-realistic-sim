"""A backend process never reaches for the network to convert UTC (audit item G02).

astropy refreshes its leap-second table from two URLs once the bundled table is
within 150 days of its expiry, at the first UTC conversion of every process. With
the pinned astropy-iers-data that begins on 2027-01-29. On a network that drops
packets the fetch stalls for 20 s, past the 18 s solar compute deadline, so every
``/solar/physics`` request fails.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]

# Runs in a fresh interpreter: the leap-second check happens once per process.
PROBE = textwrap.dedent(
    """
    import json, socket, sys

    attempts = []

    def refuse(*args, **kwargs):
        attempts.append(repr(args[:1]))
        raise OSError("network disabled by the test")

    socket.getaddrinfo = refuse
    socket.create_connection = refuse
    socket.socket.connect = refuse

    from astropy.time import Time
    from astropy.utils import iers

    bundled = iers.LeapSeconds.open(iers.IERS_LEAP_SECOND_FILE)
    # TAI, like astropy's own _today: building it must not start the leap-second check.
    pretend_today = Time(bundled.expires.jd + float(sys.argv[1]), format="jd", scale="tai")
    iers.LeapSeconds._today = staticmethod(lambda: pretend_today)

    from sim.solar_time import current_jd_tdb

    print(json.dumps({"jd": current_jd_tdb(), "attempts": attempts}))
    """
)


@pytest.mark.parametrize(
    "days_from_expiry",
    [-30, 30],
    ids=["bundled table about to expire", "bundled table expired"],
)
def test_utc_conversion_never_tries_the_network(days_from_expiry, tmp_path):
    (tmp_path / "astropy").mkdir()  # an empty astropy cache and config, not the developer's
    env = {
        **os.environ,
        "XDG_CACHE_HOME": str(tmp_path),
        "XDG_CONFIG_HOME": str(tmp_path),
        "PYTHONPATH": str(BACKEND),
        "PYTHONDONTWRITEBYTECODE": "1",
    }
    done = subprocess.run(
        [sys.executable, "-c", PROBE, str(days_from_expiry)],
        capture_output=True,
        text=True,
        timeout=120,
        env=env,
        cwd=tmp_path,
    )
    assert done.returncode == 0, done.stderr
    result = json.loads(done.stdout.strip().splitlines()[-1])
    assert result["attempts"] == []
    assert result["jd"] > 2_460_000
