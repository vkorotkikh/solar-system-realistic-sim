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


@pytest.fixture
def runner_independent_solar_deadline(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep /solar/physics content tests independent of runner speed.

    The production deadline (18 s, env-capped at 19 s) is a latency contract,
    not a correctness one. GitHub's 2-vCPU runners need more than 18 s for a
    high-fidelity PFSS request that finishes in about 10 s locally, which
    turned five content tests into 503 solar_compute_timeout failures. Modules
    whose tests request real PFSS output opt in with
    ``pytestmark = pytest.mark.usefixtures("runner_independent_solar_deadline")``
    and get the process supervisor's own hard cap (HARD_MAX_TIMEOUT_SECONDS,
    60 s). Tests that exercise the deadline itself set
    SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS in their body, which overrides this.
    Not autouse: test_solar_process_endpoint asserts the configured deadline
    stays under the 19 s HTTP cap.
    """

    server = sys.modules.get("server")
    if server is not None:
        monkeypatch.setattr(server, "SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS", 60.0, raising=False)
