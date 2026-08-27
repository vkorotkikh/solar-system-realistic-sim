from __future__ import annotations

from typing import Any, Callable, Dict

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


def engine_classes() -> Dict[str, type[SimulationEngine] | None]:
    """Return currently importable simulation engine classes by ID."""
    return {
        "rebound": REBOUNDEngine,
        "tudatpy": TudatPyEngine,
    }


def engine_availability() -> Dict[str, Dict[str, Any]]:
    """Return availability metadata for known engines."""
    status: Dict[str, Dict[str, Any]] = {
        "rebound": {"available": False, "fidelity": None, "configured_fidelity": "high"},
        "tudatpy": {
            "available": False,
            "fidelity": "normal",
            "import_error": TUDATPY_IMPORT_ERROR or None,
        },
    }

    try:
        status["rebound"] = REBOUNDEngine().readiness_status()
    except Exception as exc:  # pragma: no cover - runtime dependency failure
        status["rebound"]["error"] = str(exc)

    if TudatPyEngine is not None:
        try:
            status["tudatpy"]["available"] = bool(TudatPyEngine().available)
        except Exception as exc:  # pragma: no cover - runtime dependency failure
            status["tudatpy"]["error"] = str(exc)

    return status


def engine_factory() -> Dict[str, Callable[..., SimulationEngine]]:
    """Return constructors for available engines."""
    factories: Dict[str, Callable[..., SimulationEngine]] = {
        "rebound": REBOUNDEngine,
    }
    if TudatPyEngine is not None:
        factories["tudatpy"] = TudatPyEngine
    return factories


def create_engine(engine_id: str, **kwargs: Any) -> SimulationEngine:
    """Create an engine instance by ID."""
    key = str(engine_id).strip().lower()
    factories = engine_factory()
    if key not in factories:
        raise ValueError(f"Unknown or unavailable engine `{engine_id}`")
    return factories[key](**kwargs)


__all__ = [
    "KuiperBeltEngine",
    "REBOUNDEngine",
    "SimulationEngine",
    "TUDATPY_IMPORT_ERROR",
    "TudatPyEngine",
    "create_engine",
    "engine_availability",
    "engine_classes",
    "engine_factory",
]
