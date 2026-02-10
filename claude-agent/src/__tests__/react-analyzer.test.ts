import { describe, it, expect } from 'vitest';
import { analyzeReactFile, findJSXElementAtPosition } from '../analyzer/react-analyzer';

describe('react-analyzer', () => {
  it('should detect function components', () => {
    const code = `
function MyComponent() {
  return <div>Hello</div>;
}`;
    const result = analyzeReactFile(code);
    expect(result.components).toHaveLength(1);
    expect(result.components[0].name).toBe('MyComponent');
    expect(result.components[0].type).toBe('function');
  });

  it('should detect arrow function components', () => {
    const code = `
const MyComponent = () => {
  return <div>Hello</div>;
};`;
    const result = analyzeReactFile(code);
    expect(result.components).toHaveLength(1);
    expect(result.components[0].name).toBe('MyComponent');
    expect(result.components[0].type).toBe('arrow');
  });

  it('should detect React.memo wrapped components', () => {
    const code = `
const MyComponent = React.memo(() => {
  return <div>Hello</div>;
});`;
    const result = analyzeReactFile(code);
    expect(result.components).toHaveLength(1);
    expect(result.components[0].name).toBe('MyComponent');
  });

  it('should find all JSX elements', () => {
    const code = `
function App() {
  return (
    <div>
      <h1>Title</h1>
      <button>Click</button>
    </div>
  );
}`;
    const result = analyzeReactFile(code);
    expect(result.jsxElements.length).toBeGreaterThanOrEqual(3); // div, h1, button
  });

  it('should detect existing data-testid attributes', () => {
    const code = `
function App() {
  return <button data-testid="my-button">Click</button>;
}`;
    const result = analyzeReactFile(code);
    const btn = result.jsxElements.find((el) => el.tagName === 'button');
    expect(btn).toBeDefined();
    expect(btn!.hasTestId).toBe(true);
    expect(btn!.existingTestId).toBe('my-button');
  });

  it('should track parent component name', () => {
    const code = `
function LoginForm() {
  return (
    <form>
      <input type="email" />
    </form>
  );
}`;
    const result = analyzeReactFile(code);
    const input = result.jsxElements.find((el) => el.tagName === 'input');
    expect(input).toBeDefined();
    expect(input!.parentComponent).toBe('LoginForm');
  });

  it('should find element at position', () => {
    const code = `
function App() {
  return (
    <div>
      <button>Click</button>
    </div>
  );
}`;
    const { jsxElements } = analyzeReactFile(code);
    const found = findJSXElementAtPosition(jsxElements, 5, 6);
    expect(found).toBeDefined();
    expect(found!.tagName).toBe('button');
  });

  it('should handle TypeScript/TSX correctly', () => {
    const code = `
interface Props {
  name: string;
}

const Greeting: React.FC<Props> = ({ name }) => {
  return <div>Hello {name}</div>;
};`;
    const result = analyzeReactFile(code);
    expect(result.components).toHaveLength(1);
    expect(result.components[0].name).toBe('Greeting');
  });
});
