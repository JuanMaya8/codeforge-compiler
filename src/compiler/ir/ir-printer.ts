import type { IRFunction, IRProgram, Instruction, Operand } from './instructions'

/**
 * Representación TEXTUAL del IR, solo para mostrar/depurar (UI, pruebas,
 * sustentación). El runtime NO debe parsear este texto: debe consumir los
 * objetos de `instructions.ts`.
 */

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
  }
}

function formatBody(body: Instruction[]): string[] {
  return body.map((ins) => (ins.op === 'LABEL' ? formatInstruction(ins) : `  ${formatInstruction(ins)}`))
}

function formatFunction(fn: IRFunction): string {
  const params = fn.params.map((p) => `${p.name}: ${p.type}`).join(', ')
  return [`FUNCTION ${fn.name}(${params}): ${fn.returnType}`, ...formatBody(fn.body), 'END'].join('\n')
}

export function formatIR(program: IRProgram): string {
  const parts = program.functions.map(formatFunction)
  parts.push(['MAIN', ...formatBody(program.main), 'END'].join('\n'))
  return parts.join('\n\n')
}
