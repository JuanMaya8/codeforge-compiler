import type { SourcePosition } from './tokens.ts';

/**
 * Common diagnostic contract for every phase of the compiler.
 *
 * All phases (lexer, parser, semantic analyzer, virtual machine) report
 * problems with this same shape, so the UI can show them in one list.
 * Diagnostics are plain objects (not exceptions): a phase can collect
 * several of them and they can be serialized to JSON.
 */
export type CompilerPhase = 'lexical' | 'syntax' | 'semantic' | 'runtime';

export interface CompilerDiagnostic {
  phase: CompilerPhase;
  /** Stable identifier in UPPER_SNAKE_CASE, e.g. `UNTERMINATED_STRING`. Useful for tests and the UI. */
  code: string;
  /** Human readable message in Spanish. */
  message: string;
  /** Source location. Always present for lexical and syntax diagnostics. */
  position?: SourcePosition;
  /** Program counter of the failing IR instruction (runtime diagnostics). */
  pc?: number;
  /** Opcode or text of the failing IR instruction (runtime diagnostics). */
  instruction?: string;
}

/**
 * Stable codes of the lexical phase.
 * Other phases define their own codes; `CompilerDiagnostic.code` is a plain string.
 */
export const LexicalErrorCode = {
  UNEXPECTED_CHARACTER: 'UNEXPECTED_CHARACTER',
  UNTERMINATED_STRING: 'UNTERMINATED_STRING',
  INVALID_ESCAPE: 'INVALID_ESCAPE',
  UNTERMINATED_COMMENT: 'UNTERMINATED_COMMENT',
  MALFORMED_NUMBER: 'MALFORMED_NUMBER',
} as const;

export type LexicalErrorCode = (typeof LexicalErrorCode)[keyof typeof LexicalErrorCode];

/** Stable codes of the syntax phase. */
export const SyntaxErrorCode = {
  /** A specific token was required (`;`, `)`, `{`, a name...). */
  EXPECTED_TOKEN: 'EXPECTED_TOKEN',
  EXPECTED_EXPRESSION: 'EXPECTED_EXPRESSION',
  EXPECTED_TYPE: 'EXPECTED_TYPE',
  CONST_WITHOUT_INITIALIZER: 'CONST_WITHOUT_INITIALIZER',
  MISSING_TYPE_OR_INITIALIZER: 'MISSING_TYPE_OR_INITIALIZER',
  INVALID_ASSIGNMENT_TARGET: 'INVALID_ASSIGNMENT_TARGET',
  INVALID_CALLEE: 'INVALID_CALLEE',
  NESTED_FUNCTION: 'NESTED_FUNCTION',
} as const;

export type SyntaxErrorCode = (typeof SyntaxErrorCode)[keyof typeof SyntaxErrorCode];

/** Builds a diagnostic, leaving out optional fields that are not given. */
export function createDiagnostic(diagnostic: CompilerDiagnostic): CompilerDiagnostic {
  const result: CompilerDiagnostic = {
    phase: diagnostic.phase,
    code: diagnostic.code,
    message: diagnostic.message,
  };
  if (diagnostic.position) {
    result.position = { line: diagnostic.position.line, column: diagnostic.position.column };
  }
  if (diagnostic.pc !== undefined) result.pc = diagnostic.pc;
  if (diagnostic.instruction !== undefined) result.instruction = diagnostic.instruction;
  return result;
}

/**
 * Human readable form of a diagnostic:
 *
 *   [syntax] EXPECTED_TOKEN 3:14 Se esperaba ';' ...
 *   [runtime] DIVISION_BY_ZERO pc=12 (DIV) División entre cero.
 */
export function formatDiagnostic(diagnostic: CompilerDiagnostic): string {
  const parts = [`[${diagnostic.phase}]`, diagnostic.code];
  if (diagnostic.position) parts.push(`${diagnostic.position.line}:${diagnostic.position.column}`);
  if (diagnostic.pc !== undefined) parts.push(`pc=${diagnostic.pc}`);
  if (diagnostic.instruction !== undefined) parts.push(`(${diagnostic.instruction})`);
  parts.push(diagnostic.message);
  return parts.join(' ');
}
