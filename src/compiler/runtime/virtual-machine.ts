import {
  buildLabelIndex,
  defaultValue,
  IR_VERSION,
  type Destination,
  type IRBinaryOperator,
  type IRFunction,
  type IRProgram,
  type IRValue,
  type IRValueType,
  type Instruction,
  type Operand,
  type TempOperand,
} from '../ir/instructions';
import { RuntimeHeap, type HeapBlock } from './heap';
import { RuntimeError } from './runtime-errors';
import { RuntimeStack, type RuntimeValue, type StackFrame } from './stack';

export interface VirtualMachineOptions {
  maxSteps?: number;
}

export interface RuntimeErrorInfo {
  code: string;
  message: string;
  pc?: number;
}

export interface ExecutionResult {
  status: 'completed' | 'failed';
  output: string[];
  steps: number;
  pc: number;
  instruction?: Instruction;
  error?: RuntimeErrorInfo;
  stack: StackFrame[];
  heap: HeapBlock[];
  globals: Record<string, RuntimeValue>;
}

const DEFAULT_MAX_STEPS = 100_000;

/** Executes CodeForge IR v1.0. Each execute call starts with fresh memory. */
export class VirtualMachine {
  execute(program: IRProgram, options: VirtualMachineOptions = {}): ExecutionResult {
    const state = new ExecutionState(program, options.maxSteps ?? DEFAULT_MAX_STEPS);
    return state.run();
  }
}

class ExecutionState {
  private readonly stack = new RuntimeStack();
  private readonly heap = new RuntimeHeap();
  private readonly globals = new Map<string, RuntimeValue>();
  private readonly functions = new Map<string, IRFunction>();
  private readonly output: string[] = [];
  private steps = 0;
  private lastPC = 0;
  private lastInstruction: Instruction | undefined;
  private readonly program: IRProgram;
  private readonly maxSteps: number;

  constructor(program: IRProgram, maxSteps: number) {
    this.program = program;
    this.maxSteps = maxSteps;
  }

  run(): ExecutionResult {
    try {
      this.validateProgram();
      this.stack.pushFrame(this.createFrame('<main>', this.program.main, null, [], undefined));

      while (this.stack.current) {
        const frame = this.stack.current;
        if (frame.programCounter >= frame.body.length) {
          this.finishFrame(frame, null, false);
          continue;
        }
        if (this.steps >= this.maxSteps) {
          this.lastPC = frame.programCounter;
          this.lastInstruction = frame.body[frame.programCounter];
          throw new RuntimeError(`Execution exceeded the ${this.maxSteps} step limit`, 'STEP_LIMIT', frame.programCounter);
        }

        const pc = frame.programCounter;
        const instruction = frame.body[frame.programCounter++];
        this.lastPC = pc;
        this.lastInstruction = instruction;
        this.steps += 1;
        this.executeInstruction(frame, instruction, pc);
      }

      return this.result('completed');
    } catch (cause) {
      const error = cause instanceof RuntimeError
        ? cause
        : new RuntimeError(cause instanceof Error ? cause.message : String(cause), 'INVALID_PROGRAM', this.lastPC);
      const locatedError = error.pc === undefined
        ? new RuntimeError(error.message, error.code, this.lastPC)
        : error;
      return this.result('failed', locatedError);
    }
  }

  private validateProgram(): void {
    if (!this.program || this.program.version !== IR_VERSION) {
      throw new RuntimeError(`Unsupported IR version: ${this.program?.version ?? 'missing'}`, 'INVALID_PROGRAM');
    }
    if (!Number.isInteger(this.maxSteps) || this.maxSteps < 1) {
      throw new RuntimeError(`maxSteps must be a positive integer; received ${this.maxSteps}`, 'INVALID_PROGRAM');
    }

    for (const variable of this.program.globals) {
      if (this.globals.has(variable.name)) {
        throw new RuntimeError(`Duplicate global variable '${variable.name}'`, 'INVALID_PROGRAM');
      }
      this.globals.set(variable.name, defaultValue(variable.type));
    }
    for (const fn of this.program.functions) {
      if (this.functions.has(fn.name)) {
        throw new RuntimeError(`Duplicate function '${fn.name}'`, 'INVALID_PROGRAM');
      }
      this.functions.set(fn.name, fn);
      this.validateLabels(fn.body, fn.name);
    }
    this.validateLabels(this.program.main, '<main>');
  }

  private validateLabels(body: Instruction[], functionName: string): void {
    const seenLabels = new Set<string>();
    for (const instruction of body) {
      if (instruction.op === 'LABEL') {
        if (seenLabels.has(instruction.name)) {
          throw new RuntimeError(`Duplicate label '${instruction.name}' in '${functionName}'`, 'INVALID_PROGRAM');
        }
        seenLabels.add(instruction.name);
      }
    }
  }

