import { NamingStrategy, ElementInfo, SourceLocation } from '@test-automator/shared';

/**
 * Convert a string to kebab-case.
 */
function toKebab(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/gi, '')
    .toLowerCase();
}

/**
 * Truncate and clean a string for use in a test ID.
 */
function cleanSegment(str: string, maxLen = 30): string {
  const cleaned = toKebab(str).replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleaned.slice(0, maxLen);
}

/**
 * Generate a test ID using the component-action strategy.
 * Pattern: {componentName}-{action}-{tagName}
 * e.g. login-form-submit-button
 */
function componentAction(
  element: ElementInfo,
  source?: SourceLocation,
  action?: string
): string {
  const parts: string[] = [];

  // Component name
  if (source?.componentName) {
    parts.push(cleanSegment(source.componentName));
  }

  // Action hint from element context
  const actionHint = action || inferAction(element);
  if (actionHint) {
    parts.push(cleanSegment(actionHint));
  }

  // Tag name
  parts.push(cleanSegment(element.tagName));

  return parts.join('-') || `element-${Date.now()}`;
}

/**
 * Generate a test ID using the hierarchical strategy.
 * Pattern: {parent}-{child}-{element}
 * e.g. dashboard-user-menu-logout
 */
function hierarchical(
  element: ElementInfo,
  source?: SourceLocation
): string {
  const parts: string[] = [];

  if (source?.componentHierarchy && source.componentHierarchy.length > 0) {
    // Take up to 3 levels from hierarchy (most specific first, we want top-down)
    const hierarchy = source.componentHierarchy.slice(0, 3).reverse();
    for (const comp of hierarchy) {
      parts.push(cleanSegment(comp));
    }
  }

  // Add element identifier
  const identifier = inferIdentifier(element);
  if (identifier) {
    parts.push(cleanSegment(identifier));
  } else {
    parts.push(cleanSegment(element.tagName));
  }

  return parts.join('-') || `element-${Date.now()}`;
}

/**
 * Generate a test ID using the descriptive strategy.
 * Based on text content / aria-label.
 * e.g. save-changes-button
 */
function descriptive(element: ElementInfo): string {
  const parts: string[] = [];

  // Use text content or aria label
  const label =
    element.ariaLabel ||
    element.textContent ||
    element.placeholder ||
    element.innerText;

  if (label) {
    parts.push(cleanSegment(label, 40));
  }

  parts.push(cleanSegment(element.tagName));

  return parts.join('-') || `element-${Date.now()}`;
}

/**
 * Infer an action name from the element's attributes and context.
 */
function inferAction(element: ElementInfo): string | null {
  const type = element.inputType;
  if (type === 'submit') return 'submit';
  if (type === 'email') return 'email';
  if (type === 'password') return 'password';
  if (type === 'search') return 'search';

  const text = (element.textContent || element.innerText || '').toLowerCase();
  const actionWords = ['submit', 'login', 'logout', 'save', 'delete', 'cancel', 'close', 'open', 'search', 'add', 'edit', 'create', 'remove'];
  for (const word of actionWords) {
    if (text.includes(word)) return word;
  }

  if (element.attributes['type'] === 'submit') return 'submit';
  if (element.ariaLabel) {
    return cleanSegment(element.ariaLabel, 20);
  }

  return null;
}

/**
 * Infer an identifier for an element from its text/attributes.
 */
function inferIdentifier(element: ElementInfo): string | null {
  if (element.ariaLabel) return element.ariaLabel;
  if (element.textContent) return element.textContent;
  if (element.placeholder) return element.placeholder;
  return null;
}

/**
 * Generate a test ID based on the configured naming strategy.
 */
export function generateTestId(
  strategy: NamingStrategy,
  element: ElementInfo,
  source?: SourceLocation,
  action?: string
): string {
  switch (strategy.type) {
    case 'component-action':
      return componentAction(element, source, action);
    case 'hierarchical':
      return hierarchical(element, source);
    case 'descriptive':
      return descriptive(element);
    default:
      return componentAction(element, source, action);
  }
}

/**
 * Ensure a test ID is unique by appending a suffix if needed.
 */
export function makeUnique(testId: string, existingIds: Set<string>): string {
  if (!existingIds.has(testId)) {
    return testId;
  }

  let counter = 2;
  while (existingIds.has(`${testId}-${counter}`)) {
    counter++;
  }
  return `${testId}-${counter}`;
}
