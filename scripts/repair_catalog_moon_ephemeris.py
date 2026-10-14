#!/usr/bin/env python3
"""SCN-043 numerical ephemeris repair; independent grids, fixed accuracy budgets.

This driver does not change the general catalog generator or the original four
fitted ephemerides. Per-body candidates are cached and promoted only after the
held-out numerical states AND the separate seven-epoch vector oracle pass.
"""
from __future__ import annotations

import argparse
from dataclasses import replace
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

import numpy as np
from numpy.polynomial.chebyshev import chebfit, chebval, chebvander, chebder

import generate_moon_ephemeris as original

ROOT = Path(__file__).resolve().parents[1]
START = 2451545.0
END = 2469807.5
AU_KM = 149597870.7
DAY = 86400.0
CACHE = ROOT / 'node_modules/.cache/scn043'
ARTIFACT = ROOT / 'src/data/moonEphemerisRepairs.json'
ORACLE = ROOT / 'backend/tests/fixtures/all_moons_horizons_oracle.json'
CATALOG = ROOT / 'src/data/moons.json'
EXISTING = {'titan', 'iapetus', 'phoebe', 'cordelia'}


def fetch_result(params, cache, offline=False):
    """Candidate acquisition is separate from the canonical offline SourceStore."""
    encoded = urlencode(params)
    path = cache / f'{hashlib.sha256(encoded.encode("ascii")).hexdigest()}.json'
    if path.exists():
        payload = json.loads(path.read_bytes())
    elif offline:
        raise FileNotFoundError(f'No captured candidate input: {path}')
    else:
        request = Request(original.HORIZONS_API_URL + '?' + encoded,
                          headers={'User-Agent': 'solar-system-realistic-sim/1'})
        with urlopen(request, timeout=30) as response:
            payload = json.loads(response.read())
        cache.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, separators=(',', ':')))
    if payload.get('error'):
        raise RuntimeError(f'Horizons rejected query: {payload["error"]}')
    if payload.get('signature', {}).get('source') != 'NASA/JPL Horizons API':
        raise RuntimeError('Unexpected Horizons signature')
    result = payload.get('result', '')
    if '$$SOE' not in result or '$$EOE' not in result:
        raise RuntimeError('Missing provider element table')
    return result


def independent_training_rows(rows, reference):
    reserved = {START, END, *(row['jd_tdb'] for row in reference['states'])}
    return tuple(row for row in rows if row.jd not in reserved)


def query_grid(target, start, end, step, cache, offline=False):
    rows = []
    source = None
    # Provider accounts for several output lines per ELEMENTS row.
    while start <= end + 1e-9:
        stop = min(end, start + step * 19999)
        params = original._query_params(target, start, stop, step)
        response = original._parse_query(target, fetch_result(params, cache, offline))
        count = math.floor((stop-start)/step + 1e-9) + 1
        if len(response.rows) != count or any(abs(row.jd-(start+i*step)) > 1e-9 for i, row in enumerate(response.rows)):
            raise RuntimeError('Incomplete or unordered candidate source grid')
        if source is None:
            source = response
        elif source.ephemeris != response.ephemeris or source.central_gm_km3_s2 != response.central_gm_km3_s2:
            raise RuntimeError('Provider solution changed within source grid')
        rows.extend(response.rows)
        start = rows[-1].jd + step
    if not rows:
        raise RuntimeError('Empty source grid')
    return tuple(rows), original._combined_rows_digest(rows), source.central_gm_km3_s2


def features(rows, period):
    return np.asarray(original._features(rows, period), dtype=float)


def fit_model(target, rows, end, segment_days):
    values = features(rows, target.nominal_period_days)
    t = values[:, 0] - START
    rate, base = np.polyfit(t, values[:, 8], 1)
    values[:, 8] -= base + rate*t
    # Equal spans avoid a tiny underdetermined trailing segment.
    count = math.ceil((end - START) / segment_days)
    edges = np.linspace(START, end, count+1)
    segments = []
    for a, b in zip(edges[:-1], edges[1:]):
        samples = values[(values[:, 0] >= a-target.source_step_days) & (values[:, 0] <= b+target.source_step_days)]
        if len(samples) < target.degree+2:
            raise RuntimeError(f'Too few source samples: {len(samples)} for degree {target.degree}')
        x = 2*(samples[:, 0]-a)/(b-a)-1
        coeff = chebfit(x, samples[:, 1:], target.degree).T
        segments.append({'startJd': float(a), 'endJd': float(b), 'coefficients': coeff.tolist()})
    return {'kind': original.KIND, 'coverageStartJd': START, 'coverageEndJd': end,
            'meanLongitudeBaseDeg': float(base), 'meanLongitudeRateDegPerDay': float(rate),
            'sourceStepDays': target.source_step_days, 'segments': segments}


