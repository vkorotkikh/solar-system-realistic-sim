from __future__ import annotations

from fastapi.testclient import TestClient
import pytest
import time

import server
from server import app
from sim.solar_realtime_data import SolarRealtimeFetchError

client = TestClient(app)


def _fallback_reasons(value: object) -> list[str]:
    reasons: list[str] = []
    if isinstance(value, dict):
        for key, nested in value.items():
            if key == "fallback_reason" and isinstance(nested, str):
                reasons.append(nested)
            reasons.extend(_fallback_reasons(nested))
    elif isinstance(value, list):
        for nested in value:
            reasons.extend(_fallback_reasons(nested))
    return reasons


def _install_fast_solar_response(monkeypatch, calls: list[dict[str, object]]) -> None:
    class FastRunner:
        async def run(self, payload, *, timeout_seconds):
            del timeout_seconds
            calls.append(dict(payload))
            epoch_jd_tdb = float(payload["epoch_jd_tdb"])
            return {
                "source": "backend",
                "forcing": str(payload["forcing"]),
                "live_data_enabled": False,
                "epoch_jd_tdb": epoch_jd_tdb,
                "wall_epoch_jd_tdb": epoch_jd_tdb,
                "jd_time_scale": "TDB",
                "epoch_jd": epoch_jd_tdb,
                "wall_epoch_jd": epoch_jd_tdb,
                "effective_forcing": "synthetic",
                "live_data_requested": False,
                "forcing_status": {
                    "requested": str(payload["forcing"]),
                    "effective": "synthetic",
                    "observed_input_status": "not_requested",
                    "runtime_eligible": False,
                },
            }

    monkeypatch.setattr(server, "_solar_physics_rate_locks", {})
    monkeypatch.setattr(server, "_solar_physics_runner", FastRunner())


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
    assert _fallback_reasons(payload) == []

    speeds = [float(feature["expansion_speed_kms"]) for feature in payload["corona"]["features"]]
    assert min(speeds) >= 20.0
    assert max(speeds) <= 3_500.0


def test_solar_physics_uses_canonical_jdtdb_and_returns_labelled_aliases(monkeypatch) -> None:
    calls: list[dict[str, object]] = []
    _install_fast_solar_response(monkeypatch, calls)

    response = client.get("/solar/physics", params={"jd_tdb": 2_460_000.5})

    assert response.status_code == 200
    payload = response.json()
    assert calls and calls[0]["epoch_jd_tdb"] == 2_460_000.5
    assert payload["epoch_jd_tdb"] == payload["epoch_jd"] == 2_460_000.5
    assert payload["wall_epoch_jd_tdb"] == payload["wall_epoch_jd"] == 2_460_000.5
    assert payload["jd_time_scale"] == "TDB"


def test_solar_physics_defaults_to_current_jdtdb(monkeypatch) -> None:
    expected_jd_tdb = 2_460_500.7508007
    calls: list[dict[str, object]] = []
    monkeypatch.setattr(server, "current_jd_tdb", lambda: expected_jd_tdb)
    _install_fast_solar_response(monkeypatch, calls)

    response = client.get("/solar/physics")

    assert response.status_code == 200
    assert calls and calls[0]["epoch_jd_tdb"] == expected_jd_tdb
    assert response.json()["epoch_jd_tdb"] == expected_jd_tdb


def test_solar_physics_accepts_equal_legacy_epoch_alias(monkeypatch) -> None:
    calls: list[dict[str, object]] = []
    _install_fast_solar_response(monkeypatch, calls)

    response = client.get(
        "/solar/physics",
        params={"jd_tdb": 2_460_000.5, "jd": 2_460_000.5},
    )

    assert response.status_code == 200
    assert calls and calls[0]["epoch_jd_tdb"] == 2_460_000.5


