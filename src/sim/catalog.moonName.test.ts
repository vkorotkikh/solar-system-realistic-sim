/// <reference types="node" />

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { test, vi } from 'vitest';
import { createSolarSystemCatalog, type CatalogBody, type RawMoonRecord, type SolarCatalog } from './catalog';
import { moonsByName } from './moonFrameCheck';
import { parseMoonEphemerisArtifact } from './moonEphemeris';

// MOON-NAME-SPELLING /qa 2026-10-24: runtime display with legacy identity/model contracts.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
// Source/model compatibility and synthetic fit attachment are not orbital certification.
interface AssessmentSample { status: string; positionErrorKm: number; velocityErrorMs: number }
interface AssessmentRecord {
 catalogId: number; name: string; parent: string; targetId: string;
 referenceStatus: string; samples: AssessmentSample[];
}
interface AssessmentOutput { expectedCatalogCount: number; records: AssessmentRecord[] }

const sha=(p: string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const assetHashes={
 'src/data/moons.json':'3fab19c00fd86b35bb262135eb048b4f0bd376d9dd8104da9416bb09bc96143a',
 'backend/tests/fixtures/all_moons_horizons_oracle.json':'71943bc60c7c542a8e4845c86cad2812382bd5d29a44db4e9af32f0f4ce8ad5c',
 'src/data/moonEphemerisChebyshev.json':'9331771c6ae51983c21efcea2bb07191055c2d7891db5f702006487f54e0b9f4',
 'src/data/moonEphemerisRepairs.json':'d65c466ce3fb84a46f15af89388abe34f0239df3382de4de59a9af3e6a8cb3d7',
 'src/data/moonEphemerisSpkRepairs.json':'b3f2cff1db399908475129505dea7e317fada4c47f13e005aef95c66d79434f9',
 'src/data/moonEphemerisDaphnis.json':'d7709853c059884f20763ace6aacd50a34c38e26b924e20c9f5a6b943f02a7c8',
 'src/data/moonEphemerisS2023S38.json':'b3410184508f68eff0add063f4f7eb4f9a5ac349a61ecec8c6f324c39f06e1e8',
};
const raw=JSON.parse(fs.readFileSync('src/data/moons.json') as unknown as string) as RawMoonRecord[];
const sourceRow=raw.find(row=>row.planet==='Jupiter'&&row.iauCode==='519')!;
const stableId='moon-jupiter-magaclite';
const selected=(catalog: SolarCatalog)=>catalog.bodies.find(body=>body.id===stableId)!;
async function createFixture(rows: readonly unknown[]): Promise<typeof createSolarSystemCatalog> {
 vi.resetModules();
 vi.doMock('../data/moons.json',()=>({default:rows}));
 try { return (await import('./catalog')).createSolarSystemCatalog; }
 finally { vi.doUnmock('../data/moons.json');vi.resetModules(); }
}
// Only the nonphysical identity code differs: raw name, ID, epoch, physical and
// provenance inputs are identical. This detects accidental radius/name-hash changes.
const controlRaw=raw.map(row=>row===sourceRow?{...row,iauCode:'owned-nonmatching-519'}:row);
const createControl=await createFixture(controlRaw);
const catalogs=new Map([false,true].map(visible=>[visible,createSolarSystemCatalog({moonsVisible:visible})]));
const omitTargetDisplay=(catalog: SolarCatalog)=>({...catalog,bodies:catalog.bodies.map(body=>{
 if(body.id!==stableId)return body;
 const {name,...unchanged}=body;return unchanged;
})});
const actual=selected(catalogs.get(false)!);
const canonicalBody={...actual,name:'Megaclite'};
const minimalCatalog=(bodies: readonly unknown[]): SolarCatalog=>({bodies:bodies as CatalogBody[],jumpBodyIds:[],plannerBodyIds:[]});

test('control raw424/oracle/five fit assets keep exact source bytes',()=>{
 assert.equal(raw.length,424);
 assert.equal(sourceRow.name,'Magaclite');
 assert.equal(sourceRow.id,21);
 for(const [path,expected]of Object.entries(assetHashes))assert.equal(sha(path),expected,path);
 const oracle=JSON.parse(fs.readFileSync('backend/tests/fixtures/all_moons_horizons_oracle.json') as unknown as string);
 assert.equal(oracle.bodies['21'].name,'Magaclite');
 assert.match(JSON.stringify(oracle.bodies['21']),/Target body name[^\n]*Megaclite \(519\)/);
});

for(const visible of [false,true]) {
 test(`control post-Puck runtime counts and legacy ID remain: visible=${visible}`,()=>{
  const catalog=catalogs.get(visible)!;
  assert.equal(catalog.bodies.length,433);
  assert.equal(catalog.bodies.filter(body=>body.type==='moon').length,423);
  assert.equal(new Set(catalog.bodies.map(body=>body.id)).size,433);
  assert.equal(selected(catalog).parentId,'jupiter');
  assert.equal(catalog.bodies.some(body=>body.id==='moon-jupiter-megaclite'),false);
 });
 test(`regression actual Jupiter519 display is Megaclite: visible=${visible}`,()=>{
  assert.equal(selected(catalogs.get(visible)!).name,'Megaclite');
 });
 test(`control every model and other display field is retained: visible=${visible}`,()=>{
  assert.deepEqual(omitTargetDisplay(catalogs.get(visible)!),omitTargetDisplay(createControl({moonsVisible:visible})));
 });
 test(`regression actual runtime has canonical and legacy name keys: visible=${visible}`,()=>{
  const catalog=catalogs.get(visible)!,body=selected(catalog),index=moonsByName(catalog);
  assert.equal(index.get('Megaclite'),body);
  assert.equal(index.get('Magaclite'),body);
 });
}

test('control frozen raw source records are not modified by display construction',async()=>{
 const rows=structuredClone(raw),before=structuredClone(rows);
 rows.forEach(Object.freeze);Object.freeze(rows);
 const create=await createFixture(rows);create({moonsVisible:false});create({moonsVisible:true});
 assert.deepEqual(rows,before);
});

test('regression display mapping uses exact physical identity, not source typo text',async()=>{
 const row={...sourceRow,id:1001,name:'Owned source spelling'};
 const body=(await createFixture([row]))().bodies.find(body=>body.type==='moon')!;
 assert.equal(body.name,'Megaclite');
 assert.equal(body.id,'moon-jupiter-owned-source-spelling');
 const control=(await createFixture([{...row,iauCode:'owned-519'}]))().bodies.find(body=>body.type==='moon')!;
 const {name:actualName,...actualFields}=body;
 const {name:controlName,...controlFields}=control;
 assert.deepEqual(actualFields,controlFields);
});

for(const [label,fields]of [
 ['different parent',{planet:'Neptune'}],['number',{iauCode:519}],['boolean',{iauCode:true}],
 ['null',{iauCode:null}],['missing',{iauCode:undefined}],['empty',{iauCode:''}],
 ['nonblank whitespace',{iauCode:' 519 '}],['leading zero',{iauCode:'0519'}],
 ['different code',{iauCode:'520'}],['decimal-looking string',{iauCode:'519.0'}],
] as const)test(`control display correction does not coerce ${label}`,async()=>{
 const row={...sourceRow,...fields};
 const body=(await createFixture([row]))().bodies.find(body=>body.type==='moon')!;
 assert.equal(body.name,'Magaclite');
});

test('regression guarded canonical moon gains exactly its legacy name lookup',()=>{
 const index=moonsByName(minimalCatalog([canonicalBody]));
 assert.equal(index.get('Megaclite'),canonicalBody);
 assert.equal(index.get('Magaclite'),canonicalBody);
 assert.equal(index.size,2);
});

for(const [label,fields]of [
 ['wrong ID',{id:'owned-other'}],['missing ID',{id:undefined}],
 ['wrong parent',{parentId:'neptune'}],['missing parent',{parentId:undefined}],
 ['wrong display',{name:'Owned other'}],['not a moon',{type:'planet'}],
] as const)test(`control legacy alias cannot bind ${label}`,()=>{
 const body={...canonicalBody,...fields},index=moonsByName(minimalCatalog([body]));
 assert.equal(index.has('Magaclite'),false);
});

for(const legacyFirst of [false,true] as const)test(`control ordinary legacy-name owner wins over alias: first=${legacyFirst}`,()=>{
 const legacyOwner={...actual,id:'owned-ordinary-legacy',parentId:'neptune',name:'Magaclite'};
 const bodies=legacyFirst?[legacyOwner,canonicalBody]:[canonicalBody,legacyOwner];
 const index=moonsByName(minimalCatalog(bodies));
 assert.equal(index.get('Magaclite'),legacyOwner);
 assert.equal(index.get('Megaclite'),canonicalBody);
});

for(const canonicalFirst of [false,true] as const)test(`regression canonical ordinary first-wins and guarded legacy alias coexist: first=${canonicalFirst}`,()=>{
 const other={...canonicalBody,id:'owned-other-canonical-name',parentId:'neptune'};
 const bodies=canonicalFirst?[canonicalBody,other]:[other,canonicalBody];
 const index=moonsByName(minimalCatalog(bodies));
 assert.equal(index.get('Megaclite'),bodies[0]);
 assert.equal(index.get('Magaclite'),canonicalBody);
});

test('control an old-display ordinary entry retains existing first-wins behavior',()=>{
 const first={...actual,name:'Magaclite'},second={...first,id:'owned-second'};
 const index=moonsByName(minimalCatalog([first,second]));
 assert.equal(index.get('Magaclite'),first);
 assert.equal(index.size,1);
});

function artifact(key: string,targetId='519',centerId='599',sourceEphemeris='owned naming fixture') {
 const fit={kind:'horizons-chebyshev-elements-v1',coverageStartJd:100,coverageEndJd:102,
  meanLongitudeBaseDeg:0,meanLongitudeRateDegPerDay:90,sourceStepDays:.25,
  segments:[{startJd:100,endJd:102,coefficients:[[23640100],[0],[0],[1],[.01],[0],[0],[0],[90]]}],
  provenance:{source:'owned fixture',sourceEphemeris,targetId,centerId,frame:'ECLIPJ2000',timeScale:'TDB',
   generatedAt:'2000-01-01T00:00:00Z',generator:'owned fixture',query:'owned fixture'},
  sourceRowsSha256:'0'.repeat(64),heldOutRowsSha256:'1'.repeat(64),
  validation:{sampleCount:2,heldOutSampleCount:0,coverageEndpointSampleCount:2,
   coverageEndpointErrors:[100,102].map(jdTdb=>({jdTdb,positionErrorKm:0,velocityErrorMPerS:0})),
   accuracyLimits:{positionKm:1,velocityMPerS:1},positionErrorKm:{p50:0,p95:0,p99:0,max:0},
   velocityErrorMPerS:{p50:0,p95:0,p99:0,max:0},boundaryContinuity:{runtimeStateContinuous:true}}};
 return {schemaVersion:1,kind:'horizons-chebyshev-elements-v1',coverageTimeScale:'TDB',
  referenceFrame:'Ecliptic J2000',featureOrder:['aKm','hx','hy','hz','ex','ey','ez','meanLongitudeResidualDeg','meanMotionDegPerDay'],
  bodies:{[key]:fit}};
}
const legacyFit=parseMoonEphemerisArtifact(artifact('magaclite','519','599','owned legacy')).bodies;
const canonicalFit=parseMoonEphemerisArtifact(artifact('megaclite','519','599','owned canonical')).bodies;
for(const [label,fits,expected]of [
 ['legacy only',legacyFit,legacyFit.magaclite],['canonical only',canonicalFit,undefined],
 ['both keys',{...canonicalFit,...legacyFit},legacyFit.magaclite],
] as const)test(`control optional artifact policy unchanged: ${label}`,()=>{
 const body=selected(createSolarSystemCatalog({moonEphemerides:fits}));
 assert.equal(body.orbit!.ephemeris,expected);
 assert.equal(body.orbitEphemerisSource,expected?.provenance.sourceEphemeris);
});

for(const [label,target,parent]of [['wrong target','520','599'],['wrong parent','519','699']] as const)
 test(`control legacy parser rejects ${label}`,()=>{
  assert.throws(()=>parseMoonEphemerisArtifact(artifact('magaclite',target,parent)),/contradicts its catalog target or parent center/);
 });

test('control no shipped fit exists under either name and no fit is invented',()=>{
 for(const path of Object.keys(assetHashes).filter(path=>path.startsWith('src/data/moonEphemeris'))) {
  const bodies=JSON.parse(fs.readFileSync(path) as unknown as string).bodies;
  assert.equal(Object.hasOwn(bodies,'magaclite'),false);
  assert.equal(Object.hasOwn(bodies,'megaclite'),false);
 }
 assert.equal(actual.orbit!.ephemeris,undefined);
});

test('control real all-source assessment retains424 raw labels and parent/target identities',()=>{
 const child=spawnSync(process.execPath,['scripts/assess_all_moon_oracle.mjs'],{
  cwd:process.cwd(),encoding:'utf8',timeout:20000,maxBuffer:8*1024*1024,
 });
 assert.ifError(child.error);
 assert.equal(child.status,0,child.stderr);
 assert.equal(child.signal,null);
 assert.equal(child.stderr,'');
 const output=JSON.parse(child.stdout) as AssessmentOutput;
 assert.equal(output.expectedCatalogCount,424);
 assert.equal(output.records.length,424);
 assert.deepEqual(output.records.map(row=>({id:row.catalogId,name:row.name,parent:row.parent,target:row.targetId})),
  raw.map(row=>({id:row.id,name:row.name,parent:row.planet,target:row.iauCode})));
 const row=output.records.find(row=>row.catalogId===21)!;
 assert.equal(row.name,'Magaclite');assert.equal(row.parent,'Jupiter');assert.equal(row.targetId,'519');
 assert.equal(row.referenceStatus,'captured');assert.equal(row.samples.length,7);
 assert.ok(row.samples.every(sample=>sample.status==='compared'&&Number.isFinite(sample.positionErrorKm)&&Number.isFinite(sample.velocityErrorMs)));
 assert.deepEqual(output.records.filter(row=>row.parent==='Uranus'&&row.targetId==='715').map(row=>row.catalogId),[378,388]);
});
