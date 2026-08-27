from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest


SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "fetch_jpl_nbody_ephemeris.py"
SPEC = importlib.util.spec_from_file_location("fetch_jpl_nbody_ephemeris", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
generator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(generator)


def _horizons_payload(
    *,
    target_header: str = "Mercury Barycenter (199)        {source: DE441}",
    frame_header: str = "Ecliptic of J2000.0",
) -> bytes:
    result = f"""
Target body name: {target_header}
Center body name: Solar System Barycenter (0)     {{source: DE441}}
Output units    : AU-D
Reference frame : {frame_header}
$$SOE
2451545.000000000, A.D. 2000-Jan-01 12:00:00.0000, 1, 2, 3, 4, 5, 6,
$$EOE
"""
    return json.dumps(
        {
            "signature": {"source": "NASA/JPL Horizons API", "version": "1.2"},
            "result": result,
        }
    ).encode("utf-8")


def test_generator_validates_mercury_command_alias_against_resolved_id(
    monkeypatch,
) -> None:
    assert generator.TARGETS["mercury"]["resolved_target_id"] == "199"
    assert generator.TARGETS["venus"]["resolved_target_id"] == "299"
    monkeypatch.setattr(
        generator,
        "_fetch_bytes",
        lambda _url: (_horizons_payload(), {}),
    )

    state = generator._fetch_vector("mercury", generator.J2000_JD_TDB)

    assert state["position_au"] == [1.0, 2.0, 3.0]
    assert state["velocity_au_per_day"] == [4.0, 5.0, 6.0]
    assert state["state_ephemeris"] == "DE441"


@pytest.mark.parametrize(
    "payload, match",
    [
        (
            _horizons_payload(target_header="Mercury Barycenter (1) {source: DE441}"),
            "unexpected Horizons target",
        ),
        (
            _horizons_payload(frame_header="ICRF equatorial"),
            "unexpected Horizons frame",
        ),
    ],
)
def test_generator_rejects_mislabeled_horizons_responses(
    monkeypatch,
    payload: bytes,
    match: str,
) -> None:
    monkeypatch.setattr(generator, "_fetch_bytes", lambda _url: (payload, {}))

    with pytest.raises(RuntimeError, match=match):
        generator._fetch_vector("mercury", generator.J2000_JD_TDB)
