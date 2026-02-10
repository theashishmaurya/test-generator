/**
 * Service Worker: Routes messages between popup, content script, and manages state.
 */

let currentSessionId = null;
let isRecording = false;
let isPaused = false;
let isConnected = false;

// Badge management
function updateBadge() {
  if (isRecording && !isPaused) {
    chrome.action.setBadgeText({ text: 'REC' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
  } else if (isRecording && isPaused) {
    chrome.action.setBadgeText({ text: '||' });
    chrome.action.setBadgeBackgroundColor({ color: '#FFA500' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Content script files in injection order
const CONTENT_SCRIPTS = [
  'lib/websocket-client.js',
  'lib/framework-detector.js',
  'lib/sourcemap-resolver.js',
  'content/element-tracer.js',
  'content/content-script.js',
];

// Inject content scripts into a tab if not already present
async function ensureContentScripts(tabId) {
  try {
    // Try sending a ping — if content script is there, it will respond
    const response = await chrome.tabs.sendMessage(tabId, { action: 'getStatus' });
    if (response) return true; // Already injected
  } catch {
    // Not injected yet — inject now
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: CONTENT_SCRIPTS,
    });
    // Give scripts a moment to initialize and connect WS
    await new Promise((r) => setTimeout(r, 500));
    return true;
  } catch (e) {
    console.error('[QA-Automator SW] Failed to inject content scripts:', e);
    return false;
  }
}

// Send message to content script in active tab (injects if needed)
async function sendToContentScript(message) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;

    // Ensure content scripts are injected first
    await ensureContentScripts(tab.id);

    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (e) {
    console.error('[QA-Automator SW] sendToContentScript error:', e);
  }
  return null;
}

// Wait for WebSocket to connect with retries
async function waitForConnection(maxAttempts = 5, intervalMs = 800) {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await sendToContentScript({ action: 'ensureConnected' });
    if (response?.connected) {
      isConnected = true;
      return true;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((err) => {
    sendResponse({ error: String(err) });
  });
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'popup:startRecording': {
      const sessionName = message.sessionName || `session-${Date.now()}`;
      const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      const url = tab?.url || 'unknown';

      // Ensure content script is there and WS is connected (with retries)
      const connected = await waitForConnection();
      if (!connected) {
        return { error: 'Cannot connect to server. Is it running on localhost:3333?' };
      }

      isRecording = true;
      isPaused = false;
      updateBadge();

      // Tell content script to start recording - it will send session:start via WS
      const result = await sendToContentScript({
        action: 'startRecording',
        sessionName,
        url,
      });

      if (result?.sessionId) {
        currentSessionId = result.sessionId;
      }

      return { success: true, sessionId: currentSessionId };
    }

    case 'popup:stopRecording': {
      isRecording = false;
      isPaused = false;
      updateBadge();

      await sendToContentScript({ action: 'stopRecording', sessionId: currentSessionId });
      const oldSessionId = currentSessionId;
      currentSessionId = null;

      return { success: true, sessionId: oldSessionId };
    }

    case 'popup:pauseRecording': {
      isPaused = true;
      updateBadge();
      await sendToContentScript({ action: 'pauseRecording', sessionId: currentSessionId });
      return { success: true };
    }

    case 'popup:resumeRecording': {
      isPaused = false;
      updateBadge();
      await sendToContentScript({ action: 'resumeRecording', sessionId: currentSessionId });
      return { success: true };
    }

    case 'popup:getStatus': {
      return { isRecording, isPaused, isConnected, sessionId: currentSessionId };
    }

    case 'ws:connected': {
      isConnected = true;
      return { ack: true };
    }

    case 'ws:disconnected': {
      isConnected = false;
      return { ack: true };
    }

    case 'ws:message': {
      const data = message.data;
      if (data.type === 'session:created' && data.sessionId) {
        currentSessionId = data.sessionId;
      }
      return { ack: true };
    }

    default:
      return { error: `Unknown message type: ${message.type}` };
  }
}
