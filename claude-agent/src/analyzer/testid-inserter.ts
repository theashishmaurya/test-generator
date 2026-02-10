import * as recast from 'recast';
import { parseSource, printSource } from './ast-parser';
import { TestIdInsertion } from '@test-automator/shared';

const builders = recast.types.builders;

export interface InsertionResult {
  code: string;
  inserted: number;
  skipped: Array<{ testId: string; reason: string }>;
}

/**
 * Insert data-testid attributes into JSX elements in a source file.
 * Uses recast to preserve original formatting.
 */
export function insertTestIds(
  code: string,
  insertions: TestIdInsertion[],
  filePath?: string
): InsertionResult {
  const ast = parseSource(code, filePath);
  let inserted = 0;
  const skipped: Array<{ testId: string; reason: string }> = [];

  // Collect all existing test IDs in the file to avoid duplicates
  const existingTestIds = new Set<string>();
  recast.visit(ast, {
    visitJSXAttribute(path) {
      const node = path.node as any;
      if (
        node.name?.type === 'JSXIdentifier' &&
        node.name.name === 'data-testid' &&
        (node.value?.type === 'StringLiteral' || node.value?.type === 'Literal')
      ) {
        existingTestIds.add(node.value.value);
      }
      this.traverse(path);
    },
  });

  // Sort insertions by line (descending) to avoid position shifts
  const sorted = [...insertions].sort(
    (a, b) => b.lineNumber - a.lineNumber || b.columnNumber - a.columnNumber
  );

  for (const insertion of sorted) {
    if (existingTestIds.has(insertion.testId)) {
      skipped.push({
        testId: insertion.testId,
        reason: `Test ID "${insertion.testId}" already exists in file`,
      });
      continue;
    }

    const success = addTestIdToElement(ast, insertion);
    if (success) {
      inserted++;
      existingTestIds.add(insertion.testId);
    } else {
      skipped.push({
        testId: insertion.testId,
        reason: `Could not find JSX element at line ${insertion.lineNumber}:${insertion.columnNumber}`,
      });
    }
  }

  const resultCode = printSource(ast);
  return { code: resultCode, inserted, skipped };
}

/**
 * Add a data-testid attribute to a specific JSX element found by position.
 */
function addTestIdToElement(
  ast: recast.types.ASTNode,
  insertion: TestIdInsertion
): boolean {
  let found = false;

  recast.visit(ast, {
    visitJSXOpeningElement(path) {
      if (found) return false;

      const node = path.node as any;
      const loc = node.loc;

      if (!loc) {
        this.traverse(path);
        return;
      }

      const lineMatch = loc.start.line === insertion.lineNumber;
      const colMatch =
        insertion.columnNumber === 0 ||
        loc.start.column === insertion.columnNumber;

      if (!lineMatch || !colMatch) {
        this.traverse(path);
        return;
      }

      // Verify tag name matches if provided
      if (insertion.elementTagName) {
        const tagName = getTagName(node.name);
        if (
          tagName.toLowerCase() !== insertion.elementTagName.toLowerCase() &&
          insertion.elementTagName !== '*'
        ) {
          this.traverse(path);
          return;
        }
      }

      // Check if already has data-testid
      const attrs = node.attributes || [];
      const hasTestId = attrs.some(
        (attr: any) =>
          attr.type === 'JSXAttribute' &&
          attr.name?.type === 'JSXIdentifier' &&
          attr.name.name === 'data-testid'
      );

      if (hasTestId) {
        this.traverse(path);
        return;
      }

      // Build the new attribute
      const testIdAttr = builders.jsxAttribute(
        builders.jsxIdentifier('data-testid'),
        builders.literal(insertion.testId)
      );

      // Insert after the last spread attribute, or at the end
      const lastSpreadIndex = attrs.reduce(
        (idx: number, attr: any, i: number) =>
          attr.type === 'JSXSpreadAttribute' ? i : idx,
        -1
      );

      if (lastSpreadIndex >= 0) {
        attrs.splice(lastSpreadIndex + 1, 0, testIdAttr);
      } else {
        attrs.push(testIdAttr);
      }

      found = true;
      return false;
    },
  });

  return found;
}

function getTagName(name: any): string {
  if (!name) return 'unknown';
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression') {
    return `${getTagName(name.object)}.${name.property.name}`;
  }
  return 'unknown';
}
