import type { Program } from '../ast/nodes.ts'
import type { SemanticDiagnostic } from '../semantic/semantic-errors.ts'
import { analyze, type SemanticResult } from '../semantic/type-checker.ts'
import type { IRProgram } from './instructions.ts'
import { generateIR } from './ir-generator.ts'

export * from './instructions.ts'
export * from './ir-generator.ts'
export * from './ir-printer.ts'

export type CompileToIRResult =
  | { ok: true; ir: IRProgram; semantic: SemanticResult }
  | { ok: false; errors: SemanticDiagnostic[]; semantic: SemanticResult }

/**
 * Punto de entrada de esta etapa: AST → análisis semántico → IR.
 * Recibe el `program` de `parseSource()` cuando `success === true`.
 * Si hay errores semánticos no se genera IR.
 */
export function compileToIR(program: Program): CompileToIRResult {
  const semantic = analyze(program)
  if (!semantic.ok) return { ok: false, errors: semantic.errors, semantic }
  return { ok: true, ir: generateIR(program, semantic), semantic }
}