def fit_cartesian_model(target, rows, end, segment_days):
    source = features(rows, target.nominal_period_days)
    position, velocity = state_from_features(source[:, 1:])
    rate, base = np.polyfit(source[:, 0]-START, source[:, 8], 1)
    harmonics = 3 if target.nominal_period_days < 100 else 0
    times = source[:, 0]
    phase = np.deg2rad(base+rate*(times-START))
    omega = np.deg2rad(rate)
    carriers = [np.ones(len(times))]
    carrier_rates = [np.zeros(len(times))]
    for k in range(1, harmonics+1):
        carriers.extend([np.cos(k*phase), np.sin(k*phase)])
        carrier_rates.extend([-k*omega*np.sin(k*phase), k*omega*np.cos(k*phase)])
    degree = target.degree
    derivative_coeff = chebder(np.eye(degree+1),axis=0)
    edges = np.linspace(START,end,math.ceil((end-START)/segment_days)+1)
    segments = []
    for a,b in zip(edges[:-1],edges[1:]):
        mask = (times >= a-target.source_step_days) & (times <= b+target.source_step_days)
        x = 2*(times[mask]-a)/(b-a)-1
        basis = chebvander(x,degree)
        derivative = chebvander(x,degree-1) @ derivative_coeff * (2/(b-a))
        aa = np.concatenate([basis*c[mask,None] for c in carriers],axis=1)
        dd = np.concatenate([derivative*c[mask,None]+basis*d[mask,None] for c,d in zip(carriers,carrier_rates)],axis=1)
        weight = target.source_step_days
        matrix = np.concatenate((aa,dd*weight))
        rhs = np.concatenate((position[mask],velocity[mask]*DAY*weight))
        if matrix.shape[0] < matrix.shape[1]:
            raise RuntimeError('Underdetermined Cartesian carrier fit; denser source required')
        # On shorter arcs, polynomial amplitudes and nearby Fourier sidebands
        # can span the same numerical directions. Truncated SVD suppresses
        # cancellation-prone coefficients; independent state gates still decide
        # whether the resulting trajectory is acceptable.
        coefficients,_,rank,_ = np.linalg.lstsq(matrix,rhs,rcond=1e-10)
        coefficients = coefficients.reshape(1+2*harmonics,degree+1,3).transpose(0,2,1).reshape(-1,degree+1)
        segments.append({'startJd':float(a),'endJd':float(b),'coefficients':coefficients.tolist()})
    return {'kind':'horizons-chebyshev-cartesian-v1','carrierHarmonics':harmonics,
            'coverageStartJd':START,'coverageEndJd':end,'meanLongitudeBaseDeg':float(base),
            'meanLongitudeRateDegPerDay':float(rate),'sourceStepDays':target.source_step_days,'segments':segments}


def cartesian_prediction(body,times):
    times=np.asarray(times)
    segments=body['segments']
    starts=np.array([s['startJd'] for s in segments])
    indices=np.clip(np.searchsorted(starts,times,side='right')-1,0,len(segments)-1)
    def evaluate(index,ts):
        segment=segments[index]
        coeff=np.array(segment['coefficients']).T
        x=2*(ts-segment['startJd'])/(segment['endJd']-segment['startJd'])-1
        amplitudes=chebval(x,coeff).T.reshape(len(ts),-1,3)
        derivatives=chebval(x,chebder(coeff,axis=0)).T.reshape(len(ts),-1,3)*(2/(segment['endJd']-segment['startJd']))
        phase=np.deg2rad(body['meanLongitudeBaseDeg']+body['meanLongitudeRateDegPerDay']*(ts-START))
        omega=np.deg2rad(body['meanLongitudeRateDegPerDay'])
        carrier=[np.ones(len(ts))]; rates=[np.zeros(len(ts))]
        for k in range(1,body['carrierHarmonics']+1):
            carrier.extend([np.cos(k*phase),np.sin(k*phase)])
            rates.extend([-k*omega*np.sin(k*phase),k*omega*np.cos(k*phase)])
        c=np.array(carrier).T[:,:,None]; d=np.array(rates).T[:,:,None]
        return np.sum(amplitudes*c,axis=1),np.sum(derivatives*c+amplitudes*d,axis=1)/DAY
    p=np.empty((len(times),3)); v=np.empty_like(p)
    for index in np.unique(indices):
        mask=indices==index
        p[mask],v[mask]=evaluate(index,times[mask])
    half=body['sourceStepDays']/2
    for index in range(1,len(segments)):
        boundary=starts[index]
        mask=np.abs(times-boundary)<half
        if not np.any(mask): continue
        u=(times[mask]-boundary+half)/(2*half)
        w=(u*u*(3-2*u))[:,None]
        dw=(6*u*(1-u)/(2*half)/DAY)[:,None]
        p0,v0=evaluate(index-1,times[mask]); p1,v1=evaluate(index,times[mask])
        p[mask]=(1-w)*p0+w*p1
        v[mask]=(1-w)*v0+w*v1+dw*(p1-p0)
    return p,v


