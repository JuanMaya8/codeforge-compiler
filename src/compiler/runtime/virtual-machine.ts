import type { CompilerDiagnostic } from '../errors.ts';
import {
  buildLabelIndex,
  defaultValue,
  formatIRType,
  IR_VERSION,
  isArrayType,
  type Destination,
  type IRBinaryOperator,
  type IRFunction,
  type IRPrimitiveType,
  type IRProgram,
  type IRReturnType,
  type IRType,
  type IRValue,
  type Instruction,
  type Operand,
  type TempOperand,
} from '../ir/instructions';
import { RuntimeHeap, type HeapBlock } from './heap';
import { RuntimeError } from './runtime-errors';
import {
  copyMemory,
  isHeapReference,
  RuntimeStack,
  type HeapReference,
  type RuntimeValue,
  type StackFrame,
  type StackFrameSnapshot,
} from './stack';

export interface VirtualMachineOptions {
  /** Maximum number of executed instructions before failing with `STEP_LIMIT`. */
  maxSteps?: number;
}

export interface ExecutionResult {
  status: 'completed' | 'failed';
  /** Lines printed by PRINT, in order. */
  output: string[];
  steps: number;
  /** PC of the last executed instruction (or of the failing one) inside `functionName`. */
  pc: number;
  /** Body the PC belongs to: `<main>` or a function name. */
  functionName: string;
  /** Last executed instruction, or the failing one. */
  instruction?: Instruction;
  /** The runtime diagnostic when `status === 'failed'`. */
  error?: CompilerDiagnostic;
  /** Every diagnostic of the run (empty when it completed). */
  diagnostics: CompilerDiagnostic[];
  /** Frames from main to the innermost call at the end of the run (empty when completed). */
  stack: StackFrameSnapshot[];
  heap: HeapBlock[];
  globals: Record<string, RuntimeValue>;
}

export const DEFAULT_MAX_STEPS = 100_000;
export const MAIN_FRAME = '<main>';

/**
 * Executes CodeForge IR v2.0. Each `execute` call starts with fresh globals,
 * Stack, Heap and output. It never throws: every failure is returned as a
 * `CompilerDiagnostic` with `phase: 'runtime'` in the result.
 */
export class VirtualMachine {
  execute(program: IRProgram, options: VirtualMachineOptions = {}): ExecutionResult {
    return new ExecutionState(program, options.maxSteps ?? DEFAULT_MAX_STEPS).run();
  }
}

class ExecutionState {
  private readonly stack = new RuntimeStack();
  private readonly heap = new RuntimeHeap();
  private readonly globals = new Map<string, RuntimeValue>();
  private readonly globalTypes = new Map<string, IRType>();
  private readonly functions = new Map<string, IRFunction>();
  private readonly output: string[] = [];
  private readonly program: IRProgram;
  private readonly maxSteps: number;
  private steps = 0;
  private lastPC = 0;
  private lastFrame: StackFrame | undefined;
  private lastInstruction: Instruction | undefined;

  constructor(program: IRProgram, maxSteps: number) {
    this.program = program;
    this.maxSteps = maxSteps;
  }

  run(): ExecutionResult {
    try {
      this.validateProgram();
      this.stack.pushFrame(createFrame(MAIN_FRAME, this.program.main, null, [], undefined));

      while (this.stack.current) {
        const frame = this.stack.current;
        if (frame.programCounter >= frame.body.length) {
          this.fallOffEnd(frame);
          continue;
        }

        const pc = frame.programCounter;
        const instruction = frame.body[pc];
        this.lastPC = pc;
        this.lastFrame = frame;
        this.lastInstruction = instruction;
        if (this.steps >= this.maxSteps) {
          throw new RuntimeError(`La ejecución superó el límite de ${this.maxSteps} pasos (¿bucle o recursión infinita?).`, 'STEP_LIMIT');
        }

        frame.programCounter += 1;
        this.steps += 1;
        this.executeInstruction(frame, instruction);
      }

      return this.result('completed');
    } catch (cause) {
      const error = cause instanceof RuntimeError
        ? cause
        : new RuntimeError(
          `El IR no cumple el contrato v${IR_VERSION}: ${cause instanceof Error ? cause.message : String(cause)}`,
          'INVALID_PROGRAM',
        );
      return this.result('failed', this.locate(error));
    }
  }

