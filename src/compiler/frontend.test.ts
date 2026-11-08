import { describe, expect, it } from 'vitest';
import { parseSource, printAst } from './frontend.ts';

/** Example program from the project specification. */
const SPEC_EXAMPLE = `let age: int = 21;

function sum(a: int, b: int) -> int {
    return a + b;
}

if (age >= 18) {
    print(sum(age, 5));
} else {
    print("Minor");
}
`;

describe('Frontend integration (Lexer → Parser → AST)', () => {
  it('analyzes the example program of the specification', () => {
    const result = parseSource(SPEC_EXAMPLE);

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.tokens.at(-1)?.type).toBe('EOF');
    expect(result.program && printAst(result.program)).toBe(
      [
        'Program',
        '├─ VariableDeclaration let age: int',
        '│  └─ Literal int 21',
        '├─ FunctionDeclaration sum(a: int, b: int) -> int',
        '│  └─ BlockStatement',
        '│     └─ ReturnStatement',
        '│        └─ BinaryExpression +',
        '│           ├─ Identifier a',
        '│           └─ Identifier b',
        '└─ IfStatement',
        '   ├─ condition: BinaryExpression >=',
        '   │  ├─ Identifier age',
        '   │  └─ Literal int 18',
        '   ├─ then: BlockStatement',
        '   │  └─ PrintStatement',
        '   │     └─ CallExpression sum',
        '   │        ├─ Identifier age',
        '   │        └─ Literal int 5',
        '   └─ else: BlockStatement',
        '      └─ PrintStatement',
        '         └─ Literal string "Minor"',
      ].join('\n'),
    );
  });

  it('analyzes a program with arrays, while loops and recursion', () => {
    const source = `
      function fib(n: int) -> int {
        if (n < 2) { return n; }
        return fib(n - 1) + fib(n - 2);
      }
      let values: int[] = [0, 0, 0, 0, 0];
      let i: int = 0;
      while (i < 5 && true) {
        values[i] = fib(i);
        i = i + 1;
      }
      print(values[4]);
    `;
    const result = parseSource(source);
    expect(result.errors).toEqual([]);
    expect(result.program?.body.map((s) => s.kind)).toEqual([
      'FunctionDeclaration',
      'VariableDeclaration',
      'VariableDeclaration',
      'WhileStatement',
      'PrintStatement',
    ]);
  });

  it('stops after lexical errors and does not run the parser', () => {
    const result = parseSource('let x = 5 @ 3;');
    expect(result.success).toBe(false);
    expect(result.program).toBeNull();
    expect(result.errors.map((e) => e.phase)).toEqual(['lexical']);
  });

  it('returns syntax errors together with the partial AST', () => {
    const result = parseSource('let x: int = 1;\nprint(x');
    expect(result.success).toBe(false);
    expect(result.errors).toMatchObject([{ phase: 'syntax', code: 'EXPECTED_TOKEN', position: { line: 2 } }]);
    expect(result.program?.body).toHaveLength(1);
  });

  it('produces a JSON-serializable AST (useful for the UI and debugging)', () => {
    const { program } = parseSource(SPEC_EXAMPLE);
    expect(JSON.parse(JSON.stringify(program))).toEqual(program);
  });
});
