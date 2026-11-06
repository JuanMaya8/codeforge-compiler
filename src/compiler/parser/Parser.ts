import type {
  BinaryOperator,
  BlockStatement,
  Expression,
  FunctionDeclaration,
  IfStatement,
  Parameter,
  PrimitiveTypeName,
  Program,
  Statement,
  TypeAnnotation,
  VariableDeclaration,
} from '../ast/index.ts';
import { createDiagnostic, SyntaxErrorCode, type CompilerDiagnostic } from '../errors.ts';
import { TokenType, type SourcePosition, type Token } from '../tokens.ts';

export interface ParserResult {
  /**
   * The AST. It is always returned, even with errors (statements that
   * failed are left out), but later phases must only use it when
   * `errors` is empty.
   */
  program: Program;
  errors: CompilerDiagnostic[];
}

/**
 * Internal signal used for panic-mode error recovery. It is thrown when a
 * statement cannot be parsed and caught in `declarationWithRecovery`.
 * It never leaves the parser.
 */
class ParseError extends Error {}

const TYPE_KEYWORDS: Partial<Record<TokenType, PrimitiveTypeName>> = {
  [TokenType.INT]: 'int',
  [TokenType.FLOAT]: 'float',
  [TokenType.STRING]: 'string',
  [TokenType.BOOL]: 'bool',
};

/** Tokens that begin a statement; used to resynchronize after an error. */
const STATEMENT_START: ReadonlySet<TokenType> = new Set<TokenType>([
  TokenType.LET,
  TokenType.CONST,
  TokenType.FUNCTION,
  TokenType.IF,
  TokenType.WHILE,
  TokenType.RETURN,
  TokenType.PRINT,
]);

/** Binary operator tokens mapped to the operator stored in the AST. */
const BINARY_OPERATORS: Partial<Record<TokenType, BinaryOperator>> = {
  [TokenType.OR]: '||',
  [TokenType.AND]: '&&',
  [TokenType.EQUAL]: '==',
  [TokenType.NOT_EQUAL]: '!=',
  [TokenType.LESS]: '<',
  [TokenType.LESS_EQUAL]: '<=',
  [TokenType.GREATER]: '>',
  [TokenType.GREATER_EQUAL]: '>=',
  [TokenType.PLUS]: '+',
  [TokenType.MINUS]: '-',
  [TokenType.STAR]: '*',
  [TokenType.SLASH]: '/',
  [TokenType.PERCENT]: '%',
};

/** Tokens that can begin a primary expression. */
const PRIMARY_START: ReadonlySet<TokenType> = new Set<TokenType>([
  TokenType.INT_LITERAL,
  TokenType.FLOAT_LITERAL,
  TokenType.STRING_LITERAL,
  TokenType.TRUE,
  TokenType.FALSE,
  TokenType.IDENTIFIER,
  TokenType.LEFT_PAREN,
  TokenType.LEFT_BRACKET,
]);

/**
 * Recursive descent parser.
 *
 * Each grammar rule (see docs/GRAMATICA.md) is implemented by one method
 * with the same name. A method reads the tokens of its rule, calls the
 * methods of the sub-rules and returns the AST node it built.
 */
export class Parser {
  private readonly tokens: Token[];
  private readonly errors: CompilerDiagnostic[] = [];
  private current = 0;

  constructor(tokens: Token[]) {
    const last = tokens.at(-1);
    // The parser relies on a final EOF token; add one if it is missing.
    this.tokens =
      last?.type === TokenType.EOF
        ? tokens
        : [
            ...tokens,
            {
              type: TokenType.EOF,
              lexeme: '',
              literal: null,
              line: last?.line ?? 1,
              column: last ? last.column + last.lexeme.length : 1,
            },
          ];
  }

  /** program → declaration* EOF */
  parse(): ParserResult {
    const body: Statement[] = [];
    while (!this.isAtEnd()) {
      const statement = this.declarationWithRecovery(true);
      if (statement) body.push(statement);
    }

    const program: Program = { kind: 'Program', body, position: { line: 1, column: 1 } };
    return { program, errors: this.errors };
  }

  // ---------------------------------------------------------------------
  // Declarations and statements
  // ---------------------------------------------------------------------

  /**
   * Parses one declaration. On a syntax error, records it, skips tokens
   * until the next statement (panic mode) and returns null, so parsing
   * can continue and report more errors.
   */
  private declarationWithRecovery(isTopLevel: boolean): Statement | null {
    const start = this.current;
    try {
      return this.declaration(isTopLevel);
    } catch (error) {
      if (!(error instanceof ParseError)) throw error;
      this.synchronize();
      // Guarantee progress so the same token cannot fail forever.
      if (this.current === start) this.advance();
      return null;
    }
  }

