/**
 * Element Tracer: Captures detailed info about DOM elements during interactions.
 * Builds CSS selector paths, extracts text content, attributes, ARIA info.
 * Includes React Fiber introspection for source resolution.
 */
(function () {
  'use strict';

  // ---- React Fiber Source Resolution ----

  /**
   * Get the React Fiber node for a DOM element.
   */
  function getFiberNode(element) {
    const key = Object.keys(element).find(
      (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
    );
    return key ? element[key] : null;
  }

  /**
   * Walk up the Fiber tree to find the nearest component with _debugSource.
   */
  function findDebugSource(fiber) {
    let current = fiber;
    while (current) {
      if (current._debugSource) {
        return current._debugSource;
      }
      current = current.return;
    }
    return null;
  }

  /**
   * Get the component name from a Fiber node, handling memo/forwardRef/HOCs.
   */
  function getComponentName(fiber) {
    if (!fiber || !fiber.type) return null;

    const type = fiber.type;

    // Direct function/class component
    if (type.displayName) return type.displayName;
    if (type.name) return type.name;

    // React.memo wraps in { $$typeof, type, compare }
    if (type.$$typeof && type.type) {
      return type.type.displayName || type.type.name || null;
    }

    // forwardRef wraps in { $$typeof, render }
    if (type.render) {
      return type.render.displayName || type.render.name || null;
    }

    return null;
  }

  /**
   * Walk up Fiber tree to find the nearest named component.
   */
  function findNearestComponent(fiber) {
    let current = fiber;
    while (current) {
      const name = getComponentName(current);
      if (name) return { name, fiber: current };
      current = current.return;
    }
    return null;
  }

  /**
   * Build component hierarchy by walking Fiber parents.
   */
  function getComponentHierarchy(fiber) {
    const hierarchy = [];
    let current = fiber;
    while (current) {
      const name = getComponentName(current);
      if (name && !name.startsWith('_')) {
        hierarchy.push(name);
      }
      current = current.return;
    }
    return hierarchy;
  }

  /**
   * Get full React source info for a DOM element.
   */
  function getReactSource(element) {
    const fiber = getFiberNode(element);
    if (!fiber) return null;

    const debugSource = findDebugSource(fiber);
    const component = findNearestComponent(fiber);
    const hierarchy = getComponentHierarchy(fiber);

    const source = {};

    if (debugSource) {
      source.filePath = debugSource.fileName || '';
      source.lineNumber = debugSource.lineNumber || 0;
      source.columnNumber = debugSource.columnNumber || 0;
    }

    if (component) {
      source.componentName = component.name;
    }

    if (hierarchy.length > 0) {
      source.componentHierarchy = hierarchy;
    }

    return Object.keys(source).length > 0 ? source : null;
  }

  function getCssSelector(element) {
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }

    const parts = [];
    let current = element;

    while (current && current !== document.body && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector = `#${CSS.escape(current.id)}`;
        parts.unshift(selector);
        break;
      }

      if (current.className && typeof current.className === 'string') {
        const classes = current.className
          .trim()
          .split(/\s+/)
          .filter((c) => c.length > 0 && !c.startsWith('_') && c.length < 40)
          .slice(0, 3);
        if (classes.length > 0) {
          selector += '.' + classes.map((c) => CSS.escape(c)).join('.');
        }
      }

      // Add nth-child for disambiguation
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (s) => s.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-child(${index})`;
        }
      }

      parts.unshift(selector);
      current = current.parentElement;
    }

    return parts.join(' > ');
  }

  function getAttributes(element) {
    const attrs = {};
    const skip = new Set(['class', 'style', 'id']);

    for (const attr of element.attributes) {
      if (!skip.has(attr.name) && attr.value.length < 200) {
        attrs[attr.name] = attr.value;
      }
    }
    return attrs;
  }

  function getTextContent(element) {
    // Get direct text content (not from children)
    const text = Array.from(element.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent.trim())
      .filter((t) => t.length > 0)
      .join(' ');

    return text.length > 200 ? text.slice(0, 200) + '...' : text;
  }

  function traceElement(element) {
    const info = {
      tagName: element.tagName.toLowerCase(),
      cssSelector: getCssSelector(element),
      textContent: getTextContent(element) || undefined,
      attributes: getAttributes(element),
      existingTestId: element.getAttribute('data-testid') || undefined,
      ariaLabel: element.getAttribute('aria-label') || undefined,
      ariaRole: element.getAttribute('role') || element.closest('[role]')?.getAttribute('role') || undefined,
      innerText: element.innerText ? element.innerText.slice(0, 100) : undefined,
      placeholder: element.getAttribute('placeholder') || undefined,
      inputType: element.tagName === 'INPUT' ? element.type : undefined,
      value: undefined,
    };

    // Capture value for form elements
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)) {
      info.value = element.value;
    }

    return info;
  }

  /**
   * Enhanced traceElement that includes React source resolution.
   */
  function traceElementWithSource(element) {
    const info = traceElement(element);
    const source = getReactSource(element);
    if (source) {
      info.source = source;
    }
    return info;
  }

  // Expose globally
  window.__qaElementTracer = { traceElement: traceElementWithSource, getCssSelector, getReactSource };
})();
