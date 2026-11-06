# Informe de integración: frontend del compilador (Lexer, Tokens, Parser y AST)

**Autor:** Jack-Limas
**Rama:** `feature/lexer-parser` (creada desde `develop`)
**Para:** DeividJulian (semántico, tabla de símbolos, scopes, tipos e IR) y JuanMaya8 (máquina virtual, Stack, Heap y ejecución)

---

## 1. Qué se desarrolló

El **frontend** del compilador CodeForge, que convierte el código fuente en
un AST listo para el análisis semántico:

```
Código fuente → Lexer → Tokens → Parser → AST  ──▶  (semántico → IR → VM)
```

- **Tokens:** catálogo de tipos de token, interfaz `Token` y tabla de palabras reservadas.
- **Lexer:** analizador léxico carácter por carácter, con línea/columna y errores léxicos.
- **AST:** nodos tipados como unión discriminada por `kind`, más un *printer* para depuración.
- **Parser:** descenso recursivo con precedencia de operadores, errores sintácticos y recuperación (*panic mode*).
- **Punto de entrada único:** `parseSource(code)` en `src/compiler/frontend.ts`.
- **Gramática documentada** (`docs/GRAMATICA.md`) y explicación del frontend (`docs/FRONTEND.md`).
- **71 pruebas automatizadas** con Vitest y un script de demostración por consola.

## 2. Archivos creados o modificados

### Creados

```
src/compiler/
├── README.md                 Mapa de carpetas del compilador y responsables
├── tokens.ts                 Contrato de tokens (TokenType, Token, KEYWORDS)
├── errors.ts                 Contrato de errores (CompilerError)
├── frontend.ts               Punto de entrada: parseSource() y re-exportaciones
├── frontend.test.ts          Pruebas de integración
├── lexer/
│   ├── Lexer.ts              Analizador léxico
│   ├── index.ts              tokenize()
│   └── Lexer.test.ts
├── ast/
│   ├── nodes.ts              Definición de todos los nodos
│   ├── printer.ts            printAst(), typeToString()
│   ├── index.ts
│   └── ast.test.ts
└── parser/
    ├── Parser.ts             Parser de descenso recursivo
    ├── index.ts              parseTokens()
    └── Parser.test.ts
scripts/frontend-demo.ts      Muestra tokens, AST y errores de un archivo .cf
examples/demo.cf              Programa válido de ejemplo
examples/errores-lexicos.cf   Ejemplo con errores léxicos
examples/errores-sintacticos.cf  Ejemplo con errores sintácticos
docs/GRAMATICA.md             Gramática léxica y sintáctica (EBNF)
docs/FRONTEND.md              Explicación del Lexer, Parser y AST
docs/INFORME_INTEGRACION_JACK.md  Este documento
```

### Modificados (archivos compartidos, cambios mínimos)

| Archivo | Cambio | Motivo |
| ------- | ------ | ------ |
| `package.json` / `package-lock.json` | `vitest` como devDependency y scripts `test`, `test:watch`, `frontend:demo` | Ejecutar pruebas. Vitest es el runner nativo de Vite; ustedes también pueden usarlo. |
| `tsconfig.node.json` | `"include"` ahora incluye `"scripts"` | Que el script de demo tenga verificación de tipos. |

**No se modificó** `src/App.tsx`, `src/main.tsx`, `vite.config.ts`,
`tsconfig.app.json` ni ninguna carpeta de los otros módulos.

## 3. Cómo funciona cada módulo (resumen)

| Módulo | Entrada | Salida | Algoritmo |
| ------ | ------- | ------ | --------- |
| Lexer | `string` (código) | `Token[]` + errores léxicos | Recorrido lineal con *lookahead* de 1–2 caracteres; tabla hash de palabras reservadas. O(n). |
| Parser | `Token[]` | `Program` (AST) + errores sintácticos | Descenso recursivo predictivo LL(1), un método por regla y por nivel de precedencia; *panic mode* para recuperarse de errores. |
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
- Asignación `=` a variables y a elementos de arreglo (`a[i] = v`).
- Literales de arreglo `[1, 2, 3]`, indexación `a[i]`, `m[i][j]`.
- Comentarios `//` y `/* */`.
- Errores léxicos y sintácticos con línea, columna y mensaje en español.

## 5. Pruebas ejecutadas y resultados reales

Comando: `npm test` (Vitest 5.1.0, Node 22.18.0, Windows 11).

```
 Test Files  4 passed (4)
      Tests  71 passed (71)
```

| Archivo | Pruebas | Resultado |
| ------- | ------: | --------- |
| `src/compiler/lexer/Lexer.test.ts` | 19 | ✅ todas pasan |
| `src/compiler/parser/Parser.test.ts` | 44 | ✅ todas pasan |
| `src/compiler/ast/ast.test.ts` | 3 | ✅ todas pasan |
| `src/compiler/frontend.test.ts` | 5 | ✅ todas pasan |

