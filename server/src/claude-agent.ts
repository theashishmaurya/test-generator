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
import { detectAppRoot, extractPort } from './app-detector';

export class ClaudeAgent {
  private config: ProjectConfig;

  constructor(config: ProjectConfig) {
    this.config = config;
  }

  /**
   * Resolve the effective config for a session.
   * Auto-detects the target app's root from the session URL port.
   */
  private resolveConfig(session: RecordingSession): ProjectConfig {
    const url = session.startUrl || session.interactions[0]?.url;
    if (!url) return this.config;

    const port = extractPort(url);
    if (!port) return this.config;

    const detectedRoot = detectAppRoot(port);
    if (detectedRoot) {
      console.log(`[claude-agent] Auto-detected app root: ${detectedRoot} (port ${port})`);
      return {
        ...this.config,
        projectRoot: detectedRoot,
        playwright: {
          ...this.config.playwright,
          baseURL: `http://localhost:${port}`,
        },
      };
    }

    return this.config;
  }

  /**
   * Process a recording session: analyze interactions, plan test ID insertions,
   * compute diffs, and generate Playwright tests. Returns a preview - no files are written.
   */
  async processSession(session: RecordingSession): Promise<ProcessingResult> {
    const config = this.resolveConfig(session);
    const errors: string[] = [];
    const warnings: string[] = [];
    const fileDiffs: FileDiff[] = [];
    const backupPaths: string[] = [];
    const testIdMap = new Map<string, string>(); // cssSelector -> testId
    const allInsertions: TestIdInsertion[] = [];
    const existingIds = new Set<string>();

    console.log(`[claude-agent] Processing session "${session.name}" | projectRoot: ${config.projectRoot}`);

    // Group interactions by source file
    const fileGroups = this.groupBySourceFile(session.interactions);

    if (fileGroups.size === 0) {
      warnings.push(
        'No source file locations found in interactions. ' +
        'Test IDs will not be inserted into source files. ' +
        'Tests will be generated using available selectors (placeholder, ID, CSS).'
      );
    }

    // Build test ID insertion plan per file (only when source info is available)
    for (const [filePath, interactions] of fileGroups) {
      const absPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(config.projectRoot, filePath);

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
            config.namingStrategy,
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

    // Always generate Playwright tests — even without source info.
    // The generator falls back to placeholder, ID, aria, CSS selectors.
    let generatedTests: GeneratedTestFile[] = [];
    try {
      generatedTests = generatePlaywrightTest(session, config, testIdMap);
    } catch (err) {
      errors.push(`Error generating tests: ${err}`);
    }

    // If no tests were generated (shouldn't happen), add an error
    if (generatedTests.length === 0 && errors.length === 0) {
      errors.push('No tests could be generated from the session interactions');
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
   * Pass session to auto-detect the target app root.
   */
  async applyResult(result: ProcessingResult, session?: RecordingSession): Promise<{ applied: string[]; errors: string[] }> {
    const config = session ? this.resolveConfig(session) : this.config;
    const applied: string[] = [];
    const errors: string[] = [];

    // Apply source file modifications (with backups)
    for (const diff of result.fileDiffs) {
      try {
        if (config.backupBeforeModify) {
          const backupPath = backupFile(diff.filePath, config.projectRoot);
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
          : path.join(config.projectRoot, test.filePath);
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
   * Interactions without source info are skipped (tests still generated via fallback selectors).
   */
  private groupBySourceFile(
    interactions: InteractionData[]
  ): Map<string, InteractionData[]> {
    const groups = new Map<string, InteractionData[]>();

    for (const interaction of interactions) {
      // Check both top-level source and element.source
      const source = (interaction as any).source || (interaction.element as any)?.source;
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
