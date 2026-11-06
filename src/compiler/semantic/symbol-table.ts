import type { SourceLocation, TypeName } from './ast-contract'
import { Scope, type ScopeKind } from './scope'

/**
 * TABLA DE SÍMBOLOS
 * ============================================================================
 * Guarda TODO lo que se sabe de cada nombre declarado en el programa y
 * administra la pila de scopes durante el recorrido del AST.
 *
 * Además asigna a cada variable un `irName` único dentro de su zona de
 * almacenamiento (global o la función que la contiene). Así, en el IR dos
 * variables `x` en scopes distintos (shadowing) no se pisan:
 *
 *   let x = 1;      → irName "x"
 *   { let x = 2; }  → irName "x$1"
 */

/** Tipos que puede tener un valor (todo menos `void`). */
export type ValueType = Exclude<TypeName, 'void'>

export type SymbolKind = 'variable' | 'constant' | 'parameter' | 'function'

/** Dónde vive la variable en tiempo de ejecución. */
export type StorageClass = 'global' | 'local'

interface BaseSymbol {
  /** Identificador único en todo el programa. */
  id: number
  name: string
  kind: SymbolKind
  /** Scope donde fue declarado. */
  scope: Scope
  /** ¿Se puede reasignar? (`let` y parámetros sí; `const` y funciones no). */
  mutable: boolean
  loc?: SourceLocation
}

export interface VariableSymbol extends BaseSymbol {
  kind: 'variable' | 'constant' | 'parameter'
  type: ValueType
  storage: StorageClass
  /** Nombre único usado en el IR (ver comentario del módulo). */
  irName: string
}

export interface ParameterInfo {
  name: string
  type: ValueType
}

export interface FunctionSymbol extends BaseSymbol {
  kind: 'function'
  params: ParameterInfo[]
  returnType: TypeName
  mutable: false
}

export type SemanticSymbol = VariableSymbol | FunctionSymbol

export type DeclareResult<T extends SemanticSymbol> =
  | { ok: true; symbol: T }
  | { ok: false; existing: SemanticSymbol }

export class SymbolTable {
  readonly global: Scope
  private currentScope: Scope
  private nextId = 1
  /** Contador de nombres por zona de almacenamiento (global o función) para generar irName. */
  private readonly nameCounters = new Map<Scope, Map<string, number>>()

  constructor() {
    this.global = new Scope('global', 'global', null)
    this.currentScope = this.global
  }

  get current(): Scope {
    return this.currentScope
  }

  // ───────────────────────── Manejo de scopes ─────────────────────────

  enterScope(kind: Exclude<ScopeKind, 'global'>, name: string, owner?: FunctionSymbol): Scope {
    this.currentScope = new Scope(kind, name, this.currentScope, owner ?? null)
    return this.currentScope
  }

  exitScope(): void {
    if (!this.currentScope.parent) {
      throw new Error('SymbolTable: no se puede salir del scope global')
    }
    this.currentScope = this.currentScope.parent
  }

  /** Función que se está analizando actualmente, o `null` en código global. */
  currentFunction(): FunctionSymbol | null {
    return this.currentScope.enclosingFunctionScope()?.owner ?? null
  }

  // ─────────────────────────── Declaraciones ──────────────────────────

  declareVariable(
    name: string,
    kind: VariableSymbol['kind'],
    type: ValueType,
    loc?: SourceLocation,
  ): DeclareResult<VariableSymbol> {
    const existing = this.currentScope.lookupLocal(name)
    if (existing) return { ok: false, existing }

    const area = this.currentScope.enclosingFunctionScope() ?? this.global
    const symbol: VariableSymbol = {
      id: this.nextId++,
      name,
      kind,
      type,
      scope: this.currentScope,
      mutable: kind !== 'constant',
      storage: area === this.global ? 'global' : 'local',
      irName: this.uniqueIrName(area, name),
      loc,
    }
    this.currentScope.declare(symbol)
    return { ok: true, symbol }
  }

  declareFunction(
    name: string,
    params: ParameterInfo[],
    returnType: TypeName,
    loc?: SourceLocation,
  ): DeclareResult<FunctionSymbol> {
    const existing = this.currentScope.lookupLocal(name)
    if (existing) return { ok: false, existing }

    const symbol: FunctionSymbol = {
      id: this.nextId++,
      name,
      kind: 'function',
      params,
      returnType,
      scope: this.currentScope,
      mutable: false,
      loc,
    }
    this.currentScope.declare(symbol)
    return { ok: true, symbol }
  }

  // ───────────────────────────── Búsqueda ─────────────────────────────

  /** Busca desde el scope actual hacia el global (ver `Scope.lookup`). */
  lookup(name: string): SemanticSymbol | undefined {
    return this.currentScope.lookup(name)
  }

  // ───────────────────────────── Utilidades ───────────────────────────

  private uniqueIrName(area: Scope, name: string): string {
    let counters = this.nameCounters.get(area)
    if (!counters) {
      counters = new Map()
      this.nameCounters.set(area, counters)
    }
    const count = counters.get(name) ?? 0
    counters.set(name, count + 1)
    // `$` no es válido en identificadores del lenguaje → no hay colisiones.
    return count === 0 ? name : `${name}$${count}`
  }

  /** Representación textual del árbol de scopes (útil para depurar / UI). */
  dump(): string {
    const lines: string[] = []
    const visit = (scope: Scope): void => {
      const indent = '  '.repeat(scope.depth)
      lines.push(`${indent}scope ${scope.kind} "${scope.name}"`)
      for (const s of scope.symbols.values()) {
        const detail =
          s.kind === 'function'
            ? `(${s.params.map((p) => `${p.name}: ${p.type}`).join(', ')}): ${s.returnType}`
            : `: ${s.type} [${s.storage} ${s.irName}${s.mutable ? '' : ', inmutable'}]`
        lines.push(`${indent}  ${s.kind} ${s.name}${detail}`)
      }
      scope.children.forEach(visit)
    }
    visit(this.global)
    return lines.join('\n')
  }
}
