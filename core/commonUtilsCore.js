/**
 * Common utility functions for Local Pocket Reader
 * Provides shared functionality to reduce code duplication
 */

(function attachLocalPocketCommonUtilsCore(globalScope) {
  'use strict';

  // Cache for normalized URLs - LRU-like with max size
  const normalizeUrlCache = new Map();
  const MAX_CACHE_SIZE = 1000;
  // Cache for URL comparison candidates
  const candidatesCache = new Map();
  const MAX_CANDIDATES_CACHE_SIZE = 500;

  /**
   * Get extension API (browser or chrome)
   * @returns {Object} Extension API
   */
  function getExtensionApi() {
    if (typeof browser !== 'undefined') return browser;
    if (typeof chrome !== 'undefined') return chrome;
    return null;
  }

  /**
   * Safe storage.local.get with promise/callback support
   * @param {string|Array} keys - Keys to get
   * @returns {Promise<Object>} Storage data
   */
  function storageGet(keys) {
    const api = getExtensionApi();
    if (!api || !api.storage || !api.storage.local) {
      return Promise.resolve({});
    }

    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        resolve(value && typeof value === 'object' ? value : {});
      };

      try {
        const maybePromise = api.storage.local.get(keys, (value) => {
          const err = api.runtime && api.runtime.lastError;
          if (err) {
            finish({});
            return;
          }
          finish(value);
        });

        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(finish).catch(() => finish({}));
        }
      } catch (err) {
        finish({});
      }
    });
  }

  /**
   * Safe storage.local.set with promise/callback support
   * @param {Object} data - Data to set
   * @returns {Promise<void>}
   */
  function storageSet(data) {
    const api = getExtensionApi();
    if (!api || !api.storage || !api.storage.local) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };

      try {
        const maybePromise = api.storage.local.set(data, () => {
          const err = api.runtime && api.runtime.lastError;
          if (err) {
            console.error('Storage set error:', err);
          }
          finish();
        });

        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(finish).catch(() => finish());
        }
      } catch (err) {
        finish();
      }
    });
  }

  /**
   * Safe storage.local.remove with promise/callback support
   * @param {string|Array} keys - Keys to remove
   * @returns {Promise<void>}
   */
  function storageRemove(keys) {
    const api = getExtensionApi();
    if (!api || !api.storage || !api.storage.local) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };

      try {
        const maybePromise = api.storage.local.remove(keys, () => {
          const err = api.runtime && api.runtime.lastError;
          if (err) {
            console.error('Storage remove error:', err);
          }
          finish();
        });

        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(finish).catch(() => finish());
        }
      } catch (err) {
        finish();
      }
    });
  }

  /**
   * Normalize URL for comparison
   * @param {string} url - URL to normalize
   * @returns {string} Normalized URL
   */
  function normalizeUrl(url) {
    if (typeof url !== 'string') return '';
    const trimmedUrl = url.trim();
    
    // Check cache first
    if (normalizeUrlCache.has(trimmedUrl)) {
      // LRU: Refresh the entry by deleting and re-adding
      const cached = normalizeUrlCache.get(trimmedUrl);
      normalizeUrlCache.delete(trimmedUrl);
      normalizeUrlCache.set(trimmedUrl, cached);
      return cached;
    }
    
    let normalized = trimmedUrl;
    try {
      const parsed = new URL(trimmedUrl);
      
      // Remove tracking parameters
      const trackingParams = [
        'fbclid', 'gclid', 'igshid', 'mc_cid', 'mc_eid', 'mkt_tok',
        'msclkid', 'pp', 'ref', 'si', 'spm', 'vero_conv', 'vero_id',
        'yclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term',
        'utm_content'
      ];
      
      trackingParams.forEach(param => {
        parsed.searchParams.delete(param);
      });
      
      parsed.hash = "";
      
      // Remove trailing slash for consistency
      normalized = parsed.href;
      if (normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }
    } catch (err) {
      // If URL parsing fails, just use trimmed URL
    }
    
    // Cache the result
    if (normalizeUrlCache.size >= MAX_CACHE_SIZE) {
      // Remove oldest entry
      const firstKey = normalizeUrlCache.keys().next().value;
      normalizeUrlCache.delete(firstKey);
    }
    normalizeUrlCache.set(trimmedUrl, normalized);
    
    return normalized;
  }

  /**
   * Build URL comparison candidates (for deduplication)
   * @param {string} url - URL to build candidates for
   * @returns {Set<string>} Set of candidate URLs
   */
  function buildUrlCompareCandidates(url) {
    if (typeof url !== 'string') return new Set();
    const trimmedUrl = url.trim();
    
    // Check cache first
    if (candidatesCache.has(trimmedUrl)) {
      // LRU: Refresh the entry
      const cached = candidatesCache.get(trimmedUrl);
      candidatesCache.delete(trimmedUrl);
      candidatesCache.set(trimmedUrl, cached);
      return new Set(cached); // Return a copy to prevent mutation
    }
    
    const candidates = new Set();
    const normalized = normalizeUrl(trimmedUrl);
    
    if (!normalized) {
      // Cache empty result
      if (candidatesCache.size >= MAX_CANDIDATES_CACHE_SIZE) {
        const firstKey = candidatesCache.keys().next().value;
        candidatesCache.delete(firstKey);
      }
      candidatesCache.set(trimmedUrl, []);
      return candidates;
    }
    
    candidates.add(normalized);
    
    try {
      const parsed = new URL(normalized);
      
      // Add without www
      if (parsed.hostname.startsWith('www.')) {
        const withoutWww = new URL(normalized);
        withoutWww.hostname = parsed.hostname.slice(4);
        candidates.add(withoutWww.href);
      }
      
      // Add with www
      if (!parsed.hostname.startsWith('www.')) {
        const withWww = new URL(normalized);
        withWww.hostname = 'www.' + parsed.hostname;
        candidates.add(withWww.href);
      }
      
      // Add without trailing slash
      const noSlash = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
      candidates.add(noSlash);
      
      // Add with trailing slash
      if (!normalized.endsWith('/')) {
        candidates.add(normalized + '/');
      }
      
      // Add without hash
      const noHash = normalized.split('#')[0];
      candidates.add(noHash);
      
    } catch (err) {
      // If URL parsing fails, just return the normalized URL
    }
    
    // Cache the result (store as array for JSON compatibility)
    const candidatesArray = Array.from(candidates);
    if (candidatesCache.size >= MAX_CANDIDATES_CACHE_SIZE) {
      const firstKey = candidatesCache.keys().next().value;
      candidatesCache.delete(firstKey);
    }
    candidatesCache.set(trimmedUrl, candidatesArray);
    
    return candidates;
  }

  /**
   * Debounce function
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in ms
   * @returns {Function} Debounced function
   */
  function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Throttle function
   * @param {Function} func - Function to throttle
   * @param {number} limit - Time limit in ms
   * @returns {Function} Throttled function
   */
  function throttle(func, limit = 300) {
    let inThrottle;
    return function executedFunction(...args) {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * Generate unique ID
   * @returns {string} Unique ID
   */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Deep clone object
   * @param {any} obj - Object to clone
   * @returns {any} Cloned object
   */
  function deepClone(obj) {
    // Use structuredClone if available (faster)
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(obj);
      } catch (err) {
        // Fallback to manual clone if structuredClone fails
      }
    }
    // Manual fallback for older environments
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => deepClone(item));
    if (obj instanceof Object) {
      const clonedObj = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          clonedObj[key] = deepClone(obj[key]);
        }
      }
      return clonedObj;
    }
  }

  /**
   * Safe JSON parse
   * @param {string} str - JSON string
   * @param {any} defaultValue - Default value on error
   * @returns {any} Parsed object or default
   */
  function safeJsonParse(str, defaultValue = null) {
    try {
      return JSON.parse(str);
    } catch (err) {
      return defaultValue;
    }
  }

  /**
   * Safe JSON stringify
   * @param {any} obj - Object to stringify
   * @param {string} defaultValue - Default value on error
   * @returns {string} JSON string or default
   */
  function safeJsonStringify(obj, defaultValue = '{}') {
    try {
      return JSON.stringify(obj);
    } catch (err) {
      return defaultValue;
    }
  }

  /**
   * Format file size
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size
   */
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Format date
   * @param {Date|string|number} date - Date to format
   * @returns {string} Formatted date
   */
  function formatDate(date) {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    const now = new Date();
    const diff = now - d;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return d.toLocaleDateString();
  }

  const api = {
    getExtensionApi,
    storageGet,
    storageSet,
    storageRemove,
    normalizeUrl,
    buildUrlCompareCandidates,
    debounce,
    throttle,
    generateId,
    deepClone,
    safeJsonParse,
    safeJsonStringify,
    formatFileSize,
    formatDate
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (globalScope && typeof globalScope === 'object') {
    globalScope.LocalPocketCommonUtilsCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
