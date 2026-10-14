"""Fit the two identity/coverage exceptions from genuine, bounded native SPK inputs.

The seven vector-oracle epochs are NOT fitting inputs. 75052 uses clustered
source/validation windows to reuse type-2 records instead of downloading a kernel.
Daphnis uses the complete tiny legacy type-17 kernel, with its quality explicit.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile

import numpy as np
import spiceypy as spice

import repair_catalog_moon_ephemeris as fit
import capture_moon_spk_oracle as uranus
import capture_daphnis_spk_oracle as daphnis

CACHE=fit.CACHE
GM={635:3.793120623436167e7,75052:5.793951256527211e6}
GM_SOURCE='https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/gm_de440.tpc'


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
    if cache.exists():
        captured=json.loads(cache.read_text())
        if captured['jds']!=epochs: raise ValueError('Cached native source epochs changed')
    else:
        print('Capturing independent 75052 fitting windows:',len(epochs),'states; byte budget',uranus.BYTE_BUDGET,flush=True)
        captured=uranus.capture()
        cache.write_text(json.dumps(captured,separators=(',',':'))+'\n')
    print('75052 original SPK bytes:',captured['downloadedBytes'],flush=True)
    rows=uranus.evaluate(captured)
    mapped={row['jdTdb']:{'jd_tdb':row['jdTdb'],'position_au':row['positionAu'],'velocity_au_per_day':row['velocityAuDay']} for row in rows}
    reference=json.loads((fit.ROOT/'backend/tests/fixtures/uranus_75052_spk_capture.json').read_text())
    oracle=[{'jd_tdb':row['jdTdb'],'position_au':row['positionAu'],'velocity_au_per_day':row['velocityAuDay']} for row in reference['states']]
    endpoints=[oracle[0],mapped[fit.END]]
    return [mapped[t] for t in train],[mapped[t] for t in held],endpoints,oracle,step,{
        'source':'NASA/JPL NAIF SPK','sourceEphemeris':'URA184 part 2, native type 2',
        'query':json.dumps({'url':uranus.URL,'sourceWindowStepDays':step,'sourceOffsetsDays':[-.015,-.005,.005,.015],
                           'heldOutWindowOffsetDays':8.05,'downloadedBytes':captured['downloadedBytes'],
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
                              provenance['sourceEphemeris'],moon['periodDays'],step,512,12,min(500.,.001*moon['aKm']),10.)
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
            'timeScale':'TDB','generatedAt':datetime.now(timezone.utc).isoformat(),'generator':'scripts/repair_spk_moon_ephemeris.py'}
        body['validation']={'method':'Disjoint native SPK input and held-out windows; exact endpoints and separate vector oracle; analytic trajectory derivatives',
            'sampleCount':len(truth),'heldOutSampleCount':len(held),'coverageEndpointSampleCount':2,
            'coverageEndpointErrors':[{'jdTdb':float(t),'positionErrorKm':float(e),'velocityErrorMPerS':float(ev)} for t,e,ev in zip(times[-2:],pe[-2:],ve[-2:])],
            'accuracyLimits':{'positionKm':target.max_position_error_km,'velocityMPerS':10.},
            'positionErrorKm':fit.stats(pe),'velocityErrorMPerS':fit.stats(ve),
            'vectorOracle':{'sampleCount':len(oracle),'positionErrorKm':fit.stats(ope),'velocityErrorMPerS':fit.stats(ove)},
            'boundaryContinuity':{'runtimeStateContinuous':True,'method':'analytic derivative of smooth cross-fade'}}
        (CACHE/f"{fit.quote(moon['name'].lower(),safe='')}.model.json").write_text(json.dumps(body,separators=(',',':'),allow_nan=False)+'\n')
        print('PASS',moon['name'],flush=True)
        return
    raise RuntimeError('Native fitting candidate failed the fixed position/velocity budgets')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target',type=int,choices=[635,75052],required=True)
    args=parser.parse_args()
    CACHE.mkdir(parents=True,exist_ok=True)
    tempfile.tempdir=str(CACHE)
    generate(args.target)