  private executeInstruction(frame: StackFrame, instruction: Instruction, pc: number): void {
    switch (instruction.op) {
      case 'ASSIGN':
        this.write(frame, instruction.dest, this.read(frame, instruction.src, pc), pc);
        return;
      case 'BINARY':
        this.write(frame, instruction.dest,
          binary(instruction.operator, instruction.operandType,
            this.read(frame, instruction.left, pc), this.read(frame, instruction.right, pc), pc), pc);
        return;
      case 'UNARY': {
        const value = this.read(frame, instruction.src, pc);
        const result = instruction.operator === '-'
          ? -this.expectNumber(value, pc)
          : !this.expectBoolean(value, pc);
        this.write(frame, instruction.dest, result, pc);
        return;
      }
      case 'CAST':
        this.write(frame, instruction.dest,
          castValue(this.read(frame, instruction.src, pc), instruction.to, pc), pc);
        return;
      case 'LABEL':
        return;
      case 'JUMP':
        frame.programCounter = this.jump(frame, instruction.target, pc);
        return;
      case 'JUMP_IF_FALSE':
        if (!this.expectBoolean(this.read(frame, instruction.condition, pc), pc)) {
          frame.programCounter = this.jump(frame, instruction.target, pc);
        }
        return;
      case 'JUMP_IF_TRUE':
        if (this.expectBoolean(this.read(frame, instruction.condition, pc), pc)) {
          frame.programCounter = this.jump(frame, instruction.target, pc);
        }
        return;
      case 'PARAM':
        frame.pendingArguments.push(this.read(frame, instruction.value, pc));
        return;
      case 'CALL':
        this.call(frame, instruction.func, instruction.argCount, instruction.dest, pc);
        return;
      case 'RETURN':
        this.finishFrame(frame, instruction.value === null ? null : this.read(frame, instruction.value, pc), true, pc);
        return;
      case 'PRINT':
        this.output.push(String(this.read(frame, instruction.value, pc)));
        return;
      default:
        throw new RuntimeError(`Unknown instruction '${(instruction as { op?: string }).op ?? 'missing'}'`, 'UNKNOWN_INSTRUCTION', pc);
    }
  }

  private call(frame: StackFrame, functionName: string, argCount: number, destination: TempOperand | null, pc: number): void {
    const fn = this.functions.get(functionName);
    if (!fn) throw new RuntimeError(`Function '${functionName}' does not exist`, 'INVALID_FUNCTION', pc);
    if (!Number.isInteger(argCount) || argCount < 0 || argCount !== fn.params.length) {
      throw new RuntimeError(`Call to '${functionName}' expects ${fn.params.length} arguments; received ${argCount}`, 'INVALID_FUNCTION', pc);
    }
    if (frame.pendingArguments.length < argCount) {
      throw new RuntimeError(`CALL '${functionName}' needs ${argCount} PARAM values, but only ${frame.pendingArguments.length} are pending`, 'INVALID_FUNCTION', pc);
    }
    const args = frame.pendingArguments.splice(frame.pendingArguments.length - argCount, argCount);
    const callee = this.createFrame(functionName, fn.body, frame.programCounter, args, destination?.name);
    fn.params.forEach((parameter, index) => callee.locals.set(parameter.name, args[index]));
    for (const local of fn.locals) callee.locals.set(local.name, defaultValue(local.type));
    this.stack.pushFrame(callee);
  }

  private finishFrame(frame: StackFrame, value: IRValue | null, explicitReturn: boolean, pc = frame.programCounter): void {
    if (frame.functionName === '<main>') {
      if (explicitReturn) throw new RuntimeError('RETURN cannot be used in main', 'INVALID_PROGRAM', pc);
      this.stack.popFrame();
      return;
    }

    const fn = this.functions.get(frame.functionName);
    if (!fn) throw new RuntimeError(`Missing function metadata for '${frame.functionName}'`, 'INVALID_FUNCTION', pc);
    if (fn.returnType !== 'void' && value === null) {
      throw new RuntimeError(`Function '${fn.name}' ended without returning a value`, 'INVALID_FUNCTION', pc);
    }
    if (fn.returnType === 'void' && value !== null) {
      throw new RuntimeError(`Void function '${fn.name}' returned a value`, 'TYPE_ERROR', pc);
    }

    this.stack.popFrame();
    const caller = this.stack.current;
    if (!caller) throw new RuntimeError(`Function '${fn.name}' returned without a caller`, 'INVALID_FUNCTION', pc);
    if (frame.returnDestination !== undefined) {
      if (value === null) throw new RuntimeError(`Function '${fn.name}' did not produce a value for its CALL destination`, 'INVALID_FUNCTION', pc);
      caller.temporaries.set(frame.returnDestination, value);
    }
  }

