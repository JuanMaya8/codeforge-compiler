/**
 * Helpers para construir AST a mano en las pruebas (no existe todavía el
 * Parser). Producen exactamente las formas de `semantic/ast-contract.ts`.
 */
import type {
  BinaryOperator,
  Block,
  Expression,
  FunctionDeclaration,
  Identifier,
  IfStatement,
  Program,
  Statement,
  TypeName,
  UnaryOperator,
} from '../semantic/ast-contract'

type ValueTypeName = Exclude<TypeName, 'void'>

export const int = (value: number): Expression => ({ kind: 'IntLiteral', value })
export const float = (value: number): Expression => ({ kind: 'FloatLiteral', value })
export const str = (value: string): Expression => ({ kind: 'StringLiteral', value })
export const bool = (value: boolean): Expression => ({ kind: 'BoolLiteral', value })
export const id = (name: string): Identifier => ({ kind: 'Identifier', name })
export const bin = (operator: BinaryOperator, left: Expression, right: Expression): Expression => ({
  kind: 'BinaryExpression',
  operator,
  left,
  right,
})
export const un = (operator: UnaryOperator, operand: Expression): Expression => ({
  kind: 'UnaryExpression',
  operator,
  operand,
})
export const call = (name: string, ...args: Expression[]): Expression => ({
  kind: 'CallExpression',
  callee: id(name),
  args,
})
export const cast = (targetType: ValueTypeName, expression: Expression): Expression => ({
  kind: 'CastExpression',
  targetType,
  expression,
})

export const letVar = (name: string, typeAnnotation?: TypeName, initializer?: Expression): Statement => ({
  kind: 'VarDeclaration',
  name,
  mutable: true,
  typeAnnotation,
  initializer,
})
export const constVar = (name: string, typeAnnotation?: TypeName, initializer?: Expression): Statement => ({
  kind: 'VarDeclaration',
  name,
  mutable: false,
  typeAnnotation,
  initializer,
})
export const block = (...body: Statement[]): Block => ({ kind: 'Block', body })
export const fn = (
  name: string,
  params: Array<[string, TypeName]>,
  returnType: TypeName,
  body: Statement[],
): FunctionDeclaration => ({
  kind: 'FunctionDeclaration',
  name,
  params: params.map(([pname, typeAnnotation]) => ({ kind: 'Parameter', name: pname, typeAnnotation })),
  returnType,
  body: block(...body),
})
export const ifS = (
  condition: Expression,
  consequent: Statement[],
  alternate?: Statement[] | IfStatement,
): IfStatement => ({
  kind: 'IfStatement',
  condition,
  consequent: block(...consequent),
  alternate: Array.isArray(alternate) ? block(...alternate) : alternate,
})
export const whileS = (condition: Expression, body: Statement[]): Statement => ({
  kind: 'WhileStatement',
  condition,
  body: block(...body),
})
export const ret = (value?: Expression): Statement => ({ kind: 'ReturnStatement', value })
export const print = (argument: Expression): Statement => ({ kind: 'PrintStatement', argument })
export const assign = (name: string, value: Expression): Statement => ({
  kind: 'AssignmentStatement',
  target: id(name),
  value,
})
export const exprS = (expression: Expression): Statement => ({ kind: 'ExpressionStatement', expression })
export const program = (...body: Statement[]): Program => ({ kind: 'Program', body })
