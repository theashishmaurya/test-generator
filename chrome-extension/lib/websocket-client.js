/**
 * WebSocket client for communicating with the local test-automator server.
 * Handles auto-reconnection and message queuing during disconnection.
 */
(function () {
  'use strict';

  const DEFAULT_URL = 'ws://localhost:3333';
  const RECONNECT_INTERVAL = 3000;
  const MAX_QUEUE_SIZE = 500;

  class WSClient {
    constructor(url = DEFAULT_URL) {
      this.url = url;
      this.ws = null;
      this.connected = false;
      this.messageQueue = [];
      this.reconnectTimer = null;
      this.listeners = {};
    }

    connect() {
      if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
        return;
      }

      try {
        this.ws = new WebSocket(this.url);
      } catch (e) {
        this.scheduleReconnect();
        return;
      }

      this.ws.onopen = () => {
        this.connected = true;
        this.emit('connected');
        this.flushQueue();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.emit('message', data);
        } catch (e) {
          console.error('[QA-Automator WS] Parse error:', e);
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.ws = null;
        this.emit('disconnected');
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        // onclose will fire after this
      };
    }

    disconnect() {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      this.connected = false;
    }

    send(message) {
      const data = typeof message === 'string' ? message : JSON.stringify(message);

      if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(data);
      } else {
        if (this.messageQueue.length < MAX_QUEUE_SIZE) {
          this.messageQueue.push(data);
        }
      }
    }

    on(event, callback) {
      if (!this.listeners[event]) {
        this.listeners[event] = [];
      }
      this.listeners[event].push(callback);
    }

    off(event, callback) {
      if (!this.listeners[event]) return;
      this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
    }

    isConnected() {
      return this.connected;
    }

    // Private

    emit(event, ...args) {
      const handlers = this.listeners[event] || [];
      for (const handler of handlers) {
        try {
          handler(...args);
        } catch (e) {
          console.error(`[QA-Automator WS] Handler error for ${event}:`, e);
        }
      }
    }

    flushQueue() {
      while (this.messageQueue.length > 0 && this.connected) {
        const msg = this.messageQueue.shift();
        this.ws.send(msg);
      }
    }

    scheduleReconnect() {
      if (this.reconnectTimer) return;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, RECONNECT_INTERVAL);
    }
  }

  // Expose globally for content scripts
  window.__qaAutomatorWS = new WSClient();
})();
