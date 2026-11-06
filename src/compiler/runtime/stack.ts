import type { Instruction, IRValue } from '../ir/instructions';

export type RuntimeValue = IRValue | null | HeapReference;

export interface HeapReference {
  readonly address: number;
}

export interface StackFrame {
  readonly functionName: string;
  readonly returnPC: number | null;
  programCounter: number;
  readonly body: Instruction[];
  readonly labels: Map<string, number>;
  readonly locals: Map<string, RuntimeValue>;
  readonly temporaries: Map<string, RuntimeValue>;
  readonly arguments: RuntimeValue[];
  readonly pendingArguments: RuntimeValue[];
  returnDestination?: string;
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

  snapshot(): StackFrame[] {
    return this.frames.map((frame) => ({
      ...frame,
      body: [...frame.body],
      labels: new Map(frame.labels),
      locals: new Map(frame.locals),
      temporaries: new Map(frame.temporaries),
      arguments: [...frame.arguments],
      pendingArguments: [...frame.pendingArguments],
    }));
  }
}
