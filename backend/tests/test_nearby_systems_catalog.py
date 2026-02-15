from __future__ import annotations

from data.nearby_systems import load_nearby_systems_catalog, query_nearby_systems


def test_nearby_systems_catalog_loads_ranked_rows() -> None:
    rows = load_nearby_systems_catalog()
    assert len(rows) >= 300
    assert rows[0]["rank"] == 1
    assert rows[0]["distance_ly"] is not None
    assert rows[0]["distance_ly"] < 5.0
    assert rows[1]["rank"] == 2


def test_nearby_systems_catalog_query_filters_and_limits() -> None:
    near = query_nearby_systems(limit=10, max_distance_ly=12.5)
    assert len(near) <= 10
    assert len(near) > 0
    assert all(item["distance_ly"] <= 12.5 for item in near if item["distance_ly"] is not None)
