import type { FunctionSymbol, SemanticSymbol } from './symbol-table.ts'

/**
 * SISTEMA DE SCOPES (ámbitos léxicos)
 * ============================================================================
 * Un `Scope` es un diccionario nombre → símbolo con un puntero a su padre.
 * Los scopes forman un árbol:
 *
 *   global
 *   ├── function suma        (parámetros + variables del cuerpo)
 *   │   └── block            (if / while / { } anidados)
 *   └── block
 *
 * Búsqueda de identificadores (`lookup`):
 *   1. Se busca el nombre en el scope actual.
 *   2. Si no está, se repite en el padre, y así hasta el global.
 *   3. Si tampoco está en el global → el identificador no está declarado.
 * Por eso gana siempre la declaración MÁS CERCANA (shadowing).
 *
 * Declaración (`declare`): solo mira el scope actual (`lookupLocal`). Así se
 * detectan duplicados en el mismo scope pero se permite repetir el nombre en
 * un scope hijo.
 */
export type ScopeKind = 'global' | 'function' | 'block'

export class Scope {
  readonly kind: ScopeKind
  readonly name: string
  readonly parent: Scope | null
  readonly depth: number
  readonly symbols = new Map<string, SemanticSymbol>()
  readonly children: Scope[] = []
  /** Solo en scopes de función: el símbolo de la función dueña. */
  readonly owner: FunctionSymbol | null

  constructor(
    kind: ScopeKind,
    name: string,
    parent: Scope | null,
    owner: FunctionSymbol | null = null,
  ) {
    this.kind = kind
    this.name = name
    this.parent = parent
    this.owner = owner
    this.depth = parent ? parent.depth + 1 : 0
    parent?.children.push(this)
  }

  /**
   * Registra un símbolo en ESTE scope.
   * @returns `false` si ya existe un símbolo con ese nombre en este mismo scope.
   */
  declare(symbol: SemanticSymbol): boolean {
    if (this.symbols.has(symbol.name)) return false
    this.symbols.set(symbol.name, symbol)
    return true
  }

  /** Busca únicamente en este scope (sin subir a los padres). */
  lookupLocal(name: string): SemanticSymbol | undefined {
    return this.symbols.get(name)
  }

  /** Busca en este scope y luego en la cadena de padres hasta el global. */
  lookup(name: string): SemanticSymbol | undefined {
    return this.symbols.get(name) ?? this.parent?.lookup(name)
  }

  /** Scope de la función que contiene a este scope, o `null` si es código global. */
  enclosingFunctionScope(): Scope | null {
    if (this.kind === 'function') return this
    return this.parent?.enclosingFunctionScope() ?? null
  }

  isGlobal(): boolean {
    return this.kind === 'global'
  }
}
