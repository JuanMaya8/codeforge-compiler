export { parseSource } from './frontend.ts';
export type { FrontendResult } from './frontend.ts';
export { compileToIR } from './ir/index';
export type { CompileToIRResult } from './ir/index';
export { runSource } from './run-source';
export type { SourceRunResult } from './run-source';
export { VirtualMachine } from './runtime';
export type { ExecutionResult, VirtualMachineOptions } from './runtime';