def test_solar_epoch_query_openapi_contract_is_labelled_and_deprecated() -> None:
    document = client.get("/openapi.json").json()

    for path in ("/solar/physics", "/solar/realtime/aia-tile"):
        parameters = {
            parameter["name"]: parameter
            for parameter in document["paths"][path]["get"]["parameters"]
        }
        canonical = parameters["jd_tdb"]
        legacy = parameters["jd"]
        assert "TDB" in canonical["description"]
        assert canonical.get("deprecated") is not True
        assert "TDB" in legacy["description"]
        assert "alias" in legacy["description"].lower()
        assert legacy["deprecated"] is True


def test_historical_response_uses_separate_current_wall_epoch(monkeypatch) -> None:
    requested_epoch = 2_459_000.5
    wall_epoch = 2_460_500.7508007
    model_calls: list[dict[str, object]] = []

    def fake_sample_state(epoch_jd_tdb: float, **kwargs):
        model_calls.append({"epoch": epoch_jd_tdb, **kwargs})
        # Wall time is response metadata that the worker stamps after sampling;
        # the model never receives it, so the fake returns none.
        return {
            "epoch_jd_tdb": epoch_jd_tdb,
            "jd_time_scale": "TDB",
            "epoch_jd": epoch_jd_tdb,
            "data_assimilation": {"mode": kwargs["forcing"]},
        }

    monkeypatch.setattr(server, "current_jd_tdb", lambda: wall_epoch, raising=False)
    monkeypatch.setattr(server.SOLAR_PHYSICS_MODEL, "sample_state", fake_sample_state)

    payload = server._build_solar_physics_state(
        requested_epoch,
        "preview",
        8,
        "synthetic",
        False,
        False,
    )

    assert payload["epoch_jd_tdb"] == payload["epoch_jd"] == requested_epoch
    assert payload["wall_epoch_jd_tdb"] == payload["wall_epoch_jd"] == wall_epoch
    assert payload["wall_epoch_jd_tdb"] != payload["epoch_jd_tdb"]
    assert payload["jd_time_scale"] == "TDB"
    assert "wall_jd" not in model_calls[0]


