# Informe de integración: análisis semántico e IR

**Autor:** DeividJulian
**Rama:** `feature/semantic-ir` → PR hacia `develop` (después del PR #1 de Jack)
**Para:** Jack-Limas (AST y errores) y JuanMaya8 (VM, Heap y `runSource`)

```
Código fuente → Lexer → Parser → AST ──▶ Scopes + Símbolos + Tipos ──▶ IR v2.0 ──▶ VM
                (Jack)                    (Deivid: semantic/)          (Deivid: ir/)   (Juan)
```

## 1. Qué se desarrolló

- **Scopes léxicos** anidados con búsqueda hacia los padres y shadowing.
- **Tabla de símbolos** tipada: variables, constantes, parámetros y funciones.
- **Análisis semántico y verificación de tipos** sobre el **AST canónico de Jack**
  (`src/compiler/ast/nodes.ts`), sin AST duplicado ni adaptador.
- **Tipos recursivos** con arreglos homogéneos (`int[]`, `float[][]`, …).
- **IR v2.0** de tres direcciones: instrucciones tipadas, arreglos sobre el Heap
  y posición de origen en cada instrucción.
- Errores con el contrato común **`CompilerDiagnostic`** (`phase: 'semantic'`).

## 2. Archivos

```
src/compiler/semantic/
├── scope.ts             Scope: diccionario nombre → símbolo con puntero al padre
├── symbol-table.ts      SymbolTable: pila de scopes, declaración y búsqueda, irName único
├── types.ts             Sistema de tipos: ValueType recursivo, compatibilidad y operadores
├── type-checker.ts      Analizador semántico (recorrido del AST en dos pasadas)
├── semantic-errors.ts   Códigos estables + semanticError() → CompilerDiagnostic
└── index.ts
src/compiler/ir/
├── instructions.ts      CONTRATO con la VM (IR v2.0)
├── ir-generator.ts      AST + anotaciones semánticas → IRProgram
├── ir-printer.ts        formatIR(): texto solo para mostrar/depurar
├── index.ts             compileToIR(program)
└── README.md            Contrato explicado para Juan
src/compiler/__tests__/
├── helpers.ts           Compila código fuente real con parseSource() de Jack
├── reference-interpreter.ts   Intérprete mínimo del IR (solo pruebas)
├── scope.test.ts · semantic.test.ts · ir.test.ts
```

Eliminado: `semantic/ast-contract.ts` (AST provisional) y `__tests__/ast-builders.ts`.
**No se modificaron** `lexer/`, `parser/`, `ast/`, `errors.ts`, `runtime/` ni la UI.

## 3. Scopes y búsqueda de identificadores

Un `Scope` es un `Map<nombre, símbolo>` con un puntero a su padre. Forman un árbol:

```
global                      variables globales + TODAS las funciones (hoisting)
├── function factorial      parámetros + variables del cuerpo (mismo scope)
│   └── block               if / else / while / { } anidados
└── block
```

- **`lookup(nombre)`**: busca en el scope actual; si no está, en el padre, y así
  hasta el global. Si no aparece → `UNDECLARED_IDENTIFIER`. Gana siempre la
  declaración **más cercana** (shadowing).
- **`declare(símbolo)`**: solo mira el scope actual. Así se detectan duplicados
  en el mismo scope, pero se permite repetir el nombre en un scope hijo.
- Parámetros y cuerpo de una función comparten scope: `function f(a: int) { let a = 1; }`
  es un duplicado.
- En `let x = x + 1;` el inicializador se revisa **antes** de declarar `x`.

## 4. Tabla de símbolos

```ts
interface VariableSymbol {         // kind: 'variable' | 'constant' | 'parameter'
  id; name; kind; scope; position
  type: ValueType                  // int, float, string, bool o arreglo
  mutable: boolean                 // let y parámetros: true · const: false
  storage: 'global' | 'local'      // dónde vive en ejecución
  irName: string                   // nombre único en el IR: x, x$1, x$2…
}
interface FunctionSymbol {         // kind: 'function'
  id; name; scope; position; mutable: false
  params: { name; type }[]
  returnType: ValueType | 'void'   // returnType: null en el AST → 'void'
}
```

`irName` resuelve el shadowing en compilación: dos `x` en scopes distintos
pasan a ser `x` y `x$1`, así la VM no necesita conocer scopes de bloque.

## 5. Reglas semánticas

| Regla | Código |
| ----- | ------ |
| Variable usada sin declarar | `UNDECLARED_IDENTIFIER` |
| Nombre repetido en el mismo scope (variables, parámetros o funciones) | `DUPLICATE_DECLARATION` |
| Asignar a una constante (`const` protege la referencia, no los elementos de un arreglo) | `CONST_REASSIGNMENT` |
| Asignar a una función | `INVALID_ASSIGNMENT` |
| Valor de tipo incompatible (declaración, asignación, argumento, elemento) | `TYPE_MISMATCH` |
| Operación entre tipos incompatibles | `INVALID_OPERAND_TYPES` |
| Condición de `if`/`while` que no es `bool` | `INVALID_CONDITION` |
| Llamar a una función inexistente / a algo que no es función | `UNDEFINED_FUNCTION` / `NOT_A_FUNCTION` |
| Usar una función como valor (`let x = f;`) | `FUNCTION_AS_VALUE` |
| Número de argumentos incorrecto | `ARGUMENT_COUNT_MISMATCH` |
| Usar el resultado de una función sin retorno | `VOID_VALUE` |
| `return` fuera de función | `RETURN_OUTSIDE_FUNCTION` |
| `return` con tipo incorrecto, sin valor o con valor en función sin retorno | `RETURN_TYPE_MISMATCH` |
| Función con tipo de retorno que no retorna en todos los caminos | `MISSING_RETURN` |
| Indexar algo que no es arreglo / índice que no es `int` | `NOT_AN_ARRAY` / `INVALID_INDEX_TYPE` |
| Literal con elementos de tipos distintos (`[1, "a"]`) | `HETEROGENEOUS_ARRAY` |
| `[]` sin tipo esperado (`let a = [];`) | `EMPTY_ARRAY_WITHOUT_TYPE` |
| `print` de un arreglo | `INVALID_PRINT_ARGUMENT` |

Por robustez también se revisan `CONST_WITHOUT_INITIALIZER`, `MISSING_TYPE` y
`NESTED_FUNCTION`, aunque el parser ya los impide.

El análisis **no se detiene** en el primer error. Una expresión con error recibe
el tipo interno `error`, que es compatible con todo, para no reportar errores en
cascada. Las funciones se registran primero (hoisting), así que se pueden llamar
antes de su declaración y hay recursión directa y mutua.

`MISSING_RETURN` es conservador: un `if` cuenta como retorno solo si tiene `else`
y ambas ramas retornan; un `while` nunca cuenta (su condición podría ser falsa).

## 6. Sistema de tipos

| Operación | Tipos válidos | Resultado |
| --------- | ------------- | --------- |
| `+ - * /` | numérico ⊕ numérico | `int` si ambos `int`; si no, `float` (`int / int` es división entera) |
| `+` | `string + string` | `string` |
| `%` | `int % int` | `int` |
| `< <= > >=` | numérico ⊕ numérico | `bool` |
| `== !=` | numéricos, `string` con `string`, `bool` con `bool` (no arreglos) | `bool` |
| `&& \|\|` | `bool` ⊕ `bool` (cortocircuito) | `bool` |
| `-x` / `!x` | numérico / `bool` | mismo tipo / `bool` |
| `a[i]` | `a: T[]`, `i: int` | `T` |

- **Única conversión implícita: `int → float`**, al declarar, asignar, pasar
  argumentos, retornar, en elementos de un literal y en operaciones mixtas. En el
  IR se ve como `CAST`. **No** existe `float → int` ni conversiones explícitas
  (la gramática no las define).
- Los arreglos **no** se convierten: un `int[]` no es un `float[]`, porque se
  comparten por referencia.
- **Tipo esperado**: el tipo de la variable, el parámetro, el retorno o el
  elemento se pasa al literal de arreglo. Por eso `let a: int[] = [];` y
  `let f: float[] = [1, 2];` son válidos. Sin contexto, `[1, 2.5]` es `float[]`
  y `[]` es un error.
- La asignación es una expresión con el tipo del destino: `a = b = 1` es válido.
- No hay *truthiness*: `if (1)` es un error.

## 7. Generación de IR

El generador recorre el AST ya validado y usa las anotaciones del semántico
(tipo de cada expresión y símbolo de cada identificador). Cada subexpresión deja
su resultado en un temporal nuevo (`t1`, `t2`…) y cada instrucción hace como
máximo una operación. La evaluación siempre va de izquierda a derecha.

| Construcción | IR |
| ------------ | -- |
| `a op b` | `[a] [b] tN = a op b` |
| `a && b` | `t = a; IF_FALSE t GOTO L; t = b; L:` |
| `if (c) S1 else S2` | `IF_FALSE c GOTO Lelse; S1; GOTO Lend; Lelse: S2; Lend:` |
| `while (c) S` | `Lini: [c] IF_FALSE c GOTO Lfin; S; GOTO Lini; Lfin:` |
| `f(a, b)` | `PARAM a; PARAM b; t = CALL f, 2` |
| `[e1, e2]` | `t = ARRAY_ALLOC T, 2; t[0] = e1; t[1] = e2` |
| `a[i]` / `a[i] = v` | `ARRAY_LOAD` / `ARRAY_STORE` |

El contrato completo para la VM está en
[`src/compiler/ir/README.md`](../src/compiler/ir/README.md).

## 8. Ejemplos reales

**Fragmento de AST** (de `parseSource`) para `a[0] = 2;`:

```json
{ "kind": "ExpressionStatement",
  "expression": { "kind": "AssignmentExpression",
    "target": { "kind": "IndexExpression",
      "object": { "kind": "IdentifierExpression", "name": "a" },
      "index":  { "kind": "LiteralExpression", "literalType": "int", "value": 0 } },
    "value": { "kind": "LiteralExpression", "literalType": "int", "value": 2 } } }
```

**Errores semánticos** (salida de `formatDiagnostic`):

```
const LIMITE: int = 10;
let nombres: string[] = ["Ana", 5];
LIMITE = 20;
if (LIMITE) { print(total); }
function doble(x: int) -> int { return x * 2.5; }
print(doble(1, 2));
let v = [];
```
```
[semantic] TYPE_MISMATCH 2:33 El elemento 2 del arreglo es int, pero se esperaba string
[semantic] CONST_REASSIGNMENT 3:1 No se puede reasignar la constante 'LIMITE'
[semantic] INVALID_CONDITION 4:5 La condición de 'if' debe ser de tipo bool, pero es int
[semantic] UNDECLARED_IDENTIFIER 4:21 La variable 'total' no ha sido declarada
[semantic] RETURN_TYPE_MISMATCH 5:40 La función 'doble' retorna int, pero se intentó retornar float
[semantic] ARGUMENT_COUNT_MISMATCH 6:7 La función 'doble' espera 1 argumento(s), pero recibió 2
[semantic] EMPTY_ARRAY_WITHOUT_TYPE 7:9 No se puede deducir el tipo de un arreglo vacío; agrega una anotación de tipo (p. ej. `let a: int[] = [];`)
```

**IR** (salida de `formatIR`):

```
function suma(xs: int[]) -> int {
    let total: int = 0;
    let i: int = 0;
    while (i < 2) {
        total = total + xs[i];
        i = i + 1;
    }
    return total;
}
let a: int[] = [4, 6];
if (suma(a) > 5 && true) {
    print(suma(a));
}
```
```
FUNCTION suma(xs: int[]): int
  total = 0
  i = 0
L1:
  t1 = i < 2
  IF_FALSE t1 GOTO L2
  t2 = xs[i]
  t3 = total + t2
  total = t3
  t4 = i + 1
  i = t4
  GOTO L1
L2:
  RETURN total
END

MAIN
  t5 = ARRAY_ALLOC int, 2
  t5[0] = 4
  t5[1] = 6
  a = t5
  PARAM a
  t7 = CALL suma, 1
  t8 = t7 > 5
  t6 = t8
  IF_FALSE t6 GOTO L3
  t6 = true
L3:
  IF_FALSE t6 GOTO L4
  PARAM a
  t9 = CALL suma, 1
  PRINT t9
L4:
END
```

## 9. Pruebas

Las pruebas de semántica e IR compilan **código fuente real** con `parseSource()`
de Jack, así que también validan la integración Parser → Semántico → IR. El IR
se ejecuta con el intérprete de referencia para comprobar resultados (recursión,
aliasing, cortocircuito, conversiones).

| Archivo | Pruebas |
| ------- | ------: |
| `__tests__/scope.test.ts` | 10 |
| `__tests__/semantic.test.ts` | 39 |
| `__tests__/ir.test.ts` | 30 |
| Frontend de Jack (6 archivos) | 82 |
| **Total** | **161** |

Comandos: `npm test` (161/161), `npm run lint` (sin errores), `npm run build` (correcto).

## 10. Pendientes de integración

**Juan (Runtime):**
1. Aceptar solo `IR_VERSION '2.0'` e implementar `ARRAY_ALLOC/LOAD/STORE` (README §4).
2. `defaultValue()` ahora puede devolver `null` (variables arreglo).
3. Copiar `instruction.position` al `CompilerDiagnostic` de runtime.
4. En `run-source.ts`: eliminar `integration/ast-adapter.ts` y llamar
   `compileToIR(frontend.program)` directamente; los errores semánticos ya son
   `CompilerDiagnostic`.

**Equipo:**
- Merge del PR #1 (Jack) en `develop`; después, este PR.
- Esta rama ya incluye localmente `feature/lexer-parser`; el único conflicto
  (`package.json`) se resolvió con la versión de Jack.
