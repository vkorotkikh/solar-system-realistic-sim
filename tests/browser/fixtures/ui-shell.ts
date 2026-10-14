import '../../../src/style.css';
import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createPanelController } from '../../../src/frontend/app/panelController';
import { createExplorerController } from '../../../src/frontend/app/explorerController';
import { createBodyPickerPresentation } from '../../../src/frontend/app/bodyPickerPresentation';
import { createViewportCameraController } from '../../../src/frontend/app/viewportCameraController';
import { createExperimentController } from '../../../src/frontend/app/experimentController';
import { createTimeController } from '../../../src/frontend/app/timeController';
import { renderSolarDataStatus, SolarDataAnnouncer } from '../../../src/frontend/features/solar/solarDataStatus';
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas=get<HTMLCanvasElement>('space-canvas');
const camera=new PerspectiveCamera(58,1,.0001,20_000); camera.position.set(0,-10,6);
const controls=new OrbitControls(camera,canvas); controls.enableDamping=true; controls.dampingFactor=.08; controls.minDistance=.0002; controls.maxDistance=200; controls.update();
const cameraController=createViewportCameraController({canvas,actionRoot:get('camera-tools'),camera,controls});
const bodies=['Sun','Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'].map((name,index)=>({name,id:name.toLowerCase(),type:index===0?'star':index===9?'dwarf':'planet'}));
const bodySearch=get<HTMLInputElement>('body-search'); const bodyList=get<HTMLSelectElement>('body-list');
const explorer=createExplorerController({
  dom:{bodySearch,bodyList,bodyMatchCount:get('body-match-count'),bodyInfo:get('body-info'),emptyState:get('body-empty-state'),focusBody:get('focus-body'),followBody:get('follow-body'),clearFollow:get('clear-follow')},bodies,
  onInspect: id=>{get('body-info').dataset.bodyId=id; get('body-info-name').textContent=bodies.find(body=>body.id===id)?.name || id;},
  onFocus:()=>{following=false;},onFollow:()=>{following=true;},onFree:()=>{following=false;},
});
const picker=createBodyPickerPresentation({select:bodyList,narrow:matchMedia('(max-width: 600px)'),coarse:matchMedia('(any-pointer: coarse)')});
const panel=createPanelController({app:get('app'),panel:get('control-panel'),viewport:get('viewport-shell'),toggle:get('panel-toggle'),close:get('panel-close'),backdrop:get('panel-backdrop'),breakpoint:matchMedia('(max-width: 1100px)'),onLayoutChange:()=>picker.refresh()});
const calls: unknown[][]=[];
const experimentArgs={dom:{agnSource:get<HTMLSelectElement>('agn-source'),agnPreset:get<HTMLSelectElement>('agn-preset'),agnHypothesis:get<HTMLSelectElement>('agn-hypothesis'),agnStochastic:get<HTMLInputElement>('agn-stochastic'),experimentStatus:get('experiment-status'),triggerAgnShockwave:get<HTMLButtonElement>('trigger-agn-shockwave')},sun:{setAgnStochasticFlaring:(value:boolean)=>calls.push(['stochastic',value]),triggerAgnShockwave:(...args: [string,number,number,{preset?:string;hypothesis?:'h29'}])=>calls.push(['trigger',...args])}};
let experiment=createExperimentController(experimentArgs);
const simState={julianDate:2451545,timeScaleDaysPerSec:4,timeScaleDirty:false,paused:false};
const time=createTimeController({dom:{nowTime:get('now-time'),timeDate:get('time-date'),timeScaleValue:get('time-scale-value'),timeScale:get<HTMLInputElement>('time-scale')},simState,minTimeScale:-120,maxTimeScale:120,currentJulianDate:()=>2451545,formatJulianAsDate:jd=>new Date((Math.floor(jd)-2440587.5)*86400000).toISOString().slice(0,10)});
time.bindUi(); time.updateHud();
let autoFrame=true; let following=false; const followPosition=new Vector3();
function step() {
  if(following){const offset=camera.position.clone().sub(controls.target);controls.target.copy(followPosition);camera.position.copy(followPosition).add(offset);}
  cameraController.applyPendingActions(); controls.update(); time.updateHud();
}
function snapshot() {return {position:camera.position.toArray(),target:controls.target.toArray(),range:camera.position.distanceTo(controls.target),following};}
function animate(){if(autoFrame)step();requestAnimationFrame(animate);} requestAnimationFrame(animate);
const announcer=new SolarDataAnnouncer(get('status-solar-announcer'));
const api={
  useResolvedPresets:()=>{experiment.dispose();experiment=createExperimentController({...experimentArgs,resolveSelection:(source,options)=>({sourceKey:options.preset==='SgrA_WarpWave_H29'?'SagittariusA':source,hypothesis:options.preset==='SgrA_WarpWave_H29'||options.hypothesis==='h29'?'h29':'compound',source:{jetModelNote:'Reference source note.'}})});},
  calls,snapshot,step,setAutoFrame:(value:boolean)=>{autoFrame=value;},
  setFollowing:(value:boolean,position:[number,number,number]=[0,0,0])=>{following=value;followPosition.fromArray(position);},
  setControls:(value:Partial<Pick<OrbitControls,'enabled'|'enableRotate'|'enablePan'|'enableZoom'|'minDistance'|'maxDistance'|'zoomSpeed'>>)=>Object.assign(controls,value),
  setTime:(date:number,rate:number)=>{simState.julianDate=date;simState.timeScaleDaysPerSec=rate;time.updateHud();},
  resetCamera:()=>{controls.target.set(0,0,0);camera.position.set(0,-10,6);controls.update();},
  setPreferredBody:explorer.setPreferredBody,setPanelOpen:panel.setOpen,
  setSolarStatus:(text:string)=>{const status={state:'error' as const,text,announcementKey:'error:unreachable',announcement:'Sun data unavailable.',remedy:null,observedAtMs:1};renderSolarDataStatus(get('status-solar'),status);announcer.observe(status);},
  disposeCamera:cameraController.dispose,
  dispose:()=>{autoFrame=false;panel.dispose();explorer.dispose();picker.dispose();cameraController.dispose();experiment.dispose();controls.dispose();},
};
declare global { interface Window { __uiFixture: typeof api } }
window.__uiFixture=api;