  // ─────────────────────────── Validation ───────────────────────────

  private validateProgram(): void {
    if (!Number.isInteger(this.maxSteps) || this.maxSteps < 1) {
      throw new RuntimeError(`maxSteps debe ser un entero positivo; se recibió ${String(this.maxSteps)}.`, 'INVALID_PROGRAM');
    }
    const program = this.program as Partial<IRProgram> | null | undefined;
    if (!program || typeof program !== 'object') {
      throw new RuntimeError('No se recibió un programa IR.', 'INVALID_PROGRAM');
    }
    if (program.version !== IR_VERSION) {
      throw new RuntimeError(
        `Versión de IR no soportada: '${String(program.version ?? 'ausente')}'. Esta VM solo ejecuta IR ${IR_VERSION}.`,
        'INVALID_PROGRAM',
      );
    }
    if (!Array.isArray(program.globals) || !Array.isArray(program.functions) || !Array.isArray(program.main)) {
      throw new RuntimeError('El programa IR debe tener las listas globals, functions y main.', 'INVALID_PROGRAM');
    }

    for (const variable of program.globals) {
      if (this.globals.has(variable.name)) {
        throw new RuntimeError(`Variable global duplicada '${variable.name}'.`, 'INVALID_PROGRAM');
      }
      this.globals.set(variable.name, defaultValue(variable.type));
      this.globalTypes.set(variable.name, variable.type);
    }
    for (const fn of program.functions) {
      if (fn.name === MAIN_FRAME || this.functions.has(fn.name)) {
        throw new RuntimeError(`Función duplicada o reservada '${fn.name}'.`, 'INVALID_PROGRAM');
      }
      this.functions.set(fn.name, fn);
      validateLabels(fn.body, fn.name);
    }
    validateLabels(program.main, MAIN_FRAME);
  }

  // ─────────────────────────── Instructions ───────────────────────────

