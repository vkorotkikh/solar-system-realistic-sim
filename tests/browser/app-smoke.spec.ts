import { test, expect, type Page } from '@playwright/test';
test('decorative stars remain visible with close-focus clip planes and behind bodies', async ({ page }) => {
  await controlExternalRequests(page);
  await page.route(/\/src\/main\.ts(?:\?.*)?$/, route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const threeUrl = '/node_modules/three/build/three.module.js';
    const annotationUrl = '/src/frontend/app/sceneAnnotations.ts';
    const { WebGLRenderer, Scene, PerspectiveCamera, Mesh, PlaneGeometry, MeshBasicMaterial } = await import(threeUrl);
    const { createBackgroundStars } = await import(annotationUrl);
    const renderer = new WebGLRenderer({ preserveDrawingBuffer: true });
    renderer.setSize(256, 256); renderer.setPixelRatio(1);
    const scene = new Scene(); const camera = new PerspectiveCamera(58, 1, .000001, 20000);
    let seed = 42;
    const stars = createBackgroundStars(6000, () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296));
    scene.add(stars);
    const gl = renderer.getContext();
    const capture = () => {
      renderer.render(scene, camera);
      const pixels = new Uint8Array(256 * 256 * 4);
      gl.readPixels(0, 0, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let lit = 0; for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 10) lit++;
      return lit;
    };
    const wide = capture(); camera.far = .45; camera.updateProjectionMatrix(); const close = capture();
    const blocker = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: 0 }));
    blocker.position.z = -.05; scene.add(blocker); const occluded = capture();
    stars.geometry.dispose(); stars.material.dispose(); blocker.geometry.dispose(); blocker.material.dispose(); renderer.dispose();
    return { wide, close, occluded };
  });
  expect(result.wide).toBeGreaterThan(100);
  expect(result.close).toBe(result.wide);
  expect(result.occluded).toBe(0);
  await test.info().attach('star-clip-pixel-counts', { body: JSON.stringify(result), contentType: 'application/json' });
});
test('actual app recovers a silently terminated orbital worker', async ({ page }) => {
  test.setTimeout(90_000);
  await controlExternalRequests(page);
  await page.addInitScript(() => {
    const probe = { created: 0, killed: 0, retired: 0, replacementTicks: 0 };
    Object.assign(window, { orbitalWorkerProbe: probe });
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      readonly attempt: number;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.attempt = ++probe.created;
      }
      postMessage(message: unknown, options?: StructuredSerializeOptions | Transferable[]) {
        if ((message as { type?: string }).type === 'tick') {
          if (this.attempt === 1) { probe.killed += 1; super.terminate(); return; }
          probe.replacementTicks += 1;
        }
        Reflect.apply(NativeWorker.prototype.postMessage, this, [message, options]);
      }
      terminate() { probe.retired += 1; super.terminate(); }
    };
  });
  await page.goto('/?uiWidth=500&uiHeight=700&renderScale=0.5&maxPixelRatio=1');
  await expect(page.locator('#status-zoom')).not.toHaveText('Range · —', { timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as {
    orbitalWorkerProbe: { created: number };
  }).orbitalWorkerProbe.created), { timeout: 15_000 }).toBe(2);
  await expect(page.locator('#space-canvas')).toHaveAttribute('data-orbital-worker', 'ready');
  await expect.poll(() => page.evaluate(() => (window as unknown as {
    orbitalWorkerProbe: { replacementTicks: number };
  }).orbitalWorkerProbe.replacementTicks), { timeout: 30_000 }).toBeGreaterThan(1);
  const probe = await page.evaluate(() => (window as unknown as {
    orbitalWorkerProbe: { killed: number; retired: number };
  }).orbitalWorkerProbe);
  expect(probe.killed).toBe(1);
  expect(probe.retired).toBe(1);
  await expect(page.locator('#renderer-unavailable')).toBeHidden();
});
async function controlExternalRequests(page:Page){
  await page.route('**/*',route=>{const url=new URL(route.request().url());return url.origin==='http://127.0.0.1:'+(process.env.UI_TEST_PORT||'4175')?route.continue():route.fulfill({status:503,contentType:'application/json',body:'{"detail":"deterministic unavailable service"}',headers:{'Access-Control-Allow-Origin':'*'}});});
}
test('actual app composes camera, drawer, search and experiment with a nondefault backend origin',async({page})=>{
  test.setTimeout(90_000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const requests:string[]=[];page.on('request',request=>requests.push(request.url()));await controlExternalRequests(page);
  await page.goto('/?uiWidth=500&uiHeight=700&renderScale=0.5&maxPixelRatio=1');
  await expect(page.locator('#status-zoom')).not.toHaveText('Range · —',{timeout:60_000});
  const graphics = await page.locator('#space-canvas').evaluate((canvas:HTMLCanvasElement)=>{
    const gl=canvas.getContext('webgl2');
    const debug=gl?.getExtension('WEBGL_debug_renderer_info');
    return { renderer:gl&&debug?String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)):null, userAgent:navigator.userAgent };
  });
  console.log('Actual application WebGL:', JSON.stringify(graphics));
  await test.info().attach('webgl-renderer',{body:JSON.stringify(graphics,null,2),contentType:'application/json'});
  if(process.env.UI_HARDWARE_WEBGL==='1') expect(graphics.renderer).toMatch(/D3D12.*NVIDIA GeForce RTX/i);
  else expect(graphics.renderer).toContain('SwiftShader');
  await expect(page.locator('#renderer-unavailable')).toBeHidden();await page.locator('#toggle-play').click();
  const dimensions=await page.locator('#space-canvas').evaluate((canvas:HTMLCanvasElement)=>({width:canvas.width,height:canvas.height,viewWidth:canvas.clientWidth,viewHeight:canvas.clientHeight}));expect(dimensions.viewWidth).toBe(500);expect(dimensions.viewHeight).toBe(700);expect(dimensions.width).toBe(250);expect(dimensions.height).toBe(350);
  const before=await page.locator('#status-zoom').textContent();await page.locator('#space-canvas').focus();await page.keyboard.press('+');await expect(page.locator('#status-zoom')).not.toHaveText(before!);
  await page.locator('#body-search').fill('not-a-body');await expect(page.locator('#body-info')).toBeHidden();await page.locator('#body-search').press('Escape');
  await page.locator('.panel-disclosure--danger summary').click();await page.locator('#agn-hypothesis').selectOption('h29');await expect(page.locator('#trigger-agn-shockwave')).toHaveText('Trigger H29 slipstream');await page.locator('#trigger-agn-shockwave').click();
  await page.setViewportSize({width:390,height:844});await page.locator('#panel-toggle').click();await expect(page.locator('#panel-close')).toBeFocused();await expect(page.locator('#viewport-shell')).toHaveAttribute('inert','');await page.keyboard.press('Escape');await expect(page.locator('#panel-toggle')).toBeFocused();
  expect(requests.some(url=>url.startsWith('http://127.0.0.1:9142/'))).toBe(true);expect(requests.some(url=>url.includes(':8042/'))).toBe(false);expect(errors).toEqual([]);
});
test('no-WebGL constructor failure exposes an accessible reload path and working drawer',async({page})=>{
  await controlExternalRequests(page);await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:unknown[]){if(type==='webgl'||type==='webgl2'||type==='experimental-webgl')return null;return Reflect.apply(get,this,[type,...args]);} as typeof get;});
  await page.goto('/');await expect(page.getByRole('heading',{name:'Visualization unavailable'})).toBeVisible();await expect(page.locator('#renderer-retry')).toBeFocused();await expect(page.locator('#renderer-unavailable [role="alert"]')).toContainText('WebGL');await expect(page.locator('#toggle-play')).toBeDisabled();
  await page.locator('#panel-close').click();await page.locator('#renderer-retry').click();await expect(page.locator('#renderer-unavailable')).toBeVisible();
});
test('actual WebGL context loss stops rendering and leaves keyboard recovery available',async({page})=>{
  test.setTimeout(90_000);await controlExternalRequests(page);await page.goto('/');await expect(page.locator('#status-zoom')).not.toHaveText('Range · —',{timeout:60_000});
  await page.setViewportSize({width:390,height:844});await page.locator('#panel-toggle').click();await page.locator('#body-search').focus();
  const supported=await page.locator('#space-canvas').evaluate((canvas:HTMLCanvasElement)=>{const extension=canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');extension?.loseContext();return Boolean(extension);});expect(supported).toBe(true);
  await expect(page.locator('#panel-close')).toBeFocused();await expect(page.locator('#toggle-play')).toBeDisabled();await page.keyboard.press('Escape');await expect(page.locator('#renderer-unavailable')).toBeVisible();await expect(page.locator('#renderer-unavailable [role="alert"]')).toContainText('graphics connection was lost');await page.locator('#renderer-retry').focus();await expect(page.locator('#renderer-retry')).toBeFocused();
  await page.locator('#space-canvas').dispatchEvent('webglcontextrestored');await expect(page.locator('#renderer-unavailable [role="alert"]')).toContainText('Reload the visualization');
});
