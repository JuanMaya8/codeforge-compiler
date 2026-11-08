# Informe de integración: frontend del compilador (Lexer, Tokens, Parser y AST)

**Autor:** Jack-Limas
**Rama:** `feature/lexer-parser` → PR #1 hacia `develop`
**Para:** DeividJulian (semántico, tabla de símbolos, scopes, tipos e IR) y JuanMaya8 (máquina virtual, Stack, Heap y ejecución)

> **Actualización (Entrega A del plan `PROMPTS_COORDINACION.md`):**
> el AST de `src/compiler/ast/nodes.ts` es el **contrato canónico** que
> consumen directamente semántica e IR, y todos los errores usan el
> contrato común **`CompilerDiagnostic`** de `src/compiler/errors.ts`.
> Los cambios incompatibles están en la sección 12.

---

## 1. Qué se desarrolló

El **frontend** del compilador CodeForge, que convierte el código fuente en
un AST listo para el análisis semántico:

```
Código fuente → Lexer → Tokens → Parser → AST  ──▶  (semántico → IR → VM)
```

- **Tokens:** catálogo de tipos de token, interfaz `Token` y tabla de palabras reservadas.
- **Lexer:** analizador léxico carácter por carácter, con línea/columna y diagnósticos léxicos con código.
- **AST canónico:** nodos tipados como unión discriminada por `kind`, lista `AST_NODE_KINDS` y un *printer* para depuración.
- **Parser:** descenso recursivo con precedencia de operadores, diagnósticos sintácticos con código y recuperación (*panic mode*).
- **Contrato común de errores:** `CompilerDiagnostic` para las cuatro fases.
- **Punto de entrada único:** `parseSource(code)` en `src/compiler/frontend.ts`.
- **Gramática documentada** (`docs/GRAMATICA.md`) y explicación del frontend (`docs/FRONTEND.md`).
- **82 pruebas automatizadas** con Vitest y un script de demostración por consola.

## 2. Archivos creados o modificados

```
src/compiler/
├── README.md                 Mapa de carpetas del compilador y responsables
├── tokens.ts                 Contrato de tokens (TokenType, Token, KEYWORDS)
├── errors.ts                 Contrato común de diagnósticos (CompilerDiagnostic)
├── errors.test.ts            Pruebas del contrato de diagnósticos
├── frontend.ts               Punto de entrada: parseSource() y re-exportaciones
├── frontend.test.ts          Pruebas de integración
├── lexer/
│   ├── Lexer.ts              Analizador léxico
│   ├── index.ts              tokenize()
│   └── Lexer.test.ts
├── ast/
│   ├── nodes.ts              AST canónico + AST_NODE_KINDS
│   ├── printer.ts            printAst(), typeToString()
│   ├── index.ts
│   ├── ast.test.ts
│   └── contract.test.ts      Pruebas de contrato del AST
└── parser/
    ├── Parser.ts             Parser de descenso recursivo
    ├── index.ts              parseTokens()
    └── Parser.test.ts
scripts/frontend-demo.ts      Muestra tokens, AST y diagnósticos de un archivo .cf
examples/demo.cf              Programa válido de ejemplo
examples/errores-lexicos.cf   Ejemplo con errores léxicos
examples/errores-sintacticos.cf  Ejemplo con errores sintácticos
docs/GRAMATICA.md             Gramática léxica y sintáctica (EBNF)
docs/FRONTEND.md              Explicación del Lexer, Parser y AST
docs/INFORME_INTEGRACION_JACK.md  Este documento
```

### Archivos compartidos modificados (cambios mínimos)

| Archivo | Cambio | Motivo |
| ------- | ------ | ------ |
| `package.json` / `package-lock.json` | `vitest` como devDependency y scripts `test`, `test:watch`, `frontend:demo` | Ejecutar pruebas. |
| `tsconfig.node.json` | `"include"` ahora incluye `"scripts"` | Verificar tipos del script de demo. |

