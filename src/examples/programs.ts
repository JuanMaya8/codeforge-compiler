/**
 * Example programs shown in the interface.
 *
 * Every program follows docs/GRAMATICA.md. `programs.test.ts` runs each one
 * through the real `runSource()` and checks the stage it reaches and its
 * output, so an example can never silently stop working.
 */
export type ExampleGroup = 'language' | 'errors';

export interface ExampleProgram {
  id: string;
  title: string;
  description: string;
  group: ExampleGroup;
  source: string;
}

export const EXAMPLE_GROUPS: Record<ExampleGroup, string> = {
  language: 'Lenguaje',
  errors: 'Errores para demostración',
};

export const EXAMPLES: readonly ExampleProgram[] = [
  {
    id: 'hello',
    title: 'Hola mundo y aritmética',
    description: 'print, precedencia de operadores y división entera.',
    group: 'language',
    source: `// Hola mundo y operaciones aritméticas
print("Hola, CodeForge!");

print(2 + 3 * 4);       // * tiene mayor precedencia que +
print((2 + 3) * 4);     // los paréntesis cambian el orden
print(17 / 5);          // división entera entre int
print(17 % 5);          // residuo
print(7.5 * 2.0);       // operación entre float
print(10 - 4 - 3);      // asociatividad izquierda
`,
  },
  {
    id: 'variables',
    title: 'Variables y constantes',
    description: 'let, const, tipos explícitos e inferidos y asignación.',
    group: 'language',
    source: `// Declaración y uso de variables
const PI: float = 3.14;
let radius: float = 2.0;
let area: float = PI * radius * radius;
print(area);

let name = "Ana";          // tipo inferido: string
let age: int = 20;
age = age + 1;             // reasignación de una variable let
print(name + " tiene");
print(age);

let isAdult: bool = age >= 18;
print(isAdult);
`,
  },
  {
    id: 'conditionals',
    title: 'Condicionales if / else',
    description: 'if, else if, else y operadores lógicos.',
    group: 'language',
    source: `// Condicionales
let score: int = 78;

if (score >= 90) {
    print("Excelente");
} else if (score >= 70) {
    print("Aprobado");
} else {
    print("Reprobado");
}

let hasId: bool = true;
let age: int = 17;
if (age >= 18 && hasId) {
    print("Puede ingresar");
} else {
    print("No puede ingresar");
}

if (!(score < 50) || false) {
    print("Supera el 50");
}
`,
  },
  {
    id: 'loops',
    title: 'Ciclos while',
    description: 'Acumuladores, contadores y ciclos anidados.',
    group: 'language',
    source: `// Ciclos while
let i: int = 1;
let sum: int = 0;
while (i <= 10) {
    sum = sum + i;
    i = i + 1;
}
print(sum);   // 1 + 2 + ... + 10

// Tabla del 3
let n: int = 1;
while (n <= 5) {
    print(3 * n);
    n = n + 1;
}

// Ciclos anidados: cuenta pares (row, col) con row < col
let pairs: int = 0;
let row: int = 0;
while (row < 4) {
    let col: int = 0;
    while (col < 4) {
        if (row < col) {
            pairs = pairs + 1;
        }
        col = col + 1;
    }
    row = row + 1;
}
print(pairs);
`,
  },
  {
    id: 'functions',
    title: 'Funciones',
    description: 'Parámetros, valores de retorno y funciones sin retorno.',
    group: 'language',
    source: `// Funciones
function sum(a: int, b: int) -> int {
    return a + b;
}

function max(a: int, b: int) -> int {
    if (a > b) {
        return a;
    }
    return b;
}

function average(a: float, b: float) -> float {
    return (a + b) / 2.0;
}

// Sin "-> tipo": la función no devuelve valor
function greet(name: string) {
    print("Hola, " + name);
}

let age: int = 21;
if (age >= 18) {
    print(sum(age, 5));
} else {
    print("Minor");
}
print(max(sum(2, 3), 4));
print(average(3.0, 4.0));
greet("CodeForge");
`,
  },
  {
    id: 'recursion',
    title: 'Recursividad',
    description: 'Factorial, Fibonacci y potencia: un frame por llamada.',
    group: 'language',
    source: `// Recursividad: cada llamada crea su propio frame en el Stack
function factorial(n: int) -> int {
    if (n <= 1) {
        return 1;
    }
    return n * factorial(n - 1);
}

function fibonacci(n: int) -> int {
    if (n < 2) {
        return n;
    }
    return fibonacci(n - 1) + fibonacci(n - 2);
}

function power(base: int, exp: int) -> int {
    if (exp == 0) {
        return 1;
    }
    return base * power(base, exp - 1);
}

print(factorial(5));
print(fibonacci(10));
print(power(2, 8));
`,
  },
  {
    id: 'arrays',
    title: 'Arreglos',
    description: 'Arreglos en el Heap, matrices, paso por referencia y alias.',
    group: 'language',
    source: `// Arreglos: viven en el Heap y se manejan por referencia
function double(xs: int[], n: int) {
    let i: int = 0;
    while (i < n) {
        xs[i] = xs[i] * 2;
        i = i + 1;
    }
}

function sumArray(xs: int[], i: int, n: int) -> int {
    if (i >= n) {
        return 0;
    }
    return xs[i] + sumArray(xs, i + 1, n);
}

let numbers: int[] = [1, 2, 3, 4];
double(numbers, 4);          // modifica el mismo bloque del Heap
print(numbers[0]);
print(sumArray(numbers, 0, 4));

let alias: int[] = numbers;  // alias: misma referencia
alias[3] = 100;
print(numbers[3]);

// Matriz: un arreglo de referencias a otros arreglos
let grid: int[][] = [[1, 2], [3, 4]];
grid[1][0] = 30;
print(grid[1][0] + grid[0][1]);

let words: string[] = ["compilador", "educativo"];
print(words[0] + " " + words[1]);
`,
  },
  {
    id: 'lexical-error',
    title: 'Error léxico',
    description: 'Caracteres y números que el Lexer no reconoce.',
    group: 'errors',
    source: `// El Lexer reporta todos los errores léxicos en una pasada
let price: int = 12abc;
let total: int = price @ 2;
print("sin cerrar);
`,
  },
  {
    id: 'syntax-error',
    title: 'Error sintáctico',
    description: 'Tokens válidos en un orden inválido; el parser se recupera.',
    group: 'errors',
    source: `// El parser reporta el error y continúa (panic mode)
let x: int = 5
let y: int = ;
if (x > 3) print(x);
print(sum(1, 2);
`,
  },
  {
    id: 'semantic-error',
    title: 'Error semántico',
    description: 'Programa bien escrito pero sin sentido: tipos y nombres.',
    group: 'errors',
    source: `// Bien formado, pero el análisis semántico lo rechaza
const LIMIT: int = 10;
let name: string = "Ana";
let age: int = "veinte";     // tipo incompatible
LIMIT = 20;                  // reasignar una constante
print(name + 5);             // string + int
print(undefinedVar);         // variable no declarada
`,
  },
  {
    id: 'runtime-error',
    title: 'Error en ejecución',
    description: 'Compila, pero falla en la VM: índice fuera de rango.',
    group: 'errors',
    source: `// Compila correctamente, pero falla al ejecutarse
function sumFirst(xs: int[], count: int) -> int {
    let total: int = 0;
    let i: int = 0;
    while (i < count) {
        total = total + xs[i];   // i = 3 no existe
        i = i + 1;
    }
    return total;
}

let values: int[] = [10, 20, 30];
print(values[0]);
print(sumFirst(values, 4));
`,
  },
];

export const DEFAULT_EXAMPLE = EXAMPLES[0];

export function findExample(id: string): ExampleProgram | undefined {
  return EXAMPLES.find((example) => example.id === id);
}
