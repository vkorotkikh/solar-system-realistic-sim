from __future__ import annotations

import io
import json
import math
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any, Callable

import numpy as np

from .solar_time import jd_tdb_to_utc_datetime

try:
    from PIL import Image
except Exception:  # pragma: no cover - optional dependency guard
    Image = None  # type: ignore[assignment]


def _clamp(value: float, lower: float, upper: float) -> float:
    return min(upper, max(lower, value))


def _safe_float(value: Any) -> float | None:
    try:
        out = float(value)
    except (TypeError, ValueError):
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


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Expose redirects to the provider so every target is validated."""

    def redirect_request(self, *_args: Any, **_kwargs: Any) -> None:
        return None


class SolarRealtimeDataProvider:
    """
    Cached live-data ingestion for high-fidelity solar forcing.

    Sources:
      - NOAA SWPC solar-wind plasma + IMF feeds
      - SILSO daily total sunspot numbers
      - SDO/AIA latest-image metadata via Helioviewer API
    """

    NOAA_PLASMA_URL = "https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json"
    NOAA_MAG_URL = "https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json"
    SILSO_DAILY_URL = "https://www.sidc.be/SILSO/DATA/SN_d_tot_V2.0.csv"
    HELIOVIEWER_CLOSEST_URL = "https://api.helioviewer.org/v2/getClosestImage/"
    HELIOVIEWER_JP2_URL = "https://api.helioviewer.org/v2/getJP2Image/"
    HELIOVIEWER_TILE_URL = "https://api.helioviewer.org/v2/getTile/"
    MAX_JSON_RESPONSE_BYTES = 1 * 1024 * 1024
    MAX_TEXT_RESPONSE_BYTES = 8 * 1024 * 1024
    MAX_BINARY_RESPONSE_BYTES = 4 * 1024 * 1024
    RESPONSE_READ_CHUNK_BYTES = 64 * 1024
    MAX_REDIRECTS = 3

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
    AIA_ACTIVITY_WEIGHTS = {
        "aia_094": 0.10,
        "aia_171": 0.22,
        "aia_193": 0.36,
        "aia_211": 0.18,
        "aia_304": 0.14,
    }

    def __init__(
        self,
        timeout_s: float = 3.8,
        cache_ttl_s: float = 300.0,
        snapshot_cache_max_entries: int = 16,
        singleflight_failure_max_entries: int = 64,
    ):
        self.timeout_s = max(0.8, float(timeout_s))
        self.cache_ttl_s = max(10.0, float(cache_ttl_s))
        self.snapshot_cache_max_entries = max(1, int(snapshot_cache_max_entries))
        self.singleflight_failure_max_entries = max(
            1,
            int(singleflight_failure_max_entries),
        )
        self.singleflight_error_backoff_s = 4.5
        self._lock = threading.Lock()
        self._snapshot_cache: OrderedDict[
            tuple[str, str, float | None], tuple[float, dict[str, Any]]
        ] = OrderedDict()
        self._binary_cache: dict[str, tuple[float, bytes, str | None]] = {}
        self._inflight_fetches: dict[Any, dict[str, Any]] = {}
        self._inflight_failures: OrderedDict[
            Any, tuple[float, BaseException]
        ] = OrderedDict()

    def capabilities(self) -> dict[str, Any]:
        return {
            "sources": {
                "swpc": {
                    "plasma_url": self.NOAA_PLASMA_URL,
                    "mag_url": self.NOAA_MAG_URL,
                },
                "silso": {
                    "daily_url": self.SILSO_DAILY_URL,
                },
                "sdo_aia": {
                    "closest_image_url": self.HELIOVIEWER_CLOSEST_URL,
                    "jp2_image_url": self.HELIOVIEWER_JP2_URL,
                    "tile_url": self.HELIOVIEWER_TILE_URL,
                    "source_ids": self.AIA_SOURCE_IDS,
                    "supports_imagery_activity_proxy": Image is not None,
                },
                "gong_synoptic": self._gong_runtime_status(),
            },
            "cache_ttl_s": self.cache_ttl_s,
            "snapshot_cache_max_entries": self.snapshot_cache_max_entries,
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

    def latest(
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
                    return snapshot
                self._snapshot_cache.pop(key, None)

        def fetch_and_cache_snapshot() -> dict[str, Any]:
            snapshot = self._fetch_snapshot(requested_jd_tdb)
            completed_monotonic = time.monotonic()
            with self._lock:
                # Publish before the single-flight leader releases its entry so a
                # request arriving at completion cannot start a duplicate refresh.
                self._snapshot_cache[key] = (
                    completed_monotonic + self.cache_ttl_s,
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

        return self._singleflight_fetch(
            key=key,
            fetch_fn=fetch_and_cache_snapshot,
            wait_timeout_s=self.timeout_s + 0.5,
            allow_cached_failure=not force_refresh,
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

        available_image_id = channel_entry.get("image_id")
        if image_id is not None and available_image_id != image_id:
            raise AiaImageIdentityMismatch(
                requested_image_id=image_id,
                available_image_id=available_image_id,
            )

        tile_url = channel_entry.get("tile_url")
        if not isinstance(tile_url, str) or not tile_url:
            raise RuntimeError(f"No tile URL available for AIA channel `{channel_key}`")

        tile_content, content_type = self._fetch_binary_cached(tile_url, ttl_s=self.cache_ttl_s)
        return {
            "channel": channel_key,
            "image_id": channel_entry.get("image_id"),
            "image_date": channel_entry.get("image_date"),
            "tile_url": tile_url,
            "content": tile_content,
            "content_type": content_type or "image/png",
        }

    def _fetch_json(self, url: str) -> Any:
        payload, _ = self._request_bytes(
            url,
            max_bytes=self.MAX_JSON_RESPONSE_BYTES,
        )
        return json.loads(payload.decode("utf-8"))

    def _fetch_binary(self, url: str) -> tuple[bytes, str | None]:
        return self._request_bytes(
            url,
            max_bytes=self.MAX_BINARY_RESPONSE_BYTES,
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
    def _validate_upstream_url(
        cls,
        url: str,
        *,
        allowed_hosts: frozenset[str] | None = None,
        context: str = "upstream",
    ) -> tuple[str, frozenset[str]]:
        if not isinstance(url, str) or any(
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

    def _open_response(self, request: urllib.request.Request) -> Any:
        opener = urllib.request.build_opener(_NoRedirectHandler())
        try:
            return opener.open(request, timeout=self.timeout_s)
        except urllib.error.HTTPError as exc:
            # HTTPError is also a readable response. Redirects and non-2xx
            # statuses are handled uniformly below, without automatic hops.
            return exc

    def _request_bytes(
        self,
        url: str,
        *,
        max_bytes: int,
    ) -> tuple[bytes, str | None]:
        current, allowed_hosts = self._validate_upstream_url(url)
        visited = {current}
        redirect_count = 0

        while True:
            request = urllib.request.Request(
                current,
                headers={"User-Agent": "solar-system-realistic-sim/solar-realtime-data"},
            )
            response = self._open_response(request)
            try:
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
                if not 200 <= status < 300:
                    raise SolarRealtimeFetchError(
                        "http_status",
                        f"Solar realtime upstream returned HTTP {status}",
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
                    remaining = max_bytes - total
                    read_size = min(self.RESPONSE_READ_CHUNK_BYTES, remaining + 1)
                    chunk = response.read(read_size)
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

                content_types = self._header_values(response, "Content-Type")
                content_type = content_types[0] if len(content_types) == 1 else None
                if content_type is not None and ";" in content_type:
                    content_type = content_type.split(";", 1)[0].strip()
                return b"".join(chunks), content_type
            finally:
                response.close()

    def _fetch_binary_cached(self, url: str, ttl_s: float | None = None) -> tuple[bytes, str | None]:
        cache_ttl = max(5.0, float(ttl_s if ttl_s is not None else self.cache_ttl_s))
        now_monotonic = time.monotonic()

        with self._lock:
            cached = self._binary_cache.get(url)
            if cached is not None:
                expiry, payload, content_type = cached
                if now_monotonic < expiry:
                    return payload, content_type

        def fetch_and_cache_binary() -> tuple[bytes, str | None]:
            payload, content_type = self._fetch_binary(url)
            completed_monotonic = time.monotonic()
            with self._lock:
                # Publish before releasing the single-flight entry and measure the
                # full TTL from completion, not from the beginning of a slow fetch.
                self._binary_cache[url] = (
                    completed_monotonic + cache_ttl,
                    payload,
                    content_type,
                )
                # Keep binary cache bounded.
                if len(self._binary_cache) > 48:
                    stale_keys = [
                        key
                        for key, value in self._binary_cache.items()
                        if value[0] <= completed_monotonic
                    ]
                    for stale_key in stale_keys:
                        self._binary_cache.pop(stale_key, None)
                    if len(self._binary_cache) > 48:
                        # Remove oldest expiries first.
                        ordered = sorted(self._binary_cache.items(), key=lambda item: item[1][0])
                        for key, _ in ordered[: len(self._binary_cache) - 48]:
                            self._binary_cache.pop(key, None)
            return payload, content_type

        return self._singleflight_fetch(
            key=("binary", url),
            fetch_fn=fetch_and_cache_binary,
            wait_timeout_s=self.timeout_s + 0.5,
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
                for failure_key, (fail_until, _) in self._inflight_failures.items()
                if fail_until <= now_monotonic
            ]
            for failure_key in expired_failures:
                self._inflight_failures.pop(failure_key, None)

            if allow_cached_failure:
                failure = self._inflight_failures.get(key)
                if failure is not None:
                    _, stored_exception = failure
                    self._inflight_failures.move_to_end(key)
                    raise stored_exception

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
            if state.get("error") is not None:
                raise state["error"]
            return state["value"]

        try:
            value = fetch_fn()
            with self._lock:
                state["value"] = value
                self._inflight_failures.pop(key, None)
            return value
        except Exception as exc:
            with self._lock:
                state["error"] = exc
                self._inflight_failures[key] = (time.monotonic() + self.singleflight_error_backoff_s, exc)
                self._inflight_failures.move_to_end(key)
                while len(self._inflight_failures) > self.singleflight_failure_max_entries:
                    self._inflight_failures.popitem(last=False)
            raise
        finally:
            state["event"].set()
            with self._lock:
                self._inflight_fetches.pop(key, None)

    def _fetch_text(self, url: str) -> str:
        payload, _ = self._request_bytes(
            url,
            max_bytes=self.MAX_TEXT_RESPONSE_BYTES,
        )
        return payload.decode("utf-8", errors="replace")

    def _latest_noaa_row(self, payload: Any, required_columns: list[str]) -> dict[str, Any] | None:
        if not isinstance(payload, list) or len(payload) < 2:
            return None
        header = payload[0]
        if not isinstance(header, list):
            return None

        indices: dict[str, int] = {}
        for column in required_columns:
            try:
                indices[column] = header.index(column)
            except ValueError:
                return None

        for row in reversed(payload[1:]):
            if not isinstance(row, list):
                continue
            parsed: dict[str, Any] = {}
            valid = True
            for column, idx in indices.items():
                if idx >= len(row):
                    valid = False
                    break
                parsed[column] = row[idx]
            if valid:
                return parsed
        return None

    def _fetch_swpc(self) -> dict[str, Any]:
        plasma = self._fetch_json(self.NOAA_PLASMA_URL)
        mag = self._fetch_json(self.NOAA_MAG_URL)

        plasma_row = self._latest_noaa_row(
            plasma,
            ["time_tag", "density", "speed", "temperature"],
        )
        mag_row = self._latest_noaa_row(
            mag,
            ["time_tag", "bt", "bz_gsm"],
        )

        if plasma_row is None and mag_row is None:
            raise RuntimeError("NOAA SWPC payloads missing usable rows")

        speed_kms = _safe_float(plasma_row.get("speed") if plasma_row else None)
        density_pcc = _safe_float(plasma_row.get("density") if plasma_row else None)
        temperature_k = _safe_float(plasma_row.get("temperature") if plasma_row else None)
        imf_bt_nt = _safe_float(mag_row.get("bt") if mag_row else None)
        imf_bz_nt = _safe_float(mag_row.get("bz_gsm") if mag_row else None)

        dynamic_pressure_npa: float | None = None
        if density_pcc is not None and speed_kms is not None:
            dynamic_pressure_npa = 1.6726e-6 * density_pcc * speed_kms * speed_kms

        proxies = []
        if speed_kms is not None:
            proxies.append(_clamp((speed_kms - 280.0) / 620.0, 0.0, 1.0) * 0.45)
        if imf_bt_nt is not None:
            proxies.append(_clamp(imf_bt_nt / 18.0, 0.0, 1.0) * 0.2)
        if imf_bz_nt is not None:
            southward = _clamp((-imf_bz_nt) / 12.0, 0.0, 1.0)
            proxies.append(southward * 0.35)
        activity_proxy = _clamp(sum(proxies), 0.0, 1.0) if proxies else None

        return {
            "time_tag": (plasma_row or mag_row).get("time_tag"),
            "solar_wind_speed_kms": speed_kms,
            "proton_density_pcc": density_pcc,
            "temperature_k": temperature_k,
            "imf_bt_nt": imf_bt_nt,
            "imf_bz_nt": imf_bz_nt,
            "dynamic_pressure_npa": dynamic_pressure_npa,
            "activity_proxy": activity_proxy,
        }

    def _fetch_silso(self) -> dict[str, Any]:
        text = self._fetch_text(self.SILSO_DAILY_URL)
        lines = [line.strip() for line in text.splitlines() if line.strip()]

        for line in reversed(lines):
            parts = [part.strip() for part in line.split(";")]
            if len(parts) < 8:
                continue
            year = int(parts[0])
            month = int(parts[1])
            day = int(parts[2])
            daily_total = _safe_float(parts[4])
            stdev = _safe_float(parts[5])
            observation_count = _safe_float(parts[6])
            provisional_flag = parts[7]
            if daily_total is None or daily_total < 0:
                continue

            return {
                "date": f"{year:04d}-{month:02d}-{day:02d}",
                "daily_sunspot_number": daily_total,
                "stdev": stdev,
                "observation_count": observation_count,
                "provisional_flag": provisional_flag,
                "activity_proxy": _clamp(daily_total / 220.0, 0.0, 1.0),
            }

        raise RuntimeError("SILSO payload had no valid sunspot rows")

    @staticmethod
    def _parse_helioviewer_image_date(value: Any) -> datetime | None:
        if not isinstance(value, str) or not value.strip():
            return None
        try:
            return datetime.strptime(value.strip(), "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        except Exception:
            return None

    def _build_aia_tile_url(self, image_id: str | None, image_scale: float | None) -> str | None:
        if not image_id:
            return None
        scale = image_scale if image_scale is not None and image_scale > 0 else 0.6
        query = urllib.parse.urlencode(
            {
                "id": image_id,
                "x": -1,
                "y": -1,
                "imageScale": f"{scale:.6f}",
            }
        )
        return f"{self.HELIOVIEWER_TILE_URL}?{query}"

    def _analyze_aia_tile_activity(self, tile_content: bytes) -> dict[str, float] | None:
        if Image is None:
            return None
        try:
            with Image.open(io.BytesIO(tile_content)) as image:
                grayscale = image.convert("L")
                if grayscale.width > 512 or grayscale.height > 512:
                    grayscale = grayscale.resize((512, 512))
                arr = np.asarray(grayscale, dtype=np.float32) / 255.0
        except Exception:
            return None

        if arr.size == 0:
            return None

        mean_luma = float(arr.mean())
        std_luma = float(arr.std())
        p90_luma = float(np.percentile(arr, 90))
        p98_luma = float(np.percentile(arr, 98))
        hot_fraction = float(np.mean(arr >= max(0.82, p90_luma)))
        edge_x = float(np.abs(np.diff(arr, axis=1)).mean()) if arr.shape[1] > 1 else 0.0
        edge_y = float(np.abs(np.diff(arr, axis=0)).mean()) if arr.shape[0] > 1 else 0.0
        edge_energy = 0.5 * (edge_x + edge_y)

        activity_proxy = _clamp(
            mean_luma * 0.18
            + std_luma * 0.42
            + p98_luma * 0.12
            + hot_fraction * 0.34
            + edge_energy * 1.95,
            0.0,
            1.0,
        )
        return {
            "mean_luma": mean_luma,
            "std_luma": std_luma,
            "p90_luma": p90_luma,
            "p98_luma": p98_luma,
            "hot_pixel_fraction": hot_fraction,
            "edge_energy": edge_energy,
            "activity_proxy": activity_proxy,
        }

    def detect_coronal_holes(self, tile_content: bytes) -> dict[str, Any] | None:
        """Detect coronal holes from an AIA 193Å tile via intensity thresholding.

        Coronal holes appear as dark regions in 193Å EUV images because there is
        less hot (~1.6 MK) plasma in open-field regions.  This routine applies a
        threshold at ``0.25 × median`` of the solar disk, finds connected dark
        regions, and returns up to 8 bounding boxes in heliographic (lat/lon)
        coordinates suitable for GPU shader consumption.

        The approach mirrors the first pass of CATCHES (Heinemann+ 2019) and
        SPoCA (Verbeeck+ 2014).
        """
        if Image is None:
            return None
        try:
            with Image.open(io.BytesIO(tile_content)) as image:
                grayscale = image.convert("L")
                if grayscale.width > 512 or grayscale.height > 512:
                    grayscale = grayscale.resize((512, 512))
                arr = np.asarray(grayscale, dtype=np.float32) / 255.0
        except Exception:
            return None

        if arr.size == 0 or arr.shape[0] < 8 or arr.shape[1] < 8:
            return None

        h, w = arr.shape
        cx, cy = w / 2.0, h / 2.0
        # Solar disk radius in pixels (~45% of tile width for Helioviewer tiles)
        r_sun_px = min(cx, cy) * 0.90

        # Build disk mask (only analyze pixels on the solar disk)
        yy, xx = np.mgrid[:h, :w]
        dist_sq = (xx - cx) ** 2 + (yy - cy) ** 2
        disk_mask = dist_sq <= (r_sun_px * r_sun_px)
        disk_pixels = arr[disk_mask]
        if disk_pixels.size < 100:
            return None

        # Intensity threshold: coronal holes are < 0.25 × median(disk)
        median_intensity = float(np.median(disk_pixels))
        threshold = median_intensity * 0.25
        ch_mask = (arr < threshold) & disk_mask

        # Morphological cleanup: erode then dilate to remove noise
        # Simple 3×3 binary operations without scipy dependency
        kernel_size = 3
        pad = kernel_size // 2
        # Erode
        eroded = np.zeros_like(ch_mask)
        for dy in range(-pad, pad + 1):
            for dx in range(-pad, pad + 1):
                shifted = np.roll(np.roll(ch_mask, dy, axis=0), dx, axis=1)
                if dy == -pad and dx == -pad:
                    eroded = shifted.copy()
                else:
                    eroded &= shifted
        # Dilate
        dilated = np.zeros_like(eroded)
        for dy in range(-pad, pad + 1):
            for dx in range(-pad, pad + 1):
                shifted = np.roll(np.roll(eroded, dy, axis=0), dx, axis=1)
                dilated |= shifted
        ch_mask = dilated & disk_mask

        total_ch_pixels = int(ch_mask.sum())
        total_disk_pixels = int(disk_mask.sum())
        coverage_fraction = total_ch_pixels / max(1, total_disk_pixels)

        # Find connected regions via simple flood-fill labeling
        labels = np.zeros(ch_mask.shape, dtype=np.int32)
        label_id = 0
        min_region_pixels = max(10, total_disk_pixels // 500)

        for y in range(h):
            for x in range(w):
                if ch_mask[y, x] and labels[y, x] == 0:
                    label_id += 1
                    # BFS flood fill
                    stack = [(y, x)]
                    region_pixels: list[tuple[int, int]] = []
                    while stack:
                        py, px = stack.pop()
                        if py < 0 or py >= h or px < 0 or px >= w:
                            continue
                        if labels[py, px] != 0 or not ch_mask[py, px]:
                            continue
                        labels[py, px] = label_id
                        region_pixels.append((py, px))
                        stack.extend([(py - 1, px), (py + 1, px), (py, px - 1), (py, px + 1)])

        # Extract bounding boxes for each labeled region that meets min size
        holes: list[dict[str, Any]] = []
        polar_open_north = 0.0
        polar_open_south = 0.0

        for lid in range(1, label_id + 1):
            region_mask = labels == lid
            region_size = int(region_mask.sum())
            if region_size < min_region_pixels:
                continue

            ys, xs = np.where(region_mask)
            y_min, y_max = int(ys.min()), int(ys.max())
            x_min, x_max = int(xs.min()), int(xs.max())

            # Map pixel coordinates to heliographic lat/lon
            # Plate-carre approximation for the visible hemisphere:
            # x: center = 0 lon, left/right = ±π/2
            # y: center = 0 lat, top/bottom = ±π/2
            center_x = (x_min + x_max) / 2.0
            center_y = (y_min + y_max) / 2.0
            ext_x = (x_max - x_min) / 2.0
            ext_y = (y_max - y_min) / 2.0

            center_lon = ((center_x - cx) / r_sun_px) * (math.pi / 2.0)
            center_lat = -((center_y - cy) / r_sun_px) * (math.pi / 2.0)  # y-axis inverted
            extent_lon = (ext_x / r_sun_px) * (math.pi / 2.0)
            extent_lat = (ext_y / r_sun_px) * (math.pi / 2.0)

            # Clamp to valid ranges
            center_lon = _clamp(center_lon, -math.pi, math.pi)
            center_lat = _clamp(center_lat, -math.pi / 2, math.pi / 2)
            extent_lon = _clamp(extent_lon, 0.01, math.pi)
            extent_lat = _clamp(extent_lat, 0.01, math.pi / 2)

            area_fraction = region_size / max(1, total_disk_pixels)
            hole_type = "polar" if abs(center_lat) > math.radians(50) else "equatorial"

            if center_lat > math.radians(50):
                polar_open_north += area_fraction
            elif center_lat < math.radians(-50):
                polar_open_south += area_fraction

            holes.append({
                "center_lat_rad": round(center_lat, 4),
                "center_lon_rad": round(center_lon, 4),
                "extent_lat_rad": round(extent_lat, 4),
                "extent_lon_rad": round(extent_lon, 4),
                "center_lat_deg": round(math.degrees(center_lat), 1),
                "center_lon_deg": round(math.degrees(center_lon), 1),
                "extent_lat_deg": round(math.degrees(extent_lat), 1),
                "extent_lon_deg": round(math.degrees(extent_lon), 1),
                "area_fraction": round(area_fraction, 5),
                "pixel_count": region_size,
                "type": hole_type,
            })

        # Sort by area descending, keep top 8
        holes.sort(key=lambda h: h["area_fraction"], reverse=True)
        holes = holes[:8]

        return {
            "source": "aia_193_threshold",
            "threshold": round(threshold, 4),
            "median_intensity": round(median_intensity, 4),
            "coverage_fraction": round(coverage_fraction, 4),
            "polar_open_flux_north": round(polar_open_north, 4),
            "polar_open_flux_south": round(polar_open_south, 4),
            "hole_count": len(holes),
            "holes": holes,
        }

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
        image_id = payload.get("id")
        image_id_text = str(image_id) if image_id is not None else None
        image_scale = _safe_float(payload.get("scale"))
        tile_url = self._build_aia_tile_url(image_id_text, image_scale)
        return {
            "source_id": int(source_id),
            "image_id": image_id_text,
            "image_date": payload.get("date"),
            "name": payload.get("name"),
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
        }

    def _fetch_sdo_aia(self, jd_tdb: float | None) -> dict[str, Any]:
        if jd_tdb is None:
            request_date = datetime.now(timezone.utc)
        else:
            request_date = jd_tdb_to_utc_datetime(jd_tdb)

        channels: dict[str, dict[str, Any]] = {}
        channel_activity_proxy: dict[str, float] = {}
        for key, source_id in self.AIA_SOURCE_IDS.items():
            entry = self._fetch_helioviewer_closest(source_id, request_date)
            tile_url = entry.get("tile_url")
            if isinstance(tile_url, str) and tile_url:
                try:
                    tile_content, _ = self._fetch_binary_cached(tile_url, ttl_s=self.cache_ttl_s)
                    analysis = self._analyze_aia_tile_activity(tile_content)
                    if isinstance(analysis, dict):
                        entry["analysis"] = analysis
                        channel_activity_proxy[key] = float(analysis["activity_proxy"])
                except Exception as exc:
                    entry["analysis_error"] = str(exc)
            channels[key] = entry

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

        weighted_sum = 0.0
        weight_total = 0.0
        for key, weight in self.AIA_ACTIVITY_WEIGHTS.items():
            proxy_value = channel_activity_proxy.get(key)
            if proxy_value is None:
                continue
            weighted_sum += _clamp(proxy_value, 0.0, 1.0) * weight
            weight_total += weight

        activity_proxy = None
        if weight_total > 0:
            activity_proxy = _clamp(weighted_sum / weight_total, 0.0, 1.0)
        elif freshness_proxy is not None:
            activity_proxy = freshness_proxy * 0.62

        preferred_channel = "aia_193" if isinstance(channels.get("aia_193"), dict) else None
        if preferred_channel is None:
            for key in self.AIA_SOURCE_IDS:
                if isinstance(channels.get(key), dict):
                    preferred_channel = key
                    break
        if channel_activity_proxy:
            preferred_channel = max(
                channel_activity_proxy,
                key=lambda channel_key: channel_activity_proxy.get(channel_key, 0.0),
            )
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

        # ─── Coronal Hole Detection from AIA 193Å ────────────────────────────
        coronal_holes = None
        aia_193_entry = channels.get("aia_193")
        if isinstance(aia_193_entry, dict):
            aia_193_tile_url = aia_193_entry.get("tile_url")
            if isinstance(aia_193_tile_url, str) and aia_193_tile_url:
                try:
                    tile_bytes, _ = self._fetch_binary_cached(aia_193_tile_url, ttl_s=self.cache_ttl_s)
                    coronal_holes = self.detect_coronal_holes(tile_bytes)
                except Exception:
                    pass

        return {
            "request_date_utc": request_date.isoformat().replace("+00:00", "Z"),
            "channels": channels,
            "channel_activity_proxy": channel_activity_proxy,
            "latest_image_date_utc": latest_image_date_utc,
            "freshness_s": freshness_s,
            "freshness_proxy": freshness_proxy,
            "activity_proxy": activity_proxy,
            "coronal_holes": coronal_holes,
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
            swpc = self._fetch_swpc()
            snapshot["swpc"] = swpc
            snapshot["source_status"]["swpc"] = {
                "ok": True,
                "updated": swpc.get("time_tag"),
                "endpoint": self.NOAA_PLASMA_URL,
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
                "endpoint": self.NOAA_PLASMA_URL,
            }

        try:
            silso = self._fetch_silso()
            snapshot["silso"] = silso
            snapshot["source_status"]["silso"] = {
                "ok": True,
                "updated": silso.get("date"),
                "endpoint": self.SILSO_DAILY_URL,
            }
            if isinstance(silso.get("activity_proxy"), (float, int)):
                proxy = float(silso["activity_proxy"])
                proxies.append(proxy)
                weighted_sum += proxy * 0.35
                weight_total += 0.35
        except Exception as exc:
            snapshot["source_status"]["silso"] = {
                "ok": False,
                "error": str(exc),
                "endpoint": self.SILSO_DAILY_URL,
            }

        try:
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
