import { chromium } from 'playwright'; import fs from 'fs';
const SP = process.env.SP;
const b = await chromium.launch({ headless: false, args: ['--no-sandbox','--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist','--enable-gpu'] });
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } }); const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
await p.goto('http://127.0.0.1:5173/', { waitUntil: 'load' }); await p.waitForTimeout(12000);
async function snapshot() { await cdp.send('HeapProfiler.collectGarbage'); let chunks = [];
  const h = e => chunks.push(e.chunk); cdp.on('HeapProfiler.addHeapSnapshotChunk', h);
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false }); cdp.off('HeapProfiler.addHeapSnapshotChunk', h);
  const s = JSON.parse(chunks.join('')); const f = s.snapshot.meta.node_fields, nt = s.snapshot.meta.node_types[0], N = f.length;
  const iT = f.indexOf('type'), iN = f.indexOf('name'), iS = f.indexOf('self_size'); const agg = {};
  for (let i = 0; i < s.nodes.length; i += N) { const type = nt[s.nodes[i + iT]]; const name = type === 'object' || type === 'closure' || type==='array' ? s.strings[s.nodes[i + iN]] : type;
    const k = `${type}:${name}`.slice(0, 90); const a = agg[k] || (agg[k] = { n: 0, bytes: 0 }); a.n++; a.bytes += s.nodes[i + iS]; }
  return agg; }
const a = await snapshot(); await p.waitForTimeout(240000); const c = await snapshot();
const diff = Object.keys({ ...a, ...c }).map(k => ({ k, dn: (c[k]?.n || 0) - (a[k]?.n || 0), db: (c[k]?.bytes || 0) - (a[k]?.bytes || 0) })).sort((x, y) => y.db - x.db);
const tot = arr => Object.values(arr).reduce((s, v) => s + v.bytes, 0);
console.log(`total self size: ${(tot(a) / 1048576).toFixed(2)} MB -> ${(tot(c) / 1048576).toFixed(2)} MB over 240 s`);
console.log('top growth by constructor (count delta, bytes delta):'); diff.slice(0, 15).forEach(d => console.log(`  ${d.k.padEnd(60)} +${d.dn}  +${(d.db / 1024).toFixed(1)} KB`));
fs.writeFileSync(SP + '/out/heapdiff.json', JSON.stringify(diff.slice(0, 60), null, 1)); await b.close();
