/**
 * Centralized logging system for Local Pocket Reader
 * Provides configurable log levels and consistent logging across the extension
 */

(function attachLocalPocketLoggerCore(globalScope) {
  'use strict';

  // Log levels in order of severity
  const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
  };

  // Current log level (can be configured via settings)
  let currentLogLevel = LOG_LEVELS.INFO;

  // Storage key for log level preference
  const LOG_LEVEL_KEY = 'logLevel';

  /**
   * Set the current log level
   * @param {string} level - One of 'debug', 'info', 'warn', 'error', 'none'
   */
  function setLogLevel(level) {
    const normalized = typeof level === 'string' ? level.toUpperCase() : 'INFO';
    if (LOG_LEVELS.hasOwnProperty(normalized)) {
      currentLogLevel = LOG_LEVELS[normalized];
    }
  }

  /**
   * Get the current log level
   * @returns {string} Current log level name
   */
  function getLogLevel() {
    for (const [name, value] of Object.entries(LOG_LEVELS)) {
      if (value === currentLogLevel) return name.toLowerCase();
    }
    return 'info';
  }

  /**
   * Check if a log level should be output
   * @param {number} level - Log level to check
   * @returns {boolean} True if the level should be logged
   */
  function shouldLog(level) {
    return level >= currentLogLevel;
  }

  /**
   * Format log message with context
   * @param {string} prefix - Log prefix (e.g., [Background])
   * @param {string} message - Log message
   * @param {Array} args - Additional arguments
   * @returns {Array} Formatted arguments for console
   */
  function formatMessage(prefix, message, args) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `${timestamp} ${prefix} ${message}`;
    return [formattedMessage, ...args];
  }

  /**
   * Log debug message
   * @param {string} context - Context identifier (e.g., 'Background', 'ContentScript')
   * @param {string} message - Log message
   * @param {...any} args - Additional arguments
   */
  function debug(context, message, ...args) {
    if (shouldLog(LOG_LEVELS.DEBUG)) {
      const formatted = formatMessage(`[${context}]`, message, args);
      console.log(...formatted);
    }
  }

  /**
   * Log info message
   * @param {string} context - Context identifier
   * @param {string} message - Log message
   * @param {...any} args - Additional arguments
   */
  function info(context, message, ...args) {
    if (shouldLog(LOG_LEVELS.INFO)) {
      const formatted = formatMessage(`[${context}]`, message, args);
      console.info(...formatted);
    }
  }

  /**
   * Log warning message
   * @param {string} context - Context identifier
   * @param {string} message - Log message
   * @param {...any} args - Additional arguments
   */
  function warn(context, message, ...args) {
    if (shouldLog(LOG_LEVELS.WARN)) {
      const formatted = formatMessage(`[${context}]`, message, args);
      console.warn(...formatted);
    }
  }

  /**
   * Log error message
   * @param {string} context - Context identifier
   * @param {string} message - Log message
   * @param {...any} args - Additional arguments
   */
  function error(context, message, ...args) {
    if (shouldLog(LOG_LEVELS.ERROR)) {
      const formatted = formatMessage(`[${context}]`, message, args);
      console.error(...formatted);
    }
  }

  /**
   * Load log level from storage
   * @param {Function} storageGet - Storage get function
   */
  async function loadLogLevelFromStorage(storageGet) {
    try {
      if (typeof storageGet === 'function') {
        const result = await storageGet(LOG_LEVEL_KEY);
        if (result && result[LOG_LEVEL_KEY]) {
          setLogLevel(result[LOG_LEVEL_KEY]);
        }
      }
    } catch (err) {
      // Use default level if storage fails
    }
  }

  /**
   * Save log level to storage
   * @param {Function} storageSet - Storage set function
   */
  async function saveLogLevelToStorage(storageSet) {
    try {
      if (typeof storageSet === 'function') {
        await storageSet({ [LOG_LEVEL_KEY]: getLogLevel() });
      }
    } catch (err) {
      error('LoggerCore', 'Failed to save log level:', err);
    }
  }

  const api = {
    LOG_LEVELS,
    setLogLevel,
    getLogLevel,
    debug,
    info,
    warn,
    error,
    loadLogLevelFromStorage,
    saveLogLevelToStorage
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (globalScope && typeof globalScope === 'object') {
    globalScope.LocalPocketLoggerCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
