/**
 * Content Script: Captures user interactions on the page and sends them
 * to the local server via WebSocket.
 */
(function () {
  'use strict';

  let recording = false;
  let paused = false;
  let sessionId = null;
  let interactionCounter = 0;
  let overlay = null;

  const ws = window.__qaAutomatorWS;
  const tracer = window.__qaElementTracer;

  // Generate unique interaction ID
  function genId() {
    return `int_${Date.now()}_${++interactionCounter}`;
  }

  // Build interaction data from a DOM event
  function buildInteraction(type, event, extra = {}) {
    const element = event.target || event.srcElement;
    if (!element || !element.tagName) return null;

    const elementInfo = tracer.traceElement(element);

    return {
      id: genId(),
      type,
      timestamp: Date.now(),
      url: window.location.href,
      element: elementInfo,
      coordinates: event.clientX != null ? { x: event.clientX, y: event.clientY } : undefined,
      ...extra,
    };
  }

  function sendInteraction(interaction) {
    if (!interaction || !recording || paused || !sessionId) return;

    ws.send({
      type: 'interaction',
      sessionId,
      data: interaction,
      timestamp: Date.now(),
    });
  }

  // ---- Event Handlers ----

  function onClickCapture(event) {
    const interaction = buildInteraction('click', event);
    sendInteraction(interaction);
  }

  function onDblClickCapture(event) {
    const interaction = buildInteraction('dblclick', event);
    sendInteraction(interaction);
  }

  function onInputCapture(event) {
    const interaction = buildInteraction('input', event, {
      value: event.target.value,
    });
    sendInteraction(interaction);
  }

  function onChangeCapture(event) {
    const interaction = buildInteraction('change', event, {
      value: event.target.value,
    });
    sendInteraction(interaction);
  }

  function onSubmitCapture(event) {
    const interaction = buildInteraction('submit', event);
    sendInteraction(interaction);
  }

  function onKeydownCapture(event) {
    // Only capture special keys (Enter, Escape, Tab, etc.)
    const specialKeys = ['Enter', 'Escape', 'Tab', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!specialKeys.includes(event.key)) return;

    const interaction = buildInteraction('keydown', event, {
      key: event.key,
    });
    sendInteraction(interaction);
  }

  // Navigation tracking (SPA)
  let lastUrl = window.location.href;
  function checkNavigation() {
    if (window.location.href !== lastUrl) {
      const oldUrl = lastUrl;
      lastUrl = window.location.href;

      if (!recording || paused || !sessionId) return;

      ws.send({
        type: 'interaction',
        sessionId,
        data: {
          id: genId(),
          type: 'navigation',
          timestamp: Date.now(),
          url: window.location.href,
          element: {
            tagName: 'window',
            cssSelector: '',
            attributes: {},
          },
          metadata: { fromUrl: oldUrl },
        },
        timestamp: Date.now(),
      });
    }
  }

  // Monkey-patch pushState/replaceState for SPA navigation detection
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    checkNavigation();
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    checkNavigation();
  };

  window.addEventListener('popstate', checkNavigation);

  // ---- Recording Indicator Overlay ----

  function showRecordingOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = '__qa-automator-overlay';
    overlay.style.cssText =
      'position:fixed;top:0;left:0;right:0;height:3px;background:red;z-index:2147483647;pointer-events:none;opacity:0.8;';
    document.body.appendChild(overlay);
  }

  function hideRecordingOverlay() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
  }

  // ---- Attach/Detach Listeners ----

  function attachListeners() {
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('dblclick', onDblClickCapture, true);
    document.addEventListener('input', onInputCapture, true);
    document.addEventListener('change', onChangeCapture, true);
    document.addEventListener('submit', onSubmitCapture, true);
    document.addEventListener('keydown', onKeydownCapture, true);
  }

  function detachListeners() {
    document.removeEventListener('click', onClickCapture, true);
    document.removeEventListener('dblclick', onDblClickCapture, true);
    document.removeEventListener('input', onInputCapture, true);
    document.removeEventListener('change', onChangeCapture, true);
    document.removeEventListener('submit', onSubmitCapture, true);
    document.removeEventListener('keydown', onKeydownCapture, true);
  }

  // ---- Wait for server to assign session ID ----

  function waitForSessionId(timeoutMs = 5000) {
    return new Promise((resolve) => {
      // If we already have a real session ID, return immediately
      if (sessionId && !sessionId.startsWith('pending_')) {
        resolve(sessionId);
        return;
      }

      const handler = (data) => {
        if (data.type === 'session:created' && data.sessionId) {
          sessionId = data.sessionId;
          ws.off('message', handler);
          resolve(sessionId);
        }
      };
      ws.on('message', handler);

      // Timeout fallback
      setTimeout(() => {
        ws.off('message', handler);
        resolve(sessionId);
      }, timeoutMs);
    });
  }

  // ---- Message Handling from Extension ----

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'ensureConnected':
        // Try to connect if not already connected
        if (!ws.isConnected()) {
          ws.connect();
        }
        sendResponse({ connected: ws.isConnected() });
        break;

      case 'startRecording':
        // Send session:start to server via WebSocket
        ws.send({
          type: 'session:start',
          sessionName: message.sessionName || '',
          url: message.url || window.location.href,
          timestamp: Date.now(),
        });

        // Set a temporary session ID, will be replaced when server responds
        sessionId = `pending_${Date.now()}`;
        recording = true;
        paused = false;
        interactionCounter = 0;
        attachListeners();
        showRecordingOverlay();

        // Wait for real session ID from server, then respond
        waitForSessionId().then((id) => {
          sendResponse({ success: true, sessionId: id });
        });
        return true; // keep channel open for async response

      case 'stopRecording':
        // Send session:stop to server
        if (sessionId) {
          ws.send({
            type: 'session:stop',
            sessionId,
            timestamp: Date.now(),
          });
        }
        recording = false;
        paused = false;
        detachListeners();
        hideRecordingOverlay();
        sendResponse({ success: true });
        break;

      case 'pauseRecording':
        if (sessionId) {
          ws.send({
            type: 'session:pause',
            sessionId,
            timestamp: Date.now(),
          });
        }
        paused = true;
        sendResponse({ success: true });
        break;

      case 'resumeRecording':
        if (sessionId) {
          ws.send({
            type: 'session:resume',
            sessionId,
            timestamp: Date.now(),
          });
        }
        paused = false;
        sendResponse({ success: true });
        break;

      case 'getStatus':
        sendResponse({ recording, paused, sessionId, connected: ws.isConnected() });
        break;

      default:
        sendResponse({ error: 'Unknown action' });
    }
    return true;
  });

  // Auto-connect WebSocket
  ws.connect();
  ws.on('connected', () => {
    chrome.runtime.sendMessage({ type: 'ws:connected' }).catch(() => {});
  });
  ws.on('disconnected', () => {
    chrome.runtime.sendMessage({ type: 'ws:disconnected' }).catch(() => {});
  });
  ws.on('message', (data) => {
    // Update session ID if server created session
    if (data.type === 'session:created' && data.sessionId) {
      sessionId = data.sessionId;
    }
    chrome.runtime.sendMessage({ type: 'ws:message', data }).catch(() => {});
  });
})();
