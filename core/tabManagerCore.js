/**
 * Tab management for Local Pocket Reader
 * Handles tab operations, content script injection, and save-all-tabs functionality
 */

(function attachLocalPocketTabManagerCore(globalScope) {
  'use strict';

  // Global tracking for saveAllTabsInWindow
  let saveAllTabsPending = 0;
  let saveAllTabsResolver = null;
  const saveAllTabsIds = new Set();
  const contentScriptInjectedTabs = new Set();

  /**
   * Inject content script into tab
   * @param {Object} api - Extension API (browser or chrome)
   * @param {number} tabId - Tab ID
   * @param {string} scriptPath - Path to content script
   * @returns {Promise<void>}
   */
  async function injectContentScript(api, tabId, scriptPath) {
    if (contentScriptInjectedTabs.has(tabId)) {
      return;
    }

    try {
      if (api.scripting && api.scripting.executeScript) {
        // Manifest V3 style
        await api.scripting.executeScript({
          target: { tabId: tabId },
          files: [scriptPath]
        });
      } else {
        // Manifest V2 style
        await api.tabs.executeScript(tabId, { file: scriptPath });
      }
      contentScriptInjectedTabs.add(tabId);
    } catch (err) {
      console.error('Failed to inject content script:', err);
    }
  }

  /**
   * Check if content script is injected
   * @param {number} tabId - Tab ID
   * @returns {boolean} True if injected
   */
  function isContentScriptInjected(tabId) {
    return contentScriptInjectedTabs.has(tabId);
  }

  /**
   * Mark content script as injected
   * @param {number} tabId - Tab ID
   */
  function markContentScriptInjected(tabId) {
    contentScriptInjectedTabs.add(tabId);
  }

  /**
   * Clear content script injection tracking
   * @param {number} tabId - Tab ID (optional, clears all if not provided)
   */
  function clearContentScriptInjection(tabId) {
    if (tabId) {
      contentScriptInjectedTabs.delete(tabId);
    } else {
      contentScriptInjectedTabs.clear();
    }
  }

  /**
   * Start save all tabs operation.
   * Guard against concurrent calls: if an operation is already in progress,
   * resolve the previous Promise immediately (treat it as cancelled) before
   * starting a new one. This prevents the previous caller hanging forever
   * because its resolver was overwritten.
   * @returns {Promise} Promise that resolves when all tabs are saved
   */
  function startSaveAllTabs() {
    // Resolve any previously pending operation so its Promise doesn't hang
    if (saveAllTabsResolver) {
      saveAllTabsResolver();
      saveAllTabsResolver = null;
    }

    saveAllTabsPending = 0;
    saveAllTabsIds.clear();

    return new Promise((resolve) => {
      saveAllTabsResolver = resolve;
    });
  }

  /**
   * Register tab for save all tabs operation
   * @param {number} tabId - Tab ID
   */
  function registerSaveAllTab(tabId) {
    saveAllTabsIds.add(tabId);
    saveAllTabsPending++;
  }

  /**
   * Complete save for a tab
   * @param {number} tabId - Tab ID
   */
  function completeSaveAllTab(tabId) {
    // B10 fix: only decrement if the tab was actually registered to prevent
    // the counter going negative and triggering the resolver prematurely.
    if (!saveAllTabsIds.has(tabId)) return;

    saveAllTabsIds.delete(tabId);
    saveAllTabsPending--;

    if (saveAllTabsPending <= 0 && saveAllTabsResolver) {
      saveAllTabsResolver();
      saveAllTabsResolver = null;
    }
  }

  /**
   * Check if tab is in save all tabs operation
   * @param {number} tabId - Tab ID
   * @returns {boolean} True if in operation
   */
  function isTabInSaveAll(tabId) {
    return saveAllTabsIds.has(tabId);
  }

  /**
   * Get save all tabs pending count
   * @returns {number} Number of pending saves
   */
  function getSaveAllTabsPending() {
    return saveAllTabsPending;
  }

  /**
   * Reset save all tabs state
   */
  function resetSaveAllTabs() {
    saveAllTabsPending = 0;
    saveAllTabsIds.clear();
    saveAllTabsResolver = null;
  }

  /**
   * Get all tabs in window
   * @param {Object} api - Extension API
   * @param {number} windowId - Window ID
   * @returns {Promise<Array>} Array of tabs
   */
  async function getAllTabsInWindow(api, windowId) {
    return new Promise((resolve) => {
      api.tabs.query({ windowId: windowId }, (tabs) => {
        resolve(tabs || []);
      });
    });
  }

  /**
   * Get current tab
   * @param {Object} api - Extension API
   * @returns {Promise<Object>} Current tab
   */
  async function getCurrentTab(api) {
    return new Promise((resolve) => {
      api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs && tabs[0] ? tabs[0] : null);
      });
    });
  }

  /**
   * Create tab
   * @param {Object} api - Extension API
   * @param {Object} options - Tab creation options
   * @returns {Promise<Object>} Created tab
   */
  async function createTab(api, options) {
    return new Promise((resolve) => {
      api.tabs.create(options, (tab) => {
        resolve(tab);
      });
    });
  }

  /**
   * Update tab
   * @param {Object} api - Extension API
   * @param {number} tabId - Tab ID
   * @param {Object} updateProperties - Update properties
   * @returns {Promise<Object>} Updated tab
   */
  async function updateTab(api, tabId, updateProperties) {
    return new Promise((resolve) => {
      api.tabs.update(tabId, updateProperties, (tabs) => {
        resolve(tabs);
      });
    });
  }

  /**
   * Remove tab
   * @param {Object} api - Extension API
   * @param {number} tabId - Tab ID
   * @returns {Promise<void>}
   */
  async function removeTab(api, tabId) {
    return new Promise((resolve) => {
      api.tabs.remove(tabId, () => {
        resolve();
      });
    });
  }

  const api = {
    injectContentScript,
    isContentScriptInjected,
    markContentScriptInjected,
    clearContentScriptInjection,
    startSaveAllTabs,
    registerSaveAllTab,
    completeSaveAllTab,
    isTabInSaveAll,
    getSaveAllTabsPending,
    resetSaveAllTabs,
    getAllTabsInWindow,
    getCurrentTab,
    createTab,
    updateTab,
    removeTab
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (globalScope && typeof globalScope === 'object') {
    globalScope.LocalPocketTabManagerCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