  private createFrame(
    functionName: string,
    body: Instruction[],
    returnPC: number | null,
    args: RuntimeValue[],
    returnDestination: string | undefined,
  ): StackFrame {
    const frame: StackFrame = {
      functionName,
      returnPC,
      programCounter: 0,
      body,
      labels: buildLabelIndex(body),
      locals: new Map(),
      temporaries: new Map(),
      arguments: [...args],
      pendingArguments: [],
    };
    if (returnDestination !== undefined) frame.returnDestination = returnDestination;
    return frame;
  }

  private read(frame: StackFrame, operand: Operand, pc: number): IRValue {
    if (operand.kind === 'const') return operand.value;
    const memory = operand.kind === 'var' && operand.scope === 'global'
      ? this.globals
      : operand.kind === 'var' ? frame.locals : frame.temporaries;
    const value = memory.get(operand.name);
    if (value === undefined) {
      throw new RuntimeError(`Read of '${operand.name}' before it was initialized`, 'UNDEFINED_VARIABLE', pc);
    }
    if (value === null || typeof value === 'object') {
      throw new RuntimeError(`'${operand.name}' does not contain an IR scalar value`, 'TYPE_ERROR', pc);
    }
    return value;
  }

  private write(frame: StackFrame, destination: Destination, value: IRValue, pc: number): void {
    const memory = destination.kind === 'var' && destination.scope === 'global'
      ? this.globals
      : destination.kind === 'var' ? frame.locals : frame.temporaries;
    if (memory === this.globals && !this.globals.has(destination.name)) {
      throw new RuntimeError(`Global '${destination.name}' is not declared`, 'UNDEFINED_VARIABLE', pc);
    }
    memory.set(destination.name, value);
  }

  private jump(frame: StackFrame, target: string, pc: number): number {
    const index = frame.labels.get(target);
    if (index === undefined) throw new RuntimeError(`Label '${target}' does not exist in '${frame.functionName}'`, 'INVALID_JUMP', pc);
    return index;
  }

  private expectNumber(value: IRValue, pc: number): number {
    if (typeof value !== 'number') throw new RuntimeError(`Expected a number, received ${typeof value}`, 'TYPE_ERROR', pc);
    return value;
  }

  private expectBoolean(value: IRValue, pc: number): boolean {
    if (typeof value !== 'boolean') throw new RuntimeError(`Expected a boolean, received ${typeof value}`, 'TYPE_ERROR', pc);
    return value;
  }

  private result(status: ExecutionResult['status'], error?: RuntimeError): ExecutionResult {
    const result: ExecutionResult = {
      status,
      output: [...this.output],
      steps: this.steps,
      pc: error?.pc ?? this.stack.current?.programCounter ?? this.lastPC,
      stack: this.stack.snapshot(),
      heap: this.heap.snapshot(),
      globals: Object.fromEntries(this.globals),
    };
    if (this.lastInstruction !== undefined) result.instruction = this.lastInstruction;
    if (error !== undefined) result.error = { code: error.code, message: error.message, ...(error.pc === undefined ? {} : { pc: error.pc }) };
    return result;
  }
}

function binary(operator: IRBinaryOperator, operandType: IRValueType, left: IRValue, right: IRValue, pc: number): IRValue {
  if (operator === '==' || operator === '!=') return operator === '==' ? left === right : left !== right;
  if (operandType === 'string' && operator === '+') return String(left) + String(right);
  if (operandType === 'string' || operandType === 'bool') {
    throw new RuntimeError(`Operator '${operator}' is not valid for ${operandType}`, 'TYPE_ERROR', pc);
  }
  if (typeof left !== 'number' || typeof right !== 'number') {
    throw new RuntimeError(`Operator '${operator}' requires numeric operands`, 'TYPE_ERROR', pc);
  }
  switch (operator) {
    case '+': return left + right;
    case '-': return left - right;
    case '*': return left * right;
    case '/':
      if (right === 0) throw new RuntimeError('Division by zero', 'DIVISION_BY_ZERO', pc);
      return operandType === 'int' ? Math.trunc(left / right) : left / right;
    case '%':
      if (right === 0) throw new RuntimeError('Modulo by zero', 'DIVISION_BY_ZERO', pc);
      return left % right;
    case '<': return left < right;
    case '<=': return left <= right;
    case '>': return left > right;
    case '>=': return left >= right;
    default: throw new RuntimeError(`Unknown binary operator '${operator}'`, 'UNKNOWN_INSTRUCTION', pc);
  }
}

function castValue(value: IRValue, target: IRValueType, pc: number): IRValue {
  switch (target) {
    case 'int':
      if (typeof value !== 'number') throw new RuntimeError('Cannot cast a non-number to int', 'TYPE_ERROR', pc);
      return Math.trunc(value);
    case 'float':
      if (typeof value !== 'number') throw new RuntimeError('Cannot cast a non-number to float', 'TYPE_ERROR', pc);
      return value;
    case 'string': return String(value);
    case 'bool': return Boolean(value);
  }
}
