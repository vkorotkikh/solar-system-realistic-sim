#!/usr/bin/env python3
"""Pin original provider rows and reproducibly publish 410 lazy moon model shards.

--pin-from-cache audits existing response envelopes without acquisition. Normal
--check/--write are pure offline fits from committed, lossless input archives.
Original 13 model artifacts are read-only and guarded by their reviewed hashes.
"""
from __future__ import annotations
import argparse
from dataclasses import asdict
import json
import lzma
import math
from pathlib import Path
import re
from urllib.parse import urlencode, parse_qsl
import numpy as np
import repair_catalog_moon_ephemeris as fit
from generate_moon_repairs import encoded, publish, sha, ensure_disjoint
from catalog_sources import publish_directory

INPUTS=fit.ROOT/'scripts/moon-lazy-inputs'
OUTPUT=fit.ROOT/'public/moon-ephemerides'
PURPOSES=('source','held','endpoints')
MAX_INPUT_BYTES=32*1024*1024
BASE_HASHES={
 'moonEphemerisChebyshev.json':'9331771c6ae51983c21efcea2bb07191055c2d7891db5f702006487f54e0b9f4',
 'moonEphemerisRepairs.json':'397bb3789bc055ffc3cb58a57f51557025a0109ed14af3fb01e8f6da040c76ff',
 'moonEphemerisSpkRepairs.json':'b3f2cff1db399908475129505dea7e317fada4c47f13e005aef95c66d79434f9',
 'moonEphemerisDaphnis.json':'d7709853c059884f20763ace6aacd50a34c38e26b924e20c9f5a6b943f02a7c8',
 'moonEphemerisS2023S38.json':'b3410184508f68eff0add063f4f7eb4f9a5ac349a61ecec8c6f324c39f06e1e8'}
QUALITY='Captured JPL numerical solution; interpolation limits are not observational uncertainties'


def layout():
    moons=json.loads(fit.CATALOG.read_bytes()); oracle=json.loads(fit.ORACLE.read_bytes())
    if len(moons)!=423 or len({m['id'] for m in moons})!=423 or len({(m['planet'],m['iauCode']) for m in moons})!=423: raise ValueError('Catalog denominator changed')
    base={}; artifacts=[]
    for name,digest in BASE_HASHES.items():
        raw=(fit.ROOT/'src/data'/name).read_bytes()
        if sha(raw)!=digest: raise ValueError(f'Reviewed base artifact changed: {name}')
        bodies=json.loads(raw)['bodies']
        if set(base)&set(bodies): raise ValueError('Duplicate base model')
        base.update(bodies); artifacts.append({'path':'src/data/'+name,'sha256':digest,'bytes':len(raw),'bodyKeys':sorted(bodies)})
    aliases={}
    for moon in moons:
        key=moon['name'].lower()
        if key not in base: aliases.setdefault(key,[]).append(moon)
    if len(base)!=13 or len(aliases)!=410 or sum(map(len,aliases.values()))!=410:
        raise ValueError('Expected 13 base records and 410 lazy records / 410 models')
    if any(len(rows)!=1 for rows in aliases.values()):
        raise ValueError('Unexpected shared-model identity')
    return moons,oracle,base,artifacts,aliases


def pack_groups(groups):
    arrays=[]
    for purpose in PURPOSES:
        a=np.asarray(groups[purpose],dtype='<f8')
        if a.ndim!=2 or a.shape[1]!=8 or len(a)==0 or not np.isfinite(a).all() or np.any(np.diff(a[:,0])<=0):
            raise ValueError('Invalid provider rows')
        arrays.append(a)
    values=np.concatenate(arrays)
    if values.nbytes>MAX_INPUT_BYTES: raise ValueError('Source archive exceeds bounded input size')
    return lzma.compress(np.ascontiguousarray(values.T).tobytes(),format=lzma.FORMAT_XZ,preset=6)


