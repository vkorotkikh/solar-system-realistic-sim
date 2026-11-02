"""Live ASGI ingress through real AIA cache/acquisition, with bounded test upstreams."""

from collections import OrderedDict
from urllib.parse import parse_qs, urlsplit

import pytest
from astropy.time import Time, TimeDelta
from fastapi.testclient import TestClient

import server
from sim.solar_realtime_data import SolarRealtimeDataProvider


BOUNDARIES = [
    ("1990-01-01T00:00:00", "1989-12-31T23:59:60", 25),
    ("2012-07-01T00:00:00", "2012-06-30T23:59:60", 35),
    ("2015-07-01T00:00:00", "2015-06-30T23:59:60", 36),
    ("2017-01-01T00:00:00", "2016-12-31T23:59:60", 37),
]


@pytest.fixture
def ingress(monkeypatch, aia_png_header):
    provider = SolarRealtimeDataProvider()
    queries = []

    def outside_scope():
        raise RuntimeError("Non-AIA sources are outside the time regression")

    def fetch_json(url):
        query = parse_qs(urlsplit(url).query)
        queries.append(query)
        return {"id": "123", "date": query["date"][0], "name": "AIA", "scale": 0.6}

    monkeypatch.setattr(provider, "_fetch_swpc", outside_scope)
    monkeypatch.setattr(provider, "_fetch_silso", outside_scope)
    monkeypatch.setattr(provider, "_fetch_json", fetch_json)
    monkeypatch.setattr(provider, "_fetch_aia_png_cached", lambda *_a, **_k: (aia_png_header(), "image/png"))
    monkeypatch.setattr(server, "SOLAR_REALTIME_DATA", provider)
    monkeypatch.setattr(server, "_solar_aia_tile_rate_locks", OrderedDict())
    monkeypatch.setattr(server, "SOLAR_AIA_TILE_RATE_LIMIT_PER_WINDOW", 1000)
    return TestClient(server.app), provider, queries


def precise_params(instant):
    return {"jd_tdb1": repr(float(instant.tdb.jd1)), "jd_tdb2": repr(float(instant.tdb.jd2))}


@pytest.mark.parametrize("midnight,leap,offset", BOUNDARIES)
def test_precise_http_midnight_reaches_real_provider_and_cache(ingress, midnight, leap, offset):
    client, provider, queries = ingress
    instant = Time(midnight, scale="utc")
    tai = Time(midnight[:-2] + f"{offset:02d}", scale="tai")
    assert abs((instant.tai - tai).to_value("sec")) < 1e-9
    response = client.get("/solar/realtime/aia-tile", params=precise_params(instant))
    assert response.status_code == 200, response.text
    assert response.headers["x-solar-aia-image-date"] == midnight + "Z"
    assert len(queries) == len(provider.AIA_SOURCE_IDS)
    assert all(row["date"] == [midnight + "Z"] for row in queries)
    genuine_leap = Time(leap + ".99999", scale="utc")
    assert float(instant.tdb.jd) == float(genuine_leap.tdb.jd)
    unsupported = client.get("/solar/realtime/aia-tile", params=precise_params(genuine_leap))
    assert unsupported.status_code == 422, unsupported.text
    assert unsupported.json()["detail"]["code"] == "unsupported_utc_instant"
    assert not provider._snapshot_cache
    assert len(provider._aia_bundle_cache) == 1
    cached = client.get("/solar/realtime/aia-tile", params=precise_params(instant))
    assert cached.status_code == 200
    assert len(queries) == len(provider.AIA_SOURCE_IDS)


@pytest.mark.parametrize("midnight,leap,offset", BOUNDARIES)
@pytest.mark.parametrize("edge", ["start", "end"])
@pytest.mark.parametrize("alias", ["jd_tdb", "jd"])
def test_http_scalar_leap_boundary_rejected_before_provider_work(ingress, midnight, leap, offset, edge, alias):
    client, provider, queries = ingress
    instant = Time(leap if edge == "start" else midnight, scale="utc")
    response = client.get("/solar/realtime/aia-tile", params={alias: repr(float(instant.tdb.jd))})
    assert response.status_code == 400, response.text
    assert response.json()["detail"]["code"] == "ambiguous_scalar_jd"
    assert response.json()["detail"]["retryable"] is False
    assert not queries and not provider._snapshot_cache and not provider._aia_bundle_cache
    assert not server._solar_aia_tile_rate_locks


@pytest.mark.parametrize("midnight,leap,offset", BOUNDARIES)
def test_http_scalar_leap_interior_has_typed_unsupported_error(ingress, midnight, leap, offset):
    client, provider, queries = ingress
    instant = Time(leap + ".5", scale="utc")
    response = client.get("/solar/realtime/aia-tile", params={"jd_tdb": repr(float(instant.tdb.jd))})
    assert response.status_code == 422, response.text
    assert response.json()["detail"]["code"] == "unsupported_utc_instant"
    assert not queries and not provider._snapshot_cache and not provider._aia_bundle_cache


