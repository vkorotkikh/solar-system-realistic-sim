from __future__ import annotations

import copy
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

from sim.solar_realtime_data import SolarRealtimeDataProvider


FIXTURE_DIR = Path(__file__).parent / "fixtures" / "solar"


def _fixture(name: str) -> Any:
    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))


def _wind_row(time_tag: str, **overrides: Any) -> dict[str, Any]:
    row: dict[str, Any] = {
        "active": True,
        "overall_quality": 0,
        "source": "SOLAR1",
        "time_tag": time_tag,
        "proton_density": 4.0,
        "proton_speed": 450.0,
        "proton_temperature": 150_000.0,
    }
    row.update(overrides)
    return row


def _mag_row(time_tag: str, **overrides: Any) -> dict[str, Any]:
    row: dict[str, Any] = {
        "active": True,
        "overall_quality": 0,
        "source": "SOLAR1",
        "time_tag": time_tag,
        "bt": 4.0,
        "bz_gsm": -1.0,
    }
    row.update(overrides)
    return row


def _install_fixture_fetcher(
    monkeypatch: pytest.MonkeyPatch,
    provider: SolarRealtimeDataProvider,
    *,
    wind: Any | None = None,
    mag: Any | None = None,
) -> list[tuple[str, int | None]]:
    monkeypatch.setattr(
        provider,
        "_utc_now",
        lambda: datetime(2026, 9, 26, 23, 0, tzinfo=timezone.utc),
    )
    payloads = {
        provider.NOAA_WIND_URL: (
            _fixture("swpc_rtsw_wind_1m.json") if wind is None else wind
        ),
        provider.NOAA_MAG_URL: (
            _fixture("swpc_rtsw_mag_1m.json") if mag is None else mag
        ),
    }
    calls: list[tuple[str, int | None]] = []

    def fetch_json(
        url: str,
        *,
        max_bytes: int | None = None,
        parse_int: Any = None,
    ) -> Any:
        del parse_int
        calls.append((url, max_bytes))
        return payloads[url]

    monkeypatch.setattr(provider, "_fetch_json", fetch_json)
    return calls


def _install_raw_swpc_fetcher(
    monkeypatch: pytest.MonkeyPatch,
    provider: SolarRealtimeDataProvider,
    *,
    wind: bytes,
    mag: bytes,
) -> list[tuple[str, int]]:
    monkeypatch.setattr(
        provider,
        "_utc_now",
        lambda: datetime(2026, 9, 26, 23, 0, tzinfo=timezone.utc),
    )
    payloads = {
        provider.NOAA_WIND_URL: wind,
        provider.NOAA_MAG_URL: mag,
    }
    calls: list[tuple[str, int]] = []

    def request_bytes(url: str, *, max_bytes: int) -> tuple[bytes, str]:
        calls.append((url, max_bytes))
        payload = payloads[url]
        assert len(payload) <= max_bytes
        return payload, "application/json"

    monkeypatch.setattr(provider, "_request_bytes", request_bytes)
    return calls


def test_fixture_manifest_pins_authority_selection_contract_and_hashes() -> None:
    manifest = _fixture("swpc_rtsw_manifest.json")

    assert manifest["authority"] == {
        "notice": "NWS SCN 26-21",
        "notice_url": (
            "https://www.weather.gov/media/notification/pdf_2026/"
            "scn26-21_Data_Format_Changes_Impacting_SWPC_Products.pdf"
        ),
    }
    assert manifest["selection_contract"] == {
        "active": True,
        "overall_quality": 0,
        "required_numeric_fields": "finite JSON numbers within defensive_operational_envelope_v1",
        "selection": "newest qualifying time_tag",
        "fixture_reference_time_utc": "2026-09-26T23:00:00Z",
        "maximum_sample_age_s": 900.0,
        "maximum_future_offset_s": 120.0,
        "maximum_product_skew_s": 300.0,
        "combined_time_policy": "oldest_component",
        "numeric_bounds": {
            "proton_density": [1e-06, 1000.0],
            "proton_speed": [100.0, 3000.0],
            "proton_temperature": [1.0, 100000000.0],
            "bt": [0.0, 500.0],
            "bz_gsm": [-500.0, 500.0],
        },
    }
    expected_endpoints = {
        "swpc_rtsw_wind_1m.json": (
            "https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json"
        ),
        "swpc_rtsw_mag_1m.json": (
            "https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json"
        ),
    }
    for fixture_name, metadata in manifest["fixtures"].items():
        fixture_path = FIXTURE_DIR / fixture_name
        assert metadata["endpoint"] == expected_endpoints[fixture_name]
        assert metadata["retrieved_on_utc"] == "2026-09-26"
        assert metadata["content_status"] == "minimized_and_edited"
        assert metadata["transformations"]
        assert hashlib.sha256(fixture_path.read_bytes()).hexdigest() == metadata["sha256"]