  /** declaration → varDecl | funcDecl | statement */
  private declaration(isTopLevel: boolean): Statement {
    if (this.match(TokenType.LET, TokenType.CONST)) return this.varDecl();
    if (this.match(TokenType.FUNCTION)) {
      if (!isTopLevel) {
        this.report(
          SyntaxErrorCode.NESTED_FUNCTION,
          this.previous(),
          'Las funciones solo pueden declararse en el nivel superior del programa, no dentro de un bloque.',
        );
      }
      return this.funcDecl();
    }
    return this.statement();
  }

  /** varDecl → ("let" | "const") IDENTIFIER (":" type)? ("=" expression)? ";" */
  private varDecl(): VariableDeclaration {
    const keyword = this.previous();
    const mutability = keyword.type === TokenType.CONST ? 'const' : 'let';
    const name = this.consume(TokenType.IDENTIFIER, `Se esperaba el nombre de la variable después de '${mutability}'`);

    const typeAnnotation = this.match(TokenType.COLON) ? this.type() : null;
    const initializer = this.match(TokenType.ASSIGN) ? this.expression() : null;
    this.consume(TokenType.SEMICOLON, "Se esperaba ';' al final de la declaración de variable");

    // These checks do not stop parsing: the statement is still well formed.
    if (mutability === 'const' && initializer === null) {
      this.report(SyntaxErrorCode.CONST_WITHOUT_INITIALIZER, name, `La constante '${name.lexeme}' debe tener un valor inicial.`);
    } else if (typeAnnotation === null && initializer === null) {
      this.report(SyntaxErrorCode.MISSING_TYPE_OR_INITIALIZER, name, `La variable '${name.lexeme}' necesita un tipo (': int') o un valor inicial.`);
    }

    return {
      kind: 'VariableDeclaration',
      mutability,
      name: name.lexeme,
      typeAnnotation,
      initializer,
      position: positionOf(keyword),
    };
  }

  /** funcDecl → "function" IDENTIFIER "(" params? ")" ("->" type)? block */
  private funcDecl(): FunctionDeclaration {
    const keyword = this.previous();
    const name = this.consume(TokenType.IDENTIFIER, "Se esperaba el nombre de la función después de 'function'");
    this.consume(TokenType.LEFT_PAREN, `Se esperaba '(' después del nombre de la función '${name.lexeme}'`);

    // params → param ("," param)*
    const params: Parameter[] = [];
    if (!this.check(TokenType.RIGHT_PAREN)) {
      do {
        params.push(this.param());
      } while (this.match(TokenType.COMMA));
    }
    this.consume(TokenType.RIGHT_PAREN, "Se esperaba ')' después de los parámetros");

    const returnType = this.match(TokenType.ARROW) ? this.type() : null;
    const body = this.block(`el cuerpo de la función '${name.lexeme}'`);

    return {
      kind: 'FunctionDeclaration',
      name: name.lexeme,
      params,
      returnType,
      body,
      position: positionOf(keyword),
    };
  }

  /** param → IDENTIFIER ":" type */
  private param(): Parameter {
    const name = this.consume(TokenType.IDENTIFIER, 'Se esperaba el nombre del parámetro');
    this.consume(TokenType.COLON, `Se esperaba ':' y el tipo del parámetro '${name.lexeme}'`);
    return {
      kind: 'Parameter',
      name: name.lexeme,
      typeAnnotation: this.type(),
      position: positionOf(name),
    };
  }

  /** type → ("int" | "float" | "string" | "bool") ("[" "]")* */
  private type(): TypeAnnotation {
    const token = this.peek();
    const name = TYPE_KEYWORDS[token.type];
    if (!name) {
      throw this.error(SyntaxErrorCode.EXPECTED_TYPE, token, `Se esperaba un tipo (int, float, string o bool), pero se encontró ${describe(token)}.`);
    }
    this.advance();

    let type: TypeAnnotation = { kind: 'PrimitiveType', name, position: positionOf(token) };
    while (this.match(TokenType.LEFT_BRACKET)) {
      this.consume(TokenType.RIGHT_BRACKET, "Se esperaba ']' en el tipo arreglo");
      type = { kind: 'ArrayType', elementType: type, position: positionOf(token) };
    }
    return type;
  }

