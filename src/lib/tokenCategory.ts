/** Visual category of a token type, used only to color the tokens table. */
export type TokenCategory = 'keyword' | 'type' | 'number' | 'string' | 'identifier' | 'symbol' | 'eof';

const KEYWORDS = new Set(['LET', 'CONST', 'FUNCTION', 'RETURN', 'IF', 'ELSE', 'WHILE', 'PRINT', 'TRUE', 'FALSE']);
const TYPE_KEYWORDS = new Set(['INT', 'FLOAT', 'STRING', 'BOOL']);

export function tokenCategory(type: string): TokenCategory {
  if (type === 'EOF') return 'eof';
  if (type === 'IDENTIFIER') return 'identifier';
  if (type === 'STRING_LITERAL') return 'string';
  if (type === 'INT_LITERAL' || type === 'FLOAT_LITERAL') return 'number';
  if (KEYWORDS.has(type)) return 'keyword';
  if (TYPE_KEYWORDS.has(type)) return 'type';
  return 'symbol';
}

export const TOKEN_CATEGORY_LABELS: Record<TokenCategory, string> = {
  keyword: 'Palabra reservada',
  type: 'Tipo',
  number: 'Número',
  string: 'Cadena',
  identifier: 'Identificador',
  symbol: 'Operador / delimitador',
  eof: 'Fin de archivo',
};
