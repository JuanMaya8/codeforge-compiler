import { describe, expect, it } from 'vitest';
import { runSource } from './run-source';

describe('runSource integration pipeline', () => {
  it('runs source through Jack AST, Deivid semantic/IR, and the VM', () => {
    const result = runSource(`
      function add(a: int, b: int) -> int {
        return a + b;
      }
      print(add(20, 22));
    `);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Unexpected ${result.stage} failure`);
    expect(result.execution.output).toEqual(['42']);
    expect(result.ir.version).toBe('1.0');
  });

  it('runs loops and assignments from source', () => {
    const result = runSource(`
      let i: int = 0;
      while (i < 3) {
        print(i);
        i = i + 1;
      }
    `);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Unexpected ${result.stage} failure`);
    expect(result.execution.output).toEqual(['0', '1', '2']);
  });

  it('returns front-end and semantic diagnostics by stage', () => {
    const syntax = runSource('print(1)');
    const semantic = runSource('print(notDeclared);');

    expect(syntax).toMatchObject({ ok: false, stage: 'syntax' });
    expect(semantic).toMatchObject({ ok: false, stage: 'semantic' });
  });

  it('reports AST features that have not been agreed in the semantic contract', () => {
    const result = runSource('let items: int[] = [1, 2];');

    expect(result).toMatchObject({ ok: false, stage: 'integration' });
    if (!result.ok && result.stage === 'integration') {
      expect(result.errors[0].message).toContain('Array types are not supported');
    }
  });

  it('returns runtime diagnostics without throwing', () => {
    const result = runSource('print(1 / 0);');

    expect(result).toMatchObject({ ok: false, stage: 'runtime' });
    if (!result.ok && result.stage === 'runtime') {
      expect(result.execution.error?.code).toBe('DIVISION_BY_ZERO');
      expect(result.execution.error?.pc).toBeDefined();
    }
  });
});
