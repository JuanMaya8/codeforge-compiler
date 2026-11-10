import { useMemo, useState } from 'react';
import type { SourceRunResult } from '../../compiler';
import { buildAstTree, countAstNodes, type AstTreeNode } from '../../lib/astTree';
import { ChevronIcon, TargetIcon } from '../layout/icons';
import { EmptyState } from './EmptyState';
import type { LocateTarget } from './ResultsPanel';

interface AstViewProps {
  ast: SourceRunResult['ast'];
  stage: SourceRunResult['stage'];
  onLocate: (target: LocateTarget) => void;
}

type Mode = 'tree' | 'json';

/** Expandable tree (or raw JSON) of the AST produced by the Parser. */
export function AstView({ ast, stage, onLocate }: AstViewProps) {
  const [mode, setMode] = useState<Mode>('tree');
  // Changing `expansion` remounts the tree with every node open or closed.
  const [expansion, setExpansion] = useState<{ open: boolean | null; version: number }>({ open: null, version: 0 });
  const tree = useMemo(() => (ast ? buildAstTree(ast) : null), [ast]);

  if (!ast || !tree) {
    return (
      <EmptyState title="No hay AST">
        El Parser no se ejecutó porque el Lexer encontró errores. Corrige los errores léxicos para ver el árbol.
      </EmptyState>
    );
  }

  return (
    <div className="data-view">
      <div className="data-view__toolbar">
        <p className="data-view__caption">
          <strong>{countAstNodes(tree)}</strong> nodos. Cada nodo muestra su <code>kind</code>, sus datos principales y
          el campo que ocupa en su padre.
        </p>
        <div className="segmented" role="group" aria-label="Formato del AST">
          <button type="button" aria-pressed={mode === 'tree'} onClick={() => setMode('tree')}>
            Árbol
          </button>
          <button type="button" aria-pressed={mode === 'json'} onClick={() => setMode('json')}>
            JSON
          </button>
        </div>
        {mode === 'tree' && (
          <div className="data-view__actions">
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setExpansion((current) => ({ open: true, version: current.version + 1 }))}
            >
              Expandir todo
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setExpansion((current) => ({ open: false, version: current.version + 1 }))}
            >
              Contraer todo
            </button>
          </div>
        )}
      </div>

      {stage === 'syntax' && (
        <p className="callout callout--syntax">
          AST parcial: el Parser omitió las sentencias con errores sintácticos. No se ejecutaron las fases siguientes.
        </p>
      )}

      {mode === 'tree' ? (
        <ul className="ast-tree" role="tree" aria-label="Árbol de sintaxis abstracta" key={expansion.version}>
          <AstTreeItem node={tree} depth={0} forcedOpen={expansion.open} onLocate={onLocate} />
        </ul>
      ) : (
        <pre className="code-block">{JSON.stringify(ast, null, 2)}</pre>
      )}
    </div>
  );
}

interface AstTreeItemProps {
  node: AstTreeNode;
  depth: number;
  forcedOpen: boolean | null;
  onLocate: (target: LocateTarget) => void;
}

function AstTreeItem({ node, depth, forcedOpen, onLocate }: AstTreeItemProps) {
  const hasChildren = node.children.length > 0;
  const [open, setOpen] = useState(forcedOpen ?? depth < 4);
  const position = node.position;

  return (
    <li role="treeitem" aria-expanded={hasChildren ? open : undefined} className="ast-tree__item">
      <div className={`ast-tree__row ${node.isNode ? '' : 'ast-tree__row--field'}`}>
        {hasChildren ? (
          <button
            type="button"
            className={`ast-tree__toggle ${open ? 'ast-tree__toggle--open' : ''}`}
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Contraer' : 'Expandir'}
          >
            <ChevronIcon />
          </button>
        ) : (
          <span className="ast-tree__spacer" aria-hidden="true" />
        )}
        {node.role && <span className="ast-tree__role">{node.role}:</span>}
        <span className={node.isNode ? 'ast-tree__kind' : 'ast-tree__field'}>{node.label}</span>
        {node.detail && <span className="ast-tree__detail">{node.detail}</span>}
        {position && (
          <button
            type="button"
            className="ast-tree__position"
            title="Ubicar en el editor"
            onClick={() => onLocate({ line: position.line, column: position.column })}
          >
            <TargetIcon />
            {position.line}:{position.column}
          </button>
        )}
      </div>
      {hasChildren && open && (
        <ul role="group">
          {node.children.map((child) => (
            <AstTreeItem key={child.id} node={child} depth={depth + 1} forcedOpen={forcedOpen} onLocate={onLocate} />
          ))}
        </ul>
      )}
    </li>
  );
}
