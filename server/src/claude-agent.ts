import * as path from 'path';
import * as fs from 'fs-extra';
import { createTwoFilesPatch } from 'diff';
import {
  RecordingSession,
  ProcessingResult,
  ProjectConfig,
  TestIdInsertionPlan,
  TestIdInsertion,
  FileDiff,
  GeneratedTestFile,
  InteractionData,
} from '@test-automator/shared';
import {
  analyzeReactFile,
  findJSXElementAtPosition,
  insertTestIds,
  generateTestId,
  makeUnique,
  generatePlaywrightTest,
  readSourceFile,
  writeSourceFile,
  backupFile,
  restoreFromBackup,
  fileExists,
} from '@test-automator/claude-agent';

export class ClaudeAgent {
  private config: ProjectConfig;

  constructor(config: ProjectConfig) {
    this.config = config;
  }

  /**
   * Process a recording session: analyze interactions, plan test ID insertions,
   * compute diffs, and generate Playwright tests. Returns a preview - no files are written.
   */
  async processSession(session: RecordingSession): Promise<ProcessingResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const fileDiffs: FileDiff[] = [];
    const backupPaths: string[] = [];
    const testIdMap = new Map<string, string>(); // cssSelector -> testId
    const allInsertions: TestIdInsertion[] = [];
    const existingIds = new Set<string>();

    // Group interactions by source file
    const fileGroups = this.groupBySourceFile(session.interactions);

    // Build test ID insertion plan per file
    for (const [filePath, interactions] of fileGroups) {
      const absPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(this.config.projectRoot, filePath);

      if (!fileExists(absPath)) {
        warnings.push(`Source file not found: ${filePath}`);
        continue;
      }

      try {
        const code = readSourceFile(absPath);
        const { jsxElements } = analyzeReactFile(code, absPath);

        for (const interaction of interactions) {
          const source = (interaction as any).source || interaction.element?.attributes;
          const line = source?.lineNumber || 0;
          const col = source?.columnNumber || 0;

          if (line === 0) {
            warnings.push(
              `No source location for interaction on ${interaction.element.tagName} at ${interaction.url}`
            );
            continue;
          }

          // Find the JSX element in AST
          const jsxEl = findJSXElementAtPosition(jsxElements, line, col);
          if (!jsxEl) {
            warnings.push(`Could not find JSX element at ${filePath}:${line}:${col}`);
            continue;
          }

          // Skip if already has test ID
          if (jsxEl.hasTestId && jsxEl.existingTestId) {
            testIdMap.set(interaction.element.cssSelector, jsxEl.existingTestId);
            continue;
          }

          // Generate test ID
          let testId = generateTestId(
            this.config.namingStrategy,
            interaction.element,
            source,
            interaction.type
          );
          testId = makeUnique(testId, existingIds);
          existingIds.add(testId);

          testIdMap.set(interaction.element.cssSelector, testId);

          allInsertions.push({
            filePath: absPath,
            lineNumber: line,
            columnNumber: col,
            testId,
            elementTagName: jsxEl.tagName,
            componentName: jsxEl.parentComponent,
          });
        }

        // Apply insertions to this file and compute diff
        const fileInsertions = allInsertions.filter((ins) => ins.filePath === absPath);
        if (fileInsertions.length > 0) {
          const result = insertTestIds(code, fileInsertions, absPath);

          if (result.inserted > 0) {
            const diff = createTwoFilesPatch(
              filePath,
              filePath,
              code,
              result.code,
              'original',
              'modified'
            );

            fileDiffs.push({
              filePath: absPath,
              original: code,
              modified: result.code,
              diff,
            });
          }

          for (const skip of result.skipped) {
            warnings.push(`Skipped ${skip.testId}: ${skip.reason}`);
          }
        }
      } catch (err) {
        errors.push(`Error processing ${filePath}: ${err}`);
      }
    }

    // Build insertion plan
    const testIdPlan: TestIdInsertionPlan = {
      insertions: allInsertions,
      skipped: warnings
        .filter((w) => w.startsWith('Skipped') || w.startsWith('No source'))
        .map((w) => ({
          reason: w,
          element: { tagName: 'unknown', cssSelector: '', attributes: {} },
        })),
    };

    // Generate Playwright tests
    let generatedTests: GeneratedTestFile[] = [];
    try {
      generatedTests = generatePlaywrightTest(session, this.config, testIdMap);
    } catch (err) {
      errors.push(`Error generating tests: ${err}`);
    }

    return {
      sessionId: session.id,
      testIdPlan,
      fileDiffs,
      generatedTests,
      backupPaths,
      errors,
      warnings,
    };
  }

  /**
   * Apply a processing result: write modified source files and generated tests to disk.
   */
  async applyResult(result: ProcessingResult): Promise<{ applied: string[]; errors: string[] }> {
    const applied: string[] = [];
    const errors: string[] = [];

    // Apply source file modifications (with backups)
    for (const diff of result.fileDiffs) {
      try {
        if (this.config.backupBeforeModify) {
          const backupPath = backupFile(diff.filePath, this.config.projectRoot);
          result.backupPaths.push(backupPath);
        }
        writeSourceFile(diff.filePath, diff.modified);
        applied.push(diff.filePath);
      } catch (err) {
        errors.push(`Failed to write ${diff.filePath}: ${err}`);
      }
    }

    // Write generated test files
    for (const test of result.generatedTests) {
      try {
        const absPath = path.isAbsolute(test.filePath)
          ? test.filePath
          : path.join(this.config.projectRoot, test.filePath);
        writeSourceFile(absPath, test.content);
        applied.push(absPath);
      } catch (err) {
        errors.push(`Failed to write test ${test.filePath}: ${err}`);
      }
    }

    return { applied, errors };
  }

  /**
   * Rollback: restore source files from backups.
   */
  async rollback(backupPaths: string[]): Promise<{ restored: string[]; errors: string[] }> {
    const restored: string[] = [];
    const errors: string[] = [];

    for (const backupPath of backupPaths) {
      try {
        const originalPath = restoreFromBackup(backupPath, this.config.projectRoot);
        restored.push(originalPath);
      } catch (err) {
        errors.push(`Failed to restore ${backupPath}: ${err}`);
      }
    }

    return { restored, errors };
  }

  /**
   * Group interactions by their source file path.
   */
  private groupBySourceFile(
    interactions: InteractionData[]
  ): Map<string, InteractionData[]> {
    const groups = new Map<string, InteractionData[]>();

    for (const interaction of interactions) {
      const source = (interaction as any).source;
      const filePath = source?.filePath;

      if (!filePath) continue;

      if (!groups.has(filePath)) {
        groups.set(filePath, []);
      }
      groups.get(filePath)!.push(interaction);
    }

    return groups;
  }
}