def test_fetch_swpc_selects_newest_active_quality_zero_finite_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    calls = _install_fixture_fetcher(monkeypatch, provider)

    result = provider._fetch_swpc()

    assert calls == [
        (provider.NOAA_WIND_URL, 4 * 1024 * 1024),
        (provider.NOAA_MAG_URL, 3 * 1024 * 1024),
    ]
    assert result["schema"] == {
        "name": "noaa_swpc_rtsw_context",
        "version": 2,
    }
    assert result["time_tag"] == "2026-09-26T22:55:00Z"
    assert result["wind_time_tag"] == "2026-09-26T22:55:00Z"
    assert result["mag_time_tag"] == "2026-09-26T22:58:00Z"
    assert result["retrieved_at_utc"] == "2026-09-26T23:00:00Z"
    assert result["age_s"] == 300.0
    assert result["wind_age_s"] == 300.0
    assert result["mag_age_s"] == 120.0
    assert result["product_skew_s"] == 180.0
    assert result["solar_wind_speed_kms"] == 451.7
    assert result["proton_density_pcc"] == 4.02
    assert result["temperature_k"] == 156212.0
    assert result["imf_bt_nt"] == 4.28
    assert result["imf_bz_nt"] == -1.1
    assert result["dynamic_pressure_npa"] == pytest.approx(1.371886955492280)
    assert result["activity_proxy"] == pytest.approx(0.204259856630824)
    assert result["units"] == {
        "solar_wind_speed_kms": "km/s",
        "proton_density_pcc": "protons/cm^3",
        "temperature_k": "K",
        "imf_bt_nt": "nT",
        "imf_bz_nt": "nT",
        "dynamic_pressure_npa": "nPa",
        "activity_proxy": "1",
    }
    assert result["provenance"] == {
        "provider": "NOAA SWPC",
        "product_notice": "NWS SCN 26-21",
        "cadence": "PT1M",
        "temporal_contract": {
            "maximum_sample_age_s": 900.0,
            "maximum_future_offset_s": 120.0,
            "maximum_product_skew_s": 300.0,
            "combined_time_policy": "oldest_component",
        },
        "numeric_validation": {
            "version": "defensive_operational_envelope_v1",
            "bounds": {
                "proton_density": [1e-06, 1000.0],
                "proton_speed": [100.0, 3000.0],
                "proton_temperature": [1.0, 100000000.0],
                "bt": [0.0, 500.0],
                "bz_gsm": [-500.0, 500.0],
            },
        },
        "wind": {
            "endpoint": provider.NOAA_WIND_URL,
            "source": "SOLAR1",
            "active": True,
            "overall_quality": 0,
        },
        "mag": {
            "endpoint": provider.NOAA_MAG_URL,
            "source": "SOLAR1",
            "active": True,
            "overall_quality": 0,
        },
    }


