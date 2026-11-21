import sys; sys.path.insert(0,'.')
from belts_reference import *
sys.path.insert(0,str(W/"backend"))
from data.bodies import ALL_BODIES
cat=load_catalog(); a=cat['a_au']; q=a*(1-cat['e']); Q=a*(1+cat['e'])
print("a percentiles 0,1,5,25,50,75,95,99,100:",np.round(np.percentile(a,[0,1,5,25,50,75,95,99,100]),3))
print("q percentiles:",np.round(np.percentile(q,[0,1,50,99,100]),3)," Q percentiles:",np.round(np.percentile(Q,[0,1,50,99,100]),3))
lo,hi=2.06,3.28
print("frac a inside app belt [2.06,3.28]:",((a>=lo)&(a<=hi)).mean(), " below:",(a<lo).mean()," above:",(a>hi).mean())
print("frac a outside Kirkwood-free? count a<2.06:",(a<lo).sum(),"a>3.28:",(a>hi).sum())
for g,hw in [(2.065,.02),(2.502,.03),(2.825,.02),(2.958,.015),(3.279,.04)]:
    inn=(abs(a-g)<hw).sum(); 
    print(f"  Kirkwood gap {g}+-{hw}: {inn} catalog objects inside (frac {inn/len(a):.4f})")
# density within gap vs neighbours of equal width
for g,hw in [(2.502,.03),(2.825,.02)]:
    print("  neighbour band densities", ((abs(a-(g-3*hw))<hw).sum(), (abs(a-g)<hw).sum(), (abs(a-(g+3*hw))<hw).sum()))
print("e pct 50/95/99:",np.percentile(cat['e'],[50,95,99]),"i pct 50/95/99:",np.percentile(cat['i_deg'],[50,95,99]))
print("epoch counts:",{float(k):int(v) for k,v in zip(*np.unique(cat['epoch_jd'],return_counts=True)) if v>0 and k!=2461200.5}, "n at 2461200.5:",(cat['epoch_jd']==2461200.5).sum())
print("z (AU) at JD 2461000.5 percentiles |z|:")
p=propagate(cat,2461000.5)[0]; r=np.linalg.norm(p,axis=1)
print(" |z| 50/95/99/max",np.percentile(abs(p[:,2]),[50,95,99,100]).round(3),"r 1/50/99:",np.percentile(r,[0,1,50,99,100]).round(3))
print("\nBACKEND beyond 2 AU:")
for b in ALL_BODIES:
    o=b.get('orbit')
    if o and o['a_au']>=2.0: print(f"  {b['id']:14s} {b['type']:9s} a={o['a_au']:.3f} e={o['e']:.3f} i={o['i_deg']:.1f}")