def test_solar_physics_rejects_conflicting_epoch_aliases_before_admission(monkeypatch) -> None:
    admission_calls = 0

    def record_admission(_request) -> None:
        nonlocal admission_calls
        admission_calls += 1

    monkeypatch.setattr(server, "_enforce_solar_request_rate_limit", record_admission)

    response = client.get(
        "/solar/physics",
        params={"jd_tdb": 2_460_000.5, "jd": 2_460_001.5},
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "conflicting_julian_date_aliases"
    assert admission_calls == 0


def test_solar_physics_rejects_nonfinite_canonical_epoch_before_admission(monkeypatch) -> None:
    admission_calls = 0

    def record_admission(_request) -> None:
        nonlocal admission_calls
        admission_calls += 1

    monkeypatch.setattr(server, "_enforce_solar_request_rate_limit", record_admission)

    response = client.get("/solar/physics", params={"jd_tdb": "nan"})

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_jd_tdb"
    assert admission_calls == 0


def test_data_driven_fails_before_compute_admission_or_provider(monkeypatch) -> None:
    admission_calls = 0
    execution_calls = 0
    model_calls = 0
    provider_calls = 0

    def record_compute_admission(_guard) -> bool:
        nonlocal admission_calls
        admission_calls += 1
        return True

    async def record_execution(*_args, **_kwargs):
        nonlocal execution_calls
        execution_calls += 1
        return {}

    def record_provider(*_args, **_kwargs):
        nonlocal provider_calls
        provider_calls += 1
        return {}

    def record_model(*_args, **_kwargs):
        nonlocal model_calls
        model_calls += 1
        return {}

    monkeypatch.setattr(server, "_solar_physics_rate_locks", {})
    monkeypatch.setattr(server, "_acquire_nonblocking", record_compute_admission)
    monkeypatch.setattr(server, "_run_owned_thread", record_execution)
    monkeypatch.setattr(server.SOLAR_REALTIME_DATA, "latest", record_provider)
    monkeypatch.setattr(server.SOLAR_PHYSICS_MODEL, "sample_state", record_model)

    response = client.get(
        "/solar/physics",
        params={"jd_tdb": 2_460_000.5, "forcing": "data_driven", "live_data": True},
    )

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["code"] == "solar_observed_input_unavailable"
    assert detail["provider"] == "gong_zqs"
    assert detail["product"] == "zqs"
    assert detail["status"] == detail["reason"] == "disabled_unvalidated"
    assert (admission_calls, execution_calls, model_calls, provider_calls) == (0, 0, 0, 0)


def test_synthetic_and_hybrid_builders_never_request_realtime_data(monkeypatch) -> None:
    provider_calls = 0
    model_inputs: list[object] = []

    def forbidden_provider(*_args, **_kwargs):
        nonlocal provider_calls
        provider_calls += 1
        return {"combined_activity_proxy": 0.99}

    def fake_sample_state(
        _epoch_jd_tdb: float,
        *,
        fidelity: str,
        max_features: int,
        forcing: str,
        realtime_data,
    ):
        model_inputs.append(realtime_data)
        return {
            "data_assimilation": {"mode": forcing},
            "epoch_jd_tdb": _epoch_jd_tdb,
            "jd_time_scale": "TDB",
            "epoch_jd": _epoch_jd_tdb,
        }

    monkeypatch.setattr(server.SOLAR_REALTIME_DATA, "latest", forbidden_provider)
    monkeypatch.setattr(server.SOLAR_PHYSICS_MODEL, "sample_state", fake_sample_state)

    synthetic = server._build_solar_physics_state(
        2_460_000.5,
        "preview",
        8,
        "synthetic",
        True,
        False,
    )
    hybrid = server._build_solar_physics_state(
        2_460_000.5,
        "preview",
        8,
        "hybrid",
        True,
        False,
    )

    assert provider_calls == 0
    assert model_inputs == [None, None]
    assert synthetic["live_data_enabled"] is False
    assert synthetic["live_data_requested"] is True
    assert synthetic["effective_forcing"] == "synthetic"
    assert synthetic["forcing_status"] == {
        "requested": "synthetic",
        "effective": "synthetic",
        "observed_input_status": "not_requested",
        "runtime_eligible": False,
    }
    assert "fallback_reason" not in synthetic
    assert hybrid["live_data_enabled"] is False
    assert hybrid["live_data_requested"] is True
    assert hybrid["effective_forcing"] == "synthetic"
    assert hybrid["forcing_status"] == {
        "requested": "hybrid",
        "effective": "synthetic",
        "observed_input_status": "disabled_unvalidated",
        "runtime_eligible": False,
        "fallback_reason": "disabled_unvalidated",
    }
    assert hybrid["fallback_reason"] == "disabled_unvalidated"


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
    assert set(_fallback_reasons(payload)) == {"disabled_unvalidated"}
    assert payload["pfss_field_lines"]["fallback_reason"] == "disabled_unvalidated"


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
        "artifact": {
            "schema": {"name": "helioviewer_viewport_tile", "version": 1},
            "delivery": "raw_on_demand",
        },
        "spatial_use": {
            "eligible": False,
            "reason": "viewport_tile_has_no_validated_solar_surface_projection",
            "contract": None,
        },
    }

    def fake_latest_aia_tile(
        channel: str,
        jd_tdb: float | None = None,
        force_refresh: bool = False,
    ):
        assert channel == "aia_193"
        assert jd_tdb is None
        assert force_refresh is False
        return payload

    monkeypatch.setattr(server.SOLAR_REALTIME_DATA, "latest_aia_tile", fake_latest_aia_tile)

    response = client.get("/solar/realtime/aia-tile", params={"channel": "aia_193"})
    assert response.status_code == 200
    assert response.content == payload["content"]
    assert response.headers.get("content-type", "").startswith("image/png")
    assert response.headers.get("x-solar-aia-channel") == "aia_193"
    assert response.headers.get("x-solar-aia-image-id") == "184733789"
    assert response.headers["x-solar-aia-artifact"] == "helioviewer_viewport_tile/v1"
    assert response.headers["x-solar-aia-spatial-use"] == "disabled"
    assert response.headers["x-solar-aia-spatial-reason"] == (
        "viewport_tile_has_no_validated_solar_surface_projection"
    )
    assert response.headers["cache-control"].startswith("private,")
    assert {"authorization", "x-api-key"}.issubset({
        item.strip().lower() for item in response.headers["vary"].split(",")
    })


