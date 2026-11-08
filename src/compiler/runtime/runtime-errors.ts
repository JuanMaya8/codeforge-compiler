import { createDiagnostic, type CompilerDiagnostic } from '../errors.ts';
import type { SourcePosition } from '../tokens.ts';

/** Stable codes of the runtime phase (`CompilerDiagnostic.code` when `phase === 'runtime'`). */
export const RuntimeErrorCode = {
  /** Malformed program: wrong IR version, duplicate names, bad allocation size... */
  INVALID_PROGRAM: 'INVALID_PROGRAM',
  UNKNOWN_INSTRUCTION: 'UNKNOWN_INSTRUCTION',
  UNDEFINED_VARIABLE: 'UNDEFINED_VARIABLE',
  TYPE_ERROR: 'TYPE_ERROR',
  DIVISION_BY_ZERO: 'DIVISION_BY_ZERO',
  INVALID_JUMP: 'INVALID_JUMP',
  INVALID_FUNCTION: 'INVALID_FUNCTION',
  HEAP_OUT_OF_BOUNDS: 'HEAP_OUT_OF_BOUNDS',
  INVALID_REFERENCE: 'INVALID_REFERENCE',
  STEP_LIMIT: 'STEP_LIMIT',
  /** Unexpected failure inside the VM itself; should never happen with generated IR. */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type RuntimeErrorCode = (typeof RuntimeErrorCode)[keyof typeof RuntimeErrorCode];

export interface RuntimeErrorLocation {
  pc?: number;
  /** Opcode of the failing instruction, e.g. `ARRAY_LOAD`. */
  instruction?: string;
  position?: SourcePosition;
}

/**
 * Error thrown inside the VM. It never leaves `VirtualMachine.execute`: the VM
 * catches it and returns it as a `CompilerDiagnostic` with `phase: 'runtime'`.
 */
export class RuntimeError extends Error {
  public readonly code: RuntimeErrorCode;
  public readonly location: RuntimeErrorLocation;

  constructor(message: string, code: RuntimeErrorCode, location: RuntimeErrorLocation = {}) {
    super(message);
    this.name = 'RuntimeError';
    this.code = code;
    this.location = location;
  }

  /** Returns a copy whose missing location fields are filled from `fallback`. */
  withLocation(fallback: RuntimeErrorLocation): RuntimeError {
    return new RuntimeError(this.message, this.code, {
      pc: this.location.pc ?? fallback.pc,
      instruction: this.location.instruction ?? fallback.instruction,
      position: this.location.position ?? fallback.position,
    });
  }

  toDiagnostic(): CompilerDiagnostic {
    return createDiagnostic({
      phase: 'runtime',
      code: this.code,
      message: this.message,
      position: this.location.position,
      pc: this.location.pc,
      instruction: this.location.instruction,
    });
  }
}
