"""Small independent runtime oracle, reproduced from pinned native/vector inputs."""
import argparse
import json
import numpy as np
import capture_daphnis_spk_oracle as daphnis
import repair_catalog_moon_ephemeris as fit
import repair_spk_moon_ephemeris as native
import generate_s2023_s38_ephemeris as vectors
from generate_moon_repairs import encoded, publish

OUTPUT=fit.ROOT/'backend/tests/fixtures/moon_exception_validation.json'


def build():
    capture=json.loads(daphnis.DESTINATION.read_bytes())
    epochs=np.linspace(fit.START+.071,fit.END-.071,257).tolist()
    epochs += [jd+offset for jd in native.DAPHNIS_HANDOFFS for offset in [-.1,-1e-6,0.,1e-6,.1]]
    epochs=sorted(set(epochs+[fit.START,fit.END]))
    source_times=set(np.arange(fit.START-.5+.125,fit.END+.5+.125,.5))
    if source_times.intersection(epochs): raise ValueError('Runtime oracle overlaps native fitting grid')
    states=daphnis.evaluate(capture,epochs)
    inputs,_=vectors.inputs()
    samples=np.concatenate([inputs['held'][::137],inputs['dense_held'][::31],inputs['hyperbolic'],inputs['endpoints']])
    source_times=set(np.concatenate([inputs['source'][:,0],inputs['dense_source'][:,0]]))
    if source_times.intersection(samples[:,0]): raise ValueError('Runtime oracle overlaps vector fitting grid')
    return {'description':'Independent held-out states, not fitting samples; Daphnis is the explicitly qualified legacy SPK',
            'frame':'ECLIPJ2000','timeScale':'TDB','bodies':{
                'daphnis':states,
                's2023_s38':[{'jd_tdb':float(row[0]),'position_au':(row[1:4]/fit.AU_KM).tolist(),
                             'velocity_au_per_day':(row[4:7]*fit.DAY/fit.AU_KM).tolist()} for row in samples]}}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--write',action='store_true'); mode.add_argument('--check',action='store_true')
    args=parser.parse_args(); raw=encoded(build())
    if args.write: publish(OUTPUT,raw)
    elif OUTPUT.read_bytes()!=raw: raise ValueError('Independent exception oracle differs')
    print('wrote' if args.write else 'byte-identical',OUTPUT,len(raw),'bytes')
