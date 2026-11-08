/**
 * Utilidades de prueba: compilan CÓDIGO FUENTE real usando el frontend de
 * Jack (`parseSource`), de modo que cada prueba también valida la integración
 * Parser → Semántico → IR con el AST canónico.
 */
import type { Program } from '../ast/nodes.ts'
import { formatDiagnostic } from '../errors.ts'
import { parseSource } from '../frontend.ts'
import { compileToIR, formatIR, type IRProgram } from '../ir/index.ts'
import { analyze, type SemanticResult } from '../semantic/type-checker.ts'
import { runIR } from './reference-interpreter.ts'

export function parse(source: string): Program {
  const result = parseSource(source)
  if (!result.success || !result.program) {
    throw new Error(`El frontend rechazó el programa:\n${result.errors.map(formatDiagnostic).join('\n')}`)
  }
  return result.program
}

export const check = (source: string): SemanticResult => analyze(parse(source))

/** Códigos de los errores semánticos, en orden. */
export const codes = (source: string): string[] => check(source).errors.map((e) => e.code)

export function compile(source: string): IRProgram {
  const result = compileToIR(parse(source))
  if (!result.ok) throw new Error(result.errors.map(formatDiagnostic).join('\n'))
  return result.ir
}

export const irText = (source: string): string => formatIR(compile(source))

/** Compila y ejecuta con el intérprete de referencia; devuelve las líneas impresas. */
export const run = (source: string): string[] => runIR(compile(source))
