import { formatDiagnostic } from '../../compiler';
import { describeOutcome, formatDuration } from '../../lib/runSummary';
import type { CompilationRun } from '../../services/compilerService';

interface ConsoleViewProps {
  run: CompilationRun;
  onShowDiagnostics: () => void;
}

/** Output of `print()` and the final state of the run, taken from `result.execution`. */
export function ConsoleView({ run, onShowDiagnostics }: ConsoleViewProps) {
  const { result, durationMs } = run;
  const outcome = describeOutcome(result);
  const execution = result.execution;

  return (
    <div className="console-view">
      <div className={`outcome outcome--${outcome.kind}`} role="status">
        <span className="outcome__icon" aria-hidden="true">
          {outcome.kind.startsWith('completed') ? '✓' : '✕'}
        </span>
        <div>
          <p className="outcome__title">{outcome.title}</p>
          <p className="outcome__detail">{outcome.detail}</p>
        </div>
        {execution && (
          <dl className="outcome__stats">
            <div>
              <dt>Pasos</dt>
              <dd>{execution.steps}</dd>
            </div>
            <div>
              <dt>Tiempo</dt>
              <dd>{formatDuration(durationMs)}</dd>
            </div>
          </dl>
        )}
      </div>

      {execution ? (
        <pre className="console-output" aria-label="Salida del programa">
          {execution.output.length === 0 && <span className="console-output__muted">(sin salida)</span>}
          {execution.output.map((line, index) => (
            <span key={index} className="console-output__line">
              <span className="console-output__number" aria-hidden="true">
                {index + 1}
              </span>
              {line}
            </span>
          ))}
          {execution.error && (
            <span className="console-output__line console-output__line--error">
              <span className="console-output__number" aria-hidden="true">
                !
              </span>
              {formatDiagnostic(execution.error)}
            </span>
          )}
        </pre>
      ) : (
        <div className="console-compile-error">
          <p>La máquina virtual no se ejecutó porque el programa no compiló.</p>
          <button type="button" className="btn btn--small" onClick={onShowDiagnostics}>
            Ver {result.diagnostics.length} {result.diagnostics.length === 1 ? 'diagnóstico' : 'diagnósticos'}
          </button>
        </div>
      )}
    </div>
  );
}