**No se modificaron** `src/App.tsx`, `src/main.tsx`, `vite.config.ts`,
`tsconfig.app.json`, ni `semantic/`, `ir/`, `runtime/` o `integration/`.

## 3. Cómo funciona cada módulo (resumen)

| Módulo | Entrada | Salida | Algoritmo |
| ------ | ------- | ------ | --------- |
| Lexer | `string` (código) | `Token[]` + diagnósticos léxicos | Recorrido lineal con *lookahead* de 1–2 caracteres; tabla hash de palabras reservadas. O(n). |
| Parser | `Token[]` | `Program` (AST) + diagnósticos sintácticos | Descenso recursivo predictivo LL(1), un método por regla y por nivel de precedencia; *panic mode*. |
| AST | — | Estructura de datos | Unión discriminada por `kind`; cada nodo tiene `position`. |

La explicación detallada está en `docs/FRONTEND.md`.

## 4. Funcionalidades implementadas

- `let` / `const`, con tipo opcional (`let x = 5;`) o sin valor inicial (`let x: int;`).
- Tipos `int`, `float`, `string`, `bool` y arreglos `T[]`, `T[][]`, etc.
- `function nombre(a: int, b: float) -> int { ... }`; el retorno es opcional.
- Recursividad (las llamadas son expresiones normales).
- `if` / `else if` / `else`, `while`, `return` con o sin valor, `print(expr)`.
- Bloques `{ ... }` anidados.
- Operadores aritméticos `+ - * / %`, relacionales `== != < <= > >=`, lógicos `&& || !`, unario `-`.
- Asignación `=` a variables y a elementos de arreglo (`a[i] = v`, `m[i][j] = v`).
- Literales de arreglo `[1, 2, 3]`, `[[1], [2]]`, indexación `a[i]`, `m[i][j]`.
- Comentarios `//` y `/* */`.
- Diagnósticos léxicos y sintácticos con fase, código estable, mensaje en español y posición.

## 5. Pruebas ejecutadas y resultados reales

Comandos: `npm ci`, `npm test`, `npm run lint`, `npm run build` (Vitest 5.1.0, Node 22.18.0, Windows 11).

```
 Test Files  6 passed (6)
      Tests  82 passed (82)
```

| Archivo | Pruebas | Resultado |
| ------- | ------: | --------- |
| `src/compiler/lexer/Lexer.test.ts` | 19 | ✅ |
| `src/compiler/parser/Parser.test.ts` | 44 | ✅ |
| `src/compiler/ast/ast.test.ts` | 3 | ✅ |
| `src/compiler/ast/contract.test.ts` | 5 | ✅ |
| `src/compiler/errors.test.ts` | 6 | ✅ |
| `src/compiler/frontend.test.ts` | 5 | ✅ |

- `npm run build` (`tsc -b && vite build`): ✅ sin errores.
- `npm run lint`: ✅ sin errores.
- `npm run frontend:demo` con los tres archivos de `examples/`: ✅ salida esperada.

## 6. Comandos

```bash
npm ci                                         # dependencias exactas del lockfile
npm test                                       # pruebas
npm run build                                  # verificación de tipos + build
npm run lint                                   # ESLint
npm run frontend:demo -- examples/demo.cf      # ver tokens, AST y diagnósticos (Node ≥ 22.18)
```

## 7. Commits

Ver la pestaña *Commits* del PR #1 o `git log --oneline origin/develop..origin/feature/lexer-parser`.
La entrega inicial tiene 15 commits; la Entrega A agrega:

```
feat!: adopt the shared CompilerDiagnostic contract
feat: mark the AST as the canonical compiler contract
docs: update integration docs for the canonical contracts
```

## 8. Rama

`feature/lexer-parser`, creada desde `develop` (`f8404df`). Se integra a
`develop` mediante el **PR #1**. No se hace push directo a `develop` ni merge
automático.

