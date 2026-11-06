# Prompts de implementación coordinada — CodeForge

Los siguientes prompts están escritos en voz de JuanMaya8 para asignarlos a
las IAs de código de Jack y Deivid. Contienen decisiones ya tomadas para que
cada responsable implemente una parte compatible; no piden votar entre
alternativas. Ejecútense en orden: contrato común, arreglos y, finalmente, UI.

## Decisiones técnicas de JuanMaya8

1. El AST de Jack (`src/compiler/ast/nodes.ts`) será el AST canónico. Semántica e
   IR consumirán esos tipos directamente; no mantendremos un segundo AST
   semántico ni un adaptador de conversión a largo plazo.
2. Los arreglos que ya reconoce el frontend forman parte del lenguaje inicial.
   Se soportarán arreglos homogéneos y anidados, con heap de referencias y
   chequeos de límites. Los cambios incompatibles se publicarán como IR v2.0.
3. Las fases compartirán un diagnóstico tipado con etapa, código, mensaje,
   ubicación de fuente y, para Runtime, PC/instrucción. El IR conservará
   ubicaciones para poder relacionar un fallo de ejecución con la fuente.
4. La UI llamará a `runSource()` y no reimplementará fases. No se fusionará una
   rama con errores o checks pendientes ni se eludirán protecciones de GitHub.

## 1. Prompt para Jack y Deivid: AST canónico y errores comunes

```text
Soy JuanMaya8 y coordino la integración de CodeForge. Implementen la decisión
de usar el AST de Jack como contrato canónico; no me pidan escoger entre
alternativas ni cambien el lenguaje por su cuenta.

FUENTE CANÓNICA
- Usen directamente los tipos de src/compiler/ast/nodes.ts:
  Program, VariableDeclaration, BlockStatement, ReturnStatement.argument,
  ExpressionStatement, AssignmentExpression, ArrayExpression, IndexExpression,
  TypeAnnotation y position {line, column}.
- Eliminen la duplicación de src/compiler/semantic/ast-contract.ts cuando ya no
  tenga consumidores. Refactoricen semantic/type-checker.ts e
  ir/ir-generator.ts para recorrer el AST canónico; no conviertan a otro AST.
- La anotación null en retorno de FunctionDeclaration representa void; la
  anotación null de variable con inicializador significa inferencia.
- Mantengan la gramática y nodos del frontend de Jack, incluidos arreglos y
  asignaciones expresión. La fase de arreglos implementará su semántica/IR en
  el siguiente prompt.

ERRORES Y UBICACIONES
- Definan en src/compiler/errors.ts una forma compartida:
  CompilerDiagnostic = { phase: 'lexical'|'syntax'|'semantic'|'runtime',
  code: string, message: string, position?: {line:number; column:number},
  pc?: number, instruction?: string }.
- Migren errores semánticos y de Runtime a ese contrato sin perder códigos,
  ubicación ni PC. Conserven formatError o reemplácenlo por un único formatter.
- Agreguen ubicación de origen al IR generado (campo source opcional en cada
  instrucción o source map explícito por cuerpo). Runtime debe adjuntarla al
  diagnóstico además del PC cuando exista.
- Actualicen runSource() para devolver diagnostics de forma uniforme y
  eliminen src/compiler/integration/ast-adapter.ts cuando el pipeline consuma
  el AST canónico directamente.

RESTRICCIONES Y ENTREGA
- No cambien Vite, React, TypeScript ni ESLint; no hagan commit ni push.
- Trabajen en ramas asignadas y describan qué rama/archivos tocaron.
- Añadan o adapten pruebas para declaraciones, bloques, asignaciones,
  funciones, arrays en AST (aunque su ejecución llegue en la fase siguiente),
  errores léxicos/sintácticos/semánticos y posiciones.
- Ejecuten npm ci, npm test, npm run lint y npm run build. No digan que pasó
  algo que no ejecutaron.
- Entreguen un diff revisable y un resumen de incompatibilidades que hayan
  retirado. Si un punto bloquea, informen el fallo exacto sin inventar otro
  contrato.
```

## 2. Prompt para Deivid y Juan: soporte completo de arreglos en IR v2.0 y VM

