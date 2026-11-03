import { chromium } from '@playwright/test';
import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { loadavg } from 'node:os';
const directory = new URL('.', import.meta.url).pathname;
const root = process.cwd();
const loopBound = process.env.DIAG_LOOP_BOUND === '1';
const specialize = process.env.DIAG_SPECIALIZE === '1';
const perObject = process.env.DIAG_PER_OBJECT === '1';
const nativeProfile = process.env.DIAG_NATIVE === '1';
const noFence = process.env.DIAG_NO_FENCE === '1';
const [mode = 'continuous', url = 'http://127.0.0.1:5410/', label = mode] = process.argv.slice(2);
if (!['continuous','isolated','input'].includes(mode)) throw new Error('Unknown diagnosis arm');
const sourceHashes = {};
for (const file of ['src/main.ts','src/frontend/features/planetary/planetShaders.ts','src/frontend/app/rendererWarmup.ts','src/frontend/app/sceneSetup.ts','src/frontend/features/asteroids/startupBelt.ts','package-lock.json']) sourceHashes[file] = createHash('sha256').update(await readFile(`${root}/${file}`)).digest('hex');
const output = `${directory}/${label}`;
const profiling = process.env.DIAG_PROFILE === '1';
const gpuTimerEnabled = process.env.DIAG_GPU_TIMER === '1';
const gpuTraceEnabled = process.env.DIAG_GPU_TRACE === '1';
const browser = await chromium.launch({ executablePath:'/home/nomad/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', headless:false,
  args:['--no-sandbox','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=gl',...(gpuTraceEnabled?['--enable-gpu-service-tracing']:[])] });
