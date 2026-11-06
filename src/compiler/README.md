# Compilador CodeForge

La implementación está separada de React. Este módulo contiene el flujo de
compilación y ofrece `runSource()` como API de servicio para pruebas y para la
futura interfaz.

```text
source → frontend.ts → AST frontend → integration/ast-adapter.ts
       → semantic + IR → runtime/VirtualMachine → resultado estructurado
```

## Fases

| Ruta | Responsabilidad | Entrada → salida |
| --- | --- | --- |
| `lexer/`, `tokens.ts` | Tokens y errores léxicos | fuente → tokens |
| `parser/`, `ast/` | Descenso recursivo y AST del frontend | tokens → AST |
| `semantic/` | Scopes, símbolos y tipos | AST semántico → diagnósticos y anotaciones |
| `ir/` | Contrato tipado v1.0 y generador | AST semántico → `IRProgram` |
| `runtime/` | Ejecución de instrucciones, memoria y errores | `IRProgram` → `ExecutionResult` |
| `integration/` | Adaptador entre los dos contratos de AST | AST frontend → AST semántico |
| `run-source.ts` | Orquestación sin dependencias de React | fuente → etapa, IR y/o ejecución |

## Ejecución

- `parseSource(source)` ejecuta solo Lexer y Parser.
- `compileToIR(program)` ejecuta análisis semántico y genera IR si no hay errores.
- `new VirtualMachine().execute(irProgram)` ejecuta directamente IR v1.0.
- `runSource(source)` encadena las fases disponibles y entrega errores de la
  fase que falló sin lanzar errores de runtime al consumidor.

`runSource()` solo traduce el subconjunto representable por el AST semántico
actual. El parser acepta arreglos e indexación, pero el contrato semántico/IR no
los modela aún; en esos casos el adaptador devuelve un diagnóstico de
integración.

Las pruebas se ejecutan con `npm test`; ejemplos: `npm run frontend:demo --
examples/demo.cf` y `npm run compiler:run -- examples/runtime-demo.cf`.
