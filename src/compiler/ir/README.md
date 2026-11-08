# Contrato del IR de CodeForge (v2.0)

> **Para:** JuanMaya8 (Runtime / VM). **De:** DeividJulian (semántico e IR).
> Los tipos de TypeScript en [`instructions.ts`](./instructions.ts) son la
> fuente de verdad; este documento los explica. Cualquier cambio debe acordarse
> y subir `IR_VERSION`.

El runtime recibe un `IRProgram`: objetos JS planos, serializables a JSON. **Nunca**
necesita parsear texto. `formatIR()` produce texto solo para mostrar/depurar.

```ts
import { compileToIR } from './compiler/ir/index.ts'

const result = compileToIR(frontend.program)   // solo si parseSource(...).success
if (!result.ok) result.errors                  // CompilerDiagnostic[] (phase: 'semantic')
else            result.ir                      // IRProgram v2.0 → VM
```

## 0. Cambios respecto a la v1.0 (incompatibles)

| Cambio | Qué debe hacer la VM |
| ------ | -------------------- |
| `version: '2.0'` | Rechazar cualquier otra versión (`INVALID_PROGRAM`). |
| Tipos recursivos `IRType` | Un tipo puede ser `'int'` … o `{ kind: 'array', elementType }`. Los primitivos siguen siendo strings, así que el código escalar de la v1.0 no cambia. |
| `ARRAY_ALLOC`, `ARRAY_LOAD`, `ARRAY_STORE` | Implementarlos con el Heap (§4). |
| `position?` en cada instrucción | Copiarla al `CompilerDiagnostic` de runtime para señalar la línea del error. |
| `defaultValue(arrayType)` devuelve `null` | Pre-inicializar variables arreglo con la referencia nula (§4). |
| `CAST` solo se emite como `int → float` | Las demás conversiones ya no existen en el lenguaje. |

## 1. Estructura del programa

```ts
interface IRProgram {
  version: '2.0'
  globals: IRVariable[]     // { name, type } — variables fuera de funciones
  functions: IRFunction[]   // { name, params, returnType, locals, body }
  main: Instruction[]       // la ejecución empieza aquí y termina al final
}

interface IRFunction {
  name: string
  params: IRVariable[]      // en orden; el i-ésimo PARAM va a params[i].name
  returnType: IRType | 'void'
  locals: IRVariable[]      // locales del cuerpo (sin parámetros), nombres únicos
  body: Instruction[]
}
```

## 2. Tipos y operandos

```ts
type IRPrimitiveType = 'int' | 'float' | 'string' | 'bool'
type IRType = IRPrimitiveType | { kind: 'array'; elementType: IRType }   // int[][] anida
```

| kind    | campos                         | dónde se lee/escribe |
|---------|--------------------------------|----------------------|
| `const` | `type` (solo primitivo), `value` | valor inmediato |
| `temp`  | `name` (`t1`, `t2`…), `type`   | **frame actual** (cada llamada tiene los suyos) |
| `var`   | `name`, `scope`, `type`        | `scope: 'global'` → memoria global; `'local'` → frame actual |

- En JS, `int` y `float` son `number`. La distinción está en `type` y en `operandType`.
- Un operando de tipo arreglo contiene una **referencia** al Heap, no los elementos.
- Los nombres de variables ya son únicos en su zona: el shadowing se resolvió en
  compilación (`x`, `x$1`, …). `$` no es válido en el lenguaje fuente.
- Toda variable se escribe (`ASSIGN`) antes de leerse. Declaraciones sin
  inicializador: `0`, `0`, `""`, `false`, o un arreglo vacío (`ARRAY_ALLOC … 0`).

## 3. Opcodes

| op              | campos                                              | semántica |
|-----------------|-----------------------------------------------------|-----------|
| `ASSIGN`        | `dest`, `src`                                       | `dest = src` (con arreglos copia la referencia → alias) |
| `BINARY`        | `operator`, `operandType`, `dest`, `left`, `right`  | `dest = left op right` |
| `UNARY`         | `operator` (`-` \| `!`), `dest`, `src`              | negación numérica / lógica |
| `CAST`          | `from`, `to`, `dest`, `src`                         | solo `int → float` (mismo número) |
| `LABEL`         | `name`                                              | no-op, marca posición |
| `JUMP`          | `target`                                            | `goto target` |
| `JUMP_IF_FALSE` | `condition`, `target`                               | si `condition === false`, salta |
| `JUMP_IF_TRUE`  | `condition`, `target`                               | si `condition === true`, salta |
| `PARAM`         | `value`                                             | apila un argumento |
| `CALL`          | `func`, `argCount`, `dest` (temp o `null`)          | llama a la función |
| `RETURN`        | `value` (operando o `null`)                         | termina la función |
| `PRINT`         | `value`                                             | imprime un valor **primitivo** (una línea) |
| `ARRAY_ALLOC`   | `dest`, `elementType`, `length` (número ≥ 0)        | `dest` = nueva referencia a un bloque de `length` celdas |
| `ARRAY_LOAD`    | `dest`, `array`, `index`                            | `dest = array[index]` |
| `ARRAY_STORE`   | `array`, `index`, `value`                           | `array[index] = value` |

