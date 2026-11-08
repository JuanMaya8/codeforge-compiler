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
  logLevel: 'error',
  server: { middlewareMode: true },
});

function formatValue(value) {
  if (value === null) return 'null';
  if (typeof value === 'object') return `@${value.address}`;
  return JSON.stringify(value);
}

try {
  const { runSource, formatIR, formatIRType, formatDiagnostic } = await vite.ssrLoadModule('/src/compiler/index.ts');
  const result = runSource(readFileSync(file, 'utf8'));

  if (result.ir) {
    console.log(`\n=== IR ${result.ir.version} ===`);
    console.log(formatIR(result.ir, { positions: true }));
  }
  if (result.execution) {
    console.log('\n=== SALIDA ===');
    result.execution.output.forEach((line) => console.log(line));

    console.log('\n=== HEAP ===');
    if (result.execution.heap.length === 0) console.log('(vacío)');
    result.execution.heap.forEach((block) => {
      console.log(`@${block.address} ${formatIRType(block.elementType)}[${block.values.length}] = [${block.values.map(formatValue).join(', ')}]`);
    });
    console.log(`\nEstado: ${result.execution.status}, pasos: ${result.execution.steps}`);
  }

  if (!result.ok) {
    console.error(`\n=== ERROR (${result.stage}) ===`);
    result.diagnostics.forEach((diagnostic) => console.error(formatDiagnostic(diagnostic)));
    if (result.execution?.stack.length) {
      console.error('Stack:', result.execution.stack.map((frame) => `${frame.functionName}@pc=${frame.pc}`).join(' > '));
    }
    process.exitCode = 1;
  }
} finally {
  await vite.close();
}
