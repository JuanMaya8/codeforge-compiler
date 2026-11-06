/**
 * INTÉRPRETE DE REFERENCIA — SOLO PARA PRUEBAS.
 *
 * No es el runtime de CodeForge (eso es responsabilidad de Juan). Existe para
 * comprobar en las pruebas que el IR generado calcula lo correcto y como
 * especificación ejecutable del contrato descrito en `ir/README.md`.
 */
import {
  buildLabelIndex,
  type Destination,
  type IRBinaryOperator,
  type IRProgram,
  type IRValue,
  type IRValueType,
  type Instruction,
  type Operand,
} from '../ir/instructions'

export function runIR(program: IRProgram, maxSteps = 100_000): string[] {
  const output: string[] = []
  const globals = new Map<string, IRValue>()
  const functions = new Map(program.functions.map((f) => [f.name, f]))
  let steps = 0

  const execute = (body: Instruction[], frame: Map<string, IRValue>): IRValue | null => {
    const labels = buildLabelIndex(body)
    const pendingParams: IRValue[] = []
    const memoryOf = (o: Destination | Operand) =>
      o.kind === 'var' && o.scope === 'global' ? globals : frame
    const read = (o: Operand): IRValue => {
      if (o.kind === 'const') return o.value
      const value = memoryOf(o).get(o.name)
      if (value === undefined) throw new Error(`Lectura de '${o.name}' sin valor`)
      return value
    }
    const write = (d: Destination, v: IRValue) => memoryOf(d).set(d.name, v)
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
          write(ins.dest, binary(ins.operator, ins.operandType, read(ins.left), read(ins.right)))
          break
        case 'UNARY': {
          const v = read(ins.src)
          write(ins.dest, ins.operator === '-' ? -(v as number) : !v)
          break
        }
        case 'CAST':
          write(ins.dest, castValue(read(ins.src), ins.to))
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
          const newFrame = new Map<string, IRValue>(fn.params.map((p, i) => [p.name, args[i]]))
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
      }
    }
    return null
  }

  execute(program.main, new Map())
  return output
}

function binary(op: IRBinaryOperator, type: IRValueType, a: IRValue, b: IRValue): IRValue {
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

function castValue(v: IRValue, to: IRValueType): IRValue {
  switch (to) {
    case 'int':
      return Math.trunc(v as number)
    case 'float':
      return v as number
    case 'string':
      return String(v)
    case 'bool':
      return Boolean(v)
  }
}
