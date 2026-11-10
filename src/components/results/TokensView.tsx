import { useMemo, useState } from 'react';
import type { SourceRunResult } from '../../compiler';
import { tokenCategory, TOKEN_CATEGORY_LABELS } from '../../lib/tokenCategory';
import { EmptyState } from './EmptyState';
import type { LocateTarget } from './ResultsPanel';

type Token = SourceRunResult['tokens'][number];

interface TokensViewProps {
  tokens: Token[];
  hasLexicalErrors: boolean;
  onLocate: (target: LocateTarget) => void;
}

/** Table with the real tokens produced by the Lexer. Clicking a row selects it in the editor. */
export function TokensView({ tokens, hasLexicalErrors, onLocate }: TokensViewProps) {
  const [filter, setFilter] = useState('');

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return tokens.map((token, index) => ({ token, index }));
    return tokens
      .map((token, index) => ({ token, index }))
      .filter(({ token }) => token.type.toLowerCase().includes(query) || token.lexeme.toLowerCase().includes(query));
  }, [tokens, filter]);

  if (tokens.length === 0) {
    return <EmptyState title="Sin tokens">El Lexer no produjo tokens para este programa.</EmptyState>;
  }

  return (
    <div className="data-view">
      <div className="data-view__toolbar">
        <p className="data-view__caption">
          <strong>{tokens.length}</strong> tokens producidos por el Lexer. Haz clic en una fila para ubicarla en el
          editor.
        </p>
        <label className="search-field">
          <span className="visually-hidden">Filtrar tokens</span>
          <input
            type="search"
            placeholder="Filtrar por tipo o lexema"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
      </div>

      {hasLexicalErrors && (
        <p className="callout callout--lexical">
          Hubo errores léxicos: los lexemas inválidos no generan token y el Parser no se ejecutó. Revisa la pestaña
          Diagnósticos.
        </p>
      )}

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Tipo</th>
              <th scope="col">Lexema</th>
              <th scope="col">Valor literal</th>
              <th scope="col">Línea</th>
              <th scope="col">Columna</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ token, index }) => {
              const category = tokenCategory(token.type);
              return (
                <tr
                  key={index}
                  className="data-table__row--clickable"
                  tabIndex={0}
                  onClick={() => onLocate({ line: token.line, column: token.column, length: token.lexeme.length })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      onLocate({ line: token.line, column: token.column, length: token.lexeme.length });
                    }
                  }}
                >
                  <td className="data-table__muted">{index}</td>
                  <td>
                    <span className={`token-type token-type--${category}`} title={TOKEN_CATEGORY_LABELS[category]}>
                      {token.type}
                    </span>
                  </td>
                  <td className="data-table__code">{token.lexeme === '' ? <em>(vacío)</em> : token.lexeme}</td>
                  <td className="data-table__code">
                    {token.literal === null ? <span className="data-table__muted">—</span> : JSON.stringify(token.literal)}
                  </td>
                  <td className="data-table__number">{token.line}</td>
                  <td className="data-table__number">{token.column}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && <p className="data-view__caption data-view__empty">Ningún token coincide con el filtro.</p>}
      </div>
    </div>
  );
}
