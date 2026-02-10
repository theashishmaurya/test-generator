/**
 * Template functions for generating Playwright test code fragments.
 */

export const templates = {
  imports(): string {
    return `import { test, expect } from '@playwright/test';`;
  },

  describe(name: string, body: string): string {
    return `test.describe('${escapeSingle(name)}', () => {\n${indent(body, 2)}\n});`;
  },

  testCase(name: string, body: string): string {
    return `test('${escapeSingle(name)}', async ({ page }) => {\n${indent(body, 2)}\n});`;
  },

  goto(url: string): string {
    return `await page.goto('${escapeSingle(url)}');`;
  },

  clickByTestId(testId: string): string {
    return `await page.getByTestId('${escapeSingle(testId)}').click();`;
  },

  clickByRole(role: string, name?: string): string {
    if (name) {
      return `await page.getByRole('${role}', { name: '${escapeSingle(name)}' }).click();`;
    }
    return `await page.getByRole('${role}').click();`;
  },

  clickByText(text: string): string {
    return `await page.getByText('${escapeSingle(text)}').click();`;
  },

  clickBySelector(selector: string): string {
    return `await page.locator('${escapeSingle(selector)}').click();`;
  },

  fillByTestId(testId: string, value: string): string {
    return `await page.getByTestId('${escapeSingle(testId)}').fill('${escapeSingle(value)}');`;
  },

  fillByRole(role: string, name: string, value: string): string {
    return `await page.getByRole('${role}', { name: '${escapeSingle(name)}' }).fill('${escapeSingle(value)}');`;
  },

  fillByPlaceholder(placeholder: string, value: string): string {
    return `await page.getByPlaceholder('${escapeSingle(placeholder)}').fill('${escapeSingle(value)}');`;
  },

  fillBySelector(selector: string, value: string): string {
    return `await page.locator('${escapeSingle(selector)}').fill('${escapeSingle(value)}');`;
  },

  selectByTestId(testId: string, value: string): string {
    return `await page.getByTestId('${escapeSingle(testId)}').selectOption('${escapeSingle(value)}');`;
  },

  expectUrl(url: string): string {
    return `await expect(page).toHaveURL('${escapeSingle(url)}');`;
  },

  expectUrlContains(fragment: string): string {
    return `await expect(page).toHaveURL(/${escapeRegex(fragment)}/);`;
  },

  expectVisible(testId: string): string {
    return `await expect(page.getByTestId('${escapeSingle(testId)}')).toBeVisible();`;
  },

  expectText(testId: string, text: string): string {
    return `await expect(page.getByTestId('${escapeSingle(testId)}')).toContainText('${escapeSingle(text)}');`;
  },

  expectTextVisible(text: string): string {
    return `await expect(page.getByText('${escapeSingle(text)}')).toBeVisible();`;
  },

  waitForLoadState(state: string = 'networkidle'): string {
    return `await page.waitForLoadState('${state}');`;
  },

  waitForUrl(url: string): string {
    return `await page.waitForURL('${escapeSingle(url)}');`;
  },

  comment(text: string): string {
    return `// ${text}`;
  },

  todoComment(text: string): string {
    return `// TODO: ${text}`;
  },
};

function escapeSingle(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function indent(code: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return code
    .split('\n')
    .map((line) => (line.trim() ? prefix + line : line))
    .join('\n');
}
