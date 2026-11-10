/**
 * Every example of the interface is compiled and executed with the real
 * compiler service. If a phase changes its behavior, these tests show
 * which example stopped matching what the interface promises.
 */
import { describe, expect, it } from 'vitest';
import { compileAndRun } from '../services/compilerService';
import { EXAMPLES, findExample } from './programs';

const EXPECTED_OUTPUT: Record<string, string[]> = {
  hello: ['Hola, CodeForge!', '14', '20', '3', '2', '15', '3'],
  variables: ['12.56', 'Ana tiene', '21', 'true'],
  conditionals: ['Aprobado', 'No puede ingresar', 'Supera el 50'],
  loops: ['55', '3', '6', '9', '12', '15', '6'],
  functions: ['26', '5', '3.5', 'Hola, CodeForge'],
  recursion: ['120', '55', '256'],
  arrays: ['2', '20', '100', '32', 'compilador educativo'],
};

const EXPECTED_ERRORS: Record<string, { stage: string; codes: string[] }> = {
  'lexical-error': { stage: 'lexical', codes: ['MALFORMED_NUMBER', 'UNEXPECTED_CHARACTER', 'UNTERMINATED_STRING'] },
  'syntax-error': { stage: 'syntax', codes: ['EXPECTED_TOKEN', 'EXPECTED_EXPRESSION', 'EXPECTED_TOKEN', 'EXPECTED_TOKEN'] },
  'semantic-error': {
    stage: 'semantic',
    codes: ['TYPE_MISMATCH', 'CONST_REASSIGNMENT', 'INVALID_OPERAND_TYPES', 'UNDECLARED_IDENTIFIER'],
  },
  'runtime-error': { stage: 'runtime', codes: ['HEAP_OUT_OF_BOUNDS'] },
};

describe('example programs', () => {
  it('have unique ids and every one is covered by these tests', () => {
    const ids = EXAMPLES.map((example) => example.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...Object.keys(EXPECTED_OUTPUT), ...Object.keys(EXPECTED_ERRORS)].sort());
  });

  it.each(Object.entries(EXPECTED_OUTPUT))('%s compiles and prints the expected output', (id, output) => {
    const { result } = compileAndRun(findExample(id)!.source);
    expect(result.diagnostics).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.stage).toBe('completed');
    expect(result.execution?.output).toEqual(output);
  });

  it.each(Object.entries(EXPECTED_ERRORS))('%s fails in the expected phase', (id, expected) => {
    const { result } = compileAndRun(findExample(id)!.source);
    expect(result.ok).toBe(false);
    expect(result.stage).toBe(expected.stage);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expected.codes);
    for (const diagnostic of result.diagnostics) {
      expect(diagnostic.phase).toBe(expected.stage);
      expect(diagnostic.position).toBeDefined();
    }
  });

  it('the runtime error keeps the output printed before failing and the active frames', () => {
    const { result } = compileAndRun(findExample('runtime-error')!.source);
    const execution = result.execution!;
    expect(execution.output).toEqual(['10']);
    expect(execution.stack.map((frame) => frame.functionName)).toEqual(['<main>', 'sumFirst']);
    expect(result.diagnostics[0]).toMatchObject({ pc: execution.pc, instruction: 'ARRAY_LOAD' });

    // The IR view highlights body[pc] of the function named by the VM.
    const body = result.ir!.functions.find((fn) => fn.name === execution.functionName)!.body;
    expect(body[execution.pc].op).toBe(execution.instruction?.op);
  });

  it('the arrays example leaves typed blocks in the Heap', () => {
    const { result } = compileAndRun(findExample('arrays')!.source);
    const heap = result.execution!.heap;
    expect(heap.length).toBeGreaterThanOrEqual(4);
    expect(heap.some((block) => typeof block.elementType === 'object')).toBe(true); // int[][] holds references
  });
});
