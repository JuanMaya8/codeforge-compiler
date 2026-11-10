import type { CompilerDiagnostic, CompilerPhase, SourceRunResult } from '../../compiler';
import { PHASE_LABELS } from '../../lib/runSummary';
import type { LocateTarget } from '../results/ResultsPanel';
import './DiagnosticsView.css';

interface DiagnosticsViewProps {
  diagnostics: CompilerDiagnostic[];
  stage: SourceRunResult['stage'];
  onLocate: (target: LocateTarget) => void;
}

const PHASE_ORDER: CompilerPhase[] = ['lexical', 'syntax', 'semantic', 'runtime'];

const PHASE_HELP: Record<CompilerPhase, string> = {
  lexical: 'El Lexer encontró caracteres o lexemas que no pertenecen al lenguaje.',
  syntax: 'Los tokens existen, pero no siguen la gramática de CodeForge.',
  semantic: 'El programa está bien escrito, pero no tiene sentido: tipos, nombres o constantes.',
  runtime: 'El programa compiló, pero la máquina virtual falló al ejecutarlo.',
};

/** Real diagnostics returned by `runSource()`, with the common CompilerDiagnostic shape. */
export function DiagnosticsView({ diagnostics, stage, onLocate }: DiagnosticsViewProps) {
  if (diagnostics.length === 0) {
    return (
      <div className="diagnostics-empty">
        <span className="diagnostics-empty__icon" aria-hidden="true">
          ✓
        </span>
        <div>
          <p className="diagnostics-empty__title">Sin diagnósticos</p>
          <p className="diagnostics-empty__text">
            {stage === 'completed'
              ? 'El programa superó las fases léxica, sintáctica y semántica, y se ejecutó sin errores.'
              : 'No se reportaron diagnósticos.'}
          </p>
        </div>
      </div>
    );
  }

  const phases = PHASE_ORDER.filter((phase) => diagnostics.some((diagnostic) => diagnostic.phase === phase));

  return (
    <div className="diagnostics">
      <div className="diagnostics__summary">
        {phases.map((phase) => (
          <p key={phase} className={`diagnostics__phase diagnostics__phase--${phase}`}>
            <span className={`phase-badge phase-badge--${phase}`}>{PHASE_LABELS[phase]}</span>
            <span>
              <strong>{diagnostics.filter((diagnostic) => diagnostic.phase === phase).length}</strong> ·{' '}
              {PHASE_HELP[phase]}
            </span>
          </p>
        ))}
      </div>

      <ol className="diagnostics__list">
        {diagnostics.map((diagnostic, index) => {
          const position = diagnostic.position;
          return (
            <li key={index} className={`diagnostic diagnostic--${diagnostic.phase}`}>
              <div className="diagnostic__header">
                <span className={`phase-badge phase-badge--${diagnostic.phase}`}>{PHASE_LABELS[diagnostic.phase]}</span>
                <code className="diagnostic__code">{diagnostic.code}</code>
              </div>
              <p className="diagnostic__message">{diagnostic.message}</p>
              <dl className="diagnostic__meta">
                <div>
                  <dt>Línea</dt>
                  <dd>{position ? position.line : '—'}</dd>
                </div>
                <div>
                  <dt>Columna</dt>
                  <dd>{position ? position.column : '—'}</dd>
                </div>
                {diagnostic.pc !== undefined && (
                  <div>
                    <dt>PC</dt>
                    <dd>{diagnostic.pc}</dd>
                  </div>
                )}
                {diagnostic.instruction !== undefined && (
                  <div>
                    <dt>Instrucción</dt>
                    <dd>{diagnostic.instruction}</dd>
                  </div>
                )}
              </dl>
              {position && (
                <button
                  type="button"
                  className="btn btn--ghost btn--small diagnostic__locate"
                  onClick={() => onLocate({ line: position.line, column: position.column })}
                >
                  Ir a la línea {position.line}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