  private executeInstruction(frame: StackFrame, instruction: Instruction): void {
    switch (instruction.op) {
      case 'ASSIGN':
        this.write(frame, instruction.dest, this.read(frame, instruction.src));
        return;
      case 'BINARY':
        this.write(frame, instruction.dest, binary(
          instruction.operator,
          instruction.operandType,
          this.readPrimitive(frame, instruction.left),
          this.readPrimitive(frame, instruction.right),
        ));
        return;
      case 'UNARY': {
        const value = this.readPrimitive(frame, instruction.src);
        if (instruction.operator === '-') {
          this.write(frame, instruction.dest, -expectNumber(value));
        } else if (instruction.operator === '!') {
          this.write(frame, instruction.dest, !expectBoolean(value));
        } else {
          throw new RuntimeError(`Operador unario desconocido '${String(instruction.operator)}'.`, 'UNKNOWN_INSTRUCTION');
        }
        return;
      }
      case 'CAST':
        this.write(frame, instruction.dest, castValue(this.readPrimitive(frame, instruction.src), instruction.to));
        return;
      case 'LABEL':
        return;
      case 'JUMP':
        frame.programCounter = jump(frame, instruction.target);
        return;
      case 'JUMP_IF_FALSE':
        if (!expectBoolean(this.readPrimitive(frame, instruction.condition))) {
          frame.programCounter = jump(frame, instruction.target);
        }
        return;
      case 'JUMP_IF_TRUE':
        if (expectBoolean(this.readPrimitive(frame, instruction.condition))) {
          frame.programCounter = jump(frame, instruction.target);
        }
        return;
      case 'PARAM':
        frame.pendingArguments.push(this.read(frame, instruction.value));
        return;
      case 'CALL':
        this.call(frame, instruction.func, instruction.argCount, instruction.dest);
        return;
      case 'RETURN':
        this.returnFrom(frame, instruction.value === null ? null : this.read(frame, instruction.value));
        return;
      case 'PRINT':
        this.output.push(String(this.readPrimitive(frame, instruction.value)));
        return;
      case 'ARRAY_ALLOC': {
        const destType = instruction.dest.type;
        if (!isArrayType(destType) || !sameType(destType.elementType, instruction.elementType)) {
          throw new RuntimeError(
            `ARRAY_ALLOC de ${formatIRType(instruction.elementType)}[] no puede guardarse en '${instruction.dest.name}' de tipo ${formatIRType(destType)}.`,
            'TYPE_ERROR',
          );
        }
        this.write(frame, instruction.dest, this.heap.allocate(instruction.elementType, instruction.length));
        return;
      }
      case 'ARRAY_LOAD': {
        const reference = this.readArray(frame, instruction.array);
        const index = this.readIndex(frame, instruction.index);
        this.write(frame, instruction.dest, this.heap.read(reference, index));
        return;
      }
      case 'ARRAY_STORE': {
        const reference = this.readArray(frame, instruction.array);
        const index = this.readIndex(frame, instruction.index);
        const value = this.read(frame, instruction.value);
        this.checkType(value, this.heap.elementType(reference), `elemento de @${reference.address}`);
        this.heap.write(reference, index, value);
        return;
      }
      default:
        throw new RuntimeError(
          `Instrucción desconocida '${String((instruction as { op?: unknown }).op ?? 'ausente')}'.`,
          'UNKNOWN_INSTRUCTION',
        );
    }
  }

  // ─────────────────────────── Calls ───────────────────────────

  private call(frame: StackFrame, functionName: string, argCount: number, destination: TempOperand | null): void {
    const fn = this.functions.get(functionName);
    if (!fn) throw new RuntimeError(`La función '${functionName}' no existe.`, 'INVALID_FUNCTION');
    if (!Number.isInteger(argCount) || argCount !== fn.params.length) {
      throw new RuntimeError(
        `'${functionName}' espera ${fn.params.length} argumento(s); la CALL indica ${String(argCount)}.`,
        'INVALID_FUNCTION',
      );
    }
    if (frame.pendingArguments.length < argCount) {
      throw new RuntimeError(
        `CALL '${functionName}' necesita ${argCount} PARAM, pero solo hay ${frame.pendingArguments.length} pendiente(s).`,
        'INVALID_FUNCTION',
      );
    }
    if (destination !== null && fn.returnType === 'void') {
      throw new RuntimeError(`La función void '${functionName}' no produce valor para '${destination.name}'.`, 'TYPE_ERROR');
    }

    const args = frame.pendingArguments.splice(frame.pendingArguments.length - argCount, argCount);
    fn.params.forEach((parameter, index) => this.checkType(args[index], parameter.type, `parámetro '${parameter.name}' de '${fn.name}'`));

    const callee = createFrame(fn.name, fn.body, frame.programCounter, args, destination?.name);
    fn.params.forEach((parameter, index) => callee.locals.set(parameter.name, args[index]));
    for (const local of fn.locals) callee.locals.set(local.name, defaultValue(local.type));
    this.stack.pushFrame(callee);
  }

