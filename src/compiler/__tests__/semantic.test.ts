import { describe, expect, it } from 'vitest'
import { check, codes } from './helpers.ts'

describe('Semántico — declaraciones y scopes', () => {
  it('acepta declaraciones con tipo explícito, inferido y sin valor inicial', () => {
    expect(
      codes(`
        let a: int = 1;
        let b = 2.5;
        const NOMBRE: string = "Ana";
        let ok: bool;
        print(NOMBRE);
      `),
    ).toEqual([])
  })

  it('infiere el tipo desde el inicializador', () => {
    const { symbolTable } = check('let x = 1 + 2.5; let s = "a"; let m = [[1], [2]];')
    expect(symbolTable.lookup('x')).toMatchObject({ type: 'float' })
    expect(symbolTable.lookup('s')).toMatchObject({ type: 'string' })
    expect(symbolTable.lookup('m')).toMatchObject({
      type: { kind: 'array', elementType: { kind: 'array', elementType: 'int' } },
    })
  })

  it('detecta variables no declaradas y reporta la posición del uso', () => {
    const { errors } = check('let a: int = 1;\nprint(b);')
    expect(errors).toEqual([
      {
        phase: 'semantic',
        code: 'UNDECLARED_IDENTIFIER',
        message: "La variable 'b' no ha sido declarada",
        position: { line: 2, column: 7 },
      },
    ])
  })

  it('detecta declaraciones duplicadas en el mismo scope', () => {
    expect(codes('let x: int = 1; let x: float = 2.0;')).toEqual(['DUPLICATE_DECLARATION'])
  })

  it('permite el mismo nombre en un scope anidado (shadowing)', () => {
    expect(codes('let x: int = 1; { let x: string = "a"; print(x); } print(x);')).toEqual([])
  })

  it('las variables de un bloque no son visibles fuera de él', () => {
    expect(codes('if (true) { let y: int = 1; } print(y);')).toEqual(['UNDECLARED_IDENTIFIER'])
  })

  it('en `let x = x + 1;` el inicializador no ve la variable que se declara', () => {
    expect(codes('let x = x + 1;')).toEqual(['UNDECLARED_IDENTIFIER'])
  })

  it('no reporta errores en cascada para una variable de tipo desconocido', () => {
    expect(codes('let a = b; print(a + 1);')).toEqual(['UNDECLARED_IDENTIFIER'])
  })
})

describe('Semántico — constantes y asignaciones', () => {
  it('impide reasignar constantes', () => {
    expect(codes('const PI: float = 3.14; PI = 3.0;')).toEqual(['CONST_REASSIGNMENT'])
  })

  it('const protege la referencia del arreglo, no sus elementos', () => {
    expect(codes('const A: int[] = [1, 2]; A[0] = 5;')).toEqual([])
    expect(codes('const A: int[] = [1, 2]; A = [3];')).toEqual(['CONST_REASSIGNMENT'])
  })

  it('verifica el tipo en declaraciones y asignaciones', () => {
    expect(codes('let x: int = "hola";')).toEqual(['TYPE_MISMATCH'])
    expect(codes('let x: int = 1; x = true;')).toEqual(['TYPE_MISMATCH'])
    expect(codes('let x: int = 2.5;')).toEqual(['TYPE_MISMATCH'])
  })

  it('permite la conversión implícita int → float, pero no al revés', () => {
    expect(codes('let f: float = 1; f = 2;')).toEqual([])
  })

  it('no permite asignar a una función', () => {
    expect(codes('function f() { } f = 1;')).toEqual(['INVALID_ASSIGNMENT'])
  })

  it('la asignación es una expresión con el tipo del destino (a = b = 1)', () => {
    expect(codes('let a: int; let b: int; a = b = 1;')).toEqual([])
    expect(codes('let a: string; let b: int; a = b = 1;')).toEqual(['TYPE_MISMATCH'])
  })
})

