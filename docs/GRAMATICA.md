# Gramática del lenguaje CodeForge

Este documento define formalmente qué programas acepta el frontend de
CodeForge (Lexer + Parser). Es la referencia del código en
`src/compiler/lexer/` y `src/compiler/parser/`: cada regla sintáctica
corresponde a un método del parser con el mismo nombre.

## 1. Gramática léxica (tokens)

Los patrones se escriben como expresiones regulares.

| Categoría          | Patrón / lexemas                                             | Tipo de token                  |
| ------------------ | ------------------------------------------------------------ | ------------------------------ |
| Palabras reservadas| `let const function return if else while print true false`   | `LET`, `CONST`, ... `FALSE`    |
| Tipos              | `int float string bool`                                      | `INT`, `FLOAT`, `STRING`, `BOOL` |
| Identificador      | `[a-zA-Z_][a-zA-Z0-9_]*` (que no sea palabra reservada)      | `IDENTIFIER`                   |
| Entero             | `[0-9]+`                                                     | `INT_LITERAL`                  |
| Decimal            | `[0-9]+\.[0-9]+`                                             | `FLOAT_LITERAL`                |
| Cadena             | `"` ( carácter excepto `"` y salto de línea, o escape )* `"` | `STRING_LITERAL`               |
| Aritméticos        | `+ - * / %`                                                  | `PLUS MINUS STAR SLASH PERCENT`|
| Asignación         | `=`                                                          | `ASSIGN`                       |
| Relacionales       | `== != < <= > >=`                                            | `EQUAL NOT_EQUAL LESS ...`     |
| Lógicos            | `&& \|\| !`                                                  | `AND OR NOT`                   |
| Delimitadores      | `( ) { } [ ] , ; :`                                          | `LEFT_PAREN ... COLON`         |
| Flecha de retorno  | `->`                                                         | `ARROW`                        |
| Fin de archivo     | (ninguno)                                                    | `EOF`                          |

Reglas adicionales:

- **Escapes en cadenas:** `\n`, `\t`, `\"`, `\\`. Cualquier otro es error léxico.
- **Comentarios:** `// hasta el fin de línea` y `/* bloque, puede ocupar varias líneas */`. Se descartan.
- **Espacios en blanco** (espacio, tabulador, `\r`, `\n`) separan tokens y se descartan.
- **Munch máximo:** siempre se toma el lexema más largo posible: `<=` es un
  solo token, no `<` seguido de `=`.
- Un número pegado a letras (`12abc`) o un decimal sin parte fraccionaria
  (`3.`) es un error léxico.

## 2. Gramática sintáctica (EBNF)

Notación: `*` = cero o más, `?` = opcional, `|` = alternativa, los
terminales van entre comillas o en MAYÚSCULAS (tipos de token).

```ebnf
program        → declaration* EOF ;

declaration    → varDecl | funcDecl | statement ;

varDecl        → ( "let" | "const" ) IDENTIFIER ( ":" type )? ( "=" expression )? ";" ;
funcDecl       → "function" IDENTIFIER "(" params? ")" ( "->" type )? block ;
params         → param ( "," param )* ;
param          → IDENTIFIER ":" type ;
type           → ( "int" | "float" | "string" | "bool" ) ( "[" "]" )* ;

statement      → ifStmt | whileStmt | returnStmt | printStmt | block | exprStmt ;
ifStmt         → "if" "(" expression ")" block ( "else" ( ifStmt | block ) )? ;
whileStmt      → "while" "(" expression ")" block ;
returnStmt     → "return" expression? ";" ;
printStmt      → "print" "(" expression ")" ";" ;
block          → "{" declaration* "}" ;
exprStmt       → expression ";" ;

expression     → assignment ;
assignment     → logicOr ( "=" assignment )? ;
logicOr        → logicAnd ( "||" logicAnd )* ;
logicAnd       → equality ( "&&" equality )* ;
equality       → comparison ( ( "==" | "!=" ) comparison )* ;
comparison     → term ( ( "<" | "<=" | ">" | ">=" ) term )* ;
term           → factor ( ( "+" | "-" ) factor )* ;
factor         → unary ( ( "*" | "/" | "%" ) unary )* ;
unary          → ( "!" | "-" ) unary | postfix ;
postfix        → primary ( "(" arguments? ")" | "[" expression "]" )* ;
arguments      → expression ( "," expression )* ;
primary        → INT_LITERAL | FLOAT_LITERAL | STRING_LITERAL
               | "true" | "false" | IDENTIFIER
               | "(" expression ")"
               | "[" arguments? "]" ;
```

