/**
 * Public entry point of the compiler frontend (Lexer + Parser + AST).
 *
 * Other phases should import from this file:
 *
 *   import { parseSource } from './compiler/frontend.ts';
 *
 *   const result = parseSource(code);
 *   if (result.success) semanticAnalyzer.analyze(result.program);
 *   else showErrors(result.errors);
 */
import type { Program } from './ast/index.ts';
import type { CompilerDiagnostic } from './errors.ts';
import { tokenize } from './lexer/index.ts';
import { parseTokens } from './parser/index.ts';
import type { Token } from './tokens.ts';

export interface FrontendResult {
  /** `true` when there are no lexical or syntax errors. */
  success: boolean;
  tokens: Token[];
  /** The AST, or `null` if the lexer failed (the parser is not run then). */
  program: Program | null;
  /** Lexical diagnostics, or syntax diagnostics when the lexer succeeded. */
  errors: CompilerDiagnostic[];
}

/**
 * Runs the whole frontend: source code → tokens → AST.
 *
 * If the lexer reports errors the parser is skipped, because parsing an
 * incomplete token list would only produce confusing extra errors.
 */
export function parseSource(source: string): FrontendResult {
  const lexerResult = tokenize(source);
  if (lexerResult.errors.length > 0) {
    return { success: false, tokens: lexerResult.tokens, program: null, errors: lexerResult.errors };
  }

  const parserResult = parseTokens(lexerResult.tokens);
  return {
    success: parserResult.errors.length === 0,
    tokens: lexerResult.tokens,
    program: parserResult.program,
    errors: parserResult.errors,
  };
}

export { tokenize, Lexer, type LexerResult } from './lexer/index.ts';
export { parseTokens, Parser, type ParserResult } from './parser/index.ts';
export { printAst, typeToString } from './ast/index.ts';
export type * from './ast/index.ts';
export { TokenType, KEYWORDS, lookupKeyword } from './tokens.ts';
export type { Token, SourcePosition, LiteralValue } from './tokens.ts';
export { createDiagnostic, formatDiagnostic, LexicalErrorCode, SyntaxErrorCode } from './errors.ts';
export type { CompilerDiagnostic, CompilerPhase } from './errors.ts';
