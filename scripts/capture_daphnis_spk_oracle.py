"""Capture/reproduce the released legacy SAT393 Daphnis reference, not a new solution.

The 9216-byte public SPK contains three Cassini-fit precessing ellipses (type 17).
Its descriptor intervals, not SPKPVN's ability to extrapolate, select each state.
"""
from datetime import datetime, timezone
import argparse
import base64
import hashlib
import json
from pathlib import Path
import tempfile
import urllib.request

import numpy as np
import spiceypy as spice

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/satellites/sat393_daphnis.bsp'
DESTINATION = ROOT / 'backend/tests/fixtures/daphnis_legacy_spk_capture.json'
JDS = [2451545.,2451575.,2451725.,2451910.25,2453371.25,2460676.5,2461327.5]
AU_KM = 149597870.7


def evaluate(payload, jds=JDS):
    raw = base64.b64decode(payload['kernel_base64'],validate=True)
    if hashlib.sha256(raw).hexdigest() != payload['sha256']:
        raise ValueError('Kernel integrity failure')
    with tempfile.TemporaryDirectory(dir=ROOT/'node_modules/.cache/scn043') as tmp:
        path=Path(tmp)/'sat393_daphnis.bsp'
        path.write_bytes(raw)
        handle=spice.dafopr(str(path))
        try:
            spice.dafbfs(handle)
            segments=[]
            while spice.daffna():
                desc=spice.dafgs()
                dc,ic=spice.dafus(desc,2,6)
                if list(ic[:4]) != [635,699,1,17]:
                    raise ValueError('Unexpected Daphnis target/center/frame/type')
                segments.append((dc,desc))
            results=[]
            for jd in jds:
                et=(jd-2451545.)*86400.
                eligible=[desc for dc,desc in segments if dc[0] <= et <= dc[1]]
                if not eligible:
                    raise ValueError('Epoch outside all actual SPK descriptor intervals')
                frame,state,center=spice.spkpvn(handle,eligible[-1][:5],et)
                if center!=699 or frame!=1:
                    raise ValueError('Unexpected evaluated Daphnis frame/center')
                state=spice.sxform('J2000','ECLIPJ2000',et)@state
                results.append({'jd_tdb':float(jd),'position_au':(state[:3]/AU_KM).tolist(),
                                'velocity_au_per_day':(state[3:]*86400/AU_KM).tolist()})
            return results
        finally:
            spice.dafcls(handle)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture',action='store_true')
    args=parser.parse_args()
    if args.capture:
        with urllib.request.urlopen(URL,timeout=15) as response:
            raw=response.read(100001)
            modified=response.headers.get('Last-Modified')
        if len(raw)>100000:
            raise ValueError('Unexpected kernel size')
        payload={'provider':'NASA/JPL NAIF','source_quality':'legacy_Cassini_fit_precessing_ellipse_SPK_type17_not_current_numerical_solution',
            'url':URL,'retrieved_utc':datetime.now(timezone.utc).isoformat(),'last_modified':modified,
            'sha256':hashlib.sha256(raw).hexdigest(),'kernel_base64':base64.b64encode(raw).decode('ascii'),
            'kernel_bytes':len(raw),'target':635,'center':699,'frame':'ECLIPJ2000','time_scale':'TDB',
            'corrections':'NONE','position_units':'AU','velocity_units':'AU/day',
            'software':{'spiceypy':spice.__version__,'cspice':spice.tkvrsn('TOOLKIT')},
            'source_note':'Released 2016-10-11; three Cassini-imaging fits with data through 2016-07-16. Original comments and uncertainty estimates are retained in the embedded complete kernel. Not evidence of a new 2025/2026 observational solution.'}
        payload['states']=evaluate(payload)
        with DESTINATION.open('x') as output:
            json.dump(payload,output,indent=2); output.write('\n')
    else:
        payload=json.loads(DESTINATION.read_text())
        for expected,actual in zip(payload['states'],evaluate(payload),strict=True):
            assert expected['jd_tdb']==actual['jd_tdb']
            np.testing.assert_allclose(actual['position_au'],expected['position_au'],rtol=1e-13,atol=1e-15)
            np.testing.assert_allclose(actual['velocity_au_per_day'],expected['velocity_au_per_day'],rtol=1e-13,atol=1e-15)
    print(json.dumps({'passed':True,'target':635,'samples':len(payload['states']),'kernelBytes':payload['kernel_bytes'],'sourceQuality':payload['source_quality']}))


if __name__=='__main__': main()
