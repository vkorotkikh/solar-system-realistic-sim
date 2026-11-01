import { expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

it('type-checks the retired catalog entrypoint without executing it', () => {
  // The legacy normalizers are retired; keep their entrypoint valid TypeScript.
  // Compile without executing the migration diagnostic or setting process.exitCode.
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
