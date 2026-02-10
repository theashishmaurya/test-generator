// DevTools panel - will be fully implemented in Milestone 7
const eventLog = document.getElementById('eventLog');

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'ws:message' && message.data) {
    const entry = document.createElement('div');
    entry.className = 'event-entry';
    entry.innerHTML = `
      <span class="event-type">${message.data.type || 'ack'}</span>
      ${message.data.sessionId ? `<span class="event-source"> [${message.data.sessionId.slice(0, 8)}]</span>` : ''}
      <span>${message.data.message || ''}</span>
    `;
    eventLog.prepend(entry);
  }
});
