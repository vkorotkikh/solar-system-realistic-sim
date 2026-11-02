require('./b2.cjs'); const A=globalThis.__A; const fs=require('fs');
const f=Math.fround, AU=149597870.7;
const buf=fs.readFileSync(process.env.SP+'/wt/public/data/asteroid-phase1/asteroid_phase1_main_100000.bin');
const ab=buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
const cat=A.readAsteroidCatalogBinary(ab); const recs=cat.records.slice(0,5000);
// faithful float32 port of beltRenderer.ts beginVertex (GLSL highp == IEEE binary32 on desktop GPUs)
const TWO_PI=f(6.283185307179586);
function gpu(r,jd){
  const a=f(r.aAu), e=f(Math.min(Math.max(f(r.e),0),0.999999)), i=f(r.iDeg*Math.PI/180), Om=f(r.ascendingNodeDeg*Math.PI/180);
  const w=f(r.argPeriapsisDeg*Math.PI/180), M0=f(r.meanAnomalyDeg*Math.PI/180), P=f(Math.max(f(r.periodDays),1)), ep=f(r.epochJd);
  const uJ=f(jd); const n=f(TWO_PI/P); const dt=f(uJ-ep);
  let M=f(M0+f(n*dt)); M=f(M-f(TWO_PI*Math.floor(M/TWO_PI))); if(M<0)M=f(M+TWO_PI);
  let E=M; for(let k=0;k<8;k++){const fn=f(f(E-f(e*f(Math.sin(E))))-M); const fp=f(1-f(e*f(Math.cos(E)))); E=f(E-f(fn/Math.max(fp,1e-6)));}
  const sq=f(Math.sqrt(Math.max(f(1-f(e*e)),1e-6))); const ox=f(a*f(f(Math.cos(E))-e)), oy=f(f(a*sq)*f(Math.sin(E)));
  const cO=f(Math.cos(Om)),sO=f(Math.sin(Om)),cw=f(Math.cos(w)),sw=f(Math.sin(w)),ci=f(Math.cos(i)),si=f(Math.sin(i));
  return [f(f(ox*f(f(cO*cw)-f(f(sO*sw)*ci)))+f(oy*f(f(-cO*sw)-f(f(sO*cw)*ci)))),
          f(f(ox*f(f(sO*cw)+f(f(cO*sw)*ci)))+f(oy*f(f(-sO*sw)+f(f(cO*cw)*ci)))),
          f(f(ox*f(sw*si))+f(oy*f(cw*si)))];
}
function cpu(r,jd){ const p=new A.Vector3(); A.propagateKeplerOrbit({epochJd:r.epochJd,aAu:r.aAu,e:r.e,iDeg:r.iDeg,ascendingNodeDeg:r.ascendingNodeDeg,
  argPeriapsisDeg:r.argPeriapsisDeg,meanAnomalyDeg:r.meanAnomalyDeg,periodDays:r.periodDays},jd-r.epochJd,p); return [p.x,p.y,p.z]; }
const res={};
for(const [lab,jd] of [['2026-09-24 00:00',2461307.5],['2026-09-24 03:00',2461307.625],['2026-09-24 05:59',2461307.7493],['2050',2469807.5],['2100',2488069.5]]){
  const e=recs.map(r=>{const g=gpu(r,jd),c=cpu(r,jd);return Math.hypot(g[0]-c[0],g[1]-c[1],g[2]-c[2])*AU;}).sort((x,y)=>x-y);
  res[lab]={p50:e[e.length>>1],p99:e[Math.floor(e.length*.99)],max:e.at(-1)};
  console.log(`GPU(float32) vs CPU(float64), 5000 real records @ ${lab.padEnd(17)} p50 ${e[e.length>>1].toFixed(0).padStart(8)} km  p99 ${e[Math.floor(e.length*.99)].toFixed(0).padStart(8)} km  max ${e.at(-1).toFixed(0).padStart(8)} km   fround(JD)-JD = ${((f(jd)-jd)*24).toFixed(2)} h`);
}
// temporal stepping: how often does the GPU clock uniform actually change at the default warp?
const warp=4, fps=60; let prev=f(2461307.5), changes=0, frames=600;
for(let k=1;k<=frames;k++){const u=f(2461307.5+k*warp/fps); if(u!==prev){changes++;prev=u;}}
console.log(`\nat the default 4 d/s warp and 60 fps, uJulianDate changes on ${changes}/${frames} frames (belt advances in ${(0.25).toFixed(2)}-day jumps)`);
fs.writeFileSync(process.env.SP+'/out/gpu_vs_cpu.json',JSON.stringify(res,null,1));
