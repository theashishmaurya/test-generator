// Create a DevTools panel for QA Test Automator
chrome.devtools.panels.create(
  'QA Automator',
  null,
  'devtools/panel.html',
  (panel) => {
    // Panel created
  }
);
