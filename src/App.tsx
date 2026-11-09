import { TopBar } from './components/layout/TopBar';
import type { StatusIndicator } from './lib/status';
import './App.css';

const READY: StatusIndicator = { tone: 'idle', label: 'Listo' };
const NOT_RUN: StatusIndicator = { tone: 'idle', label: 'Sin ejecutar' };

function App() {
  return (
    <div className="app">
      <TopBar compilerStatus={READY} executionStatus={NOT_RUN} running={false} onRun={() => {}} />

      <main className="layout">
        <aside className="sidebar panel" aria-label="Ejemplos">
          <div className="panel__header">
            <h2 className="panel__title">Ejemplos</h2>
          </div>
        </aside>

        <div className="workspace">
          <section className="panel" aria-label="Editor">
            <div className="panel__header">
              <h2 className="panel__title">Editor</h2>
            </div>
          </section>

          <section className="panel" aria-label="Resultados">
            <div className="panel__header">
              <h2 className="panel__title">Resultados</h2>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;
