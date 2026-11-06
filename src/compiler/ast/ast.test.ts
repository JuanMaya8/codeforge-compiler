import { describe, expect, it } from 'vitest';
import type { BlockStatement, Program, TypeAnnotation } from './index.ts';
import { printAst, typeToString } from './index.ts';

const at = { line: 1, column: 1 };

describe('AST: typeToString', () => {
  it('formats primitive and nested array types', () => {
    const int: TypeAnnotation = { kind: 'PrimitiveType', name: 'int', position: at };
    const intArray: TypeAnnotation = { kind: 'ArrayType', elementType: int, position: at };
    const matrix: TypeAnnotation = { kind: 'ArrayType', elementType: intArray, position: at };
    expect([typeToString(int), typeToString(intArray), typeToString(matrix)]).toEqual(['int', 'int[]', 'int[][]']);
  });
});

describe('AST: printAst', () => {
  it('draws a hand-built tree', () => {
    // let total: float = -(price * 2);
    const program: Program = {
      kind: 'Program',
      position: at,
      body: [
        {
          kind: 'VariableDeclaration',
          mutability: 'let',
          name: 'total',
          typeAnnotation: { kind: 'PrimitiveType', name: 'float', position: at },
          initializer: {
            kind: 'UnaryExpression',
            operator: '-',
            position: at,
            operand: {
              kind: 'BinaryExpression',
              operator: '*',
              position: at,
              left: { kind: 'IdentifierExpression', name: 'price', position: at },
              right: { kind: 'LiteralExpression', literalType: 'int', value: 2, position: at },
            },
          },
          position: at,
        },
      ],
    };

    expect(printAst(program)).toBe(
      [
        'Program',
        '└─ VariableDeclaration let total: float',
        '   └─ UnaryExpression -',
        '      └─ BinaryExpression *',
        '         ├─ Identifier price',
        '         └─ Literal int 2',
      ].join('\n'),
    );
  });

  it('labels the roles of if branches', () => {
    const empty: BlockStatement = { kind: 'BlockStatement', body: [], position: at };
    const program: Program = {
      kind: 'Program',
      position: at,
      body: [
        {
          kind: 'IfStatement',
          condition: { kind: 'LiteralExpression', literalType: 'bool', value: true, position: at },
          consequent: empty,
          alternate: empty,
          position: at,
        },
      ],
    };

    expect(printAst(program)).toBe(
      [
        'Program',
        '└─ IfStatement',
        '   ├─ condition: Literal bool true',
        '   ├─ then: BlockStatement',
        '   └─ else: BlockStatement',
      ].join('\n'),
    );
  });
});
