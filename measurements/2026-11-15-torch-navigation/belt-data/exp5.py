import sys,time,json,tracemalloc,subprocess; sys.path.insert(0,'.')
from belts_reference import *
def best3(f,n=5):
    ts=[]
    for _ in range(n):
        t=time.perf_counter(); r=f(); ts.append(time.perf_counter()-t)
    return min(ts),r
t,_=best3(lambda: BIN.read_bytes()); print(f"read 8.8 MB (warm cache): {t*1e3:.1f} ms")
t,cat=best3(load_catalog); print(f"read+decode to 10 float64 arrays + id + tax: {t*1e3:.1f} ms; arrays {sum(v.nbytes for v in cat.values())/1e6:.2f} MB")
tracemalloc.start(); c=load_catalog(); cur,peak=tracemalloc.get_traced_memory(); tracemalloc.stop(); print(f"tracemalloc after load {cur/1e6:.1f} MB, peak {peak/1e6:.1f} MB (raw bytes freed after decode)")
moons=W/"src/data/moons.json"
t,_=best3(lambda: json.loads(moons.read_text())); print(f"precedent moons.json {moons.stat().st_size/1e3:.0f} kB json.loads: {t*1e3:.1f} ms")
t,_=best3(lambda: np.frombuffer(BIN.read_bytes(),dtype=np.dtype([('id','<u4'),('f','<f8',(10,)),('tax','u1'),('r','u1'),('r2','<u2')]),offset=12)); print(f"read+frombuffer view only (zero-copy, no split): {t*1e3:.1f} ms")
# cold python process: import numpy + load
r=subprocess.run([sys.executable,"-B","-c","import time;t=time.perf_counter();import numpy;t1=time.perf_counter();import sys;sys.path.insert(0,'.');import belts_reference as b;t2=time.perf_counter();c=b.load_catalog();t3=time.perf_counter();print(f'import numpy {1e3*(t1-t):.0f} ms, import module {1e3*(t2-t1):.0f} ms (incl scipy? no: lazy), load {1e3*(t3-t2):.0f} ms')"],capture_output=True,text=True); print(r.stdout,r.stderr[-300:])
# float32 / compact derived form: what a screener needs
need=sum(cat[k].nbytes for k in ('a_au','e','i_deg','node_deg','argp_deg','M_deg','period_d','epoch_jd','id'))
print("bytes for elements+period+epoch+id only:",need/1e6,"MB")
# name table cost
t0=time.perf_counter(); n=names(cat['id'][:10]); print("names() from gz snapshot (8.8 MB gz, 100k rows json):",round(time.perf_counter()-t0,2),"s")
