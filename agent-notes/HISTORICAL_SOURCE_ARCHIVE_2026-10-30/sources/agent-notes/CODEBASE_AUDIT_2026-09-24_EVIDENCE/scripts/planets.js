require('./b.cjs'); const H=globalThis.__H;
const hz=require(process.env.SP+'/hz/horizons_2026-09-24.json');
const AU=149597870.7, DAY=86400;
const cat=H.createSolarSystemCatalog();
const model=new H.SolarSystemModel(cat);
const wc=H.buildModelWorkerCatalog(cat.bodies,{includeMoons:true});
globalThis.onmessage({data:{type:'init',catalog:wc,simStartJd:2451545.0,sequence:1}});
const idx=new Map(wc.bodies.map((b,i)=>[b.id,i]));
let seq=2; const rows=[]; let maxCpuWorker=0;
const label={2378496.5:'1800',2396758.5:'1850',2415020.5:'1900',2451545.0:'J2000',2461307.5:'2026-09-24',2469807.5:'2050',2488069.5:'2100',2524562.5:'2199-12'};
for(const [name,recs] of Object.entries(hz.planets_helio)){
  for(const r of recs){
    model.update(r.jd);
    const s=model.getState(name);
    globalThis.onmessage({data:{type:'tick',simState:{julianDate:r.jd,stepMs:16,metricState:null},sequence:seq++}});
    const wb=globalThis.__posted.at(-1).bodies, i=idx.get(name)*6;
    const cw=Math.hypot(s.worldPosition.x-wb[i],s.worldPosition.y-wb[i+1],s.worldPosition.z-wb[i+2])*AU;
    maxCpuWorker=Math.max(maxCpuWorker,cw);
    const p=s.relativePosition, v=s.relativeVelocity;
    const dr=Math.hypot(p.x-r.x,p.y-r.y,p.z-r.z)*AU, rr=Math.hypot(r.x,r.y,r.z)*AU;
    const dv=Math.hypot(v.x-r.vx,v.y-r.vy,v.z-r.vz)*AU/DAY, vv=Math.hypot(r.vx,r.vy,r.vz)*AU/DAY;
    // decompose into RTN
    const R=[r.x,r.y,r.z], V=[r.vx,r.vy,r.vz], d=[p.x-r.x,p.y-r.y,p.z-r.z].map(x=>x*AU);
    const n=a=>{const m=Math.hypot(...a);return a.map(x=>x/m)}, dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    const cr=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const rh=n(R), hh=n(cr(R,V)), th=cr(hh,rh);
    const lonArc=Math.atan2(dot(d,th),rr)*206264.806;
    rows.push({body:name,epoch:label[r.jd]||r.jd,jd:r.jd,drKm:dr,rel:dr/rr,dvKmS:dv,vrel:dv/vv,
      radialKm:dot(d,rh),alongKm:dot(d,th),normalKm:dot(d,hh),alongArcsec:lonArc});
  }
}
require('fs').writeFileSync(process.env.SP+'/out/planets_vs_horizons.json',JSON.stringify(rows,null,1));
console.log('max |CPU model - worker| over all 70 planet states:',maxCpuWorker.toExponential(3),'km');
const eps=['1800','1850','1900','J2000','2026-09-24','2050','2100','2199-12'];
console.log('\nposition error |dr| (km) — frontend CPU model == worker, vs Horizons (geometric, TDB)');
console.log('body     '+eps.map(e=>e.padStart(11)).join(''));
for(const b of Object.keys(hz.planets_helio)){
  console.log(b.padEnd(9)+eps.map(e=>{const x=rows.find(r=>r.body===b&&r.epoch===e);return x?(x.drKm>=1e5?x.drKm.toExponential(2):x.drKm.toFixed(0)).padStart(11):'  (no truth)';}).join(''));
}
console.log('\nvelocity error |dv| (m/s)');
for(const b of Object.keys(hz.planets_helio)){
  console.log(b.padEnd(9)+eps.map(e=>{const x=rows.find(r=>r.body===b&&r.epoch===e);return x?(x.dvKmS*1000).toFixed(2).padStart(11):'          -';}).join(''));
}