def evaluate_features(body, times):
    times = np.asarray(times)
    segments = body['segments']
    starts = np.array([s['startJd'] for s in segments])
    indices = np.clip(np.searchsorted(starts, times, side='right')-1, 0, len(segments)-1)
    result = np.empty((len(times), 9))
    def evaluate(index, ts):
        s = segments[index]
        return chebval(2*(ts-s['startJd'])/(s['endJd']-s['startJd'])-1, np.array(s['coefficients']).T).T
    for index in np.unique(indices):
        mask = indices == index
        result[mask] = evaluate(index, times[mask])
    half = body['sourceStepDays']/2
    for index in range(1, len(segments)):
        boundary = starts[index]
        mask = np.abs(times-boundary) < half
        if not np.any(mask):
            continue
        u = (times[mask]-(boundary-half))/(2*half)
        w = (u*u*(3-2*u))[:, None]
        result[mask] = (1-w)*evaluate(index-1, times[mask]) + w*evaluate(index, times[mask])
    result[:, 7] += body['meanLongitudeBaseDeg'] + body['meanLongitudeRateDegPerDay']*(times-START)
    return result


def state_from_features(values):
    a = values[:, 0]
    h = values[:, 1:4]
    h = h / np.linalg.norm(h, axis=1)[:, None]
    evec = values[:, 4:7]
    evec = evec - np.sum(evec*h, axis=1)[:, None]*h
    e = np.linalg.norm(evec, axis=1)
    if np.any(e >= 1) or np.any(a <= 0):
        raise RuntimeError('Invalid interpolated ellipse')
    node = np.arctan2(h[:, 0], -h[:, 1])
    nodal = np.column_stack((np.cos(node), np.sin(node), np.zeros(len(node))))
    transverse = np.cross(h, nodal)
    peri = np.arctan2(np.sum(evec*transverse, axis=1), np.sum(evec*nodal, axis=1))
    p = np.divide(evec, e[:, None], out=nodal.copy(), where=e[:, None] > 1e-12)
    q = np.cross(h, p)
    mean = np.mod(np.deg2rad(values[:, 7])-node-peri, 2*np.pi)
    anomaly = mean.copy()
    for _ in range(20):
        delta = (anomaly-e*np.sin(anomaly)-mean)/(1-e*np.cos(anomaly))
        anomaly -= delta
        if np.max(np.abs(delta)) < 1e-13:
            break
    cosine, sine = np.cos(anomaly), np.sin(anomaly)
    root = np.sqrt(1-e*e)
    pos = (a*(cosine-e))[:, None]*p + (a*root*sine)[:, None]*q
    n = np.deg2rad(values[:, 8])/DAY
    speed = a*n/(1-e*cosine)
    vel = (-speed*sine)[:, None]*p + (speed*root*cosine)[:, None]*q
    return pos, vel


def predict(body, times):
    if body['kind']=='horizons-chebyshev-cartesian-v1':
        return cartesian_prediction(body,times)
    times = np.asarray(times)
    position, _ = state_from_features(evaluate_features(body, times))
    before = np.maximum(body['coverageStartJd'], times-1e-4)
    after = np.minimum(body['coverageEndJd'], times+1e-4)
    p0, _ = state_from_features(evaluate_features(body, before))
    p1, _ = state_from_features(evaluate_features(body, after))
    return position, (p1-p0)/((after-before)*DAY)[:, None]


def stats(errors):
    return {key: float(np.quantile(errors, q, method='higher')) for key,q in [('p50',.5),('p95',.95),('p99',.99),('max',1.)]}


