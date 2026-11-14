from __future__ import annotations

from .base import SimulationEngine
from .kuiper import KuiperBeltEngine
from .rebound_nbody import REBOUNDEngine

TudatPyEngine = None  # type: ignore[assignment]
TUDATPY_IMPORT_ERROR = ""

# TudatPy is conda-only — import is optional.
# Keep import errors observable to avoid silently masking real regressions.
try:
    from .tudatpy_hooks import TudatPyEngine as _TudatPyEngine  # type: ignore
except Exception as exc:  # pragma: no cover - environment dependent
    TUDATPY_IMPORT_ERROR = str(exc)
else:
    TudatPyEngine = _TudatPyEngine


__all__ = [
    "KuiperBeltEngine",
    "REBOUNDEngine",
    "SimulationEngine",
    "TUDATPY_IMPORT_ERROR",
    "TudatPyEngine",
]