  private returnFrom(frame: StackFrame, value: RuntimeValue | null): void {
    if (frame.functionName === MAIN_FRAME) {
      throw new RuntimeError('RETURN no puede usarse en el código principal.', 'INVALID_PROGRAM');
    }
    const fn = this.functionOf(frame);
    if (fn.returnType === 'void') {
      if (value !== null) throw new RuntimeError(`La función void '${fn.name}' retornó un valor.`, 'TYPE_ERROR');
    } else {
      this.checkReturnValue(fn.name, fn.returnType, value);
    }

    this.stack.popFrame();
    const caller = this.stack.current;
    if (!caller) throw new RuntimeError(`'${fn.name}' retornó sin un llamador.`, 'INVALID_FUNCTION');
    if (frame.returnDestination !== undefined) caller.temporaries.set(frame.returnDestination, value);
  }

  private fallOffEnd(frame: StackFrame): void {
    if (frame.functionName === MAIN_FRAME) {
      this.stack.popFrame();
      return;
    }
    const fn = this.functionOf(frame);
    if (fn.returnType !== 'void') {
      // Point the error at the end of the function that fell off.
      this.lastFrame = frame;
      this.lastPC = Math.max(frame.body.length - 1, 0);
      this.lastInstruction = frame.body.at(-1);
      throw new RuntimeError(`La función '${fn.name}' terminó sin retornar un valor ${formatIRType(fn.returnType)}.`, 'INVALID_FUNCTION');
    }
    this.returnFrom(frame, null);
  }

  private functionOf(frame: StackFrame): IRFunction {
    const fn = this.functions.get(frame.functionName);
    if (!fn) throw new RuntimeError(`Falta la definición de '${frame.functionName}'.`, 'INVALID_FUNCTION');
    return fn;
  }

  private checkReturnValue(name: string, type: Exclude<IRReturnType, 'void'>, value: RuntimeValue | null): void {
    if (value === null && !isArrayType(type)) {
      throw new RuntimeError(`La función '${name}' terminó sin retornar un valor ${formatIRType(type)}.`, 'INVALID_FUNCTION');
    }
    this.checkType(value, type, `valor retornado por '${name}'`);
  }

  // ─────────────────────────── Memory ───────────────────────────

  private memoryFor(frame: StackFrame, operand: Operand): Map<string, RuntimeValue> {
    if (operand.kind === 'temp') return frame.temporaries;
    if (operand.kind === 'var') return operand.scope === 'global' ? this.globals : frame.locals;
    throw new RuntimeError(`Operando desconocido '${String((operand as { kind?: unknown }).kind)}'.`, 'INVALID_PROGRAM');
  }

  private read(frame: StackFrame, operand: Operand): RuntimeValue {
    if (operand.kind === 'const') {
      this.checkType(operand.value, operand.type, 'constante');
      return operand.value;
    }
    const value = this.memoryFor(frame, operand).get(operand.name);
    if (value === undefined) {
      throw new RuntimeError(`Se leyó '${operand.name}' antes de asignarle un valor.`, 'UNDEFINED_VARIABLE');
    }
    return value;
  }

  private readPrimitive(frame: StackFrame, operand: Operand): IRValue {
    const value = this.read(frame, operand);
    if (value === null || isHeapReference(value)) {
      throw new RuntimeError(`'${describeOperand(operand)}' es un arreglo; se esperaba un valor primitivo.`, 'TYPE_ERROR');
    }
    return value;
  }

  private readArray(frame: StackFrame, operand: Operand): HeapReference {
    if (!isArrayType(operand.type)) {
      throw new RuntimeError(`'${describeOperand(operand)}' es de tipo ${formatIRType(operand.type)}, no un arreglo.`, 'TYPE_ERROR');
    }
    const value = this.read(frame, operand);
    if (value === null) {
      throw new RuntimeError(`'${describeOperand(operand)}' contiene la referencia nula.`, 'INVALID_REFERENCE');
    }
    if (!isHeapReference(value)) {
      throw new RuntimeError(`'${describeOperand(operand)}' no contiene una referencia del Heap.`, 'INVALID_REFERENCE');
    }
    if (!this.heap.has(value)) {
      throw new RuntimeError(`La referencia @${value.address} de '${describeOperand(operand)}' no apunta a ningún bloque del Heap.`, 'INVALID_REFERENCE');
    }
    this.checkType(value, operand.type, `'${describeOperand(operand)}'`);
    return value;
  }

