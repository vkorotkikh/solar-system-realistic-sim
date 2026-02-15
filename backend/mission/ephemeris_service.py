"""Ephemeris service with SPICE/HORIZONS-aligned sampling and deterministic fallback."""

from __future__ import annotations

import csv
import io
import json
import logging
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .orbital import J2000_JD, DAY_SECONDS, sample_body_state_from_elements

logger = logging.getLogger(__name__)

# Tudat/SPICE mapping for our internal IDs.
_ID_TO_SPICE = {
    "sun": "Sun",
    "mercury": "Mercury",
    "venus": "Venus",
    "earth": "Earth",
    "mars": "Mars",
    "jupiter": "Jupiter",
    "saturn": "Saturn",
    "uranus": "Uranus",
    "neptune": "Neptune",
    "pluto": "Pluto",
}

# JPL Horizons COMMAND codes for major bodies.
_ID_TO_HORIZONS = {
    "sun": "10",
    "mercury": "199",
    "venus": "299",
    "earth": "399",
    "mars": "499",
    "jupiter": "599",
    "saturn": "699",
    "uranus": "799",
    "neptune": "899",
    "pluto": "999",
}

_SPICE_READY = False
_SPICE_IMPORT_ERROR = ""
_spice = None


@dataclass(frozen=True)
class EphemerisSample:
    body_id: str
    jd: float
    position_au: List[float]
    velocity_au_day: List[float]
    source: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class EphemerisService:
    """Body state sampler with provider fallback.

    Providers:
      - ``spice``: TudatPy/SPICE state vectors (if available)
      - ``horizons``: JPL Horizons vectors API (network required)
      - ``kepler``: local catalog element propagation fallback
      - ``auto``: tries ``spice -> horizons -> kepler``
    """

    _SUPPORTED_PROVIDERS = ("auto", "spice", "horizons", "kepler")

    def __init__(
        self,
        bodies: Sequence[Dict[str, Any]],
        *,
        provider: str = "auto",
        horizons_timeout_s: float = 10.0,
        enable_cache: bool = True,
    ) -> None:
        provider_key = provider.lower().strip()
        if provider_key not in self._SUPPORTED_PROVIDERS:
            raise ValueError(f"Unsupported ephemeris provider `{provider}`")

        self._provider = provider_key
        self._horizons_timeout_s = max(1.0, float(horizons_timeout_s))
        self._body_by_id = {body["id"]: dict(body) for body in bodies}
        self._cache_enabled = bool(enable_cache)
        self._cache: Dict[Tuple[str, str, float], EphemerisSample] = {}

    @property
    def provider(self) -> str:
        return self._provider

    def available_providers(self) -> Dict[str, bool]:
        return {
            "spice": _load_spice(),
            "horizons": True,
            "kepler": True,
        }

    def sample_state(self, body_id: str, jd: float) -> EphemerisSample:
        if body_id not in self._body_by_id:
            raise KeyError(f"Unknown body `{body_id}`")

        jd_key = round(float(jd), 9)
        providers = self._provider_chain()

        for provider in providers:
            cache_key = (provider, body_id, jd_key)
            if self._cache_enabled and cache_key in self._cache:
                return self._cache[cache_key]

            sample = None
            try:
                if provider == "spice":
                    sample = self._sample_spice(body_id, jd_key)
                elif provider == "horizons":
                    sample = self._sample_horizons(body_id, jd_key)
                elif provider == "kepler":
                    sample = self._sample_kepler(body_id, jd_key)
            except Exception as exc:  # pragma: no cover - network/tooling variability
                logger.debug("Ephemeris provider `%s` failed for %s: %s", provider, body_id, exc)
                sample = None

            if sample is not None:
                if self._cache_enabled:
                    self._cache[cache_key] = sample
                return sample

        raise RuntimeError(f"No ephemeris provider produced a state for `{body_id}` at JD {jd_key}")

    def sample_states(self, body_ids: Sequence[str], jd: float) -> Dict[str, EphemerisSample]:
        return {body_id: self.sample_state(body_id, jd) for body_id in body_ids}

    def _provider_chain(self) -> List[str]:
        if self._provider == "auto":
            # Keep default mission planning deterministic/offline-friendly while
            # still preferring high-fidelity SPICE when available.
            return ["spice", "kepler", "horizons"]
        return [self._provider]

    def _sample_kepler(self, body_id: str, jd: float) -> EphemerisSample:
        body = self._body_by_id[body_id]
        state = sample_body_state_from_elements(body, jd)
        return EphemerisSample(
            body_id=body_id,
            jd=jd,
            position_au=list(state["position"]),
            velocity_au_day=list(state["velocity"]),
            source="kepler",
        )

    def _sample_spice(self, body_id: str, jd: float) -> Optional[EphemerisSample]:
        if not _load_spice():
            return None

        spice_name = _ID_TO_SPICE.get(body_id)
        if spice_name is None:
            return None

        epoch_seconds = (jd - J2000_JD) * DAY_SECONDS

        # TudatPy returns SI units: metres and m/s.
        try:
            state_si = _spice.get_body_cartesian_state_at_epoch(
                spice_name,
                "Sun",
                "J2000",
                "NONE",
                epoch_seconds,
            )
        except TypeError:
            # Fallback for named signatures if positional changes.
            state_si = _spice.get_body_cartesian_state_at_epoch(
                target_body_name=spice_name,
                observer_body_name="Sun",
                reference_frame_name="J2000",
                aberration_corrections="NONE",
                ephemeris_time=epoch_seconds,
            )

        position_au = [float(state_si[idx]) / 149_597_870_700.0 for idx in range(3)]
        velocity_au_day = [float(state_si[idx + 3]) * DAY_SECONDS / 149_597_870_700.0 for idx in range(3)]

        return EphemerisSample(
            body_id=body_id,
            jd=jd,
            position_au=position_au,
            velocity_au_day=velocity_au_day,
            source="spice",
        )

    def _sample_horizons(self, body_id: str, jd: float) -> Optional[EphemerisSample]:
        command = self._horizons_command_for_body(body_id)
        if command is None:
            return None

        params = {
            "format": "json",
            "COMMAND": command,
            "MAKE_EPHEM": "YES",
            "EPHEM_TYPE": "VECTORS",
            "CENTER": "500@10",
            "REF_PLANE": "ECLIPTIC",
            "REF_SYSTEM": "J2000",
            "VEC_CORR": "NONE",
            "OUT_UNITS": "AU-D",
            "VEC_TABLE": "3",
            "CSV_FORMAT": "YES",
            "TLIST": f"{jd:.9f}",
        }
        url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(params)

        with urllib.request.urlopen(url, timeout=self._horizons_timeout_s) as response:
            payload = json.loads(response.read().decode("utf-8"))

        result_text = payload.get("result", "")
        state = _parse_horizons_csv_vector(result_text)
        if state is None:
            return None

        return EphemerisSample(
            body_id=body_id,
            jd=jd,
            position_au=state[0:3],
            velocity_au_day=state[3:6],
            source="horizons",
        )

    def _horizons_command_for_body(self, body_id: str) -> Optional[str]:
        mapped = _ID_TO_HORIZONS.get(body_id)
        if mapped is not None:
            return mapped

        # Fallback: sanitize body name from catalog for asteroid IDs.
        body = self._body_by_id[body_id]
        name = str(body.get("name", body_id)).split("(")[0].strip()
        if not name:
            return None
        return name


