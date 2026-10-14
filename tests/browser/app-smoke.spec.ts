import { test, expect, type Page } from '@playwright/test';
async function controlExternalRequests(page:Page){
  await page.route('**/*',route=>{const url=new URL(route.request().url());return url.origin==='http://127.0.0.1:'+(process.env.UI_TEST_PORT||'4175')?route.continue():route.fulfill({status:503,contentType:'application/json',body:'{"detail":"deterministic unavailable service"}',headers:{'Access-Control-Allow-Origin':'*'}});});
}
test('actual app composes camera, drawer, search and experiment with a nondefault backend origin',async({page})=>{
  test.setTimeout(90_000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const requests:string[]=[];page.on('request',request=>requests.push(request.url()));await controlExternalRequests(page);
  await page.goto('/?uiWidth=500&uiHeight=700&renderScale=0.5&maxPixelRatio=1');
  await expect(page.locator('#status-zoom')).not.toHaveText('Range · —',{timeout:60_000});
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
