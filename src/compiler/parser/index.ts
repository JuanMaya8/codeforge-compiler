import type { Token } from '../tokens.ts';
import { Parser, type ParserResult } from './Parser.ts';

export { Parser, type ParserResult };

/** Builds the AST from a token list. Shortcut for `new Parser(tokens).parse()`. */
export function parseTokens(tokens: Token[]): ParserResult {
  return new Parser(tokens).parse();
}
