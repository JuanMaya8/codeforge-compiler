# Prompt de continuidad — CodeForge

Actúa como ingeniero de software en `C:\Users\Acer\Desktop\codeforge-compiler`.
Antes de editar, revisa `git status --short --branch`, `git branch -avv` y
`git worktree list`. Respeta el plan de `docs/PROMPTS_COORDINACION.md`.

## Estado (2026-11-08)

- Contratos unificados: AST canónico de Jack (`src/compiler/ast/nodes.ts`),
  `CompilerDiagnostic` común (`src/compiler/errors.ts`), IR v2.0 de Deivid con
  `ARRAY_ALLOC/LOAD/STORE` y posiciones de origen.
- Runtime (JuanMaya8) en `feature/runtime`: VM v2.0, Heap tipado, errores como
  `CompilerDiagnostic` con PC/opcode/posición y `runSource()` encadenando
  frontend → semántica/IR → VM. El adaptador temporal de AST se eliminó.
- CI: `.github/workflows/ci.yml` (npm ci, test, lint, build y demo).
- `develop` no tiene protección de rama ni rulesets en GitHub; el equipo acordó
  integrar solo mediante PR revisado.

## Orden de integración en `develop`

1. PR #1 `feature/lexer-parser` (Jack).
2. PR `feature/semantic-ir` (Deivid).
3. PR `feature/runtime` (Juan); tras los dos anteriores su diff queda solo en
   Runtime, servicio, demo, CI y documentación.
4. `feature/ui` (Jack) desde el `develop` actualizado, consumiendo solo
   `runSource()`.

## Verificación de referencia (feature/runtime, Node 22.14)

- `npm ci`, `npm run lint`, `npm run build`: pasan.
- `npm test`: 11 archivos, 191 tests.
- `npm run compiler:run -- examples/runtime-demo.cf`: salida `120`, `100`,
  `118`, `32` y estado `completed`.
- `npm audit`: 0 vulnerabilidades de producción; 10 moderadas en ESLint
  (`minimatch`, solo desarrollo) cuya única corrección es un cambio mayor.

## Comandos para empezar

```bash
npm ci
npm test
npm run lint
npm run build
npm run compiler:run -- examples/runtime-demo.cf
npm run dev
```
