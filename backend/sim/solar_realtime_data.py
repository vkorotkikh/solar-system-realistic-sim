from __future__ import annotations

import copy
import json
import math
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib
from collections import OrderedDict
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Callable

from .solar_time import jd_tdb_to_utc_datetime


_INVALID_SWPC_JSON_INTEGER = object()


def _clamp(value: float, lower: float, upper: float) -> float:
    return min(upper, max(lower, value))


def _safe_float(value: Any) -> float | None:
    try:
        out = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(out):
        return None
    return out


def _utc_iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class AiaImageIdentityMismatch(RuntimeError):
    """The requested retained AIA artifact is no longer the channel snapshot."""

    def __init__(self, *, requested_image_id: str, available_image_id: Any):
        self.requested_image_id = requested_image_id
        self.available_image_id = available_image_id
        super().__init__(
            "AIA snapshot identity mismatch: "
            f"requested {requested_image_id}, available {available_image_id}"
        )


class SolarRealtimeFetchError(RuntimeError):
    """A bounded upstream acquisition rejected an unsafe or invalid response."""

    def __init__(self, code: str, detail: str):
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


@dataclass(frozen=True, slots=True)
class _FetchFailureDescriptor:
    """Traceback-free failure state retained for short single-flight backoff."""

    expires_monotonic: float
    kind: str
    code: str
    detail: str


@dataclass(frozen=True, slots=True)
class _BoundedHttpPayload:
    """A response body plus the small, validated metadata used by SILSO."""

    status: int
    payload: bytes
    content_type: str | None
    etag: str | None
    last_modified: str | None


