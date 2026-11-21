import sys; sys.path.insert(0,'.')
from belts_reference import *
sys.path.insert(0, str(W/"backend"))
from data.bodies import ALL_BODIES
from mission.orbital import sample_body_state_from_elements
cat=load_catalog(); idx={int(i):k for k,i in enumerate(cat['id'])}
NUM={"ceres":1,"vesta":4,"pallas":2,"hygiea":10,"juno":3,"psyche":16,"eunomia":15,"europa52":52,"interamnia704":704,"davida511":511,"iris7":7,"hebe":6,"flora":8,"metis":9,"amphitrite":29,"euphrosyne":31,"cybele":65,"sylvia":87,"camilla":107}
nm=names([SPK_ASTEROID_BASE+n for n in NUM.values()])
BY={b['id']:b for b in ALL_BODIES}
jd=2461000.5
print("id  catalog_name  epoch_cat  epoch_bk  diff_km(at 2461000.5)  diff_km(at 2461200.5)  diff_km at 2459000.5")
for bid,num in NUM.items():
    k=idx.get(SPK_ASTEROID_BASE+num)
    if k is None: print(bid,"NOT IN CATALOG"); continue
    sub={kk:v[k:k+1] for kk,v in cat.items()}
    row=[]
    for j in (2461000.5,2461200.5,2459000.5):
        pc=propagate(sub,j)[0,0]; pb=np.array(sample_body_state_from_elements(BY[bid],j)['position'])
        row.append(np.linalg.norm(pc-pb)*AU_KM)
    print(bid,nm[SPK_ASTEROID_BASE+num],cat['epoch_jd'][k],BY[bid]['orbit']['epoch_jd'],*(f"{x:,.0f}" for x in row))