@pytest.mark.parametrize(
    ("code", "message"),
    (
        (
            "invalid_aia_media_type",
            "AIA tile upstream Content-Type is invalid.",
        ),
        (
            "unsupported_aia_media_type",
            "AIA tile upstream media type is unsupported.",
        ),
        (
            "invalid_aia_png_signature",
            "AIA tile PNG signature is invalid.",
        ),
        (
            "invalid_aia_png_header",
            "AIA tile PNG header is invalid.",
        ),
        (
            "invalid_aia_png_dimensions",
            "AIA tile PNG dimensions are invalid.",
        ),
    ),
)
def test_aia_tile_api_preserves_typed_validation_failure_without_detail_leak(
    monkeypatch,
    code: str,
    message: str,
) -> None:
    def fail_validation(*_args, **_kwargs):
        raise SolarRealtimeFetchError(code, "secret upstream body and URL")

    monkeypatch.setattr(server, "_solar_aia_tile_rate_locks", {})
    monkeypatch.setattr(
        server.SOLAR_REALTIME_DATA,
        "latest_aia_tile",
        fail_validation,
    )

    response = client.get("/solar/realtime/aia-tile", params={"channel": "aia_193"})

    assert response.status_code == 503
    assert response.json() == {
        "detail": {
            "code": code,
            "message": message,
            "retryable": True,
        }
    }
    assert "secret" not in response.text


@pytest.mark.parametrize(
    "content_type",
    (None, 123, "", "Image/PNG", "image/png; charset=binary"),
)
def test_aia_tile_api_rejects_noncanonical_provider_media_contract(
    monkeypatch,
    content_type: object,
) -> None:
    monkeypatch.setattr(server, "_solar_aia_tile_rate_locks", {})
    monkeypatch.setattr(
        server.SOLAR_REALTIME_DATA,
        "latest_aia_tile",
        lambda *_args, **_kwargs: {
            "channel": "aia_193",
            "image_id": "1",
            "content": b"provider bytes",
            "content_type": content_type,
        },
    )

    response = client.get("/solar/realtime/aia-tile", params={"channel": "aia_193"})

    assert response.status_code == 503
    assert response.json() == {
        "detail": {
            "code": "invalid_aia_provider_contract",
            "message": "AIA tile provider returned an invalid artifact contract.",
            "retryable": True,
        }
    }
    assert response.content != b"provider bytes"


def test_aia_tile_api_rejects_non_string_equality_spoofed_media_contract(
    monkeypatch,
    aia_png_equality_spoof: object,
) -> None:
    invalid_body = b"arbitrary bytes from equality-spoofed provider contract"
    monkeypatch.setattr(server, "_solar_aia_tile_rate_locks", {})
    monkeypatch.setattr(
        server.SOLAR_REALTIME_DATA,
        "latest_aia_tile",
        lambda *_args, **_kwargs: {
            "channel": "aia_193",
            "image_id": "1",
            "content": invalid_body,
            "content_type": aia_png_equality_spoof,
        },
    )

    response = client.get("/solar/realtime/aia-tile", params={"channel": "aia_193"})

    assert response.status_code == 503
    assert response.json() == {
        "detail": {
            "code": "invalid_aia_provider_contract",
            "message": "AIA tile provider returned an invalid artifact contract.",
            "retryable": True,
        }
    }
    assert response.content != invalid_body


