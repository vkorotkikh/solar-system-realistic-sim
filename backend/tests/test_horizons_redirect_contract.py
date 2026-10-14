"""SCN-073: exercise the actual urllib redirect boundary with a controlled HTTPS wire."""
import io
import urllib.request
from email.message import Message
from urllib.response import addinfourl

import pytest

from mission import ephemeris_service as ephemeris
from mission.ephemeris_service import EphemerisProtocolError, EphemerisService
from data.bodies import ALL_BODIES
from trajectory.budget import PlanningContext, PlanningLimits, PlanningBudgetExceeded


@pytest.mark.parametrize("location", ["http://ssd.jpl.nasa.gov/unsafe", "https://evil.example/steal",
    "https://ssd.jpl.nasa.gov:444/unsafe", "https://user@ssd.jpl.nasa.gov/unsafe",
    "https://ssd.jpl.nasa.gov.evil.example/unsafe"])
def test_disallowed_redirect_never_reaches_a_second_transport(monkeypatch,location):
    urls=[]
    def wire(self,request):
        urls.append(request.full_url)
        headers=Message()
        if len(urls)==1:
            headers["Location"]=location
        response=addinfourl(io.BytesIO(b"untrusted"),headers,request.full_url,302 if len(urls)==1 else 200)
        response.msg="wire fixture"
        return response
    monkeypatch.setattr(urllib.request.HTTPSHandler,"https_open",wire)
    monkeypatch.setattr(urllib.request.HTTPHandler,"http_open",wire)
    context=PlanningContext.with_timeout(1)
    service=EphemerisService(ALL_BODIES,provider="horizons",context=context)
    with pytest.raises(EphemerisProtocolError):
        service._run_horizons_request(urllib.request.Request(ephemeris.HORIZONS_API_URL),timeout_s=1,body_id="earth",jd=2460500.5)
    assert urls == [ephemeris.HORIZONS_API_URL]


def test_same_host_redirect_is_bounded_and_charged(monkeypatch):
    urls=[]
    def wire(self,request):
        urls.append(request.full_url)
        headers=Message()
        headers["Location"]="/api/redirected"
        response=addinfourl(io.BytesIO(b"ok"),headers,request.full_url,302 if len(urls)==1 else 200)
        response.msg="wire fixture"
        return response
    monkeypatch.setattr(urllib.request.HTTPSHandler,"https_open",wire)
    context=PlanningContext.with_timeout(1)
    service=EphemerisService(ALL_BODIES,provider="horizons",context=context)
    assert service._run_horizons_request(urllib.request.Request(ephemeris.HORIZONS_API_URL),timeout_s=1,
        body_id="earth",jd=2460500.5)==b"ok"
    assert urls == [ephemeris.HORIZONS_API_URL,"https://ssd.jpl.nasa.gov/api/redirected"]
    assert context.snapshot()["counters"]["external_requests"]==2


@pytest.mark.parametrize("budget,expected_calls,error", [(1,1,PlanningBudgetExceeded),(10,4,EphemerisProtocolError)])
def test_redirect_loop_cannot_bypass_budget_or_hop_cap(monkeypatch,budget,expected_calls,error):
    calls=[]
    def wire(self,request):
        calls.append(request.full_url)
        headers=Message()
        headers["Location"]="/api/loop"
        response=addinfourl(io.BytesIO(b""),headers,request.full_url,302)
        response.msg="loop fixture"
        return response
    monkeypatch.setattr(urllib.request.HTTPSHandler,"https_open",wire)
    context=PlanningContext.with_timeout(1,limits=PlanningLimits(external_requests=budget))
    service=EphemerisService(ALL_BODIES,provider="horizons",context=context)
    with pytest.raises(error):
        service._run_horizons_request(urllib.request.Request(ephemeris.HORIZONS_API_URL),timeout_s=1,
            body_id="earth",jd=2460500.5)
    assert len(calls)==expected_calls
