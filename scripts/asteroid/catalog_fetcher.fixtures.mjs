// Shared boundary fixtures for the retired CLI and its maintained Python replacement.
// All fabricated provider rows and artifacts stay in an owned temporary directory.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const script = join(root, 'scripts/asteroid/catalog_fetcher.ts');

function snapshot(directory) {
  if (!existsSync(directory)) return null;
  return Object.fromEntries(readdirSync(directory).sort().map(name => {
    const path = join(directory, name);
    return [name, statSync(path).isDirectory() ? snapshot(path) : readFileSync(path).toString('hex')];
  }));
}

const retiredGuard = `
import fs from 'node:fs';
import promises from 'node:fs/promises';
import net from 'node:net';
import { resolve, sep } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
const forbidden = () => { process.stderr.write('UNEXPECTED_ACQUISITION_OR_WRITE\\n'); process.exit(91); };
globalThis.fetch = forbidden;
net.Socket.prototype.connect = forbidden;
for (const api of [fs, promises]) {
  for (const name of ['writeFile', 'appendFile', 'mkdir', 'rename', 'unlink', 'rm', 'createWriteStream']) {
    if (name in api) api[name] = forbidden;
    if (name + 'Sync' in api) api[name + 'Sync'] = forbidden;
  }
  // Native module loading remains real; touching any owned cache/output is forbidden.
  for (const name of ['readFile', 'readFileSync', 'stat', 'statSync', 'open', 'openSync']) {
    if (!(name in api)) continue;
    const original = api[name];
    api[name] = function(path, ...args) {
      if (typeof path === 'string' && resolve(path).startsWith(process.cwd() + sep)) forbidden();
      return original.call(this, path, ...args);
    };
  }
}
syncBuiltinESMExports();
`;