  private readIndex(frame: StackFrame, operand: Operand): number {
    const value = this.readPrimitive(frame, operand);
    if (typeof value !== 'number') {
      throw new RuntimeError(`El índice debe ser int; se recibió ${typeof value}.`, 'TYPE_ERROR');
    }
    if (!Number.isInteger(value)) {
      throw new RuntimeError(`El índice debe ser un entero; se recibió ${value}.`, 'TYPE_ERROR');
    }
    return value;
  }

  private write(frame: StackFrame, destination: Destination, value: RuntimeValue): void {
    const memory = this.memoryFor(frame, destination);
    if (memory === this.globals && !this.globals.has(destination.name)) {
      throw new RuntimeError(`La variable global '${destination.name}' no está declarada.`, 'UNDEFINED_VARIABLE');
    }
    this.checkType(value, destination.type, `'${destination.name}'`);
    memory.set(destination.name, value);
  }

  /** Checks that a runtime value belongs to an IR type (arrays: a live block with the same element type, or null). */
  private checkType(value: RuntimeValue | undefined, type: IRType, target: string): void {
    if (value === undefined) {
      throw new RuntimeError(`Falta un valor para ${target}.`, 'INVALID_FUNCTION');
    }
    if (isArrayType(type)) {
      if (value === null) return;
      if (!isHeapReference(value)) {
        throw new RuntimeError(`${capitalize(target)} espera ${formatIRType(type)} y recibió un valor primitivo.`, 'TYPE_ERROR');
      }
      if (!this.heap.has(value)) {
        throw new RuntimeError(`La referencia @${value.address} no apunta a ningún bloque del Heap.`, 'INVALID_REFERENCE');
      }
      const actual = this.heap.elementType(value);
      if (!sameType(actual, type.elementType)) {
        throw new RuntimeError(`${capitalize(target)} espera ${formatIRType(type)} y recibió ${formatIRType(actual)}[].`, 'TYPE_ERROR');
      }
      return;
    }
    if (!matchesPrimitive(value, type)) {
      throw new RuntimeError(`${capitalize(target)} espera ${type} y recibió ${describeValue(value)}.`, 'TYPE_ERROR');
    }
  }

  // ─────────────────────────── Result ───────────────────────────

  private locate(error: RuntimeError): RuntimeError {
    if (this.lastInstruction === undefined) return error;
    return error.withLocation({
      pc: this.lastPC,
      instruction: this.lastInstruction.op,
      position: this.lastInstruction.position,
    });
  }

  private result(status: ExecutionResult['status'], error?: RuntimeError): ExecutionResult {
    // The failing frame shows the PC of the failing instruction, not the next one.
    if (error && this.lastFrame && this.stack.current === this.lastFrame) {
      this.lastFrame.programCounter = this.lastPC;
    }
    const diagnostic = error?.toDiagnostic();
    const result: ExecutionResult = {
      status,
      output: [...this.output],
      steps: this.steps,
      pc: diagnostic?.pc ?? this.lastPC,
      functionName: this.lastFrame?.functionName ?? MAIN_FRAME,
      diagnostics: diagnostic ? [diagnostic] : [],
      stack: this.stack.snapshot(),
      heap: this.heap.snapshot(),
      globals: copyMemory(this.globals),
    };
    if (this.lastInstruction !== undefined) result.instruction = this.lastInstruction;
    if (diagnostic) result.error = diagnostic;
    return result;
  }
}

// ─────────────────────────── Helpers ───────────────────────────

