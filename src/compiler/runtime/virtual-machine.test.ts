import { describe, expect, it } from 'vitest';
import {
  IR_VERSION,
  type IRFunction,
  type IRProgram,
  type IRType,
  type Operand,
  type TempOperand,
  type VarOperand,
} from '../ir/instructions';
import { RuntimeHeap } from './heap';
import { RuntimeError } from './runtime-errors';
import { RuntimeStack, type StackFrame } from './stack';
import { VirtualMachine } from './virtual-machine';

const intArray: IRType = { kind: 'array', elementType: 'int' };
const intMatrix: IRType = { kind: 'array', elementType: intArray };

const temp = (name: string, type: IRType = 'int'): TempOperand => ({ kind: 'temp', name, type });
const local = (name: string, type: IRType = 'int'): VarOperand => ({ kind: 'var', name, scope: 'local', type });
const global = (name: string, type: IRType = 'int'): VarOperand => ({ kind: 'var', name, scope: 'global', type });
const int = (value: number): Operand => ({ kind: 'const', value, type: 'int' });
const str = (value: string): Operand => ({ kind: 'const', value, type: 'string' });
const bool = (value: boolean): Operand => ({ kind: 'const', value, type: 'bool' });
const program = (
  main: IRProgram['main'],
  functions: IRFunction[] = [],
  globals: IRProgram['globals'] = [],
): IRProgram => ({ version: IR_VERSION, globals, functions, main });

const run = (ir: IRProgram, maxSteps?: number) => new VirtualMachine().execute(ir, maxSteps === undefined ? {} : { maxSteps });

describe('VirtualMachine — scalar instructions', () => {
  it('executes assignments and arithmetic', () => {
    const result = run(program([
      { op: 'ASSIGN', dest: temp('t1'), src: int(7) },
      { op: 'BINARY', operator: '*', operandType: 'int', dest: temp('t2'), left: temp('t1'), right: int(6) },
      { op: 'PRINT', value: temp('t2') },
    ]));

    expect(result.status).toBe('completed');
    expect(result.output).toEqual(['42']);
    expect(result.steps).toBe(3);
    expect(result.diagnostics).toEqual([]);
  });

  it('truncates int division and modulo toward zero, casts int to float and negates', () => {
    const result = run(program([
      { op: 'BINARY', operator: '/', operandType: 'int', dest: temp('q'), left: int(-7), right: int(2) },
      { op: 'BINARY', operator: '%', operandType: 'int', dest: temp('r'), left: int(-7), right: int(2) },
      { op: 'CAST', from: 'int', to: 'float', dest: temp('f', 'float'), src: temp('q') },
      { op: 'BINARY', operator: '/', operandType: 'float', dest: temp('half', 'float'), left: temp('f', 'float'), right: { kind: 'const', type: 'float', value: 2 } },
      { op: 'UNARY', operator: '!', dest: temp('n', 'bool'), src: bool(false) },
      { op: 'BINARY', operator: '+', operandType: 'string', dest: temp('s', 'string'), left: str('a'), right: str('b') },
      { op: 'PRINT', value: temp('q') },
      { op: 'PRINT', value: temp('r') },
      { op: 'PRINT', value: temp('half', 'float') },
      { op: 'PRINT', value: temp('n', 'bool') },
      { op: 'PRINT', value: temp('s', 'string') },
    ]));

    expect(result.output).toEqual(['-3', '-1', '-1.5', 'true', 'ab']);
  });

  it('runs loops with labels and conditional jumps over globals', () => {
    const i = global('i');
    const result = run(program([
      { op: 'ASSIGN', dest: i, src: int(0) },
      { op: 'LABEL', name: 'L1' },
      { op: 'BINARY', operator: '<', operandType: 'int', dest: temp('c', 'bool'), left: i, right: int(3) },
      { op: 'JUMP_IF_FALSE', condition: temp('c', 'bool'), target: 'L2' },
      { op: 'PRINT', value: i },
      { op: 'BINARY', operator: '+', operandType: 'int', dest: temp('n'), left: i, right: int(1) },
      { op: 'ASSIGN', dest: i, src: temp('n') },
      { op: 'JUMP', target: 'L1' },
      { op: 'LABEL', name: 'L2' },
      { op: 'JUMP_IF_TRUE', condition: bool(true), target: 'L3' },
      { op: 'PRINT', value: str('no debe imprimirse') },
      { op: 'LABEL', name: 'L3' },
    ], [], [{ name: 'i', type: 'int' }]));

    expect(result.status).toBe('completed');
    expect(result.output).toEqual(['0', '1', '2']);
    expect(result.globals.i).toBe(3);
  });

  it('supports recursion with independent frames and temporaries', () => {
    const n = local('n');
    const factorial: IRFunction = {
      name: 'factorial',
      params: [{ name: 'n', type: 'int' }],
      returnType: 'int',
      locals: [],
      body: [
        { op: 'BINARY', operator: '<=', operandType: 'int', dest: temp('base', 'bool'), left: n, right: int(1) },
        { op: 'JUMP_IF_TRUE', condition: temp('base', 'bool'), target: 'L1' },
        { op: 'BINARY', operator: '-', operandType: 'int', dest: temp('prev'), left: n, right: int(1) },
        { op: 'PARAM', value: temp('prev') },
        { op: 'CALL', func: 'factorial', argCount: 1, dest: temp('rec') },
        { op: 'BINARY', operator: '*', operandType: 'int', dest: temp('prod'), left: n, right: temp('rec') },
        { op: 'RETURN', value: temp('prod') },
        { op: 'LABEL', name: 'L1' },
        { op: 'RETURN', value: int(1) },
      ],
    };
    const result = run(program([
      { op: 'PARAM', value: int(6) },
      { op: 'CALL', func: 'factorial', argCount: 1, dest: temp('answer') },
      { op: 'PRINT', value: temp('answer') },
    ], [factorial]));

    expect(result.status).toBe('completed');
    expect(result.output).toEqual(['720']);
    expect(result.stack).toEqual([]);
  });
});

