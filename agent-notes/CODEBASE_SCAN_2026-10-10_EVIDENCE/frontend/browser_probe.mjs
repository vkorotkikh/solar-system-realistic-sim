import { chromium } from '/home/nomad/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
const out = new URL('.',import.meta.url).pathname;
const browser = await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results={capturedAt:new Date().toISOString(),environment:'Chromium headless software WebGL; backend requests explicitly aborted to avoid existing sessions; Vite isolated snapshots'};
for(const [branch,port] of [['main',5410],['trajectory',5411]]){
 console.log('starting',branch); const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage(); const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(r.url().includes(':8042')) requests.push(r.url());});
 await page.route('**:8042/**',r=>r.abort('connectionrefused'));
 await page.addInitScript(()=>{window.__audit={uploads:0,bytes:0,writes:{}};
 for(const C of [WebGLRenderingContext,WebGL2RenderingContext]){const original=C.prototype.bufferSubData;C.prototype.bufferSubData=function(...args){window.__audit.uploads++;window.__audit.bytes+=args[2]?.byteLength||0;return original.apply(this,args)};}
 const d=Object.getOwnPropertyDescriptor(Node.prototype,'textContent');Object.defineProperty(Node.prototype,'textContent',{...d,set(v){if(this.id)window.__audit.writes[this.id]=(window.__audit.writes[this.id]||0)+1;d.set.call(this,v)}});
 });
 await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle',timeout:60000});
 await page.waitForFunction(()=>document.querySelector('#body-list')?.options.length===10,{timeout:60000});
 await page.getByRole('button',{name:'Pause simulation',exact:true}).click();
 const before=await page.evaluate(()=>({...window.__audit,writes:{...window.__audit.writes},date:document.querySelector('#time-date').textContent}));
 await page.waitForTimeout(1800);
 const after=await page.evaluate(()=>({...window.__audit,writes:{...window.__audit.writes},date:document.querySelector('#time-date').textContent}));
 const startup=await page.evaluate(()=>({status:document.querySelector('#status-bar').innerText,body:document.body.innerText,canvasTabIndex:document.querySelector('canvas').tabIndex,canvasSize:[document.querySelector('canvas').width,document.querySelector('canvas').height]}));
 const quadtree=await page.evaluate(async()=>{const {PlanetQuadtree}=await import('/src/frontend/features/planetary/quadtreeLOD.ts');const {PerspectiveCamera}=await import('/node_modules/.vite/deps/three.js');const c=new PerspectiveCamera();c.position.set(0,0,100);const t=new PlanetQuadtree('earth',1,c);const initial=t.group.children.length;c.position.set(0,0,2);t.update();const close=t.group.children.length;c.position.set(0,0,100);t.update();return {initial,close,farAgain:t.group.children.length,retainedFaceMeshes:t.faces.map(f=>({meshPresent:!!f.mesh,meshParentPresent:!!f.mesh?.parent,split:f.isSplit}))}});
 // Screenshots omitted: software GPU readback exceeded 30 s on this host.
 await page.locator('#body-search').focus();
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);
 const breakpoint=await page.evaluate(()=>({activeId:document.activeElement?.id,panelInert:document.querySelector('#control-panel').inert,activeInsidePanel:document.querySelector('#control-panel').contains(document.activeElement)}));
 await page.locator('#panel-toggle').click();
 const drawer=await page.evaluate(()=>({viewportInert:document.querySelector('#viewport-shell').inert,panelRole:document.querySelector('#control-panel').getAttribute('role'),ariaModal:document.querySelector('#control-panel').getAttribute('aria-modal'),focus:document.activeElement?.id}));
 // Read DOM state without GPU readback.
 await page.setViewportSize({width:240,height:650});await page.waitForTimeout(300);
 const narrow=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.getBoundingClientRect().width,panelWidth:document.querySelector('#control-panel').getBoundingClientRect().width}));
 results[branch]={errors,requests,startup,paused:{milliseconds:1800,before,after},quadtree,breakpoint,drawer,narrow};await fs.writeFile(`${out}browser-results.json`,JSON.stringify(results,null,2)); await context.close();
 const blocked=await browser.newContext({viewport:{width:1440,height:900}}); const p=await blocked.newPage();const blockedErrors=[];p.on('pageerror',e=>blockedErrors.push(String(e)));
 await p.addInitScript(()=>{const fn=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(String(type).includes('webgl'))return null;return fn.call(this,type,...args)}});
 await p.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
 results[branch].noWebgl={errors:blockedErrors,ui:await p.evaluate(()=>({date:document.querySelector('#time-date').textContent,options:document.querySelector('#body-list').options.length,alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent),status:document.querySelector('#status-bar').innerText}))};await blocked.close();
}
await browser.close();await fs.writeFile(`${out}browser-results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
