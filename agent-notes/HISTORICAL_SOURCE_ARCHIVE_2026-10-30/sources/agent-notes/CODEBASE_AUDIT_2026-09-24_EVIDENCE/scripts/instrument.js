// Injected before any app script. Counts per-frame WebGL work and lifecycle events.
(() => {
  const M = window.__m = { frames: [], cur: null, live: {buf:0,tex:0,prog:0,fb:0}, created:{buf:0,tex:0,prog:0}, deleted:{buf:0,tex:0,prog:0},
    canvasSizeWrites: 0, workerPosts: {}, workerMsgs: 0, rtt: [], gpu: [], timerExt: null, gl: null, errors: [] };
  const newFrame = () => ({ draws: 0, instancedDraws: 0, instances: 0, bufBytes: 0, bufCalls: 0, texUploads: 0, sizeWrites: 0, jsMs: 0, t: 0 });
  M.cur = newFrame();
  const wrap = (proto, name, fn) => { const o = proto[name]; if (!o) return; proto[name] = function (...a) { fn.call(this, a); return o.apply(this, a); }; };
  for (const P of [window.WebGL2RenderingContext && WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype].filter(Boolean)) {
    wrap(P, 'drawArrays', () => M.cur.draws++); wrap(P, 'drawElements', () => M.cur.draws++);
    wrap(P, 'drawArraysInstanced', a => { M.cur.draws++; M.cur.instancedDraws++; M.cur.instances += a[3] || 0; });
    wrap(P, 'drawElementsInstanced', a => { M.cur.draws++; M.cur.instancedDraws++; M.cur.instances += a[4] || 0; });
    wrap(P, 'bufferData', a => { M.cur.bufCalls++; const d = a[1]; M.cur.bufBytes += (d && d.byteLength) || (typeof d === 'number' ? d : 0); });
    wrap(P, 'bufferSubData', a => { M.cur.bufCalls++; const d = a[2]; M.cur.bufBytes += (d && d.byteLength) || 0; });
    wrap(P, 'texImage2D', () => M.cur.texUploads++); wrap(P, 'texSubImage2D', () => M.cur.texUploads++);
    wrap(P, 'createBuffer', () => { M.live.buf++; M.created.buf++; }); wrap(P, 'deleteBuffer', () => { M.live.buf--; M.deleted.buf++; });
    wrap(P, 'createTexture', () => { M.live.tex++; M.created.tex++; }); wrap(P, 'deleteTexture', () => { M.live.tex--; M.deleted.tex++; });
    wrap(P, 'createProgram', () => { M.live.prog++; M.created.prog++; }); wrap(P, 'deleteProgram', () => { M.live.prog--; M.deleted.prog++; });
  }
  for (const k of ['width', 'height']) {
    const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, k);
    Object.defineProperty(HTMLCanvasElement.prototype, k, { get: d.get, set(v) { if (this.id === 'space-canvas') { M.canvasSizeWrites++; M.cur.sizeWrites++; } d.set.call(this, v); }, configurable: true });
  }
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, ...r) { const c = gc.call(this, t, ...r);
    if (c && this.id === 'space-canvas' && !M.gl) { M.gl = c; M.timerExt = c.getExtension && c.getExtension('EXT_disjoint_timer_query_webgl2'); } return c; };
  const raf = window.requestAnimationFrame.bind(window);
  let pendingQ = [];
  window.requestAnimationFrame = cb => raf(ts => {
    const gl = M.gl, ext = M.timerExt; let q = null;
    if (gl && ext && gl.createQuery) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
    const t0 = performance.now(); try { cb(ts); } catch (e) { M.errors.push(String(e)); throw e; }
    M.cur.jsMs += performance.now() - t0;
    if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); pendingQ.push(q); }
    if (gl && ext) pendingQ = pendingQ.filter(qq => { if (!gl.getQueryParameter(qq, gl.QUERY_RESULT_AVAILABLE)) return true;
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) M.gpu.push(gl.getQueryParameter(qq, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(qq); return false; });
  });
  // frame boundary: a dedicated rAF loop records the finished frame's counters
  const tick = ts => { M.cur.t = ts; M.frames.push(M.cur); if (M.frames.length > 20000) M.frames.shift(); M.cur = newFrame(); raf(tick); };
  raf(tick);
  const W = window.Worker;
  window.Worker = function (...a) { const w = new W(...a); const sent = new Map();
    const pm = w.postMessage.bind(w); w.postMessage = (m, ...r) => { const t = m && m.type; M.workerPosts[t] = (M.workerPosts[t] || 0) + 1; if (m && m.sequence != null) sent.set(m.sequence, performance.now()); return pm(m, ...r); };
    w.addEventListener('message', ev => { M.workerMsgs++; const s = ev.data && ev.data.sequence; if (sent.has(s)) { M.rtt.push(performance.now() - sent.get(s)); sent.delete(s); } });
    return w; };
  window.Worker.prototype = W.prototype;
})();
