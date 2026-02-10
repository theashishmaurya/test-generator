import * as fs from 'fs';
import * as path from 'path';

const BACKUP_DIR = '.qa-backup';

/**
 * Read a source file as text.
 */
export function readSourceFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Write a source file.
 */
export function writeSourceFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Create a backup of a file before modifying it.
 * Returns the backup file path.
 */
export function backupFile(filePath: string, projectRoot: string): string {
  const relative = path.relative(projectRoot, filePath);
  const backupPath = path.join(projectRoot, BACKUP_DIR, relative);
  const backupDir = path.dirname(backupPath);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

/**
 * Restore a file from its backup.
 */
export function restoreFromBackup(backupPath: string, projectRoot: string): string {
  const relative = path.relative(path.join(projectRoot, BACKUP_DIR), backupPath);
  const originalPath = path.join(projectRoot, relative);
  fs.copyFileSync(backupPath, originalPath);
  return originalPath;
}

/**
 * Resolve a source file path to a test file path.
 * e.g. src/pages/Login.tsx -> tests/e2e/pages/login.spec.ts
 */
export function resolveTestFilePath(
  sourceFilePath: string,
  projectRoot: string,
  sourceDir: string,
  testOutputDir: string
): string {
  const relative = path.relative(path.join(projectRoot, sourceDir), sourceFilePath);
  const parsed = path.parse(relative);

  // Convert component name to kebab-case for test file
  const testName = parsed.name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();

  const testRelative = path.join(parsed.dir, `${testName}.spec.ts`);
  return path.join(projectRoot, testOutputDir, testRelative);
}

/**
 * Check if a file exists.
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}