Además se verificó:

- `npm run build` (`tsc -b && vite build`): ✅ compila sin errores.
- `npm run lint` (ESLint): ✅ sin errores ni advertencias.
- `npm run frontend:demo` con los tres archivos de `examples/`: ✅ salida esperada.

## 6. Comandos

```bash
npm install                                    # dependencias
npm test                                       # pruebas
npm run test:watch                             # pruebas en modo observación
npm run build                                  # verificación de tipos + build
npm run lint                                   # ESLint
npm run dev                                    # app React (plantilla actual)
npm run frontend:demo -- examples/demo.cf      # ver tokens y AST (Node ≥ 22.18)
```

## 7. Commits realizados (rama `feature/lexer-parser`)

```
chore: organize compiler frontend structure
feat: define compiler token types
feat: implement lexical analyzer
feat: add lexical error handling
feat: define abstract syntax tree nodes
feat: implement recursive descent parser
feat: add expression precedence parsing
feat: add compiler frontend entry point
test: add lexer test cases
test: add parser test cases
test: add AST and frontend integration tests
fix: skip whole blocks during parser error recovery
chore: add frontend demo script and example programs
docs: document compiler frontend grammar
docs: add frontend integration report
```

## 8. Rama

Todo el trabajo está en **`feature/lexer-parser`**, creada desde
`origin/develop` (commit `f8404df`). **No se ha hecho push ni merge**:
queda pendiente de revisión y autorización.

## 9. Pendientes

- **Push de la rama y Pull Request hacia `develop`** (esperando autorización).
- **Integración en la UI** (`App.tsx`): no se tocó porque es compartida. Cuando
  se defina quién la hace, basta con llamar a `parseSource(code)` y mostrar
  `printAst(result.program)` y `result.errors`.
- Posibles extensiones futuras, solo si el equipo las necesita: `for`,
  `break`/`continue`, operadores compuestos (`+=`), `null`. Cualquier
  extensión requiere acordarla antes, porque cambia el AST que ustedes consumen.

---

## 10. Guía de integración

### 10.1 Invocar el frontend (recomendado)

```ts
import { parseSource, formatError, printAst } from './compiler/frontend.ts';

const result = parseSource(sourceCode);

if (!result.success) {
  result.errors.forEach((e) => console.log(formatError(e)));
  // → "[syntax] 3:14 Se esperaba ';' al final de la declaración de variable, pero se encontró 'print'."
  return;
}

const program = result.program!;        // Program, garantizado cuando success === true
console.log(printAst(program));          // depuración
semanticAnalyzer.analyze(program);       // ← Deivid
```

```ts
interface FrontendResult {
  success: boolean;            // true ⇔ errors.length === 0
  tokens: Token[];             // siempre termina en EOF
  program: Program | null;     // null solo si hubo errores léxicos
  errors: CompilerError[];     // léxicos, o sintácticos si el lexer no falló
}
```

**Regla:** el análisis semántico solo debe ejecutarse cuando `success === true`.

### 10.2 Invocar Lexer y Parser por separado

```ts
import { tokenize, parseTokens } from './compiler/frontend.ts';

const { tokens, errors: lexicalErrors } = tokenize(code);   // = new Lexer(code).tokenize()
const { program, errors: syntaxErrors } = parseTokens(tokens); // = new Parser(tokens).parse()
```

### 10.3 Contrato de tokens (`src/compiler/tokens.ts`)

```ts
interface Token {
  type: TokenType;                     // p. ej. 'IDENTIFIER'
  lexeme: string;                      // texto exacto: '"hola"' (con comillas), '3.14'
  literal: number | string | boolean | null; // valor convertido en literales; null en el resto
  line: number;                        // desde 1
  column: number;                      // desde 1
}
```

`TokenType` es un objeto constante (no `enum`, porque el proyecto usa
`erasableSyntaxOnly`). Se usa igual: `TokenType.LET`.

| Grupo | Valores |
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

### 10.4 Contrato de errores (`src/compiler/errors.ts`)

```ts
type CompilerPhase = 'lexical' | 'syntax' | 'semantic' | 'runtime';

interface CompilerError {
  phase: CompilerPhase;
  message: string;     // en español
  line: number;
  column: number;
}

createError(phase, message, position): CompilerError
formatError(error): string   // "[phase] line:column message"
```

> **Propuesta para el equipo:** incluí `'semantic'` y `'runtime'` en
> `CompilerPhase` para que sus módulos puedan devolver errores con la
> **misma forma** y la UI los muestre todos igual. Es opcional; si
> prefieren otra estructura, la acordamos antes de cambiarla. Los errores
> son objetos planos (no excepciones) para poder acumular varios.

### 10.5 Contrato del AST (`src/compiler/ast/nodes.ts`)