## 9. Pendientes

- **Revisión y merge del PR #1** por el equipo (orden acordado: Jack → Deivid → Juan → UI).
- **Entrega B (UI, rama `feature/ui`)**: se inicia cuando `runSource()` esté
  integrado en `develop` (después de los PR de Deivid y Juan).

---

## 10. Guía de integración

### 10.1 Invocar el frontend

```ts
import { parseSource, formatDiagnostic } from './compiler/frontend.ts';

const result = parseSource(sourceCode);

if (!result.success) {
  result.errors.forEach((d) => console.log(formatDiagnostic(d)));
  // → "[syntax] EXPECTED_TOKEN 1:15 Se esperaba ';' al final de la declaración de variable, pero se encontró 'print'."
  return;
}

const program = result.program!;        // Program, garantizado cuando success === true
```

```ts
interface FrontendResult {
  success: boolean;               // true ⇔ errors.length === 0
  tokens: Token[];                // siempre termina en EOF
  program: Program | null;        // null solo si hubo errores léxicos
  errors: CompilerDiagnostic[];   // léxicos, o sintácticos si el lexer no falló
}
```

**Regla:** el análisis semántico solo se ejecuta cuando `success === true`.

Por separado: `tokenize(code)` → `{ tokens, errors }` y
`parseTokens(tokens)` → `{ program, errors }`.

### 10.2 Contrato de tokens (`src/compiler/tokens.ts`)

```ts
interface Token {
  type: TokenType;                             // p. ej. 'IDENTIFIER'
  lexeme: string;                              // texto exacto: '"hola"' (con comillas), '3.14'
  literal: number | string | boolean | null;   // valor convertido en literales; null en el resto
  line: number;                                // desde 1
  column: number;                              // desde 1
}
```

| Grupo | Valores de `TokenType` |
| ----- | ------- |
| Palabras reservadas | `LET CONST FUNCTION RETURN IF ELSE WHILE PRINT TRUE FALSE` |
| Tipos | `INT FLOAT STRING BOOL` |
| Literales | `IDENTIFIER INT_LITERAL FLOAT_LITERAL STRING_LITERAL` |
| Aritméticos | `PLUS MINUS STAR SLASH PERCENT` |
| Asignación | `ASSIGN` |
| Relacionales | `EQUAL NOT_EQUAL LESS LESS_EQUAL GREATER GREATER_EQUAL` |
| Lógicos | `AND OR NOT` |
| Delimitadores | `LEFT_PAREN RIGHT_PAREN LEFT_BRACE RIGHT_BRACE LEFT_BRACKET RIGHT_BRACKET COMMA SEMICOLON COLON ARROW` |
| Fin | `EOF` |

### 10.3 Contrato común de diagnósticos (`src/compiler/errors.ts`)

```ts
type CompilerPhase = 'lexical' | 'syntax' | 'semantic' | 'runtime';

interface CompilerDiagnostic {
  phase: CompilerPhase;
  code: string;               // estable, UPPER_SNAKE_CASE (cada fase define los suyos)
  message: string;            // en español
  position?: SourcePosition;  // { line, column }; siempre presente en lexical/syntax
  pc?: number;                // runtime: PC de la instrucción que falló
  instruction?: string;       // runtime: opcode o texto de la instrucción
}

createDiagnostic(d: CompilerDiagnostic): CompilerDiagnostic  // copia y omite opcionales vacíos
formatDiagnostic(d): string
// "[runtime] HEAP_OUT_OF_BOUNDS 7:3 pc=12 (ARRAY_LOAD) Índice fuera de rango."
```

Los diagnósticos son objetos planos y serializables a JSON (no excepciones),
así cada fase puede acumular varios y la UI los muestra en una sola lista.

**Códigos del frontend** (`LexicalErrorCode`, `SyntaxErrorCode`):

