import { createError, type CompilerError } from '../errors.ts';
import {
  TokenType,
  lookupKeyword,
  type LiteralValue,
  type Token,
} from '../tokens.ts';

export interface LexerResult {
  /** Recognized tokens. The last one is always EOF. */
  tokens: Token[];
  errors: CompilerError[];
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

/**
 * Lexical analyzer (scanner).
 *
 * It reads the source code character by character from left to right
 * and groups the characters into tokens. It keeps three cursors:
 *   - `start`:   index where the current lexeme begins.
 *   - `current`: index of the next character to read.
 *   - `line` / `column`: human position of `current`, used for tokens
 *     and error messages.
 */
export class Lexer {
  private readonly source: string;
  private readonly tokens: Token[] = [];
  private readonly errors: CompilerError[] = [];

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
        else this.error("Carácter '&' inesperado. ¿Quisiste escribir '&&'?");
        return;
      case '|':
        if (this.match('|')) this.addToken(TokenType.OR);
        else this.error("Carácter '|' inesperado. ¿Quisiste escribir '||'?");
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
      this.error(`Carácter '${char}' no reconocido.`);
    }
  }

  // ---------------------------------------------------------------------
  // Lexeme scanners
  // ---------------------------------------------------------------------

  /** Pattern: [0-9]+ ( '.' [0-9]+ )? */
  private scanNumber(): void {
    while (isDigit(this.peek())) this.advance();

    let isFloat = false;
    if (this.peek() === '.' && isDigit(this.peekNext())) {
      isFloat = true;
      this.advance(); // consume '.'
      while (isDigit(this.peek())) this.advance();
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

    while (this.peek() !== '"' && !this.isAtEnd()) {
      const char = this.advance();
      value += char === '\\' ? this.readEscape() : char;
    }

    this.advance(); // closing quote
    this.addToken(TokenType.STRING_LITERAL, value);
  }

  /** Called after reading a backslash inside a string. */
  private readEscape(): string {
    const char = this.advance();
    switch (char) {
      case 'n':
        return '\n';
      case 't':
        return '\t';
      case '"':
        return '"';
      case '\\':
        return '\\';
      default:
        return char;
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
  private error(message: string): void {
    this.errors.push(
      createError('lexical', message, {
        line: this.startLine,
        column: this.startColumn,
      }),
    );
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
