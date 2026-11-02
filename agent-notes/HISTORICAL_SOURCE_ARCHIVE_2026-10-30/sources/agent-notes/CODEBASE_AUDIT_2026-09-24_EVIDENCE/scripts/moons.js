require('./b.cjs');const H=globalThis.__H;const hz=require(process.env.SP+'/hz/horizons_2026-09-24.json');
const raw=require(process.env.SP+'/wt/src/data/moons.json');
const cat=H.createSolarSystemCatalog(); const V=H.Vector3;
const lab=['J2000','+30d','+1yr','+5yr','2026-09-24','2050'];
const out=[];
function st(orbit,jd){const p=new V(),v=new V();H.propagateKeplerOrbit(orbit,jd-orbit.epochJd,p,v);return [p,v];}
const AU=149597870.7,DAY=86400;
console.log('moon       eph         frame     a(km)       '+lab.map(l=>l.padStart(10)).join('')+'  | gate-B best-case (today)');
for(const [name,o] of Object.entries(hz.moons)){
  const b=cat.bodies.find(x=>x.name===name); const r0=raw.find(x=>x.name===name);
  if(!b){console.log(name,'NOT IN CATALOG');continue;}
  const orb=b.orbit, B={...orb,secularRates:{...(orb.secularRates||{}),meanLongitudeDegPerCentury:360/orb.periodDays*36525}};
  const errs=o.recs.map((r)=>{const [p,v]=st(orb,r.jd);return {dr:Math.hypot(p.x*AU-r.x,p.y*AU-r.y,p.z*AU-r.z),
     dv:Math.hypot(v.x*AU/DAY-r.vx,v.y*AU/DAY-r.vy,v.z*AU/DAY-r.vz), rt:Math.hypot(r.x,r.y,r.z)};});
  const errsB=o.recs.map((r)=>{const [p]=st(B,r.jd);return Math.hypot(p.x*AU-r.x,p.y*AU-r.y,p.z*AU-r.z);});
  out.push({name,ephemeris:r0.ephemeris,frame:r0.frame,epochTdb:r0.epochTdb,aKm:r0.aKm,e:r0.e,
    epochs:lab,errKm:errs.map(x=>x.dr),errKmS:errs.map(x=>x.dv),rTrueKm:errs.map(x=>x.rt),gateErrKm:errsB});
  const f=x=>x>=1e5?(x/1e6).toFixed(2)+'M':x.toFixed(0);
  console.log(name.padEnd(10)+' '+r0.ephemeris.padEnd(11)+' '+r0.frame.padEnd(10)+String(r0.aKm).padStart(9)+'  '+
    errs.map(x=>f(x.dr).padStart(10)).join('')+'  | '+f(errsB[4]).padStart(8));
}
require('fs').writeFileSync(process.env.SP+'/out/moons_vs_horizons.json',JSON.stringify(out,null,1));
console.log('\nratio err/a at 2026-09-24 >= 0.5 (moon is >half an orbit radius off):');
console.log('  '+out.filter(m=>m.errKm[4]/m.aKm>=0.5).map(m=>`${m.name} ${(m.errKm[4]/m.aKm).toFixed(2)}`).join(', '));
console.log('bad AT ITS OWN ELEMENT EPOCH (J2000 err/a >= 0.5):  '+out.filter(m=>m.epochTdb.startsWith('2000')&&m.errKm[0]/m.aKm>=0.5).map(m=>`${m.name} ${(m.errKm[0]/m.aKm).toFixed(2)}`).join(', '));