| Fase | Código | Cuándo |
| ---- | ------ | ------ |
| lexical | `UNEXPECTED_CHARACTER` | Carácter no reconocido, `&` o `\|` sueltos |
| lexical | `UNTERMINATED_STRING` | Cadena sin comilla de cierre en la misma línea |
| lexical | `INVALID_ESCAPE` | Escape distinto de `\n \t \" \\` |
| lexical | `UNTERMINATED_COMMENT` | `/*` sin `*/` |
| lexical | `MALFORMED_NUMBER` | `12abc`, `3.` |
| syntax | `EXPECTED_TOKEN` | Falta un token concreto (`;`, `)`, `{`, nombre...) |
| syntax | `EXPECTED_EXPRESSION` | Falta una expresión (`let x = ;`) |
| syntax | `EXPECTED_TYPE` | Tipo inválido (`let x: number`) |
| syntax | `CONST_WITHOUT_INITIALIZER` | `const X: int;` |
| syntax | `MISSING_TYPE_OR_INITIALIZER` | `let y;` |
| syntax | `INVALID_ASSIGNMENT_TARGET` | `5 = x;`, `f() = 1;` |
| syntax | `INVALID_CALLEE` | `(a + b)(1)` |
| syntax | `NESTED_FUNCTION` | `function` dentro de un bloque |

Ejemplos para las otras fases:

```ts
createDiagnostic({ phase: 'semantic', code: 'TYPE_MISMATCH', message: '...', position: node.position });
createDiagnostic({ phase: 'runtime', code: 'DIVISION_BY_ZERO', message: '...', pc, instruction: 'DIV', position });
```

### 10.4 Contrato canónico del AST (`src/compiler/ast/nodes.ts`)

Semántica e IR **importan estos tipos directamente**; no se mantiene un AST
duplicado ni un adaptador. Todos los nodos tienen:

```ts
kind: string;                                   // discriminante
position: { line: number; column: number };     // token donde empieza la construcción
```

`SourcePosition` se re-exporta desde `nodes.ts`. `AST_NODE_KINDS` es la
lista en tiempo de ejecución de los 20 `kind`.

#### Tipos

```ts
type PrimitiveTypeName = 'int' | 'float' | 'string' | 'bool';
interface PrimitiveType { kind: 'PrimitiveType'; name: PrimitiveTypeName }
interface ArrayType     { kind: 'ArrayType'; elementType: TypeAnnotation }   // int[][] = Array(Array(int))
type TypeAnnotation = PrimitiveType | ArrayType;
```

#### Programa y sentencias

```ts
interface Program             { kind: 'Program'; body: Statement[] }

interface VariableDeclaration { kind: 'VariableDeclaration';
                                mutability: 'let' | 'const';
                                name: string;
                                typeAnnotation: TypeAnnotation | null;  // null → inferir del initializer
                                initializer: Expression | null }        // null solo en `let x: T;`

interface FunctionDeclaration { kind: 'FunctionDeclaration';
                                name: string;
                                params: Parameter[];
                                returnType: TypeAnnotation | null;      // null → void
                                body: BlockStatement }
interface Parameter           { kind: 'Parameter'; name: string; typeAnnotation: TypeAnnotation }

interface BlockStatement      { kind: 'BlockStatement'; body: Statement[] }          // nuevo scope
interface IfStatement         { kind: 'IfStatement';
                                condition: Expression;
                                consequent: BlockStatement;
                                alternate: BlockStatement | IfStatement | null }     // IfStatement = else if
interface WhileStatement      { kind: 'WhileStatement'; condition: Expression; body: BlockStatement }
interface ReturnStatement     { kind: 'ReturnStatement'; argument: Expression | null }
interface PrintStatement      { kind: 'PrintStatement'; argument: Expression }
interface ExpressionStatement { kind: 'ExpressionStatement'; expression: Expression }

type Statement = VariableDeclaration | FunctionDeclaration | BlockStatement | IfStatement
               | WhileStatement | ReturnStatement | PrintStatement | ExpressionStatement;
```