@pytest.mark.parametrize("midnight,leap,offset", BOUNDARIES)
@pytest.mark.parametrize("fraction", [".25", ".99999", ".9999999"])
def test_http_precise_leap_second_is_typed_unsupported_before_provider_work(
    ingress, midnight, leap, offset, fraction,
):
    client, provider, queries = ingress
    instant = Time(leap + fraction, scale="utc")
    tai = Time(midnight[:-2] + f"{offset - 1:02d}" + fraction, scale="tai")
    assert abs((instant.tai - tai).to_value("sec")) < 1e-9
    response = client.get("/solar/realtime/aia-tile", params=precise_params(instant))
    assert response.status_code == 422, response.text
    assert response.json()["detail"]["code"] == "unsupported_utc_instant"
    assert response.json()["detail"]["retryable"] is False
    assert not queries and not provider._snapshot_cache and not provider._aia_bundle_cache
    assert not server._solar_aia_tile_rate_locks


@pytest.mark.parametrize("params,code", [
    ({"jd_tdb1": "2457755"}, "incomplete_two_part_jd"),
    ({"jd_tdb2": "-.4992"}, "incomplete_two_part_jd"),
    ({"jd_tdb1": "nan", "jd_tdb2": "0"}, "invalid_jd_tdb1"),
    ({"jd_tdb1": "bad", "jd_tdb2": "0"}, "invalid_jd_tdb1"),
    ({"jd_tdb1": "2457755", "jd_tdb2": "inf"}, "invalid_jd_tdb2"),
    ({"jd_tdb1": "2457755", "jd_tdb2": "-inf"}, "invalid_jd_tdb2"),
    ({"jd_tdb1": "2457755", "jd_tdb2": "bad"}, "invalid_jd_tdb2"),
    ({"jd_tdb1": "1e30", "jd_tdb2": "-1e30"}, "jd_out_of_range"),
    ({"jd_tdb1": "2457755", "jd_tdb2": "2"}, "jd_out_of_range"),
    ({"jd_tdb1": "2457755", "jd_tdb2": "-2"}, "jd_out_of_range"),
    ({"jd_tdb1": "2457755", "jd_tdb2": "0", "jd_tdb": "2457755"}, "conflicting_julian_date_aliases"),
    ({"jd_tdb1": "2457755", "jd_tdb2": "0", "jd": "2457755"}, "conflicting_julian_date_aliases"),
])
def test_invalid_http_precise_input_is_rejected_before_admission(ingress, params, code):
    client, provider, queries = ingress
    response = client.get("/solar/realtime/aia-tile", params=params)
    assert response.status_code == 400, response.text
    assert response.json()["detail"]["code"] == code
    assert not queries and not provider._snapshot_cache and not provider._aia_bundle_cache
    assert not server._solar_aia_tile_rate_locks


@pytest.mark.parametrize("bound,offset", [("SOLAR_PHYSICS_JD_MIN", -1e-12), ("SOLAR_PHYSICS_JD_MAX", 1e-12)])
def test_precise_http_epoch_bounds_do_not_collapse_the_residual(ingress, bound, offset):
    client, provider, queries = ingress
    # A scalar sum would drop this residual and admit the out-of-range instant.
    first = getattr(server, bound)
    assert first + offset == first
    response = client.get(
        "/solar/realtime/aia-tile", params={"jd_tdb1": repr(first), "jd_tdb2": repr(offset)},
    )
    assert response.status_code == 400, response.text
    assert response.json()["detail"]["code"] == "jd_out_of_range"
    assert not queries and not provider._snapshot_cache and not provider._aia_bundle_cache


def test_precise_http_epochs_sharing_a_scalar_do_not_alias_in_the_provider_cache(ingress):
    client, provider, queries = ingress
    midnight = Time("2017-01-01T00:00:00", scale="utc")
    instants = [midnight + TimeDelta(microseconds * 1e-6, format="sec") for microseconds in (1, 2)]
    assert float(instants[0].tdb.jd) == float(instants[1].tdb.jd)
    for instant in instants:
        response = client.get("/solar/realtime/aia-tile", params=precise_params(instant))
        assert response.status_code == 200, response.text
    assert not provider._snapshot_cache
    assert len(provider._aia_bundle_cache) == 2
    assert len(queries) == 2 * len(provider.AIA_SOURCE_IDS)
    for instant in instants:
        cached = client.get("/solar/realtime/aia-tile", params=precise_params(instant))
        assert cached.status_code == 200, cached.text
    assert len(queries) == 2 * len(provider.AIA_SOURCE_IDS)


def test_http_openapi_exposes_the_precision_and_unsupported_instant_contract(ingress):
    client, _provider, _queries = ingress
    operation = client.get("/openapi.json").json()["paths"]["/solar/realtime/aia-tile"]["get"]
    parameters = {entry["name"]: entry for entry in operation["parameters"]}
    assert "jd_tdb1" in parameters and "jd_tdb2" in parameters
    assert "[-1, 1]" in parameters["jd_tdb2"]["description"]
    assert "unsupported_utc_instant" in operation["responses"]["422"]["description"]
    assert "ambiguous_scalar_jd" in operation["description"]


def test_ordinary_http_scalar_and_equal_legacy_alias_still_work(ingress):
    client, provider, queries = ingress
    scalar = float(Time("2020-01-01T12:00:00", scale="utc").tdb.jd)
    response = client.get("/solar/realtime/aia-tile", params={"jd_tdb": scalar, "jd": scalar})
    assert response.status_code == 200, response.text
    assert len(queries) == len(provider.AIA_SOURCE_IDS)