@dataclass(frozen=True, slots=True)
class _SilsoCacheEntry:
    """One bounded parsed SILSO value; the multi-megabyte source is not retained."""

    value: dict[str, Any]
    etag: str | None
    last_modified: str | None
    validated_monotonic: float
    validated_at_utc: str
    expires_monotonic: float


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Expose redirects to the provider so every target is validated."""

    def redirect_request(self, *_args: Any, **_kwargs: Any) -> None:
        return None


class SolarRealtimeDataProvider:
    """
    Cached live-data ingestion for high-fidelity solar forcing.

    Sources:
      - NOAA SWPC Real Time Solar Wind plasma + IMF feeds
      - SILSO daily total sunspot numbers
      - SDO/AIA latest-image metadata via Helioviewer API
    """

    NOAA_WIND_URL = "https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json"
    NOAA_MAG_URL = "https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json"
    # Compatibility alias for callers that used the former product name. The
    # target is the current SCN 26-21 RTSW wind product, not the removed feed.
    NOAA_PLASMA_URL = NOAA_WIND_URL
    SILSO_DAILY_URL = "https://www.sidc.be/SILSO/DATA/SN_d_tot_V2.0.csv"
    HELIOVIEWER_CLOSEST_URL = "https://api.helioviewer.org/v2/getClosestImage/"
    HELIOVIEWER_JP2_URL = "https://api.helioviewer.org/v2/getJP2Image/"
    HELIOVIEWER_TILE_URL = "https://api.helioviewer.org/v2/getTile/"
    MAX_JSON_RESPONSE_BYTES = 1 * 1024 * 1024
    SWPC_WIND_MAX_RESPONSE_BYTES = 4 * 1024 * 1024
    SWPC_MAG_MAX_RESPONSE_BYTES = 3 * 1024 * 1024
    SWPC_MAX_SAMPLE_AGE_S = 15.0 * 60.0
    SWPC_MAX_FUTURE_OFFSET_S = 2.0 * 60.0
    SWPC_MAX_PRODUCT_SKEW_S = 5.0 * 60.0
    SWPC_MAX_JSON_INTEGER_DIGITS = 4_300
    SWPC_NUMERIC_VALIDATION_VERSION = "defensive_operational_envelope_v1"
    # These deliberately broad fail-closed envelopes are an application input
    # contract, not a claim about instrument calibration uncertainty. They
    # admit severe solar-wind conditions while excluding provider fill values,
    # corrupt magnitudes, and arithmetic-overflow payloads.
    SWPC_NUMERIC_BOUNDS = {
        "proton_density": (1e-6, 1_000.0),
        "proton_speed": (100.0, 3_000.0),
        "proton_temperature": (1.0, 100_000_000.0),
        "bt": (0.0, 500.0),
        "bz_gsm": (-500.0, 500.0),
    }
    MAX_TEXT_RESPONSE_BYTES = 8 * 1024 * 1024
    MAX_BINARY_RESPONSE_BYTES = 4 * 1024 * 1024
    RESPONSE_READ_CHUNK_BYTES = 64 * 1024
    MAX_REDIRECTS = 3
    MAX_UPSTREAM_URL_BYTES = 2 * 1024
    MAX_CONTENT_TYPE_BYTES = 256
    MAX_RESPONSE_VALIDATOR_BYTES = 256
    SILSO_REVALIDATE_INTERVAL_S = 6.0 * 60.0 * 60.0
    SILSO_LKG_MAX_AGE_S = 48.0 * 60.0 * 60.0
    SILSO_FAILURE_BACKOFF_S = 5.0 * 60.0
    SILSO_LAST_MODIFIED_MAX_FUTURE_S = 5.0 * 60.0
    SILSO_MAX_SOURCE_AGE_DAYS = 62
    SILSO_OBSERVATION_CADENCE = "P1D"
    SILSO_PUBLICATION_CADENCE = "P1M"
    SILSO_COVERAGE_POLICY = "through_last_elapsed_month"
    # Conservative reserve for the OrderedDict node, tuple, expiry float,
    # accounting integer, and Python object headers beyond encoded data bytes.
    BINARY_CACHE_ENTRY_OVERHEAD_BYTES = 512
    AIA_IMAGE_ID_MAX_DIGITS = 20
    AIA_IMAGE_NAME_MAX_BYTES = 128
    AIA_IMAGE_DATE_MAX_BYTES = 32

    # Redirects may move only within the source's explicitly trusted host set.
    # In particular, an upstream response cannot turn this server into an SSRF
    # client for link-local or private-network resources.
    UPSTREAM_REDIRECT_HOSTS = {
        "services.swpc.noaa.gov": frozenset({"services.swpc.noaa.gov"}),
        "www.sidc.be": frozenset({"www.sidc.be", "sidc.be"}),
        "sidc.be": frozenset({"www.sidc.be", "sidc.be"}),
        "api.helioviewer.org": frozenset({"api.helioviewer.org"}),
    }

    # SDO/AIA source IDs from Helioviewer data-source catalog.
    AIA_SOURCE_IDS = {
        "aia_094": 8,
        "aia_171": 10,
        "aia_193": 11,
        "aia_211": 12,
        "aia_304": 13,
    }
    AIA_VIEWPORT_TILE_X = -1
    AIA_VIEWPORT_TILE_Y = -1
    AIA_VIEWPORT_TILE_SIZE_PX = 512
    AIA_PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
    AIA_SPATIAL_USE_DISABLED_REASON = (
        "viewport_tile_has_no_validated_solar_surface_projection"
    )

    def __init__(
        self,
        timeout_s: float = 3.8,
        cache_ttl_s: float = 300.0,
        snapshot_cache_max_entries: int = 16,
        binary_cache_max_entries: int = 48,
        binary_cache_max_bytes: int = 16 * 1024 * 1024,
        singleflight_failure_max_entries: int = 64,
    ):
        self.timeout_s = max(0.05, float(timeout_s))
        self.cache_ttl_s = max(10.0, float(cache_ttl_s))
        self.snapshot_cache_max_entries = max(1, int(snapshot_cache_max_entries))
        self.binary_cache_max_entries = max(1, int(binary_cache_max_entries))
        self.binary_cache_max_bytes = max(1, int(binary_cache_max_bytes))
        self.singleflight_failure_max_entries = max(
            1,
            int(singleflight_failure_max_entries),
        )
        self.singleflight_error_backoff_s = 4.5
        self._acquisition_state = threading.local()
        self._lock = threading.Lock()
        self._snapshot_cache: OrderedDict[
            tuple[str, str, float | None], tuple[float, dict[str, Any]]
        ] = OrderedDict()
        self._binary_cache: OrderedDict[
            str, tuple[float, bytes, int]
        ] = OrderedDict()
        self._binary_cache_bytes = 0
        self._inflight_fetches: dict[Any, dict[str, Any]] = {}
        self._inflight_failures: OrderedDict[Any, _FetchFailureDescriptor] = (
            OrderedDict()
        )
        self._silso_cache: _SilsoCacheEntry | None = None
        self._silso_failure: _FetchFailureDescriptor | None = None

    @contextmanager
    def _acquisition_scope(self) -> Iterator[float]:
        inherited_deadline = getattr(
            self._acquisition_state,
            "deadline_monotonic",
            None,
        )
        owns_deadline = inherited_deadline is None
        deadline_monotonic = (
            time.monotonic() + self.timeout_s
            if owns_deadline
            else float(inherited_deadline)
        )
        if owns_deadline:
            self._acquisition_state.deadline_monotonic = deadline_monotonic
        try:
            self._remaining_acquisition_time(deadline_monotonic)
            yield deadline_monotonic
        finally:
            if owns_deadline:
                del self._acquisition_state.deadline_monotonic

    def _active_acquisition_deadline(self) -> float:
        deadline_monotonic = getattr(
            self._acquisition_state,
            "deadline_monotonic",
            None,
        )
        if deadline_monotonic is None:
            return time.monotonic() + self.timeout_s
        return float(deadline_monotonic)

    def _remaining_provider_budget(self) -> float:
        return self._remaining_acquisition_time(
            self._active_acquisition_deadline()
        )

    def capabilities(self) -> dict[str, Any]:
        return {
            "sources": {
                "swpc": {
                    "wind_url": self.NOAA_WIND_URL,
                    "mag_url": self.NOAA_MAG_URL,
                    "wind_max_response_bytes": self.SWPC_WIND_MAX_RESPONSE_BYTES,
                    "mag_max_response_bytes": self.SWPC_MAG_MAX_RESPONSE_BYTES,
                    "product_notice": "NWS SCN 26-21",
                    "maximum_sample_age_s": self.SWPC_MAX_SAMPLE_AGE_S,
                    "maximum_future_offset_s": self.SWPC_MAX_FUTURE_OFFSET_S,
                    "maximum_product_skew_s": self.SWPC_MAX_PRODUCT_SKEW_S,
                    "numeric_validation": self._swpc_numeric_validation_contract(),
                },
                "silso": {
                    "daily_url": self.SILSO_DAILY_URL,
                    "observation_cadence": self.SILSO_OBSERVATION_CADENCE,
                    "publication_cadence": self.SILSO_PUBLICATION_CADENCE,
                    "coverage_policy": self.SILSO_COVERAGE_POLICY,
                    "maximum_source_age_days": self.SILSO_MAX_SOURCE_AGE_DAYS,
                    "realtime_eligible": False,
                    "provenance": self._silso_provenance(),
                },
                "sdo_aia": {
                    "closest_image_url": self.HELIOVIEWER_CLOSEST_URL,
                    "jp2_image_url": self.HELIOVIEWER_JP2_URL,
                    "tile_url": self.HELIOVIEWER_TILE_URL,
                    "source_ids": self.AIA_SOURCE_IDS,
                    "supports_imagery_activity_proxy": False,
                    "artifacts": {
                        "raw_viewport_tile": True,
                        "spatial_surface_texture": False,
                        "scientific_pixel_inference": False,
                        "reason": self.AIA_SPATIAL_USE_DISABLED_REASON,
                    },
                },
                "gong_synoptic": self._gong_runtime_status(),
            },
            "cache_ttl_s": self.cache_ttl_s,
            "snapshot_cache_max_entries": self.snapshot_cache_max_entries,
            "binary_cache_max_entries": self.binary_cache_max_entries,
            "binary_cache_max_bytes": self.binary_cache_max_bytes,
            "singleflight_failure_max_entries": self.singleflight_failure_max_entries,
            "timeout_s": self.timeout_s,
        }

    @staticmethod
    def _gong_runtime_status() -> dict[str, Any]:
        return {
            "product": "zqs",
            "ok": False,
            "attempted": False,
            "runtime_eligible": False,
            "status": "disabled_unvalidated",
            "reason": "disabled_unvalidated",
        }

    @classmethod
    def _silso_provenance(cls) -> dict[str, Any]:
        return {
            "provider": "WDC-SILSO, Royal Observatory of Belgium, Brussels",
            "dataset": "Daily total sunspot number, version 2.0",
            "endpoint": cls.SILSO_DAILY_URL,
            "doi": "https://doi.org/10.24414/qnza-ac80",
            "license": {
                "name": "CC BY-NC 4.0",
                "url": "https://creativecommons.org/licenses/by-nc/4.0/",
            },
        }

    @staticmethod
    def _resolve_jd_tdb_alias(
        jd_tdb: float | None,
        jd: float | None,
    ) -> float | None:
        def validate(value: float, name: str) -> float:
            if isinstance(value, bool):
                raise ValueError(f"{name} must be a finite Julian date in TDB")
            try:
                parsed = float(value)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"{name} must be a finite Julian date in TDB") from exc
            if not math.isfinite(parsed):
                raise ValueError(f"{name} must be a finite Julian date in TDB")
            return parsed

        canonical = validate(jd_tdb, "jd_tdb") if jd_tdb is not None else None
        # Deprecated `jd` is interpreted as JDTDB for one compatibility window.
        legacy = validate(jd, "jd") if jd is not None else None
        if canonical is not None and legacy is not None and canonical != legacy:
            raise ValueError("jd_tdb and deprecated jd must identify the same JDTDB epoch")
        return canonical if canonical is not None else legacy

    def _snapshot_swpc_times(
        self,
        snapshot: Mapping[str, Any],
    ) -> tuple[datetime, datetime] | None:
        swpc = snapshot.get("swpc")
        if not isinstance(swpc, Mapping):
            return None
        compatibility_time = swpc.get("time_tag")
        wind_time = self._parse_swpc_time_tag(
            swpc.get("wind_time_tag", compatibility_time)
        )
        mag_time = self._parse_swpc_time_tag(
            swpc.get("mag_time_tag", compatibility_time)
        )
        if wind_time is None or mag_time is None:
            return None
        return wind_time, mag_time

    def _snapshot_cache_lifetime_s(
        self,
        snapshot: Mapping[str, Any],
        *,
        now_utc: datetime,
    ) -> float:
        """Bound snapshot reuse by the remaining lifetime of accepted SWPC data."""

        source_status = snapshot.get("source_status")
        swpc_status = (
            source_status.get("swpc")
            if isinstance(source_status, Mapping)
            else None
        )
        if not isinstance(swpc_status, Mapping) or swpc_status.get("ok") is not True:
            return self.cache_ttl_s
        times = self._snapshot_swpc_times(snapshot)
        if times is None:
            # An allegedly usable SWPC snapshot without parseable component
            # times must never gain a positive cache lifetime.
            return 0.0
        wind_time, mag_time = times
        maximum_age_s = max(
            (now_utc - wind_time).total_seconds(),
            (now_utc - mag_time).total_seconds(),
        )
        minimum_age_s = min(
            (now_utc - wind_time).total_seconds(),
            (now_utc - mag_time).total_seconds(),
        )
        if minimum_age_s < -self.SWPC_MAX_FUTURE_OFFSET_S:
            return 0.0
        remaining_s = self.SWPC_MAX_SAMPLE_AGE_S - maximum_age_s
        return max(0.0, min(self.cache_ttl_s, remaining_s))

    def _snapshot_for_delivery(
        self,
        snapshot: dict[str, Any],
        *,
        now_utc: datetime,
    ) -> dict[str, Any]:
        """Return a delivery-time view whose source ages cannot freeze in cache."""

        snapshot = copy.deepcopy(snapshot)
        silso = snapshot.get("silso")
        if isinstance(silso, dict):
            observation_date_text = silso.get("date")
            silso_state: dict[str, Any] | None = None
            if isinstance(observation_date_text, str):
                try:
                    observation_date = date.fromisoformat(observation_date_text)
                    if observation_date.isoformat() != observation_date_text:
                        raise ValueError("SILSO delivery date is not canonical")
                    silso_state = self._silso_delivery_state(
                        observation_date,
                        now_utc.date(),
                    )
                except (TypeError, ValueError, OverflowError):
                    silso_state = None

            statuses = snapshot.get("source_status")
            delivered_statuses = (
                dict(statuses) if isinstance(statuses, Mapping) else {}
            )
            prior_status = delivered_statuses.get("silso")
            silso_status = (
                dict(prior_status) if isinstance(prior_status, Mapping) else {}
            )
            delivered_at_utc = self._canonical_utc_time_tag(now_utc)

            if silso_state is not None and silso_state["ok"] is True:
                silso["source_age_days"] = silso_state["source_age_days"]
                silso["coverage"] = silso_state["coverage"]
                silso_status.pop("reason", None)
                silso_status.update(
                    {
                        "ok": True,
                        "updated": observation_date_text,
                        "source_age_days": silso_state["source_age_days"],
                        "coverage": silso_state["coverage"],
                        "delivered_at_utc": delivered_at_utc,
                    }
                )
            else:
                reason = (
                    silso_state["reason"]
                    if silso_state is not None
                    else "invalid_delivery_date"
                )
                silso_status.pop("source_age_days", None)
                silso_status.pop("coverage", None)
                silso_status.update(
                    {
                        "ok": False,
                        "updated": (
                            observation_date_text
                            if silso_state is not None
                            else None
                        ),
                        "reason": reason,
                        "delivered_at_utc": delivered_at_utc,
                    }
                )
                if silso_state is not None:
                    if silso_state["source_age_days"] >= 0:
                        silso_status["source_age_days"] = silso_state[
                            "source_age_days"
                        ]
                    silso_status["coverage"] = silso_state["coverage"]
                snapshot["silso"] = None

            delivered_statuses["silso"] = silso_status
            snapshot["source_status"] = delivered_statuses
        else:
            snapshot["silso"] = None
            statuses = snapshot.get("source_status")
            delivered_statuses = (
                dict(statuses) if isinstance(statuses, Mapping) else {}
            )
            prior_status = delivered_statuses.get("silso")
            if isinstance(prior_status, Mapping) and prior_status.get("ok") is True:
                silso_status = dict(prior_status)
                silso_status.pop("source_age_days", None)
                silso_status.pop("coverage", None)
                silso_status.update(
                    {
                        "ok": False,
                        "updated": None,
                        "reason": "invalid_delivery_date",
                        "delivered_at_utc": self._canonical_utc_time_tag(now_utc),
                    }
                )
                delivered_statuses["silso"] = silso_status
                snapshot["source_status"] = delivered_statuses

        swpc = snapshot.get("swpc")
        if not isinstance(swpc, dict):
            return snapshot
        statuses = snapshot.get("source_status")
        delivered_statuses = dict(statuses) if isinstance(statuses, Mapping) else {}
        prior_status = delivered_statuses.get("swpc")
        swpc_status = dict(prior_status) if isinstance(prior_status, Mapping) else {}
        times = self._snapshot_swpc_times(snapshot)
        if times is None:
            if swpc_status.get("ok") is not True:
                return snapshot
            delivered_at_utc = self._canonical_utc_time_tag(now_utc)
            delivered = dict(snapshot)
            delivered["swpc"] = None
            delivered["combined_activity_proxy"] = None
            swpc_status.update(
                {
                    "ok": False,
                    "error": "NOAA SWPC RTSW component timestamps are invalid at delivery",
                    "delivered_at_utc": delivered_at_utc,
                    "endpoint": self.NOAA_WIND_URL,
                }
            )
            delivered_statuses["swpc"] = swpc_status
            delivered["source_status"] = delivered_statuses
            return delivered

        if swpc_status.get("ok") is not True:
            return snapshot

        wind_time, mag_time = times
        wind_age_s = (now_utc - wind_time).total_seconds()
        mag_age_s = (now_utc - mag_time).total_seconds()
        maximum_age_s = max(wind_age_s, mag_age_s)
        minimum_age_s = min(wind_age_s, mag_age_s)
        delivered_at_utc = self._canonical_utc_time_tag(now_utc)

        delivered = dict(snapshot)

        if (
            maximum_age_s > self.SWPC_MAX_SAMPLE_AGE_S
            or minimum_age_s < -self.SWPC_MAX_FUTURE_OFFSET_S
        ):
            # This is reachable only at a wall/monotonic clock edge or when a
            # source becomes invalid while slower companion sources are being
            # acquired. Do not deliver expired measurements or their proxy.
            delivered["swpc"] = None
            delivered["combined_activity_proxy"] = None
            swpc_status.update(
                {
                    "ok": False,
                    "error": "NOAA SWPC RTSW sample is outside its delivery-time window",
                    "updated": self._canonical_utc_time_tag(min(wind_time, mag_time)),
                    "age_s": maximum_age_s,
                    "delivered_at_utc": delivered_at_utc,
                    "endpoint": self.NOAA_WIND_URL,
                }
            )
        else:
            delivered_swpc = dict(swpc)
            delivered_swpc.update(
                {
                    "age_s": maximum_age_s,
                    "wind_age_s": wind_age_s,
                    "mag_age_s": mag_age_s,
                    "delivered_at_utc": delivered_at_utc,
                }
            )
            delivered["swpc"] = delivered_swpc
            swpc_status.update(
                {
                    "age_s": maximum_age_s,
                    "wind_age_s": wind_age_s,
                    "mag_age_s": mag_age_s,
                    "delivered_at_utc": delivered_at_utc,
                }
            )
        delivered_statuses["swpc"] = swpc_status
        delivered["source_status"] = delivered_statuses
        return delivered

    def latest(
        self,
        jd_tdb: float | None = None,
        force_refresh: bool = False,
        *,
        jd: float | None = None,
    ) -> dict[str, Any]:
        with self._acquisition_scope():
            return self._latest(
                jd_tdb=jd_tdb,
                force_refresh=force_refresh,
                jd=jd,
            )

    def _latest(
        self,
        jd_tdb: float | None = None,
        force_refresh: bool = False,
        *,
        jd: float | None = None,
    ) -> dict[str, Any]:
        requested_jd_tdb = self._resolve_jd_tdb_alias(jd_tdb, jd)
        if requested_jd_tdb is None:
            key = ("snapshot", "latest", None)
        else:
            key = ("snapshot", "jd_tdb", requested_jd_tdb)

        now_monotonic = time.monotonic()
        with self._lock:
            cached = self._snapshot_cache.get(key)
            if not force_refresh and cached is not None:
                expiry, snapshot = cached
                if now_monotonic < expiry:
                    self._snapshot_cache.move_to_end(key)
                    return self._snapshot_for_delivery(
                        snapshot,
                        now_utc=self._utc_now().astimezone(timezone.utc),
                    )
                self._snapshot_cache.pop(key, None)

        def fetch_and_cache_snapshot() -> dict[str, Any]:
            snapshot = self._fetch_snapshot(requested_jd_tdb)
            self._remaining_provider_budget()
            completed_monotonic = time.monotonic()
            completed_utc = self._utc_now().astimezone(timezone.utc)
            cache_lifetime_s = self._snapshot_cache_lifetime_s(
                snapshot,
                now_utc=completed_utc,
            )
            with self._lock:
                # Publish before the single-flight leader releases its entry so a
                # request arriving at completion cannot start a duplicate refresh.
                self._snapshot_cache[key] = (
                    completed_monotonic + cache_lifetime_s,
                    snapshot,
                )
                self._snapshot_cache.move_to_end(key)

                expired_keys = [
                    cache_key
                    for cache_key, (expiry, _) in self._snapshot_cache.items()
                    if expiry <= completed_monotonic
                ]
                for expired_key in expired_keys:
                    self._snapshot_cache.pop(expired_key, None)
                while len(self._snapshot_cache) > self.snapshot_cache_max_entries:
                    self._snapshot_cache.popitem(last=False)
            return snapshot

        snapshot = self._singleflight_fetch(
            key=key,
            fetch_fn=fetch_and_cache_snapshot,
            wait_timeout_s=self._remaining_provider_budget(),
            allow_cached_failure=not force_refresh,
        )
        return self._snapshot_for_delivery(
            snapshot,
            now_utc=self._utc_now().astimezone(timezone.utc),
        )

    def latest_aia_tile(
        self,
        channel: str = "aia_193",
        jd_tdb: float | None = None,
        force_refresh: bool = False,
        *,
        image_id: str | None = None,
        jd: float | None = None,
    ) -> dict[str, Any]:
        with self._acquisition_scope():
            return self._latest_aia_tile(
                channel=channel,
                jd_tdb=jd_tdb,
                force_refresh=force_refresh,
                image_id=image_id,
                jd=jd,
            )

    def _latest_aia_tile(
        self,
        channel: str = "aia_193",
        jd_tdb: float | None = None,
        force_refresh: bool = False,
        *,
        image_id: str | None = None,
        jd: float | None = None,
    ) -> dict[str, Any]:
        requested_image_id = self._normalize_aia_image_id(image_id)
        requested_jd_tdb = self._resolve_jd_tdb_alias(jd_tdb, jd)
        snapshot = self.latest(
            jd_tdb=requested_jd_tdb,
            force_refresh=force_refresh,
        )
        channel_key = channel.strip().lower()
        sdo_aia = snapshot.get("sdo_aia")
        if not isinstance(sdo_aia, dict):
            raise RuntimeError("SDO/AIA snapshot unavailable")

        channels = sdo_aia.get("channels")
        if not isinstance(channels, dict):
            raise RuntimeError("SDO/AIA channels unavailable")

        channel_entry = channels.get(channel_key)
        if not isinstance(channel_entry, dict):
            raise KeyError(f"Unsupported AIA channel `{channel_key}`")

        available_image_id = self._normalize_aia_image_id(
            channel_entry.get("image_id")
        )
        if (
            requested_image_id is not None
            and available_image_id != requested_image_id
        ):
            raise AiaImageIdentityMismatch(
                requested_image_id=requested_image_id,
                available_image_id=available_image_id,
            )

        tile_url = channel_entry.get("tile_url")
        if not isinstance(tile_url, str) or not tile_url:
            raise RuntimeError(f"No tile URL available for AIA channel `{channel_key}`")

        self._remaining_provider_budget()
        tile_content, content_type = self._fetch_aia_png_cached(
            tile_url,
            ttl_s=self.cache_ttl_s,
        )
        self._remaining_provider_budget()
        return {
            "channel": channel_key,
            "image_id": available_image_id,
            "image_date": channel_entry.get("image_date"),
            "tile_url": tile_url,
            "content": tile_content,
            "content_type": content_type,
            "artifact": channel_entry.get("artifact"),
            "spatial_use": channel_entry.get("spatial_use"),
        }

    def _fetch_json(
        self,
        url: str,
        *,
        max_bytes: int | None = None,
        parse_int: Callable[[str], Any] | None = None,
    ) -> Any:
        payload, _ = self._request_bytes(
            url,
            max_bytes=(
                self.MAX_JSON_RESPONSE_BYTES if max_bytes is None else max_bytes
            ),
        )
        decoded = payload.decode("utf-8")
        if parse_int is None:
            parsed = json.loads(decoded)
        else:
            parsed = json.loads(decoded, parse_int=parse_int)
        self._remaining_provider_budget()
        return parsed

    def _fetch_binary(self, url: str) -> tuple[bytes, str | None]:
        return self._request_bytes(
            url,
            max_bytes=self.MAX_BINARY_RESPONSE_BYTES,
        )

    @staticmethod
    def _consume_http_token(value: str, offset: int) -> int:
        """Return the first byte after one RFC 9110 token, or ``offset``."""

        token_punctuation = "!#$%&'*+-.^_`|~"
        cursor = offset
        while cursor < len(value):
            character = value[cursor]
            if not (character.isalnum() or character in token_punctuation):
                break
            cursor += 1
        return cursor

    @classmethod
    def _canonical_aia_media_type(
        cls,
        status: int,
        raw_content_type_values: list[str],
    ) -> str:
        """Validate one physical RFC 9110 Content-Type field for an AIA PNG."""

        if status != 200:
            raise SolarRealtimeFetchError(
                "http_status",
                "AIA upstream did not return exact HTTP 200",
            )

        def invalid() -> SolarRealtimeFetchError:
            return SolarRealtimeFetchError(
                "invalid_aia_media_type",
                "AIA upstream Content-Type was malformed",
            )

        if len(raw_content_type_values) != 1:
            raise invalid()
        declaration = raw_content_type_values[0]
        try:
            encoded = declaration.encode("ascii")
        except UnicodeEncodeError as exc:
            raise invalid() from exc
        if (
            not encoded
            or len(encoded) > cls.MAX_CONTENT_TYPE_BYTES
            or any(byte < 32 or byte == 127 for byte in encoded)
        ):
            raise invalid()

        cursor = cls._consume_http_token(declaration, 0)
        if cursor == 0 or cursor >= len(declaration) or declaration[cursor] != "/":
            raise invalid()
        media_type = declaration[:cursor]
        cursor += 1
        subtype_start = cursor
        cursor = cls._consume_http_token(declaration, cursor)
        if cursor == subtype_start:
            raise invalid()
        media_subtype = declaration[subtype_start:cursor]
        parameter_names: set[str] = set()

        while cursor < len(declaration):
            while cursor < len(declaration) and declaration[cursor] == " ":
                cursor += 1
            if cursor >= len(declaration) or declaration[cursor] != ";":
                raise invalid()
            cursor += 1
            while cursor < len(declaration) and declaration[cursor] == " ":
                cursor += 1

            name_start = cursor
            cursor = cls._consume_http_token(declaration, cursor)
            if (
                cursor == name_start
                or cursor >= len(declaration)
                or declaration[cursor] != "="
            ):
                raise invalid()
            parameter_name = declaration[name_start:cursor].casefold()
            if parameter_name in parameter_names:
                raise invalid()
            parameter_names.add(parameter_name)
            cursor += 1
            if cursor >= len(declaration):
                raise invalid()

            if declaration[cursor] == '"':
                cursor += 1
                while True:
                    if cursor >= len(declaration):
                        raise invalid()
                    character = declaration[cursor]
                    if character == '"':
                        cursor += 1
                        break
                    if character == "\\":
                        cursor += 1
                        if cursor >= len(declaration):
                            raise invalid()
                        # Controls and non-ASCII were rejected above, so every
                        # remaining escaped byte is SP or VCHAR.
                        cursor += 1
                        continue
                    cursor += 1
            else:
                value_start = cursor
                cursor = cls._consume_http_token(declaration, cursor)
                if cursor == value_start:
                    raise invalid()

        if (media_type.lower(), media_subtype.lower()) != ("image", "png"):
            raise SolarRealtimeFetchError(
                "unsupported_aia_media_type",
                "AIA upstream media type is not PNG",
            )
        return "image/png"

    def _fetch_aia_png(self, url: str) -> tuple[bytes, str]:
        response = self._request_bounded_http_payload(
            url,
            max_bytes=self.MAX_BINARY_RESPONSE_BYTES,
            pre_body_validator=self._canonical_aia_media_type,
        )
        self._validate_aia_png_envelope(response.payload)
        content_type = response.content_type
        if type(content_type) is not str or content_type != "image/png":
            raise SolarRealtimeFetchError(
                "invalid_aia_provider_contract",
                "AIA acquisition did not return canonical media metadata",
            )
        return response.payload, content_type

    @classmethod
    def _validate_aia_png_envelope(cls, payload: bytes) -> None:
        if payload[:8] != cls.AIA_PNG_SIGNATURE:
            raise SolarRealtimeFetchError(
                "invalid_aia_png_signature",
                "AIA upstream body did not have a PNG signature",
            )
        if (
            len(payload) < 33
            or int.from_bytes(payload[8:12], "big") != 13
            or payload[12:16] != b"IHDR"
            or int.from_bytes(payload[29:33], "big")
            != (zlib.crc32(payload[12:29]) & 0xFFFFFFFF)
        ):
            raise SolarRealtimeFetchError(
                "invalid_aia_png_header",
                "AIA upstream PNG IHDR envelope was invalid",
            )
        if (
            int.from_bytes(payload[16:20], "big") != cls.AIA_VIEWPORT_TILE_SIZE_PX
            or int.from_bytes(payload[20:24], "big")
            != cls.AIA_VIEWPORT_TILE_SIZE_PX
        ):
            raise SolarRealtimeFetchError(
                "invalid_aia_png_dimensions",
                "AIA upstream PNG dimensions did not match the viewport contract",
            )

    @staticmethod
    def _header_values(response: Any, name: str) -> list[str]:
        headers = response.headers
        get_all = getattr(headers, "get_all", None)
        if callable(get_all):
            return [str(value) for value in (get_all(name) or [])]
        lowered = name.lower()
        return [
            str(value)
            for key, value in headers.items()
            if str(key).lower() == lowered
        ]

    @classmethod
    def _enforce_url_byte_limit(cls, url: str, *, context: str) -> None:
        if not isinstance(url, str) or len(url) > cls.MAX_UPSTREAM_URL_BYTES:
            raise SolarRealtimeFetchError(
                "url_byte_limit",
                f"Solar realtime {context} URL exceeds its byte limit",
            )
        try:
            encoded = url.encode("ascii")
        except UnicodeEncodeError as exc:
            raise SolarRealtimeFetchError(
                "unsafe_url",
                f"Solar realtime {context} URL is malformed",
            ) from exc
        if len(encoded) > cls.MAX_UPSTREAM_URL_BYTES:
            raise SolarRealtimeFetchError(
                "url_byte_limit",
                f"Solar realtime {context} URL exceeds its byte limit",
            )

    @classmethod
    def _validate_upstream_url(
        cls,
        url: str,
        *,
        allowed_hosts: frozenset[str] | None = None,
        context: str = "upstream",
    ) -> tuple[str, frozenset[str]]:
        cls._enforce_url_byte_limit(url, context=context)
        if any(
            ord(character) <= 32 or ord(character) >= 127 or character == "\\"
            for character in url
        ):
            raise SolarRealtimeFetchError(
                "unsafe_url",
                f"Solar realtime {context} URL is malformed",
            )
        try:
            parsed = urllib.parse.urlsplit(url)
            port = parsed.port
        except ValueError as exc:
            raise SolarRealtimeFetchError(
                "unsafe_url",
                f"Solar realtime {context} URL is malformed",
            ) from exc
        hostname = parsed.hostname.lower() if parsed.hostname is not None else None
        if (
            parsed.scheme != "https"
            or hostname is None
            or parsed.username is not None
            or parsed.password is not None
            or port is not None
            or parsed.fragment
            or parsed.netloc.lower() != hostname
        ):
            raise SolarRealtimeFetchError(
                "unsafe_url",
                f"Solar realtime {context} URL is outside the explicit upstream allowlist",
            )

        if allowed_hosts is None:
            source_hosts = cls.UPSTREAM_REDIRECT_HOSTS.get(hostname)
            if source_hosts is None:
                raise SolarRealtimeFetchError(
                    "unsafe_url",
                    "Solar realtime upstream allowlist rejected URL",
                )
        else:
            source_hosts = allowed_hosts
            if hostname not in source_hosts:
                raise SolarRealtimeFetchError(
                    "unsafe_url",
                    f"Solar realtime {context} URL is outside the explicit upstream allowlist",
                )

        canonical = urllib.parse.urlunsplit(
            ("https", hostname, parsed.path, parsed.query, "")
        )
        return canonical, source_hosts

    def _open_response(
        self,
        request: urllib.request.Request,
        *,
        timeout_s: float,
    ) -> Any:
        opener = urllib.request.build_opener(_NoRedirectHandler())
        try:
            return opener.open(request, timeout=max(timeout_s, 1e-6))
        except urllib.error.HTTPError as exc:
            # HTTPError is also a readable response. Redirects and non-2xx
            # statuses are handled uniformly below, without automatic hops.
            return exc

    @staticmethod
    def _remaining_acquisition_time(deadline_monotonic: float) -> float:
        remaining = deadline_monotonic - time.monotonic()
        if remaining <= 0.0:
            raise SolarRealtimeFetchError(
                "acquisition_deadline",
                "Solar realtime acquisition deadline expired",
            )
        return remaining

    @staticmethod
    def _set_response_read_timeout(response: Any, timeout_s: float) -> None:
        """Best-effort socket deadline update before each blocking body read."""

        fp = getattr(response, "fp", None)
        raw = getattr(fp, "raw", None)
        candidates = (
            getattr(raw, "_sock", None),
            getattr(fp, "_sock", None),
            getattr(response, "_sock", None),
        )
        for sock in candidates:
            setter = getattr(sock, "settimeout", None)
            if not callable(setter):
                continue
            try:
                setter(max(timeout_s, 1e-6))
            except OSError:
                continue
            return

    def _request_bytes(
        self,
        url: str,
        *,
        max_bytes: int,
    ) -> tuple[bytes, str | None]:
        response = self._request_bounded_http_payload(
            url,
            max_bytes=max_bytes,
        )
        return response.payload, response.content_type

    @classmethod
    def _validated_response_validator(
        cls,
        response: Any,
        name: str,
        *,
        now_utc: datetime | None = None,
    ) -> str | None:
        values = cls._header_values(response, name)
        if not values:
            return None
        if len(values) != 1:
            raise SolarRealtimeFetchError(
                "invalid_response_validator",
                "Solar realtime response validator is not unique",
            )
        value = values[0]
        try:
            encoded = value.encode("ascii")
        except UnicodeEncodeError as exc:
            raise SolarRealtimeFetchError(
                "invalid_response_validator",
                "Solar realtime response validator is malformed",
            ) from exc
        if len(encoded) > cls.MAX_RESPONSE_VALIDATOR_BYTES:
            raise SolarRealtimeFetchError(
                "response_validator_limit",
                "Solar realtime response validator exceeds its byte limit",
            )
        if (
            value != value.strip()
            or any(ord(character) < 32 or ord(character) == 127 for character in value)
        ):
            raise SolarRealtimeFetchError(
                "invalid_response_validator",
                "Solar realtime response validator is malformed",
            )

        if name.lower() == "etag":
            opaque_tag = value[2:] if value.startswith("W/") else value
            if (
                len(opaque_tag) < 2
                or not opaque_tag.startswith('"')
                or not opaque_tag.endswith('"')
                or '"' in opaque_tag[1:-1]
            ):
                raise SolarRealtimeFetchError(
                    "invalid_response_validator",
                    "Solar realtime ETag response validator is malformed",
                )
        elif name.lower() == "last-modified":
            try:
                parsed = parsedate_to_datetime(value)
            except (TypeError, ValueError, OverflowError) as exc:
                raise SolarRealtimeFetchError(
                    "invalid_response_validator",
                    "Solar realtime Last-Modified response validator is malformed",
                ) from exc
            if parsed.tzinfo is None:
                raise SolarRealtimeFetchError(
                    "invalid_response_validator",
                    "Solar realtime Last-Modified response validator is malformed",
                )
            if (
                now_utc is not None
                and parsed.astimezone(timezone.utc)
                > now_utc.astimezone(timezone.utc)
                + timedelta(seconds=cls.SILSO_LAST_MODIFIED_MAX_FUTURE_S)
            ):
                raise SolarRealtimeFetchError(
                    "invalid_response_validator",
                    "Solar realtime Last-Modified response validator is implausibly future-dated",
                )
        return value

    def _request_bounded_http_payload(
        self,
        url: str,
        *,
        max_bytes: int,
        conditional_etag: str | None = None,
        conditional_last_modified: str | None = None,
        allow_not_modified: bool = False,
        capture_validators: bool = False,
        require_full_response: bool = False,
        pre_body_validator: Callable[[int, list[str]], str | None] | None = None,
    ) -> _BoundedHttpPayload:
        deadline_monotonic = self._active_acquisition_deadline()
        current, allowed_hosts = self._validate_upstream_url(url)
        self._remaining_acquisition_time(deadline_monotonic)
        visited = {current}
        redirect_count = 0

        request_headers = {
            "User-Agent": "solar-system-realistic-sim/solar-realtime-data"
        }
        if conditional_etag is not None:
            request_headers["If-None-Match"] = conditional_etag
        if conditional_last_modified is not None:
            request_headers["If-Modified-Since"] = conditional_last_modified
        sent_conditional_validator = (
            "If-None-Match" in request_headers
            or "If-Modified-Since" in request_headers
        )

        while True:
            request = urllib.request.Request(
                current,
                headers=request_headers,
            )
            response = self._open_response(
                request,
                timeout_s=self._remaining_acquisition_time(deadline_monotonic),
            )
            try:
                self._remaining_acquisition_time(deadline_monotonic)
                reported_url = response.geturl()
                final_url, _ = self._validate_upstream_url(
                    reported_url,
                    allowed_hosts=allowed_hosts,
                    context="final URL",
                )
                if final_url != current:
                    raise SolarRealtimeFetchError(
                        "unexpected_final_url",
                        "Solar realtime final URL does not match the validated request target",
                    )

                status = getattr(response, "status", None)
                if status is None:
                    status = response.getcode()
                status = int(status)
                if status in (301, 302, 303, 307, 308):
                    locations = self._header_values(response, "Location")
                    if len(locations) != 1 or not locations[0]:
                        raise SolarRealtimeFetchError(
                            "malformed_redirect",
                            "Solar realtime redirect has no unique Location header",
                        )
                    if redirect_count >= self.MAX_REDIRECTS:
                        raise SolarRealtimeFetchError(
                            "redirect_overflow",
                            "Solar realtime redirect limit exceeded",
                        )
                    self._enforce_url_byte_limit(
                        locations[0],
                        context="redirect",
                    )
                    target = urllib.parse.urljoin(current, locations[0])
                    target, _ = self._validate_upstream_url(
                        target,
                        allowed_hosts=allowed_hosts,
                        context="redirect",
                    )
                    if target in visited:
                        raise SolarRealtimeFetchError(
                            "redirect_loop",
                            "Solar realtime redirect loop detected",
                        )
                    redirect_count += 1
                    visited.add(target)
                    current = target
                    continue
                if status == 304 and not (
                    allow_not_modified and sent_conditional_validator
                ):
                    raise SolarRealtimeFetchError(
                        "http_status",
                        "Solar realtime upstream returned an unsolicited HTTP 304",
                    )
                if require_full_response and status not in (200, 304):
                    raise SolarRealtimeFetchError(
                        "http_status",
                        f"Solar realtime upstream returned HTTP {status}",
                    )
                if status != 304 and not 200 <= status < 300:
                    raise SolarRealtimeFetchError(
                        "http_status",
                        f"Solar realtime upstream returned HTTP {status}",
                    )
                prevalidated_content_type = (
                    pre_body_validator(
                        status,
                        self._header_values(response, "Content-Type"),
                    )
                    if pre_body_validator is not None
                    else None
                )
                validator_now_utc = (
                    self._utc_now().astimezone(timezone.utc)
                    if capture_validators
                    else None
                )
                etag = (
                    self._validated_response_validator(response, "ETag")
                    if capture_validators
                    else None
                )
                last_modified = (
                    self._validated_response_validator(
                        response,
                        "Last-Modified",
                        now_utc=validator_now_utc,
                    )
                    if capture_validators
                    else None
                )
                if status == 304:
                    self._remaining_acquisition_time(deadline_monotonic)
                    return _BoundedHttpPayload(
                        status=status,
                        payload=b"",
                        content_type=None,
                        etag=etag,
                        last_modified=last_modified,
                    )
                content_lengths = self._header_values(response, "Content-Length")
                declared_size: int | None = None
                if content_lengths:
                    if len(content_lengths) != 1 or not content_lengths[0].isdigit():
                        raise SolarRealtimeFetchError(
                            "invalid_content_length",
                            "Solar realtime upstream returned an invalid Content-Length",
                        )
                    declared_size = int(content_lengths[0])
                    if declared_size > max_bytes:
                        raise SolarRealtimeFetchError(
                            "response_byte_limit",
                            "Solar realtime response exceeds its byte limit",
                        )

                chunks: list[bytes] = []
                total = 0
                while True:
                    read_timeout = self._remaining_acquisition_time(
                        deadline_monotonic
                    )
                    self._set_response_read_timeout(response, read_timeout)
                    remaining = max_bytes - total
                    read_size = min(self.RESPONSE_READ_CHUNK_BYTES, remaining + 1)
                    # ``HTTPResponse.read(n)`` may keep filling ``n`` bytes and
                    # restart the socket inactivity timeout after every small
                    # arrival. A peer that drips bytes can therefore hold the
                    # permit well past the aggregate deadline. ``read1`` is
                    # bounded to one underlying buffered/raw read, allowing us
                    # to recompute and apply the remaining absolute budget.
                    read_once = getattr(response, "read1", None)
                    if not callable(read_once):
                        read_once = response.read
                    chunk = read_once(read_size)
                    self._remaining_acquisition_time(deadline_monotonic)
                    if not isinstance(chunk, bytes):
                        raise SolarRealtimeFetchError(
                            "invalid_response_body",
                            "Solar realtime upstream returned a non-binary body",
                        )
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > max_bytes:
                        raise SolarRealtimeFetchError(
                            "response_byte_limit",
                            "Solar realtime response exceeds its byte limit",
                        )
                    chunks.append(chunk)
                if declared_size is not None and total != declared_size:
                    raise SolarRealtimeFetchError(
                        "content_length_mismatch",
                        "Solar realtime response did not match its Content-Length",
                    )

                if pre_body_validator is not None:
                    content_type = prevalidated_content_type
                else:
                    content_types = self._header_values(response, "Content-Type")
                    content_type = content_types[0] if len(content_types) == 1 else None
                    if content_type is not None and ";" in content_type:
                        content_type = content_type.split(";", 1)[0].strip()
                    if (
                        content_type is not None
                        and len(content_type.encode("utf-8")) > self.MAX_CONTENT_TYPE_BYTES
                    ):
                        raise SolarRealtimeFetchError(
                            "response_metadata_limit",
                            "Solar realtime response metadata exceeds its byte limit",
                        )
                self._remaining_acquisition_time(deadline_monotonic)
                return _BoundedHttpPayload(
                    status=status,
                    payload=b"".join(chunks),
                    content_type=content_type,
                    etag=etag,
                    last_modified=last_modified,
                )
            finally:
                response.close()

    def _fetch_aia_png_cached(
        self,
        url: str,
        ttl_s: float | None = None,
    ) -> tuple[bytes, str]:
        with self._acquisition_scope():
            return self._fetch_aia_png_cached_with_deadline(url, ttl_s=ttl_s)

    def _fetch_aia_png_cached_with_deadline(
        self,
        url: str,
        ttl_s: float | None = None,
    ) -> tuple[bytes, str]:
        canonical_url, _ = self._validate_upstream_url(url)
        cache_ttl = max(5.0, float(ttl_s if ttl_s is not None else self.cache_ttl_s))
        now_monotonic = time.monotonic()

        with self._lock:
            cached = self._binary_cache.get(canonical_url)
            if cached is not None:
                expiry, payload, entry_size = cached
                if now_monotonic < expiry:
                    try:
                        self._validate_aia_png_envelope(payload)
                    except SolarRealtimeFetchError:
                        self._binary_cache.pop(canonical_url, None)
                        self._binary_cache_bytes -= entry_size
                        raise
                    self._binary_cache.move_to_end(canonical_url)
                    return payload, "image/png"
                self._binary_cache.pop(canonical_url, None)
                self._binary_cache_bytes -= entry_size

        def fetch_and_cache_aia_png() -> tuple[bytes, str]:
            payload, content_type = self._fetch_aia_png(canonical_url)
            self._validate_aia_png_envelope(payload)
            if type(content_type) is not str or content_type != "image/png":
                raise SolarRealtimeFetchError(
                    "invalid_aia_provider_contract",
                    "AIA acquisition did not return canonical media metadata",
                )
            completed_monotonic = time.monotonic()
            entry_size = self._binary_cache_entry_size(
                canonical_url,
                payload,
            )
            with self._lock:
                # Publish before releasing the single-flight entry and measure the
                # full TTL from completion, not from the beginning of a slow fetch.
                previous = self._binary_cache.pop(canonical_url, None)
                if previous is not None:
                    self._binary_cache_bytes -= previous[2]

                stale_keys = [
                    cache_key
                    for cache_key, value in self._binary_cache.items()
                    if value[0] <= completed_monotonic
                ]
                for stale_key in stale_keys:
                    _, _, stale_size = self._binary_cache.pop(stale_key)
                    self._binary_cache_bytes -= stale_size

                if entry_size <= self.binary_cache_max_bytes:
                    self._binary_cache[canonical_url] = (
                        completed_monotonic + cache_ttl,
                        payload,
                        entry_size,
                    )
                    self._binary_cache.move_to_end(canonical_url)
                    self._binary_cache_bytes += entry_size

                while (
                    len(self._binary_cache) > self.binary_cache_max_entries
                    or self._binary_cache_bytes > self.binary_cache_max_bytes
                ):
                    _, (_, _, evicted_size) = self._binary_cache.popitem(last=False)
                    self._binary_cache_bytes -= evicted_size
            return payload, "image/png"

        return self._singleflight_fetch(
            key=("aia_png", canonical_url),
            fetch_fn=fetch_and_cache_aia_png,
            wait_timeout_s=self._remaining_provider_budget(),
        )

    @classmethod
    def _binary_cache_entry_size(
        cls,
        url: str,
        payload: bytes,
    ) -> int:
        return (
            cls.BINARY_CACHE_ENTRY_OVERHEAD_BYTES
            + len(url.encode("ascii"))
            + len(payload)
        )

    def _singleflight_fetch(
        self,
        key: Any,
        fetch_fn: Callable[[], Any],
        *,
        wait_timeout_s: float | None = None,
        allow_cached_failure: bool = True,
    ) -> Any:
        with self._lock:
            now_monotonic = time.monotonic()
            expired_failures = [
                failure_key
                for failure_key, failure in self._inflight_failures.items()
                if failure.expires_monotonic <= now_monotonic
            ]
            for failure_key in expired_failures:
                self._inflight_failures.pop(failure_key, None)

            if allow_cached_failure:
                failure = self._inflight_failures.get(key)
                if failure is not None:
                    self._inflight_failures.move_to_end(key)
                    raise self._new_failure_exception(failure) from None

            state = self._inflight_fetches.get(key)
            if state is None:
                event = threading.Event()
                state = {"event": event, "value": None, "error": None}
                self._inflight_fetches[key] = state
                is_leader = True
            else:
                is_leader = False

        if not is_leader:
            if not state["event"].wait(timeout=wait_timeout_s):
                raise TimeoutError(
                    "Upstream request is blocked by an ongoing fetch for this resource; "
                    "try again shortly"
                )
            failure = state.get("error")
            if failure is not None:
                raise self._new_failure_exception(failure) from None
            return state["value"]

        failure: _FetchFailureDescriptor | None = None
        value: Any = None
        try:
            try:
                value = fetch_fn()
            except Exception as exc:
                failure = self._describe_failure(
                    exc,
                    expires_monotonic=(
                        time.monotonic() + self.singleflight_error_backoff_s
                    ),
                )
                with self._lock:
                    state["error"] = failure
                    self._inflight_failures[key] = failure
                    self._inflight_failures.move_to_end(key)
                    while (
                        len(self._inflight_failures)
                        > self.singleflight_failure_max_entries
                    ):
                        self._inflight_failures.popitem(last=False)
            else:
                with self._lock:
                    state["value"] = value
                    self._inflight_failures.pop(key, None)
        finally:
            state["event"].set()
            with self._lock:
                self._inflight_fetches.pop(key, None)
        if failure is not None:
            # Raise outside the handling block so the fresh public exception
            # does not retain the original exception via ``__context__``.
            raise self._new_failure_exception(failure) from None
        return value

    @staticmethod
    def _describe_failure(
        error: Exception,
        *,
        expires_monotonic: float,
    ) -> _FetchFailureDescriptor:
        safe_fetch_details = {
            "unsafe_url": "Solar realtime upstream URL was rejected",
            "url_byte_limit": "Solar realtime upstream URL exceeds its byte limit",
            "unexpected_final_url": "Solar realtime upstream final URL was rejected",
            "malformed_redirect": "Solar realtime upstream redirect was malformed",
            "redirect_overflow": "Solar realtime upstream redirect limit exceeded",
            "redirect_loop": "Solar realtime upstream redirect loop detected",
            "http_status": "Solar realtime upstream returned an unsuccessful HTTP status",
            "invalid_content_length": "Solar realtime upstream Content-Length was invalid",
            "response_byte_limit": "Solar realtime response exceeds its byte limit",
            "invalid_response_body": "Solar realtime upstream response body was invalid",
            "content_length_mismatch": "Solar realtime response length was inconsistent",
            "response_metadata_limit": "Solar realtime response metadata exceeds its byte limit",
            "response_validator_limit": "Solar realtime response validator exceeds its byte limit",
            "invalid_response_validator": "Solar realtime response validator was invalid",
            "invalid_image_id": "Solar realtime Helioviewer image identity was rejected",
            "invalid_aia_metadata": "Solar realtime Helioviewer metadata was rejected",
            "acquisition_deadline": "Solar realtime acquisition deadline expired",
            "invalid_aia_media_type": "AIA tile upstream Content-Type is invalid.",
            "unsupported_aia_media_type": "AIA tile upstream media type is unsupported.",
            "invalid_aia_png_signature": "AIA tile PNG signature is invalid.",
            "invalid_aia_png_header": "AIA tile PNG header is invalid.",
            "invalid_aia_png_dimensions": "AIA tile PNG dimensions are invalid.",
            "invalid_aia_provider_contract": (
                "AIA tile provider returned an invalid artifact contract."
            ),
        }
        if isinstance(error, SolarRealtimeFetchError):
            detail = safe_fetch_details.get(error.code)
            if detail is not None:
                return _FetchFailureDescriptor(
                    expires_monotonic=expires_monotonic,
                    kind="fetch",
                    code=error.code,
                    detail=detail,
                )
        if isinstance(error, TimeoutError):
            return _FetchFailureDescriptor(
                expires_monotonic=expires_monotonic,
                kind="timeout",
                code="upstream_timeout",
                detail="Solar realtime upstream acquisition timed out",
            )
        return _FetchFailureDescriptor(
            expires_monotonic=expires_monotonic,
            kind="runtime",
            code="upstream_failure",
            detail="Solar realtime upstream acquisition failed",
        )

    @staticmethod
    def _new_failure_exception(failure: _FetchFailureDescriptor) -> Exception:
        if failure.kind == "fetch":
            return SolarRealtimeFetchError(failure.code, failure.detail)
        if failure.kind == "timeout":
            return TimeoutError(failure.detail)
        return RuntimeError(failure.detail)

    def _fetch_text(self, url: str) -> str:
        payload, _ = self._request_bytes(
            url,
            max_bytes=self.MAX_TEXT_RESPONSE_BYTES,
        )
        return payload.decode("utf-8", errors="replace")

    @staticmethod
    def _parse_swpc_time_tag(value: Any) -> datetime | None:
        if (
            not isinstance(value, str)
            or not value
            or len(value) > 64
            or not value.isascii()
        ):
            return None
        try:
            parsed = datetime.fromisoformat(
                value[:-1] + "+00:00" if value.endswith("Z") else value
            )
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except (ValueError, OverflowError, OSError):
            return None

    @staticmethod
    def _canonical_utc_time_tag(value: datetime) -> str:
        return value.isoformat().replace("+00:00", "Z")

    @staticmethod
    def _utc_now() -> datetime:
        return datetime.now(timezone.utc)

    @classmethod
    def _swpc_numeric_validation_contract(cls) -> dict[str, Any]:
        return {
            "version": cls.SWPC_NUMERIC_VALIDATION_VERSION,
            "bounds": {
                field: [lower, upper]
                for field, (lower, upper) in cls.SWPC_NUMERIC_BOUNDS.items()
            },
        }

    @classmethod
    def _parse_swpc_json_int(cls, value: str) -> Any:
        digits = value[1:] if value.startswith("-") else value
        if len(digits) > cls.SWPC_MAX_JSON_INTEGER_DIGITS:
            return _INVALID_SWPC_JSON_INTEGER
        try:
            return int(value)
        except ValueError:
            return _INVALID_SWPC_JSON_INTEGER

    def _usable_swpc_rows(
        self,
        payload: Any,
        *,
        required_numeric_fields: tuple[str, ...],
        reference_time_utc: datetime,
    ) -> list[tuple[datetime, dict[str, Any]]]:
        """Return newest-first, row-locally valid RTSW observations."""

        if not isinstance(payload, list):
            return []

        candidates: list[tuple[datetime, dict[str, Any]]] = []
        for row in payload:
            if not isinstance(row, dict) or row.get("active") is not True:
                continue

            quality = row.get("overall_quality")
            if isinstance(quality, bool) or not isinstance(quality, (int, float)):
                continue
            quality_number = _safe_float(quality)
            if quality_number != 0.0:
                continue

            source = row.get("source")
            if (
                not isinstance(source, str)
                or not source
                or source != source.strip()
                or not source.isascii()
                or len(source) > 64
                or any(ord(character) < 32 or ord(character) == 127 for character in source)
            ):
                continue

            time_tag = self._parse_swpc_time_tag(row.get("time_tag"))
            if time_tag is None:
                continue
            age_s = (reference_time_utc - time_tag).total_seconds()
            if (
                age_s > self.SWPC_MAX_SAMPLE_AGE_S
                or age_s < -self.SWPC_MAX_FUTURE_OFFSET_S
            ):
                continue

            sanitized: dict[str, Any] = {
                "active": True,
                "overall_quality": 0,
                "source": source,
                "time_tag": self._canonical_utc_time_tag(time_tag),
            }
            valid = True
            for field in required_numeric_fields:
                value = row.get(field)
                numeric_bounds = self.SWPC_NUMERIC_BOUNDS.get(field)
                numeric_value = (
                    _safe_float(value)
                    if not isinstance(value, bool) and isinstance(value, (int, float))
                    else None
                )
                if (
                    numeric_value is None
                    or numeric_bounds is None
                    or not numeric_bounds[0] <= numeric_value <= numeric_bounds[1]
                ):
                    valid = False
                    break
                sanitized[field] = numeric_value
            if not valid:
                continue
            if (
                "bt" in sanitized
                and "bz_gsm" in sanitized
                and abs(sanitized["bz_gsm"]) > sanitized["bt"] + 1e-9
            ):
                continue
            candidates.append((time_tag, sanitized))

        candidates.sort(key=lambda candidate: candidate[0], reverse=True)
        return candidates

    def _newest_coherent_swpc_pair(
        self,
        wind_candidates: list[tuple[datetime, dict[str, Any]]],
        mag_candidates: list[tuple[datetime, dict[str, Any]]],
    ) -> tuple[
        tuple[datetime, dict[str, Any]],
        tuple[datetime, dict[str, Any]],
    ] | None:
        """Select the freshest pair whose component timestamps satisfy skew."""

        wind_index = 0
        mag_index = 0
        while (
            wind_index < len(wind_candidates)
            and mag_index < len(mag_candidates)
        ):
            wind_candidate = wind_candidates[wind_index]
            mag_candidate = mag_candidates[mag_index]
            wind_time = wind_candidate[0]
            mag_time = mag_candidate[0]
            skew_s = (wind_time - mag_time).total_seconds()
            if abs(skew_s) <= self.SWPC_MAX_PRODUCT_SKEW_S:
                return wind_candidate, mag_candidate
            if skew_s > 0:
                wind_index += 1
            else:
                mag_index += 1
        return None

    def _fetch_swpc(self) -> dict[str, Any]:
        with self._acquisition_scope():
            return self._fetch_swpc_with_deadline()

    def _fetch_swpc_with_deadline(self) -> dict[str, Any]:
        wind = self._fetch_json(
            self.NOAA_WIND_URL,
            max_bytes=self.SWPC_WIND_MAX_RESPONSE_BYTES,
            parse_int=self._parse_swpc_json_int,
        )
        self._remaining_provider_budget()
        mag = self._fetch_json(
            self.NOAA_MAG_URL,
            max_bytes=self.SWPC_MAG_MAX_RESPONSE_BYTES,
            parse_int=self._parse_swpc_json_int,
        )
        retrieved_at = self._utc_now().astimezone(timezone.utc)

        wind_candidates = self._usable_swpc_rows(
            wind,
            required_numeric_fields=(
                "proton_density",
                "proton_speed",
                "proton_temperature",
            ),
            reference_time_utc=retrieved_at,
        )
        mag_candidates = self._usable_swpc_rows(
            mag,
            required_numeric_fields=("bt", "bz_gsm"),
            reference_time_utc=retrieved_at,
        )

        if not wind_candidates or not mag_candidates:
            raise RuntimeError(
                "NOAA SWPC RTSW payloads missing usable active quality rows"
            )

        selected_pair = self._newest_coherent_swpc_pair(
            wind_candidates,
            mag_candidates,
        )
        if selected_pair is None:
            raise RuntimeError("NOAA SWPC RTSW product timestamps exceed temporal skew")
        (wind_time, wind_row), (mag_time, mag_row) = selected_pair
        product_skew_s = abs((wind_time - mag_time).total_seconds())
        wind_age_s = (retrieved_at - wind_time).total_seconds()
        mag_age_s = (retrieved_at - mag_time).total_seconds()
        oldest_component_time = min(wind_time, mag_time)

        speed_kms = wind_row["proton_speed"]
        density_pcc = wind_row["proton_density"]
        temperature_k = wind_row["proton_temperature"]
        imf_bt_nt = mag_row["bt"]
        imf_bz_nt = mag_row["bz_gsm"]
        dynamic_pressure_npa = 1.6726e-6 * density_pcc * speed_kms * speed_kms
        if not math.isfinite(dynamic_pressure_npa):
            raise RuntimeError("NOAA SWPC RTSW derived values are non-finite")

        proxies = []
        proxies.append(_clamp((speed_kms - 280.0) / 620.0, 0.0, 1.0) * 0.45)
        proxies.append(_clamp(imf_bt_nt / 18.0, 0.0, 1.0) * 0.2)
        southward = _clamp((-imf_bz_nt) / 12.0, 0.0, 1.0)
        proxies.append(southward * 0.35)
        activity_proxy = _clamp(sum(proxies), 0.0, 1.0)

        return {
            "schema": {"name": "noaa_swpc_rtsw_context", "version": 2},
            # Compatibility field with an explicit conservative policy: a
            # combined product is only as current as its oldest component.
            "time_tag": self._canonical_utc_time_tag(oldest_component_time),
            "wind_time_tag": wind_row["time_tag"],
            "mag_time_tag": mag_row["time_tag"],
            "retrieved_at_utc": self._canonical_utc_time_tag(retrieved_at),
            "age_s": max(wind_age_s, mag_age_s),
            "wind_age_s": wind_age_s,
            "mag_age_s": mag_age_s,
            "product_skew_s": product_skew_s,
            "solar_wind_speed_kms": speed_kms,
            "proton_density_pcc": density_pcc,
            "temperature_k": temperature_k,
            "imf_bt_nt": imf_bt_nt,
            "imf_bz_nt": imf_bz_nt,
            "dynamic_pressure_npa": dynamic_pressure_npa,
            "activity_proxy": activity_proxy,
            "units": {
                "solar_wind_speed_kms": "km/s",
                "proton_density_pcc": "protons/cm^3",
                "temperature_k": "K",
                "imf_bt_nt": "nT",
                "imf_bz_nt": "nT",
                "dynamic_pressure_npa": "nPa",
                "activity_proxy": "1",
            },
            "provenance": {
                "provider": "NOAA SWPC",
                "product_notice": "NWS SCN 26-21",
                "cadence": "PT1M",
                "temporal_contract": {
                    "maximum_sample_age_s": self.SWPC_MAX_SAMPLE_AGE_S,
                    "maximum_future_offset_s": self.SWPC_MAX_FUTURE_OFFSET_S,
                    "maximum_product_skew_s": self.SWPC_MAX_PRODUCT_SKEW_S,
                    "combined_time_policy": "oldest_component",
                },
                "numeric_validation": self._swpc_numeric_validation_contract(),
                "wind": {
                    "endpoint": self.NOAA_WIND_URL,
                    "source": wind_row["source"],
                    "active": wind_row["active"],
                    "overall_quality": wind_row["overall_quality"],
                },
                "mag": {
                    "endpoint": self.NOAA_MAG_URL,
                    "source": mag_row["source"],
                    "active": mag_row["active"],
                    "overall_quality": mag_row["overall_quality"],
                },
            },
        }

    def _parse_silso_document(
        self,
        text: str,
        *,
        reference_date: date | None = None,
    ) -> dict[str, Any]:
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        effective_reference_date = (
            reference_date
            if reference_date is not None
            else self._utc_now().astimezone(timezone.utc).date()
        )
        selected_date: date | None = None
        selected: dict[str, Any] | None = None

        for line in lines:
            parts = [part.strip() for part in line.split(";")]
            if len(parts) < 8:
                continue
            try:
                year = int(parts[0])
                month = int(parts[1])
                day = int(parts[2])
                observation_date = date(year, month, day)
            except (TypeError, ValueError, OverflowError):
                continue
            decimal_date = _safe_float(parts[3])
            daily_total = _safe_float(parts[4])
            stdev = _safe_float(parts[5])
            observation_count = _safe_float(parts[6])
            provisional_flag = parts[7]
            try:
                year_start = date(year, 1, 1)
                next_year_start = date(year + 1, 1, 1)
                temporal_metadata = self._silso_temporal_metadata(
                    observation_date,
                    reference_date=effective_reference_date,
                )
            except (ValueError, OverflowError):
                continue
            expected_decimal_date = year + (
                (observation_date - year_start).days + 0.5
            ) / (next_year_start - year_start).days
            if (
                decimal_date is None
                or not year <= decimal_date < year + 1
                or abs(decimal_date - expected_decimal_date) > 0.001
                or daily_total is None
                or daily_total < 0
                or not daily_total.is_integer()
                or stdev is None
                or stdev < 0
                or observation_count is None
                or observation_count < 1
                or not observation_count.is_integer()
                or provisional_flag not in {"0", "1"}
            ):
                continue

            candidate = {
                "schema": {
                    "name": "wdc_silso_daily_total_sunspot_number",
                    "version": 2,
                },
                "date": observation_date.isoformat(),
                "daily_sunspot_number": daily_total,
                "stdev": stdev,
                "observation_count": int(observation_count),
                "provisional_flag": provisional_flag,
                "quality_status": (
                    "provisional" if provisional_flag == "0" else "definitive"
                ),
                **temporal_metadata,
                "observation_cadence": self.SILSO_OBSERVATION_CADENCE,
                "publication_cadence": self.SILSO_PUBLICATION_CADENCE,
                "realtime_eligible": False,
                "activity_proxy": None,
                "units": {
                    "daily_sunspot_number": "1 (dimensionless relative index)",
                    "stdev": "1 (sunspot-number standard deviation)",
                    "observation_count": "count",
                    "source_age_days": "d",
                },
                "provenance": self._silso_provenance(),
            }
            if selected_date is None or observation_date > selected_date:
                selected_date = observation_date
                selected = candidate
            elif observation_date == selected_date and selected != candidate:
                raise RuntimeError("SILSO payload had conflicting duplicate rows")

        if selected is None:
            raise RuntimeError("SILSO payload had no valid sunspot rows")
        return selected

    def _silso_delivery_state(
        self,
        observation_date: date,
        reference_date: date,
    ) -> dict[str, Any]:
        latest_expected_date = reference_date.replace(day=1) - timedelta(days=1)
        source_age_days = (reference_date - observation_date).days
        if observation_date > latest_expected_date:
            status = "outside_published_coverage"
            reason = "outside_published_coverage"
        elif source_age_days > self.SILSO_MAX_SOURCE_AGE_DAYS:
            status = "outside_age_bound"
            reason = "outside_source_age_bound"
        elif observation_date == latest_expected_date:
            status = "current_for_published_coverage"
            reason = None
        else:
            status = "lagging_within_age_bound"
            reason = None
        return {
            "ok": reason is None,
            "reason": reason,
            "source_age_days": source_age_days,
            "coverage": {
                "policy": self.SILSO_COVERAGE_POLICY,
                "latest_expected_date": latest_expected_date.isoformat(),
                "status": status,
            },
        }

    def _silso_temporal_metadata(
        self,
        observation_date: date,
        *,
        reference_date: date | None = None,
    ) -> dict[str, Any]:
        effective_reference_date = reference_date or self._utc_now().astimezone(
            timezone.utc
        ).date()
        state = self._silso_delivery_state(observation_date, effective_reference_date)
        source_age_days = state["source_age_days"]
        if state["ok"] is not True:
            raise ValueError("SILSO observation date is outside its coverage window")
        return {
            "source_age_days": source_age_days,
            "coverage": state["coverage"],
        }

    def _silso_cache_value(
        self,
        entry: _SilsoCacheEntry,
        *,
        cache_status: str,
        failure: _FetchFailureDescriptor | None = None,
        reference_date: date | None = None,
    ) -> dict[str, Any]:
        value = copy.deepcopy(entry.value)
        observation_date_text = value.get("date")
        if not isinstance(observation_date_text, str):
            raise RuntimeError("SILSO cached observation date is invalid")
        try:
            observation_date = date.fromisoformat(observation_date_text)
            value.update(
                self._silso_temporal_metadata(
                    observation_date,
                    reference_date=reference_date,
                )
            )
        except (TypeError, ValueError) as exc:
            raise RuntimeError("SILSO cached observation date is invalid") from exc
        acquisition: dict[str, Any] = {
            "cache_status": cache_status,
            "last_validated_at_utc": entry.validated_at_utc,
            "revalidation_interval_s": self.SILSO_REVALIDATE_INTERVAL_S,
            "last_known_good_max_age_s": self.SILSO_LKG_MAX_AGE_S,
        }
        if failure is not None:
            acquisition["failure_code"] = failure.code
            acquisition["failure_detail"] = failure.detail
        value["acquisition"] = acquisition
        return value

    def _silso_entry_is_scientifically_admissible(
        self,
        entry: _SilsoCacheEntry,
        *,
        reference_date: date | None = None,
    ) -> bool:
        observation_date_text = entry.value.get("date")
        if not isinstance(observation_date_text, str):
            return False
        try:
            observation_date = date.fromisoformat(observation_date_text)
            self._silso_temporal_metadata(
                observation_date,
                reference_date=reference_date,
            )
        except (TypeError, ValueError, OverflowError):
            return False
        return True

    def _silso_lkg_or_unavailable(
        self,
        *,
        now_monotonic: float,
        failure: _FetchFailureDescriptor | None,
        reference_date: date | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            entry = self._silso_cache
        if (
            entry is not None
            and now_monotonic - entry.validated_monotonic
            <= self.SILSO_LKG_MAX_AGE_S
            and self._silso_entry_is_scientifically_admissible(
                entry,
                reference_date=reference_date,
            )
        ):
            return self._silso_cache_value(
                entry,
                cache_status="stale_lkg",
                failure=failure,
                reference_date=reference_date,
            )
        raise RuntimeError("SILSO acquisition unavailable") from None

    def _fetch_silso(self) -> dict[str, Any]:
        with self._acquisition_scope():
            return self._fetch_silso_with_deadline()

    def _fetch_silso_with_deadline(self) -> dict[str, Any]:
        call_reference_date = self._utc_now().astimezone(timezone.utc).date()
        now_monotonic = time.monotonic()
        with self._lock:
            cached = self._silso_cache
            recent_failure = self._silso_failure

        if (
            cached is not None
            and now_monotonic < cached.expires_monotonic
            and self._silso_entry_is_scientifically_admissible(
                cached,
                reference_date=call_reference_date,
            )
        ):
            return self._silso_cache_value(
                cached,
                cache_status="fresh",
                reference_date=call_reference_date,
            )
        if (
            recent_failure is not None
            and now_monotonic < recent_failure.expires_monotonic
        ):
            return self._silso_lkg_or_unavailable(
                now_monotonic=now_monotonic,
                failure=recent_failure,
                reference_date=call_reference_date,
            )

        def refresh() -> tuple[_SilsoCacheEntry, str, date]:
            with self._lock:
                prior = self._silso_cache

            try:
                response = self._request_bounded_http_payload(
                    self.SILSO_DAILY_URL,
                    max_bytes=self.MAX_TEXT_RESPONSE_BYTES,
                    conditional_etag=prior.etag if prior is not None else None,
                    conditional_last_modified=(
                        prior.last_modified if prior is not None else None
                    ),
                    allow_not_modified=prior is not None,
                    capture_validators=True,
                    require_full_response=True,
                )
                completed_monotonic = time.monotonic()
                response_reference_date = (
                    self._utc_now().astimezone(timezone.utc).date()
                )
                validated_at_utc = _utc_iso_now()
                if response.status == 304:
                    if prior is None:
                        raise SolarRealtimeFetchError(
                            "http_status",
                            "Solar realtime upstream returned an unsolicited HTTP 304",
                        )
                    entry = _SilsoCacheEntry(
                        value=prior.value,
                        etag=response.etag or prior.etag,
                        last_modified=(
                            response.last_modified or prior.last_modified
                        ),
                        validated_monotonic=completed_monotonic,
                        validated_at_utc=validated_at_utc,
                        expires_monotonic=(
                            completed_monotonic
                            + self.SILSO_REVALIDATE_INTERVAL_S
                        ),
                    )
                    cache_status = "revalidated"
                else:
                    parsed = self._parse_silso_document(
                        response.payload.decode("utf-8", errors="replace"),
                        reference_date=response_reference_date,
                    )
                    self._remaining_provider_budget()
                    entry = _SilsoCacheEntry(
                        value=parsed,
                        etag=response.etag,
                        last_modified=response.last_modified,
                        validated_monotonic=completed_monotonic,
                        validated_at_utc=validated_at_utc,
                        expires_monotonic=(
                            completed_monotonic
                            + self.SILSO_REVALIDATE_INTERVAL_S
                        ),
                    )
                    cache_status = "refreshed"
                if not self._silso_entry_is_scientifically_admissible(
                    entry,
                    reference_date=response_reference_date,
                ):
                    raise RuntimeError(
                        "SILSO candidate observation is outside its scientific coverage window"
                    )
            except Exception as exc:
                failure = self._describe_failure(
                    exc,
                    expires_monotonic=(
                        time.monotonic() + self.SILSO_FAILURE_BACKOFF_S
                    ),
                )
                with self._lock:
                    self._silso_failure = failure
                raise

            with self._lock:
                self._silso_cache = entry
                self._silso_failure = None
            return entry, cache_status, response_reference_date

        try:
            entry, cache_status, response_reference_date = self._singleflight_fetch(
                key=("silso_source",),
                fetch_fn=refresh,
                wait_timeout_s=self._remaining_provider_budget(),
                allow_cached_failure=False,
            )
            return self._silso_cache_value(
                entry,
                cache_status=cache_status,
                reference_date=response_reference_date,
            )
        except Exception as exc:
            failure_reference_date = (
                self._utc_now().astimezone(timezone.utc).date()
            )
            failure = self._describe_failure(
                exc,
                expires_monotonic=(
                    time.monotonic() + self.SILSO_FAILURE_BACKOFF_S
                ),
            )
            with self._lock:
                cached_after_failure = self._silso_cache
            if cached_after_failure is not None:
                return self._silso_lkg_or_unavailable(
                    now_monotonic=time.monotonic(),
                    failure=failure,
                    reference_date=failure_reference_date,
                )
            raise

    @classmethod
    def _validated_aia_metadata_text(
        cls,
        value: Any,
        *,
        field_name: str,
        max_bytes: int,
        required: bool,
    ) -> str | None:
        if value is None and not required:
            return None
        if type(value) is not str:
            raise SolarRealtimeFetchError(
                "invalid_aia_metadata",
                f"Solar realtime Helioviewer {field_name} metadata is invalid",
            )
        try:
            encoded = value.encode("ascii")
        except UnicodeEncodeError as exc:
            raise SolarRealtimeFetchError(
                "invalid_aia_metadata",
                f"Solar realtime Helioviewer {field_name} metadata is invalid",
            ) from exc
        if (
            not encoded
            or len(encoded) > max_bytes
            or value != value.strip()
            or any(byte < 32 or byte == 127 for byte in encoded)
        ):
            raise SolarRealtimeFetchError(
                "invalid_aia_metadata",
                f"Solar realtime Helioviewer {field_name} metadata is invalid",
            )
        return value

    @classmethod
    def _canonical_aia_image_date(cls, value: Any) -> str:
        text = cls._validated_aia_metadata_text(
            value,
            field_name="date",
            max_bytes=cls.AIA_IMAGE_DATE_MAX_BYTES,
            required=True,
        )
        assert text is not None
        parsed: datetime | None = None
        for date_format in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%SZ"):
            try:
                candidate = datetime.strptime(text, date_format)
            except (ValueError, OverflowError):
                continue
            if candidate.strftime(date_format) == text:
                parsed = candidate.replace(tzinfo=timezone.utc)
                break
        if parsed is None:
            raise SolarRealtimeFetchError(
                "invalid_aia_metadata",
                "Solar realtime Helioviewer date metadata is invalid",
            )
        return cls._canonical_utc_time_tag(parsed)

    @staticmethod
    def _parse_helioviewer_image_date(value: Any) -> datetime | None:
        if type(value) is not str or len(value) != 20 or not value.isascii():
            return None
        try:
            parsed = datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
        except (ValueError, OverflowError):
            return None
        if parsed.strftime("%Y-%m-%dT%H:%M:%SZ") != value:
            return None
        return parsed.replace(tzinfo=timezone.utc)

    @classmethod
    def _normalize_aia_image_id(cls, value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, bool):
            raise SolarRealtimeFetchError(
                "invalid_image_id",
                "Solar realtime Helioviewer image identity must be a positive decimal integer",
            )
        if isinstance(value, int):
            if value <= 0:
                raise SolarRealtimeFetchError(
                    "invalid_image_id",
                    "Solar realtime Helioviewer image identity must be a positive decimal integer",
                )
            try:
                text = str(value)
            except ValueError as exc:
                raise SolarRealtimeFetchError(
                    "invalid_image_id",
                    "Solar realtime Helioviewer image identity exceeds its digit limit",
                ) from exc
        elif isinstance(value, str):
            text = value
        else:
            raise SolarRealtimeFetchError(
                "invalid_image_id",
                "Solar realtime Helioviewer image identity must be a positive decimal integer",
            )
        if (
            not text
            or len(text) > cls.AIA_IMAGE_ID_MAX_DIGITS
            or not text.isascii()
            or not text.isdigit()
            or text[0] == "0"
        ):
            raise SolarRealtimeFetchError(
                "invalid_image_id",
                "Solar realtime Helioviewer image identity is not a bounded positive decimal integer",
            )
        return text

    def _build_aia_tile_url(self, image_id: str | None, image_scale: float | None) -> str | None:
        normalized_image_id = self._normalize_aia_image_id(image_id)
        if normalized_image_id is None:
            return None
        scale = image_scale if image_scale is not None and image_scale > 0 else 0.6
        query = urllib.parse.urlencode(
            {
                "id": normalized_image_id,
                "x": self.AIA_VIEWPORT_TILE_X,
                "y": self.AIA_VIEWPORT_TILE_Y,
                "imageScale": f"{scale:.6f}",
            }
        )
        return f"{self.HELIOVIEWER_TILE_URL}?{query}"

    def _fetch_helioviewer_closest(self, source_id: int, date_utc: datetime) -> dict[str, Any]:
        date_tag = date_utc.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        query = urllib.parse.urlencode(
            {
                "date": date_tag,
                "sourceId": int(source_id),
                "verbose": "true",
            }
        )
        payload = self._fetch_json(f"{self.HELIOVIEWER_CLOSEST_URL}?{query}")
        if not isinstance(payload, dict):
            raise RuntimeError("Helioviewer closest-image response is not an object")
        image_id_text = self._normalize_aia_image_id(payload.get("id"))
        image_date = self._canonical_aia_image_date(payload.get("date"))
        image_name = self._validated_aia_metadata_text(
            payload.get("name"),
            field_name="name",
            max_bytes=self.AIA_IMAGE_NAME_MAX_BYTES,
            required=False,
        )
        image_scale = _safe_float(payload.get("scale"))
        tile_url = self._build_aia_tile_url(image_id_text, image_scale)
        return {
            "source_id": int(source_id),
            "image_id": image_id_text,
            "image_date": image_date,
            "name": image_name,
            "scale": image_scale,
            "width": _safe_float(payload.get("width")),
            "height": _safe_float(payload.get("height")),
            "solar_radius_px": _safe_float(payload.get("rsun")),
            "rotation_deg": _safe_float(payload.get("rotation")),
            "jp2_url": (
                f"{self.HELIOVIEWER_JP2_URL}?{urllib.parse.urlencode({'id': image_id_text})}"
                if image_id_text
                else None
            ),
            "tile_url": tile_url,
            "artifact": {
                "schema": {
                    "name": "helioviewer_viewport_tile",
                    "version": 1,
                },
                "delivery": "raw_on_demand",
                "media_type": "image/png",
                "viewport": {
                    "tile_x": self.AIA_VIEWPORT_TILE_X,
                    "tile_y": self.AIA_VIEWPORT_TILE_Y,
                    "width_px": self.AIA_VIEWPORT_TILE_SIZE_PX,
                    "height_px": self.AIA_VIEWPORT_TILE_SIZE_PX,
                    "image_scale_arcsec_per_pixel": image_scale,
                },
            },
            "spatial_use": {
                "eligible": False,
                "reason": self.AIA_SPATIAL_USE_DISABLED_REASON,
                "contract": None,
            },
        }

    def _fetch_sdo_aia(self, jd_tdb: float | None) -> dict[str, Any]:
        with self._acquisition_scope():
            return self._fetch_sdo_aia_with_deadline(jd_tdb)

    def _fetch_sdo_aia_with_deadline(
        self,
        jd_tdb: float | None,
    ) -> dict[str, Any]:
        if jd_tdb is None:
            request_date = datetime.now(timezone.utc)
        else:
            request_date = jd_tdb_to_utc_datetime(jd_tdb)

        channels: dict[str, dict[str, Any]] = {}
        for key, source_id in self.AIA_SOURCE_IDS.items():
            self._remaining_provider_budget()
            channels[key] = self._fetch_helioviewer_closest(source_id, request_date)

        # Fallback confidence component based on image cadence.
        timestamps: list[datetime] = []
        for entry in channels.values():
            date_raw = entry.get("image_date")
            parsed = self._parse_helioviewer_image_date(date_raw)
            if parsed is not None:
                timestamps.append(parsed)

        freshness_s: float | None = None
        latest_image_date_utc: str | None = None
        if timestamps:
            latest = max(timestamps)
            latest_image_date_utc = latest.isoformat().replace("+00:00", "Z")
            freshness_s = max(0.0, (datetime.now(timezone.utc) - latest).total_seconds())

        freshness_proxy = None
        if freshness_s is not None:
            freshness_proxy = _clamp(1.0 - freshness_s / (6.0 * 3_600.0), 0.0, 1.0)

        preferred_channel = "aia_193" if isinstance(channels.get("aia_193"), dict) else None
        if preferred_channel is None:
            for key in self.AIA_SOURCE_IDS:
                if isinstance(channels.get(key), dict):
                    preferred_channel = key
                    break
        preferred_entry = channels.get(preferred_channel) if preferred_channel else None
        preferred_tile_url = (
            preferred_entry.get("tile_url")
            if isinstance(preferred_entry, dict)
            else None
        )
        preferred_image_id = (
            preferred_entry.get("image_id")
            if isinstance(preferred_entry, dict)
            else None
        )

        return {
            "request_date_utc": request_date.isoformat().replace("+00:00", "Z"),
            "channels": channels,
            "channel_activity_proxy": None,
            "latest_image_date_utc": latest_image_date_utc,
            "freshness_s": freshness_s,
            "freshness_proxy": freshness_proxy,
            "activity_proxy": None,
            "coronal_holes": None,
            "scientific_inference": {
                "status": "disabled",
                "reason": self.AIA_SPATIAL_USE_DISABLED_REASON,
                "activity_proxy": None,
                "coronal_holes": None,
            },
            "visualization": {
                "preferred_channel": preferred_channel,
                "preferred_image_id": preferred_image_id,
                "preferred_tile_url": preferred_tile_url,
                "preferred_proxy_path": (
                    f"/solar/realtime/aia-tile?channel={preferred_channel}"
                    if preferred_channel
                    else None
                ),
            },
        }

    def _fetch_snapshot(self, jd_tdb: float | None) -> dict[str, Any]:
        with self._acquisition_scope():
            return self._fetch_snapshot_with_deadline(jd_tdb)

    def _fetch_snapshot_with_deadline(
        self,
        jd_tdb: float | None,
    ) -> dict[str, Any]:
        snapshot: dict[str, Any] = {
            "schema": {"name": "solar_realtime_context", "version": 1},
            "fetched_at_utc": _utc_iso_now(),
            "source_status": {},
            "swpc": None,
            "silso": None,
            "sdo_aia": None,
            "gong_synoptic": None,
            "combined_activity_proxy": None,
        }

        proxies: list[float] = []
        weighted_sum = 0.0
        weight_total = 0.0

        try:
            self._remaining_provider_budget()
            swpc = self._fetch_swpc()
            snapshot["swpc"] = swpc
            snapshot["source_status"]["swpc"] = {
                "ok": True,
                "updated": swpc.get("time_tag"),
                "endpoint": self.NOAA_WIND_URL,
            }
            if isinstance(swpc.get("activity_proxy"), (float, int)):
                proxy = float(swpc["activity_proxy"])
                proxies.append(proxy)
                weighted_sum += proxy * 0.45
                weight_total += 0.45
        except Exception as exc:
            snapshot["source_status"]["swpc"] = {
                "ok": False,
                "error": str(exc),
                "endpoint": self.NOAA_WIND_URL,
            }

        try:
            self._remaining_provider_budget()
            silso = self._fetch_silso()
            snapshot["silso"] = silso
            snapshot["source_status"]["silso"] = {
                "ok": True,
                "updated": silso.get("date"),
                "endpoint": self.SILSO_DAILY_URL,
                "source_age_days": silso.get("source_age_days"),
                "coverage": silso.get("coverage"),
                "realtime_eligible": False,
                "acquisition": silso.get("acquisition"),
            }
        except Exception as exc:
            snapshot["source_status"]["silso"] = {
                "ok": False,
                "error": str(exc),
                "endpoint": self.SILSO_DAILY_URL,
            }

        try:
            self._remaining_provider_budget()
            sdo_aia = self._fetch_sdo_aia(jd_tdb)
            snapshot["sdo_aia"] = sdo_aia
            snapshot["source_status"]["sdo_aia"] = {
                "ok": True,
                "updated": sdo_aia.get("latest_image_date_utc") or sdo_aia.get("request_date_utc"),
                "endpoint": self.HELIOVIEWER_CLOSEST_URL,
            }
            if isinstance(sdo_aia.get("activity_proxy"), (float, int)):
                proxy = float(sdo_aia["activity_proxy"])
                proxies.append(proxy)
                weighted_sum += proxy * 0.2
                weight_total += 0.2
        except Exception as exc:
            snapshot["source_status"]["sdo_aia"] = {
                "ok": False,
                "error": str(exc),
                "endpoint": self.HELIOVIEWER_CLOSEST_URL,
            }

        snapshot["source_status"]["gong_synoptic"] = self._gong_runtime_status()

        if weight_total > 0:
            snapshot["combined_activity_proxy"] = _clamp(weighted_sum / weight_total, 0.0, 1.0)
        elif proxies:
            snapshot["combined_activity_proxy"] = _clamp(sum(proxies) / len(proxies), 0.0, 1.0)

        return snapshot