def generate(moon, reference, args):
    key = moon['name'].lower()
    destination = args.cache_dir / f'{quote(key, safe="")}.model.json'
    if destination.exists() and not args.refit:
        return json.loads(destination.read_text())
    target_header = reference['headers']['Target body name'].split(':',1)[1].strip()
    name = target_header.split('(')[0].strip()
    source = re.search(r'\{source:\s*([^}]+)', target_header).group(1).strip()
    end = 2458135.5 if moon['name'] == 'Daphnis' else END
    step = args.step or (0.5 if moon['periodDays'] < 100 else 4.0)
    target = original.Target(key,name,str(moon['iauCode']),reference['query']['CENTER'],moon['planet'],
                             source,moon['periodDays'],step,128,12,min(500.,.001*moon['aKm']),10.)
    # Neither source phase (x.125) nor held-out phase matches any old oracle JD.
    # Provider-limited Daphnis queries stop before the unavailable end interval.
    source_end = end-.125 if moon['name']=='Daphnis' else end+step+.125
    offline = getattr(args, 'offline', False)
    captured_rows, captured_hash, gm = query_grid(target, START-step+.125, source_end, step,args.cache_dir/'responses',offline)
    held_rows, held_hash, _ = query_grid(target, START+.125+step/2,end-.125,step,args.cache_dir/'responses',offline)
    # A denser step can align the old .125 offset with oracle epochs. Remove
    # those fitting rows explicitly, including both exact coverage endpoints.
    source_rows = independent_training_rows(captured_rows, reference)
    if {row.jd for row in source_rows} & {row.jd for row in held_rows}:
        raise RuntimeError('Source and held-out grids overlap')
    source_hash = original._combined_rows_digest(source_rows)
    excluded_epochs = sorted({row.jd for row in captured_rows} - {row.jd for row in source_rows})
    truth = features(held_rows, moon['periodDays'])
    truth_pos, truth_vel = state_from_features(truth[:,1:])
    # Exact coverage endpoints are fetched independently rather than falsely
    # treating the last regular-grid row as the declared end date.
    endpoint_params = original._query_params(target, START, end, step)
    for field in ['START_TIME','STOP_TIME','STEP_SIZE']:
        del endpoint_params[field]
    endpoint_params.update(TLIST=f'{START} {end}',TLIST_TYPE='JD')
    endpoints = original._parse_query(target,fetch_result(endpoint_params,args.cache_dir/'responses',offline))
    endpoint_features = features(endpoints.rows,moon['periodDays'])
    endpoint_pos, endpoint_vel = state_from_features(endpoint_features[:,1:])
    times = np.concatenate((truth[:,0],endpoint_features[:,0]))
    all_pos = np.concatenate((truth_pos,endpoint_pos))
    all_vel = np.concatenate((truth_vel,endpoint_vel))
    oracle_times = np.array([r['jd_tdb'] for r in reference['states']])
    oracle_pos = np.array([r['position_au'] for r in reference['states']])*AU_KM
    oracle_vel = np.array([r['velocity_au_per_day'] for r in reference['states']])*AU_KM/DAY
    best = None
    for span in [512.,256.,128.,64.,32.,16.]:
        if span < step*target.degree/2:
            continue
        try:
            body = fit_cartesian_model(target,source_rows,end,span)
        except RuntimeError as error:
            print(key,'span',span,str(error),flush=True)
            continue
        pp,pv = predict(body,times)
        pe = np.linalg.norm(pp-all_pos,axis=1)
        ve = np.linalg.norm(pv-all_vel,axis=1)*1000
        op,ov = predict(body,oracle_times)
        ope = np.linalg.norm(op-oracle_pos,axis=1)
        ove = np.linalg.norm(ov-oracle_vel,axis=1)*1000
        score = max(max(pe.max(),ope.max())/target.max_position_error_km,max(ve.max(),ove.max())/target.max_velocity_error_m_per_s)
        best = min(best or (float('inf'),None), (score,span))
        print(key,'span',span,'grid/oracle max km',round(float(pe.max()),3),round(float(ope.max()),3),
              'm/s',round(float(ve.max()),3),round(float(ove.max()),3),flush=True)
        if score > 1:
            continue
        body.update(name=moon['name'], targetId=target.command, centralGmKm3S2=gm,
                    sourceRowsSha256=source_hash,heldOutRowsSha256=held_hash,
                    capturedSourceRowsSha256=captured_hash,excludedTrainingEpochs=excluded_epochs,
                    sourceRowCount=len(source_rows), sourceGridStartJd=source_rows[0].jd,
                    sourceGridEndJd=source_rows[-1].jd)
        body['provenance']={'source':'NASA/JPL Horizons API','sourceEphemeris':source,
            'targetId':target.command,'centerId':target.center.split('@')[1],
            'frame':'ECLIPJ2000','timeScale':'TDB','generatedAt':datetime.now(timezone.utc).isoformat(),
            'generator':'scripts/repair_catalog_moon_ephemeris.py',
            'query':json.dumps(original._query_params(target,captured_rows[0].jd,captured_rows[-1].jd,step),sort_keys=True)}
        body['validation']={'method':'Independent half-step ELEMENTS and exact endpoints, plus separate seven-epoch VECTORS; no oracle state fitted',
            'sampleCount':len(times),'heldOutSampleCount':len(held_rows),'coverageEndpointSampleCount':2,
            'trainingDisjointFromValidation':True,
            'coverageEndpointErrors':[{'jdTdb':float(t),'positionErrorKm':float(p),'velocityErrorMPerS':float(v)} for t,p,v in zip(times[-2:],pe[-2:],ve[-2:])],
            'accuracyLimits':{'positionKm':target.max_position_error_km,'velocityMPerS':target.max_velocity_error_m_per_s},
            'positionErrorKm':stats(pe),'velocityErrorMPerS':stats(ve),
            'vectorOracle':{'sampleCount':len(oracle_times),'positionErrorKm':stats(ope),'velocityErrorMPerS':stats(ove),
                            'fixture':'backend/tests/fixtures/all_moons_horizons_oracle.json'},
            'boundaryContinuity':{'runtimeStateContinuous':True,'method':'existing smooth-step feature cross-fade'}}
        destination.write_text(json.dumps(body,separators=(',',':'),allow_nan=False)+'\n')
        return body
    raise RuntimeError(f'Fixed accuracy budget not met; best normalized error {best}; denser source or improved model required')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bodies',default='all',help='comma-separated catalog names, or all')
    parser.add_argument('--cache-dir',type=Path,default=CACHE)
    parser.add_argument('--step',type=float)
    parser.add_argument('--refit',action='store_true')
    parser.add_argument('--offline',action='store_true',help='use only previously captured candidate responses')
    parser.add_argument('--promote',action='store_true',help='merge passing candidates, preserving existing bodies')
    parser.add_argument('--cached-only',action='store_true',help='checkpoint already-gated candidates without network queries')
    args=parser.parse_args()
    args.cache_dir.mkdir(parents=True,exist_ok=True)
    requested={s.strip().lower() for s in args.bodies.split(',')}
    moons=json.loads(CATALOG.read_text())
    oracle=json.loads(ORACLE.read_text())
    candidates={}
    failures=[]
    for i,moon in enumerate(moons):
        key=moon['name'].lower()
        if key in EXISTING or ('all' not in requested and key not in requested):
            continue
        ref=oracle['bodies'][str(moon['id'])]
        if args.cached_only:
            path=args.cache_dir/f'{quote(key, safe="")}.model.json'
            if path.exists():
                candidates[key]=json.loads(path.read_text())
            else:
                failures.append({'name':moon['name'],'status':'repair_pending','error':'No passing cached model'})
            continue
        if ref['status']=='unavailable':
            failures.append({'name':moon['name'],'status':'provider_unavailable','error':ref['error']})
            continue
        try:
            candidates[key]=generate(moon,ref,args)
            print('PASS',i+1,moon['name'],flush=True)
        except Exception as error:
            failures.append({'name':moon['name'],'status':'unrepaired','error':str(error)})
            print('FAIL',i+1,moon['name'],str(error),flush=True)
    report={'catalogDenominator':len(moons),'passingCandidates':list(candidates),'failures':failures}
    (args.cache_dir/'last-run.json').write_text(json.dumps(report,indent=2)+'\n')
    if args.promote and candidates:
        artifact=json.loads(ARTIFACT.read_text())
        artifact['bodies'].update(candidates)
        artifact['schemaVersion']=2
        artifact['kind']='horizons-chebyshev-mixed-v2'
        artifact['cartesianFeatureOrder']='XYZ groups for 1, cos(phi), sin(phi), cos(2phi), sin(2phi), ...; phi=meanLongitudeBaseDeg+meanLongitudeRateDegPerDay*(jd-coverageStartJd)'
        artifact['provenance']['catalogRepairGenerator']='scripts/repair_catalog_moon_ephemeris.py'
        ARTIFACT.write_text(json.dumps(artifact,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n')
    print('RESULT',len(candidates),'passing candidates;',len(failures),'explicit unresolved records',flush=True)
    return int(any(row['status']=='unrepaired' for row in failures))


if __name__=='__main__':
    raise SystemExit(main())
