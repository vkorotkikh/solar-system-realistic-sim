import { test, expect } from '@playwright/test';
import { loadShell } from './helpers';
test('real OrbitControls accept keyboard and tap parity, modifiers, bounds, flags and disposal',async({page})=>{
  await loadShell(page);await page.locator('#panel-close').click();await page.locator('#camera-tools summary').click();
  await page.evaluate(()=>window.__uiFixture.setAutoFrame(false));
  const before=await page.evaluate(()=>window.__uiFixture.snapshot());
  await page.locator('#panel-toggle').focus();await page.keyboard.press('Shift+Tab');await expect(page.locator('#space-canvas')).toBeFocused();await expect(page.locator('#camera-keyboard-help')).toBeVisible();
  await page.keyboard.press('+');await page.evaluate(()=>window.__uiFixture.step());
  const keyboard=await page.evaluate(()=>window.__uiFixture.snapshot());expect(keyboard.range).toBeCloseTo(before.range*.95,8);
  await page.evaluate(()=>window.__uiFixture.resetCamera());await page.getByRole('button',{name:'Zoom in',exact:true}).click();await expect(page.getByRole('button',{name:'Zoom in',exact:true})).toBeFocused();await page.evaluate(()=>window.__uiFixture.step());
  (await page.evaluate(()=>window.__uiFixture.snapshot())).position.forEach((value,index)=>expect(value).toBeCloseTo(keyboard.position[index],10));
  await page.locator('#space-canvas').focus();
  const ignored=await page.locator('#space-canvas').evaluate(canvas=>['ctrlKey','metaKey','altKey','isComposing'].map(modifier=>{const event=new KeyboardEvent('keydown',{key:'+',code:'Equal',bubbles:true,cancelable:true,[modifier]:true});canvas.dispatchEvent(event);return event.defaultPrevented;}));expect(ignored).toEqual([false,false,false,false]);
  await page.keyboard.press('+');await page.evaluate(()=>{window.__uiFixture.setControls({enableZoom:false});window.__uiFixture.step();});expect((await page.evaluate(()=>window.__uiFixture.snapshot())).range).toBeCloseTo(keyboard.range,8);
  await page.evaluate(()=>window.__uiFixture.setControls({enableZoom:true,minDistance:20}));
  expect(await page.locator('#space-canvas').evaluate(canvas=>{const event=new KeyboardEvent('keydown',{key:'+',bubbles:true,cancelable:true});canvas.dispatchEvent(event);return event.defaultPrevented;})).toBe(true);
  await page.evaluate(()=>window.__uiFixture.disposeCamera());await page.evaluate(()=>window.__uiFixture.setControls({minDistance:.0002}));await page.evaluate(()=>window.__uiFixture.step());expect((await page.evaluate(()=>window.__uiFixture.snapshot())).range).toBeCloseTo(keyboard.range,8);
});
test('follow centers each frame, orbit/zoom persist and Free cam retains pan',async({page})=>{
  await loadShell(page);await page.evaluate(()=>{window.__uiFixture.setAutoFrame(false);window.__uiFixture.setFollowing(true,[4,5,6]);window.__uiFixture.step();});
  await page.locator('#space-canvas').focus();await page.keyboard.press('ArrowLeft');await page.keyboard.press('+');await page.evaluate(()=>window.__uiFixture.step());const followed=await page.evaluate(()=>window.__uiFixture.snapshot());followed.target.forEach((value,index)=>expect(value).toBeCloseTo([4,5,6][index],10));expect(followed.following).toBe(true);
  await page.keyboard.press('Shift+ArrowRight');await page.evaluate(()=>window.__uiFixture.step());expect((await page.evaluate(()=>window.__uiFixture.snapshot())).target).not.toEqual([4,5,6]);
  await page.evaluate(()=>window.__uiFixture.step());(await page.evaluate(()=>window.__uiFixture.snapshot())).target.forEach((value,index)=>expect(value).toBeCloseTo([4,5,6][index],10));
  expect((await page.evaluate(()=>window.__uiFixture.snapshot())).range).toBeCloseTo(followed.range,8);
  await page.evaluate(()=>window.__uiFixture.setFollowing(false));await page.keyboard.press('Shift+ArrowUp');await page.evaluate(()=>window.__uiFixture.step());const free=await page.evaluate(()=>window.__uiFixture.snapshot());await page.evaluate(()=>window.__uiFixture.step());(await page.evaluate(()=>window.__uiFixture.snapshot())).target.forEach((value,index)=>expect(value).toBeCloseTo(free.target[index],10));
});
test('pointer drag damping and wheel still work alongside keyboard navigation',async({page})=>{
  await loadShell(page);const canvas=await page.locator('#space-canvas').boundingBox();const x=canvas!.x+canvas!.width*.7;const y=canvas!.height*.45;
  const before=await page.evaluate(()=>window.__uiFixture.snapshot());await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+80,y+20,{steps:6});await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>window.__uiFixture.snapshot().position)).not.toEqual(before.position);
  await page.locator('#space-canvas').focus();await page.keyboard.press('ArrowRight');
  const range=await page.evaluate(()=>window.__uiFixture.snapshot().range);await page.mouse.wheel(0,-150);await expect.poll(()=>page.evaluate(()=>window.__uiFixture.snapshot().range)).toBeLessThan(range);
});
test('single touch activates native camera buttons and retains mobile context',async({browser})=>{
  const context=await browser.newContext({hasTouch:true,isMobile:browser.browserType().name()!=='firefox',viewport:{width:390,height:844}});const page=await context.newPage();await loadShell(page);
  await expect(page.locator('.touch-hint')).toBeVisible();await expect(page.locator('#body-list')).toHaveAttribute('size','1');
  await page.locator('#camera-tools summary').tap();const range=await page.evaluate(()=>window.__uiFixture.snapshot().range);await page.getByRole('button',{name:'Zoom in',exact:true}).tap();await expect.poll(()=>page.evaluate(()=>window.__uiFixture.snapshot().range)).toBeLessThan(range);await context.close();
});