```text
Soy JuanMaya8, responsable del Runtime. Implementen arreglos de punta a punta
con el AST canónico de Jack y las decisiones concretas siguientes. No dejen
arreglos aceptados por el parser pero sin soporte en backend.

TIPOS Y SEMÁNTICA
- Los arreglos son homogéneos y pueden anidarse: int[], float[][], string[],
  bool[][], etc. La forma recursiva del tipo debe preservar elementType.
- Índices son int; rechacen otros tipos en análisis semántico.
- Asignaciones `a[i] = value` exigen que value sea asignable al tipo del
  elemento. Lecturas `a[i]` producen el tipo de elemento.
- Literales vacíos solo son válidos si el contexto proporciona tipo de arreglo;
  sin contexto, reporten error de inferencia claro.
- `let a: T[];` se inicializa como arreglo vacío; cualquier índice sobre él da
  error de límites. Constantes de arreglo requieren inicializador y mantienen
  la inmutabilidad de la referencia (sus elementos sí son mutables).
- Arreglos se pasan y retornan por referencia; asignar una referencia crea un
  alias del mismo bloque. No implementen GC/free: los bloques viven hasta que
  termina la ejecución del programa.

CONTRATO IR
- Suban IR_VERSION de '1.0' a '2.0' porque cambia el tipo de los operandos y
  añade instrucciones. Actualicen docs/README, generador, printer, tests y VM
  juntos; no acepten silenciosamente IR 1.0 en la VM 2.0.
- Introduzcan un tipo recursivo IRType: primitivo int|float|string|bool o
  array con elementType IRType. ConstOperand conserva literales primitivos;
  referencias de arrays son valores de Runtime, nunca strings a parsear.
- Añadan opcodes tipados:
  ARRAY_ALLOC {dest, elementType, length},
  ARRAY_LOAD {dest, array, index},
  ARRAY_STORE {array, index, value}.
- El generador baja `[e1, ..., en]` a ARRAY_ALLOC seguido por ARRAY_STORE en
  orden. Una dimensión anidada contiene referencias a bloques interiores.
- Los operandos array deben poder asignarse, pasarse como PARAM, retornarse y
  guardarse como elementos de otros arreglos. No agreguen un opcode de length:
  la sintaxis del lenguaje aún no lo expone.

HEAP Y ERRORES
- RuntimeHeap reserva un bloque con longitud y tipo de elemento, devuelve una
  referencia tipada estable y permite leer/escribir elementos.
- ARRAY_LOAD/STORE validan referencia, tipo, índice entero y límites
  (0 <= index < length). Un fallo produce CompilerDiagnostic phase runtime con
  código estable, mensaje, PC, opcode y ubicación de fuente si está disponible.
- Heap es no movible, sin GC ni free; documentar aliasing y vida del bloque.

PRUEBAS Y ENTREGA
- Cubre literales vacíos/no vacíos, inferencia contextual, arrays anidados,
  asignación/lectura, aliasing, parámetros/retornos, recursión con arrays,
  índices negativos/fuera de rango, índice no entero, referencia inválida y
  error de versión IR.
- Ejecuta npm ci, npm test, npm run lint y npm run build.
- No cambies lexer/parser/ast para reinterpretar sintaxis; si detectas un
  defecto del AST canónico, informa la ubicación y coordina con Jack.
- No hagas commit ni push. Entrega contrato final, lista de archivos y ejemplo
  de IR v2.0 con resultado esperado.
```

## 3. Prompt para Jack: UI React, pruebas integradas y revisión del PR #1

```text
Soy JuanMaya8 y te asigno preparar la interfaz de demostración de CodeForge
después de que estén integrados el AST canónico, los diagnósticos comunes y el
IR v2.0 con arreglos. Implementa el flujo completo; no me pidas escoger entre
opciones de diseño.

UI
- Reemplaza la pantalla inicial de Vite por una interfaz educativa sencilla:
  editor de fuente con textarea, selector de ejemplos y botón Compilar y
  ejecutar. Mantén la UI accesible y adaptable; no agregues dependencias de
  editor si no son necesarias.
- Invoca solo el servicio src/compiler/run-source.ts (`runSource(source)`). No
  vuelvas a implementar lexer, parser, semántica, IR ni VM en React.
- Presenta pestañas/paneles para tokens, AST, IR, diagnósticos, salida y estado
  de depuración. Diagnósticos muestran etapa, código, mensaje, línea/columna y
  PC/opcode cuando existan. Stack y Heap deben leerse del ExecutionResult; no
  inventes datos.
- Limpia resultados obsoletos al iniciar una ejecución y muestra claramente
  fallos de compilación frente a fallos de Runtime. Incluye un ejemplo con
  arreglos y otro con función/recursión.
- Evita mostrar IR o salida de una compilación fallida como si fueran válidos.

PR Y VALIDACIÓN
- Revisa el PR #1 de Jack: comprueba diff, base/target, checks, revisiones y
  protección actual de develop. Compara los contratos con
  docs/REVISION_CONTRATOS_INTEGRACION.md y reporta cualquier discrepancia antes
  de aprobar/mergear.
- No omitas checks, no fuerces merge y no publiques a develop directamente.
  El propietario del repo decidirá el merge tras ver findings y resultados.
- Añade pruebas razonables para el servicio/UI según el test environment
  existente. Ejecuta npm ci, npm test, npm run lint y npm run build.
- Entrega un resumen del flujo, archivos modificados, pasos manuales de prueba,
  estado real del PR #1 y límites que sigan pendientes. No afirmes que abriste,
  revisaste o fusionaste un PR si no lo hiciste.
```

## Orden y aceptación

1. Jack y Deivid implementan y revisan el contrato AST/errores común.
2. Deivid y Juan implementan IR v2.0, Heap y VM para arreglos sobre ese
   contrato.
3. Jack integra la UI contra `runSource()` y revisa el PR #1.
4. Juan valida el diff integrado y las pruebas. El merge remoto de cada PR se
   hace solo cuando checks requeridos pasen y el propietario dé su aprobación.

## Estado base de esta asignación

- Rama publicada de Runtime: `origin/feature/runtime`; último commit base
  `b90aaba` (el prompt revisado aún debe publicarse).
- Build, ESLint y 140 tests pasaron en la versión base; la fase arrays/IR v2.0
  todavía no está implementada.
- El frontend actual de React era la plantilla Vite; esta asignación ahora
  autoriza reemplazarla en la rama de UI.
