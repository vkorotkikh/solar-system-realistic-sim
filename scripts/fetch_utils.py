"""Shared HTTP and caching utilities for data-fetching scripts."""

from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any, Callable, Optional
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import URLError

CACHE_DIR = Path(__file__).resolve().parent / ".cache"
OUTPUT_DIR = Path(__file__).resolve().parent / "output"


def ensure_cache_dir(cache_dir: Path = CACHE_DIR) -> Path:
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def ensure_output_dir(output_dir: Path = OUTPUT_DIR) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def http_get(
    url: str,
    params: Optional[dict[str, Any]] = None,
    timeout: float = 60.0,
    headers: Optional[dict[str, str]] = None,
) -> str:
    """HTTP GET returning response body as text. Uses urllib (no external deps)."""
    if params:
        url = url + ("&" if "?" in url else "?") + urlencode(params)
    req = Request(url)
    req.add_header("User-Agent", "SolarSystemSim-DataFetcher/1.0")
    if headers:
        for key, value in headers.items():
            req.add_header(key, value)
    with urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8")


def http_get_json(
    url: str,
    params: Optional[dict[str, Any]] = None,
    timeout: float = 60.0,
) -> Any:
    """HTTP GET returning parsed JSON."""
    text = http_get(url, params=params, timeout=timeout)
    return json.loads(text)


def load_or_fetch(
    cache_path: Path,
    fetch_fn: Callable[[], Any],
    max_age_hours: float = 168.0,
) -> Any:
    """Load JSON from cache if fresh, otherwise call fetch_fn and save."""
    cache_path = Path(cache_path)
    if cache_path.exists():
        age_hours = (time.time() - cache_path.stat().st_mtime) / 3600.0
        if age_hours < max_age_hours:
            print(f"  Using cached {cache_path.name} ({age_hours:.1f}h old)")
            with open(cache_path, "r") as f:
                return json.load(f)
    print(f"  Fetching fresh data...")
    data = fetch_fn()
    ensure_cache_dir(cache_path.parent)
    with open(cache_path, "w") as f:
        json.dump(data, f)
    print(f"  Cached to {cache_path.name}")
    return data


def parse_csv_text(text: str) -> list[dict[str, str]]:
    """Parse CSV text into list of dicts using first row as headers."""
    lines = text.strip().splitlines()
    if len(lines) < 2:
        return []
    headers = [h.strip().strip('"') for h in lines[0].split(",")]
    rows = []
    for line in lines[1:]:
        if not line.strip():
            continue
        values = [v.strip().strip('"') for v in line.split(",")]
        row = {}
        for i, header in enumerate(headers):
            row[header] = values[i] if i < len(values) else ""
        rows.append(row)
    return rows


def safe_float(value: Any, default: Optional[float] = None) -> Optional[float]:
    """Convert to float, returning default if not possible."""
    if value is None or value == "" or value == "null":
        return default
    try:
        v = float(value)
        return v if v == v else default  # NaN check
    except (ValueError, TypeError):
        return default


def safe_int(value: Any, default: Optional[int] = None) -> Optional[int]:
    """Convert to int, returning default if not possible."""
    f = safe_float(value)
    if f is None:
        return default
    return int(f)
