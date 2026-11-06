/**
 * CONTRATO PROVISIONAL DEL AST
 * ============================================================================
 * ⚠️  SUPUESTO: al momento de escribir este módulo NO existe todavía
 * `src/compiler/ast/` (responsabilidad de Jack). Estas interfaces son el
 * contrato que el análisis semántico y el generador de IR esperan recibir.
 *
 * Cuando el Parser de Jack esté disponible hay dos caminos:
 *   1. Que su AST use exactamente estas formas  → se reemplaza este archivo
 *      por un `export type { ... } from '../ast'`.
 *   2. Que su AST difiera                         → se escribe un pequeño
 *      adaptador `ast-adapter.ts` que traduzca su AST a estas formas.
 *
 * Ninguna integración con el Parser real ha sido probada todavía.
 *
 * Lenguaje asumido (sintaxis de referencia, tipo C):
 *
 *   let x: int = 5;          // variable mutable (tipo explícito)
 *   let y = 2.5;             // variable mutable (tipo inferido)
 *   const NAME: string = "a";// constante (inicializador obligatorio)
 *   fn suma(a: int, b: int): int { return a + b; }
 *   if (cond) { ... } else { ... }
 *   while (cond) { ... }
 *   print(expr);
 *   x = expr;                // asignación
 *   float(x)                 // conversión explícita (CastExpression)
 */

/** Tipos primitivos del lenguaje. `void` solo es válido como retorno de función. */
export type TypeName = 'int' | 'float' | 'string' | 'bool' | 'void'

/** Posición en el código fuente (1-based). Opcional para no acoplarnos al Lexer. */
export interface SourceLocation {
  line: number
  column: number
}

interface BaseNode {
  loc?: SourceLocation
}

// ─────────────────────────────── Programa ───────────────────────────────────

export interface Program extends BaseNode {
  kind: 'Program'
  body: Statement[]
}

// ───────────────────────────── Sentencias ───────────────────────────────────

export interface VarDeclaration extends BaseNode {
  kind: 'VarDeclaration'
  name: string
  /** `true` para `let`, `false` para `const`. */
  mutable: boolean
  /** Anotación de tipo; si falta, el tipo se infiere del inicializador. */
  typeAnnotation?: TypeName
  initializer?: Expression
}

export interface Parameter extends BaseNode {
  kind: 'Parameter'
  name: string
  typeAnnotation: TypeName
}

export interface FunctionDeclaration extends BaseNode {
  kind: 'FunctionDeclaration'
  name: string
  params: Parameter[]
  returnType: TypeName
  body: Block
}

export interface Block extends BaseNode {
  kind: 'Block'
  body: Statement[]
}

export interface IfStatement extends BaseNode {
  kind: 'IfStatement'
  condition: Expression
  consequent: Block
  /** `else { }` o `else if (...)`. */
  alternate?: Block | IfStatement
}

export interface WhileStatement extends BaseNode {
  kind: 'WhileStatement'
  condition: Expression
  body: Block
}

export interface ReturnStatement extends BaseNode {
  kind: 'ReturnStatement'
  value?: Expression
}

export interface PrintStatement extends BaseNode {
  kind: 'PrintStatement'
  argument: Expression
}

export interface AssignmentStatement extends BaseNode {
  kind: 'AssignmentStatement'
  target: Identifier
  value: Expression
}

export interface ExpressionStatement extends BaseNode {
  kind: 'ExpressionStatement'
  expression: Expression
}

export type Statement =
  | VarDeclaration
  | FunctionDeclaration
  | Block
  | IfStatement
  | WhileStatement
  | ReturnStatement
  | PrintStatement
  | AssignmentStatement
  | ExpressionStatement

// ───────────────────────────── Expresiones ──────────────────────────────────

export interface IntLiteral extends BaseNode {
  kind: 'IntLiteral'
  value: number
}

export interface FloatLiteral extends BaseNode {
  kind: 'FloatLiteral'
  value: number
}

export interface StringLiteral extends BaseNode {
  kind: 'StringLiteral'
  value: string
}

export interface BoolLiteral extends BaseNode {
  kind: 'BoolLiteral'
  value: boolean
}

export interface Identifier extends BaseNode {
  kind: 'Identifier'
  name: string
}

export type ArithmeticOperator = '+' | '-' | '*' | '/' | '%'
export type ComparisonOperator = '==' | '!=' | '<' | '<=' | '>' | '>='
export type LogicalOperator = '&&' | '||'
export type BinaryOperator = ArithmeticOperator | ComparisonOperator | LogicalOperator
export type UnaryOperator = '-' | '!'

export interface BinaryExpression extends BaseNode {
  kind: 'BinaryExpression'
  operator: BinaryOperator
  left: Expression
  right: Expression
}

export interface UnaryExpression extends BaseNode {
  kind: 'UnaryExpression'
  operator: UnaryOperator
  operand: Expression
}

export interface CallExpression extends BaseNode {
  kind: 'CallExpression'
  callee: Identifier
  args: Expression[]
}

/** Conversión explícita: `int(x)`, `float(x)`, `string(x)`. */
export interface CastExpression extends BaseNode {
  kind: 'CastExpression'
  targetType: Exclude<TypeName, 'void'>
  expression: Expression
}

export type Expression =
  | IntLiteral
  | FloatLiteral
  | StringLiteral
  | BoolLiteral
  | Identifier
  | BinaryExpression
  | UnaryExpression
  | CallExpression
  | CastExpression

export type AstNode = Program | Statement | Expression | Parameter
