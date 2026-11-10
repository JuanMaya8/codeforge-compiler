/**
 * Converts the real AST returned by `runSource()` into a generic tree for
 * display. It does not interpret the program: it only walks the objects and
 * labels each node with its `kind`, its main fields and the role it plays in
 * its parent (condition, left, body...).
 */
export interface AstTreeNode {
  id: string;
  /** `kind` of the AST node, or the field name for groups and null values. */
  label: string;
  /** Field of the parent that holds this node (`condition`, `body[0]`...). */
  role?: string;
  /** Short summary: name, operator, literal value... */
  detail?: string;
  position?: { line: number; column: number };
  isNode: boolean;
  children: AstTreeNode[];
}

/** Fields summarized in the label instead of being shown as children. */
const SUMMARY_FIELDS = ['mutability', 'name', 'operator', 'literalType', 'value'] as const;
const HIDDEN_FIELDS = new Set(['kind', 'position']);

type AstLike = { kind: string; position?: { line: number; column: number } } & Record<string, unknown>;

function isAstNode(value: unknown): value is AstLike {
  return typeof value === 'object' && value !== null && typeof (value as { kind?: unknown }).kind === 'string';
}

function formatScalar(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

export function buildAstTree(node: unknown, role?: string, id = 'root'): AstTreeNode {
  if (!isAstNode(node)) {
    return { id, label: `${role ?? 'valor'}: ${formatScalar(node)}`, isNode: false, children: [] };
  }

  const summary: string[] = [];
  const children: AstTreeNode[] = [];

  for (const field of SUMMARY_FIELDS) {
    const value = node[field];
    if (value === undefined || typeof value === 'object') continue;
    // String literal values keep their quotes; names and operators do not.
    summary.push(field === 'value' ? formatScalar(value) : String(value));
  }

  for (const [field, value] of Object.entries(node)) {
    if (HIDDEN_FIELDS.has(field)) continue;
    if ((SUMMARY_FIELDS as readonly string[]).includes(field) && (value === null || typeof value !== 'object')) continue;
    const childId = `${id}.${field}`;

    if (Array.isArray(value)) {
      children.push({
        id: childId,
        label: `${field} [${value.length}]`,
        isNode: false,
        children: value.map((item, index) => buildAstTree(item, `${field}[${index}]`, `${childId}.${index}`)),
      });
    } else if (value === null) {
      children.push({ id: childId, label: `${field}: null`, isNode: false, children: [] });
    } else if (isAstNode(value)) {
      children.push(buildAstTree(value, field, childId));
    } else {
      summary.push(`${field}=${formatScalar(value)}`);
    }
  }

  return {
    id,
    label: node.kind,
    role,
    detail: summary.length > 0 ? summary.join(' ') : undefined,
    position: node.position,
    isNode: true,
    children,
  };
}

/** Number of AST nodes (objects with `kind`) in the tree. */
export function countAstNodes(tree: AstTreeNode): number {
  return (tree.isNode ? 1 : 0) + tree.children.reduce((total, child) => total + countAstNodes(child), 0);
}
