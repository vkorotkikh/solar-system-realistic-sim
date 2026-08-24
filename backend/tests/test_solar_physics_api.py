from __future__ import annotations

from fastapi.testclient import TestClient
import time

import server
from server import app

client = TestClient(app)


def test_solar_capabilities_exposes_fidelity_levels() -> None:
    response = client.get("/solar/capabilities")

    assert response.status_code == 200
    payload = response.json()
    assert payload["model"]
    assert "fidelity_levels" in payload
    assert "forcing_modes" in payload
    assert "hybrid" in payload["forcing_modes"]
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
    assert payload["surface"]["activity_cycle_model"] == "hathaway_2015_normalized"
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


def test_solar_physics_rejects_unknown_forcing_mode() -> None:
    response = client.get(
        "/solar/physics",
        params={
            "jd": 2_460_000.5,
            "fidelity": "high",
            "forcing": "ultra_real",
        },
    )
    assert response.status_code == 400
    assert "forcing" in response.text.lower()


def test_solar_physics_hybrid_mode_without_live_data_is_stable() -> None:
    response = client.get(
        "/solar/physics",
        params={
            "jd": 2_460_000.5,
            "fidelity": "high",
            "forcing": "hybrid",
            "live_data": "false",
            "max_features": 32,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["forcing"] == "hybrid"
    assert payload["live_data_enabled"] is False
    assert payload["data_assimilation"]["mode"] == "hybrid"
    assert payload["data_assimilation"]["applied"] is False
    assert payload["data_assimilation"]["observed_confidence"] == 0.0
    assert payload["data_assimilation"]["blend_weight"] == 0.0
    assert payload["activity_index"] == payload["data_assimilation"]["blended_activity_index"]


def test_solar_realtime_aia_tile_rejects_unknown_channel() -> None:
    response = client.get("/solar/realtime/aia-tile", params={"channel": "aia_999"})

    assert response.status_code == 400
    assert "channel" in response.text.lower()


def test_solar_realtime_aia_tile_proxy_uses_provider_payload(monkeypatch) -> None:
    payload = {
        "channel": "aia_193",
        "image_id": "184733789",
        "image_date": "2026-02-17 03:19:41",
        "tile_url": "https://api.helioviewer.org/v2/getTile/?id=184733789&x=-1&y=-1&imageScale=0.6",
        "content": b"\x89PNG\r\n\x1a\nfake",
        "content_type": "image/png",
    }

    def fake_latest_aia_tile(channel: str, jd: float | None = None, force_refresh: bool = False):
        assert channel == "aia_193"
        assert jd is None
        assert force_refresh is False
        return payload

    monkeypatch.setattr(server.SOLAR_REALTIME_DATA, "latest_aia_tile", fake_latest_aia_tile)

    response = client.get("/solar/realtime/aia-tile", params={"channel": "aia_193"})
    assert response.status_code == 200
    assert response.content == payload["content"]
    assert response.headers.get("content-type", "").startswith("image/png")
    assert response.headers.get("x-solar-aia-channel") == "aia_193"
    assert response.headers.get("x-solar-aia-image-id") == "184733789"


def test_aia_tile_rejects_rate_limit(monkeypatch) -> None:
    payload = {
        "channel": "aia_193",
        "image_id": "184733789",
        "image_date": "2026-02-17 03:19:41",
        "tile_url": "https://api.helioviewer.org/v2/getTile/?id=184733789&x=-1&y=-1&imageScale=0.6",
        "content": b"\x89PNG\r\n\x1a\nfake",
        "content_type": "image/png",
    }

    def fake_latest_aia_tile(channel: str, jd: float | None = None, force_refresh: bool = False):
        assert channel == "aia_193"
        assert jd is None
        assert force_refresh is False
        return payload

    monkeypatch.setattr(server, "_solar_aia_tile_rate_locks", {})
    monkeypatch.setattr(server, "SOLAR_AIA_TILE_RATE_LIMIT_PER_WINDOW", 1)
    monkeypatch.setattr(server.SOLAR_REALTIME_DATA, "latest_aia_tile", fake_latest_aia_tile)

    first = client.get("/solar/realtime/aia-tile", params={"channel": "aia_193"})
    assert first.status_code == 200

    second = client.get("/solar/realtime/aia-tile", params={"channel": "aia_193"})
    assert second.status_code == 429
    assert second.headers.get("retry-after") is not None


def test_aia_tile_times_out_with_short_budget(monkeypatch) -> None:
    payload = {
        "channel": "aia_193",
        "image_id": "184733789",
        "image_date": "2026-02-17 03:19:41",
        "tile_url": "https://api.helioviewer.org/v2/getTile/?id=184733789&x=-1&y=-1&imageScale=0.6",
        "content": b"\x89PNG\r\n\x1a\nfake",
        "content_type": "image/png",
    }

    def fake_latest_aia_tile(*_args, **_kwargs):
        time.sleep(0.2)
        return payload

    monkeypatch.setattr(server, "_solar_aia_tile_rate_locks", {})
    monkeypatch.setattr(server, "SOLAR_AIA_TILE_REQUEST_TIMEOUT_SECONDS", 0.05)
    monkeypatch.setattr(server.SOLAR_REALTIME_DATA, "latest_aia_tile", fake_latest_aia_tile)

    response = client.get("/solar/realtime/aia-tile", params={"channel": "aia_193"})
    assert response.status_code == 503


def test_solar_physics_rejects_excessive_feature_requests() -> None:
    response = client.get(
        "/solar/physics",
        params={
            "jd": 2_460_000.5,
            "fidelity": "high",
            "max_features": 4_096,
        },
    )
    assert response.status_code == 413
    assert "max_features" in response.text.lower()


def test_solar_physics_enforces_rate_limit(monkeypatch) -> None:
    monkeypatch.setattr(server, "_solar_physics_rate_locks", {})
    monkeypatch.setattr(server, "SOLAR_PHYSICS_RATE_LIMIT_PER_WINDOW", 1)

    first = client.get(
        "/solar/physics",
        params={
            "jd": 2_460_000.5,
            "fidelity": "high",
            "max_features": 16,
        },
    )
    assert first.status_code == 200

    second = client.get(
        "/solar/physics",
        params={
            "jd": 2_460_000.5,
            "fidelity": "high",
            "max_features": 16,
        },
    )
    assert second.status_code == 429
    assert second.headers.get("retry-after") is not None


def test_solar_physics_times_out_with_short_budget(monkeypatch) -> None:
    original_builder = server._build_solar_physics_state

    def delayed_state(*_args, **_kwargs):
        time.sleep(0.2)
        return original_builder(*_args, **_kwargs)

    monkeypatch.setattr(server, "_build_solar_physics_state", delayed_state)
    monkeypatch.setattr(server, "SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS", 0.05)
    start = time.monotonic()
    response = client.get(
        "/solar/physics",
        params={
            "jd": 2_460_000.5,
            "fidelity": "high",
            "max_features": 16,
        },
    )
    elapsed = time.monotonic() - start
    assert response.status_code == 503
    assert elapsed < 1.0
