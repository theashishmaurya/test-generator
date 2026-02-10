document.addEventListener('DOMContentLoaded', async () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const idleView = document.getElementById('idleView');
  const recordingView = document.getElementById('recordingView');
  const pausedView = document.getElementById('pausedView');
  const sessionNameInput = document.getElementById('sessionName');
  const sessionsList = document.getElementById('sessionsList');

  // ---- Helpers ----

  function showView(view) {
    idleView.classList.add('hidden');
    recordingView.classList.add('hidden');
    pausedView.classList.add('hidden');
    view.classList.remove('hidden');
  }

  function updateConnectionStatus(connected) {
    if (connected) {
      statusDot.className = 'status-dot connected';
      statusText.textContent = 'Connected to server';
    } else {
      statusDot.className = 'status-dot';
      statusText.textContent = 'Disconnected';
    }
  }

  async function sendMessage(msg) {
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch (e) {
      console.error('sendMessage error:', e);
      return { error: String(e) };
    }
  }

  async function refreshStatus() {
    const status = await sendMessage({ type: 'popup:getStatus' });
    if (!status) return;

    updateConnectionStatus(status.isConnected);

    if (status.isRecording && !status.isPaused) {
      showView(recordingView);
      statusDot.className = 'status-dot recording';
      statusText.textContent = 'Recording...';
    } else if (status.isRecording && status.isPaused) {
      showView(pausedView);
    } else {
      showView(idleView);
    }
  }

  async function loadSessions() {
    try {
      const res = await fetch('http://localhost:3333/api/sessions');
      if (!res.ok) return;
      const sessions = await res.json();

      sessionsList.innerHTML = '';
      for (const session of sessions.slice(0, 5)) {
        const item = document.createElement('div');
        item.className = 'session-item';

        const date = new Date(session.startedAt);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        item.innerHTML = `
          <div>
            <div class="session-name">${escapeHtml(session.name)}</div>
            <div class="session-meta">${timeStr} · ${session.interactionCount} events</div>
          </div>
          <span class="session-status ${session.status}">${session.status}</span>
        `;
        sessionsList.appendChild(item);
      }
    } catch {
      sessionsList.innerHTML = '<div class="session-meta">Server not reachable</div>';
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Button Handlers ----

  document.getElementById('startBtn').addEventListener('click', async () => {
    const name = sessionNameInput.value.trim();
    const result = await sendMessage({
      type: 'popup:startRecording',
      sessionName: name,
    });

    if (result?.error) {
      statusDot.className = 'status-dot';
      statusText.textContent = result.error;
      return;
    }

    showView(recordingView);
    statusDot.className = 'status-dot recording';
    statusText.textContent = 'Recording...';
  });

  document.getElementById('pauseBtn').addEventListener('click', async () => {
    await sendMessage({ type: 'popup:pauseRecording' });
    showView(pausedView);
  });

  document.getElementById('resumeBtn').addEventListener('click', async () => {
    await sendMessage({ type: 'popup:resumeRecording' });
    showView(recordingView);
  });

  document.getElementById('stopBtn').addEventListener('click', async () => {
    await sendMessage({ type: 'popup:stopRecording' });
    showView(idleView);
    statusDot.className = 'status-dot connected';
    statusText.textContent = 'Connected to server';
    loadSessions();
  });

  document.getElementById('stopBtn2').addEventListener('click', async () => {
    await sendMessage({ type: 'popup:stopRecording' });
    showView(idleView);
    statusDot.className = 'status-dot connected';
    statusText.textContent = 'Connected to server';
    loadSessions();
  });

  // ---- Init ----
  await refreshStatus();
  loadSessions();
});
