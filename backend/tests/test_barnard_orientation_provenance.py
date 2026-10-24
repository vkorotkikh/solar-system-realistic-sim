"""Barnard planet orientation-provenance regression (EXO025).

Metadata-only contract; no observed inclination or physical-accuracy oracle.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / 'public/solar-systems/manifests/barnards-star.json'
ORIENTATION_NOTE = (
    'The zero i_deg and ascending_node_deg values are illustrative '
    'scene-orientation defaults, not measured three-dimensional orbital orientations.'
)
ORIGINAL_NOTES = {
    'bs-d': 'Confirmed RV planet from Basant et al. 2025. Radius is inferred from minimum mass for visualization only because no transit radius is measured.',
    'bs-b': 'Confirmed RV planet reported in 2024 and refined in 2025. Radius is inferred from minimum mass for visualization only because no transit radius is measured.',
    'bs-c': 'Confirmed RV planet from Basant et al. 2025. Radius is inferred from minimum mass for visualization only because no transit radius is measured.',
    'bs-e': 'Confirmed RV planet from Basant et al. 2025. Radius is inferred from minimum mass for visualization only because no transit radius is measured.',
}


def load_manifest():
    return json.loads(MANIFEST.read_text(encoding='utf-8'))


@pytest.mark.parametrize('planet_id', ORIGINAL_NOTES)
def test_each_planet_qualifies_illustrative_orientation(planet_id):
    planets = {body['id']: body for body in load_manifest()['planets']}
    assert planets[planet_id]['notes'] == ORIGINAL_NOTES[planet_id] + ' ' + ORIENTATION_NOTE


def test_original_provenance_and_radius_qualification_are_retained():
    manifest = load_manifest()
    assert manifest['notes'] == (
        'Observed compact RV system based on the current NASA Exoplanet Archive overview. '
        'Only the four confirmed short-period planets are included; the earlier speculative '
        'outer architecture and simulated moons have been removed.'
    )
    assert manifest['sources'] == [
        'Gaia EDR3 / VizieR J/A+A/650/A201',
        "NASA Exoplanet Archive Barnard's Star Overview (accessed 2026-03-21)",
        'Gonzalez Hernandez et al. 2024',
        'Basant et al. 2025',
    ]
    assert [planet['id'] for planet in manifest['planets']] == list(ORIGINAL_NOTES)
    for planet in manifest['planets']:
        assert planet['notes'].startswith(ORIGINAL_NOTES[planet['id']])


def test_orientation_slots_and_existing_system_identity_are_preserved():
    manifest = load_manifest()
    assert manifest['id'] == manifest['primary_star_id'] == 'barnards-star'
    assert manifest['version'] == 2
    assert manifest['fidelity_tier'] == 'B'
    assert manifest['epoch_jd'] == 2451545.0
    assert [planet['id'] for planet in manifest['planets']] == list(ORIGINAL_NOTES)
    for planet in manifest['planets']:
        assert planet['type'] == 'planet'
        assert planet['parent_id'] == 'barnards-star'
        assert planet['orbit']['i_deg'] == 0.0
        assert planet['orbit']['ascending_node_deg'] == 0.0
