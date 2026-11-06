import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const file = process.argv[2];
if (!file) {
  console.error('Uso: npm run compiler:run -- <archivo.cf>');
  process.exit(1);
}

const vite = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true },
});

try {
  const [{ runSource }, { formatIR }, { formatError }, { formatSemanticError }] = await Promise.all([
    vite.ssrLoadModule('/src/compiler/run-source.ts'),
    vite.ssrLoadModule('/src/compiler/ir/ir-printer.ts'),
    vite.ssrLoadModule('/src/compiler/errors.ts'),
    vite.ssrLoadModule('/src/compiler/semantic/semantic-errors.ts'),
  ]);
  const result = runSource(readFileSync(file, 'utf8'));

  if (!result.ok) {
    console.error(`\n=== ERROR (${result.stage}) ===`);
    if (result.stage === 'lexical' || result.stage === 'syntax') {
      result.errors.forEach((error) => console.error(formatError(error)));
    } else if (result.stage === 'semantic') {
      result.errors.forEach((error) => console.error(formatSemanticError(error)));
    } else if (result.stage === 'integration') {
      result.errors.forEach((error) => console.error(`[integration] ${error.line}:${error.column} ${error.message}`));
    } else {
      console.error(`[runtime] PC ${result.execution.error?.pc ?? '?'}: ${result.execution.error?.message ?? 'unknown error'}`);
    }
    process.exitCode = 1;
  } else {
    console.log('\n=== IR ===');
    console.log(formatIR(result.ir));
    console.log('\n=== SALIDA ===');
    result.execution.output.forEach((line) => console.log(line));
  }
} finally {
  await vite.close();
}
