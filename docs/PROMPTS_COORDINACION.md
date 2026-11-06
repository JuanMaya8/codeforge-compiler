# Prompts de coordinación del equipo CodeForge

Estos prompts son propuestas de JuanMaya8 para compartir con Jack y Deivid. El
objetivo es cerrar decisiones técnicas explícitas antes de ampliar contratos o
fusionar trabajo remoto. No representan aprobación previa de los demás
integrantes.

## 1. Arreglos: AST, tipos, IR y Heap

```text
Soy JuanMaya8, responsable del Runtime de CodeForge. Quiero que acordemos en
equipo el alcance de arreglos antes de cambiar código.

Estado observado:
- El frontend de Jack acepta tipos T[], literales [a, b], indexación a[i] y
  asignaciones a[i] = valor.
- El AST semántico de Deivid y el IR v1.0 actual son escalares y no tienen
  instrucciones para reservar, leer o escribir memoria de arreglos.
- El Runtime tiene un Heap educativo, pero todavía no está conectado al IR.

Propongo decidir una sola opción para la primera entrega:
A. Excluir arreglos del alcance inicial, actualizar gramática/ejemplos y emitir
   un error claro si se intenta ejecutar uno.
B. Acordar una versión nueva del contrato que soporte arreglos de punta a punta.

Si elegimos B, definamos antes de programar:
1. Tipos de arreglo y reglas de homogeneidad/dimensiones.
2. Representación de referencia y layout del bloque en Heap.
3. Instrucciones IR tipadas para reservar, cargar y guardar elementos, con
   comportamiento para índices inválidos.
4. Actualización/versionado de IR_VERSION y casos de pruebas del generador y VM.
5. Responsables de AST, semántica, IR, Heap y pruebas.

Por favor responde con A o B, el contrato concreto propuesto y cualquier
objeción. No cambies archivos hasta que Jack, Deivid y Juan confirmen la misma
decisión. Registraremos el acuerdo en la documentación del proyecto.
```

## 2. Contrato común de AST y errores

```text
Soy JuanMaya8. Revisé el informe de Jack y los tipos actuales de Jack y Deivid.
Los AST no coinciden directamente: Jack usa VariableDeclaration,
BlockStatement, ReturnStatement.argument y AssignmentExpression; Deivid usa
VarDeclaration, Block, ReturnStatement.value y AssignmentStatement. También
difieren las ubicaciones (position frente a loc) y los errores (CompilerError,
SemanticError y RuntimeErrorInfo).

Hay un adaptador temporal en src/compiler/integration/ast-adapter.ts. Traduce
el subconjunto escalar y rechaza explícitamente las estructuras que el AST
semántico no representa. No quiero mantener dos contratos accidentalmente.

Propongo acordar:
1. Si conservamos el AST de Jack como canónico y Deivid adopta sus tipos, o si
   mantenemos ambos con un adaptador oficial y dueño definido.
2. Forma única de ubicación de origen (línea/columna) y cómo se conserva al
   generar IR.
3. Forma común de diagnóstico: etapa, código estable, mensaje, ubicación y,
   para runtime, PC/instrucción.
4. Qué construcciones quedan soportadas en la primera versión y cuáles deben
   producir diagnósticos claros.

Por favor revisa docs/REVISION_CONTRATOS_INTEGRACION.md y responde con una
propuesta campo por campo, archivos que cambiarían, riesgos de compatibilidad
y pruebas necesarias. No hagas cambios todavía. Cerramos el acuerdo cuando
Jack, Deivid y Juan confirmen la misma forma.
```

## 3. UI React, pruebas integradas y PR #1

```text
Soy JuanMaya8 y propongo preparar la demostración integrada de CodeForge sin
mezclar todavía contratos que no estén aprobados.

El servicio independiente de React ya expone runSource(source): pasa por el
frontend, el adaptador, semántica/IR y Runtime para el subconjunto compatible.
La UI actual sigue siendo la plantilla Vite. El comando
`npm run compiler:run -- examples/runtime-demo.cf` valida el pipeline y muestra
IR y salida.

Propongo que Jack lidere la UI y que el equipo acuerde una primera pantalla que
permita editar/ejecutar fuente y mostrar:
- tokens y AST cuando el frontend termina correctamente;
- errores con fase, código y línea/columna;
- IR generado, salida de print, estado y error de Runtime;
- PC/instrucción actual y snapshots de Stack/Heap para depuración.

La UI debe explicar o deshabilitar las construcciones que aún no soporta el
backend (por ejemplo, arreglos); no debe presentar una ejecución parcial como
correcta. Definamos quién normaliza los errores y qué paneles entran en el MVP.

Además, revisemos el PR #1 de Jack: comprobar su diff, estado actual de CI,
reviews y reglas de develop; ejecutar `npm ci`, `npm test`, `npm run lint` y
`npm run build` en la integración candidata; publicar findings antes de
aprobarlo. La integración local probada no equivale a que el PR remoto esté
fusionado. No se debe omitir checks o protección de rama.

Por favor responde con alcance UI, responsable, criterios de aceptación, estado
actual del PR/checks y cualquier bloqueo. No hagas merge remoto hasta que las
revisiones requeridas y los checks estén claros y el equipo dé el visto bueno.
```

## Estado al redactar estos prompts

- Rama local actual: `feature/runtime`.
- La prueba local más reciente pasó `npm ci`, `npm test` (9 archivos, 140
  pruebas), `npm run lint`, `npm run build` y el demo `compiler:run`.
- Los merges locales de `feature/lexer-parser` y `feature/semantic-ir` se
  incluyeron en `feature/runtime`.
- El trabajo se publicó en `origin/feature/runtime` con commit `05fce50` a
  nombre de JuanMaya8. No se ha creado un PR de Runtime ni se ha fusionado el
  PR #1 de Jack a `develop`.
