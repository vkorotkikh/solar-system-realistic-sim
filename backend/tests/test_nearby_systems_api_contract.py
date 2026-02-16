from __future__ import annotations

from urllib.parse import quote

from fastapi.testclient import TestClient

from server import app

client = TestClient(app)


def test_nearby_systems_list_includes_schema_version_and_source() -> None:
    response = client.get("/nearby-systems", params={"limit": 5, "max_distance_ly": 15.0})

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema"]["name"] == "nearby_systems_catalog"
    assert payload["schema"]["version"] == "1.2.0"
    assert payload["source"]["catalog_name"] == "J/A+A/650/A201 tablea1"
    assert payload["count"] == 5
    assert len(payload["systems"]) == 5

    ranks = [row["rank"] for row in payload["systems"]]
    assert ranks == sorted(ranks)
    assert ranks[0] == 1
    assert payload["systems"][0]["sys_id"] == 1


def test_nearby_system_detail_lookup_by_sys_id() -> None:
    response = client.get("/nearby-systems/1")

    assert response.status_code == 200
    payload = response.json()
    system = payload["system"]

    assert payload["schema"]["version"] == "1.2.0"
    assert system["sys_id"] == 1
    assert system["rank"] == 1
    assert "1" in payload["aliases"]
    assert payload["match"]["match_type"] == "sys_id"


def test_nearby_system_detail_lookup_by_alias() -> None:
    alias_path = quote("Barnard's Star", safe="")
    response = client.get(f"/nearby-systems/{alias_path}")

    assert response.status_code == 200
    payload = response.json()
    system = payload["system"]
    assert system["sys_id"] == 2
    assert system["rank"] == 2
    assert payload["match"]["match_type"] == "alias"


def test_nearby_system_detail_lookup_by_catalog_name_alias_from_list() -> None:
    list_response = client.get("/nearby-systems", params={"limit": 1, "max_distance_ly": 20.0})
    assert list_response.status_code == 200
    list_payload = list_response.json()
    system = list_payload["systems"][0]
    alias = system["catalog_name"]

    detail_response = client.get(f"/nearby-systems/{quote(alias, safe='')}")
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()

    assert detail_payload["schema"] == list_payload["schema"]
    assert detail_payload["system"]["sys_id"] == system["sys_id"]
    assert detail_payload["match"]["match_type"] == "alias"


def test_nearby_system_detail_not_found_returns_404() -> None:
    response = client.get("/nearby-systems/not-a-real-system")

    assert response.status_code == 404
    assert "not found" in response.text.lower()