@pytest.mark.parametrize("missing_product", ("wind", "mag"))
def test_fetch_swpc_fails_closed_without_both_usable_products(
    monkeypatch: pytest.MonkeyPatch,
    missing_product: str,
) -> None:
    provider = SolarRealtimeDataProvider()
    unusable = [
        {
            "active": True,
            "overall_quality": 1,
            "source": "SOLAR1",
            "time_tag": "2026-09-26T23:00:00",
        }
    ]
    _install_fixture_fetcher(
        monkeypatch,
        provider,
        wind=unusable if missing_product == "wind" else None,
        mag=unusable if missing_product == "mag" else None,
    )

    with pytest.raises(RuntimeError, match="missing usable active quality rows"):
        provider._fetch_swpc()


@pytest.mark.parametrize(
    ("product", "time_tag"),
    [
        ("wind", "1970-01-01T00:00:00Z"),
        ("mag", "1970-01-01T00:00:00Z"),
        ("wind", "2099-01-01T00:00:00Z"),
        ("mag", "2099-01-01T00:00:00Z"),
    ],
)
def test_fetch_swpc_rejects_stale_or_future_component_rows(
    monkeypatch: pytest.MonkeyPatch,
    product: str,
    time_tag: str,
) -> None:
    provider = SolarRealtimeDataProvider()
    wind = _fixture("swpc_rtsw_wind_1m.json")
    mag = _fixture("swpc_rtsw_mag_1m.json")
    target = wind if product == "wind" else mag
    for row in target:
        if row.get("active") is True and row.get("overall_quality") == 0:
            row["time_tag"] = time_tag
    _install_fixture_fetcher(monkeypatch, provider, wind=wind, mag=mag)

    with pytest.raises(RuntimeError, match="missing usable active quality rows"):
        provider._fetch_swpc()