function createFrame(
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

function validateLabels(body: Instruction[], functionName: string): void {
  if (!Array.isArray(body)) {
    throw new RuntimeError(`El cuerpo de '${functionName}' no es una lista de instrucciones.`, 'INVALID_PROGRAM');
  }
  const seen = new Set<string>();
  for (const instruction of body) {
    if (instruction.op !== 'LABEL') continue;
    if (seen.has(instruction.name)) {
      throw new RuntimeError(`Etiqueta duplicada '${instruction.name}' en '${functionName}'.`, 'INVALID_PROGRAM');
    }
    seen.add(instruction.name);
  }
}

function jump(frame: StackFrame, target: string): number {
  const index = frame.labels.get(target);
  if (index === undefined) {
    throw new RuntimeError(`La etiqueta '${target}' no existe en '${frame.functionName}'.`, 'INVALID_JUMP');
  }
  return index;
}

export function sameType(a: IRType, b: IRType): boolean {
  if (isArrayType(a) || isArrayType(b)) {
    return isArrayType(a) && isArrayType(b) && sameType(a.elementType, b.elementType);
  }
  return a === b;
}

function matchesPrimitive(value: RuntimeValue, type: IRPrimitiveType): boolean {
  switch (type) {
    case 'int': return typeof value === 'number' && Number.isInteger(value);
    case 'float': return typeof value === 'number';
    case 'string': return typeof value === 'string';
    case 'bool': return typeof value === 'boolean';
    default: return false;
  }
}

function describeValue(value: RuntimeValue): string {
  if (value === null) return 'la referencia nula';
  if (isHeapReference(value)) return `la referencia @${value.address}`;
  return typeof value === 'number' ? `el número ${value}` : `${typeof value} ${JSON.stringify(value)}`;
}

function describeOperand(operand: Operand): string {
  return operand.kind === 'const' ? JSON.stringify(operand.value) : operand.name;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function expectNumber(value: IRValue): number {
  if (typeof value !== 'number') throw new RuntimeError(`Se esperaba un número y se recibió ${typeof value}.`, 'TYPE_ERROR');
  return value;
}

function expectBoolean(value: IRValue): boolean {
  if (typeof value !== 'boolean') throw new RuntimeError(`Se esperaba un bool y se recibió ${typeof value}.`, 'TYPE_ERROR');
  return value;
}

function binary(operator: IRBinaryOperator, operandType: IRPrimitiveType, left: IRValue, right: IRValue): IRValue {
  if (!matchesPrimitive(left, operandType) || !matchesPrimitive(right, operandType)) {
    throw new RuntimeError(`'${operator}' sobre ${operandType} recibió ${describeValue(left)} y ${describeValue(right)}.`, 'TYPE_ERROR');
  }
  if (operator === '==') return left === right;
  if (operator === '!=') return left !== right;
  if (operandType === 'string' && operator === '+') return (left as string) + (right as string);
  if (operandType === 'string' || operandType === 'bool') {
    throw new RuntimeError(`El operador '${operator}' no es válido para ${operandType}.`, 'TYPE_ERROR');
  }

  const a = left as number;
  const b = right as number;
  switch (operator) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/':
      if (b === 0) throw new RuntimeError('División entre cero.', 'DIVISION_BY_ZERO');
      return operandType === 'int' ? Math.trunc(a / b) : a / b;
    case '%':
      if (b === 0) throw new RuntimeError('Módulo entre cero.', 'DIVISION_BY_ZERO');
      return a % b;
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
    default: throw new RuntimeError(`Operador binario desconocido '${String(operator)}'.`, 'UNKNOWN_INSTRUCTION');
  }
}

function castValue(value: IRValue, target: IRPrimitiveType): IRValue {
  switch (target) {
    case 'int':
      return Math.trunc(expectNumber(value));
    case 'float':
      return expectNumber(value);
    case 'string':
      return String(value);
    case 'bool':
      return Boolean(value);
    default:
      throw new RuntimeError(`Conversión desconocida a '${String(target)}'.`, 'UNKNOWN_INSTRUCTION');
  }
}
