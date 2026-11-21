import math, sys
AU=149597870.7
def disp(r,t):
    if t=='star': return math.sqrt(r)*0.00045
    if t in('planet','dwarf'): return max(0.008, math.sqrt(r)*0.00042)
    return max(0.00055, math.sqrt(r)*0.00018)
for n,r,t in [('mercury',2439.7,'planet'),('earth',6371,'planet'),('mars',3389.5,'planet'),('jupiter',69911,'planet'),('neptune',24622,'planet'),('ceres',469.7,'dwarf'),('sun',695700,'star')]:
    d=disp(r,t); print(f"{n:8s} real {r/AU:.3e} AU  display {d:.4f} AU = {d*AU:.3e} km  ratio {d/(r/AU):.0f}x")
# Moon: display clamp  max(2.5*real, min(base, 0.18*a))
r=1737.4; a=384400/AU; base=disp(r,'moon'); d=max(2.5*r/AU,min(base,0.18*a)); print('moon real',r/AU,'base',base,'clamped',d,'a',a)
off=disp(6371,'planet')-6371/AU
print('earth surface offset (moon drawn further out) AU',off,'km',off*AU,'; moon true dist AU',a,'drawn dist',a+off)
