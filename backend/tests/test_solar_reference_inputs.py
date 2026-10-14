"""Generalized cardinalities still use the original pinned provider parser."""
import hashlib
import struct

import numpy as np
import pytest

from solar_reference_comparison import CAPTURE, FITS_SHA, LINES_SHA, load_reference


FITS = CAPTURE / "nasa_wsa_gongz_202610121744.fits"
LINES = CAPTURE / "nasa_pfss_gongz_202610121744.osfls"


def test_explicit_baseline_paths_match_original_parser_exactly():
    original = load_reference()
    explicit = load_reference(fits_path=FITS, lines_path=LINES,
                              fits_sha256=FITS_SHA, lines_sha256=LINES_SHA)
    assert explicit[0] == original[0]
    assert explicit[-1] == original[-1]
    for before, after in zip(original[1:-1], explicit[1:-1]):
        np.testing.assert_array_equal(before, after)


def subset_bytes():
    _, _, points, starts, counts, labels, epoch = load_reference()
    count = int(counts[:2].sum())
    name = b"Open/closed lines \x00"
    return b"".join([
        struct.pack("<idiBQQQQ", 0, epoch, 3, 0, 2, count, 1, len(name)),
        starts[:2].astype("<i4").tobytes(), counts[:2].astype("<u4").tobytes(),
        points[:count].astype("<f4").tobytes(),
        np.repeat(labels[:2], counts[:2]).astype("<f4").tobytes(), name,
    ])


def test_alternate_cardinality_keeps_every_line_and_point(tmp_path):
    raw = subset_bytes()
    path = tmp_path / "two-lines.osfls"
    path.write_bytes(raw)
    original = load_reference()
    loaded = load_reference(fits_path=FITS, lines_path=path, fits_sha256=FITS_SHA,
                            lines_sha256=hashlib.sha256(raw).hexdigest())
    assert len(loaded[3]) == 2
    assert len(loaded[2]) == int(original[4][:2].sum())
    np.testing.assert_array_equal(loaded[1], original[1])
    np.testing.assert_array_equal(loaded[5], original[5][:2])


def test_alternate_bytes_cannot_use_baseline_hash_by_default(tmp_path):
    path = tmp_path / "two-lines.osfls"
    path.write_bytes(subset_bytes())
    with pytest.raises(ValueError, match="hash mismatch"):
        load_reference(fits_path=FITS, lines_path=path)


@pytest.mark.parametrize("paths", [{"fits_path": FITS}, {"lines_path": LINES}])
def test_alternate_paths_must_be_paired(paths):
    with pytest.raises(ValueError, match="Both alternate reference paths"):
        load_reference(**paths)


@pytest.mark.parametrize("mutation", ["truncated", "oversized_count", "nonfinite_epoch"])
def test_malformed_alternate_records_fail_before_array_decoding(tmp_path, mutation):
    raw = bytearray(subset_bytes())
    if mutation == "truncated":
        del raw[-1]
    elif mutation == "oversized_count":
        struct.pack_into("<Q", raw, 17, 10001)
    else:
        struct.pack_into("<d", raw, 4, float("nan"))
    path = tmp_path / "invalid.osfls"
    path.write_bytes(raw)
    with pytest.raises(ValueError, match="bounded format|size or epoch"):
        load_reference(fits_path=FITS, lines_path=path,
                       lines_sha256=hashlib.sha256(raw).hexdigest())
