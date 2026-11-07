import { createDiagnostic, type CompilerDiagnostic } from '../errors.ts'
import type { SourcePosition } from '../tokens.ts'

/**
 * Catálogo de errores semánticos.
 *
 * Los errores usan el contrato común `CompilerDiagnostic` (`src/compiler/errors.ts`)
 * con `phase: 'semantic'`, un `code` estable (útil para pruebas y para la UI),
 * un mensaje en español y la posición del nodo del AST que causó el error.
 *
 * El analizador NO se detiene en el primer error: los acumula todos.
 */
export const SemanticErrorCode = {
  /** Uso de una variable que no fue declarada. */
  UNDECLARED_IDENTIFIER: 'UNDECLARED_IDENTIFIER',
  /** El mismo nombre declarado dos veces en el mismo scope. */
  DUPLICATE_DECLARATION: 'DUPLICATE_DECLARATION',
  /** Asignar a una constante. */
  CONST_REASSIGNMENT: 'CONST_REASSIGNMENT',
  /** `const x: int;` (el parser ya lo impide; se revisa por robustez). */
  CONST_WITHOUT_INITIALIZER: 'CONST_WITHOUT_INITIALIZER',
  /** `let x;` sin tipo ni valor (el parser ya lo impide; se revisa por robustez). */
  MISSING_TYPE: 'MISSING_TYPE',
  /** Asignar a algo que no es una variable (p. ej. a una función). */
  INVALID_ASSIGNMENT: 'INVALID_ASSIGNMENT',
  /** El tipo de un valor no es compatible con el esperado. */
  TYPE_MISMATCH: 'TYPE_MISMATCH',
  /** Operación entre tipos incompatibles. */
  INVALID_OPERAND_TYPES: 'INVALID_OPERAND_TYPES',
  /** La condición de un if/while no es bool. */
  INVALID_CONDITION: 'INVALID_CONDITION',
  /** Usar el resultado de una función void como valor. */
  VOID_VALUE: 'VOID_VALUE',
  /** Llamar a una función que no existe. */
  UNDEFINED_FUNCTION: 'UNDEFINED_FUNCTION',
  /** Llamar a algo que no es una función. */
  NOT_A_FUNCTION: 'NOT_A_FUNCTION',
  /** Usar el nombre de una función como si fuera una variable. */
  FUNCTION_AS_VALUE: 'FUNCTION_AS_VALUE',
  /** Número de argumentos distinto al de parámetros. */
  ARGUMENT_COUNT_MISMATCH: 'ARGUMENT_COUNT_MISMATCH',
  /** `return` fuera de una función. */
  RETURN_OUTSIDE_FUNCTION: 'RETURN_OUTSIDE_FUNCTION',
  /** `return` con un tipo incorrecto, o con/sin valor cuando no corresponde. */
  RETURN_TYPE_MISMATCH: 'RETURN_TYPE_MISMATCH',
  /** Función con valor de retorno que tiene caminos sin `return`. */
  MISSING_RETURN: 'MISSING_RETURN',
  /** Función declarada fuera del nivel superior (el parser ya lo impide). */
  NESTED_FUNCTION: 'NESTED_FUNCTION',
  /** Indexar (`x[i]`) algo que no es un arreglo. */
  NOT_AN_ARRAY: 'NOT_AN_ARRAY',
  /** El índice de un arreglo no es int. */
  INVALID_INDEX_TYPE: 'INVALID_INDEX_TYPE',
  /** Elementos de un literal de arreglo con tipos incompatibles: `[1, "a"]`. */
  HETEROGENEOUS_ARRAY: 'HETEROGENEOUS_ARRAY',
  /** `[]` sin un tipo esperado del que deducir su tipo: `let a = [];`. */
  EMPTY_ARRAY_WITHOUT_TYPE: 'EMPTY_ARRAY_WITHOUT_TYPE',
  /** `print` solo acepta valores primitivos (no arreglos). */
  INVALID_PRINT_ARGUMENT: 'INVALID_PRINT_ARGUMENT',
} as const

export type SemanticErrorCode = (typeof SemanticErrorCode)[keyof typeof SemanticErrorCode]

/** Un diagnóstico de la fase semántica (forma común a todo el compilador). */
export type SemanticDiagnostic = CompilerDiagnostic & {
  phase: 'semantic'
  code: SemanticErrorCode
}

export function semanticError(
  code: SemanticErrorCode,
  message: string,
  position?: SourcePosition,
): SemanticDiagnostic {
  return createDiagnostic({ phase: 'semantic', code, message, position }) as SemanticDiagnostic
}
