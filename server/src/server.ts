import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { ProjectConfig } from '@test-automator/shared';
import { SessionManager } from './session-manager';
import { WebSocketHandler } from './websocket-handler';
import { ClaudeAgent } from './claude-agent';
import { ConfigLoader } from './config-loader';

export async function createServer(configLoader: ConfigLoader) {
  const config = configLoader.getConfig();
  const app = express();
  const httpServer = http.createServer(app);

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Initialize components
  const sessionManager = new SessionManager(config);
  await sessionManager.init();

  const wsHandler = new WebSocketHandler(sessionManager);
  const agent = new ClaudeAgent(config);

  // WebSocket server on the same HTTP server
  const wss = new WebSocketServer({ server: httpServer });
  wss.on('connection', (ws: WebSocket) => {
    wsHandler.handleConnection(ws);
  });

  // REST API Routes

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: '0.1.0',
      uptime: process.uptime(),
      wsClients: wss.clients.size,
    });
  });

  app.get('/api/config', (_req, res) => {
    const current = configLoader.getConfig();
    res.json(current);
  });

  app.get('/api/sessions', (_req, res) => {
    const sessions = sessionManager.listSessions().map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      startUrl: s.startUrl,
      startedAt: s.startedAt,
      stoppedAt: s.stoppedAt,
      interactionCount: s.interactions.length,
    }));
    res.json(sessions);
  });

  app.get('/api/sessions/:id', (req, res) => {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  });

  app.delete('/api/sessions/:id', (req, res) => {
    const deleted = sessionManager.deleteSession(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({ message: 'Session deleted' });
  });

  app.post('/api/sessions/:id/process', async (req, res) => {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.interactions.length === 0) {
      res.status(400).json({ error: 'Session has no interactions' });
      return;
    }

    try {
      sessionManager.updateStatus(session.id, 'processing');
      wsHandler.broadcast({
        type: 'processing:started',
        sessionId: session.id,
      });

      const result = await agent.processSession(session);

      sessionManager.updateStatus(session.id, result.errors.length > 0 ? 'error' : 'completed');
      wsHandler.broadcast({
        type: 'processing:complete',
        sessionId: session.id,
        data: result,
      });

      res.json(result);
    } catch (err) {
      sessionManager.updateStatus(session.id, 'error');
      wsHandler.broadcast({
        type: 'processing:error',
        sessionId: session.id,
        message: String(err),
      });

      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/sessions/:id/apply', async (req, res) => {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      const result = await agent.processSession(session);
      const applied = await agent.applyResult(result);
      res.json(applied);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/sessions/:id/rollback', async (req, res) => {
    try {
      const backupPaths = req.body.backupPaths || [];
      const result = await agent.rollback(backupPaths);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return { app, httpServer, wss, sessionManager, wsHandler };
}