def test_fetch_swpc_rejects_temporally_incoherent_product_pair(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    wind = _fixture("swpc_rtsw_wind_1m.json")
    mag = _fixture("swpc_rtsw_mag_1m.json")
    for row in wind:
        if row.get("active") is True and row.get("overall_quality") == 0:
            row["time_tag"] = "2026-09-26T22:45:00Z"
    _install_fixture_fetcher(monkeypatch, provider, wind=wind, mag=mag)

    with pytest.raises(RuntimeError, match="exceed temporal skew"):
        provider._fetch_swpc()


def test_fetch_swpc_selects_newest_coherent_pair_instead_of_failing_on_newest_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    wind = [
        _wind_row("2026-09-26T22:59:00Z", proton_speed=700.0),
        _wind_row("2026-09-26T22:54:00Z", proton_speed=440.0),
    ]
    mag = [_mag_row("2026-09-26T22:50:00Z")]
    _install_fixture_fetcher(monkeypatch, provider, wind=wind, mag=mag)

    result = provider._fetch_swpc()

    assert result["wind_time_tag"] == "2026-09-26T22:54:00Z"
    assert result["mag_time_tag"] == "2026-09-26T22:50:00Z"
    assert result["product_skew_s"] == 240.0
    assert result["solar_wind_speed_kms"] == 440.0


def test_fetch_swpc_advances_newest_magnetometer_candidates_without_mutating_inputs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    wind = [_wind_row("2026-09-26T22:50:00Z")]
    mag = [
        _mag_row("2026-09-26T22:59:00Z", bt=7.0),
        _mag_row("2026-09-26T22:54:00Z", bt=4.5),
    ]
    wind_before = copy.deepcopy(wind)
    mag_before = copy.deepcopy(mag)
    _install_fixture_fetcher(monkeypatch, provider, wind=wind, mag=mag)

    result = provider._fetch_swpc()

    assert result["wind_time_tag"] == "2026-09-26T22:50:00Z"
    assert result["mag_time_tag"] == "2026-09-26T22:54:00Z"
    assert result["product_skew_s"] == 240.0
    assert result["imf_bt_nt"] == 4.5
    assert wind == wind_before
    assert mag == mag_before


def test_fetch_swpc_accepts_exactly_300_second_product_skew(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    wind = [_wind_row("2026-09-26T22:55:00Z")]
    mag = [_mag_row("2026-09-26T22:50:00Z")]
    _install_fixture_fetcher(monkeypatch, provider, wind=wind, mag=mag)

    result = provider._fetch_swpc()

    assert result["wind_time_tag"] == "2026-09-26T22:55:00Z"
    assert result["mag_time_tag"] == "2026-09-26T22:50:00Z"
    assert result["product_skew_s"] == 300.0


def test_fetch_swpc_skips_newest_magnetometer_row_with_impossible_vector(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    mag = [
        _mag_row("2026-09-26T22:59:00Z", bt=4.0, bz_gsm=-5.0),
        _mag_row("2026-09-26T22:58:00Z", bt=4.2, bz_gsm=-1.1),
    ]
    _install_fixture_fetcher(monkeypatch, provider, mag=mag)

    result = provider._fetch_swpc()

    assert result["mag_time_tag"] == "2026-09-26T22:58:00Z"
    assert result["imf_bt_nt"] == 4.2
    assert result["imf_bz_nt"] == -1.1


@pytest.mark.parametrize(
    "malformed_row",
    [
        _wind_row("2026-09-26T22:59:00Z", overall_quality=10**400),
        _wind_row("2026-09-26T22:59:00Z", proton_speed=10**400),
        _wind_row("2026-09-26T22:59:00Z", source="\ud800"),
        _wind_row("9999-12-31T23:59:59-23:59"),
    ],
)
def test_fetch_swpc_skips_adversarial_row_without_suppressing_later_valid_data(
    monkeypatch: pytest.MonkeyPatch,
    malformed_row: dict[str, Any],
) -> None:
    provider = SolarRealtimeDataProvider()
    wind = [malformed_row, _wind_row("2026-09-26T22:55:00Z")]
    mag = [_mag_row("2026-09-26T22:58:00Z")]
    _install_fixture_fetcher(monkeypatch, provider, wind=wind, mag=mag)

    result = provider._fetch_swpc()

    assert result["wind_time_tag"] == "2026-09-26T22:55:00Z"
    assert result["mag_time_tag"] == "2026-09-26T22:58:00Z"


def test_fetch_swpc_raw_json_skips_overlong_integer_and_selects_later_row(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    valid_wind_row = json.dumps(
        _wind_row("2026-09-26T22:55:00Z", proton_speed=440.0),
        separators=(",", ":"),
    ).encode("utf-8")
    wind = (
        b'[{"active":true,"overall_quality":0,"source":"SOLAR1",'
        b'"time_tag":"2026-09-26T22:59:00Z","proton_density":4.0,'
        b'"proton_speed":'
        + (b"9" * 4_301)
        + b',"proton_temperature":150000},'
        + valid_wind_row
        + b"]"
    )
    mag = json.dumps(
        [_mag_row("2026-09-26T22:58:00Z")],
        separators=(",", ":"),
    ).encode("utf-8")
    calls = _install_raw_swpc_fetcher(
        monkeypatch,
        provider,
        wind=wind,
        mag=mag,
    )

    result = provider._fetch_swpc()

    assert calls == [
        (provider.NOAA_WIND_URL, provider.SWPC_WIND_MAX_RESPONSE_BYTES),
        (provider.NOAA_MAG_URL, provider.SWPC_MAG_MAX_RESPONSE_BYTES),
    ]
    assert result["wind_time_tag"] == "2026-09-26T22:55:00Z"
    assert result["solar_wind_speed_kms"] == 440.0


def test_fetch_swpc_skips_non_ascii_and_lone_surrogate_time_tags(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    wind = [
        _wind_row("2026-09-26\u202822:59:00Z", proton_speed=700.0),
        _wind_row("\ud800", proton_speed=600.0),
        _wind_row("2026-09-26T22:55:00Z", proton_speed=440.0),
    ]
    mag = [_mag_row("2026-09-26T22:58:00Z")]
    _install_fixture_fetcher(monkeypatch, provider, wind=wind, mag=mag)

    result = provider._fetch_swpc()

    assert result["wind_time_tag"] == "2026-09-26T22:55:00Z"
    assert result["solar_wind_speed_kms"] == 440.0


@pytest.mark.parametrize(
    ("product", "field", "value"),
    [
        ("wind", "proton_density", 0.0),
        ("wind", "proton_density", 1e308),
        ("wind", "proton_speed", 99.0),
        ("wind", "proton_speed", 1e308),
        ("wind", "proton_temperature", 0.0),
        ("wind", "proton_temperature", 1e308),
        ("mag", "bt", -1.0),
        ("mag", "bt", 1e308),
        ("mag", "bz_gsm", -9999.0),
        ("mag", "bz_gsm", 1e308),
    ],
)
def test_fetch_swpc_rejects_values_outside_defensive_operational_envelope(
    monkeypatch: pytest.MonkeyPatch,
    product: str,
    field: str,
    value: float,
) -> None:
    provider = SolarRealtimeDataProvider()
    wind = _fixture("swpc_rtsw_wind_1m.json")
    mag = _fixture("swpc_rtsw_mag_1m.json")
    target = wind if product == "wind" else mag
    for row in target:
        if row.get("active") is True and row.get("overall_quality") == 0:
            row[field] = value
    _install_fixture_fetcher(monkeypatch, provider, wind=wind, mag=mag)

    with pytest.raises(RuntimeError, match="missing usable active quality rows"):
        provider._fetch_swpc()


def test_fetch_swpc_rejects_bz_component_larger_than_total_field(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    mag = _fixture("swpc_rtsw_mag_1m.json")
    for row in mag:
        if row.get("active") is True and row.get("overall_quality") == 0:
            row["bt"] = 4.0
            row["bz_gsm"] = -5.0
    _install_fixture_fetcher(monkeypatch, provider, mag=mag)

    with pytest.raises(RuntimeError, match="missing usable active quality rows"):
        provider._fetch_swpc()


def test_fetch_swpc_rejects_removed_header_row_schema(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    legacy_wind = [
        ["time_tag", "density", "speed", "temperature"],
        ["2026-09-26 22:55:00.000", "4.02", "451.7", "156212"],
    ]
    _install_fixture_fetcher(monkeypatch, provider, wind=legacy_wind)

    with pytest.raises(RuntimeError, match="missing usable active quality rows"):
        provider._fetch_swpc()


def test_swpc_capabilities_publish_current_products_and_hard_caps() -> None:
    provider = SolarRealtimeDataProvider()

    swpc = provider.capabilities()["sources"]["swpc"]

    assert swpc == {
        "wind_url": "https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json",
        "mag_url": "https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json",
        "wind_max_response_bytes": 4 * 1024 * 1024,
        "mag_max_response_bytes": 3 * 1024 * 1024,
        "product_notice": "NWS SCN 26-21",
        "maximum_sample_age_s": 900.0,
        "maximum_future_offset_s": 120.0,
        "maximum_product_skew_s": 300.0,
        "numeric_validation": {
            "version": "defensive_operational_envelope_v1",
            "bounds": {
                "proton_density": [1e-06, 1000.0],
                "proton_speed": [100.0, 3000.0],
                "proton_temperature": [1.0, 100000000.0],
                "bt": [0.0, 500.0],
                "bz_gsm": [-500.0, 500.0],
            },
        },
    }


def test_snapshot_status_identifies_current_swpc_wind_product(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = SolarRealtimeDataProvider()
    monkeypatch.setattr(
        provider,
        "_fetch_swpc",
        lambda: {"time_tag": "2026-09-26T22:58:00Z", "activity_proxy": 0.2},
    )
    monkeypatch.setattr(provider, "_fetch_silso", lambda: (_ for _ in ()).throw(RuntimeError()))
    monkeypatch.setattr(provider, "_fetch_sdo_aia", lambda _jd: (_ for _ in ()).throw(RuntimeError()))

    snapshot = provider._fetch_snapshot(None)

    assert snapshot["source_status"]["swpc"] == {
        "ok": True,
        "updated": "2026-09-26T22:58:00Z",
        "endpoint": provider.NOAA_WIND_URL,
    }
