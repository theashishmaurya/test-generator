import * as recast from 'recast';
import { parseSource } from './ast-parser';

export interface ComponentInfo {
  name: string;
  type: 'function' | 'arrow' | 'class';
  startLine: number;
  endLine: number;
}

export interface JSXElementInfo {
  tagName: string;
  line: number;
  column: number;
  hasTestId: boolean;
  existingTestId?: string;
  parentComponent?: string;
  attributes: Record<string, string>;
}

/**
 * Analyze a React source file to find components and JSX elements.
 */
export function analyzeReactFile(code: string, filePath?: string) {
  const ast = parseSource(code, filePath);
  const components: ComponentInfo[] = [];
  const jsxElements: JSXElementInfo[] = [];

  recast.visit(ast, {
    visitFunctionDeclaration(path) {
      const node = path.node as any;
      if (node.id && isComponentName(node.id.name)) {
        components.push({
          name: node.id.name,
          type: 'function',
          startLine: node.loc?.start.line || 0,
          endLine: node.loc?.end.line || 0,
        });
      }
      this.traverse(path);
    },

    visitVariableDeclarator(path) {
      const node = path.node as any;
      if (
        node.id?.type === 'Identifier' &&
        isComponentName(node.id.name) &&
        node.init &&
        (node.init.type === 'ArrowFunctionExpression' ||
          node.init.type === 'FunctionExpression' ||
          isReactWrappedCall(node.init))
      ) {
        components.push({
          name: node.id.name,
          type: node.init.type === 'ArrowFunctionExpression' ? 'arrow' : 'function',
          startLine: node.loc?.start.line || 0,
          endLine: node.loc?.end.line || 0,
        });
      }
      this.traverse(path);
    },

    visitClassDeclaration(path) {
      const node = path.node as any;
      if (node.id && isComponentName(node.id.name)) {
        components.push({
          name: node.id.name,
          type: 'class',
          startLine: node.loc?.start.line || 0,
          endLine: node.loc?.end.line || 0,
        });
      }
      this.traverse(path);
    },

    visitJSXOpeningElement(path) {
      const node = path.node as any;
      const tagName = getJSXTagName(node.name);

      let hasTestId = false;
      let existingTestId: string | undefined;
      const attributes: Record<string, string> = {};

      for (const attr of (node.attributes || [])) {
        if (attr.type === 'JSXAttribute' && attr.name?.type === 'JSXIdentifier') {
          const name = attr.name.name;
          if (name === 'data-testid') {
            hasTestId = true;
            if (attr.value?.type === 'StringLiteral' || attr.value?.type === 'Literal') {
              existingTestId = attr.value.value;
            }
          }
          if (attr.value?.type === 'StringLiteral' || attr.value?.type === 'Literal') {
            attributes[name] = attr.value.value;
          }
        }
      }

      // Find parent component
      let parentComponent: string | undefined;
      let ancestor = path.parent;
      while (ancestor) {
        const an = ancestor.node as any;
        if (an.type === 'FunctionDeclaration' && an.id?.name) {
          parentComponent = an.id.name;
          break;
        }
        if (an.type === 'VariableDeclarator' && an.id?.type === 'Identifier') {
          parentComponent = an.id.name;
          break;
        }
        ancestor = ancestor.parent;
      }

      jsxElements.push({
        tagName,
        line: node.loc?.start.line || 0,
        column: node.loc?.start.column || 0,
        hasTestId,
        existingTestId,
        parentComponent,
        attributes,
      });

      this.traverse(path);
    },
  });

  return { components, jsxElements, ast };
}

/**
 * Find a JSX element at a specific line and column.
 */
export function findJSXElementAtPosition(
  jsxElements: JSXElementInfo[],
  line: number,
  column: number
): JSXElementInfo | undefined {
  const exact = jsxElements.find(
    (el) => el.line === line && el.column === column
  );
  if (exact) return exact;

  const sameLine = jsxElements.filter((el) => el.line === line);
  if (sameLine.length === 1) return sameLine[0];

  return jsxElements.reduce<JSXElementInfo | undefined>((closest, el) => {
    if (!closest) return el;
    const dist = Math.abs(el.line - line);
    const closestDist = Math.abs(closest.line - line);
    return dist < closestDist ? el : closest;
  }, undefined);
}

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function isReactWrappedCall(node: any): boolean {
  if (node.type !== 'CallExpression') return false;
  const callee = node.callee;

  if (callee.type === 'MemberExpression' && callee.property?.type === 'Identifier') {
    return ['memo', 'forwardRef', 'lazy'].includes(callee.property.name);
  }
  if (callee.type === 'Identifier') {
    return ['memo', 'forwardRef', 'lazy'].includes(callee.name);
  }
  return false;
}

function getJSXTagName(name: any): string {
  if (!name) return 'unknown';
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression') {
    return `${getJSXTagName(name.object)}.${name.property.name}`;
  }
  if (name.type === 'JSXNamespacedName') {
    return `${name.namespace.name}:${name.name.name}`;
  }
  return 'unknown';
}
