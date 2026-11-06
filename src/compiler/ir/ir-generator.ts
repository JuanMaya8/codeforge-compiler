import type {
  CallExpression,
  Expression,
  FunctionDeclaration,
  IfStatement,
  Program,
  Statement,
  VarDeclaration,
} from '../semantic/ast-contract'
import type { SemanticResult } from '../semantic/type-checker'
import type { FunctionSymbol, ValueType, VariableSymbol } from '../semantic/symbol-table'
import { binaryTyping, type CheckedType } from '../semantic/types'
import {
  IR_VERSION,
  defaultValue,
  type ConstOperand,
  type IRFunction,
  type IRProgram,
  type IRReturnType,
  type IRVariable,
  type Instruction,
  type Operand,
  type TempOperand,
  type VarOperand,
} from './instructions'

/**
 * GENERADOR DE IR (código de tres direcciones)
 * ============================================================================
 * Requisito: el programa ya pasó el análisis semántico sin errores. El
 * generador confía en las anotaciones de `SemanticResult` (tipos de cada
 * expresión y símbolo de cada identificador), por eso no vuelve a validar.
 *
 * Esquema de traducción (E = expresión, S = sentencia):
 *
 *   E1 op E2       →  [código E1] [código E2]  tN = a op b
 *   E1 && E2       →  t = a ; IF_FALSE t GOTO Lend ; t = b ; Lend:
 *   E1 || E2       →  t = a ; IF_TRUE  t GOTO Lend ; t = b ; Lend:
 *   if (C) S1      →  [C] IF_FALSE c GOTO Lend ; [S1] ; Lend:
 *   if (C) S1 else S2
 *                  →  [C] IF_FALSE c GOTO Lelse ; [S1] ; GOTO Lend ;
 *                     Lelse: [S2] ; Lend:
 *   while (C) S    →  Lstart: [C] IF_FALSE c GOTO Lend ; [S] ; GOTO Lstart ; Lend:
 *   f(a, b)        →  [a] [b] PARAM a ; PARAM b ; t = CALL f, 2
 *
 * Las conversiones implícitas int→float se hacen visibles con CAST.
 */
export class IRGenerator {
  private readonly semantic: SemanticResult
  private tempCounter = 0
  private labelCounter = 0

  /** Lista de instrucciones donde se está emitiendo (main o cuerpo de función). */
  private code: Instruction[] = []
  private readonly globals = new Map<string, IRVariable>()
  /** Locales de la función en curso (null mientras se genera main). */
  private locals: Map<string, IRVariable> | null = null
  private currentReturnType: IRReturnType = 'void'

  constructor(semantic: SemanticResult) {
    this.semantic = semantic
  }

  generate(program: Program): IRProgram {
    if (!this.semantic.ok) {
      throw new Error('IRGenerator: no se genera IR para un programa con errores semánticos')
    }
    const main: Instruction[] = []
    const functions: IRFunction[] = []

    for (const stmt of program.body) {
      if (stmt.kind === 'FunctionDeclaration') {
        functions.push(this.generateFunction(stmt))
      } else {
        this.code = main
        this.genStatement(stmt)
      }
    }

    return {
      version: IR_VERSION,
      globals: [...this.globals.values()],
      functions,
      main,
    }
  }

  // ═══════════════════════════ Funciones ════════════════════════════

  private generateFunction(decl: FunctionDeclaration): IRFunction {
    const fn = this.semantic.resolutions.get(decl) as FunctionSymbol
    const body: Instruction[] = []
    this.code = body
    this.locals = new Map()
    this.currentReturnType = fn.returnType

    const params = decl.params.map((p) => {
      const symbol = this.semantic.resolutions.get(p) as VariableSymbol
      return { name: symbol.irName, type: symbol.type }
    })

    for (const stmt of decl.body.body) this.genStatement(stmt)

    // Las funciones void pueden terminar sin `return` explícito.
    const last = body.at(-1)
    if (fn.returnType === 'void' && last?.op !== 'RETURN') {
      this.emit({ op: 'RETURN', value: null })
    }

    const result: IRFunction = {
      name: fn.name,
      params,
      returnType: fn.returnType,
      locals: [...this.locals.values()],
      body,
    }
    this.locals = null
    this.currentReturnType = 'void'
    return result
  }

