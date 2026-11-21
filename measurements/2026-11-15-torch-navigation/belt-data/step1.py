import numpy as np, json, time, sys
W="<session-dir>/wt-c1"
p=W+"/public/data/asteroid-phase1/asteroid_phase1_main_100000.bin"
raw=open(p,'rb').read()
print(raw[:12], len(raw), (len(raw)-12)/88)
dt=np.dtype([('id','<u4'),('f','<f8',(10,)),('tax','u1'),('r','u1'),('r2','<u2')])
print(dt.itemsize)
a=np.frombuffer(raw,dtype=dt,offset=12)
print(a['f'][:3]); print(a['id'][:12]); 
f=a['f']
for i,n in enumerate("epoch a e i node w M per diam albedo".split()): print(n,f[:,i].min(),np.percentile(f[:,i],[1,50,99]),f[:,i].max())
print(set(a['r']),set(a['r2']), np.unique(a['tax']))
print(np.unique(f[:,0]))
print("sorted by diam desc", np.all(np.diff(f[:,8])<=0))
