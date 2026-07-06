/**
 * URL indexing with incremental updates for Local Pocket Reader
 * Optimized deduplication checking without full cache rebuilds
 */

(function attachLocalPocketUrlIndexingCore(globalScope) {
  'use strict';

  /**
   * URL index with incremental update support
   */
  class UrlIndex {
    constructor(options = {}) {
      this.index = new Map();
      this.itemToUrls = new Map(); // Track URLs for each item
      this.compareFn = options.compareFn || null;
      this.built = false;
      // Store initial items so setCompareFn() can trigger a deferred rebuild
      // when the compare function arrives after construction (B3 fix).
      this._initialItems = Array.isArray(options.initialItems) ? options.initialItems : null;
    }

    /**
     * Set the URL comparison function.
     * If items were previously loaded, callers should call rebuild(items)
     * manually after setting the compare function. This method only triggers
     * an automatic rebuild when it has a reference to the current items via
     * the options.initialItems property passed to the constructor.
     * @param {Function} fn - Comparison function that returns Set of URL candidates
     */
    setCompareFn(fn) {
      this.compareFn = fn;
      // B3 fix: do NOT call rebuild() here without items — rebuild(undefined)
      // would silently fail (Array.isArray(undefined) === false) and leave the
      // index in a permanently unbuilt state. Callers must pass items explicitly.
      // If constructor was given initialItems, rebuild with those now.
      if (!this.built && this.compareFn && this._initialItems) {
        this.rebuild(this._initialItems);
      }
    }

    /**
     * Build index from items (full rebuild)
     * @param {Array} items - Array of items to index
     */
    rebuild(items) {
      this.index.clear();
      this.itemToUrls.clear();

      if (!Array.isArray(items) || !this.compareFn) {
        this.built = false;
        return;
      }

      // Update cached initial items so a subsequent setCompareFn() call can
      // also rebuild correctly if needed.
      this._initialItems = items;

      for (const item of items) {
        if (!item || !item.url) continue;
        this.addItem(item);
      }

      this.built = true;
    }

    /**
     * Add item to index (incremental)
     * @param {Object} item - Item to add
     */
    addItem(item) {
      if (!item || !item.url || !this.compareFn) return;

      const candidates = this.compareFn(item.url);
      if (!candidates || candidates.size === 0) return;

      const urls = [];
      for (const candidate of candidates) {
        this.index.set(candidate, item.id);
        urls.push(candidate);
      }

      this.itemToUrls.set(item.id, urls);
    }

    /**
     * Remove item from index (incremental)
     * @param {string} itemId - Item ID to remove
     */
    removeItem(itemId) {
      const urls = this.itemToUrls.get(itemId);
      if (!urls) return;

      for (const url of urls) {
        this.index.delete(url);
      }

      this.itemToUrls.delete(itemId);
    }

    /**
     * Update item in index (incremental)
     * @param {Object} item - Item to update
     */
    updateItem(item) {
      if (!item || !item.id) return;

      // Remove old URLs
      this.removeItem(item.id);

      // Add new URLs
      this.addItem(item);
    }

    /**
     * Check if URL is saved
     * @param {string} url - URL to check
     * @returns {string|null} Item ID if saved, null otherwise
     */
    isUrlSaved(url) {
      if (!url || !this.compareFn) return null;

      const candidates = this.compareFn(url);
      if (!candidates || candidates.size === 0) return null;

      for (const candidate of candidates) {
        const itemId = this.index.get(candidate);
        if (itemId) return itemId;
      }

      return null;
    }

    /**
     * Get item ID by URL
     * @param {string} url - URL to look up
     * @returns {string|null} Item ID or null
     */
    getItemId(url) {
      return this.isUrlSaved(url);
    }

    /**
     * Clear index
     */
    clear() {
      this.index.clear();
      this.itemToUrls.clear();
      this.built = false;
    }

    /**
     * Get index size
     * @returns {number} Number of indexed URLs
     */
    size() {
      return this.index.size;
    }

    /**
     * Check if index is built
     * @returns {boolean} True if built
     */
    isBuilt() {
      return this.built;
    }
  }

  // Global URL index instance
  let globalUrlIndex = null;

  /**
   * Get global URL index instance
   * @param {Object} options - Index options
   * @returns {UrlIndex} Global URL index
   */
  function getUrlIndex(options = {}) {
    if (!globalUrlIndex) {
      globalUrlIndex = new UrlIndex(options);
    }
    return globalUrlIndex;
  }

  /**
   * Reset global URL index
   */
  function resetUrlIndex() {
    if (globalUrlIndex) {
      globalUrlIndex.clear();
      globalUrlIndex = null;
    }
  }

  /**
   * Create a namespaced URL index
   * @param {Object} options - Index options
   * @returns {UrlIndex} New URL index instance
   */
  function createUrlIndex(options = {}) {
    return new UrlIndex(options);
  }

  const api = {
    UrlIndex,
    getUrlIndex,
    resetUrlIndex,
    createUrlIndex
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (globalScope && typeof globalScope === 'object') {
    globalScope.LocalPocketUrlIndexingCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
