(function () {
  if (typeof window === "undefined") return;
  const isNarrowFrame = typeof window !== "undefined" && typeof window.innerWidth === "number" && window.innerWidth < 900;
  if (window !== window.top && !isNarrowFrame) return;
  if (window.__lpInstalled) return;
  window.__lpInstalled = true;

  const extensionApi = typeof browser !== "undefined" ? browser : chrome;
  if (!extensionApi || !extensionApi.runtime || !extensionApi.runtime.sendMessage) return;

  // ---------------------------------------------------------------------------
  // Shared module integration (aiContentScriptShared.js)
  // Fungsi-fungsi BARU yang ditambah dari shared module — tidak menimpa
  // fungsi-fungsi sedia ada dalam fail ini supaya tidak ada konflik nama.
  // ---------------------------------------------------------------------------
  const _sh = window.__lpAiShared || {};

  // Injection failure notification — BARU, tiada dalam fail asal
  // Dipanggil dalam notifySubmitFallback bila injection gagal
  const notifyInjectionFailure = _sh.notifyInjectionFailure
    ? function(reason, details) { _sh.notifyInjectionFailure(extensionApi, "claude", reason, details); }
    : function() {};

  // Robust selector fallback chain — BARU, menggantikan selector statik tunggal
  const queryWithFallbackChain = _sh.queryWithFallbackChain || function(selectors, filter) {
    for (const sel of (selectors||[])) { try { const n = document.querySelector(sel); if (n && (!filter || filter(n))) return n; } catch(e) {} }
    return null;
  };
  // Nota: sendMessage, isSidebarContext, isTextEditableElement dsb. masih
  // digunapakai dari implementasi asal fail ini di bawah.

  const PROVIDER_ID = "claude";
  const SETTINGS_KEY = "settings";
  const SIDEBAR_CHAT_FOCUS_SIGNAL_KEY = "__lpSidebarChatFocusSignal";
  const SIDEBAR_AI_FOCUS_PORT_NAME = "lp-sidebar-ai-focus";
  const SIDEBAR_CONTEXT_SESSION_KEY = "__lpSidebarContext";
  const PROMPT_APPLIED_SESSION_KEY = "__lpClaudeSidebarPromptApplied";
  const MANUAL_SUBMIT_FALLBACK_ID = "__lp_claude_manual_submit_fallback";
  const DEBUG_BADGE_ID = "__lp_claude_summary_debug";
  const MANUAL_SUBMIT_FALLBACK_COOLDOWN_MS = 5000;
  const AI_CATEGORY_SESSION_PREFIX = "ai-category:";
  const AI_CATEGORY_RESULT_POLL_INTERVAL_MS = 800;
  const AI_CATEGORY_RESULT_POLL_MAX_TICKS = 150;
  const DEFAULT_SIDEBAR_F6_DELAY_MS = 80;
  const SIDEBAR_FOCUS_SETTLE_MS = 140;
  const SIDEBAR_FOCUS_RESULT_EXTRA_WAIT_MS = 1800;

  let suppressAutoFocusUntil = 0;
  let lastSidebarFocusSignal = 0;
  let focusAttemptTimer = null;
  let sidebarFocusPort = null;
  let syntheticF6Timer = null;
  let sidebarTextSelectionObserver = null;
  let scheduledSidebarFocusTimer = null;
  let scheduledSidebarFocusAt = 0;
  let submitLoopTimer = null;
  let pendingPromptPollTimer = null;
  let lastManualSubmitFallbackAt = 0;
  let lastDebugText = "";
  let activeSubmitSessionId = "";
  let aiCategoryResultPollTimer = null;
  let activeAiCategoryResultSessionId = "";
  let activeAiCategoryResultBaselineEndIndex = -1;
  let sidebarFocusF6DelayMs = DEFAULT_SIDEBAR_F6_DELAY_MS;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  function applySidebarFocusSettings(rawSettings) {
    const settings = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
    sidebarFocusF6DelayMs = normalizeSidebarFocusF6DelayMs(
      settings.sidebarFocusF6DelayMs,
    );
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
      const input = getFocusablePromptInput();
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
        const input = getFocusablePromptInput();
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

  function setDebugStatus(text) {
    const value = String(text || "").trim();
    if (!value || value === lastDebugText) return;
    lastDebugText = value;
    if (!document || !document.body) return;
    let badge = document.getElementById(DEBUG_BADGE_ID);
    if (!badge) {
      badge = document.createElement("div");
      badge.id = DEBUG_BADGE_ID;
      badge.style.position = "fixed";
      badge.style.left = "8px";
      badge.style.bottom = "8px";
      badge.style.zIndex = "2147483647";
      badge.style.maxWidth = "92%";
      badge.style.padding = "4px 8px";
      badge.style.borderRadius = "8px";
      badge.style.background = "rgba(15,23,42,0.88)";
      badge.style.border = "1px solid rgba(125,211,252,0.35)";
      badge.style.color = "#cbd5e1";
      badge.style.font = "11px/1.3 ui-monospace,Consolas,monospace";
      badge.style.pointerEvents = "none";
      badge.style.whiteSpace = "nowrap";
      badge.style.overflow = "hidden";
      badge.style.textOverflow = "ellipsis";
      (document.body || document.documentElement).appendChild(badge);
    }
    badge.textContent = "LP Claude: " + value;
  }

  function normalizeHost(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isClaudeHost(hostname) {
    const host = normalizeHost(hostname);
    return host === "claude.ai" || host.endsWith(".claude.ai");
  }

  function getReferrerHost() {
    try {
      return new URL(String(document.referrer || "")).hostname || "";
    } catch (err) {
      return "";
    }
  }

  function isClaudeFrame() {
    if (isClaudeHost(window.location.hostname || "")) return true;
    return isClaudeHost(getReferrerHost());
  }

  function isTopLevelFrame() {
    try {
      return window.top === window;
    } catch (err) {
      return true;
    }
  }

  function isSidebarContext() {
    try {
      const params = new URLSearchParams(window.location.search || "");
      if (params.get("lp_sidebar") === "1") {
        try {
          window.sessionStorage.setItem(SIDEBAR_CONTEXT_SESSION_KEY, "1");
        } catch (err) {}
        return true;
      }
      try {
        if (window.sessionStorage.getItem(SIDEBAR_CONTEXT_SESSION_KEY) === "1") {
          return true;
        }
      } catch (err) {}
    } catch (err) {}

    const name = String(window.name || "");
    if (name === "__LP_SIDEBAR__") return true;

    if (typeof window.innerWidth === "number" && window.innerWidth < 900) return true;

    try {
      const topWin = window.top;
      if (topWin && typeof topWin.innerWidth === "number" && topWin.innerWidth < 900) {
        return true;
      }
    } catch (err) {}

    try {
      const ref = String(document.referrer || "").toLowerCase();
      if (ref.includes("lp_sidebar=1") || ref.includes("sidebar.html")) {
        return true;
      }
    } catch (err) {}

    return false;
  }

  function sendMessage(message) {
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
    return sendMessage({
      type: "ai-category-classification-result",
      payload: {
        provider: PROVIDER_ID,
        sessionId: String(sessionId),
        rawText: String(rawText || "")
      }
    });
  }

  async function sendAiCategoryClassificationError(sessionId, reason, details) {
    if (!sessionId) return null;
    return sendMessage({
      type: "ai-category-classification-error",
      payload: {
        provider: PROVIDER_ID,
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
        sendMessage({
          type: "ai-overlay-response",
          overlayToken: token,
          responseText: last,
          done: done
        }).catch(function () {});
        if (done) { clearInterval(tmr); }
      } catch (err) {}
    }, POLL_INTERVAL_MS);
  }

  function readLocalStorageValue(key, done) {
    const finish = (value) => {
      try {
        done(value);
      } catch (err) {}
    };
    if (!extensionApi.storage || !extensionApi.storage.local || !extensionApi.storage.local.get) {
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
        const runtimeErr = extensionApi.runtime && extensionApi.runtime.lastError;
        if (runtimeErr || !result || typeof result !== "object") {
          finish(null);
          return;
        }
        finish(result[key]);
      });
    } catch (err) {
      finish(null);
    }
  }

  function loadSidebarFocusSettings() {
    readLocalStorageValue(SETTINGS_KEY, (value) => {
      applySidebarFocusSettings(value);
    });
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

  // Cache shadow roots — struktur Shadow DOM jarang berubah drastik,
  // tidak perlu traverse semula setiap panggilan queryAllDeep
  let _cachedShadowRoots = null;
  let _shadowRootCacheTimer = null;

  function getKnownShadowRoots() {
    if (_cachedShadowRoots) return _cachedShadowRoots;
    const roots = [];
    try {
      const all = document.querySelectorAll("*");
      for (const el of all) {
        if (el && el.shadowRoot) roots.push(el.shadowRoot);
      }
    } catch (err) {}
    _cachedShadowRoots = roots;
    clearTimeout(_shadowRootCacheTimer);
    // Invalidate selepas 3 saat — cukup fresh untuk detect shadow root baru
    _shadowRootCacheTimer = setTimeout(() => { _cachedShadowRoots = null; }, 3000);
    return roots;
  }

  function queryAllDeep(selector, root) {
    const results = [];
    const seen = new Set();
    const visit = (node) => {
      if (!node || !node.querySelectorAll) return;
      let direct = [];
      try {
        direct = Array.from(node.querySelectorAll(selector));
      } catch (err) {
        direct = [];
      }
      for (const item of direct) {
        if (!item || seen.has(item)) continue;
        seen.add(item);
        results.push(item);
      }
      // Guna cached shadow roots untuk elak querySelectorAll("*") setiap kali
      const shadowRoots = node === document ? getKnownShadowRoots() : [];
      for (const sr of shadowRoots) {
        visit(sr);
      }
    };
    visit(root || document);
    return results;
  }

  function isTextEditableElement(target) {
    if (!target) return false;
    const tag = target.tagName ? String(target.tagName).toUpperCase() : "";
    return tag === "TEXTAREA" || tag === "INPUT" || !!target.isContentEditable;
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

  function normalizePromptComparable(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function rankPromptCandidate(el, adapter) {
    const rect = el.getBoundingClientRect();
    const id = (el.id || "").toLowerCase();
    const className = typeof el.className === "string" ? el.className.toLowerCase() : "";
    const dataTestId = (el.getAttribute("data-testid") || "").toLowerCase();
    const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
    const placeholder = (el.getAttribute("placeholder") || "").toLowerCase();
    const role = (el.getAttribute("role") || "").toLowerCase();
    const tag = (el.tagName || "").toLowerCase();

    let score = Number(adapter && adapter.boost ? adapter.boost : 0);
    if (tag === "textarea") score += 400;
    if (el.isContentEditable) score += 900;
    if (role === "textbox") score += 500;
    if (className.includes("prosemirror")) score += 1400;
    if (id.includes("prompt") || id.includes("composer") || id.includes("chat")) score += 320;
    if (className.includes("prompt") || className.includes("composer") || className.includes("input")) score += 260;
    if (dataTestId.includes("prompt") || dataTestId.includes("composer") || dataTestId.includes("input")) score += 280;
    if (ariaLabel.includes("message") || ariaLabel.includes("ask") || ariaLabel.includes("prompt") || ariaLabel.includes("claude")) score += 220;
    if (placeholder.includes("message") || placeholder.includes("ask") || placeholder.includes("prompt") || placeholder.includes("command")) score += 180;
    if (rect.bottom > window.innerHeight * 0.45) score += 240;
    score += Math.max(0, Math.min(220, rect.bottom));
    score += Math.max(0, Math.min(130, rect.width / 6));
    return score;
  }

  function getPromptInputAdapters() {
    return [
      {
        id: "claude-primary",
        boost: 2600,
        selectors: [
          // Claude 2024+ uses ProseMirror contenteditable
          "div.ProseMirror[contenteditable]:not([contenteditable='false'])",
          // Generic contenteditable with translate=no (Claude-specific pattern)
          "[contenteditable]:not([contenteditable='false'])[translate='no']",
          // Role textbox
          "div[role='textbox'][contenteditable]:not([contenteditable='false'])",
          // Inside composer data-testid
          "div[data-testid*='composer' i] [contenteditable]:not([contenteditable='false'])",
          // Fieldset or chat input area
          "fieldset [contenteditable]:not([contenteditable='false'])",
          "main [contenteditable]:not([contenteditable='false'])",
          // p tag placeholder Claude uses
          "[data-placeholder*='message' i][contenteditable]:not([contenteditable='false'])",
          "[data-placeholder*='Reply' i][contenteditable]:not([contenteditable='false'])"
        ]
      },
      {
        id: "claude-fallback",
        boost: 1500,
        selectors: [
          "form [contenteditable]:not([contenteditable='false'])",
          "[contenteditable]:not([contenteditable='false'])",
          "textarea:not([disabled]):not([readonly])",
          "input[type='text']:not([disabled]):not([readonly])"
        ]
      }
    ];
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
        score: rankPromptCandidate(el, adapter)
      });
    };

    for (const adapter of adapters) {
      for (const selector of adapter.selectors) {
        const nodes = queryAllDeep(selector, document);
        for (const node of nodes) {
          pushCandidate(node, adapter);
        }
      }
    }

    let placeholderNodes = [];
    try {
      placeholderNodes = queryAllDeep("[data-placeholder], [placeholder], div, span, p", document);
    } catch (err) {
      placeholderNodes = [];
    }
    for (const node of placeholderNodes) {
      if (!node) continue;
      const text = String(node.textContent || "").trim().toLowerCase();
      if (!text) continue;
      const hasClaudeHint = text.includes("type / for commands") || text.includes("type a message");
      if (!hasClaudeHint) continue;
      if (!node.closest) continue;
      const container = node.closest("form, section, main, div");
      if (!container || !container.querySelector) continue;
      const editable = container.querySelector("textarea, [contenteditable]:not([contenteditable='false']), [role='textbox']");
      pushCandidate(editable, { id: "claude-hint", boost: 2600 });
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

  function findClaudeHintElement() {
    const nodes = queryAllDeep("div, span, p, label", document);
    for (const node of nodes) {
      if (!node || !node.textContent) continue;
      const text = String(node.textContent || "").trim().toLowerCase();
      if (!text) continue;
      if (text.includes("type / for commands") || text.includes("type a message")) {
        return node;
      }
    }
    return null;
  }

  function activateClaudeComposerFromHint() {
    const hint = findClaudeHintElement();
    if (!hint) return false;
    const target = hint.closest ? (hint.closest("form, section, main, div") || hint) : hint;
    if (!target) return false;
    try {
      target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      if (typeof target.click === "function") target.click();
      if (isTextEditableElement(getDeepActiveElement())) return true;
      return true;
    } catch (err) {
      return false;
    }
  }

  function readPromptValue(target) {
    if (!target) return "";
    if (target.isContentEditable) {
      // ProseMirror: ambil teks dari setiap <p> dan join dengan \n
      // supaya normalize betul dan match dengan nilai asal
      try {
        const paragraphs = target.querySelectorAll("p");
        if (paragraphs && paragraphs.length > 0) {
          return Array.from(paragraphs).map(p => p.textContent || "").join("\n").trim();
        }
      } catch (e) {}
      // Fallback: innerText normalize whitespace lebih baik dari textContent
      if (typeof target.innerText === "string") return target.innerText.trim();
      return (target.textContent || "").trim();
    }
    return typeof target.value === "string" ? target.value : "";
  }

  function insertViaSyntheticPaste(target, text) {
    if (!target || !target.isContentEditable) return false;
    if (typeof DataTransfer !== "function" || typeof ClipboardEvent !== "function") return false;
    try {
      const data = new DataTransfer();
      data.setData("text/plain", String(text || ""));
      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data
      });
      return target.dispatchEvent(pasteEvent) !== false;
    } catch (err) {
      return false;
    }
  }

  function setPromptValue(target, promptText) {
    if (!target) return false;
    const text = String(promptText || "");
    if (!text) return false;
    const tag = target.tagName ? String(target.tagName).toLowerCase() : "";

    try {
      if (tag === "textarea" || tag === "input") {
        const prototype = tag === "textarea"
          ? window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement && window.HTMLInputElement.prototype;
        const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, "value") : null;
        if (descriptor && typeof descriptor.set === "function") {
          descriptor.set.call(target, text);
        } else {
          target.value = text;
        }
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }

      if (target.isContentEditable) {
        try {
          target.focus({ preventScroll: true });
        } catch (err) {
          try { target.focus(); } catch (err2) {}
        }

        // Kaedah 1: execCommand selectAll + insertText (paling serasi dengan ProseMirror)
        let inserted = false;
        try {
          if (document.execCommand) {
            document.execCommand("selectAll", false);
            inserted = document.execCommand("insertText", false, text);
          }
        } catch (err) {
          inserted = false;
        }
        if (inserted) {
          try {
            target.dispatchEvent(new InputEvent("input", {
              bubbles: true, cancelable: true, data: text, inputType: "insertText"
            }));
          } catch (e) {
            target.dispatchEvent(new Event("input", { bubbles: true }));
          }
          target.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }

        // Kaedah 2: Selection API + insertText
        try {
          const selection = window.getSelection ? window.getSelection() : null;
          if (selection) {
            const range = document.createRange();
            range.selectNodeContents(target);
            range.deleteContents();
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          }
          if (document.execCommand) {
            inserted = document.execCommand("insertText", false, text);
          }
        } catch (err) {
          inserted = false;
        }
        if (inserted) {
          try {
            target.dispatchEvent(new InputEvent("input", {
              bubbles: true, cancelable: true, data: text, inputType: "insertText"
            }));
          } catch (e) {
            target.dispatchEvent(new Event("input", { bubbles: true }));
          }
          target.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }

        // Kaedah 3: Synthetic paste (DataTransfer ClipboardEvent)
        inserted = insertViaSyntheticPaste(target, text);
        if (inserted) {
          try {
            target.dispatchEvent(new InputEvent("input", {
              bubbles: true, cancelable: true, data: text, inputType: "insertText"
            }));
          } catch (e) {
            target.dispatchEvent(new Event("input", { bubbles: true }));
          }
          target.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }

        // Kaedah 4 (last resort): Bina semula ProseMirror innerHTML dengan betul
        // Ini mengekalkan struktur <p> yang ProseMirror perlukan
        try {
          // Kosongkan dulu
          const selection2 = window.getSelection ? window.getSelection() : null;
          if (selection2) {
            const range2 = document.createRange();
            range2.selectNodeContents(target);
            range2.deleteContents();
            selection2.removeAllRanges();
            selection2.addRange(range2);
          }
          // Bina paragraf untuk ProseMirror
          const isProseMirror = target.classList && target.classList.contains("ProseMirror");
          if (isProseMirror) {
            target.innerHTML = "";
            const lines = text.split("\n");
            for (const line of lines) {
              const p = document.createElement("p");
              if (line === "") {
                // Baris kosong — ProseMirror perlukan <br> atau <p> kosong
                p.innerHTML = "<br>";
              } else {
                p.textContent = line;
              }
              target.appendChild(p);
            }
          } else {
            target.textContent = text;
          }
          try {
            target.dispatchEvent(new InputEvent("input", {
              bubbles: true, cancelable: true, data: text, inputType: "insertText"
            }));
          } catch (e) {
            target.dispatchEvent(new Event("input", { bubbles: true }));
          }
          target.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        } catch (err) {
          return false;
        }
      }
    } catch (err) {
      return false;
    }

    return false;
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
      } catch (focusErr) {
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

  function normalizeFocusSignalValue(rawValue) {
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return numeric;
  }

  function getFocusablePromptInput() {
    const details = findPromptInputDetails();
    return details && details.input ? details.input : null;
  }

  function focusSidebarPromptInput(options = {}) {
    if (!isSidebarContext()) return false;
    if (!options.skipSyntheticF6) {
      dispatchSyntheticF6Twice(Number.isFinite(options.delayMs) ? options.delayMs : 80);
    }
    const input = getFocusablePromptInput();
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

  function stopFocusAttempts() {
    if (!focusAttemptTimer) return;
    clearInterval(focusAttemptTimer);
    focusAttemptTimer = null;
  }

  function attemptFocus() {
    if (!isSidebarContext()) return;
    stopFocusAttempts();
    let attempts = 0;
    const maxAttempts = 100;
    focusAttemptTimer = setInterval(() => {
      attempts += 1;
      if (!isSidebarContext()) {
        stopFocusAttempts();
        return;
      }
      if (Date.now() < suppressAutoFocusUntil || hasActiveSelection()) {
        if (attempts >= maxAttempts) {
          stopFocusAttempts();
        }
        return;
      }
      if (isTextEditableElement(getDeepActiveElement())) {
        stopFocusAttempts();
        return;
      }
      const activeEl = getDeepActiveElement();
      if (activeEl && isInsideSwitcherHost(activeEl)) {
        stopFocusAttempts();
        return;
      }
      try { window.focus(); } catch (err) {}
      const input = getFocusablePromptInput();
      if (input) {
        const focused = focusPromptInput(input);
        if (focused || attempts >= maxAttempts) {
          stopFocusAttempts();
        }
      } else if (attempts >= maxAttempts) {
        stopFocusAttempts();
      } else if (attempts % 8 === 0) {
        activateComposerSurface();
      }
    }, 150);
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
    try {
      extensionApi.runtime.sendMessage({ 
        type: "sidebar-focus-status", 
        focused: !!focused,
        osFocused: !!(focused && windowHasOsFocus)
      });
    } catch(e) {}
  }

  function triggerSidebarFocus() {
    if (!isSidebarContext()) return false;
    const focused = focusSidebarPromptInput();
    reportSidebarFocusStatus(focused);
    if (!focused) {
      attemptFocus();
    }
    setTimeout(() => {
      reportSidebarFocusStatus(activeElementMatchesPromptInput(getFocusablePromptInput()));
    }, 400);
    return focused;
  }

  function applySidebarFocusSignal(rawValue) {
    const signal = normalizeFocusSignalValue(rawValue);
    if (!signal) return false;
    if (signal <= lastSidebarFocusSignal) return false;
    lastSidebarFocusSignal = signal;
    return triggerSidebarFocus();
  }

  function checkPendingSidebarFocusSignal() {
    if (!isSidebarContext()) return;
    readLocalStorageValue(SIDEBAR_CHAT_FOCUS_SIGNAL_KEY, (value) => {
      applySidebarFocusSignal(value);
    });
  }

  function ensureSidebarFocusPort() {
    if (!isSidebarContext()) return;
    if (sidebarFocusPort) return;
    if (!extensionApi.runtime || !extensionApi.runtime.connect) return;
    try {
      const port = extensionApi.runtime.connect({ name: SIDEBAR_AI_FOCUS_PORT_NAME });
      sidebarFocusPort = port;
      port.onMessage.addListener((message) => {
        if (!message || message.type !== "focus-input") return;
        try { window.focus(); } catch (err) {}
        dispatchSyntheticF6Twice(80);
        triggerSidebarFocus();
      });
      port.onDisconnect.addListener(() => {
        sidebarFocusPort = null;
        setTimeout(() => {
          ensureSidebarFocusPort();
        }, 300);
      });
    } catch (err) {
      sidebarFocusPort = null;
    }
  }

  function buttonHintText(button) {
    if (!button) return "";
    const chunks = [
      button.getAttribute ? button.getAttribute("aria-label") : "",
      button.getAttribute ? button.getAttribute("title") : "",
      button.getAttribute ? button.getAttribute("data-testid") : "",
      button.id || "",
      button.className || "",
      button.textContent || ""
    ];
    return chunks.join(" ").toLowerCase();
  }

  function isButtonDisabled(button) {
    if (!button) return true;
    if (button.disabled) return true;
    const ariaDisabled = button.getAttribute ? button.getAttribute("aria-disabled") : "";
    return String(ariaDisabled || "").toLowerCase() === "true";
  }

  function findSendButtonCandidate() {
    const selectors = [
      // Claude-specific send button selectors (current UI patterns)
      "button[aria-label='Send Message']",
      "button[aria-label='Send message']",
      "button[aria-label*='Send' i]:not([aria-label*='stop' i]):not([aria-label*='cancel' i])",
      "button[data-testid='send-button']",
      "button[data-testid*='send' i]:not([data-testid*='stop' i])",
      "button[type='submit']:not([disabled])",
      "[role='button'][aria-label*='Send' i]:not([aria-label*='stop' i])"
    ];

    for (const selector of selectors) {
      try {
        const nodes = queryAllDeep(selector, document);
        const button = nodes && nodes.length ? nodes[0] : null;
        if (!button) continue;
        if (!isElementVisible(button) || isButtonDisabled(button)) continue;
        return button;
      } catch (err) {}
    }

    let nodes = [];
    try {
      nodes = queryAllDeep("button, [role='button']", document);
    } catch (err) {
      nodes = [];
    }
    if (!nodes.length) return null;

    const ranked = [];
    for (const node of nodes) {
      if (!node) continue;
      if (!isElementVisible(node) || isButtonDisabled(node)) continue;
      const hint = buttonHintText(node);
      let score = 0;
      if ((node.type || "").toLowerCase() === "submit") score += 600;
      if (hint.includes("send")) score += 700;
      if (hint.includes("message")) score += 200;
      if (hint.includes("submit")) score += 220;
      // Hanya penalise jika hint KHUSUS stop/cancel — bukan jika ada "send" juga
      if (!hint.includes("send") && (hint.includes("stop") || hint.includes("cancel"))) score -= 700;
      if (hint.includes("attach") || hint.includes("upload") || hint.includes("file")) score -= 700;
      if (score < 180) continue;
      ranked.push({ node, score });
    }

    if (!ranked.length) return null;
    ranked.sort((a, b) => b.score - a.score);
    return ranked[0].node || null;
  }

  function clickSendButton() {
    const button = findSendButtonCandidate();
    if (!button) return false;
    try {
      button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      if (typeof button.click === "function") {
        button.click();
      } else {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  function dispatchEnter(target, options = {}) {
    if (!target) return false;
    const eventInit = {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
      ctrlKey: !!options.ctrlKey,
      metaKey: !!options.metaKey,
      shiftKey: !!options.shiftKey
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

  function submitViaEnter(target) {
    if (!target) return false;
    return dispatchEnter(target) || dispatchEnter(target, { ctrlKey: true }) || dispatchEnter(target, { metaKey: true });
  }

  function submitViaForm(target) {
    if (!target || !target.closest) return false;
    const form = target.closest("form");
    if (!form) return false;
    try {
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  function activateComposerSurface() {
    const candidates = [];
    try {
      const nodes = queryAllDeep("[data-testid], [aria-label], [placeholder], [data-placeholder], form, main, section", document);
      for (const node of nodes) {
        if (isInsideSwitcherHost(node)) continue;
        const hint = [
          node.getAttribute ? node.getAttribute("data-testid") : "",
          node.getAttribute ? node.getAttribute("aria-label") : "",
          node.getAttribute ? node.getAttribute("placeholder") : "",
          node.getAttribute ? node.getAttribute("data-placeholder") : "",
          node.textContent || ""
        ].join(" ").toLowerCase();
        if (hint.includes("type / for commands") || hint.includes("message") || hint.includes("composer") || hint.includes("claude")) {
          if (isElementVisible(node)) candidates.push(node);
        }
      }
    } catch (err) {
      return false;
    }
    if (!candidates.length) return false;
    const target = candidates[0];
    try {
      target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      if (typeof target.click === "function") target.click();
      activateClaudeComposerFromHint();
      return true;
    } catch (err) {
      return false;
    }
  }

  function getComposerHealth() {
    let details = findPromptInputDetails();
    if (!details.input) {
      activateClaudeComposerFromHint();
      details = findPromptInputDetails();
    }
    const input = details && details.input ? details.input : null;
    if (!input) {
      return { ok: false, reason: "input-not-found", adapterId: "none", input: null };
    }
    if (!isUsablePromptInput(input)) {
      return { ok: false, reason: "input-not-usable", adapterId: details.adapterId, input };
    }
    const highConfidence = !!(
      details.score >= 2200
      || (details.adapterId && details.adapterId.indexOf("claude") === 0)
      || (input.classList && input.classList.contains("ProseMirror"))
      || (input.getAttribute && /claude|message|command/i.test(
        String(input.getAttribute("aria-label") || "")
        + " "
        + String(input.getAttribute("data-placeholder") || "")
        + " "
        + String(input.getAttribute("placeholder") || "")
      ))
    );
    if (!highConfidence) {
      return { ok: false, reason: "input-low-confidence", adapterId: details.adapterId, input: null };
    }
    const sendButton = findSendButtonCandidate();
    const tag = input.tagName ? String(input.tagName).toUpperCase() : "";
    const isProseMirror = !!(input.classList && input.classList.contains("ProseMirror"));
    const canSubmitByEnter = !isProseMirror && (!!input.isContentEditable || tag === "TEXTAREA");
    // Untuk ProseMirror Claude, send button mungkin disabled sebelum teks diisi —
    // jangan gagal health check kerana ini, submit loop akan tunggu
    const hasSubmitPath = !!(sendButton || canSubmitByEnter || input.closest("form") || isProseMirror);
    if (!hasSubmitPath) {
      return { ok: false, reason: "submit-path-not-found", adapterId: details.adapterId, input };
    }
    return {
      ok: true,
      reason: "",
      adapterId: details.adapterId,
      input,
      sendButton,
      canSubmitByEnter,
      isProseMirror
    };
  }

  async function copyToClipboard(text) {
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
          provider: PROVIDER_ID,
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
    title.textContent = "Claude: auto-submit perlukan bantuan manual";
    title.style.cssText = "font-weight:700;font-size:13px;margin-bottom:6px;color:#f8fafc;";

    const hint = document.createElement("div");
    const causeText = buildFallbackCauseText(reason);
    hint.textContent = copied
      ? "Prompt sudah disalin ke clipboard. Tampal (Ctrl+V) dan hantar manual. Punca: " + causeText + "."
      : "Auto-submit gagal. Salin prompt di bawah, tampal, dan hantar manual. Punca: " + causeText + ".";
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
      const ok = await copyToClipboard(preview.value);
      copyBtn.textContent = ok ? "Disalin" : "Gagal Salin";
    });

    const copyCauseBtn = document.createElement("button");
    copyCauseBtn.type = "button";
    copyCauseBtn.textContent = "Salin Punca";
    copyCauseBtn.style.cssText = "border:1px solid rgba(251,191,36,0.6);background:#451a03;color:#fde68a;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;";
    copyCauseBtn.addEventListener("click", async () => {
      const ok = await copyToClipboard(causeText);
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

  function wasSessionApplied(sessionId) {
    const key = sessionId ? String(sessionId) : "";
    if (!key) return false;
    try {
      const applied = window.sessionStorage.getItem(PROMPT_APPLIED_SESSION_KEY) || "";
      return applied === key;
    } catch (err) {
      return false;
    }
  }

  function markSessionApplied(sessionId) {
    const key = sessionId ? String(sessionId) : "";
    try {
      if (!key) {
        window.sessionStorage.removeItem(PROMPT_APPLIED_SESSION_KEY);
      } else {
        window.sessionStorage.setItem(PROMPT_APPLIED_SESSION_KEY, key);
      }
    } catch (err) {}
  }

  async function startSubmitLoop(promptText, sessionId) {
    const prompt = String(promptText || "");
    if (!prompt.trim()) return;

    if (submitLoopTimer) {
      clearInterval(submitLoopTimer);
      submitLoopTimer = null;
    }
    activeSubmitSessionId = sessionId ? String(sessionId) : "";
    const aiCategorySession = isAiCategorySession(activeSubmitSessionId);

    let attempts = 0;
    const maxAttempts = 28;
    let finished = false;
    const expected = normalizePromptComparable(prompt);
    const expectedSample = expected.slice(0, Math.min(120, expected.length));

    const failToManual = async (reason, details) => {
      if (finished) return;
      finished = true;
      if (submitLoopTimer) {
        clearInterval(submitLoopTimer);
        submitLoopTimer = null;
      }
      if (sessionId) {
        await sendMessage({ type: "consume-pending-sidebar-prompt", sessionId: String(sessionId) });
      }
      if (aiCategorySession) {
        markSessionApplied(sessionId);
        const reportSessionId = activeSubmitSessionId || sessionId;
        activeSubmitSessionId = "";
        await sendAiCategoryClassificationError(reportSessionId, reason, details || {});
        return;
      }
      const copied = await copyToClipboard(prompt);
      showManualSubmitFallback(prompt, reason, copied);
      notifySubmitFallback(sessionId, reason, copied, details || {});
      markSessionApplied(sessionId);
      activeSubmitSessionId = "";
    };

    submitLoopTimer = setInterval(() => {
      if (finished) return;
      attempts += 1;
      setDebugStatus("submit attempt " + attempts);

      const health = getComposerHealth();
      if (!health.ok) {
        setDebugStatus("composer not ready: " + (health.reason || "unknown"));
        if (attempts % 6 === 0) {
          activateComposerSurface();
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
      const relaxedVerified = !!readBack && readBack.length >= Math.min(48, Math.max(14, Math.floor(expected.length * 0.03)));
      const verified = !!readBack && (
        readBack === expected
        || (expectedSample && readBack.includes(expectedSample))
        || relaxedVerified
      );
      if (!verified) {
        setDebugStatus("verify failed");
        if (attempts >= maxAttempts) {
          failToManual("prompt-verify-failed", { attempts, adapterId: health.adapterId });
        }
        return;
      }

      setTimeout(async () => {
        if (finished) return;
        // Untuk Claude ProseMirror, jangan guna Enter (ia tambah newline, bukan submit)
        // Cuba klik send button sahaja; fallback Enter hanya jika tiada send button sama sekali
        const isProseMirror = !!(health.isProseMirror || (input && input.classList && input.classList.contains("ProseMirror")));
        let sent = false;

        if (isProseMirror) {
          // Tunggu send button jadi enabled (max 5 × 80ms = 400ms)
          for (let w = 0; w < 5; w++) {
            const btn = findSendButtonCandidate();
            if (btn && !isButtonDisabled(btn)) { sent = clickSendButton(); break; }
            await sleep(80);
          }
        } else {
          sent = clickSendButton() || submitViaEnter(input) || submitViaForm(input);
        }

        if (sent) {
          // Kunci segera supaya setInterval tick berikut tidak re-fill
          finished = true;
          setTimeout(() => {
            if (submitLoopTimer) {
              clearInterval(submitLoopTimer);
              submitLoopTimer = null;
            }
            if (sessionId) {
              sendMessage({ type: "consume-pending-sidebar-prompt", sessionId: String(sessionId) }).catch(() => {});
            }
            markSessionApplied(sessionId);
            if (aiCategorySession) {
              startAiCategoryResultPolling(activeSubmitSessionId || sessionId);
            } else if (activeSubmitSessionId.startsWith("ai-overlay:")) {
              startOverlayResultPolling(activeSubmitSessionId);
            }
            setTimeout(() => { activeSubmitSessionId = ""; }, 15000);
          }, 180);
          return;
        }
        if (attempts >= maxAttempts) {
          setDebugStatus("send failed");
          failToManual("submit-trigger-failed", { attempts, adapterId: health.adapterId });
        }
      }, 250);
    }, 180);
  }

  async function applyPendingPrompt() {
    if (!isClaudeFrame()) return false;

    const peek = await sendMessage({ type: "peek-pending-sidebar-prompt" });
    if (!peek || peek.hasPendingPrompt !== true) {
      setDebugStatus("no pending prompt");
      return false;
    }

    const pendingProvider = peek.provider ? String(peek.provider).trim().toLowerCase() : "";
    if (pendingProvider !== PROVIDER_ID) {
      setDebugStatus("pending for " + (pendingProvider || "unknown"));
      return false;
    }

    const pendingSessionId = peek.sessionId ? String(peek.sessionId) : "";
    const isOverlay = pendingSessionId.startsWith("ai-overlay:");
    if (!isOverlay && !isSidebarContext() && !pendingSessionId) return false;

    if (pendingSessionId && submitLoopTimer && activeSubmitSessionId === pendingSessionId) {
      setDebugStatus("submit in progress");
      return true;
    }
    if (pendingSessionId && wasSessionApplied(pendingSessionId)) {
      await sendMessage({ type: "consume-pending-sidebar-prompt", sessionId: pendingSessionId });
      setDebugStatus("session already applied");
      return false;
    }

    const preflight = getComposerHealth();
    if (!preflight.ok) {
      setDebugStatus("composer missing: " + (preflight.reason || "unknown"));
      activateComposerSurface();
      if (preflight.reason === "input-low-confidence") {
        await sleep(120);
      }
      return false;
    }
    setDebugStatus("composer ready");

    const promptText = peek.prompt ? String(peek.prompt) : "";
    const sessionId = pendingSessionId;
    if (!promptText.trim()) {
      if (sessionId) markSessionApplied(sessionId);
      setDebugStatus("prompt empty");
      return false;
    }
    setDebugStatus("prompt queued");

    await startSubmitLoop(promptText, sessionId);
    return true;
  }

  function startPendingPromptPolling() {
    if (pendingPromptPollTimer) {
      clearInterval(pendingPromptPollTimer);
      pendingPromptPollTimer = null;
    }
    // Gunakan adaptive interval:
    // - Fasa 1 (startup): 400ms untuk 20 tick pertama (~8 saat) — Claude page ambil masa ~2-4s load
    // - Fasa 2 (idle): naik ke 1200ms selepas 5 tick berturut-turut tiada pending prompt
    // - Reset ke 400ms bila ada pending prompt ditemui
    let idleTicks = 0;
    let startupTicks = 0;
    let currentInterval = 400;
    const STARTUP_TICKS = 20;     // Kekal 400ms untuk 20 tick pertama
    const MAX_IDLE_TICKS = 5;     // Lebih sabar sebelum slow down
    const MAX_IDLE_INTERVAL = 1200;
    const MAX_TOTAL_TICKS = 360;
    let totalTicks = 0;
    let composerFoundOnce = false;

    const scheduleNext = () => {
      pendingPromptPollTimer = setTimeout(async () => {
        totalTicks++;
        startupTicks++;
        if (totalTicks >= MAX_TOTAL_TICKS) {
          pendingPromptPollTimer = null;
          return;
        }

        // Semak sama ada composer sudah wujud — jika ya, jangan slow down
        const health = getComposerHealth();
        if (health.ok || health.input) {
          composerFoundOnce = true;
        }

        const applied = await applyPendingPrompt().catch(() => false);
        if (applied) {
          idleTicks = 0;
          currentInterval = 400;
        } else {
          // Kekal 400ms semasa startup phase ATAU jika composer belum pernah ditemui
          const inStartup = startupTicks <= STARTUP_TICKS || !composerFoundOnce;
          if (!inStartup) {
            idleTicks++;
            if (idleTicks >= MAX_IDLE_TICKS && currentInterval < MAX_IDLE_INTERVAL) {
              currentInterval = MAX_IDLE_INTERVAL;
            }
          }
        }
        scheduleNext();
      }, currentInterval);
    };
    scheduleNext();
  }

  function stopPendingPromptPolling() {
    if (pendingPromptPollTimer) {
      clearTimeout(pendingPromptPollTimer);
      pendingPromptPollTimer = null;
    }
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

  function start() {
    if (!isTopLevelFrame()) return;
    if (!isClaudeFrame()) return;

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

    // However, we only want to enable full sidebar features (focus, etc.) in sidebar context.
    const isSidebar = isSidebarContext();
    if (isSidebar) {
      loadSidebarFocusSettings();
      ensureSidebarTextSelectionEnabled();
      setDebugStatus("script start");
      initAiSelectionButton();

      document.addEventListener(
        "pointerdown",
        (event) => {
          if (!isSidebarContext()) return;
          if (isInsideSwitcherHost(event)) return;
          if (isEventInsideEditable(event)) return;
          suppressAutoFocusUntil = Date.now() + 1200;
        },
        true
      );

      document.addEventListener("keydown", (event) => {
        if (!isSidebarContext()) return;
        if (event.defaultPrevented) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (hasActiveSelection()) return;
        if (isEventInsideEditable(event)) return;
        if (event.key.length !== 1 && event.key !== "Backspace" && event.key !== "Enter" && event.key !== "F6") {
          return;
        }
        const input = getFocusablePromptInput();
        if (!input) return;
        suppressAutoFocusUntil = 0;
        focusPromptInput(input);
      });
    }

    applyPendingPrompt().catch(() => {});
    startPendingPromptPolling();

    // Signal background bahawa Claude sudah loaded dan siap terima prompt
    // Ini penting untuk Firefox sidebar supaya background tahu bila nak hantar semula
    let _providerLoadedReported = false;
    const _reportProviderLoaded = () => {
      if (_providerLoadedReported) return;
      const health = getComposerHealth();
      if (!health.ok && !health.input) return;
      _providerLoadedReported = true;
      try {
        const maybe = extensionApi.runtime.sendMessage({
          type: "sidebar-provider-loaded",
          provider: PROVIDER_ID
        });
        if (maybe && typeof maybe.then === "function") maybe.catch(() => {});
      } catch (e) {}
      // Trigger semak prompt segera apabila composer siap
      applyPendingPrompt().catch(() => {});
    };
    // Poll sehingga composer ready, lepas itu report
    let _readyCheckCount = 0;
    const _readyCheckTimer = setInterval(() => {
      _readyCheckCount++;
      _reportProviderLoaded();
      if (_providerLoadedReported || _readyCheckCount >= 60) {
        clearInterval(_readyCheckTimer);
      }
    }, 200);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        if (isSidebarContext()) {
          dispatchSyntheticF6Twice(80);
          ensureSidebarFocusPort();
          attemptFocus();
          checkPendingSidebarFocusSignal();
        }
        applyPendingPrompt().catch(() => {});
      }
    });

    window.addEventListener("focus", () => {
      setTimeout(() => {
        if (isSidebarContext()) {
          dispatchSyntheticF6Twice(80);
          ensureSidebarFocusPort();
          attemptFocus();
          checkPendingSidebarFocusSignal();
        }
        applyPendingPrompt().catch(() => {});
      }, 120);
    });

    if (
      extensionApi.runtime
      && extensionApi.runtime.onMessage
      && !window.__lpClaudeSidebarFocusMessageListenerInstalled
    ) {
      window.__lpClaudeSidebarFocusMessageListenerInstalled = true;
      extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message) return;
        if (message.type === "check-pending-prompt") {
          applyPendingPrompt().then((applied) => {
            if (sendResponse) sendResponse({ ok: true, applied });
          }).catch(() => {
            if (sendResponse) sendResponse({ ok: false, error: "check-failed" });
          });
          return true;
        }
        if (message.type !== "focus-sidebar-ai-input") return;
        if (!isSidebarContext()) {
          if (sendResponse) sendResponse({ ok: false, reason: "not-sidebar-context" });
          return false;
        }
        try { window.focus(); } catch (err) {}
        const focused = triggerSidebarFocus();
        if (sendResponse) sendResponse({ ok: focused });
        return false;
      });
    }

    if (
      extensionApi.storage
      && extensionApi.storage.onChanged
      && !window.__lpClaudeSidebarFocusStorageListenerInstalled
    ) {
      window.__lpClaudeSidebarFocusStorageListenerInstalled = true;
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

    try { window.focus(); } catch (err) {}
    dispatchSyntheticF6Twice(500);
    ensureSidebarFocusPort();
    attemptFocus();
    checkPendingSidebarFocusSignal();
    var _claudeFocusPollTimer = setInterval(() => {
      ensureSidebarFocusPort();
      checkPendingSidebarFocusSignal();
      if (
        !isTextEditableElement(getDeepActiveElement())
        && Date.now() >= suppressAutoFocusUntil
        && !hasActiveSelection()
      ) {
        attemptFocus();
      }
    }, 1200);

    window.addEventListener("beforeunload", () => {
      stopPendingPromptPolling();
      stopFocusAttempts();
      clearScheduledSidebarFocus();
      stopAiCategoryResultPolling();
      if (sidebarTextSelectionObserver) {
        sidebarTextSelectionObserver.disconnect();
        sidebarTextSelectionObserver = null;
      }
      if (submitLoopTimer) {
        clearInterval(submitLoopTimer);
        submitLoopTimer = null;
      }
      if (typeof _claudeFocusPollTimer !== "undefined") {
        clearInterval(_claudeFocusPollTimer);
        _claudeFocusPollTimer = null;
      }
      if (typeof _claudeUrlPollTimer !== "undefined") {
        clearInterval(_claudeUrlPollTimer);
        _claudeUrlPollTimer = null;
      }
      if (sidebarFocusPort) {
        try {
          sidebarFocusPort.disconnect();
        } catch (err) {}
        sidebarFocusPort = null;
      }
    }, { once: true });

    let lastPolledUrl = "";
    var _claudeUrlPollTimer = setInterval(() => {
      if (lastPolledUrl !== window.location.href) {
        lastPolledUrl = window.location.href;
        if (activeSubmitSessionId) {
          sendMessage({
            type: "summary-sidebar-chat",
            payload: { sessionId: activeSubmitSessionId, chatUrl: window.location.href }
          }).catch(() => {});
        }
      }
    }, 1000);


  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  // Overlay retry: poll for pending overlay prompt even in non-sidebar (hidden tab) context
  if (!isSidebarContext()) {
    var overlayPendingCount = 0;
    var overlayPollTimer = setInterval(function () {
      overlayPendingCount++;
      if (overlayPendingCount > 90) { clearInterval(overlayPollTimer); return; }
      applyPendingPrompt().catch(function () {});
    }, 1000);
  }

  // Listen for postMessage dari overlay parent untuk trigger check prompt segera
  window.addEventListener("message", function(event) {
    if (!event || !event.data) return;
    if (event.data.type === "__lp_check_pending_prompt") {
      applyPendingPrompt().catch(function() {});
      setTimeout(function() { applyPendingPrompt().catch(function() {}); }, 300);
      setTimeout(function() { applyPendingPrompt().catch(function() {}); }, 800);
    }
    if (event.data.type === "__lp_trigger_focus") {
      attemptFocus();
    }
    if (event.data.type === "__lp_selection_search_toggle") {
      const enabled = event.data.enabled !== false;
      if (selectionSearchPopupSettings) {
        selectionSearchPopupSettings.enabled = enabled;
      }
    }
  });
})();
