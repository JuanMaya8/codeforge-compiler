# Interfaz web de CodeForge

**Responsable:** Jack-Limas · **Rama:** `feature/ui` · **Entrega B**

La interfaz convierte la plantilla de Vite en un pequeño IDE educativo: se
escribe un programa CodeForge, se compila y ejecuta con el compilador real del
equipo, y se observa cada fase (tokens, AST, IR, diagnósticos, salida y memoria
de la máquina virtual).

> La interfaz **no implementa ninguna fase del compilador**. Todo lo que
> muestra sale del resultado de `runSource()` (`src/compiler/run-source.ts`).

---

## 1. Cómo usarla

```bash
npm ci          # una sola vez
npm run dev     # abre http://localhost:5173
```

1. Elige un ejemplo en la barra lateral (o en el selector del editor), o escribe tu propio programa.
2. Pulsa **Compilar y ejecutar** (o `Ctrl` + `Enter` dentro del editor).
3. Revisa las pestañas de resultados. Si hay errores, se abre **Diagnósticos**; si todo sale bien, **Consola**.
4. Haz clic en un diagnóstico, un token, un nodo del AST o una posición del IR para ubicarlo en el editor.

Atajos del editor: `Ctrl`+`Enter` ejecuta, `Tab` indenta, `Esc` y luego `Tab` saca el foco del editor
(accesibilidad con teclado). El borrador se conserva al recargar la página si el navegador permite `localStorage`.

## 2. Arquitectura

```
src/
├── App.tsx                     Estado de la página y composición de paneles
├── main.tsx                    Punto de entrada de React (sin cambios)
├── index.css                   Tema: colores, tipografía, botones, utilidades
├── App.css                     Distribución: barra superior, lateral, editor y resultados
├── services/
│   └── compilerService.ts      ÚNICO lugar que llama a runSource()
├── hooks/
│   └── useCompiler.ts          Estado de ejecución: idle → running → finished | crashed
├── lib/                        Funciones puras de presentación (con pruebas)
│   ├── runSummary.ts           Estados de la barra superior, resultado de la ejecución, marcas del editor
│   ├── astTree.ts              Recorre el AST real y arma el árbol visual
│   ├── runtimeFormat.ts        Formato de valores de la VM (números, cadenas, referencias @n)
│   ├── tokenCategory.ts        Categoría visual de cada tipo de token (solo color)
│   ├── sourceText.ts           Conversión línea:columna ↔ posición en el texto
│   ├── status.ts               Tipo de los indicadores de estado
│   └── storage.ts              Acceso seguro a localStorage
├── examples/
│   └── programs.ts             11 programas de ejemplo (+ pruebas contra runSource)
└── components/
    ├── layout/                 TopBar, Logo, íconos
    ├── editor/                 EditorPanel y CodeEditor (textarea + números de línea)
    ├── examples/               Lista lateral y selector de ejemplos
    ├── diagnostics/            DiagnosticsView
    └── results/                ResultsPanel (pestañas), TokensView, AstView, IrView,
                                ConsoleView, MemoryView, EmptyState
```

**Separación de responsabilidades:**

| Capa | Responsabilidad | Depende de |
| ---- | --------------- | ---------- |
| `services/compilerService.ts` | Llamar a `runSource()` y medir el tiempo | `src/compiler` (API pública) |
| `hooks/useCompiler.ts` | Estado de la ejecución, limpieza de resultados, errores inesperados | el servicio |
| `lib/` | Transformar el resultado en textos, colores y árboles (puras) | tipos de `src/compiler` |
| `components/` | Dibujar | `lib/` y tipos |

Los componentes importan solo **tipos** y los formateadores públicos
(`formatInstruction`, `formatIR`, `formatIRType`, `formatDiagnostic`) desde
`src/compiler/index.ts`. Ningún componente importa el Lexer, el Parser, la
semántica, el generador de IR ni la VM.

## 3. Integración con `runSource()`

```ts
// src/services/compilerService.ts
import { runSource, type SourceRunResult } from '../compiler';

export function compileAndRun(source: string): CompilationRun {
  const start = performance.now();
  const result = runSource(source);
  return { source, result, durationMs: performance.now() - start };
}
```

