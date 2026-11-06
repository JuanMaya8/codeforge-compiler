import type { SourcePosition } from './tokens.ts';

/**
 * Compiler phase that reported an error.
 * The frontend only produces 'lexical' and 'syntax' errors; the other
 * values are reserved so the semantic analyzer and the VM can reuse the
 * same error shape.
 */
export type CompilerPhase = 'lexical' | 'syntax' | 'semantic' | 'runtime';

/**
 * Error reported by any phase of the compiler.
 * It is a plain object (not an exception) so a phase can collect several
 * errors and the UI can display them all at once.
 */
export interface CompilerError extends SourcePosition {
  phase: CompilerPhase;
  message: string;
}

export function createError(
  phase: CompilerPhase,
  message: string,
  position: SourcePosition,
): CompilerError {
  return { phase, message, line: position.line, column: position.column };
}

/** Human readable form, e.g. `[syntax] 3:14 Se esperaba ';' ...`. */
export function formatError(error: CompilerError): string {
  return `[${error.phase}] ${error.line}:${error.column} ${error.message}`;
}
