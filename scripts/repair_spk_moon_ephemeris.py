"""Fit the two identity/coverage exceptions from genuine, bounded native SPK inputs.

The seven vector-oracle epochs are NOT fitting inputs. 75052 uses clustered
source/validation windows to reuse type-2 records instead of downloading a kernel.
Daphnis uses the complete tiny legacy type-17 kernel, with its quality explicit.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import gzip
import json
import math
from pathlib import Path
import base64
import struct
import tempfile

import numpy as np
import spiceypy as spice

import repair_catalog_moon_ephemeris as fit
import capture_moon_spk_oracle as uranus
import capture_daphnis_spk_oracle as daphnis

CACHE=fit.CACHE
GM={635:3.793120623436167e7,75052:5.793951256527211e6}
GM_SOURCE='https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/gm_de440.tpc'
PINNED=fit.ROOT/'scripts/moon-spk-inputs'
OUTPUT=fit.ROOT/'src/data/moonEphemerisSpkRepairs.json'
OFFLINE=False


def element_rows(states,mu):
    rows=[]
    for row in states:
        jd=row['jd_tdb']
        state=np.array(row['position_au']+row['velocity_au_per_day'])*fit.AU_KM
        state[3:]/=fit.DAY
        elements=spice.oscelt(state,(jd-fit.START)*fit.DAY,mu)
        a=elements[0]/(1-elements[1])
        rows.append(fit.original.ElementRow(jd,float(elements[1]),float(np.rad2deg(elements[2])),
            float(np.rad2deg(elements[3])),float(np.rad2deg(elements[4])),
            float(np.rad2deg(np.sqrt(mu/a**3))*fit.DAY),float(np.rad2deg(elements[5])),float(a)))
    return rows


def digest(rows):
    return hashlib.sha256(json.dumps(rows,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def evaluate_captured_epochs(captured,epochs):
    """Evaluate new epochs only inside records whose original bytes are pinned."""
    ranges={entry['offset']:entry for entry in captured['ranges']}
    for jd in epochs:
        et=(jd-fit.START)*fit.DAY
        for target in [75052,799]:
            segment=next((s for s in reversed(captured['segments'])
                if s['target']==target and s['startEt']<=et<=s['endEt']),None)
            if segment is None:
                raise ValueError('Epoch outside captured descriptors')
            directory=ranges.get((segment['lastWord']-4)*8)
            if directory is None:
                raise ValueError('Missing original type-2 directory')
            initial,interval,size,count=struct.unpack('<dddd',base64.b64decode(directory['base64']))
            index=min(int(count)-1,max(0,math.floor((et-initial)/interval)))
            record=ranges.get((segment['firstWord']-1+index*int(size))*8)
            if record is None or record['length']!=int(size)*8:
                raise ValueError('Epoch requires uncaptured coefficient record')
            midpoint,radius=struct.unpack_from('<dd',base64.b64decode(record['base64']))
            if not radius>0 or not midpoint-radius<=et<=midpoint+radius:
                raise ValueError('Epoch outside captured coefficient interval')
    previous=uranus.JDS
    try:
        uranus.JDS=list(epochs)
        return uranus.evaluate({**captured,'jds':list(epochs)})
    finally:
        uranus.JDS=previous


def source_75052():
    step=16.
    centers=np.arange(fit.START-step+.125,fit.END+step,step)
    train=sorted(float(t+offset) for t in centers for offset in [-.015,-.005,.005,.015])
    held=sorted(float(t+8.05+offset) for t in centers for offset in [-.015,-.005,.005,.015]
                if fit.START < t+8.05+offset < fit.END)
    epochs=sorted(set(train+held+[fit.END]))
    cache=CACHE/'uranus_75052_fit_source_spk.json'
    uranus.JDS=epochs
    uranus.BYTE_BUDGET=4*1024*1024
    pin=PINNED/'75052.json.gz'
    if pin.exists():
        manifest=json.loads((PINNED/'manifest.json').read_bytes())
        raw=pin.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=manifest['gzipSha256']:
            raise ValueError('Pinned SPK input checksum mismatch')
        captured=json.loads(gzip.decompress(raw))
        if captured['jds']!=epochs: raise ValueError('Pinned native source epochs changed')
    elif cache.exists():
        captured=json.loads(cache.read_text())
        if captured['jds']!=epochs: raise ValueError('Cached native source epochs changed')
    else:
        if OFFLINE: raise FileNotFoundError('Missing pinned native fitting inputs')
        print('Capturing independent 75052 fitting windows:',len(epochs),'states; byte budget',uranus.BYTE_BUDGET,flush=True)
        captured=uranus.capture()
        cache.write_text(json.dumps(captured,separators=(',',':'))+'\n')
    print('75052 original SPK bytes:',captured['downloadedBytes'],flush=True)
    rows=evaluate_captured_epochs(captured,epochs)
    mapped={row['jdTdb']:{'jd_tdb':row['jdTdb'],'position_au':row['positionAu'],'velocity_au_per_day':row['velocityAuDay']} for row in rows}
    reference=json.loads((fit.ROOT/'backend/tests/fixtures/uranus_75052_spk_capture.json').read_text())
    oracle=[{'jd_tdb':row['jdTdb'],'position_au':row['positionAu'],'velocity_au_per_day':row['velocityAuDay']} for row in reference['states']]
    endpoints=[oracle[0],mapped[fit.END]]
    extra_epochs=[jd+.002 for jd in held]
    assert not set(extra_epochs)&set(train+[row['jd_tdb'] for row in endpoints+oracle])
    extra=[{'jd_tdb':row['jdTdb'],'position_au':row['positionAu'],'velocity_au_per_day':row['velocityAuDay']}
           for row in evaluate_captured_epochs(captured,extra_epochs)]
    return [mapped[t] for t in train],[mapped[t] for t in held]+extra,endpoints,oracle,step,{
        'source':'NASA/JPL NAIF SPK','sourceEphemeris':'URA184 part 2, native type 2',
        'capturedAtUtc':captured['capturedAtUtc'],
        'query':json.dumps({'url':uranus.URL,'sourceWindowStepDays':step,'sourceOffsetsDays':[-.015,-.005,.005,.015],
                           'heldOutWindowOffsetDays':8.05,'downloadedBytes':captured['downloadedBytes'],
                           'additionalHeldOutOffsetDays':.002,'additionalHeldOutSamples':len(extra),
                           'rangeManifestSha256':digest(captured['ranges']),'gmSource':GM_SOURCE},sort_keys=True)}


def source_daphnis():
    capture=json.loads(daphnis.DESTINATION.read_text())
    step=.5
    train=np.arange(fit.START-step+.125,fit.END+step+.125,step).tolist()
    held=np.arange(fit.START+.375,fit.END-.125,step).tolist()
    training=daphnis.evaluate(capture,train)
    withheld=daphnis.evaluate(capture,held)
    endpoints=daphnis.evaluate(capture,[fit.START,fit.END])
    original=json.loads(fit.ORACLE.read_text())
    old=next(row for row in original['bodies'].values() if row['name']=='Daphnis')
    known={row['jd_tdb']:row for row in old['states']}
    # Retain the more recent live Horizons values where they are available.
    oracle=[known.get(row['jd_tdb'],row) for row in capture['states']]
    return training,withheld,endpoints,oracle,step,{
        'source':'NASA/JPL NAIF SPK','sourceEphemeris':'SAT393 Daphnis, legacy Cassini-fit type 17',
        'capturedAtUtc':capture['retrieved_utc'],
        'query':json.dumps({'url':capture['url'],'sha256':capture['sha256'],'sourceGridStartJd':train[0],
                           'sourceGridEndJd':train[-1],'stepDays':step,'heldOutOffsetDays':step/2,
                           'sourceQuality':capture['source_quality'],'gmSource':GM_SOURCE},sort_keys=True)}


def generate(identifier):
    moons=json.loads(fit.CATALOG.read_text())
    moon=next(row for row in moons if int(row['iauCode'])==identifier)
    training,held,endpoints,oracle,step,provenance=(source_75052() if identifier==75052 else source_daphnis())
    rows=element_rows(training,GM[identifier])
    source_rows_hash=digest(training)
    held_hash=digest(held)
    center='799' if identifier==75052 else '699'
    target=fit.original.Target(moon['name'].lower(),moon['name'],str(identifier),'500@'+center,moon['planet'],
                              provenance['sourceEphemeris'],moon['periodDays'],step,512,
                              8 if identifier==75052 else 12,min(500.,.001*moon['aKm']),10.)
    # Sparse native windows cannot constrain degree-12 carrier amplitudes well.
    # A degree-8 fit is independently gated, without changing scientific caps.
    training_epochs={row['jd_tdb'] for row in training}
    if training_epochs & {row['jd_tdb'] for row in held+endpoints+oracle}:
        raise ValueError('Native fitting inputs overlap validation epochs')
    truth=held+endpoints
    times=np.array([row['jd_tdb'] for row in truth])
    p=np.array([row['position_au'] for row in truth])*fit.AU_KM
    v=np.array([row['velocity_au_per_day'] for row in truth])*fit.AU_KM/fit.DAY
    ot=np.array([row['jd_tdb'] for row in oracle])
    op=np.array([row['position_au'] for row in oracle])*fit.AU_KM
    ov=np.array([row['velocity_au_per_day'] for row in oracle])*fit.AU_KM/fit.DAY
    for span in [512.,256.,128.,64.,32.]:
        try: body=fit.fit_cartesian_model(target,rows,fit.END,span)
        except RuntimeError as error:
            print(moon['name'],span,str(error),flush=True); continue
        predicted_p,predicted_v=fit.predict(body,times)
        pe=np.linalg.norm(predicted_p-p,axis=1); ve=np.linalg.norm(predicted_v-v,axis=1)*1000
        pp,pv=fit.predict(body,ot)
        ope=np.linalg.norm(pp-op,axis=1); ove=np.linalg.norm(pv-ov,axis=1)*1000
        print(moon['name'],span,'heldout/endpoint max km,m/s',float(pe.max()),float(ve.max()),
              'vector oracle',float(ope.max()),float(ove.max()),flush=True)
        if max(pe.max(),ope.max())>target.max_position_error_km or max(ve.max(),ove.max())>10: continue
        body.update(name=moon['name'],targetId=str(identifier),sourceRowsSha256=source_rows_hash,
                    heldOutRowsSha256=held_hash,sourceRowCount=len(training),centralGmKm3S2=GM[identifier])
        body['provenance']={**provenance,'targetId':str(identifier),'centerId':center,'frame':'ECLIPJ2000',
            'timeScale':'TDB','generatedAt':provenance['capturedAtUtc'],'generator':'scripts/repair_spk_moon_ephemeris.py'}
        body['validation']={'method':'Disjoint native SPK input and held-out windows; exact endpoints and separate vector oracle; analytic trajectory derivatives',
            'sampleCount':len(truth),'heldOutSampleCount':len(held),'coverageEndpointSampleCount':2,
            'coverageEndpointErrors':[{'jdTdb':float(t),'positionErrorKm':float(e),'velocityErrorMPerS':float(ev)} for t,e,ev in zip(times[-2:],pe[-2:],ve[-2:])],
            'accuracyLimits':{'positionKm':target.max_position_error_km,'velocityMPerS':10.},
            'positionErrorKm':fit.stats(pe),'velocityErrorMPerS':fit.stats(ve),
            'vectorOracle':{'sampleCount':len(oracle),'positionErrorKm':fit.stats(ope),'velocityErrorMPerS':fit.stats(ove)},
            'boundaryContinuity':{'runtimeStateContinuous':True,'method':'analytic derivative of smooth cross-fade'}}
        (CACHE/f"{fit.quote(moon['name'].lower(),safe='')}.model.json").write_text(json.dumps(body,separators=(',',':'),allow_nan=False)+'\n')
        print('PASS',moon['name'],flush=True)
        return body
    raise RuntimeError('Native fitting candidate failed the fixed position/velocity budgets')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target',type=int,choices=[635,75052],required=True)
    parser.add_argument('--offline',action='store_true')
    mode=parser.add_mutually_exclusive_group()
    mode.add_argument('--write',action='store_true')
    mode.add_argument('--check',action='store_true')
    args=parser.parse_args()
    OFFLINE=args.offline
    CACHE.mkdir(parents=True,exist_ok=True)
    tempfile.tempdir=str(CACHE)
    body=generate(args.target)
    if args.write or args.check:
        from generate_moon_repairs import encoded,publish
        key=body['name'].lower()
        artifact={'schemaVersion':2,'kind':'horizons-chebyshev-mixed-v2',
            'coverageTimeScale':'TDB','referenceFrame':'Ecliptic of J2000.0 (ICRF)',
            'featureOrder':list(fit.original.FEATURE_ORDER),'bodies':{key:body}}
        raw=encoded(artifact)
        if args.check:
            if OUTPUT.read_bytes()!=raw: raise ValueError('Native repair artifact differs')
            print('byte-identical',OUTPUT)
        else:
            if OUTPUT.exists() and set(json.loads(OUTPUT.read_bytes())['bodies'])!={key}:
                raise ValueError('Refusing to replace a different native target set')
            publish(OUTPUT,raw)
            print('wrote',OUTPUT,len(raw),'bytes')
