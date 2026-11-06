import type { Program } from '../semantic/ast-contract'
import type { SemanticError } from '../semantic/semantic-errors'
import { analyze, type SemanticResult } from '../semantic/type-checker'
import type { IRProgram } from './instructions'
import { generateIR } from './ir-generator'

export * from './instructions'
export * from './ir-generator'
export * from './ir-printer'

export type CompileToIRResult =
  | { ok: true; ir: IRProgram; semantic: SemanticResult }
  | { ok: false; errors: SemanticError[]; semantic: SemanticResult }

/**
 * Punto de entrada de esta etapa: AST → análisis semántico → IR.
 * Si hay errores semánticos no se genera IR.
 */
export function compileToIR(program: Program): CompileToIRResult {
  const semantic = analyze(program)
  if (!semantic.ok) return { ok: false, errors: semantic.errors, semantic }
  return { ok: true, ir: generateIR(program, semantic), semantic }
}