def unpack_groups(packed,counts):
    if set(counts)!=set(PURPOSES) or any(not isinstance(n,int) or n<=0 for n in counts.values()):
        raise ValueError('Invalid input group counts')
    count=sum(counts.values()); expected=count*64
    if expected>MAX_INPUT_BYTES or len(packed)>MAX_INPUT_BYTES: raise ValueError('Input size limit exceeded')
    try:
        decoder=lzma.LZMADecompressor(format=lzma.FORMAT_XZ,memlimit=64*1024*1024)
        raw=decoder.decompress(packed,max_length=expected+1)
    except lzma.LZMAError as error:
        raise ValueError('Corrupt pinned archive') from error
    if len(raw)!=expected or not decoder.eof or decoder.unused_data: raise ValueError('Truncated or oversized pinned archive')
    values=np.frombuffer(raw,dtype='<f8').reshape(8,count).T
    groups={}; offset=0
    for purpose in PURPOSES:
        rows=values[offset:offset+counts[purpose]]; offset+=counts[purpose]
        if not np.isfinite(rows).all() or np.any(np.diff(rows[:,0])<=0): raise ValueError('Invalid pinned rows')
        groups[purpose]=rows
    return groups


def read_recipe_inputs(directory,recipe):
    entry=recipe['input']; name=entry['file']
    if not re.fullmatch(r'[a-f0-9]{64}\.f64\.xz',name): raise ValueError('Invalid content-addressed input path')
    raw=(Path(directory)/name).read_bytes()
    if sha(raw)!=entry['sha256'] or name!=entry['sha256']+'.f64.xz' or len(raw)!=entry['bytes']:
        raise ValueError('Pinned input checksum/size mismatch')
    groups=unpack_groups(raw,entry['counts']); result={}
    for purpose,values in groups.items():
        rows=tuple(fit.original.ElementRow(*map(float,row)) for row in values)
        if fit.original._combined_rows_digest(rows)!=entry['rowDigests'][purpose]: raise ValueError('Pinned normalized row digest mismatch')
        result[purpose]=rows
    return result


def captured_query(target,params,epochs,cache,purpose):
    query=urlencode(params); key=sha(query.encode('ascii'))
    path=cache/'responses'/f'{key}.json'; raw=path.read_bytes(); payload=json.loads(raw)
    if payload.get('error') or payload.get('signature',{}).get('source')!='NASA/JPL Horizons API':
        raise ValueError('Unqualified provider response')
    parsed=fit.original._parse_query(target,payload['result'])
    if len(parsed.rows)!=len(epochs) or any(abs(row.jd-jd)>1e-9 for row,jd in zip(parsed.rows,epochs)):
        raise ValueError('Incomplete provider grid')
    evidence={'purpose':purpose,'query':params,'encodedQuery':query,'cacheKey':key,
        'cachedEnvelopeSha256':sha(raw),'cachedEnvelopeBytes':len(raw),'signature':payload['signature'],
        'providerPreamble':payload['result'].split('$$SOE')[0],
        'verifiedHeaders':{p:fit.original._header_value(payload['result'],p) for p in
            ['Target body name:','Center body name:','Reference frame :','Output units    :','Keplerian GM    :']},
        'rowCount':len(parsed.rows),'rowsSha256':fit.original._combined_rows_digest(parsed.rows)}
    return parsed.rows,parsed.central_gm_km3_s2,evidence


def capture_groups(target,cache):
    step=target.source_step_days; groups={}; evidence=[]; gm=None
    for purpose,start,end in [('source',fit.START-step+.125,fit.END+step+.125),
                              ('held',fit.START+.125+step/2,fit.END-.125)]:
        collected=[]
        while start<=end+1e-9:
            stop=min(end,start+step*19999)
            epochs=[start+i*step for i in range(math.floor((stop-start)/step+1e-9)+1)]
            rows,value,record=captured_query(target,fit.original._query_params(target,start,stop,step),epochs,cache,purpose)
            if gm is not None and value!=gm: raise ValueError('Provider GM changed within input set')
            gm=value; collected.extend(rows); evidence.append(record); start=rows[-1].jd+step
        groups[purpose]=tuple(collected)
    params=fit.original._query_params(target,fit.START,fit.END,step)
    for field in ['START_TIME','STOP_TIME','STEP_SIZE']: del params[field]
    params.update(TLIST=f'{fit.START} {fit.END}',TLIST_TYPE='JD')
    groups['endpoints'],value,record=captured_query(target,params,[fit.START,fit.END],cache,'endpoints')
    if value!=gm: raise ValueError('Endpoint provider GM differs')
    evidence.append(record)
    return groups,gm,evidence


