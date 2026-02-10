// ============================================================
// Source & Location Types
// ============================================================

export interface SourceLocation {
  filePath: string;
  lineNumber: number;
  columnNumber: number;
  componentName?: string;
  componentHierarchy?: string[];
}

export interface ElementInfo {
  tagName: string;
  cssSelector: string;
  textContent?: string;
  attributes: Record<string, string>;
  existingTestId?: string;
  ariaLabel?: string;
  ariaRole?: string;
  innerText?: string;
  placeholder?: string;
  inputType?: string;
  value?: string;
}

// ============================================================
// Interaction / Event Types
// ============================================================

export type InteractionType =
  | 'click'
  | 'dblclick'
  | 'input'
  | 'change'
  | 'submit'
  | 'keydown'
  | 'keyup'
  | 'focus'
  | 'blur'
  | 'navigation'
  | 'scroll'
  | 'hover';

export interface InteractionData {
  id: string;
  type: InteractionType;
  timestamp: number;
  url: string;
  element: ElementInfo;
  source?: SourceLocation;
  value?: string;
  key?: string;
  coordinates?: { x: number; y: number };
  metadata?: Record<string, unknown>;
}

export interface ExtensionEvent {
  type: 'interaction' | 'session:start' | 'session:stop' | 'session:pause' | 'session:resume' | 'ping';
  sessionId?: string;
  data?: InteractionData;
  sessionName?: string;
  url?: string;
  timestamp: number;
}

export interface ServerAck {
  type: 'ack' | 'error' | 'session:created' | 'processing:started' | 'processing:complete' | 'processing:error';
  eventId?: string;
  sessionId?: string;
  message?: string;
  data?: unknown;
}

// ============================================================
// Session Types
// ============================================================

export type SessionStatus = 'recording' | 'paused' | 'stopped' | 'processing' | 'completed' | 'error';

export interface RecordingSession {
  id: string;
  name: string;
  status: SessionStatus;
  startUrl: string;
  startedAt: number;
  stoppedAt?: number;
  interactions: InteractionData[];
  metadata?: Record<string, unknown>;
}

// ============================================================
// Config Types
// ============================================================

export interface NamingStrategy {
  type: 'component-action' | 'hierarchical' | 'descriptive';
}

export interface ProjectConfig {
  projectRoot: string;
  testOutputDir: string;
  sourceDir: string;
  framework: 'react';
  serverPort: number;
  namingStrategy: NamingStrategy;
  autoGenerateTests: boolean;
  preserveFormatting: boolean;
  backupBeforeModify: boolean;
  maxSessionRetention: number;
  playwright: {
    baseURL: string;
    timeout: number;
  };
}

export const DEFAULT_CONFIG: ProjectConfig = {
  projectRoot: process.cwd(),
  testOutputDir: 'tests/e2e',
  sourceDir: 'src',
  framework: 'react',
  serverPort: 3333,
  namingStrategy: { type: 'component-action' },
  autoGenerateTests: false,
  preserveFormatting: true,
  backupBeforeModify: true,
  maxSessionRetention: 10,
  playwright: {
    baseURL: 'http://localhost:5173',
    timeout: 30000,
  },
};

// ============================================================
// Processing / Generation Types
// ============================================================

export interface TestIdInsertion {
  filePath: string;
  lineNumber: number;
  columnNumber: number;
  testId: string;
  elementTagName: string;
  componentName?: string;
}

export interface TestIdInsertionPlan {
  insertions: TestIdInsertion[];
  skipped: Array<{
    reason: string;
    element: ElementInfo;
    source?: SourceLocation;
  }>;
}

export interface FileDiff {
  filePath: string;
  original: string;
  modified: string;
  diff: string;
}

export interface GeneratedTestFile {
  filePath: string;
  content: string;
  description: string;
}

export interface ProcessingResult {
  sessionId: string;
  testIdPlan: TestIdInsertionPlan;
  fileDiffs: FileDiff[];
  generatedTests: GeneratedTestFile[];
  backupPaths: string[];
  errors: string[];
  warnings: string[];
}
