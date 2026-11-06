import { describe, expect, it } from 'vitest'
import { SymbolTable } from '../semantic/symbol-table'

describe('Scope y SymbolTable', () => {
  it('declara y encuentra una variable en el scope global', () => {
    const table = new SymbolTable()
    const r = table.declareVariable('x', 'variable', 'int')
    expect(r.ok).toBe(true)
    expect(table.lookup('x')).toMatchObject({ name: 'x', type: 'int', kind: 'variable', storage: 'global' })
  })

  it('detecta duplicados en el mismo scope', () => {
    const table = new SymbolTable()
    table.declareVariable('x', 'variable', 'int')
    const r = table.declareVariable('x', 'variable', 'float')
    expect(r.ok).toBe(false)
  })

  it('permite el mismo nombre en un scope hijo (shadowing) y lo resuelve al más cercano', () => {
    const table = new SymbolTable()
    table.declareVariable('x', 'variable', 'int')
    table.enterScope('block', 'block')
    expect(table.declareVariable('x', 'variable', 'string').ok).toBe(true)
    expect(table.lookup('x')).toMatchObject({ type: 'string', irName: 'x$1' })
    table.exitScope()
    expect(table.lookup('x')).toMatchObject({ type: 'int', irName: 'x' })
  })

  it('busca en los scopes padres', () => {
    const table = new SymbolTable()
    table.declareVariable('g', 'variable', 'bool')
    table.enterScope('block', 'b1')
    table.enterScope('block', 'b2')
    expect(table.lookup('g')?.name).toBe('g')
    expect(table.current.lookupLocal('g')).toBeUndefined()
    expect(table.current.depth).toBe(2)
  })

  it('las variables de un scope cerrado ya no son visibles', () => {
    const table = new SymbolTable()
    table.enterScope('block', 'b')
    table.declareVariable('tmp', 'variable', 'int')
    table.exitScope()
    expect(table.lookup('tmp')).toBeUndefined()
  })

  it('parámetros y locales de funciones son almacenamiento local y conocen su función', () => {
    const table = new SymbolTable()
    const f = table.declareFunction('f', [{ name: 'a', type: 'int' }], 'int')
    if (!f.ok) throw new Error('no debería fallar')
    table.enterScope('function', 'f', f.symbol)
    const a = table.declareVariable('a', 'parameter', 'int')
    expect(a.ok && a.symbol.storage).toBe('local')
    expect(a.ok && a.symbol.mutable).toBe(true)
    expect(table.currentFunction()?.name).toBe('f')
    table.enterScope('block', 'b')
    expect(table.currentFunction()?.name).toBe('f')
  })

  it('las constantes son inmutables', () => {
    const table = new SymbolTable()
    const c = table.declareVariable('PI', 'constant', 'float')
    expect(c.ok && c.symbol.mutable).toBe(false)
  })

  it('no permite salir del scope global', () => {
    expect(() => new SymbolTable().exitScope()).toThrow()
  })

  it('dump muestra el árbol de scopes', () => {
    const table = new SymbolTable()
    table.declareVariable('x', 'variable', 'int')
    expect(table.dump()).toContain('variable x: int [global x]')
  })
})
