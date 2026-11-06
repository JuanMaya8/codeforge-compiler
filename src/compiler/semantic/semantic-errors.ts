import type { SourceLocation } from './ast-contract'

/**
 * Catálogo de errores semánticos.
 *
 * Cada error tiene un código estable (útil para pruebas y para la UI) y un
 * mensaje legible en español. El analizador NO se detiene en el primer error:
 * los acumula para mostrarlos todos al usuario.
 */
export type SemanticErrorCode =
  | 'UNDECLARED_IDENTIFIER' // uso de una variable no declarada
  | 'DUPLICATE_DECLARATION' // mismo nombre dos veces en el mismo scope
  | 'CONST_REASSIGNMENT' // asignar a una constante
  | 'CONST_WITHOUT_INITIALIZER' // `const x: int;`
  | 'MISSING_TYPE' // `let x;` sin tipo ni inicializador
  | 'INVALID_ASSIGNMENT' // asignar a algo que no es variable (p. ej. una función)
  | 'TYPE_MISMATCH' // tipo del valor incompatible con el esperado
  | 'INVALID_OPERAND_TYPES' // operación entre tipos incompatibles
  | 'INVALID_CONDITION' // condición de if/while que no es bool
  | 'INVALID_CAST' // conversión explícita no soportada
  | 'VOID_VALUE' // usar el resultado de una función void como valor
  | 'INVALID_VOID_VARIABLE' // `let x: void`
  | 'UNDEFINED_FUNCTION' // llamar a una función inexistente
  | 'NOT_A_FUNCTION' // llamar a algo que no es función
  | 'FUNCTION_AS_VALUE' // usar una función como si fuera variable
  | 'ARGUMENT_COUNT_MISMATCH' // número de argumentos incorrecto
  | 'RETURN_OUTSIDE_FUNCTION' // `return` fuera de una función
  | 'RETURN_TYPE_MISMATCH' // `return` con tipo incorrecto / con o sin valor indebido
  | 'MISSING_RETURN' // función no-void con caminos sin `return`
  | 'NESTED_FUNCTION' // declarar funciones dentro de otras / dentro de bloques

export interface SemanticError {
  code: SemanticErrorCode
  message: string
  loc?: SourceLocation
}

export function semanticError(
  code: SemanticErrorCode,
  message: string,
  loc?: SourceLocation,
): SemanticError {
  return { code, message, loc }
}

/** Formato legible: `[3:5] TYPE_MISMATCH: ...` */
export function formatSemanticError(error: SemanticError): string {
  const where = error.loc ? `[${error.loc.line}:${error.loc.column}] ` : ''
  return `${where}${error.code}: ${error.message}`
}
