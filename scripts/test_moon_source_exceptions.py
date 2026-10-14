"""Independent native handoffs and hyperbolic geometric-state regression gates."""
import base64
import json
from pathlib import Path
import sys
from unittest.mock import patch
import numpy as np
import pytest
pytest.importorskip('spiceypy',reason='native validation requires SpiceyPy; not a scientific pass')
import spiceypy as spice
sys.path.insert(0,str(Path(__file__).resolve().parent))
import capture_daphnis_spk_oracle as daphnis
import repair_spk_moon_ephemeris as native
import generate_s2023_s38_ephemeris as vectors
import generate_moon_exception_validation as runtime_oracle
from generate_moon_repairs import encoded


def test_daphnis_piecewise_artifact_rebuild_is_offline_and_pure(tmp_path,monkeypatch):
    monkeypatch.setattr(native,'CACHE',tmp_path/'missing')
    monkeypatch.setattr(native,'OFFLINE',True)
    with patch('urllib.request.urlopen',side_effect=AssertionError('network forbidden')):
        actual=native.generate(635)
    shipped=json.loads((native.fit.ROOT/'src/data/moonEphemerisDaphnis.json').read_bytes())['bodies']['daphnis']
    assert encoded(actual)==encoded(shipped)
    assert not native.CACHE.exists()
    assert actual['sourceDomain']['modelCoverageJd']==[2451545.,2469807.5]
    assert actual['validation']['accuracyLimits']=={'positionKm':136.5,'velocityMPerS':10.}


def test_native_handoff_evidence_matches_both_original_segment_states(tmp_path):
    captured=json.loads(daphnis.DESTINATION.read_bytes())
    kernel=tmp_path/'original.bsp'; kernel.write_bytes(base64.b64decode(captured['kernel_base64']))
    body=json.loads((native.fit.ROOT/'src/data/moonEphemerisDaphnis.json').read_bytes())['bodies']['daphnis']
    handle=spice.dafopr(str(kernel))
    try:
        spice.dafbfs(handle); segments=[]
        while spice.daffna():
            descriptor=spice.dafgs(); dc,ic=spice.dafus(descriptor,2,6)
            assert list(ic[:4])==[635,699,1,17]
            segments.append((dc,descriptor))
        assert len(segments)==3
        assert [segments[i][0][0]/86400+2451545 for i in [1,2]]==body['sourceDiscontinuities']
        for index,evidence in enumerate(body['validation']['boundaryContinuity']['sourceDiscontinuities']):
            et=segments[index+1][0][0]
            left=spice.spkpvn(handle,segments[index][1][:5],et)[1]
            right=spice.spkpvn(handle,segments[index+1][1][:5],et)[1]
            assert evidence['positionJumpKm']==pytest.approx(np.linalg.norm(right[:3]-left[:3]),abs=1e-8)
            assert evidence['velocityJumpMPerS']==pytest.approx(np.linalg.norm(right[3:]-left[3:])*1000,abs=1e-8)
            assert evidence['selection']=='right-hand'
            p,v=native.fit.predict(body,np.array([evidence['jdTdb']]))
            truth=spice.sxform('J2000','ECLIPJ2000',et)@right
            assert np.linalg.norm(p[0]-truth[:3])<=136.5
            assert np.linalg.norm(v[0]-truth[3:])*1000<=10
    finally:
        spice.dafcls(handle)


def test_s2023_s38_rebuild_is_offline_and_does_not_assume_an_ellipse():
    with patch('urllib.request.urlopen',side_effect=AssertionError('network forbidden')):
        actual=vectors.artifact(vectors.generate())
    assert encoded(actual)==vectors.OUTPUT.read_bytes()
    data,_=vectors.inputs()
    row=data['hyperbolic'][0]; r=row[1:4]; v=row[4:7]; gm=3.793120623436167e7
    energy=float(v@v)/2-gm/np.linalg.norm(r)
    eccentricity=np.linalg.norm(np.cross(v,np.cross(r,v))/gm-r/np.linalg.norm(r))
    assert energy>0
    assert eccentricity==pytest.approx(1.001396285462024,abs=2e-12)
    assert actual['bodies']['s2023_s38']['validation']['accuracyLimits']=={'positionKm':500.,'velocityMPerS':10.}


def test_runtime_exception_oracle_reproduces_original_pinned_inputs():
    with patch('urllib.request.urlopen',side_effect=AssertionError('network forbidden')):
        assert encoded(runtime_oracle.build())==runtime_oracle.OUTPUT.read_bytes()


def test_vector_capture_rejects_source_identity_mutation():
    _,manifest=vectors.inputs()
    header=manifest['sets']['source']['requests'][0]['providerHeader']
    with pytest.raises(ValueError,match='identity'):
        vectors.parse_vectors(header.replace('(65273)','(65272)')+'$$SOE\n$$EOE',np.array([]))