export function assertRetired(args = [], files = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'asteroid-retired-'));
  try {
    for (const [name, bytes] of Object.entries(files)) {
      const path = join(cwd, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes);
    }
    const before = snapshot(cwd);
    const result = spawnSync(process.execPath, [
      '--import', `data:text/javascript,${encodeURIComponent(retiredGuard)}`, script, ...args,
    ], { cwd, encoding: 'utf8', timeout: 5000,
      env: { PATH: dirname(process.execPath), LANG: 'C.UTF-8', TZ: 'UTC' } });
    const detail = JSON.stringify(result);
    assert.equal(result.error, undefined, detail);
    assert.equal(result.signal, null, detail);
    assert.equal(result.status, 1, detail);
    assert.equal(result.stdout, '', detail);
    assert.match(result.stderr, /legacy asteroid fetcher is retired/i);
    assert.match(result.stderr, /build_asteroid_phase1_dataset\.py --offline --check/);
    assert.match(result.stderr, /build_asteroid_phase1_dataset\.py --offline --write/);
    assert.doesNotMatch(result.stderr, /UNEXPECTED_ACQUISITION_OR_WRITE/);
    assert.deepEqual(snapshot(cwd), before, 'retirement must preserve all cache/output bytes');
    return result;
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

export function sbdbRow(changes = {}) {
  return { spkid: '2000001', full_name: '1 Synthetic fixture', a: '2.7', e: '0.125',
    i: '12.34567', om: '34', w: '56', ma: '278.12345', per: '1680.5', epoch: '2451545',
    diameter: '12.5', h: '9.5', albedo: null, spec_b: null, spec_t: null, class: 'MBA', ...changes };
}

const pythonFixture = String.raw`
import contextlib, gzip, hashlib, io, json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(sys.argv[1]) / "scripts"))
import build_asteroid_phase1_dataset as builder
from catalog_sources import request_url
request = json.load(sys.stdin)
cwd = Path.cwd()
def guard(event, args):
    if event in ("socket.connect", "socket.getaddrinfo", "subprocess.Popen", "os.system"):
        raise AssertionError("unexpected acquisition: " + event)
    if event == "open":
        path, mode, flags = args
        writing = flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND)
        if writing and (request["mode"] == "records" or not Path(path).resolve().is_relative_to(cwd)):
            raise AssertionError("unexpected write: " + str(path))
sys.addaudithook(guard)
output = io.StringIO()
result = {}
with contextlib.redirect_stdout(output):
    try:
        if request["mode"] == "records":
            records, taxonomy, classes = builder._build_records(request["rows"])
            result = {"records": records, "binary": builder._pack_binary(records).hex(),
                      "taxonomy": taxonomy, "classes": classes}
        else:
            # Exercise the real hash-checked SourceStore and CLI, not a mocked builder.
            rows = request["rows"]
            if request.get("complete"):
                rows = rows + [dict(rows[0], spkid=str(3000000 + i), diameter="1")
                               for i in range(100000 - len(rows))]
            params = builder.phase1_query_params()
            fields = params["fields"].split(",")
            raw = json.dumps({"signature": {"version": "1.0", "source": "synthetic test fixture"},
                              "fields": fields, "count": str(len(rows)),
                              "data": [[row.get(field.lower()) for field in fields] for row in rows]}).encode()
            url = request_url(builder.SBDB_API_URL, params)
            key = hashlib.sha256(url.encode("ascii")).hexdigest()
            source = cwd / "source"
            source.mkdir()
            (source / (key + ".json.gz")).write_bytes(gzip.compress(raw))
            (source / "manifest.json").write_text(json.dumps({"schemaVersion": 1, "responses": {
                key: {"url": url, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(),
                      "capturedUtc": "2000-01-01T00:00:00Z"}}}))
            sys.argv = ["build_asteroid_phase1_dataset.py", "--offline", "--source-dir", str(source),
                        "--output-dir", str(cwd / "output"), "--limit", "2", *request["args"]]
            builder.main()
    except ValueError as error:
        result = {"error": str(error)}
result["stdout"] = output.getvalue()
print(json.dumps(result, allow_nan=False))
`;

function runPython(request, inspect = result => result, existing = false) {
  const cwd = mkdtempSync(join(tmpdir(), 'asteroid-builder-'));
  try {
    const output = join(cwd, 'output');
    if (existing) {
      mkdirSync(output);
      for (const name of ['asteroid_phase1_main_100000.bin', 'asteroid_phase1_main_100000.meta.json', 'sample_top_10.json']) {
        writeFileSync(join(output, name), `old ${name}\n\0preserve bytes`);
      }
    }
    const before = snapshot(output);
    const result = spawnSync(process.env.PYTHON ?? 'python3', ['-B', '-c', pythonFixture, root], {
      cwd, input: JSON.stringify(request), encoding: 'utf8', timeout: 20000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, maxBuffer: 4 * 1024 * 1024,
    });
    const detail = JSON.stringify(result);
    assert.equal(result.error, undefined, detail);
    assert.equal(result.signal, null, detail);
    assert.equal(result.status, 0, detail);
    assert.equal(result.stderr, '', detail);
    return inspect(JSON.parse(result.stdout), output, before);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

export function buildRows(rows) {
  return runPython({ mode: 'records', rows });
}

export function checkBuilderPublication(rows, { args = ['--write'], existing = false, complete = false, error } = {}) {
  return runPython({ mode: 'dataset', rows, args, complete }, (result, output, before) => {
    if (error) {
      assert.match(result.error ?? '', error);
      assert.doesNotMatch(result.stdout, /\[phase1\].*(built|validated|byte-identical)/);
    } else {
      assert.equal(result.error, undefined);
    }
    if (error || !args.includes('--write')) {
      assert.deepEqual(snapshot(output), before, 'failed/preview generation must not publish any artifacts');
    } else {
      const sample = JSON.parse(readFileSync(join(output, 'sample_top_10.json'), 'utf8'));
      const meta = JSON.parse(readFileSync(join(output, 'asteroid_phase1_main_100000.meta.json'), 'utf8'));
      const bytes = readFileSync(join(output, 'asteroid_phase1_main_100000.bin'));
      return { ...result, sample, meta, bytes };
    }
    return result;
  }, existing);
}
