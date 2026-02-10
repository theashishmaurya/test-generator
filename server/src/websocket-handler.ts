import { WebSocket } from 'ws';
import { ExtensionEvent, ServerAck, InteractionData } from '@test-automator/shared';
import { SessionManager } from './session-manager';

export class WebSocketHandler {
  private clients: Set<WebSocket> = new Set();
  private sessionManager: SessionManager;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  handleConnection(ws: WebSocket): void {
    this.clients.add(ws);

    ws.on('message', (data) => {
      try {
        const event: ExtensionEvent = JSON.parse(data.toString());
        this.handleEvent(ws, event);
      } catch (err) {
        this.sendAck(ws, {
          type: 'error',
          message: 'Invalid message format',
        });
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
    });

    ws.on('error', () => {
      this.clients.delete(ws);
    });
  }

  broadcast(message: ServerAck): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  private handleEvent(ws: WebSocket, event: ExtensionEvent): void {
    switch (event.type) {
      case 'ping':
        this.sendAck(ws, { type: 'ack', message: 'pong' });
        break;

      case 'session:start':
        this.handleSessionStart(ws, event);
        break;

      case 'session:stop':
        this.handleSessionStop(ws, event);
        break;

      case 'session:pause':
        this.handleSessionPause(ws, event);
        break;

      case 'session:resume':
        this.handleSessionResume(ws, event);
        break;

      case 'interaction':
        this.handleInteraction(ws, event);
        break;

      default:
        this.sendAck(ws, {
          type: 'error',
          message: `Unknown event type: ${(event as ExtensionEvent).type}`,
        });
    }
  }

  private handleSessionStart(ws: WebSocket, event: ExtensionEvent): void {
    const session = this.sessionManager.createSession(
      event.sessionName || '',
      event.url || 'unknown'
    );

    this.sendAck(ws, {
      type: 'session:created',
      sessionId: session.id,
      message: `Session "${session.name}" created`,
    });
  }

  private handleSessionStop(ws: WebSocket, event: ExtensionEvent): void {
    if (!event.sessionId) {
      this.sendAck(ws, { type: 'error', message: 'Missing sessionId' });
      return;
    }

    const success = this.sessionManager.updateStatus(event.sessionId, 'stopped');
    this.sendAck(ws, {
      type: 'ack',
      sessionId: event.sessionId,
      message: success ? 'Session stopped' : 'Session not found',
    });
  }

  private handleSessionPause(ws: WebSocket, event: ExtensionEvent): void {
    if (!event.sessionId) {
      this.sendAck(ws, { type: 'error', message: 'Missing sessionId' });
      return;
    }

    const success = this.sessionManager.updateStatus(event.sessionId, 'paused');
    this.sendAck(ws, {
      type: 'ack',
      sessionId: event.sessionId,
      message: success ? 'Session paused' : 'Session not found',
    });
  }

  private handleSessionResume(ws: WebSocket, event: ExtensionEvent): void {
    if (!event.sessionId) {
      this.sendAck(ws, { type: 'error', message: 'Missing sessionId' });
      return;
    }

    const success = this.sessionManager.updateStatus(event.sessionId, 'recording');
    this.sendAck(ws, {
      type: 'ack',
      sessionId: event.sessionId,
      message: success ? 'Session resumed' : 'Session not found',
    });
  }

  private handleInteraction(ws: WebSocket, event: ExtensionEvent): void {
    if (!event.sessionId || !event.data) {
      this.sendAck(ws, {
        type: 'error',
        message: 'Missing sessionId or interaction data',
      });
      return;
    }

    const success = this.sessionManager.addInteraction(
      event.sessionId,
      event.data as InteractionData
    );

    this.sendAck(ws, {
      type: 'ack',
      eventId: event.data.id,
      sessionId: event.sessionId,
      message: success ? 'Interaction recorded' : 'Failed to record interaction',
    });
  }

  private sendAck(ws: WebSocket, ack: ServerAck): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(ack));
    }
  }
}
