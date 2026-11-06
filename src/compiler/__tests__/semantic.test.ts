import { describe, expect, it } from 'vitest'
import type { Program } from '../semantic/ast-contract'
import { analyze } from '../semantic/type-checker'
import {
  assign,
  bin,
  block,
  bool,
  call,
  cast,
  constVar,
  exprS,
  float,
  fn,
  id,
  ifS,
  int,
  letVar,
  print,
  program,
  ret,
  str,
  un,
  whileS,
} from './ast-builders'

const codes = (p: Program) => analyze(p).errors.map((e) => e.code)

describe('Análisis semántico — programas válidos', () => {
  it('acepta declaraciones con tipo explícito e inferido', () => {
    const result = analyze(
      program(
        letVar('a', 'int', int(1)),
        letVar('b', undefined, float(2.5)),
        constVar('NOMBRE', 'string', str('Ana')),
        letVar('ok', 'bool'),
        print(id('NOMBRE')),
      ),
    )
    expect(result.errors).toEqual([])
    expect(result.symbolTable.lookup('b')).toMatchObject({ type: 'float' })
  })

  it('acepta scopes anidados con shadowing', () => {
    const p = program(
      letVar('x', 'int', int(1)),
      block(letVar('x', 'string', str('interno')), print(id('x')), block(letVar('x', 'bool', bool(true)))),
      print(id('x')),
    )
    expect(codes(p)).toEqual([])
  })

  it('permite int → float implícito pero no al revés', () => {
    expect(codes(program(letVar('f', 'float', int(3))))).toEqual([])
    expect(codes(program(letVar('i', 'int', float(3.5))))).toEqual(['TYPE_MISMATCH'])
  })

  it('acepta funciones, recursión y llamadas antes de la declaración (hoisting)', () => {
    const p = program(
      print(call('fact', int(5))),
      fn('fact', [['n', 'int']], 'int', [
        ifS(bin('<=', id('n'), int(1)), [ret(int(1))]),
        ret(bin('*', id('n'), call('fact', bin('-', id('n'), int(1))))),
      ]),
    )
    expect(codes(p)).toEqual([])
  })

  it('acepta funciones void sin return y return vacío', () => {
    const p = program(
      fn('saluda', [['n', 'string']], 'void', [print(bin('+', str('Hola '), id('n')))]),
      fn('nada', [], 'void', [ret()]),
      exprS(call('saluda', str('Ana'))),
    )
    expect(codes(p)).toEqual([])
  })

  it('acepta un if/else donde ambas ramas retornan', () => {
    const p = program(
      fn('max', [['a', 'int'], ['b', 'int']], 'int', [
        ifS(bin('>', id('a'), id('b')), [ret(id('a'))], [ret(id('b'))]),
      ]),
    )
    expect(codes(p)).toEqual([])
  })

  it('acepta expresiones lógicas, comparaciones y conversiones explícitas', () => {
    const p = program(
      letVar('a', 'int', int(3)),
      letVar('b', 'bool', bin('&&', bin('<', id('a'), float(4.5)), un('!', bool(false)))),
      letVar('s', 'string', bin('+', str('a='), cast('string', id('a')))),
      letVar('i', 'int', cast('int', float(9.9))),
      whileS(bin('!=', id('s'), str('')), [assign('s', str(''))]),
    )
    expect(codes(p)).toEqual([])
  })
})

