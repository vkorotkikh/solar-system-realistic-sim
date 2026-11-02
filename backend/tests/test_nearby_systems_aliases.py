"""EXO-029 / R0059 H13 and B-M8-NEAR-1; native alias regression.

Found by /qa 2026-10-24; report:
agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md

Real catalog and public lookup/API boundaries; no remote provider requests.
Bare alpha-centauri policy is intentionally not prescribed by this candidate.
"""
from __future__ import annotations

from copy import deepcopy
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient

from data import nearby_systems as nearby
from server import app


@pytest.fixture(autouse=True)
def clear_lookup_caches():
    nearby._nearby_system_lookup_index.cache_clear()
    nearby.load_nearby_systems_catalog.cache_clear()
    yield
    nearby._nearby_system_lookup_index.cache_clear()
    nearby.load_nearby_systems_catalog.cache_clear()


@pytest.mark.parametrize("alias,sys_id,identifier", [
    ("sirius", 7, "alf CMa A"),
    ("  SIRIUS  ", 7, "alf CMa A"),
    ("proxima", 1, "alf Cen C"),
    ("Proxima_Centauri", 1, "alf Cen C"),
    ("barnards-star", 2, "Barnard's Star"),
    ("  BARNARDS_STAR  ", 2, "Barnard's Star"),
])
def test_common_alias_returns_exact_catalog_row(alias, sys_id, identifier):
    expected = nearby.get_nearby_system(sys_id)
    assert expected["identifier"] == identifier
    assert nearby.get_nearby_system(alias) == expected


@pytest.mark.parametrize("query,sys_id", [
    (1, 1), ("alf Cen C", 1), ("alf-Cen", 1),
    ("Barnard's Star", 2), ("alf_CMa_A", 7), ("alf CMa", 7),
])
def test_existing_catalog_lookup_remains_exact(query, sys_id):
    assert nearby.get_nearby_system(query) == nearby.get_nearby_system(sys_id)


@pytest.mark.parametrize("alias,sys_id", [("sirius", 7), ("proxima", 1), ("barnards-star", 2)])
def test_common_alias_is_reachable_through_actual_detail_api(alias, sys_id):
    response = TestClient(app).get(f"/nearby-systems/{quote(alias, safe='')}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["system"] == nearby.get_nearby_system(sys_id)
    assert payload["match"] == {"query": alias, "match_type": "alias"}
    assert payload["schema"]["version"] == "1.2.0"
    assert any(nearby._normalize_lookup_token(value) == nearby._normalize_lookup_token(alias) for value in payload["aliases"])


@pytest.mark.parametrize("sys_id,expected_alias", [(7, "sirius"), (1, "proxima"), (2, "barnards star")])
def test_public_alias_list_retains_original_prefix_and_advertises_common_name(sys_id, expected_alias):
    row = nearby.get_nearby_system(sys_id)
    original = list(dict.fromkeys([str(row["sys_id"]), row["identifier"], row["catalog_name"]]))
    aliases = nearby.nearby_system_aliases(row)
    assert aliases[:len(original)] == original
    assert expected_alias in [nearby._normalize_lookup_token(value) for value in aliases]
    assert len(aliases) == len(set(aliases))


@pytest.mark.parametrize("original_id,alias", [(7, "sirius"), (1, "proxima"), (2, "barnards-star")])
def test_alias_tracks_canonical_identity_not_rank_or_system_number(monkeypatch, original_id, alias):
    row = dict(nearby.get_nearby_system(original_id), rank=99, sys_id=991)
    decoy = dict(row, rank=1, sys_id=original_id, identifier="Unrelated star", catalog_name="Unrelated system")
    snapshot = deepcopy([decoy, row])
    monkeypatch.setattr(nearby, "load_nearby_systems_catalog", lambda: [decoy, row])
    nearby._nearby_system_lookup_index.cache_clear()
    assert nearby.get_nearby_system(alias) == row
    assert [decoy, row] == snapshot


@pytest.mark.parametrize("sys_id,wrong_identifier,alias", [
    (7, "alf CMa B", "sirius"),
    (1, "alf Cen A", "proxima"),
    (1, "alf Cen B", "proxima"),
])
def test_catalog_group_or_rank_does_not_relabel_different_component(monkeypatch, sys_id, wrong_identifier, alias):
    wrong = dict(nearby.get_nearby_system(sys_id), identifier=wrong_identifier)
    monkeypatch.setattr(nearby, "load_nearby_systems_catalog", lambda: [wrong])
    nearby._nearby_system_lookup_index.cache_clear()
    assert nearby.get_nearby_system(alias) is None


@pytest.mark.parametrize("query", ["not-a-real-system", "  ", "alpha-centauri-ab"])
def test_unknown_or_absent_ab_identity_is_not_fabricated(query):
    assert nearby.get_nearby_system(query) is None


def test_lookup_preserves_source_order_and_returns_a_copy():
    rows = nearby.load_nearby_systems_catalog()
    before = deepcopy(rows)
    returned = nearby.get_nearby_system("alf CMa")
    returned["identifier"] = "caller mutation"
    assert nearby.get_nearby_system(7)["identifier"] == "alf CMa A"
    assert rows == before


def test_existing_duplicate_raw_alias_still_uses_first_catalog_row(monkeypatch):
    first = {"sys_id": 41, "rank": 1, "identifier": "Existing", "catalog_name": "shared"}
    second = {"sys_id": 42, "rank": 2, "identifier": "Other", "catalog_name": "shared"}
    monkeypatch.setattr(nearby, "load_nearby_systems_catalog", lambda: [first, second])
    assert nearby.get_nearby_system("shared") == first
