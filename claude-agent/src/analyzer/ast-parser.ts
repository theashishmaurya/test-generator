import * as recast from 'recast';
import * as babelParser from '@babel/parser';

const BABEL_PLUGINS: babelParser.ParserPlugin[] = [
  'jsx',
  'typescript',
  'decorators-legacy',
  'classProperties',
  'classPrivateProperties',
  'classPrivateMethods',
  'optionalChaining',
  'nullishCoalescingOperator',
  'dynamicImport',
  'exportDefaultFrom',
  'objectRestSpread',
];

/**
 * Parse TSX/JSX source code into a recast-compatible AST.
 * Using recast preserves original formatting on print-back.
 */
export function parseSource(code: string, filePath?: string): recast.types.ASTNode {
  return recast.parse(code, {
    parser: {
      parse(source: string) {
        return babelParser.parse(source, {
          sourceType: 'module',
          plugins: BABEL_PLUGINS,
          sourceFilename: filePath,
          tokens: true,
        });
      },
    },
  });
}

/**
 * Print an AST back to source code, preserving original formatting.
 */
export function printSource(ast: recast.types.ASTNode): string {
  return recast.print(ast, {
    tabWidth: 2,
    quote: 'single',
    trailingComma: true,
  }).code;
}
