import type {
  AssignmentStatement,
  AstNode,
  Block,
  CallExpression,
  Expression,
  FunctionDeclaration,
  IfStatement,
  Program,
  ReturnStatement,
  SourceLocation,
  Statement,
  VarDeclaration,
} from './ast-contract'
import { semanticError, type SemanticError, type SemanticErrorCode } from './semantic-errors'
import {
  SymbolTable,
  type FunctionSymbol,
  type ParameterInfo,
  type SemanticSymbol,
  type ValueType,
  type VariableSymbol,
} from './symbol-table'
import {
  binaryTyping,
  isAssignable,
  isCastAllowed,
  unaryResultType,
  type CheckedType,
} from './types'

/**
 * ANALIZADOR SEMÁNTICO + VERIFICADOR DE TIPOS
 * ============================================================================
 * Recorre el AST en dos pasadas:
 *
 *  Pasada 1 (hoisting): registra en el scope global la firma de TODAS las
 *  funciones. Así se pueden llamar antes de su declaración y se permite la
 *  recursión (directa y mutua).
 *
 *  Pasada 2: recorre sentencia por sentencia abriendo/cerrando scopes,
 *  resolviendo identificadores, calculando el tipo de cada expresión y
 *  aplicando las reglas de `types.ts`.
 *
 * El resultado (`SemanticResult`) incluye anotaciones que el generador de IR
 * reutiliza para no volver a resolver nombres ni tipos:
 *   - `expressionTypes`: tipo de cada nodo Expression.
 *   - `resolutions`: símbolo al que se refiere cada Identifier, declaración
 *     de variable, parámetro y función.
 */

export interface SemanticResult {
  ok: boolean
  errors: SemanticError[]
  symbolTable: SymbolTable
  expressionTypes: Map<Expression, CheckedType>
  resolutions: Map<AstNode, SemanticSymbol>
}

export function analyze(program: Program): SemanticResult {
  return new SemanticAnalyzer().analyze(program)
}

export class SemanticAnalyzer {
  private readonly table = new SymbolTable()
  private readonly errors: SemanticError[] = []
  private readonly expressionTypes = new Map<Expression, CheckedType>()
  private readonly resolutions = new Map<AstNode, SemanticSymbol>()
  /** Variables cuyo tipo no se pudo determinar (para no generar errores en cascada). */
  private readonly untypedSymbols = new Set<VariableSymbol>()

  analyze(program: Program): SemanticResult {
    this.hoistFunctions(program)
    for (const stmt of program.body) this.visitStatement(stmt)

    return {
      ok: this.errors.length === 0,
      errors: this.errors,
      symbolTable: this.table,
      expressionTypes: this.expressionTypes,
      resolutions: this.resolutions,
    }
  }

  // ════════════════════════════ Pasada 1 ════════════════════════════

  private hoistFunctions(program: Program): void {
    for (const stmt of program.body) {
      if (stmt.kind !== 'FunctionDeclaration') continue

      const params: ParameterInfo[] = stmt.params.map((p) => {
        if (p.typeAnnotation === 'void') {
          this.report('INVALID_VOID_VARIABLE', `El parámetro '${p.name}' no puede ser de tipo void`, p.loc)
          return { name: p.name, type: 'int' } // marcador; el error ya se reportó
        }
        return { name: p.name, type: p.typeAnnotation }
      })

      const result = this.table.declareFunction(stmt.name, params, stmt.returnType, stmt.loc)
      if (result.ok) {
        this.resolutions.set(stmt, result.symbol)
      } else {
        this.reportDuplicate(stmt.name, result.existing, stmt.loc)
      }
    }
  }

  // ═══════════════════════════ Sentencias ═══════════════════════════