`SourceRunResult` (contrato de JuanMaya8) trae todo lo que la interfaz muestra:

| Campo | Pestaña | Notas |
| ----- | ------- | ----- |
| `tokens` | Tokens | Siempre presente (aunque haya errores léxicos). |
| `ast` | AST | `null` si falló el Lexer; parcial si falló el Parser. |
| `ir` | IR | Solo si se superó el análisis semántico. |
| `diagnostics` | Diagnósticos | `CompilerDiagnostic[]` de la fase que falló. |
| `execution.output`, `.status`, `.steps`, `.error` | Consola | Solo si se ejecutó la VM. |
| `execution.pc`, `.functionName`, `.instruction`, `.stack`, `.heap`, `.globals` | Memoria | Estado final de la VM. |
| `ok`, `stage` | Barra superior | `stage`: `lexical`, `syntax`, `semantic`, `runtime` o `completed`. |

## 4. Flujo de una ejecución

```
Clic en "Compilar y ejecutar"
  │
  ├─ editor vacío → mensaje de aviso, no se ejecuta nada
  │
  └─ useCompiler.run(source)
       1. estado = running   → se BORRAN los resultados anteriores, se muestra el indicador de carga
       2. espera ~40 ms      → React alcanza a pintar el estado de carga
       3. compileAndRun()    → runSource(): Lexer → Parser → Semántica → IR → VM
       4. estado = finished  → se abre Diagnósticos (si falló) o Consola (si terminó bien)
          (si algo lanzara una excepción: estado = crashed, sin mostrar resultados parciales)
```

- Si se ejecuta de nuevo antes de terminar, la ejecución vieja se descarta.
- Si el código cambia después de ejecutar, aparece **"El código cambió desde la última ejecución"**
  y las marcas del editor se ocultan, porque ya no corresponden a ese texto.
- Un bucle infinito no congela la interfaz: la VM se detiene con `STEP_LIMIT` (100 000 pasos).

## 5. Cómo interpretar cada pestaña

### Tokens
Tabla con cada token del Lexer: **tipo**, **lexema** (texto exacto), **valor literal**
(número o cadena ya convertidos), **línea** y **columna**. El color indica la categoría:
palabra reservada, tipo, número, cadena, identificador u operador/delimitador. El último
token siempre es `EOF`. Con errores léxicos, los lexemas inválidos no aparecen.

### AST
Árbol expandible del programa. Cada fila muestra:
`campo del padre: Kind  datos principales  ◎línea:columna`, por ejemplo
`initializer: LiteralExpression int 21 ◎1:16`. Los campos `null` se muestran
(`returnType: null` significa función sin valor de retorno). El modo **JSON** muestra
el objeto exacto que recibe el análisis semántico.

### IR
Código de tres direcciones (IR v2.0) generado por el análisis semántico. Se muestra
`MAIN` (donde empieza la ejecución) y cada función, con su **PC** (índice de la
instrucción en su cuerpo), **opcode**, instrucción y **origen** (línea:columna del código
fuente). Las variables globales aparecen con su tipo. La instrucción donde terminó o
falló la VM queda resaltada. El modo **Texto** usa el *printer* oficial `formatIR`.

### Diagnósticos
Errores reales con el contrato común `CompilerDiagnostic`: **fase**, **código** estable,
**mensaje**, **línea**, **columna** y, en ejecución, **PC** e **instrucción**. Cada fase
tiene su color (léxico rosa, sintáctico naranja, semántico amarillo, ejecución rojo) y
también se marca en el margen del editor.

### Consola
Salida real de `print()` y el estado de la ejecución:

| Caso | Qué se ve |
| ---- | --------- |
| Ejecución completada | ✓ verde, líneas de salida, pasos y tiempo |
| Programa sin salida | ✓ verde y "(sin salida)" |
| Ejecución fallida | ✕ rojo, la salida impresa antes del error y el diagnóstico runtime |
| Error de compilación | ✕ y aviso de que la VM no se ejecutó, con enlace a Diagnósticos |

