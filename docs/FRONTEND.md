# Frontend de CodeForge: Lexer, Parser y AST

Este documento explica **qué hace** cada parte del frontend del compilador
y **cómo está implementada**. La gramática formal está en
[GRAMATICA.md](GRAMATICA.md) y los contratos para los otros módulos en
[INFORME_INTEGRACION_JACK.md](INFORME_INTEGRACION_JACK.md).

```
            ┌────────┐  tokens  ┌────────┐   AST    ┌────────────┐
 código ──▶ │ Lexer  │ ───────▶ │ Parser │ ───────▶ │ Semántico  │ ──▶ IR ──▶ VM
 fuente     └────────┘          └────────┘          └────────────┘
            análisis             análisis            (DeividJulian)  (JuanMaya8)
            léxico               sintáctico
            └──────────── frontend (Jack-Limas) ────┘
```

---

## 1. Conceptos básicos

### Lexema, token y patrón

| Concepto   | Definición                                                       | Ejemplo en `let age: int = 21;`      |
| ---------- | ---------------------------------------------------------------- | ------------------------------------ |
| **Lexema** | Secuencia concreta de caracteres del código fuente.              | `let`, `age`, `:`, `int`, `=`, `21`, `;` |
| **Patrón** | Regla que describe qué lexemas pertenecen a una categoría.       | Identificador: `[a-zA-Z_][a-zA-Z0-9_]*` |
| **Token**  | Par (categoría, lexema) más información extra: posición y valor. | `{ type: 'IDENTIFIER', lexeme: 'age', line: 1, column: 5 }` |

Analogía: en la oración *"El perro corre"*, las palabras son los lexemas y
sus categorías gramaticales (artículo, sustantivo, verbo) son los tipos de
token. El patrón es la regla que permite reconocer, por ejemplo, un verbo.

### ¿Por qué separar el compilador en fases?

Cada fase resuelve un solo problema y entrega un resultado más estructurado
a la siguiente:

1. **Lexer:** texto plano → lista de tokens (le quita al parser el trabajo
   de lidiar con espacios, comentarios y caracteres sueltos).
2. **Parser:** lista de tokens → árbol (descubre la estructura jerárquica).
3. **Semántico:** árbol → árbol verificado (tipos, scopes...).

---

## 2. Lexer (analizador léxico)

**Archivo:** `src/compiler/lexer/Lexer.ts`

### ¿Qué hace?

Lee el código **carácter por carácter**, de izquierda a derecha, agrupa los
caracteres en lexemas, clasifica cada lexema y produce un token. Descarta
espacios y comentarios. Siempre termina con un token `EOF` (*end of file*)
para que el parser sepa dónde acaba la entrada.

### ¿Cómo funciona?

El Lexer mantiene dos índices sobre el texto:

```
  l e t   a g e : ...
  ▲     ▲
start current
```

- `start` marca dónde empieza el lexema actual.
- `current` es el siguiente carácter por leer.
- `line` y `column` guardan la posición humana (empiezan en 1).

El bucle principal es:

```
mientras no se llegue al final:
    start = current
    scanToken()          // reconoce UN lexema y emite su token
agregar EOF
```

`scanToken()` lee un carácter con `advance()` y decide según ese carácter:

| Primer carácter     | Acción                                                               |
| ------------------- | -------------------------------------------------------------------- |
| `( ) { } [ ] , ; : + * %` | Token de un carácter (tabla `SINGLE_CHAR_TOKENS`).            |
| `- = ! < >`         | Mira el siguiente con `match()`: `->`, `==`, `!=`, `<=`, `>=` o el de un carácter. |
| `&` `\|`            | Debe venir otro igual (`&&`, `\|\|`); si no, error léxico.           |
| `/`                 | `//` comentario de línea, `/*` comentario de bloque o división.      |
| `"`                 | Cadena: lee hasta la comilla de cierre resolviendo escapes.          |
| dígito              | Número: dígitos, opcionalmente `.` y más dígitos.                    |
| letra o `_`         | Palabra: luego busca en la tabla `KEYWORDS` si es palabra reservada. |
| espacio / salto     | Se ignora.                                                           |
| otro                | Error léxico: carácter no reconocido.                                |

Funciones auxiliares importantes:

