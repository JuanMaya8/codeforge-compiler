import type {
  ArrayExpression,
  AssignmentExpression,
  AstNode,
  BlockStatement,
  CallExpression,
  Expression,
  FunctionDeclaration,
  IdentifierExpression,
  IfStatement,
  IndexExpression,
  Program,
  ReturnStatement,
  Statement,
  VariableDeclaration,
} from '../ast/nodes.ts'
import type { SourcePosition } from '../tokens.ts'
import {
  semanticError,
  SemanticErrorCode,
  type SemanticDiagnostic,
} from './semantic-errors.ts'
import {
  SymbolTable,
  type ParameterInfo,
  type SemanticSymbol,
  type VariableSymbol,
} from './symbol-table.ts'
import {
  arrayOf,
  binaryTyping,
  commonType,
  formatType,
  fromAnnotation,
  isArray,
  isAssignable,
  unaryResultType,
  type CheckedType,
  type ReturnType,
  type ValueType,
} from './types.ts'

/**
 * ANALIZADOR SEMÁNTICO + VERIFICADOR DE TIPOS
 * ============================================================================
 * Entrada: el AST canónico del parser (`src/compiler/ast/nodes.ts`).
 * Requisito: el frontend terminó sin errores (`parseSource(...).success`).
 *
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
 * Tipo esperado (contextual): al revisar una expresión se puede indicar el
 * tipo que se espera de ella (el de la variable, el parámetro, el retorno o
 * el elemento del arreglo). Solo lo usan los literales de arreglo: es lo que
 * permite escribir `let a: int[] = [];` o `let f: float[] = [1, 2];`.
 *
 * El resultado (`SemanticResult`) incluye anotaciones que el generador de IR
 * reutiliza para no volver a resolver nombres ni tipos:
 *   - `expressionTypes`: tipo de cada nodo Expression.
 *   - `resolutions`: símbolo al que se refiere cada identificador,
 *     declaración de variable, parámetro, función y llamada.
 */

export interface SemanticResult {
  ok: boolean
  errors: SemanticDiagnostic[]
  symbolTable: SymbolTable
  expressionTypes: Map<Expression, CheckedType>
  resolutions: Map<AstNode, SemanticSymbol>
}

export function analyze(program: Program): SemanticResult {
  return new SemanticAnalyzer().analyze(program)
}

export class SemanticAnalyzer {
  private readonly table = new SymbolTable()
  private readonly errors: SemanticDiagnostic[] = []
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

      const params: ParameterInfo[] = stmt.params.map((p) => ({
        name: p.name,
        type: fromAnnotation(p.typeAnnotation),
      }))
      const returnType: ReturnType = stmt.returnType ? fromAnnotation(stmt.returnType) : 'void'