describe('VirtualMachine — arrays and Heap', () => {
  it('allocates, stores and loads nested arrays by reference', () => {
    const result = run(program([
      { op: 'ARRAY_ALLOC', dest: temp('outer', intMatrix), elementType: intArray, length: 2 },
      { op: 'ARRAY_ALLOC', dest: temp('row', intArray), elementType: 'int', length: 2 },
      { op: 'ARRAY_STORE', array: temp('row', intArray), index: int(1), value: int(7) },
      { op: 'ARRAY_STORE', array: temp('outer', intMatrix), index: int(0), value: temp('row', intArray) },
      { op: 'ARRAY_LOAD', dest: temp('alias', intArray), array: temp('outer', intMatrix), index: int(0) },
      { op: 'ARRAY_STORE', array: temp('alias', intArray), index: int(0), value: int(5) },
      { op: 'ARRAY_LOAD', dest: temp('x'), array: temp('row', intArray), index: int(0) },
      { op: 'PRINT', value: temp('x') },
    ]));

    expect(result.status).toBe('completed');
    expect(result.output).toEqual(['5']);
    expect(result.heap).toEqual([
      { address: 1, elementType: intArray, values: [{ address: 2 }, null] },
      { address: 2, elementType: 'int', values: [5, 7] },
    ]);
  });

  it('fails with HEAP_OUT_OF_BOUNDS, PC, opcode and source position', () => {
    const result = run(program([
      { op: 'ARRAY_ALLOC', dest: temp('a', intArray), elementType: 'int', length: 2 },
      { op: 'ARRAY_LOAD', dest: temp('x'), array: temp('a', intArray), index: int(2), position: { line: 4, column: 9 } },
    ]));

    expect(result.status).toBe('failed');
    expect(result.error).toMatchObject({
      phase: 'runtime',
      code: 'HEAP_OUT_OF_BOUNDS',
      pc: 1,
      instruction: 'ARRAY_LOAD',
      position: { line: 4, column: 9 },
    });
    expect(result.diagnostics).toEqual([result.error]);
    expect(result.pc).toBe(1);
    expect(result.instruction?.op).toBe('ARRAY_LOAD');
    expect(result.stack[0]).toMatchObject({ functionName: '<main>', pc: 1 });
  });

  it('rejects negative indexes on ARRAY_STORE', () => {
    const result = run(program([
      { op: 'ARRAY_ALLOC', dest: temp('a', intArray), elementType: 'int', length: 1 },
      { op: 'ARRAY_STORE', array: temp('a', intArray), index: int(-1), value: int(3) },
    ]));

    expect(result.error).toMatchObject({ code: 'HEAP_OUT_OF_BOUNDS', pc: 1, instruction: 'ARRAY_STORE' });
  });

  it('rejects null and dangling references', () => {
    const nullRef = run(program([
      { op: 'ARRAY_ALLOC', dest: temp('m', intMatrix), elementType: intArray, length: 1 },
      { op: 'ARRAY_LOAD', dest: temp('row', intArray), array: temp('m', intMatrix), index: int(0) },
      { op: 'ARRAY_LOAD', dest: temp('x'), array: temp('row', intArray), index: int(0) },
    ]));
    const uninitializedGlobal = run(program([
      { op: 'ARRAY_STORE', array: global('g', intArray), index: int(0), value: int(1) },
    ], [], [{ name: 'g', type: intArray }]));

    expect(nullRef.error).toMatchObject({ code: 'INVALID_REFERENCE', pc: 2, instruction: 'ARRAY_LOAD' });
    expect(uninitializedGlobal.error).toMatchObject({ code: 'INVALID_REFERENCE', pc: 0 });
  });

  it('validates index type and element type', () => {
    const floatIndex = run(program([
      { op: 'ARRAY_ALLOC', dest: temp('a', intArray), elementType: 'int', length: 2 },
      { op: 'ARRAY_LOAD', dest: temp('x'), array: temp('a', intArray), index: { kind: 'const', type: 'float', value: 0.5 } },
    ]));
    const wrongElement = run(program([
      { op: 'ARRAY_ALLOC', dest: temp('a', intArray), elementType: 'int', length: 2 },
      { op: 'ARRAY_STORE', array: temp('a', intArray), index: int(0), value: str('x') },
    ]));
    const notAnArray = run(program([
      { op: 'ARRAY_LOAD', dest: temp('x'), array: int(3), index: int(0) },
    ]));

    expect(floatIndex.error?.code).toBe('TYPE_ERROR');
    expect(wrongElement.error).toMatchObject({ code: 'TYPE_ERROR', instruction: 'ARRAY_STORE' });
    expect(notAnArray.error?.code).toBe('TYPE_ERROR');
  });

  it('passes and returns arrays by reference', () => {
    const xs = local('xs', intArray);
    const result = run(program([
      { op: 'ARRAY_ALLOC', dest: temp('a', intArray), elementType: 'int', length: 1 },
      { op: 'PARAM', value: temp('a', intArray) },
      { op: 'CALL', func: 'touch', argCount: 1, dest: temp('b', intArray) },
      { op: 'ARRAY_LOAD', dest: temp('x'), array: temp('a', intArray), index: int(0) },
      { op: 'PRINT', value: temp('x') },
    ], [{
      name: 'touch',
      params: [{ name: 'xs', type: intArray }],
      returnType: intArray,
      locals: [],
      body: [
        { op: 'ARRAY_STORE', array: xs, index: int(0), value: int(9) },
        { op: 'RETURN', value: xs },
      ],
    }]));

    expect(result.output).toEqual(['9']);
    expect(result.heap).toHaveLength(1);
  });
});

