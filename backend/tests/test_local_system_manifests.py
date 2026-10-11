from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

G_SI = 6.67430e-11
AU_M = 149_597_870_700.0
DAY_SECONDS = 86_400.0

MANIFESTS_DIR = Path(__file__).resolve().parents[2] / "public" / "solar-systems" / "manifests"


def _load_manifest(name: str) -> dict:
    return json.loads((MANIFESTS_DIR / name).read_text(encoding="utf-8"))


def _body_index(manifest: dict) -> dict[str, dict]:
    return {
        body["id"]: body
        for body in [*manifest.get("stars", []), *manifest.get("planets", [])]
    }


def _kepler_period_days(a_au: float, primary_mass_kg: float, secondary_mass_kg: float = 0.0) -> float:
    mu = G_SI * (primary_mass_kg + secondary_mass_kg)
    return (2.0 * math.pi * math.sqrt(((a_au * AU_M) ** 3) / mu)) / DAY_SECONDS


def test_alpha_centauri_manifest_keeps_only_archive_listed_planets() -> None:
    manifest = _load_manifest("alpha-centauri.json")
    planet_ids = {planet["id"] for planet in manifest["planets"]}

    assert manifest["primary_star_id"] == "alpha-centauri-a"
    assert manifest["fidelity_tier"] == "B"
    assert planet_ids == {"ac-proxima-b", "ac-proxima-c", "ac-proxima-d"}
    assert "ac-bb" not in planet_ids
    assert "ac-proxima-c-i" not in planet_ids

    notes_by_id = {planet["id"]: planet["notes"] for planet in manifest["planets"]}
    assert "candidate" in notes_by_id["ac-proxima-c"].lower()
    assert "confirmed" in notes_by_id["ac-proxima-b"].lower()
    assert "confirmed" in notes_by_id["ac-proxima-d"].lower()


def test_barnards_star_manifest_tracks_current_confirmed_compact_system() -> None:
    manifest = _load_manifest("barnards-star.json")
    planets = {planet["id"]: planet for planet in manifest["planets"]}
    star = manifest["stars"][0]

    assert manifest["fidelity_tier"] == "B"
    assert set(planets) == {"bs-b", "bs-c", "bs-d", "bs-e"}
    assert all(planet["type"] == "planet" for planet in planets.values())
    assert all("minimum mass" in planet["notes"].lower() for planet in planets.values())
    assert star["mass_kg"] == pytest.approx(3.2342663397e29)
    assert max(planet["orbit"]["period_days"] for planet in planets.values()) < 10.0

    expected = {
        "bs-d": {"period_days": 2.3402, "a_au": 0.0188, "e": 0.04},
        "bs-b": {"period_days": 3.1542, "a_au": 0.0229, "e": 0.03},
        "bs-c": {"period_days": 4.1244, "a_au": 0.0274, "e": 0.08},
        "bs-e": {"period_days": 6.7392, "a_au": 0.0381, "e": 0.04},
    }
    for planet_id, expected_orbit in expected.items():
        orbit = planets[planet_id]["orbit"]
        assert orbit["period_days"] == pytest.approx(expected_orbit["period_days"])
        assert orbit["a_au"] == pytest.approx(expected_orbit["a_au"])
        assert orbit["e"] == pytest.approx(expected_orbit["e"])


def test_sirius_manifest_excludes_unconfirmed_planets() -> None:
    manifest = _load_manifest("sirius.json")

    assert manifest["fidelity_tier"] == "B"
    assert manifest["planets"] == []
    assert "no planets are included" in manifest["notes"].lower()


@pytest.mark.parametrize(
    ("manifest_name", "max_relative_period_error"),
    [
        ("alpha-centauri.json", 0.02),
        ("barnards-star.json", 0.02),
        ("sirius.json", 0.002),  # Bond et al. 2017 elements and masses close to 0.01%
    ],
)
def test_local_system_manifest_orbits_are_kepler_consistent(
    manifest_name: str,
    max_relative_period_error: float,
) -> None:
    manifest = _load_manifest(manifest_name)
    bodies = _body_index(manifest)

    for body in bodies.values():
        orbit = body.get("orbit")
        parent_id = body.get("parent_id")
        if not orbit or not parent_id:
            continue

        parent = bodies[parent_id]
        expected_period_days = _kepler_period_days(
            float(orbit["a_au"]),
            float(parent["mass_kg"]),
            float(body.get("mass_kg", 0.0) or 0.0),
        )
        relative_error = abs(float(orbit["period_days"]) - expected_period_days) / expected_period_days
        assert relative_error <= max_relative_period_error, (
            f"{manifest_name}:{body['id']} period mismatch "
            f"{relative_error:.3%} > {max_relative_period_error:.3%}"
        )
