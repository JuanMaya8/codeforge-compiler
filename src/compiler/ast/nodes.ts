import type { SourcePosition } from '../tokens.ts';

export type { SourcePosition };

/**
 * Abstract Syntax Tree (AST) for CodeForge — CANONICAL CONTRACT.
 *
 * This file is the single AST definition shared by the whole compiler:
 * the parser produces these nodes and the semantic analyzer and the IR
 * generator consume them directly (no duplicated or adapted AST).
 * Changing a node is a contract change and must be agreed by the team.
 *
 * Every node is a plain object with a `kind` field. `kind` is the
 * discriminant of a TypeScript discriminated union: inside
 * `switch (node.kind)` the compiler knows the exact node type, so later
 * phases can walk the tree safely.
 *
 * Every node also stores `position`: the line and column of the token
 * where the construct starts, for diagnostics.
 */
interface BaseNode {
  position: SourcePosition;
}

// -------------------------------------------------------------------------
// Type annotations: `int`, `float`, `string`, `bool`, `int[]`, `int[][]`...
// -------------------------------------------------------------------------

export type PrimitiveTypeName = 'int' | 'float' | 'string' | 'bool';

export interface PrimitiveType extends BaseNode {
  kind: 'PrimitiveType';
  name: PrimitiveTypeName;
}

/** `int[]` is ArrayType(PrimitiveType int); `int[][]` nests one more level. */
export interface ArrayType extends BaseNode {
  kind: 'ArrayType';
  elementType: TypeAnnotation;
}

export type TypeAnnotation = PrimitiveType | ArrayType;

// -------------------------------------------------------------------------
// Program and statements
// -------------------------------------------------------------------------

/** Root of the tree: the list of top-level statements. */
export interface Program extends BaseNode {
  kind: 'Program';
  body: Statement[];
}

/** `let x: int = 5;` or `const PI: float = 3.14;` */
export interface VariableDeclaration extends BaseNode {
  kind: 'VariableDeclaration';
  mutability: 'let' | 'const';
  name: string;
  /** `null` when the type is omitted (`let x = 5;`): the semantic phase infers it. */
  typeAnnotation: TypeAnnotation | null;
  /** `null` when there is no initial value (only allowed for `let` with a type). */
  initializer: Expression | null;
}

/** One function parameter: `a: int`. */
export interface Parameter extends BaseNode {
  kind: 'Parameter';
  name: string;
  typeAnnotation: TypeAnnotation;
}

/** `function sum(a: int, b: int) -> int { ... }` */
export interface FunctionDeclaration extends BaseNode {
  kind: 'FunctionDeclaration';
  name: string;
  params: Parameter[];
  /** `null` when `-> type` is omitted: the function returns no value. */
  returnType: TypeAnnotation | null;
  body: BlockStatement;
}

/** `{ ... }` — introduces a new scope. */
export interface BlockStatement extends BaseNode {
  kind: 'BlockStatement';
  body: Statement[];
}

/** `if (cond) { ... } else { ... }` or `else if (...) { ... }` */
export interface IfStatement extends BaseNode {
  kind: 'IfStatement';
  condition: Expression;
  consequent: BlockStatement;
  /** `else { ... }` → BlockStatement, `else if` → IfStatement, no else → null. */
  alternate: BlockStatement | IfStatement | null;
}

/** `while (cond) { ... }` */
export interface WhileStatement extends BaseNode {
  kind: 'WhileStatement';
  condition: Expression;
  body: BlockStatement;
}

/** `return expr;` or `return;` */
export interface ReturnStatement extends BaseNode {
  kind: 'ReturnStatement';
  argument: Expression | null;
}

/** `print(expr);` */
export interface PrintStatement extends BaseNode {
  kind: 'PrintStatement';
  argument: Expression;
}

/** An expression used as a statement: `x = 5;`, `greet();` */
export interface ExpressionStatement extends BaseNode {
  kind: 'ExpressionStatement';
  expression: Expression;
}

export type Statement =
  | VariableDeclaration
  | FunctionDeclaration
  | BlockStatement
  | IfStatement
  | WhileStatement
  | ReturnStatement
  | PrintStatement
  | ExpressionStatement;

// -------------------------------------------------------------------------
// Expressions
// -------------------------------------------------------------------------

export type ArithmeticOperator = '+' | '-' | '*' | '/' | '%';
export type RelationalOperator = '==' | '!=' | '<' | '<=' | '>' | '>=';
export type LogicalOperator = '&&' | '||';
export type BinaryOperator = ArithmeticOperator | RelationalOperator | LogicalOperator;
export type UnaryOperator = '-' | '!';

/** Only variables and array elements can receive a value. */
export type AssignmentTarget = IdentifierExpression | IndexExpression;

/** `x = 5`, `list[0] = 7` — right associative: `a = b = 1` is `a = (b = 1)`. */
export interface AssignmentExpression extends BaseNode {
  kind: 'AssignmentExpression';
  target: AssignmentTarget;
  value: Expression;
}

/** `a + b`, `x >= 18`, `ok && done` */
export interface BinaryExpression extends BaseNode {
  kind: 'BinaryExpression';
  operator: BinaryOperator;
  left: Expression;
  right: Expression;
}

/** `-x`, `!done` */
export interface UnaryExpression extends BaseNode {
  kind: 'UnaryExpression';
  operator: UnaryOperator;
  operand: Expression;
}

/** Literal value. Keeps both the CodeForge type and the JavaScript value. */
export type LiteralExpression = BaseNode & { kind: 'LiteralExpression' } & (
    | { literalType: 'int'; value: number }
    | { literalType: 'float'; value: number }
    | { literalType: 'string'; value: string }
    | { literalType: 'bool'; value: boolean }
  );

/** A variable or function name used inside an expression. */
export interface IdentifierExpression extends BaseNode {
  kind: 'IdentifierExpression';
  name: string;
}

/** `sum(a, 5)` — functions are called by name only. */
export interface CallExpression extends BaseNode {
  kind: 'CallExpression';
  callee: IdentifierExpression;
  args: Expression[];
}

/** `[1, 2, 3]` */
export interface ArrayExpression extends BaseNode {
  kind: 'ArrayExpression';
  elements: Expression[];
}

/** `list[0]`, `matrix[i][j]` (nested IndexExpression). */
export interface IndexExpression extends BaseNode {
  kind: 'IndexExpression';
  object: Expression;
  index: Expression;
}

export type Expression =
  | AssignmentExpression
  | BinaryExpression
  | UnaryExpression
  | LiteralExpression
  | IdentifierExpression
  | CallExpression
  | ArrayExpression
  | IndexExpression;

/** Any node of the tree. */
export type AstNode = Program | Statement | Expression | Parameter | TypeAnnotation;

export type AstNodeKind = AstNode['kind'];

/**
 * Every `kind` of the AST, at runtime (useful for tests, tools and the UI).
 * The contract test checks that this list and `AstNodeKind` stay identical.
 */
export const AST_NODE_KINDS = [
  'Program',
  'VariableDeclaration',
  'FunctionDeclaration',
  'Parameter',
  'BlockStatement',
  'IfStatement',
  'WhileStatement',
  'ReturnStatement',
  'PrintStatement',
  'ExpressionStatement',
  'AssignmentExpression',
  'BinaryExpression',
  'UnaryExpression',
  'LiteralExpression',
  'IdentifierExpression',
  'CallExpression',
  'ArrayExpression',
  'IndexExpression',
  'PrimitiveType',
  'ArrayType',
] as const satisfies readonly AstNodeKind[];
