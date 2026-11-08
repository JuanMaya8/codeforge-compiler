/**
 * INTÉRPRETE DE REFERENCIA — SOLO PARA PRUEBAS.
 *
 * No es el runtime de CodeForge (eso es responsabilidad de Juan). Existe para
 * comprobar en las pruebas que el IR generado calcula lo correcto y como
 * especificación ejecutable del contrato descrito en `ir/README.md`.
 */
import {
  IR_VERSION,
  buildLabelIndex,
  defaultValue,
  type Destination,
  type IRBinaryOperator,
  type IRPrimitiveType,
  type IRProgram,
  type IRValue,
  type Instruction,
  type Operand,
} from '../ir/instructions.ts'

/** Referencia a un bloque del Heap. */
interface Ref {
  ref: number
}
type Value = IRValue | Ref | null

export function runIR(program: IRProgram, maxSteps = 100_000): string[] {
  if (program.version !== IR_VERSION) throw new Error(`Versión de IR no soportada: ${program.version}`)

  const output: string[] = []
  const globals = new Map<string, Value>()
  const heap = new Map<number, Value[]>()
  const functions = new Map(program.functions.map((f) => [f.name, f]))
  let steps = 0

  const block = (v: Value, index: Value): Value[] => {
    if (v === null || typeof v !== 'object') throw new Error('Referencia inválida')
    const cells = heap.get(v.ref)
    if (!cells) throw new Error('Referencia inválida')
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= cells.length) {
      throw new Error(`Índice fuera de rango: ${String(index)}`)
    }
    return cells
  }

  const execute = (body: Instruction[], frame: Map<string, Value>): Value => {
    const labels = buildLabelIndex(body)
    const pendingParams: Value[] = []
    const memoryOf = (o: Destination | Operand) =>
      o.kind === 'var' && o.scope === 'global' ? globals : frame
    const read = (o: Operand): Value => {
      if (o.kind === 'const') return o.value
      const value = memoryOf(o).get(o.name)
      if (value === undefined) throw new Error(`Lectura de '${o.name}' sin valor`)
      return value
    }
    const write = (d: Destination, v: Value) => memoryOf(d).set(d.name, v)
    const jump = (label: string) => {
      const target = labels.get(label)
      if (target === undefined) throw new Error(`Etiqueta inexistente ${label}`)
      return target
    }

    let pc = 0
    while (pc < body.length) {
      if (++steps > maxSteps) throw new Error('Demasiados pasos (¿bucle infinito?)')
      const ins = body[pc++]
      switch (ins.op) {
        case 'ASSIGN':
          write(ins.dest, read(ins.src))
          break
        case 'BINARY':
          write(
            ins.dest,
            binary(ins.operator, ins.operandType, read(ins.left) as IRValue, read(ins.right) as IRValue),
          )
          break
        case 'UNARY': {
          const v = read(ins.src)
          write(ins.dest, ins.operator === '-' ? -(v as number) : !v)
          break
        }
        case 'CAST':
          write(ins.dest, read(ins.src))
          break
        case 'LABEL':
          break
        case 'JUMP':
          pc = jump(ins.target)
          break
        case 'JUMP_IF_FALSE':
          if (read(ins.condition) === false) pc = jump(ins.target)
          break
        case 'JUMP_IF_TRUE':
          if (read(ins.condition) === true) pc = jump(ins.target)
          break
        case 'PARAM':
          pendingParams.push(read(ins.value))
          break
        case 'CALL': {
          const fn = functions.get(ins.func)
          if (!fn) throw new Error(`Función inexistente ${ins.func}`)
          const args = pendingParams.splice(pendingParams.length - ins.argCount, ins.argCount)
          const newFrame = new Map<string, Value>(fn.params.map((p, i) => [p.name, args[i]]))
          const result = execute(fn.body, newFrame)
          if (ins.dest) {
            if (result === null) throw new Error(`${ins.func} no retornó valor`)
            write(ins.dest, result)
          }
          break
        }
        case 'RETURN':
          return ins.value ? read(ins.value) : null
        case 'PRINT':
          output.push(String(read(ins.value)))
          break
        case 'ARRAY_ALLOC': {
          const ref = heap.size + 1
          heap.set(ref, Array.from({ length: ins.length }, () => defaultValue(ins.elementType)))
          write(ins.dest, { ref })
          break
        }
        case 'ARRAY_LOAD': {
          const index = read(ins.index)
          write(ins.dest, block(read(ins.array), index)[index as number])
          break
        }
        case 'ARRAY_STORE': {
          const index = read(ins.index)
          block(read(ins.array), index)[index as number] = read(ins.value)
          break
        }
      }
    }
    return null
  }

  execute(program.main, new Map())
  return output
}

function binary(op: IRBinaryOperator, type: IRPrimitiveType, a: IRValue, b: IRValue): IRValue {
  if (op === '==') return a === b
  if (op === '!=') return a !== b
  if (type === 'string' && op === '+') return String(a) + String(b)
  const x = a as number
  const y = b as number
  switch (op) {
    case '+':
      return x + y
    case '-':
      return x - y
    case '*':
      return x * y
    case '/':
      if (y === 0) throw new Error('División por cero')
      return type === 'int' ? Math.trunc(x / y) : x / y
    case '%':
      if (y === 0) throw new Error('División por cero')
      return x % y
    case '<':
      return x < y
    case '<=':
      return x <= y
    case '>':
      return x > y
    case '>=':
      return x >= y
  }
}
