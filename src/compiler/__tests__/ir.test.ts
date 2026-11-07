import { describe, expect, it } from 'vitest'
import { compileToIR, formatIR, IR_VERSION, OPCODES, type Instruction } from '../ir/index.ts'
import demoSource from '../../../examples/demo.cf?raw'
import { compile, irText, parse, run } from './helpers.ts'

/** Quita `position` para comparar solo la forma de las instrucciones. */
const shape = (body: Instruction[]) =>
  body.map((instruction) => {
    const copy: Partial<Instruction> = { ...instruction }
    delete copy.position
    return copy
  })

describe('IR — contrato general', () => {
  it('declara la versión 2.0 y los opcodes de arreglos', () => {
    expect(IR_VERSION).toBe('2.0')
    expect(compile('print(1);').version).toBe('2.0')
    expect(OPCODES).toEqual(expect.arrayContaining(['ARRAY_ALLOC', 'ARRAY_LOAD', 'ARRAY_STORE']))
  })

  it('no genera IR si hay errores semánticos', () => {
    const result = compileToIR(parse('print(x);'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0].code).toBe('UNDECLARED_IDENTIFIER')
  })

  it('el IR es JSON serializable (la VM no necesita interpretar texto)', () => {
    const ir = compile('let a: int[] = [1, 2]; print(a[0] + 1);')
    expect(JSON.parse(JSON.stringify(ir))).toEqual(ir)
  })

  it('cada instrucción conserva la posición del código fuente', () => {
    const ir = compile('let x: int = 1;\nprint(x / 0);')
    const binary = ir.main.find((i) => i.op === 'BINARY')
    // Jack ubica una BinaryExpression en el token donde empieza (el operando izquierdo).
    expect(binary?.position).toEqual({ line: 2, column: 7 })
    expect(ir.main.every((i) => i.position !== undefined)).toBe(true)
    expect(formatIR(ir, { positions: true })).toContain('t1 = x / 0    ; 2:7')
  })
})

