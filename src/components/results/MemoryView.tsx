import { useState } from 'react';
import {
  formatInstruction,
  formatIRType,
  type ExecutionResult,
  type IRProgram,
  type RuntimeValue,
  type SourceRunResult,
  type StackFrameSnapshot,
} from '../../compiler';
import { isCompilePhase, PHASE_LABELS } from '../../lib/runSummary';
import { formatRuntimeValue, isReference, runtimeValueKind } from '../../lib/runtimeFormat';
import { EmptyState } from './EmptyState';

interface MemoryViewProps {
  execution: ExecutionResult | null;
  ir: IRProgram | null;
  stage: SourceRunResult['stage'];
}

/**
 * Final state of the virtual machine exactly as `ExecutionResult` reports it:
 * PC, instruction, Stack frames, Heap blocks and global variables.
 */
export function MemoryView({ execution, ir, stage }: MemoryViewProps) {
  const [highlighted, setHighlighted] = useState<number | null>(null);

  if (!execution) {
    const phase = isCompilePhase(stage) ? PHASE_LABELS[stage].toLowerCase() : stage;
    return (
      <EmptyState title="La máquina virtual no se ejecutó">
        Falló el análisis {phase}, así que no se generó o no se ejecutó el IR. No hay PC, Stack, Heap ni variables
        globales que mostrar.
      </EmptyState>
    );
  }

  const showBlock = (address: number) => {
    setHighlighted(address);
    document.getElementById(`heap-block-${address}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const globals = Object.entries(execution.globals);
  const typeOfGlobal = (name: string) => {
    const declared = ir?.globals.find((global) => global.name === name);
    return declared ? formatIRType(declared.type) : null;
  };
  const failed = execution.status === 'failed';

  return (
    <div className="memory-view">
      <dl className="memory-cards">
        <div className={`memory-card ${failed ? 'memory-card--error' : 'memory-card--success'}`}>
          <dt>Estado final</dt>
          <dd>{failed ? 'failed (fallida)' : 'completed (completada)'}</dd>
        </div>
        <div className="memory-card">
          <dt>Program Counter</dt>
          <dd>
            PC {execution.pc} <span className="memory-card__muted">en {execution.functionName}</span>
          </dd>
        </div>
        <div className="memory-card memory-card--wide">
          <dt>{failed ? 'Instrucción que falló' : 'Última instrucción ejecutada'}</dt>
          <dd>
            {execution.instruction ? (
              <code>{formatInstruction(execution.instruction)}</code>
            ) : (
              <span className="memory-card__muted">No disponible en el resultado</span>
            )}
          </dd>
        </div>
        <div className="memory-card">
          <dt>Pasos ejecutados</dt>
          <dd>{execution.steps}</dd>
        </div>
      </dl>

      <section className="memory-section" aria-labelledby="memory-stack">
        <h3 id="memory-stack" className="memory-section__title">
          Stack <span className="memory-section__count">{execution.stack.length} frames</span>
        </h3>
        {execution.stack.length === 0 ? (
          <p className="callout callout--info">
            Stack vacío: al terminar correctamente, la VM ya desapiló todos los frames y su resultado no incluye
            frames. Cuando la ejecución falla, aquí aparecen los frames activos en el momento del error (por ejemplo,
            carga el ejemplo «Error en ejecución»).
          </p>
        ) : (
          <ol className="stack-frames">
            {[...execution.stack].reverse().map((frame, index) => (
              <StackFrame
                key={index}
                frame={frame}
                isTop={index === 0}
                depth={execution.stack.length - 1 - index}
                onReference={showBlock}
              />
            ))}
          </ol>
        )}
      </section>

      <section className="memory-section" aria-labelledby="memory-heap">
        <h3 id="memory-heap" className="memory-section__title">
          Heap <span className="memory-section__count">{execution.heap.length} bloques</span>
        </h3>
        {execution.heap.length === 0 ? (
          <p className="callout callout--info">
            Heap vacío: el programa no creó arreglos. Cada arreglo ocupa un bloque del Heap y las variables guardan
            una referencia <code>@dirección</code>.
          </p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Dirección</th>
                  <th scope="col">Tipo de elemento</th>
                  <th scope="col">Longitud</th>
                  <th scope="col">Valores</th>
                </tr>
              </thead>
              <tbody>
                {execution.heap.map((block) => (
                  <tr
                    key={block.address}
                    id={`heap-block-${block.address}`}
                    className={highlighted === block.address ? 'heap-row--highlighted' : undefined}
                  >
                    <td className="data-table__code heap-address">@{block.address}</td>
                    <td className="data-table__code">{formatIRType(block.elementType)}</td>
                    <td className="data-table__number">{block.values.length}</td>
                    <td>
                      <span className="value-list">
                        {block.values.map((value, index) => (
                          <span key={index} className="value-list__cell">
                            <span className="value-list__index">{index}</span>
                            <Value value={value} onReference={showBlock} />
                          </span>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="memory-section" aria-labelledby="memory-globals">
        <h3 id="memory-globals" className="memory-section__title">
          Variables globales <span className="memory-section__count">{globals.length}</span>
        </h3>
        {globals.length === 0 ? (
          <p className="callout callout--info">El programa no declaró variables globales.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Valor final</th>
                </tr>
              </thead>
              <tbody>
                {globals.map(([name, value]) => (
                  <tr key={name}>
                    <td className="data-table__code">{name}</td>
                    <td className="data-table__code chip__type">{typeOfGlobal(name) ?? '—'}</td>
                    <td>
                      <Value value={value} onReference={showBlock} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Value({ value, onReference }: { value: RuntimeValue; onReference: (address: number) => void }) {
  const kind = runtimeValueKind(value);
  if (isReference(value)) {
    return (
      <button
        type="button"
        className="runtime-value runtime-value--reference"
        title="Ver el bloque en el Heap"
        onClick={() => onReference(value.address)}
      >
        {formatRuntimeValue(value)}
      </button>
    );
  }
  return <code className={`runtime-value runtime-value--${kind}`}>{formatRuntimeValue(value)}</code>;
}

interface StackFrameProps {
  frame: StackFrameSnapshot;
  isTop: boolean;
  depth: number;
  onReference: (address: number) => void;
}

function StackFrame({ frame, isTop, depth, onReference }: StackFrameProps) {
  const sections: Array<[string, Array<[string, RuntimeValue]>]> = [
    ['Argumentos', frame.arguments.map((value, index) => [`arg${index}`, value])],
    ['Locales', Object.entries(frame.locals)],
    ['Temporales', Object.entries(frame.temporaries)],
  ];

  return (
    <li className={`stack-frame ${isTop ? 'stack-frame--top' : ''}`}>
      <header className="stack-frame__header">
        <span className="stack-frame__name">{frame.functionName}</span>
        {isTop && <span className="stack-frame__tag">tope</span>}
        <span className="stack-frame__meta">
          nivel {depth} · PC {frame.pc} · retorno {frame.returnPC === null ? '—' : `PC ${frame.returnPC}`}
        </span>
      </header>
      <div className="stack-frame__body">
        {sections.map(([title, entries]) => (
          <div key={title} className="stack-frame__group">
            <p className="stack-frame__group-title">{title}</p>
            {entries.length === 0 ? (
              <p className="memory-card__muted">vacío</p>
            ) : (
              <ul className="binding-list">
                {entries.map(([name, value]) => (
                  <li key={name}>
                    <code className="binding-list__name">{name}</code>
                    <Value value={value} onReference={onReference} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </li>
  );
}
