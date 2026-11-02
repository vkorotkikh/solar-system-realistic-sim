import { chromium } from 'playwright';
const configs = {
  swiftshader: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
  angle_gl_egl: ['--use-gl=angle','--use-angle=gl-egl','--ignore-gpu-blocklist','--enable-gpu'],
  angle_gl: ['--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist','--enable-gpu'],
  angle_vulkan: ['--use-gl=angle','--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],
};
for (const [name,args] of Object.entries(configs)) {
  for (const headless of [true, false]) {
    let b;
    try {
      b = await chromium.launch({ headless, args: ['--no-sandbox', ...args] });
      const p = await b.newPage();
      await p.setContent('<canvas id=c></canvas>');
      const r = await p.evaluate(() => { const g=document.getElementById('c').getContext('webgl2');
        if(!g) return 'NO WEBGL2'; const d=g.getExtension('WEBGL_debug_renderer_info');
        return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER); });
      console.log(`${name.padEnd(14)} headless=${String(headless).padEnd(5)} -> ${r}`);
    } catch (e) { console.log(`${name.padEnd(14)} headless=${String(headless).padEnd(5)} -> LAUNCH FAIL ${String(e.message).split('\n')[0].slice(0,110)}`); }
    finally { if (b) await b.close(); }
  }
}
