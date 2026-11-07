import { describe, expect, it } from 'vitest';
import type { Expression, Program, Statement } from '../ast/index.ts';
import { tokenize } from '../lexer/index.ts';
import { TokenType } from '../tokens.ts';
import { Parser, parseTokens } from './index.ts';

/** Parses source code that must be valid and returns the AST. */
function parseValid(source: string): Program {
  const { program, errors } = parseTokens(tokenize(source).tokens);
  expect(errors).toEqual([]);
  return program;
}

function firstStatement(source: string): Statement {
  return parseValid(source).body[0];
}

/** Expression of the first statement, `source` must be `<expr>;`. */
function expressionOf(source: string): Expression {
  const statement = firstStatement(source);
  if (statement.kind !== 'ExpressionStatement') throw new Error(`Expected ExpressionStatement, got ${statement.kind}`);
  return statement.expression;
}

/**
 * Writes an expression with full parentheses, so precedence and
 * associativity can be checked in one line: `1 + 2 * 3` → `(1 + (2 * 3))`.
 */
function group(expression: Expression): string {
  switch (expression.kind) {
    case 'LiteralExpression':
      return JSON.stringify(expression.value);
    case 'IdentifierExpression':
      return expression.name;
    case 'BinaryExpression':
      return `(${group(expression.left)} ${expression.operator} ${group(expression.right)})`;
    case 'UnaryExpression':
      return `(${expression.operator}${group(expression.operand)})`;
    case 'AssignmentExpression':
      return `(${group(expression.target)} = ${group(expression.value)})`;
    case 'CallExpression':
      return `${expression.callee.name}(${expression.args.map(group).join(', ')})`;
    case 'ArrayExpression':
      return `[${expression.elements.map(group).join(', ')}]`;
    case 'IndexExpression':
      return `${group(expression.object)}[${group(expression.index)}]`;
  }
}

function syntaxErrors(source: string) {
  return parseTokens(tokenize(source).tokens).errors;
}

describe('Parser: declarations', () => {
  it('parses a typed variable declaration', () => {
    expect(firstStatement('let age: int = 21;')).toEqual({
      kind: 'VariableDeclaration',
      mutability: 'let',
      name: 'age',
      typeAnnotation: { kind: 'PrimitiveType', name: 'int', position: { line: 1, column: 10 } },
      initializer: { kind: 'LiteralExpression', literalType: 'int', value: 21, position: { line: 1, column: 16 } },
      position: { line: 1, column: 1 },
    });
  });

  it('parses const, inferred types and declarations without initializer', () => {
    const [constant, inferred, uninitialized] = parseValid(
      'const PI: float = 3.14; let name = "Ana"; let total: int;',
    ).body;
    expect(constant).toMatchObject({ mutability: 'const', name: 'PI', initializer: { value: 3.14 } });
    expect(inferred).toMatchObject({ name: 'name', typeAnnotation: null, initializer: { literalType: 'string' } });
    expect(uninitialized).toMatchObject({ name: 'total', initializer: null });
  });

  it('parses array types, including nested ones', () => {
    const declaration = firstStatement('let grid: int[][] = [[1, 2], [3]];');
    expect(declaration).toMatchObject({
      typeAnnotation: { kind: 'ArrayType', elementType: { kind: 'ArrayType', elementType: { name: 'int' } } },
      initializer: { kind: 'ArrayExpression', elements: [{ kind: 'ArrayExpression' }, { kind: 'ArrayExpression' }] },
    });
  });

  it('parses a function with parameters and return type', () => {
    const fn = firstStatement('function sum(a: int, b: int) -> int { return a + b; }');
    expect(fn).toMatchObject({
      kind: 'FunctionDeclaration',
      name: 'sum',
      params: [
        { kind: 'Parameter', name: 'a', typeAnnotation: { name: 'int' } },
        { kind: 'Parameter', name: 'b', typeAnnotation: { name: 'int' } },
      ],
      returnType: { kind: 'PrimitiveType', name: 'int' },
      body: { kind: 'BlockStatement', body: [{ kind: 'ReturnStatement', argument: { kind: 'BinaryExpression' } }] },
    });
  });

  it('parses a function without parameters nor return type', () => {
    expect(firstStatement('function hello() { print("hi"); }')).toMatchObject({
      params: [],
      returnType: null,
    });
  });

  it('parses a recursive function', () => {
    const fn = firstStatement(
      'function fact(n: int) -> int { if (n <= 1) { return 1; } return n * fact(n - 1); }',
    );
    if (fn.kind !== 'FunctionDeclaration') throw new Error('expected function');
    const lastReturn = fn.body.body[1];
    if (lastReturn.kind !== 'ReturnStatement' || !lastReturn.argument) throw new Error('expected return');
    expect(group(lastReturn.argument)).toBe('(n * fact((n - 1)))');
  });
});

