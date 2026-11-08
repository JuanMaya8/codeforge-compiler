/**
 * Public API of the compiler. The UI should only need `runSource`; the other
 * exports are for tests, tooling and debugging views.
 */
export { parseSource } from './frontend.ts';
export type { FrontendResult } from './frontend.ts';
export { createDiagnostic, formatDiagnostic } from './errors.ts';
export type { CompilerDiagnostic, CompilerPhase } from './errors.ts';
export { compileToIR, formatIR, formatInstruction, formatIRType, IR_VERSION } from './ir/index.ts';
export type { CompileToIRResult, Instruction, IRProgram, IRType } from './ir/index.ts';
export { runSource } from './run-source';
export type { SourceRunResult, SourceRunStage } from './run-source';
export { RuntimeErrorCode, VirtualMachine } from './runtime';
export type {
  ExecutionResult,
  HeapBlock,
  HeapReference,
  RuntimeValue,
  StackFrameSnapshot,
  VirtualMachineOptions,
} from './runtime';
