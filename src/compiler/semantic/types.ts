import type {
  BinaryOperator,
  TypeName,
  UnaryOperator,
} from './ast-contract'
import type { ValueType } from './symbol-table'

/**
 * REGLAS DEL SISTEMA DE TIPOS
 * ============================================================================
 * Tipos: int, float, string, bool (+ void solo como retorno de función).
 *
 * Conversiones IMPLÍCITAS (las únicas):
 *   int → float   (ensanchamiento, no pierde información)
 *     - al asignar/declarar/pasar argumento/retornar un int donde se espera float
 *     - en operaciones mixtas int ⊕ float (el int se promueve a float)
 *
 * Conversiones EXPLÍCITAS (CastExpression):
 *   int(x)    desde int | float          (float → int trunca hacia cero)
 *   float(x)  desde int | float
 *   string(x) desde cualquier tipo de valor
 *   Cualquier otra (p. ej. bool → int, string → int) es error INVALID_CAST.
 *
 * Operadores:
 *   + - * /     numérico ⊕ numérico → int si ambos int, si no float
 *               (int / int es división ENTERA, trunca hacia cero)
 *   +           string + string → string (concatenación)
 *   %           int % int → int
 *   < <= > >=   numérico ⊕ numérico → bool
 *   == !=       mismo tipo (o ambos numéricos) → bool
 *   && ||       bool ⊕ bool → bool   (cortocircuito)
 *   -x          numérico → mismo tipo
 *   !x          bool → bool
 *
 * No hay "truthiness": las condiciones de if/while deben ser exactamente bool.
 */

/**
 * `error` es un tipo interno: se asigna a expresiones que ya produjeron un
 * error para no reportar errores en cascada a partir de ellas.
 */
export type CheckedType = TypeName | 'error'

export function isNumeric(t: CheckedType): t is 'int' | 'float' {
  return t === 'int' || t === 'float'
}

/** ¿Se puede usar un valor de tipo `source` donde se espera `target`? */
export function isAssignable(target: ValueType, source: CheckedType): boolean {
  if (source === 'error') return true // ya se reportó antes
  return source === target || (target === 'float' && source === 'int')
}

/** ¿Hace falta insertar una conversión implícita int→float? */
export function needsWidening(target: CheckedType, source: CheckedType): boolean {
  return target === 'float' && source === 'int'
}

export interface BinaryTyping {
  /** Tipo del resultado de la operación. */
  result: ValueType
  /** Tipo al que se llevan ambos operandos antes de operar (para el IR). */
  operandType: ValueType
}

/** Devuelve el tipado de la operación o `null` si los tipos son incompatibles. */
export function binaryTyping(
  op: BinaryOperator,
  left: CheckedType,
  right: CheckedType,
): BinaryTyping | null {
  const numericType: ValueType = left === 'float' || right === 'float' ? 'float' : 'int'

  switch (op) {
    case '+':
      if (left === 'string' && right === 'string') {
        return { result: 'string', operandType: 'string' }
      }
      return isNumeric(left) && isNumeric(right)
        ? { result: numericType, operandType: numericType }
        : null
    case '-':
    case '*':
    case '/':
      return isNumeric(left) && isNumeric(right)
        ? { result: numericType, operandType: numericType }
        : null
    case '%':
      return left === 'int' && right === 'int' ? { result: 'int', operandType: 'int' } : null
    case '<':
    case '<=':
    case '>':
    case '>=':
      return isNumeric(left) && isNumeric(right)
        ? { result: 'bool', operandType: numericType }
        : null
    case '==':
    case '!=':
      if (isNumeric(left) && isNumeric(right)) return { result: 'bool', operandType: numericType }
      if (left === right && (left === 'string' || left === 'bool')) {
        return { result: 'bool', operandType: left }
      }
      return null
    case '&&':
    case '||':
      return left === 'bool' && right === 'bool' ? { result: 'bool', operandType: 'bool' } : null
  }
}

export function unaryResultType(op: UnaryOperator, operand: CheckedType): ValueType | null {
  if (op === '-') return isNumeric(operand) ? operand : null
  return operand === 'bool' ? 'bool' : null
}

export function isCastAllowed(from: CheckedType, to: ValueType): boolean {
  if (from === 'error') return true
  if (from === 'void') return false
  if (from === to) return true
  if (to === 'string') return true
  return isNumeric(from) && isNumeric(to)
}
