import { parseSource, type FrontendResult } from './frontend.ts';
import { compileToIR } from './ir/index';
import { adaptFrontendAst, AstAdapterException, type AstAdapterError } from './integration/ast-adapter';
import type { Program as FrontendProgram } from './ast/nodes.ts';
import type { CompilerError } from './errors.ts';
import type { IRProgram } from './ir/instructions';
import type { SemanticError } from './semantic/semantic-errors';
import type { SemanticResult } from './semantic/type-checker';
import { VirtualMachine, type ExecutionResult, type VirtualMachineOptions } from './runtime';

export type SourceRunResult =
  | { ok: true; stage: 'completed'; frontend: FrontendResult; semantic: SemanticResult; ir: IRProgram; execution: ExecutionResult }
  | { ok: false; stage: 'lexical' | 'syntax'; frontend: FrontendResult; errors: CompilerError[] }
  | { ok: false; stage: 'integration'; frontend: FrontendResult; ast: FrontendProgram; errors: AstAdapterError[] }
  | { ok: false; stage: 'semantic'; frontend: FrontendResult; ast: FrontendProgram; semantic: SemanticResult; errors: SemanticError[] }
  | { ok: false; stage: 'runtime'; frontend: FrontendResult; ast: FrontendProgram; semantic: SemanticResult; ir: IRProgram; execution: ExecutionResult };

/** Runs source through the existing frontend, AST bridge, semantic/IR phase and VM. */
export function runSource(source: string, options: VirtualMachineOptions = {}): SourceRunResult {
  const frontend = parseSource(source);
  if (!frontend.success || frontend.program === null) {
    const stage = frontend.errors.some((error) => error.phase === 'lexical') ? 'lexical' : 'syntax';
    return { ok: false, stage, frontend, errors: frontend.errors };
  }

  let semanticAst;
  try {
    semanticAst = adaptFrontendAst(frontend.program);
  } catch (error) {
    if (error instanceof AstAdapterException) {
      return { ok: false, stage: 'integration', frontend, ast: frontend.program, errors: [error.toDiagnostic()] };
    }
    throw error;
  }

  const compilation = compileToIR(semanticAst);
  if (!compilation.ok) {
    return {
      ok: false,
      stage: 'semantic',
      frontend,
      ast: frontend.program,
      semantic: compilation.semantic,
      errors: compilation.errors,
    };
  }

  const execution = new VirtualMachine().execute(compilation.ir, options);
  if (execution.status === 'failed') {
    return { ok: false, stage: 'runtime', frontend, ast: frontend.program, semantic: compilation.semantic, ir: compilation.ir, execution };
  }
  return { ok: true, stage: 'completed', frontend, semantic: compilation.semantic, ir: compilation.ir, execution };
}
