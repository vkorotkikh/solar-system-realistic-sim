from __future__ import annotations

from fastapi.testclient import TestClient

from server import app

client = TestClient(app)


def test_solar_capabilities_exposes_fidelity_levels() -> None:
    response = client.get("/solar/capabilities")

    assert response.status_code == 200
    payload = response.json()
    assert payload["model"]
    assert "fidelity_levels" in payload
    assert "operational" in payload["fidelity_levels"]
    assert payload["solar_radius_km"] > 600_000
    assert payload["active_region_count"] >= 32


def test_solar_physics_returns_3d_coronal_features() -> None:
    response = client.get(
        "/solar/physics",
        params={
            "jd": 2_460_000.5,
            "fidelity": "high",
            "max_features": 64,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "backend"
    assert payload["fidelity"] == "high"
    assert payload["wall_epoch_jd"] >= payload["epoch_jd"] - 365_000
    assert payload["surface"]["activity_cycle_model"] == "hathaway_2015_asymmetric_plus_rotation"
    assert payload["corona"]["feature_count"] <= 64
    assert payload["corona"]["feature_count"] >= 8
    assert payload["corona"]["topology_model"] == "bipolar_active_region_pairs"
    assert payload["heliosphere"]["parker_spiral"]["line_count"] >= 3
    first = payload["corona"]["features"][0]
    assert len(first["base_dir"]) == 3
    assert len(first["paired_dir"]) == 3
    assert len(first["arc"]) >= 2
    assert len(first["arc"][0]) == 3
    assert first["active_region_id"].startswith("ar-")
    assert first["source_polarity"] in {"positive", "negative"}
    assert 0.0 <= first["emergence"] <= 1.0
    assert first["field_strength_gauss"] > 0
    assert first["temperature_mk"] > 0
    assert first["electron_density_m3"] > 0
    assert first["alfven_speed_kms"] > 0

    speeds = [float(feature["expansion_speed_kms"]) for feature in payload["corona"]["features"]]
    assert min(speeds) >= 20.0
    assert max(speeds) <= 3_500.0


def test_solar_physics_rejects_unknown_fidelity() -> None:
    response = client.get(
        "/solar/physics",
        params={
            "jd": 2_460_000.5,
            "fidelity": "cinematic",
        },
    )
    assert response.status_code == 400
    assert "fidelity" in response.text.lower()
