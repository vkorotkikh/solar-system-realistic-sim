"""Selected SOL-NAMING description-only policy; not numerical/science validation."""
from __future__ import annotations

from fastapi.testclient import TestClient

import server
from sim.solar_physics import SolarCoronaPhysicsModel

DESCRIPTION = (
    "Deterministic, physically-inspired solar-corona synthesis producing parametric "
    "3D eruptive structures from rotating active regions with solar-cycle forcing; "
    "not a full MHD PDE solver."
)


def test_native_short_description_states_parametric_synthesis_and_solver_limit():
    assert SolarCoronaPhysicsModel().capabilities()["description"] == DESCRIPTION


def test_actual_capabilities_route_uses_same_unambiguous_short_description():
    with TestClient(server.app) as client:
        response = client.get("/solar/capabilities")
    assert response.status_code == 200
    assert response.json()["description"] == DESCRIPTION


def test_native_wire_identifier_and_existing_capability_contract_are_retained():
    model = SolarCoronaPhysicsModel()
    payload = model.capabilities()
    assert payload["model"] == model.model_name == "quasi_mhd_corona_v6"
    assert payload["fidelity_levels"] == ["preview", "operational", "high", "ultra"]
    assert payload["forcing_modes"] == ["synthetic", "hybrid", "data_driven"]
    assert payload["default_fidelity"] == "operational"
    assert payload["base_flux_tube_count"] == 420
    assert payload["activity_cycle_model"] == "hathaway_2015_normalized"
    assert payload["notes"][0] == "Deterministic physically-inspired synthesis, not a full MHD PDE solve."


def test_actual_capabilities_route_preserves_wire_id_notes_and_provider_metadata():
    expected = server.SOLAR_PHYSICS_MODEL.capabilities()
    expected["realtime_data"] = server.SOLAR_REALTIME_DATA.capabilities()
    expected["realtime_data"]["aia_tile_proxy_endpoint"] = "/solar/realtime/aia-tile"
    with TestClient(server.app) as client:
        response = client.get("/solar/capabilities")
    assert response.status_code == 200
    assert response.json() == expected
    assert response.json()["model"] == "quasi_mhd_corona_v6"