describe('Parser: statements', () => {
  it('parses if / else if / else', () => {
    const statement = firstStatement('if (a) { print(1); } else if (b) { print(2); } else { print(3); }');
    expect(statement).toMatchObject({
      kind: 'IfStatement',
      condition: { kind: 'IdentifierExpression', name: 'a' },
      consequent: { kind: 'BlockStatement' },
      alternate: {
        kind: 'IfStatement',
        condition: { name: 'b' },
        alternate: { kind: 'BlockStatement', body: [{ kind: 'PrintStatement' }] },
      },
    });
  });

  it('parses an if without else', () => {
    expect(firstStatement('if (ok) { print(1); }')).toMatchObject({ alternate: null });
  });

  it('parses while loops', () => {
    expect(firstStatement('while (i < 10) { i = i + 1; }')).toMatchObject({
      kind: 'WhileStatement',
      condition: { kind: 'BinaryExpression', operator: '<' },
      body: { body: [{ kind: 'ExpressionStatement', expression: { kind: 'AssignmentExpression' } }] },
    });
  });

  it('parses return with and without value', () => {
    const fn = firstStatement('function f() { return; return 5; }');
    expect(fn).toMatchObject({ body: { body: [{ argument: null }, { argument: { value: 5 } }] } });
  });

  it('parses print, nested blocks and expression statements', () => {
    const body = parseValid('print("x"); { let y = 1; { y = 2; } } greet();').body;
    expect(body.map((s) => s.kind)).toEqual(['PrintStatement', 'BlockStatement', 'ExpressionStatement']);
  });
});

describe('Parser: expressions, precedence and associativity', () => {
  it.each([
    ['1 + 2 * 3;', '(1 + (2 * 3))'],
    ['(1 + 2) * 3;', '((1 + 2) * 3)'],
    ['10 - 4 - 3;', '((10 - 4) - 3)'],
    ['8 / 4 / 2;', '((8 / 4) / 2)'],
    ['a % 2 == 0;', '((a % 2) == 0)'],
    ['a + b < c * d;', '((a + b) < (c * d))'],
    ['a < b == c > d;', '((a < b) == (c > d))'],
    ['a || b && c;', '(a || (b && c))'],
    ['a && b || c && d;', '((a && b) || (c && d))'],
    ['!a && b;', '((!a) && b)'],
    ['-a * b;', '((-a) * b)'],
    ['!!ok;', '(!(!ok))'],
    ['- -x;', '(-(-x))'],
    ['a = b = 3;', '(a = (b = 3))'],
    ['x = 1 + 2;', '(x = (1 + 2))'],
    ['age >= 18 && age != 21;', '((age >= 18) && (age != 21))'],
  ])('%s → %s', (source, expected) => {
    expect(group(expressionOf(source))).toBe(expected);
  });

  it('parses calls with zero, one and several arguments', () => {
    expect(group(expressionOf('f();'))).toBe('f()');
    expect(group(expressionOf('sum(age, 5);'))).toBe('sum(age, 5)');
    expect(group(expressionOf('max(a + 1, g(b), [1]);'))).toBe('max((a + 1), g(b), [1])');
  });

  it('parses arrays and indexing, including chained and assigned indexes', () => {
    expect(group(expressionOf('[];'))).toBe('[]');
    expect(group(expressionOf('m[i][j + 1];'))).toBe('m[i][(j + 1)]');
    expect(group(expressionOf('list[0] = list[1] * 2;'))).toBe('(list[0] = (list[1] * 2))');
    expect(group(expressionOf('getList()[0];'))).toBe('getList()[0]');
  });

  it('builds literals of every type', () => {
    const [i, f, s, b] = ['7;', '2.5;', '"hi";', 'false;'].map(expressionOf);
    expect([i, f, s, b]).toMatchObject([
      { literalType: 'int', value: 7 },
      { literalType: 'float', value: 2.5 },
      { literalType: 'string', value: 'hi' },
      { literalType: 'bool', value: false },
    ]);
  });
});

