import { test, expect } from '@playwright/test';
import { loadShell } from './helpers';
for(const [width,height] of [[195,422],[320,568],[390,844],[844,390],[1100,800],[1101,800],[1440,900]]){
  test(`reflow and reachable controls at ${width}x${height}`,async({page})=>{
    await page.setViewportSize({width,height});await loadShell(page);
    await page.evaluate(()=>window.__uiFixture.setSolarStatus('Sun: procedural fallback (solar server not reachable at https://very-long-solar-backend-name.example:9443/'+ 'longsegment'.repeat(20)+')'));
    if(width<=1100)await page.locator('#panel-toggle').click();
    await page.locator('.panel-disclosure').evaluateAll(nodes=>nodes.forEach(node=>(node as HTMLDetailsElement).open=true));
    const geometry=await page.evaluate(()=>{const panel=document.getElementById('control-panel')!;const rect=panel.getBoundingClientRect();return {root:document.documentElement.scrollWidth-innerWidth,panel:panel.scrollWidth-panel.clientWidth,right:rect.right};});
    expect(geometry.root).toBeLessThanOrEqual(1);expect(geometry.panel).toBeLessThanOrEqual(1);
    if(width>=320 && width<=1100)expect(width-geometry.right).toBeGreaterThanOrEqual(24);
    const controls=page.locator('#control-panel button,#control-panel input,#control-panel select,#control-panel summary');
    for(const element of await controls.all()){
      await element.scrollIntoViewIfNeeded();const rect=await element.boundingBox();expect(rect).not.toBeNull();
      expect(rect!.x).toBeGreaterThanOrEqual(-1);expect(rect!.x+rect!.width).toBeLessThanOrEqual(geometry.right+1);
      expect(rect!.width).toBeGreaterThanOrEqual(44 - 0.001);expect(rect!.height).toBeGreaterThanOrEqual(44 - 0.001);await expect(element).toBeInViewport();
    }
    await page.locator('#trigger-agn-shockwave').click();expect(await page.evaluate(()=>window.__uiFixture.calls.at(-1)?.[0])).toBe('trigger');
    await page.locator('#body-list').scrollIntoViewIfNeeded();await page.locator('#body-list').selectOption('pluto');await expect(page.locator('#body-info-name')).toHaveText('Pluto');
    const rowPolicy=await page.locator('#body-list').evaluate((select:HTMLSelectElement)=>({size:select.size,heights:[...select.options].slice(0,6).map(option=>option.getBoundingClientRect().height)}));
    if(rowPolicy.size===6)expect(rowPolicy.heights.every(value=>value>=44)).toBe(true);else expect(rowPolicy.size).toBe(1);
    await page.locator('#panel-close').click();await page.locator('#camera-tools summary').click();
    for(const button of await page.locator('#camera-tools button,#camera-tools summary').all()){
      await button.scrollIntoViewIfNeeded();const rect=await button.boundingBox();expect(rect!.width).toBeGreaterThanOrEqual(44 - 0.001);expect(rect!.height).toBeGreaterThanOrEqual(44 - 0.001);expect(rect!.x+rect!.width).toBeLessThanOrEqual(width+1);await expect(button).toBeInViewport();
    }
    if(width<320 || height<480){const canvas=await page.locator('#space-canvas').boundingBox();const status=await page.locator('#status-bar').boundingBox();expect(canvas!.height).toBeGreaterThanOrEqual(160);expect(status!.y).toBeGreaterThanOrEqual(canvas!.y+canvas!.height);}
  });
}
test('200 percent text sizing preserves access to the final action',async({page})=>{
  await page.setViewportSize({width:320,height:568});await loadShell(page);await page.addStyleTag({content:'html { font-size: 200%; }'});await page.locator('#panel-toggle').click();await page.locator('.panel-disclosure--danger summary').click();await page.locator('#trigger-agn-shockwave').scrollIntoViewIfNeeded();await expect(page.locator('#trigger-agn-shockwave')).toBeInViewport();
  expect(await page.locator('#control-panel').evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
});
