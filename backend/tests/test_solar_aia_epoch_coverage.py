"""Real nearest-image responses must not imply coverage of an unrelated epoch."""

from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path

import pytest

from backend.sim.solar_realtime_data import (
    SolarRealtimeDataProvider,
    SolarRealtimeFetchError,
)


CAPTURE = Path(__file__).resolve().parents[2] / "agent-notes/aia-date-coverage-2026-10-14"
MANIFEST = json.loads((CAPTURE / "manifest.json").read_text())
CASES = MANIFEST["requests"]


@pytest.mark.parametrize("case", CASES, ids=lambda row: f'{row["requestedUtc"]}-{row["sourceId"]}')
def test_real_aia_archive_coverage_is_relative_to_requested_epoch(monkeypatch, case):
    raw = (CAPTURE / case["file"]).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == case["sha256"]
    assert case["httpStatus"] == 200 and case["curlExit"] == 0
    provider = SolarRealtimeDataProvider()
    monkeypatch.setattr(provider, "_fetch_json", lambda _url: json.loads(raw))
    requested = datetime.fromisoformat(case["requestedUtc"].replace("Z", "+00:00"))

    # Both pre-mission and future requests returned valid but unrelated images.
    if requested.year in (1990, 2050):
        with pytest.raises(SolarRealtimeFetchError, match="requested epoch"):
            provider._fetch_helioviewer_closest(case["sourceId"], requested)
    else:
        result = provider._fetch_helioviewer_closest(case["sourceId"], requested)
        observed = datetime.fromisoformat(result["image_date"].replace("Z", "+00:00"))
        assert abs((observed - requested).total_seconds()) <= 21_600
        assert result["image_id"] == str(json.loads(raw)["id"])
        # Valid time coverage does not validate a viewport tile as a surface map.
        assert result["spatial_use"]["eligible"] is False


@pytest.mark.parametrize("offset_seconds", [-21_601, -21_600, 21_600, 21_601])
def test_aia_epoch_window_is_symmetric_and_inclusive(monkeypatch, offset_seconds):
    requested = datetime(2020, 1, 1, tzinfo=timezone.utc)
    observed = requested + timedelta(seconds=offset_seconds)
    provider = SolarRealtimeDataProvider()
    monkeypatch.setattr(provider, "_fetch_json", lambda _url: {
        "id": "123", "date": observed.strftime("%Y-%m-%d %H:%M:%S"),
        "name": "AIA 193", "scale": 0.6, "width": 4096, "height": 4096,
    })
    if abs(offset_seconds) > 21_600:
        with pytest.raises(SolarRealtimeFetchError, match="requested epoch"):
            provider._fetch_helioviewer_closest(11, requested)
    else:
        result = provider._fetch_helioviewer_closest(11, requested)
        assert result["image_date"] == observed.strftime("%Y-%m-%dT%H:%M:%SZ")