## 3. Precedencia y asociatividad

De **menor** a **mayor** precedencia (las de abajo se evalúan primero):

| Nivel | Operadores          | Asociatividad | Ejemplo                  | Se agrupa como           |
| ----- | ------------------- | ------------- | ------------------------ | ------------------------ |
| 1     | `=`                 | derecha       | `a = b = 1`              | `a = (b = 1)`            |
| 2     | `\|\|`              | izquierda     | `a \|\| b && c`          | `a \|\| (b && c)`        |
| 3     | `&&`                | izquierda     | `a && b && c`            | `(a && b) && c`          |
| 4     | `== !=`             | izquierda     | `a < b == c`             | `(a < b) == c`           |
| 5     | `< <= > >=`         | izquierda     | `a + 1 < b`              | `(a + 1) < b`            |
| 6     | `+ -`               | izquierda     | `10 - 4 - 3`             | `(10 - 4) - 3`           |
| 7     | `* / %`             | izquierda     | `1 + 2 * 3`              | `1 + (2 * 3)`            |
| 8     | `! -` (unarios)     | derecha       | `-a * b`, `!!ok`         | `(-a) * b`, `!(!ok)`     |
| 9     | `f(...)`, `a[...]`  | izquierda     | `m[i][j]`                | `(m[i])[j]`              |

Los paréntesis cambian el orden: `(1 + 2) * 3`.

## 4. Reglas que verifica el parser (además de la gramática)

Estas comprobaciones son sintácticas, se reportan como errores `syntax` y
no detienen el análisis:

1. `const` siempre necesita valor inicial: `const X: int;` es error.
2. `let` necesita tipo **o** valor inicial: `let y;` es error
   (`let y: int;` y `let y = 5;` son válidos).
3. Solo se puede asignar a una variable o a un elemento de arreglo:
   `5 = x;` y `f() = 3;` son errores.
4. Solo se llaman funciones por su nombre: `(a + b)(1)` es error.
5. Las funciones solo se declaran en el nivel superior del programa, no
   dentro de bloques (no hay funciones anidadas ni *closures*).
6. Los cuerpos de `if`, `else` y `while` deben ir entre llaves. Esto evita
   la ambigüedad del *dangling else*.

## 5. Lo que NO verifica el parser (le corresponde al análisis semántico)

El parser comprueba la **forma** del programa, no su **significado**. Estas
reglas quedan para la fase semántica:

- Que una variable o función esté declarada antes de usarse.
- Que no se declare dos veces el mismo nombre en un scope.
- Compatibilidad de tipos (`let x: int = "hola";` es sintácticamente válido).
- Inferencia del tipo cuando se omite (`let x = 5;`).
- Que no se reasigne una `const`.
- Que `return` esté dentro de una función y devuelva el tipo declarado.
- Número y tipo de argumentos en las llamadas.
- Que la condición de `if` / `while` sea `bool`.
- Que el índice de un arreglo sea `int`.

## 6. Decisiones de diseño

| Decisión | Motivo |
| -------- | ------ |
| Tipos con anotación opcional en variables (`let x = 5;`) | Comodidad; la inferencia es sencilla para el semántico (tipo del inicializador). |
| Retorno omitido = la función no devuelve valor | Evita agregar la palabra `void`. En el AST, `returnType: null`. |
| `print` recibe exactamente una expresión | Suficiente para el lenguaje; simplifica el AST y la VM. |
| Arreglos homogéneos con tipo `T[]` | Los tipos de arreglo son recursivos (`int[][]`) y fáciles de comparar. |
| Sin `for`, `break`, `continue`, `null` ni operadores compuestos (`+=`) | Mantener el lenguaje pequeño y explicable. Pueden agregarse después. |
