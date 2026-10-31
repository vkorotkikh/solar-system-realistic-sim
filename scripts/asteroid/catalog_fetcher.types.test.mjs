import { expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

it('type-checks the nullable epochs emitted by the JPL and MPC normalizers', () => {
  // Compile the real script without executing its network or output operations.
  // The application tsconfig only includes src/, so it does not cover this file.
  const source = fileURLToPath(new URL('./catalog_fetcher.ts', import.meta.url));
  const program = ts.createProgram([source], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: ['node'],
  });
  const errors = ts.getPreEmitDiagnostics(program).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  expect(errors.map(diagnostic => ts.flattenDiagnosticMessageText(
    diagnostic.messageText, '\n',
  ))).toEqual([]);
});
