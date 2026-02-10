import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  RecordingSession,
  InteractionData,
  SessionStatus,
  ProjectConfig,
} from '@test-automator/shared';

const SESSIONS_DIR = '.qa-automation/sessions';

export class SessionManager {
  private sessions: Map<string, RecordingSession> = new Map();
  private sessionsDir: string;
  private maxRetention: number;

  constructor(config: ProjectConfig) {
    this.sessionsDir = path.join(config.projectRoot, SESSIONS_DIR);
    this.maxRetention = config.maxSessionRetention;
  }

  async init(): Promise<void> {
    await fs.ensureDir(this.sessionsDir);
    await this.loadExistingSessions();
  }

  createSession(name: string, startUrl: string): RecordingSession {
    const session: RecordingSession = {
      id: uuidv4(),
      name: name || `session-${Date.now()}`,
      status: 'recording',
      startUrl,
      startedAt: Date.now(),
      interactions: [],
    };

    this.sessions.set(session.id, session);
    this.persistSession(session);
    this.enforceRetention();
    return session;
  }

  getSession(id: string): RecordingSession | undefined {
    return this.sessions.get(id);
  }

  listSessions(): RecordingSession[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.startedAt - a.startedAt
    );
  }

  addInteraction(sessionId: string, interaction: InteractionData): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'recording') {
      return false;
    }

    session.interactions.push(interaction);
    this.persistSession(session);
    return true;
  }

  updateStatus(sessionId: string, status: SessionStatus): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.status = status;
    if (status === 'stopped') {
      session.stoppedAt = Date.now();
    }
    this.persistSession(session);
    return true;
  }

  deleteSession(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;

    this.sessions.delete(id);
    const filePath = path.join(this.sessionsDir, `${id}.json`);
    fs.removeSync(filePath);
    return true;
  }

  private async persistSession(session: RecordingSession): Promise<void> {
    const filePath = path.join(this.sessionsDir, `${session.id}.json`);
    await fs.writeJson(filePath, session, { spaces: 2 });
  }

  private async loadExistingSessions(): Promise<void> {
    try {
      const files = await fs.readdir(this.sessionsDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const session = await fs.readJson(
            path.join(this.sessionsDir, file)
          );
          this.sessions.set(session.id, session);
        } catch {
          // Skip corrupted session files
        }
      }
    } catch {
      // No sessions yet
    }
  }

  private enforceRetention(): void {
    const sessions = this.listSessions();
    if (sessions.length <= this.maxRetention) return;

    const toRemove = sessions.slice(this.maxRetention);
    for (const session of toRemove) {
      this.deleteSession(session.id);
    }
  }
}
