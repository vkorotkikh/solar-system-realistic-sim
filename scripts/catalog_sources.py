"""Pinned, hash-checked real provider responses and atomic artifact publication.

Network acquisition is an explicit maintenance operation. Normal builds only
read this store; missing/corrupt inputs fail before any output is published.
"""
from __future__ import annotations

import ctypes
import gzip
import hashlib
import json
import os
import shutil
import stat
import tempfile
from pathlib import Path
from urllib.parse import urlencode

SOURCE_DIR = Path(__file__).resolve().parent / "source-snapshots" / "catalogs"


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False) + "\n").encode("utf-8")


def request_url(endpoint: str, params: dict) -> str:
    return endpoint + "?" + urlencode(sorted(params.items()))


class SourceStore:
    def __init__(self, directory: Path = SOURCE_DIR):
        self.directory = Path(directory)
        self.manifest_bytes = (self.directory / "manifest.json").read_bytes()
        self.manifest = json.loads(self.manifest_bytes)
        if self.manifest.get("schemaVersion") != 1:
            raise ValueError("unsupported source manifest")
        self.sha256 = hashlib.sha256(self.manifest_bytes).hexdigest()
        self.used: dict[str, dict] = {}

    def read(self, endpoint: str, params: dict) -> bytes:
        url = request_url(endpoint, params)
        key = hashlib.sha256(url.encode("ascii")).hexdigest()
        entry = self.manifest["responses"].get(key)
        if not entry or entry["url"] != url:
            raise ValueError(f"missing pinned source: {url}")
        raw = gzip.decompress((self.directory / f"{key}.json.gz").read_bytes())
        if len(raw) != entry["bytes"] or hashlib.sha256(raw).hexdigest() != entry["sha256"]:
            raise ValueError(f"source checksum mismatch: {key}")
        self.used[key] = entry
        return raw


def publish_file(path: Path, content: bytes) -> None:
    """Atomically replace a fsynced artifact, retaining mode; new public files are 0644."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    mode = stat.S_IMODE(path.stat().st_mode) if path.exists() and not path.is_symlink() else 0o644
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(content)
            stream.flush()
            os.chmod(temporary, mode)
            os.fsync(stream.fileno())
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _exchange_directories(staged: Path, destination: Path) -> None:
    # Linux renameat2 exchanges two directories in ONE namespace operation.
    # No sequence of file renames can give that guarantee for a binary/meta pair.
    libc = ctypes.CDLL(None, use_errno=True)
    rename = getattr(libc, "renameat2", None)
    if rename is None:
        raise OSError("atomic directory exchange unavailable; use a new output directory")
    rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    if rename(-100, os.fsencode(staged), -100, os.fsencode(destination), 2) != 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error), str(destination))


def publish_directory(destination: Path, artifacts: dict[str, bytes]) -> None:
    """Stage an entire generation, then atomically publish all of its artifacts.

Existing unrelated files are preserved. Unsupported exchange filesystems fail
closed. A reader opening files across the switch must still check their hash.
"""
    destination = Path(destination).absolute()
    if destination.is_symlink():
        raise ValueError("output directory must not be a symlink")
    for name in artifacts:
        if Path(name).name != name or name in ("", ".", ".."):
            raise ValueError(f"artifact name must be a simple filename: {name}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent, prefix=f".{destination.name}.stage-") as temporary:
        staged = Path(temporary) / "generation"
        if destination.exists():
            shutil.copytree(destination, staged, symlinks=True)
        else:
            staged.mkdir()
        for name, content in artifacts.items():
            publish_file(staged / name, content)
        if destination.exists():
            _exchange_directories(staged, destination)
        else:
            os.replace(staged, destination)
