import { describe, expect, it } from 'vitest';
import {
  IR_VERSION,
  type IRProgram,
  type IRValueType,
  type Operand,
  type TempOperand,
  type VarOperand,
} from '../ir/instructions';
import { RuntimeHeap } from './heap';
import { RuntimeError } from './runtime-errors';
import { RuntimeStack, type StackFrame } from './stack';
import { VirtualMachine } from './virtual-machine';

const temp = (name: string, type: IRValueType = 'int'): TempOperand => ({ kind: 'temp', name, type });
const local = (name: string, type: IRValueType = 'int'): VarOperand => ({ kind: 'var', name, scope: 'local', type });
const constant = (value: number | string | boolean, type: IRValueType): Operand => ({ kind: 'const', value, type });
const emptyProgram = (main: IRProgram['main'], functions: IRProgram['functions'] = [], globals: IRProgram['globals'] = []): IRProgram => ({
  version: IR_VERSION,
  globals,
  functions,
  main,
});

describe('VirtualMachine', () => {
  it('executes assignments and arithmetic', () => {
    const output = new VirtualMachine().execute(emptyProgram([
      { op: 'ASSIGN', dest: temp('t1'), src: constant(7, 'int') },
      { op: 'BINARY', operator: '*', operandType: 'int', dest: temp('t2'), left: temp('t1'), right: constant(6, 'int') },
      { op: 'PRINT', value: temp('t2') },
    ]));

    expect(output.status).toBe('completed');
    expect(output.output).toEqual(['42']);
    expect(output.steps).toBe(3);
  });

  it('truncates integer division toward zero and handles casts and unary operators', () => {
    const result = new VirtualMachine().execute(emptyProgram([
      { op: 'BINARY', operator: '/', operandType: 'int', dest: temp('quotient'), left: constant(-7, 'int'), right: constant(2, 'int') },
      { op: 'CAST', from: 'int', to: 'string', dest: temp('text', 'string'), src: temp('quotient') },
      { op: 'UNARY', operator: '!', dest: temp('negated', 'bool'), src: constant(false, 'bool') },
      { op: 'PRINT', value: temp('text', 'string') },
      { op: 'PRINT', value: temp('negated', 'bool') },
    ]));

    expect(result.output).toEqual(['-3', 'true']);
  });

  it('compares values and runs conditional jumps and a loop', () => {
    const program = emptyProgram([
      { op: 'ASSIGN', dest: { kind: 'var', name: 'i', scope: 'global', type: 'int' }, src: constant(0, 'int') },
      { op: 'LABEL', name: 'loop' },
      { op: 'BINARY', operator: '<', operandType: 'int', dest: temp('condition', 'bool'), left: { kind: 'var', name: 'i', scope: 'global', type: 'int' }, right: constant(3, 'int') },
      { op: 'JUMP_IF_FALSE', condition: temp('condition', 'bool'), target: 'end' },
      { op: 'PRINT', value: { kind: 'var', name: 'i', scope: 'global', type: 'int' } },
      { op: 'BINARY', operator: '+', operandType: 'int', dest: temp('next'), left: { kind: 'var', name: 'i', scope: 'global', type: 'int' }, right: constant(1, 'int') },
      { op: 'ASSIGN', dest: { kind: 'var', name: 'i', scope: 'global', type: 'int' }, src: temp('next') },
      { op: 'JUMP', target: 'loop' },
      { op: 'LABEL', name: 'end' },
      { op: 'BINARY', operator: '==', operandType: 'int', dest: temp('equal', 'bool'), left: constant(3, 'int'), right: { kind: 'var', name: 'i', scope: 'global', type: 'int' } },
      { op: 'JUMP_IF_TRUE', condition: temp('equal', 'bool'), target: 'done' },
      { op: 'PRINT', value: constant('bad', 'string') },
      { op: 'LABEL', name: 'done' },
    ], [], [{ name: 'i', type: 'int' }]);

    const result = new VirtualMachine().execute(program);
    expect(result.status).toBe('completed');
    expect(result.output).toEqual(['0', '1', '2']);
    expect(result.globals.i).toBe(3);
  });

  it('passes parameters and returns values from a function', () => {
    const program = emptyProgram([
      { op: 'PARAM', value: constant(19, 'int') },
      { op: 'CALL', func: 'identity', argCount: 1, dest: temp('answer') },
      { op: 'PRINT', value: temp('answer') },
    ], [{
      name: 'identity',
      params: [{ name: 'value', type: 'int' }],
      returnType: 'int',
      locals: [],
      body: [{ op: 'RETURN', value: local('value') }],
    }]);

    const result = new VirtualMachine().execute(program);
    expect(result.output).toEqual(['19']);
    expect(result.status).toBe('completed');
    expect(result.stack).toEqual([]);
  });

  it('supports recursive calls with independent temporaries and frames', () => {
    const n = local('n');
    const program = emptyProgram([
      { op: 'PARAM', value: constant(6, 'int') },
      { op: 'CALL', func: 'factorial', argCount: 1, dest: temp('answer') },
      { op: 'PRINT', value: temp('answer') },
    ], [{
      name: 'factorial',
      params: [{ name: 'n', type: 'int' }],
      returnType: 'int',
      locals: [],
      body: [
        { op: 'BINARY', operator: '<=', operandType: 'int', dest: temp('base', 'bool'), left: n, right: constant(1, 'int') },
        { op: 'JUMP_IF_TRUE', condition: temp('base', 'bool'), target: 'base-case' },
        { op: 'BINARY', operator: '-', operandType: 'int', dest: temp('previous'), left: n, right: constant(1, 'int') },
        { op: 'PARAM', value: temp('previous') },
        { op: 'CALL', func: 'factorial', argCount: 1, dest: temp('recursive') },
        { op: 'BINARY', operator: '*', operandType: 'int', dest: temp('product'), left: n, right: temp('recursive') },
        { op: 'RETURN', value: temp('product') },
        { op: 'LABEL', name: 'base-case' },
        { op: 'RETURN', value: constant(1, 'int') },
      ],
    }]);

    const result = new VirtualMachine().execute(program);
    expect(result.output).toEqual(['720']);
    expect(result.status).toBe('completed');
    expect(result.steps).toBeGreaterThan(30);
  });

  it('returns structured errors with the failing instruction PC', () => {
    const result = new VirtualMachine().execute(emptyProgram([
      { op: 'BINARY', operator: '/', operandType: 'int', dest: temp('bad'), left: constant(1, 'int'), right: constant(0, 'int') },
    ]));

    expect(result.status).toBe('failed');
    expect(result.error).toEqual({ code: 'DIVISION_BY_ZERO', message: 'Division by zero', pc: 0 });
    expect(result.pc).toBe(0);
    expect(result.instruction?.op).toBe('BINARY');
  });

  it('reports undefined variables, invalid jumps, unsupported IR and step limits', () => {
    const machine = new VirtualMachine();
    const undefinedRead = machine.execute(emptyProgram([{ op: 'PRINT', value: temp('missing') }]));
    const badJump = machine.execute(emptyProgram([{ op: 'JUMP', target: 'missing' }]));
    const oldVersion = machine.execute({ ...emptyProgram([]), version: '0.0' as typeof IR_VERSION });
    const infinite = machine.execute(emptyProgram([
      { op: 'LABEL', name: 'again' },
      { op: 'JUMP', target: 'again' },
    ]), { maxSteps: 4 });

    expect(undefinedRead.error?.code).toBe('UNDEFINED_VARIABLE');
    expect(badJump.error?.code).toBe('INVALID_JUMP');
    expect(oldVersion.error?.code).toBe('INVALID_PROGRAM');
    expect(infinite.error?.code).toBe('STEP_LIMIT');
    expect(infinite.steps).toBe(4);
  });
});

