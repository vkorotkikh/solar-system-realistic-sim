import sys,time,tracemalloc,resource; sys.path.insert(0,'.')
from belts_reference import *
cat=load_catalog()
def best3(f,n=3):
    ts=[]
    for _ in range(n):
        t=time.perf_counter(); r=f(); ts.append(time.perf_counter()-t)
    return min(ts),r
print("CATALOG arrays bytes:", sum(v.nbytes for v in cat.values()))
for K in (1,16,64):
    jds=2461000.5+np.linspace(0,300,K)
    t,out=best3(lambda: propagate(cat,jds))
    tc,_=best3(lambda: propagate_chunked(cat,jds,10000))
    tracemalloc.start(); propagate(cat,jds); cur,peak=tracemalloc.get_traced_memory(); tracemalloc.stop()
    tracemalloc.start(); propagate_chunked(cat,jds,10000); cur2,peak2=tracemalloc.get_traced_memory(); tracemalloc.stop()
    print(f"K={K}: one-shot best {t*1e3:.0f} ms, out {out.nbytes/1e6:.1f} MB, peak traced {peak/1e6:.0f} MB | chunked(10k) best {tc*1e3:.0f} ms peak {peak2/1e6:.0f} MB (incl. output)")
print("maxrss MB", resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1e3)
# single-thread check
