/**
 * Sourcemap Resolver: Fetches and parses sourcemaps to resolve bundled
 * positions back to original source file locations.
 *
 * Uses the Mozilla source-map library (loaded as a global if available),
 * otherwise falls back to a basic inline sourcemap parser.
 */
(function () {
  'use strict';

  const sourcemapCache = new Map();
  const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

  /**
   * Resolve a bundled position to original source.
   * @param {string} bundledUrl - URL of the bundled JS file
   * @param {number} line - 1-based line in bundled file
   * @param {number} column - 0-based column in bundled file
   * @returns {Promise<{source: string, line: number, column: number, name: string|null} | null>}
   */
  async function resolve(bundledUrl, line, column) {
    try {
      const consumer = await getSourceMapConsumer(bundledUrl);
      if (!consumer) return null;

      const pos = consumer.originalPositionFor({ line, column });
      if (!pos || !pos.source) return null;

      // Clean up Webpack prefixes
      let source = pos.source;
      source = source.replace(/^webpack:\/\/\//, '');
      source = source.replace(/^webpack:\/\/[^/]*\//, '');
      source = source.replace(/^\.\//g, '');

      return {
        source,
        line: pos.line,
        column: pos.column,
        name: pos.name,
      };
    } catch (e) {
      console.warn('[QA-Automator] Sourcemap resolve error:', e);
      return null;
    }
  }

  async function getSourceMapConsumer(bundledUrl) {
    // Check cache
    const cached = sourcemapCache.get(bundledUrl);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      return cached.consumer;
    }

    const rawMap = await fetchSourceMap(bundledUrl);
    if (!rawMap) return null;

    // Use Mozilla source-map library if available
    if (typeof sourceMap !== 'undefined' && sourceMap.SourceMapConsumer) {
      const consumer = await new sourceMap.SourceMapConsumer(rawMap);
      sourcemapCache.set(bundledUrl, { consumer, time: Date.now() });
      return consumer;
    }

    // Basic fallback: parse the mappings manually (limited)
    const consumer = createBasicConsumer(rawMap);
    sourcemapCache.set(bundledUrl, { consumer, time: Date.now() });
    return consumer;
  }

  async function fetchSourceMap(bundledUrl) {
    try {
      // First, try to get the sourcemap URL from the bundled file
      const response = await fetch(bundledUrl);
      const text = await response.text();

      // Check for inline sourcemap
      const inlineMatch = text.match(
        /\/\/[#@]\s*sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,(.+)$/m
      );
      if (inlineMatch) {
        const decoded = atob(inlineMatch[1]);
        return JSON.parse(decoded);
      }

      // Check for external sourcemap URL
      const urlMatch = text.match(/\/\/[#@]\s*sourceMappingURL=(\S+)$/m);
      if (urlMatch) {
        let mapUrl = urlMatch[1];
        if (!mapUrl.startsWith('http')) {
          // Relative URL
          const base = bundledUrl.substring(0, bundledUrl.lastIndexOf('/') + 1);
          mapUrl = base + mapUrl;
        }
        const mapResponse = await fetch(mapUrl);
        return await mapResponse.json();
      }

      // Check X-SourceMap header
      const headerMap = response.headers.get('X-SourceMap') || response.headers.get('SourceMap');
      if (headerMap) {
        let mapUrl = headerMap;
        if (!mapUrl.startsWith('http')) {
          const base = bundledUrl.substring(0, bundledUrl.lastIndexOf('/') + 1);
          mapUrl = base + mapUrl;
        }
        const mapResponse = await fetch(mapUrl);
        return await mapResponse.json();
      }
    } catch (e) {
      console.warn('[QA-Automator] Failed to fetch sourcemap for', bundledUrl, e);
    }
    return null;
  }

  /**
   * Basic sourcemap consumer fallback when source-map library isn't available.
   * Only supports sources list lookup, not full VLQ mapping resolution.
   */
  function createBasicConsumer(rawMap) {
    return {
      originalPositionFor({ line, column }) {
        // Without full VLQ decoding, return the first source as a best guess
        if (rawMap.sources && rawMap.sources.length > 0) {
          return {
            source: rawMap.sources[0],
            line,
            column,
            name: null,
          };
        }
        return { source: null, line: null, column: null, name: null };
      },
    };
  }

  function clearCache() {
    sourcemapCache.clear();
  }

  window.__qaSourcemapResolver = { resolve, clearCache };
})();
