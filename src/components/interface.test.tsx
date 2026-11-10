/**
 * Integration tests of the interface with the real compiler.
 *
 * They render the components to HTML with `react-dom/server` (no browser
 * or extra test library needed) using real `runSource()` results, and check
 * that every tab shows the data of the run without crashing.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { EXAMPLES, findExample } from '../examples/programs';
import type { RunState } from '../hooks/useCompiler';
import type { ResultTab } from '../lib/runSummary';
import { compileAndRun } from '../services/compilerService';
import { ResultsPanel } from './results/ResultsPanel';

const TABS: ResultTab[] = ['tokens', 'ast', 'ir', 'diagnostics', 'console', 'memory'];

function render(state: RunState, tab: ResultTab, currentSource = ''): string {
  return renderToStaticMarkup(
    <ResultsPanel state={state} currentSource={currentSource} activeTab={tab} onTabChange={() => {}} onLocate={() => {}} />,
  );
}

function finishedState(id: string): RunState {
  return { status: 'finished', run: compileAndRun(findExample(id)!.source) };
}

describe('CodeForge interface', () => {
  it('renders the application shell instead of the Vite template', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Code<span>Forge</span>');
    expect(html).toContain('Educational Compiler');
    expect(html).toContain('Compilar y ejecutar');
    expect(html).toContain('programa.cf');
    for (const example of EXAMPLES) expect(html).toContain(example.title);
    expect(html).not.toContain('Get started');
  });

  it.each(EXAMPLES.map((example) => example.id))('renders every tab for the "%s" example', (id) => {
    const state = finishedState(id);
    for (const tab of TABS) {
      const html = render(state, tab, findExample(id)!.source);
      expect(html).toContain(`id="panel-${tab}"`);
      expect(html).not.toContain('El código cambió');
    }
  });

  it('shows the real output in the console', () => {
    const html = render(finishedState('recursion'), 'console');
    expect(html).toContain('Ejecución completada');
    for (const line of ['120', '55', '256']) expect(html).toContain(line);
  });

  it('shows tokens, AST and IR of a successful run', () => {
    const state = finishedState('functions');
    expect(render(state, 'tokens')).toContain('FUNCTION');
    expect(render(state, 'ast')).toContain('FunctionDeclaration');
    const ir = render(state, 'ir');
    expect(ir).toContain('FUNCTION sum(a: int, b: int): int');
    expect(ir).toContain('CALL');
  });

  it('shows each diagnostic with phase, code, line and column', () => {
    const html = render(finishedState('semantic-error'), 'diagnostics');
    for (const code of ['TYPE_MISMATCH', 'CONST_REASSIGNMENT', 'INVALID_OPERAND_TYPES', 'UNDECLARED_IDENTIFIER']) {
      expect(html).toContain(code);
    }
    expect(html).toContain('phase-badge--semantic');
    expect(html).toContain('Ir a la línea 4');
  });

  it('shows PC, instruction, Stack and Heap of a runtime failure', () => {
    const state = finishedState('runtime-error');
    const diagnostics = render(state, 'diagnostics');
    expect(diagnostics).toContain('HEAP_OUT_OF_BOUNDS');
    expect(diagnostics).toContain('ARRAY_LOAD');

    const memory = render(state, 'memory');
    expect(memory).toContain('failed (fallida)');
    expect(memory).toContain('sumFirst');
    expect(memory).toContain('@1');

    const console = render(state, 'console');
    expect(console).toContain('Ejecución fallida');
    expect(console).toContain('HEAP_OUT_OF_BOUNDS');

    expect(render(state, 'ir')).toContain('ir-table__failed');
  });

  it('never presents a failed compilation as an execution', () => {
    const state = finishedState('syntax-error');
    expect(render(state, 'console')).toContain('Error de compilación');
    expect(render(state, 'console')).not.toContain('Ejecución completada');
    expect(render(state, 'ir')).toContain('No se generó código intermedio');
    expect(render(state, 'memory')).toContain('La máquina virtual no se ejecutó');
    expect(render(state, 'ast')).toContain('AST parcial');
  });

  it('explains missing data instead of inventing it', () => {
    const lexical = finishedState('lexical-error');
    expect(render(lexical, 'ast')).toContain('No hay AST');
    expect(render(finishedState('hello'), 'memory')).toContain('Stack vacío');
  });

  it('shows empty, loading and crashed states', () => {
    expect(render({ status: 'idle' }, 'console')).toContain('Todavía no hay resultados');
    expect(render({ status: 'running', source: 'print(1);' }, 'console')).toContain('Compilando y ejecutando');
    const crashed = render({ status: 'crashed', source: '', message: 'boom' }, 'console');
    expect(crashed).toContain('El compilador se interrumpió');
    expect(crashed).not.toContain('Ejecución completada');
  });

  it('warns when the results belong to an older version of the code', () => {
    expect(render(finishedState('hello'), 'console', 'print(99);')).toContain('El código cambió');
  });
});