let report;
try {
  const context = await browser.newContext({viewport:{width:1280,height:900}});
  const page = await context.newPage(); const cdp = await context.newCDPSession(page);
  const browserCdp = await browser.newBrowserCDPSession();
  await writeFile(`${directory}/trace-categories.json`,JSON.stringify(await browserCdp.send('Tracing.getCategories'),null,2));
  const errors=[], warnings=[], catalogLogs=[]; const inputDispatch=[];
  let inputPromise = Promise.resolve();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{
    const text=message.text();
    if (text.startsWith('[phase-1]')) catalogLogs.push(text);
    if (['error','warning'].includes(message.type())) warnings.push(text);
    if (text === '__STARTUP_DIAG_FIRST_SUBMIT__' && mode === 'input') {
      inputPromise = new Promise(resolve=>setTimeout(resolve,50)).then(async()=>{
        const record = {sentAtEpochMs:Date.now()}; inputDispatch.push(record);
        await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'+',code:'Equal',text:'+',unmodifiedText:'=',windowsVirtualKeyCode:187,nativeVirtualKeyCode:187,modifiers:8,timestamp:Date.now()/1000});
        record.keyDownAckAtEpochMs=Date.now();
        await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'+',code:'Equal',windowsVirtualKeyCode:187,nativeVirtualKeyCode:187,modifiers:8});
        record.finishedAtEpochMs=Date.now();
      }).catch(error=>inputDispatch.push({error:error.message}));
    }
  });
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp.send('Performance.enable');
  await page.addInitScript(({mode,gpuTimerEnabled,noFence,perObject,specialize,loopBound})=>{
    const now=()=>performance.now();
    const p={mode,events:[],renders:[],longTasks:[],heartbeat:[],raf:[],glSlowCalls:[],fencePolls:[],inputs:[],hud:[],catalogRequests:[]};
    window.__startupDiagnosis=p;
    function mark(name,data={}) {const at=now();p.events.push({name,at,...data});performance.mark(`startup-diag:${name}`);return at;}
    new PerformanceObserver(list=>{for(const entry of list.getEntries())p.longTasks.push({start:entry.startTime,duration:entry.duration,name:entry.name});}).observe({type:'longtask',buffered:true});
    let nextBeat=now()+16;
    function heartbeat(){const at=now();p.heartbeat.push({at,lag:at-nextBeat});nextBeat=at+16;if(!p.closed)setTimeout(heartbeat,16);}
    setTimeout(heartbeat,16);
    document.addEventListener('keydown',event=>{p.inputs.push({key:event.key,at:now(),eventTimestamp:event.timeStamp,trusted:event.isTrusted,target:event.target?.id});mark('native-keydown');},true);
    document.addEventListener('DOMContentLoaded',()=>{
      document.querySelector('#space-canvas')?.focus();
      const status=document.querySelector('#status-zoom');
      if(status)new MutationObserver(()=>p.hud.push({at:now(),text:status.textContent})).observe(status,{childList:true,characterData:true,subtree:true});
    });
    const nativeRaf=window.requestAnimationFrame.bind(window),nativeCancel=window.cancelAnimationFrame.bind(window);
    let nextRaf=0,firstFencePending=false;const rafJobs=new Map();
    function schedule(job){job.nativeId=nativeRaf(timestamp=>{
      if(mode==='isolated'&&firstFencePending){job.nativeId=null;p.raf.push({event:'held',at:now(),id:job.id});return;}
      rafJobs.delete(job.id);const start=now();
      try{return job.callback(timestamp);}finally{p.raf.push({event:'run',id:job.id,start,end:now(),timestamp});}
    });}
    window.requestAnimationFrame=callback=>{const job={id:++nextRaf,callback,nativeId:null};rafJobs.set(job.id,job);schedule(job);return job.id;};
    window.cancelAnimationFrame=id=>{const job=rafJobs.get(id);if(job?.nativeId!==null)nativeCancel(job?.nativeId);rafJobs.delete(id);};
    function releaseFrames(){firstFencePending=false;for(const job of rafJobs.values())if(job.nativeId===null)schedule(job);}
    const fetch=window.fetch;
    window.fetch=function(...args){const input=args[0],url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);if(url.pathname.includes('/asteroid-phase1/'))p.catalogRequests.push({at:now(),url:url.pathname});return Reflect.apply(fetch,this,args);};
    const hook=new EventTarget();window.__THREE_DEVTOOLS__=hook;
    hook.addEventListener('observe',event=>{
      const renderer=event.detail;if(!renderer?.isWebGLRenderer)return;
      mark('renderer-created');const gl=renderer.getContext();const debug=gl.getExtension('WEBGL_debug_renderer_info');p.graphics={renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,antialias:gl.getContextAttributes().antialias,samples:gl.getParameter(gl.SAMPLES),parallelCompile:Boolean(gl.getExtension('KHR_parallel_shader_compile'))};
      const methods=['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced','bufferData','bufferSubData','texImage2D','texSubImage2D','getProgramParameter','getShaderParameter','getProgramInfoLog','getShaderInfoLog','getUniformLocation','getAttribLocation','getActiveUniform','getActiveAttrib','getParameter','getExtension','clientWaitSync','getQueryParameter','beginQuery','endQuery','flush'];
      for(const name of methods){const method=gl[name];if(typeof method!=='function')continue;
        gl[name]=function(...args){const start=now();try{return Reflect.apply(method,this,args);}finally{const duration=now()-start;if(duration>2)p.glSlowCalls.push({name,start,duration,arg0:typeof args[0]==='number'?args[0]:undefined,renderIndex:p.renders.length});}};
      }
      const timer=gpuTimerEnabled?gl.getExtension('EXT_disjoint_timer_query_webgl2'):null;p.gpuTimerEnabled=gpuTimerEnabled;p.gpuTimerSupported=gpuTimerEnabled?Boolean(timer):null;
      const compile=renderer.compile,render=renderer.render;
      renderer.compile=function(...args){if(loopBound)args[0].traverse(object=>{const m=object.material;if(m?.uniforms?.uPlanetType&&!m.uniforms.uNoiseOctaveLimit){m.uniforms.uNoiseOctaveLimit={value:12};m.vertexShader='uniform int uNoiseOctaveLimit;\n'+m.vertexShader.replaceAll('i < 12','i < uNoiseOctaveLimit');m.fragmentShader='uniform int uNoiseOctaveLimit;\n'+m.fragmentShader.replaceAll('i < 12','i < uNoiseOctaveLimit');}});if(specialize)args[0].traverse(object=>{const m=object.material;if(m?.uniforms?.uPlanetType){const type=m.uniforms.uPlanetType.value;m.vertexShader=m.vertexShader.replace('uniform int uPlanetType;',`const int uPlanetType = ${type};`);m.fragmentShader=m.fragmentShader.replace('uniform int uPlanetType;',`const int uPlanetType = ${type};`);}});mark('compile-start');try{return Reflect.apply(compile,this,args);}finally{mark('compile-return');}};
      renderer.render=function(...args){
        if(perObject&&!p.renders.length){p.objectCompletion=[];args[0].traverse(object=>{if(!object.material)return;const old=object.onAfterRender;object.onAfterRender=function(...callbackArgs){if(old)Reflect.apply(old,this,callbackArgs);const start=now();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));p.objectCompletion.push({name:object.name,type:object.type,material:object.material.type,shader:object.material.fragmentShader?.slice(0,100),at:start,duration:now()-start});object.onAfterRender=old;};});}
        const index=p.renders.length+1,start=mark(`render-${index}-start`);let query=null;
        if(index===1&&timer){query=gl.createQuery();gl.beginQuery(timer.TIME_ELAPSED_EXT,query);}
        let result;
        try{result=Reflect.apply(render,this,args);}finally{if(query)gl.endQuery(timer.TIME_ELAPSED_EXT);}
        const end=mark(`render-${index}-return`);p.renders.push({index,start,end,duration:end-start,stats:{...renderer.info.render}});
        if(index!==1)return result;
        firstFencePending=true;p.firstFullSceneSubmittedAt=end;
        p.belts=[];args[0].traverse(object=>{if(object.isInstancedMesh)p.belts.push({count:object.count,kuiper:Boolean(object.userData.kuiperBufferWork)});});
        p.graphics={...p.graphics,width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,dpr:renderer.getPixelRatio()};
        if(noFence){mark('fence-omitted-control');firstFencePending=false;setTimeout(()=>{p.noFenceObservationDone=true;},8000);return result;}
        const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);mark('fence-inserted');gl.flush();mark('flush-return');
        const deadline=now()+20000;
        function poll(){const start=now(),status=gl.clientWaitSync(fence,0,0),end=now();p.fencePolls.push({start,end,status});
          if(status===gl.CONDITION_SATISFIED||status===gl.ALREADY_SIGNALED){
            p.fullSceneFenceObservedAt=mark('fence-observed');p.webglError=gl.getError();
            if(query){p.gpuQueryReady=gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE);p.gpuDisjoint=gl.getParameter(timer.GPU_DISJOINT_EXT);if(p.gpuQueryReady&&!p.gpuDisjoint)p.firstRenderGpuElapsedMs=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;gl.deleteQuery(query);}
            gl.deleteSync(fence);releaseFrames();return;
          }
          if(status===gl.WAIT_FAILED||end>deadline){p.fenceFailure=status===gl.WAIT_FAILED?'WAIT_FAILED':'observation-bound';gl.deleteSync(fence);if(query)gl.deleteQuery(query);releaseFrames();return;}
          setTimeout(poll,1);
        }
        poll();console.debug('__STARTUP_DIAG_FIRST_SUBMIT__');return result;
      };
    });
  },{mode,gpuTimerEnabled,noFence,perObject,specialize,loopBound});
  let traceComplete;
  if(profiling){
    await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');
    traceComplete=new Promise(resolve=>browserCdp.once('Tracing.tracingComplete',resolve));
    await browserCdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,toplevel,v8,gpu,cc,gpu.angle,disabled-by-default-gpu.service,disabled-by-default-gpu.device,disabled-by-default-gpu.debug,disabled-by-default-devtools.timeline',transferMode:'ReturnAsStream'});
  }
  const processCpu=[]; let cpuPollClosed=false;
  async function pollCpu(){try{const snapshot=await browserCdp.send('SystemInfo.getProcessInfo');processCpu.push({atEpochMs:Date.now(),processes:snapshot.processInfo});}catch{}if(!cpuPollClosed)setTimeout(pollCpu,100);}
  const cpuPollPromise=pollCpu();
  let nativeSampler; if(nativeProfile){ const gpu=(await browserCdp.send('SystemInfo.getProcessInfo')).processInfo.find(p=>p.type==='GPU'); if(!gpu)throw new Error('GPU process missing'); await writeFile(`${output}.maps`,await readFile(`/proc/${gpu.id}/maps`)); nativeSampler=spawn('/tmp/solar-scn005-native-sample',[String(gpu.id),'18',`${output}.native.jsonl`],{stdio:['ignore','inherit','inherit']}); }
  const loadStart=loadavg();await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  let observationError=null;
  try{await page.waitForFunction(()=>window.__startupDiagnosis?.noFenceObservationDone||window.__startupDiagnosis?.fullSceneFenceObservedAt||window.__startupDiagnosis?.fenceFailure||!document.querySelector('#renderer-unavailable')?.hidden,null,{polling:50,timeout:30000});}catch(error){observationError=error.message;}
  await inputPromise;cpuPollClosed=true;await cpuPollPromise;
  const capture=await page.evaluate(()=>{const p=window.__startupDiagnosis;p.closed=true;return {...p,timeOrigin:performance.timeOrigin,catalogStatus:document.querySelector('#status-catalog')?.textContent,statusZoom:document.querySelector('#status-zoom')?.textContent,recoveryHidden:document.querySelector('#renderer-unavailable')?.hidden};});
  if(nativeSampler){await new Promise((resolve,reject)=>{nativeSampler.once('exit',code=>code===0?resolve():reject(new Error('Native sampler failed: '+code)));});}
  let metrics=await cdp.send('Performance.getMetrics');
  if(profiling){
    const {profile}=await cdp.send('Profiler.stop');await writeFile(`${output}.cpuprofile`,JSON.stringify(profile));
    await browserCdp.send('Tracing.end');const complete=await traceComplete;
    const chunks=[];for(;;){const chunk=await browserCdp.send('IO.read',{handle:complete.stream});chunks.push(chunk.base64Encoded?Buffer.from(chunk.data,'base64').toString('utf8'):chunk.data);if(chunk.eof)break;}
    await browserCdp.send('IO.close',{handle:complete.stream});await writeFile(`${output}.trace.json`,chunks.join(''));
  }
  report={mode,url,applicationRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),gitHeadAtObservation:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceHashes,profiling,observedAt:new Date().toISOString(),sourceModified:execFileSync('git',['diff','--name-only'],{cwd:root,encoding:'utf8'}).trim().length>0,specialize,loopBound,perObject,noFence,gpuTimerEnabled,gpuTraceEnabled,processCpu,rafControl:mode==='isolated',inputDispatch,loadStart,loadEnd:loadavg(),...capture,metrics:metrics.metrics,catalogLogs,errors,warnings,observationError};
  await writeFile(`${output}.json`,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({mode,firstSubmit:report.firstFullSceneSubmittedAt,fenceObserved:report.fullSceneFenceObservedAt,gpuMs:report.firstRenderGpuElapsedMs,renders:report.renders,slowGL:report.glSlowCalls,longTasks:report.longTasks,inputs:report.inputs,inputDispatch,errors,observationError},null,2));
}finally{await browser.close();}
if((!noFence&&(!report?.fullSceneFenceObservedAt||report.webglError!==0))||report.errors.length||report.belts.map(b=>b.count).join(',')!=='50000,5000,83')process.exitCode=1;
