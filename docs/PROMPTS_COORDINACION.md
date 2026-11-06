# Plan y prompts por responsable — CodeForge

Este documento asigna trabajo concreto a Jack, Deivid y JuanMaya8. Las
decisiones están tomadas para que las IAs implementen un contrato compatible;
no deben proponer votaciones ni cambiar el alcance por su cuenta.

## Decisiones técnicas y orden

1. El AST de Jack en `src/compiler/ast/nodes.ts` será canónico. Semántica e IR
   consumirán esos nodos directamente; se retirará el AST duplicado de
   `semantic/ast-contract.ts` y el adaptador temporal.
2. Arreglos homogéneos, anidados e indexación forman parte de la primera versión
   funcional. El backend usará referencias del Heap y errores de límites.
3. Cambios incompatibles al IR se versionan como `2.0`. El contrato será
   recursivo (`IRType`) y usará `ARRAY_ALLOC`, `ARRAY_LOAD` y `ARRAY_STORE`.
4. Todos los errores usarán `CompilerDiagnostic` común con fase, código,
   mensaje, ubicación y datos de PC/instrucción cuando apliquen. Las
   instrucciones IR conservarán origen para localizar errores runtime.
5. Todos los PR tienen como destino `develop`; nadie publica directamente a
   `develop`. Integrar en este orden: contrato de Jack, semántica/IR de Deivid,
   Runtime de Juan y finalmente UI de Jack.

## Prompt 1 — Jack: contrato canónico y UI

```text
Soy JuanMaya8. Implementa las tareas de Jack en dos entregas separadas y no
esperes a que yo elija opciones: las decisiones y el contrato están fijados
abajo.

ENTREGA A: AST, ERRORES Y PR #1
Rama: feature/lexer-parser (ya existe; actualiza el PR #1 abierto a develop).
Archivos bajo tu responsabilidad:
- src/compiler/ast/nodes.ts y sus pruebas: este es el AST canónico que deben
  consumir las demás fases. Conserva arrays, tipos T[], AssignmentExpression,
  ArrayExpression, IndexExpression y position {line,column}.
- src/compiler/errors.ts y pruebas: define y documenta
  CompilerDiagnostic = { phase: 'lexical'|'syntax'|'semantic'|'runtime',
  code: string, message: string, position?: SourcePosition, pc?: number,
  instruction?: string }. Mantén funciones de formato si son útiles, pero usa
  este formato común.
- No cambies semantic/, ir/ ni runtime/. Deivid y Juan actualizarán sus fases
  para consumir este contrato.

Revisa el PR #1 actual y actualízalo con esta entrega. Comprueba y reporta su
estado real de checks/reviews; no fuerces el merge ni ignores protección.

ENTREGA B: UI (solo después de que el servicio runSource esté listo)
Crea feature/ui desde el develop actualizado, no reutilices la rama del
frontend ya fusionada. Modifica App.tsx y estilos/componentes de UI, no
semantic/, ir/ ni runtime/.
- Crea una interfaz educativa con editor textarea, selector de ejemplos y
  botón Compilar y ejecutar.
- Consume exclusivamente runSource(source) desde src/compiler; no reimplementes
  ninguna fase en React.
- Muestra tokens, AST, IR, diagnósticos, salida, estado y depuración de PC,
  instrucción, Stack y Heap usando los datos reales del resultado.
- Muestra errores con fase/código/mensaje/posición y PC cuando existan. Borra
  resultados viejos al iniciar una ejecución y no presentes resultados
  parciales como ejecución correcta.
- Incluye ejemplo con arrays y ejemplo con recursión.

PRUEBAS Y PUBLICACIÓN
- Entrega A: push a feature/lexer-parser y actualiza PR #1 -> develop.
- Entrega B: push a feature/ui y abre PR -> develop después de que
  feature/runtime haya integrado el servicio.
- Ejecuta npm ci, npm test, npm run lint y npm run build para cada entrega.
- No hagas push directo a develop ni merges automáticos. Resume archivos,
  comandos ejecutados, checks reales y pasos para probar la UI.
```

## Prompt 2 — Deivid: AST canónico, semántica y IR v2.0

