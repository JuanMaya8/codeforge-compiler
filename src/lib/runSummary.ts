/**
 * Pure functions that turn a `SourceRunResult` into what the interface shows.
 * They only read the real result; they never compute compiler data.
 */
import type { CompilerDiagnostic, CompilerPhase, SourceRunResult } from '../compiler';
import type { RunState } from '../hooks/useCompiler';
import type { StatusIndicator } from './status';

export const PHASE_LABELS: Record<CompilerPhase, string> = {
  lexical: 'Léxico',
  syntax: 'Sintáctico',
  semantic: 'Semántico',
  runtime: 'Ejecución',
};

export type ResultTab = 'tokens' | 'ast' | 'ir' | 'diagnostics' | 'console' | 'memory';

export type OutcomeKind = 'completed' | 'completed-empty' | 'runtime-error' | 'compile-error';

export interface RunOutcome {
  kind: OutcomeKind;
  title: string;
  detail: string;
}

/** Phases that run before execution: a failure there is a compilation error. */
export function isCompilePhase(stage: SourceRunResult['stage']): stage is Exclude<CompilerPhase, 'runtime'> {
  return stage === 'lexical' || stage === 'syntax' || stage === 'semantic';
}

export function describeOutcome(result: SourceRunResult): RunOutcome {
  if (result.ok) {
    const lines = result.execution?.output.length ?? 0;
    return lines > 0
      ? {
          kind: 'completed',
          title: 'Ejecución completada',
          detail: `${lines} ${lines === 1 ? 'línea' : 'líneas'} de salida`,
        }
      : { kind: 'completed-empty', title: 'Ejecución completada', detail: 'El programa no produjo salida' };
  }
  if (result.stage === 'runtime') {
    return { kind: 'runtime-error', title: 'Ejecución fallida', detail: 'La máquina virtual se detuvo con un error' };
  }
  const phase = isCompilePhase(result.stage) ? PHASE_LABELS[result.stage].toLowerCase() : result.stage;
  return {
    kind: 'compile-error',
    title: 'Error de compilación',
    detail: `Falló el análisis ${phase}; el programa no se ejecutó`,
  };
}

export function compilerStatus(state: RunState): StatusIndicator {
  switch (state.status) {
    case 'idle':
      return { tone: 'idle', label: 'Listo' };
    case 'running':
      return { tone: 'running', label: 'Compilando…' };
    case 'crashed':
      return { tone: 'error', label: 'Error interno', detail: state.message };
    case 'finished': {
      const { result } = state.run;
      if (isCompilePhase(result.stage)) {
        return { tone: 'error', label: `Error ${PHASE_LABELS[result.stage].toLowerCase()}`, detail: countDiagnostics(result.diagnostics) };
      }
      return { tone: 'success', label: 'Compilado', detail: `IR v${result.ir?.version ?? '?'}` };
    }
  }
}

export function executionStatus(state: RunState): StatusIndicator {
  switch (state.status) {
    case 'idle':
      return { tone: 'idle', label: 'Sin ejecutar' };
    case 'running':
      return { tone: 'running', label: 'Ejecutando…' };
    case 'crashed':
      return { tone: 'error', label: 'Interrumpida' };
    case 'finished': {
      const { result, durationMs } = state.run;
      const execution = result.execution;
      if (!execution) return { tone: 'idle', label: 'No ejecutado' };
      const detail = `${execution.steps} pasos · ${formatDuration(durationMs)}`;
      return execution.status === 'completed'
        ? { tone: 'success', label: 'Completada', detail }
        : { tone: 'error', label: 'Fallida', detail };
    }
  }
}

/** Phase of the first diagnostic on each line, to mark the editor gutter. */
export function diagnosticLineMarkers(diagnostics: readonly CompilerDiagnostic[]): Map<number, CompilerPhase> {
  const markers = new Map<number, CompilerPhase>();
  for (const diagnostic of diagnostics) {
    const line = diagnostic.position?.line;
    if (line !== undefined && !markers.has(line)) markers.set(line, diagnostic.phase);
  }
  return markers;
}

/** Tab to open after a run: diagnostics on failure, console on success. */
export function defaultTabFor(result: SourceRunResult): ResultTab {
  return result.ok ? 'console' : 'diagnostics';
}

export function formatDuration(ms: number): string {
  return ms < 1 ? '<1 ms' : `${ms.toFixed(ms < 10 ? 1 : 0)} ms`;
}

function countDiagnostics(diagnostics: readonly CompilerDiagnostic[]): string {
  return `${diagnostics.length} ${diagnostics.length === 1 ? 'diagnóstico' : 'diagnósticos'}`;
}