def test_aia_tile_api_preserves_typed_provider_contract_failure(monkeypatch) -> None:
    monkeypatch.setattr(server, "_solar_aia_tile_rate_locks", {})
    monkeypatch.setattr(
        server.SOLAR_REALTIME_DATA,
        "latest_aia_tile",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            SolarRealtimeFetchError(
                "invalid_aia_provider_contract",
                "secret internal provider detail",
            )
        ),
    )

    response = client.get("/solar/realtime/aia-tile", params={"channel": "aia_193"})

    assert response.status_code == 503
    assert response.json() == {
        "detail": {
            "code": "invalid_aia_provider_contract",
            "message": "AIA tile provider returned an invalid artifact contract.",
            "retryable": True,
        }
    }
    assert "secret" not in response.text


@pytest.mark.parametrize("error_type", (RuntimeError, KeyError))
def test_aia_tile_api_sanitizes_unknown_acquisition_failure(
    monkeypatch,
    error_type: type[Exception],
) -> None:
    monkeypatch.setattr(server, "_solar_aia_tile_rate_locks", {})
    monkeypatch.setattr(
        server.SOLAR_REALTIME_DATA,
        "latest_aia_tile",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            error_type("secret upstream exception detail")
        ),
    )

    response = client.get("/solar/realtime/aia-tile", params={"channel": "aia_193"})

    assert response.status_code == 503
    assert response.json() == {
        "detail": {
            "code": "aia_tile_unavailable",
            "message": "AIA tile acquisition is unavailable.",
            "retryable": True,
        }
    }
    assert "secret" not in response.text


def test_aia_tile_response_rejects_unvalidated_spatial_eligibility_claim(
    monkeypatch,
) -> None:
    payload = {
        "channel": "aia_193",
        "content": b"png",
        "content_type": "image/png",
        "spatial_use": {
            "eligible": True,
            "reason": None,
            "contract": {"projection": "equirectangular"},
        },
    }
    monkeypatch.setattr(
        server.SOLAR_REALTIME_DATA,
        "latest_aia_tile",
        lambda *_args, **_kwargs: payload,
    )

    response = client.get("/solar/realtime/aia-tile", params={"channel": "aia_193"})

    assert response.status_code == 200
    assert response.headers["x-solar-aia-spatial-use"] == "disabled"
    assert response.headers["x-solar-aia-spatial-reason"] == (
        "missing_validated_spatial_projection_contract"
    )


def test_aia_tile_response_cannot_label_a_viewport_artifact_spatially_eligible(
    monkeypatch,
) -> None:
    payload = {
        "channel": "aia_193",
        "content": b"png",
        "content_type": "image/png",
        "artifact": {
            "schema": {"name": "helioviewer_viewport_tile", "version": 1},
            "delivery": "raw_on_demand",
        },
        "spatial_use": {
            "eligible": True,
            "reason": None,
            "contract": {
                "schema": {
                    "name": "solar_surface_texture_projection",
                    "version": 1,
                },
                "projection": "equirectangular",
                "coordinate_frame": "iau_sun_body_fixed",
                "coverage": "full_surface",
                "uv_mapping": "sun_surface_uv_v1",
            },
        },
    }
    monkeypatch.setattr(
        server.SOLAR_REALTIME_DATA,
        "latest_aia_tile",
        lambda *_args, **_kwargs: payload,
    )

    response = client.get("/solar/realtime/aia-tile", params={"channel": "aia_193"})

    assert response.status_code == 200
    assert response.headers["x-solar-aia-artifact"] == (
        "helioviewer_viewport_tile/v1"
    )
    assert response.headers["x-solar-aia-spatial-use"] == "disabled"
    assert response.headers["x-solar-aia-spatial-reason"] == (
        "artifact_not_spatial_surface_texture"
    )