  /** statement → ifStmt | whileStmt | returnStmt | printStmt | block | exprStmt */
  private statement(): Statement {
    if (this.match(TokenType.IF)) return this.ifStmt();
    if (this.match(TokenType.WHILE)) return this.whileStmt();
    if (this.match(TokenType.RETURN)) return this.returnStmt();
    if (this.match(TokenType.PRINT)) return this.printStmt();
    if (this.check(TokenType.LEFT_BRACE)) return this.block('el bloque');
    return this.exprStmt();
  }

  /** ifStmt → "if" "(" expression ")" block ("else" (ifStmt | block))? */
  private ifStmt(): IfStatement {
    const keyword = this.previous();
    this.consume(TokenType.LEFT_PAREN, "Se esperaba '(' después de 'if'");
    const condition = this.expression();
    this.consume(TokenType.RIGHT_PAREN, "Se esperaba ')' después de la condición del if");
    const consequent = this.block('el if');

    let alternate: IfStatement | BlockStatement | null = null;
    if (this.match(TokenType.ELSE)) {
      alternate = this.match(TokenType.IF) ? this.ifStmt() : this.block('el else');
    }

    return { kind: 'IfStatement', condition, consequent, alternate, position: positionOf(keyword) };
  }

  /** whileStmt → "while" "(" expression ")" block */
  private whileStmt(): Statement {
    const keyword = this.previous();
    this.consume(TokenType.LEFT_PAREN, "Se esperaba '(' después de 'while'");
    const condition = this.expression();
    this.consume(TokenType.RIGHT_PAREN, "Se esperaba ')' después de la condición del while");
    const body = this.block('el while');
    return { kind: 'WhileStatement', condition, body, position: positionOf(keyword) };
  }

  /** returnStmt → "return" expression? ";" */
  private returnStmt(): Statement {
    const keyword = this.previous();
    const argument = this.check(TokenType.SEMICOLON) ? null : this.expression();
    this.consume(TokenType.SEMICOLON, "Se esperaba ';' después de return");
    return { kind: 'ReturnStatement', argument, position: positionOf(keyword) };
  }

  /** printStmt → "print" "(" expression ")" ";" */
  private printStmt(): Statement {
    const keyword = this.previous();
    this.consume(TokenType.LEFT_PAREN, "Se esperaba '(' después de 'print'");
    const argument = this.expression();
    this.consume(TokenType.RIGHT_PAREN, "Se esperaba ')' después del valor de print");
    this.consume(TokenType.SEMICOLON, "Se esperaba ';' después de print(...)");
    return { kind: 'PrintStatement', argument, position: positionOf(keyword) };
  }

  /** block → "{" declaration* "}" */
  private block(owner: string): BlockStatement {
    const open = this.consume(TokenType.LEFT_BRACE, `Se esperaba '{' para abrir ${owner}`);
    const body: Statement[] = [];

    while (!this.check(TokenType.RIGHT_BRACE) && !this.isAtEnd()) {
      const statement = this.declarationWithRecovery(false);
      if (statement) body.push(statement);
    }

    this.consume(TokenType.RIGHT_BRACE, `Se esperaba '}' para cerrar ${owner} abierto en la línea ${open.line}`);
    return { kind: 'BlockStatement', body, position: positionOf(open) };
  }

  /** exprStmt → expression ";" */
  private exprStmt(): Statement {
    const start = this.peek();
    const expression = this.expression();
    this.consume(TokenType.SEMICOLON, "Se esperaba ';' al final de la expresión");
    return { kind: 'ExpressionStatement', expression, position: positionOf(start) };
  }

  // ---------------------------------------------------------------------
  // Expressions
  // ---------------------------------------------------------------------

  /*
   * Operator precedence, from lowest to highest. Each level is one method
   * that calls the next (higher) level, so higher-precedence operators end
   * up deeper in the tree and are evaluated first:
   *
   *   assignment  =                 right associative
   *   logicOr     ||                left associative
   *   logicAnd    &&                left associative
   *   equality    == !=             left associative
   *   comparison  < <= > >=         left associative
   *   term        + -               left associative
   *   factor      * / %             left associative
   *   unary       ! -  (prefix)     right associative
   *   postfix     call(), index[]
   *   primary     literals, names, ( ), [ ]
   */

  /** expression → assignment */
  private expression(): Expression {
    return this.assignment();
  }