  private visitStatement(stmt: Statement): void {
    switch (stmt.kind) {
      case 'VarDeclaration':
        return this.visitVarDeclaration(stmt)
      case 'FunctionDeclaration':
        return this.visitFunctionDeclaration(stmt)
      case 'Block':
        return this.visitBlock(stmt)
      case 'IfStatement':
        return this.visitIf(stmt)
      case 'WhileStatement':
        this.checkCondition(stmt.condition, 'while')
        return this.visitBlock(stmt.body)
      case 'ReturnStatement':
        return this.visitReturn(stmt)
      case 'PrintStatement':
        this.checkValue(stmt.argument)
        return
      case 'AssignmentStatement':
        return this.visitAssignment(stmt)
      case 'ExpressionStatement':
        this.checkExpression(stmt.expression) // aquí sí se permite void (p. ej. `saludar();`)
        return
    }
  }

  private visitVarDeclaration(decl: VarDeclaration): void {
    const what = decl.mutable ? 'variable' : 'constante'
    let annotation: ValueType | undefined
    if (decl.typeAnnotation === 'void') {
      this.report('INVALID_VOID_VARIABLE', `La ${what} '${decl.name}' no puede ser de tipo void`, decl.loc)
    } else {
      annotation = decl.typeAnnotation
    }

    if (!decl.mutable && !decl.initializer) {
      this.report('CONST_WITHOUT_INITIALIZER', `La constante '${decl.name}' debe inicializarse`, decl.loc)
    }

    // El inicializador se evalúa ANTES de declarar: `let x = x + 1;` usa la x externa (o falla).
    const initType = decl.initializer ? this.checkValue(decl.initializer) : undefined

    if (annotation && initType !== undefined && !isAssignable(annotation, initType)) {
      this.report(
        'TYPE_MISMATCH',
        `No se puede inicializar '${decl.name}' de tipo ${annotation} con un valor de tipo ${initType}`,
        decl.initializer?.loc ?? decl.loc,
      )
    }

    let type: ValueType | undefined = annotation
    if (!type && initType && initType !== 'error' && initType !== 'void') type = initType
    if (!annotation && !decl.initializer && decl.typeAnnotation !== 'void') {
      this.report('MISSING_TYPE', `La ${what} '${decl.name}' necesita un tipo o un valor inicial`, decl.loc)
    }

    const kind = decl.mutable ? 'variable' : 'constant'
    const result = this.table.declareVariable(decl.name, kind, type ?? 'int', decl.loc)
    if (!result.ok) {
      this.reportDuplicate(decl.name, result.existing, decl.loc)
      return
    }
    if (!type) this.untypedSymbols.add(result.symbol)
    this.resolutions.set(decl, result.symbol)
  }

  private visitFunctionDeclaration(decl: FunctionDeclaration): void {
    if (this.table.current !== this.table.global) {
      this.report(
        'NESTED_FUNCTION',
        `La función '${decl.name}' debe declararse en el nivel superior del programa`,
        decl.loc,
      )
      return
    }
    const fn = this.resolutions.get(decl)
    if (!fn || fn.kind !== 'function') return // declaración duplicada: ya se reportó en el hoisting

    // Parámetros y variables del cuerpo comparten el MISMO scope de función:
    // `fn f(a: int) { let a = 1; }` es una redeclaración.
    this.table.enterScope('function', decl.name, fn)
    for (const param of decl.params) {
      const type: ValueType = param.typeAnnotation === 'void' ? 'int' : param.typeAnnotation
      const result = this.table.declareVariable(param.name, 'parameter', type, param.loc)
      if (result.ok) this.resolutions.set(param, result.symbol)
      else this.reportDuplicate(param.name, result.existing, param.loc)
    }
    for (const stmt of decl.body.body) this.visitStatement(stmt)
    this.table.exitScope()

    if (decl.returnType !== 'void' && !alwaysReturns(decl.body.body)) {
      this.report(
        'MISSING_RETURN',
        `La función '${decl.name}' debe retornar un valor de tipo ${decl.returnType} en todos los caminos`,
        decl.loc,
      )
    }
  }

  private visitBlock(block: Block): void {
    this.table.enterScope('block', 'block')
    for (const stmt of block.body) this.visitStatement(stmt)
    this.table.exitScope()
  }

  private visitIf(stmt: IfStatement): void {
    this.checkCondition(stmt.condition, 'if')
    this.visitBlock(stmt.consequent)
    if (stmt.alternate) this.visitStatement(stmt.alternate)
  }

