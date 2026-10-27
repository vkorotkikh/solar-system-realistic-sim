import { test, expect } from '@playwright/test';
import { loadShell } from './helpers';
for (const desktopOpen of [false,true]) for (const mobileOpen of [false,true]) {
  test(`remembers desktop=${desktopOpen}, mobile=${mobileOpen} across both breakpoint directions`, async ({page})=>{
    await loadShell(page); await expect(page.locator('body')).toBeFocused();
    await page.evaluate(open=>window.__uiFixture.setPanelOpen(open),desktopOpen);
    await page.setViewportSize({width:1100,height:800});
    await page.evaluate(open=>window.__uiFixture.setPanelOpen(open),mobileOpen);
    await page.setViewportSize({width:1101,height:800});
    await expect(page.locator('#panel-toggle')).toHaveAttribute('aria-expanded',String(desktopOpen));
    await expect(page.locator('#control-panel')).not.toHaveAttribute('aria-modal','true');
    await page.locator('#space-canvas').focus();
    await page.setViewportSize({width:1100,height:800});
    await expect(page.locator('#panel-toggle')).toHaveAttribute('aria-expanded',String(mobileOpen));
    if(mobileOpen){
      await expect(page.locator('#panel-close')).toBeFocused();
      await expect(page.locator('#viewport-shell')).toHaveAttribute('aria-hidden','true');
      await page.locator('#body-search').focus();
    } else await expect(page.locator('#space-canvas')).toBeFocused();
    await page.setViewportSize({width:1101,height:800});
    if(mobileOpen && !desktopOpen) await expect(page.locator('#panel-toggle')).toBeFocused();
    if(mobileOpen && desktopOpen) await expect(page.locator('#body-search')).toBeFocused();
    await expect(page.locator('#app')).not.toHaveAttribute('data-panel-focus-transition','');
  });
}
test('stale retained media queries cannot overwrite remembered state or lose modal focus', async ({page}) => {
  await page.addInitScript(() => {
    const matchMedia = window.matchMedia.bind(window);
    let held = false;
    window.matchMedia = query => {
      const media = matchMedia(query);
      if (!held && query === '(max-width: 1100px)') {
        held = true;
        const initialMatches = media.matches;
        // Reproduce a retained query whose state/change delivery lags layout.
        Object.defineProperty(media, 'matches', { get: () => initialMatches });
        media.addEventListener('change', event => event.stopImmediatePropagation());
      }
      return media;
    };
  });
  await loadShell(page);
  await page.evaluate(() => window.__uiFixture.setPanelOpen(false));
  await page.setViewportSize({width:1100,height:800});
  await page.evaluate(() => window.__uiFixture.setPanelOpen(true));
  await expect(page.locator('#control-panel')).toHaveAttribute('aria-modal','true');
  await expect(page.locator('#panel-close')).toBeFocused();
  await expect(page.locator('#viewport-shell')).toHaveAttribute('aria-hidden','true');
  await page.setViewportSize({width:1101,height:800});
  await expect(page.locator('#panel-toggle')).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('#panel-toggle')).toBeFocused();
  await expect(page.locator('#control-panel')).not.toHaveAttribute('aria-modal','true');
  await expect(page.locator('#viewport-shell')).not.toHaveAttribute('aria-hidden','true');
  await page.setViewportSize({width:1100,height:800});
  await expect(page.locator('#panel-toggle')).toHaveAttribute('aria-expanded','true');
  await expect(page.locator('#panel-close')).toBeFocused();
  await expect(page.locator('#control-panel')).toHaveAttribute('aria-modal','true');
  await expect(page.locator('#viewport-shell')).toHaveAttribute('aria-hidden','true');
});
test('disposed panels do not restore modality or move focus on later resizes', async ({page}) => {
  await loadShell(page);
  await page.evaluate(() => window.__uiFixture.dispose());
  const snapshot = () => page.evaluate(() => ({
    appClass: document.getElementById('app')!.className,
    panelAttributes: document.getElementById('control-panel')!.getAttributeNames().sort()
      .map(name => [name, document.getElementById('control-panel')!.getAttribute(name)]),
    viewportHidden: document.getElementById('viewport-shell')!.getAttribute('aria-hidden'),
    viewportInert: document.getElementById('viewport-shell')!.inert,
    focused: document.activeElement?.id,
  }));
  const before = await snapshot();
  for (const width of [1100,1101]) {
    await page.setViewportSize({width,height:800});
    await page.evaluate(() => new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    expect(await snapshot()).toEqual(before);
  }
});
test('modal Tab trap, search Escape precedence, backdrop and close use real focus',async({page})=>{
  await page.setViewportSize({width:390,height:844});await loadShell(page);await page.locator('#panel-toggle').click();
  await expect(page.getByRole('dialog',{name:'Sun Model Lab'})).toBeVisible();
  await page.keyboard.press('Shift+Tab');await expect(page.locator('.panel-disclosure--danger summary')).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.locator('#panel-close')).toBeFocused();
  const visited=await page.evaluate(()=>{const seen:string[]=[];document.addEventListener('focusin',e=>seen.push((e.target as HTMLElement).id));return seen;});
  expect(visited).toEqual([]);
  await page.locator('#body-search').fill('Earth');
  await page.locator('#body-search').dispatchEvent('keydown',{key:'Escape',isComposing:true});
  await expect(page.locator('#body-search')).toHaveValue('Earth');
  await page.locator('#body-search').press('Escape');await expect(page.locator('#body-search')).toHaveValue('');
  await expect(page.locator('#control-panel')).toHaveAttribute('aria-modal','true');
  await page.locator('#body-search').press('Escape');await expect(page.locator('#panel-toggle')).toBeFocused();
  await page.locator('#panel-toggle').click();await page.mouse.click(380,300);await expect(page.locator('#panel-toggle')).toBeFocused();
  await page.locator('#panel-toggle').click();await page.locator('#panel-close').click();await expect(page.locator('#panel-toggle')).toBeFocused();
});
test('focus guarding and empty trap recover to the panel when close is unavailable',async({page})=>{
  await page.setViewportSize({width:390,height:844});await loadShell(page);
  await page.evaluate(()=>{document.querySelectorAll<HTMLElement>('#control-panel button,#control-panel input,#control-panel select,#control-panel summary').forEach(el=>el.hidden=true);window.__uiFixture.setPanelOpen(true);});
  await expect(page.locator('#control-panel')).toBeFocused();await page.keyboard.press('Tab');await expect(page.locator('#control-panel')).toBeFocused();
  await page.evaluate(()=>{document.getElementById('viewport-shell')!.inert=false;document.getElementById('space-canvas')!.focus();});
  await expect(page.locator('#control-panel')).toBeFocused();
  await page.evaluate(()=>window.__uiFixture.dispose());
  await expect(page.locator('#viewport-shell')).not.toHaveAttribute('aria-hidden','true');
});
test('synchronous panel writes never hide the active focus owner',async({page})=>{
  await page.setViewportSize({width:390,height:844});await loadShell(page);
  await page.evaluate(()=>{
    const failures:string[]=[];Object.assign(window,{__focusFailures:failures});
    const check=()=>{const active=document.activeElement as HTMLElement|null;if(active && active!==document.body && (active.closest('[inert],[aria-hidden="true"]') || getComputedStyle(active).visibility==='hidden'))failures.push(active.id);};
    const attribute=Element.prototype.setAttribute;Element.prototype.setAttribute=function(name,value){attribute.call(this,name,value);check();};
    const toggle=DOMTokenList.prototype.toggle;DOMTokenList.prototype.toggle=function(token,force){const value=force===undefined?toggle.call(this,token):toggle.call(this,token,force);check();return value;};
    const inert=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'inert')!;
    Object.defineProperty(HTMLElement.prototype,'inert',{...inert,set(value){inert.set!.call(this,value);check();}});
  });
  await page.locator('#panel-toggle').click();await page.locator('#body-search').focus();await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>(window as unknown as {__focusFailures:string[]}).__focusFailures)).toEqual([]);
});