  // ═══════════════════════════ Sentencias ═══════════════════════════

  private genStatement(stmt: Statement): void {
    switch (stmt.kind) {
      case 'VarDeclaration':
        return this.genVarDeclaration(stmt)
      case 'FunctionDeclaration':
        return // las funciones anidadas son rechazadas por el análisis semántico
      case 'Block':
        stmt.body.forEach((s) => this.genStatement(s))
        return
      case 'IfStatement':
        return this.genIf(stmt)
      case 'WhileStatement': {
        const start = this.newLabel()
        const end = this.newLabel()
        this.emit({ op: 'LABEL', name: start })
        const condition = this.genExpression(stmt.condition)
        this.emit({ op: 'JUMP_IF_FALSE', condition, target: end })
        this.genStatement(stmt.body)
        this.emit({ op: 'JUMP', target: start })
        this.emit({ op: 'LABEL', name: end })
        return
      }
      case 'ReturnStatement': {
        if (!stmt.value || this.currentReturnType === 'void') {
          this.emit({ op: 'RETURN', value: null })
          return
        }
        const value = this.genExpression(stmt.value)
        this.emit({
          op: 'RETURN',
          value: this.coerce(value, this.typeOf(stmt.value), this.currentReturnType),
        })
        return
      }
      case 'PrintStatement':
        this.emit({ op: 'PRINT', value: this.genExpression(stmt.argument) })
        return
      case 'AssignmentStatement': {
        const symbol = this.semantic.resolutions.get(stmt.target) as VariableSymbol
        const value = this.genExpression(stmt.value)
        this.emit({
          op: 'ASSIGN',
          dest: this.varOperand(symbol),
          src: this.coerce(value, this.typeOf(stmt.value), symbol.type),
        })
        return
      }
      case 'ExpressionStatement':
        if (stmt.expression.kind === 'CallExpression') {
          this.genCall(stmt.expression, false) // el resultado se descarta
        } else {
          this.genExpression(stmt.expression)
        }
        return
    }
  }

  private genVarDeclaration(decl: VarDeclaration): void {
    const symbol = this.semantic.resolutions.get(decl) as VariableSymbol
    const variable = { name: symbol.irName, type: symbol.type }
    if (symbol.storage === 'global') this.globals.set(variable.name, variable)
    else this.locals?.set(variable.name, variable)

    const src: Operand = decl.initializer
      ? this.coerce(this.genExpression(decl.initializer), this.typeOf(decl.initializer), symbol.type)
      : this.constant(symbol.type, defaultValue(symbol.type))
    this.emit({ op: 'ASSIGN', dest: this.varOperand(symbol), src })
  }

  private genIf(stmt: IfStatement): void {
    const condition = this.genExpression(stmt.condition)
    const end = this.newLabel()
    if (!stmt.alternate) {
      this.emit({ op: 'JUMP_IF_FALSE', condition, target: end })
      this.genStatement(stmt.consequent)
      this.emit({ op: 'LABEL', name: end })
      return
    }
    const elseLabel = this.newLabel()
    this.emit({ op: 'JUMP_IF_FALSE', condition, target: elseLabel })
    this.genStatement(stmt.consequent)
    this.emit({ op: 'JUMP', target: end })
    this.emit({ op: 'LABEL', name: elseLabel })
    this.genStatement(stmt.alternate)
    this.emit({ op: 'LABEL', name: end })
  }

  // ═══════════════════════════ Expresiones ══════════════════════════

