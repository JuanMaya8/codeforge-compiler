export type RuntimeErrorCode =
  | 'INVALID_PROGRAM'
  | 'UNKNOWN_INSTRUCTION'
  | 'UNDEFINED_VARIABLE'
  | 'TYPE_ERROR'
  | 'DIVISION_BY_ZERO'
  | 'INVALID_JUMP'
  | 'INVALID_FUNCTION'
  | 'STACK_UNDERFLOW'
  | 'HEAP_OUT_OF_BOUNDS'
  | 'INVALID_REFERENCE'
  | 'STEP_LIMIT';

export class RuntimeError extends Error {
  public readonly code: RuntimeErrorCode;
  public readonly pc?: number;

  constructor(
    message: string,
    code: RuntimeErrorCode,
    pc?: number,
  ) {
    super(message);
    this.name = 'RuntimeError';
    this.code = code;
    this.pc = pc;
  }
}
