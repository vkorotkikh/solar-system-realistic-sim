// FE-WORKER-PARENT: owned child only; load the real model without global require hooks.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(process.argv[2]);
const realRequire = createRequire(path.join(root, 'package.json'));
const ts = realRequire('typescript');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const localRequire = specifier => {
    if (!specifier.startsWith('.')) return realRequire(specifier);
    const base = path.resolve(path.dirname(file), specifier);
    const resolved = [base, base + '.ts', base + '.json', path.join(base, 'index.ts')]
      .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!resolved) throw new Error('Cannot resolve ' + specifier);
    return resolved.endsWith('.json') ? JSON.parse(fs.readFileSync(resolved, 'utf8')) : load(resolved);
  };
  vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(
    localRequire, module, module.exports);
  return module.exports;
}
if (!process.send) throw new Error('Owned constructor fixture requires IPC');
const { SolarSystemModel } = load(path.join(root, 'src/sim/solarSystemModel.ts'));
process.once('message', message => {
  if (message?.type !== 'construct') throw new Error('Unexpected owned constructor command');
  process.stdout.write('ENTERING_ACTUAL_CONSTRUCTOR\n', () => {
    process.send({ type: 'entered' }, error => {
      if (error) throw error;
      const bodies = [{ id: 'same', orbit: null }, { id: 'same', parentId: 'same', orbit: null }];
      let result;
      try {
        new SolarSystemModel({ bodies });
        result = { rejected: false };
      } catch (error) {
        result = { rejected: true, name: error?.name, message: String(error?.message ?? error),
          isError: error instanceof Error, isRangeError: error instanceof RangeError };
      }
      process.stdout.write(JSON.stringify(result) + '\n', () => process.disconnect());
    });
  });
});
process.send({ type: 'ready' });