describe('Parser: syntax errors', () => {
  it('reports a missing semicolon at the end of the previous line', () => {
    expect(syntaxErrors('let x = 5\nprint(x);')).toEqual([
      {
        phase: 'syntax',
        code: 'EXPECTED_TOKEN',
        message: "Se esperaba ';' al final de la declaración de variable, pero se encontró 'print'.",
        position: { line: 1, column: 10 },
      },
    ]);
  });

  it('reports a missing expression', () => {
    expect(syntaxErrors('let x = ;')).toEqual([
      {
        phase: 'syntax',
        code: 'EXPECTED_EXPRESSION',
        message: "Se esperaba una expresión, pero se encontró ';'.",
        position: { line: 1, column: 9 },
      },
    ]);
  });

  it('reports an unclosed block mentioning where it was opened', () => {
    const [error] = syntaxErrors('if (a) {\n  print(1);\n');
    expect(error.code).toBe('EXPECTED_TOKEN');
    expect(error.message).toBe("Se esperaba '}' para cerrar el if abierto en la línea 1, pero se encontró el fin del archivo.");
  });

  it('requires braces around if bodies', () => {
    expect(syntaxErrors('if (a) print(1);')[0].message).toContain("Se esperaba '{' para abrir el if");
  });

  it('reports invalid types and missing parameter types', () => {
    const [invalidType] = syntaxErrors('let x: number = 1;');
    expect(invalidType.code).toBe('EXPECTED_TYPE');
    expect(invalidType.message).toContain('Se esperaba un tipo (int, float, string o bool)');
    expect(syntaxErrors('function f(a) { }')[0].message).toContain("Se esperaba ':' y el tipo del parámetro 'a'");
  });

  it('reports const without value and let without type or value', () => {
    expect(syntaxErrors('const X: int;')[0]).toMatchObject({
      code: 'CONST_WITHOUT_INITIALIZER',
      message: "La constante 'X' debe tener un valor inicial.",
    });
    expect(syntaxErrors('let y;')[0]).toMatchObject({
      code: 'MISSING_TYPE_OR_INITIALIZER',
      message: "La variable 'y' necesita un tipo (': int') o un valor inicial.",
    });
  });

  it('reports invalid assignment targets', () => {
    expect(syntaxErrors('5 = 3;')[0]).toMatchObject({
      code: 'INVALID_ASSIGNMENT_TARGET',
      position: { line: 1, column: 3 },
    });
    expect(syntaxErrors('f() = 3;')[0].message).toContain('Destino de asignación no válido');
  });

  it('reports calls on something that is not a function name', () => {
    expect(syntaxErrors('(a + b)(1);')[0]).toMatchObject({
      code: 'INVALID_CALLEE',
      message: 'Solo se pueden llamar funciones usando su nombre.',
    });
  });

  it('reports functions declared inside blocks', () => {
    const [error] = syntaxErrors('if (a) { function g() { } }');
    expect(error.code).toBe('NESTED_FUNCTION');
    expect(error.message).toContain('Las funciones solo pueden declararse en el nivel superior');
  });

  it('recovers after an error and reports the following ones (panic mode)', () => {
    const source = 'let a = ;\nlet b: int = 2;\nprint(b\nlet c = 3 +;\n}';
    const { program, errors } = parseTokens(tokenize(source).tokens);
    expect(errors.map((e) => e.position?.line)).toEqual([1, 3, 4, 5]);
    // The valid declaration between the errors is still in the AST.
    expect(program.body).toMatchObject([{ kind: 'VariableDeclaration', name: 'b' }]);
  });

  it('skips the body of a broken header instead of reporting cascading errors', () => {
    const source = 'function add(a, b: int) -> int {\n  return a + b;\n}\nif (x > 3 { print(x); }\nprint(1);';
    const { program, errors } = parseTokens(tokenize(source).tokens);
    expect(errors.map((e) => e.position?.line)).toEqual([1, 4]);
    expect(program.body).toMatchObject([{ kind: 'PrintStatement' }]);
  });

  it('does not loop forever on stray tokens', () => {
    expect(syntaxErrors('} } ) ]').length).toBeGreaterThan(0);
  });
});

describe('Parser: input handling', () => {
  it('returns an empty program for empty input', () => {
    expect(parseValid('')).toEqual({ kind: 'Program', body: [], position: { line: 1, column: 1 } });
  });

  it('adds a missing EOF token instead of crashing', () => {
    const tokens = tokenize('print(1);').tokens.filter((t) => t.type !== TokenType.EOF);
    expect(new Parser(tokens).parse().errors).toEqual([]);
    expect(new Parser([]).parse().program.body).toEqual([]);
  });
});