  /** Genera el código de la expresión y devuelve el operando con su resultado. */
  private genExpression(expr: Expression): Operand {
    switch (expr.kind) {
      case 'IntLiteral':
        return this.constant('int', expr.value)
      case 'FloatLiteral':
        return this.constant('float', expr.value)
      case 'StringLiteral':
        return this.constant('string', expr.value)
      case 'BoolLiteral':
        return this.constant('bool', expr.value)

      case 'Identifier':
        return this.varOperand(this.semantic.resolutions.get(expr) as VariableSymbol)

      case 'BinaryExpression': {
        if (expr.operator === '&&' || expr.operator === '||') {
          const dest = this.newTemp('bool')
          const end = this.newLabel()
          this.emit({ op: 'ASSIGN', dest, src: this.genExpression(expr.left) })
          this.emit({
            op: expr.operator === '&&' ? 'JUMP_IF_FALSE' : 'JUMP_IF_TRUE',
            condition: dest,
            target: end,
          })
          this.emit({ op: 'ASSIGN', dest, src: this.genExpression(expr.right) })
          this.emit({ op: 'LABEL', name: end })
          return dest
        }
        const leftType = this.typeOf(expr.left)
        const rightType = this.typeOf(expr.right)
        const typing = binaryTyping(expr.operator, leftType, rightType)
        if (!typing) throw new Error(`IRGenerator: operación sin tipado válido '${expr.operator}'`)
        const left = this.coerce(this.genExpression(expr.left), leftType, typing.operandType)
        const right = this.coerce(this.genExpression(expr.right), rightType, typing.operandType)
        const dest = this.newTemp(typing.result)
        this.emit({
          op: 'BINARY',
          operator: expr.operator,
          operandType: typing.operandType,
          dest,
          left,
          right,
        })
        return dest
      }

      case 'UnaryExpression': {
        const src = this.genExpression(expr.operand)
        const dest = this.newTemp(this.typeOf(expr))
        this.emit({ op: 'UNARY', operator: expr.operator, dest, src })
        return dest
      }

      case 'CallExpression': {
        const result = this.genCall(expr, true)
        if (!result) throw new Error('IRGenerator: se usó como valor una llamada void')
        return result
      }

      case 'CastExpression': {
        const src = this.genExpression(expr.expression)
        const from = this.typeOf(expr.expression)
        if (from === expr.targetType) return src
        const dest = this.newTemp(expr.targetType)
        this.emit({ op: 'CAST', from, to: expr.targetType, dest, src })
        return dest
      }
    }
  }

  /**
   * Convención de llamada: primero se evalúan TODOS los argumentos (que
   * podrían contener otras llamadas) y después se emiten los PARAM seguidos,
   * para que nunca se intercalen PARAM de llamadas distintas.
   */
  private genCall(call: CallExpression, wantResult: boolean): TempOperand | null {
    const fn = this.semantic.resolutions.get(call) as FunctionSymbol
    const args = call.args.map((arg, i) =>
      this.coerce(this.genExpression(arg), this.typeOf(arg), fn.params[i].type),
    )
    args.forEach((value) => this.emit({ op: 'PARAM', value }))
    const dest = wantResult && fn.returnType !== 'void' ? this.newTemp(fn.returnType) : null
    this.emit({ op: 'CALL', func: fn.name, argCount: args.length, dest })
    return dest
  }

  // ════════════════════════════ Utilidades ══════════════════════════

  /** Inserta un CAST si hace falta la conversión implícita int → float. */
  private coerce(value: Operand, from: ValueType, to: ValueType): Operand {
    if (from === 'int' && to === 'float') {
      const dest = this.newTemp('float')
      this.emit({ op: 'CAST', from: 'int', to: 'float', dest, src: value })
      return dest
    }
    return value
  }

  private typeOf(expr: Expression): ValueType {
    const type: CheckedType | undefined = this.semantic.expressionTypes.get(expr)
    if (!type || type === 'error' || type === 'void') {
      throw new Error(`IRGenerator: la expresión ${expr.kind} no tiene un tipo de valor válido`)
    }
    return type
  }

  private varOperand(symbol: VariableSymbol): VarOperand {
    return { kind: 'var', name: symbol.irName, scope: symbol.storage, type: symbol.type }
  }

  private constant(type: ValueType, value: ConstOperand['value']): ConstOperand {
    return { kind: 'const', type, value }
  }

  private newTemp(type: ValueType): TempOperand {
    return { kind: 'temp', name: `t${++this.tempCounter}`, type }
  }

  private newLabel(): string {
    return `L${++this.labelCounter}`
  }

  private emit(instruction: Instruction): void {
    this.code.push(instruction)
  }
}

export function generateIR(program: Program, semantic: SemanticResult): IRProgram {
  return new IRGenerator(semantic).generate(program)
}