describe('Análisis semántico — errores', () => {
  it('variable no declarada', () => {
    expect(codes(program(print(id('fantasma'))))).toEqual(['UNDECLARED_IDENTIFIER'])
    expect(codes(program(assign('y', int(1))))).toEqual(['UNDECLARED_IDENTIFIER'])
  })

  it('variable fuera de su scope', () => {
    expect(codes(program(block(letVar('x', 'int', int(1))), print(id('x'))))).toEqual([
      'UNDECLARED_IDENTIFIER',
    ])
  })

  it('declaración duplicada en el mismo scope (incluye parámetros y funciones)', () => {
    expect(codes(program(letVar('x', 'int', int(1)), letVar('x', 'int', int(2))))).toEqual([
      'DUPLICATE_DECLARATION',
    ])
    expect(codes(program(fn('f', [['a', 'int']], 'void', [letVar('a', 'int', int(1))])))).toEqual([
      'DUPLICATE_DECLARATION',
    ])
    expect(codes(program(fn('f', [], 'void', []), fn('f', [], 'void', [])))).toEqual([
      'DUPLICATE_DECLARATION',
    ])
  })

  it('una variable no puede usarse en su propio inicializador', () => {
    expect(codes(program(letVar('x', 'int', bin('+', id('x'), int(1)))))).toEqual([
      'UNDECLARED_IDENTIFIER',
    ])
  })

  it('constantes: reasignación y falta de inicializador', () => {
    expect(codes(program(constVar('K', 'int', int(1)), assign('K', int(2))))).toEqual([
      'CONST_REASSIGNMENT',
    ])
    expect(codes(program(constVar('K', 'int')))).toEqual(['CONST_WITHOUT_INITIALIZER'])
  })

  it('variable sin tipo ni inicializador, y variables void', () => {
    expect(codes(program(letVar('x')))).toEqual(['MISSING_TYPE'])
    expect(codes(program(letVar('x', 'void')))).toEqual(['INVALID_VOID_VARIABLE'])
  })

  it('asignaciones con tipo incompatible', () => {
    expect(codes(program(letVar('x', 'int', int(1)), assign('x', str('hola'))))).toEqual(['TYPE_MISMATCH'])
    expect(codes(program(letVar('s', 'string', bool(true))))).toEqual(['TYPE_MISMATCH'])
  })

  it('asignar a una función', () => {
    expect(codes(program(fn('f', [], 'void', []), assign('f', int(1))))).toEqual(['INVALID_ASSIGNMENT'])
  })

  it('operaciones entre tipos incompatibles', () => {
    expect(codes(program(print(bin('+', int(1), str('a')))))).toEqual(['INVALID_OPERAND_TYPES'])
    expect(codes(program(print(bin('-', str('a'), str('b')))))).toEqual(['INVALID_OPERAND_TYPES'])
    expect(codes(program(print(bin('%', float(1), int(2)))))).toEqual(['INVALID_OPERAND_TYPES'])
    expect(codes(program(print(bin('&&', int(1), bool(true)))))).toEqual(['INVALID_OPERAND_TYPES'])
    expect(codes(program(print(bin('<', str('a'), str('b')))))).toEqual(['INVALID_OPERAND_TYPES'])
    expect(codes(program(print(bin('==', int(1), bool(true)))))).toEqual(['INVALID_OPERAND_TYPES'])
    expect(codes(program(print(un('!', int(1)))))).toEqual(['INVALID_OPERAND_TYPES'])
    expect(codes(program(print(un('-', str('a')))))).toEqual(['INVALID_OPERAND_TYPES'])
  })

  it('no reporta errores en cascada a partir de una expresión inválida', () => {
    // (1 + "a") * 2 → un solo error, no dos
    expect(codes(program(print(bin('*', bin('+', int(1), str('a')), int(2)))))).toEqual([
      'INVALID_OPERAND_TYPES',
    ])
  })

  it('condiciones de if y while deben ser bool', () => {
    expect(codes(program(ifS(int(1), [])))).toEqual(['INVALID_CONDITION'])
    expect(codes(program(whileS(str('sí'), [])))).toEqual(['INVALID_CONDITION'])
  })

  it('llamadas a funciones inexistentes o a algo que no es función', () => {
    expect(codes(program(exprS(call('noExiste'))))).toEqual(['UNDEFINED_FUNCTION'])
    expect(codes(program(letVar('x', 'int', int(1)), exprS(call('x'))))).toEqual(['NOT_A_FUNCTION'])
    expect(codes(program(fn('f', [], 'int', [ret(int(1))]), print(id('f'))))).toEqual(['FUNCTION_AS_VALUE'])
  })

  it('número y tipo de argumentos', () => {
    const suma = fn('suma', [['a', 'int'], ['b', 'int']], 'int', [ret(bin('+', id('a'), id('b')))])
    expect(codes(program(suma, print(call('suma', int(1)))))).toEqual(['ARGUMENT_COUNT_MISMATCH'])
    expect(codes(program(suma, print(call('suma', int(1), str('2')))))).toEqual(['TYPE_MISMATCH'])
  })

  it('uso incorrecto de return', () => {
    expect(codes(program(ret(int(1))))).toEqual(['RETURN_OUTSIDE_FUNCTION'])
    expect(codes(program(fn('f', [], 'void', [ret(int(1))])))).toEqual(['RETURN_TYPE_MISMATCH'])
    expect(codes(program(fn('f', [], 'int', [ret()])))).toEqual(['RETURN_TYPE_MISMATCH'])
    expect(codes(program(fn('f', [], 'int', [ret(str('x'))])))).toEqual(['RETURN_TYPE_MISMATCH'])
  })

  it('funciones no-void que no retornan en todos los caminos', () => {
    expect(codes(program(fn('f', [], 'int', [])))).toEqual(['MISSING_RETURN'])
    expect(codes(program(fn('f', [['a', 'bool']], 'int', [ifS(id('a'), [ret(int(1))])])))).toEqual([
      'MISSING_RETURN',
    ])
    expect(codes(program(fn('f', [], 'int', [whileS(bool(true), [ret(int(1))])])))).toEqual([
      'MISSING_RETURN',
    ])
  })

  it('usar el resultado de una función void como valor', () => {
    const p = program(fn('v', [], 'void', []), letVar('x', 'int', call('v')))
    expect(codes(p)).toEqual(['VOID_VALUE'])
  })

  it('funciones anidadas no están permitidas', () => {
    expect(codes(program(fn('f', [], 'void', [fn('g', [], 'void', [])])))).toEqual(['NESTED_FUNCTION'])
  })

  it('conversiones explícitas no soportadas', () => {
    expect(codes(program(print(cast('int', str('12')))))).toEqual(['INVALID_CAST'])
    expect(codes(program(print(cast('int', bool(true)))))).toEqual(['INVALID_CAST'])
  })

  it('acumula varios errores con su ubicación', () => {
    const p = program(
      { kind: 'PrintStatement', argument: { kind: 'Identifier', name: 'a', loc: { line: 1, column: 7 } } },
      { kind: 'ReturnStatement', loc: { line: 2, column: 1 } },
    )
    const { errors, ok } = analyze(p)
    expect(ok).toBe(false)
    expect(errors).toEqual([
      expect.objectContaining({ code: 'UNDECLARED_IDENTIFIER', loc: { line: 1, column: 7 } }),
      expect.objectContaining({ code: 'RETURN_OUTSIDE_FUNCTION', loc: { line: 2, column: 1 } }),
    ])
  })
})
