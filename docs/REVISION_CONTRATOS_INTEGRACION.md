# Revisión de contratos de integración

**Alcance:** lectura de `docs/INFORME_INTEGRACION_JACK.md`, el AST del parser,
`src/compiler/semantic/ast-contract.ts`, `src/compiler/ir/instructions.ts` y el
Runtime. No se modificaron los módulos de Jack o Deivid.

## Resultado

El flujo de escalar fuente a ejecución se puede probar con un adaptador, pero
los AST de Jack y Deivid no son intercambiables directamente. El frontend
reconoce una sintaxis más amplia que la que semantic/IR puede procesar.

| Tema | Jack (frontend) | Deivid (semántico/IR) | Estado en este repositorio |
| --- | --- | --- | --- |
| Declaraciones | `VariableDeclaration`, `mutability` | `VarDeclaration`, `mutable` | El adaptador traduce ambas formas. |
| Bloques | `BlockStatement` | `Block` | El adaptador traduce ambas formas. |
| Retornos | propiedad `argument` | propiedad `value` | El adaptador traduce ambas formas. |
| Retorno de función | tipo anotado o `null` | tipo string; `void` explícito | `null` se convierte en `'void'`. |
| Asignación escalar | expresión `AssignmentExpression` | sentencia `AssignmentStatement` | Se admite como sentencia a un identificador. |
| Asignación anidada | puede ser parte de otra expresión | no existe nodo equivalente | El adaptador devuelve diagnóstico. |
| Arreglos/indexación | tipos, literales, indexación y asignación | `TypeName` e IR solo escalares | No compatible; el adaptador devuelve diagnóstico. |
| Posiciones | `position: { line, column }` | `loc: { line, column }` | El adaptador conserva la ubicación del AST. |
| Errores | `CompilerError` con `phase`, línea y columna | `SemanticError` con código y `loc`; VM con código y PC | `runSource` preserva etapa y diagnóstico; la UI debe normalizar o mostrar cada unión. |
| Runtime → fuente | AST tiene posiciones | IR no lleva source map | Error runtime identifica PC/instrucción; no se puede señalar línea fuente todavía. |

El intérprete de referencia confirma el contrato de ejecución IR v1.0: operandos
tipados, instrucciones discriminadas por `op`, temporales por frame y saltos
limitados al body actual. La VM consume esos objetos; no interpreta el texto de
`formatIR()`.

## Decisiones que Jack, Deivid y el equipo deben cerrar

1. **Arreglos:** ampliar en conjunto AST semántico, sistema de tipos, IR y
   operaciones de Heap, o quitar arreglos del lenguaje inicial y su gramática.
   El Heap actual es infraestructura; no existe un opcode que lo conecte al
   IR.
2. **AST canónico:** mantener una conversión explícita como
   `src/compiler/integration/ast-adapter.ts`, o acordar un único contrato
   compartido y eliminar la duplicación futura. No cambiar las interfaces de
   los compañeros sin aprobación conjunta.
3. **Errores:** decidir si se unifican `CompilerError`, `SemanticError` y
   `RuntimeErrorInfo` en una forma común para React. Hoy la API de integración
   devuelve una unión discriminada por `stage`, conservando los datos de cada
   fase.
4. **Depuración por línea:** decidir si el IR añade ubicación de origen a cada
   instrucción. En v1.0 el Runtime informa el PC, que identifica la instrucción,
   pero no la línea original de fuente.
5. **Merge remoto:** revisar el PR #1 y sus checks/revisiones en GitHub. La
   integración local se probó, pero no se publicó ni se fusionó remotamente.

## Comprobación disponible

El adaptador y `runSource()` permiten probar el subconjunto escalar de extremo a
extremo. `examples/runtime-demo.cf` usa funciones, recursión, variables, bucles
y `print`. `examples/demo.cf` prueba el frontend y también muestra arreglos que
todavía no puede ejecutar el backend.

Comandos verificados en Node 22.14:

```bash
npm ci
npm test
npm run lint
npm run build
npm run compiler:run -- examples/runtime-demo.cf
```
