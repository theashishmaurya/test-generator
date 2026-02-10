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

// Send message to content script in active tab
async function sendToContentScript(message) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      return await chrome.tabs.sendMessage(tab.id, message);
    }
  } catch (e) {
    console.error('[QA-Automator SW] sendToContentScript error:', e);
  }
  return null;
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

      // Ask content script to connect and start
      const response = await sendToContentScript({ action: 'getStatus' });
      if (!response?.connected) {
        return { error: 'Not connected to server. Is the server running?' };
      }

      // Send session start event via content script's WebSocket
      // The content script will handle this - we need to pass through
      currentSessionId = `pending_${Date.now()}`;
      isRecording = true;
      isPaused = false;
      updateBadge();

      // Tell content script to start recording
      const result = await sendToContentScript({
        action: 'startRecording',
        sessionId: currentSessionId,
        sessionName,
        url,
      });

      return { success: true, sessionId: currentSessionId };
    }

    case 'popup:stopRecording': {
      isRecording = false;
      isPaused = false;
      updateBadge();

      await sendToContentScript({ action: 'stopRecording' });
      const oldSessionId = currentSessionId;
      currentSessionId = null;

      return { success: true, sessionId: oldSessionId };
    }

    case 'popup:pauseRecording': {
      isPaused = true;
      updateBadge();
      await sendToContentScript({ action: 'pauseRecording' });
      return { success: true };
    }

    case 'popup:resumeRecording': {
      isPaused = false;
      updateBadge();
      await sendToContentScript({ action: 'resumeRecording' });
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
      // Handle server messages (acks, session created, etc.)
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
