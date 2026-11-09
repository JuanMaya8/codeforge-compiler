import { useState } from 'react';
import { EditorPanel, type EditorMessage } from './components/editor/EditorPanel';
import { ExampleList } from './components/examples/ExampleSelector';
import { TopBar } from './components/layout/TopBar';
import { DEFAULT_EXAMPLE, type ExampleProgram } from './examples/programs';
import type { StatusIndicator } from './lib/status';
import { readStored, writeStored } from './lib/storage';
import './App.css';

const SOURCE_KEY = 'codeforge.source';
const EXAMPLE_KEY = 'codeforge.example';

const READY: StatusIndicator = { tone: 'idle', label: 'Listo' };
const NOT_RUN: StatusIndicator = { tone: 'idle', label: 'Sin ejecutar' };

function App() {
  const [source, setSource] = useState(() => readStored(SOURCE_KEY) ?? DEFAULT_EXAMPLE.source);
  const [activeExampleId, setActiveExampleId] = useState<string | null>(() =>
    readStored(SOURCE_KEY) === null ? DEFAULT_EXAMPLE.id : readStored(EXAMPLE_KEY),
  );
  const [message, setMessage] = useState<EditorMessage | null>(null);

  const updateSource = (next: string) => {
    setSource(next);
    writeStored(SOURCE_KEY, next);
  };

  const selectExample = (example: ExampleProgram) => {
    updateSource(example.source);
    setActiveExampleId(example.id);
    writeStored(EXAMPLE_KEY, example.id);
    setMessage({ tone: 'info', text: `Ejemplo cargado: ${example.title}.` });
  };

  const clearEditor = () => {
    updateSource('');
    setActiveExampleId(null);
    writeStored(EXAMPLE_KEY, '');
    setMessage({ tone: 'info', text: 'Editor limpio. Escribe un programa CodeForge.' });
  };

  return (
    <div className="app">
      <TopBar compilerStatus={READY} executionStatus={NOT_RUN} running={false} onRun={() => {}} />

      <main className="layout">
        <aside className="sidebar panel" aria-label="Ejemplos">
          <div className="panel__header">
            <h2 className="panel__title">Ejemplos</h2>
          </div>
          <ExampleList activeId={activeExampleId} onSelect={selectExample} />
        </aside>

        <div className="workspace">
          <EditorPanel
            source={source}
            onSourceChange={updateSource}
            activeExampleId={activeExampleId}
            onSelectExample={selectExample}
            onClear={clearEditor}
            onRun={() => {}}
            running={false}
            message={message}
            markers={new Map()}
            locate={null}
          />

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