      const result = this.table.declareFunction(stmt.name, params, returnType, stmt.position)
      if (result.ok) this.resolutions.set(stmt, result.symbol)
      else this.reportDuplicate(stmt.name, result.existing, stmt.position)
    }
  }

  // ═══════════════════════════ Sentencias ═══════════════════════════

  private visitStatement(stmt: Statement): void {
    switch (stmt.kind) {
      case 'VariableDeclaration':
        return this.visitVariableDeclaration(stmt)
      case 'FunctionDeclaration':
        return this.visitFunctionDeclaration(stmt)
      case 'BlockStatement':
        return this.visitBlock(stmt)
      case 'IfStatement':
        return this.visitIf(stmt)
      case 'WhileStatement':
        this.checkCondition(stmt.condition, 'while')
        return this.visitBlock(stmt.body)
      case 'ReturnStatement':
        return this.visitReturn(stmt)
      case 'PrintStatement': {
        const type = this.checkValue(stmt.argument)
        if (isArray(type)) {
          this.report(
            SemanticErrorCode.INVALID_PRINT_ARGUMENT,
            `'print' solo acepta valores int, float, string o bool, pero recibió ${formatType(type)}`,
            stmt.argument.position,
          )
        }
        return
      }
      case 'ExpressionStatement':
        // Aquí sí se permite void: `saludar();` descarta el resultado.
        this.checkExpression(stmt.expression)
        return
    }
  }

  private visitVariableDeclaration(decl: VariableDeclaration): void {
    const isConst = decl.mutability === 'const'
    const what = isConst ? 'constante' : 'variable'
    const annotation = decl.typeAnnotation ? fromAnnotation(decl.typeAnnotation) : undefined

    if (isConst && !decl.initializer) {
      this.report(
        SemanticErrorCode.CONST_WITHOUT_INITIALIZER,
        `La constante '${decl.name}' debe inicializarse`,
        decl.position,
      )
    }

    // El inicializador se revisa ANTES de declarar: en `let x = x + 1;` la `x`
    // de la derecha es la de un scope exterior (o no existe).
    const initType = decl.initializer ? this.checkValue(decl.initializer, annotation) : undefined

    if (annotation && initType !== undefined && !isAssignable(annotation, initType)) {
      this.report(
        SemanticErrorCode.TYPE_MISMATCH,
        `No se puede inicializar '${decl.name}' de tipo ${formatType(annotation)} con un valor de tipo ${formatType(initType)}`,
        decl.initializer?.position ?? decl.position,
      )
    }

    let type: ValueType | undefined = annotation
    if (!type && initType !== undefined && initType !== 'error' && initType !== 'void') type = initType
    if (!annotation && !decl.initializer) {
      this.report(
        SemanticErrorCode.MISSING_TYPE,
        `La ${what} '${decl.name}' necesita un tipo o un valor inicial`,
        decl.position,
      )
    }

    const kind = isConst ? 'constant' : 'variable'
    const result = this.table.declareVariable(decl.name, kind, type ?? 'int', decl.position)
    if (!result.ok) {
      this.reportDuplicate(decl.name, result.existing, decl.position)
      return
    }
    if (!type) this.untypedSymbols.add(result.symbol)
    this.resolutions.set(decl, result.symbol)
  }

  private visitFunctionDeclaration(decl: FunctionDeclaration): void {
    if (this.table.current !== this.table.global) {
      this.report(
        SemanticErrorCode.NESTED_FUNCTION,
        `La función '${decl.name}' debe declararse en el nivel superior del programa`,
        decl.position,
      )
      return
    }
    const fn = this.resolutions.get(decl)
    if (!fn || fn.kind !== 'function') return // duplicada: ya se reportó en el hoisting

    // Parámetros y variables del cuerpo comparten el MISMO scope de función:
    // `function f(a: int) { let a = 1; }` es una redeclaración.
    this.table.enterScope('function', decl.name, fn)
    decl.params.forEach((param, i) => {
      const result = this.table.declareVariable(param.name, 'parameter', fn.params[i].type, param.position)
      if (result.ok) this.resolutions.set(param, result.symbol)
      else this.reportDuplicate(param.name, result.existing, param.position)
    })
    for (const stmt of decl.body.body) this.visitStatement(stmt)
    this.table.exitScope()

    if (fn.returnType !== 'void' && !alwaysReturns(decl.body.body)) {
      this.report(
        SemanticErrorCode.MISSING_RETURN,
        `La función '${decl.name}' debe retornar un valor de tipo ${formatType(fn.returnType)} en todos los caminos`,
        decl.position,
      )
    }
  }

  private visitBlock(block: BlockStatement): void {
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
    const expected = fn && fn.returnType !== 'void' ? fn.returnType : undefined
    const valueType = stmt.argument ? this.checkValue(stmt.argument, expected) : undefined

    if (!fn) {
      this.report(
        SemanticErrorCode.RETURN_OUTSIDE_FUNCTION,
        `'return' solo puede usarse dentro de una función`,
        stmt.position,
      )
      return
    }
    if (fn.returnType === 'void') {
      if (stmt.argument) {
        this.report(
          SemanticErrorCode.RETURN_TYPE_MISMATCH,
          `La función '${fn.name}' no declara tipo de retorno y no puede retornar un valor`,
          stmt.position,
        )
      }
      return
    }
    if (valueType === undefined) {
      this.report(
        SemanticErrorCode.RETURN_TYPE_MISMATCH,
        `La función '${fn.name}' debe retornar un valor de tipo ${formatType(fn.returnType)}`,
        stmt.position,
      )
    } else if (!isAssignable(fn.returnType, valueType)) {
      this.report(
        SemanticErrorCode.RETURN_TYPE_MISMATCH,
        `La función '${fn.name}' retorna ${formatType(fn.returnType)}, pero se intentó retornar ${formatType(valueType)}`,
        stmt.argument?.position ?? stmt.position,
      )
    }
  }

  private checkCondition(condition: Expression, construct: 'if' | 'while'): void {
    const type = this.checkValue(condition)
    if (type !== 'bool' && type !== 'error') {
      this.report(
        SemanticErrorCode.INVALID_CONDITION,
        `La condición de '${construct}' debe ser de tipo bool, pero es ${formatType(type)}`,
        condition.position,
      )
    }
  }

  // ═══════════════════════════ Expresiones ══════════════════════════

  /** Como `checkExpression`, pero exige que la expresión produzca un valor (no void). */
  private checkValue(expr: Expression, expected?: ValueType): CheckedType {
    const type = this.checkExpression(expr, expected)
    if (type === 'void') {
      this.report(
        SemanticErrorCode.VOID_VALUE,
        'Una función sin tipo de retorno no produce un valor utilizable',
        expr.position,
      )
      return 'error'
    }
    return type
  }

  private checkExpression(expr: Expression, expected?: ValueType): CheckedType {
    const type = this.computeType(expr, expected)
    this.expressionTypes.set(expr, type)
    return type
  }

  private computeType(expr: Expression, expected?: ValueType): CheckedType {
    switch (expr.kind) {
      case 'LiteralExpression':
        return expr.literalType

      case 'IdentifierExpression':
        return this.checkIdentifier(expr)

      case 'BinaryExpression': {
        const left = this.checkValue(expr.left)
        const right = this.checkValue(expr.right)
        if (left === 'error' || right === 'error') return 'error'
        const typing = binaryTyping(expr.operator, left, right)
        if (!typing) {
          this.report(
            SemanticErrorCode.INVALID_OPERAND_TYPES,
            `El operador '${expr.operator}' no se puede aplicar a ${formatType(left)} y ${formatType(right)}`,
            expr.position,
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
            SemanticErrorCode.INVALID_OPERAND_TYPES,
            `El operador unario '${expr.operator}' no se puede aplicar a ${formatType(operand)}`,
            expr.position,
          )
          return 'error'
        }
        return result
      }

      case 'CallExpression':
        return this.checkCall(expr)

      case 'AssignmentExpression':
        return this.checkAssignment(expr)

      case 'ArrayExpression':
        return this.checkArrayLiteral(expr, expected)

      case 'IndexExpression':
        return this.checkIndex(expr)
    }
  }

  private checkIdentifier(expr: IdentifierExpression): CheckedType {
    const symbol = this.table.lookup(expr.name)
    if (!symbol) {
      this.report(
        SemanticErrorCode.UNDECLARED_IDENTIFIER,
        `La variable '${expr.name}' no ha sido declarada`,
        expr.position,
      )
      return 'error'
    }
    if (symbol.kind === 'function') {
      this.report(
        SemanticErrorCode.FUNCTION_AS_VALUE,
        `'${expr.name}' es una función y debe llamarse con ()`,
        expr.position,
      )
      return 'error'
    }
    this.resolutions.set(expr, symbol)
    return this.typeOfVariable(symbol)
  }

  /**
   * `destino = valor`. Se revisa primero el destino y después el valor
   * (el mismo orden de evaluación que sigue el IR). El tipo de la expresión
   * es el del destino, por eso `a = b = 1` funciona.
   */
  private checkAssignment(expr: AssignmentExpression): CheckedType {
    const { target } = expr
    let targetType: CheckedType

    if (target.kind === 'IdentifierExpression') {
      const symbol = this.table.lookup(target.name)
      if (!symbol) {
        this.report(
          SemanticErrorCode.UNDECLARED_IDENTIFIER,
          `La variable '${target.name}' no ha sido declarada`,
          target.position,
        )
        targetType = 'error'
      } else if (symbol.kind === 'function') {
        this.report(
          SemanticErrorCode.INVALID_ASSIGNMENT,
          `No se puede asignar un valor a la función '${target.name}'`,
          target.position,
        )
        targetType = 'error'
      } else {
        this.resolutions.set(target, symbol)
        targetType = this.typeOfVariable(symbol)
        if (!symbol.mutable) {
          this.report(
            SemanticErrorCode.CONST_REASSIGNMENT,
            `No se puede reasignar la constante '${target.name}'`,
            target.position,
          )
        }
      }
      this.expressionTypes.set(target, targetType)
    } else {
      // `a[i] = v`: `const` protege la referencia `a`, no sus elementos.
      targetType = this.checkValue(target)
    }

    const expected = targetType === 'error' || targetType === 'void' ? undefined : targetType
    const valueType = this.checkValue(expr.value, expected)
    if (expected && !isAssignable(expected, valueType)) {
      this.report(
        SemanticErrorCode.TYPE_MISMATCH,
        `No se puede asignar un valor de tipo ${formatType(valueType)} a un destino de tipo ${formatType(expected)}`,
        expr.value.position,
      )
    }
    return targetType
  }

  /**
   * Literal `[e1, e2, ...]`.
   *  - Con tipo esperado `T[]`: cada elemento debe ser asignable a `T`
   *    (así `[]` toma el tipo del contexto y `[1, 2]` sirve como `float[]`).
   *  - Sin contexto: el tipo sale de los elementos (int con float → float).
   *    `[]` sin contexto es un error: no hay de dónde deducir su tipo.
   */
  private checkArrayLiteral(expr: ArrayExpression, expected?: ValueType): CheckedType {
    if (expected && isArray(expected)) {
      const elementType = expected.elementType
      expr.elements.forEach((element, i) => {
        const type = this.checkValue(element, elementType)
        if (!isAssignable(elementType, type)) {
          this.report(
            SemanticErrorCode.TYPE_MISMATCH,
            `El elemento ${i + 1} del arreglo es ${formatType(type)}, pero se esperaba ${formatType(elementType)}`,
            element.position,
          )
        }
      })
      return expected
    }

    if (expr.elements.length === 0) {
      this.report(
        SemanticErrorCode.EMPTY_ARRAY_WITHOUT_TYPE,
        'No se puede deducir el tipo de un arreglo vacío; agrega una anotación de tipo (p. ej. `let a: int[] = [];`)',
        expr.position,
      )
      return 'error'
    }

    let elementType: ValueType | undefined
    let failed = false
    for (const element of expr.elements) {
      const type = this.checkValue(element, elementType)
      if (type === 'error' || type === 'void') {
        failed = true
        continue
      }
      if (!elementType) {
        elementType = type
        continue
      }
      const common = commonType(elementType, type)
      if (!common) {
        this.report(
          SemanticErrorCode.HETEROGENEOUS_ARRAY,
          `Los elementos de un arreglo deben ser del mismo tipo: se mezclan ${formatType(elementType)} y ${formatType(type)}`,
          element.position,
        )
        failed = true
        continue
      }
      elementType = common
    }
    return failed || !elementType ? 'error' : arrayOf(elementType)
  }

  /** `arreglo[indice]`: el objeto debe ser un arreglo y el índice un int. */
  private checkIndex(expr: IndexExpression): CheckedType {
    const objectType = this.checkValue(expr.object)
    const indexType = this.checkValue(expr.index)

    if (indexType !== 'int' && indexType !== 'error') {
      this.report(
        SemanticErrorCode.INVALID_INDEX_TYPE,
        `El índice de un arreglo debe ser int, pero es ${formatType(indexType)}`,
        expr.index.position,
      )
    }
    if (objectType === 'error') return 'error'
    if (!isArray(objectType)) {
      this.report(
        SemanticErrorCode.NOT_AN_ARRAY,
        `Solo se pueden indexar arreglos, pero la expresión es de tipo ${formatType(objectType)}`,
        expr.object.position,
      )
      return 'error'
    }
    return objectType.elementType
  }

  private checkCall(call: CallExpression): CheckedType {
    const name = call.callee.name
    const symbol = this.table.lookup(name)
    const fn = symbol?.kind === 'function' ? symbol : undefined

    // Los argumentos se revisan siempre, para reportar también sus errores.
    const argTypes = call.args.map((arg, i) => this.checkValue(arg, fn?.params[i]?.type))

    if (!symbol) {
      this.report(SemanticErrorCode.UNDEFINED_FUNCTION, `La función '${name}' no existe`, call.callee.position)
      return 'error'
    }
    if (!fn) {
      this.report(SemanticErrorCode.NOT_A_FUNCTION, `'${name}' no es una función`, call.callee.position)
      return 'error'
    }
    this.resolutions.set(call.callee, fn)
    this.resolutions.set(call, fn)

    if (argTypes.length !== fn.params.length) {
      this.report(
        SemanticErrorCode.ARGUMENT_COUNT_MISMATCH,
        `La función '${name}' espera ${fn.params.length} argumento(s), pero recibió ${argTypes.length}`,
        call.position,
      )
    } else {
      fn.params.forEach((param, i) => {
        if (!isAssignable(param.type, argTypes[i])) {
          this.report(
            SemanticErrorCode.TYPE_MISMATCH,
            `Argumento ${i + 1} de '${name}': se esperaba ${formatType(param.type)} ('${param.name}'), pero se recibió ${formatType(argTypes[i])}`,
            call.args[i].position,
          )
        }
      })
    }
    return fn.returnType
  }

  // ════════════════════════════ Utilidades ══════════════════════════

  private typeOfVariable(symbol: VariableSymbol): CheckedType {
    return this.untypedSymbols.has(symbol) ? 'error' : symbol.type
  }

  private reportDuplicate(name: string, existing: SemanticSymbol, position?: SourcePosition): void {
    const previous = existing.position ? ` (declarado antes en la línea ${existing.position.line})` : ''
    this.report(
      SemanticErrorCode.DUPLICATE_DECLARATION,
      `'${name}' ya está declarado en este scope${previous}`,
      position,
    )
  }

  private report(code: SemanticErrorCode, message: string, position?: SourcePosition): void {
    this.errors.push(semanticError(code, message, position))
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
    case 'BlockStatement':
      return alwaysReturns(stmt.body)
    case 'IfStatement':
      return (
        stmt.alternate !== null &&
        alwaysReturns(stmt.consequent.body) &&
        statementAlwaysReturns(stmt.alternate)
      )
    default:
      return false
  }
}
