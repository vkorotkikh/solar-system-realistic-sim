"""Pin external evidence, not an observed-calibration or renderer pass.

The NASA products are independent model outputs. NOAA RTSW is in-situ
operational data. Neither is generated from this application's solar model.
These tests protect their provenance and expose the unmatched comparison
window; numerical agreement with our PFSS/WSA implementation remains open.
"""

import hashlib
import json
from pathlib import Path

import numpy as np
import pytest


REFERENCE = Path(__file__).resolve().parents[2] / "agent-notes/solar-reference-2026-10-14"
HASHES = {
    "nasa_wsa_ace.json": "3eeb807edca46fc8206387f40797de80aaf59ca4ff667ee60255a7b04c6755c0",
    "noaa_rtsw_wind_1m.json": "12f89300b5c7dc67f3702fbd1ba459d8df3b531ff1d18b5f67ea915170e3fc3d",
    "nasa_wsa_gongz_202610121744.fits": "5b8f1da9e8bcf057b1c86ecd80207166e3362e1ecb92db7a54499ec7bf192035",
    "nasa_pfss_gongz_202610121744.osfls": "c76da8e6f8322ba4c55703f52f0991fac7bd48864a0661583467d07c99aee520",
}


@pytest.mark.parametrize("name,sha256", HASHES.items())
def test_provider_artifact_is_byte_exact(name, sha256):
    assert hashlib.sha256((REFERENCE / name).read_bytes()).hexdigest() == sha256
    manifest = json.loads((REFERENCE / "manifest.json").read_text())
    entry = next(item for item in manifest["files"] if item["file"] == name)
    assert entry["sha256"] == sha256
    assert entry["url"].startswith("https://")
    assert manifest["calibration_status"] == "unvalidated"


def _primary_fits():
    """Read the pinned primary image without any production parser/model."""
    raw = (REFERENCE / "nasa_wsa_gongz_202610121744.fits").read_bytes()
    header = {}
    for offset in range(0, len(raw), 80):
        card = raw[offset : offset + 80].decode("ascii")
        key = card[:8].strip()
        if key == "END":
            data_offset = ((offset + 80 + 2879) // 2880) * 2880
            break
        if card[8:10] == "= ":
            header[key] = card[10:].split("/", 1)[0].strip().strip("'").strip()
    else:
        raise AssertionError("External FITS primary header is unterminated")
    assert int(header["BITPIX"]) == -32
    assert [int(header[f"NAXIS{i}"]) for i in (1, 2, 3)] == [180, 90, 10]
    maps = np.frombuffer(raw, dtype=">f4", count=180 * 90 * 10, offset=data_offset)
    return header, maps.reshape(10, 90, 180)


def test_independent_wsa_reference_has_open_and_closed_topology():
    header, maps = _primary_fits()
    assert header["PROVERS"] == "WSA_V6.2"
    assert header["FILELIST"] == "mrzql261012t1744c2316_079"
    # The provider's array descriptions, not our tracing code, identify array 7.
    classification = maps[6]
    assert np.count_nonzero(classification == 0) > 0
    assert np.count_nonzero(np.isin(classification, [1, 2, 3])) > 0
    assert header["UNIT5"] == "Gauss"
    assert header["UNIT6"] == "degrees"
    # These incompatible boundaries must not be silently treated as our 2.5 Rs map.
    assert float(header["RADSS"]) == 2.51
    assert float(header["RADINT"]) == 2.49
    assert float(header["RADOUT"]) == 5.0
    print("external WSA topology counts:", {
        code: int(np.count_nonzero(classification == code)) for code in (0, 1, 2, 3)
    })


def test_captured_observations_do_not_fabricate_a_forecast_match():
    forecasts = json.loads((REFERENCE / "nasa_wsa_ace.json").read_text())
    observations = json.loads((REFERENCE / "noaa_rtsw_wind_1m.json").read_text())
    assert forecasts["sat"] == "ACE"
    assert forecasts["input_map"] == "AGONG"
    valid_forecasts = [item for item in forecasts["solarwind"] if item["Vp"] is not None]
    assert len(valid_forecasts) == 13
    ace = [item for item in observations if item["source"] == "ACE"
           and item["proton_speed"] is not None and item["overall_quality"] == 0]
    assert ace
    assert max(item["time"] for item in valid_forecasts) < min(item["time_tag"] for item in ace)
    assert any(item["Vp"] is None for item in forecasts["solarwind"])
