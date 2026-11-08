export { RuntimeHeap } from './heap';
export type { HeapBlock } from './heap';
export { RuntimeError, RuntimeErrorCode } from './runtime-errors';
export type { RuntimeErrorLocation } from './runtime-errors';
export { isHeapReference, RuntimeStack } from './stack';
export type { HeapReference, RuntimeValue, StackFrame, StackFrameSnapshot } from './stack';
export { DEFAULT_MAX_STEPS, MAIN_FRAME, VirtualMachine } from './virtual-machine';
export type { ExecutionResult, VirtualMachineOptions } from './virtual-machine';