  /** assignment → logicOr ( "=" assignment )? */
  private assignment(): Expression {
    const target = this.logicOr();

    if (this.match(TokenType.ASSIGN)) {
      const equals = this.previous();
      // Recursion (instead of a loop) makes `a = b = 1` group as `a = (b = 1)`.
      const value = this.assignment();

      if (target.kind === 'IdentifierExpression' || target.kind === 'IndexExpression') {
        return { kind: 'AssignmentExpression', target, value, position: target.position };
      }
      this.report(SyntaxErrorCode.INVALID_ASSIGNMENT_TARGET, equals, 'Destino de asignación no válido: solo se puede asignar a una variable o a un elemento de un arreglo.');
    }

    return target;
  }

  /** logicOr → logicAnd ( "||" logicAnd )* */
  private logicOr(): Expression {
    return this.binaryLevel(() => this.logicAnd(), TokenType.OR);
  }

  /** logicAnd → equality ( "&&" equality )* */
  private logicAnd(): Expression {
    return this.binaryLevel(() => this.equality(), TokenType.AND);
  }

  /** equality → comparison ( ("==" | "!=") comparison )* */
  private equality(): Expression {
    return this.binaryLevel(() => this.comparison(), TokenType.EQUAL, TokenType.NOT_EQUAL);
  }

  /** comparison → term ( ("<" | "<=" | ">" | ">=") term )* */
  private comparison(): Expression {
    return this.binaryLevel(
      () => this.term(),
      TokenType.LESS,
      TokenType.LESS_EQUAL,
      TokenType.GREATER,
      TokenType.GREATER_EQUAL,
    );
  }

  /** term → factor ( ("+" | "-") factor )* */
  private term(): Expression {
    return this.binaryLevel(() => this.factor(), TokenType.PLUS, TokenType.MINUS);
  }

  /** factor → unary ( ("*" | "/" | "%") unary )* */
  private factor(): Expression {
    return this.binaryLevel(() => this.unary(), TokenType.STAR, TokenType.SLASH, TokenType.PERCENT);
  }

  /**
   * Shared logic of every left-associative binary level:
   *   operand ( operator operand )*
   * The loop builds the tree to the left: `a - b - c` → `(a - b) - c`.
   */
  private binaryLevel(operand: () => Expression, ...operators: TokenType[]): Expression {
    let left = operand();

    while (this.match(...operators)) {
      const operator = BINARY_OPERATORS[this.previous().type];
      const right = operand();
      // `operator` is always defined: `operators` only contains binary tokens.
      left = { kind: 'BinaryExpression', operator: operator!, left, right, position: left.position };
    }

    return left;
  }

  /** unary → ("!" | "-") unary | postfix */
  private unary(): Expression {
    if (this.match(TokenType.NOT, TokenType.MINUS)) {
      const operatorToken = this.previous();
      const operand = this.unary();
      return {
        kind: 'UnaryExpression',
        operator: operatorToken.type === TokenType.NOT ? '!' : '-',
        operand,
        position: positionOf(operatorToken),
      };
    }
    return this.postfix();
  }

  /** postfix → primary ( "(" arguments? ")" | "[" expression "]" )* */
  private postfix(): Expression {
    let expression = this.primary();

    for (;;) {
      if (this.match(TokenType.LEFT_PAREN)) {
        const paren = this.previous();
        if (expression.kind !== 'IdentifierExpression') {
          throw this.error(SyntaxErrorCode.INVALID_CALLEE, paren, 'Solo se pueden llamar funciones usando su nombre.');
        }
        const args = this.check(TokenType.RIGHT_PAREN) ? [] : this.expressionList();
        this.consume(TokenType.RIGHT_PAREN, "Se esperaba ')' después de los argumentos");
        expression = { kind: 'CallExpression', callee: expression, args, position: expression.position };
      } else if (this.match(TokenType.LEFT_BRACKET)) {
        const index = this.expression();
        this.consume(TokenType.RIGHT_BRACKET, "Se esperaba ']' después del índice");
        expression = { kind: 'IndexExpression', object: expression, index, position: expression.position };
      } else {
        return expression;
      }
    }
  }

