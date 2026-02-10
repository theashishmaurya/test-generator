import {
  RecordingSession,
  InteractionData,
  GeneratedTestFile,
  ProjectConfig,
} from '@test-automator/shared';
import { templates } from './playwright-templates';
import { generateAssertions } from './assertion-generator';
import { resolveTestFilePath } from '../utils/file-utils';

interface InteractionGroup {
  description: string;
  baseUrl: string;
  interactions: InteractionData[];
  sourceFile?: string;
}

/**
 * Generate Playwright test files from a recording session.
 */
export function generatePlaywrightTest(
  session: RecordingSession,
  config: ProjectConfig,
  testIdMap: Map<string, string> // element CSS selector -> test ID
): GeneratedTestFile[] {
  // Consolidate raw interactions (merge repeated inputs, remove noise)
  const consolidated = consolidateInteractions(session.interactions);

  const groups = groupInteractions(consolidated);
  const files: GeneratedTestFile[] = [];

  if (groups.length === 0) {
    return files;
  }

  // If all interactions share one source file, generate one test file
  // Otherwise, generate per-group
  const allSourceFiles = new Set(
    groups.map((g) => g.sourceFile).filter(Boolean)
  );

  if (allSourceFiles.size <= 1) {
    const file = generateSingleTestFile(session, groups, config, testIdMap);
    if (file) files.push(file);
  } else {
    for (const group of groups) {
      const file = generateGroupTestFile(session, group, config, testIdMap);
      if (file) files.push(file);
    }
  }

  return files;
}

/**
 * Consolidate interactions: merge consecutive input events on the same element
 * into a single input with the final value. Remove redundant click-before-input pairs.
 */
function consolidateInteractions(interactions: InteractionData[]): InteractionData[] {
  const result: InteractionData[] = [];

  for (let i = 0; i < interactions.length; i++) {
    const current = interactions[i];

    // For input/change events, find the last consecutive one on the same element
    if (current.type === 'input' || current.type === 'change') {
      let last = current;
      let j = i + 1;
      while (j < interactions.length) {
        const next = interactions[j];
        if (
          (next.type === 'input' || next.type === 'change') &&
          next.element.cssSelector === current.element.cssSelector
        ) {
          last = next;
          j++;
        } else {
          break;
        }
      }
      // Use the last event (has the final value), skip all intermediate ones
      result.push(last);
      i = j - 1; // skip to the last consumed event
      continue;
    }

    // Skip click events that immediately precede an input on the same element (focus click)
    if (current.type === 'click') {
      const next = interactions[i + 1];
      if (
        next &&
        (next.type === 'input' || next.type === 'click') &&
        next.element.cssSelector === current.element.cssSelector &&
        next.type === 'input'
      ) {
        // Skip this click — it's just focusing the input
        continue;
      }
    }

    result.push(current);
  }

  return result;
}

function generateSingleTestFile(
  session: RecordingSession,
  groups: InteractionGroup[],
  config: ProjectConfig,
  testIdMap: Map<string, string>
): GeneratedTestFile | null {
  const allInteractions = groups.flatMap((g) => g.interactions);
  if (allInteractions.length === 0) return null;

  const testName = sanitizeName(session.name);
  const sourceFile = groups[0]?.sourceFile;
  const testPath = sourceFile
    ? resolveTestFilePath(sourceFile, config.projectRoot, config.sourceDir, config.testOutputDir)
    : `${config.testOutputDir}/${testName}.spec.ts`;

  const body = generateTestBody(allInteractions, config, testIdMap);

  const content = [
    templates.imports(),
    '',
    templates.describe(session.name, [
      templates.testCase(`should complete ${session.name} flow`, body),
    ].join('\n')),
    '',
  ].join('\n');

  return {
    filePath: testPath,
    content: formatTestFile(content),
    description: `E2E test for ${session.name} (${allInteractions.length} interactions)`,
  };
}

function generateGroupTestFile(
  session: RecordingSession,
  group: InteractionGroup,
  config: ProjectConfig,
  testIdMap: Map<string, string>
): GeneratedTestFile | null {
  if (group.interactions.length === 0) return null;

  const testName = sanitizeName(group.description);
  const testPath = group.sourceFile
    ? resolveTestFilePath(group.sourceFile, config.projectRoot, config.sourceDir, config.testOutputDir)
    : `${config.testOutputDir}/${testName}.spec.ts`;

  const body = generateTestBody(group.interactions, config, testIdMap);

  const content = [
    templates.imports(),
    '',
    templates.describe(session.name, [
      templates.testCase(`should ${group.description}`, body),
    ].join('\n')),
    '',
  ].join('\n');

  return {
    filePath: testPath,
    content: formatTestFile(content),
    description: `E2E test for ${group.description}`,
  };
}

