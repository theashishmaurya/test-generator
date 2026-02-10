# Playwright QA Test Auto-Generator

Record browser interactions during local React development and automatically generate Playwright tests with `data-testid` attributes injected into your source components.

## How It Works

```
Chrome Extension  ──WebSocket──▶  Local Node Server  ──IPC──▶  Claude Agent (AST/Generator)
  (capture + resolve)              (sessions + config)           (test IDs + Playwright tests)
                                                                         │
                                                                         ▼
                                                                   Your Codebase
                                                               (src/ modified, tests/ generated)
```

1. **Record** — Start a recording session from the Chrome extension while using your React app locally
2. **Capture** — Every click, input, form submission, and navigation is captured with React component source locations via Fiber introspection
3. **Analyze** — The AST engine parses your JSX/TSX source files and determines where to insert `data-testid` attributes
4. **Generate** — A complete Playwright `.spec.ts` file is generated from the recorded session, using `data-testid` selectors
5. **Preview & Apply** — Review diffs before any source files are modified. Backups are created automatically

## Project Structure

```
test-automator/
├── shared/                    # Shared TypeScript types
├── server/                    # Express + WebSocket server (port 3333)
├── claude-agent/              # AST analysis + Playwright test generation
├── chrome-extension/          # Manifest V3 Chrome extension
└── example-app/               # Demo React+Vite app (Login → Dashboard)
```

## Prerequisites

- Node.js >= 18
- Google Chrome (for the extension)
- A local React development server (Vite, CRA, Next.js dev, etc.)

## Quick Start

### 1. Install & Build

```bash
# Install workspace dependencies
npm install

# Build all packages
npm run build

# Install example app separately
cd example-app && npm install && cd ..
```

### 2. Start the Server

```bash
npm run dev
# Server running on http://localhost:3333
# WebSocket available on ws://localhost:3333
```

### 3. Load the Chrome Extension

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `chrome-extension/` directory

### 4. Start the Example App (optional)

```bash
cd example-app
npm run dev
# App running on http://localhost:5173
```

### 5. Record a Flow

1. Navigate to your React app (e.g. `http://localhost:5173`)
2. Click the QA Test Automator extension icon
3. Enter a session name (e.g. `login-flow`) and click **Start Recording**
4. Interact with your app — fill forms, click buttons, navigate pages
5. Click **Stop** when done

### 6. Generate Tests

```bash
# Preview what will be generated
curl http://localhost:3333/api/sessions

# Process a session (returns diff preview + generated test)
curl -X POST http://localhost:3333/api/sessions/<session-id>/process

# Apply changes to disk (inserts data-testid + writes .spec.ts)
curl -X POST http://localhost:3333/api/sessions/<session-id>/apply

# Rollback if needed
curl -X POST http://localhost:3333/api/sessions/<session-id>/rollback \
  -H "Content-Type: application/json" \
  -d '{"backupPaths": [...]}'
```

## REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Server health check |
| `GET` | `/api/config` | Current configuration |
| `GET` | `/api/sessions` | List all sessions |
| `GET` | `/api/sessions/:id` | Get session details |
| `DELETE` | `/api/sessions/:id` | Delete a session |
| `POST` | `/api/sessions/:id/process` | Generate preview (diffs + tests) |
| `POST` | `/api/sessions/:id/apply` | Write changes to disk |
| `POST` | `/api/sessions/:id/rollback` | Restore from backups |

## Configuration

Create a `qa-automation.config.json` in your project root:

```json
{
  "testOutputDir": "tests/e2e",
  "sourceDir": "src",
  "framework": "react",
  "serverPort": 3333,
  "namingStrategy": {
    "type": "component-action"
  },
  "autoGenerateTests": false,
  "preserveFormatting": true,
  "backupBeforeModify": true,
  "maxSessionRetention": 10,
  "playwright": {
    "baseURL": "http://localhost:5173",
    "timeout": 30000
  }
}
```

### Naming Strategies

| Strategy | Pattern | Example |
|----------|---------|---------|
| `component-action` | `{component}-{action}-{tag}` | `login-form-submit-button` |
| `hierarchical` | `{parent}-{child}-{element}` | `dashboard-user-menu-logout` |
| `descriptive` | `{text/label}-{tag}` | `save-changes-button` |

## Example Output

Given a recorded login flow, the tool generates:

**Source modification** (`src/pages/LoginPage.tsx`):
```diff
- <input type="email" placeholder="Enter your email" />
+ <input type="email" placeholder="Enter your email" data-testid="login-page-email-input" />
```

**Generated test** (`tests/e2e/pages/login-page.spec.ts`):
```typescript
import { test, expect } from '@playwright/test';

test.describe('login-flow', () => {
  test('should complete login-flow flow', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('login-page-email-input').fill('user@example.com');
    await page.getByTestId('login-page-password-input').fill('password123');
    await page.getByTestId('login-page-submit-button').click();

    await expect(page).toHaveURL(/dashboard/);
  });
});
```

## Architecture Details

### Chrome Extension
- **Manifest V3** with content scripts injected at `document_idle`
- Captures: click, dblclick, input, change, submit, keydown, navigation (SPA-aware via `pushState` monkey-patching)
- **React Fiber introspection**: walks `__reactFiber$` keys to find `_debugSource` for accurate source file/line mapping
- **Sourcemap resolver**: fetches and parses inline/external sourcemaps for Vite and Webpack bundles
- WebSocket client with auto-reconnect and message queuing

### AST Engine (claude-agent)
- **Recast + Babel parser** for format-preserving AST manipulation — your code style is untouched
- Supports JSX, TSX, decorators, optional chaining, class properties
- Handles `React.memo`, `forwardRef`, HOCs when resolving component names
- Deduplicates test IDs within files
- Inserts `data-testid` after spread attributes to avoid override

### Server
- Express HTTP + WebSocket on the same port
- Sessions persisted as JSON in `.qa-automation/sessions/`
- Config file watching with auto-reload via chokidar
- Zod validation on all config inputs

## Development

```bash
# Run all tests
npm test

# Run tests in watch mode
cd claude-agent && npx vitest

# Build all packages
npm run build

# Start server in dev mode (auto-reload)
npm run dev
```

### Test Coverage

- **AST Parser**: Verifies JSX/TSX parsing with Babel plugins
- **React Analyzer**: Component detection (function, arrow, class, memo, forwardRef), JSX element finding, parent component tracking
- **Test ID Inserter**: Single/multiple insertions, duplicate handling, format preservation
- **Naming Strategies**: All three strategies, uniqueness enforcement

## Key Design Decisions

- **Recast over raw Babel generator** — preserves developer formatting (indentation, comments, spacing)
- **Deterministic AST processing** (no LLM) — fast (<500ms/file), reproducible, no API key needed
- **Preview mode by default** — never auto-writes source files without user confirmation
- **JSON file persistence** — simple, local, inspectable, no database dependency
- **Content script at `document_idle`** — ensures React has mounted before capturing

## License

MIT