def test_aia_tile_response_labels_only_the_complete_surface_texture_contract_eligible(
    monkeypatch,
) -> None:
    payload = {
        "channel": "aia_193",
        "content": b"png",
        "content_type": "image/png",
        "artifact": {
            "schema": {"name": "solar_surface_texture", "version": 1},
            "delivery": "raw_on_demand",
        },
        "spatial_use": {
            "eligible": True,
            "reason": None,
            "contract": {
                "schema": {
                    "name": "solar_surface_texture_projection",
                    "version": 1,
                },
                "projection": "equirectangular",
                "coordinate_frame": "iau_sun_body_fixed",
                "coverage": "full_surface",
                "uv_mapping": "sun_surface_uv_v1",
            },
        },
    }
    monkeypatch.setattr(
        server.SOLAR_REALTIME_DATA,
        "latest_aia_tile",
        lambda *_args, **_kwargs: payload,
    )

    response = client.get("/solar/realtime/aia-tile", params={"channel": "aia_193"})

    assert response.status_code == 200
    assert response.headers["x-solar-aia-artifact"] == "solar_surface_texture/v1"
    assert response.headers["x-solar-aia-spatial-use"] == "eligible"
    assert "x-solar-aia-spatial-reason" not in response.headers


def test_aia_tile_rejects_provider_identity_drift_instead_of_serving_wrong_image(
    monkeypatch,
) -> None:
    requested_ids: list[str | None] = []

    def fake_latest_aia_tile(
        channel: str,
        jd_tdb: float | None = None,
        force_refresh: bool = False,
        *,
        image_id: str | None = None,
    ):
        requested_ids.append(image_id)
        return {
            "channel": channel,
            "image_id": "image-b",
            "image_date": "2026-02-17 03:20:41",
            "tile_url": "https://example.invalid/image-b.png",
            "content": b"image-b",
            "content_type": "image/png",
        }

    monkeypatch.setattr(server, "_solar_aia_tile_rate_locks", {})
    monkeypatch.setattr(server.SOLAR_REALTIME_DATA, "latest_aia_tile", fake_latest_aia_tile)

    response = client.get(
        "/solar/realtime/aia-tile",
        params={"channel": "aia_193", "image_id": "image-a"},
    )

    assert requested_ids == ["image-a"]
    assert response.status_code == 409
    assert response.json()["detail"] == {
        "code": "aia_image_identity_mismatch",
        "message": "Requested AIA image is no longer the retained channel snapshot.",
        "requested_image_id": "image-a",
        "available_image_id": "image-b",
        "retryable": True,
    }


def test_aia_tile_rejects_oversized_image_identity_before_provider(
    monkeypatch,
) -> None:
    provider_calls = 0

    def record_provider(*_args, **_kwargs):
        nonlocal provider_calls
        provider_calls += 1
        return {}

    monkeypatch.setattr(server.SOLAR_REALTIME_DATA, "latest_aia_tile", record_provider)

    response = client.get(
        "/solar/realtime/aia-tile",
        params={"channel": "aia_193", "image_id": "x" * 129},
    )

    assert response.status_code == 422
    assert provider_calls == 0


def test_solar_realtime_has_typed_aggregate_timeout_below_browser_deadline(
    monkeypatch,
) -> None:
    assert 0 < server.SOLAR_REALTIME_REQUEST_TIMEOUT_SECONDS < 15.0

    async def timeout_owned_thread(_function, *args, **kwargs):
        kwargs["guard"].release()
        raise TimeoutError

    monkeypatch.setattr(server, "_solar_realtime_rate_locks", {})
    monkeypatch.setattr(server, "_run_owned_thread", timeout_owned_thread)
    monkeypatch.setattr(server.SOLAR_REALTIME_DATA, "latest", lambda **_kwargs: {})

    response = client.get("/solar/realtime")

    assert response.status_code == 503
    assert response.headers["retry-after"] == "2"
    assert response.json()["detail"] == {
        "code": "solar_realtime_timeout",
        "message": "Solar realtime acquisition exceeded its aggregate deadline.",
        "retryable": True,
        "timeout_seconds": server.SOLAR_REALTIME_REQUEST_TIMEOUT_SECONDS,
    }


