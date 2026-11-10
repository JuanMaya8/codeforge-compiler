import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { RunState } from '../../hooks/useCompiler';
import type { ResultTab } from '../../lib/runSummary';
import type { CompilationRun } from '../../services/compilerService';
import { DiagnosticsView } from '../diagnostics/DiagnosticsView';
import { AstView } from './AstView';
import { ConsoleView } from './ConsoleView';
import { EmptyState } from './EmptyState';
import { IrView } from './IrView';
import { TokensView } from './TokensView';
import './results.css';

/** A source location the user asked to see in the editor. */
export interface LocateTarget {
  line: number;
  column: number;
  length?: number;
}

interface ResultsPanelProps {
  state: RunState;
  /** Current editor text, to warn when results belong to an older version. */
  currentSource: string;
  activeTab: ResultTab;
  onTabChange: (tab: ResultTab) => void;
  onLocate: (target: LocateTarget) => void;
}

interface TabDefinition {
  id: ResultTab;
  label: string;
  /** Number shown next to the label, when it makes sense. */
  count: (run: CompilationRun) => number | null;
  countTone?: (run: CompilationRun) => 'neutral' | 'error';
  render: (run: CompilationRun, props: ResultsPanelProps) => ReactNode;
}

const TABS: TabDefinition[] = [
  {
    id: 'tokens',
    label: 'Tokens',
    count: (run) => run.result.tokens.length,
    render: (run, props) => (
      <TokensView
        tokens={run.result.tokens}
        hasLexicalErrors={run.result.stage === 'lexical'}
        onLocate={props.onLocate}
      />
    ),
  },
  {
    id: 'ast',
    label: 'AST',
    count: () => null,
    render: (run, props) => <AstView ast={run.result.ast} stage={run.result.stage} onLocate={props.onLocate} />,
  },
  {
    id: 'ir',
    label: 'IR',
    count: (run) =>
      run.result.ir
        ? run.result.ir.main.length + run.result.ir.functions.reduce((sum, fn) => sum + fn.body.length, 0)
        : null,
    render: (run, props) => (
      <IrView
        ir={run.result.ir}
        stage={run.result.stage}
        execution={run.result.execution}
        onLocate={props.onLocate}
      />
    ),
  },
  {
    id: 'diagnostics',
    label: 'Diagnósticos',
    count: (run) => run.result.diagnostics.length,
    countTone: (run) => (run.result.diagnostics.length > 0 ? 'error' : 'neutral'),
    render: (run, props) => (
      <DiagnosticsView diagnostics={run.result.diagnostics} stage={run.result.stage} onLocate={props.onLocate} />
    ),
  },
  {
    id: 'console',
    label: 'Consola',
    count: (run) => run.result.execution?.output.length ?? null,
    render: (run, props) => <ConsoleView run={run} onShowDiagnostics={() => props.onTabChange('diagnostics')} />,
  },
];

export function ResultsPanel(props: ResultsPanelProps) {
  const { state, activeTab, onTabChange } = props;
  const tabRefs = useRef<Partial<Record<ResultTab, HTMLButtonElement | null>>>({});
  const run = state.status === 'finished' ? state.run : null;
  const stale = run !== null && run.source !== props.currentSource;
  const current = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((tab) => tab.id === current.id);
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (offset === 0) return;
    event.preventDefault();
    const next = TABS[(index + offset + TABS.length) % TABS.length];
    onTabChange(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <section className="panel results-panel" aria-label="Resultados del compilador">
      <div className="results-panel__header">
        <div className="tabs" role="tablist" aria-label="Vistas del resultado" onKeyDown={handleKeyDown}>
          {TABS.map((tab) => {
            const selected = tab.id === current.id;
            const count = run ? tab.count(run) : null;
            return (
              <button
                key={tab.id}
                ref={(element) => {
                  tabRefs.current[tab.id] = element;
                }}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                className={`tabs__tab ${selected ? 'tabs__tab--active' : ''}`}
                onClick={() => onTabChange(tab.id)}
              >
                {tab.label}
                {count !== null && (
                  <span className={`tabs__count ${run && tab.countTone?.(run) === 'error' ? 'tabs__count--error' : ''}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {stale && (
          <span className="results-panel__stale" role="note">
            El código cambió desde la última ejecución
          </span>
        )}
      </div>

      <div
        className="results-panel__body"
        role="tabpanel"
        id={`panel-${current.id}`}
        aria-labelledby={`tab-${current.id}`}
        tabIndex={0}
      >
        {state.status === 'idle' && (
          <EmptyState title="Todavía no hay resultados">
            Escribe un programa o elige un ejemplo y pulsa <strong>Compilar y ejecutar</strong> (
            <kbd>Ctrl</kbd> + <kbd>Enter</kbd>). Aquí verás los tokens, el AST, el IR, los diagnósticos, la salida y
            la memoria de la máquina virtual.
          </EmptyState>
        )}
        {state.status === 'running' && (
          <div className="results-loading" role="status">
            <span className="spinner spinner--large" aria-hidden="true" />
            Compilando y ejecutando…
          </div>
        )}
        {state.status === 'crashed' && (
          <EmptyState title="El compilador se interrumpió" tone="error">
            Ocurrió un error inesperado y no se obtuvo un resultado: <code>{state.message}</code>. Ningún resultado
            parcial se muestra como ejecución correcta.
          </EmptyState>
        )}
        {run && (
          <div key={current.id} className="results-panel__view">
            {current.render(run, props)}
          </div>
        )}
      </div>
    </section>
  );
}
