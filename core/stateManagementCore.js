/**
 * Centralized state management for Local Pocket Reader
 * Provides consistent state updates, caching, and change notifications
 */

(function attachLocalPocketStateManagementCore(globalScope) {
  'use strict';

  /**
   * State store with change notifications
   */
  class StateStore {
    constructor(initialState = {}) {
      this.state = { ...initialState };
      this.listeners = new Map();
      this.listenerId = 0;
    }

    /**
     * Get current state
     * @param {string} key - Optional key to get specific value
     * @returns {any} State value or entire state
     */
    get(key) {
      if (key) {
        return this.state[key];
      }
      return { ...this.state };
    }

    /**
     * Set state value(s)
     * @param {string|Object} keyOrState - Key to set or state object
     * @param {any} value - Value if key is string
     * @param {Object} options - Options for update
     */
    set(keyOrState, value, options = {}) {
      const opts = {
        notify: true,
        merge: true,
        ...options
      };

      let changes = {};

      if (typeof keyOrState === 'string') {
        // Single key update
        if (this.state[keyOrState] !== value) {
          changes[keyOrState] = { oldValue: this.state[keyOrState], newValue: value };
          this.state[keyOrState] = value;
        }
      } else if (typeof keyOrState === 'object') {
        // Object update
        if (opts.merge) {
          for (const key of Object.keys(keyOrState)) {
            if (this.state[key] !== keyOrState[key]) {
              changes[key] = { oldValue: this.state[key], newValue: keyOrState[key] };
              this.state[key] = keyOrState[key];
            }
          }
        } else {
          // Replace entire state
          for (const key of Object.keys(this.state)) {
            if (!(key in keyOrState)) {
              changes[key] = { oldValue: this.state[key], newValue: undefined };
            }
          }
          for (const key of Object.keys(keyOrState)) {
            if (this.state[key] !== keyOrState[key]) {
              changes[key] = { oldValue: this.state[key], newValue: keyOrState[key] };
            }
          }
          this.state = { ...keyOrState };
        }
      }

      // Notify listeners if there are changes and notification is enabled
      if (opts.notify && Object.keys(changes).length > 0) {
        this.notify(changes);
      }

      return changes;
    }

    /**
     * Subscribe to state changes
     * @param {Function} listener - Listener function
     * @param {string|Array} keys - Keys to listen to (empty = all keys)
     * @returns {Function} Unsubscribe function
     */
    subscribe(listener, keys = []) {
      const keyList = Array.isArray(keys) ? keys : [keys];
      const id = ++this.listenerId;
      this.listeners.set(id, { listener, keys: keyList });
      return () => this.unsubscribe(id);
    }

    /**
     * Unsubscribe from state changes
     * @param {number} id - Listener ID
     */
    unsubscribe(id) {
      this.listeners.delete(id);
    }

    /**
     * Notify listeners of changes
     * @param {Object} changes - Changes that occurred
     */
    notify(changes) {
      const changedKeys = Object.keys(changes);
      
      for (const [id, { listener, keys }] of this.listeners.entries()) {
        // Check if listener should be notified
        const shouldNotify = keys.length === 0 || 
          keys.some(key => changedKeys.includes(key));
        
        if (shouldNotify && typeof listener === 'function') {
          try {
            listener(changes, this.state);
          } catch (err) {
            console.error('State listener error:', err);
          }
        }
      }
    }

    /**
     * Reset state to initial or provided state
     * @param {Object} newState - New state (optional)
     */
    reset(newState = {}) {
      const oldState = { ...this.state };
      this.state = { ...newState };
      const changes = {};
      
      for (const key of Object.keys(oldState)) {
        changes[key] = { oldValue: oldState[key], newValue: this.state[key] };
      }
      
      this.notify(changes);
    }

    /**
     * Clear all listeners
     */
    clearListeners() {
      this.listeners.clear();
    }
  }

  /**
   * Cached value with TTL support
   */
  class CachedValue {
    constructor(value, ttl = 60000) {
      this.value = value;
      this.timestamp = Date.now();
      this.ttl = ttl;
    }

    isExpired() {
      return Date.now() - this.timestamp > this.ttl;
    }

    refresh(value) {
      this.value = value;
      this.timestamp = Date.now();
    }
  }

  /**
   * Cache manager for expensive operations
   */
  class CacheManager {
    constructor(defaultTtl = 60000) {
      this.cache = new Map();
      this.defaultTtl = defaultTtl;
    }

    /**
     * Get cached value
     * @param {string} key - Cache key
     * @returns {any} Cached value or undefined
     */
    get(key) {
      const cached = this.cache.get(key);
      if (!cached) return undefined;
      
      if (cached.isExpired()) {
        this.cache.delete(key);
        return undefined;
      }
      
      return cached.value;
    }

    /**
     * Set cached value
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} ttl - Time to live in ms
     */
    set(key, value, ttl) {
      const cacheTtl = ttl !== undefined ? ttl : this.defaultTtl;
      this.cache.set(key, new CachedValue(value, cacheTtl));
    }

    /**
     * Get or set cached value with factory function
     * @param {string} key - Cache key
     * @param {Function} factory - Function to generate value
     * @param {number} ttl - Time to live in ms
     * @returns {any} Cached or generated value
     */
    async getOrSet(key, factory, ttl) {
      const cached = this.get(key);
      if (cached !== undefined) {
        return cached;
      }
      
      const value = await factory();
      this.set(key, value, ttl);
      return value;
    }

    /**
     * Invalidate cache entry
     * @param {string} key - Cache key
     */
    invalidate(key) {
      this.cache.delete(key);
    }

    /**
     * Clear all cache
     */
    clear() {
      this.cache.clear();
    }

    /**
     * Clear expired entries
     */
    clearExpired() {
      for (const [key, cached] of this.cache.entries()) {
        if (cached.isExpired()) {
          this.cache.delete(key);
        }
      }
    }
  }

  // Global state instances
  const globalState = new StateStore();
  const globalCache = new CacheManager();

  /**
   * Get global state store
   * @returns {StateStore} Global state store
   */
  function getStateStore() {
    return globalState;
  }

  /**
   * Get global cache manager
   * @returns {CacheManager} Global cache manager
   */
  function getCacheManager() {
    return globalCache;
  }

  /**
   * Create a namespaced state store
   * @param {string} namespace - Namespace prefix
   * @param {Object} initialState - Initial state
   * @returns {StateStore} Namespaced state store
   */
  function createNamespacedStore(namespace, initialState = {}) {
    const store = new StateStore(initialState);
    
    // Wrap set to add namespace prefix to changes
    const originalSet = store.set.bind(store);
    store.set = (keyOrState, value, options) => {
      const changes = originalSet(keyOrState, value, options);
      // Add namespace to change notifications
      if (typeof changes === 'object') {
        return Object.fromEntries(
          Object.entries(changes).map(([k, v]) => [`${namespace}.${k}`, v])
        );
      }
      return changes;
    };
    
    return store;
  }

  const api = {
    StateStore,
    CachedValue,
    CacheManager,
    getStateStore,
    getCacheManager,
    createNamespacedStore
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (globalScope && typeof globalScope === 'object') {
    globalScope.LocalPocketStateManagementCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
