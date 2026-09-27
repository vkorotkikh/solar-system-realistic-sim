from __future__ import annotations

import sys
from pathlib import Path
import struct
from collections.abc import Callable
import zlib

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def _build_aia_png_header(
    *,
    width: int = 512,
    height: int = 512,
    chunk_length: int = 13,
    chunk_type: bytes = b"IHDR",
    crc: int | None = None,
) -> bytes:
    """Build one deterministic 33-byte PNG IHDR envelope for boundary tests."""

    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    crc_payload = chunk_type + ihdr_data
    checksum = zlib.crc32(crc_payload) & 0xFFFFFFFF if crc is None else crc
    return (
        b"\x89PNG\r\n\x1a\n"
        + struct.pack(">I", chunk_length)
        + chunk_type
        + ihdr_data
        + struct.pack(">I", checksum)
    )


@pytest.fixture
def aia_png_header() -> Callable[..., bytes]:
    return _build_aia_png_header


class _ImagePngEqualitySpoof:
    """Non-string object that defeats equality-only media contract checks."""

    def __eq__(self, other: object) -> bool:
        return other == "image/png"

    def __ne__(self, other: object) -> bool:
        return not self == other


@pytest.fixture
def aia_png_equality_spoof() -> object:
    return _ImagePngEqualitySpoof()
