# CodeForge

CodeForge es un compilador educativo construido con React, Vite y TypeScript.
Las fases del compilador viven en `src/compiler/` y no dependen de React:

```text
código fuente → Lexer → Parser → AST → semántico → IR v1.0 → Runtime/VM
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

Para ejecutar la interfaz de desarrollo de Vite:

```bash
npm run dev
```

La pantalla React todavía es la plantilla inicial de Vite; las fases del
compilador se pueden probar desde los servicios y demos de consola descritos
abajo.

## Demos de consola

Mostrar tokens y AST del frontend:

```bash
npm run frontend:demo -- examples/demo.cf
```

Compilar y ejecutar un programa compatible con el AST semántico y el IR actual:

```bash
npm run compiler:run -- examples/runtime-demo.cf
```

El segundo comando imprime el IR generado y la salida del programa (`0`, `1`,
`2`, `120`). También se puede llamar al servicio desde TypeScript:

```ts
import { runSource } from './src/compiler';

const result = runSource('print(2 + 3);');
if (result.ok) console.log(result.execution.output); // ['5']
else console.error(result.stage, result.errors);
```

`runSource` coordina `parseSource`, un adaptador de AST, `compileToIR` y la VM.
La VM también se puede invocar directamente con un `IRProgram`:

```ts
import { VirtualMachine } from './src/compiler/runtime';

const result = new VirtualMachine().execute(irProgram);
```

## Estructura

| Ruta | Contenido |
| --- | --- |
| `src/compiler/lexer`, `parser`, `ast` | Frontend y AST del lenguaje |
| `src/compiler/semantic` | Scopes, tabla de símbolos y verificación de tipos |
| `src/compiler/ir` | Contrato tipado IR v1.0 y generador |
| `src/compiler/runtime` | Máquina virtual, Stack, Heap, errores y pruebas |
| `src/compiler/integration` | Puente explícito entre el AST del parser y el AST semántico |
| `src/compiler/run-source.ts` | Servicio fuente-a-ejecución independiente de React |
| `examples/` | Programas de demostración |

## Límite de integración conocido

El AST del frontend incluye arreglos, indexación y asignaciones como
expresiones. El AST semántico/IR actual no define esas construcciones. El
adaptador las informa como errores de integración en vez de traducirlas
silenciosamente. `examples/demo.cf` sirve para probar Lexer/Parser;
`examples/runtime-demo.cf` usa el subconjunto compatible para ejecutar todo el
pipeline. El equipo debe acordar el soporte de arreglos y unificar ambos
contratos antes de ejecutar programas con arreglos.

La interfaz React todavía no está conectada a `runSource`; puede integrarse
desde `App.tsx` cuando se acuerde el diseño de la UI.

## Documentación

- [Gramática](docs/GRAMATICA.md)
- [Frontend e integración](docs/INFORME_INTEGRACION_JACK.md)
- [Revisión de compatibilidad de contratos](docs/REVISION_CONTRATOS_INTEGRACION.md)
- [Prompts para coordinar acuerdos del equipo](docs/PROMPTS_COORDINACION.md)
- [Contrato IR v1.0](src/compiler/ir/README.md)
- [Runtime y API de ejecución](src/compiler/runtime/README.md)
- [Prompt de continuidad del trabajo](CONTEXTO_CONTINUACION.md)
