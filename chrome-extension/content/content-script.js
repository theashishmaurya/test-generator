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

  // ---- Message Handling from Extension ----

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'startRecording':
        recording = true;
        paused = false;
        sessionId = message.sessionId;
        interactionCounter = 0;
        attachListeners();
        showRecordingOverlay();
        sendResponse({ success: true });
        break;

      case 'stopRecording':
        recording = false;
        paused = false;
        detachListeners();
        hideRecordingOverlay();
        sendResponse({ success: true });
        break;

      case 'pauseRecording':
        paused = true;
        sendResponse({ success: true });
        break;

      case 'resumeRecording':
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
    chrome.runtime.sendMessage({ type: 'ws:message', data }).catch(() => {});
  });
})();