def pin_inputs(directory=INPUTS,cache=fit.CACHE):
    _,oracle,_,_,aliases=layout()
    manifest={'schemaVersion':1,'complete':False,'encoding':'XZ compressed column-major little-endian float64',
              'fields':list(fit.original.ElementRow.__dataclass_fields__),
              'qualification':'Lossless parsed provider rows; cached envelope hashes are not HTTP transfer hashes',
              'bodies':{}}
    previous=directory/'manifest.json'
    if previous.exists():
        old=json.loads(previous.read_bytes())
        if old['schemaVersion']!=1 or not set(old['bodies']).issubset(aliases): raise ValueError('Unexpected prior pin manifest')
        manifest['bodies']=old['bodies']
    for index,(key,records) in enumerate(sorted(aliases.items()),1):
        candidate_raw=(cache/f'{fit.quote(key,safe="")}.model.json').read_bytes(); candidate=json.loads(candidate_raw)
        if key in manifest['bodies'] and manifest['bodies'][key]['candidateSha256']==sha(candidate_raw):
            prior=manifest['bodies'][key]['input']; packed=(directory/prior['file']).read_bytes()
            if sha(packed)!=prior['sha256']: raise ValueError('Previously pinned input changed')
            continue
        moon=records[0]; reference=oracle['bodies'][str(moon['id'])]
        source_name=reference['headers']['Target body name'].split(':',1)[1].split('(')[0].strip()
        cap=min(500.,*(.001*m['aKm'] for m in records))
        target=fit.original.Target(key,source_name,str(moon['iauCode']),reference['query']['CENTER'],moon['planet'],
            candidate['provenance']['sourceEphemeris'],moon['periodDays'],candidate['sourceStepDays'],
            (fit.END-fit.START)/len(candidate['segments']),len(candidate['segments'][0]['coefficients'][0])-1,cap,10.)
        groups,gm,evidence=capture_groups(target,cache)
        captured_hash=fit.original._combined_rows_digest(groups['source'])
        reserved={fit.START,fit.END,*[s['jd_tdb'] for m in records for s in oracle['bodies'][str(m['id'])]['states']]}
        removed=[row.jd for row in groups['source'] if row.jd in reserved]
        groups['source']=tuple(row for row in groups['source'] if row.jd not in reserved)
        for purpose,field in [('source','sourceRowsSha256'),('held','heldOutRowsSha256')]:
            if fit.original._combined_rows_digest(groups[purpose])!=candidate[field]:
                raise ValueError(f'{key}: original candidate {purpose} identity not reproduced')
        if captured_hash!=candidate.get('capturedSourceRowsSha256',captured_hash) or gm!=candidate['centralGmKm3S2']:
            raise ValueError(f'{key}: captured input identity changed')
        for m in records: ensure_disjoint(groups['source'],groups['held'],groups['endpoints'],oracle['bodies'][str(m['id'])]['states'])
        arrays={p:np.asarray([list(asdict(r).values()) for r in rows],dtype='<f8') for p,rows in groups.items()}
        packed=pack_groups(arrays); digest=sha(packed); name=digest+'.f64.xz'; publish(directory/name,packed)
        manifest['bodies'][key]={'target':asdict(target),'catalogIds':[m['id'] for m in records],
            'segmentCount':len(candidate['segments']),'centralGmKm3S2':gm,'candidateSha256':sha(candidate_raw),
            'generatedAt':candidate['provenance']['generatedAt'],
            'captureTimeQualification':'Recorded candidate generation is an acquisition upper bound, not HTTP retrieval time',
            'capturedSourceRowsSha256':captured_hash,'excludedTrainingEpochs':removed,'originalResponses':evidence,
            'input':{'file':name,'sha256':digest,'bytes':len(packed),'counts':{p:len(rows) for p,rows in groups.items()},
                     'rowDigests':{p:fit.original._combined_rows_digest(rows) for p,rows in groups.items()}}}
        print(f'pin {index}/410 {key}: {len(packed)} bytes',flush=True)
        if index%20==0: publish(previous,encoded(manifest))
    if set(manifest['bodies'])!=set(aliases): raise ValueError('Incomplete pin set')
    manifest['complete']=True; publish(previous,encoded(manifest))
    print('complete lossless source pin set',sum(r['input']['bytes'] for r in manifest['bodies'].values()),'bytes',flush=True)


