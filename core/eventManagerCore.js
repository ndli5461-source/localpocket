/**
 * Centralized event management for Local Pocket Reader
 * Provides consistent event handling with automatic cleanup
 */

(function attachLocalPocketEventManagerCore(globalScope) {
  'use strict';

  /**
   * Event manager with automatic cleanup
   */
  class EventManager {
    constructor() {
      this.listeners = new Map();
      this.listenerId = 0;
      this.cleanupCallbacks = new Set();
    }

    /**
     * Add event listener with automatic tracking
     * @param {EventTarget} target - Event target (element, window, document)
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     * @param {Object|boolean} options - Event listener options
     * @returns {Function} Cleanup function
     */
    add(target, event, handler, options = false) {
      if (!target || !event || typeof handler !== 'function') {
        return () => {};
      }

      const id = ++this.listenerId;
      const listenerInfo = {
        target,
        event,
        handler,
        options,
        id
      };

      this.listeners.set(id, listenerInfo);
      target.addEventListener(event, handler, options);

      // Return cleanup function
      return () => this.remove(id);
    }

    /**
     * Remove event listener by ID
     * @param {number} id - Listener ID
     */
    remove(id) {
      const listenerInfo = this.listeners.get(id);
      if (!listenerInfo) return;

      const { target, event, handler, options } = listenerInfo;
      target.removeEventListener(event, handler, options);
      this.listeners.delete(id);
    }

    /**
     * Remove all listeners for a target
     * @param {EventTarget} target - Event target
     */
    removeByTarget(target) {
      for (const [id, listenerInfo] of this.listeners.entries()) {
        if (listenerInfo.target === target) {
          this.remove(id);
        }
      }
    }

    /**
     * Remove all listeners for an event type
     * @param {string} event - Event name
     */
    removeByEvent(event) {
      for (const [id, listenerInfo] of this.listeners.entries()) {
        if (listenerInfo.event === event) {
          this.remove(id);
        }
      }
    }

    /**
     * Remove all listeners
     */
    removeAll() {
      for (const [id] of this.listeners.entries()) {
        this.remove(id);
      }
    }

    /**
     * Add cleanup callback
     * @param {Function} callback - Cleanup function
     * @returns {Function} Function to remove the cleanup callback
     */
    addCleanup(callback) {
      if (typeof callback !== 'function') return () => {};

      this.cleanupCallbacks.add(callback);
      return () => this.cleanupCallbacks.delete(callback);
    }

    /**
     * Run all cleanup callbacks and remove all listeners
     */
    cleanup() {
      // Run cleanup callbacks
      for (const callback of this.cleanupCallbacks) {
        try {
          callback();
        } catch (err) {
          console.error('Cleanup callback error:', err);
        }
      }
      this.cleanupCallbacks.clear();

      // Remove all listeners
      this.removeAll();
    }

    /**
     * Get listener count
     * @returns {number} Number of active listeners
     */
    getListenerCount() {
      return this.listeners.size;
    }
  }

  /**
   * Scoped event manager for specific contexts
   */
  class ScopedEventManager {
    constructor(name = 'default') {
      this.name = name;
      this.manager = new EventManager();
      this.active = true;
    }

    /**
     * Add event listener (only if active)
     * @param {EventTarget} target - Event target
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     * @param {Object|boolean} options - Event listener options
     * @returns {Function} Cleanup function
     */
    add(target, event, handler, options = false) {
      if (!this.active) return () => {};

      const cleanup = this.manager.add(target, event, handler, options);

      // Wrap cleanup to check scope
      return () => {
        if (this.active) {
          cleanup();
        }
      };
    }

    /**
     * Remove event listener by ID
     * @param {number} id - Listener ID
     */
    remove(id) {
      if (this.active) {
        this.manager.remove(id);
      }
    }

    /**
     * Deactivate scope (prevents new listeners, keeps existing)
     */
    deactivate() {
      this.active = false;
    }

    /**
     * Activate scope (allows new listeners)
     */
    activate() {
      this.active = true;
    }

    /**
     * Cleanup all listeners in this scope
     */
    cleanup() {
      this.manager.cleanup();
      this.active = false;
    }

    /**
     * Get listener count
     * @returns {number} Number of active listeners
     */
    getListenerCount() {
      return this.manager.getListenerCount();
    }
  }

  // Global event manager instance
  let globalEventManager = null;

  /**
   * Get global event manager instance
   * @returns {EventManager} Global event manager
   */
  function getEventManager() {
    if (!globalEventManager) {
      globalEventManager = new EventManager();
    }
    return globalEventManager;
  }

  /**
   * Reset global event manager
   */
  function resetEventManager() {
    if (globalEventManager) {
      globalEventManager.cleanup();
      globalEventManager = null;
    }
  }

  /**
   * Create a scoped event manager
   * @param {string} name - Scope name
   * @returns {ScopedEventManager} Scoped event manager
   */
  function createScopedEventManager(name = 'default') {
    return new ScopedEventManager(name);
  }

  /**
   * Utility: Add one-time event listener.
   * Uses its own private EventManager instance instead of the global one so
   * that the listener is properly isolated — it won't leak into the global
   * manager and won't survive past the scope that registered it (B8 fix).
   * @param {EventTarget} target - Event target
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   * @param {Object|boolean} options - Event listener options
   * @returns {Function} Cleanup function
   */
  function once(target, event, handler, options = false) {
    if (!target || !event || typeof handler !== 'function') return () => {};

    let called = false;
    let removeListener = null;

    const wrappedHandler = (...args) => {
      if (called) return;
      called = true;
      if (removeListener) removeListener();
      handler(...args);
    };

    // Register directly on the target — no global manager involved.
    target.addEventListener(event, wrappedHandler, options);
    removeListener = () => target.removeEventListener(event, wrappedHandler, options);
    return removeListener;
  }

  /**
   * Utility: Debounce event listener
   * @param {EventTarget} target - Event target
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   * @param {number} delay - Debounce delay in ms
   * @param {Object|boolean} options - Event listener options
   * @returns {Function} Cleanup function
   */
  function debounce(target, event, handler, delay = 300, options = false) {
    const manager = getEventManager();
    let timeout = null;

    const wrappedHandler = (...args) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => handler(...args), delay);
    };

    const cleanup = manager.add(target, event, wrappedHandler, options);
    
    // Enhanced cleanup that also clears timeout
    return () => {
      if (timeout) clearTimeout(timeout);
      cleanup();
    };
  }

  /**
   * Utility: Throttle event listener
   * @param {EventTarget} target - Event target
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   * @param {number} limit - Throttle limit in ms
   * @param {Object|boolean} options - Event listener options
   * @returns {Function} Cleanup function
   */
  function throttle(target, event, handler, limit = 300, options = false) {
    const manager = getEventManager();
    let inThrottle = false;

    const wrappedHandler = (...args) => {
      if (!inThrottle) {
        handler(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };

    return manager.add(target, event, wrappedHandler, options);
  }

  const api = {
    EventManager,
    ScopedEventManager,
    getEventManager,
    resetEventManager,
    createScopedEventManager,
    once,
    debounce,
    throttle
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (globalScope && typeof globalScope === 'object') {
    globalScope.LocalPocketEventManagerCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
