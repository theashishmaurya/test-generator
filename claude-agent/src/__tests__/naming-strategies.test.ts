import { describe, it, expect } from 'vitest';
import { generateTestId, makeUnique } from '../utils/naming-strategies';
import { ElementInfo, SourceLocation } from '@test-automator/shared';

describe('naming-strategies', () => {
  const baseElement: ElementInfo = {
    tagName: 'button',
    cssSelector: '.btn',
    textContent: 'Submit',
    attributes: {},
    ariaLabel: undefined,
    ariaRole: 'button',
  };

  const baseSource: SourceLocation = {
    filePath: 'src/LoginForm.tsx',
    lineNumber: 10,
    columnNumber: 4,
    componentName: 'LoginForm',
    componentHierarchy: ['App', 'LoginPage', 'LoginForm'],
  };

  describe('component-action strategy', () => {
    it('should generate test ID from component + action + tag', () => {
      const id = generateTestId(
        { type: 'component-action' },
        baseElement,
        baseSource,
        'submit'
      );
      expect(id).toBe('login-form-submit-button');
    });

    it('should infer action from text content', () => {
      const element = { ...baseElement, textContent: 'Save Changes' };
      const id = generateTestId({ type: 'component-action' }, element, baseSource);
      expect(id).toBe('login-form-save-button');
    });
  });

  describe('hierarchical strategy', () => {
    it('should generate test ID from component hierarchy', () => {
      const id = generateTestId({ type: 'hierarchical' }, baseElement, baseSource);
      expect(id).toContain('app');
      expect(id).toContain('login');
    });
  });

  describe('descriptive strategy', () => {
    it('should generate test ID from text content', () => {
      const id = generateTestId({ type: 'descriptive' }, baseElement);
      expect(id).toContain('submit');
      expect(id).toContain('button');
    });

    it('should use aria-label when available', () => {
      const element = { ...baseElement, ariaLabel: 'Close dialog' };
      const id = generateTestId({ type: 'descriptive' }, element);
      expect(id).toContain('close-dialog');
    });
  });

  describe('makeUnique', () => {
    it('should return original ID if unique', () => {
      const existing = new Set(['other-id']);
      expect(makeUnique('my-id', existing)).toBe('my-id');
    });

    it('should append suffix for duplicates', () => {
      const existing = new Set(['my-id']);
      expect(makeUnique('my-id', existing)).toBe('my-id-2');
    });

    it('should increment suffix for multiple duplicates', () => {
      const existing = new Set(['my-id', 'my-id-2', 'my-id-3']);
      expect(makeUnique('my-id', existing)).toBe('my-id-4');
    });
  });
});
