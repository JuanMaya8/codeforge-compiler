import { createDiagnostic, LexicalErrorCode, type CompilerDiagnostic } from '../errors.ts';
import {
  TokenType,
  lookupKeyword,
  type LiteralValue,
  type SourcePosition,
  type Token,
} from '../tokens.ts';

export interface LexerResult {
  /** Recognized tokens. The last one is always EOF. */
  tokens: Token[];
  errors: CompilerDiagnostic[];
}

/** Operators and delimiters made of a single character. */
const SINGLE_CHAR_TOKENS: Readonly<Record<string, TokenType>> = {
  '(': TokenType.LEFT_PAREN,
  ')': TokenType.RIGHT_PAREN,
  '{': TokenType.LEFT_BRACE,
  '}': TokenType.RIGHT_BRACE,
  '[': TokenType.LEFT_BRACKET,
  ']': TokenType.RIGHT_BRACKET,
  ',': TokenType.COMMA,
  ';': TokenType.SEMICOLON,
  ':': TokenType.COLON,
  '+': TokenType.PLUS,
  '*': TokenType.STAR,
  '%': TokenType.PERCENT,
};

/** Escape sequences allowed inside strings: `\n`, `\t`, `\"`, `\\`. */
const ESCAPE_SEQUENCES: Readonly<Record<string, string>> = {
  n: '\n',
  t: '\t',
  '"': '"',
  '\\': '\\',
};

/**
 * Lexical analyzer (scanner).
 *
 * It reads the source code character by character from left to right
 * and groups the characters into tokens. It keeps three cursors:
 *   - `start`:   index where the current lexeme begins.
 *   - `current`: index of the next character to read.
 *   - `line` / `column`: human position of `current`, used for tokens
 *     and error messages.
 *
 * Errors do not stop the scan: the invalid lexeme is reported, skipped,
 * and scanning continues, so all lexical errors are found in one pass.
 */
export class Lexer {
  private readonly source: string;
  private readonly tokens: Token[] = [];
  private readonly errors: CompilerDiagnostic[] = [];

