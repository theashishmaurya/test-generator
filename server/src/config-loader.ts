import { z } from 'zod';
import * as fs from 'fs-extra';
import * as path from 'path';
import chokidar from 'chokidar';
import { ProjectConfig, DEFAULT_CONFIG } from '@test-automator/shared';

const CONFIG_FILENAME = 'qa-automation.config.json';

const NamingStrategySchema = z.object({
  type: z.enum(['component-action', 'hierarchical', 'descriptive']),
});

const ProjectConfigSchema = z.object({
  projectRoot: z.string().optional(),
  testOutputDir: z.string().optional(),
  sourceDir: z.string().optional(),
  framework: z.literal('react').optional(),
  serverPort: z.number().int().min(1024).max(65535).optional(),
  namingStrategy: NamingStrategySchema.optional(),
  autoGenerateTests: z.boolean().optional(),
  preserveFormatting: z.boolean().optional(),
  backupBeforeModify: z.boolean().optional(),
  maxSessionRetention: z.number().int().min(1).max(100).optional(),
  playwright: z
    .object({
      baseURL: z.string().url().optional(),
      timeout: z.number().int().min(1000).optional(),
    })
    .optional(),
});

export class ConfigLoader {
  private config: ProjectConfig;
  private configPath: string;
  private watcher: chokidar.FSWatcher | null = null;
  private onChangeCallbacks: Array<(config: ProjectConfig) => void> = [];

  constructor(projectRoot?: string) {
    const root = projectRoot || this.findProjectRoot();
    this.configPath = path.join(root, CONFIG_FILENAME);
    this.config = { ...DEFAULT_CONFIG, projectRoot: root };
  }

  /**
   * Walk up from cwd to find the directory containing qa-automation.config.json
   * or the monorepo root (package.json with workspaces). Falls back to cwd.
   */
  private findProjectRoot(): string {
    let dir = process.cwd();
    const root = path.parse(dir).root;

    while (dir !== root) {
      // Prefer the directory with the config file
      if (fs.pathExistsSync(path.join(dir, CONFIG_FILENAME))) {
        return dir;
      }
      // Also check for monorepo root (package.json with workspaces)
      const pkgPath = path.join(dir, 'package.json');
      if (fs.pathExistsSync(pkgPath)) {
        try {
          const pkg = fs.readJsonSync(pkgPath);
          if (pkg.workspaces) return dir;
        } catch {}
      }
      dir = path.dirname(dir);
    }

    return process.cwd();
  }

  async load(): Promise<ProjectConfig> {
    try {
      if (await fs.pathExists(this.configPath)) {
        const raw = await fs.readJson(this.configPath);
        const parsed = ProjectConfigSchema.parse(raw);
        this.config = this.mergeConfig(parsed);
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        console.error('Invalid config file:', err.errors);
      } else {
        console.error('Error loading config:', err);
      }
      // Fall back to defaults
    }
    return this.config;
  }

  getConfig(): ProjectConfig {
    return this.config;
  }

  watch(): void {
    if (this.watcher) return;

    this.watcher = chokidar.watch(this.configPath, {
      ignoreInitial: true,
    });

    this.watcher.on('change', async () => {
      await this.load();
      for (const cb of this.onChangeCallbacks) {
        cb(this.config);
      }
    });
  }

  onChange(callback: (config: ProjectConfig) => void): void {
    this.onChangeCallbacks.push(callback);
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private mergeConfig(partial: z.infer<typeof ProjectConfigSchema>): ProjectConfig {
    return {
      ...this.config,
      ...partial,
      playwright: {
        ...this.config.playwright,
        ...(partial.playwright || {}),
      },
      namingStrategy: partial.namingStrategy || this.config.namingStrategy,
    };
  }
}
