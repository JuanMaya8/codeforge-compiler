import { describe, expect, it } from 'vitest';
import { runSource } from '../compiler';
import { buildAstTree, countAstNodes } from './astTree';
import {
  compilerStatus,
  defaultTabFor,
  describeOutcome,
  diagnosticLineMarkers,
  executionStatus,
  formatDuration,
} from './runSummary';
import { formatRuntimeValue, runtimeValueKind } from './runtimeFormat';
import { countLines, lineEndOf, offsetOf, positionOf } from './sourceText';
import { tokenCategory } from './tokenCategory';

const finished = (source: string) => ({
  status: 'finished' as const,
  run: { source, result: runSource(source), durationMs: 2.5 },
});

describe('runSummary', () => {
  it('describes completed runs with and without output', () => {
    expect(describeOutcome(runSource('print(1);'))).toMatchObject({ kind: 'completed', detail: '1 línea de salida' });
    expect(describeOutcome(runSource('let x: int = 1;'))).toMatchObject({ kind: 'completed-empty' });
  });

  it('separates compilation errors from runtime errors', () => {
    expect(describeOutcome(runSource('let x = ;')).kind).toBe('compile-error');
    expect(describeOutcome(runSource('let x: int = "a";')).detail).toContain('semántico');
    expect(describeOutcome(runSource('let z: int = 0; print(1 / z);')).kind).toBe('runtime-error');
  });

  it('builds the top bar indicators from the run state', () => {
    expect(compilerStatus({ status: 'idle' })).toEqual({ tone: 'idle', label: 'Listo' });
    expect(executionStatus({ status: 'running', source: '' }).tone).toBe('running');

    const ok = finished('print(2);');
    expect(compilerStatus(ok)).toMatchObject({ tone: 'success', detail: 'IR v2.0' });
    expect(executionStatus(ok)).toMatchObject({ tone: 'success', label: 'Completada' });

    const syntax = finished('print(2)');
    expect(compilerStatus(syntax)).toMatchObject({ tone: 'error', label: 'Error sintáctico' });
    expect(executionStatus(syntax)).toMatchObject({ tone: 'idle', label: 'No ejecutado' });

    const runtime = finished('let z: int = 0; print(1 / z);');
    expect(compilerStatus(runtime).tone).toBe('success');
    expect(executionStatus(runtime)).toMatchObject({ tone: 'error', label: 'Fallida' });

    expect(compilerStatus({ status: 'crashed', source: '', message: 'boom' })).toMatchObject({ tone: 'error' });
  });

  it('marks the first diagnostic phase of each line', () => {
    const result = runSource('let a = 1 @ 2;\nlet b = #;');
    expect([...diagnosticLineMarkers(result.diagnostics)]).toEqual([
      [1, 'lexical'],
      [2, 'lexical'],
    ]);
  });

  it('opens diagnostics on failure and the console on success', () => {
    expect(defaultTabFor(runSource('print(1);'))).toBe('console');
    expect(defaultTabFor(runSource('print(1)'))).toBe('diagnostics');
  });

  it('formats durations', () => {
    expect(formatDuration(0.2)).toBe('<1 ms');
    expect(formatDuration(3.456)).toBe('3.5 ms');
    expect(formatDuration(42.4)).toBe('42 ms');
  });
});

describe('astTree', () => {
  it('labels nodes with kind, summary, role and position from the real AST', () => {
    const ast = runSource('let age: int = 21;').ast!;
    const tree = buildAstTree(ast);
    expect(tree).toMatchObject({ label: 'Program', isNode: true });

    const declaration = tree.children[0].children[0];
    expect(declaration).toMatchObject({
      label: 'VariableDeclaration',
      role: 'body[0]',
      detail: 'let age',
      position: { line: 1, column: 1 },
    });
    expect(declaration.children.map((child) => [child.role, child.label, child.detail])).toEqual([
      ['typeAnnotation', 'PrimitiveType', 'int'],
      ['initializer', 'LiteralExpression', 'int 21'],
    ]);
  });

  it('shows null fields and counts every AST node', () => {
    const ast = runSource('function f() { return; }').ast!;
    const tree = buildAstTree(ast);
    const fn = tree.children[0].children[0];
    expect(fn.children.map((child) => child.label)).toContain('returnType: null');
    // Program, FunctionDeclaration, BlockStatement, ReturnStatement
    expect(countAstNodes(tree)).toBe(4);
  });
});

describe('runtimeFormat', () => {
  it('formats every runtime value kind', () => {
    expect(formatRuntimeValue(42)).toBe('42');
    expect(formatRuntimeValue('hola')).toBe('"hola"');
    expect(formatRuntimeValue(true)).toBe('true');
    expect(formatRuntimeValue(null)).toBe('null');
    expect(formatRuntimeValue({ address: 3 })).toBe('@3');
    expect(runtimeValueKind({ address: 1 })).toBe('reference');
    expect(runtimeValueKind(1.5)).toBe('number');
  });
});

describe('sourceText', () => {
  const text = 'let a = 1;\n  print(a);\n';

  it('converts between line:column and offsets', () => {
    expect(offsetOf(text, 2, 3)).toBe(13);
    expect(positionOf(text, 13)).toEqual({ line: 2, column: 3 });
    expect(offsetOf(text, 9, 1)).toBe(text.length);
    expect(offsetOf(text, 1, 99)).toBe(10); // clamped to the end of the line
    expect(lineEndOf(text, 13)).toBe(22); // "  print(a);" spans offsets 11..21
    expect(countLines(text)).toBe(3);
  });
});

describe('tokenCategory', () => {
  it('groups token types for coloring', () => {
    expect(['LET', 'INT', 'INT_LITERAL', 'STRING_LITERAL', 'IDENTIFIER', 'PLUS', 'EOF'].map(tokenCategory)).toEqual([
      'keyword',
      'type',
      'number',
      'string',
      'identifier',
      'symbol',
      'eof',
    ]);
  });
});
