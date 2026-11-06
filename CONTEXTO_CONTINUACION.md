# Prompt de continuidad — CodeForge

Actúa como ingeniero de software en `C:\Users\Acer\Desktop\codeforge-compiler`.
Antes de editar, revisa `git status --short --branch`, `git branch -avv` y
`git worktree list`. Conserva los cambios actuales y respeta los contratos de
Jack y Deivid descritos aquí.

## Objetivo

Dejar CodeForge listo para que el equipo termine la interfaz y acuerde el
soporte de arreglos, con un camino reproducible para compilar y ejecutar
programas. El Runtime implementa IR v1.0; `runSource()` prueba el pipeline para
el subconjunto que los contratos AST actuales pueden representar.

## Ramas y GitHub

- Rama activa local: `feature/runtime`, HEAD `cf0af19`.
- `develop` local: `b7f0c2a`; integra localmente lexer/parser y semantic/IR.
- `origin/develop`: `f8404df`; no se ha hecho push.
- Ramas remotas vistas: `origin/develop`, `origin/feature/lexer-parser`,
  `origin/feature/semantic-ir`.
- PR #1 de Jack (`feature/lexer-parser` → `develop`) estaba abierto y
  mergeable/clean, pero GitHub devolvía estado `pending` con cero
  checks/statuses y cero reviews. La API de protección de `develop` respondió
  Unauthorized. No fuerces merge remoto ni publiques cambios mientras no se
  confirme política y revisión de contratos.
- `feature/semantic-ir` no tiene PR.
- El worktree y la referencia locales temporales `integration-review` ya se
  eliminaron. `develop` y `feature/runtime` conservan los commits integrados.
- No hagas commits ni pushes automáticos. El usuario pidió preparar la
  integración local; los cambios de código de esta tarea siguen sin commit.

## Contratos y límite de integración

- Jack: `parseSource()` devuelve el AST de `src/compiler/ast/nodes.ts`, con
  nodos `VariableDeclaration`, `BlockStatement`, `AssignmentExpression`,
  `ArrayExpression` e `IndexExpression`.
- Deivid: `compileToIR()` consume el AST diferente de
  `src/compiler/semantic/ast-contract.ts`: `VarDeclaration`, `Block`,
  `AssignmentStatement`; `TypeName` solo cubre tipos escalares. IR v1.0 está
  definido en `src/compiler/ir/instructions.ts`.
- `src/compiler/integration/ast-adapter.ts` traduce las estructuras
  compatibles sin editar lexer/parser/ast/semantic/ir. Reporta arreglos,
  indexación y asignaciones dentro de expresiones como errores de integración;
  no los simules.
- `src/compiler/run-source.ts` encadena `parseSource` → adaptador →
  `compileToIR` → VM y devuelve la etapa que falló.
- La VM recibe IR, no texto ni fuente. Heap es estructura educativa; IR v1.0 no
  tiene opcodes de memoria dinámica o arreglos.

## Cambios listos en el workspace

- Runtime en `src/compiler/runtime/`: VM, Stack, Heap, errores y pruebas.
- Servicio de integración en `src/compiler/integration/` y
  `src/compiler/run-source.ts`; exports en `src/compiler/index.ts`.
- Demo ejecutable `examples/runtime-demo.cf` mediante
  `npm run compiler:run -- examples/runtime-demo.cf`.
- README raíz y `src/compiler/README.md` explican fases, comandos y límites.
- `frontend:demo` corre con Node type stripping. Entorno probado: Node 22.14;
  Vitest requiere Node 22.12+ dentro de sus versiones soportadas.

## Verificación limpia

Ejecutada después de `npm ci` en Node 22.14:

- `npm test`: **9 archivos, 140 tests aprobados**. La cuenta previa de 266 era
  por duplicados dentro del worktree temporal anidado, ya eliminado.
- `npm run build`: pasó.
- `npm run lint`: pasó.
- `npm run compiler:run -- examples/runtime-demo.cf`: pasó; salida `0`, `1`,
  `2`, `120`.
- `npm run frontend:demo -- examples/demo.cf`: pasó; Node muestra el warning
  esperado porque `--experimental-strip-types` aún es experimental.

Repite esas comprobaciones tras modificar TypeScript o scripts.

## Pendientes del equipo

1. Jack y Deivid deben acordar si los arreglos e indexación se implementan de
   punta a punta (AST semántico, tipos, IR y Heap) o se excluyen del lenguaje
   inicial. No editar sus carpetas sin coordinación.
2. Revisar los contratos de AST y errores explicados en
   `docs/INFORME_INTEGRACION_JACK.md` y
   `docs/REVISION_CONTRATOS_INTEGRACION.md` antes del merge remoto.
3. La UI React todavía es la plantilla Vite y no invoca `runSource()`; integrarla
   cuando se acuerde el diseño.
4. Revisar PR #1 y la protección/checks actuales antes de cualquier merge
   remoto. El remoto no ha recibido los merges locales.

## Comandos para empezar

```bash
npm ci
npm test
npm run lint
npm run build
npm run compiler:run -- examples/runtime-demo.cf
npm run dev
```
