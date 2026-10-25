// /tmp/solar-sweep-2026-10-10-j1gnowo_/trajectory replaced by run_frontend.py; offline numerical probe, no GPU claims.
import { solveKeplerFast, propagateKeplerOrbit } from '/tmp/solar-sweep-2026-10-10-j1gnowo_/trajectory/src/sim/orbitMath.ts';
import { PLANETS } from '/tmp/solar-sweep-2026-10-10-j1gnowo_/trajectory/src/data/planets.ts';
import { Vector3 } from '/tmp/solar-sweep-2026-10-10-j1gnowo_/trajectory/node_modules/three/build/three.module.js';
import { validatePackedCatalogRoundTrip100k } from '/tmp/solar-sweep-2026-10-10-j1gnowo_/trajectory/src/data/asteroidCatalogLoader.ts';
import { SGR_A, M87, G_CGS, C_CM_S, AU_CM } from '/tmp/solar-sweep-2026-10-10-j1gnowo_/trajectory/src/frontend/features/superluminal-modeling/smbhPhysicsConstants.ts';
import { SolarSystemModel } from '/tmp/solar-sweep-2026-10-10-j1gnowo_/trajectory/src/sim/solarSystemModel.ts';
import { createSolarSystemCatalog } from '/tmp/solar-sweep-2026-10-10-j1gnowo_/trajectory/src/sim/catalog.ts';
import { loadPhase1AsteroidCatalog } from '/tmp/solar-sweep-2026-10-10-j1gnowo_/trajectory/src/sim/phase1AsteroidCatalog.ts';
import { parseMoonEphemerisArtifact } from '/tmp/solar-sweep-2026-10-10-j1gnowo_/trajectory/src/sim/moonEphemeris.ts';
import { readFileSync } from 'node:fs';
let maxResidual=0,worstM=0;
for(let i=0;i<=10000;i++){const M=i/10000*Math.PI*2;const E=solveKeplerFast(M,.99);const r=Math.abs(E-.99*Math.sin(E)-M);if(r>maxResidual){maxResidual=r;worstM=M;}}
const derivatives=PLANETS.filter(p=>p.orbit.secularRates).map(p=>({id:p.id,epochs:[0,9775.12345,18262.5].map(t=>({elapsedDays:t,stepResults:[.01,.001,.0001].map(h=>{let pos=new Vector3(),v=new Vector3(),a=new Vector3(),b=new Vector3();propagateKeplerOrbit(p.orbit,t,pos,v);propagateKeplerOrbit(p.orbit,t-h,a);propagateKeplerOrbit(p.orbit,t+h,b);return {h,velocity_derivative_difference_m_s:b.sub(a).multiplyScalar(1/(2*h)).sub(v).length()*149597870700/86400};})}))}));
const model=new SolarSystemModel({bodies:PLANETS.map(p=>({id:p.id,orbit:p.orbit}))});model.update(2461320);const before=model.getWorldPosition('earth');model.applyMetricKinematics(new Vector3(1,0,0),1,()=>1e-12,1e21,1e12);const after=model.getWorldPosition('earth');const sampled=model.sampleBodyStateAt('earth',2461320);
globalThis.fetch=async(url)=>{let p='/tmp/solar-sweep-2026-10-10-j1gnowo_/trajectory/public'+String(url);const b=readFileSync(p);return new Response(b,{status:200});};
const cat=await loadPhase1AsteroidCatalog({maxRecords:100000});
const fits=parseMoonEphemerisArtifact(JSON.parse(readFileSync('/tmp/solar-sweep-2026-10-10-j1gnowo_/trajectory/src/data/moonEphemerisChebyshev.json','utf8')));
const fitted=createSolarSystemCatalog({moonEphemerides:fits.bodies});const moons=fitted.bodies.filter(b=>b.type==='moon');
const out={snapshot:'/tmp/solar-sweep-2026-10-10-j1gnowo_/trajectory',float32_jd:{jd:2461320.125,rounded:Math.fround(2461320.125),error_days:Math.fround(2461320.125)-2461320.125,ulp_days:Math.fround(2461320.25)-Math.fround(2461320)},acbf_roundtrip:validatePackedCatalogRoundTrip100k(),fast_kepler:{eccentricity:.99,max_residual_radians:maxResidual,mean_anomaly:worstM},schwarzschild:[SGR_A,M87].map(s=>({source:s.key,stored_cm:s.rSchwarzschildCm,stored_au:s.rSchwarzschildCm/AU_CM,from_local_G_M_c_cm:2*G_CGS*s.massG/(C_CM_S*C_CM_S),ratio:2*G_CGS*s.massG/(C_CM_S*C_CM_S*s.rSchwarzschildCm)})),secular_velocity_derivatives:derivatives,warp_canonical_state:{world_position_displacement_au:after.clone().sub(before).toArray(),world_versus_sample_au:after.clone().sub(sampled.position).toArray()},catalog_actual:{accepted:cat.accepted,loaded:cat.loadedCount,source:cat.sourceCount,sha:cat.checksumActual,eccentricity_max:Math.max(...cat.asteroids.map(a=>a.orbit.e)),epoch_distinct:[...new Set(cat.asteroids.map(a=>a.orbit.epochJd))].slice(0,30)},moons:{count:moons.length,fitted_count:moons.filter(m=>m.orbit.ephemeris).length,required_count:moons.filter(m=>m.orbit.ephemerisRequired).length,fits:Object.keys(fits.bodies)}};
console.log(JSON.stringify(out,null,2));
