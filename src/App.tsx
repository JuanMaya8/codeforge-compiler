import { useMemo, useState } from 'react';
import type { CompilerPhase } from './compiler';
import type { LocateRequest } from './components/editor/CodeEditor';
import { EditorPanel, type EditorMessage } from './components/editor/EditorPanel';
import { ExampleList } from './components/examples/ExampleSelector';
import { TopBar } from './components/layout/TopBar';
import { ResultsPanel, type LocateTarget } from './components/results/ResultsPanel';
import { DEFAULT_EXAMPLE, type ExampleProgram } from './examples/programs';
import { useCompiler } from './hooks/useCompiler';
import {
  compilerStatus,
  defaultTabFor,
  describeOutcome,
  diagnosticLineMarkers,
  executionStatus,
  type ResultTab,
} from './lib/runSummary';
import { readStored, writeStored } from './lib/storage';
import type { CompilationRun } from './services/compilerService';
import './App.css';

const SOURCE_KEY = 'codeforge.source';
const EXAMPLE_KEY = 'codeforge.example';

/** Message shown above the editor after a run. */
function messageFor(run: CompilationRun): EditorMessage {
  const outcome = describeOutcome(run.result);
  const tone = outcome.kind.startsWith('completed') ? 'success' : 'error';
  return { tone, text: `${outcome.title}: ${outcome.detail}.` };
}

function App() {
  const [source, setSource] = useState(() => readStored(SOURCE_KEY) ?? DEFAULT_EXAMPLE.source);
  const [activeExampleId, setActiveExampleId] = useState<string | null>(() =>
    readStored(SOURCE_KEY) === null ? DEFAULT_EXAMPLE.id : readStored(EXAMPLE_KEY),
  );
  const [message, setMessage] = useState<EditorMessage | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>('console');
  const [locate, setLocate] = useState<LocateRequest | null>(null);

  const { state, run, running } = useCompiler({
    onFinished: (finished) => {
      setActiveTab(defaultTabFor(finished.result));
      setMessage(messageFor(finished));
    },
  });

  const finishedRun = state.status === 'finished' ? state.run : null;
  const resultsAreCurrent = finishedRun !== null && finishedRun.source === source;
  const markers = useMemo(
    () =>
      resultsAreCurrent && finishedRun
        ? diagnosticLineMarkers(finishedRun.result.diagnostics)
        : new Map<number, CompilerPhase>(),
    [finishedRun, resultsAreCurrent],
  );

  const updateSource = (next: string) => {
    setSource(next);
    writeStored(SOURCE_KEY, next);
  };

  const runProgram = () => {
    if (running) return;
    if (source.trim() === '') {
      setMessage({ tone: 'warning', text: 'El editor está vacío: escribe un programa o carga un ejemplo.' });
      return;
    }
    setMessage({ tone: 'info', text: 'Compilando y ejecutando…' });
    run(source);
  };

  const selectExample = (example: ExampleProgram) => {
    updateSource(example.source);
    setActiveExampleId(example.id);
    writeStored(EXAMPLE_KEY, example.id);
    setMessage({ tone: 'info', text: `Ejemplo cargado: ${example.title}. Pulsa Ejecutar para compilarlo.` });
  };

  const clearEditor = () => {
    updateSource('');
    setActiveExampleId(null);
    writeStored(EXAMPLE_KEY, '');
    setMessage({ tone: 'info', text: 'Editor limpio. Escribe un programa CodeForge.' });
  };

  const locateInEditor = (target: LocateTarget) => {
    setLocate({ ...target, nonce: Date.now() });
  };

  return (
    <div className="app">
      <TopBar
        compilerStatus={compilerStatus(state)}
        executionStatus={executionStatus(state)}
        running={running}
        onRun={runProgram}
      />

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
            onRun={runProgram}
            running={running}
            message={message}
            markers={markers}
            locate={locate}
          />

          <ResultsPanel
            state={state}
            currentSource={source}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onLocate={locateInEditor}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
