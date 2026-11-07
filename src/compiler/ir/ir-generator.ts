import type {
  ArrayExpression,
  AssignmentExpression,
  CallExpression,
  Expression,
  FunctionDeclaration,
  IfStatement,
  IndexExpression,
  Program,
  Statement,
  VariableDeclaration,
} from '../ast/nodes.ts'
import type { SourcePosition } from '../tokens.ts'
import type { FunctionSymbol, VariableSymbol } from '../semantic/symbol-table.ts'
import type { SemanticResult } from '../semantic/type-checker.ts'
import { binaryTyping, isArray, needsWidening, type ValueType } from '../semantic/types.ts'
import {
  IR_VERSION,
  type ConstOperand,
  type IRFunction,
  type IRPrimitiveType,
  type IRProgram,
  type IRReturnType,
  type IRType,
  type IRVariable,
  type Instruction,
  type Operand,
  type TempOperand,
  type VarOperand,
} from './instructions.ts'

/**
 * GENERADOR DE IR (código de tres direcciones)
 * ============================================================================
 * Requisito: el programa ya pasó el análisis semántico sin errores. El
 * generador confía en las anotaciones de `SemanticResult` (tipo de cada
 * expresión y símbolo de cada identificador), por eso no vuelve a validar.
 *
 * Los tipos semánticos (`ValueType`) y los del IR (`IRType`) tienen la misma
 * forma, así que se pasan directamente.
 *
 * Esquema de traducción (E = expresión, S = sentencia):
 *
 *   E1 op E2       →  [E1] [E2]  tN = a op b
 *   E1 && E2       →  t = a ; IF_FALSE t GOTO Lend ; t = b ; Lend:
 *   E1 || E2       →  t = a ; IF_TRUE  t GOTO Lend ; t = b ; Lend:
 *   if (C) S1      →  [C] IF_FALSE c GOTO Lend ; [S1] ; Lend:
 *   if (C) S1 else S2
 *                  →  [C] IF_FALSE c GOTO Lelse ; [S1] ; GOTO Lend ;
 *                     Lelse: [S2] ; Lend:
 *   while (C) S    →  Lstart: [C] IF_FALSE c GOTO Lend ; [S] ; GOTO Lstart ; Lend:
 *   f(a, b)        →  [a] [b] PARAM a ; PARAM b ; t = CALL f, 2
 *   x = E          →  [E] x = e
 *   [E1, E2]       →  t = ARRAY_ALLOC T, 2 ; [E1] t[0] = e1 ; [E2] t[1] = e2
 *   A[I]           →  [A] [I] tN = a[i]               (ARRAY_LOAD)
 *   A[I] = E       →  [A] [I] [E] a[i] = e            (ARRAY_STORE)
 *
 * Orden de evaluación: siempre de izquierda a derecha.
 * Las conversiones implícitas int→float se hacen visibles con CAST.
 * Cada instrucción lleva la `position` del nodo del AST que la originó.
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
    if (fn.returnType === 'void' && body.at(-1)?.op !== 'RETURN') {
      this.emit({ op: 'RETURN', value: null }, decl.body.position)
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
      case 'VariableDeclaration':
        return this.genVariableDeclaration(stmt)
      case 'FunctionDeclaration':
        return // solo existen en el nivel superior; se generan en `generate`
      case 'BlockStatement':
        stmt.body.forEach((s) => this.genStatement(s))
        return
      case 'IfStatement':
        return this.genIf(stmt)
      case 'WhileStatement': {
        const start = this.newLabel()
        const end = this.newLabel()
        this.emit({ op: 'LABEL', name: start }, stmt.position)
        const condition = this.genExpression(stmt.condition)
        this.emit({ op: 'JUMP_IF_FALSE', condition, target: end }, stmt.condition.position)
        this.genStatement(stmt.body)
        this.emit({ op: 'JUMP', target: start }, stmt.position)
        this.emit({ op: 'LABEL', name: end }, stmt.position)
        return
      }
      case 'ReturnStatement': {
        if (!stmt.argument || this.currentReturnType === 'void') {
          this.emit({ op: 'RETURN', value: null }, stmt.position)
          return
        }
        const value = this.genValue(stmt.argument, this.currentReturnType)
        this.emit({ op: 'RETURN', value }, stmt.position)
        return
      }
      case 'PrintStatement':
        this.emit({ op: 'PRINT', value: this.genExpression(stmt.argument) }, stmt.position)
        return
      case 'ExpressionStatement': {
        // El resultado se descarta: no hace falta reservar temporales para él.
        const { expression } = stmt
        if (expression.kind === 'CallExpression') this.genCall(expression, false)
        else if (expression.kind === 'AssignmentExpression') this.genAssignment(expression, false)
        else this.genExpression(expression)
        return
      }
    }
  }

  private genVariableDeclaration(decl: VariableDeclaration): void {
    const symbol = this.semantic.resolutions.get(decl) as VariableSymbol
    const variable: IRVariable = { name: symbol.irName, type: symbol.type }
    if (symbol.storage === 'global') this.globals.set(variable.name, variable)
    else this.locals?.set(variable.name, variable)

    let src: Operand
    if (decl.initializer) {
      src = this.genValue(decl.initializer, symbol.type)
    } else if (isArray(symbol.type)) {
      // `let a: int[];` → arreglo vacío (un bloque de longitud 0 en el Heap).
      src = this.allocArray(symbol.type, 0, decl.position)
    } else {
      src = this.constant(symbol.type, defaultPrimitive(symbol.type))
    }
    this.emit({ op: 'ASSIGN', dest: this.varOperand(symbol), src }, decl.position)
  }

  private genIf(stmt: IfStatement): void {
    const condition = this.genExpression(stmt.condition)
    const end = this.newLabel()
    if (!stmt.alternate) {
      this.emit({ op: 'JUMP_IF_FALSE', condition, target: end }, stmt.condition.position)
      this.genStatement(stmt.consequent)
      this.emit({ op: 'LABEL', name: end }, stmt.position)
      return
    }
    const elseLabel = this.newLabel()
    this.emit({ op: 'JUMP_IF_FALSE', condition, target: elseLabel }, stmt.condition.position)
    this.genStatement(stmt.consequent)
    this.emit({ op: 'JUMP', target: end }, stmt.position)
    this.emit({ op: 'LABEL', name: elseLabel }, stmt.alternate.position)
    this.genStatement(stmt.alternate)
    this.emit({ op: 'LABEL', name: end }, stmt.position)
  }

  // ═══════════════════════════ Expresiones ══════════════════════════

  /** Genera la expresión y la convierte (si hace falta) al tipo esperado `to`. */
  private genValue(expr: Expression, to: ValueType): Operand {
    return this.coerce(this.genExpression(expr), this.typeOf(expr), to, expr.position)
  }

  /** Genera el código de la expresión y devuelve el operando con su resultado. */
  private genExpression(expr: Expression): Operand {
    switch (expr.kind) {
      case 'LiteralExpression':
        return this.constant(expr.literalType, expr.value)

      case 'IdentifierExpression':
        return this.varOperand(this.semantic.resolutions.get(expr) as VariableSymbol)

      case 'BinaryExpression': {
        if (expr.operator === '&&' || expr.operator === '||') {
          const dest = this.newTemp('bool')
          const end = this.newLabel()
          this.emit({ op: 'ASSIGN', dest, src: this.genExpression(expr.left) }, expr.position)
          this.emit(
            {
              op: expr.operator === '&&' ? 'JUMP_IF_FALSE' : 'JUMP_IF_TRUE',
              condition: dest,
              target: end,
            },
            expr.position,
          )
          this.emit({ op: 'ASSIGN', dest, src: this.genExpression(expr.right) }, expr.position)
          this.emit({ op: 'LABEL', name: end }, expr.position)
          return dest
        }
        const typing = binaryTyping(expr.operator, this.typeOf(expr.left), this.typeOf(expr.right))
        if (!typing) throw new Error(`IRGenerator: operación sin tipado válido '${expr.operator}'`)
        const left = this.genValue(expr.left, typing.operandType)
        const right = this.genValue(expr.right, typing.operandType)
        const dest = this.newTemp(typing.result)
        this.emit(
          { op: 'BINARY', operator: expr.operator, operandType: typing.operandType, dest, left, right },
          expr.position,
        )
        return dest
      }

      case 'UnaryExpression': {
        const src = this.genExpression(expr.operand)
        const dest = this.newTemp(this.typeOf(expr))
        this.emit({ op: 'UNARY', operator: expr.operator, dest, src }, expr.position)
        return dest
      }

      case 'CallExpression': {
        const result = this.genCall(expr, true)
        if (!result) throw new Error('IRGenerator: se usó como valor una llamada void')
        return result
      }

      case 'AssignmentExpression':
        return this.genAssignment(expr, true) as Operand

      case 'ArrayExpression':
        return this.genArrayLiteral(expr)

      case 'IndexExpression': {
        const array = this.genExpression(expr.object)
        const index = this.genExpression(expr.index)
        const dest = this.newTemp(this.typeOf(expr))
        this.emit({ op: 'ARRAY_LOAD', dest, array, index }, expr.position)
        return dest
      }
    }
  }

  /**
   * `destino = valor`. Con `wantResult` devuelve el operando con el valor
   * asignado, para usos anidados como `a = b = 1` o `print(x = 5)`.
   */
  private genAssignment(expr: AssignmentExpression, wantResult: boolean): Operand | null {
    const { target } = expr

    if (target.kind === 'IdentifierExpression') {
      const symbol = this.semantic.resolutions.get(target) as VariableSymbol
      let value = this.genValue(expr.value, symbol.type)
      // Si el valor es otra variable, se copia a un temporal: así el resultado
      // no cambia aunque esa variable se modifique más adelante en la expresión.
      if (wantResult && value.kind === 'var') {
        const copy = this.newTemp(value.type)
        this.emit({ op: 'ASSIGN', dest: copy, src: value }, expr.position)
        value = copy
      }
      this.emit({ op: 'ASSIGN', dest: this.varOperand(symbol), src: value }, expr.position)
      return wantResult ? value : null
    }

    return this.genIndexStore(target, expr)
  }

  /** `a[i] = v` → evalúa a, i y v (en ese orden) y emite ARRAY_STORE. */
  private genIndexStore(target: IndexExpression, expr: AssignmentExpression): Operand {
    const array = this.genExpression(target.object)
    const index = this.genExpression(target.index)
    const value = this.genValue(expr.value, this.typeOf(target))
    this.emit({ op: 'ARRAY_STORE', array, index, value }, expr.position)
    return value
  }

  /**
   * `[e1, e2, ...]` → reserva el bloque y guarda cada elemento en orden.
   * En arreglos anidados, cada literal interior genera su propio bloque y la
   * celda del exterior guarda la referencia a él.
   */
  private genArrayLiteral(expr: ArrayExpression): TempOperand {
    const type = this.typeOf(expr)
    if (!isArray(type)) throw new Error('IRGenerator: literal de arreglo sin tipo arreglo')
    const array = this.allocArray(type, expr.elements.length, expr.position)
    expr.elements.forEach((element, i) => {
      const value = this.genValue(element, type.elementType)
      this.emit(
        { op: 'ARRAY_STORE', array, index: this.constant('int', i), value },
        element.position,
      )
    })
    return array
  }

  /**
   * Convención de llamada: primero se evalúan TODOS los argumentos (que
   * podrían contener otras llamadas) y después se emiten los PARAM seguidos,
   * para que nunca se intercalen PARAM de llamadas distintas.
   * Los arreglos se pasan por referencia (el PARAM lleva la referencia).
   */
  private genCall(call: CallExpression, wantResult: boolean): TempOperand | null {
    const fn = this.semantic.resolutions.get(call) as FunctionSymbol
    const args = call.args.map((arg, i) => this.genValue(arg, fn.params[i].type))
    args.forEach((value) => this.emit({ op: 'PARAM', value }, call.position))
    const dest = wantResult && fn.returnType !== 'void' ? this.newTemp(fn.returnType) : null
    this.emit({ op: 'CALL', func: fn.name, argCount: args.length, dest }, call.position)
    return dest
  }

  // ════════════════════════════ Utilidades ══════════════════════════

  /** Inserta un CAST si hace falta la conversión implícita int → float. */
  private coerce(value: Operand, from: ValueType, to: ValueType, position: SourcePosition): Operand {
    if (!needsWidening(to, from)) return value
    const dest = this.newTemp('float')
    this.emit({ op: 'CAST', from: 'int', to: 'float', dest, src: value }, position)
    return dest
  }

  private allocArray(type: IRType, length: number, position: SourcePosition): TempOperand {
    if (!isArray(type)) throw new Error('IRGenerator: ARRAY_ALLOC requiere un tipo arreglo')
    const dest = this.newTemp(type)
    this.emit({ op: 'ARRAY_ALLOC', dest, elementType: type.elementType, length }, position)
    return dest
  }

  private typeOf(expr: Expression): ValueType {
    const type = this.semantic.expressionTypes.get(expr)
    if (type === undefined || type === 'error' || type === 'void') {
      throw new Error(`IRGenerator: la expresión ${expr.kind} no tiene un tipo de valor válido`)
    }
    return type
  }

  private varOperand(symbol: VariableSymbol): VarOperand {
    return { kind: 'var', name: symbol.irName, scope: symbol.storage, type: symbol.type }
  }

  private constant(type: IRPrimitiveType, value: ConstOperand['value']): ConstOperand {
    return { kind: 'const', type, value }
  }

  private newTemp(type: IRType): TempOperand {
    return { kind: 'temp', name: `t${++this.tempCounter}`, type }
  }

  private newLabel(): string {
    return `L${++this.labelCounter}`
  }

  private emit(instruction: Instruction, position: SourcePosition): void {
    instruction.position = { line: position.line, column: position.column }
    this.code.push(instruction)
  }
}

function defaultPrimitive(type: IRPrimitiveType): ConstOperand['value'] {
  switch (type) {
    case 'int':
    case 'float':
      return 0
    case 'string':
      return ''
    case 'bool':
      return false
  }
}

export function generateIR(program: Program, semantic: SemanticResult): IRProgram {
  return new IRGenerator(semantic).generate(program)
}