- `advance()`: consume un carácter y actualiza línea/columna.
- `peek()`: mira el siguiente carácter **sin consumirlo** (*lookahead* de 1).
- `peekNext()`: mira dos caracteres adelante (para saber si `3.` va seguido de dígito).
- `match(c)`: consume el siguiente carácter solo si es `c`.

### Palabras reservadas vs identificadores

El Lexer **no** tiene un caso especial para cada palabra reservada. Lee
cualquier palabra con el patrón de identificador y al final consulta la
tabla `KEYWORDS` (`lookupKeyword`). Si la palabra está, es palabra
reservada; si no, es `IDENTIFIER`. Por eso `letter` es un identificador
aunque empiece por `let`.

### Errores léxicos

El Lexer **no se detiene** en el primer error: lo registra con su línea y
columna, salta el lexema inválido y sigue. Así se reportan todos los
errores en una sola pasada.

| Entrada        | Error                                                                  |
| -------------- | ---------------------------------------------------------------------- |
| `@`            | Carácter '@' no reconocido.                                            |
| `a & b`        | Carácter '&' inesperado. ¿Quisiste escribir '&&'?                      |
| `"hola`        | Cadena de texto sin cerrar: falta la comilla doble final.              |
| `"a\qb"`       | Secuencia de escape '\q' no válida.                                    |
| `/* ...`       | Comentario de bloque sin cerrar: falta '*/'.                           |
| `12abc`        | Número mal formado '12abc': un identificador no puede empezar con un dígito. |
| `3.`           | Número decimal mal formado '3.': se esperaba un dígito después del punto. |

### Ejemplo de entrada y salida

Entrada: `let age: int = 21;`

| line:col | type          | lexeme | literal |
| -------- | ------------- | ------ | ------- |
| 1:1      | `LET`         | `let`  |         |
| 1:5      | `IDENTIFIER`  | `age`  |         |
| 1:8      | `COLON`       | `:`    |         |
| 1:10     | `INT`         | `int`  |         |
| 1:14     | `ASSIGN`      | `=`    |         |
| 1:16     | `INT_LITERAL` | `21`   | `21`    |
| 1:18     | `SEMICOLON`   | `;`    |         |
| 1:19     | `EOF`         |        |         |

**Complejidad:** O(n), donde n es la longitud del código. Cada carácter se
lee una sola vez.

---

## 3. AST (árbol de sintaxis abstracta)

**Archivos:** `src/compiler/ast/nodes.ts`, `src/compiler/ast/printer.ts`

### ¿Qué es?

Un árbol que representa la **estructura** del programa. Cada nodo es una
construcción del lenguaje (una declaración, un `if`, una suma...) y sus
hijos son sus partes.

Es **abstracto** porque descarta detalles que ya no aportan información:
paréntesis, `;`, llaves, comas. Por ejemplo, en `(1 + 2) * 3` los
paréntesis no aparecen en el árbol: su efecto ya quedó en la **forma** del
árbol (la suma es hija de la multiplicación).

```
(1 + 2) * 3          BinaryExpression *
                     ├─ BinaryExpression +
                     │  ├─ Literal int 1
                     │  └─ Literal int 2
                     └─ Literal int 3
```

### ¿Por qué lo necesitamos?

- Las fases siguientes recorren el árbol en vez de volver a leer texto.
- La jerarquía ya resuelve la precedencia: se evalúa de las hojas a la raíz.
- Cada nodo guarda su posición (`line`, `column`) para mensajes de error
  semánticos precisos.

### ¿Cómo está diseñado?

Cada nodo es un objeto con un campo `kind` que indica su tipo. En TypeScript
esto se llama **unión discriminada**:

```ts
type Expression = BinaryExpression | LiteralExpression | IdentifierExpression | ...;

function evaluate(node: Expression) {
  switch (node.kind) {
    case 'BinaryExpression':  // aquí TypeScript sabe que existen node.left y node.right
    case 'LiteralExpression': // aquí sabe que existe node.value
  }
}
```

Ventaja: si alguien olvida manejar un tipo de nodo, TypeScript puede
avisarlo en tiempo de compilación (ver el `never` en `printer.ts`).

Nodos disponibles (detalle completo en el informe de integración):

