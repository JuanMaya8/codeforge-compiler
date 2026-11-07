import type { AstNode, TypeAnnotation } from './nodes.ts';

/** Converts a type annotation to source form: `int`, `float[]`, `bool[][]`. */
export function typeToString(type: TypeAnnotation): string {
  return type.kind === 'PrimitiveType' ? type.name : `${typeToString(type.elementType)}[]`;
}

/** A child shown under a node, optionally with a role label (`condition`, `then`...). */
type Child = { role?: string; node: AstNode };

/**
 * Returns the one-line label of a node and the children to draw below it.
 * The `switch` is exhaustive: adding a new node kind without handling it
 * here is a compile error.
 */
function describe(node: AstNode): { label: string; children: Child[] } {
  const leaf = (label: string) => ({ label, children: [] });
  const nodes = (list: AstNode[]): Child[] => list.map((child) => ({ node: child }));

  switch (node.kind) {
    case 'Program':
      return { label: 'Program', children: nodes(node.body) };
    case 'VariableDeclaration': {
      const type = node.typeAnnotation ? `: ${typeToString(node.typeAnnotation)}` : '';
      return {
        label: `VariableDeclaration ${node.mutability} ${node.name}${type}`,
        children: node.initializer ? [{ node: node.initializer }] : [],
      };
    }
    case 'FunctionDeclaration': {
      const params = node.params
        .map((p) => `${p.name}: ${typeToString(p.typeAnnotation)}`)
        .join(', ');
      const returnType = node.returnType ? ` -> ${typeToString(node.returnType)}` : '';
      return {
        label: `FunctionDeclaration ${node.name}(${params})${returnType}`,
        children: [{ node: node.body }],
      };
    }
    case 'Parameter':
      return leaf(`Parameter ${node.name}: ${typeToString(node.typeAnnotation)}`);
    case 'BlockStatement':
      return { label: 'BlockStatement', children: nodes(node.body) };
    case 'IfStatement': {
      const children: Child[] = [
        { role: 'condition', node: node.condition },
        { role: 'then', node: node.consequent },
      ];
      if (node.alternate) children.push({ role: 'else', node: node.alternate });
      return { label: 'IfStatement', children };
    }
    case 'WhileStatement':
      return {
        label: 'WhileStatement',
        children: [
          { role: 'condition', node: node.condition },
          { role: 'body', node: node.body },
        ],
      };
    case 'ReturnStatement':
      return { label: 'ReturnStatement', children: node.argument ? [{ node: node.argument }] : [] };
    case 'PrintStatement':
      return { label: 'PrintStatement', children: [{ node: node.argument }] };
    case 'ExpressionStatement':
      return { label: 'ExpressionStatement', children: [{ node: node.expression }] };
    case 'AssignmentExpression':
      return {
        label: 'AssignmentExpression =',
        children: [
          { role: 'target', node: node.target },
          { role: 'value', node: node.value },
        ],
      };
    case 'BinaryExpression':
      return { label: `BinaryExpression ${node.operator}`, children: nodes([node.left, node.right]) };
    case 'UnaryExpression':
      return { label: `UnaryExpression ${node.operator}`, children: [{ node: node.operand }] };
    case 'LiteralExpression':
      return leaf(`Literal ${node.literalType} ${JSON.stringify(node.value)}`);
    case 'IdentifierExpression':
      return leaf(`Identifier ${node.name}`);
    case 'CallExpression':
      return { label: `CallExpression ${node.callee.name}`, children: nodes(node.args) };
    case 'ArrayExpression':
      return { label: 'ArrayExpression', children: nodes(node.elements) };
    case 'IndexExpression':
      return {
        label: 'IndexExpression',
        children: [
          { role: 'object', node: node.object },
          { role: 'index', node: node.index },
        ],
      };
    case 'PrimitiveType':
    case 'ArrayType':
      return leaf(`Type ${typeToString(node)}`);
    default: {
      const unreachable: never = node;
      throw new Error(`Unknown AST node: ${JSON.stringify(unreachable)}`);
    }
  }
}

/**
 * Draws the tree as indented text, for example:
 *
 * ```
 * Program
 * └─ VariableDeclaration let age: int
 *    └─ Literal int 21
 * ```
 */
export function printAst(root: AstNode): string {
  const lines: string[] = [];

  const visit = (child: Child, prefix: string, isLast: boolean, isRoot: boolean): void => {
    const { label, children } = describe(child.node);
    const role = child.role ? `${child.role}: ` : '';
    lines.push(isRoot ? label : `${prefix}${isLast ? '└─ ' : '├─ '}${role}${label}`);

    const childPrefix = isRoot ? '' : prefix + (isLast ? '   ' : '│  ');
    children.forEach((next, i) => visit(next, childPrefix, i === children.length - 1, false));
  };

  visit({ node: root }, '', true, true);
  return lines.join('\n');
}
