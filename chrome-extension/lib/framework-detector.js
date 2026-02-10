/**
 * Framework Detector: Detects React and its version on the current page.
 */
(function () {
  'use strict';

  function detectReact() {
    // Method 1: React DevTools global hook
    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      const renderers = window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers;
      if (renderers && renderers.size > 0) {
        return { detected: true, method: 'devtools-hook', version: getReactVersion() };
      }
    }

    // Method 2: Check for React Fiber keys on DOM elements
    const testEl = document.querySelector('[data-reactroot], #root, #app');
    if (testEl) {
      const fiberKey = Object.keys(testEl).find(
        (key) => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
      );
      if (fiberKey) {
        return { detected: true, method: 'fiber-key', version: getReactVersion() };
      }
    }

    // Method 3: Search any element for Fiber keys
    const allElements = document.querySelectorAll('*');
    for (let i = 0; i < Math.min(allElements.length, 50); i++) {
      const keys = Object.keys(allElements[i]);
      const hasFiber = keys.some(
        (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
      );
      if (hasFiber) {
        return { detected: true, method: 'dom-scan', version: getReactVersion() };
      }
    }

    return { detected: false };
  }

  function getReactVersion() {
    try {
      // React exposes version on the devtools hook
      const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (hook && hook.renderers) {
        for (const [, renderer] of hook.renderers) {
          if (renderer.version) return renderer.version;
        }
      }
    } catch {
      // ignore
    }
    return 'unknown';
  }

  window.__qaFrameworkDetector = { detectReact, getReactVersion };
})();