  private visitReturn(stmt: ReturnStatement): void {
    const fn = this.table.currentFunction()
    const valueType = stmt.value ? this.checkValue(stmt.value) : undefined

    if (!fn) {
      this.report('RETURN_OUTSIDE_FUNCTION', `'return' solo puede usarse dentro de una función`, stmt.loc)
      return
    }
    if (fn.returnType === 'void') {
      if (stmt.value) {
        this.report('RETURN_TYPE_MISMATCH', `La función '${fn.name}' es void y no puede retornar un valor`, stmt.loc)
      }
      return
    }
    if (valueType === undefined) {
      this.report(
        'RETURN_TYPE_MISMATCH',
        `La función '${fn.name}' debe retornar un valor de tipo ${fn.returnType}`,
        stmt.loc,
      )
    } else if (!isAssignable(fn.returnType, valueType)) {
      this.report(
        'RETURN_TYPE_MISMATCH',
        `La función '${fn.name}' retorna ${fn.returnType}, pero se intentó retornar ${valueType}`,
        stmt.value?.loc ?? stmt.loc,
      )
    }
  }

  private visitAssignment(stmt: AssignmentStatement): void {
    const valueType = this.checkValue(stmt.value)
    const name = stmt.target.name
    const symbol = this.table.lookup(name)

    if (!symbol) {
      this.report('UNDECLARED_IDENTIFIER', `La variable '${name}' no ha sido declarada`, stmt.target.loc)
      return
    }
    if (symbol.kind === 'function') {
      this.report('INVALID_ASSIGNMENT', `No se puede asignar un valor a la función '${name}'`, stmt.target.loc)
      return
    }
    this.resolutions.set(stmt.target, symbol)
    if (!symbol.mutable) {
      this.report('CONST_REASSIGNMENT', `No se puede reasignar la constante '${name}'`, stmt.target.loc)
      return
    }
    const targetType = this.typeOfSymbol(symbol)
    if (targetType !== 'error' && targetType !== 'void' && !isAssignable(targetType, valueType)) {
      this.report(
        'TYPE_MISMATCH',
        `No se puede asignar un valor de tipo ${valueType} a '${name}' de tipo ${targetType}`,
        stmt.value.loc ?? stmt.loc,
      )
    }
  }

  private checkCondition(condition: Expression, construct: 'if' | 'while'): void {
    const type = this.checkValue(condition)
    if (type !== 'bool' && type !== 'error') {
      this.report(
        'INVALID_CONDITION',
        `La condición de '${construct}' debe ser de tipo bool, pero es ${type}`,
        condition.loc,
      )
    }
  }

  // ═══════════════════════════ Expresiones ══════════════════════════

  /** Como `checkExpression`, pero exige que la expresión produzca un valor (no void). */
  private checkValue(expr: Expression): CheckedType {
    const type = this.checkExpression(expr)
    if (type === 'void') {
      this.report('VOID_VALUE', 'Una función void no produce un valor utilizable', expr.loc)
      return 'error'
    }
    return type
  }

  private checkExpression(expr: Expression): CheckedType {
    const type = this.computeType(expr)
    this.expressionTypes.set(expr, type)
    return type
  }