Todas las instrucciones pueden traer `position?: { line, column }`: la posición
del nodo del AST que las generó (el generador siempre la pone).

### `BINARY`: reglas según `operandType`
Ambos operandos ya llegan del tipo `operandType` (el compilador inserta `CAST`).

- `int`: `+ - *` normales; `/` y `%` **truncan hacia cero** (`Math.trunc`).
- `float`: aritmética normal.
- `string`: `+` concatena; `==`/`!=` comparan texto.
- `bool`: solo `==`/`!=`.
- Comparaciones (`== != < <= > >=`) producen `bool`.
- División o módulo por cero: lo detecta el runtime (`DIVISION_BY_ZERO`).

### Lógicos `&&`, `||`
No hay opcode AND/OR: se compilan con **cortocircuito** mediante
`JUMP_IF_FALSE` / `JUMP_IF_TRUE`. `!` es `UNARY`.

## 4. Arreglos y Heap

- `ARRAY_ALLOC` crea un bloque con `length` celdas, cada una con
  `defaultValue(elementType)` (para `elementType` arreglo: `null`), y guarda la
  referencia en `dest`. Corresponde a `RuntimeHeap.allocate(length, defaultValue(elementType))`.
- Un literal `[e1, e2]` se compila como un `ARRAY_ALLOC` seguido de un
  `ARRAY_STORE` por elemento, en orden e índices constantes `0, 1, …`.
- Arreglos anidados: cada literal interior tiene su propio bloque; la celda del
  bloque exterior guarda la referencia.
- `ARRAY_LOAD` / `ARRAY_STORE` deben validar:
  1. que `array` sea una referencia existente → si no, `INVALID_REFERENCE`;
  2. que `index` sea un entero con `0 <= index < length` → si no, `HEAP_OUT_OF_BOUNDS`.
  El compilador garantiza que `index` es de tipo `int`; los límites solo se pueden
  conocer en ejecución.
- Asignaciones, `PARAM` y `RETURN` copian la **referencia**: `b = a` hace que
  ambos nombres compartan el bloque (aliasing). No hay copia profunda ni GC.
- La referencia nula (`null`) nunca llega a un `ARRAY_LOAD`/`STORE` en programas
  generados: el generador siempre asigna un bloque antes de usar una variable
  arreglo. Si aun así llega, es `INVALID_REFERENCE`.
- No hay opcode de longitud: el lenguaje aún no define esa operación.

## 5. Etiquetas y saltos
- Nombres `L1`, `L2`… únicos en todo el programa.
- Un salto solo apunta a una etiqueta del **mismo cuerpo** (`main` o la función actual).
- Sugerencia: precalcular `buildLabelIndex(body)` (exportado en `instructions.ts`).

## 6. Convención de llamadas
1. El llamador evalúa **todos** los argumentos y luego emite los `PARAM` seguidos,
   de izquierda a derecha (nunca se intercalan PARAM de llamadas distintas).
2. `CALL f, n` toma los últimos `n` valores apilados; el i-ésimo se guarda en el
   nuevo frame como variable local `f.params[i].name`.
3. Se ejecuta `f.body` desde el índice 0 con un frame nuevo (locales + temporales).
   Los `locals` se pueden pre-inicializar con `defaultValue(type)`.
4. `RETURN v` termina la función y entrega `v` al `dest` de la `CALL` (si no es `null`).
5. Las funciones `void` siempre terminan con un `RETURN` (el generador lo agrega).
   Las funciones con valor retornan en todos los caminos (lo garantiza el semántico).
6. `main` termina cuando se acaba su lista de instrucciones; no contiene `RETURN`.

## 7. Ejemplo

```
let a: int[] = [4, 6];
print(a[0] + a[1]);
```

```
MAIN
  t1 = ARRAY_ALLOC int, 2
  t1[0] = 4
  t1[1] = 6
  a = t1
  t2 = a[0]
  t3 = a[1]
  t4 = t2 + t3
  PRINT t4
END
```

La primera instrucción, como objeto:

```json
{
  "op": "ARRAY_ALLOC",
  "dest": { "kind": "temp", "name": "t1", "type": { "kind": "array", "elementType": "int" } },
  "elementType": "int",
  "length": 2,
  "position": { "line": 1, "column": 16 }
}
```

## 8. Especificación ejecutable

`src/compiler/__tests__/reference-interpreter.ts` es un intérprete mínimo, solo
para pruebas, que ejecuta este contrato (incluye Heap y aliasing). No es la VM
oficial, pero sirve de referencia ante cualquier duda sobre la semántica.
