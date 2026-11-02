"""Lambert cross-check against lamberthub (Izzo 2015, Gooding 1990). Needs results/lam_repo.json
(written by lam_repo_dump in this audit) and `pip install lamberthub` in a SEPARATE venv."""
import json, sys, numpy as np, warnings; warnings.filterwarnings("ignore")
from lamberthub import izzo2015, gooding1990
AU = 149597870.7; DAY = 86400.0; MU = 0.0002959122082855911*AU**3/DAY**2
for r in json.load(open(sys.argv[1])):
    if not r['v1']: print(r['case'], 'repo: no solution'); continue
    a = [np.linalg.norm(f(MU, np.array(r['r1'])*AU, np.array(r['r2'])*AU, r['tof']*DAY, M=0, prograde=r['prograde'], low_path=True,
         maxiter=200, atol=1e-12, rtol=1e-12)[0]-np.array(r['v1'])*AU/DAY)*1000 for f in (izzo2015, gooding1990)]
    print(f"{r['case']:16s} |dv1| Izzo {a[0]:.6f} m/s  Gooding {a[1]:.6f} m/s")