Todos los nodos tienen:

```ts
kind: string;                                   // discriminante
position: { line: number; column: number };     // token donde empieza la construcción
```

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
                                returnType: TypeAnnotation | null;      // null → no devuelve valor
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

Tipos utilitarios exportados: `AstNode` (cualquier nodo), `AstNodeKind`,
`AssignmentTarget`, `ArithmeticOperator`, `RelationalOperator`, `LogicalOperator`.

### 10.6 Garantías que da el frontend

Cuando `success === true`, el AST cumple siempre:

1. Las `const` tienen `initializer` (nunca `null`).
2. Toda `VariableDeclaration` tiene `typeAnnotation` o `initializer` (al menos uno).
3. `AssignmentExpression.target` es siempre `IdentifierExpression` o `IndexExpression`.
4. `CallExpression.callee` es siempre un `IdentifierExpression`.
5. `FunctionDeclaration` solo aparece en `Program.body` (nunca dentro de bloques).
6. Los cuerpos de `if`, `else` y `while` siempre son `BlockStatement`.
7. La precedencia y asociatividad ya están resueltas en la forma del árbol.
8. Un literal `int` siempre tiene `value` entero; `float` puede ser cualquier número.
9. El AST es JSON serializable (solo objetos, arreglos, strings, números y booleanos).

### 10.7 Qué le toca verificar al semántico (Deivid)

El parser **no** verifica (ver `docs/GRAMATICA.md`, sección 5):

- Declaración previa de variables y funciones, y duplicados por scope.
- Compatibilidad de tipos e inferencia cuando `typeAnnotation === null`.
- Reasignación de `const`.
- `return` fuera de función y tipo de retorno.
- Número y tipos de argumentos.
- Condiciones de `if` / `while` de tipo `bool`; índices de tipo `int`.
- Uso de `let x: T;` antes de asignarle valor (si se quiere detectar).

Sugerencia de recorrido:

```ts
function checkStatement(node: Statement) {
  switch (node.kind) {
    case 'VariableDeclaration': /* declarar en scope actual */ break;
    case 'FunctionDeclaration': /* declarar función, nuevo scope para params y body */ break;
    case 'BlockStatement':      /* abrir scope, recorrer node.body, cerrar scope */ break;
    // ...
  }
}
```

Cada nodo tiene `position`, así que el error semántico puede crearse con:
`createError('semantic', "La variable 'x' no está declarada.", node.position)`.

### 10.8 Información para la VM (Juan)

La VM no recibe el AST directamente sino el IR de Deivid, pero conviene saber:

- `print` recibe **una** expresión.
- `int` y `float` llegan como `number` de JavaScript; la distinción está en
  `literalType` (y en los tipos que calcule el semántico). Por ejemplo, la
  división entera `7 / 2` requerirá tratamiento explícito si se quiere `3`.
- Los arreglos son literales `[a, b, c]` con indexación `a[i]` y asignación
  `a[i] = v`; son candidatos naturales a vivir en el **Heap**.
- Las funciones son de nivel superior y se llaman por nombre (sin *closures*),
  lo que simplifica los marcos de pila (**Stack frames**).
- `CompilerError` con `phase: 'runtime'` está disponible para errores de ejecución
  (índice fuera de rango, división por cero...).

### 10.9 Ejemplo de entrada y salida

Entrada:

```ts
let age: int = 21;
print(age + 1);
```

`result.program` (JSON, posiciones omitidas en los nodos internos por brevedad):

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
    { "phase": "syntax", "message": "Se esperaba ';' al final de la declaración de variable, pero se encontró 'print'.", "line": 1, "column": 15 }
  ]
}
```

Más ejemplos ejecutables: `npm run frontend:demo -- examples/<archivo>.cf`.

## 11. Qué reciben de mi trabajo

| Integrante | Recibe | Archivos clave |
| ---------- | ------ | -------------- |
| **DeividJulian** | `parseSource()` y el AST tipado (`Program`) como entrada del semántico; `CompilerError`/`createError` para reportar errores semánticos; `typeToString()` para mensajes de tipos (`int[]`). | `frontend.ts`, `ast/nodes.ts`, `errors.ts`, `docs/GRAMATICA.md` §5 |
| **JuanMaya8** | El contrato de errores (`phase: 'runtime'`) y la descripción del lenguaje (qué construcciones existen y cómo se comportan) para diseñar la VM. | `errors.ts`, `docs/GRAMATICA.md`, sección 10.8 de este informe |
| **Todos (UI)** | `parseSource()`, `printAst()` y `formatError()` para mostrar tokens, AST y errores en la aplicación React. | `frontend.ts` |

**Regla de colaboración:** si alguien necesita un cambio en los nodos del
AST o en los tokens, lo acordamos primero, porque cualquier cambio afecta
al parser y al semántico al mismo tiempo.
