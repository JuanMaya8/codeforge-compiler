/**
 * Token contract for the CodeForge language.
 *
 * A token is the smallest meaningful unit of the source code. The Lexer
 * produces a list of tokens and the Parser consumes it.
 *
 * `TokenType` is declared as a constant object (instead of a TypeScript
 * `enum`) because the project compiles with `erasableSyntaxOnly`.
 * It is used exactly like an enum: `TokenType.LET`, `TokenType.PLUS`, ...
 */
export const TokenType = {
  // Keywords
  LET: 'LET',
  CONST: 'CONST',
  FUNCTION: 'FUNCTION',
  RETURN: 'RETURN',
  IF: 'IF',
  ELSE: 'ELSE',
  WHILE: 'WHILE',
  PRINT: 'PRINT',
  TRUE: 'TRUE',
  FALSE: 'FALSE',

  // Type keywords
  INT: 'INT',
  FLOAT: 'FLOAT',
  STRING: 'STRING',
  BOOL: 'BOOL',

  // Identifiers and literals
  IDENTIFIER: 'IDENTIFIER',
  INT_LITERAL: 'INT_LITERAL',
  FLOAT_LITERAL: 'FLOAT_LITERAL',
  STRING_LITERAL: 'STRING_LITERAL',

  // Arithmetic operators
  PLUS: 'PLUS', // +
  MINUS: 'MINUS', // -
  STAR: 'STAR', // *
  SLASH: 'SLASH', // /
  PERCENT: 'PERCENT', // %

  // Assignment
  ASSIGN: 'ASSIGN', // =

  // Relational operators
  EQUAL: 'EQUAL', // ==
  NOT_EQUAL: 'NOT_EQUAL', // !=
  LESS: 'LESS', // <
  LESS_EQUAL: 'LESS_EQUAL', // <=
  GREATER: 'GREATER', // >
  GREATER_EQUAL: 'GREATER_EQUAL', // >=

  // Logical operators
  AND: 'AND', // &&
  OR: 'OR', // ||
  NOT: 'NOT', // !

  // Delimiters
  LEFT_PAREN: 'LEFT_PAREN', // (
  RIGHT_PAREN: 'RIGHT_PAREN', // )
  LEFT_BRACE: 'LEFT_BRACE', // {
  RIGHT_BRACE: 'RIGHT_BRACE', // }
  LEFT_BRACKET: 'LEFT_BRACKET', // [
  RIGHT_BRACKET: 'RIGHT_BRACKET', // ]
  COMMA: 'COMMA', // ,
  SEMICOLON: 'SEMICOLON', // ;
  COLON: 'COLON', // :
  ARROW: 'ARROW', // ->

  // End of input
  EOF: 'EOF',
} as const;

export type TokenType = (typeof TokenType)[keyof typeof TokenType];

/** Position inside the source code. Lines and columns start at 1. */
export interface SourcePosition {
  line: number;
  column: number;
}

/** Already-converted value of a literal token. */
export type LiteralValue = number | string | boolean;

export interface Token extends SourcePosition {
  type: TokenType;
  /** Exact text taken from the source, e.g. `"hello"` (with quotes) or `3.14`. */
  lexeme: string;
  /**
   * Converted value for literal tokens (numbers, strings, true/false).
   * For strings it holds the text without quotes and with escapes resolved.
   * It is `null` for every other token.
   */
  literal: LiteralValue | null;
}

/** Reserved words of the language mapped to their token type. */
export const KEYWORDS: Readonly<Record<string, TokenType>> = {
  let: TokenType.LET,
  const: TokenType.CONST,
  function: TokenType.FUNCTION,
  return: TokenType.RETURN,
  if: TokenType.IF,
  else: TokenType.ELSE,
  while: TokenType.WHILE,
  print: TokenType.PRINT,
  true: TokenType.TRUE,
  false: TokenType.FALSE,
  int: TokenType.INT,
  float: TokenType.FLOAT,
  string: TokenType.STRING,
  bool: TokenType.BOOL,
};

/** Returns the token type for a word: a keyword type or IDENTIFIER. */
export function lookupKeyword(word: string): TokenType {
  return Object.hasOwn(KEYWORDS, word) ? KEYWORDS[word] : TokenType.IDENTIFIER;
}