def test_aia_tile_uses_canonical_jdtdb_query(monkeypatch) -> None:
    requested_epochs: list[float | None] = []
    payload = {
        "channel": "aia_193",
        "image_id": "184733789",
        "image_date": "2026-02-17 03:19:41",
        "tile_url": "https://example.invalid/tile.png",
        "content": b"png",
        "content_type": "image/png",
    }

    def fake_latest_aia_tile(
        channel: str,
        jd_tdb: float | None = None,
        force_refresh: bool = False,
    ):
        assert channel == "aia_193"
        assert force_refresh is False
        requested_epochs.append(jd_tdb)
        return payload

    monkeypatch.setattr(server, "_solar_aia_tile_rate_locks", {})
    monkeypatch.setattr(server.SOLAR_REALTIME_DATA, "latest_aia_tile", fake_latest_aia_tile)

    response = client.get(
        "/solar/realtime/aia-tile",
        params={"channel": "aia_193", "jd_tdb": 2_459_291.4394237916},
    )

    assert response.status_code == 200
    assert requested_epochs == [2_459_291.4394237916]


def test_aia_tile_accepts_equal_legacy_epoch_alias(monkeypatch) -> None:
    requested_epochs: list[float | None] = []
    payload = {
        "channel": "aia_193",
        "content": b"png",
        "content_type": "image/png",
    }

    def fake_latest_aia_tile(
        channel: str,
        jd_tdb: float | None = None,
        force_refresh: bool = False,
    ):
        requested_epochs.append(jd_tdb)
        return payload

    monkeypatch.setattr(server, "_solar_aia_tile_rate_locks", {})
    monkeypatch.setattr(server.SOLAR_REALTIME_DATA, "latest_aia_tile", fake_latest_aia_tile)

    response = client.get(
        "/solar/realtime/aia-tile",
        params={"jd_tdb": 2_459_291.5, "jd": 2_459_291.5},
    )

    assert response.status_code == 200
    assert requested_epochs == [2_459_291.5]


