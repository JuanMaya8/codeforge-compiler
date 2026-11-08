import type { BinaryOperator, TypeAnnotation, UnaryOperator } from '../ast/nodes.ts'

/**
 * SISTEMA DE TIPOS DE CODEFORGE
 * ============================================================================
 * Tipos de valor (recursivos):
 *
 *   PrimitiveTypeName = 'int' | 'float' | 'string' | 'bool'
 *   ValueType         = PrimitiveTypeName | { kind: 'array', elementType: ValueType }
 *
 *   int[]    → { kind: 'array', elementType: 'int' }
 *   float[][]→ { kind: 'array', elementType: { kind: 'array', elementType: 'float' } }
 *
 * Los primitivos son strings para que sean fáciles de comparar y de leer;
 * solo los arreglos son objetos. `void` NO es un tipo de valor: solo describe
 * funciones sin retorno (en el AST, `returnType: null`).
 *
 * Conversión IMPLÍCITA (la única que existe):
 *   int → float  (ensanchamiento; no pierde información). Se aplica al
 *   inicializar, asignar, pasar argumentos, retornar, en elementos de un
 *   literal de arreglo y en operaciones mixtas int ⊕ float.
 *   NO se aplica entre arreglos: un `int[]` no es un `float[]` (los arreglos
 *   se comparten por referencia; convertirlos rompería el aliasing).
 *
 * No hay conversiones explícitas: la gramática del lenguaje no las define.
 *
 * Operadores:
 *   + - * /     numérico ⊕ numérico → int si ambos int, si no float
 *               (int / int es división ENTERA, trunca hacia cero)
 *   +           string + string → string (concatenación)
 *   %           int % int → int
 *   < <= > >=   numérico ⊕ numérico → bool
 *   == !=       numérico ⊕ numérico, string ⊕ string o bool ⊕ bool → bool
 *               (los arreglos NO se comparan)
 *   && ||       bool ⊕ bool → bool  (cortocircuito)
 *   -x          numérico → mismo tipo
 *   !x          bool → bool
 *
 * No hay "truthiness": las condiciones de if/while deben ser exactamente bool.
 */

export type PrimitiveTypeName = 'int' | 'float' | 'string' | 'bool'

export interface ArrayValueType {
  kind: 'array'
  elementType: ValueType
}

export type ValueType = PrimitiveTypeName | ArrayValueType

/** Tipo de retorno de una función: un valor o `void`. */
export type ReturnType = ValueType | 'void'

/**
 * Tipo calculado para una expresión durante el análisis.
 *  - `void`  → resultado de llamar a una función sin retorno.
 *  - `error` → la expresión ya produjo un error; se usa para no reportar
 *              errores en cascada a partir de ella.
 */
export type CheckedType = ValueType | 'void' | 'error'

// ─────────────────────────────── Construcción ───────────────────────────────

export function arrayOf(elementType: ValueType): ArrayValueType {
  return { kind: 'array', elementType }
}

/** Convierte la anotación del AST (`int[]`) en un tipo semántico. */
export function fromAnnotation(annotation: TypeAnnotation): ValueType {
  return annotation.kind === 'PrimitiveType'
    ? annotation.name
    : arrayOf(fromAnnotation(annotation.elementType))
}

// ─────────────────────────────── Consultas ──────────────────────────────────

export function isArray(t: CheckedType): t is ArrayValueType {
  return typeof t === 'object'
}

export function isPrimitive(t: CheckedType): t is PrimitiveTypeName {
  return t === 'int' || t === 'float' || t === 'string' || t === 'bool'
}

export function isNumeric(t: CheckedType): t is 'int' | 'float' {
  return t === 'int' || t === 'float'
}

/** Igualdad estructural: `int[]` es igual a `int[]` aunque sean objetos distintos. */
export function sameType(a: CheckedType, b: CheckedType): boolean {
  if (isArray(a) && isArray(b)) return sameType(a.elementType, b.elementType)
  return a === b
}

/** ¿Se puede usar un valor de tipo `source` donde se espera `target`? */
export function isAssignable(target: ValueType, source: CheckedType): boolean {
  if (source === 'error') return true // ya se reportó antes
  if (source === 'void') return false
  return sameType(target, source) || (target === 'float' && source === 'int')
}

/** ¿Hace falta insertar la conversión implícita int → float? */
export function needsWidening(target: CheckedType, source: CheckedType): boolean {
  return target === 'float' && source === 'int'
}

/**
 * Tipo común de dos elementos de un literal de arreglo sin contexto:
 * iguales → ese tipo; int con float → float; en otro caso, incompatibles.
 */
export function commonType(a: ValueType, b: ValueType): ValueType | null {
  if (sameType(a, b)) return a
  if (isNumeric(a) && isNumeric(b)) return 'float'
  return null
}

/** Texto del tipo para mensajes de error: `int`, `float[][]`, `void`. */
export function formatType(t: CheckedType): string {
  return isArray(t) ? `${formatType(t.elementType)}[]` : t
}

// ─────────────────────────────── Operadores ─────────────────────────────────

export interface BinaryTyping {
  /** Tipo del resultado de la operación. */
  result: PrimitiveTypeName
  /** Tipo al que se llevan ambos operandos antes de operar (para el IR). */
  operandType: PrimitiveTypeName
}

/** Devuelve el tipado de la operación o `null` si los tipos son incompatibles. */
export function binaryTyping(
  op: BinaryOperator,
  left: CheckedType,
  right: CheckedType,
): BinaryTyping | null {
  const numericType: PrimitiveTypeName = left === 'float' || right === 'float' ? 'float' : 'int'
  const bothNumeric = isNumeric(left) && isNumeric(right)

  switch (op) {
    case '+':
      if (left === 'string' && right === 'string') return { result: 'string', operandType: 'string' }
      return bothNumeric ? { result: numericType, operandType: numericType } : null
    case '-':
    case '*':
    case '/':
      return bothNumeric ? { result: numericType, operandType: numericType } : null
    case '%':
      return left === 'int' && right === 'int' ? { result: 'int', operandType: 'int' } : null
    case '<':
    case '<=':
    case '>':
    case '>=':
      return bothNumeric ? { result: 'bool', operandType: numericType } : null
    case '==':
    case '!=':
      if (bothNumeric) return { result: 'bool', operandType: numericType }
      if (left === right && (left === 'string' || left === 'bool')) {
        return { result: 'bool', operandType: left }
      }
      return null
    case '&&':
    case '||':
      return left === 'bool' && right === 'bool' ? { result: 'bool', operandType: 'bool' } : null
  }
}

export function unaryResultType(op: UnaryOperator, operand: CheckedType): PrimitiveTypeName | null {
  if (op === '-') return isNumeric(operand) ? operand : null
  return operand === 'bool' ? 'bool' : null
}
