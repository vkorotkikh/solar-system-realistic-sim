import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { loadavg } from 'node:os';
const { chromium } = await import(pathToFileURL(process.cwd()+'/node_modules/@playwright/test/index.mjs'));
const label=process.argv[2]; const results=[];
for(let i=0;i<3;i++){
 const browser=await chromium.launch({executablePath:'/home/nomad/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', headless:false,args:['--no-sandbox','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=gl']});
 try{
 const context=await browser.newContext({viewport:{width:1280,height:900}}); const page=await context.newPage(); const errors=[];const warnings=[];
 page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(['error','warning'].includes(m.type()))warnings.push(m.text());});
 const cdp=await context.newCDPSession(page); await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await page.route('**/src/main.ts*',async route=>{
  const response=await route.fetch();let source=await response.text();
  const needle='const backendBaseUrl = () => runtimeUiConfig.backendOrigin;';if(!source.includes(needle))throw new Error('capture anchor missing');
  source=source.replace(needle,needle+`
  window.__startupProbe={createdAt:performance.now(),renders:0};
  const actualRender=renderer.render.bind(renderer);
  renderer.render=(...args)=>{
    const result=actualRender(...args);const p=window.__startupProbe;const at=performance.now();p.renders++;
    p.firstRenderAt??=at;
    if(p.catalogAdoptedAt && !p.firstFullRenderAt){
      p.firstFullRenderAt=at;p.asteroidInstances=asteroidPop.count;p.kuiperInstances=kuiperPop.count;p.renderStats={...renderer.info.render};
      const gl=renderer.getContext();const debug=gl.getExtension('WEBGL_debug_renderer_info');
      p.graphics={renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,antialias:gl.getContextAttributes().antialias,parallelCompile:!!gl.getExtension('KHR_parallel_shader_compile')};
      const sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();
      const finish=()=>{const state=gl.clientWaitSync(sync,0,0);if(state===gl.CONDITION_SATISFIED||state===gl.ALREADY_SIGNALED){p.fullSceneGpuCompleteAt=performance.now();p.webglError=gl.getError();gl.deleteSync(sync);}else if(state===gl.WAIT_FAILED){p.fenceError=true;gl.deleteSync(sync);}else setTimeout(finish,1);};finish();
    }
    return result;
  };
  `);
  const catalogAnchor=source.match(/const gate = (catalog\d*)\.acceptance;/);if(!catalogAnchor)throw new Error('catalog capture anchor missing');const catalogVar=catalogAnchor[1];
  source=source.replace(catalogAnchor[0],`${catalogAnchor[0]}window.__startupProbe.catalog={loadMs:${catalogVar}.loadMs,budgetMs:${catalogVar}.loadLatencyBudgetMs,passed:gate.latency.passed,accepted:${catalogVar}.accepted,sourceCount:${catalogVar}.sourceCount,loadedCount:${catalogVar}.loadedCount,checksum:${catalogVar}.checksumActual};`);
  source=source.replace('refreshAsteroidBeltRenderer(phaseOnePopulation);','refreshAsteroidBeltRenderer(phaseOnePopulation);window.__startupProbe.catalogAdoptedAt=performance.now();');
  await route.fulfill({response,body:source});
 });
 const loadStart=loadavg();await page.goto('http://127.0.0.1:5197/',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__startupProbe?.fullSceneGpuCompleteAt||window.__startupProbe?.fenceError,{timeout:60000});
 const report=await page.evaluate(()=>({ ...window.__startupProbe,status:document.getElementById('status-catalog').textContent}));
 await page.screenshot({path:`/tmp/scn005-browser-${label}-${i}-20261017.png`});
 results.push({run:i,...report,errors,warnings,loadStart,loadEnd:loadavg()});
 console.log(JSON.stringify(results.at(-1)));
 }finally{await browser.close();}
}
await writeFile(`/tmp/scn005-browser-${label}-20261017.json`,JSON.stringify(results,null,2)+'\n');
