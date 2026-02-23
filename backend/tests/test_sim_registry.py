from __future__ import annotations

import pytest

from sim import create_engine, engine_availability, engine_classes, engine_factory
from sim.base import SimulationEngine


def test_engine_classes_expose_known_ids() -> None:
    classes = engine_classes()
    assert "rebound" in classes
    assert "tudatpy" in classes
    assert classes["rebound"] is not None


def test_engine_factory_contains_rebound() -> None:
    factories = engine_factory()
    assert "rebound" in factories


def test_create_engine_returns_simulation_engine_instance() -> None:
    engine = create_engine("rebound")
    assert isinstance(engine, SimulationEngine)


def test_create_engine_rejects_unknown_engine() -> None:
    with pytest.raises(ValueError):
        create_engine("unknown-engine")


def test_engine_availability_schema() -> None:
    status = engine_availability()
    assert "rebound" in status
    assert "tudatpy" in status
    assert "available" in status["rebound"]
    assert "available" in status["tudatpy"]