### Memoria
Estado final de la máquina virtual (`ExecutionResult`):

- **Estado final**, **Program Counter** (PC y cuerpo), **instrucción** final o que falló y **pasos**.
- **Stack**: frames desde el tope (llamada más interna) hasta `<main>`, con argumentos,
  locales y temporales. *La VM entrega el Stack vacío cuando la ejecución termina bien*
  (ya desapiló todos los frames); se ve lleno cuando ocurre un error en ejecución.
- **Heap**: un bloque por arreglo, con dirección `@n`, tipo de elemento y valores. Una
  matriz `int[][]` es un bloque de referencias a otros bloques.
- **Variables globales** con su tipo (del IR) y su valor final.

Las referencias `@n` son botones: llevan al bloque correspondiente del Heap.

## 6. Ejemplos incluidos

| Ejemplo | Qué demuestra | Resultado esperado |
| ------- | ------------- | ------------------ |
| Hola mundo y aritmética | `print`, precedencia, división entera | `Hola, CodeForge!`, `14`, `20`, `3`, `2`, `15`, `3` |
| Variables y constantes | `let`, `const`, inferencia, reasignación | `12.56`, `Ana tiene`, `21`, `true` |
| Condicionales if / else | `if`, `else if`, `&&`, `\|\|`, `!` | `Aprobado`, `No puede ingresar`, `Supera el 50` |
| Ciclos while | acumuladores y ciclos anidados | `55`, `3`, `6`, `9`, `12`, `15`, `6` |
| Funciones | parámetros, retorno, función sin retorno | `26`, `5`, `3.5`, `Hola, CodeForge` |
| Recursividad | factorial, Fibonacci, potencia | `120`, `55`, `256` |
| Arreglos | Heap, paso por referencia, alias, matrices | `2`, `20`, `100`, `32`, `compilador educativo` |
| Error léxico | `12abc`, `@`, cadena sin cerrar | 3 diagnósticos `lexical` |
| Error sintáctico | falta `;`, expresión vacía, `if` sin llaves | 4 diagnósticos `syntax` |
| Error semántico | tipos, constante, variable no declarada | 4 diagnósticos `semantic` |
| Error en ejecución | índice fuera de rango dentro de una función | salida `10` y `HEAP_OUT_OF_BOUNDS` con PC |

Todos se verifican automáticamente contra el compilador real en
`src/examples/programs.test.ts`.

Comportamientos del compilador que conviene conocer al probar:
`17 / 5` da `3` (división entera entre `int`), los `float` se imprimen sin `.0`
(`7.5 * 2.0` → `15`), `"a" + 5` es un error semántico y `print` no acepta arreglos.

## 7. Pruebas

```bash
npm test        # todas las pruebas del proyecto
npm run lint
npm run build
```

| Archivo | Qué prueba |
| ------- | ---------- |
| `src/examples/programs.test.ts` | Cada ejemplo con `runSource()` real: fase, salida y códigos de diagnóstico. |
| `src/lib/lib.test.ts` | Funciones de presentación: estados, árbol del AST, valores de la VM, posiciones. |
| `src/components/interface.test.tsx` | Renderiza la aplicación y cada pestaña con resultados reales (`react-dom/server`): éxito, errores de cada fase, carga, interrupción y resultados desactualizados. |

No se agregaron dependencias: las pruebas de componentes usan `react-dom/server`, que ya
viene con React.

## 8. Accesibilidad y diseño

- Tema oscuro con acentos violeta; contraste alto en texto principal.
- Pestañas con roles ARIA (`tablist`, `tab`, `tabpanel`) y navegación con flechas.
- Árbol del AST con roles `tree` / `treeitem` y `aria-expanded`.
- Estados anunciados con `aria-live` / `role="status"`.
- Editor usable solo con teclado (`Esc` + `Tab` para salir).
- Diseño adaptable: barra lateral visible desde 1024 px; en pantallas pequeñas los
  ejemplos se eligen desde el selector del editor.
- Se respetan `prefers-reduced-motion` y se desactivan las ligaduras tipográficas en el
  código para que `>=` o `->` se vean tal como se escriben.
