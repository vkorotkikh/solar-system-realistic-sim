from __future__ import annotations

import numpy as np
import pytest

from gong_fixture_helpers import EXPANDED, MANIFEST, context, gong_module, rewrite_fits


def parse(payload: bytes = EXPANDED, **context_updates):
    gong = gong_module()
    return gong.parse_gong_fits(payload, context=context(**context_updates))


def assert_code(code: str):
    gong = gong_module()
    return pytest.raises(gong.GongFitsError, match=f"^{code}:")


def test_actual_like_omissions_are_normalized_without_rewriting_native_header() -> None:
    snapshot = parse()
    wcs = snapshot.provenance.wcs
    assert wcs.native_cunit == (None, None)
    assert wcs.native_lonpole_deg is None
    assert wcs.normalized_cunit == ("deg", "deg")
    assert wcs.normalized_lonpole_deg == 0.0
    assert wcs.normalized_cdelt[1] == pytest.approx(0.0111111 * 180 / np.pi)
    assert b"CUNIT1" not in snapshot.provenance.native_header_bytes
    assert b"LONPOLE" not in snapshot.provenance.native_header_bytes
    assert b"CUNIT1" in wcs.normalized_header_bytes
    assert b"LONPOLE" in wcs.normalized_header_bytes


def test_literal_independent_pixel_center_sentinels() -> None:
    snapshot = parse()
    assert len(snapshot.provenance.wcs.coordinate_sentinels) == len(
        MANIFEST["coordinate_sentinels"]
    )
    for actual, expected in zip(
        snapshot.provenance.wcs.coordinate_sentinels,
        MANIFEST["coordinate_sentinels"],
    ):
        assert actual.x == expected["x"] and actual.y == expected["y"]
        assert actual.longitude_deg == pytest.approx(
            expected["longitude_deg"], rel=0, abs=6e-8
        )
        assert actual.latitude_deg == pytest.approx(
            expected["latitude_deg"], rel=0, abs=6e-8
        )


def test_native_row_order_left_edge_and_seam_are_explicit() -> None:
    snapshot = parse()
    assert snapshot.grid.row_order == "south_to_north"
    np.testing.assert_allclose(
        snapshot.grid.mu,
        -1 + 2 * (np.arange(180) + 0.5) / 180,
        rtol=0,
        atol=1e-12,
    )
    assert np.rad2deg(snapshot.grid.phi_rad[0]) == pytest.approx(301.5, rel=0, abs=1e-12)
    assert np.rad2deg(snapshot.grid.phi_rad[-1]) == pytest.approx(660.5, rel=0, abs=1e-12)
    assert snapshot.provenance.wcs.left_edge_longitude_deg == 301.0
    edge_sentinels = snapshot.provenance.wcs.edge_sentinels
    assert len(edge_sentinels) == len(MANIFEST["edge_sentinels"])
    for actual, expected in zip(edge_sentinels, MANIFEST["edge_sentinels"]):
        assert actual.x == expected["x"] and actual.y == expected["y"]
        assert actual.longitude_deg == pytest.approx(
            expected["longitude_deg"], rel=0, abs=6e-8
        )
        assert actual.latitude_deg == pytest.approx(
            expected["latitude_deg"], rel=0, abs=6e-8
        )

    first, second = edge_sentinels[:2]
    assert first.longitude_deg == pytest.approx(second.longitude_deg, rel=0, abs=6e-8)
    assert first.longitude_deg == pytest.approx(301.0, rel=0, abs=6e-8)


@pytest.mark.parametrize(
    "updates",
    [
        {"CUNIT1": "rad"},
        {"CUNIT2": "arcsec"},
        {"LONPOLE": 180.0},
        {"PV2_1": 2.0},
        {"CTYPE1": "HGLN-CEA"},
        {"CDELT1": -1.0},
        {"PC1_1": 1.0},
    ],
)
def test_conflicting_wcs_metadata_rejects(updates) -> None:
    with assert_code("invalid_wcs"):
        parse(rewrite_fits(header_updates=updates))


@pytest.mark.parametrize(
    "updates",
    [
        {"CREDGE": 2316.2},
        {"MAPL0": 2.0},
        {"CR60": 2316.0},
        {"CRNOW": 2316.1},
        {"CRVAL1": 122.0},
        {"CRCENTER": 2315.7},
        {"CRVAL1A": 2315.7},
        {"CDELT1A": -0.003},
    ],
)
def test_each_header_invariant_rejects_independently(updates) -> None:
    with assert_code("metadata_conflict"):
        parse(rewrite_fits(header_updates=updates))


def test_explicit_degree_and_zero_pole_metadata_are_accepted() -> None:
    snapshot = parse(rewrite_fits(header_updates={
        "CUNIT1": "deg", "CUNIT2": "deg", "LONPOLE": 0.0,
    }))
    assert snapshot.provenance.wcs.native_cunit == ("deg", "deg")
    assert snapshot.provenance.wcs.native_lonpole_deg == 0.0


def test_crval1_rounding_within_frozen_degree_tolerance_is_accepted() -> None:
    snapshot = parse(rewrite_fits(header_updates={"CRVAL1": 121.0004}))
    first = snapshot.provenance.wcs.coordinate_sentinels[0]
    assert first.longitude_deg == pytest.approx(301.5004, rel=0, abs=6e-8)
    assert snapshot.provenance.long0_deg == 301.0


def test_wcs_sentinels_pin_field_orientation_without_flip_or_roll() -> None:
    snapshot = parse()
    assert snapshot.field_gauss[0, 0] == 0.25
    assert snapshot.field_gauss[-1, -1] == -0.25
    assert snapshot.grid.mu[0] < 0 < snapshot.grid.mu[-1]
    assert snapshot.grid.phi_rad[0] > np.pi
