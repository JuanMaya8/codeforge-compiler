import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { countLines, lineEndOf, offsetOf, positionOf } from '../../lib/sourceText';
import './CodeEditor.css';

/** Request to select a range in the editor (from a diagnostic, token or AST node). */
export interface LocateRequest {
  line: number;
  column: number;
  /** Characters to select; when omitted the rest of the line is selected. */
  length?: number;
  /** Changes on every request so the same position can be located twice. */
  nonce: number;
}

/** Phase of a diagnostic attached to a line, used to color the gutter. */
export type LineMarkers = ReadonlyMap<number, string>;

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  markers: LineMarkers;
  locate: LocateRequest | null;
}

const INDENT = '    ';
const LINE_HEIGHT_PX = 21;

/**
 * Plain textarea editor with a synchronized line-number gutter.
 * Tab indents (Esc then Tab leaves the editor), Ctrl/Cmd+Enter runs.
 */
export function CodeEditor({ value, onChange, onRun, markers, locate }: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const releaseTabRef = useRef(false);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });

  const lineCount = countLines(value);

  // Select the requested position and scroll it into view.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !locate) return;
    const start = offsetOf(value, locate.line, locate.column);
    const end = locate.length ? Math.min(start + locate.length, value.length) : lineEndOf(value, start);
    textarea.focus();
    textarea.setSelectionRange(start, Math.max(end, start + 1));
    textarea.scrollTop = Math.max(0, (locate.line - 4) * LINE_HEIGHT_PX);
    setCursor({ line: locate.line, column: locate.column });
    // Only react to new requests, not to every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locate]);

  const syncScroll = () => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const updateCursor = () => {
    const textarea = textareaRef.current;
    if (textarea) setCursor(positionOf(textarea.value, textarea.selectionStart));
  };

  /** Replaces the selection with `text` and puts the caret after it. */
  const insertText = (text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd } = textarea;
    onChange(value.slice(0, selectionStart) + text + value.slice(selectionEnd));
    const caret = selectionStart + text.length;
    requestAnimationFrame(() => {
      textarea.setSelectionRange(caret, caret);
      updateCursor();
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      onRun();
      return;
    }
    if (event.key === 'Escape') {
      releaseTabRef.current = true;
      return;
    }
    if (event.key === 'Tab' && !event.shiftKey && !releaseTabRef.current) {
      event.preventDefault();
      insertText(INDENT);
      return;
    }
    if (event.key === 'Enter') {
      // Keep the indentation of the current line.
      const textarea = event.currentTarget;
      const lineStart = value.lastIndexOf('\n', textarea.selectionStart - 1) + 1;
      const indentation = /^[ \t]*/.exec(value.slice(lineStart))?.[0] ?? '';
      if (indentation) {
        event.preventDefault();
        insertText('\n' + indentation);
      }
    }
    releaseTabRef.current = false;
  };

  return (
    <div className="code-editor">
      <div className="code-editor__body">
        <div className="code-editor__gutter" ref={gutterRef} aria-hidden="true">
          {Array.from({ length: lineCount }, (_, index) => {
            const line = index + 1;
            const phase = markers.get(line);
            return (
              <div
                key={line}
                className={[
                  'code-editor__line-number',
                  phase ? `code-editor__line-number--${phase}` : '',
                  line === cursor.line ? 'code-editor__line-number--active' : '',
                ].join(' ')}
              >
                {line}
              </div>
            );
          })}
        </div>
        <textarea
          ref={textareaRef}
          className="code-editor__input"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            updateCursor();
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={updateCursor}
          onClick={updateCursor}
          onScroll={syncScroll}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          wrap="off"
          aria-label="Código fuente CodeForge"
          aria-describedby="editor-help"
        />
      </div>
      <div className="code-editor__statusbar">
        <span>
          Ln {cursor.line}, Col {cursor.column}
        </span>
        <span>
          {lineCount} {lineCount === 1 ? 'línea' : 'líneas'}
        </span>
        <span>{value.length} caracteres</span>
        <span id="editor-help" className="code-editor__help">
          <kbd>Ctrl</kbd> + <kbd>Enter</kbd> ejecutar · <kbd>Tab</kbd> indentar · <kbd>Esc</kbd> <kbd>Tab</kbd> salir
        </span>
      </div>
    </div>
  );
}