function generateTestBody(
  interactions: InteractionData[],
  config: ProjectConfig,
  testIdMap: Map<string, string>
): string {
  const lines: string[] = [];
  let currentUrl = '';

  for (let i = 0; i < interactions.length; i++) {
    const interaction = interactions[i];

    // Add navigation / goto
    if (interaction.type === 'navigation' || (i === 0 && interaction.url)) {
      const url = interaction.url;
      if (url !== currentUrl) {
        let gotoUrl: string;
        try {
          const urlObj = new URL(url);
          gotoUrl = url.startsWith(config.playwright.baseURL)
            ? urlObj.pathname
            : url;

          if (interaction.type === 'navigation' && i > 0) {
            lines.push('');
            lines.push(templates.comment(`Navigate to ${urlObj.pathname}`));
          }
        } catch {
          gotoUrl = url;
        }

        if (i === 0) {
          lines.push(templates.goto(gotoUrl));
          lines.push('');
        }
        currentUrl = url;
      }
      if (interaction.type === 'navigation') continue;
    }

    // Generate action
    const actionLine = generateAction(interaction, testIdMap);
    if (actionLine) {
      lines.push(actionLine);
    }

    // Generate assertions
    const assertions = generateAssertions(interactions, i);
    for (const assertion of assertions) {
      if (assertion.confidence === 'high') {
        lines.push(assertion.code);
      } else if (assertion.confidence === 'medium') {
        lines.push(templates.todoComment(assertion.description));
      }
    }
  }

  return lines.join('\n');
}

function generateAction(
  interaction: InteractionData,
  testIdMap: Map<string, string>
): string | null {
  const { element, type, value, key } = interaction;

  // Get the best selector (prefer test ID, then ID, then placeholder, then aria, then CSS)
  const testId =
    element.existingTestId ||
    testIdMap.get(element.cssSelector);

  // Check if element has an HTML id attribute
  const elementId = element.attributes?.['id'];

  switch (type) {
    case 'click':
    case 'dblclick': {
      if (testId) return templates.clickByTestId(testId);
      if (element.ariaRole && element.ariaLabel) {
        return templates.clickByRole(element.ariaRole, element.ariaLabel);
      }
      if (element.textContent) return templates.clickByText(element.textContent);
      if (element.innerText && element.innerText.length < 50) return templates.clickByText(element.innerText);
      if (elementId) return templates.clickBySelector(`#${elementId}`);
      return templates.clickBySelector(element.cssSelector);
    }

    case 'input':
    case 'change': {
      const fillValue = value || element.value || '';
      if (!fillValue) return null;

      if (testId) return templates.fillByTestId(testId, fillValue);
      if (element.placeholder) return templates.fillByPlaceholder(element.placeholder, fillValue);
      if (element.ariaLabel) return templates.fillByRole('textbox', element.ariaLabel, fillValue);
      if (elementId) return templates.fillBySelector(`#${elementId}`, fillValue);
      return templates.fillBySelector(element.cssSelector, fillValue);
    }

    case 'submit': {
      return templates.comment('Form submitted');
    }

    case 'keydown': {
      if (key === 'Enter') {
        return `await page.keyboard.press('Enter');`;
      }
      if (key === 'Escape') {
        return `await page.keyboard.press('Escape');`;
      }
      if (key === 'Tab') {
        return `await page.keyboard.press('Tab');`;
      }
      return null;
    }

    case 'navigation':
      return null; // Handled above

    default:
      return templates.comment(`${type} event on ${element.tagName}`);
  }
}

/**
 * Group interactions by URL/page flow.
 */
function groupInteractions(interactions: InteractionData[]): InteractionGroup[] {
  if (interactions.length === 0) return [];

  const groups: InteractionGroup[] = [];
  let currentGroup: InteractionGroup = {
    description: 'initial flow',
    baseUrl: interactions[0].url,
    interactions: [],
  };

  for (const interaction of interactions) {
    // Start a new group on navigation to a different page
    if (
      interaction.type === 'navigation' &&
      interaction.url !== currentGroup.baseUrl
    ) {
      if (currentGroup.interactions.length > 0) {
        groups.push(currentGroup);
      }
      const urlPath = new URL(interaction.url).pathname;
      currentGroup = {
        description: `interact with ${urlPath}`,
        baseUrl: interaction.url,
        interactions: [],
        sourceFile: interaction.element?.attributes?.['data-source'] || undefined,
      };
    }

    // Track source file from interaction metadata
    const source = (interaction as any).source || (interaction.element as any)?.source;
    if (source?.filePath && !currentGroup.sourceFile) {
      currentGroup.sourceFile = source.filePath;
    }

    currentGroup.interactions.push(interaction);
  }

  if (currentGroup.interactions.length > 0) {
    groups.push(currentGroup);
  }

  // Name the first group based on the URL
  if (groups.length > 0) {
    try {
      const urlPath = new URL(groups[0].baseUrl).pathname;
      groups[0].description = urlPath === '/' ? 'home page' : `${urlPath.slice(1)} page`;
    } catch {
      groups[0].description = 'main page';
    }
  }

  return groups;
}

function sanitizeName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function formatTestFile(content: string): string {
  return content
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}