- **Programa:** `Program`
- **Sentencias:** `VariableDeclaration`, `FunctionDeclaration`, `BlockStatement`,
  `IfStatement`, `WhileStatement`, `ReturnStatement`, `PrintStatement`,
  `ExpressionStatement`
- **Expresiones:** `AssignmentExpression`, `BinaryExpression`, `UnaryExpression`,
  `LiteralExpression`, `IdentifierExpression`, `CallExpression`,
  `ArrayExpression`, `IndexExpression`
- **Auxiliares:** `Parameter`, `PrimitiveType`, `ArrayType`

`printAst(node)` dibuja el árbol como texto; se usa en las pruebas y en la demo.

---

## 4. Parser (analizador sintáctico)

**Archivo:** `src/compiler/parser/Parser.ts`

### ¿Qué hace?

Recibe la lista de tokens, verifica que sigan la gramática del lenguaje y
construye el AST.

### Algoritmo: descenso recursivo

Es un parser **descendente** (construye el árbol desde la raíz `Program`
hacia las hojas) y **predictivo** (decide qué regla aplicar mirando solo el
token actual, *lookahead* de 1 token, una gramática LL(1)).

La idea central: **cada regla de la gramática es un método**.

```
ifStmt → "if" "(" expression ")" block ( "else" ( ifStmt | block ) )?
```

```ts
private ifStmt(): IfStatement {
  this.consume(LEFT_PAREN, "Se esperaba '(' después de 'if'");
  const condition = this.expression();              // sub-regla
  this.consume(RIGHT_PAREN, "...");
  const consequent = this.block('el if');           // sub-regla
  let alternate = null;
  if (this.match(ELSE)) {
    alternate = this.match(IF) ? this.ifStmt() : this.block('el else');  // recursión
  }
  return { kind: 'IfStatement', condition, consequent, alternate, position };
}
```

Funciones auxiliares sobre los tokens:

| Método        | Función                                                          |
| ------------- | ---------------------------------------------------------------- |
| `peek()`      | Token actual (sin consumir).                                     |
| `previous()`  | Último token consumido.                                          |
| `advance()`   | Consume el token actual.                                         |
| `check(t)`    | ¿El token actual es de tipo `t`?                                 |
| `match(t...)` | Si el token actual es de alguno de esos tipos, lo consume y devuelve `true`. |
| `consume(t, msg)` | Exige un token de tipo `t`; si no está, error sintáctico.    |

### Precedencia de operadores

La precedencia se implementa con **un método por nivel**: cada nivel llama
al nivel de mayor precedencia para obtener sus operandos.

```
expression → assignment → logicOr → logicAnd → equality
           → comparison → term → factor → unary → postfix → primary
```

Ejemplo: `1 + 2 * 3`

1. `term()` pide un operando a `factor()`, que devuelve `1`.
2. `term()` ve `+`, lo consume y vuelve a pedir un operando a `factor()`.
3. `factor()` lee `2`, ve `*` (que **sí** es suyo), lee `3` y devuelve `2 * 3`.
4. `term()` construye `1 + (2 * 3)`.

Como `*` se maneja en un nivel más profundo, queda más abajo en el árbol y
se evalúa primero.

**Asociatividad:**

- Los niveles binarios usan un **bucle** (`binaryLevel`), que va
  acumulando hacia la izquierda: `10 - 4 - 3` → `(10 - 4) - 3`.
- La asignación y los unarios usan **recursión**, que agrupa hacia la
  derecha: `a = b = 1` → `a = (b = 1)`, `!!x` → `!(!x)`.

Todos los niveles binarios comparten el mismo método `binaryLevel` para no
duplicar código.

### Errores sintácticos y recuperación (panic mode)

Cuando `consume()` no encuentra el token esperado:

1. Registra un error con mensaje y posición, por ejemplo:
   `[syntax] 1:10 Se esperaba ';' al final de la declaración de variable, pero se encontró 'print'.`
   Si el token faltante debía ir al final de una línea (típico con `;`), el
   error apunta al final de esa línea y no al inicio de la siguiente.
