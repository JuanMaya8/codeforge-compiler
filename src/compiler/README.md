# Compilador CodeForge

La implementación está separada de React. Este módulo contiene el flujo de
compilación y ofrece `runSource()` como API de servicio para pruebas y para la
interfaz.

```text
source → frontend.ts (Lexer + Parser) → AST canónico (ast/nodes.ts)
       → semantic + IR v2.0 → runtime/VirtualMachine → resultado estructurado
```

## Fases

| Ruta | Responsabilidad | Entrada → salida |
| --- | --- | --- |
| `lexer/`, `tokens.ts` | Tokens y errores léxicos | fuente → tokens |
| `parser/`, `ast/` | Descenso recursivo y AST canónico | tokens → AST |
| `semantic/` | Scopes, símbolos y tipos (incluye arreglos) | AST → diagnósticos y anotaciones |
| `ir/` | Contrato tipado v2.0 y generador | AST → `IRProgram` |
| `runtime/` | VM, Stack, Heap y errores de ejecución | `IRProgram` → `ExecutionResult` |
| `errors.ts` | `CompilerDiagnostic` común a todas las fases | — |
| `run-source.ts` | Orquestación sin dependencias de React | fuente → `SourceRunResult` |

## Servicio `runSource`

```ts
import { runSource } from './compiler';

const result = runSource(code);
result.ok          // true solo si todas las fases terminaron y el programa corrió completo
result.stage       // 'lexical' | 'syntax' | 'semantic' | 'runtime' | 'completed'
result.diagnostics // CompilerDiagnostic[] de la fase que falló
result.tokens, result.ast, result.semantic, result.ir, result.execution
```

Se conservan los datos de todas las fases que se ejecutaron (`null` para las que
no). `runSource` nunca lanza excepciones: un fallo inesperado se devuelve como
diagnóstico `INTERNAL_ERROR` de la fase en curso. La UI debe usar solo este
servicio, no partes internas de la VM.

## Ejecución

- `parseSource(source)` ejecuta solo Lexer y Parser.
- `compileToIR(program)` ejecuta análisis semántico y genera IR si no hay errores.
- `new VirtualMachine().execute(irProgram)` ejecuta IR v2.0 (ver `runtime/README.md`).

Las pruebas se ejecutan con `npm test`; ejemplos: `npm run frontend:demo --
examples/demo.cf` y `npm run compiler:run -- examples/runtime-demo.cf`.
