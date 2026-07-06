/**
 * Storage manager with batching and caching for Local Pocket Reader
 * Provides optimized storage operations to reduce I/O overhead
 */

(function attachLocalPocketStorageManagerCore(globalScope) {
  'use strict';

  /**
   * Storage manager with batching and caching
   */
  class StorageManager {
    constructor(options = {}) {
      this.api = options.api || (typeof browser !== 'undefined' ? browser : chrome);
      this.cache = new Map();
      this.cacheEnabled = options.cacheEnabled !== false;
      this.cacheTTL = options.cacheTTL || 60000; // 1 minute default
      this.pendingBatch = new Map();
      this.batchTimeout = null;
      this.batchDelay = options.batchDelay || 100; // 100ms batch delay
      this.batchEnabled = options.batchEnabled !== false;
    }

    /**
     * Get value from storage with caching
     * @param {string|Array} keys - Keys to get
     * @returns {Promise<Object>} Storage data
     */
    async get(keys) {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      const cached = {};
      const uncached = [];

      // Check cache first
      if (this.cacheEnabled) {
        for (const key of keyArray) {
          const cachedValue = this.cache.get(key);
          if (cachedValue && !this.isCacheExpired(cachedValue)) {
            cached[key] = cachedValue.value;
          } else {
            uncached.push(key);
          }
        }
      } else {
        uncached.push(...keyArray);
      }

      // If all values are cached, return immediately
      if (uncached.length === 0) {
        return cached;
      }

      // Fetch uncached values from storage
      const storageData = await this.storageGet(uncached);

      // Update cache with fetched values
      if (this.cacheEnabled) {
        for (const key of uncached) {
          if (storageData[key] !== undefined) {
            this.cache.set(key, {
              value: storageData[key],
              timestamp: Date.now()
            });
          }
        }
      }

      return { ...cached, ...storageData };
    }

    /**
     * Set value in storage with batching
     * @param {string|Object} keyOrData - Key to set or data object
     * @param {any} value - Value if key is string
     * @param {Object} options - Set options
     * @returns {Promise<void>}
     */
    async set(keyOrData, value, options = {}) {
      const opts = {
        batch: this.batchEnabled,
        skipCache: false,
        ...options
      };

      const data = typeof keyOrData === 'string' 
        ? { [keyOrData]: value }
        : keyOrData;

      // Update cache immediately if not skipped
      if (this.cacheEnabled && !opts.skipCache) {
        for (const [key, val] of Object.entries(data)) {
          this.cache.set(key, {
            value: val,
            timestamp: Date.now()
          });
        }
      }

      // If batching is disabled, set immediately
      if (!opts.batch) {
        return this.storageSet(data);
      }

      // Add to pending batch
      for (const [key, val] of Object.entries(data)) {
        this.pendingBatch.set(key, val);
      }

      // Schedule batch write
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
      }

      // Return a Promise that settles when the batch is flushed.
      // Must handle rejection: if flushBatch() throws, the Promise must
      // reject instead of hanging forever with neither resolve nor reject called.
      return new Promise((resolve, reject) => {
        this.batchTimeout = setTimeout(async () => {
          try {
            await this.flushBatch();
            resolve();
          } catch (err) {
            reject(err);
          }
        }, this.batchDelay);
      });
    }

    /**
     * Remove value from storage
     * @param {string|Array} keys - Keys to remove
     * @returns {Promise<void>}
     */
    async remove(keys) {
      const keyArray = Array.isArray(keys) ? keys : [keys];

      // Remove from cache
      if (this.cacheEnabled) {
        for (const key of keyArray) {
          this.cache.delete(key);
        }
      }

      // Remove from pending batch
      for (const key of keyArray) {
        this.pendingBatch.delete(key);
      }

      return this.storageRemove(keyArray);
    }

    /**
     * Clear all storage
     * @returns {Promise<void>}
     */
    async clear() {
      this.cache.clear();
      this.pendingBatch.clear();
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
        this.batchTimeout = null;
      }
      return this.storageClear();
    }

    /**
     * Flush pending batch to storage
     * @returns {Promise<void>}
     */
    async flushBatch() {
      if (this.pendingBatch.size === 0) {
        return;
      }

      const batchData = Object.fromEntries(this.pendingBatch);
      this.pendingBatch.clear();

      try {
        await this.storageSet(batchData);
      } catch (err) {
        console.error('Storage batch flush error:', err);
        throw err;
      }
    }

    /**
     * Invalidate cache entry
     * @param {string} key - Key to invalidate
     */
    invalidateCache(key) {
      this.cache.delete(key);
    }

    /**
     * Clear all cache
     */
    clearCache() {
      this.cache.clear();
    }

    /**
     * Clear expired cache entries
     */
    clearExpiredCache() {
      for (const [key, cached] of this.cache.entries()) {
        if (this.isCacheExpired(cached)) {
          this.cache.delete(key);
        }
      }
    }

    /**
     * Check if cache entry is expired
     * @param {Object} cached - Cached value object
     * @returns {boolean} True if expired
     */
    isCacheExpired(cached) {
      if (!cached || !cached.timestamp) return true;
      return Date.now() - cached.timestamp > this.cacheTTL;
    }

    /**
     * Low-level storage get (implementation)
     * @param {string|Array} keys - Keys to get
     * @returns {Promise<Object>} Storage data
     */
    async storageGet(keys) {
      if (!this.api || !this.api.storage || !this.api.storage.local) {
        return {};
      }

      return new Promise((resolve) => {
        let done = false;
        const finish = (value) => {
          if (done) return;
          done = true;
          resolve(value && typeof value === 'object' ? value : {});
        };

        try {
          const maybePromise = this.api.storage.local.get(keys, (value) => {
            const err = this.api.runtime && this.api.runtime.lastError;
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
     * Low-level storage set (implementation)
     * @param {Object} data - Data to set
     * @returns {Promise<void>}
     */
    async storageSet(data) {
      if (!this.api || !this.api.storage || !this.api.storage.local) {
        return;
      }

      return new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };

        try {
          const maybePromise = this.api.storage.local.set(data, () => {
            const err = this.api.runtime && this.api.runtime.lastError;
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
     * Low-level storage remove (implementation)
     * @param {string|Array} keys - Keys to remove
     * @returns {Promise<void>}
     */
    async storageRemove(keys) {
      if (!this.api || !this.api.storage || !this.api.storage.local) {
        return;
      }

      return new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };

        try {
          const maybePromise = this.api.storage.local.remove(keys, () => {
            const err = this.api.runtime && this.api.runtime.lastError;
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
     * Low-level storage clear (implementation)
     * @returns {Promise<void>}
     */
    async storageClear() {
      if (!this.api || !this.api.storage || !this.api.storage.local) {
        return;
      }

      return new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };

        try {
          const maybePromise = this.api.storage.local.clear(() => {
            const err = this.api.runtime && this.api.runtime.lastError;
            if (err) {
              console.error('Storage clear error:', err);
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
  }

  // Global storage manager instance
  let globalStorageManager = null;

  /**
   * Get global storage manager instance.
   * NOTE: options are only applied when creating the *first* instance.
   * Subsequent calls with different options will return the existing instance
   * unchanged. Use resetStorageManager() first if you need a fresh instance
   * with different configuration.
   * @param {Object} options - Storage manager options
   * @returns {StorageManager} Global storage manager
   */
  function getStorageManager(options = {}) {
    if (!globalStorageManager) {
      globalStorageManager = new StorageManager(options);
    }
    return globalStorageManager;
  }

  /**
   * Reset global storage manager
   */
  function resetStorageManager() {
    if (globalStorageManager) {
      globalStorageManager.clearCache();
      globalStorageManager = null;
    }
  }

  const api = {
    StorageManager,
    getStorageManager,
    resetStorageManager
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (globalScope && typeof globalScope === 'object') {
    globalScope.LocalPocketStorageManagerCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
