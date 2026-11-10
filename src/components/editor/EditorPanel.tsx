import type { ExampleProgram } from '../../examples/programs';
import { ExampleSelect } from '../examples/ExampleSelector';
import { PlayIcon, TrashIcon } from '../layout/icons';
import { CodeEditor, type LineMarkers, type LocateRequest } from './CodeEditor';

export interface EditorMessage {
  tone: 'info' | 'success' | 'warning' | 'error';
  text: string;
}

interface EditorPanelProps {
  source: string;
  onSourceChange: (source: string) => void;
  activeExampleId: string | null;
  onSelectExample: (example: ExampleProgram) => void;
  onClear: () => void;
  onRun: () => void;
  running: boolean;
  message: EditorMessage | null;
  markers: LineMarkers;
  locate: LocateRequest | null;
}

export function EditorPanel(props: EditorPanelProps) {
  const { source, running, message } = props;

  return (
    <section className="panel editor-panel" aria-label="Editor de código">
      <div className="panel__header editor-panel__header">
        <h2 className="panel__title">
          <span className="editor-panel__file">programa.cf</span>
        </h2>
        <div className="editor-panel__tools">
          <ExampleSelect activeId={props.activeExampleId} onSelect={props.onSelectExample} />
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={props.onClear}
            disabled={running || source.length === 0}
          >
            <TrashIcon />
            Limpiar
          </button>
          <button type="button" className="btn btn--primary btn--small" onClick={props.onRun} disabled={running}>
            {running ? <span className="spinner" aria-hidden="true" /> : <PlayIcon />}
            Ejecutar
          </button>
        </div>
      </div>

      {message && (
        <p className={`editor-panel__message editor-panel__message--${message.tone}`} role="status">
          {message.text}
        </p>
      )}

      <CodeEditor
        value={source}
        onChange={props.onSourceChange}
        onRun={props.onRun}
        markers={props.markers}
        locate={props.locate}
      />
    </section>
  );
}
