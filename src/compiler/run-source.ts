import type { Program } from './ast/nodes.ts';
import { createDiagnostic, type CompilerDiagnostic, type CompilerPhase } from './errors.ts';
import { parseSource } from './frontend.ts';
import { compileToIR } from './ir/index.ts';
import type { IRProgram } from './ir/instructions.ts';
import type { SemanticResult } from './semantic/type-checker.ts';
import type { Token } from './tokens.ts';
import { VirtualMachine, type ExecutionResult, type VirtualMachineOptions } from './runtime';

/** Last phase reached: the phase that failed, or `completed`. */
export type SourceRunStage = CompilerPhase | 'completed';

/**
 * Result of `runSource`. Every field produced by a phase that ran is kept, so
 * the UI can show tokens, AST, IR and execution state even when a later phase
 * failed. Fields of phases that did not run are `null`.
 */
export interface SourceRunResult {
  /** `true` only when every phase succeeded and the program ran to the end. */
  ok: boolean;
  stage: SourceRunStage;
  /** Diagnostics of the failing phase, all with the common `CompilerDiagnostic` shape. */
  diagnostics: CompilerDiagnostic[];
  tokens: Token[];
  ast: Program | null;
  semantic: SemanticResult | null;
  ir: IRProgram | null;
  execution: ExecutionResult | null;
}

/**
 * Runs source code through the whole pipeline:
 * Lexer/Parser → semantic analysis + IR v2.0 → virtual machine.
 *
 * It never throws: an unexpected failure inside a phase is reported as an
 * `INTERNAL_ERROR` diagnostic of that phase.
 */
export function runSource(source: string, options: VirtualMachineOptions = {}): SourceRunResult {
  const result: SourceRunResult = {
    ok: false,
    stage: 'lexical',
    diagnostics: [],
    tokens: [],
    ast: null,
    semantic: null,
    ir: null,
    execution: null,
  };

  try {
    const frontend = parseSource(source);
    result.tokens = frontend.tokens;
    result.ast = frontend.program;
    if (frontend.program === null || !frontend.success) {
      result.stage = frontend.program === null ? 'lexical' : 'syntax';
      result.diagnostics = frontend.errors;
      return result;
    }

    result.stage = 'semantic';
    const compilation = compileToIR(frontend.program);
    result.semantic = compilation.semantic;
    if (!compilation.ok) {
      result.diagnostics = compilation.errors;
      return result;
    }
    result.ir = compilation.ir;

    result.stage = 'runtime';
    const execution = new VirtualMachine().execute(compilation.ir, options);
    result.execution = execution;
    if (execution.status === 'failed') {
      result.diagnostics = execution.diagnostics;
      return result;
    }

    result.ok = true;
    result.stage = 'completed';
    return result;
  } catch (cause) {
    const phase: CompilerPhase = result.stage === 'completed' ? 'runtime' : result.stage;
    result.ok = false;
    result.stage = phase;
    result.diagnostics = [createDiagnostic({
      phase,
      code: 'INTERNAL_ERROR',
      message: `Error interno del compilador en la fase ${phase}: ${cause instanceof Error ? cause.message : String(cause)}`,
    })];
    return result;
  }
}
