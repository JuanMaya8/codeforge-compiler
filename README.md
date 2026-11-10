# CodeForge

CodeForge es un compilador educativo construido con React, Vite y TypeScript.
Las fases del compilador viven en `src/compiler/` y no dependen de React:

```text
código fuente → Lexer → Parser → AST canónico → semántico → IR v2.0 → Runtime/VM
```

## Requisitos

- Node.js 22.12+ de la línea 22, 24.x o 26+ (versiones compatibles con
  Vitest 5 y Vite 8).
- npm.

La integración y los comandos de esta guía se verificaron en Node 22.14.

## Preparar y probar

```bash
npm ci
npm test
npm run lint
npm run build
```

Los mismos pasos corren en GitHub Actions (`.github/workflows/ci.yml`) en cada
push y pull request hacia `develop` y `main`.

Para ejecutar la interfaz de desarrollo de Vite:

```bash
npm run dev
```

La interfaz web permite escribir un programa, compilarlo y ejecutarlo, y ver
tokens, AST, IR, diagnósticos, salida y memoria de la VM (Stack, Heap y
globales). Incluye ejemplos listos para probar; ver
[docs/INTERFAZ_WEB.md](docs/INTERFAZ_WEB.md). Las fases también se pueden probar
desde los servicios y demos de consola descritos abajo.

## Demos de consola

Mostrar tokens y AST del frontend:

```bash
npm run frontend:demo -- examples/demo.cf
```

Compilar y ejecutar un programa completo (recursión, arreglos 1D/anidados y
aliasing):

```bash
npm run compiler:run -- examples/runtime-demo.cf
```

El comando imprime el IR con posiciones de origen, la salida (`120`, `100`,
`118`, `32`) y el Heap final. También se puede llamar al servicio desde
TypeScript:

```ts
import { runSource } from './src/compiler';

const result = runSource('print(2 + 3);');
if (result.ok) console.log(result.execution?.output); // ['5']
else console.error(result.stage, result.diagnostics);
```

`runSource` encadena `parseSource`, `compileToIR` y la VM, nunca lanza
excepciones y conserva tokens, AST, IR y ejecución según la fase alcanzada.
Todos los errores usan `CompilerDiagnostic` (`src/compiler/errors.ts`).

## Estructura

| Ruta | Contenido |
| --- | --- |
| `src/compiler/lexer`, `parser`, `ast` | Frontend y AST canónico del lenguaje |
| `src/compiler/errors.ts` | Formato común de diagnósticos de todas las fases |
| `src/compiler/semantic` | Scopes, tabla de símbolos y verificación de tipos |
| `src/compiler/ir` | Contrato tipado IR v2.0 (con arreglos) y generador |
| `src/compiler/runtime` | Máquina virtual, Stack, Heap, errores y pruebas |
| `src/compiler/run-source.ts` | Servicio fuente-a-ejecución independiente de React |
| `examples/` | Programas de demostración |
| `src/App.tsx`, `src/components`, `src/services` | Interfaz React conectada solo a `runSource()` |

## Documentación

- [Gramática](docs/GRAMATICA.md)
- [Frontend e integración](docs/INFORME_INTEGRACION_JACK.md)
- [Semántica e IR](docs/INFORME_SEMANTICO_IR.md)
- [Plan por responsable](docs/PROMPTS_COORDINACION.md)
- [Contrato IR v2.0](src/compiler/ir/README.md)
- [Runtime y API de ejecución](src/compiler/runtime/README.md)
- [Interfaz web](docs/INTERFAZ_WEB.md)
- [Prompt de continuidad del trabajo](CONTEXTO_CONTINUACION.md)
- [Revisión histórica de contratos (v1.0)](docs/REVISION_CONTRATOS_INTEGRACION.md)
