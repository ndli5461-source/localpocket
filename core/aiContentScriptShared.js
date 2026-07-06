/**
 * aiContentScriptShared.js
 *
 * Shared utilities for AI content scripts (GPT, Claude, SidebarAi).
 * Exposes a single `window.__lpAiShared` namespace so each script
 * can pull in common logic without duplicating ~60-70% of the code.
 *
 * Isu yang diselesaikan:
 *  1. Deduplikasi kod – focus management, selection search, polling, DOM utils
 *  2. Prompt injection yang lebih robust – fallback selector chain + error notification
 *     bila injection gagal (gantikan silent .catch(() => {}))
 */
(function () {
  if (window.__lpAiShared) return; // Sudah di-load, skip

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  const DEFAULT_SIDEBAR_F6_DELAY_MS = 80;
  const SIDEBAR_FOCUS_SETTLE_MS = 140;
  const SIDEBAR_FOCUS_RESULT_EXTRA_WAIT_MS = 1800;
  const SIDEBAR_CONTEXT_SESSION_KEY = "__lpSidebarContext";

  const DEFAULT_SELECTION_POPUP_SETTINGS = {
    enabled: true,
    openBehavior: "auto",
    minChars: 0,
    maxChars: 0,
    delayMs: 0,
    location: "cursor",
    leftClickAction: "new-background-tab",
    rightClickAction: "new-tab",
    middleClickAction: "new-tab",
    shortcutAction: "new-background-tab",
    allowOnEditable: false,
    hideOnScroll: true,
    hideOnRightClick: true,
    hideOnEngineClick: true,
    allowShortcutsWithoutPopup: true,
    animationMs: 100
  };

  const DEFAULT_SELECTION_ENGINES_LIST = [
    { id: "copy", type: "copy", name: "Copy to clipboard", url: "", iconUrl: "", showPopup: true, showContextMenu: false, shortcut: "" },
    { id: "open-link", type: "open-link", name: "Open as link", url: "", iconUrl: "", showPopup: true, showContextMenu: false, shortcut: "" },
    { id: "google", type: "engine", name: "Google", url: "https://www.google.com/search?q=%s", iconUrl: "https://www.google.com/favicon.ico", showPopup: true, showContextMenu: true, shortcut: "G" },
    { id: "bing", type: "engine", name: "Bing", url: "https://www.bing.com/search?q=%s", iconUrl: "https://www.bing.com/sa/simg/favicon-2x.ico", showPopup: true, showContextMenu: true, shortcut: "B" },
    { id: "ddg", type: "engine", name: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s", iconUrl: "https://duckduckgo.com/favicon.ico", showPopup: true, showContextMenu: true, shortcut: "D" }
  ];

  const AI_CATEGORY_SESSION_PREFIX = "ai-category:";
  const AI_CATEGORY_RESULT_POLL_INTERVAL_MS = 800;
  const AI_CATEGORY_RESULT_POLL_MAX_TICKS = 150;

  // ---------------------------------------------------------------------------
  // DOM Utilities
  // ---------------------------------------------------------------------------

  function isTextEditableElement(target) {
    if (!target) return false;
    const tag = target.tagName ? String(target.tagName).toUpperCase() : "";
    return tag === "INPUT" || tag === "TEXTAREA" || !!target.isContentEditable;
  }

  function getDeepActiveElement(root) {
    root = root || document;
    let active = root && root.activeElement ? root.activeElement : null;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    return active;
  }

  function isEventInsideEditable(event) {
    if (!event) return false;
    if (typeof event.composedPath === "function") {
      const path = event.composedPath();
      for (const node of path) {
        if (isTextEditableElement(node)) return true;
      }
    }
    return isTextEditableElement(event.target) || isTextEditableElement(getDeepActiveElement());
  }

  function isNodeInsideEditable(node) {
    if (!node) return false;
    let current = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (current) {
      if (isTextEditableElement(current)) return true;
      current = current.parentElement;
    }
    return false;
  }

  function isElementVisible(el) {
    if (!el || !el.isConnected) return false;
    try {
      const style = window.getComputedStyle(el);
      if (!style) return false;
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    } catch (err) {
      return false;
    }
  }

  function isUsablePromptInput(el) {
    if (!el) return false;
    if (!isTextEditableElement(el)) return false;
    if (!isElementVisible(el)) return false;
    if (el.disabled || el.readOnly) return false;
    return true;
  }

  function activeElementMatchesPromptInput(input) {
    if (!input) return false;
    const active = getDeepActiveElement();
    return active === input || !!(input.contains && active && input.contains(active));
  }

  function hasActiveSelection() {
    try {
      const selection = window.getSelection ? window.getSelection() : null;
      return !!(selection && selection.rangeCount > 0 && !selection.isCollapsed);
    } catch (err) {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Context Detection
  // ---------------------------------------------------------------------------

  function isSidebarContext() {
    try {
      const params = new URLSearchParams(window.location.search || "");
      if (params.get("lp_sidebar") === "1") {
        try { window.sessionStorage.setItem(SIDEBAR_CONTEXT_SESSION_KEY, "1"); } catch (e) {}
        return true;
      }
      try {
        if (window.sessionStorage.getItem(SIDEBAR_CONTEXT_SESSION_KEY) === "1") return true;
      } catch (e) {}
    } catch (e) {}
    const name = String(window.name || "");
    if (name === "__LP_SIDEBAR__" || name === "__LP_OVERLAY__") return true;
    if (typeof window.innerWidth === "number" && window.innerWidth < 900) return true;
    try {
      const ref = String(document.referrer || "").toLowerCase();
      if (ref.includes("lp_sidebar=1") || ref.includes("sidebar.html")) return true;
    } catch (e) {}
    return false;
  }

  // ---------------------------------------------------------------------------
  // Runtime Messaging
  // ---------------------------------------------------------------------------

  function sendRuntimeMessage(extensionApi, message) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        resolve(value == null ? null : value);
      };
      try {
        const maybePromise = extensionApi.runtime.sendMessage(message, (response) => {
          const runtimeErr = extensionApi.runtime && extensionApi.runtime.lastError;
          if (runtimeErr) { finish(null); return; }
          finish(response);
        });
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then(finish).catch(() => finish(null));
        }
      } catch (err) {
        finish(null);
      }
    });
  }

  function readLocalStorageValue(extensionApi, key, done) {
    const finish = (value) => { try { done(value); } catch (e) {} };
    if (!extensionApi.storage || !extensionApi.storage.local || !extensionApi.storage.local.get) {
      finish(null);
      return;
    }
    try {
      const maybePromise = extensionApi.storage.local.get(key);
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise
          .then((result) => { finish(result && typeof result === "object" ? result[key] : null); })
          .catch(() => finish(null));
        return;
      }
      if (maybePromise && typeof maybePromise === "object") { finish(maybePromise[key]); return; }
    } catch (e) {}
    try {
      extensionApi.storage.local.get(key, (result) => {
        const runtimeErr = extensionApi.runtime && extensionApi.runtime.lastError;
        if (runtimeErr || !result || typeof result !== "object") { finish(null); return; }
        finish(result[key]);
      });
    } catch (e) { finish(null); }
  }

  // ---------------------------------------------------------------------------
  // Injection Error Notification
  // Menggantikan silent .catch(() => {}) dengan notifikasi yang boleh dilog/dipapar
  // ---------------------------------------------------------------------------

  /**
   * notifyInjectionFailure – dipaparkan bila injection gagal.
   * Hantar mesej ke background untuk dilog, dan papar badge visual dalam frame.
   *
   * @param {object} extensionApi
   * @param {string} provider  – e.g. "chatgpt", "claude", "gemini"
   * @param {string} reason    – kod kegagalan
   * @param {object} [details] – maklumat tambahan
   */
  function notifyInjectionFailure(extensionApi, provider, reason, details) {
    const payload = {
      type: "ai-injection-failed",
      payload: {
        provider: String(provider || "unknown"),
        reason: String(reason || "unknown"),
        url: String(window.location.href || ""),
        details: details && typeof details === "object" ? details : {}
      }
    };
    try {
      sendRuntimeMessage(extensionApi, payload).catch(() => {});
    } catch (e) {}

    // Visual badge – hanya dalam development/debug mode
    try {
      const params = new URLSearchParams(window.location.search || "");
      const isDebug = params.get("lp_debug") === "1" || params.get("lp_injection_debug") === "1";
      if (!isDebug) return;
    } catch (e) { return; }

    try {
      const BADGE_ID = "__lp_injection_error_badge";
      let badge = document.getElementById(BADGE_ID);
      if (!badge) {
        badge = document.createElement("div");
        badge.id = BADGE_ID;
        badge.style.cssText = [
          "position:fixed", "top:8px", "left:8px", "z-index:2147483647",
          "max-width:92%", "padding:6px 10px", "border-radius:8px",
          "background:rgba(220,38,38,0.92)", "border:1px solid rgba(255,100,100,0.4)",
          "color:#fff", "font:12px/1.4 ui-monospace,Consolas,monospace",
          "pointer-events:none", "white-space:nowrap", "overflow:hidden",
          "text-overflow:ellipsis"
        ].join(";");
        (document.body || document.documentElement).appendChild(badge);
      }
      badge.textContent = `LP [${provider}] injection failed: ${reason}`;
      clearTimeout(badge.__lpTimer);
      badge.__lpTimer = setTimeout(() => {
        try { badge.remove(); } catch (e) {}
      }, 8000);
    } catch (e) {}
  }

  // ---------------------------------------------------------------------------
  // Synthetic F6 Dispatch
  // ---------------------------------------------------------------------------

  function dispatchSyntheticF6Once() {
    const init = { key: "F6", code: "F6", keyCode: 117, which: 117, bubbles: true, cancelable: true };
    let down = null;
    try {
      down = new KeyboardEvent("keydown", init);
      try { Object.defineProperty(down, "keyCode", { get: () => 117 }); } catch (e) {}
      try { Object.defineProperty(down, "which", { get: () => 117 }); } catch (e) {}
    } catch (e) { return false; }
    const target = getDeepActiveElement() || document.body || document.documentElement || document;
    try { target.dispatchEvent(down); } catch (e) {}
    try { document.dispatchEvent(down); } catch (e) {}
    try { window.dispatchEvent(down); } catch (e) {}
    try {
      const up = new KeyboardEvent("keyup", init);
      try { Object.defineProperty(up, "keyCode", { get: () => 117 }); } catch (e) {}
      try { Object.defineProperty(up, "which", { get: () => 117 }); } catch (e) {}
      try { target.dispatchEvent(up); } catch (e) {}
      try { document.dispatchEvent(up); } catch (e) {}
      try { window.dispatchEvent(up); } catch (e) {}
    } catch (e) {}
    return true;
  }

  function makeSyntheticF6TwiceDispatcher() {
    let syntheticF6Timer = null;
    return function dispatchSyntheticF6Twice(delayMs) {
      if (!isSidebarContext()) return;
      if (syntheticF6Timer) { clearTimeout(syntheticF6Timer); syntheticF6Timer = null; }
      syntheticF6Timer = setTimeout(() => {
        dispatchSyntheticF6Once();
        setTimeout(() => { dispatchSyntheticF6Once(); syntheticF6Timer = null; }, 100);
      }, Number.isFinite(delayMs) ? delayMs : 500);
    };
  }

  // ---------------------------------------------------------------------------
  // Focus Management
  // ---------------------------------------------------------------------------

  function normalizeSidebarFocusF6DelayMs(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_SIDEBAR_F6_DELAY_MS;
    return Math.min(Math.max(parsed, 0), 5000);
  }

  function placeCaretAtEnd(input) {
    if (!input) return;
    try {
      if (input.isContentEditable) {
        const selection = window.getSelection ? window.getSelection() : null;
        if (!selection) return;
        const range = document.createRange();
        range.selectNodeContents(input);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      if (typeof input.value === "string" && typeof input.setSelectionRange === "function") {
        const end = input.value.length;
        input.setSelectionRange(end, end);
      }
    } catch (e) {}
  }

  function queueCaretPlacement(input) {
    if (!input) return;
    const refreshCaret = () => {
      if (!activeElementMatchesPromptInput(input)) return;
      placeCaretAtEnd(input);
    };
    setTimeout(refreshCaret, 0);
    setTimeout(refreshCaret, 90);
  }

  function focusPromptInput(input) {
    if (!input) return false;
    try { if (typeof input.click === "function") input.click(); } catch (e) {}
    try { input.focus({ preventScroll: true }); } catch (e) {
      try { input.focus(); } catch (e2) { return false; }
    }
    try {
      input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      input.dispatchEvent(new Event("focusin", { bubbles: true }));
    } catch (e) {}
    placeCaretAtEnd(input);
    queueCaretPlacement(input);
    return activeElementMatchesPromptInput(input);
  }

  /**
   * makeFocusScheduler – cipta set fungsi focus scheduling berasaskan state terasing
   * supaya setiap script ada state sendiri tanpa sharing mutable globals.
   */
  function makeFocusScheduler(opts) {
    const checkSidebarFn = opts.checkSidebarFn || isSidebarContext;
    const dispatchF6 = opts.dispatchF6Twice || (() => {});
    const getFindInput = opts.getFindInput || (() => null);
    const getActivateComposer = opts.getActivateComposer || (() => {});
    const getEnsurePort = opts.getEnsurePort || (() => {});
    const getAttemptFocus = opts.getAttemptFocus || (() => {});

    let suppressAutoFocusUntil = 0;
    let scheduledSidebarFocusTimer = null;
    let scheduledSidebarFocusAt = 0;
    let sidebarFocusF6DelayMs = DEFAULT_SIDEBAR_F6_DELAY_MS;

    function clearScheduled() {
      if (!scheduledSidebarFocusTimer) { scheduledSidebarFocusAt = 0; return; }
      clearTimeout(scheduledSidebarFocusTimer);
      scheduledSidebarFocusTimer = null;
      scheduledSidebarFocusAt = 0;
    }

    function schedule(options) {
      options = options || {};
      if (!checkSidebarFn()) return false;
      const requestedDelayMs = normalizeSidebarFocusF6DelayMs(
        Number.isFinite(options.delayMs) ? options.delayMs
          : (options.initial === true ? sidebarFocusF6DelayMs : sidebarFocusF6DelayMs)
      );
      const followupDelayMs = requestedDelayMs + SIDEBAR_FOCUS_SETTLE_MS;
      const runAt = Date.now() + followupDelayMs;
      if (scheduledSidebarFocusTimer && scheduledSidebarFocusAt && scheduledSidebarFocusAt <= runAt) {
        return true;
      }
      clearScheduled();
      suppressAutoFocusUntil = Math.max(suppressAutoFocusUntil, runAt);
      if (!options.skipSyntheticF6) dispatchF6(requestedDelayMs);
      scheduledSidebarFocusAt = runAt;
      scheduledSidebarFocusTimer = setTimeout(() => {
        scheduledSidebarFocusTimer = null;
        scheduledSidebarFocusAt = 0;
        if (!checkSidebarFn()) return;
        if (Date.now() < suppressAutoFocusUntil || hasActiveSelection()) {
          getAttemptFocus();
          return;
        }
        suppressAutoFocusUntil = 0;
        if (options.ensurePort !== false) getEnsurePort();
        const input = getFindInput();
        let focused = false;
        if (input) {
          focused = focusPromptInput(input);
        } else if (!options.skipComposerActivation) {
          getActivateComposer();
        }
        if (!focused) getAttemptFocus();
      }, followupDelayMs);
      return true;
    }

    function waitForResult(timeoutMs) {
      const timeout = Math.max(400, Number.isFinite(timeoutMs) ? timeoutMs : 2200);
      return new Promise((resolve) => {
        const startedAt = Date.now();
        const check = () => {
          if (!checkSidebarFn()) { resolve(false); return; }
          const input = getFindInput();
          if (input && activeElementMatchesPromptInput(input)) { resolve(true); return; }
          if (Date.now() - startedAt >= timeout) { resolve(false); return; }
          setTimeout(check, 90);
        };
        check();
      });
    }

    function request(options) {
      options = options || {};
      const scheduled = schedule(options);
      if (!scheduled) return Promise.resolve(false);
      const requestedDelayMs = normalizeSidebarFocusF6DelayMs(
        Number.isFinite(options.delayMs) ? options.delayMs : sidebarFocusF6DelayMs
      );
      return waitForResult(requestedDelayMs + SIDEBAR_FOCUS_SETTLE_MS + SIDEBAR_FOCUS_RESULT_EXTRA_WAIT_MS);
    }

    function applySettings(rawSettings) {
      const settings = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
      sidebarFocusF6DelayMs = normalizeSidebarFocusF6DelayMs(settings.sidebarFocusF6DelayMs);
    }

    function setSuppressUntil(ts) {
      suppressAutoFocusUntil = ts;
    }

    function getSuppressUntil() {
      return suppressAutoFocusUntil;
    }

    return { schedule, waitForResult, request, clearScheduled, applySettings, setSuppressUntil, getSuppressUntil };
  }

  // ---------------------------------------------------------------------------
  // AI Category Result Polling
  // ---------------------------------------------------------------------------

  function isAiCategorySession(sessionId) {
    return String(sessionId || "").startsWith(AI_CATEGORY_SESSION_PREFIX);
  }

  function sanitizeAiCategorySessionToken(value) {
    const raw = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    return raw ? raw.slice(-64) : "SESSION";
  }

  function buildAiCategoryResultMarkers(sessionId) {
    const token = sanitizeAiCategorySessionToken(sessionId);
    return { start: `[[LP_CAT_RESULT_${token}]]`, end: `[[/LP_CAT_RESULT_${token}]]` };
  }

  function readDocumentTextSnapshot() {
    // textContent tidak force layout (berbeza dengan innerText yang perlu kira CSS)
    const root = document.body || document.documentElement;
    return root ? (root.textContent || "") : "";
  }

  function getAiCategoryLastEndIndex(text, sessionId) {
    const markers = buildAiCategoryResultMarkers(sessionId);
    return String(text || "").lastIndexOf(markers.end);
  }

  function extractAiCategoryResultBlock(text, sessionId, minimumEndIndex) {
    minimumEndIndex = minimumEndIndex == null ? -1 : minimumEndIndex;
    const raw = String(text || "");
    if (!raw) return "";
    const markers = buildAiCategoryResultMarkers(sessionId);
    const endIndex = raw.lastIndexOf(markers.end);
    if (endIndex < 0 || endIndex <= minimumEndIndex) return "";
    const startIndex = raw.lastIndexOf(markers.start, endIndex);
    if (startIndex < 0) return "";
    return raw.slice(startIndex + markers.start.length, endIndex).trim();
  }

  function isPlaceholderAiCategoryResultBlock(text) {
    const raw = String(text || "");
    return !raw || raw.includes("CATEGORY_NAME_OR_EMPTY") || raw.includes("\"reason\":\"short reason\"");
  }

  /**
   * makeAiCategoryPoller – cipta poller yang terasing bagi setiap script instance.
   * Menggantikan mutable globals berulang dalam setiap file.
   */
  function makeAiCategoryPoller(extensionApi, provider) {
    let pollTimer = null;
    let activeSessionId = "";
    let baselineEndIndex = -1;

    function stop() {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      activeSessionId = "";
      baselineEndIndex = -1;
    }

    function sendResult(sessionId, rawText) {
      if (!sessionId) return Promise.resolve(null);
      return sendRuntimeMessage(extensionApi, {
        type: "ai-category-classification-result",
        payload: {
          provider: String(provider || "unknown"),
          sessionId: String(sessionId),
          rawText: String(rawText || "")
        }
      });
    }

    function sendError(sessionId, reason, details) {
      if (!sessionId) return Promise.resolve(null);
      return sendRuntimeMessage(extensionApi, {
        type: "ai-category-classification-error",
        payload: {
          provider: String(provider || "unknown"),
          sessionId: String(sessionId),
          reason: String(reason || "unknown"),
          attempts: details && Number.isFinite(details.attempts) ? details.attempts : 0
        }
      });
    }

    function start(sessionId) {
      const normalizedId = sessionId ? String(sessionId) : "";
      if (!isAiCategorySession(normalizedId)) return;
      stop();
      activeSessionId = normalizedId;
      baselineEndIndex = getAiCategoryLastEndIndex(readDocumentTextSnapshot(), normalizedId);
      let ticks = 0;
      pollTimer = setInterval(() => {
        ticks += 1;
        const currentId = activeSessionId;
        if (!currentId) { stop(); return; }
        const block = extractAiCategoryResultBlock(readDocumentTextSnapshot(), currentId, baselineEndIndex);
        if (block && !isPlaceholderAiCategoryResultBlock(block)) {
          stop();
          sendResult(currentId, block).catch(() => {});
          return;
        }
        if (ticks >= AI_CATEGORY_RESULT_POLL_MAX_TICKS) {
          stop();
          sendError(currentId, "result-timeout", { attempts: ticks }).catch(() => {});
        }
      }, AI_CATEGORY_RESULT_POLL_INTERVAL_MS);
    }

    return { start, stop, sendResult, sendError };
  }

  // ---------------------------------------------------------------------------
  // Overlay Result Polling
  // ---------------------------------------------------------------------------

  function startOverlayResultPolling(extensionApi, sessionId) {
    const id = sessionId ? String(sessionId) : "";
    if (!id.startsWith("ai-overlay:")) return;
    const token = id.slice("ai-overlay:".length);
    const _baseRoot = document.body || document.documentElement;
    // textContent tidak force layout — cukup untuk detect perubahan teks
    const base = _baseRoot ? (_baseRoot.textContent || "") : "";
    // Kurangkan stable threshold 3→2 dan interval 800→400ms:
    // jimat 800–1600ms delay selepas AI selesai generate
    let last = "", stable = 0, ticks = 0;
    const POLL_INTERVAL_MS = 400;
    const STABLE_REQUIRED = 2;
    const MAX_TICKS = 240; // ~96 saat coverage sama (400ms × 240 = 96s)
    const tmr = setInterval(() => {
      ticks++;
      if (ticks > MAX_TICKS) { clearInterval(tmr); return; }
      try {
        const root = document.body || document.documentElement;
        const cur = root ? (root.textContent || "") : "";
        if (!cur || cur.length <= base.length) return;
        const text = cur.slice(base.length).trim();
        if (!text || text.length < 3) return;
        if (text === last) { stable++; } else { stable = 0; last = text; }
        const done = stable >= STABLE_REQUIRED;
        sendRuntimeMessage(extensionApi, {
          type: "ai-overlay-response",
          overlayToken: token,
          responseText: last,
          done
        }).catch(() => {});
        if (done) clearInterval(tmr);
      } catch (e) {}
    }, POLL_INTERVAL_MS);
  }

  // ---------------------------------------------------------------------------
  // Selection Search Settings (normalizer)
  // ---------------------------------------------------------------------------

  /**
   * normalizeSelectionSearchSettings – parse raw settings ke bentuk terstruktur.
   * Digunakan oleh GPT dan SidebarAi (Claude tidak ada selection search).
   */
  function normalizeSelectionSearchSettings(rawSettings, defaults) {
    defaults = defaults || {};
    const popupDefaults = Object.assign({}, DEFAULT_SELECTION_POPUP_SETTINGS, defaults);
    const settings = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
    const popupRaw = settings.selectionSearchPopup && typeof settings.selectionSearchPopup === "object"
      ? settings.selectionSearchPopup : {};
    const listRaw = Array.isArray(settings.selectionSearchEnginesList) ? settings.selectionSearchEnginesList : [];
    const legacyEngines = settings.selectionSearchEngines && typeof settings.selectionSearchEngines === "object"
      ? settings.selectionSearchEngines : {};
    const legacyOrder = Array.isArray(settings.selectionSearchOrder) ? settings.selectionSearchOrder : [];

    const normalizeAction = (value, fallback) => {
      const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
      return ["new-tab", "new-background-tab", "same-tab"].includes(raw) ? raw : fallback;
    };

    const normalizeShortcut = (value) => {
      const raw = typeof value === "string" ? value.trim() : "";
      if (!raw) return "";
      if (raw.length === 1) return raw.toUpperCase();
      return raw.slice(0, 2).toUpperCase();
    };

    const normalizeEngineEntry = (entry, index) => {
      const raw = entry && typeof entry === "object" ? entry : {};
      const id = raw.id ? String(raw.id).trim() : `engine-${index}`;
      const typeRaw = raw.type ? String(raw.type).trim().toLowerCase() : "engine";
      const type = ["engine", "copy", "open-link", "separator", "group"].includes(typeRaw) ? typeRaw : "engine";
      const name = raw.name ? String(raw.name).trim() : (type === "separator" ? "Separator" : "Engine");
      return {
        id: id.slice(0, 60), type,
        name: name.slice(0, 80),
        url: raw.url ? String(raw.url).trim().slice(0, 500) : "",
        iconUrl: raw.iconUrl ? String(raw.iconUrl).trim().slice(0, 500) : "",
        showPopup: raw.showPopup !== false && type !== "group" && type !== "separator",
        showContextMenu: raw.showContextMenu === true,
        shortcut: normalizeShortcut(raw.shortcut)
      };
    };

    const mapLegacyEngines = () => {
      const list = [];
      const seen = new Set();
      legacyOrder.forEach((id) => {
        const key = String(id || "").trim().toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        const entry = legacyEngines[key];
        if (!entry) return;
        list.push({
          id: key,
          type: key === "copy" ? "copy" : "engine",
          name: entry.label || key,
          url: entry.url || "",
          iconUrl: "",
          showPopup: entry.enabled !== false,
          showContextMenu: false,
          shortcut: ""
        });
      });
      return list.length ? list : DEFAULT_SELECTION_ENGINES_LIST.map((e) => ({ ...e }));
    };

    const minCharsRaw = Number.parseInt(popupRaw.minChars, 10);
    const maxCharsRaw = Number.parseInt(popupRaw.maxChars, 10);
    const delayRaw = Number.parseInt(popupRaw.delayMs, 10);
    const animRaw = Number.parseInt(popupRaw.animationMs, 10);
    const openBehavior = typeof popupRaw.openBehavior === "string"
      ? popupRaw.openBehavior.trim().toLowerCase() : popupDefaults.openBehavior;
    const location = typeof popupRaw.location === "string"
      ? popupRaw.location.trim().toLowerCase() : popupDefaults.location;

    const popupSettings = {
      enabled: popupRaw.enabled !== false && settings.selectionSearchEnabled !== false,
      openBehavior: openBehavior === "manual" ? "manual" : "auto",
      minChars: Number.isFinite(minCharsRaw) ? Math.max(0, minCharsRaw) : popupDefaults.minChars,
      maxChars: Number.isFinite(maxCharsRaw) ? Math.max(0, maxCharsRaw) : popupDefaults.maxChars,
      delayMs: Number.isFinite(delayRaw) ? Math.min(Math.max(delayRaw, 0), 5000) : popupDefaults.delayMs,
      location: location === "selection" ? "selection" : "cursor",
      leftClickAction: normalizeAction(popupRaw.leftClickAction, popupDefaults.leftClickAction),
      rightClickAction: normalizeAction(popupRaw.rightClickAction, popupDefaults.rightClickAction),
      middleClickAction: normalizeAction(popupRaw.middleClickAction, popupDefaults.middleClickAction),
      shortcutAction: normalizeAction(popupRaw.shortcutAction, popupDefaults.shortcutAction),
      allowOnEditable: popupRaw.allowOnEditable === true,
      hideOnScroll: popupRaw.hideOnScroll !== false,
      hideOnRightClick: popupRaw.hideOnRightClick !== false,
      hideOnEngineClick: popupRaw.hideOnEngineClick !== false,
      allowShortcutsWithoutPopup: popupRaw.allowShortcutsWithoutPopup !== false,
      animationMs: Number.isFinite(animRaw) ? Math.min(Math.max(animRaw, 0), 1200) : popupDefaults.animationMs
    };

    const enginesList = listRaw.length
      ? listRaw.map((entry, idx) => normalizeEngineEntry(entry, idx))
      : mapLegacyEngines();

    return { popupSettings, enginesList };
  }

  // ---------------------------------------------------------------------------
  // Robust Selector Query – fallback chain + error callback
  // Menggantikan selector statik tunggal dengan cuba setiap selector dalam chain
  // sampai jumpa elemen yang sesuai. Bila semua gagal, panggil onFailure.
  // ---------------------------------------------------------------------------

  /**
   * queryWithFallbackChain – cuba selector dari atas ke bawah.
   * Bila semuanya gagal, panggil onFailure(selectorsTried).
   *
   * @param {string[]} selectors    – senarai selector untuk dicuba
   * @param {Function} [filter]     – optional filter, return true untuk terima elemen
   * @param {Function} [onFailure]  – dipanggil bila tiada elemen ditemui
   * @returns {Element|null}
   */
  function queryWithFallbackChain(selectors, filter, onFailure) {
    filter = filter || (() => true);
    const tried = [];
    for (const selector of (selectors || [])) {
      if (!selector) continue;
      tried.push(selector);
      try {
        const nodes = document.querySelectorAll(selector);
        for (const node of nodes) {
          if (!node) continue;
          try { if (filter(node)) return node; } catch (e) {}
        }
      } catch (e) {
        // Selector tidak valid — teruskan ke yang seterusnya
      }
    }
    if (typeof onFailure === "function") {
      try { onFailure(tried); } catch (e) {}
    }
    return null;
  }

  /**
   * disableSkipToContentLinks – buang pautan "skip to content" yang mengganggu
   * pengurusan fokus dalam sidebar.
   */
  function disableSkipToContentLinks() {
    const links = document.querySelectorAll('a[href^="#"], a[class*="skip"], [data-testid*="skip"]');
    for (let i = 0; i < links.length; i++) {
      const el = links[i];
      const text = (el.textContent || "").toLowerCase();
      if (text.includes("skip to") || text.includes("skip content") || text.includes("skip navigation")) {
        el.remove();
      }
    }
  }

  /**
   * ensureSidebarTextSelectionEnabled – inject CSS dan observer untuk
   * pastikan teks dalam sidebar sentiasa boleh dipilih.
   */
  function ensureSidebarTextSelectionEnabled(checkFn) {
    checkFn = checkFn || isSidebarContext;
    if (!checkFn()) return;
    const STYLE_ID = "__lp_sidebar_force_text_selection";
    if (document.getElementById(STYLE_ID)) return;

    // Observer hanya perhatikan direct children document.body (bukan subtree penuh)
    // supaya tidak fire pada setiap DOM mutation dalam AI chat yang sangat kerap
    const observer = new MutationObserver(() => disableSkipToContentLinks());
    observer.observe(document.body || document.documentElement, { childList: true });
    disableSkipToContentLinks();

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      html, body, body * {
        user-select: text !important;
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        cursor: auto !important;
      }
      a[href^="#"][class*="skip"],
      a[class*="skip-to"],
      a[class*="skipLink"],
      [data-testid*="skip"] {
        display: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
    return observer;
  }

  // ---------------------------------------------------------------------------
  // Prompt Value Helpers
  // ---------------------------------------------------------------------------

  function normalizePromptComparable(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function sanitizeSelectionText(raw) {
    return String(raw || "").replace(/\s+/g, " ").trim().slice(0, 500);
  }

  function insertViaSyntheticPaste(target, text) {
    if (!target || !target.isContentEditable) return false;
    if (typeof DataTransfer !== "function" || typeof ClipboardEvent !== "function") return false;
    try {
      const data = new DataTransfer();
      data.setData("text/plain", String(text || ""));
      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true, cancelable: true, clipboardData: data
      });
      return target.dispatchEvent(pasteEvent) !== false;
    } catch (e) { return false; }
  }

  // ---------------------------------------------------------------------------
  // Expose namespace
  // ---------------------------------------------------------------------------

  window.__lpAiShared = {
    // Constants
    DEFAULT_SIDEBAR_F6_DELAY_MS,
    SIDEBAR_FOCUS_SETTLE_MS,
    SIDEBAR_FOCUS_RESULT_EXTRA_WAIT_MS,
    AI_CATEGORY_SESSION_PREFIX,
    DEFAULT_SELECTION_POPUP_SETTINGS,
    DEFAULT_SELECTION_ENGINES_LIST,

    // DOM utils
    isTextEditableElement,
    getDeepActiveElement,
    isEventInsideEditable,
    isNodeInsideEditable,
    isElementVisible,
    isUsablePromptInput,
    activeElementMatchesPromptInput,
    hasActiveSelection,

    // Context
    isSidebarContext,

    // Messaging
    sendRuntimeMessage,
    readLocalStorageValue,

    // Injection error notification
    notifyInjectionFailure,

    // Synthetic F6
    dispatchSyntheticF6Once,
    makeSyntheticF6TwiceDispatcher,

    // Focus
    normalizeSidebarFocusF6DelayMs,
    placeCaretAtEnd,
    queueCaretPlacement,
    focusPromptInput,
    makeFocusScheduler,

    // AI category polling
    isAiCategorySession,
    makeAiCategoryPoller,
    readDocumentTextSnapshot,
    extractAiCategoryResultBlock,
    isPlaceholderAiCategoryResultBlock,

    // Overlay polling
    startOverlayResultPolling,

    // Selection search
    normalizeSelectionSearchSettings,

    // Selector fallback chain
    queryWithFallbackChain,

    // Sidebar text selection
    disableSkipToContentLinks,
    ensureSidebarTextSelectionEnabled,

    // Prompt helpers
    normalizePromptComparable,
    sanitizeSelectionText,
    insertViaSyntheticPaste
  };
})();
