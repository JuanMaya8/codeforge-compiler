import { describe, expect, it } from 'vitest';
import {
  createDiagnostic,
  formatDiagnostic,
  LexicalErrorCode,
  SyntaxErrorCode,
  type CompilerDiagnostic,
} from './errors.ts';
import { parseSource } from './frontend.ts';

describe('CompilerDiagnostic contract', () => {
  it('keeps only the fields that are given', () => {
    expect(
      createDiagnostic({ phase: 'syntax', code: 'EXPECTED_TOKEN', message: 'm', position: { line: 2, column: 4 } }),
    ).toEqual({ phase: 'syntax', code: 'EXPECTED_TOKEN', message: 'm', position: { line: 2, column: 4 } });

    // Runtime diagnostics may have no source position but a PC and instruction.
    const runtime = createDiagnostic({
      phase: 'runtime',
      code: 'DIVISION_BY_ZERO',
      message: 'División entre cero.',
      pc: 0,
      instruction: 'DIV',
    });
    expect(runtime).toEqual({
      phase: 'runtime',
      code: 'DIVISION_BY_ZERO',
      message: 'División entre cero.',
      pc: 0,
      instruction: 'DIV',
    });
    expect('position' in runtime).toBe(false);
  });

  it('copies the position instead of sharing the object', () => {
    const position = { line: 1, column: 1 };
    const diagnostic = createDiagnostic({ phase: 'semantic', code: 'TYPE_MISMATCH', message: 'm', position });
    position.line = 99;
    expect(diagnostic.position).toEqual({ line: 1, column: 1 });
  });

  it('formats every optional field', () => {
    const full: CompilerDiagnostic = {
      phase: 'runtime',
      code: 'HEAP_OUT_OF_BOUNDS',
      message: 'Índice fuera de rango.',
      position: { line: 7, column: 3 },
      pc: 12,
      instruction: 'ARRAY_LOAD',
    };
    expect(formatDiagnostic(full)).toBe('[runtime] HEAP_OUT_OF_BOUNDS 7:3 pc=12 (ARRAY_LOAD) Índice fuera de rango.');
    expect(formatDiagnostic({ phase: 'lexical', code: 'UNEXPECTED_CHARACTER', message: 'm' })).toBe(
      '[lexical] UNEXPECTED_CHARACTER m',
    );
  });

  it('is JSON serializable', () => {
    const diagnostic = createDiagnostic({ phase: 'runtime', code: 'X', message: 'm', pc: 3 });
    expect(JSON.parse(JSON.stringify(diagnostic))).toEqual(diagnostic);
  });

  it('uses UPPER_SNAKE_CASE codes that are unique across the frontend', () => {
    const codes = [...Object.values(LexicalErrorCode), ...Object.values(SyntaxErrorCode)];
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[A-Z]+(_[A-Z]+)*$/);
  });

  it('is what the frontend returns for lexical and syntax errors', () => {
    const lexical = parseSource('let a = 1 @ 2;').errors[0];
    const syntax = parseSource('let a = ;').errors[0];
    expect(lexical).toEqual({
      phase: 'lexical',
      code: LexicalErrorCode.UNEXPECTED_CHARACTER,
      message: "Carácter '@' no reconocido.",
      position: { line: 1, column: 11 },
    });
    expect(syntax).toMatchObject({ phase: 'syntax', code: SyntaxErrorCode.EXPECTED_EXPRESSION, position: { line: 1, column: 9 } });
  });
});
