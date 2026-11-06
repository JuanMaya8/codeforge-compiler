import type * as FrontendAst from '../ast/nodes.ts';
import type {
  AssignmentStatement,
  BinaryExpression,
  Block,
  CallExpression,
  Expression,
  FunctionDeclaration,
  IfStatement,
  Program,
  ReturnStatement,
  Statement,
  TypeName,
  VarDeclaration,
  WhileStatement,
} from '../semantic/ast-contract';

export interface AstAdapterError {
  code: 'UNSUPPORTED_AST_NODE';
  message: string;
  line: number;
  column: number;
}

export class AstAdapterException extends Error {
  readonly code = 'UNSUPPORTED_AST_NODE' as const;
  readonly line: number;
  readonly column: number;

  constructor(message: string, position: FrontendAst.AstNode['position']) {
    super(message);
    this.name = 'AstAdapterException';
    this.line = position.line;
    this.column = position.column;
  }

  toDiagnostic(): AstAdapterError {
    return { code: this.code, message: this.message, line: this.line, column: this.column };
  }
}

/** Bridges Jack's parser AST to Deivid's semantic AST without editing either contract. */
export function adaptFrontendAst(program: FrontendAst.Program): Program {
  return {
    kind: 'Program',
    body: program.body.map(adaptStatement),
    loc: location(program),
  };
}

function adaptStatement(node: FrontendAst.Statement): Statement {
  switch (node.kind) {
    case 'VariableDeclaration': {
      const result: VarDeclaration = {
        kind: 'VarDeclaration',
        name: node.name,
        mutable: node.mutability === 'let',
        loc: location(node),
      };
      const type = adaptType(node.typeAnnotation);
      if (type !== undefined) result.typeAnnotation = type;
      if (node.initializer !== null) result.initializer = adaptExpression(node.initializer);
      return result;
    }
    case 'FunctionDeclaration': {
      const result: FunctionDeclaration = {
        kind: 'FunctionDeclaration',
        name: node.name,
        params: node.params.map((parameter) => ({
          kind: 'Parameter',
          name: parameter.name,
          typeAnnotation: requiredType(parameter.typeAnnotation, parameter),
          loc: location(parameter),
        })),
        returnType: node.returnType === null ? 'void' : requiredType(node.returnType, node),
        body: adaptBlock(node.body),
        loc: location(node),
      };
      return result;
    }
    case 'BlockStatement':
      return adaptBlock(node);
    case 'IfStatement': {
      const result: IfStatement = {
        kind: 'IfStatement',
        condition: adaptExpression(node.condition),
        consequent: adaptBlock(node.consequent),
        loc: location(node),
      };
      if (node.alternate !== null) {
        result.alternate = node.alternate.kind === 'IfStatement'
          ? adaptStatement(node.alternate) as IfStatement
          : adaptBlock(node.alternate);
      }
      return result;
    }
    case 'WhileStatement': {
      const result: WhileStatement = {
        kind: 'WhileStatement',
        condition: adaptExpression(node.condition),
        body: adaptBlock(node.body),
        loc: location(node),
      };
      return result;
    }
    case 'ReturnStatement': {
      const result: ReturnStatement = { kind: 'ReturnStatement', loc: location(node) };
      if (node.argument !== null) result.value = adaptExpression(node.argument);
      return result;
    }
    case 'PrintStatement':
      return { kind: 'PrintStatement', argument: adaptExpression(node.argument), loc: location(node) };
    case 'ExpressionStatement':
      if (node.expression.kind === 'AssignmentExpression') {
        if (node.expression.target.kind !== 'IdentifierExpression') {
          throw unsupported('Array element assignment', node.expression);
        }
        return adaptAssignment(node.expression);
      }
      return { kind: 'ExpressionStatement', expression: adaptExpression(node.expression), loc: location(node) };
    default:
      return assertNever(node);
  }
}

function adaptBlock(node: FrontendAst.BlockStatement): Block {
  return { kind: 'Block', body: node.body.map(adaptStatement), loc: location(node) };
}

function adaptAssignment(node: FrontendAst.AssignmentExpression): AssignmentStatement {
  if (node.target.kind !== 'IdentifierExpression') throw unsupported('Array element assignment', node);
  return {
    kind: 'AssignmentStatement',
    target: { kind: 'Identifier', name: node.target.name, loc: location(node.target) },
    value: adaptExpression(node.value),
    loc: location(node),
  };
}

function adaptExpression(node: FrontendAst.Expression): Expression {
  switch (node.kind) {
    case 'LiteralExpression':
      switch (node.literalType) {
        case 'int': return { kind: 'IntLiteral', value: node.value, loc: location(node) };
        case 'float': return { kind: 'FloatLiteral', value: node.value, loc: location(node) };
        case 'string': return { kind: 'StringLiteral', value: node.value, loc: location(node) };
        case 'bool': return { kind: 'BoolLiteral', value: node.value, loc: location(node) };
        default: return assertNever(node);
      }
    case 'IdentifierExpression':
      return { kind: 'Identifier', name: node.name, loc: location(node) };
    case 'BinaryExpression': {
      const result: BinaryExpression = {
        kind: 'BinaryExpression',
        operator: node.operator,
        left: adaptExpression(node.left),
        right: adaptExpression(node.right),
        loc: location(node),
      };
      return result;
    }
    case 'UnaryExpression':
      return { kind: 'UnaryExpression', operator: node.operator, operand: adaptExpression(node.operand), loc: location(node) };
    case 'CallExpression': {
      const result: CallExpression = {
        kind: 'CallExpression',
        callee: { kind: 'Identifier', name: node.callee.name, loc: location(node.callee) },
        args: node.args.map(adaptExpression),
        loc: location(node),
      };
      return result;
    }
    case 'AssignmentExpression':
      throw unsupported('Assignment inside an expression', node);
    case 'ArrayExpression':
      throw unsupported('Array literals are not supported by the current semantic AST/IR contract', node);
    case 'IndexExpression':
      throw unsupported('Array indexing is not supported by the current semantic AST/IR contract', node);
    default:
      return assertNever(node);
  }
}

function adaptType(type: FrontendAst.TypeAnnotation | null): TypeName | undefined {
  if (type === null) return undefined;
  if (type.kind === 'ArrayType') throw unsupported('Array types are not supported by the current semantic AST/IR contract', type);
  return type.name;
}

function requiredType(type: FrontendAst.TypeAnnotation, node: FrontendAst.AstNode): TypeName {
  const result = adaptType(type);
  if (result === undefined) throw unsupported('Missing type annotation', node);
  return result;
}

function location(node: FrontendAst.AstNode): { line: number; column: number } {
  return { line: node.position.line, column: node.position.column };
}

function unsupported(feature: string, node: FrontendAst.AstNode): AstAdapterException {
  return new AstAdapterException(`${feature} cannot be passed to the current semantic/IR contract`, node.position);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled AST node: ${JSON.stringify(value)}`);
}