def test_aia_tile_rejects_conflicting_epoch_aliases_before_admission(monkeypatch) -> None:
    admission_calls = 0

    def record_admission(_request) -> None:
        nonlocal admission_calls
        admission_calls += 1

    monkeypatch.setattr(server, "_enforce_solar_aia_tile_rate_limit", record_admission)

    response = client.get(
        "/solar/realtime/aia-tile",
        params={"jd_tdb": 2_459_291.5, "jd": 2_459_292.5},
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "conflicting_julian_date_aliases"
    assert admission_calls == 0


@pytest.mark.parametrize(
    ("parameter", "expected_code"),
    (("jd_tdb", "invalid_jd_tdb"), ("jd", "invalid_jd")),
)
def test_aia_tile_rejects_nonfinite_epoch_before_admission(
    monkeypatch,
    parameter: str,
    expected_code: str,
) -> None:
    admission_calls = 0

    def record_admission(_request) -> None:
        nonlocal admission_calls
        admission_calls += 1

    monkeypatch.setattr(server, "_enforce_solar_aia_tile_rate_limit", record_admission)

    response = client.get("/solar/realtime/aia-tile", params={parameter: "nan"})

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == expected_code
    assert admission_calls == 0


def test_aia_tile_rejects_rate_limit(monkeypatch) -> None:
    payload = {
        "channel": "aia_193",
        "image_id": "184733789",
        "image_date": "2026-02-17 03:19:41",
        "tile_url": "https://api.helioviewer.org/v2/getTile/?id=184733789&x=-1&y=-1&imageScale=0.6",
        "content": b"\x89PNG\r\n\x1a\nfake",
        "content_type": "image/png",
    }

    def fake_latest_aia_tile(
        channel: str,
        jd_tdb: float | None = None,
        force_refresh: bool = False,
    ):
        assert channel == "aia_193"
        assert jd_tdb is None
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
    assert response.json() == {
        "detail": {
            "code": "aia_tile_unavailable",
            "message": "AIA tile acquisition is unavailable.",
            "retryable": True,
        }
    }


def test_aia_tile_environment_knobs_cannot_exceed_compile_time_hard_caps(
    monkeypatch,
) -> None:
    monkeypatch.setenv("SOLAR_AIA_TILE_CONCURRENT_REQUEST_LIMIT", "1000000")
    monkeypatch.setenv("SOLAR_AIA_TILE_REQUEST_TIMEOUT_SECONDS", "1000000")

    assert (
        server._load_solar_aia_tile_concurrent_request_limit()
        == server.SOLAR_AIA_TILE_CONCURRENT_REQUEST_HARD_MAX
    )
    assert (
        server._load_solar_aia_tile_request_timeout()
        == server.SOLAR_AIA_TILE_REQUEST_TIMEOUT_HARD_MAX_SECONDS
    )
    assert (
        1
        <= server.SOLAR_AIA_TILE_CONCURRENT_REQUEST_LIMIT
        <= server.SOLAR_AIA_TILE_CONCURRENT_REQUEST_HARD_MAX
    )
    assert (
        0.5
        <= server.SOLAR_AIA_TILE_REQUEST_TIMEOUT_SECONDS
        <= server.SOLAR_AIA_TILE_REQUEST_TIMEOUT_HARD_MAX_SECONDS
        < 15.0
    )


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


def test_solar_physics_returns_coronal_hole_section() -> None:
    """The /solar/physics response must include coronal_holes with required fields."""
    response = client.get(
        "/solar/physics",
        params={
            "jd": 2_460_000.5,
            "fidelity": "operational",
            "max_features": 32,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    ch = payload.get("coronal_holes")
    assert ch is not None
    assert "source" in ch
    assert "holes" in ch
    assert isinstance(ch["holes"], list)
    assert "coverage_fraction" in ch
    assert "hole_count" in ch
    assert ch["hole_count"] == len(ch["holes"])
    # Check that each hole has required fields
    if ch["holes"]:
        hole = ch["holes"][0]
        assert "center_lat_rad" in hole
        assert "center_lon_rad" in hole
        assert "extent_lat_rad" in hole
        assert "extent_lon_rad" in hole
        assert "type" in hole


def test_solar_physics_returns_pfss_field_lines() -> None:
    response = client.get(
        "/solar/physics",
        params={
            "jd": 2_460_000.5,
            "fidelity": "preview",  # Faster solve
            "max_features": 64,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    
    assert "pfss_field_lines" in payload
    pfss = payload["pfss_field_lines"]
    
    assert "source" in pfss
    assert "carrington_rotation" in pfss
    assert "source_surface_radii" in pfss
    assert "lines" in pfss
    assert isinstance(pfss["lines"], list)
    assert len(pfss["lines"]) > 0
    assert "arc" in pfss["lines"][0]
    assert "is_open" in pfss["lines"][0]
    import json
    json.dumps(payload, allow_nan=False)
    wsa = pfss['wsa']
    assert wsa['model'] == 'wsa_inspired_v1'
    assert wsa['calibration_status'] == 'unvalidated'
    for key in ('valid_fraction', 'indeterminate_fraction', 'coverage_fraction'):
        assert 0 <= wsa[key] <= 1
    assert isinstance(wsa['quality_reasons'], list)
    assert wsa['mean_velocity_kms'] is None or 265 <= wsa['mean_velocity_kms'] <= 850