#### Expresiones

```ts
type BinaryOperator = '+' | '-' | '*' | '/' | '%'          // ArithmeticOperator
                    | '==' | '!=' | '<' | '<=' | '>' | '>=' // RelationalOperator
                    | '&&' | '||';                           // LogicalOperator
type UnaryOperator  = '-' | '!';

interface AssignmentExpression { kind: 'AssignmentExpression';
                                 target: IdentifierExpression | IndexExpression;
                                 value: Expression }
interface BinaryExpression     { kind: 'BinaryExpression'; operator: BinaryOperator; left: Expression; right: Expression }
interface UnaryExpression      { kind: 'UnaryExpression'; operator: UnaryOperator; operand: Expression }
type LiteralExpression =       { kind: 'LiteralExpression' } & (
                                 | { literalType: 'int';    value: number }
                                 | { literalType: 'float';  value: number }
                                 | { literalType: 'string'; value: string }
                                 | { literalType: 'bool';   value: boolean } )
interface IdentifierExpression { kind: 'IdentifierExpression'; name: string }
interface CallExpression       { kind: 'CallExpression'; callee: IdentifierExpression; args: Expression[] }
interface ArrayExpression      { kind: 'ArrayExpression'; elements: Expression[] }
interface IndexExpression      { kind: 'IndexExpression'; object: Expression; index: Expression }

type Expression = AssignmentExpression | BinaryExpression | UnaryExpression | LiteralExpression
                | IdentifierExpression | CallExpression | ArrayExpression | IndexExpression;
```

Tipos utilitarios: `AstNode`, `AstNodeKind`, `AssignmentTarget`,
`ArithmeticOperator`, `RelationalOperator`, `LogicalOperator`.

**Correspondencia con el AST anterior de `semantic/ast-contract.ts`**
(para retirar el adaptador):

| Antes (semantic) | Canónico |
| ---------------- | -------- |
| `VarDeclaration` / `mutable` | `VariableDeclaration` / `mutability: 'let' \| 'const'` |
| `Block` | `BlockStatement` |
| `ReturnStatement.value` | `ReturnStatement.argument` |
| `AssignmentStatement` | `ExpressionStatement` con `AssignmentExpression` |
| `TypeName` (string escalar) | `TypeAnnotation` recursivo (`PrimitiveType` / `ArrayType`) |
| retorno `'void'` | `returnType: null` |
| `loc` | `position` |

### 10.5 Garantías del frontend

Cuando `success === true`, el AST cumple siempre:

1. Las `const` tienen `initializer` (nunca `null`).
2. Toda `VariableDeclaration` tiene `typeAnnotation` o `initializer` (al menos uno).
3. `AssignmentExpression.target` es `IdentifierExpression` o `IndexExpression`.
4. `CallExpression.callee` es un `IdentifierExpression`.
5. `FunctionDeclaration` solo aparece en `Program.body`.
6. Los cuerpos de `if`, `else` y `while` son `BlockStatement`.
7. La precedencia y asociatividad ya están resueltas en la forma del árbol.
8. Un literal `int` siempre tiene `value` entero.
9. El AST es JSON serializable.

Las pruebas `src/compiler/ast/contract.test.ts` vigilan este contrato.

### 10.6 Qué verifica el semántico (Deivid)

El parser **no** verifica (ver `docs/GRAMATICA.md` §5): declaración previa y
duplicados, tipos e inferencia, reasignación de `const`, `return` fuera de
función y su tipo, aridad y tipos de argumentos, condiciones `bool`, índices
`int`, `[]` sin tipo contextual.

