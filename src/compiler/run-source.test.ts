import { describe, expect, it } from 'vitest';
import { IR_VERSION, type IRProgram } from './ir/instructions';
import { runSource, type SourceRunResult } from './run-source';
import { VirtualMachine } from './runtime';

function expectCompleted(result: SourceRunResult): string[] {
  if (!result.ok) throw new Error(`Falló en ${result.stage}: ${JSON.stringify(result.diagnostics)}`);
  expect(result.stage).toBe('completed');
  expect(result.diagnostics).toEqual([]);
  return result.execution?.output ?? [];
}

describe('runSource — end-to-end pipeline', () => {
  it('runs functions and preserves tokens, AST, IR v2.0 and execution', () => {
    const result = runSource(`
      function add(a: int, b: int) -> int {
        return a + b;
      }
      print(add(20, 22));
    `);

    expect(expectCompleted(result)).toEqual(['42']);
    expect(result.tokens.length).toBeGreaterThan(0);
    expect(result.ast?.kind).toBe('Program');
    expect(result.semantic?.ok).toBe(true);
    expect(result.ir?.version).toBe('2.0');
  });

  it('runs loops and assignments', () => {
    const result = runSource(`
      let i: int = 0;
      while (i < 3) {
        print(i);
        i = i + 1;
      }
    `);
    expect(expectCompleted(result)).toEqual(['0', '1', '2']);
    expect(result.execution?.globals.i).toBe(3);
  });

  it('runs recursion', () => {
    const result = runSource(`
      function fib(n: int) -> int {
        if (n < 2) { return n; }
        return fib(n - 1) + fib(n - 2);
      }
      print(fib(10));
    `);
    expect(expectCompleted(result)).toEqual(['55']);
  });

  it('runs 1D arrays, empty arrays and element assignment', () => {
    const result = runSource(`
      let xs: int[] = [3, 1, 4];
      let empty: string[];
      xs[1] = xs[0] + xs[2];
      print(xs[1]);
      let names: string[] = ["ana", "luis"];
      print(names[1]);
    `);
    expect(expectCompleted(result)).toEqual(['7', 'luis']);
    expect(result.execution?.heap.map((block) => block.values.length)).toEqual([3, 0, 2]);
  });

  it('runs nested arrays with one Heap block per dimension', () => {
    const result = runSource(`
      let m: int[][] = [[1, 2], [3, 4]];
      m[1][0] = 30;
      print(m[1][0] + m[0][1]);
    `);
    expect(expectCompleted(result)).toEqual(['32']);
    const outer = result.execution?.heap[0];
    expect(outer?.elementType).toEqual({ kind: 'array', elementType: 'int' });
    expect(outer?.values).toEqual([{ address: 2 }, { address: 3 }]);
  });

  it('shares the same block when an array is assigned (aliasing)', () => {
    const result = runSource(`
      let a: int[] = [1, 2];
      let b: int[] = a;
      b[0] = 99;
      print(a[0]);
      const c: int[] = a;
      c[1] = 5;
      print(b[1]);
    `);
    expect(expectCompleted(result)).toEqual(['99', '5']);
    expect(result.execution?.heap).toHaveLength(1);
    expect(result.execution?.globals.a).toEqual(result.execution?.globals.b);
  });

  it('passes arrays to functions and returns them by reference', () => {
    const result = runSource(`
      function fill(xs: int[], value: int) -> int[] {
        xs[0] = value;
        xs[1] = value * 2;
        return xs;
      }
      function sum(xs: int[], n: int) -> int {
        let total: int = 0;
        let i: int = 0;
        while (i < n) {
          total = total + xs[i];
          i = i + 1;
        }
        return total;
      }
      let data: int[] = [0, 0, 0];
      let same: int[] = fill(data, 4);
      same[2] = 1;
      print(data[1]);
      print(sum(data, 3));
    `);
    expect(expectCompleted(result)).toEqual(['8', '13']);
    expect(result.execution?.heap).toHaveLength(1);
  });

  it('reports an upper out-of-bounds access with PC, opcode and source position', () => {
    const result = runSource(`let xs: int[] = [1, 2, 3];
print(xs[0]);
print(xs[3]);`);

    expect(result.ok).toBe(false);
    expect(result.stage).toBe('runtime');
    expect(result.execution?.output).toEqual(['1']);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      phase: 'runtime',
      code: 'HEAP_OUT_OF_BOUNDS',
      instruction: 'ARRAY_LOAD',
      position: { line: 3, column: 7 },
    });
    const pc = result.diagnostics[0].pc;
    expect(pc).toBeTypeOf('number');
    expect(result.ir?.main[pc ?? -1].op).toBe('ARRAY_LOAD');
    expect(result.execution?.pc).toBe(pc);
  });

  it('reports a negative index computed at runtime', () => {
    const result = runSource(`
      let xs: int[] = [1, 2];
      let i: int = 0 - 1;
      xs[i] = 5;
    `);
    expect(result.stage).toBe('runtime');
    expect(result.diagnostics[0]).toMatchObject({ code: 'HEAP_OUT_OF_BOUNDS', instruction: 'ARRAY_STORE' });
    expect(result.diagnostics[0].message).toContain('-1');
  });

  it('reports out-of-bounds inside a function with the frame on the Stack', () => {
    const result = runSource(`
      function at(xs: int[], i: int) -> int {
        return xs[i];
      }
      let xs: int[] = [];
      print(at(xs, 0));
    `);
    expect(result.stage).toBe('runtime');
    expect(result.diagnostics[0]).toMatchObject({ code: 'HEAP_OUT_OF_BOUNDS', position: { line: 3 } });
    expect(result.execution?.functionName).toBe('at');
    expect(result.execution?.stack.map((frame) => frame.functionName)).toEqual(['<main>', 'at']);
  });

  it('returns other runtime errors without throwing', () => {
    const result = runSource('print(1 / 0);');
    expect(result.stage).toBe('runtime');
    expect(result.diagnostics[0]).toMatchObject({ phase: 'runtime', code: 'DIVISION_BY_ZERO', position: { line: 1 } });
  });

  it('stops infinite recursion with the step limit', () => {
    const result = runSource(`
      function loop(n: int) -> int { return loop(n + 1); }
      print(loop(0));
    `, { maxSteps: 500 });
    expect(result.diagnostics[0]?.code).toBe('STEP_LIMIT');
  });

  it('returns frontend and semantic diagnostics with the common shape', () => {
    const lexical = runSource('let x: int = 1 # 2;');
    const syntax = runSource('print(1)');
    const semantic = runSource('let xs: int[] = [1]; print(xs[true]);');

    expect(lexical).toMatchObject({ ok: false, stage: 'lexical', ast: null, ir: null, execution: null });
    expect(lexical.diagnostics[0].phase).toBe('lexical');
    expect(syntax).toMatchObject({ ok: false, stage: 'syntax', ir: null });
    expect(syntax.tokens.length).toBeGreaterThan(0);
    expect(semantic).toMatchObject({ ok: false, stage: 'semantic', ir: null, execution: null });
    expect(semantic.ast?.kind).toBe('Program');
    expect(semantic.diagnostics.every((diagnostic) => diagnostic.phase === 'semantic')).toBe(true);
  });
});

