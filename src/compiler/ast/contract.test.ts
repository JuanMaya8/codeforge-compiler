/**
 * Contract tests for the canonical AST.
 *
 * Semantic analysis and IR generation consume these nodes directly, so
 * these tests fail if a node kind, a field used by those phases or the
 * position format changes by accident.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import { parseSource } from '../frontend.ts';
import { AST_NODE_KINDS, type AstNode, type AstNodeKind, type Program } from './index.ts';

/** A program that uses every construct of the language. */
const ALL_CONSTRUCTS = `
const LIMIT: int = 3;
let ratio: float = 1.5;
let name = "CodeForge";
let flags: bool[] = [true, false];
let grid: int[][] = [[1, 2], [3, 4]];
let total: int;

function sum(a: int, b: int) -> int {
  return a + b;
}

function log(message: string) {
  print(message);
  return;
}

grid[0][1] = sum(grid[1][0], -LIMIT);
total = 0;
while (total < LIMIT && !flags[1]) {
  total = total + 1;
}
if (total == LIMIT) { log(name); } else if (ratio > 1.0) { print(ratio); } else { { print(0); } }
`;

function parseValid(source: string): Program {
  const result = parseSource(source);
  expect(result.errors).toEqual([]);
  if (!result.program) throw new Error('expected a program');
  return result.program;
}

/** Collects every AST node (objects with a `kind` field) in depth-first order. */
function collectNodes(value: unknown, found: AstNode[] = []): AstNode[] {
  if (Array.isArray(value)) {
    value.forEach((item) => collectNodes(item, found));
  } else if (value !== null && typeof value === 'object') {
    if ('kind' in value) found.push(value as AstNode);
    Object.values(value).forEach((child) => collectNodes(child, found));
  }
  return found;
}

describe('AST contract', () => {
  it('AST_NODE_KINDS lists exactly the kinds of the AstNode union', () => {
    expectTypeOf<(typeof AST_NODE_KINDS)[number]>().toEqualTypeOf<AstNodeKind>();
    expect(new Set(AST_NODE_KINDS).size).toBe(AST_NODE_KINDS.length);
  });

  it('the parser produces every node kind of the contract', () => {
    const kinds = new Set(collectNodes(parseValid(ALL_CONSTRUCTS)).map((node) => node.kind));
    expect([...kinds].sort()).toEqual([...AST_NODE_KINDS].sort());
  });

  it('every node has position { line, column } starting at 1', () => {
    for (const node of collectNodes(parseValid(ALL_CONSTRUCTS))) {
      expect(Object.keys(node.position).sort()).toEqual(['column', 'line']);
      expect(node.position.line).toBeGreaterThanOrEqual(1);
      expect(node.position.column).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps nested array types, array literals, indexing and indexed assignment', () => {
    const program = parseValid('let grid: int[][] = [[1]];\ngrid[0][0] = 5;');
    expect(program.body).toMatchObject([
      {
        kind: 'VariableDeclaration',
        typeAnnotation: {
          kind: 'ArrayType',
          elementType: { kind: 'ArrayType', elementType: { kind: 'PrimitiveType', name: 'int' } },
        },
        initializer: { kind: 'ArrayExpression', elements: [{ kind: 'ArrayExpression' }] },
      },
      {
        kind: 'ExpressionStatement',
        expression: {
          kind: 'AssignmentExpression',
          target: {
            kind: 'IndexExpression',
            object: { kind: 'IndexExpression', object: { kind: 'IdentifierExpression', name: 'grid' } },
            index: { kind: 'LiteralExpression', literalType: 'int', value: 0 },
          },
          value: { kind: 'LiteralExpression', value: 5 },
        },
        position: { line: 2, column: 1 },
      },
    ]);
  });

  it('uses null for omitted return type, omitted annotation and missing values', () => {
    const program = parseValid('function f() { return; }\nlet x = 1;\nlet y: int;');
    expect(program.body).toMatchObject([
      { kind: 'FunctionDeclaration', returnType: null, body: { body: [{ kind: 'ReturnStatement', argument: null }] } },
      { kind: 'VariableDeclaration', typeAnnotation: null, initializer: { value: 1 } },
      { kind: 'VariableDeclaration', typeAnnotation: { name: 'int' }, initializer: null },
    ]);
  });
});
