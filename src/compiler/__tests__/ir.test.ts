import { describe, expect, it } from 'vitest'
import type { Program } from '../semantic/ast-contract'
import { analyze } from '../semantic/type-checker'
import { compileToIR, formatIR, generateIR, type IRProgram } from '../ir'
import {
  assign,
  bin,
  block,
  bool,
  call,
  cast,
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
import { runIR } from './reference-interpreter'

function compile(p: Program): IRProgram {
  const result = compileToIR(p)
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'))
  return result.ir
}

const textOf = (p: Program) => formatIR(compile(p))
const run = (p: Program) => runIR(compile(p))

describe('IR — expresiones y temporales', () => {
  it('genera código de tres direcciones con temporales para el ejemplo de la guía', () => {
    // print(5 + 10)
    const ir = compile(program(print(bin('+', int(5), int(10)))))
    expect(ir.main).toEqual([
      {
        op: 'BINARY',
        operator: '+',
        operandType: 'int',
        dest: { kind: 'temp', name: 't1', type: 'int' },
        left: { kind: 'const', type: 'int', value: 5 },
        right: { kind: 'const', type: 'int', value: 10 },
      },
      { op: 'PRINT', value: { kind: 'temp', name: 't1', type: 'int' } },
    ])
    expect(formatIR(ir)).toBe('MAIN\n  t1 = 5 + 10\n  PRINT t1\nEND')
  })

  it('respeta la precedencia ya codificada en el AST y numera temporales en orden', () => {
    // let r = (a + b) * (a - b)
    const p = program(
      letVar('a', 'int', int(7)),
      letVar('b', 'int', int(3)),
      letVar('r', 'int', bin('*', bin('+', id('a'), id('b')), bin('-', id('a'), id('b')))),
      print(id('r')),
    )
    expect(textOf(p)).toBe(
      ['MAIN', '  a = 7', '  b = 3', '  t1 = a + b', '  t2 = a - b', '  t3 = t1 * t2', '  r = t3', '  PRINT r', 'END'].join(
        '\n',
      ),
    )
    expect(run(p)).toEqual(['40'])
  })

  it('inserta CAST para la conversión implícita int → float', () => {
    const p = program(letVar('f', 'float', int(2)), print(bin('/', id('f'), int(4))))
    const ir = compile(p)
    expect(formatIR(ir)).toContain('t1 = (float) 2')
    expect(formatIR(ir)).toContain('t2 = (float) 4')
    expect(ir.main.find((i) => i.op === 'BINARY')).toMatchObject({ operandType: 'float', dest: { type: 'float' } })
    expect(run(p)).toEqual(['0.5'])
  })

  it('división entera, módulo, unarios, concatenación y casts explícitos', () => {
    const p = program(
      print(bin('/', int(7), int(2))),
      print(bin('%', int(7), int(2))),
      print(un('-', int(4))),
      print(un('!', bool(true))),
      print(bin('+', str('n='), cast('string', int(3)))),
      print(cast('int', float(9.9))),
    )
    expect(run(p)).toEqual(['3', '1', '-4', 'false', 'n=3', '9'])
  })

  it('declaraciones sin inicializador reciben el valor por defecto', () => {
    const p = program(letVar('i', 'int'), letVar('s', 'string'), letVar('b', 'bool'), print(id('i')), print(id('b')))
    expect(textOf(p)).toContain('s = ""')
    expect(run(p)).toEqual(['0', 'false'])
  })

  it('las variables con shadowing reciben nombres distintos', () => {
    const p = program(
      letVar('x', 'int', int(1)),
      block(letVar('x', 'int', int(2)), print(id('x'))),
      print(id('x')),
    )
    const ir = compile(p)
    expect(ir.globals.map((g) => g.name)).toEqual(['x', 'x$1'])
    expect(run(p)).toEqual(['2', '1'])
  })
})

describe('IR — control de flujo', () => {
  it('if sin else: un salto condicional y una etiqueta', () => {
    const p = program(letVar('a', 'int', int(5)), ifS(bin('>', id('a'), int(3)), [print(str('mayor'))]))
    expect(textOf(p)).toBe(
      ['MAIN', '  a = 5', '  t1 = a > 3', '  IF_FALSE t1 GOTO L1', '  PRINT "mayor"', 'L1:', 'END'].join('\n'),
    )
    expect(run(p)).toEqual(['mayor'])
  })

  it('if / else if / else', () => {
    const clasifica = (n: number) =>
      program(
        letVar('n', 'int', int(n)),
        ifS(
          bin('<', id('n'), int(0)),
          [print(str('negativo'))],
          ifS(bin('==', id('n'), int(0)), [print(str('cero'))], [print(str('positivo'))]),
        ),
      )
    expect(run(clasifica(-1))).toEqual(['negativo'])
    expect(run(clasifica(0))).toEqual(['cero'])
    expect(run(clasifica(9))).toEqual(['positivo'])

    const text = textOf(clasifica(1))
    expect(text).toContain('IF_FALSE t1 GOTO L2')
    expect(text).toContain('GOTO L1')
  })

  it('while: etiqueta de inicio, salto condicional de salida y salto hacia atrás', () => {
    const p = program(
      letVar('i', 'int', int(0)),
      whileS(bin('<', id('i'), int(3)), [print(id('i')), assign('i', bin('+', id('i'), int(1)))]),
    )
    expect(textOf(p)).toBe(
      [
        'MAIN',
        '  i = 0',
        'L1:',
        '  t1 = i < 3',
        '  IF_FALSE t1 GOTO L2',
        '  PRINT i',
        '  t2 = i + 1',
        '  i = t2',
        '  GOTO L1',
        'L2:',
        'END',
      ].join('\n'),
    )
    expect(run(p)).toEqual(['0', '1', '2'])
  })

  it('&& y || se evalúan en cortocircuito', () => {
    // false && f()  → f no debe ejecutarse;  true || f() → tampoco
    const p = program(
      fn('f', [], 'bool', [print(str('f llamada')), ret(bool(true))]),
      print(bin('&&', bool(false), call('f'))),
      print(bin('||', bool(true), call('f'))),
      print(bin('&&', bool(true), call('f'))),
    )
    expect(run(p)).toEqual(['false', 'true', 'f llamada', 'true'])
    expect(textOf(p)).toContain('IF_FALSE t1 GOTO L1')
    expect(textOf(p)).toContain('IF_TRUE t3 GOTO L2')
  })
})

describe('IR — funciones y llamadas', () => {
  it('genera PARAM, CALL y RETURN con la convención acordada', () => {
    const p = program(
      fn('suma', [['a', 'int'], ['b', 'int']], 'int', [ret(bin('+', id('a'), id('b')))]),
      print(call('suma', int(2), int(3))),
    )
    const ir = compile(p)
    expect(ir.functions[0]).toMatchObject({
      name: 'suma',
      params: [
        { name: 'a', type: 'int' },
        { name: 'b', type: 'int' },
      ],
      returnType: 'int',
    })
    expect(ir.functions[0].body[0]).toMatchObject({
      op: 'BINARY',
      left: { kind: 'var', name: 'a', scope: 'local' },
    })
    expect(formatIR(ir)).toBe(
      [
        'FUNCTION suma(a: int, b: int): int',
        '  t1 = a + b',
        '  RETURN t1',
        'END',
        '',
        'MAIN',
        '  PARAM 2',
        '  PARAM 3',
        '  t2 = CALL suma, 2',
        '  PRINT t2',
        'END',
      ].join('\n'),
    )
    expect(runIR(ir)).toEqual(['5'])
  })

  it('evalúa todos los argumentos antes de emitir los PARAM (llamadas anidadas)', () => {
    const p = program(
      fn('suma', [['a', 'int'], ['b', 'int']], 'int', [ret(bin('+', id('a'), id('b')))]),
      print(call('suma', call('suma', int(1), int(2)), call('suma', int(3), int(4)))),
    )
    const ops = compile(p).main.map((i) => i.op)
    expect(ops).toEqual(['PARAM', 'PARAM', 'CALL', 'PARAM', 'PARAM', 'CALL', 'PARAM', 'PARAM', 'CALL', 'PRINT'])
    expect(run(p)).toEqual(['10'])
  })

  it('recursión: factorial y fibonacci', () => {
    const p = program(
      fn('fact', [['n', 'int']], 'int', [
        ifS(bin('<=', id('n'), int(1)), [ret(int(1))]),
        ret(bin('*', id('n'), call('fact', bin('-', id('n'), int(1))))),
      ]),
      fn('fib', [['n', 'int']], 'int', [
        ifS(
          bin('<', id('n'), int(2)),
          [ret(id('n'))],
          [ret(bin('+', call('fib', bin('-', id('n'), int(1))), call('fib', bin('-', id('n'), int(2)))))],
        ),
      ]),
      print(call('fact', int(5))),
      print(call('fib', int(10))),
    )
    expect(run(p)).toEqual(['120', '55'])
  })

  it('funciones void: RETURN implícito y CALL sin destino', () => {
    const p = program(
      fn('saluda', [['nombre', 'string']], 'void', [print(bin('+', str('Hola, '), id('nombre')))]),
      exprS(call('saluda', str('Juan'))),
    )
    const ir = compile(p)
    expect(ir.functions[0].body.at(-1)).toEqual({ op: 'RETURN', value: null })
    expect(ir.main.at(-1)).toEqual({ op: 'CALL', func: 'saluda', argCount: 1, dest: null })
    expect(runIR(ir)).toEqual(['Hola, Juan'])
  })

  it('convierte argumentos y retornos int → float', () => {
    const p = program(
      fn('mitad', [['x', 'float']], 'float', [ret(bin('/', id('x'), int(2)))]),
      fn('uno', [], 'float', [ret(int(1))]),
      print(call('mitad', int(5))),
      print(call('uno')),
    )
    const text = textOf(p)
    expect(text).toContain('RETURN t')
    expect(text).toMatch(/t\d+ = \(float\) 5\n {2}PARAM t\d+/)
    expect(run(p)).toEqual(['2.5', '1'])
  })

  it('las funciones distinguen locales de globales', () => {
    const p = program(
      letVar('contador', 'int', int(0)),
      fn('incrementa', [], 'void', [
        letVar('paso', 'int', int(2)),
        assign('contador', bin('+', id('contador'), id('paso'))),
      ]),
      exprS(call('incrementa')),
      exprS(call('incrementa')),
      print(id('contador')),
    )
    const ir = compile(p)
    expect(ir.globals).toEqual([{ name: 'contador', type: 'int' }])
    expect(ir.functions[0].locals).toEqual([{ name: 'paso', type: 'int' }])
    expect(ir.functions[0].body).toContainEqual({
      op: 'ASSIGN',
      dest: { kind: 'var', name: 'contador', scope: 'global', type: 'int' },
      src: { kind: 'temp', name: 't1', type: 'int' },
    })
    expect(runIR(ir)).toEqual(['4'])
  })
})

describe('IR — ejemplo documentado en ir/README.md', () => {
  it('genera exactamente el IR del README', () => {
    const p = program(
      fn('suma', [['a', 'int'], ['b', 'int']], 'int', [ret(bin('+', id('a'), id('b')))]),
      letVar('i', 'int', int(0)),
      whileS(bin('<', id('i'), int(3)), [
        print(call('suma', id('i'), int(10))),
        assign('i', bin('+', id('i'), int(1))),
      ]),
    )
    expect(textOf(p)).toBe(
      [
        'FUNCTION suma(a: int, b: int): int',
        '  t1 = a + b',
        '  RETURN t1',
        'END',
        '',
        'MAIN',
        '  i = 0',
        'L1:',
        '  t2 = i < 3',
        '  IF_FALSE t2 GOTO L2',
        '  PARAM i',
        '  PARAM 10',
        '  t3 = CALL suma, 2',
        '  PRINT t3',
        '  t4 = i + 1',
        '  i = t4',
        '  GOTO L1',
        'L2:',
        'END',
      ].join('\n'),
    )
    expect(run(p)).toEqual(['10', '11', '12'])
  })
})

describe('IR — integración con el análisis semántico', () => {
  it('compileToIR no genera IR si hay errores semánticos', () => {
    const result = compileToIR(program(print(id('nadie'))))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0].code).toBe('UNDECLARED_IDENTIFIER')
  })

  it('generateIR rechaza un SemanticResult con errores', () => {
    const p = program(print(id('nadie')))
    expect(() => generateIR(p, analyze(p))).toThrow()
  })

  it('las instrucciones son objetos tipados y serializables a JSON', () => {
    const ir = compile(program(letVar('x', 'float', float(1.5)), print(id('x'))))
    expect(JSON.parse(JSON.stringify(ir))).toEqual(ir)
    expect(ir.version).toBe('1.0')
  })
})
