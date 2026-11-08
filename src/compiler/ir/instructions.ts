import type { SourcePosition } from '../tokens.ts'

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
 *   - Cada instrucción puede llevar `position` (línea/columna del código
 *     fuente que la generó) para que los errores de ejecución señalen la línea.
 *
 * Cambios respecto a la 1.0 (incompatibles; la VM debe rechazar la 1.0):
 *   - Tipos recursivos (`IRType`): arreglos `{ kind: 'array', elementType }`.
 *   - Opcodes nuevos: ARRAY_ALLOC, ARRAY_LOAD, ARRAY_STORE.
 *   - Campo opcional `position` en todas las instrucciones.
 */

export const IR_VERSION = '2.0'

// ─────────────────────────────── Tipos ──────────────────────────────────────

/** Tipos primitivos. Son los únicos que pueden tener constantes, operarse e imprimirse. */
export type IRPrimitiveType = 'int' | 'float' | 'string' | 'bool'

/** Tipo arreglo. En ejecución, un valor de este tipo es una REFERENCIA a un bloque del Heap. */
export interface IRArrayType {
  kind: 'array'
  elementType: IRType
}

/** Tipo de cualquier valor: primitivo o arreglo (recursivo: `int[][]`). */
export type IRType = IRPrimitiveType | IRArrayType

export type IRReturnType = IRType | 'void'

/** Valor de una constante inmediata. `int` y `float` son `number` en JavaScript. */
export type IRValue = number | string | boolean

// ───────────────────────────── Operandos ────────────────────────────────────

/** Valor literal inmediato (solo primitivos: no existen constantes de arreglo). */
export interface ConstOperand {
  kind: 'const'
  type: IRPrimitiveType
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
  type: IRType
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
  type: IRType
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
  'ARRAY_ALLOC',
  'ARRAY_LOAD',
  'ARRAY_STORE',
] as const

export type Opcode = (typeof OPCODES)[number]

/** Campos comunes a todas las instrucciones. */
interface BaseInstruction {
  /** Línea/columna del código fuente que generó la instrucción (para errores de ejecución). */
  position?: SourcePosition
}

/** dest = src   (con arreglos copia la REFERENCIA: ambos nombres comparten el bloque) */
export interface AssignInstruction extends BaseInstruction {
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
export interface BinaryInstruction extends BaseInstruction {
  op: 'BINARY'
  operator: IRBinaryOperator
  operandType: IRPrimitiveType
  dest: TempOperand
  left: Operand
  right: Operand
}

/** dest = operator src   ('-' negación numérica, '!' negación lógica) */
export interface UnaryInstruction extends BaseInstruction {
  op: 'UNARY'
  operator: IRUnaryOperator
  dest: TempOperand
  src: Operand
}

/**
 * dest = (to) src
 * El generador solo emite `int → float` (la única conversión implícita del
 * lenguaje). La VM puede soportar las demás, pero no recibirá otras.
 */
export interface CastInstruction extends BaseInstruction {
  op: 'CAST'
  from: IRPrimitiveType
  to: IRPrimitiveType
  dest: TempOperand
  src: Operand
}

/** Marca una posición; no hace nada al ejecutarse. */
export interface LabelInstruction extends BaseInstruction {
  op: 'LABEL'
  name: string
}

/** goto target */
export interface JumpInstruction extends BaseInstruction {
  op: 'JUMP'
  target: string
}

/** if (!condition) goto target   — `condition` siempre es bool */
export interface JumpIfFalseInstruction extends BaseInstruction {
  op: 'JUMP_IF_FALSE'
  condition: Operand
  target: string
}

/** if (condition) goto target   — `condition` siempre es bool */
export interface JumpIfTrueInstruction extends BaseInstruction {
  op: 'JUMP_IF_TRUE'
  condition: Operand
  target: string
}

/** Apila un argumento para la próxima CALL (en orden izquierda → derecha). */
export interface ParamInstruction extends BaseInstruction {
  op: 'PARAM'
  value: Operand
}

/**
 * Llama a `func` con los últimos `argCount` PARAM apilados.
 * `dest` recibe el valor de retorno (null si la función es void o se ignora).
 */
export interface CallInstruction extends BaseInstruction {
  op: 'CALL'
  func: string
  argCount: number
  dest: TempOperand | null
}

/** Termina la función actual. `value` es null en funciones void. */
export interface ReturnInstruction extends BaseInstruction {
  op: 'RETURN'
  value: Operand | null
}

/** Imprime un valor primitivo (una línea por PRINT). Nunca recibe arreglos. */
export interface PrintInstruction extends BaseInstruction {
  op: 'PRINT'
  value: Operand
}

/**
 * dest = nuevo bloque del Heap con `length` celdas.
 * Cada celda empieza con `defaultValue(elementType)`. `dest.type` es el
 * arreglo `{ kind: 'array', elementType }`. `length` es un entero ≥ 0
 * conocido en compilación (el tamaño del literal, o 0).
 */
export interface ArrayAllocInstruction extends BaseInstruction {
  op: 'ARRAY_ALLOC'
  dest: TempOperand
  elementType: IRType
  length: number
}

/**
 * dest = array[index]
 * `array` es una referencia (operando de tipo arreglo) e `index` un int.
 * La VM valida la referencia y que 0 <= index < longitud.
 */
export interface ArrayLoadInstruction extends BaseInstruction {
  op: 'ARRAY_LOAD'
  dest: TempOperand
  array: Operand
  index: Operand
}

/**
 * array[index] = value
 * `value` ya llega con el tipo del elemento (el generador inserta CAST si hace
 * falta). La VM valida la referencia y los límites igual que en ARRAY_LOAD.
 */
export interface ArrayStoreInstruction extends BaseInstruction {
  op: 'ARRAY_STORE'
  array: Operand
  index: Operand
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
  | ArrayAllocInstruction
  | ArrayLoadInstruction
  | ArrayStoreInstruction

// ───────────────────────────── Programa ─────────────────────────────────────

export interface IRVariable {
  name: string
  type: IRType
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

export function isArrayType(type: IRType | 'void'): type is IRArrayType {
  return typeof type === 'object'
}

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

/**
 * Valor inicial de cada tipo: 0, 0, "", false.
 * Para arreglos es `null` (referencia nula): el generador siempre asigna un
 * bloque (ARRAY_ALLOC) a una variable arreglo antes de que el programa pueda
 * leerla, así que `null` solo se ve en celdas internas de un arreglo anidado
 * recién reservado o en la pre-inicialización de variables.
 */
export function defaultValue(type: IRType): IRValue | null {
  if (isArrayType(type)) return null
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

/** Texto del tipo: `int`, `float[][]`. */
export function formatIRType(type: IRReturnType): string {
  return isArrayType(type) ? `${formatIRType(type.elementType)}[]` : type
}
