import { describe, expect, it } from 'vitest';
import { TokenType } from '../tokens.ts';
import { tokenize } from './index.ts';

/** Token types of a source, without EOF. */
function typesOf(source: string): string[] {
  return tokenize(source)
    .tokens.filter((token) => token.type !== TokenType.EOF)
    .map((token) => token.type);
}

describe('Lexer: tokens', () => {
  it('always ends with EOF, even for empty input', () => {
    const { tokens, errors } = tokenize('');
    expect(errors).toEqual([]);
    expect(tokens).toEqual([{ type: 'EOF', lexeme: '', literal: null, line: 1, column: 1 }]);
  });

  it('recognizes every keyword', () => {
    expect(typesOf('let const function return if else while print true false int float string bool')).toEqual([
      'LET', 'CONST', 'FUNCTION', 'RETURN', 'IF', 'ELSE', 'WHILE', 'PRINT',
      'TRUE', 'FALSE', 'INT', 'FLOAT', 'STRING', 'BOOL',
    ]);
  });

  it('distinguishes identifiers from keywords', () => {
    const { tokens } = tokenize('letter _tmp value2 iff');
    expect(tokens.slice(0, 4).map((t) => [t.type, t.lexeme])).toEqual([
      ['IDENTIFIER', 'letter'],
      ['IDENTIFIER', '_tmp'],
      ['IDENTIFIER', 'value2'],
      ['IDENTIFIER', 'iff'],
    ]);
  });

  it('reads integer and float literals with their numeric value', () => {
    const [intToken, floatToken] = tokenize('42 3.14').tokens;
    expect(intToken).toMatchObject({ type: 'INT_LITERAL', lexeme: '42', literal: 42 });
    expect(floatToken).toMatchObject({ type: 'FLOAT_LITERAL', lexeme: '3.14', literal: 3.14 });
  });

  it('reads boolean literals with their value', () => {
    const [trueToken, falseToken] = tokenize('true false').tokens;
    expect(trueToken.literal).toBe(true);
    expect(falseToken.literal).toBe(false);
  });

  it('reads strings, keeping quotes in the lexeme and resolving escapes in the literal', () => {
    const [token] = tokenize('"Hi\\n\\t\\"you\\" \\\\"').tokens;
    expect(token.type).toBe('STRING_LITERAL');
    expect(token.lexeme).toBe('"Hi\\n\\t\\"you\\" \\\\"');
    expect(token.literal).toBe('Hi\n\t"you" \\');
  });

  it('recognizes arithmetic, relational and logical operators', () => {
    expect(typesOf('+ - * / % = == != < <= > >= && || ! ->')).toEqual([
      'PLUS', 'MINUS', 'STAR', 'SLASH', 'PERCENT', 'ASSIGN', 'EQUAL', 'NOT_EQUAL',
      'LESS', 'LESS_EQUAL', 'GREATER', 'GREATER_EQUAL', 'AND', 'OR', 'NOT', 'ARROW',
    ]);
  });

  it('recognizes delimiters', () => {
    expect(typesOf('( ) { } [ ] , ; :')).toEqual([
      'LEFT_PAREN', 'RIGHT_PAREN', 'LEFT_BRACE', 'RIGHT_BRACE',
      'LEFT_BRACKET', 'RIGHT_BRACKET', 'COMMA', 'SEMICOLON', 'COLON',
    ]);
  });

  it('applies maximal munch: `a<=b` is three tokens and `a-1` is not an arrow', () => {
    expect(typesOf('a<=b')).toEqual(['IDENTIFIER', 'LESS_EQUAL', 'IDENTIFIER']);
    expect(typesOf('a-1')).toEqual(['IDENTIFIER', 'MINUS', 'INT_LITERAL']);
  });

  it('ignores line and block comments', () => {
    const source = 'let x = 1; // comment\n/* multi\nline */ print(x);';
    expect(typesOf(source)).toEqual([
      'LET', 'IDENTIFIER', 'ASSIGN', 'INT_LITERAL', 'SEMICOLON',
      'PRINT', 'LEFT_PAREN', 'IDENTIFIER', 'RIGHT_PAREN', 'SEMICOLON',
    ]);
  });

  it('tracks line and column of every token', () => {
    const { tokens } = tokenize('let age: int = 21;\n  print(age);');
    const positions = tokens.map((t) => `${t.lexeme || 'EOF'}@${t.line}:${t.column}`);
    expect(positions).toEqual([
      'let@1:1', 'age@1:5', ':@1:8', 'int@1:10', '=@1:14', '21@1:16', ';@1:18',
      'print@2:3', '(@2:8', 'age@2:9', ')@2:12', ';@2:13', 'EOF@2:14',
    ]);
  });

  it('keeps counting lines inside block comments', () => {
    const { tokens } = tokenize('/* a\nb\nc */ x');
    expect(tokens[0]).toMatchObject({ lexeme: 'x', line: 3, column: 6 });
  });
});

describe('Lexer: errors', () => {
  function errorsOf(source: string) {
    return tokenize(source).errors;
  }

  it('reports unknown characters with their position and keeps scanning', () => {
    const { tokens, errors } = tokenize('let x = 5 @ 3;\nlet y = #;');
    expect(errors).toEqual([
      {
        phase: 'lexical',
        code: 'UNEXPECTED_CHARACTER',
        message: "Carácter '@' no reconocido.",
        position: { line: 1, column: 11 },
      },
      {
        phase: 'lexical',
        code: 'UNEXPECTED_CHARACTER',
        message: "Carácter '#' no reconocido.",
        position: { line: 2, column: 9 },
      },
    ]);
    expect(tokens.at(-1)?.type).toBe('EOF');
  });

  it('reports a single & or | and suggests the logical operator', () => {
    const errors = errorsOf('a & b | c');
    expect(errors.map((e) => [e.code, e.message])).toEqual([
      ['UNEXPECTED_CHARACTER', "Carácter '&' inesperado. ¿Quisiste escribir '&&'?"],
      ['UNEXPECTED_CHARACTER', "Carácter '|' inesperado. ¿Quisiste escribir '||'?"],
    ]);
  });

  it('reports an unterminated string', () => {
    const errors = errorsOf('print("hello);\nlet x = 1;');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: 'UNTERMINATED_STRING', position: { line: 1, column: 7 } });
    expect(errors[0].message).toContain('Cadena de texto sin cerrar');
  });

  it('reports an invalid escape sequence at the backslash', () => {
    const errors = errorsOf('let s = "a\\qb"; let k = 2;');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: 'INVALID_ESCAPE', position: { line: 1, column: 11 } });
    expect(errors[0].message).toContain("'\\q'");
  });

  it('reports an unterminated block comment', () => {
    const errors = errorsOf('x /* never closed');
    expect(errors).toEqual([
      {
        phase: 'lexical',
        code: 'UNTERMINATED_COMMENT',
        message: "Comentario de bloque sin cerrar: falta '*/'.",
        position: { line: 1, column: 3 },
      },
    ]);
  });

  it('reports malformed numbers', () => {
    const [decimal] = errorsOf('3.');
    const [glued] = errorsOf('12abc');
    expect(decimal.code).toBe('MALFORMED_NUMBER');
    expect(decimal.message).toContain("Número decimal mal formado '3.'");
    expect(glued.code).toBe('MALFORMED_NUMBER');
    expect(glued.message).toContain("Número mal formado '12abc'");
  });

  it('collects several errors in one pass', () => {
    expect(errorsOf('@ $ ~')).toHaveLength(3);
  });
});
