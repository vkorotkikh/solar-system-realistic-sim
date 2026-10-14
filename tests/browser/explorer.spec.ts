import { test, expect } from '@playwright/test';
import { loadShell } from './helpers';
test('preferred selection survives filtering, no matches and native presentation switches',async({page})=>{
  await loadShell(page);await page.locator('#body-list').selectOption('earth');
  await page.locator('#body-search').fill('  STAR ');await expect(page.locator('#body-list')).toHaveValue('sun');
  await page.locator('#body-search').fill('');await expect(page.locator('#body-list')).toHaveValue('earth');
  await page.locator('#body-search').fill('not-a-body');
  for(const id of ['body-list','focus-body','follow-body'])await expect(page.locator('#'+id)).toBeDisabled();
  await expect(page.locator('#body-info')).toBeHidden();await expect(page.locator('#body-empty-state')).toHaveText('No matching bodies. Clear the search to restore the list.');await expect(page.locator('#clear-follow')).toBeEnabled();
  await page.locator('#body-search').press('Escape');await expect(page.locator('#body-list')).toHaveValue('earth');await expect(page.locator('#body-info-name')).toHaveText('Earth');
  await page.setViewportSize({width:600,height:800});await page.locator('#panel-toggle').click();
  await expect(page.locator('#body-list')).toHaveAttribute('size','1');
  await page.locator('#body-list').focus();await page.setViewportSize({width:601,height:800});await expect(page.locator('#body-list')).toBeFocused();await expect(page.locator('#body-list')).toHaveValue('earth');
});
test('search announces only changed counts, card updates without a live region and solar output remains separate',async({page})=>{
  await loadShell(page);await page.locator('#body-search').fill('Earth');
  await page.evaluate(()=>{const records:MutationRecord[]=[];new MutationObserver(items=>records.push(...items)).observe(document.getElementById('body-match-count')!,{childList:true,characterData:true,subtree:true});Object.assign(window,{__countMutations:records});});
  await page.locator('#body-search').fill('Sun');await expect(page.locator('#body-info-name')).toHaveText('Sun');
  expect(await page.evaluate(()=>(window as unknown as {__countMutations:unknown[]}).__countMutations.length)).toBe(0);
  await expect(page.locator('#body-search')).toHaveAttribute('aria-describedby','body-search-help');
  await expect(page.locator('#body-match-count')).toHaveAttribute('aria-atomic','true');await expect(page.locator('#body-info')).not.toHaveAttribute('aria-live');
  await page.evaluate(()=>window.__uiFixture.setSolarStatus('Sun data unavailable at https://solar.example:9443'));
  await expect(page.locator('#status-solar-announcer')).toHaveText('Sun data unavailable.');await expect(page.locator('#status-catalog')).toHaveAttribute('aria-live','polite');
});
test('unchanged time values produce no real DOM mutations; rollover, reverse and Jump to now remain usable',async({page})=>{
  await loadShell(page);await page.evaluate(()=>{
    window.__uiFixture.setAutoFrame(false);window.__uiFixture.setTime(2451545,4);
    const records:MutationRecord[]=[];const observer=new MutationObserver(items=>records.push(...items));
    for(const id of ['time-date','time-scale-value'])observer.observe(document.getElementById(id)!,{attributes:true,childList:true,characterData:true,subtree:true});
    Object.assign(window,{__hudMutations:records});
    for(let i=0;i<20;i++)window.__uiFixture.setTime(2451545+.001*i,4);
  });
  expect(await page.evaluate(()=>(window as unknown as {__hudMutations:unknown[]}).__hudMutations.length)).toBe(0);
  await page.evaluate(()=>window.__uiFixture.setTime(2451546,-4));await expect(page.locator('#time-scale-value')).toHaveText('-4.0 d/s');
  await page.locator('#now-time').click();await page.evaluate(()=>window.__uiFixture.step());
  await expect(page.locator('#time-date')).toHaveAttribute('datetime','2000-01-01');
});