describe('Semántico — funciones y return', () => {
  it('acepta funciones con parámetros, recursión y llamadas antes de la declaración', () => {
    expect(
      codes(`
        print(factorial(5));
        function factorial(n: int) -> int {
          if (n <= 1) { return 1; }
          return n * factorial(n - 1);
        }
      `),
    ).toEqual([])
  })

  it('detecta funciones inexistentes y llamadas a algo que no es función', () => {
    expect(codes('noExiste(1);')).toEqual(['UNDEFINED_FUNCTION'])
    expect(codes('let x: int = 1; x();')).toEqual(['NOT_A_FUNCTION'])
  })

  it('detecta un número incorrecto de argumentos', () => {
    expect(codes('function f(a: int, b: int) -> int { return a + b; } print(f(1));')).toEqual([
      'ARGUMENT_COUNT_MISMATCH',
    ])
  })

  it('verifica el tipo de cada argumento', () => {
    expect(codes('function f(a: int) { } f("x");')).toEqual(['TYPE_MISMATCH'])
    expect(codes('function f(a: float) { } f(1);')).toEqual([])
  })

  it('los parámetros comparten scope con el cuerpo de la función', () => {
    expect(codes('function f(a: int) { let a: int = 2; }')).toEqual(['DUPLICATE_DECLARATION'])
    expect(codes('function f(a: int, a: int) { }')).toEqual(['DUPLICATE_DECLARATION'])
  })

  it('detecta funciones duplicadas y el choque con una variable global', () => {
    expect(codes('function f() { } function f() { }')).toEqual(['DUPLICATE_DECLARATION'])
    expect(codes('let f: int = 1; function f() { }')).toEqual(['DUPLICATE_DECLARATION'])
  })

  it('usar una función como valor es un error', () => {
    expect(codes('function f() -> int { return 1; } let x = f;')).toEqual(['FUNCTION_AS_VALUE'])
  })

  it('una función sin tipo de retorno (void) no produce un valor', () => {
    expect(codes('function f() { } let x = f();')).toEqual(['VOID_VALUE'])
    expect(codes('function f() { } f();')).toEqual([])
  })

  it('return fuera de función', () => {
    expect(codes('return 1;')).toEqual(['RETURN_OUTSIDE_FUNCTION'])
  })

  it('return con tipo incorrecto, sin valor o con valor en función void', () => {
    expect(codes('function f() -> int { return "x"; }')).toEqual(['RETURN_TYPE_MISMATCH'])
    expect(codes('function f() -> int { return; }')).toEqual(['RETURN_TYPE_MISMATCH'])
    expect(codes('function f() { return 1; }')).toEqual(['RETURN_TYPE_MISMATCH'])
    expect(codes('function f() -> float { return 1; }')).toEqual([])
  })

  it('exige return en todos los caminos de una función con tipo de retorno', () => {
    expect(codes('function f(x: int) -> int { if (x > 0) { return 1; } }')).toEqual(['MISSING_RETURN'])
    expect(codes('function f(x: int) -> int { while (true) { return 1; } }')).toEqual(['MISSING_RETURN'])
    expect(
      codes('function f(x: int) -> int { if (x > 0) { return 1; } else if (x < 0) { return -1; } else { return 0; } }'),
    ).toEqual([])
  })
})

describe('Semántico — expresiones y condiciones', () => {
  it('aritmética numérica, concatenación, comparación y lógica válidas', () => {
    expect(
      codes(`
        let a: int = 1 + 2 * 3 % 2;
        let b: float = a / 2.0;
        let s: string = "a" + "b";
        let c: bool = a < b && s == "ab" || !(a != 1);
        let n: int = -a;
      `),
    ).toEqual([])
  })

  it('detecta operaciones entre tipos incompatibles', () => {
    expect(codes('let x = 1 + "a";')).toEqual(['INVALID_OPERAND_TYPES'])
    expect(codes('let x = true + 1;')).toEqual(['INVALID_OPERAND_TYPES'])
    expect(codes('let x = 2.5 % 2;')).toEqual(['INVALID_OPERAND_TYPES'])
    expect(codes('let x = 1 && true;')).toEqual(['INVALID_OPERAND_TYPES'])
    expect(codes('let x = "a" < "b";')).toEqual(['INVALID_OPERAND_TYPES'])
    expect(codes('let x = -true;')).toEqual(['INVALID_OPERAND_TYPES'])
    expect(codes('let x = !1;')).toEqual(['INVALID_OPERAND_TYPES'])
    expect(codes('let x = 1 == "1";')).toEqual(['INVALID_OPERAND_TYPES'])
  })

  it('las condiciones de if y while deben ser bool (no hay truthiness)', () => {
    expect(codes('if (1) { }')).toEqual(['INVALID_CONDITION'])
    expect(codes('while ("x") { }')).toEqual(['INVALID_CONDITION'])
    expect(codes('let i: int = 0; while (i < 3) { i = i + 1; }')).toEqual([])
  })

  it('acumula varios errores sin detenerse en el primero', () => {
    expect(codes('print(a); let b: int = "x"; if (1) { }')).toEqual([
      'UNDECLARED_IDENTIFIER',
      'TYPE_MISMATCH',
      'INVALID_CONDITION',
    ])
  })
})

