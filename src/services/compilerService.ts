/**
 * The only place of the interface that calls the compiler.
 *
 * It uses the public service `runSource()` from `src/compiler`, which runs
 * Lexer → Parser → semantic analysis → IR → virtual machine. The interface
 * never runs a phase by itself and never builds results on its own.
 */
import { runSource, type SourceRunResult } from '../compiler';

export interface CompilationRun {
  /** The source that was compiled (to detect later edits). */
  source: string;
  result: SourceRunResult;
  /** Wall-clock time of `runSource`, in milliseconds. */
  durationMs: number;
}

export function compileAndRun(source: string): CompilationRun {
  const start = performance.now();
  const result = runSource(source);
  return { source, result, durationMs: performance.now() - start };
}
