import { describe, it, expect } from 'vitest';
import { insertTestIds } from '../analyzer/testid-inserter';
import { TestIdInsertion } from '@test-automator/shared';

describe('testid-inserter', () => {
  it('should insert a data-testid into a simple JSX element', () => {
    const code = `function App() {
  return (
    <div>
      <button>Click me</button>
    </div>
  );
}`;

    const insertions: TestIdInsertion[] = [
      {
        filePath: 'test.tsx',
        lineNumber: 4,
        columnNumber: 6,
        testId: 'app-click-button',
        elementTagName: 'button',
      },
    ];

    const result = insertTestIds(code, insertions);
    expect(result.inserted).toBe(1);
    expect(result.code).toMatch(/data-testid=["']app-click-button["']/);
    expect(result.skipped).toHaveLength(0);
  });

  it('should skip elements that already have data-testid', () => {
    const code = `function App() {
  return <button data-testid="existing">Click</button>;
}`;

    const insertions: TestIdInsertion[] = [
      {
        filePath: 'test.tsx',
        lineNumber: 2,
        columnNumber: 10,
        testId: 'new-id',
        elementTagName: 'button',
      },
    ];

    const result = insertTestIds(code, insertions);
    expect(result.inserted).toBe(0);
    expect(result.code).toContain('data-testid="existing"');
    expect(result.code).not.toContain('new-id');
  });

  it('should skip duplicate test IDs within the same file', () => {
    const code = `function App() {
  return (
    <div>
      <button data-testid="my-btn">First</button>
      <button>Second</button>
    </div>
  );
}`;

    const insertions: TestIdInsertion[] = [
      {
        filePath: 'test.tsx',
        lineNumber: 5,
        columnNumber: 6,
        testId: 'my-btn',
        elementTagName: 'button',
      },
    ];

    const result = insertTestIds(code, insertions);
    expect(result.inserted).toBe(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain('already exists');
  });

  it('should handle multiple insertions', () => {
    const code = `function LoginForm() {
  return (
    <form>
      <input type="email" />
      <input type="password" />
      <button type="submit">Login</button>
    </form>
  );
}`;

    const insertions: TestIdInsertion[] = [
      {
        filePath: 'test.tsx',
        lineNumber: 4,
        columnNumber: 6,
        testId: 'login-email-input',
        elementTagName: 'input',
      },
      {
        filePath: 'test.tsx',
        lineNumber: 5,
        columnNumber: 6,
        testId: 'login-password-input',
        elementTagName: 'input',
      },
      {
        filePath: 'test.tsx',
        lineNumber: 6,
        columnNumber: 6,
        testId: 'login-submit-button',
        elementTagName: 'button',
      },
    ];

    const result = insertTestIds(code, insertions);
    expect(result.inserted).toBe(3);
    expect(result.code).toMatch(/data-testid=["']login-email-input["']/);
    expect(result.code).toMatch(/data-testid=["']login-password-input["']/);
    expect(result.code).toMatch(/data-testid=["']login-submit-button["']/);
  });

  it('should preserve original formatting', () => {
    const code = `function App() {
  return (
    <div className="container">
      <button
        className="btn"
        onClick={handleClick}
      >
        Click
      </button>
    </div>
  );
}`;

    const insertions: TestIdInsertion[] = [
      {
        filePath: 'test.tsx',
        lineNumber: 4,
        columnNumber: 6,
        testId: 'app-click-button',
        elementTagName: 'button',
      },
    ];

    const result = insertTestIds(code, insertions);
    expect(result.inserted).toBe(1);
    // Verify indentation is preserved (2-space indentation)
    expect(result.code).toContain('className="container"');
    expect(result.code).toContain('onClick={handleClick}');
  });
});