describe('RuntimeHeap', () => {
  it('allocates, stores and reads values while checking bounds and references', () => {
    const heap = new RuntimeHeap();
    const reference = heap.allocate(2, 0);
    heap.write(reference, 1, 'stored');

    expect(heap.read(reference, 0)).toBe(0);
    expect(heap.read(reference, 1)).toBe('stored');
    expect(heap.snapshot()).toEqual([{ address: reference.address, values: [0, 'stored'] }]);
    expect(() => heap.read(reference, 2)).toThrowError(RuntimeError);
    expect(() => heap.read({ address: -1 }, 0)).toThrowError(RuntimeError);
  });
});

describe('RuntimeStack', () => {
  it('pushes, pops and snapshots call frames independently', () => {
    const stack = new RuntimeStack();
    const frame: StackFrame = {
      functionName: 'sample',
      returnPC: 4,
      programCounter: 0,
      body: [],
      labels: new Map(),
      locals: new Map([['parameter', 9]]),
      temporaries: new Map(),
      arguments: [9],
      pendingArguments: [],
    };
    stack.pushFrame(frame);
    const snapshot = stack.snapshot();
    snapshot[0].locals.set('parameter', 0);

    expect(stack.depth).toBe(1);
    expect(stack.current?.locals.get('parameter')).toBe(9);
    expect(stack.popFrame()).toBe(frame);
    expect(stack.current).toBeUndefined();
  });
});