describe('VirtualMachine — invalid programs', () => {
  it('only accepts IR version 2.0', () => {
    const v1 = run({ ...program([]), version: '1.0' as typeof IR_VERSION });
    const missing = run(null as unknown as IRProgram);

    expect(v1.status).toBe('failed');
    expect(v1.error).toMatchObject({ phase: 'runtime', code: 'INVALID_PROGRAM' });
    expect(v1.error?.message).toContain('1.0');
    expect(missing.error?.code).toBe('INVALID_PROGRAM');
  });

  it('reports undefined reads, bad jumps, unknown opcodes, division by zero and step limits', () => {
    const undefinedRead = run(program([{ op: 'PRINT', value: temp('missing') }]));
    const badJump = run(program([{ op: 'JUMP', target: 'nowhere' }]));
    const unknown = run(program([{ op: 'NOPE' } as unknown as IRProgram['main'][number]]));
    const zero = run(program([
      { op: 'BINARY', operator: '/', operandType: 'int', dest: temp('t'), left: int(1), right: int(0) },
    ]));
    const infinite = run(program([{ op: 'LABEL', name: 'L1' }, { op: 'JUMP', target: 'L1' }]), 4);

    expect(undefinedRead.error?.code).toBe('UNDEFINED_VARIABLE');
    expect(badJump.error?.code).toBe('INVALID_JUMP');
    expect(unknown.error?.code).toBe('UNKNOWN_INSTRUCTION');
    expect(zero.error).toMatchObject({ code: 'DIVISION_BY_ZERO', pc: 0, instruction: 'BINARY' });
    expect(infinite.error?.code).toBe('STEP_LIMIT');
    expect(infinite.steps).toBe(4);
  });

  it('does not throw on malformed instructions', () => {
    const broken = { op: 'ASSIGN', dest: temp('t') } as unknown as IRProgram['main'][number];
    expect(() => run(program([broken]))).not.toThrow();
    expect(run(program([broken])).error?.phase).toBe('runtime');
  });
});

describe('RuntimeHeap', () => {
  it('stores typed blocks with stable references and checks bounds', () => {
    const heap = new RuntimeHeap();
    const reference = heap.allocate('string', 2);
    heap.write(reference, 1, 'stored');

    expect(heap.read(reference, 0)).toBe('');
    expect(heap.read(reference, 1)).toBe('stored');
    expect(heap.elementType(reference)).toBe('string');
    expect(heap.snapshot()).toEqual([{ address: reference.address, elementType: 'string', values: ['', 'stored'] }]);
    expect(() => heap.read(reference, 2)).toThrowError(RuntimeError);
    expect(() => heap.read({ address: 99 }, 0)).toThrowError(RuntimeError);
  });
});

describe('RuntimeStack', () => {
  it('snapshots frames as independent plain objects', () => {
    const stack = new RuntimeStack();
    const frame: StackFrame = {
      functionName: 'sample',
      returnPC: 4,
      programCounter: 2,
      body: [],
      labels: new Map(),
      locals: new Map([['p', 9]]),
      temporaries: new Map(),
      arguments: [9],
      pendingArguments: [],
    };
    stack.pushFrame(frame);
    const snapshot = stack.snapshot();
    snapshot[0].locals.p = 0;

    expect(snapshot[0]).toMatchObject({ functionName: 'sample', pc: 2, returnPC: 4 });
    expect(stack.current?.locals.get('p')).toBe(9);
    expect(stack.popFrame()).toBe(frame);
    expect(stack.depth).toBe(0);
  });
});