describe('IR — expresiones y temporales', () => {
  it('genera código de tres direcciones con temporales (ejemplo de la guía)', () => {
    const ir = compile('print(5 + 10);')
    expect(shape(ir.main)).toEqual([
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

  it('respeta la precedencia y numera los temporales en orden', () => {
    expect(irText('let a: int = 7; let b: int = 3; let r: int = (a + b) * (a - b);')).toBe(
      ['MAIN', '  a = 7', '  b = 3', '  t1 = a + b', '  t2 = a - b', '  t3 = t1 * t2', '  r = t3', 'END'].join(
        '\n',
      ),
    )
  })

  it('inserta CAST int → float en operaciones mixtas y asignaciones', () => {
    const text = irText('let f: float = 1; let g = f + 2;')
    expect(text).toContain('t1 = (float) 1')
    expect(text).toContain('t2 = (float) 2')
    expect(text).toContain('t3 = f + t2')
    expect(run('let a: int = 7; let f: float = a / 2; print(f); print(7.0 / 2);')).toEqual(['3', '3.5'])
  })

  it('compila && y || con cortocircuito mediante saltos', () => {
    expect(irText('let a = true && false;')).toBe(
      ['MAIN', '  t1 = true', '  IF_FALSE t1 GOTO L1', '  t1 = false', 'L1:', '  a = t1', 'END'].join('\n'),
    )
    expect(irText('let a = false || true;')).toContain('IF_TRUE t1 GOTO L1')
    // El lado derecho no se evalúa si no hace falta: no hay división por cero.
    expect(run('let x: int = 0; print(x != 0 && 10 / x > 1); print(x == 0 || 10 / x > 1);')).toEqual([
      'false',
      'true',
    ])
  })

  it('evalúa unarios, comparaciones, módulo y concatenación', () => {
    expect(run('print(-3 + 1); print(!true); print(7 % 3); print("a" + "b"); print(2 <= 2.5); print(7 / 2);')).toEqual(
      ['-2', 'false', '1', 'ab', 'true', '3'],
    )
  })

  it('la asignación anidada a = b = 1 asigna ambas variables', () => {
    expect(run('let a: int; let b: int; a = b = 4; print(a); print(b);')).toEqual(['4', '4'])
  })
})

describe('IR — control de flujo, etiquetas y saltos', () => {
  it('if sin else: un salto condicional y una etiqueta', () => {
    expect(irText('let x: int = 1; if (x > 0) { print(x); }')).toBe(
      ['MAIN', '  x = 1', '  t1 = x > 0', '  IF_FALSE t1 GOTO L1', '  PRINT x', 'L1:', 'END'].join('\n'),
    )
  })

  it('if / else if / else genera etiquetas únicas', () => {
    const source = `
      let x: int = 0;
      if (x > 0) { print("pos"); } else if (x < 0) { print("neg"); } else { print("cero"); }
    `
    const labels = compile(source).main.filter((i) => i.op === 'LABEL')
    expect(new Set(labels.map((l) => (l.op === 'LABEL' ? l.name : ''))).size).toBe(labels.length)
    expect(run(source)).toEqual(['cero'])
  })

  it('while: etiqueta de inicio, salida condicional y salto hacia atrás', () => {
    const source = 'let i: int = 0; while (i < 3) { print(i); i = i + 1; }'
    expect(irText(source)).toBe(
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
    expect(run(source)).toEqual(['0', '1', '2'])
  })

  it('resuelve el shadowing con nombres únicos (x, x$1)', () => {
    const source = 'let x: int = 1; { let x: int = 2; print(x); } print(x);'
    expect(irText(source)).toContain('x$1 = 2')
    expect(run(source)).toEqual(['2', '1'])
  })
})

describe('IR — funciones, parámetros y retornos', () => {
  it('emite PARAM en orden y CALL con destino', () => {
    const ir = compile('function suma(a: int, b: int) -> int { return a + b; } print(suma(2, 3));')
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
    expect(ir.functions[0]).toMatchObject({
      name: 'suma',
      params: [
        { name: 'a', type: 'int' },
        { name: 'b', type: 'int' },
      ],
      returnType: 'int',
      locals: [],
    })
  })

  it('las funciones void terminan con RETURN implícito y CALL sin destino', () => {
    const ir = compile('function hola() { print("hola"); } hola();')
    expect(shape(ir.functions[0].body).at(-1)).toEqual({ op: 'RETURN', value: null })
    expect(shape(ir.main)).toEqual([{ op: 'CALL', func: 'hola', argCount: 0, dest: null }])
    expect(ir.functions[0].returnType).toBe('void')
  })

  it('no intercala PARAM de llamadas anidadas', () => {
    const source = `
      function suma(a: int, b: int) -> int { return a + b; }
      print(suma(suma(1, 2), suma(3, 4)));
    `
    const ops = compile(source).main.map((i) => i.op)
    expect(ops).toEqual(['PARAM', 'PARAM', 'CALL', 'PARAM', 'PARAM', 'CALL', 'PARAM', 'PARAM', 'CALL', 'PRINT'])
    expect(run(source)).toEqual(['10'])
  })

  it('variables locales y globales usan zonas distintas', () => {
    const ir = compile('let g: int = 1; function f() -> int { let l: int = g; return l; } print(f());')
    expect(ir.globals).toEqual([{ name: 'g', type: 'int' }])
    expect(ir.functions[0].locals).toEqual([{ name: 'l', type: 'int' }])
    const [assign] = ir.functions[0].body
    expect(assign).toMatchObject({
      op: 'ASSIGN',
      dest: { kind: 'var', name: 'l', scope: 'local' },
      src: { kind: 'var', name: 'g', scope: 'global' },
    })
  })

  it('convierte argumentos y retornos int → float', () => {
    expect(run('function mitad(x: float) -> float { return x / 2; } print(mitad(5));')).toEqual(['2.5'])
  })

  it('ejecuta recursión (factorial y fibonacci)', () => {
    expect(
      run(`
        function factorial(n: int) -> int { if (n <= 1) { return 1; } return n * factorial(n - 1); }
        function fib(n: int) -> int { if (n < 2) { return n; } return fib(n - 1) + fib(n - 2); }
        print(factorial(5));
        print(fib(10));
      `),
    ).toEqual(['120', '55'])
  })
})

describe('IR — arreglos', () => {
  it('un literal genera ARRAY_ALLOC y luego ARRAY_STORE en orden', () => {
    const ir = compile('let a: int[] = [10, 20];')
    const intArray = { kind: 'array', elementType: 'int' }
    const t1 = { kind: 'temp', name: 't1', type: intArray }
    expect(shape(ir.main)).toEqual([
      { op: 'ARRAY_ALLOC', dest: t1, elementType: 'int', length: 2 },
      { op: 'ARRAY_STORE', array: t1, index: { kind: 'const', type: 'int', value: 0 }, value: { kind: 'const', type: 'int', value: 10 } },
      { op: 'ARRAY_STORE', array: t1, index: { kind: 'const', type: 'int', value: 1 }, value: { kind: 'const', type: 'int', value: 20 } },
      { op: 'ASSIGN', dest: { kind: 'var', name: 'a', scope: 'global', type: intArray }, src: t1 },
    ])
    expect(ir.globals).toEqual([{ name: 'a', type: intArray }])
  })

  it('indexación y asignación indexada usan ARRAY_LOAD y ARRAY_STORE', () => {
    const text = irText('let a: int[] = [1, 2]; a[1] = a[0] + 5;')
    expect(text).toContain('t2 = a[0]')
    expect(text).toContain('t3 = t2 + 5')
    expect(text).toContain('a[1] = t3')
    expect(run('let a: int[] = [1, 2]; a[1] = a[0] + 5; print(a[1]);')).toEqual(['6'])
  })

  it('un arreglo sin inicializador es un bloque vacío', () => {
    expect(irText('let a: int[];')).toBe(['MAIN', '  t1 = ARRAY_ALLOC int, 0', '  a = t1', 'END'].join('\n'))
    expect(() => run('let a: int[]; print(a[0]);')).toThrow('Índice fuera de rango')
  })

  it('[] toma el tipo del contexto', () => {
    expect(irText('let m: string[][] = [];')).toContain('t1 = ARRAY_ALLOC string[], 0')
  })

  it('los arreglos anidados guardan referencias a bloques interiores', () => {
    const source = 'let m: int[][] = [[1, 2], [3]]; m[1][0] = 30; print(m[0][1]); print(m[1][0]);'
    const allocs = compile(source).main.filter((i) => i.op === 'ARRAY_ALLOC')
    expect(allocs.map((a) => (a.op === 'ARRAY_ALLOC' ? a.length : -1))).toEqual([2, 2, 1])
    expect(allocs[0]).toMatchObject({ elementType: { kind: 'array', elementType: 'int' } })
    expect(run(source)).toEqual(['2', '30'])
  })

  it('convierte elementos int a float en un float[]', () => {
    expect(irText('let f: float[] = [1, 2.5];')).toContain('t2 = (float) 1')
    expect(run('let f = [1, 2.5]; print(f[0] / 2);')).toEqual(['0.5'])
  })

  it('asignar un arreglo produce un alias del mismo bloque', () => {
    expect(run('let a: int[] = [1, 2]; let b: int[] = a; b[0] = 99; print(a[0]);')).toEqual(['99'])
  })

  it('los arreglos se pasan y se retornan por referencia', () => {
    expect(
      run(`
        function llenar(xs: int[], v: int) { let i: int = 0; while (i < 2) { xs[i] = v; i = i + 1; } }
        function crear() -> int[] { return [7, 8]; }
        let a: int[] = crear();
        llenar(a, 5);
        print(a[0] + a[1]);
      `),
    ).toEqual(['10'])
  })

  it('los índices fuera de rango los detecta el runtime (no el compilador)', () => {
    expect(() => run('let a: int[] = [1]; print(a[1]);')).toThrow('Índice fuera de rango')
    expect(() => run('let a: int[] = [1]; print(a[-1]);')).toThrow('Índice fuera de rango')
  })
})

describe('Integración — frontend de Jack → semántico → IR', () => {
  it('compila y ejecuta examples/demo.cf', () => {
    expect(run(demoSource)).toEqual(['26', '120'])
  })
})