```ts
import type { Statement } from '../ast/nodes.ts';
import { createDiagnostic } from '../errors.ts';

function checkStatement(node: Statement) {
  switch (node.kind) {
    case 'VariableDeclaration': /* ... */ break;
    case 'BlockStatement':      /* abrir scope, recorrer node.body, cerrar scope */ break;
    // ...
  }
}
// createDiagnostic({ phase: 'semantic', code: 'UNDECLARED_IDENTIFIER', message: "...", position: node.position })
```

### 10.7 Información para la VM (Juan)

- `print` recibe **una** expresión.
- `int` y `float` llegan como `number` de JavaScript; la distinción está en
  `literalType` y en los tipos del semántico.
- Arreglos: literales, indexación anidada y asignación indexada, candidatos al Heap.
- Funciones solo de nivel superior, llamadas por nombre (sin *closures*).
- Errores de ejecución: `CompilerDiagnostic` con `phase: 'runtime'`, `code`, `pc`,
  `instruction` y `position` si el IR conserva la ubicación de origen.

### 10.8 Ejemplos de entrada y salida

Entrada:

```ts
let age: int = 21;
print(age + 1);
```

`result.program` (posiciones de nodos internos omitidas por brevedad):

```json
{
  "kind": "Program",
  "position": { "line": 1, "column": 1 },
  "body": [
    {
      "kind": "VariableDeclaration",
      "mutability": "let",
      "name": "age",
      "typeAnnotation": { "kind": "PrimitiveType", "name": "int", "position": { "line": 1, "column": 10 } },
      "initializer": { "kind": "LiteralExpression", "literalType": "int", "value": 21, "position": { "line": 1, "column": 16 } },
      "position": { "line": 1, "column": 1 }
    },
    {
      "kind": "PrintStatement",
      "argument": {
        "kind": "BinaryExpression",
        "operator": "+",
        "left":  { "kind": "IdentifierExpression", "name": "age" },
        "right": { "kind": "LiteralExpression", "literalType": "int", "value": 1 }
      },
      "position": { "line": 2, "column": 1 }
    }
  ]
}
```

Entrada con error:

```ts
let x: int = 5
print(x);
```

```json
{
  "success": false,
  "errors": [
    {
      "phase": "syntax",
      "code": "EXPECTED_TOKEN",
      "message": "Se esperaba ';' al final de la declaración de variable, pero se encontró 'print'.",
      "position": { "line": 1, "column": 15 }
    }
  ]
}
```

## 11. Qué reciben de mi trabajo

| Integrante | Recibe | Archivos clave |
| ---------- | ------ | -------------- |
| **DeividJulian** | El AST canónico para importar directamente en semántica e IR; `createDiagnostic` para errores semánticos; `typeToString()` para mensajes de tipos (`int[]`). | `ast/nodes.ts`, `errors.ts`, `frontend.ts`, `docs/GRAMATICA.md` §5 |
| **JuanMaya8** | `parseSource()` para `runSource()`; `CompilerDiagnostic` para errores runtime con `pc`/`instruction`. | `frontend.ts`, `errors.ts` |
| **UI** | `runSource()` (de Juan) devolverá tokens, AST y `CompilerDiagnostic[]`; `printAst()` y `formatDiagnostic()` para mostrarlos. | `frontend.ts`, `errors.ts` |

## 12. Cambios incompatibles de la Entrega A

| Antes | Ahora | Qué deben cambiar |
| ----- | ----- | ----------------- |
| `CompilerError` | `CompilerDiagnostic` | Renombrar el import (p. ej. `run-source.ts`). |
| `error.line`, `error.column` | `diagnostic.position?.line`, `.column` | Quien lea la posición de errores del frontend. |
| `createError(phase, message, position)` | `createDiagnostic({ phase, code, message, position })` | Agregar `code`. |
| `formatError(e)` | `formatDiagnostic(d)` | Renombrar. |
| — | `code` obligatorio | Cada fase define sus códigos estables. |

El AST **no cambió** de forma: solo se documentó como canónico y se
agregaron `AST_NODE_KINDS` y la re-exportación de `SourcePosition`.