  /**
   * primary → INT_LITERAL | FLOAT_LITERAL | STRING_LITERAL | "true" | "false"
   *         | IDENTIFIER | "(" expression ")" | "[" arguments? "]"
   */
  private primary(): Expression {
    const token = this.peek();
    const position = positionOf(token);
    if (!PRIMARY_START.has(token.type)) {
      throw this.error(SyntaxErrorCode.EXPECTED_EXPRESSION, token, `Se esperaba una expresión, pero se encontró ${describe(token)}.`);
    }
    this.advance();

    switch (token.type) {
      case TokenType.INT_LITERAL:
        return { kind: 'LiteralExpression', literalType: 'int', value: token.literal as number, position };
      case TokenType.FLOAT_LITERAL:
        return { kind: 'LiteralExpression', literalType: 'float', value: token.literal as number, position };
      case TokenType.STRING_LITERAL:
        return { kind: 'LiteralExpression', literalType: 'string', value: token.literal as string, position };
      case TokenType.TRUE:
      case TokenType.FALSE:
        return { kind: 'LiteralExpression', literalType: 'bool', value: token.type === TokenType.TRUE, position };
      case TokenType.IDENTIFIER:
        return { kind: 'IdentifierExpression', name: token.lexeme, position };
      case TokenType.LEFT_PAREN: {
        const inner = this.expression();
        this.consume(TokenType.RIGHT_PAREN, "Se esperaba ')' para cerrar la expresión");
        return inner;
      }
      default: {
        // LEFT_BRACKET: the only remaining PRIMARY_START token.
        const elements = this.check(TokenType.RIGHT_BRACKET) ? [] : this.expressionList();
        this.consume(TokenType.RIGHT_BRACKET, "Se esperaba ']' para cerrar el arreglo");
        return { kind: 'ArrayExpression', elements, position };
      }
    }
  }

  /** arguments → expression ("," expression)* */
  private expressionList(): Expression[] {
    const list: Expression[] = [];
    do {
      list.push(this.expression());
    } while (this.match(TokenType.COMMA));
    return list;
  }

  // ---------------------------------------------------------------------
  // Token helpers
  // ---------------------------------------------------------------------

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  /** Consumes the current token if it has one of the given types. */
  private match(...types: TokenType[]): boolean {
    if (!types.some((type) => this.check(type))) return false;
    this.advance();
    return true;
  }

  /** Consumes a token of the expected type or throws a syntax error. */
  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();

    const found = this.peek();
    const previous = this.tokens[this.current - 1];
    // If the expected token was missing at the end of a line (typically
    // ';'), point to the end of the previous token, not the next line.
    const position =
      previous && previous.line < found.line
        ? { line: previous.line, column: previous.column + previous.lexeme.length }
        : positionOf(found);

    throw this.errorAt(SyntaxErrorCode.EXPECTED_TOKEN, position, `${message}, pero se encontró ${describe(found)}.`);
  }

  // ---------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------

  /** Records an error that does not interrupt parsing. */
  private report(code: SyntaxErrorCode, token: Token, message: string): void {
    this.errors.push(createDiagnostic({ phase: 'syntax', code, message, position: positionOf(token) }));
  }

  /** Records an error and returns the signal to abort the current statement. */
  private error(code: SyntaxErrorCode, token: Token, message: string): ParseError {
    return this.errorAt(code, positionOf(token), message);
  }

  private errorAt(code: SyntaxErrorCode, position: SourcePosition, message: string): ParseError {
    this.errors.push(createDiagnostic({ phase: 'syntax', code, message, position }));
    return new ParseError(message);
  }

  /**
   * Panic mode: discard tokens until a point where a new statement
   * probably begins (after ';', before a keyword, or before '}').
   * A whole `{ ... }` block found while skipping is discarded too, so the
   * body of a broken `function`/`if` header does not produce extra errors.
   */
  private synchronize(): void {
    while (!this.isAtEnd()) {
      if (this.previous()?.type === TokenType.SEMICOLON) return;
      const next = this.peek().type;
      if (STATEMENT_START.has(next) || next === TokenType.RIGHT_BRACE) return;
      if (next === TokenType.LEFT_BRACE) this.skipBlock();
      else this.advance();
    }
  }

  /** Skips from '{' to its matching '}' (or to the end of the input). */
  private skipBlock(): void {
    let depth = 0;
    do {
      const token = this.advance();
      if (token.type === TokenType.LEFT_BRACE) depth++;
      else if (token.type === TokenType.RIGHT_BRACE) depth--;
    } while (depth > 0 && !this.isAtEnd());
  }
}

function positionOf(token: Token): SourcePosition {
  return { line: token.line, column: token.column };
}

/** Describes a token for error messages: `'print'` or `fin del archivo`. */
function describe(token: Token): string {
  return token.type === TokenType.EOF ? 'el fin del archivo' : `'${token.lexeme}'`;
}
