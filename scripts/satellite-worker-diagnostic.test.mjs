import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import * as ts from 'typescript';

// Exercise the browser fixture's actual matcher without registering Playwright
// tests in Vitest or starting browsers for each malformed diagnostic control.
const source = readFileSync(new URL('../tests/browser/satellite-worker-admission.spec.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('satellite-worker-admission.spec.ts', source, ts.ScriptTarget.Latest, true);
const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'isExpectedWorkerPageError');
if (!declaration) throw new Error('Worker diagnostic matcher is missing');
const javascript = ts.transpileModule(declaration.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const matches = Function(`${javascript}; return isExpectedWorkerPageError;`)();
const workerUrl = 'http://127.0.0.1:4225/src/frontend/features/planetary/satellitePropagationWorker.ts?worker_file&type=module';
const wrapped = (line = 37) => ({ name: '[JavaScript Error', message:
  `"TypeError: Invalid satellite worker message." {file: "${workerUrl}" line: ${line}}]\n` +
  `self.onmessage@${workerUrl}:${line}:13\nEventHandlerNonNull*@${workerUrl}:11:1\n` });

it.each([19, 37])('accepts the observed Firefox worker wrapper at line %i', line => {
  expect(matches(wrapped(line), workerUrl, 'firefox')).toBe(true);
});

it.each(['Invalid satellite worker message.', 'TypeError: Invalid satellite worker message.', 'Uncaught TypeError: Invalid satellite worker message.'])(
  'preserves the exact ordinary TypeError diagnostic: %s', message => {
    for (const browser of ['chromium', 'firefox', 'webkit']) {
      expect(matches({ name: 'TypeError', message }, workerUrl, browser)).toBe(true);
    }
  });

it.each([
  ['different exception', value => ({ ...value, message: value.message.replace('TypeError:', 'RangeError:') })],
  ['different message', value => ({ ...value, message: value.message.replace('Invalid satellite worker message.', 'Unexpected worker failure.') })],
  ['unrecognized wrapper', value => ({ ...value, name: 'Error' })],
  ['foreign origin', value => ({ ...value, message: value.message.replaceAll('127.0.0.1:4225', 'example.invalid') })],
  ['different worker', value => ({ ...value, message: value.message.replaceAll('satellitePropagationWorker.ts', 'otherWorker.ts') })],
  ['different worker query', value => ({ ...value, message: value.message.replaceAll('type=module', 'type=other') })],
  ['foreign stack frame', value => ({ ...value, message: value.message.replace('EventHandlerNonNull*@http://127.0.0.1:4225', 'EventHandlerNonNull*@http://example.invalid') })],
  ['mismatched throw line', value => ({ ...value, message: value.message.replace('line: 37', 'line: 38') })],
  ['missing stack', value => ({ ...value, message: value.message.split('\n')[0] })],
  ['additional diagnostic', value => ({ ...value, message: value.message + 'TypeError: Unexpected secondary failure.\n' })],
  ['unrecognized stack frame', value => ({ ...value, message: value.message.replace('self.onmessage@', 'otherHandler@') })],
])('rejects a Firefox wrapper with %s', (_label, mutate) => {
  expect(matches(mutate(wrapped()), workerUrl, 'firefox')).toBe(false);
});

it('keeps the Firefox wrapper specific to Firefox and rejects unrelated plain errors', () => {
  for (const browser of ['chromium', 'webkit']) expect(matches(wrapped(), workerUrl, browser)).toBe(false);
  expect(matches({ name: 'Error', message: 'Invalid satellite worker message.' }, workerUrl, 'firefox')).toBe(false);
  expect(matches({ name: 'TypeError', message: 'Invalid satellite worker message. Unexpected extra error.' }, workerUrl, 'webkit')).toBe(false);
});