describe('VirtualMachine — programs that the generator never produces', () => {
  it('rejects an IR program with the wrong version', () => {
    const compiled = runSource('print(1);');
    const legacy = { ...compiled.ir, version: '1.0' } as unknown as IRProgram;
    const result = new VirtualMachine().execute(legacy);

    expect(result.status).toBe('failed');
    expect(result.output).toEqual([]);
    expect(result.error).toMatchObject({ phase: 'runtime', code: 'INVALID_PROGRAM' });
  });

  it('rejects an invalid Heap reference', () => {
    const intArray = { kind: 'array', elementType: 'int' } as const;
    const program: IRProgram = {
      version: IR_VERSION,
      globals: [{ name: 'xs', type: intArray }],
      functions: [],
      main: [
        { op: 'ARRAY_LOAD', dest: { kind: 'temp', name: 't1', type: 'int' }, array: { kind: 'var', name: 'xs', scope: 'global', type: intArray }, index: { kind: 'const', type: 'int', value: 0 }, position: { line: 2, column: 5 } },
      ],
    };
    const result = new VirtualMachine().execute(program);

    expect(result.error).toMatchObject({ code: 'INVALID_REFERENCE', pc: 0, instruction: 'ARRAY_LOAD', position: { line: 2, column: 5 } });
  });
});