def generate_one(key,recipe,directory,records,oracle):
    target=fit.original.Target(**recipe['target']); ceiling=min(500.,*(.001*m['aKm'] for m in records))
    cap=target.max_position_error_km
    if (recipe['catalogIds']!=[m['id'] for m in records] or target.body_id!=key or
            not 0 < cap <= ceiling or target.max_velocity_error_m_per_s!=10 or
            any(str(m['iauCode'])!=target.command or m['planet']!=target.center_name for m in records)):
        raise ValueError('Catalog identity or fixed cap changed')
    for evidence in recipe['originalResponses']:
        query=evidence['encodedQuery']; params=evidence['query']
        if dict(parse_qsl(query))!=params or sha(query.encode('ascii'))!=evidence['cacheKey']:
            raise ValueError('Original query identity changed')
        if params['COMMAND'].strip("'")!=target.command or params['CENTER'].strip("'")!=target.center:
            raise ValueError('Original target/center query changed')
    groups=read_recipe_inputs(directory,recipe); source,held,endpoints=[groups[p] for p in PURPOSES]
    if [r.jd for r in endpoints]!=[fit.START,fit.END]: raise ValueError('Missing exact coverage endpoints')
    references=[]
    for moon in records:
        reference=oracle['bodies'][str(moon['id'])]
        if reference['query']['COMMAND']!=target.command or reference['query']['CENTER']!=target.center or len(reference['states'])!=7:
            raise ValueError('Independent Cartesian reference identity changed')
        ensure_disjoint(source,held,endpoints,reference['states']); references.extend(reference['states'])
    span=float(np.nextafter((fit.END-fit.START)/recipe['segmentCount'],np.inf))
    body=fit.fit_cartesian_model(target,source,fit.END,span)
    times=np.array([r.jd for r in (*held,*endpoints)])
    truth_p,truth_v=fit.state_from_features(fit.features((*held,*endpoints),target.nominal_period_days)[:,1:])
    p,v=fit.predict(body,times); pe=np.linalg.norm(p-truth_p,axis=1); ve=np.linalg.norm(v-truth_v,axis=1)*1000
    ot=np.array([r['jd_tdb'] for r in references]); op=np.array([r['position_au'] for r in references])*fit.AU_KM
    ov=np.array([r['velocity_au_per_day'] for r in references])*fit.AU_KM/fit.DAY
    pp,pv=fit.predict(body,ot); ope=np.linalg.norm(pp-op,axis=1); ove=np.linalg.norm(pv-ov,axis=1)*1000
    if max(pe.max(),ope.max())>cap or max(ve.max(),ove.max())>10: raise ValueError(f'{key}: fixed independent accuracy gate failed')
    body.update(name=records[0]['name'],targetId=target.command,centralGmKm3S2=recipe['centralGmKm3S2'],
        sourceRowsSha256=recipe['input']['rowDigests']['source'],heldOutRowsSha256=recipe['input']['rowDigests']['held'],
        sourceRowCount=len(source),sourceGridStartJd=source[0].jd,sourceGridEndJd=source[-1].jd,
        capturedSourceRowsSha256=recipe['capturedSourceRowsSha256'],excludedTrainingEpochs=recipe['excludedTrainingEpochs'])
    body['provenance']={'source':'NASA/JPL Horizons API','sourceEphemeris':target.expected_ephemeris,
        'targetId':target.command,'centerId':target.center.split('@')[1],'frame':'ECLIPJ2000','timeScale':'TDB',
        'generatedAt':recipe['generatedAt'],'generator':'scripts/generate_moon_lazy_ephemerides.py',
        'normalizedInputSha256':recipe['input']['sha256'],'recipeSha256':sha(encoded(recipe)),
        'captureTimeQualification':recipe['captureTimeQualification'],
        'query':json.dumps([e['query'] for e in recipe['originalResponses']],sort_keys=True)}
    body['sourceDomain']={'kind':QUALITY,'coverageJd':[fit.START,fit.END]}
    body['validation']={'method':'Disjoint provider half-steps and exact endpoints plus seven independent Cartesian states for every catalog alias',
        'sampleCount':len(times),'heldOutSampleCount':len(held),'coverageEndpointSampleCount':2,'trainingDisjointFromValidation':True,
        'coverageEndpointErrors':[{'jdTdb':float(t),'positionErrorKm':float(e),'velocityErrorMPerS':float(ev)} for t,e,ev in zip(times[-2:],pe[-2:],ve[-2:])],
        'accuracyLimits':{'positionKm':cap,'velocityMPerS':10.},'positionErrorKm':fit.stats(pe),'velocityErrorMPerS':fit.stats(ve),
        'vectorOracle':{'sampleCount':len(references),'catalogIds':recipe['catalogIds'],'positionErrorKm':fit.stats(ope),'velocityErrorMPerS':fit.stats(ove)},
        'boundaryContinuity':{'runtimeStateContinuous':True,'method':'analytic derivative of smooth Cartesian cross-fade'}}
    return body


