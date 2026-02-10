export { parseSource, printSource } from './analyzer/ast-parser';
export { analyzeReactFile, findJSXElementAtPosition } from './analyzer/react-analyzer';
export { insertTestIds } from './analyzer/testid-inserter';
export { generateTestId, makeUnique } from './utils/naming-strategies';
export * from './utils/file-utils';
export { generatePlaywrightTest } from './generator/test-generator';
export { generateAssertions } from './generator/assertion-generator';
export { templates } from './generator/playwright-templates';
