/**
 * CONTRATO DEL IR (código de tres direcciones) — Semántico/IR ⇄ Runtime (Juan)
 * ============================================================================
 * Versión: ver `IR_VERSION`. Documentación ampliada en `./README.md`.
 *
 * Principios:
 *   - Cada instrucción es un objeto con un discriminante `op` (opcode).
 *   - Los operandos son objetos tipados, NUNCA cadenas a interpretar.
 *   - Cada instrucción hace como máximo UNA operación (tres direcciones:
 *     destino, operando izquierdo, operando derecho).
 *   - Las etiquetas son nombres (`L1`, `L2`...) únicos en todo el programa;
 *     los saltos solo apuntan a etiquetas del MISMO cuerpo (main o función).
 */

export const IR_VERSION = '1.0'

/** Tipos de los valores en tiempo de ejecución. */
export type IRValueType = 'int' | 'float' | 'string' | 'bool'
export type IRReturnType = IRValueType | 'void'
export type IRValue = number | string | boolean

// ───────────────────────────── Operandos ────────────────────────────────────

/** Valor literal inmediato. */
export interface ConstOperand {
  kind: 'const'
  type: IRValueType
  value: IRValue
}

/**
 * Temporal generado por el compilador (`t1`, `t2`, ...).
 * Los temporales pertenecen al FRAME actual (cada llamada tiene los suyos),
 * lo que hace segura la recursión.
 */
export interface TempOperand {
  kind: 'temp'
  name: string
  type: IRValueType
}

/**
 * Variable del programa.
 *  - scope 'global': vive en la memoria global (declarada fuera de funciones).
 *  - scope 'local' : vive en el frame de la llamada actual (parámetros y
 *    variables declaradas dentro de una función).
 * `name` ya es único dentro de su zona (el shadowing se resolvió como `x$1`).
 */
export interface VarOperand {
  kind: 'var'
  name: string
  scope: 'global' | 'local'
  type: IRValueType
}

export type Operand = ConstOperand | TempOperand | VarOperand
export type Destination = TempOperand | VarOperand

// ───────────────────────────── Operadores ───────────────────────────────────

export type IRArithmeticOperator = '+' | '-' | '*' | '/' | '%'
export type IRComparisonOperator = '==' | '!=' | '<' | '<=' | '>' | '>='
export type IRBinaryOperator = IRArithmeticOperator | IRComparisonOperator
export type IRUnaryOperator = '-' | '!'

// ──────────────────────────── Instrucciones ─────────────────────────────────

export const OPCODES = [
  'ASSIGN',
  'BINARY',
  'UNARY',
  'CAST',
  'LABEL',
  'JUMP',
  'JUMP_IF_FALSE',
  'JUMP_IF_TRUE',
  'PARAM',
  'CALL',
  'RETURN',
  'PRINT',
] as const

export type Opcode = (typeof OPCODES)[number]

/** dest = src */
export interface AssignInstruction {
  op: 'ASSIGN'
  dest: Destination
  src: Operand
}

/**
 * dest = left <operator> right
 * `operandType` indica cómo operar (ambos operandos ya llegan con ese tipo):
 *   - 'int'    → aritmética entera; '/' y '%' truncan hacia cero.
 *   - 'float'  → aritmética de punto flotante.
 *   - 'string' → '+' concatena; '==' / '!=' comparan texto.
 *   - 'bool'   → solo '==' / '!='.
 * El tipo del resultado está en `dest.type`.
 */
export interface BinaryInstruction {
  op: 'BINARY'
  operator: IRBinaryOperator
  operandType: IRValueType
  dest: TempOperand
  left: Operand
  right: Operand
}

/** dest = operator src   ('-' negación numérica, '!' negación lógica) */
export interface UnaryInstruction {
  op: 'UNARY'
  operator: IRUnaryOperator
  dest: TempOperand
  src: Operand
}

/**
 * dest = (to) src
 *   int→float   valor igual
 *   float→int   Math.trunc
 *   X→string    representación textual (bool → "true"/"false")
 */
export interface CastInstruction {
  op: 'CAST'
  from: IRValueType
  to: IRValueType
  dest: TempOperand
  src: Operand
}

/** Marca una posición; no hace nada al ejecutarse. */
export interface LabelInstruction {
  op: 'LABEL'
  name: string
}

/** goto target */
export interface JumpInstruction {
  op: 'JUMP'
  target: string
}

/** if (!condition) goto target   — `condition` siempre es bool */
export interface JumpIfFalseInstruction {
  op: 'JUMP_IF_FALSE'
  condition: Operand
  target: string
}

/** if (condition) goto target   — `condition` siempre es bool */
export interface JumpIfTrueInstruction {
  op: 'JUMP_IF_TRUE'
  condition: Operand
  target: string
}

/** Apila un argumento para la próxima CALL (en orden izquierda → derecha). */
export interface ParamInstruction {
  op: 'PARAM'
  value: Operand
}

/**
 * Llama a `func` con los últimos `argCount` PARAM apilados.
 * `dest` recibe el valor de retorno (null si la función es void o se ignora).
 */
export interface CallInstruction {
  op: 'CALL'
  func: string
  argCount: number
  dest: TempOperand | null
}

/** Termina la función actual. `value` es null en funciones void. */
export interface ReturnInstruction {
  op: 'RETURN'
  value: Operand | null
}

/** Imprime un valor (una línea por PRINT). */
export interface PrintInstruction {
  op: 'PRINT'
  value: Operand
}

export type Instruction =
  | AssignInstruction
  | BinaryInstruction
  | UnaryInstruction
  | CastInstruction
  | LabelInstruction
  | JumpInstruction
  | JumpIfFalseInstruction
  | JumpIfTrueInstruction
  | ParamInstruction
  | CallInstruction
  | ReturnInstruction
  | PrintInstruction

// ───────────────────────────── Programa ─────────────────────────────────────

export interface IRVariable {
  name: string
  type: IRValueType
}

export interface IRFunction {
  name: string
  /** En orden: el i-ésimo PARAM se copia en `params[i].name` (variable local). */
  params: IRVariable[]
  returnType: IRReturnType
  /** Variables locales (sin contar parámetros), ya con nombre único. */
  locals: IRVariable[]
  body: Instruction[]
}

export interface IRProgram {
  version: typeof IR_VERSION
  /** Variables globales con su tipo (el runtime puede pre-inicializarlas). */
  globals: IRVariable[]
  functions: IRFunction[]
  /** Código de nivel superior; la ejecución empieza aquí y termina al final. */
  main: Instruction[]
}

// ───────────────────────────── Utilidades ───────────────────────────────────

/**
 * Construye el mapa etiqueta → índice de instrucción para un cuerpo.
 * Pensado para el runtime: se llama una vez por función / main.
 */
export function buildLabelIndex(body: Instruction[]): Map<string, number> {
  const index = new Map<string, number>()
  body.forEach((ins, i) => {
    if (ins.op === 'LABEL') index.set(ins.name, i)
  })
  return index
}

/** Valor por defecto de cada tipo (variables declaradas sin inicializador). */
export function defaultValue(type: IRValueType): IRValue {
  switch (type) {
    case 'int':
    case 'float':
      return 0
    case 'string':
      return ''
    case 'bool':
      return false
  }
}
