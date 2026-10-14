#!/usr/bin/env python3
"""Reproducible geometric-vector fit for S2023_S38, including unbound osculating states.

Explicit --capture pins lossless provider vectors; normal operation is offline.
Neither fit grids nor model coefficients serve as the independent seven-date oracle.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import gzip
import json
from pathlib import Path
import re
from urllib.parse import urlencode, parse_qsl
import numpy as np
import repair_catalog_moon_ephemeris as fit
from generate_moon_repairs import encoded, publish, sha

INPUTS=fit.ROOT/'scripts/moon-vector-inputs/s2023_s38'
OUTPUT=fit.ROOT/'src/data/moonEphemerisS2023S38.json'
STEP=.5
DENSE_STEP=.0625
PARAMS={'format':'json','COMMAND':'65273','CENTER':'500@699','MAKE_EPHEM':'YES',
        'EPHEM_TYPE':'VECTORS','VEC_TABLE':'2','VEC_CORR':'NONE','OUT_UNITS':'KM-S',
        'REF_PLANE':'ECLIPTIC','REF_SYSTEM':'ICRF','TIME_TYPE':'TDB','CSV_FORMAT':'YES'}
GRIDS={'source':np.arange(fit.START-STEP+.0625,fit.END+STEP,STEP),
       'held':np.arange(fit.START+.3125,fit.END,STEP),
       'endpoints':np.array([fit.START,fit.END]),
       'hyperbolic':np.array([2451805.125])}


def parse_vectors(result, epochs):
    preamble=result.split('$$SOE')[0]
    required=[r'Target body name:\s*S2023_S38 \(65273\)\s*\{source: sat455_merged_DE440\}',
              r'Center body name:\s*Saturn \(699\)\s*\{source: sat455_merged_DE440\}',
              r'Center-site name:\s*BODY CENTER',r'Output units\s*:\s*KM-S',
              r'Output type\s*:\s*GEOMETRIC cartesian states',
              r'Reference frame\s*:\s*Ecliptic of J2000.0',r'JDTDB,']
    if any(re.search(pattern,preamble) is None for pattern in required):
        raise ValueError('Vector source identity, center, geometry, frame or units changed')
    lines=result.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines()
    rows=[]
    for line in lines:
        cells=[cell.strip() for cell in line.split(',')]
        if len(cells)!=9 or cells[-1]!='': raise ValueError('Unexpected vector table shape')
        rows.append([float(cells[0]),*[float(cell) for cell in cells[2:8]]])
    values=np.array(rows,dtype='<f8')
    if values.shape!=(len(epochs),7) or not np.isfinite(values).all() or not np.array_equal(values[:,0],epochs):
        raise ValueError('Incomplete, reordered or non-finite geometric vector grid')
    return values,preamble


def capture():
    cache=fit.CACHE/'exception-vectors'
    manifest={'schemaVersion':1,'targetId':'65273','centerId':'699','frame':'ECLIPJ2000',
              'timeScale':'TDB','sourceEphemeris':'sat455_merged_DE440',
              'encoding':'little-endian float64, row-major jdTdb,xKm,yKm,zKm,vxKmS,vyKmS,vzKmS',
              'normalization':'Lossless parsed provider values, not original HTTP bytes',
              'capturedAtUtc':datetime.now(timezone.utc).isoformat(),'sets':{}}
    for purpose,epochs in GRIDS.items():
        chunks=[]; requests=[]
        for offset in range(0,len(epochs),19000):
            batch=epochs[offset:offset+19000]
            params=dict(PARAMS)
            if purpose in ['endpoints','hyperbolic']:
                params.update(TLIST=' '.join(map(str,batch)),TLIST_TYPE='JD')
            else:
                params.update(START_TIME=f'JD{batch[0]}',STOP_TIME=f'JD{batch[-1]}',STEP_SIZE='12 h')
            result=fit.fetch_result(params,cache)
            values,header=parse_vectors(result,batch)
            chunks.append(values)
            key=sha(urlencode(params).encode('ascii'))
            raw=(cache/f'{key}.json').read_bytes()
            requests.append({'query':params,'encodedQuery':urlencode(params),'cacheKey':key,'rawResponseSha256':sha(raw),
                             'rawResponseBytes':len(raw),'providerHeader':header,
                             'rowsSha256':sha(values.tobytes()),'rowCount':len(values)})
            print('captured',purpose,len(values),'rows',flush=True)
        values=np.concatenate(chunks)
        raw=values.tobytes(); packed=gzip.compress(raw,mtime=0)
        name=f'{purpose}.f64.gz'
        publish(INPUTS/name,packed)
        manifest['sets'][purpose]={'path':name,'gzipSha256':sha(packed),'rowsSha256':sha(raw),
                                  'rowCount':len(values),'requests':requests}
    publish(INPUTS/'manifest.json',encoded(manifest))


def dense_grids(source):
    """Resolve each closest approach with 90-minute, disjoint phase grids."""
    radius=np.linalg.norm(source[:,1:4],axis=1)
    minima=np.flatnonzero((radius[1:-1]<radius[:-2])&(radius[1:-1]<radius[2:]))+1
    return {purpose:[np.arange(source[i,0]-16+offset,source[i,0]+16,DENSE_STEP) for i in minima]
            for purpose,offset in [('dense_source',.015625),('dense_held',.046875)]}


def capture_periapses():
    data,manifest=inputs(require_dense=False,require_audit=False)
    for purpose,windows in dense_grids(data['source']).items():
        chunks=[]; requests=[]
        for epochs in windows:
            params={**PARAMS,'START_TIME':f'JD{epochs[0]}','STOP_TIME':f'JD{epochs[-1]}','STEP_SIZE':'90 m'}
            result=fit.fetch_result(params,fit.CACHE/'exception-vectors')
            values,header=parse_vectors(result,epochs); chunks.append(values)
            key=sha(urlencode(params).encode('ascii'))
            raw=(fit.CACHE/'exception-vectors'/f'{key}.json').read_bytes()
            requests.append({'query':params,'encodedQuery':urlencode(params),'cacheKey':key,
                'rawResponseSha256':sha(raw),'rawResponseBytes':len(raw),'providerHeader':header,
                'rowsSha256':sha(values.tobytes()),'rowCount':len(values)})
        values=np.concatenate(chunks); raw=values.tobytes(); packed=gzip.compress(raw,mtime=0)
        name=f'{purpose}.f64.gz'; publish(INPUTS/name,packed)
        manifest['sets'][purpose]={'path':name,'gzipSha256':sha(packed),'rowsSha256':sha(raw),
                                  'rowCount':len(values),'requests':requests}
        print('captured',purpose,len(values),'rows in',len(windows),'bounded periapsis windows',flush=True)
    manifest['denseCapturedAtUtc']=datetime.now(timezone.utc).isoformat()
    publish(INPUTS/'manifest.json',encoded(manifest))


def audit_grids(source):
    windows=dense_grids(source)['dense_source']
    return [np.arange(fit.START+.201171875,fit.END,8.)] + [
        np.arange(window[0]-.0078125,window[-1],.25) for window in windows]


def capture_audit():
    data,manifest=inputs(require_audit=False)
    chunks=[]; requests=[]
    for epochs in audit_grids(data['source']):
        params={**PARAMS,'START_TIME':f'JD{epochs[0]}','STOP_TIME':f'JD{epochs[-1]}',
                'STEP_SIZE':f'{int((epochs[1]-epochs[0])*1440)} m'}
        result=fit.fetch_result(params,fit.CACHE/'exception-vectors')
        values,header=parse_vectors(result,epochs); chunks.append(values)
        key=sha(urlencode(params).encode('ascii'))
        raw=(fit.CACHE/'exception-vectors'/f'{key}.json').read_bytes()
        requests.append({'query':params,'encodedQuery':urlencode(params),'cacheKey':key,
            'rawResponseSha256':sha(raw),'rawResponseBytes':len(raw),'providerHeader':header,
            'rowsSha256':sha(values.tobytes()),'rowCount':len(values)})
    values=np.concatenate(chunks); raw=values.tobytes(); packed=gzip.compress(raw,mtime=0)
    publish(INPUTS/'audit.f64.gz',packed)
    manifest['sets']['audit']={'path':'audit.f64.gz','gzipSha256':sha(packed),'rowsSha256':sha(raw),
                              'rowCount':len(values),'requests':requests}
    manifest['auditCapturedAtUtc']=datetime.now(timezone.utc).isoformat()
    publish(INPUTS/'manifest.json',encoded(manifest))
    print('captured fresh audit',len(values),'states, never used to select fitting intervals',flush=True)


def inputs(require_dense=True,require_audit=True):
    manifest=json.loads((INPUTS/'manifest.json').read_bytes())
    if (manifest['targetId'],manifest['centerId'],manifest['frame'],manifest['timeScale'],manifest['sourceEphemeris']) != (
            '65273','699','ECLIPJ2000','TDB','sat455_merged_DE440'):
        raise ValueError('Pinned vector identity changed')
    result={}
    grids=list(GRIDS.items())
    for purpose,epochs in grids:
        entry=manifest['sets'][purpose]
        if entry['path']!=f'{purpose}.f64.gz': raise ValueError('Unexpected input path')
        packed=(INPUTS/entry['path']).read_bytes()
        if sha(packed)!=entry['gzipSha256']: raise ValueError('Pinned vector gzip checksum mismatch')
        raw=gzip.decompress(packed)
        if sha(raw)!=entry['rowsSha256']: raise ValueError('Pinned vector checksum mismatch')
        values=np.frombuffer(raw,dtype='<f8').reshape(-1,7)
        if len(values)!=entry['rowCount'] or not np.array_equal(values[:,0],epochs) or not np.isfinite(values).all():
            raise ValueError('Pinned vector epochs changed')
        cursor=0
        for request in entry['requests']:
            count=request['rowCount']; batch=values[cursor:cursor+count]
            if (dict(parse_qsl(request['encodedQuery']))!=request['query'] or
                    sha(request['encodedQuery'].encode('ascii'))!=request['cacheKey'] or
                    sha(batch.tobytes())!=request['rowsSha256']):
                raise ValueError('Pinned request or normalized chunk identity changed')
            if any(request['query'].get(k)!=v for k,v in PARAMS.items()):
                raise ValueError('Pinned geometric vector query changed')
            cursor+=count
        if cursor!=len(values): raise ValueError('Missing pinned source chunk')
        result[purpose]=values
        if purpose=='source' and require_dense:
            grids.extend((key,np.concatenate(windows)) for key,windows in dense_grids(values).items())
        if purpose=='source' and require_audit:
            grids.append(('audit',np.concatenate(audit_grids(values))))
    return result,manifest


def generate():
    data,manifest=inputs()
    moon=next(row for row in json.loads(fit.CATALOG.read_bytes()) if row['name']=='S2023_S38')
    reference=json.loads(fit.ORACLE.read_bytes())['bodies'][str(moon['id'])]
    oracle=np.array([[r['jd_tdb'],*(np.array(r['position_au'])*fit.AU_KM),
                     *(np.array(r['velocity_au_per_day'])*fit.AU_KM/fit.DAY)] for r in reference['states']])
    source=np.concatenate([data['source'],data['dense_source']])
    source=source[np.argsort(source[:,0])]
    truth=np.concatenate([data['held'],data['dense_held'],data['hyperbolic'],data['endpoints']])
    if set(source[:,0]) & set(np.concatenate([truth[:,0],oracle[:,0]])):
        raise ValueError('Training overlaps independent validation epochs')
    target=fit.original.Target('s2023_s38',moon['name'],'65273','500@699',moon['planet'],
        manifest['sourceEphemeris'],moon['periodDays'],DENSE_STEP,128,12,min(500.,.001*moon['aKm']),10.)
    edges=np.concatenate([np.arange(fit.START,fit.END,128.),[fit.END]])
    for iteration in range(14):
        body=fit.fit_cartesian_states(target,source[:,0],source[:,1:4],source[:,4:7],fit.END,128,segment_edges=edges)
        pp,pv=fit.predict(body,truth[:,0]); op,ov=fit.predict(body,oracle[:,0])
        pe=np.linalg.norm(pp-truth[:,1:4],axis=1); ve=np.linalg.norm(pv-truth[:,4:7],axis=1)*1000
        ope=np.linalg.norm(op-oracle[:,1:4],axis=1); ove=np.linalg.norm(ov-oracle[:,4:7],axis=1)*1000
        print('S2023_S38 adaptive',iteration,len(edges)-1,'segments; heldout/oracle max km,m/s',pe.max(),ve.max(),ope.max(),ove.max(),flush=True)
        if max(pe.max(),ope.max())>target.max_position_error_km or max(ve.max(),ove.max())>10:
            failed=np.concatenate([truth[(pe>target.max_position_error_km*.5)|(ve>5),0],
                                   oracle[(ope>target.max_position_error_km*.5)|(ove>5),0]])
            indices=np.clip(np.searchsorted(edges,failed,side='right')-1,0,len(edges)-2)
            # Refine adjacent pieces too: the analytic blend depends on both.
            split=sorted({int(j) for i in indices for j in [i-1,i,i+1] if 0<=j<len(edges)-1})
            if any(edges[i+1]-edges[i]<DENSE_STEP*2 for i in split):
                raise RuntimeError('Periapsis source needs further independent resolution')
            edges=np.sort(np.concatenate([edges,[(edges[i]+edges[i+1])/2 for i in split]]))
            continue
        audit=data['audit']
        if set(audit[:,0]) & set(np.concatenate([source[:,0],truth[:,0],oracle[:,0]])):
            raise ValueError('Fresh cross-validation epochs overlap selection or training grids')
        ap,av=fit.predict(body,audit[:,0])
        ape=np.linalg.norm(ap-audit[:,1:4],axis=1); ave=np.linalg.norm(av-audit[:,4:7],axis=1)*1000
        print('fresh audit max km,m/s',ape.max(),ave.max(),flush=True)
        if ape.max()>target.max_position_error_km or ave.max()>10:
            raise RuntimeError('Independent post-selection cross-validation failed')
        body.update(name=moon['name'],targetId='65273',sourceRowCount=len(source),
                    sourceRowsSha256=sha(source.tobytes()),heldOutRowsSha256=sha(truth[:-2].tobytes()))
        body['provenance']={'source':'NASA/JPL Horizons API','sourceEphemeris':manifest['sourceEphemeris'],
            'targetId':'65273','centerId':'699','frame':'ECLIPJ2000','timeScale':'TDB',
            'generatedAt':manifest['auditCapturedAtUtc'],'generator':'scripts/generate_s2023_s38_ephemeris.py',
            'query':json.dumps({'queries':[r['query'] for e in manifest['sets'].values() for r in e['requests']],
                                'manifestSha256':sha((INPUTS/'manifest.json').read_bytes())},sort_keys=True)}
        body['sourceDomain']={'kind':'geometric Cartesian states; no elliptic-conic assumption',
            'coverageJd':[fit.START,fit.END],'hyperbolicOsculationProbeJd':2451805.125,
            'baseSourceStepDays':STEP,'periapsisSourceStepDays':DENSE_STEP,'periapsisWindowCount':36,
            'interpretation':'Positive instantaneous two-body energy is permitted; not evidence of permanent escape in the perturbed N-body trajectory'}
        body['validation']={'method':'Disjoint half-step VECTORS, exact endpoints, hyperbolic-osculation epoch and separate seven-date vector oracle',
            'sampleCount':len(truth),'heldOutSampleCount':len(truth)-2,'coverageEndpointSampleCount':2,
            'trainingDisjointFromValidation':True,
            'coverageEndpointErrors':[{'jdTdb':float(t),'positionErrorKm':float(p),'velocityErrorMPerS':float(v)}
                                     for t,p,v in zip(truth[-2:,0],pe[-2:],ve[-2:])],
            'accuracyLimits':{'positionKm':target.max_position_error_km,'velocityMPerS':10.},
            'positionErrorKm':fit.stats(pe),'velocityErrorMPerS':fit.stats(ve),
            'vectorOracle':{'sampleCount':len(oracle),'positionErrorKm':fit.stats(ope),'velocityErrorMPerS':fit.stats(ove)},
            'postSelectionCrossValidation':{'sampleCount':len(audit),'rowsSha256':sha(audit.tobytes()),
                'usedForFitOrSubdivision':False,'positionErrorKm':fit.stats(ape),'velocityErrorMPerS':fit.stats(ave)},
            'boundaryContinuity':{'runtimeStateContinuous':True,'method':'analytic derivative of smooth Cartesian cross-fade'}}
        return body
    raise RuntimeError('Fixed S2023_S38 scientific budgets not met')


def artifact(body):
    return {'schemaVersion':2,'kind':'horizons-chebyshev-mixed-v2','coverageTimeScale':'TDB',
            'referenceFrame':'Ecliptic of J2000.0 (ICRF)','featureOrder':list(fit.original.FEATURE_ORDER),
            'bodies':{'s2023_s38':body}}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture',action='store_true')
    parser.add_argument('--capture-periapses',action='store_true')
    parser.add_argument('--capture-audit',action='store_true')
    parser.add_argument('--offline',action='store_true')
    mode=parser.add_mutually_exclusive_group(); mode.add_argument('--check',action='store_true'); mode.add_argument('--write',action='store_true')
    parser.add_argument('--cache-candidate',action='store_true')
    args=parser.parse_args()
    if (args.capture or args.capture_periapses or args.capture_audit) and args.offline: parser.error('capture and --offline are incompatible')
    if args.capture: capture()
    if args.capture_periapses: capture_periapses()
    if args.capture_audit: capture_audit()
    body=generate(); raw=encoded(artifact(body))
    if args.check:
        if OUTPUT.read_bytes()!=raw: raise ValueError('S2023_S38 artifact differs')
        print('byte-identical',OUTPUT)
    if args.write: publish(OUTPUT,raw); print('wrote',OUTPUT,len(raw),'bytes')
    if args.cache_candidate: publish(fit.CACHE/'s2023_s38.model.json',encoded(body))

if __name__=='__main__': main()
