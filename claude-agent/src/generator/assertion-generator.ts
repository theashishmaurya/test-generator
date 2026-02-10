import { InteractionData } from '@test-automator/shared';
import { templates } from './playwright-templates';

export interface GeneratedAssertion {
  code: string;
  confidence: 'high' | 'medium' | 'low';
  description: string;
}

/**
 * Analyze a sequence of interactions and infer appropriate assertions.
 * Only generates high-confidence assertions automatically;
 * medium/low confidence ones get TODO comments.
 */
export function generateAssertions(
  interactions: InteractionData[],
  index: number
): GeneratedAssertion[] {
  const assertions: GeneratedAssertion[] = [];
  const current = interactions[index];
  const next = index + 1 < interactions.length ? interactions[index + 1] : null;
  const prev = index > 0 ? interactions[index - 1] : null;

  // Pattern: Click followed by navigation -> URL assertion
  if (current.type === 'click' && next?.type === 'navigation') {
    const url = next.url;
    const urlPath = new URL(url).pathname;
    assertions.push({
      code: templates.expectUrlContains(urlPath),
      confidence: 'high',
      description: `Verify navigation to ${urlPath} after click`,
    });
  }

  // Pattern: Navigation event -> URL assertion
  if (current.type === 'navigation') {
    const urlPath = new URL(current.url).pathname;
    assertions.push({
      code: templates.expectUrlContains(urlPath),
      confidence: 'high',
      description: `Verify URL contains ${urlPath}`,
    });
  }

  // Pattern: Form submission -> wait for load
  if (current.type === 'submit') {
    assertions.push({
      code: templates.waitForLoadState('networkidle'),
      confidence: 'high',
      description: 'Wait for form submission to complete',
    });

    // If next interaction is on a different URL, add URL assertion
    if (next && next.url !== current.url) {
      const urlPath = new URL(next.url).pathname;
      assertions.push({
        code: templates.expectUrlContains(urlPath),
        confidence: 'high',
        description: `Verify redirect after form submission to ${urlPath}`,
      });
    }
  }

  // Pattern: Click on a button/link that might show new content
  if (
    current.type === 'click' &&
    next &&
    next.type !== 'navigation' &&
    next.element?.existingTestId
  ) {
    assertions.push({
      code: templates.expectVisible(next.element.existingTestId),
      confidence: 'medium',
      description: `Verify element becomes visible after click`,
    });
  }

  // Pattern: After filling a form, the value should be present
  if (current.type === 'input' && current.value) {
    // Low confidence - value assertions are fragile
    assertions.push({
      code: templates.todoComment(
        `Verify input value is '${current.value.slice(0, 30)}'`
      ),
      confidence: 'low',
      description: 'Input value assertion (needs manual review)',
    });
  }

  return assertions;
}
