(function () {
  // In some sidebar builds, ChatGPT can be hosted in a nested frame.
  // Allow narrow/sidebar-like frames to run this script too.
  const isNarrowFrame = typeof window !== "undefined" && typeof window.innerWidth === "number" && window.innerWidth < 900;
  if (window !== window.top && !isNarrowFrame) return;
  if (window.__lpInstalled) return;
  window.__lpInstalled = true;

  const extensionApi = typeof browser !== "undefined" ? browser : chrome;

  // ---------------------------------------------------------------------------
  // Shared module integration (aiContentScriptShared.js)
  // Hanya fungsi BARU yang tiada dalam fail ini ditambah di sini.
  // Fungsi sedia ada (isSidebarContext, isTextEditableElement dsb.) kekal
  // dalam badan fail untuk mengelak konflik pengisytiharan nama.
  // ---------------------------------------------------------------------------
  const _sh = window.__lpAiShared || {};

  // Injection failure notification — BARU, menggantikan silent .catch(() => {})
  const notifyInjectionFailure = _sh.notifyInjectionFailure
    ? function(reason, details) { _sh.notifyInjectionFailure(extensionApi, "chatgpt", reason, details); }
    : function() {};

  // Robust fallback selector chain — BARU, menggantikan selector statik tunggal
  const queryWithFallbackChain = _sh.queryWithFallbackChain || function(selectors, filter) {
    for (const sel of (selectors||[])) { try { const n = document.querySelector(sel); if (n && (!filter || filter(n))) return n; } catch(e) {} }
    return null;
  };

  const SETTINGS_KEY = "settings";
  const SELECTION_POPUP_POSITION_KEY = "__lpSelectionSearchPopupPosition";
  const DEFAULT_SIDEBAR_F6_DELAY_MS = 80;
  const SIDEBAR_FOCUS_SETTLE_MS = 140;
  const SIDEBAR_FOCUS_RESULT_EXTRA_WAIT_MS = 1800;
  let suppressAutoFocusUntil = 0;
  let lastFocusAttemptAt = 0;
  const FOCUS_COOLDOWN_MS = 800; // Minimum ms between focus attempts to prevent focus fight
  const SIDEBAR_CHAT_FOCUS_SIGNAL_KEY = "__lpSidebarChatFocusSignal";
  const SIDEBAR_CONTEXT_SESSION_KEY = "__lpSidebarContext";
  let lastSidebarFocusSignal = 0;
  let sidebarFocusPort = null;
  const SIDEBAR_SELECTION_DEBUG_MAX = 200;
  const sidebarSelectionDebugLog = [];
  let sidebarSelectionLastSignature = "";
  let sidebarSelectionDebounceTimer = null;
  let sidebarFocusPortReconnectTimer = null;
  let sidebarFocusPortReconnectDelayMs = 300;
  let sidebarFocusPortNextAllowedConnectAt = 0;
  let sidebarFocusPortLastDisconnectAt = 0;
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
      {
        id: "copy",
        type: "copy",
        name: "Copy to clipboard",
        url: "",
        iconUrl: "",
        showPopup: true,
        showContextMenu: false,
        shortcut: ""
      },
      {
        id: "open-link",
        type: "open-link",
        name: "Open as link",
        url: "",
        iconUrl: "",
        showPopup: true,
        showContextMenu: false,
        shortcut: ""
      },
      {
        id: "google",
        type: "engine",
        name: "Google",
        url: "https://www.google.com/search?q=%s",
        iconUrl: "https://www.google.com/favicon.ico",
        showPopup: true,
        showContextMenu: true,
        shortcut: "G"
      },
      {
        id: "bing",
        type: "engine",
        name: "Bing",
        url: "https://www.bing.com/search?q=%s",
        iconUrl: "https://www.bing.com/sa/simg/favicon-2x.ico",
        showPopup: true,
        showContextMenu: true,
        shortcut: "B"
      },
      {
        id: "ddg",
        type: "engine",
        name: "DuckDuckGo",
        url: "https://duckduckgo.com/?q=%s",
        iconUrl: "https://duckduckgo.com/favicon.ico",
        showPopup: true,
        showContextMenu: true,
        shortcut: "D"
      }
    ];
    let selectionSearchPopupSettings = { ...DEFAULT_SELECTION_POPUP_SETTINGS };
    let selectionSearchEnginesList = DEFAULT_SELECTION_ENGINES_LIST.map((entry) => ({ ...entry }));
    let selectionSearchPopupSignature = "";
    let selectionSearchTriggerSignature = "";
    let selectionSearchLastPointer = { x: 0, y: 0 };
    let selectionSearchPopupTimer = null;
    let selectionSearchPopupManualPosition = null;
    let selectionSearchPopupPositionLoaded = false;
    let selectionSearchPopupPositionLoadPending = false;
    let selectionSearchMouseDown = false;
  let syntheticF6Timer = null;
  let sidebarTextSelectionObserver = null;
  let scheduledSidebarFocusTimer = null;
  let scheduledSidebarFocusAt = 0;
  let submitLoopTimer = null;
  let lastManualSubmitFallbackAt = 0;
  let lastAppliedSessionId = "";  // Guard: elak re-submit sesi yang sama
  let _submissionInProgress = false; // Hard lock: satu submission pada satu masa
  const MANUAL_SUBMIT_FALLBACK_COOLDOWN_MS = 5000;
  const MANUAL_SUBMIT_FALLBACK_ID = "__lp_chatgpt_manual_submit_fallback";
  const AI_CATEGORY_SESSION_PREFIX = "ai-category:";
  const AI_CATEGORY_RESULT_POLL_INTERVAL_MS = 800;
  const AI_CATEGORY_RESULT_POLL_MAX_TICKS = 150;
  let aiCategoryResultPollTimer = null;
  let activeAiCategoryResultSessionId = "";
  let activeAiCategoryResultBaselineEndIndex = -1;
  let sidebarFocusF6DelayMs = DEFAULT_SIDEBAR_F6_DELAY_MS;

  function isSidebarContext() {
    try {
      const params = new URLSearchParams(window.location.search || "");
      if (params.get("lp_sidebar") === "1") {
        try { window.sessionStorage.setItem(SIDEBAR_CONTEXT_SESSION_KEY, "1"); } catch (err) {}
        return true;
      }
      try {
        if (window.sessionStorage.getItem(SIDEBAR_CONTEXT_SESSION_KEY) === "1") {
          return true;
        }
      } catch (err) {}
    } catch (err) {}
    return window.name === "__LP_SIDEBAR__" || window.name === "__LP_OVERLAY__" || window.innerWidth < 900;
  }

  function isTextEditableElement(target) {
    if (!target) return false;
    const tag = target.tagName ? String(target.tagName).toUpperCase() : "";
    return tag === "INPUT" || tag === "TEXTAREA" || !!target.isContentEditable;
  }

  function getDeepActiveElement(root = document) {
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

  function hasActiveSelection() {
    try {
      const selection = window.getSelection ? window.getSelection() : null;
      return !!(selection && selection.rangeCount > 0 && !selection.isCollapsed);
    } catch (err) {
      return false;
    }
  }

  function normalizeSidebarFocusF6DelayMs(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_SIDEBAR_F6_DELAY_MS;
    return Math.min(Math.max(parsed, 0), 5000);
  }

    function applySelectionSearchSettings(rawSettings) {
      const settings = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
      const popupRaw = settings.selectionSearchPopup && typeof settings.selectionSearchPopup === "object"
        ? settings.selectionSearchPopup
        : {};
      const listRaw = Array.isArray(settings.selectionSearchEnginesList)
        ? settings.selectionSearchEnginesList
        : [];
      const legacyEngines = settings.selectionSearchEngines && typeof settings.selectionSearchEngines === "object"
        ? settings.selectionSearchEngines
        : {};
      const legacyOrder = Array.isArray(settings.selectionSearchOrder)
        ? settings.selectionSearchOrder
        : [];

      const normalizeAction = (value, fallback) => {
        const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
        if (["new-tab", "new-background-tab", "same-tab"].includes(raw)) return raw;
        return fallback;
      };

      const normalizePopup = () => {
        const minCharsRaw = Number.parseInt(popupRaw.minChars, 10);
        const maxCharsRaw = Number.parseInt(popupRaw.maxChars, 10);
        const delayRaw = Number.parseInt(popupRaw.delayMs, 10);
        const animRaw = Number.parseInt(popupRaw.animationMs, 10);
        const openBehavior = typeof popupRaw.openBehavior === "string"
          ? popupRaw.openBehavior.trim().toLowerCase()
          : DEFAULT_SELECTION_POPUP_SETTINGS.openBehavior;
        const location = typeof popupRaw.location === "string"
          ? popupRaw.location.trim().toLowerCase()
          : DEFAULT_SELECTION_POPUP_SETTINGS.location;
        return {
          enabled: popupRaw.enabled !== false && settings.selectionSearchEnabled !== false,
          openBehavior: openBehavior === "manual" ? "manual" : "auto",
          minChars: Number.isFinite(minCharsRaw) ? Math.max(0, minCharsRaw) : DEFAULT_SELECTION_POPUP_SETTINGS.minChars,
          maxChars: Number.isFinite(maxCharsRaw) ? Math.max(0, maxCharsRaw) : DEFAULT_SELECTION_POPUP_SETTINGS.maxChars,
          delayMs: Number.isFinite(delayRaw) ? Math.min(Math.max(delayRaw, 0), 5000) : DEFAULT_SELECTION_POPUP_SETTINGS.delayMs,
          location: location === "selection" ? "selection" : "cursor",
          leftClickAction: normalizeAction(popupRaw.leftClickAction, DEFAULT_SELECTION_POPUP_SETTINGS.leftClickAction),
          rightClickAction: normalizeAction(popupRaw.rightClickAction, DEFAULT_SELECTION_POPUP_SETTINGS.rightClickAction),
          middleClickAction: normalizeAction(popupRaw.middleClickAction, DEFAULT_SELECTION_POPUP_SETTINGS.middleClickAction),
          shortcutAction: normalizeAction(popupRaw.shortcutAction, DEFAULT_SELECTION_POPUP_SETTINGS.shortcutAction),
          allowOnEditable: popupRaw.allowOnEditable === true,
          hideOnScroll: popupRaw.hideOnScroll !== false,
          hideOnRightClick: popupRaw.hideOnRightClick !== false,
          hideOnEngineClick: popupRaw.hideOnEngineClick !== false,
          allowShortcutsWithoutPopup: popupRaw.allowShortcutsWithoutPopup !== false,
          animationMs: Number.isFinite(animRaw)
            ? Math.min(Math.max(animRaw, 0), 1200)
            : DEFAULT_SELECTION_POPUP_SETTINGS.animationMs
        };
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
          id: id.slice(0, 60),
          type,
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

      selectionSearchPopupSettings = normalizePopup();
      selectionSearchEnginesList = listRaw.length
        ? listRaw.map((entry, idx) => normalizeEngineEntry(entry, idx))
        : mapLegacyEngines();

      if (!selectionSearchPopupSettings.enabled) {
        selectionSearchPopupSignature = "";
        selectionSearchTriggerSignature = "";
        hideSelectionSearchPopup();
        hideSelectionSearchTrigger();
      }
    }

  function applySidebarFocusSettings(rawSettings) {
    const settings = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
    sidebarFocusF6DelayMs = normalizeSidebarFocusF6DelayMs(
      settings.sidebarFocusF6DelayMs,
    );
    applySelectionSearchSettings(settings);
  }

  function getSidebarFocusF6DelayMs() {
    return normalizeSidebarFocusF6DelayMs(sidebarFocusF6DelayMs);
  }

  function getInitialSidebarFocusF6DelayMs() {
    return getSidebarFocusF6DelayMs();
  }

  function clearScheduledSidebarFocus() {
    if (!scheduledSidebarFocusTimer) {
      scheduledSidebarFocusAt = 0;
      return;
    }
    clearTimeout(scheduledSidebarFocusTimer);
    scheduledSidebarFocusTimer = null;
    scheduledSidebarFocusAt = 0;
  }

  function scheduleSidebarAutoFocus(options = {}) {
    if (!isSidebarContext()) return false;
    const requestedDelayMs = normalizeSidebarFocusF6DelayMs(
      Number.isFinite(options.delayMs)
        ? options.delayMs
        : (
          options.initial === true
            ? getInitialSidebarFocusF6DelayMs()
            : getSidebarFocusF6DelayMs()
        ),
    );
    const followupDelayMs = requestedDelayMs + SIDEBAR_FOCUS_SETTLE_MS;
    const runAt = Date.now() + followupDelayMs;
    if (scheduledSidebarFocusTimer && scheduledSidebarFocusAt && scheduledSidebarFocusAt <= runAt) {
      return true;
    }
    clearScheduledSidebarFocus();
    suppressAutoFocusUntil = Math.max(suppressAutoFocusUntil, runAt);
    if (!options.skipSyntheticF6) {
      dispatchSyntheticF6Twice(requestedDelayMs);
    }
    scheduledSidebarFocusAt = runAt;
    scheduledSidebarFocusTimer = setTimeout(() => {
      scheduledSidebarFocusTimer = null;
      scheduledSidebarFocusAt = 0;
      if (!isSidebarContext()) return;
      if (Date.now() < suppressAutoFocusUntil || hasActiveSelection()) {
        attemptFocus();
        return;
      }
      suppressAutoFocusUntil = 0;
      if (options.ensurePort !== false) {
        ensureSidebarFocusPort();
      }
      let focused = false;
      const input = findPromptInput();
      if (input) {
        focused = focusPromptInput(input);
      } else if (!options.skipComposerActivation) {
        activateComposerSurface();
      }
      if (!focused) {
        attemptFocus();
      }
    }, followupDelayMs);
    return true;
  }

  function waitForSidebarAutoFocusResult(timeoutMs) {
    const timeout = Math.max(400, Number.isFinite(timeoutMs) ? timeoutMs : 2200);
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const checkFocus = () => {
        if (!isSidebarContext()) {
          resolve(false);
          return;
        }
        const input = findPromptInput();
        if (input && activeElementMatchesPromptInput(input)) {
          resolve(true);
          return;
        }
        if (Date.now() - startedAt >= timeout) {
          resolve(false);
          return;
        }
        setTimeout(checkFocus, 90);
      };
      checkFocus();
    });
  }

  function requestSidebarAutoFocus(options = {}) {
    const scheduled = scheduleSidebarAutoFocus(options);
    if (!scheduled) return Promise.resolve(false);
    const requestedDelayMs = normalizeSidebarFocusF6DelayMs(
      Number.isFinite(options.delayMs)
        ? options.delayMs
        : (
          options.initial === true
            ? getInitialSidebarFocusF6DelayMs()
            : getSidebarFocusF6DelayMs()
        ),
    );
    return waitForSidebarAutoFocusResult(
      requestedDelayMs + SIDEBAR_FOCUS_SETTLE_MS + SIDEBAR_FOCUS_RESULT_EXTRA_WAIT_MS,
    );
  }

  function sendRuntimeMessage(message) {
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
          if (runtimeErr) {
            finish(null);
            return;
          }
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

  function isAiCategorySession(sessionId) {
    return String(sessionId || "").startsWith(AI_CATEGORY_SESSION_PREFIX);
  }

  function sanitizeAiCategorySessionToken(value) {
    const raw = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    return raw ? raw.slice(-64) : "SESSION";
  }

  function buildAiCategoryResultMarkers(sessionId) {
    const token = sanitizeAiCategorySessionToken(sessionId);
    return {
      start: `[[LP_CAT_RESULT_${token}]]`,
      end: `[[/LP_CAT_RESULT_${token}]]`
    };
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

  function extractAiCategoryResultBlock(text, sessionId, minimumEndIndex = -1) {
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

  function stopAiCategoryResultPolling() {
    if (aiCategoryResultPollTimer) {
      clearInterval(aiCategoryResultPollTimer);
      aiCategoryResultPollTimer = null;
    }
    activeAiCategoryResultSessionId = "";
    activeAiCategoryResultBaselineEndIndex = -1;
  }

  async function sendAiCategoryClassificationResult(sessionId, rawText) {
    if (!sessionId) return null;
    return sendRuntimeMessage({
      type: "ai-category-classification-result",
      payload: {
        provider: "chatgpt",
        sessionId: String(sessionId),
        rawText: String(rawText || "")
      }
    });
  }

  async function sendAiCategoryClassificationError(sessionId, reason, details) {
    if (!sessionId) return null;
    return sendRuntimeMessage({
      type: "ai-category-classification-error",
      payload: {
        provider: "chatgpt",
        sessionId: String(sessionId),
        reason: String(reason || "unknown"),
        attempts: details && Number.isFinite(details.attempts) ? details.attempts : 0
      }
    });
  }

  function startAiCategoryResultPolling(sessionId) {
    const normalizedSessionId = sessionId ? String(sessionId) : "";
    if (!isAiCategorySession(normalizedSessionId)) return;
    stopAiCategoryResultPolling();
    activeAiCategoryResultSessionId = normalizedSessionId;
    activeAiCategoryResultBaselineEndIndex = getAiCategoryLastEndIndex(
      readDocumentTextSnapshot(),
      normalizedSessionId
    );
    let ticks = 0;
    aiCategoryResultPollTimer = setInterval(() => {
      ticks += 1;
      const currentSessionId = activeAiCategoryResultSessionId;
      if (!currentSessionId) {
        stopAiCategoryResultPolling();
        return;
      }
      const block = extractAiCategoryResultBlock(
        readDocumentTextSnapshot(),
        currentSessionId,
        activeAiCategoryResultBaselineEndIndex
      );
      if (block && !isPlaceholderAiCategoryResultBlock(block)) {
        stopAiCategoryResultPolling();
        sendAiCategoryClassificationResult(currentSessionId, block).catch(() => {});
        return;
      }
      if (ticks >= AI_CATEGORY_RESULT_POLL_MAX_TICKS) {
        stopAiCategoryResultPolling();
        sendAiCategoryClassificationError(currentSessionId, "result-timeout", {
          attempts: ticks
        }).catch(() => {});
      }
    }, AI_CATEGORY_RESULT_POLL_INTERVAL_MS);
  }

  function startOverlayResultPolling(sessionId) {
    var id = sessionId ? String(sessionId) : "";
    if (!id.startsWith("ai-overlay:")) return;
    var token = id.slice("ai-overlay:".length);
    var _baseRoot = document.body || document.documentElement;
    // textContent tidak force layout — cukup untuk detect perubahan teks
    var base = _baseRoot ? (_baseRoot.textContent || "") : "";
    // Kurangkan stable threshold 3→2 dan interval 800→400ms:
    // jimat 800–1600ms delay selepas AI selesai generate
    var last = "", stable = 0, ticks = 0;
    var POLL_INTERVAL_MS = 400;
    var STABLE_REQUIRED = 2;
    var MAX_TICKS = 240; // ~96 saat coverage sama (400ms × 240 = 96s)
    var tmr = setInterval(function () {
      ticks++;
      if (ticks > MAX_TICKS) { clearInterval(tmr); return; }
      try {
        var root = document.body || document.documentElement;
        var cur = root ? (root.textContent || "") : "";
        if (!cur) { return; }
        if (cur.length <= base.length) return;
        var text = cur.slice(base.length).trim();
        if (!text || text.length < 3) return;
        if (text === last) { stable++; } else { stable = 0; last = text; }
        var done = stable >= STABLE_REQUIRED;
        sendRuntimeMessage({
          type: "ai-overlay-response",
          overlayToken: token,
          responseText: last,
          done: done
        }).catch(function () {});
        if (done) { clearInterval(tmr); }
      } catch (err) {}
    }, POLL_INTERVAL_MS);
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
      if (style.display === "none" || style.visibility === "hidden") return false;
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

  function matchesTextHint(el, attrName, textHint) {
    if (!el || !attrName || !textHint) return false;
    const value = el.getAttribute(attrName);
    if (!value) return false;
    return String(value).toLowerCase().includes(String(textHint).toLowerCase());
  }

  function dispatchSyntheticF6Once() {
    const init = {
      key: "F6",
      code: "F6",
      keyCode: 117,
      which: 117,
      bubbles: true,
      cancelable: true
    };
    let down = null;
    try {
      down = new KeyboardEvent("keydown", init);
      try { Object.defineProperty(down, "keyCode", { get: () => 117 }); } catch (err) {}
      try { Object.defineProperty(down, "which", { get: () => 117 }); } catch (err) {}
    } catch (err) {
      return false;
    }
    const target = getDeepActiveElement() || document.body || document.documentElement || document;
    try { target.dispatchEvent(down); } catch (err) {}
    try { document.dispatchEvent(down); } catch (err) {}
    try { window.dispatchEvent(down); } catch (err) {}

    try {
      const up = new KeyboardEvent("keyup", init);
      try { Object.defineProperty(up, "keyCode", { get: () => 117 }); } catch (err) {}
      try { Object.defineProperty(up, "which", { get: () => 117 }); } catch (err) {}
      try { target.dispatchEvent(up); } catch (err) {}
      try { document.dispatchEvent(up); } catch (err) {}
      try { window.dispatchEvent(up); } catch (err) {}
    } catch (err) {}
    return true;
  }

  function dispatchSyntheticF6Twice(delayMs = 500) {
    if (!isSidebarContext()) return;
    if (syntheticF6Timer) {
      clearTimeout(syntheticF6Timer);
      syntheticF6Timer = null;
    }
    syntheticF6Timer = setTimeout(() => {
      dispatchSyntheticF6Once();
      setTimeout(() => {
        dispatchSyntheticF6Once();
        syntheticF6Timer = null;
      }, 100);
    }, Number.isFinite(delayMs) ? delayMs : 500);
  }

  function describeSelectionNode(node) {
    if (!node) return "";
    if (node.nodeType === 1 && node.tagName) return String(node.tagName);
    if (node.nodeType === 3) return "TEXT";
    return String(node.nodeName || "");
  }

  function getSelectionSummary() {
    const selection = window.getSelection ? window.getSelection() : null;
    const text = selection ? selection.toString() : "";
    const length = text ? text.length : 0;
    const collapsed = !selection || selection.isCollapsed;
    const anchorNode = selection ? selection.anchorNode : null;
    const focusNode = selection ? selection.focusNode : null;
    const anchorTag = describeSelectionNode(anchorNode);
    const focusTag = describeSelectionNode(focusNode);
    const activeTag =
      document && document.activeElement && document.activeElement.tagName
        ? String(document.activeElement.tagName)
        : "";
    let userSelect = "";
    try {
      const el =
        anchorNode && anchorNode.nodeType === 1
          ? anchorNode
          : anchorNode && anchorNode.parentElement
            ? anchorNode.parentElement
            : null;
      if (el && window.getComputedStyle) {
        userSelect = String(window.getComputedStyle(el).userSelect || "");
      }
    } catch (err) {}
    const normalized = text.replace(/\s+/g, " ").trim();
    const sample = normalized ? normalized.slice(0, 120) : "";
    let sssPopupDefined = false;
    let sssPopupPresent = false;
    try {
      sssPopupDefined = typeof customElements !== "undefined" && !!customElements.get("sss-popup");
    } catch (err) {}
    try {
      sssPopupPresent = !!document.querySelector("sss-popup");
    } catch (err) {}
    return {
      length,
      collapsed,
      anchorTag,
      focusTag,
      activeTag,
      userSelect,
      sample,
      sssPopupDefined,
      sssPopupPresent,
    };
  }

    function getSelectionPopupState() {
      const popup = document.getElementById("__lp_selection_search_popup");
      const trigger = document.getElementById("__lp_selection_search_trigger");
      return {
        popupVisible: !!(popup && popup.style.display !== "none"),
        triggerVisible: !!(trigger && trigger.style.display !== "none"),
      };
    }

    function pushSelectionDebugEntry(eventName, extra = {}) {
      if (!isSidebarContext()) return;
      const summary = getSelectionSummary();
      const popupState = getSelectionPopupState();
      const entry = {
        at: new Date().toISOString(),
        event: eventName,
        length: summary.length,
        collapsed: summary.collapsed,
        anchor: summary.anchorTag,
        focus: summary.focusTag,
        active: summary.activeTag,
        userSelect: summary.userSelect,
        sample: summary.sample,
        sssPopupDefined: summary.sssPopupDefined,
        sssPopupPresent: summary.sssPopupPresent,
        popupVisible: popupState.popupVisible,
        triggerVisible: popupState.triggerVisible,
        ...extra,
      };
    sidebarSelectionDebugLog.push(entry);
    if (sidebarSelectionDebugLog.length > SIDEBAR_SELECTION_DEBUG_MAX) {
      sidebarSelectionDebugLog.splice(
        0,
        sidebarSelectionDebugLog.length - SIDEBAR_SELECTION_DEBUG_MAX,
      );
    }
  }

  function scheduleSelectionChangeLog() {
    if (sidebarSelectionDebounceTimer) {
      clearTimeout(sidebarSelectionDebounceTimer);
    }
    sidebarSelectionDebounceTimer = setTimeout(() => {
      sidebarSelectionDebounceTimer = null;
      const summary = getSelectionSummary();
      const signature = [
        summary.length,
        summary.collapsed ? "1" : "0",
        summary.anchorTag,
        summary.focusTag,
      ].join("|");
      if (signature === sidebarSelectionLastSignature) return;
      sidebarSelectionLastSignature = signature;
      pushSelectionDebugEntry("selectionchange");
    }, 120);
  }

  function sanitizeSelectionText(raw) {
    return String(raw || "").replace(/\s+/g, " ").trim().slice(0, 500);
  }

    function getSelectionText() {
      const selection = window.getSelection ? window.getSelection() : null;
      return selection ? sanitizeSelectionText(selection.toString()) : "";
    }

    function getSelectionBlockReason() {
      if (!selectionSearchPopupSettings || selectionSearchPopupSettings.enabled !== true) {
        return "disabled";
      }
      const selection = window.getSelection ? window.getSelection() : null;
      if (!selection) return "no-selection";
      if (selection.isCollapsed) return "collapsed";
      if (!selectionSearchPopupSettings.allowOnEditable) {
        if (isNodeInsideEditable(selection.anchorNode) || isNodeInsideEditable(selection.focusNode)) {
          return "editable-blocked";
        }
      }
      const text = sanitizeSelectionText(selection.toString());
      if (!text) return "empty";
      const length = text.length;
      const minChars = Number.isFinite(selectionSearchPopupSettings.minChars)
        ? selectionSearchPopupSettings.minChars
        : 0;
      const maxChars = Number.isFinite(selectionSearchPopupSettings.maxChars)
        ? selectionSearchPopupSettings.maxChars
        : 0;
      if (minChars > 0 && length < minChars) return "min-chars";
      if (maxChars > 0 && length > maxChars) return "max-chars";
      return "";
    }

    function shouldShowSelectionPopup() {
      if (!selectionSearchPopupSettings || selectionSearchPopupSettings.enabled !== true) return false;
      const selection = window.getSelection ? window.getSelection() : null;
      if (!selection || selection.isCollapsed) return false;
      if (!selectionSearchPopupSettings.allowOnEditable) {
        if (isNodeInsideEditable(selection.anchorNode) || isNodeInsideEditable(selection.focusNode)) {
          return false;
        }
      }
      const text = sanitizeSelectionText(selection.toString());
      if (!text) return false;
      const length = text.length;
      const minChars = Number.isFinite(selectionSearchPopupSettings.minChars)
        ? selectionSearchPopupSettings.minChars
        : 0;
      const maxChars = Number.isFinite(selectionSearchPopupSettings.maxChars)
        ? selectionSearchPopupSettings.maxChars
        : 0;
      if (minChars > 0 && length < minChars) return false;
      if (maxChars > 0 && length > maxChars) return false;
      return true;
    }

  function getSelectionRect() {
    const selection = window.getSelection ? window.getSelection() : null;
    if (!selection || selection.rangeCount === 0) return null;
    try {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect && rect.width >= 0 && rect.height >= 0) return rect;
    } catch (err) {}
    return null;
  }

    function openSelectionSearchUrl(url, action) {
      if (!url) return;
      if (action === "same-tab") {
        pushSelectionDebugEntry("selection-open-url", { action, url, target: "same-tab" });
        window.location.href = url;
        return;
      }
      const active = action !== "new-background-tab";
      try {
        if (extensionApi && extensionApi.runtime && extensionApi.runtime.sendMessage) {
          pushSelectionDebugEntry("selection-open-url", { action, url, target: active ? "tab" : "background-tab" });
          extensionApi.runtime.sendMessage({ type: "selection-search-open-url", url, active }).catch(() => {});
          return;
        }
      } catch (_err) {}
      pushSelectionDebugEntry("selection-open-url", { action, url, target: active ? "tab" : "window-open" });
      window.open(url, active ? "_blank" : "_self");
    }

    function buildSelectionSearchUrl(entry, query) {
      if (!entry) return "";
      if (entry.type === "open-link") {
        const raw = query.trim();
        if (!raw) return "";
        try {
          if (/^https?:\/\//i.test(raw)) {
            return new URL(raw).toString();
          }
          return new URL(`https://${raw}`).toString();
        } catch (_err) {
          return "";
        }
      }
      if (entry.type === "engine") {
        const rawUrl = entry.url || "";
        if (!rawUrl) return "";
        const encoded = encodeURIComponent(query);
        if (/%s/i.test(rawUrl)) return rawUrl.replace(/%s/gi, encoded);
        if (/\{searchTerms\}/i.test(rawUrl)) return rawUrl.replace(/\{searchTerms\}/gi, encoded);
        return rawUrl + encoded;
      }
      return "";
    }

    function handleSelectionEngineActivate(entry, button) {
      if (!entry) return;
      const query = getSelectionText();
      if (!query) return;
      if (entry.type === "copy") {
        pushSelectionDebugEntry("selection-copy", { engineId: entry.id || "", engineType: entry.type || "" });
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(query).catch(() => {});
        }
        if (selectionSearchPopupSettings.hideOnEngineClick) {
          hideSelectionSearchPopup();
          hideSelectionSearchTrigger();
        }
        return;
      }
      const action = button === 1
        ? selectionSearchPopupSettings.middleClickAction
        : (button === 2 ? selectionSearchPopupSettings.rightClickAction : selectionSearchPopupSettings.leftClickAction);
      const url = buildSelectionSearchUrl(entry, query);
      pushSelectionDebugEntry("selection-engine", {
        engineId: entry.id || "",
        engineType: entry.type || "",
        action,
        url,
      });
      if (url) openSelectionSearchUrl(url, action);
      if (selectionSearchPopupSettings.hideOnEngineClick) {
        hideSelectionSearchPopup();
        hideSelectionSearchTrigger();
      }
    }

    function ensureSelectionSearchPopup() {
      if (!isSidebarContext()) return null;
      if (!selectionSearchPopupSettings.enabled) return null;
      let popup = document.getElementById("__lp_selection_search_popup");
      const signature = JSON.stringify({
        settings: selectionSearchPopupSettings,
        engines: selectionSearchEnginesList.map((entry) => ({
          id: entry.id,
          name: entry.name,
          type: entry.type,
          iconUrl: entry.iconUrl,
          showPopup: entry.showPopup,
          shortcut: entry.shortcut,
        })),
      });
      if (popup && selectionSearchPopupSignature === signature) return popup;
      selectionSearchPopupSignature = signature;
      popup = document.createElement("div");
      popup.id = "__lp_selection_search_popup";
      popup.style.cssText = "position:fixed;z-index:2147483001;display:none;flex-direction:column;align-items:stretch;gap:8px;width:min(240px,calc(100vw - 20px));max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);padding:10px;border-radius:14px;border:1px solid rgba(255,255,255,0.12);background:linear-gradient(180deg,rgba(23,26,38,0.99),rgba(13,15,23,0.99));color:#eef2ff;font-size:12px;font-weight:600;box-shadow:0 20px 46px rgba(0,0,0,0.5);overflow:hidden;";
      const duration = Number.isFinite(selectionSearchPopupSettings.animationMs)
        ? selectionSearchPopupSettings.animationMs
        : 100;
      popup.style.transition = `opacity ${duration}ms ease, transform ${duration}ms ease`;
      popup.style.opacity = "0";
      popup.style.transform = "translateY(8px) scale(0.985)";

      const header = document.createElement("div");
      header.style.cssText = "display:flex;flex-direction:column;gap:3px;padding:2px 2px 4px;cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none;";
      const title = document.createElement("div");
      title.textContent = "SSS Sidebar";
      title.style.cssText = "font-size:13px;font-weight:700;color:#ffffff;";
      const subtitle = document.createElement("div");
      subtitle.textContent = "Pilih enjin carian untuk teks terpilih.";
      subtitle.style.cssText = "font-size:11px;color:rgba(255,255,255,0.6);";
      header.append(title, subtitle);
      popup.appendChild(header);

      const options = document.createElement("div");
      options.style.cssText = "display:flex;flex-direction:column;gap:5px;flex:1 1 auto;max-height:min(calc(100vh - 92px),320px);overflow-y:auto;padding-right:2px;";
      popup.appendChild(options);
      selectionSearchEnginesList.forEach((entry) => {
        if (!entry) return;
        if (entry.type === "separator") {
          const sep = document.createElement("div");
          sep.style.cssText = "height:1px;background:rgba(255,255,255,0.08);margin:3px 0;";
          options.appendChild(sep);
          return;
        }
        if (entry.type === "group") {
          const group = document.createElement("div");
          group.textContent = entry.name || "Group";
          group.style.cssText = "padding:3px 2px 1px;color:rgba(255,255,255,0.48);font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;";
          options.appendChild(group);
          return;
        }
        if (entry.showPopup !== true) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:9px 11px;border-radius:11px;border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.03);color:#edf2ff;font-size:12px;cursor:pointer;text-align:left;transition:background 0.14s ease,border-color 0.14s ease,transform 0.14s ease;user-select:none;-webkit-user-select:none;touch-action:manipulation;";
        btn.addEventListener("mouseenter", () => {
          btn.style.background = "rgba(255,214,51,0.12)";
          btn.style.borderColor = "rgba(255,214,51,0.24)";
          btn.style.transform = "translateY(-1px)";
        });
        btn.addEventListener("mouseleave", () => {
          btn.style.background = "rgba(255,255,255,0.03)";
          btn.style.borderColor = "rgba(255,255,255,0.06)";
          btn.style.transform = "translateY(0)";
        });

        const left = document.createElement("span");
        left.style.cssText = "display:inline-flex;align-items:center;gap:8px;min-width:0;flex:1 1 auto;";
        left.style.pointerEvents = "none";
        if (entry.iconUrl) {
          const icon = document.createElement("img");
          icon.src = entry.iconUrl;
          icon.alt = "";
          icon.style.cssText = "width:16px;height:16px;border-radius:4px;object-fit:cover;flex:0 0 auto;";
          left.appendChild(icon);
        } else {
          const bullet = document.createElement("span");
          bullet.textContent = (entry.name || "S").slice(0, 1).toUpperCase();
          bullet.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:999px;background:rgba(255,214,51,0.16);color:#ffe38a;font-size:10px;font-weight:700;flex:0 0 auto;";
          left.appendChild(bullet);
        }
        const text = document.createElement("span");
        text.textContent = entry.name || "Engine";
        text.style.cssText = "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600;";
        left.appendChild(text);

        const shortcut = document.createElement("span");
        shortcut.textContent = entry.shortcut ? entry.shortcut.toUpperCase() : "";
        shortcut.style.cssText = "flex:0 0 auto;padding:2px 6px;border-radius:999px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.55);font-size:10px;font-weight:700;min-width:22px;text-align:center;";
        shortcut.style.pointerEvents = "none";

        btn.append(left, shortcut);
        btn.addEventListener("mousedown", (ev) => {
          if (typeof ev.button === "number" && ev.button === 0) {
            ev.preventDefault();
          }
        });
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          handleSelectionEngineActivate(entry, 0);
        });
        btn.addEventListener("auxclick", (ev) => {
          if (typeof ev.button !== "number" || ev.button !== 1) return;
          ev.preventDefault();
          ev.stopPropagation();
          handleSelectionEngineActivate(entry, 1);
        });
        btn.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          handleSelectionEngineActivate(entry, 2);
        });
        btn.addEventListener("dragstart", (ev) => {
          ev.preventDefault();
        });
        options.appendChild(btn);
      });
      attachSelectionSearchPopupDrag(popup, header);
      (document.body || document.documentElement).appendChild(popup);
      return popup;
    }

    function clampSelectionPopupPosition(element, left, top) {
      const margin = 8;
      const width = Math.max(
        Number(element && element.offsetWidth) || 0,
        Number(element && element.scrollWidth) || 0,
        160,
      );
      const height = Math.max(
        Number(element && element.offsetHeight) || 0,
        Number(element && element.scrollHeight) || 0,
        120,
      );
      const maxLeft = Math.max(margin, window.innerWidth - width - margin);
      const maxTop = Math.max(margin, window.innerHeight - height - margin);
      return {
        left: Math.max(margin, Math.min(left, maxLeft)),
        top: Math.max(margin, Math.min(top, maxTop)),
      };
    }

    function applySelectionPopupPosition(element, left, top) {
      if (!element) return;
      const next = clampSelectionPopupPosition(element, left, top);
      element.style.left = next.left + "px";
      element.style.top = next.top + "px";
    }

    function normalizeSelectionPopupPosition(value) {
      if (!value || typeof value !== "object") return null;
      const left = Number(value.left);
      const top = Number(value.top);
      if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
      return { left, top };
    }

    function persistSelectionPopupManualPosition() {
      if (
        !selectionSearchPopupManualPosition
        || !extensionApi
        || !extensionApi.storage
        || !extensionApi.storage.local
        || !extensionApi.storage.local.set
      ) {
        return;
      }
      const payload = {
        [SELECTION_POPUP_POSITION_KEY]: {
          left: selectionSearchPopupManualPosition.left,
          top: selectionSearchPopupManualPosition.top,
        },
      };
      try {
        const maybePromise = extensionApi.storage.local.set(payload);
        if (maybePromise && typeof maybePromise.catch === "function") {
          maybePromise.catch(() => {});
        }
      } catch (err) {
        try {
          extensionApi.storage.local.set(payload, () => {
            void (extensionApi.runtime && extensionApi.runtime.lastError);
          });
        } catch (innerErr) {}
      }
    }

    function loadSelectionPopupManualPosition() {
      if (selectionSearchPopupPositionLoaded || selectionSearchPopupPositionLoadPending) return;
      selectionSearchPopupPositionLoadPending = true;
      readLocalStorageValue(SELECTION_POPUP_POSITION_KEY, (value) => {
        selectionSearchPopupPositionLoadPending = false;
        selectionSearchPopupPositionLoaded = true;
        if (!selectionSearchPopupManualPosition) {
          selectionSearchPopupManualPosition = normalizeSelectionPopupPosition(value);
        }
        const popup = document.getElementById("__lp_selection_search_popup");
        if (
          popup
          && popup.style.display !== "none"
          && selectionSearchPopupManualPosition
        ) {
          applySelectionPopupPosition(
            popup,
            selectionSearchPopupManualPosition.left,
            selectionSearchPopupManualPosition.top,
          );
        }
      });
    }

    function attachSelectionSearchPopupDrag(popup, handle) {
      if (!popup || !handle || popup.__lpDragBound) return;
      popup.__lpDragBound = true;
      let dragPointerId = null;
      let dragStartX = 0;
      let dragStartY = 0;
      let dragOriginLeft = 0;
      let dragOriginTop = 0;

      const finishDrag = (event) => {
        if (dragPointerId === null) return;
        if (event && typeof event.pointerId === "number" && event.pointerId !== dragPointerId) return;
        if (handle.releasePointerCapture) {
          try {
            handle.releasePointerCapture(dragPointerId);
          } catch (err) {
            // ignore
          }
        }
        dragPointerId = null;
        handle.style.cursor = "grab";
        persistSelectionPopupManualPosition();
      };

      handle.addEventListener("pointerdown", (event) => {
        if (!popup.isConnected || popup.style.display === "none") return;
        if (typeof event.button === "number" && event.button !== 0) return;
        if (event.target && typeof event.target.closest === "function" && event.target.closest("button, input, select, textarea, a")) {
          return;
        }
        event.preventDefault();
        const rect = popup.getBoundingClientRect();
        dragPointerId = typeof event.pointerId === "number" ? event.pointerId : 1;
        dragStartX = Number.isFinite(event.clientX) ? event.clientX : rect.left;
        dragStartY = Number.isFinite(event.clientY) ? event.clientY : rect.top;
        dragOriginLeft = rect.left;
        dragOriginTop = rect.top;
        handle.style.cursor = "grabbing";
        if (handle.setPointerCapture) {
          try {
            handle.setPointerCapture(dragPointerId);
          } catch (err) {
            // ignore
          }
        }
      });

      handle.addEventListener("pointermove", (event) => {
        if (dragPointerId === null) return;
        if (typeof event.pointerId === "number" && event.pointerId !== dragPointerId) return;
        event.preventDefault();
        const clientX = Number.isFinite(event.clientX) ? event.clientX : dragStartX;
        const clientY = Number.isFinite(event.clientY) ? event.clientY : dragStartY;
        const nextLeft = dragOriginLeft + (clientX - dragStartX);
        const nextTop = dragOriginTop + (clientY - dragStartY);
        const clamped = clampSelectionPopupPosition(popup, nextLeft, nextTop);
        selectionSearchPopupManualPosition = { left: clamped.left, top: clamped.top };
        popup.style.left = clamped.left + "px";
        popup.style.top = clamped.top + "px";
      });

      handle.addEventListener("pointerup", finishDrag);
      handle.addEventListener("pointercancel", finishDrag);
    }

    function ensureSelectionSearchTrigger() {
      if (!isSidebarContext()) return null;
      if (!selectionSearchPopupSettings.enabled) return null;
      let trigger = document.getElementById("__lp_selection_search_trigger");
      const signature = JSON.stringify({
        enabled: selectionSearchPopupSettings.enabled,
        behavior: selectionSearchPopupSettings.openBehavior,
      });
      if (trigger && selectionSearchTriggerSignature === signature) return trigger;
      selectionSearchTriggerSignature = signature;
      trigger = document.createElement("button");
      trigger.id = "__lp_selection_search_trigger";
      trigger.type = "button";
      trigger.textContent = "SSS";
      trigger.style.cssText = "position:fixed;z-index:2147483001;display:none;align-items:center;justify-content:center;min-width:48px;min-height:34px;padding:6px 12px;border-radius:999px;border:1px solid rgba(255,214,51,0.26);background:linear-gradient(180deg,rgba(26,29,44,0.98),rgba(14,16,26,0.96));color:#fff1bf;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 16px 34px rgba(0,0,0,0.42);";
      trigger.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        showSelectionSearchPopup(true);
      });
      (document.body || document.documentElement).appendChild(trigger);
      return trigger;
    }

    function hideSelectionSearchPopup() {
      const popup = document.getElementById("__lp_selection_search_popup");
      if (!popup) return;
      popup.style.opacity = "0";
      popup.style.transform = "translateY(4px)";
      popup.style.display = "none";
      pushSelectionDebugEntry("popup-hide", { reason: "hide-popup" });
    }

    function hideSelectionSearchTrigger() {
      const trigger = document.getElementById("__lp_selection_search_trigger");
      if (!trigger) return;
      trigger.style.display = "none";
      pushSelectionDebugEntry("popup-trigger-hide", { reason: "hide-trigger" });
    }

    function positionSelectionElement(element) {
      if (!element) return;
      if (selectionSearchPopupManualPosition) {
        applySelectionPopupPosition(
          element,
          selectionSearchPopupManualPosition.left,
          selectionSearchPopupManualPosition.top,
        );
        return;
      }
      let left = 8;
      let top = 8;
      const rect = getSelectionRect();
      if (selectionSearchPopupSettings.location === "cursor"
        && selectionSearchLastPointer
        && Number.isFinite(selectionSearchLastPointer.x)
        && Number.isFinite(selectionSearchLastPointer.y)) {
        left = selectionSearchLastPointer.x;
        top = selectionSearchLastPointer.y;
      } else if (rect) {
        left = rect.left + Math.min(rect.width / 2, 12);
        top = rect.bottom + 8;
        if (top + element.offsetHeight + 8 > window.innerHeight && rect.top - element.offsetHeight - 8 >= 8) {
          top = rect.top - element.offsetHeight - 8;
        }
      }
      applySelectionPopupPosition(element, left, top);
    }

    function showSelectionSearchPopup(force) {
      if (!selectionSearchPopupSettings.enabled) return;
      if (selectionSearchPopupSettings.openBehavior === "manual" && !force) return;
      const popup = ensureSelectionSearchPopup();
      if (!popup) return;
      if (!shouldShowSelectionPopup()) {
        const reason = getSelectionBlockReason();
        pushSelectionDebugEntry("popup-blocked", { reason });
        hideSelectionSearchPopup();
        return;
      }
      popup.style.visibility = "hidden";
      popup.style.pointerEvents = "none";
      popup.style.display = "flex";
      positionSelectionElement(popup);
      popup.style.visibility = "visible";
      popup.style.pointerEvents = "auto";
      popup.style.opacity = "1";
      popup.style.transform = "translateY(0px) scale(1)";
      pushSelectionDebugEntry("popup-show", { reason: force ? "force" : "auto" });
      hideSelectionSearchTrigger();
    }

    function showSelectionSearchTrigger() {
      if (!selectionSearchPopupSettings.enabled) return;
      if (selectionSearchPopupSettings.openBehavior !== "manual") return;
      if (!shouldShowSelectionPopup()) return;
      const trigger = ensureSelectionSearchTrigger();
      if (!trigger) return;
      positionSelectionElement(trigger);
      trigger.style.display = "flex";
      pushSelectionDebugEntry("popup-trigger-show", { reason: "manual" });
    }

    function scheduleSelectionPopupUpdate(forceOpen) {
      if (selectionSearchPopupTimer) clearTimeout(selectionSearchPopupTimer);
      if (!selectionSearchPopupSettings.enabled) {
        hideSelectionSearchPopup();
        hideSelectionSearchTrigger();
        return;
      }
      if (!shouldShowSelectionPopup()) {
        pushSelectionDebugEntry("popup-blocked", { reason: getSelectionBlockReason() });
        hideSelectionSearchPopup();
        hideSelectionSearchTrigger();
        return;
      }
      if (selectionSearchPopupSettings.openBehavior === "manual" && !forceOpen) {
        pushSelectionDebugEntry("popup-trigger-ready", { reason: "manual" });
        hideSelectionSearchPopup();
        showSelectionSearchTrigger();
        return;
      }
      hideSelectionSearchTrigger();
      const delay = Number.isFinite(selectionSearchPopupSettings.delayMs) ? selectionSearchPopupSettings.delayMs : 0;
      pushSelectionDebugEntry("popup-scheduled", { delayMs: delay });
      selectionSearchPopupTimer = setTimeout(() => showSelectionSearchPopup(true), delay);
    }

    function buildSelectionDebugReport() {
      const popupState = getSelectionPopupState();
      const popupSettings = selectionSearchPopupSettings || {};
      const engines = Array.isArray(selectionSearchEnginesList) ? selectionSearchEnginesList : [];
      const popupEngineCount = engines.filter((entry) => entry && entry.showPopup === true).length;
      const contextMenuCount = engines.filter((entry) => entry && entry.showContextMenu === true).length;
      const header = [
        "Local Pocket Sidebar Selection Debug",
        "Generated: " + new Date().toISOString(),
        "URL: " + String(window.location.href || ""),
        "User agent: " + String(navigator.userAgent || ""),
        "Visibility: " + String(document.visibilityState || ""),
        "Popup enabled: " + String(popupSettings.enabled !== false),
        "Open behavior: " + String(popupSettings.openBehavior || "auto"),
        "Popup location: " + String(popupSettings.location || "cursor"),
        "Min chars: " + String(Number.isFinite(popupSettings.minChars) ? popupSettings.minChars : 0),
        "Max chars: " + String(Number.isFinite(popupSettings.maxChars) ? popupSettings.maxChars : 0),
        "Delay (ms): " + String(Number.isFinite(popupSettings.delayMs) ? popupSettings.delayMs : 0),
        "Allow editable: " + String(popupSettings.allowOnEditable === true),
        "Hide on scroll: " + String(popupSettings.hideOnScroll !== false),
        "Hide on right click: " + String(popupSettings.hideOnRightClick !== false),
        "Hide on engine click: " + String(popupSettings.hideOnEngineClick !== false),
        "Allow shortcuts without popup: " + String(popupSettings.allowShortcutsWithoutPopup !== false),
        "Popup animation (ms): " + String(Number.isFinite(popupSettings.animationMs) ? popupSettings.animationMs : 0),
        "Popup visible: " + String(popupState.popupVisible),
        "Trigger visible: " + String(popupState.triggerVisible),
        "Engines (popup): " + String(popupEngineCount),
        "Engines (context menu): " + String(contextMenuCount),
        "Events: " + sidebarSelectionDebugLog.length,
        "",
      ].join("\n");
      const extraKeys = [
        "button",
        "pointerType",
        "defaultPrevented",
        "key",
        "reason",
        "action",
        "engineId",
        "engineType",
        "url",
        "target",
        "delayMs",
        "shortcut",
        "popupVisible",
        "triggerVisible",
        "sssPopupDefined",
        "sssPopupPresent",
      ];
    const lines = sidebarSelectionDebugLog.map((entry, index) => {
      const parts = [
        String(index + 1).padStart(3, "0"),
        entry.at,
        entry.event,
        "len=" + entry.length,
        "collapsed=" + (entry.collapsed ? "1" : "0"),
        "anchor=" + (entry.anchor || "-"),
        "focus=" + (entry.focus || "-"),
        "active=" + (entry.active || "-"),
        entry.userSelect ? "userSelect=" + entry.userSelect : "",
        entry.sample ? "sample=\"" + entry.sample + "\"" : "",
      ].filter(Boolean);
      for (const key of extraKeys) {
        if (!Object.prototype.hasOwnProperty.call(entry, key)) continue;
        const value = entry[key];
        if (value === null || value === undefined || value === "") continue;
        parts.push(String(key) + "=" + String(value));
      }
      return parts.join(" ");
    });
    return header + lines.join("\n");
  }

  async function copySelectionDebugReportToClipboard() {
    const report = buildSelectionDebugReport();
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(report);
      return true;
    }
    const textarea = document.createElement("textarea");
    textarea.value = report;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  }

  function ensureSelectionDebugButton() {
    const existing = document.getElementById("__lp_sidebar_selection_debug_btn");
    if (!isSidebarContext() || !shouldShowSelectionDebugButton()) {
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }
      return;
    }
    if (existing) return;
    const btn = document.createElement("button");
    btn.id = "__lp_sidebar_selection_debug_btn";
    btn.type = "button";
    btn.textContent = "Copy selection log";
    btn.title = "Copy sidebar selection debug log";
    btn.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:2147483000;padding:6px 10px;border-radius:12px;border:1px solid rgba(110,160,255,0.55);background:rgba(30,45,90,0.65);color:#cfe1ff;font-size:12px;font-weight:600;cursor:pointer;backdrop-filter:blur(6px);";
    btn.addEventListener("mouseenter", () => {
      btn.style.background = "rgba(45,70,140,0.75)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "rgba(30,45,90,0.65)";
    });
    btn.addEventListener("click", async () => {
      try {
        const ok = await copySelectionDebugReportToClipboard();
        btn.textContent = ok ? "Log copied" : "Copy failed";
      } catch (err) {
        btn.textContent = "Copy failed";
      }
      setTimeout(() => {
        btn.textContent = "Copy selection log";
      }, 1200);
    });
    (document.body || document.documentElement).appendChild(btn);
  }

  function shouldShowSelectionDebugButton() {
    try {
      const params = new URLSearchParams(window.location.search || "");
      if (params.get("lp_debug") === "1" || params.get("lp_selection_debug") === "1") {
        return true;
      }
    } catch (err) {}
    try {
      return window.localStorage.getItem("__lp_show_sidebar_selection_debug_btn") === "1";
    } catch (err) {}
    return false;
  }

  function ensureSidebarFocusPort() {
    if (!isSidebarContext()) return;
    if (sidebarFocusPort) return;
    if (!extensionApi || !extensionApi.runtime || !extensionApi.runtime.connect) return;
    const now = Date.now();
    if (now < sidebarFocusPortNextAllowedConnectAt) return;
    if (document && document.visibilityState === "hidden") return;
    try {
      const port = extensionApi.runtime.connect({ name: "lp-sidebar-chatgpt-focus" });
      sidebarFocusPort = port;
      sidebarFocusPortReconnectDelayMs = 300;
      sidebarFocusPortNextAllowedConnectAt = 0;
      port.onMessage.addListener((message) => {
        if (!message || message.type !== "focus-input") return;
        dispatchSyntheticF6Twice(80);
        suppressAutoFocusUntil = 0;
        const focused = focusSidebarPromptInput({
          skipSyntheticF6: true,
        });
        reportSidebarFocusStatus(focused);
        if (!focused) {
          attemptFocus();
          requestNativeF6Fallback("sidebar-port-focus-missed");
        }
        setTimeout(() => {
          const stillFocused = isSidebarPromptInputFocused();
          reportSidebarFocusStatus(stillFocused);
          if (!stillFocused) {
            requestNativeF6Fallback("sidebar-port-focus-postcheck");
          }
        }, 350);
      });
      port.onDisconnect.addListener(() => {
        sidebarFocusPort = null;
        const now = Date.now();
        if (now - sidebarFocusPortLastDisconnectAt < 2000) {
          sidebarFocusPortReconnectDelayMs = Math.min(
            5000,
            Math.max(300, sidebarFocusPortReconnectDelayMs * 2),
          );
        } else {
          sidebarFocusPortReconnectDelayMs = 300;
        }
        sidebarFocusPortLastDisconnectAt = now;
        sidebarFocusPortNextAllowedConnectAt = now + sidebarFocusPortReconnectDelayMs;
        if (sidebarFocusPortReconnectTimer) {
          clearTimeout(sidebarFocusPortReconnectTimer);
        }
        sidebarFocusPortReconnectTimer = setTimeout(() => {
          sidebarFocusPortReconnectTimer = null;
          ensureSidebarFocusPort();
        }, sidebarFocusPortReconnectDelayMs);
      });
    } catch (err) {
      sidebarFocusPort = null;
    }
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
    } catch (err) {}
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
    try {
      if (typeof input.click === "function") {
        input.click();
      }
    } catch (err) {}
    try {
      input.focus({ preventScroll: true });
    } catch (err) {
      try {
        input.focus();
      } catch (err2) {
        return false;
      }
    }
    try {
      input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      input.dispatchEvent(new Event("focusin", { bubbles: true }));
    } catch (err) {}
    placeCaretAtEnd(input);
    queueCaretPlacement(input);
    return activeElementMatchesPromptInput(input);
  }

  function activateComposerSurface() {
    const candidates = [];
    const pushIfVisible = (el) => {
      if (!el || !isElementVisible(el)) return;
      if (isInsideSwitcherHost(el)) return;
      candidates.push(el);
    };
    try {
      const composerNodes = document.querySelectorAll("[data-testid], [aria-label], [placeholder], [data-placeholder], form, main");
      for (const el of composerNodes) {
        const isComposerLike =
          matchesTextHint(el, "data-testid", "composer")
          || matchesTextHint(el, "data-testid", "prompt")
          || matchesTextHint(el, "aria-label", "ask")
          || matchesTextHint(el, "placeholder", "ask")
          || matchesTextHint(el, "data-placeholder", "ask")
          || matchesTextHint(el, "aria-label", "message")
          || matchesTextHint(el, "placeholder", "message");
        if (!isComposerLike) continue;
        pushIfVisible(el);
      }
    } catch (err) {
      return false;
    }
    if (!candidates.length) return false;
    const ranked = candidates
      .map((el) => {
        const rect = el.getBoundingClientRect();
        let score = 0;
        if (rect.bottom > window.innerHeight * 0.55) score += 600;
        score += Math.max(0, Math.min(280, rect.width / 4));
        score += Math.max(0, Math.min(220, rect.height));
        return { el, score };
      })
      .sort((a, b) => b.score - a.score);
    const target = ranked[0] && ranked[0].el ? ranked[0].el : null;
    if (!target) return false;
    try {
      target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      if (typeof target.click === "function") target.click();
      return true;
    } catch (err) {
      return false;
    }
  }

  function isAltQuoteFocusShortcut(event) {
    if (!event) return false;
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
    return event.code === "Quote" || event.key === "'";
  }

  function readLocalStorageValue(key, done) {
    const finish = (value) => {
      try {
        done(value);
      } catch (err) {}
    };
    if (!extensionApi || !extensionApi.storage || !extensionApi.storage.local || !extensionApi.storage.local.get) {
      finish(null);
      return;
    }
    try {
      const maybePromise = extensionApi.storage.local.get(key);
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise
          .then((result) => {
            if (!result || typeof result !== "object") {
              finish(null);
              return;
            }
            finish(result[key]);
          })
          .catch(() => finish(null));
        return;
      }
      if (maybePromise && typeof maybePromise === "object") {
        finish(maybePromise[key]);
        return;
      }
    } catch (err) {}
    try {
      extensionApi.storage.local.get(key, (result) => {
        const err = extensionApi.runtime && extensionApi.runtime.lastError;
        if (err || !result || typeof result !== "object") {
          finish(null);
          return;
        }
        finish(result[key]);
      });
    } catch (err) {
      finish(null);
    }
  }

  loadSelectionPopupManualPosition();

  function loadSidebarFocusSettings() {
    readLocalStorageValue(SETTINGS_KEY, (value) => {
      applySidebarFocusSettings(value);
    });
  }

  function normalizeFocusSignalValue(rawValue) {
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return numeric;
  }

  function focusSidebarPromptInput(options = {}) {
    if (!isSidebarContext()) return false;
    if (!options.skipSyntheticF6) {
      dispatchSyntheticF6Twice(Number.isFinite(options.delayMs) ? options.delayMs : 80);
    }
    const input = findPromptInput();
    if (!input) {
      if (!options.skipComposerActivation) {
        activateComposerSurface();
      }
      return false;
    }
    suppressAutoFocusUntil = 0;
    const focused = focusPromptInput(input);
    if (!focused && !options.skipComposerActivation) {
      activateComposerSurface();
    }
    return focused;
  }

  function isSidebarPromptInputFocused() {
    if (!isSidebarContext()) return false;
    const input = findPromptInput();
    if (!input) return false;
    return activeElementMatchesPromptInput(input);
  }

  let windowHasOsFocus = document.hasFocus();
  window.addEventListener("focus", () => {
    windowHasOsFocus = true;
    reportSidebarFocusStatus(activeElementMatchesPromptInput(getFocusablePromptInput()));
  });
  window.addEventListener("blur", () => {
    windowHasOsFocus = false;
    reportSidebarFocusStatus(activeElementMatchesPromptInput(getFocusablePromptInput()));
  });

  function reportSidebarFocusStatus(focused) {
    sendRuntimeMessage({
      type: "sidebar-focus-status",
      focused: !!focused,
      osFocused: !!(focused && windowHasOsFocus),
    }).catch(() => {});
  }

  function requestNativeF6Fallback(reason) {
    setTimeout(() => {
      if (isSidebarPromptInputFocused()) return;
      sendRuntimeMessage({
        type: "sidebar-native-f6-request",
        reason: reason || "sidebar-input-not-focused",
      }).catch(() => {});
    }, 200);
  }

  function triggerSidebarInputFocusFromSignal() {
    if (!isSidebarContext()) return false;
    const focused = focusSidebarPromptInput();
    if (!focused) {
      attemptFocus();
    }
    return focused;
  }

  function applySidebarFocusSignal(rawValue) {
    const signal = normalizeFocusSignalValue(rawValue);
    if (!signal) return false;
    if (signal <= lastSidebarFocusSignal) return false;
    lastSidebarFocusSignal = signal;
    return triggerSidebarInputFocusFromSignal();
  }

  function checkPendingSidebarFocusSignal() {
    if (!isSidebarContext()) return;
    readLocalStorageValue(SIDEBAR_CHAT_FOCUS_SIGNAL_KEY, (value) => {
      applySidebarFocusSignal(value);
    });
  }

  function isInsideSwitcherHost(targetOrEvent) {
    if (!targetOrEvent) return false;
    const target = targetOrEvent.target ? targetOrEvent.target : targetOrEvent;
    const host = document.getElementById("lp-sidebar-provider-switcher-host");
    if (!host) return false;
    if (host.contains(target)) return true;
    if (targetOrEvent.composedPath) {
      const path = targetOrEvent.composedPath();
      for (const el of path) {
        if (el === host || el === host.shadowRoot) return true;
      }
    }
    if (host.shadowRoot && host.shadowRoot.contains(target)) return true;
    return false;
  }

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

  function ensureSidebarTextSelectionEnabled() {
    if (!isSidebarContext()) return;
    const STYLE_ID = "__lp_sidebar_force_text_selection";
    if (document.getElementById(STYLE_ID)) return;

    // Observer hanya perhatikan direct children document.body (bukan subtree penuh)
    // supaya tidak fire pada setiap DOM mutation dalam AI chat yang sangat kerap
    sidebarTextSelectionObserver = new MutationObserver(() => disableSkipToContentLinks());
    sidebarTextSelectionObserver.observe(document.body || document.documentElement, { childList: true });
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
  }

  // Ensure text selection is always possible in sidebar context
  // ── Butang "Ai" biru untuk teks yang dipilih dalam sidebar/overlay AI ──
  function initAiSelectionButton() {
    if (window.__lpAiSelBtnInstalled) return;
    window.__lpAiSelBtnInstalled = true;

    let _aiSelContainer = null;
    let _lastSelText = "";
    let _selMouseDown = false;

    function _showAiSelBtn(rect) {
      if (!_aiSelContainer) {
        _aiSelContainer = document.createElement("div");
        _aiSelContainer.id = "__lp_ai_sel_btn";
        _aiSelContainer.style.cssText = [
          "position:fixed",
          "z-index:2147483647",
          "display:flex",
          "align-items:center",
          "pointer-events:auto",
          "transition:opacity 0.15s ease,transform 0.15s cubic-bezier(0.175,0.885,0.32,1.275)"
        ].join(";");

        const btn = document.createElement("button");
        btn.textContent = "Ai";
        btn.title = "Hantar teks ke AI";
        btn.setAttribute("type", "button");
        btn.style.cssText = [
          "width:34px",
          "height:34px",
          "border-radius:50%",
          "background:rgba(59,130,246,0.95)",
          "color:#fff",
          "border:2px solid rgba(255,255,255,0.4)",
          "box-shadow:0 4px 12px rgba(0,0,0,0.35)",
          "font-family:'Orbitron','Rajdhani',sans-serif",
          "font-size:13px",
          "font-weight:700",
          "cursor:pointer",
          "display:flex",
          "align-items:center",
          "justify-content:center",
          "padding:0",
          "margin:0",
          "transition:transform 0.15s ease,background 0.15s ease"
        ].join(";");

        btn.addEventListener("mouseenter", () => {
          btn.style.transform = "scale(1.12)";
          btn.style.background = "#2563eb";
        });
        btn.addEventListener("mouseleave", () => {
          btn.style.transform = "scale(1)";
          btn.style.background = "rgba(59,130,246,0.95)";
        });
        btn.addEventListener("mousedown", (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          const text = _lastSelText;
          if (!text) return;
          try { window.parent.postMessage({ type: "__lp_ai_sel_send", text: text }, "*"); } catch (_) {}
          try {
            const api = typeof browser !== "undefined" ? browser : (typeof chrome !== "undefined" ? chrome : null);
            if (api && api.runtime) api.runtime.sendMessage({ type: "open-ai-sidebar-with-prompt", prompt: text }).catch(() => {});
          } catch (_) {}
          btn.textContent = "✓";
          btn.style.background = "#10b981";
          setTimeout(() => { btn.textContent = "Ai"; btn.style.background = "rgba(59,130,246,0.95)"; _hideAiSelBtn(); }, 900);
        });

        _aiSelContainer.appendChild(btn);
        document.body.appendChild(_aiSelContainer);
      }

      const w = 34, h = 34, sp = 10;
      let top = rect.bottom + sp;
      let left = rect.left + rect.width / 2 - w / 2;
      if (top + h > window.innerHeight - sp) top = rect.top - h - sp;
      left = Math.max(sp, Math.min(left, window.innerWidth - w - sp));

      _aiSelContainer.style.top = top + "px";
      _aiSelContainer.style.left = left + "px";
      _aiSelContainer.style.opacity = "1";
      _aiSelContainer.style.transform = "scale(1)";
      _aiSelContainer.style.display = "flex";
    }

    function _hideAiSelBtn() {
      if (!_aiSelContainer) return;
      _aiSelContainer.style.opacity = "0";
      _aiSelContainer.style.transform = "scale(0.8)";
      setTimeout(() => {
        if (_aiSelContainer && _aiSelContainer.style.opacity === "0") _aiSelContainer.style.display = "none";
      }, 150);
    }

    function _checkSelection() {
      const sel = window.getSelection ? window.getSelection() : null;
      if (!sel) { _hideAiSelBtn(); return; }
      const text = sel.toString().trim();
      if (!text) { _hideAiSelBtn(); return; }
      _lastSelText = text;
      try {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) { _hideAiSelBtn(); return; }
        _showAiSelBtn(rect);
      } catch (_) { _hideAiSelBtn(); }
    }

    document.addEventListener("selectionchange", () => {
      if (_selMouseDown) return;
      setTimeout(_checkSelection, 0);
    }, { passive: true });
    document.addEventListener("mouseup", (e) => {
      _selMouseDown = false;
      if (e.button === 0) setTimeout(_checkSelection, 0);
    }, { passive: true });
    document.addEventListener("mousedown", (e) => {
      if (e.button === 0) _selMouseDown = true;
      if (_aiSelContainer && e.target && !_aiSelContainer.contains(e.target)) {
        const sel = window.getSelection ? window.getSelection() : null;
        if (!sel || sel.isCollapsed) _hideAiSelBtn();
      }
    }, { passive: true });
    window.addEventListener("scroll", _hideAiSelBtn, { passive: true });
  }

  if (isSidebarContext()) {
    loadSidebarFocusSettings();
    ensureSidebarTextSelectionEnabled();
    initAiSelectionButton();

    // Pause auto-focus briefly when user clicks non-input areas (typically for text selection).
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!isSidebarContext()) return;
        if (isInsideSwitcherHost(event.target)) return;
        if (isEventInsideEditable(event)) return;
        suppressAutoFocusUntil = Date.now() + 1200;
      },
      true
    );

    // Some ChatGPT key handlers can swallow copy operations in sidebar mode.
    // Ensure selected non-input text is always copied to clipboard.
    document.addEventListener(
      "copy",
      (event) => {
        if (!isSidebarContext()) return;
        const selection = window.getSelection ? window.getSelection() : null;
        if (!selection || selection.isCollapsed) return;
        if (isNodeInsideEditable(selection.anchorNode) || isNodeInsideEditable(selection.focusNode)) {
          return;
        }

        const selectedText = selection.toString();
        if (!selectedText) return;
        if (!event.clipboardData || typeof event.clipboardData.setData !== "function") return;

        event.clipboardData.setData("text/plain", selectedText);
        event.preventDefault();
        event.stopPropagation();
      },
      true
    );

    document.addEventListener("selectionchange", () => {
      if (!isSidebarContext()) return;
      scheduleSelectionChangeLog();
      if (selectionSearchMouseDown) {
        pushSelectionDebugEntry("popup-wait-mouseup", { reason: "selectionchange-during-mousedown" });
        return;
      }
      setTimeout(() => {
        scheduleSelectionPopupUpdate(false);
      }, 0);
    });
    document.addEventListener("mouseup", (event) => {
      if (!isSidebarContext()) return;
      pushSelectionDebugEntry("mouseup", {
        button: typeof event.button === "number" ? event.button : null,
        defaultPrevented: !!event.defaultPrevented,
      });
      if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
        selectionSearchLastPointer = { x: event.clientX, y: event.clientY };
      }
      selectionSearchMouseDown = false;
      if (event && event.button === 0) {
        setTimeout(() => {
          scheduleSelectionPopupUpdate(false);
        }, 0);
      }
    });
    document.addEventListener("mousedown", (event) => {
      if (!isSidebarContext()) return;
      if (isInsideSwitcherHost(event.target)) return;
      pushSelectionDebugEntry("mousedown", {
        button: typeof event.button === "number" ? event.button : null,
        defaultPrevented: !!event.defaultPrevented,
      });
      if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
        selectionSearchLastPointer = { x: event.clientX, y: event.clientY };
      }
      if (!event || event.button === 0) {
        selectionSearchMouseDown = true;
      }
      const popup = document.getElementById("__lp_selection_search_popup");
      if (popup && event && popup.contains(event.target)) return;
      if (!shouldShowSelectionPopup()) {
        hideSelectionSearchPopup();
        hideSelectionSearchTrigger();
      }
    }, true);
    document.addEventListener("pointerdown", (event) => {
      if (!isSidebarContext()) return;
      if (isInsideSwitcherHost(event.target)) return;
      pushSelectionDebugEntry("pointerdown", {
        button: typeof event.button === "number" ? event.button : null,
        pointerType: event.pointerType || "",
        defaultPrevented: !!event.defaultPrevented,
      });
      if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
        selectionSearchLastPointer = { x: event.clientX, y: event.clientY };
      }
      const popup = document.getElementById("__lp_selection_search_popup");
      if (popup && event && popup.contains(event.target)) return;
      if (!shouldShowSelectionPopup()) {
        hideSelectionSearchPopup();
        hideSelectionSearchTrigger();
      }
    }, true);
    document.addEventListener("contextmenu", (event) => {
      if (!isSidebarContext()) return;
      if (selectionSearchPopupSettings.hideOnRightClick) {
        pushSelectionDebugEntry("popup-hide-right-click", { reason: "right-click" });
        hideSelectionSearchPopup();
        hideSelectionSearchTrigger();
      }
    }, true);
    window.addEventListener("scroll", () => {
      if (!isSidebarContext()) return;
      if (selectionSearchPopupSettings.hideOnScroll) {
        pushSelectionDebugEntry("popup-hide-scroll", { reason: "scroll" });
        hideSelectionSearchPopup();
        hideSelectionSearchTrigger();
      }
    }, true);
    document.addEventListener("keyup", (event) => {
      if (!isSidebarContext()) return;
      if (isEventInsideEditable(event)) return;
      const key = event && event.key ? String(event.key) : "";
      pushSelectionDebugEntry("keyup", {
        key,
        defaultPrevented: !!event.defaultPrevented,
      });
      if (!selectionSearchPopupSettings.enabled) return;
      if (!key || key.length > 2) return;
      if (!selectionSearchPopupSettings.allowShortcutsWithoutPopup) {
        const popup = document.getElementById("__lp_selection_search_popup");
        if (!popup || popup.style.display === "none") return;
      }
      if (!shouldShowSelectionPopup()) return;
      const normalizedKey = key.length === 1 ? key.toUpperCase() : key.toUpperCase();
      const match = selectionSearchEnginesList.find((entry) => {
        return entry
          && entry.type !== "separator"
          && entry.type !== "group"
          && entry.showPopup === true
          && entry.shortcut
          && entry.shortcut.toUpperCase() === normalizedKey;
      });
      if (!match) {
        pushSelectionDebugEntry("shortcut-miss", { shortcut: normalizedKey });
        return;
      }
      pushSelectionDebugEntry("shortcut-hit", { shortcut: normalizedKey, engineId: match.id || "" });
      handleSelectionEngineActivate(match, 0);
    });
    document.addEventListener("contextmenu", (event) => {
      if (!isSidebarContext()) return;
      pushSelectionDebugEntry("contextmenu", {
        button: typeof event.button === "number" ? event.button : null,
        defaultPrevented: !!event.defaultPrevented,
      });
    }, true);
    ensureSelectionDebugButton();
  }

  function normalizePromptComparable(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function getPromptInputAdapters() {
    return [
      {
        id: "prompt-textarea",
        boost: 2400,
        selectors: [
          "#prompt-textarea",
          "textarea#prompt-textarea",
          "textarea[data-testid='prompt-textarea']",
          "div#prompt-textarea[contenteditable='true']"
        ]
      },
      {
        id: "composer-input",
        boost: 1800,
        selectors: [
          "[data-testid='composer-input'] #prompt-textarea",
          "[data-testid='composer-input'] textarea",
          "[data-testid='composer-input'] [contenteditable='true']",
          "[data-testid='composer-input'] div[role='textbox']"
        ]
      },
      {
        id: "textbox-role",
        boost: 950,
        selectors: [
          "div[contenteditable='true'][role='textbox']",
          "form [contenteditable='true'][role='textbox']",
          "[contenteditable='true'][data-testid*='prompt' i]",
          "[contenteditable='true'][data-testid*='composer' i]"
        ]
      },
      {
        id: "generic-editable",
        boost: 280,
        selectors: [
          "form textarea",
          "[contenteditable='true']",
          "textarea"
        ]
      }
    ];
  }

  function rankPromptCandidate(el, adapter) {
    const id = (el.id || "").toLowerCase();
    const dataTestId = (el.getAttribute("data-testid") || "").toLowerCase();
    const role = (el.getAttribute("role") || "").toLowerCase();
    const tag = el.tagName ? String(el.tagName).toUpperCase() : "";
    const rect = el.getBoundingClientRect();
    let score = Number(adapter && adapter.boost ? adapter.boost : 0);
    if (id.includes("prompt-textarea")) score += 2000;
    if (dataTestId.includes("prompt")) score += 1200;
    if (dataTestId.includes("composer")) score += 1000;
    if (role === "textbox") score += 600;
    if (tag === "TEXTAREA") score += 400;
    if (rect.bottom > window.innerHeight * 0.55) score += 300;
    score += Math.max(0, Math.min(260, rect.bottom));
    score += Math.max(0, Math.min(120, rect.width / 6));
    return score;
  }

  function findPromptInputDetails() {
    const adapters = getPromptInputAdapters();
    const seen = new Set();
    const candidates = [];

    const pushCandidate = (el, adapter) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      if (!isUsablePromptInput(el)) return;
      candidates.push({
        el,
        adapterId: adapter && adapter.id ? adapter.id : "unknown",
        score: rankPromptCandidate(el, adapter || null)
      });
    };

    for (const adapter of adapters) {
      for (const selector of adapter.selectors) {
        const nodes = document.querySelectorAll(selector);
        for (const el of nodes) {
          pushCandidate(el, adapter);
        }
      }
    }

    const placeholderNodes = document.querySelectorAll("p[data-placeholder], [data-placeholder]");
    for (const node of placeholderNodes) {
      if (!node || !node.closest) continue;
      const editable = node.closest(
        "#prompt-textarea, textarea#prompt-textarea, textarea[data-testid='prompt-textarea'], [data-testid='composer-input'] [contenteditable='true'], div[contenteditable='true'][role='textbox'], [contenteditable='true'], textarea"
      );
      pushCandidate(editable, { id: "placeholder-proxy", boost: 820 });
    }

    if (!candidates.length) {
      return { input: null, adapterId: "none", score: 0 };
    }
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    return {
      input: best && best.el ? best.el : null,
      adapterId: best && best.adapterId ? best.adapterId : "unknown",
      score: best && Number.isFinite(best.score) ? best.score : 0
    };
  }

  function findPromptInput() {
    const details = findPromptInputDetails();
    return details && details.input ? details.input : null;
  }

  function readPromptValue(target) {
    if (!target) return "";
    if (target.isContentEditable) {
      return target.textContent || target.innerText || "";
    }
    return typeof target.value === "string" ? target.value : "";
  }

  function setPromptValue(target, val) {
    if (!target) return false;
    try {
      const nextValue = String(val || "");
      if (target.isContentEditable) {
        // ProseMirror/React editors don't respond to textContent assignment.
        // Use execCommand('insertText') which goes through native input handling
        // and is recognized by ProseMirror's input rules.
        target.focus();
        // Select all existing content first
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.selectNodeContents(target);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        // Use execCommand to insert text (works with ProseMirror)
        const inserted = document.execCommand("insertText", false, nextValue);
        if (!inserted) {
          // Fallback: clear and set textContent, then dispatch comprehensive events
          target.textContent = nextValue;
          target.dispatchEvent(new Event("input", { bubbles: true }));
        }
        // Dispatch events to notify React/ProseMirror of the change
        target.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        target.value = nextValue;
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  function findSendButtonCandidate() {
    const selectors = [
      "button[data-testid='send-button']",
      "button[data-testid='composer-send-button']",
      "button[data-testid*='send' i]",
      "button[aria-label='Send prompt']",
      "button[aria-label='Send message']",
      "button[aria-label*='send' i]"
    ];
    for (const selector of selectors) {
      const button = document.querySelector(selector);
      if (!button || button.disabled) continue;
      if (!isElementVisible(button)) continue;
      return button;
    }
    return null;
  }

  function clickSendButton() {
    const button = findSendButtonCandidate();
    if (!button) return false;
    try {
      button.click();
      return true;
    } catch (err) {
      return false;
    }
  }

  function submitViaEnter(target) {
    if (!target) return false;
    const eventInit = {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    };
    try {
      const down = new KeyboardEvent("keydown", eventInit);
      const press = new KeyboardEvent("keypress", eventInit);
      const up = new KeyboardEvent("keyup", eventInit);
      target.dispatchEvent(down);
      target.dispatchEvent(press);
      target.dispatchEvent(up);
      return true;
    } catch (err) {
      return false;
    }
  }

  function getComposerHealth() {
    const details = findPromptInputDetails();
    const input = details && details.input ? details.input : null;
    if (!input) {
      return { ok: false, reason: "input-not-found", adapterId: "none", input: null, sendButton: null };
    }
    if (!isUsablePromptInput(input)) {
      return { ok: false, reason: "input-not-usable", adapterId: details.adapterId, input, sendButton: null };
    }
    const sendButton = findSendButtonCandidate();
    const canSubmitByEnter = input.isContentEditable || (input.tagName && String(input.tagName).toUpperCase() === "TEXTAREA");
    if (!sendButton && !canSubmitByEnter) {
      return { ok: false, reason: "submit-path-not-found", adapterId: details.adapterId, input, sendButton: null };
    }
    return {
      ok: true,
      reason: "",
      adapterId: details.adapterId,
      input,
      sendButton,
      canSubmitByEnter
    };
  }

  async function copyTextToClipboard(text) {
    const value = String(text || "");
    if (!value) return false;
    try {
      if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (err) {}
    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "readonly");
      area.style.position = "fixed";
      area.style.opacity = "0";
      area.style.pointerEvents = "none";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.focus();
      area.select();
      const ok = document.execCommand ? document.execCommand("copy") : false;
      if (area.parentNode) area.parentNode.removeChild(area);
      return !!ok;
    } catch (err) {
      return false;
    }
  }

  function notifySubmitFallback(sessionId, reason, copied, details) {
    // Notifikasi injection gagal – gantikan silent failure dengan log yang boleh dikesan
    notifyInjectionFailure(reason || "unknown", {
      sessionId: sessionId || "",
      adapterId: details && details.adapterId ? String(details.adapterId) : "",
      attempts: details && Number.isFinite(details.attempts) ? details.attempts : 0
    });
    try {
      const payload = {
        type: "summary-autofill-fallback",
        payload: {
          provider: "chatgpt",
          sessionId: sessionId || "",
          reason: reason || "unknown",
          copied: !!copied,
          adapterId: details && details.adapterId ? String(details.adapterId) : "",
          attempts: details && Number.isFinite(details.attempts) ? details.attempts : 0
        }
      };
      const maybe = extensionApi.runtime.sendMessage(payload);
      if (maybe && typeof maybe.then === "function") {
        maybe.catch(() => {});
      }
    } catch (err) {}
  }

  function fallbackReasonMessage(reason) {
    const key = String(reason || "").trim().toLowerCase();
    switch (key) {
      case "input-not-found":
        return "Kotak input chat tidak dijumpai";
      case "input-not-usable":
        return "Kotak input dijumpai tetapi tidak boleh digunakan";
      case "input-low-confidence":
        return "Struktur halaman berubah (input dikesan dengan keyakinan rendah)";
      case "submit-path-not-found":
        return "Butang atau laluan hantar mesej tidak dijumpai";
      case "composer-not-ready":
        return "Composer belum siap dimuat";
      case "set-prompt-failed":
        return "Prompt gagal dipaste ke kotak input";
      case "prompt-verify-failed":
        return "Semakan semula gagal: prompt tidak masuk lengkap";
      case "submit-trigger-failed":
        return "Trigger hantar mesej tidak berjaya";
      default:
        return "Ralat automasi tidak diketahui";
    }
  }

  function buildFallbackCauseText(reason) {
    const key = String(reason || "").trim().toLowerCase();
    const base = fallbackReasonMessage(key);
    if (!key || key === "unknown") return base;
    return `${base} (kod: ${key})`;
  }

  function showManualSubmitFallback(promptText, reason, copied) {
    const now = Date.now();
    if (now - lastManualSubmitFallbackAt < MANUAL_SUBMIT_FALLBACK_COOLDOWN_MS) {
      return;
    }
    lastManualSubmitFallbackAt = now;

    const existing = document.getElementById(MANUAL_SUBMIT_FALLBACK_ID);
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    const wrap = document.createElement("div");
    wrap.id = MANUAL_SUBMIT_FALLBACK_ID;
    wrap.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:2147483647",
      "max-width:440px",
      "width:min(92vw,440px)",
      "background:#0f172a",
      "color:#e2e8f0",
      "border:1px solid rgba(148,163,184,0.35)",
      "border-radius:12px",
      "box-shadow:0 10px 35px rgba(0,0,0,0.35)",
      "padding:12px 12px 10px 12px",
      "font:13px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
    ].join(";");

    const title = document.createElement("div");
    title.textContent = "Auto-submit tidak stabil, guna mode manual";
    title.style.cssText = "font-weight:700;font-size:13px;margin-bottom:6px;color:#f8fafc;";

    const hint = document.createElement("div");
    const causeText = buildFallbackCauseText(reason);
    hint.textContent = copied
      ? `Prompt sudah disalin ke clipboard. Tampal (Ctrl+V) dan hantar manual. Punca: ${causeText}.`
      : `Auto-submit gagal. Salin prompt di bawah, tampal, dan hantar manual. Punca: ${causeText}.`;
    hint.style.cssText = "opacity:0.92;margin-bottom:8px;";

    const preview = document.createElement("textarea");
    preview.readOnly = true;
    preview.value = String(promptText || "");
    preview.style.cssText = "width:100%;min-height:86px;max-height:180px;border:1px solid rgba(148,163,184,0.4);background:#020617;color:#cbd5e1;border-radius:8px;padding:8px;resize:vertical;font:12px/1.45 ui-monospace,Consolas,monospace;";

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:8px;";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.textContent = "Salin Prompt";
    copyBtn.style.cssText = "border:1px solid rgba(125,211,252,0.5);background:#082f49;color:#bae6fd;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;";
    copyBtn.addEventListener("click", async () => {
      const ok = await copyTextToClipboard(preview.value);
      copyBtn.textContent = ok ? "Disalin" : "Gagal Salin";
    });

    const copyCauseBtn = document.createElement("button");
    copyCauseBtn.type = "button";
    copyCauseBtn.textContent = "Salin Punca";
    copyCauseBtn.style.cssText = "border:1px solid rgba(251,191,36,0.6);background:#451a03;color:#fde68a;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;";
    copyCauseBtn.addEventListener("click", async () => {
      const ok = await copyTextToClipboard(causeText);
      copyCauseBtn.textContent = ok ? "Punca Disalin" : "Gagal Salin";
    });

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "Tutup";
    closeBtn.style.cssText = "border:1px solid rgba(148,163,184,0.45);background:transparent;color:#cbd5e1;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;";
    closeBtn.addEventListener("click", () => {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    });

    actions.append(copyBtn, copyCauseBtn, closeBtn);
    wrap.append(title, hint, preview, actions);
    (document.body || document.documentElement).appendChild(wrap);
  }

  function stopSubmitLoop() {
    if (submitLoopTimer) {
      clearInterval(submitLoopTimer);
      submitLoopTimer = null;
    }
    _submissionInProgress = false;
  }

  function sendSubmittedSignal(sessionId) {
    if (!sessionId) return;
    try {
      extensionApi.runtime.sendMessage({
        type: "summary-session-submitted",
        payload: { sessionId, chatUrl: window.location.href }
      });
    } catch (err) {}

    let attempts = 0;
    const urlTimer = setInterval(() => {
      attempts++;
      if (window.location.href.includes("/c/")) {
        clearInterval(urlTimer);
        try {
          extensionApi.runtime.sendMessage({
            type: "summary-session-complete",
            payload: { sessionId, chatUrl: window.location.href }
          });
        } catch (err) {}
      } else if (attempts > 120) {
        clearInterval(urlTimer);
      }
    }, 1000);
  }

  function startSubmitLoop(promptText, sessionId) {
    const prompt = String(promptText || "");
    if (!prompt.trim()) return;

    // Hard lock: jangan mulakan loop baru jika satu sudah berjalan
    if (submitLoopTimer || _submissionInProgress) {
      return;
    }
    _submissionInProgress = true;
    let attempts = 0;
    const maxAttempts = 28;
    let finished = false;
    const normalizedSessionId = sessionId ? String(sessionId) : "";
    const aiCategorySession = isAiCategorySession(normalizedSessionId);

    const failToManual = (reason, details) => {
      if (finished) return;
      finished = true;
      _submissionInProgress = false;
      stopSubmitLoop();
      (async () => {
        if (normalizedSessionId) {
          lastAppliedSessionId = normalizedSessionId; // Guard against re-submission
          await sendRuntimeMessage({
            type: "consume-pending-sidebar-prompt",
            sessionId: normalizedSessionId
          });
        }
        if (aiCategorySession) {
          await sendAiCategoryClassificationError(normalizedSessionId, reason, details || {});
          return;
        }
        const copied = await copyTextToClipboard(prompt);
        showManualSubmitFallback(prompt, reason, copied);
        notifySubmitFallback(sessionId, reason, copied, details || {});
      })();
    };

    submitLoopTimer = setInterval(() => {
      if (finished) return;
      attempts += 1;
      const health = getComposerHealth();
      if (!health.ok) {
        if (attempts % 6 === 0) {
          activateComposerSurface();
          attemptFocus();
        }
        if (attempts >= maxAttempts) {
          failToManual(health.reason || "composer-not-ready", {
            attempts,
            adapterId: health.adapterId || "none"
          });
        }
        return;
      }

      const input = health.input;
      if (!focusPromptInput(input) && attempts % 4 === 0) {
        activateComposerSurface();
      }

      const filled = setPromptValue(input, prompt);
      if (!filled) {
        if (attempts >= maxAttempts) {
          failToManual("set-prompt-failed", { attempts, adapterId: health.adapterId });
        }
        return;
      }

      const readBack = normalizePromptComparable(readPromptValue(input));
      const expected = normalizePromptComparable(prompt);
      const expectedSample = expected.slice(0, Math.min(120, expected.length));
      const verified = !!readBack && (readBack === expected || (expectedSample && readBack.includes(expectedSample)));
      if (!verified) {
        if (attempts >= maxAttempts) {
          failToManual("prompt-verify-failed", { attempts, adapterId: health.adapterId });
        }
        return;
      }

      setTimeout(() => {
        if (finished) return;
        const sent = clickSendButton() || submitViaEnter(input);
        if (sent) {
          // Kunci segera supaya setInterval tick berikut tidak re-fill
          finished = true;
          // Verify prompt actually left input after a short wait
          setTimeout(function verifySubmit() {
            _submissionInProgress = false;
            stopSubmitLoop();
            if (normalizedSessionId) {
              lastAppliedSessionId = normalizedSessionId;
              sendRuntimeMessage({
                type: "consume-pending-sidebar-prompt",
                sessionId: normalizedSessionId
              }).catch(() => {});
            }
            if (aiCategorySession) {
              startAiCategoryResultPolling(normalizedSessionId);
            } else if (normalizedSessionId.startsWith("ai-overlay:")) {
              startOverlayResultPolling(normalizedSessionId);
            } else {
              sendSubmittedSignal(sessionId);
            }
          }, 180);
          return;
        }
        if (attempts >= maxAttempts) {
          failToManual("submit-trigger-failed", { attempts, adapterId: health.adapterId });
        }
      }, 250);
    }, 180);
  }

  function checkPendingPrompt() {
    return new Promise((resolve) => {
      const requestPayload = { type: "peek-pending-sidebar-prompt" };
      let resolved = false;
      const finish = (applied) => {
        if (resolved) return;
        resolved = true;
        resolve(!!applied);
      };
      const handleResponse = (response) => {
        if (!response || response.hasPendingPrompt !== true) { finish(false); return; }
        const provider = response.provider ? String(response.provider).trim().toLowerCase() : "";
        if (provider !== "chatgpt") { finish(false); return; }
        const sessionId = response.sessionId ? String(response.sessionId) : "";
        const isOverlay = sessionId.startsWith("ai-overlay:");
        if (!isOverlay && !isSidebarContext() && !sessionId) { finish(false); return; }
        // Guard: jangan submit semula sesi yang sama atau kalau loop sedang berjalan
        if (submitLoopTimer || _submissionInProgress) { finish(false); return; }
        if (sessionId && sessionId === lastAppliedSessionId) { finish(false); return; }
        if (response.prompt) {
          startSubmitLoop(response.prompt, response.sessionId);
          finish(true);
        } else {
          finish(false);
        }
      };
      try {
        const maybePromise = extensionApi.runtime.sendMessage(requestPayload);
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then(handleResponse).catch(() => finish(false));
          return;
        }
        if (maybePromise && typeof maybePromise === "object" && Object.prototype.hasOwnProperty.call(maybePromise, "hasPendingPrompt")) {
          handleResponse(maybePromise);
          return;
        }
      } catch (err) {}
      try {
        extensionApi.runtime.sendMessage(requestPayload, (response) => {
          if (extensionApi.runtime && extensionApi.runtime.lastError) {
            finish(false);
            return;
          }
          handleResponse(response);
        });
      } catch (err) { finish(false); }
    });
  }

  function attemptFocus() {
    if (!isSidebarContext()) return;
    let attempts = 0;
    const maxAttempts = 100; // Increased to allow ~15 seconds for slow network loads
    const timer = setInterval(() => {
      attempts += 1;
      if (!isSidebarContext()) {
        clearInterval(timer);
        return;
      }

      if (Date.now() < suppressAutoFocusUntil || hasActiveSelection()) {
        if (attempts >= maxAttempts) {
          clearInterval(timer);
        }
        return;
      }

      // Cooldown check to prevent focus fight
      const now = Date.now();
      if (now - lastFocusAttemptAt < FOCUS_COOLDOWN_MS) {
        return;
      }
      lastFocusAttemptAt = now;

      if (isTextEditableElement(getDeepActiveElement())) {
        clearInterval(timer);
        return;
      }

      const activeEl = getDeepActiveElement();
      if (activeEl && isInsideSwitcherHost(activeEl)) {
        clearInterval(timer);
        return;
      }

      try { window.focus(); } catch (err) {}

      const input = findPromptInput();
      if (input) {
        const focused = focusPromptInput(input);
        // If it got focus, or we've tried too many times, stop
        if (focused || attempts >= maxAttempts) {
          clearInterval(timer);
        }
      } else if (attempts >= maxAttempts) {
        clearInterval(timer);
      } else if (attempts % 8 === 0) {
        activateComposerSurface();
      }
    }, 150);
  }

  // Auto-focus when returning to the sidebar
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      dispatchSyntheticF6Twice(80);
      ensureSidebarFocusPort();
      attemptFocus();
      checkPendingSidebarFocusSignal();
    }
  });
  window.addEventListener("focus", () => {
    setTimeout(() => {
      dispatchSyntheticF6Twice(80);
      ensureSidebarFocusPort();
      attemptFocus();
      checkPendingSidebarFocusSignal();
    }, 120);
  });

  if (
    extensionApi &&
    extensionApi.runtime &&
    extensionApi.runtime.onMessage &&
    !window.__lpSidebarFocusMessageListenerInstalled
  ) {
    window.__lpSidebarFocusMessageListenerInstalled = true;
    extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (
        !message
        || (
          message.type !== "focus-chatgpt-sidebar-input"
          && message.type !== "focus-sidebar-ai-input"
          && message.type !== "check-pending-prompt"
          && message.type !== "copy-sidebar-selection-debug-log"
          && message.type !== "selection-search-copy-selection"
          )
        ) return;
        if (message.type === "check-pending-prompt") {
          // Guard: jangan check kalau submission sedang berjalan
          if (submitLoopTimer || _submissionInProgress) {
            if (sendResponse) sendResponse({ ok: true, applied: false, busy: true });
            return true;
          }
          checkPendingPrompt().then((applied) => {
            if (sendResponse) sendResponse({ ok: true, applied: !!applied });
          }).catch(() => {
            if (sendResponse) sendResponse({ ok: false, error: "check-failed" });
          });
          return true;
        }
        if (message.type === "copy-sidebar-selection-debug-log") {
        try {
          copySelectionDebugReportToClipboard()
            .then((ok) => {
              if (sendResponse) sendResponse({ ok: !!ok });
            })
            .catch(() => {
              if (sendResponse) sendResponse({ ok: false });
            });
        } catch (err) {
          if (sendResponse) sendResponse({ ok: false });
        }
          return true;
        }
        if (message.type === "selection-search-copy-selection") {
          const selectionText = message && typeof message.text === "string"
            ? sanitizeSelectionText(message.text)
            : getSelectionText();
          if (!selectionText) {
            if (sendResponse) sendResponse({ ok: false });
            return false;
          }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(selectionText)
              .then(() => {
                if (sendResponse) sendResponse({ ok: true });
              })
              .catch(() => {
                if (sendResponse) sendResponse({ ok: false });
              });
            return true;
          }
          if (sendResponse) sendResponse({ ok: false });
          return false;
        }
      if (!isSidebarContext()) {
        if (sendResponse) sendResponse({ ok: false, reason: "not-sidebar-context" });
        return false;
      }
      try { window.focus(); } catch (err) {}
      dispatchSyntheticF6Twice(80);
      const focused = focusSidebarPromptInput({
        skipSyntheticF6: true,
      });
      if (!focused) {
        attemptFocus();
      }
      if (sendResponse) sendResponse({ ok: focused });
      return false;
    });
  }

  if (
    extensionApi &&
    extensionApi.storage &&
    extensionApi.storage.onChanged &&
    !window.__lpSidebarFocusStorageListenerInstalled
  ) {
    window.__lpSidebarFocusStorageListenerInstalled = true;
    extensionApi.storage.onChanged.addListener((changes, areaName) => {
      if (!isSidebarContext()) return;
      if (areaName && areaName !== "local") return;
      if (changes && changes[SETTINGS_KEY]) {
        const nextSettings = changes[SETTINGS_KEY];
        applySidebarFocusSettings(
          nextSettings && Object.prototype.hasOwnProperty.call(nextSettings, "newValue")
            ? nextSettings.newValue
            : null,
        );
      }
      if (!changes || !changes[SIDEBAR_CHAT_FOCUS_SIGNAL_KEY]) return;
      const next = changes[SIDEBAR_CHAT_FOCUS_SIGNAL_KEY];
      const nextValue = next && Object.prototype.hasOwnProperty.call(next, "newValue")
        ? next.newValue
        : null;
      applySidebarFocusSignal(nextValue);
    });
  }

  // Catch any typing anywhere in the document and redirect to the input
  document.addEventListener("keydown", (e) => {
    if (!isSidebarContext()) return;
    if (e.defaultPrevented) return;
    if (isAltQuoteFocusShortcut(e)) {
      const input = findPromptInput();
      if (input) {
        suppressAutoFocusUntil = 0;
        focusPromptInput(input);
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (hasActiveSelection()) return;
    if (isEventInsideEditable(e)) {
      return; // Already focused on a valid input field
    }

    // If it's a printable character or backspace, grab focus
    if (e.key.length === 1 || e.key === "Backspace" || e.key === "Enter") {
      const input = findPromptInput();
      if (input) {
        suppressAutoFocusUntil = 0;
        focusPromptInput(input);
      }
    }
  });

  // Check on load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      try { window.focus(); } catch (err) {}
      dispatchSyntheticF6Twice(500);
      ensureSidebarFocusPort();
      checkPendingPrompt();
      attemptFocus();
      checkPendingSidebarFocusSignal();
    });
  } else {
    try { window.focus(); } catch (err) {}
    dispatchSyntheticF6Twice(500);
    ensureSidebarFocusPort();
    checkPendingPrompt();
    attemptFocus();
    checkPendingSidebarFocusSignal();
  }

  // Storage event should be enough, but keep a lightweight poll as fallback.
  if (isSidebarContext()) {
    window.addEventListener("beforeunload", () => {
      if (sidebarFocusPortReconnectTimer) {
        clearTimeout(sidebarFocusPortReconnectTimer);
        sidebarFocusPortReconnectTimer = null;
      }
      sidebarFocusPortNextAllowedConnectAt = 0;
      if (sidebarFocusPort) {
        try {
          sidebarFocusPort.disconnect();
        } catch (err) {}
        sidebarFocusPort = null;
      }
      stopAiCategoryResultPolling();
      stopSubmitLoop();
      if (sidebarTextSelectionObserver) {
        sidebarTextSelectionObserver.disconnect();
        sidebarTextSelectionObserver = null;
      }
      if (typeof _sidebarFocusPollTimer !== "undefined") {
        clearInterval(_sidebarFocusPollTimer);
        _sidebarFocusPollTimer = null;
      }
    }, { once: true });
    var pendingCheckCount = 0;
    var _sidebarFocusPollTimer = setInterval(() => {
      ensureSidebarFocusPort();
      checkPendingSidebarFocusSignal();
      // Hanya check pending prompt jika tiada submit loop sedang berjalan
      if (pendingCheckCount < 60 && !submitLoopTimer && !_submissionInProgress) {
        pendingCheckCount++;
        checkPendingPrompt();
      }
      if (!isTextEditableElement(getDeepActiveElement()) && Date.now() >= suppressAutoFocusUntil && !hasActiveSelection()) {
        attemptFocus();
      }
    }, 1200);


  }

  // Overlay retry: poll for pending overlay prompt even in non-sidebar (hidden tab) context
  // Gunakan adaptive interval: mula 400ms, naik ke 1200ms selepas idle
  if (!isSidebarContext()) {
    var overlayPendingCount = 0;
    var overlayIdleTicks = 0;
    var overlayCurrentInterval = 400;
    var scheduleOverlayPoll = function() {
      overlayPollTimer = setTimeout(async function () {
        overlayPendingCount++;
        if (overlayPendingCount > 180) { overlayPollTimer = null; return; }
        // Jangan check kalau loop sedang berjalan
        if (!submitLoopTimer && !_submissionInProgress) {
          const applied = await checkPendingPrompt().catch(() => false);
          if (applied) {
            overlayIdleTicks = 0;
            overlayCurrentInterval = 400;
          } else {
            overlayIdleTicks++;
            if (overlayIdleTicks >= 3 && overlayCurrentInterval < 1200) {
              overlayCurrentInterval = 1200;
            }
          }
        }
        scheduleOverlayPoll();
      }, overlayCurrentInterval);
    };
    var overlayPollTimer = null;
    scheduleOverlayPoll();
  }

  // Listen for postMessage dari overlay parent untuk trigger check prompt segera
  window.addEventListener("message", function(event) {
    if (!event || !event.data) return;
    if (event.data.type === "__lp_check_pending_prompt") {
      // Hanya trigger jika tiada submit loop sedang berjalan
      if (!submitLoopTimer && !_submissionInProgress) {
        checkPendingPrompt();
        setTimeout(function() { if (!submitLoopTimer) checkPendingPrompt(); }, 300);
        setTimeout(function() { if (!submitLoopTimer) checkPendingPrompt(); }, 800);
      }
    }
    if (event.data.type === "__lp_trigger_focus") {
      attemptFocus();
    }
    if (event.data.type === "__lp_selection_search_toggle") {
      const enabled = event.data.enabled !== false;
      if (selectionSearchPopupSettings) {
        selectionSearchPopupSettings.enabled = enabled;
      }
      if (!enabled) {
        hideSelectionSearchPopup();
        hideSelectionSearchTrigger();
      }
    }
  });
})();
