import { test, expect } from '@playwright/test';
import { loadShell } from './helpers';
test('exact presentation and dispatch preserve source, energy and model',async({page})=>{
  test.setTimeout(60_000);
  await loadShell(page);await page.locator('.panel-disclosure--danger summary').click();
  await expect(page.locator('#trigger-agn-shockwave')).toHaveText('Trigger compound shockwave');
  for(const hypothesis of ['h29','compound','h29']){
    await page.locator('#agn-hypothesis').selectOption(hypothesis);
    await expect(page.locator('#trigger-agn-shockwave')).toHaveText(hypothesis==='h29'?'Trigger H29 slipstream':'Trigger compound shockwave');
    await expect(page.locator('#trigger-agn-shockwave svg')).toHaveCount(1);
    await expect(page.locator('#experiment-status')).toHaveAttribute('data-model',hypothesis==='h29'?'speculative':'standard');
    for(const [source,time,intensity] of [['SagittariusA',8,1.4],['CentaurusA',9.5,1.1],['Maffei1',10.5,.7],['M87',12,.5]] as const){
      await page.locator('#agn-source').selectOption(source);
      for(const preset of ['', 'SgrA_WarpWave_H29','M87_Monster']){
        await page.locator('#agn-preset').selectOption(preset);await page.locator('#trigger-agn-shockwave').click();
        expect(await page.evaluate(()=>window.__uiFixture.calls.slice(-1))).toEqual([['trigger',source,time,intensity,{...(preset?{preset}:{}),...(hypothesis==='h29'?{hypothesis:'h29'}:{})}]]);
      }
    }
  }
  await page.locator('label').filter({has:page.locator('#agn-stochastic')}).click();expect(await page.evaluate(()=>window.__uiFixture.calls.slice(-1))).toEqual([['stochastic',true]]);
  await expect(page.locator('#agn-observer-frame')).toHaveCount(0);
  await expect(page.locator('#energy-preset-help')).toHaveText('Energy presets do not change the SMBH source or propagation model.');
});
test('events resolver owns preset selection, source notes and restored hypothesis copy',async({page})=>{
  await loadShell(page);await page.locator('.panel-disclosure--danger summary').click();
  await page.evaluate(()=>{(document.getElementById('agn-hypothesis') as HTMLSelectElement).value='h29';window.__uiFixture.useResolvedPresets();});
  await expect(page.locator('#trigger-agn-shockwave')).toHaveText('Trigger H29 slipstream');
  await expect(page.locator('#experiment-status')).toContainText('canonical orbits unchanged. Reference source note.');
  await page.locator('#agn-source').selectOption('M87');await page.locator('#agn-hypothesis').selectOption('compound');await page.locator('#agn-preset').selectOption('SgrA_WarpWave_H29');
  await expect(page.locator('#agn-source')).toHaveValue('SagittariusA');await expect(page.locator('#agn-hypothesis')).toHaveValue('h29');
  await expect(page.locator('label[for="agn-preset"]')).toHaveText('Event preset');await expect(page.locator('#energy-preset-help')).toContainText('select the source, energy and propagation model');
  await page.locator('#trigger-agn-shockwave').click();expect(await page.evaluate(()=>window.__uiFixture.calls.at(-1))).toEqual(['trigger','SagittariusA',8,1.4,{preset:'SgrA_WarpWave_H29',hypothesis:'h29'}]);
  await page.locator('#agn-source').selectOption('M87');await expect(page.locator('#agn-preset')).toHaveValue('');await page.locator('#agn-hypothesis').selectOption('compound');await page.locator('#trigger-agn-shockwave').click();expect(await page.evaluate(()=>window.__uiFixture.calls.at(-1))).toEqual(['trigger','M87',12,.5,{}]);
});
