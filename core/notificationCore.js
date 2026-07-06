/**
 * Notification management for Local Pocket Reader
 * Handles browser notifications for category changes and other events
 */

(function attachLocalPocketNotificationCore(globalScope) {
  'use strict';

  const CATEGORY_NOTIFICATION_ID = 'local-pocket-category';

  /**
   * Show notification
   * @param {Object} api - Extension API (browser or chrome)
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {Object} options - Additional options
   * @returns {Promise<string>} Notification ID
   */
  async function showNotification(api, title, message, options = {}) {
    const notificationOptions = {
      type: 'basic',
      // B11 fix: correct icon filename — icons/icon-96.png, not icon-default-96.png
      iconUrl: options.iconUrl || 'icons/icon-96.png',
      title: title,
      message: message,
      ...options
    };

    return new Promise((resolve, reject) => {
      // B1 fix: use a done-flag to ensure resolve/reject is only called once.
      // In Firefox the API returns a Promise AND fires the callback — without
      // this guard both paths would settle the outer Promise, causing
      // unpredictable side-effects in callers.
      let settled = false;
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        fn(value);
      };

      const maybePromise = api.notifications.create(
        options.notificationId || CATEGORY_NOTIFICATION_ID,
        notificationOptions,
        (notificationId) => {
          const err = api.runtime && api.runtime.lastError;
          if (err) {
            settle(reject, err);
          } else {
            settle(resolve, notificationId);
          }
        }
      );

      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then((id) => settle(resolve, id)).catch((err) => settle(reject, err));
      }
    });
  }

  /**
   * Clear notification
   * @param {Object} api - Extension API
   * @param {string} notificationId - Notification ID
   * @returns {Promise<boolean>} True if cleared
   */
  async function clearNotification(api, notificationId) {
    return new Promise((resolve) => {
      // Same done-flag pattern as showNotification to prevent double-resolve
      // when both callback and Promise path fire (Firefox Promise API).
      let settled = false;
      const settle = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const maybePromise = api.notifications.clear(notificationId, (wasCleared) => {
        settle(wasCleared || false);
      });

      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then((v) => settle(v || false)).catch(() => settle(false));
      }
    });
  }

  /**
   * Show category notification
   * @param {Object} api - Extension API
   * @param {string} categoryName - Category name
   * @returns {Promise<string>} Notification ID
   */
  async function showCategoryNotification(api, categoryName) {
    return showNotification(
      api,
      'Category Changed',
      `Switched to "${categoryName}"`,
      {
        notificationId: CATEGORY_NOTIFICATION_ID
      }
    );
  }

  /**
   * Show save notification
   * @param {Object} api - Extension API
   * @param {string} title - Article title
   * @returns {Promise<string>} Notification ID
   */
  async function showSaveNotification(api, title) {
    return showNotification(
      api,
      'Article Saved',
      title || 'Article saved to Local Pocket'
    );
  }

  /**
   * Show error notification
   * @param {Object} api - Extension API
   * @param {string} message - Error message
   * @returns {Promise<string>} Notification ID
   */
  async function showErrorNotification(api, message) {
    return showNotification(
      api,
      'Error',
      message || 'An error occurred'
    );
  }

  const api = {
    showNotification,
    clearNotification,
    showCategoryNotification,
    showSaveNotification,
    showErrorNotification
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (globalScope && typeof globalScope === 'object') {
    globalScope.LocalPocketNotificationCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