  private computeType(expr: Expression): CheckedType {
    switch (expr.kind) {
      case 'IntLiteral':
        return 'int'
      case 'FloatLiteral':
        return 'float'
      case 'StringLiteral':
        return 'string'
      case 'BoolLiteral':
        return 'bool'

      case 'Identifier': {
        const symbol = this.table.lookup(expr.name)
        if (!symbol) {
          this.report('UNDECLARED_IDENTIFIER', `La variable '${expr.name}' no ha sido declarada`, expr.loc)
          return 'error'
        }
        if (symbol.kind === 'function') {
          this.report('FUNCTION_AS_VALUE', `'${expr.name}' es una función y debe llamarse con ()`, expr.loc)
          return 'error'
        }
        this.resolutions.set(expr, symbol)
        return this.typeOfSymbol(symbol)
      }

      case 'BinaryExpression': {
        const left = this.checkValue(expr.left)
        const right = this.checkValue(expr.right)
        if (left === 'error' || right === 'error') return 'error'
        const typing = binaryTyping(expr.operator, left, right)
        if (!typing) {
          this.report(
            'INVALID_OPERAND_TYPES',
            `El operador '${expr.operator}' no se puede aplicar a ${left} y ${right}`,
            expr.loc,
          )
          return 'error'
        }
        return typing.result
      }

      case 'UnaryExpression': {
        const operand = this.checkValue(expr.operand)
        if (operand === 'error') return 'error'
        const result = unaryResultType(expr.operator, operand)
        if (!result) {
          this.report(
            'INVALID_OPERAND_TYPES',
            `El operador unario '${expr.operator}' no se puede aplicar a ${operand}`,
            expr.loc,
          )
          return 'error'
        }
        return result
      }

      case 'CallExpression':
        return this.checkCall(expr)

      case 'CastExpression': {
        const from = this.checkValue(expr.expression)
        if (!isCastAllowed(from, expr.targetType)) {
          this.report('INVALID_CAST', `No se puede convertir ${from} a ${expr.targetType}`, expr.loc)
          return 'error'
        }
        return expr.targetType
      }
    }
  }

  private checkCall(call: CallExpression): CheckedType {
    const name = call.callee.name
    const symbol = this.table.lookup(name)
    // Los argumentos se revisan siempre, para reportar también sus errores.
    const argTypes = call.args.map((arg) => this.checkValue(arg))

    if (!symbol) {
      this.report('UNDEFINED_FUNCTION', `La función '${name}' no existe`, call.callee.loc ?? call.loc)
      return 'error'
    }
    if (symbol.kind !== 'function') {
      this.report('NOT_A_FUNCTION', `'${name}' no es una función`, call.callee.loc ?? call.loc)
      return 'error'
    }
    this.resolutions.set(call.callee, symbol)
    this.resolutions.set(call, symbol)

    if (argTypes.length !== symbol.params.length) {
      this.report(
        'ARGUMENT_COUNT_MISMATCH',
        `La función '${name}' espera ${symbol.params.length} argumento(s), pero recibió ${argTypes.length}`,
        call.loc,
      )
    } else {
      symbol.params.forEach((param, i) => {
        if (!isAssignable(param.type, argTypes[i])) {
          this.report(
            'TYPE_MISMATCH',
            `Argumento ${i + 1} de '${name}': se esperaba ${param.type} ('${param.name}'), pero se recibió ${argTypes[i]}`,
            call.args[i].loc ?? call.loc,
          )
        }
      })
    }
    return symbol.returnType
  }

  // ════════════════════════════ Utilidades ══════════════════════════

  private typeOfSymbol(symbol: VariableSymbol | FunctionSymbol): CheckedType {
    if (symbol.kind === 'function') return symbol.returnType
    return this.untypedSymbols.has(symbol) ? 'error' : symbol.type
  }

  private reportDuplicate(name: string, existing: SemanticSymbol, loc?: SourceLocation): void {
    const previous = existing.loc ? ` (declarado antes en la línea ${existing.loc.line})` : ''
    this.report('DUPLICATE_DECLARATION', `'${name}' ya está declarado en este scope${previous}`, loc)
  }

  private report(code: SemanticErrorCode, message: string, loc?: SourceLocation): void {
    this.errors.push(semanticError(code, message, loc))
  }
}

/**
 * ¿La lista de sentencias retorna en TODOS los caminos?
 * - `return` → sí.
 * - bloque → si su contenido retorna siempre.
 * - if → solo si tiene else y ambas ramas retornan siempre.
 * - while → no (conservador: la condición podría ser falsa desde el inicio).
 */
export function alwaysReturns(statements: Statement[]): boolean {
  return statements.some(statementAlwaysReturns)
}

function statementAlwaysReturns(stmt: Statement): boolean {
  switch (stmt.kind) {
    case 'ReturnStatement':
      return true
    case 'Block':
      return alwaysReturns(stmt.body)
    case 'IfStatement':
      return (
        stmt.alternate !== undefined &&
        alwaysReturns(stmt.consequent.body) &&
        statementAlwaysReturns(stmt.alternate)
      )
    default:
      return false
  }
}