```text
Soy JuanMaya8. Implementa el backend semántico y el generador IR usando las
decisiones cerradas a continuación. No mantengas un AST duplicado ni preguntes
qué opción elegir.

Rama: feature/semantic-ir. Trabaja en semantic/, ir/ y pruebas/documentación de
esas fases. Primero actualiza la rama con el contrato canónico de Jack una vez
que la Entrega A del PR #1 esté integrada en develop.

AST Y ERRORES
- Importa tipos directamente de src/compiler/ast/nodes.ts.
- Refactoriza semantic/type-checker.ts e ir/ir-generator.ts para nodos
  VariableDeclaration, BlockStatement, ReturnStatement.argument,
  ExpressionStatement, AssignmentExpression, ArrayExpression e
  IndexExpression.
- Elimina semantic/ast-contract.ts y tipos duplicados cuando no tengan
  consumidores.
- Usa CompilerDiagnostic de src/compiler/errors.ts; errores semánticos llevan
  phase='semantic', code estable y posición del nodo.
- Null en retorno de función significa void; null en anotación de variable con
  inicializador significa inferencia. Mantén las reglas semánticas ya
  documentadas.

TIPOS Y ARREGLOS
- Modela recursivamente tipos homogéneos: int[], float[][], string[], bool[][].
- Índice debe ser int; ARRAY_LOAD produce el tipo de elemento; ARRAY_STORE
  exige un valor asignable a ese tipo.
- Un arreglo declarado sin inicializador es vacío. Literal [] necesita tipo
  contextual; sin contexto, error de inferencia. Const requiere inicializador;
  const protege la referencia, no vuelve inmutables sus elementos.
- Los arreglos se asignan, pasan a funciones y se retornan por referencia.
  Asignar una referencia produce alias al mismo bloque.

IR v2.0
- Cambia IR_VERSION de '1.0' a '2.0'. La VM no aceptará IR 1.0 tras el cambio.
- Define IRType recursivo: primitivo int|float|string|bool, o array con
  elementType: IRType. Actualiza types de operandos, temporales, variables,
  parámetros, retornos, globals y locals sin convertir referencias a strings.
- Añade:
  ARRAY_ALLOC { dest, elementType, length }
  ARRAY_LOAD { dest, array, index }
  ARRAY_STORE { array, index, value }
- Genera un ARRAY_ALLOC y luego ARRAY_STOREs en orden para literales; una
  dimensión interior contiene referencias a sus propios bloques.
- Agrega ubicación de fuente a las instrucciones (o un source map por body) y
  actualiza printer, documentación y pruebas. No agregues opcode de length:
  el lenguaje aún no define esa operación.

ENTREGA
- Prueba arrays vacíos/contextuales, literales, arrays anidados, indexación,
  asignación, aliasing, argumentos/retornos, incompatibilidad de tipos e
  índices no enteros.
- Ejecuta npm ci, npm test, npm run lint y npm run build.
- Push solo a feature/semantic-ir; PR hacia develop después de la Entrega A.
  No toques runtime/ ni publiques directamente a develop. Informa contrato
  final, archivos y resultado de checks.
```

## Prompt 3 — JuanMaya8: VM, Heap y servicio de ejecución

```text
Soy JuanMaya8 y soy responsable del Runtime e integración del pipeline.
Implementa la VM para el IR v2.0 acordado; no cambies semantic/ ni ir/ para
adaptarlos localmente ni introduzcas un IR paralelo.

Rama: feature/runtime. Actualízala con develop después de que el PR de Deivid
quede integrado. Archivos bajo tu responsabilidad: src/compiler/runtime/,
src/compiler/run-source.ts, src/compiler/index.ts, tests Runtime, demo y su
script CLI. No modifiques errores.ts ni AST; impórtalos.

VM Y HEAP
- Mantén PC por frame, mapa de etiquetas por body, temporales independientes,
  globals, parámetros, locals, CALL/RETURN, recursión, PRINT y límite de pasos.
- El Heap guarda bloques tipados y devuelve referencias estables. Los arrays se
  pasan/retornan y se asignan por referencia; no implementes GC/free.
- Implementa ARRAY_ALLOC/LOAD/STORE exactamente como los define
  src/compiler/ir/instructions.ts. Valida referencia, tipo, índice entero y
  límites 0 <= i < length. Falla con CompilerDiagnostic phase='runtime', código
  estable, mensaje, PC, opcode y ubicación de fuente si existe.
- La ejecución acepta solo IR_VERSION '2.0'. Devuelve resultado estructurado
  con estado, salida, error/diagnósticos, PC/instrucción, snapshots de Stack y
  Heap y globals. Los errores no deben escapar como excepciones a React.

SERVICIO
- Elimina src/compiler/integration/ast-adapter.ts cuando semantic/ consuma el
  AST canónico.
- Actualiza runSource(source) para encadenar frontend -> semántica/IR -> VM,
  devolver CompilerDiagnostic uniforme y preservar tokens, AST, IR y resultado
  según la fase alcanzada.
- Mantén el Runtime independiente de React. La UI de Jack llamará al servicio,
  no a partes internas de la VM.

PRUEBAS Y PUBLICACIÓN
- Añade casos end-to-end con arrays 1D/anidados, aliasing, función que recibe y
  retorna arrays, recursión, bounds negativos/superiores, referencia inválida,
  error runtime con PC/posición y programa IR versión incorrecta.
- Actualiza examples/runtime-demo.cf para mostrar arrays y recursión.
- Ejecuta npm ci, npm test, npm run lint, npm run build y
  npm run compiler:run -- examples/runtime-demo.cf.
- Push solo a feature/runtime y abre/actualiza su PR -> develop después del PR
  semántico. No hagas push directo a develop ni merges automáticos. Informa
  diff, resultados reales y cualquier bloqueo.
```

## Dónde subir cada entrega

| Responsable | Rama de trabajo | Entrega | PR destino |
| --- | --- | --- | --- |
| Jack | `feature/lexer-parser` | AST canónico, errores comunes; actualiza PR #1 | `develop` |
| Deivid | `feature/semantic-ir` | AST canónico, semántica, arrays e IR v2.0 | `develop`, después de Jack |
| JuanMaya8 | `feature/runtime` | Heap, VM v2.0, `runSource` y demo CLI | `develop`, después de Deivid |
| Jack | `feature/ui` | interfaz React conectada a `runSource` | `develop`, después de Juan |

Todos hacen push a su rama y abren/actualizan su PR hacia `develop`; nadie
sube directamente a `develop`. Antes de cada merge, Juan revisa diff, tests,
checks, reviews y política actual del repositorio. El merge se hace solo cuando
los checks requeridos pasan y la revisión humana está completa.

## Línea base de este plan

- `origin/feature/runtime` contiene la VM IR v1.0 y el servicio escalar previo.
- En esa línea base pasaron `npm ci`, `npm test` (9 archivos/140 tests),
  `npm run lint`, `npm run build` y el demo escalar.
- AST canónico común, arreglos IR v2.0 y UI React son el trabajo que este plan
  asigna; no afirmes que ya están implementados.