def _load_spice() -> bool:
    global _SPICE_READY, _SPICE_IMPORT_ERROR, _spice

    if _SPICE_READY:
        return True
    try:
        from tudatpy.kernel.interface import spice  # type: ignore

        spice.load_standard_kernels()
        _spice = spice
        _SPICE_READY = True
        return True
    except Exception as exc:  # pragma: no cover - environment dependent
        _SPICE_IMPORT_ERROR = str(exc)
        return False


def _parse_horizons_csv_vector(result_text: str) -> Optional[List[float]]:
    if "$$SOE" not in result_text or "$$EOE" not in result_text:
        return None

    window = result_text.split("$$SOE", 1)[1].split("$$EOE", 1)[0].strip()
    if not window:
        return None

    first_line = ""
    for line in window.splitlines():
        candidate = line.strip()
        if candidate:
            first_line = candidate
            break
    if not first_line:
        return None

    reader = csv.reader(io.StringIO(first_line))
    row = next(reader, None)
    if row is None or len(row) < 8:
        return None

    # VEC_TABLE=3, CSV_FORMAT=YES format:
    # [JD, calendar, x, y, z, vx, vy, vz, ...]
    try:
        x = float(row[2])
        y = float(row[3])
        z = float(row[4])
        vx = float(row[5])
        vy = float(row[6])
        vz = float(row[7])
    except Exception:
        return None

    return [x, y, z, vx, vy, vz]


__all__ = ["EphemerisSample", "EphemerisService"]
