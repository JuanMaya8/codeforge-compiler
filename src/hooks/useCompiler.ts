import { useCallback, useEffect, useRef, useState } from 'react';
import { compileAndRun, type CompilationRun } from '../services/compilerService';

/**
 * State of the last compilation:
 * - idle: nothing has been run yet.
 * - running: results were cleared and the compiler is about to run.
 * - finished: `runSource` returned (successfully or with diagnostics).
 * - crashed: an unexpected exception escaped (should not happen: runSource never throws).
 */
export type RunState =
  | { status: 'idle' }
  | { status: 'running'; source: string }
  | { status: 'finished'; run: CompilationRun }
  | { status: 'crashed'; source: string; message: string };

/** Delay that lets React paint the cleared results and the loading state first. */
const PAINT_DELAY_MS = 40;

interface UseCompilerOptions {
  /** Called once with every finished run (e.g. to choose the tab to show). */
  onFinished?: (run: CompilationRun) => void;
}

export function useCompiler({ onFinished }: UseCompilerOptions = {}) {
  const [state, setState] = useState<RunState>({ status: 'idle' });
  const runIdRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  });

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const run = useCallback((source: string) => {
    const runId = ++runIdRef.current;
    window.clearTimeout(timerRef.current);
    // Old results are discarded as soon as a new run starts.
    setState({ status: 'running', source });

    timerRef.current = window.setTimeout(() => {
      if (runId !== runIdRef.current) return;
      try {
        const finished = compileAndRun(source);
        setState({ status: 'finished', run: finished });
        onFinishedRef.current?.(finished);
      } catch (error) {
        setState({
          status: 'crashed',
          source,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }, PAINT_DELAY_MS);
  }, []);

  return { state, run, running: state.status === 'running' };
}