def build(directory=INPUTS,output=OUTPUT,write=False):
    moons,oracle,base,artifacts,aliases=layout(); manifest_raw=(directory/'manifest.json').read_bytes(); pinned=json.loads(manifest_raw)
    if (pinned['schemaVersion']!=1 or pinned['complete'] is not True or set(pinned['bodies'])!=set(aliases) or
            pinned['fields']!=list(fit.original.ElementRow.__dataclass_fields__)):
        raise ValueError('Incomplete or incompatible pinned 410-model source set')
    index={'schemaVersion':1,'kind':'moon-ephemeris-shards-v1','catalogRecordCount':423,'lazyRecordCount':410,
           'lazyModelCount':410,'baseArtifacts':artifacts,'sourceInputManifestSha256':sha(manifest_raw),'records':[],'bodies':{}}
    pending=[]; raw_total=0
    for n,(key,records) in enumerate(sorted(aliases.items()),1):
        body=generate_one(key,pinned['bodies'][key],directory,records,oracle)
        artifact={'schemaVersion':2,'kind':'horizons-chebyshev-mixed-v2','coverageTimeScale':'TDB',
            'referenceFrame':'Ecliptic of J2000.0 (ICRF)','featureOrder':list(fit.original.FEATURE_ORDER),'bodies':{key:body}}
        raw=encoded(artifact); digest=sha(raw); name=digest+'.json'
        if len(raw)>2*1024*1024: raise ValueError(f'{key}: shard exceeds 2 MiB request budget')
        if write: pending.append((name,raw))
        elif (output/name).read_bytes()!=raw: raise ValueError(f'{key}: published shard differs')
        raw_total+=len(raw)
        index['bodies'][key]={'path':name,'sha256':digest,'bytes':len(raw),'catalogIds':[m['id'] for m in records],
            'targetId':body['provenance']['targetId'],'centerId':body['provenance']['centerId'],
            'coverageStartJd':fit.START,'coverageEndJd':fit.END,'accuracyLimits':body['validation']['accuracyLimits'],
            'sourceEphemeris':body['provenance']['sourceEphemeris'],'sourceQuality':QUALITY}
        print(f'{"build" if write else "check"} {n}/410 {key}: {len(raw)} bytes; fixed gates passed',flush=True)
    for moon in moons:
        key=moon['name'].lower(); entry=base.get(key); source=entry['provenance'] if entry else index['bodies'][key]
        index['records'].append({'catalogId':moon['id'],'key':key,'name':moon['name'],'parent':moon['planet'],
            'targetId':str(moon['iauCode']),'centerId':source['centerId'],'delivery':'base' if entry else 'lazy',
            'sourceQuality':entry.get('sourceDomain',{'kind':source['sourceEphemeris']}) if entry else QUALITY})
    raw=encoded(index)
    if len(raw)>1024*1024: raise ValueError('Lazy index exceeds 1 MiB budget')
    if write:
        publish_directory(output, {**dict(pending), 'manifest.json':raw}, preserve_existing=False)
    elif (output/'manifest.json').read_bytes()!=raw: raise ValueError('Published lazy index differs')
    expected={entry['path'] for entry in index['bodies'].values()}|{'manifest.json'}
    if {p.name for p in output.glob('*.json')}!=expected: raise ValueError('Unexpected or missing public shard files')
    print(json.dumps({'catalogRecords':423,'lazyRecords':410,'lazyShards':410,'manifestBytes':len(raw),
                      'shardBytes':raw_total,'offlineByteIdentical':not write}),flush=True)
    return index


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--pin-from-cache',action='store_true'); mode.add_argument('--write',action='store_true'); mode.add_argument('--check',action='store_true')
    parser.add_argument('--offline',action='store_true',help='All modes forbid acquisition; --pin-from-cache reads audited existing responses')
    parser.add_argument('--source-dir',type=Path,default=INPUTS); parser.add_argument('--output-dir',type=Path,default=OUTPUT)
    parser.add_argument('--cache-dir',type=Path,default=fit.CACHE)
    args=parser.parse_args()
    if args.pin_from_cache: pin_inputs(args.source_dir,args.cache_dir)
    else: build(args.source_dir,args.output_dir,args.write)

if __name__=='__main__': main()