  private start = 0;
  private current = 0;
  private line = 1;
  private column = 1;
  private startLine = 1;
  private startColumn = 1;

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): LexerResult {
    while (!this.isAtEnd()) {
      this.start = this.current;
      this.startLine = this.line;
      this.startColumn = this.column;
      this.scanToken();
    }

    this.tokens.push({
      type: TokenType.EOF,
      lexeme: '',
      literal: null,
      line: this.line,
      column: this.column,
    });

    return { tokens: this.tokens, errors: this.errors };
  }

  /** Reads one lexeme starting at `start` and emits its token (if any). */
  private scanToken(): void {
    const char = this.advance();

    if (char in SINGLE_CHAR_TOKENS) {
      this.addToken(SINGLE_CHAR_TOKENS[char]);
      return;
    }

    switch (char) {
      // Whitespace is ignored; `advance` already updates line/column.
      case ' ':
      case '\t':
      case '\r':
      case '\n':
        return;

      // Two-character operators: look one character ahead.
      case '-':
        this.addToken(this.match('>') ? TokenType.ARROW : TokenType.MINUS);
        return;
      case '=':
        this.addToken(this.match('=') ? TokenType.EQUAL : TokenType.ASSIGN);
        return;
      case '!':
        this.addToken(this.match('=') ? TokenType.NOT_EQUAL : TokenType.NOT);
        return;
      case '<':
        this.addToken(this.match('=') ? TokenType.LESS_EQUAL : TokenType.LESS);
        return;
      case '>':
        this.addToken(
          this.match('=') ? TokenType.GREATER_EQUAL : TokenType.GREATER,
        );
        return;
      case '&':
        if (this.match('&')) this.addToken(TokenType.AND);
        else this.error(LexicalErrorCode.UNEXPECTED_CHARACTER, "Carácter '&' inesperado. ¿Quisiste escribir '&&'?");
        return;
      case '|':
        if (this.match('|')) this.addToken(TokenType.OR);
        else this.error(LexicalErrorCode.UNEXPECTED_CHARACTER, "Carácter '|' inesperado. ¿Quisiste escribir '||'?");
        return;

      // Division or comment.
      case '/':
        if (this.match('/')) this.skipLineComment();
        else if (this.match('*')) this.skipBlockComment();
        else this.addToken(TokenType.SLASH);
        return;

      case '"':
        this.scanString();
        return;
    }

    if (isDigit(char)) {
      this.scanNumber();
    } else if (isIdentifierStart(char)) {
      this.scanIdentifier();
    } else {
      this.error(LexicalErrorCode.UNEXPECTED_CHARACTER, `Carácter '${char}' no reconocido.`);
    }
  }

  // ---------------------------------------------------------------------
  // Lexeme scanners
  // ---------------------------------------------------------------------

  /** Pattern: [0-9]+ ( '.' [0-9]+ )? */
  private scanNumber(): void {
    while (isDigit(this.peek())) this.advance();

    let isFloat = false;
    if (this.peek() === '.') {
      this.advance(); // consume '.'
      if (!isDigit(this.peek())) {
        this.error(
          LexicalErrorCode.MALFORMED_NUMBER,
          `Número decimal mal formado '${this.currentLexeme()}': se esperaba un dígito después del punto.`,
        );
        return;
      }
      isFloat = true;
      while (isDigit(this.peek())) this.advance();
    }

    // A number glued to letters (e.g. `12abc`) is not a valid lexeme.
    if (isIdentifierStart(this.peek())) {
      while (isIdentifierPart(this.peek())) this.advance();
      this.error(
        LexicalErrorCode.MALFORMED_NUMBER,
        `Número mal formado '${this.currentLexeme()}': un identificador no puede empezar con un dígito.`,
      );
      return;
    }

    const text = this.currentLexeme();
    this.addToken(
      isFloat ? TokenType.FLOAT_LITERAL : TokenType.INT_LITERAL,
      Number(text),
    );
  }

  /** Pattern: [a-zA-Z_] [a-zA-Z0-9_]* — then checks the keyword table. */
  private scanIdentifier(): void {
    while (isIdentifierPart(this.peek())) this.advance();

    const text = this.currentLexeme();
    const type = lookupKeyword(text);

    if (type === TokenType.TRUE) this.addToken(type, true);
    else if (type === TokenType.FALSE) this.addToken(type, false);
    else this.addToken(type);
  }

  /** Pattern: '"' (any char except '"' or newline, or an escape)* '"' */
  private scanString(): void {
    let value = '';

    while (this.peek() !== '"') {
      // Strings must be closed on the same line.
      if (this.isAtEnd() || this.peek() === '\n') {
        this.error(LexicalErrorCode.UNTERMINATED_STRING, 'Cadena de texto sin cerrar: falta la comilla doble final.');
        return;
      }

      const char = this.advance();
      if (char !== '\\') {
        value += char;
        continue;
      }

      const escaped = this.readEscape();
      if (escaped === null) return; // error already reported
      value += escaped;
    }

    this.advance(); // closing quote
    this.addToken(TokenType.STRING_LITERAL, value);
  }

  /**
   * Called after reading a backslash inside a string.
   * Supported escapes: \n \t \" \\ . Returns `null` on an invalid escape.
   */
  private readEscape(): string | null {
    const escapePosition = { line: this.line, column: this.column - 1 };
    const char = this.peek();

    if (Object.hasOwn(ESCAPE_SEQUENCES, char)) {
      this.advance();
      return ESCAPE_SEQUENCES[char];
    }

    this.errorAt(
      LexicalErrorCode.INVALID_ESCAPE,
      `Secuencia de escape '\\${char === '\0' ? '' : char}' no válida. Usa \\n, \\t, \\" o \\\\.`,
      escapePosition,
    );
    this.skipRestOfString();
    return null;
  }

  /** After an invalid escape, skip the rest of the string to avoid cascading errors. */
  private skipRestOfString(): void {
    while (!this.isAtEnd() && this.peek() !== '\n') {
      if (this.advance() === '"') return;
    }
  }

  /** `// ...` until the end of the line. */
  private skipLineComment(): void {
    while (this.peek() !== '\n' && !this.isAtEnd()) this.advance();
  }

  /** `/* ... *\/` possibly across several lines. */
  private skipBlockComment(): void {
    while (!this.isAtEnd()) {
      if (this.peek() === '*' && this.peekNext() === '/') {
        this.advance();
        this.advance();
        return;
      }
      this.advance();
    }
    this.error(LexicalErrorCode.UNTERMINATED_COMMENT, "Comentario de bloque sin cerrar: falta '*/'.");
  }

  // ---------------------------------------------------------------------
  // Character helpers
  // ---------------------------------------------------------------------

  private isAtEnd(): boolean {
    return this.current >= this.source.length;
  }

  /** Consumes the next character and updates line/column. */
  private advance(): string {
    const char = this.source[this.current++];
    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return char;
  }

  /** Consumes the next character only if it is the expected one. */
  private match(expected: string): boolean {
    if (this.peek() !== expected) return false;
    this.advance();
    return true;
  }

  /** Looks at the next character without consuming it. */
  private peek(): string {
    return this.isAtEnd() ? '\0' : this.source[this.current];
  }

  /** Looks two characters ahead without consuming anything. */
  private peekNext(): string {
    const index = this.current + 1;
    return index >= this.source.length ? '\0' : this.source[index];
  }

  private currentLexeme(): string {
    return this.source.slice(this.start, this.current);
  }

  private addToken(type: TokenType, literal: LiteralValue | null = null): void {
    this.tokens.push({
      type,
      lexeme: this.currentLexeme(),
      literal,
      line: this.startLine,
      column: this.startColumn,
    });
  }

  /** Records a lexical error at the start of the current lexeme. */
  private error(code: LexicalErrorCode, message: string): void {
    this.errorAt(code, message, { line: this.startLine, column: this.startColumn });
  }

  private errorAt(code: LexicalErrorCode, message: string, position: SourcePosition): void {
    this.errors.push(createDiagnostic({ phase: 'lexical', code, message, position }));
  }
}

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

function isIdentifierStart(char: string): boolean {
  return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_';
}

function isIdentifierPart(char: string): boolean {
  return isIdentifierStart(char) || isDigit(char);
}
