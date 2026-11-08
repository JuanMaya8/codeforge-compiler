# CodeForge Runtime

The runtime is independent of React and executes the typed `IRProgram` **v2.0**
defined in [`../ir/instructions.ts`](../ir/instructions.ts) (explained in
[`../ir/README.md`](../ir/README.md)). It does not parse source code or IR text.
Any other IR version is rejected with `INVALID_PROGRAM`.

## API

```ts
import { IR_VERSION, type IRProgram } from '../ir/instructions';
import { VirtualMachine } from './runtime';

const program: IRProgram = {
  version: IR_VERSION,
  globals: [],
  functions: [],
  main: [{ op: 'PRINT', value: { kind: 'const', type: 'string', value: 'Hola' } }],
};

const result = new VirtualMachine().execute(program, { maxSteps: 100_000 });
// result.status === 'completed'; result.output → ['Hola']
```

The UI should not call the VM directly: it uses `runSource(source)` from
`src/compiler`, which runs every phase and returns the same `ExecutionResult`
in `result.execution`.

`execute` never throws. Each call starts with fresh globals, Stack, Heap and
output and returns an `ExecutionResult`:

| Field | Meaning |
| --- | --- |
| `status` | `'completed'` or `'failed'` |
| `output` | Lines printed by `PRINT` |
| `steps` | Executed instructions |
| `pc`, `functionName`, `instruction` | Last executed (or failing) instruction and the body it belongs to |
| `error`, `diagnostics` | `CompilerDiagnostic` with `phase: 'runtime'`, stable `code`, `message`, `pc`, `instruction` (opcode) and `position` (source line/column) when the instruction has one |
| `stack` | `StackFrameSnapshot[]` from `<main>` to the innermost call (empty after completion) |
| `heap` | `HeapBlock[]`: `{ address, elementType, values }` |
| `globals` | Final global values |

Values are primitives, `null` (the null array reference) or `{ address }`
references to Heap blocks. Snapshots are plain copies, safe to serialize.

## Runtime error codes

`INVALID_PROGRAM`, `UNKNOWN_INSTRUCTION`, `UNDEFINED_VARIABLE`, `TYPE_ERROR`,
`DIVISION_BY_ZERO`, `INVALID_JUMP`, `INVALID_FUNCTION`, `HEAP_OUT_OF_BOUNDS`,
`INVALID_REFERENCE`, `STEP_LIMIT`, `INTERNAL_ERROR` (exported as
`RuntimeErrorCode`).

## PC and instruction cycle

Every activation frame owns its instruction body, label index and PC. The VM
reads the instruction at the frame's PC, increments the PC and executes it.
Jumps replace the current frame's PC with the label index of the same body, so
a jump cannot cross between `main` and functions. Execution stops when `main`
ends, an error occurs or `maxSteps` is reached (`STEP_LIMIT`). On failure the
failing frame's snapshot shows the PC of the failing instruction.

## Stack and calls

`PARAM` appends a value to the current frame's pending arguments. `CALL` takes
the last `argCount`, checks them against the parameter types, and pushes a new
frame with parameters, default-initialized locals and its own temporaries, so
recursive activations never share state. `RETURN` checks the value against the
return type, pops the frame and writes the value into the caller's `dest`
temporary. Falling off a non-void function is `INVALID_FUNCTION`; `RETURN` in
`main` is `INVALID_PROGRAM`.

Every write is checked against the destination's `IRType` (`int` must be an
integer number; arrays must reference a live block with the same element type,
or be `null`).

## Heap and arrays

`RuntimeHeap` stores typed blocks (`elementType` + cells) at stable addresses
starting at 1. There is no GC or free: blocks live as long as the execution.

- `ARRAY_ALLOC dest, elementType, length` reserves a block whose cells start at
  `defaultValue(elementType)` (`null` for inner arrays) and writes its reference
  to `dest`.
- `ARRAY_LOAD dest, array, index` / `ARRAY_STORE array, index, value` validate,
  in order: the operand is an array (`TYPE_ERROR`), it holds a live reference
  (`INVALID_REFERENCE`, also for `null`), the index is an integer (`TYPE_ERROR`)
  and `0 <= index < length` (`HEAP_OUT_OF_BOUNDS`). `ARRAY_STORE` also checks the
  value against the block's element type.
- `ASSIGN`, `PARAM` and `RETURN` copy the reference, never the elements, so
  `b = a` makes both names alias the same block. Nested arrays are blocks whose
  cells hold references to other blocks.
