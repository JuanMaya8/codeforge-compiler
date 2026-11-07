/**
 * Shows the output of the compiler frontend for a CodeForge file.
 *
 *   npm run frontend:demo -- examples/demo.cf
 *   npm run frontend:demo -- examples/errores-sintacticos.cf
 *
 * Requires Node.js 22.18+ (runs TypeScript directly).
 */
import { readFileSync } from 'node:fs';
import { formatDiagnostic, parseSource, printAst } from '../src/compiler/frontend.ts';

const file = process.argv[2];
if (!file) {
  console.error('Uso: npm run frontend:demo -- <archivo.cf>');
  process.exit(1);
}

const result = parseSource(readFileSync(file, 'utf8'));

console.log(`\n=== TOKENS (${result.tokens.length}) ===`);
for (const token of result.tokens) {
  const position = `${token.line}:${token.column}`.padEnd(7);
  const literal = token.literal === null ? '' : `  → ${JSON.stringify(token.literal)}`;
  console.log(`${position} ${token.type.padEnd(15)} ${token.lexeme}${literal}`);
}

if (result.program) {
  console.log('\n=== AST ===');
  console.log(printAst(result.program));
}

console.log('\n=== RESULTADO ===');
if (result.success) {
  console.log('Sin errores léxicos ni sintácticos.');
} else {
  result.errors.forEach((error) => console.log(formatDiagnostic(error)));
  process.exitCode = 1;
}
