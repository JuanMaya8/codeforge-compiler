# CodeForge Runtime

The runtime is independent of React and accepts the typed `IRProgram` v1.0 from
[`../ir/instructions.ts`](../ir/instructions.ts). It does not parse source code,
IR text, or instruction strings.

## API

```ts
import { IR_VERSION, type IRProgram } from '../ir/instructions';
import { VirtualMachine } from './runtime';

const program: IRProgram = {
  version: IR_VERSION,
  globals: [],
  functions: [],
  main: [
    { op: 'PRINT', value: { kind: 'const', type: 'string', value: 'Hola' } },
  ],
};

const result = new VirtualMachine().execute(program, { maxSteps: 100_000 });
// result.status === 'completed'; result.output is ['Hola']
```

Each call to `execute` creates fresh globals, Stack, Heap and output. The
structured result contains `status`, printed lines, step count, current/last PC,
last instruction, an optional runtime error, Stack and Heap snapshots, and final
global values. Runtime errors are returned with `status: 'failed'`; they do not
escape as uncaught exceptions into the caller.

## PC and instruction cycle

Every activation frame owns its instruction body, label index and PC. The VM
reads the instruction at the current PC, increments the PC, and executes it.
`JUMP` and conditional jumps replace the current frame's PC with the target
label's index. Labels are indexed once per frame, so a jump cannot cross from
`main` into a function or between functions. Execution stops when the main body
ends, a runtime error occurs, or `maxSteps` is reached.

## Stack and function calls

`PARAM` reads a value and appends it to the current frame's pending argument
list. `CALL` consumes the last `argCount` values, creates a new frame with
parameters, default-initialized locals, an empty temporary map, its own body and
PC zero. The caller frame stays on the Stack with its PC already advanced past
the CALL and the return PC recorded in the callee. This keeps each recursive
activation's temporaries and local variables separate.

`RETURN` checks the function's return type, pops the callee, and writes a value
to the caller's destination temporary when the CALL specified one. Falling off
the end of a non-void function is a runtime error. A PC and instruction are
attached to execution errors whenever they can be identified.

Globals use one map shared by all functions. Locals and temporaries live in the
current frame. Globals and declared function locals use the `defaultValue`
specified by IR v1.0; temporaries must be written before they are read.

## Heap

`RuntimeHeap` is a small non-moving educational heap with stable numeric
references and indexed blocks. Reads and writes validate the reference and
bounds. Allocated blocks live for the lifetime of the Heap instance; there is no
garbage collector or explicit free operation.

IR v1.0 has no allocation, dereference or array opcodes, so the VM does not
connect Heap blocks to program operands yet. Adding heap operations requires a
versioned agreement with the IR owner; the current opcode set is implemented as
defined in `instructions.ts`.

## Supported contract

The VM implements `ASSIGN`, `BINARY`, `UNARY`, `CAST`, `LABEL`, `JUMP`,
`JUMP_IF_FALSE`, `JUMP_IF_TRUE`, `PARAM`, `CALL`, `RETURN` and `PRINT`.
Integer division truncates toward zero, division/modulo by zero fail with a
descriptive error, and boolean short-circuiting uses the generator's jump
instructions. Operands remain typed objects throughout execution.