2. Lanza una señal interna (`ParseError`) que aborta la sentencia actual.
3. `declarationWithRecovery` captura la señal y llama a `synchronize()`,
   que **descarta tokens** hasta un punto seguro: después de un `;`, antes
   de una palabra que inicia sentencia (`let`, `if`, `while`...) o antes de
   `}`. Si encuentra un bloque `{ ... }` lo salta completo.
4. El análisis continúa con la siguiente sentencia.

Así el usuario ve **todos** los errores del programa, no solo el primero,
y el parser nunca entra en un ciclo infinito (siempre avanza al menos un token).

---

## 5. Cómo se conectan los tres módulos

`src/compiler/frontend.ts` expone `parseSource(source)`:

```ts
const lexerResult = tokenize(source);                 // 1. Lexer
if (lexerResult.errors.length > 0) return { ..., program: null };
const parserResult = parseTokens(lexerResult.tokens); // 2. Parser → AST
return { success, tokens, program, errors };
```

- Si hay errores léxicos no se ejecuta el parser (evita errores en cascada).
- Si hay errores sintácticos se devuelve el AST parcial (útil para depurar),
  pero `success` es `false` y el semántico **no** debe ejecutarse.

### Ejemplo completo

Entrada (ejemplo del enunciado):

```ts
let age: int = 21;

function sum(a: int, b: int) -> int {
    return a + b;
}

if (age >= 18) {
    print(sum(age, 5));
} else {
    print("Minor");
}
```

Salida `printAst(result.program)`:

```
Program
├─ VariableDeclaration let age: int
│  └─ Literal int 21
├─ FunctionDeclaration sum(a: int, b: int) -> int
│  └─ BlockStatement
│     └─ ReturnStatement
│        └─ BinaryExpression +
│           ├─ Identifier a
│           └─ Identifier b
└─ IfStatement
   ├─ condition: BinaryExpression >=
   │  ├─ Identifier age
   │  └─ Literal int 18
   ├─ then: BlockStatement
   │  └─ PrintStatement
   │     └─ CallExpression sum
   │        ├─ Identifier age
   │        └─ Literal int 5
   └─ else: BlockStatement
      └─ PrintStatement
         └─ Literal string "Minor"
```

---

## 6. Estructuras de datos y algoritmos utilizados

| Elemento | Dónde | Para qué |
| -------- | ----- | -------- |
| Recorrido lineal con *lookahead* (1–2 caracteres) | Lexer | Reconocer lexemas en O(n). |
| Tabla hash (`KEYWORDS`, `SINGLE_CHAR_TOKENS`) | Lexer | Clasificar palabras y símbolos en O(1). |
| Arreglo de tokens con índice `current` | Parser | Acceso secuencial y *lookahead* de 1 token. |
| Descenso recursivo predictivo (LL(1)) | Parser | Construir el AST siguiendo la gramática. |
| Un método por nivel de precedencia | Parser | Precedencia y asociatividad sin tablas. |
| Panic mode | Parser | Recuperarse de errores y reportar varios. |
| Árbol con uniones discriminadas | AST | Representar el programa de forma segura en tipos. |
| Recorrido en profundidad (DFS) | `printAst` | Dibujar el árbol. |

---

## 7. Cómo ejecutar

Requisitos: Node.js 22.18 o superior.

```bash
npm install                 # instalar dependencias
npm test                    # ejecutar todas las pruebas (Vitest)
npm run test:watch          # pruebas en modo observación
npx tsc -b                  # verificar tipos
npm run lint                # ESLint
npm run build               # compilar el proyecto completo

# Ver tokens, AST y errores de un archivo CodeForge:
npm run frontend:demo -- examples/demo.cf
npm run frontend:demo -- examples/errores-lexicos.cf
npm run frontend:demo -- examples/errores-sintacticos.cf
```

Archivos de prueba:

| Archivo | Qué cubre |
| ------- | --------- |
| `src/compiler/lexer/Lexer.test.ts` | Tokens, posiciones, comentarios, escapes y errores léxicos. |
| `src/compiler/parser/Parser.test.ts` | Declaraciones, sentencias, precedencia, asociatividad, errores sintácticos y recuperación. |
| `src/compiler/ast/ast.test.ts` | `printAst` y `typeToString` sobre árboles construidos a mano. |
| `src/compiler/frontend.test.ts` | Integración Lexer → Parser → AST con programas completos. |
