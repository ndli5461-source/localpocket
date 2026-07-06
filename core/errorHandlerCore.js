/**
 * Centralized error handling for Local Pocket Reader
 * Provides user-friendly error messages and recovery strategies
 */

(function attachLocalPocketErrorHandlerCore(globalScope) {
  'use strict';

  // Error categories
  const ERROR_CATEGORIES = {
    NETWORK: 'network',
    STORAGE: 'storage',
    VALIDATION: 'validation',
    PERMISSION: 'permission',
    UNKNOWN: 'unknown'
  };

  // User-friendly error messages
  const ERROR_MESSAGES = {
    network: {
      default: 'Network error occurred. Please check your internet connection.',
      timeout: 'Request timed out. Please try again.',
      offline: 'You appear to be offline. Please check your connection.'
    },
    storage: {
      default: 'Storage error occurred. Your data may not be saved.',
      quota: 'Storage quota exceeded. Please delete some items.',
      access: 'Cannot access storage. Please check permissions.'
    },
    validation: {
      default: 'Invalid input. Please check your input and try again.',
      url: 'Invalid URL. Please enter a valid web address.',
      category: 'Invalid category name.',
      title: 'Invalid title.'
    },
    permission: {
      default: 'Permission denied. Please grant the required permissions.',
      tabs: 'Tab access required. Please grant tab permissions.',
      storage: 'Storage access required. Please grant storage permissions.'
    },
    unknown: {
      default: 'An unexpected error occurred. Please try again.'
    }
  };

  // Recovery strategies
  const RECOVERY_STRATEGIES = {
    network: {
      retry: true,
      checkConnection: true
    },
    storage: {
      retry: true,
      clearCache: false
    },
    validation: {
      retry: false,
      showInput: true
    },
    permission: {
      retry: false,
      requestPermission: true
    },
    unknown: {
      retry: true,
      reload: false
    }
  };

  /**
   * Categorize an error
   * @param {Error} error - Error object
   * @returns {string} Error category
   */
  function categorizeError(error) {
    if (!error) return ERROR_CATEGORIES.UNKNOWN;

    const message = error.message ? error.message.toLowerCase() : '';
    const name = error.name ? error.name.toLowerCase() : '';

    // Network errors
    if (message.includes('network') || message.includes('fetch') || 
        message.includes('timeout') || name.includes('networkerror')) {
      return ERROR_CATEGORIES.NETWORK;
    }

    // Storage errors
    if (message.includes('storage') || message.includes('quota') || 
        message.includes('indexeddb') || name.includes('storageerror')) {
      return ERROR_CATEGORIES.STORAGE;
    }

    // Permission errors
    if (message.includes('permission') || message.includes('access denied') ||
        name.includes('permissionerror')) {
      return ERROR_CATEGORIES.PERMISSION;
    }

    // Validation errors
    if (message.includes('invalid') || message.includes('validation') ||
        name.includes('validationerror')) {
      return ERROR_CATEGORIES.VALIDATION;
    }

    return ERROR_CATEGORIES.UNKNOWN;
  }

  /**
   * Get user-friendly error message
   * @param {Error} error - Error object
   * @param {string} context - Context where error occurred
   * @returns {Object} { message: string, category: string, canRecover: boolean }
   */
  function getUserMessage(error, context = '') {
    const category = categorizeError(error);
    const messages = ERROR_MESSAGES[category] || ERROR_MESSAGES.unknown;
    
    // Determine specific message based on error content
    let message = messages.default;
    const errorMessage = error.message ? error.message.toLowerCase() : '';
    
    if (category === ERROR_CATEGORIES.NETWORK) {
      if (errorMessage.includes('timeout')) {
        message = messages.timeout;
      } else if (errorMessage.includes('offline')) {
        message = messages.offline;
      }
    } else if (category === ERROR_CATEGORIES.STORAGE) {
      if (errorMessage.includes('quota')) {
        message = messages.quota;
      } else if (errorMessage.includes('access')) {
        message = messages.access;
      }
    } else if (category === ERROR_CATEGORIES.VALIDATION) {
      if (errorMessage.includes('url')) {
        message = messages.url;
      } else if (errorMessage.includes('category')) {
        message = messages.category;
      } else if (errorMessage.includes('title')) {
        message = messages.title;
      }
    } else if (category === ERROR_CATEGORIES.PERMISSION) {
      if (errorMessage.includes('tab')) {
        message = messages.tabs;
      } else if (errorMessage.includes('storage')) {
        message = messages.storage;
      }
    }

    // Add context if provided
    if (context) {
      message = `${context}: ${message}`;
    }

    const strategies = RECOVERY_STRATEGIES[category] || RECOVERY_STRATEGIES.unknown;
    const canRecover = strategies.retry || strategies.requestPermission;

    return {
      message,
      category,
      canRecover,
      strategies
    };
  }

  /**
   * Log error with context
   * @param {Error} error - Error object
   * @param {string} context - Context where error occurred
   * @param {Object} logger - Logger instance
   */
  function logError(error, context, logger) {
    if (logger && typeof logger.error === 'function') {
      logger.error(context, error.message, error);
    } else {
      console.error(`[${context}]`, error);
    }
  }

  /**
   * Handle error with user notification
   * @param {Error} error - Error object
   * @param {string} context - Context where error occurred
   * @param {Object} options - Handling options
   * @returns {Object} Error handling result
   */
  function handleError(error, context = '', options = {}) {
    const opts = {
      logger: null,
      notify: false,
      notifyFn: null,
      ...options
    };

    // Log the error
    logError(error, context, opts.logger);

    // Get user-friendly message
    const userMessage = getUserMessage(error, context);

    // Notify user if requested
    if (opts.notify && opts.notifyFn && typeof opts.notifyFn === 'function') {
      try {
        opts.notifyFn(userMessage.message, userMessage.category);
      } catch (notifyErr) {
        console.error('Failed to notify user:', notifyErr);
      }
    }

    return {
      handled: true,
      ...userMessage,
      originalError: error
    };
  }

  /**
   * Create a wrapped function with error handling
   * @param {Function} fn - Function to wrap
   * @param {string} context - Context for error messages
   * @param {Object} options - Error handling options
   * @returns {Function} Wrapped function
   */
  function withErrorHandling(fn, context = '', options = {}) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        const result = handleError(error, context, options);
        throw result; // Re-throw for caller to handle
      }
    };
  }

  /**
   * Safe execute function that never throws
   * @param {Function} fn - Function to execute
   * @param {any} defaultValue - Default value on error
   * @param {string} context - Context for error messages
   * @param {Object} options - Error handling options
   * @returns {any} Result or default value
   */
  function safeExecute(fn, defaultValue, context = '', options = {}) {
    try {
      const result = fn();
      return result instanceof Promise ? result.catch(() => defaultValue) : result;
    } catch (error) {
      handleError(error, context, options);
      return defaultValue;
    }
  }

  /**
   * Create error boundary for async operations
   * @param {Function} operation - Async operation
   * @param {Object} options - Error handling options
   * @returns {Promise} Promise that resolves or rejects with handled error
   */
  async function errorBoundary(operation, options = {}) {
    try {
      return await operation();
    } catch (error) {
      const handled = handleError(error, 'ErrorBoundary', options);
      if (options.throwOnError) {
        throw handled;
      }
      return { error: handled, success: false };
    }
  }

  const api = {
    ERROR_CATEGORIES,
    categorizeError,
    getUserMessage,
    logError,
    handleError,
    withErrorHandling,
    safeExecute,
    errorBoundary
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (globalScope && typeof globalScope === 'object') {
    globalScope.LocalPocketErrorHandlerCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
