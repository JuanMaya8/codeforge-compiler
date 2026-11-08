import {
  formatIRType,
  type IRFunction,
  type IRProgram,
  type Instruction,
  type Operand,
} from './instructions.ts'

/**
 * Representación TEXTUAL del IR, solo para mostrar/depurar (UI, pruebas,
 * sustentación). El runtime NO debe parsear este texto: debe consumir los
 * objetos de `instructions.ts`.
 */

export interface FormatIROptions {
  /** Agrega `; línea:columna` al final de cada instrucción con posición. */
  positions?: boolean
}

export function formatOperand(operand: Operand): string {
  if (operand.kind !== 'const') return operand.name
  switch (operand.type) {
    case 'string':
      return JSON.stringify(operand.value)
    case 'float':
      return Number.isInteger(operand.value) ? `${operand.value}.0` : String(operand.value)
    default:
      return String(operand.value)
  }
}

export function formatInstruction(ins: Instruction): string {
  const o = formatOperand
  switch (ins.op) {
    case 'ASSIGN':
      return `${ins.dest.name} = ${o(ins.src)}`
    case 'BINARY':
      return `${ins.dest.name} = ${o(ins.left)} ${ins.operator} ${o(ins.right)}`
    case 'UNARY':
      return `${ins.dest.name} = ${ins.operator}${o(ins.src)}`
    case 'CAST':
      return `${ins.dest.name} = (${ins.to}) ${o(ins.src)}`
    case 'LABEL':
      return `${ins.name}:`
    case 'JUMP':
      return `GOTO ${ins.target}`
    case 'JUMP_IF_FALSE':
      return `IF_FALSE ${o(ins.condition)} GOTO ${ins.target}`
    case 'JUMP_IF_TRUE':
      return `IF_TRUE ${o(ins.condition)} GOTO ${ins.target}`
    case 'PARAM':
      return `PARAM ${o(ins.value)}`
    case 'CALL':
      return `${ins.dest ? `${ins.dest.name} = ` : ''}CALL ${ins.func}, ${ins.argCount}`
    case 'RETURN':
      return ins.value ? `RETURN ${o(ins.value)}` : 'RETURN'
    case 'PRINT':
      return `PRINT ${o(ins.value)}`
    case 'ARRAY_ALLOC':
      return `${ins.dest.name} = ARRAY_ALLOC ${formatIRType(ins.elementType)}, ${ins.length}`
    case 'ARRAY_LOAD':
      return `${ins.dest.name} = ${o(ins.array)}[${o(ins.index)}]`
    case 'ARRAY_STORE':
      return `${o(ins.array)}[${o(ins.index)}] = ${o(ins.value)}`
  }
}

function formatBody(body: Instruction[], options: FormatIROptions): string[] {
  return body.map((ins) => {
    const text = ins.op === 'LABEL' ? formatInstruction(ins) : `  ${formatInstruction(ins)}`
    return options.positions && ins.position
      ? `${text}    ; ${ins.position.line}:${ins.position.column}`
      : text
  })
}

function formatFunction(fn: IRFunction, options: FormatIROptions): string {
  const params = fn.params.map((p) => `${p.name}: ${formatIRType(p.type)}`).join(', ')
  return [
    `FUNCTION ${fn.name}(${params}): ${formatIRType(fn.returnType)}`,
    ...formatBody(fn.body, options),
    'END',
  ].join('\n')
}

export function formatIR(program: IRProgram, options: FormatIROptions = {}): string {
  const parts = program.functions.map((fn) => formatFunction(fn, options))
  parts.push(['MAIN', ...formatBody(program.main, options), 'END'].join('\n'))
  return parts.join('\n\n')
}
