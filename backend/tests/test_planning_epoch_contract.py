"""SCN-072: all planning routes reject unsupported epochs with the same structured 4xx."""
import pytest
from fastapi.testclient import TestClient
import server

client = TestClient(server.app, raise_server_exceptions=False)


@pytest.mark.parametrize("epoch", [1e100, -1e100, 2447892.499, 2469807.501])
@pytest.mark.parametrize("path,fields", [
    ("/trajectory/plan", {}),
    ("/trajectory/lambert", {"arrival_jd":2460700.5}),
    ("/trajectory/porkchop", {"departure_end_jd":2460550.5,"departure_step_days":5,
                             "tof_min_days":100,"tof_max_days":120,"tof_step_days":10}),
    ("/mission/plan", {"target_id":"mars"}),
])
def test_unsupported_departure_is_structured_4xx(path, fields, epoch, monkeypatch):
    # Requests must fail before allocating a worker, touching a provider, or solving.
    async def forbidden(*args, **kwargs):
        pytest.fail("unsupported epoch reached the compute worker")
    monkeypatch.setattr(server,"_run_request_owned_thread",forbidden)
    payload = dict(from_id="earth",to_id="mars",ephemeris_provider="kepler",**fields)
    if path.endswith("porkchop"):
        payload["departure_start_jd"] = epoch
        payload["departure_end_jd"] = epoch+10
    else:
        payload["departure_jd"] = epoch
        if path.endswith("lambert"):
            payload["arrival_jd"] = epoch+100 if abs(epoch)<1e10 else epoch*1.01
    response = client.post(path,json=payload)
    assert response.status_code == 422, response.text
    assert response.json()["detail"]["code"] == "trajectory_epoch_out_of_range"


@pytest.mark.parametrize("path,payload", [
    ("/trajectory/lambert", dict(departure_jd=2460500.5,arrival_jd=2469808)),
    ("/trajectory/porkchop",dict(departure_start_jd=2469790,departure_end_jd=2469795,
        departure_step_days=5,tof_min_days=20,tof_max_days=30,tof_step_days=10)),
    ("/mission/plan",dict(departure_jd=2460500.5,target_id="mars",mining_days=1e100)),
])
def test_derived_and_arrival_epochs_fail_before_work(path,payload,monkeypatch):
    async def forbidden(*args,**kwargs):
        pytest.fail("invalid arrival reached worker")
    monkeypatch.setattr(server,"_run_request_owned_thread",forbidden)
    response=client.post(path,json=dict(from_id="earth",to_id="mars",ephemeris_provider="kepler",**payload))
    assert response.status_code == 422,response.text
    assert response.json()["detail"]["code"] == "trajectory_epoch_out_of_range"


@pytest.mark.parametrize("departure_jd,max_assists", [
    (2464842.5, 0),
    (2464842.5, 1),
    (2464842.5, 2),
    (2468592.5, 0),
])
def test_plan_skips_out_of_window_generated_arrivals(departure_jd,max_assists):
    response=client.post("/trajectory/plan",json=dict(from_id="earth",to_id="mars",
        departure_jd=departure_jd,max_assists=max_assists,ephemeris_provider="kepler"))
    assert response.status_code == 200,response.text
    body=response.json()
    assert body["best"] is not None
    assert all(
        leg["arrivalJd"] <= 2469807.5
        for route in [body["best"],*body["alternatives"]]
        for leg in route["legs"]
    )


def test_search_with_no_in_range_arrival_reports_no_feasible_route():
    response=client.post("/trajectory/plan",json=dict(from_id="earth",to_id="mars",
        departure_jd=2469807.,max_assists=0,ephemeris_provider="kepler"))
    assert response.status_code == 422,response.text
    assert response.json()["detail"]["code"] == "trajectory_no_feasible_route"


@pytest.mark.parametrize("epoch",[2447892.5,2469807.5])
def test_interval_boundaries_are_inclusive_before_deriving_arrivals(epoch):
    from trajectory.contracts import validate_planning_epoch
    assert validate_planning_epoch(epoch,"departure_jd") == epoch
