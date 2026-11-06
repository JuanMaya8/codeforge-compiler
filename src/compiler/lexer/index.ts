import { Lexer, type LexerResult } from './Lexer.ts';

export { Lexer, type LexerResult };

/** Converts source code into tokens. Shortcut for `new Lexer(source).tokenize()`. */
export function tokenize(source: string): LexerResult {
  return new Lexer(source).tokenize();
}
