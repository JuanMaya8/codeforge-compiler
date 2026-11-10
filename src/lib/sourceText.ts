/** Helpers to move between `line:column` positions and textarea offsets. */

/** 0-based offset of a 1-based line and column, clamped to the text. */
export function offsetOf(text: string, line: number, column: number): number {
  let offset = 0;
  for (let current = 1; current < line; current++) {
    const newline = text.indexOf('\n', offset);
    if (newline === -1) return text.length;
    offset = newline + 1;
  }
  const lineEnd = text.indexOf('\n', offset);
  const end = lineEnd === -1 ? text.length : lineEnd;
  return Math.min(offset + Math.max(column - 1, 0), end);
}

/** 1-based line and column of a 0-based offset. */
export function positionOf(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset);
  const line = before.split('\n').length;
  const column = offset - before.lastIndexOf('\n');
  return { line, column };
}

/** Offset where the line containing `offset` ends (before its newline). */
export function lineEndOf(text: string, offset: number): number {
  const end = text.indexOf('\n', offset);
  return end === -1 ? text.length : end;
}

export function countLines(text: string): number {
  return text.split('\n').length;
}
