import { describe, expect, it } from 'vitest';
import { createRuntimeUiConfig } from './sceneSetup';
describe('explicit deployment and render configuration', () => {
  it('consumes a nondefault origin and viewport/render settings', () => {
    const config=createRuntimeUiConfig({search:'?uiWidth=195&uiHeight=422&renderScale=1.5&maxPixelRatio=1.25',env:{VITE_BACKEND_ORIGIN:'https://solar.example:9443'}});
    expect(config).toMatchObject({backendOrigin:'https://solar.example:9443',uiWidth:195,uiHeight:422,renderScale:1.5,maxPixelRatio:1.25});
  });
});

import { resolveBackendOrigin, renderPixelRatio } from './runtimeConfig';
import { applyViewportSizeOverride } from './sceneSetup';
it('uses same-origin by default and never permits query-driven backend redirection',()=>{
  expect(createRuntimeUiConfig({env:{},search:'?backendOrigin=https://attacker.example',pageOrigin:'https://observatory.example:8443'}).backendOrigin).toBe('https://observatory.example:8443');
});
it.each(['javascript:alert(1)','//solar.example','https://user:pass@solar.example','https://solar.example/api','https://solar.example?token=x','https://solar.example/#route','http://solar.example'])('rejects invalid or mixed-content backend origin %s',origin=>{
  expect(()=>resolveBackendOrigin(origin,'https://observatory.example')).toThrow();
});
it('applies independent viewport dimensions and actual render scale',()=>{
  const config=createRuntimeUiConfig({env:{VITE_UI_WIDTH:'640',VITE_UI_HEIGHT:'700',VITE_RENDER_SCALE:'2'},search:'?uiWidth=195&renderScale=0.5',pageOrigin:'http://localhost:5180'});
  const viewport={style:{}} as HTMLElement;applyViewportSizeOverride({viewportShell:viewport,runtimeUiConfig:config});
  expect(viewport.style.width).toBe('195px');expect(viewport.style.height).toBe('700px');expect(renderPixelRatio(config,3)).toBe(1);
  const widthOnly=createRuntimeUiConfig({env:{},search:'?uiWidth=480',pageOrigin:'http://localhost'});const partial={style:{}} as HTMLElement;applyViewportSizeOverride({viewportShell:partial,runtimeUiConfig:widthOnly});expect(partial.style.width).toBe('480px');expect(partial.style.height).toBeUndefined();
});
it.each(['?uiWidth=0','?uiHeight=Infinity','?renderScale=4','?maxPixelRatio=NaN'])('rejects invalid supplied viewport configuration %s',search=>{
  expect(()=>createRuntimeUiConfig({env:{},search,pageOrigin:'http://localhost'})).toThrow();
});
