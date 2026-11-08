import type { Instruction, IRValue } from '../ir/instructions';

/** Stable reference to a Heap block. Two references are the same array when their addresses match. */
export interface HeapReference {
  readonly address: number;
}

/**
 * A value in memory: a primitive, a Heap reference (arrays) or `null`
 * (the null reference used to pre-initialize array variables and nested cells).
 */
export type RuntimeValue = IRValue | HeapReference | null;

export function isHeapReference(value: RuntimeValue | undefined): value is HeapReference {
  return typeof value === 'object' && value !== null;
}

/** Activation record of `main` or of one function call. */
export interface StackFrame {
  readonly functionName: string;
  /** PC of the caller to resume at (the instruction after its CALL); `null` for main. */
  readonly returnPC: number | null;
  /** Index of the next instruction to run in `body`. */
  programCounter: number;
  readonly body: Instruction[];
  readonly labels: Map<string, number>;
  /** Parameters and locals of this activation. */
  readonly locals: Map<string, RuntimeValue>;
  readonly temporaries: Map<string, RuntimeValue>;
  /** Values received by this call, in parameter order. */
  readonly arguments: RuntimeValue[];
  /** PARAM values pushed for the next CALL made from this frame. */
  readonly pendingArguments: RuntimeValue[];
  /** Temporary of the caller that receives the return value. */
  returnDestination?: string;
}

/** Plain, JSON-friendly copy of a frame for the UI and tests. */
export interface StackFrameSnapshot {
  functionName: string;
  pc: number;
  returnPC: number | null;
  locals: Record<string, RuntimeValue>;
  temporaries: Record<string, RuntimeValue>;
  arguments: RuntimeValue[];
  pendingArguments: RuntimeValue[];
}

export class RuntimeStack {
  private readonly frames: StackFrame[] = [];

  pushFrame(frame: StackFrame): void {
    this.frames.push(frame);
  }

  popFrame(): StackFrame | undefined {
    return this.frames.pop();
  }

  get current(): StackFrame | undefined {
    return this.frames.at(-1);
  }

  get depth(): number {
    return this.frames.length;
  }

  /** Frames from the bottom (main) to the top (current call). */
  snapshot(): StackFrameSnapshot[] {
    return this.frames.map((frame) => ({
      functionName: frame.functionName,
      pc: frame.programCounter,
      returnPC: frame.returnPC,
      locals: copyMemory(frame.locals),
      temporaries: copyMemory(frame.temporaries),
      arguments: frame.arguments.map(copyValue),
      pendingArguments: frame.pendingArguments.map(copyValue),
    }));
  }
}

export function copyValue(value: RuntimeValue): RuntimeValue {
  return isHeapReference(value) ? { address: value.address } : value;
}

export function copyMemory(memory: Map<string, RuntimeValue>): Record<string, RuntimeValue> {
  return Object.fromEntries([...memory].map(([name, value]) => [name, copyValue(value)]));
}
