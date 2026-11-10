import type { StatusIndicator } from '../../lib/status';
import { Logo } from './Logo';
import { PlayIcon } from './icons';

interface TopBarProps {
  compilerStatus: StatusIndicator;
  executionStatus: StatusIndicator;
  running: boolean;
  onRun: () => void;
}

function StatusPill({ caption, status }: { caption: string; status: StatusIndicator }) {
  return (
    <div className={`status-pill status-pill--${status.tone}`} title={status.detail ?? status.label}>
      <span className="status-pill__dot" aria-hidden="true" />
      <span className="status-pill__caption">{caption}</span>
      <span className="status-pill__label">{status.label}</span>
      {status.detail && <span className="status-pill__detail">{status.detail}</span>}
    </div>
  );
}

export function TopBar({ compilerStatus, executionStatus, running, onRun }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <Logo />
        <div>
          <h1 className="topbar__title">
            Code<span>Forge</span>
          </h1>
          <p className="topbar__subtitle">Educational Compiler</p>
        </div>
      </div>

      <div className="topbar__status" aria-live="polite">
        <StatusPill caption="Compilador" status={compilerStatus} />
        <StatusPill caption="Ejecución" status={executionStatus} />
      </div>

      <div className="topbar__actions">
        <button type="button" className="btn btn--primary" onClick={onRun} disabled={running}>
          {running ? <span className="spinner" aria-hidden="true" /> : <PlayIcon />}
          {running ? 'Ejecutando…' : 'Compilar y ejecutar'}
        </button>
      </div>
    </header>
  );
}
