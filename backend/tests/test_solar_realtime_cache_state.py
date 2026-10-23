from __future__ import annotations

import pytest

from sim.solar_realtime_data import SolarRealtimeDataProvider


@pytest.mark.parametrize(
    ("swpc_ok", "silso_ok", "aia_ok", "expected"),
    (
        (True, True, True, "complete"),
        (True, True, False, "partial"),
        (True, False, True, "partial"),
        (False, True, True, "partial"),
        (True, False, False, "partial"),
        (False, True, False, "partial"),
        (False, False, True, "partial"),
        (False, False, False, "failed"),
    ),
)
def test_cache_state_truth_table_tracks_delivered_source_availability(
    swpc_ok: bool,
    silso_ok: bool,
    aia_ok: bool,
    expected: str,
) -> None:
    source_status = {
        "swpc": {"ok": swpc_ok},
        "silso": {"ok": silso_ok},
        "sdo_aia": {"ok": aia_ok},
        "gong_synoptic": {
            "ok": False,
            "attempted": False,
            "runtime_eligible": False,
        },
    }

    assert (
        SolarRealtimeDataProvider._cache_state_from_source_status(source_status)
        == expected
    )


@pytest.mark.parametrize(
    ("source_status", "expected"),
    (
        (
            {
                "swpc": {"ok": True, "refresh_ok": False},
                "silso": {"ok": True},
                "sdo_aia": {"ok": True},
            },
            "complete",
        ),
        (
            {
                "swpc": {"ok": True, "refresh_ok": False},
                "silso": {"ok": False},
                "sdo_aia": {"ok": False},
            },
            "partial",
        ),
        (
            {
                "swpc": {"ok": True},
                "silso": {"ok": False, "realtime_eligible": False},
                "sdo_aia": {"ok": True},
            },
            "partial",
        ),
        (
            {
                "gong_synoptic": {
                    "ok": False,
                    "attempted": False,
                    "runtime_eligible": False,
                },
            },
            "failed",
        ),
        ({}, "failed"),
        ({"swpc": "malformed", "silso": {"ok": True}}, "partial"),
    ),
)
def test_cache_state_handles_fallback_disabled_and_malformed_statuses(
    source_status: object,
    expected: str,
) -> None:

    assert (
        SolarRealtimeDataProvider._cache_state_from_source_status(source_status)
        == expected
    )