describe('Semántico — arreglos', () => {
  it('acepta literales, anidados, indexación y asignación indexada', () => {
    expect(
      codes(`
        let a: int[] = [1, 2, 3];
        let m: int[][] = [[1, 2], [3]];
        a[0] = a[1] + m[1][0];
        m[0] = [9, 9];
        print(m[0][1]);
      `),
    ).toEqual([])
  })

  it('[] toma el tipo del contexto; sin contexto es un error', () => {
    expect(codes('let a: int[] = []; let m: string[][] = [[], ["x"]];')).toEqual([])
    expect(codes('let a = [];')).toEqual(['EMPTY_ARRAY_WITHOUT_TYPE'])
  })

  it('un arreglo declarado sin inicializador es válido (queda vacío)', () => {
    expect(codes('let a: bool[]; print(a[0]);')).toEqual([])
  })

  it('exige elementos homogéneos (int y float se unifican en float)', () => {
    expect(codes('let a = [1, "x"];')).toEqual(['HETEROGENEOUS_ARRAY'])
    expect(check('let a = [1, 2.5];').symbolTable.lookup('a')).toMatchObject({
      type: { kind: 'array', elementType: 'float' },
    })
    expect(codes('let a: int[] = [1, true];')).toEqual(['TYPE_MISMATCH'])
    expect(codes('let a: float[] = [1, 2];')).toEqual([])
  })

  it('el índice debe ser int y solo se indexan arreglos', () => {
    expect(codes('let a: int[] = [1]; print(a[1.5]);')).toEqual(['INVALID_INDEX_TYPE'])
    expect(codes('let a: int[] = [1]; print(a["0"]);')).toEqual(['INVALID_INDEX_TYPE'])
    expect(codes('let x: int = 1; print(x[0]);')).toEqual(['NOT_AN_ARRAY'])
  })

  it('el valor almacenado debe ser compatible con el tipo del elemento', () => {
    expect(codes('let a: int[] = [1]; a[0] = "x";')).toEqual(['TYPE_MISMATCH'])
    expect(codes('let m: int[][] = [[1]]; m[0] = 5;')).toEqual(['TYPE_MISMATCH'])
  })

  it('los arreglos no se convierten: int[] no es float[]', () => {
    expect(codes('let a: int[] = [1]; let f: float[] = a;')).toEqual(['TYPE_MISMATCH'])
  })

  it('arreglos como parámetros y valores de retorno', () => {
    expect(
      codes(`
        function primero(xs: int[]) -> int { return xs[0]; }
        function crear() -> int[] { return [1, 2]; }
        function vacio() -> string[] { return []; }
        print(primero(crear()));
      `),
    ).toEqual([])
    expect(codes('function f(xs: int[]) { } f([true]);')).toEqual(['TYPE_MISMATCH'])
  })

  it('print no acepta arreglos y los arreglos no se comparan', () => {
    expect(codes('let a: int[] = [1]; print(a);')).toEqual(['INVALID_PRINT_ARGUMENT'])
    expect(codes('let a: int[] = [1]; let b = a == a;')).toEqual(['INVALID_OPERAND_TYPES'])
  })
})

describe('Semántico — formato de diagnósticos', () => {
  it('usa el contrato común CompilerDiagnostic con fase semantic y posición', () => {
    const [error] = check('let a: int[] = [1];\nlet x: string = a[0];').errors
    expect(error).toEqual({
      phase: 'semantic',
      code: 'TYPE_MISMATCH',
      message: "No se puede inicializar 'x' de tipo string con un valor de tipo int",
      position: { line: 2, column: 17 },
    })
  })
})
