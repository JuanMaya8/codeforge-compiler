# Contrato del IR de CodeForge (v1.0)

> **Estado: PROPUESTA para revisar con Juan (Runtime).** Los tipos de TypeScript
> en [`instructions.ts`](./instructions.ts) son la fuente de verdad; este documento
> los explica. Cualquier cambio debe acordarse y subir `IR_VERSION`.

El runtime recibe un `IRProgram` (objetos JS, serializables a JSON) y **nunca**
necesita parsear texto. `formatIR()` produce texto solo para mostrar/depurar.

## 1. Estructura del programa

```ts
interface IRProgram {
  version: '1.0'
  globals: IRVariable[]     // { name, type } — variables fuera de funciones
  functions: IRFunction[]   // { name, params, returnType, locals, body }
  main: Instruction[]       // la ejecución empieza aquí y termina al final
}
```

## 2. Operandos

| kind    | campos                         | dónde se lee/escribe                       |
|---------|--------------------------------|--------------------------------------------|
| `const` | `type`, `value`                | valor inmediato                            |
| `temp`  | `name` (`t1`, `t2`…), `type`   | **frame actual** (cada llamada tiene los suyos) |
| `var`   | `name`, `scope`, `type`        | `scope:'global'` → memoria global; `scope:'local'` → frame actual |

- Tipos: `int | float | string | bool`. En JS, `int` y `float` son `number`.
- Los nombres de variables ya son únicos en su zona: el shadowing se resolvió en
  compilación (`x`, `x$1`, …). `$` no es válido en el lenguaje fuente.
- Toda variable se escribe (ASSIGN) antes de leerse: las declaraciones sin
  inicializador reciben `0`, `0`, `""` o `false`.

## 3. Opcodes

| op              | campos                                              | semántica |
|-----------------|-----------------------------------------------------|-----------|
| `ASSIGN`        | `dest`, `src`                                       | `dest = src` |
| `BINARY`        | `operator`, `operandType`, `dest`, `left`, `right`  | `dest = left op right` |
| `UNARY`         | `operator` (`-` \| `!`), `dest`, `src`              | negación numérica / lógica |
| `CAST`          | `from`, `to`, `dest`, `src`                         | conversión de tipo |
| `LABEL`         | `name`                                              | no-op, marca posición |
| `JUMP`          | `target`                                            | `goto target` |
| `JUMP_IF_FALSE` | `condition`, `target`                               | si `condition === false`, salta |
| `JUMP_IF_TRUE`  | `condition`, `target`                               | si `condition === true`, salta |
| `PARAM`         | `value`                                             | apila un argumento |
| `CALL`          | `func`, `argCount`, `dest` (temp o `null`)          | llama a la función |
| `RETURN`        | `value` (operando o `null`)                         | termina la función |
| `PRINT`         | `value`                                             | imprime el valor |

### `BINARY`: reglas según `operandType`
Ambos operandos ya llegan del tipo `operandType` (el compilador inserta `CAST`).

- `int`: `+ - *` normales; `/` y `%` **truncan hacia cero** (`Math.trunc`).
- `float`: aritmética normal.
- `string`: `+` concatena; `==`/`!=` comparan texto.
- `bool`: solo `==`/`!=`.
- Comparaciones (`== != < <= > >=`) producen `bool`.
- División/módulo por cero: **el runtime decide** cómo reportarlo (error de ejecución sugerido).

### `CAST`
`int→float`: mismo número · `float→int`: `Math.trunc` · `X→string`: `String(v)`
(`true`/`false` para bool).

### Lógicos `&&`, `||`
No hay opcode AND/OR: se compilan con **cortocircuito** mediante
`JUMP_IF_FALSE` / `JUMP_IF_TRUE`. `!` es `UNARY`.

## 4. Etiquetas y saltos
- Nombres `L1`, `L2`… únicos en todo el programa.
- Un salto solo apunta a una etiqueta del **mismo cuerpo** (`main` o la función actual).
- Sugerencia: precalcular `buildLabelIndex(body)` (exportado en `instructions.ts`).

## 5. Convención de llamadas
1. El llamador evalúa **todos** los argumentos y luego emite los `PARAM` seguidos,
   de izquierda a derecha (nunca se intercalan PARAM de llamadas distintas).
2. `CALL f, n` toma los últimos `n` valores apilados; el i-ésimo se guarda en el
   nuevo frame como variable local `f.params[i].name`.
3. Se ejecuta `f.body` desde el índice 0 con un frame nuevo (locales + temporales).
4. `RETURN v` devuelve `v` al llamador, que lo escribe en `dest` (si no es `null`).
   Las funciones `void` siempre terminan en `RETURN` (sin valor).
5. Las funciones no-void retornan en todos los caminos (lo garantiza el análisis
   semántico).

## 6. Ejemplo completo

Fuente (sintaxis de referencia):
```text
fn suma(a: int, b: int): int { return a + b; }
let i: int = 0;
while (i < 3) { print(suma(i, 10)); i = i + 1; }
```

IR (texto de `formatIR`):
```text
FUNCTION suma(a: int, b: int): int
  t1 = a + b
  RETURN t1
END

MAIN
  i = 0
L1:
  t2 = i < 3
  IF_FALSE t2 GOTO L2
  PARAM i
  PARAM 10
  t3 = CALL suma, 2
  PRINT t3
  t4 = i + 1
  i = t4
  GOTO L1
L2:
END
```

La instrucción `t2 = i < 3` como objeto:
```json
{
  "op": "BINARY", "operator": "<", "operandType": "int",
  "dest":  { "kind": "temp",  "name": "t2", "type": "bool" },
  "left":  { "kind": "var",   "name": "i", "scope": "global", "type": "int" },
  "right": { "kind": "const", "type": "int", "value": 3 }
}
```

Un intérprete de referencia (solo para pruebas) está en
[`../__tests__/reference-interpreter.ts`](../__tests__/reference-interpreter.ts)
como especificación ejecutable de este contrato.
