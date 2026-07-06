(function () {
  // Debug logs removed for production



  // Check if we are NOT on gemini.google.com and NO lp_sidebar query param, then exit!
  let shouldEarlyExit = false;
  try {
    const hasLpSidebar = new URL(window.location.href).searchParams.has('lp_sidebar');
    const hasLpPopup = new URL(window.location.href).searchParams.has('lp_popup');
    const hostname = window.location.hostname.toLowerCase();
    const isGeminiDomain = hostname.includes('gemini');
    const isNarrowFrame = typeof window.innerWidth === "number" && window.innerWidth < 900;
    if (!hasLpSidebar && !isGeminiDomain && !hasLpPopup && !isNarrowFrame) {
      window.__lpInstalled = true; // Prevent re-running
      shouldEarlyExit = true;
    }
  } catch (err) {
    console.warn("[LP Sidebar AI] Early exit check failed:", err);
  }
  if (shouldEarlyExit) return;

  // Some providers can render the composer in a nested narrow frame.
  const isNarrowFrame =
    typeof window !== "undefined"
    && typeof window.innerWidth === "number"
    && window.innerWidth < 900;
  
  if (typeof window === "undefined") {
    return;
  }
  // REMOVED window.top check for now!
  if (window.__lpInstalled) {

    return;
  }
  window.__lpInstalled = true;

  const extensionApi = typeof browser !== "undefined" ? browser : chrome;
  if (!extensionApi || !extensionApi.runtime || !extensionApi.runtime.sendMessage) {
    return;
  }

  function debugLog(...args) {
    // Debug logging disabled for production
  }

  // ---------------------------------------------------------------------------
  // Shared module integration (aiContentScriptShared.js)
  // Hanya fungsi BARU yang tiada dalam fail ini ditambah di sini.
  // ---------------------------------------------------------------------------
  const _sh = window.__lpAiShared || {};

  // Injection failure notification — BARU, menggantikan silent .catch(() => {})
  // provider akan diisi oleh detectProvider() yang didefinisikan di bawah
  const notifyInjectionFailure = _sh.notifyInjectionFailure
    ? function(reason, details) {
        const prov = (typeof detectProvider === "function" ? detectProvider() : "") || "sidebar-ai";
        _sh.notifyInjectionFailure(extensionApi, prov, reason, details);
      }
    : function() {};

  // Robust fallback selector chain — BARU, menggantikan selector statik tunggal
  const queryWithFallbackChain = _sh.queryWithFallbackChain || function(selectors, filter) {
    for (const sel of (selectors||[])) { try { const n = document.querySelector(sel); if (n && (!filter || filter(n))) return n; } catch(e) {} }
    return null;
  };
  // Nota: sendMessage, isSidebarContext, isTextEditableElement dsb. masih
  // digunapakai dari implementasi asal fail ini di bawah.

  const SETTINGS_KEY = "settings";
  const SELECTION_POPUP_POSITION_KEY = "__lpSelectionSearchPopupPosition";
  const SIDEBAR_CHAT_FOCUS_SIGNAL_KEY = "__lpSidebarChatFocusSignal";
  const SIDEBAR_AI_FOCUS_PORT_NAME = "lp-sidebar-ai-focus";
  const SIDEBAR_CONTEXT_SESSION_KEY = "__lpSidebarContext";
  const PROMPT_APPLIED_SESSION_KEY = "__lpSidebarAiPromptApplied";
  const MANUAL_SUBMIT_FALLBACK_ID = "__lp_sidebar_ai_manual_submit_fallback";
  const MANUAL_SUBMIT_FALLBACK_COOLDOWN_MS = 5000;
  const AI_CATEGORY_SESSION_PREFIX = "ai-category:";
  const AI_CATEGORY_RESULT_POLL_INTERVAL_MS = 800;
  const AI_CATEGORY_RESULT_POLL_MAX_TICKS = 150;
  const DEFAULT_SIDEBAR_F6_DELAY_MS = 80;
  const SIDEBAR_FOCUS_SETTLE_MS = 140;
  const SIDEBAR_FOCUS_RESULT_EXTRA_WAIT_MS = 1800;

  let suppressAutoFocusUntil = 0;
  let lastSidebarFocusSignal = 0;
  let lastManualSubmitFallbackAt = 0;
  let lastFocusAttemptAt = 0;
  const FOCUS_COOLDOWN_MS = 800; // Minimum ms between focus attempts to prevent focus fight
  let focusAttemptTimer = null;
  let submitLoopRunning = false;
  let pendingPromptPollTimer = null;
  let sidebarFocusPort = null;
  let syntheticF6Timer = null;
  let scheduledSidebarFocusTimer = null;
  let scheduledSidebarFocusAt = 0;
  let sidebarTextSelectionObserver = null;
  let aiCategoryResultPollTimer = null;
  let activeAiCategoryResultSessionId = "";
  let activeAiCategoryResultBaselineEndIndex = -1;
  let sidebarFocusF6DelayMs = DEFAULT_SIDEBAR_F6_DELAY_MS;
  let f6DispatchInProgress = false;
  let lastSidebarContextCheck = 0;
  let lastLikelySidebarSurfaceCheck = 0;
  const CONTEXT_CHECK_THROTTLE_MS = 100;

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

  const PROVIDER_HOSTS = {
    chatgpt: ["chatgpt.com", "www.chatgpt.com", "chat.openai.com", "www.chat.openai.com"],
    claude: ["claude.ai"],
    gemini: ["gemini.google.com", "www.gemini.google.com", "gemini.googleusercontent.com", "www.gemini.googleusercontent.com"],
    perplexity: ["perplexity.ai"],
    copilot: ["copilot.microsoft.com"],
    grok: ["grok.com"],
    deepseek: ["deepseek.com"],
    poe: ["poe.com"],
    mistral: ["chat.mistral.ai"]
  };

  const PROVIDER_LABELS = {
    chatgpt: "ChatGPT",
    claude: "Claude",
    gemini: "Gemini",
    perplexity: "Perplexity",
    copilot: "Copilot",
    grok: "Grok",
    deepseek: "DeepSeek",
    poe: "Poe",
    mistral: "Mistral"
  };

  function hostToProvider(hostname) {
    const host = String(hostname || "").toLowerCase();
    const keys = Object.keys(PROVIDER_HOSTS);
    for (const key of keys) {
      const patterns = PROVIDER_HOSTS[key];
      if (!Array.isArray(patterns)) continue;
      const matches = patterns.some((pattern) => host === pattern || host.endsWith("." + pattern));
      if (matches) {
        return key;
      }
    }
    return "";
  }

  function normalizeProvider(value) {
    const key = value ? String(value).trim().toLowerCase() : "";
    return Object.prototype.hasOwnProperty.call(PROVIDER_HOSTS, key) ? key : "";
  }

  function providerLabel(provider) {
    const key = normalizeProvider(provider);
    return key && PROVIDER_LABELS[key] ? PROVIDER_LABELS[key] : "AI";
  }

  function currentProviderFromHost() {
    const result = hostToProvider(window.location.hostname || "");
    return result;
  }

  function providerFromReferrer() {
    let refHost = "";
    try {
      refHost = new URL(String(document.referrer || "")).hostname || "";
    } catch (err) {
      refHost = "";
    }
    const result = hostToProvider(refHost);
    return result;
  }

  function detectProvider() {
    const fromHost = currentProviderFromHost();
    if (fromHost) {
      return fromHost;
    }
    // Only detect Gemini on gemini.google.com specifically
    try {
      const hostname = window.location.hostname.toLowerCase();
      if (hostname === "gemini.google.com" || hostname.endsWith(".gemini.google.com")) {
        return "gemini";
      }
    } catch (err) {}
    const fromReferrer = providerFromReferrer();
    return fromReferrer;
  }

  function isSidebarContext() {
    const now = Date.now();
    if (now - lastSidebarContextCheck < CONTEXT_CHECK_THROTTLE_MS) {
      return window.__lpCachedSidebarContext || false;
    }
    lastSidebarContextCheck = now;
    try {
      const params = new URLSearchParams(window.location.search || "");
      if (params.get("lp_sidebar") === "1" || params.get("lp_popup") === "1") {
        try {
          window.sessionStorage.setItem(SIDEBAR_CONTEXT_SESSION_KEY, "1");
        } catch (err) {}
        window.__lpCachedSidebarContext = true;
        return true;
      }
      try {
        const sessionVal = window.sessionStorage.getItem(SIDEBAR_CONTEXT_SESSION_KEY);
        if (sessionVal === "1") {
          // B6 fix: validate the session flag against the current URL.
          // On SPA navigation the URL may have changed to a non-sidebar page
          // while the sessionStorage flag is still "1" from the previous page.
          // Re-check the URL to avoid returning a stale true result.
          const currentHref = window.location.href || "";
          const looksSidebar = currentHref.includes("lp_sidebar=1")
            || currentHref.includes("lp_popup=1")
            || window.name === "__LP_SIDEBAR__"
            || window.name === "__LP_OVERLAY__"
            || (typeof window.innerWidth === "number" && window.innerWidth < 900);
          if (!looksSidebar) {
            // Clear the stale flag
            try { window.sessionStorage.removeItem(SIDEBAR_CONTEXT_SESSION_KEY); } catch (_) {}
            window.__lpCachedSidebarContext = false;
            return false;
          }
          window.__lpCachedSidebarContext = true;
          return true;
        }
      } catch (err) {}
    } catch (err) {}
    const windowNameCheck = window.name === "__LP_SIDEBAR__" || window.name === "__LP_OVERLAY__" || window.innerWidth < 900;
    window.__lpCachedSidebarContext = windowNameCheck;
    return windowNameCheck;
  }

  function isLikelySidebarSurface() {
    const now = Date.now();
    if (now - lastLikelySidebarSurfaceCheck < CONTEXT_CHECK_THROTTLE_MS) {
      return window.__lpCachedLikelySidebarSurface || false;
    }
    lastLikelySidebarSurfaceCheck = now;
    if (isSidebarContext()) {
      window.__lpCachedLikelySidebarSurface = true;
      return true;
    }
    // If we detected any AI provider (like Gemini), return true!)
    const provider = detectProvider();
    if (provider) {
      window.__lpCachedLikelySidebarSurface = true;
      return true;
    }
    try {
      const ref = String(document.referrer || "").toLowerCase();
      if (ref.includes("lp_sidebar=1") || ref.includes("sidebar.html")) {
        window.__lpCachedLikelySidebarSurface = true;
        return true;
      }
    } catch (err) {}
    const innerWidthCheck = typeof window.innerWidth === "number" && window.innerWidth < 900;
    window.__lpCachedLikelySidebarSurface = innerWidthCheck;
    return innerWidthCheck;
  }

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

  function scheduleSidebarAutoFocus(provider, options = {}) {
    if (!isLikelySidebarSurface()) return false;
    const input = getFocusablePromptInput(provider);
    const alreadyFocused = input && activeElementMatchesPromptInput(input);
    if (alreadyFocused) return true;
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
      if (!isLikelySidebarSurface()) return;
      if (Date.now() < suppressAutoFocusUntil || hasActiveSelection()) {
        attemptFocus(provider);
        return;
      }
      suppressAutoFocusUntil = 0;
      if (options.ensurePort !== false) {
        ensureSidebarFocusPort(provider);
      }
      let focused = false;
      const input = getFocusablePromptInput(provider);
      if (input) {
        focused = focusPromptInput(input, provider);
      } else if (!options.skipComposerActivation) {
        activateComposerSurface(provider);
      }
      if (!focused) {
        attemptFocus(provider);
      }
    }, followupDelayMs);
    return true;
  }

  function waitForSidebarAutoFocusResult(provider, timeoutMs) {
    const timeout = Math.max(400, Number.isFinite(timeoutMs) ? timeoutMs : 2200);
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const checkFocus = () => {
        if (!isLikelySidebarSurface()) {
          resolve(false);
          return;
        }
        const input = getFocusablePromptInput(provider);
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

  function requestSidebarAutoFocus(provider, options = {}) {
    const scheduled = scheduleSidebarAutoFocus(provider, options);
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
      provider,
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
    if (!isLikelySidebarSurface()) return;
    // Guna shared implementation jika tersedia (mengelak duplikasi)
    if (_sh._ensureSidebarTextSelection || (typeof _sh === "object" && _sh.ensureSidebarTextSelection)) {
      // Try to use shared implementation
      return;
    }
    const STYLE_ID = "__lp_sidebar_force_text_selection";
    if (document.getElementById(STYLE_ID)) return;
    
    // Observer hanya perhatikan direct children document.body (bukan subtree penuh)
    // supaya tidak fire pada setiap DOM mutation dalam AI chat yang sangat kerap
    sidebarTextSelectionObserver = new MutationObserver(() => disableSkipToContentLinks());
    sidebarTextSelectionObserver.observe(document.body || document.documentElement, { childList: true });
    disableSkipToContentLinks(); // Initial run

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

  function sanitizeSelectionText(raw) {
    return String(raw || "").replace(/\s+/g, " ").trim().slice(0, 500);
  }

  function getSelectionText() {
    const selection = window.getSelection ? window.getSelection() : null;
    return selection ? sanitizeSelectionText(selection.toString()) : "";
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
        window.location.href = url;
        return;
      }
      const active = action !== "new-background-tab";
      try {
        if (extensionApi && extensionApi.runtime && extensionApi.runtime.sendMessage) {
          extensionApi.runtime.sendMessage({ type: "selection-search-open-url", url, active }).catch(() => {});
          return;
        }
      } catch (_err) {}
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
      if (url) openSelectionSearchUrl(url, action);
      if (selectionSearchPopupSettings.hideOnEngineClick) {
        hideSelectionSearchPopup();
        hideSelectionSearchTrigger();
      }
    }

    function ensureSelectionSearchPopup() {
      if (!isLikelySidebarSurface()) return null;
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
      const titleRow = document.createElement("div");
      titleRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;";
      const title = document.createElement("div");
      title.textContent = "SSS Sidebar";
      title.style.cssText = "font-size:13px;font-weight:700;color:#ffffff;";
      const settingsBtn = document.createElement("button");
      settingsBtn.type = "button";
      settingsBtn.title = "Buka tetapan SSS Search";
      settingsBtn.textContent = "⚙";
      settingsBtn.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.55);font-size:13px;cursor:pointer;transition:background 0.14s ease,color 0.14s ease,border-color 0.14s ease;flex-shrink:0;";
      settingsBtn.addEventListener("mouseenter", () => {
        settingsBtn.style.background = "rgba(99,179,237,0.18)";
        settingsBtn.style.borderColor = "rgba(99,179,237,0.4)";
        settingsBtn.style.color = "#90cdf4";
      });
      settingsBtn.addEventListener("mouseleave", () => {
        settingsBtn.style.background = "rgba(255,255,255,0.04)";
        settingsBtn.style.borderColor = "rgba(255,255,255,0.1)";
        settingsBtn.style.color = "rgba(255,255,255,0.55)";
      });
      settingsBtn.addEventListener("mousedown", (ev) => ev.stopPropagation());
      settingsBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        try {
          extensionApi.runtime.sendMessage({ type: "open-sss-settings" }).catch(() => {});
        } catch (_) {}
      });
      titleRow.append(title, settingsBtn);
      const subtitle = document.createElement("div");
      subtitle.textContent = "Pilih enjin carian untuk teks terpilih.";
      subtitle.style.cssText = "font-size:11px;color:rgba(255,255,255,0.6);";
      header.append(titleRow, subtitle);
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
      if (!isLikelySidebarSurface()) return null;
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
    }

    function hideSelectionSearchTrigger() {
      const trigger = document.getElementById("__lp_selection_search_trigger");
      if (!trigger) return;
      trigger.style.display = "none";
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
    }

    function scheduleSelectionPopupUpdate(forceOpen) {
      if (selectionSearchPopupTimer) clearTimeout(selectionSearchPopupTimer);
      if (!selectionSearchPopupSettings.enabled) {
        hideSelectionSearchPopup();
        hideSelectionSearchTrigger();
        return;
      }
      if (!shouldShowSelectionPopup()) {
        hideSelectionSearchPopup();
        hideSelectionSearchTrigger();
        return;
      }
      if (selectionSearchPopupSettings.openBehavior === "manual" && !forceOpen) {
        hideSelectionSearchPopup();
        showSelectionSearchTrigger();
        return;
      }
      hideSelectionSearchTrigger();
      const delay = Number.isFinite(selectionSearchPopupSettings.delayMs) ? selectionSearchPopupSettings.delayMs : 0;
      selectionSearchPopupTimer = setTimeout(() => showSelectionSearchPopup(true), delay);
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

  async function sendAiCategoryClassificationResult(provider, sessionId, rawText) {
    if (!sessionId) return null;
    return sendMessage({
      type: "ai-category-classification-result",
      payload: {
        provider: normalizeProvider(provider),
        sessionId: String(sessionId),
        rawText: String(rawText || "")
      }
    });
  }

  async function sendAiCategoryClassificationError(provider, sessionId, reason, details) {
    if (!sessionId) return null;
    return sendMessage({
      type: "ai-category-classification-error",
      payload: {
        provider: normalizeProvider(provider),
        sessionId: String(sessionId),
        reason: String(reason || "unknown"),
        attempts: details && Number.isFinite(details.attempts) ? details.attempts : 0
      }
    });
  }

  function startAiCategoryResultPolling(provider, sessionId) {
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
        sendAiCategoryClassificationResult(provider, currentSessionId, block).catch(() => {});
        return;
      }
      if (ticks >= AI_CATEGORY_RESULT_POLL_MAX_TICKS) {
        stopAiCategoryResultPolling();
        sendAiCategoryClassificationError(provider, currentSessionId, "result-timeout", {
          attempts: ticks
        }).catch(() => {});
      }
    }, AI_CATEGORY_RESULT_POLL_INTERVAL_MS);
  }

  function getResponseContainer(provider) {
    // Provider-specific selectors for the last AI response element
    // Returns the last matching element (most recent response)
    var selectors = {
      gemini: [
            // 2025/2026 Gemini UI response containers
            "ms-chat-turn[model-turn]",
            "ms-chat-turn .model-response-text",
            "div[data-is-model-response]",
            "[data-message-role='model']",
            "[data-role='model']",
            "[data-message-type='model']",
            "[data-author='model']",
            // Legacy selectors (pre-2025)
            "model-response",
            "message-content",
            "response-element",
            "[data-response-index]",
            ".response-container-content",
            ".model-response-text",
            "div[data-chunk-index]",
            "[class*='response-text']",
            "[class*='model-response']",
            "[class*='bot-message']",
            "[class*='assistant-message']",
            // Generic fallback for any turn container
            "[class*='ModelResponse' i]",
            "[class*='BotMessage' i]",
            "[class*='AssistantMessage' i]"
          ],
      claude: [
        "[data-testid='assistant-message']",
        ".assistant-message",
        "[data-is-streaming]",
        "div[data-message-author-role='assistant']"
      ],
      perplexity: [
        ".prose",
        "[data-testid='answer']",
        ".answer-content"
      ],
      copilot: [
        "[data-content='ai-message']",
        ".ai-message",
        "cib-message[source='bot']"
      ],
      grok: [
        "[data-message-author-role='assistant']",
        ".message-bubble"
      ],
      deepseek: [
        "[class*='assistant']",
        "[data-role='assistant']"
      ],
      poe: [
        "[class*='Message_botMessageBubble']",
        "[class*='botMessage']"
      ],
      mistral: [
        "[class*='assistant']",
        "[data-role='assistant']"
      ]
    };
    var list = (provider && selectors[provider]) ? selectors[provider] : [];
    // Generic fallbacks
    var generic = [
      "[data-message-author-role='assistant']",
      "[data-role='assistant']",
      ".assistant-message",
      "model-response",
      "message-content"
    ];
    var all = list.concat(generic);
    for (var i = 0; i < all.length; i++) {
      try {
        var nodes = document.querySelectorAll(all[i]);
        if (nodes && nodes.length > 0) {
          return nodes[nodes.length - 1]; // last = most recent response
        }
      } catch (e) {}
    }
    return null;
  }

  function getResponseContainerText(provider) {
    // Try to get text from the response container
    // Handles both regular DOM and shadow DOM
    var container = getResponseContainer(provider);
    if (!container) return null;
    // Try innerText first (renders visible text only)
    var text = "";
    try {
      text = typeof container.innerText === "string" ? container.innerText : "";
    } catch (e) {}
    if (!text) {
      try {
        text = typeof container.textContent === "string" ? container.textContent : "";
      } catch (e) {}
    }
    return text ? text.trim() : null;
  }

  function startOverlayResultPolling(provider, sessionId) {
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
        var containerText = getResponseContainerText(provider);
        var text, useContainer;
        if (containerText && containerText.length >= 3) {
          text = containerText;
          useContainer = true;
        } else {
          var root = document.body || document.documentElement;
          var cur = root ? (root.textContent || "") : "";
          if (!cur || cur.length <= base.length) return;
          text = cur.slice(base.length).trim();
          useContainer = false;
        }
        if (!text || text.length < 3) return;
        if (text === last) {
          stable++;
        } else {
          stable = 0;
          last = text;
          sendMessage({
            type: "ai-overlay-response",
            overlayToken: token,
            responseText: last,
            done: false
          }).catch(function () {});
        }
        var done = stable >= STABLE_REQUIRED;
        if (done) {
          sendMessage({
            type: "ai-overlay-response",
            overlayToken: token,
            responseText: last,
            done: true
          }).catch(function () {});
          clearInterval(tmr);
        }
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

  loadSelectionPopupManualPosition();

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

  function isOverlayContext() {
    try {
      const params = new URLSearchParams(window.location.search || "");
      if (params.get("lp_popup") === "1") return true;
    } catch (err) {}
    if (window.name === "__LP_OVERLAY__") return true;
    return false;
  }

  function dispatchSyntheticF6Twice(delayMs = 500) {
    if (!isLikelySidebarSurface()) return;
    if (isOverlayContext()) {
      console.log("[LP Sidebar AI] dispatchSyntheticF6Twice: overlay context detected, skipping F6");
      return;
    }
    // Prevent overlapping F6 dispatches
    if (f6DispatchInProgress) {
      console.log("[LP Sidebar AI] dispatchSyntheticF6Twice: F6 dispatch already in progress, skipping");
      return;
    }
    const provider = detectProvider();
    if (syntheticF6Timer) {
      clearTimeout(syntheticF6Timer);
      syntheticF6Timer = null;
    }
    syntheticF6Timer = setTimeout(() => {
      f6DispatchInProgress = true;
      const input = getFocusablePromptInput(provider);
      if (input && activeElementMatchesPromptInput(input)) {
        console.log("[LP Sidebar AI] dispatchSyntheticF6Twice: input already focused, skipping F6");
        f6DispatchInProgress = false;
        syntheticF6Timer = null;
        return;
      }
      // Check if input is visible and usable before dispatching F6
      if (!input || !isElementVisible(input)) {
        console.log("[LP Sidebar AI] dispatchSyntheticF6Twice: input not visible or not found, skipping F6");
        f6DispatchInProgress = false;
        syntheticF6Timer = null;
        return;
      }
      // Add focus listener to cancel F6 if cursor appears naturally
      let focusListenerAdded = false;
      const handleFocus = () => {
        if (focusListenerAdded) {
          input.removeEventListener("focus", handleFocus);
          focusListenerAdded = false;
        }
        if (checkTimer) {
          clearInterval(checkTimer);
          checkTimer = null;
        }
        console.log("[LP Sidebar AI] dispatchSyntheticF6Twice: input focused naturally, canceling F6");
        f6DispatchInProgress = false;
        syntheticF6Timer = null;
      };
      try {
        input.addEventListener("focus", handleFocus);
        focusListenerAdded = true;
      } catch (err) {}
      
      dispatchSyntheticF6Once();
      // Check multiple times after first F6 to catch cursor appearing
      let checkCount = 0;
      const maxChecks = 5; // Check up to 5 times for faster detection
      const checkInterval = 25; // Every 25ms
      let checkTimer = setInterval(() => {
        checkCount += 1;
        const input2 = getFocusablePromptInput(provider);
        if (input2 && activeElementMatchesPromptInput(input2)) {
          console.log("[LP Sidebar AI] dispatchSyntheticF6Twice: cursor appeared after first F6 (check " + checkCount + "), stopping");
          if (focusListenerAdded) {
            try { input2.removeEventListener("focus", handleFocus); } catch (err) {}
          }
          clearInterval(checkTimer);
          checkTimer = null;
          f6DispatchInProgress = false;
          syntheticF6Timer = null;
          return;
        }
        if (checkCount >= maxChecks) {
          // Cursor still not appeared after all checks, dispatch second F6
          if (focusListenerAdded) {
            try { input.removeEventListener("focus", handleFocus); } catch (err) {}
          }
          clearInterval(checkTimer);
          checkTimer = null;
          dispatchSyntheticF6Once();
          f6DispatchInProgress = false;
          syntheticF6Timer = null;
        }
      }, checkInterval);
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

  function isTextEditableElement(target) {
    if (!target) return false;
    const tag = target.tagName ? String(target.tagName).toUpperCase() : "";
    if (tag === "TEXTAREA" || tag === "INPUT") return true;
    if (target.isContentEditable) return true;
    try {
      const ce = target.getAttribute ? String(target.getAttribute("contenteditable") || "").toLowerCase() : "";
      return ce === "true" || ce === "plaintext-only";
    } catch (err) {
      return false;
    }
  }

  function getDeepActiveElement(root = document) {
    let active = root && root.activeElement ? root.activeElement : null;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    return active;
  }

  function collectDeepQuerySelectorAll(selectors, root = document, limit = 250) {
    const selectorList = Array.isArray(selectors) ? selectors : [selectors];
    const results = [];
    const seen = new Set();
    const visitedRoots = new Set();

    const push = (node) => {
      if (!node || seen.has(node)) return;
      seen.add(node);
      results.push(node);
    };

    const scanRoot = (currentRoot) => {
      if (!currentRoot || visitedRoots.has(currentRoot) || results.length >= limit) return;
      visitedRoots.add(currentRoot);

      for (const selector of selectorList) {
        if (!selector || results.length >= limit) continue;
        try {
          const nodes = currentRoot.querySelectorAll(selector);
          for (const node of nodes) {
            push(node);
            if (results.length >= limit) break;
          }
        } catch (err) {}
      }

      let allNodes = [];
      try {
        allNodes = currentRoot.querySelectorAll("*");
      } catch (err) {
        allNodes = [];
      }
      for (const node of allNodes) {
        if (results.length >= limit) break;
        if (node && node.shadowRoot) {
          scanRoot(node.shadowRoot);
        }
      }
    };

    scanRoot(root);
    return results;
  }

  function getShadowHostChain(node) {
    const hosts = [];
    let current = node;
    for (let i = 0; i < 8 && current; i++) {
      let root = null;
      try { root = current.getRootNode ? current.getRootNode() : null; } catch (err) { root = null; }
      if (!root || !root.host || hosts.includes(root.host)) break;
      hosts.push(root.host);
      current = root.host;
    }
    return hosts;
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
    let current = node.nodeType === 1 ? node : node.parentElement;
    while (current) {
      if (isTextEditableElement(current)) return true;
      current = current.parentElement;
    }
    return false;
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
    if (active === input || !!(input.contains && active && input.contains(active))) return true;
    const hosts = getShadowHostChain(input);
    return hosts.some((host) => active === host || !!(host.contains && active && host.contains(active)));
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
    if (tag === "textarea") score += 600;
    if (el.isContentEditable) score += 420;
    if (role === "textbox") score += 340;
    if (id.includes("prompt") || id.includes("composer") || id.includes("chat")) score += 320;
    if (className.includes("prompt") || className.includes("composer") || className.includes("input")) score += 260;
    if (className.includes("prosemirror")) score += 420;
    if (className.includes("ql-editor")) score += 900;
    if (className.includes("ql-blank")) score += 120;
    if (className.includes("claude")) score += 260;
    if (dataTestId.includes("prompt") || dataTestId.includes("composer") || dataTestId.includes("input")) score += 220;
    if (ariaLabel.includes("message") || ariaLabel.includes("ask") || ariaLabel.includes("prompt")) score += 210;
    if (placeholder.includes("message") || placeholder.includes("ask") || placeholder.includes("prompt")) score += 190;
    if (rect.bottom > window.innerHeight * 0.5) score += 280;
    score += Math.max(0, Math.min(260, rect.bottom));
    score += Math.max(0, Math.min(130, rect.width / 6));
    return score;
  }

  function getPromptInputAdapters(provider) {
    const shared = [
      {
        id: "textarea",
        boost: 1500,
        selectors: [
          "textarea:not([disabled]):not([readonly])",
          "form textarea:not([disabled]):not([readonly])"
        ]
      },
      {
        id: "textbox-role",
        boost: 1100,
        selectors: [
          "div[contenteditable]:not([contenteditable='false'])[role='textbox']",
          "[contenteditable]:not([contenteditable='false'])[role='textbox']",
          "form [contenteditable]:not([contenteditable='false'])[role='textbox']"
        ]
      },
      {
        id: "generic-editable",
        boost: 540,
        selectors: [
          "div[contenteditable]:not([contenteditable='false'])",
          "[contenteditable]:not([contenteditable='false'])"
        ]
      },
      {
        id: "input-text",
        boost: 280,
        selectors: [
          "input[type='text']:not([disabled]):not([readonly])"
        ]
      }
    ];

    const providerSpecific = {
      chatgpt: [
        {
          id: "chatgpt-composer",
          boost: 2200,
          selectors: [
            "div[data-testid*='composer' i] [contenteditable]:not([contenteditable='false'])",
            "div[data-testid*='prompt' i] [contenteditable]:not([contenteditable='false'])",
            "div[data-testid*='input' i] [contenteditable]:not([contenteditable='false'])",
            "div[contenteditable]:not([contenteditable='false'])[aria-label*='ChatGPT' i]",
            "div[contenteditable]:not([contenteditable='false'])[data-placeholder*='ChatGPT' i]",
            "div[contenteditable]:not([contenteditable='false'])[role='textbox']",
            "textarea[aria-label*='ChatGPT' i]",
            "textarea[placeholder*='ChatGPT' i]",
            "textarea[aria-label*='message' i]",
            "textarea[placeholder*='message' i]",
            "main [contenteditable]:not([contenteditable='false'])",
            "form [contenteditable]:not([contenteditable='false'])"
          ]
        }
      ],
      claude: [
        {
          id: "claude-composer",
          boost: 2200,
          selectors: [
            "[contenteditable]:not([contenteditable='false'])[translate='no']",
            "div.ProseMirror[contenteditable]:not([contenteditable='false'])",
            "div[contenteditable]:not([contenteditable='false'])[data-placeholder*='Claude']",
            "div[contenteditable]:not([contenteditable='false'])[aria-label*='Claude']",
            "div[role='textbox'][contenteditable]:not([contenteditable='false'])",
            "div[data-testid*='composer' i] [contenteditable]:not([contenteditable='false'])",
            "fieldset [contenteditable]:not([contenteditable='false'])",
            "main [contenteditable]:not([contenteditable='false'])",
            "div[data-testid*='chat'] [contenteditable]:not([contenteditable='false'])"
          ]
        }
      ],
      gemini: [
        {
          id: "gemini-quill-editor",
          boost: 2800,
          selectors: [
            "rich-textarea .ql-editor[contenteditable]:not([contenteditable='false'])",
            ".ql-editor[contenteditable='true']",
            ".ql-editor[contenteditable]:not([contenteditable='false'])",
            "rich-textarea [contenteditable='true']"
          ]
        },
        {
          id: "gemini-composer",
          boost: 2400,
          selectors: [
            // 2025/2026 Gemini UI: new pill-shaped input area and modern components
            "div[contenteditable='true'][role='textbox']",
            "div[contenteditable='plaintext-only'][role='textbox']",
            "div[contenteditable][role='textbox']",
            "textarea[role='textbox']",
            // Gemini textarea with aria-label/title/placeholder
            "textarea[aria-label*='prompt' i]",
            "textarea[aria-label*='Gemini' i]",
            "textarea[aria-label*='message' i]",
            "textarea[aria-label*='Enter' i]",
            "textarea[aria-label*='Ask' i]",
            "textarea[placeholder*='Ask' i]",
            "textarea[placeholder*='Gemini' i]",
            "textarea[placeholder*='Enter' i]",
            "textarea[title*='Ask' i]",
            "div[aria-label*='Ask Gemini' i][role='textbox']",
            "div[aria-label*='Gemini' i][role='textbox']",
            "div[aria-label*='message' i][role='textbox']",
            "div[aria-multiline='true'][contenteditable]:not([contenteditable='false'])",
            // Legacy and modern Gemini container selectors
            "rich-textarea [contenteditable]:not([contenteditable='false'])",
            "div.ql-editor[contenteditable]:not([contenteditable='false'])",
            "ms-prompt-input-wrapper [contenteditable]",
            "ms-prompt-input [contenteditable]",
            "ms-chat-input [contenteditable]",
            "prompt-input-box [contenteditable]",
            "bard-text-input [contenteditable]",
            "bard-prompt-input [contenteditable]",
            "gds-textarea textarea",
            "gds-input textarea",
            "mat-form-field textarea",
            "[data-placeholder][contenteditable]",
            "[data-testid*='prompt' i][contenteditable]",
            "[data-testid*='input' i][contenteditable]",
            "[class*='prompt' i][contenteditable]",
            "[class*='message' i][contenteditable]",
            "[class*='composer' i][contenteditable]",
            "p[contenteditable='true']",
            // Additional modern Gemini UI selectors (2025+)
            "chat-input [contenteditable]",
            "message-input [contenteditable]",
            "text-input [contenteditable]",
            "input-field [contenteditable]"
          ]
        }
      ],
      perplexity: [
        {
          id: "perplexity-composer",
          boost: 2200,
          selectors: [
            "textarea[placeholder*='Ask']",
            "textarea[aria-label*='Ask']",
            "div[role='textbox'][contenteditable]:not([contenteditable='false'])"
          ]
        }
      ],
      copilot: [
        {
          id: "copilot-composer",
          boost: 2200,
          selectors: [
            "textarea[aria-label*='Ask']",
            "textarea[placeholder*='Ask']",
            "div[contenteditable]:not([contenteditable='false'])[role='textbox']"
          ]
        }
      ],
      grok: [
        {
          id: "grok-composer",
          boost: 2200,
          selectors: [
            // Grok.com menggunakan TipTap/ProseMirror contenteditable editor
            "div[contenteditable='true'].tiptap.ProseMirror",
            "div.tiptap.ProseMirror[contenteditable]",
            ".tiptap[contenteditable='true']",
            ".ProseMirror[contenteditable='true']",
            // Fallback generic
            "textarea[placeholder*='Ask Grok' i]",
            "textarea[placeholder*='Message Grok' i]",
            "textarea[aria-label*='Ask Grok' i]",
            "textarea[placeholder*='message']",
            "textarea[aria-label*='message']",
            "div[contenteditable]:not([contenteditable='false'])[role='textbox']"
          ]
        }
      ],
      deepseek: [
        {
          id: "deepseek-composer",
          boost: 2200,
          selectors: [
            "textarea[placeholder*='message']",
            "textarea[aria-label*='message']",
            "div[contenteditable]:not([contenteditable='false'])[role='textbox']"
          ]
        }
      ],
      poe: [
        {
          id: "poe-composer",
          boost: 2200,
          selectors: [
            "textarea[placeholder*='message']",
            "textarea[aria-label*='message']",
            "div[contenteditable]:not([contenteditable='false'])[role='textbox']"
          ]
        }
      ],
      mistral: [
        {
          id: "mistral-composer",
          boost: 2200,
          selectors: [
            "textarea[placeholder*='message']",
            "textarea[aria-label*='message']",
            "div[contenteditable]:not([contenteditable='false'])[role='textbox']"
          ]
        }
      ]
    };

    const specific = provider && providerSpecific[provider] ? providerSpecific[provider] : [];
    return [...specific, ...shared];
  }

  function findPromptInputDetails(provider) {
    const adapters = getPromptInputAdapters(provider);
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
      const selectors = Array.isArray(adapter.selectors) ? adapter.selectors : [];
      for (const selector of selectors) {
        let nodes = [];
        try {
          nodes = provider === "gemini"
            ? collectDeepQuerySelectorAll(selector, document, 180)
            : document.querySelectorAll(selector);
        } catch (err) {
          nodes = [];
        }
        for (const node of nodes) {
          pushCandidate(node, adapter);
        }
      }
    }

    let placeholderNodes = [];
    try {
      placeholderNodes = provider === "gemini"
        ? collectDeepQuerySelectorAll("[data-placeholder], [placeholder], [aria-label*='Ask' i], [aria-label*='Gemini' i]", document, 180)
        : document.querySelectorAll("[data-placeholder], [placeholder]");
    } catch (err) {
      placeholderNodes = [];
    }
    for (const node of placeholderNodes) {
      if (!node || !node.closest) continue;
      const editable = node.closest("textarea, input[type='text'], [contenteditable]:not([contenteditable='false']), [role='textbox']");
      pushCandidate(editable, { id: "placeholder-proxy", boost: 900 });
    }

    if (provider === "claude") {
      let hintNodes = [];
      try {
        hintNodes = Array.from(document.querySelectorAll("div, span, p"));
      } catch (err) {
        hintNodes = [];
      }
      for (const node of hintNodes) {
        if (!node || !node.textContent || !node.closest) continue;
        const text = String(node.textContent || "").trim().toLowerCase();
        if (!text) continue;
        if (!text.includes("type / for commands") && !text.includes("type a message")) continue;
        const container = node.closest("form, section, main, div");
        if (!container || !container.querySelector) continue;
        const editable = container.querySelector("textarea, [contenteditable]:not([contenteditable='false']), [role='textbox']");
        pushCandidate(editable, { id: "claude-hint-proxy", boost: 2100 });
      }
    }

    // Gemini may render the composer in web components / shadow DOM.
    if (provider === "gemini") {
      const shadowHostSelectors = [
        "ms-prompt-input",
        "ms-prompt-input-wrapper",
        "ms-chat-input",
        "rich-textarea",
        "bard-input-area",
        "bard-text-input",
        "bard-prompt-input",
        "input-area",
        "prompt-input-box",
        "gds-textarea",
        "gds-input",
        "mat-form-field",
        "chat-input",
        "message-input",
        "text-input",
        "input-field",
        "ms-send-button",
        "send-button"
      ];
      for (const hostSel of shadowHostSelectors) {
        try {
          const hosts = collectDeepQuerySelectorAll(hostSel, document, 80);
          for (const host of hosts) {
            if (!host) continue;
            const root = host.shadowRoot || host;
            try {
              const editables = collectDeepQuerySelectorAll(
                "[contenteditable]:not([contenteditable='false']), textarea:not([disabled]):not([readonly]), div[role='textbox']",
                root,
                80
              );
              for (const el of editables) {
                pushCandidate(el, { id: "gemini-shadow-composer", boost: 2400 });
              }
            } catch (err) {}
          }
        } catch (err) {}
      }
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

  function readPromptValue(target) {
    if (!target) return "";
    if (target.isContentEditable) {
      const inner = target.innerText || target.textContent || "";
      if (inner && String(inner).trim()) return inner;
      try {
        const paragraphs = target.querySelectorAll ? target.querySelectorAll("p, div[data-placeholder], span") : [];
        const chunks = [];
        for (const node of paragraphs) {
          if (!node || !node.textContent) continue;
          const piece = String(node.textContent).trim();
          if (piece) chunks.push(piece);
        }
        if (chunks.length) return chunks.join("\n");
      } catch (err) {}
      return inner;
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

  function prepareGeminiQuillEditor(target) {
    if (!target || !target.classList) return;
    if (target.classList.contains("ql-blank")) {
      target.classList.remove("ql-blank");
    }
    const richTextarea = target.closest ? target.closest("rich-textarea") : null;
    if (richTextarea && richTextarea.classList && richTextarea.classList.contains("ql-blank")) {
      richTextarea.classList.remove("ql-blank");
    }
  }

  async function insertViaClipboardPaste(target, text) {
    const payload = String(text || "");
    if (!target || !payload) return false;
    try {
      if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(payload);
      }
    } catch (err) {
      return false;
    }
    if (typeof target.focus === "function") {
      try { target.focus({ preventScroll: true }); } catch (err) {
        try { target.focus(); } catch (err2) {}
      }
    }
    if (target.isContentEditable && insertViaSyntheticPaste(target, payload)) {
      return true;
    }
    if (target.tagName && String(target.tagName).toLowerCase() === "textarea") {
      try {
        target.value = payload;
        target.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      } catch (err) {
        return false;
      }
    }
    return false;
  }

  async function setPromptValueGemini(target, promptText) {
    if (!target) return false;
    const text = String(promptText || "");
    if (!text) return false;
    prepareGeminiQuillEditor(target);
    // Try setPromptValue first
    if (setPromptValue(target, text, "gemini")) {
      const readBack = normalizePromptComparable(readPromptValue(target));
      const expected = normalizePromptComparable(text);
      const sample = expected.slice(0, Math.min(140, expected.length));
      if (readBack && (readBack === expected || (sample && readBack.includes(sample)))) {
        return true;
      }
    }
    // Try insertViaClipboardPaste
    if (await insertViaClipboardPaste(target, text)) {
      const readBack = normalizePromptComparable(readPromptValue(target));
      const expected = normalizePromptComparable(text);
      const sample = expected.slice(0, Math.min(140, expected.length));
      if (readBack && (readBack === expected || (sample && readBack.includes(sample)))) {
        return true;
      }
    }
    // Try insertViaSyntheticPaste directly
    if (insertViaSyntheticPaste(target, text)) {
      return true;
    }
    return false;
  }

  function setPromptValue(target, promptText, provider) {
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
        if (provider === "gemini") {
          prepareGeminiQuillEditor(target);
        }
        if (typeof target.focus === "function") {
          try { target.focus({ preventScroll: true }); } catch (err) {
            try { target.focus(); } catch (err2) {}
          }
        }
        let inserted = false;
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
        if (!inserted) {
          inserted = insertViaSyntheticPaste(target, text);
        }
        if (!inserted) {
          target.textContent = text;
          if (target.classList && target.classList.contains("ProseMirror")) {
            try {
              target.innerHTML = "";
              const paragraph = document.createElement("p");
              paragraph.textContent = text;
              target.appendChild(paragraph);
            } catch (err) {}
          }
        }
        // Gemini rich-textarea may need InputEvent with inputType to trigger React/Angular state update
        if (provider === "gemini") {
          try {
            const inputEvent = new InputEvent("input", {
              bubbles: true,
              cancelable: true,
              data: text,
              inputType: "insertText"
            });
            target.dispatchEvent(inputEvent);
          } catch (err) {
            target.dispatchEvent(new Event("input", { bubbles: true }));
          }
          // Also dispatch change events
          try { target.dispatchEvent(new Event("change", { bubbles: true })); } catch (err) {}
          // Dispatch on parent rich-textarea (legacy Gemini UI)
          const richTextarea = target.closest ? target.closest("rich-textarea") : null;
          if (richTextarea) {
            try {
              richTextarea.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, data: text, inputType: "insertText" }));
              richTextarea.dispatchEvent(new Event("change", { bubbles: true }));
            } catch (err) {
              try {
                richTextarea.dispatchEvent(new Event("input", { bubbles: true }));
                richTextarea.dispatchEvent(new Event("change", { bubbles: true }));
              } catch (err2) {}
            }
          }
          // 2026: Also dispatch on ms-prompt-input wrapper if present
          const msWrapper = target.closest ? target.closest("ms-prompt-input, ms-prompt-input-wrapper, bard-text-input, bard-prompt-input, prompt-input-box") : null;
          if (msWrapper) {
            try {
              msWrapper.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, composed: true, data: text, inputType: "insertText" }));
              msWrapper.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
            } catch (err) {}
          }
          const hostChain = getShadowHostChain(target);
          for (const host of hostChain) {
            try {
              host.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, composed: true, data: text, inputType: "insertText" }));
              host.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
            } catch (err) {}
          }
        } else {
          try {
            const inputEvent = new InputEvent("input", {
              bubbles: true,
              cancelable: true,
              data: text,
              inputType: "insertText"
            });
            target.dispatchEvent(inputEvent);
          } catch (err) {
            target.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }
        target.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    } catch (err) {
      return false;
    }
    return false;
  }

  function clickElementCenter(el) {
    if (!el || !el.getBoundingClientRect) return false;
    try {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const pointerProps = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: cx,
        clientY: cy,
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
        buttons: 1,
        isPrimary: true
      };
      const mouseProps = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1 };
      el.dispatchEvent(new PointerEvent("pointerdown", pointerProps));
      el.dispatchEvent(new MouseEvent("mousedown", mouseProps));
      el.dispatchEvent(new PointerEvent("pointerup", pointerProps));
      el.dispatchEvent(new MouseEvent("mouseup", mouseProps));
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1 }));
      if (typeof el.click === "function") {
        el.click();
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  let sidebarProviderLoadedReported = false;

  function notifySidebarProviderLoaded(provider) {
    const key = normalizeProvider(provider);
    if (!key || sidebarProviderLoadedReported) return;
    const input = getFocusablePromptInput(key);
    if (!input || !isUsablePromptInput(input)) return;
    sidebarProviderLoadedReported = true;
    try {
      const maybe = extensionApi.runtime.sendMessage({
        type: "sidebar-provider-loaded",
        provider: key
      });
      if (maybe && typeof maybe.catch === "function") maybe.catch(() => {});
    } catch (err) {}
  }

  function activateGeminiComposer(input) {
    if (!input) return false;
    if (activeElementMatchesPromptInput(input)) return true;
    const hostSelectors = [
      "rich-textarea",
      "ms-prompt-input",
      "ms-prompt-input-wrapper",
      "ms-chat-input",
      "bard-text-input",
      "bard-prompt-input",
      "prompt-input-box",
      "input-area"
    ];
    let activated = false;
    for (const sel of hostSelectors) {
      const host = input.closest ? input.closest(sel) : null;
      if (host && isElementVisible(host)) {
        activated = clickElementCenter(host) || activated;
      }
    }
    const hostChain = getShadowHostChain(input);
    for (const host of hostChain) {
      if (host && isElementVisible(host)) {
        activated = clickElementCenter(host) || activated;
      }
      try {
        host.dispatchEvent(new FocusEvent("focus", { bubbles: true, composed: true }));
        host.dispatchEvent(new Event("focusin", { bubbles: true, composed: true }));
      } catch (err) {}
    }
    prepareGeminiQuillEditor(input);
    return activated || clickElementCenter(input);
  }

  function activateClaudeComposer(input) {
    if (!input) return false;
    if (activeElementMatchesPromptInput(input)) return true;
    const hostSelectors = [
      "[data-testid*='composer' i]",
      "[data-testid*='input' i]",
      "fieldset",
      "form",
      ".composer",
      "[class*='composer' i]",
      "[class*='input' i]"
    ];
    let activated = false;
    for (const sel of hostSelectors) {
      const host = input.closest ? input.closest(sel) : null;
      if (host && isElementVisible(host)) {
        activated = clickElementCenter(host) || activated;
      }
    }
    const hostChain = getShadowHostChain(input);
    for (const host of hostChain) {
      if (host && isElementVisible(host)) {
        activated = clickElementCenter(host) || activated;
      }
      try {
        host.dispatchEvent(new FocusEvent("focus", { bubbles: true, composed: true }));
        host.dispatchEvent(new Event("focusin", { bubbles: true, composed: true }));
      } catch (err) {}
    }
    return activated || clickElementCenter(input);
  }

  function focusGeminiPromptInput(provider, options = {}) {
    const input = getFocusablePromptInput(provider);
    if (!input) {
      if (!options.skipComposerActivation) {
        activateComposerSurface(provider);
      }
      return false;
    }
    const alreadyFocused = activeElementMatchesPromptInput(input);
    if (alreadyFocused) return true;
    try { window.focus(); } catch (err) {}
    activateGeminiComposer(input);
    suppressAutoFocusUntil = 0;
    let focused = focusPromptInput(input, provider);
    if (!focused) {
      activateGeminiComposer(input);
      focused = focusPromptInput(input, provider);
    }
    if (!focused && !options.skipComposerActivation) {
      activateComposerSurface(provider);
    }
    if (focused) {
      notifySidebarProviderLoaded(provider);
    }
    return focused;
  }

  function focusClaudePromptInput(provider, options = {}) {
    const input = getFocusablePromptInput(provider);
    if (!input) {
      if (!options.skipComposerActivation) {
        activateComposerSurface(provider);
      }
      return false;
    }
    const alreadyFocused = activeElementMatchesPromptInput(input);
    if (alreadyFocused) return true;
    try { window.focus(); } catch (err) {}
    activateClaudeComposer(input);
    suppressAutoFocusUntil = 0;
    let focused = focusPromptInput(input, provider);
    if (!focused) {
      activateClaudeComposer(input);
      focused = focusPromptInput(input, provider);
    }
    if (!focused && !options.skipComposerActivation) {
      activateComposerSurface(provider);
    }
    if (focused) {
      notifySidebarProviderLoaded(provider);
    }
    return focused;
  }

  function focusPromptInput(input, providerHint) {
    if (!input) return false;
    if (activeElementMatchesPromptInput(input)) return true;
    const provider = normalizeProvider(providerHint) || detectProvider();
    if (provider === "gemini") {
      activateGeminiComposer(input);
    }
    if (provider === "claude") {
      activateClaudeComposer(input);
    }
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
      input.dispatchEvent(new FocusEvent("focus", { bubbles: true, composed: provider === "gemini" }));
      input.dispatchEvent(new Event("focusin", { bubbles: true, composed: provider === "gemini" }));
    } catch (err) {}
    if (provider === "gemini") {
      for (const host of getShadowHostChain(input)) {
        try {
          host.dispatchEvent(new FocusEvent("focus", { bubbles: true, composed: true }));
          host.dispatchEvent(new Event("focusin", { bubbles: true, composed: true }));
        } catch (err) {}
      }
    }
    placeCaretAtEnd(input);
    queueCaretPlacement(input);
    return activeElementMatchesPromptInput(input);
  }

  function normalizeFocusSignalValue(rawValue) {
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return numeric;
  }

  function getFocusablePromptInput(provider) {
    const details = findPromptInputDetails(provider);
    return details && details.input ? details.input : null;
  }

  function focusSidebarPromptInput(provider, options = {}) {
    if (!isLikelySidebarSurface()) return false;
    const input = getFocusablePromptInput(provider);
    const alreadyFocused = input && activeElementMatchesPromptInput(input);
    if (!options.skipSyntheticF6 && !alreadyFocused) {
      dispatchSyntheticF6Twice(Number.isFinite(options.delayMs) ? options.delayMs : 80);
    }
    const normalizedProvider = normalizeProvider(provider);
    if (normalizedProvider === "gemini") {
      return focusGeminiPromptInput(provider, options);
    }
    if (normalizedProvider === "claude") {
      return focusClaudePromptInput(provider, options);
    }
    if (!input) {
      if (!options.skipComposerActivation) {
        activateComposerSurface(provider);
      }
      return false;
    }
    if (alreadyFocused) return true;
    suppressAutoFocusUntil = 0;
    const focused = focusPromptInput(input, provider);
    if (!focused && !options.skipComposerActivation) {
      activateComposerSurface(provider);
    }
    return focused;
  }

  function stopFocusAttempts() {
    if (!focusAttemptTimer) return;
    clearInterval(focusAttemptTimer);
    focusAttemptTimer = null;
  }

  function attemptFocus(provider) {
    if (!isLikelySidebarSurface()) return;
    if (f6DispatchInProgress) {
      console.log("[LP Sidebar AI] attemptFocus: F6 dispatch in progress, skipping");
      return;
    }
    stopFocusAttempts();
    let attempts = 0;
    const maxAttempts = 100;
    focusAttemptTimer = setInterval(() => {
      attempts += 1;
      if (!isLikelySidebarSurface()) {
        stopFocusAttempts();
        return;
      }
      if (f6DispatchInProgress) {
        stopFocusAttempts();
        return;
      }
      // Suppress window: stop bila max attempts dicapai
      if (Date.now() < suppressAutoFocusUntil) {
        if (attempts >= maxAttempts) {
          stopFocusAttempts();
        }
        return;
      }
      // Cooldown check to prevent focus fight
      const now = Date.now();
      if (now - lastFocusAttemptAt < FOCUS_COOLDOWN_MS) {
        return;
      }
      lastFocusAttemptAt = now;
      // Active text selection: defer sahaja (skip tick ini, cuba semula pada tick seterusnya)
      // Tidak stop — fokus akan berlaku segera apabila selection dibersihkan
      if (hasActiveSelection()) {
        return;
      }
      // Check if prompt input is already focused - stop attempts if yes
      const input = getFocusablePromptInput(provider);
      if (input && activeElementMatchesPromptInput(input)) {
        stopFocusAttempts();
        return;
      }
      // Only stop if some other editable element has focus (to avoid focus fight)
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

      if (input) {
        const normalizedProvider = normalizeProvider(provider);
        const focused = normalizedProvider === "gemini"
          ? focusGeminiPromptInput(provider, { skipSyntheticF6: true, skipComposerActivation: true })
          : normalizedProvider === "claude"
          ? focusClaudePromptInput(provider, { skipSyntheticF6: true, skipComposerActivation: true })
          : focusPromptInput(input, provider);
        if (focused || attempts >= maxAttempts) {
          stopFocusAttempts();
        }
      } else if (attempts >= maxAttempts) {
        stopFocusAttempts();
      } else if (attempts % 8 === 0) {
        activateComposerSurface(provider);
      }
    }, 150);
  }

  let windowHasOsFocus = document.hasFocus();
  window.addEventListener("focus", () => {
    windowHasOsFocus = true;
    // Semasa general trigger, kita mungkin tiada provider specifik dihantar
    // jadi reportSidebarFocusStatus hanya dipanggil dari tempat yang tahu status focus
  });
  window.addEventListener("blur", () => {
    windowHasOsFocus = false;
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

  function requestNativeF6Fallback(reason) {
    setTimeout(() => {
      const currentProvider = detectProvider();
      if (!currentProvider) return;
      const input = getFocusablePromptInput(currentProvider);
      if (input && activeElementMatchesPromptInput(input)) return;
      try {
        const maybe = extensionApi.runtime.sendMessage({
          type: "sidebar-native-f6-request",
          reason: reason || "sidebar-input-not-focused"
        });
        if (maybe && typeof maybe.catch === "function") maybe.catch(() => {});
      } catch (err) {}
    }, 200);
  }

  function triggerSidebarFocus(provider, options = {}) {
    if (!isLikelySidebarSurface()) return false;
    const now = Date.now();
    if (!options.forceFocus && now - lastFocusAttemptAt < FOCUS_COOLDOWN_MS) {
      return false;
    }
    lastFocusAttemptAt = now;
    const focused = focusSidebarPromptInput(provider, options);
    reportSidebarFocusStatus(focused);
    if (!focused) {
      attemptFocus(provider);
      requestNativeF6Fallback("sidebar-trigger-focus");
    }
    setTimeout(() => {
      const promptInput = getFocusablePromptInput(provider);
      const stillFocused = promptInput && activeElementMatchesPromptInput(promptInput);
      reportSidebarFocusStatus(!!stillFocused);
    }, 400);
    return focused;
  }

  function runImmediateFocusBurst(provider) {
    if (!isLikelySidebarSurface()) return;
    if (f6DispatchInProgress) {
      console.log("[LP Sidebar AI] runImmediateFocusBurst: F6 dispatch in progress, skipping");
      return;
    }
    const normalizedProvider = normalizeProvider(provider);
    const delays = normalizedProvider === "gemini" || normalizedProvider === "claude"
      ? [0, 150, 350, 750, 1300, 2100, 3200, 4500, 6000, 7800]
      : [0, 180, 500, 1000];
    delays.forEach((delay) => {
      setTimeout(() => {
        if (!isLikelySidebarSurface()) return;
        if (f6DispatchInProgress) return;
        const input = getFocusablePromptInput(provider);
        if (input && activeElementMatchesPromptInput(input)) return;
        suppressAutoFocusUntil = 0;
        if (input) {
          if (normalizedProvider === "gemini") {
            focusGeminiPromptInput(provider, { skipSyntheticF6: true, skipComposerActivation: true });
          } else if (normalizedProvider === "claude") {
            focusClaudePromptInput(provider, { skipSyntheticF6: true, skipComposerActivation: true });
          } else {
            focusPromptInput(input, provider);
          }
        } else {
          activateComposerSurface(provider);
          attemptFocus(provider);
        }
      }, delay);
    });
  }
  function applySidebarFocusSignal(provider, rawValue) {
    const signal = normalizeFocusSignalValue(rawValue);
    if (!signal) return false;
    if (signal <= lastSidebarFocusSignal) return false;
    lastSidebarFocusSignal = signal;
    return triggerSidebarFocus(provider, { forceFocus: true });
  }

  function checkPendingSidebarFocusSignal(provider) {
    if (!isLikelySidebarSurface()) return;
    readLocalStorageValue(SIDEBAR_CHAT_FOCUS_SIGNAL_KEY, (value) => {
      applySidebarFocusSignal(provider, value);
    });
  }

  function ensureSidebarFocusPort(provider) {
    if (!isLikelySidebarSurface()) return;
    if (sidebarFocusPort) return;
    if (!extensionApi.runtime || !extensionApi.runtime.connect) return;
    try {
      const port = extensionApi.runtime.connect({ name: SIDEBAR_AI_FOCUS_PORT_NAME });
      sidebarFocusPort = port;
      port.onMessage.addListener((message) => {
        if (!message || message.type !== "focus-input") return;
        try { window.focus(); } catch (err) {}
        const forceFocus = !!(message && message.forceFocus);
        const focused = triggerSidebarFocus(provider, { forceFocus });
        if (!focused) {
          requestNativeF6Fallback("sidebar-port-focus-input");
        }
      });
      port.onDisconnect.addListener(() => {
        sidebarFocusPort = null;
        setTimeout(() => {
          ensureSidebarFocusPort(provider);
        }, 300);
      });
    } catch (err) {
      sidebarFocusPort = null;
    }
  }

  function getElementCenter(el) {
    if (!el || !el.getBoundingClientRect) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  function distanceBetweenElements(a, b) {
    if (!a || !b) return Number.POSITIVE_INFINITY;
    const centerA = getElementCenter(a);
    const centerB = getElementCenter(b);
    const dx = centerA.x - centerB.x;
    const dy = centerA.y - centerB.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function buttonHintText(button) {
    if (!button) return "";
    const chunks = [
      button.getAttribute ? button.getAttribute("aria-label") : "",
      button.getAttribute ? button.getAttribute("title") : "",
      button.getAttribute ? button.getAttribute("data-testid") : "",
      button.getAttribute ? button.getAttribute("name") : "",
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
    if (String(ariaDisabled || "").toLowerCase() === "true") return true;
    // Check for common disabled class names
    const className = String(button.className || "").toLowerCase();
    if (className.includes("disabled")) return true;
    return false;
  }

  function getSendButtonAdapters(provider) {
    const shared = [
      {
        id: "send-aria",
        boost: 900,
        selectors: [
          "button[aria-label*='Send' i]",
          "button[title*='Send' i]",
          "button[data-testid*='send' i]",
          "[role='button'][aria-label*='Send' i]",
          "button[type='submit']"
        ]
      },
      {
        id: "submit-aria",
        boost: 760,
        selectors: [
          "button[aria-label*='Submit' i]",
          "button[title*='Submit' i]",
          "button[data-testid*='submit' i]",
          "[role='button'][aria-label*='Submit' i]"
        ]
      },
      {
        id: "icon-send",
        boost: 520,
        selectors: [
          "button[class*='send' i]",
          "[role='button'][class*='send' i]",
          "button[name*='send' i]",
          "button[aria-label*='Arrow Up' i]",
          "button[aria-label*='Upward' i]"
        ]
      }
    ];

    const providerSpecific = {
      chatgpt: [
        {
          id: "chatgpt-send",
          boost: 2200,
          selectors: [
            "button[aria-label*='Send message' i]",
            "button[aria-label*='Send' i]",
            "button[aria-label*='Submit' i]",
            "button[data-testid*='send' i]",
            "button[data-testid*='submit' i]",
            "button[title*='Send' i]",
            "button[type='submit']",
            "[role='button'][aria-label*='Send' i]",
            "[role='button'][aria-label*='Submit' i]",
            "button[class*='send-button' i]",
            "button[class*='sendButton' i]"
          ]
        }
      ],
      gemini: [
        {
          id: "gemini-send",
          boost: 2600,
          selectors: [
            // 2025/2026 Gemini new UI send button patterns
            "button[aria-label*='Send message' i]",
            "button[aria-label*='Send' i]",
            "button[aria-label*='Submit' i]",
            "button[aria-label*='Submit message' i]",
            "button[aria-label*='Ask Gemini' i]",
            "button[aria-label*='Ask' i]",
            "button[aria-label*='Send prompt' i]",
            "button[aria-label*='Submit prompt' i]",
            "button[aria-label*='Run' i]",
            "button[aria-label*='Go' i]",
            // Material tooltip (Angular)
            "button[mattooltip*='Send' i]",
            "button[mattooltip*='Submit' i]",
            "button[mattooltip*='Run' i]",
            // Title attribute
            "button[title*='Send' i]",
            "button[title*='Submit' i]",
            "button[title*='Run' i]",
            // Data-testid patterns (may vary by build)
            "button[data-testid*='send' i]",
            "button[data-testid*='submit' i]",
            "button[data-testid*='go' i]",
            // Structural: send button container (legacy + 2026)
            ".send-button > button",
            ".send-button button",
            "ms-send-button button",
            "[class*='send-button' i] button",
            "[class*='submit-button' i] button",
            // Class-based (Angular)
            "button[class*='send-button' i]",
            "button[class*='sendButton' i]",
            "button[class*='submit-button' i]",
            "button[class*='send-btn' i]",
            "button[class*='submit-btn' i]",
            // Arrow / up icon patterns
            "button[aria-label*='arrow' i]",
            "button[aria-label*='upward' i]",
            "button[aria-label*='arrow up' i]",
            // Last button inside send-button container
            ".send-button > button:last-of-type",
            ".send-button > button:last-child",
            // Role button support
            "[role='button'][aria-label*='Send' i]",
            "[role='button'][aria-label*='Submit' i]",
            "[role='button'][class*='send' i]",
            "[role='button'][class*='submit' i]"
          ]
        },
        {
          id: "gemini-composer-area",
          boost: 2000,
          selectors: [
            // Buttons near the bottom of the page (composer area)
            "form button[type='submit']",
            "form button:last-of-type",
            "form button:last-child",
            // 2025/2026 new composer structure
            "ms-prompt-input-wrapper button[type='submit']",
            "ms-prompt-input button",
            "ms-chat-input button",
            "chat-input button",
            "message-input button",
            "text-input button",
            "input-field button"
          ]
        }
      ],
      perplexity: [
        {
          id: "perplexity-send",
          boost: 1500,
          selectors: [
            "button[aria-label*='Submit' i]",
            "button[aria-label*='Send' i]",
            "button[data-testid*='submit' i]",
            "[role='button'][aria-label*='Submit' i]"
          ]
        }
      ],
      copilot: [
        {
          id: "copilot-send",
          boost: 1500,
          selectors: [
            "button[aria-label*='Send' i]",
            "button[title*='Send' i]",
            "button[data-testid*='send' i]",
            "[role='button'][aria-label*='Send' i]"
          ]
        }
      ],
      grok: [
        {
          id: "grok-send",
          boost: 1500,
          selectors: [
            // Grok.com send button pakai aria-label="Submit"
            "button[aria-label='Submit']",
            "button[aria-label*='Submit' i]",
            "button[aria-label*='Send' i]",
            "button[data-testid*='send' i]",
            "[role='button'][aria-label*='Send' i]"
          ]
        }
      ],
      deepseek: [
        {
          id: "deepseek-send",
          boost: 1500,
          selectors: [
            "button[aria-label*='Send' i]",
            "button[aria-label*='Submit' i]",
            "button[data-testid*='send' i]",
            "button[type='submit']"
          ]
        }
      ],
      poe: [
        {
          id: "poe-send",
          boost: 1500,
          selectors: [
            "button[aria-label*='Send' i]",
            "button[title*='Send' i]",
            "button[data-testid*='send' i]",
            "button[type='submit']"
          ]
        }
      ],
      mistral: [
        {
          id: "mistral-send",
          boost: 1500,
          selectors: [
            "button[aria-label*='Send' i]",
            "button[title*='Send' i]",
            "button[data-testid*='send' i]",
            "button[type='submit']"
          ]
        }
      ]
    };

    const specific = provider && providerSpecific[provider] ? providerSpecific[provider] : [];
    return [...specific, ...shared];
  }

  function rankSendButton(button, provider, input) {
    if (!button) return -1;
    const hint = buttonHintText(button);
    const rect = button.getBoundingClientRect();
    let score = 0;
    if (button.tagName && String(button.tagName).toLowerCase() === "button") score += 220;
    if ((button.type || "").toLowerCase() === "submit") score += 700;
    if (hint.includes("send")) score += 640;
    if (hint.includes("send message")) score += 320;
    if (hint.includes("submit")) score += 580;
    if (hint.includes("hantar")) score += 480;
    if (hint.includes("ask")) score += 120;
    if (hint.includes("message")) score += 90;
    if (hint.includes("composer")) score += 120;
    if (hint.includes("stop")) score -= 900;
    if (hint.includes("cancel")) score -= 620;
    if (hint.includes("attach")) score -= 680;
    if (hint.includes("upload")) score -= 680;
    if (hint.includes("mic")) score -= 680;
    if (hint.includes("voice")) score -= 680;
    if (hint.includes("audio")) score -= 680;
    // Gemini-specific: penalize toolbar buttons that are not send
    if (provider === "gemini") {
      if (hint.includes("toolbar")) score -= 500;
      if (hint.includes("more")) score -= 400;
      if (hint.includes("menu")) score -= 400;
      if (hint.includes("option")) score -= 400;
      // Boost buttons with "Submit" or "Ask" for Gemini
      if (hint.includes("submit")) score += 500;
      if (hint.includes("submit message")) score += 600;
      if (hint.includes("ask gemini")) score += 700;
      if (hint.includes("ask")) score += 400;
      if (hint.includes("send message")) score += 400;
      if (hint === "send" || hint.includes(" send ")) score += 300;
      if (hint.includes("go")) score += 350;
      if (hint.includes("run")) score += 350;
      if ((button.type || "").toLowerCase() === "submit") score += 650;
      // Strongly penalize "+" buttons (add attachment, not send)
      const btnText = (button.textContent || "").trim();
      if (btnText === "+" || btnText === "＋" || btnText.includes("+")) {
        if (!hint.includes("submit") && !hint.includes("send")) {
          score -= 2000;
        }
      }
      if (hint.includes("+") && !hint.includes("submit") && !hint.includes("send")) score -= 800;
      // Penalize attachment-related buttons
      if (hint.includes("attach") && !hint.includes("send") && !hint.includes("submit")) score -= 1200;
      if (hint.includes("add file") || hint.includes("upload")) score -= 1200;
      // Boost buttons that are last child of send-button container (the actual submit)
      const parent = button.parentElement;
      if (parent && parent.classList && (parent.classList.contains("send-button") || /send-button/i.test(parent.className || ""))) {
        if (button === parent.lastElementChild || button === parent.lastElementChild?.previousElementSibling) {
          score += 900;
        }
      }
    }
    if (rect.bottom > window.innerHeight * 0.45) score += 260;
    if (provider && hint.includes(provider)) score += 120;
    const distance = distanceBetweenElements(button, input);
    if (Number.isFinite(distance)) {
      score += Math.max(0, 450 - Math.min(450, distance));
    }
    return score;
  }

  function isLikelyGeminiSendButton(button, input) {
    if (!button) return false;
    const btnText = (button.textContent || "").trim();
    const hint = buttonHintText(button);
    if (btnText === "+" || btnText === "＋") return false;
    if (hint.includes("attach") && !hint.includes("send") && !hint.includes("submit")) return false;
    if (hint.includes("upload") && !hint.includes("send") && !hint.includes("submit")) return false;
    if (hint.includes("add file")) return false;
    if (hint.includes("mic") || hint.includes("voice") || hint.includes("audio")) return false;
    if (hint.includes("model") || hint.includes("fast") || hint.includes("thinking")) return false;
    if (/\bpro\b/.test(hint) && !hint.includes("prompt") && !hint.includes("prose")) return false;
    if (hint.includes("tool") && !hint.includes("submit")) return false;
    const likelySend = hint.includes("send")
      || hint.includes("submit")
      || hint.includes("ask gemini")
      || hint.includes("arrow-up")
      || hint.includes("upward")
      || hint.includes("go")
      || hint.includes("run")
      || (button.type || "").toLowerCase() === "submit";
    if (likelySend) return true;
    if (!input || !input.getBoundingClientRect) return false;
    const distance = distanceBetweenElements(button, input);
    return Number.isFinite(distance) && distance <= 350;
  }

  function findSendButtonCandidate(provider, input) {
    const adapters = getSendButtonAdapters(provider);
    const directMatches = [];
    const seen = new Set();

    // Gemini-specific: find the ACTUAL submit button (arrow-up) inside send-button container FIRST
    // This must run before generic selectors to avoid selecting the "+" attachment button
    if (provider === "gemini") {
      // Strategy 1: Find .send-button container (standard Gemini)
      // Strategy 2: Find any container with "send" in class name
      // Strategy 3: Find the composer form and its submit button
      // Strategy 4 (2026): ms-send-button and new pill input container
      const containerSelectors = [
        ".send-button",
        "[class*='send-button' i]",
        "[class*='sendButton' i]",
        "[class*='send_button' i]",
        "[class*='submit-button' i]",
        "[class*='send-btn' i]",
        "[class*='submit-btn' i]",
        "ms-send-button",
        "ms-prompt-input-wrapper",
        "ms-prompt-input",
        "ms-chat-input",
        "bard-send-button",
        "bard-prompt-input",
        "bard-text-input",
        "gds-button",
        "form[class*='composer' i]",
        "form[class*='input' i]",
        "chat-input",
        "message-input",
        "text-input",
        "input-field"
      ];
      const containers = new Set();
      for (const sel of containerSelectors) {
        try {
          collectDeepQuerySelectorAll(sel, document, 160).forEach(el => containers.add(el));
        } catch (err) {}
      }
      // Also check shadow roots for Gemini 2025/2026 Glic/component encapsulation
      try {
        const shadowHosts = collectDeepQuerySelectorAll("ms-prompt-input, ms-prompt-input-wrapper, ms-send-button, ms-chat-input, rich-textarea, bard-input-area, bard-send-button, bard-prompt-input, bard-text-input, gds-button, chat-input, message-input, text-input, input-field", document, 120);
        for (const host of shadowHosts) {
          if (host && host.shadowRoot) {
            try {
              host.shadowRoot.querySelectorAll("button, [role='button']").forEach(btn => {
                if (!btn || !isElementVisible(btn) || seen.has(btn)) return;
                if (!isLikelyGeminiSendButton(btn, input)) return;
                seen.add(btn);
                directMatches.push({ node: btn, score: rankSendButton(btn, provider, input) + 4200 });
              });
            } catch (err) {}
          }
        }
      } catch (err) {}
      for (const container of containers) {
        if (!container || !isElementVisible(container)) continue;
        const buttons = Array.from(container.querySelectorAll("button, [role='button']"));
        if (buttons.length < 1) continue;
        // Scan from last to first — submit button (arrow-up) is typically the last one
        for (let i = buttons.length - 1; i >= 0; i--) {
          const btn = buttons[i];
          if (!btn || seen.has(btn)) continue;
          if (!isElementVisible(btn)) continue;
          if (!isLikelyGeminiSendButton(btn, input)) continue;
          // Don't skip disabled buttons here — Angular may not have enabled it yet
          seen.add(btn);
          directMatches.push({ node: btn, score: rankSendButton(btn, provider, input) + 3800 });
          break; // Take the first valid one from the end
        }
      }
      if (directMatches.length) {
        directMatches.sort((a, b) => b.score - a.score);
        return directMatches[0].node || null;
      }
    }

    for (const adapter of adapters) {
      const selectors = Array.isArray(adapter.selectors) ? adapter.selectors : [];
      for (const selector of selectors) {
        let nodes = [];
        try {
          nodes = provider === "gemini"
            ? collectDeepQuerySelectorAll(selector, document, 200)
            : Array.from(document.querySelectorAll(selector));
        } catch (err) {
          nodes = [];
        }
        for (const node of nodes) {
          if (!node || seen.has(node)) continue;
          seen.add(node);
          if (!isElementVisible(node)) continue;
          // For Gemini: DON'T skip disabled buttons — Angular may not have enabled the send button yet
          // The clickSendButton retry logic will wait for the button to become enabled
          if (provider !== "gemini" && isButtonDisabled(node)) continue;
          // For Gemini: skip "+" buttons even in generic selector scan
          if (provider === "gemini") {
            const txt = (node.textContent || "").trim();
            if (txt === "+" || txt === "＋") continue;
            const h = buttonHintText(node);
            if (h.includes("attach") && !h.includes("send") && !h.includes("submit")) continue;
          }
          const score = rankSendButton(node, provider, input) + Number(adapter.boost || 0);
          if (score < 150) continue;
          directMatches.push({ node, score });
        }
      }
    }
    if (directMatches.length) {
      directMatches.sort((a, b) => b.score - a.score);
      return directMatches[0].node || null;
    }

    let nodes = [];
    try {
      nodes = provider === "gemini"
        ? collectDeepQuerySelectorAll("button, [role='button']", document, 250)
        : Array.from(document.querySelectorAll("button, [role='button']"));
    } catch (err) {
      nodes = [];
    }
    if (!nodes.length) return null;

    const ranked = [];
    for (const node of nodes) {
      if (!node) continue;
      if (!isElementVisible(node)) continue;
      // For Gemini: don't skip disabled buttons — Angular may enable them after prompt is filled
      if (provider !== "gemini" && isButtonDisabled(node)) continue;
      const hint = buttonHintText(node);
      const isSubmitType = (node.type || "").toLowerCase() === "submit";
      const likelySend = hint.includes("send")
        || hint.includes("submit")
        || hint.includes("hantar")
        || hint.includes("arrow-up")
        || hint.includes("upward");
      if (!isSubmitType && !likelySend) continue;
      // Skip non-send buttons (like "+") for Gemini
      if (provider === "gemini") {
        const text = (node.textContent || "").trim();
        if (text === "+" || text === "＋") continue;
        if (hint.includes("attach") && !hint.includes("send") && !hint.includes("submit")) continue;
      }
      const score = rankSendButton(node, provider, input);
      if (score < 150) continue;
      ranked.push({ node, score });
    }
    if (!ranked.length) return null;
    ranked.sort((a, b) => b.score - a.score);
    return ranked[0].node || null;
  }

  async function clickSendButton(provider, input) {
    let button = findSendButtonCandidate(provider, input);
    if (!button) return false;
    // Wait for button to become enabled (all providers, not just Gemini)
    for (let w = 0; w < 10; w++) {
      if (!isButtonDisabled(button)) break;
      await sleep(180);
      button = findSendButtonCandidate(provider, input) || button;
    }
    if (isButtonDisabled(button)) return false;
    try {
      return clickElementCenter(button);
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
      view: window,
      location: 0,
      repeat: false,
      isComposing: false,
      ctrlKey: !!options.ctrlKey,
      metaKey: !!options.metaKey,
      shiftKey: !!options.shiftKey,
      altKey: !!options.altKey
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

  function submitViaEnter(target, provider) {
    if (!target) return false;
    // Try different Enter combinations based on provider
    if (provider === "gemini") {
      // Gemini may use Enter or Ctrl+Enter or Shift+Enter or Meta+Enter
      return dispatchEnter(target) || dispatchEnter(target, { ctrlKey: true }) || dispatchEnter(target, { metaKey: true }) || dispatchEnter(target, { shiftKey: true }) || dispatchEnter(target, { altKey: true });
    }
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

  function activateComposerSurface(providerHint) {
    const provider = normalizeProvider(providerHint) || detectProvider();
    const candidates = [];
    const pushCandidate = (el) => {
      if (!el || !isElementVisible(el)) return;
      if (isInsideSwitcherHost(el)) return;
      candidates.push(el);
    };

    try {
      const selector = "[data-testid], [aria-label], [placeholder], [data-placeholder], form, main, rich-textarea, ms-prompt-input, ms-prompt-input-wrapper, ms-chat-input, .ql-editor, chat-input, message-input, text-input, input-field";
      const nodes = provider === "gemini"
        ? collectDeepQuerySelectorAll(selector, document, 250)
        : document.querySelectorAll(selector);
      for (const node of nodes) {
        const hint = [
          node.getAttribute ? node.getAttribute("data-testid") : "",
          node.getAttribute ? node.getAttribute("aria-label") : "",
          node.getAttribute ? node.getAttribute("placeholder") : "",
          node.getAttribute ? node.getAttribute("data-placeholder") : "",
          node.className && typeof node.className === "string" ? node.className : "",
          node.tagName ? String(node.tagName).toLowerCase() : ""
        ].join(" ").toLowerCase();
        if (
          hint.includes("composer")
          || hint.includes("prompt")
          || hint.includes("message")
          || hint.includes("ask")
          || hint.includes("chat")
          || hint.includes("gemini")
          || hint.includes("ql-editor")
          || hint.includes("rich-textarea")
          || hint.includes("ms-prompt")
        ) {
          pushCandidate(node);
        }
      }
    } catch (err) {
      return false;
    }

    if (!candidates.length) return false;
    const ranked = candidates
      .map((el) => {
        const rect = el.getBoundingClientRect();
        let score = 0;
        if (rect.bottom > window.innerHeight * 0.5) score += 520;
        score += Math.max(0, Math.min(260, rect.width / 5));
        score += Math.max(0, Math.min(220, rect.height));
        return { el, score };
      })
      .sort((a, b) => b.score - a.score);
    const target = ranked[0] && ranked[0].el ? ranked[0].el : null;
    if (!target) return false;
    return clickElementCenter(target);
  }

  function getComposerHealth(provider) {
    const details = findPromptInputDetails(provider);
    const input = details && details.input ? details.input : null;
    if (!input) {
      return {
        ok: false,
        reason: "input-not-found",
        adapterId: "none",
        input: null,
        sendButton: null,
        canSubmitByEnter: false
      };
    }
    if (!isUsablePromptInput(input)) {
      return {
        ok: false,
        reason: "input-not-usable",
        adapterId: details.adapterId,
        input,
        sendButton: null,
        canSubmitByEnter: false
      };
    }
    const sendButton = findSendButtonCandidate(provider, input);
    const tag = input.tagName ? String(input.tagName).toUpperCase() : "";
    const canSubmitByEnter = !!input.isContentEditable || tag === "TEXTAREA";
    const canSubmitByForm = !!(input && input.closest && input.closest("form"));
    if (!sendButton && !canSubmitByEnter && !canSubmitByForm) {
      return {
        ok: false,
        reason: "submit-path-not-found",
        adapterId: details.adapterId,
        input,
        sendButton: null,
        canSubmitByEnter,
        canSubmitByForm
      };
    }
    return {
      ok: true,
      reason: "",
      adapterId: details.adapterId,
      input,
      sendButton,
      canSubmitByEnter,
      canSubmitByForm
    };
  }

  async function copyToClipboard(promptText) {
    const text = String(promptText || "");
    if (!text) return false;
    try {
      if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) {}
    try {
      const area = document.createElement("textarea");
      area.value = text;
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

  function notifySubmitFallback(provider, sessionId, reason, copied, details) {
    // Notifikasi injection gagal – gantikan silent failure dengan log yang boleh dikesan
    notifyInjectionFailure(reason || "unknown", {
      provider: normalizeProvider(provider) || "sidebar-ai",
      sessionId: sessionId || "",
      adapterId: details && details.adapterId ? String(details.adapterId) : "",
      attempts: details && Number.isFinite(details.attempts) ? details.attempts : 0
    });
    try {
      const payload = {
        type: "summary-autofill-fallback",
        payload: {
          provider: normalizeProvider(provider) || "chatgpt",
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

  function showManualSubmitFallback(provider, promptText, reason, copied) {
    const now = Date.now();
    if (now - lastManualSubmitFallbackAt < MANUAL_SUBMIT_FALLBACK_COOLDOWN_MS) return;
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
    title.textContent = providerLabel(provider) + ": auto-submit perlukan bantuan manual";
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

  async function startSubmitLoop(provider, promptText, sessionId) {
    const prompt = String(promptText || "");
    if (!prompt.trim()) return;
    if (submitLoopRunning) return;
    submitLoopRunning = true;
    const normalizedSessionId = sessionId ? String(sessionId) : "";
    const aiCategorySession = isAiCategorySession(normalizedSessionId);

    let attempts = 0;
    const maxAttempts = provider === "gemini" ? 100 : 28;
    let lastReason = "composer-not-ready";
    let lastAdapterId = "none";
    const expected = normalizePromptComparable(prompt);
    const expectedSample = expected.slice(0, Math.min(140, expected.length));
    let submitted = false;

    while (attempts < maxAttempts && !submitted) {
      attempts += 1;
      const health = getComposerHealth(provider);
      lastReason = health.reason || lastReason;
      lastAdapterId = health.adapterId || lastAdapterId;

      if (!health.ok) {
        if (attempts % 5 === 0) {
          activateComposerSurface(provider);
        }
        await sleep(160);
        continue;
      }

      const input = health.input;
      if (!focusPromptInput(input, provider) && attempts % 3 === 0) {
        activateComposerSurface(provider);
      }
      const filled = provider === "gemini"
        ? await setPromptValueGemini(input, prompt)
        : setPromptValue(input, prompt, provider);
      if (!filled) {
        lastReason = "set-prompt-failed";
        await sleep(150);
        continue;
      }
      const readBack = normalizePromptComparable(readPromptValue(input));
      const relaxedVerified = !!readBack && readBack.length >= Math.min(48, Math.max(14, Math.floor(expected.length * 0.03)));
      const verified = !!readBack && (
        readBack === expected
        || (expectedSample && readBack.includes(expectedSample))
        || relaxedVerified
      );
      if (!verified) {
        lastReason = "prompt-verify-failed";
        await sleep(140);
        continue;
      }

      // Give SPA framework time to process input and enable send button
      await sleep(provider === "gemini" ? 800 : 300);
      const sent = await clickSendButton(provider, input) || submitViaEnter(input, provider) || submitViaForm(input);
      if (sent) {
        // Anggap berjaya sebaik butang diklik — jangan tunggu verify
        // supaya while loop tidak fire semula dan re-fill prompt
        submitted = true;
        break;
      }
      lastReason = "submit-trigger-failed";
      await sleep(160);
    }

    if (submitted) {
      if (normalizedSessionId) {
        markSessionApplied(normalizedSessionId);
        await sendMessage({
          type: "consume-pending-sidebar-prompt",
          sessionId: normalizedSessionId
        });
      }
      submitLoopRunning = false;
      if (aiCategorySession) {
        startAiCategoryResultPolling(provider, normalizedSessionId);
      } else if (normalizedSessionId.startsWith("ai-overlay:")) {
        startOverlayResultPolling(provider, normalizedSessionId);
      }
      window.__lpActiveSubmitSessionId = normalizedSessionId;
      setTimeout(() => { window.__lpActiveSubmitSessionId = ""; }, 15000);
      applyPendingPromptForProvider(provider).catch(() => {});
      startPendingPromptPolling(provider);
      return;
    }

    if (aiCategorySession) {
      submitLoopRunning = false;
      await sendAiCategoryClassificationError(provider, normalizedSessionId, lastReason, {
        attempts,
        adapterId: lastAdapterId
      });
      return;
    }
    const copied = await copyToClipboard(prompt);
    showManualSubmitFallback(provider, prompt, lastReason, copied);
    notifySubmitFallback(provider, sessionId, lastReason, copied, {
      attempts,
      adapterId: lastAdapterId
    });
    if (normalizedSessionId) markSessionApplied(normalizedSessionId);
    submitLoopRunning = false;
    applyPendingPromptForProvider(provider).catch(() => {});
    startPendingPromptPolling(provider);
  }

  async function applyPendingPromptForProvider(provider) {
    const normalizedProvider = normalizeProvider(provider);
    if (!normalizedProvider) return false;

    const peek = await sendMessage({ type: "peek-pending-sidebar-prompt" });
    if (!peek || peek.hasPendingPrompt !== true) return false;
    const pendingProvider = normalizeProvider(peek.provider);
    if (!pendingProvider || pendingProvider !== normalizedProvider) return false;

    const promptText = peek.prompt ? String(peek.prompt) : "";
    const sessionId = peek.sessionId ? String(peek.sessionId) : "";
    if (!promptText.trim()) {
      return false;
    }

    // Guard: jangan submit semula sesi yang sama
    if (sessionId && wasSessionApplied(sessionId)) {
      await sendMessage({ type: "consume-pending-sidebar-prompt", sessionId });
      return false;
    }

    // Apply when extension queued a prompt — not only inside narrow sidebar iframe.
    const isOverlaySession = sessionId && sessionId.startsWith("ai-overlay:");
    if (!isOverlaySession && !isLikelySidebarSurface() && !sessionId) return false;

    await startSubmitLoop(normalizedProvider, promptText, sessionId);
    return true;
  }

  function startPendingPromptPolling(provider) {
    if (pendingPromptPollTimer) {
      clearInterval(pendingPromptPollTimer);
      pendingPromptPollTimer = null;
    }
    // Gunakan adaptive interval: mula dengan 400ms, kemudian naik ke 1200ms
    // selepas beberapa tick tanpa pending prompt — kurangkan overhead idle polling
    let idleTicks = 0;
    let currentInterval = 400;
    const MAX_IDLE_INTERVAL = 1200;
    const scheduleNext = () => {
      pendingPromptPollTimer = setTimeout(async () => {
        if (submitLoopRunning) {
          idleTicks = 0;
          currentInterval = 400;
          scheduleNext();
          return;
        }
        const applied = await applyPendingPromptForProvider(provider).catch(() => false);
        if (applied) {
          idleTicks = 0;
          currentInterval = 400;
        } else {
          idleTicks++;
          // Selepas 3 tick idle, perlahan ke MAX_IDLE_INTERVAL
          if (idleTicks >= 3 && currentInterval < MAX_IDLE_INTERVAL) {
            currentInterval = MAX_IDLE_INTERVAL;
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

  // ── Butang "Ai" biru untuk teks yang dipilih dalam iframe sidebar/overlay AI ──
  // Bila user pilih teks dalam iframe AI, butang biru bulat muncul.
  // Klik hantar postMessage ke parent window (sidebar.js / overlay-wrapper.js)
  // yang relay ke background untuk buka sidebar dengan teks tersebut.
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
          // Hantar ke parent window (sidebar.js / overlay-wrapper.js)
          try {
            window.parent.postMessage({ type: "__lp_ai_sel_send", text: text }, "*");
          } catch (_) {}
          // Fallback: cuba runtime terus jika ada
          try {
            const api = typeof browser !== "undefined" ? browser : (typeof chrome !== "undefined" ? chrome : null);
            if (api && api.runtime) {
              api.runtime.sendMessage({ type: "open-ai-sidebar-with-prompt", prompt: text }).catch(() => {});
            }
          } catch (_) {}
          btn.textContent = "✓";
          btn.style.background = "#10b981";
          setTimeout(() => {
            btn.textContent = "Ai";
            btn.style.background = "rgba(59,130,246,0.95)";
            _hideAiSelBtn();
          }, 900);
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
        if (_aiSelContainer && _aiSelContainer.style.opacity === "0") {
          _aiSelContainer.style.display = "none";
        }
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
        // Semak jika klik bukan pada butang sendiri
        const sel = window.getSelection ? window.getSelection() : null;
        if (!sel || sel.isCollapsed) _hideAiSelBtn();
      }
    }, { passive: true });

    window.addEventListener("scroll", _hideAiSelBtn, { passive: true });
  }

  function start() {
    const provider = detectProvider();
    if (!provider) return;
    if (isLikelySidebarSurface()) {
      loadSidebarFocusSettings();
      ensureSidebarTextSelectionEnabled();

      document.addEventListener(
        "pointerdown",
        (event) => {
          if (!isLikelySidebarSurface()) return;
          if (isInsideSwitcherHost(event)) return;
          if (isEventInsideEditable(event)) return;
          suppressAutoFocusUntil = Date.now() + 1200;
        },
        true
      );
      document.addEventListener("selectionchange", () => {
        if (!isLikelySidebarSurface()) return;
        if (selectionSearchMouseDown) return;
        setTimeout(() => {
          scheduleSelectionPopupUpdate(false);
        }, 0);
      });
      document.addEventListener("mouseup", (event) => {
        if (!isLikelySidebarSurface()) return;
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
        if (!isLikelySidebarSurface()) return;
        if (isInsideSwitcherHost(event)) return;
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
        if (!isLikelySidebarSurface()) return;
        if (isInsideSwitcherHost(event)) return;
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
      document.addEventListener("contextmenu", () => {
        if (!isLikelySidebarSurface()) return;
        if (selectionSearchPopupSettings.hideOnRightClick) {
          hideSelectionSearchPopup();
          hideSelectionSearchTrigger();
        }
      }, true);
      window.addEventListener("scroll", () => {
        if (!isLikelySidebarSurface()) return;
        if (selectionSearchPopupSettings.hideOnScroll) {
          hideSelectionSearchPopup();
          hideSelectionSearchTrigger();
        }
      }, true);
      document.addEventListener("keyup", (event) => {
        if (!isLikelySidebarSurface()) return;
        if (!selectionSearchPopupSettings.enabled) return;
        if (isEventInsideEditable(event)) return;
        const key = event && event.key ? String(event.key) : "";
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
        if (!match) return;
        handleSelectionEngineActivate(match, 0);
      });

      document.addEventListener("keydown", (event) => {
        if (!isLikelySidebarSurface()) return;
        // Jangan intercept F6 kalau bukan sidebar/popup explicit — hanya narrow window biasa
        if (event.key === "F6") {
          try {
            const p = new URLSearchParams(window.location.search);
            if (p.get("lp_sidebar") !== "1" && p.get("lp_popup") !== "1" && !window.location.hostname.toLowerCase().includes("gemini")) {
              return;
            }
          } catch (_) { return; }
          // Only handle manual F6, not synthetic events
          if (!event.isTrusted) return;
          // Prevent default F6 behavior to avoid focus going to dropdown buttons
          event.preventDefault();
        }
        if (event.defaultPrevented) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (hasActiveSelection()) return;
        if (isEventInsideEditable(event)) return;
        if (event.key.length !== 1 && event.key !== "Backspace" && event.key !== "Enter" && event.key !== "F6") {
          return;
        }
        const input = getFocusablePromptInput(provider);
        if (!input) {
          // For manual F6, try to activate composer if input not found
          if (event.key === "F6" && event.isTrusted) {
            activateComposerSurface(provider);
          }
          return;
        }
        suppressAutoFocusUntil = 0;
        // For manual F6, ensure composer is activated before focusing
        if (event.key === "F6" && event.isTrusted) {
          const normalizedProvider = normalizeProvider(provider);
          if (normalizedProvider === "gemini") {
            activateGeminiComposer(input);
          } else if (normalizedProvider === "claude") {
            activateClaudeComposer(input);
          }
        }
        focusPromptInput(input, provider);
      });
    }

    // ── Butang "Ai" biru untuk teks yang dipilih dalam sidebar/overlay AI ──
    initAiSelectionButton();

    applyPendingPromptForProvider(provider).catch(() => {});
    startPendingPromptPolling(provider);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && isLikelySidebarSurface()) {
        ensureSidebarFocusPort(provider);
        attemptFocus(provider);
        checkPendingSidebarFocusSignal(provider);
      }
      if (document.visibilityState === "visible" && !submitLoopRunning) {
        applyPendingPromptForProvider(provider).catch(() => {});
      }
    });
    window.addEventListener("focus", () => {
      setTimeout(() => {
        ensureSidebarFocusPort(provider);
        attemptFocus(provider);
        checkPendingSidebarFocusSignal(provider);
      }, 120);
    });

    if (
      extensionApi.runtime
      && extensionApi.runtime.onMessage
      && !window.__lpSidebarAiFocusMessageListenerInstalled
    ) {
      window.__lpSidebarAiFocusMessageListenerInstalled = true;
        extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
          if (!message || (message.type !== "focus-sidebar-ai-input" && message.type !== "selection-search-copy-selection" && message.type !== "check-pending-prompt" && message.type !== "sidebar-cleanup")) {
            return;
          }
          if (message.type === "sidebar-cleanup") {
            clearScheduledSidebarFocus();
            if (syntheticF6Timer) {
              clearTimeout(syntheticF6Timer);
              syntheticF6Timer = null;
            }
            stopFocusAttempts();
            if (sendResponse) sendResponse({ ok: true });
            return false;
          }
          if (message.type === "check-pending-prompt") {
            // Guard: jangan check kalau submission sedang berjalan
            if (submitLoopRunning) {
              if (sendResponse) sendResponse({ ok: true, applied: false, busy: true });
              return true;
            }
            applyPendingPromptForProvider(provider).then((applied) => {
              startPendingPromptPolling(provider);
              if (sendResponse) sendResponse({ ok: true, applied });
            }).catch(() => {
              if (sendResponse) sendResponse({ ok: false, error: "check-failed" });
            });
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
          if (!isLikelySidebarSurface()) {
            if (sendResponse) sendResponse({ ok: false, reason: "not-sidebar-context" });
            return false;
          }
        try { window.focus(); } catch (err) {}
        runImmediateFocusBurst(provider);
        const focused = triggerSidebarFocus(provider, { forceFocus: true });
        applyPendingPromptForProvider(provider).catch(() => {});
        if (!focused) {
          requestNativeF6Fallback("sidebar-focus-message");
        }
        if (sendResponse) sendResponse({ ok: focused });
        return false;
      });
    }

    if (
      extensionApi.storage
      && extensionApi.storage.onChanged
      && !window.__lpSidebarAiFocusStorageListenerInstalled
    ) {
      window.__lpSidebarAiFocusStorageListenerInstalled = true;
      extensionApi.storage.onChanged.addListener((changes, areaName) => {
        if (!isLikelySidebarSurface()) return;
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
        applySidebarFocusSignal(provider, nextValue);
      });
    }

    if (isLikelySidebarSurface()) {
      try { window.focus(); } catch (err) {}
      const input = getFocusablePromptInput(provider);
      if (!input || !activeElementMatchesPromptInput(input)) {
        dispatchSyntheticF6Twice(500);
      }
      ensureSidebarFocusPort(provider);
      requestSidebarAutoFocus(provider, { initial: true }).catch(() => {});
      // Only run focus burst and attempt focus if F6 dispatch is not in progress
      if (!f6DispatchInProgress) {
        runImmediateFocusBurst(provider);
        attemptFocus(provider);
      }
      checkPendingSidebarFocusSignal(provider);
      applyPendingPromptForProvider(provider).catch(() => {});
      if (provider === "gemini") {
        let composerReadyTicks = 0;
        var _geminiComposerReadyTimer = setInterval(() => {
          composerReadyTicks += 1;
          const input = getFocusablePromptInput(provider);
          if (input && isUsablePromptInput(input)) {
            notifySidebarProviderLoaded(provider);
            if (!activeElementMatchesPromptInput(input)) {
              focusGeminiPromptInput(provider, { skipSyntheticF6: true });
            }
            clearInterval(_geminiComposerReadyTimer);
            return;
          }
          if (composerReadyTicks >= 60) {
            clearInterval(_geminiComposerReadyTimer);
          }
        }, 200);
      }
      var _sidebarAiFocusPollTimer = setInterval(() => {
        ensureSidebarFocusPort(provider);
        checkPendingSidebarFocusSignal(provider);
        if (
          !isTextEditableElement(getDeepActiveElement())
          && Date.now() >= suppressAutoFocusUntil
          && !hasActiveSelection()
        ) {
          attemptFocus(provider);
        }
      }, 1200);
    }

    window.addEventListener("beforeunload", () => {
      stopPendingPromptPolling();
      stopFocusAttempts();
      clearScheduledSidebarFocus();
      stopAiCategoryResultPolling();
      if (sidebarTextSelectionObserver) {
        sidebarTextSelectionObserver.disconnect();
        sidebarTextSelectionObserver = null;
      }
      if (typeof _sidebarAiFocusPollTimer !== "undefined") {
        clearInterval(_sidebarAiFocusPollTimer);
        _sidebarAiFocusPollTimer = null;
      }
      if (typeof _sidebarAiUrlPollTimer !== "undefined") {
        clearInterval(_sidebarAiUrlPollTimer);
        _sidebarAiUrlPollTimer = null;
      }
      if (typeof _geminiComposerReadyTimer !== "undefined") {
        clearInterval(_geminiComposerReadyTimer);
        _geminiComposerReadyTimer = null;
      }
      if (sidebarFocusPort) {
        try {
          sidebarFocusPort.disconnect();
        } catch (err) {}
        sidebarFocusPort = null;
      }
    }, { once: true });

    let lastPolledUrl = "";
    var _sidebarAiUrlPollTimer = setInterval(() => {
      if (lastPolledUrl !== window.location.href) {
        lastPolledUrl = window.location.href;
        sidebarProviderLoadedReported = false;
        if (window.__lpActiveSubmitSessionId) {
          sendMessage({
            type: "summary-sidebar-chat",
            payload: { sessionId: window.__lpActiveSubmitSessionId, chatUrl: window.location.href }
          }).catch(() => {});
        }
      }
    }, 2000);


  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  // Listen for focus trigger from overlay OR sidebar
  window.addEventListener("message", function(event) {
    if (!event || !event.data) return;
    
    // Handle suppress-ai-focus message — sent by sidebar when custom prompt textarea is focused
    // This prevents the AI iframe's poll timer from stealing focus away from the textarea
    if (event.data.type === "suppress-ai-focus") {
      const ms = typeof event.data.durationMs === "number" && isFinite(event.data.durationMs) ? event.data.durationMs : 0;
      suppressAutoFocusUntil = ms > 0 ? (Date.now() + ms) : 0;
      return;
    }

    // Handle selection search toggle — sent by sidebar/overlay topbar butang ⌕
    if (event.data.type === "__lp_selection_search_toggle") {
      const enabled = event.data.enabled !== false;
      if (selectionSearchPopupSettings) {
        selectionSearchPopupSettings.enabled = enabled;
      }
      if (!enabled) {
        hideSelectionSearchPopup();
        hideSelectionSearchTrigger();
      }
      return;
    }

    // Handle __lp_check_pending_prompt message
    if (event.data.type === "__lp_check_pending_prompt") {
      const provider = detectProvider();
      if (!provider) return;
      applyPendingPromptForProvider(provider).catch(function() {});
      setTimeout(function() { applyPendingPromptForProvider(provider).catch(function() {}); }, 300);
      setTimeout(function() { applyPendingPromptForProvider(provider).catch(function() {}); }, 800);
      return;
    }
    
    // Handle focus-input message from sidebar/overlay wrapper (F6 key)
    if (event.data.type === "focus-input") {
      const provider = detectProvider();
      if (!provider) return;
      if (!isLikelySidebarSurface()) return;
      
      suppressAutoFocusUntil = 0;
      const input = getFocusablePromptInput(provider);
      if (input) {
        const normalizedProvider = normalizeProvider(provider);
        if (normalizedProvider === "gemini") {
          activateGeminiComposer(input);
        } else if (normalizedProvider === "claude") {
          activateClaudeComposer(input);
        }
        focusPromptInput(input, provider);
      } else {
        activateComposerSurface(provider);
        attemptFocus(provider);
      }
      return;
    }
    
    // Handle legacy __lp_trigger_focus message
    if (event.data.type !== "__lp_trigger_focus") return;
    if (event.data.source !== "overlay" && event.data.source !== "sidebar") return;
    
    const provider = detectProvider();
    if (!provider) return;
    if (!isLikelySidebarSurface()) return;
    
    // Trigger auto focus
    setTimeout(function() {
      suppressAutoFocusUntil = 0;
      const input = getFocusablePromptInput(provider);
      if (input) {
        focusPromptInput(input, provider);
      } else {
        attemptFocus(provider);
      }
    }, 100);
  });

  // Overlay retry: poll for pending overlay prompt even in non-sidebar (hidden tab) context
  // Gunakan adaptive interval — mula 400ms, naik ke 1200ms selepas idle
  if (!isLikelySidebarSurface()) {
    var overlayPendingCount = 0;
    var overlayIdleTicks = 0;
    var overlayCurrentInterval = 400;
    var overlayPollTimer = null;
    var scheduleOverlayPoll = function() {
      overlayPollTimer = setTimeout(function() {
        overlayPendingCount++;
        if (overlayPendingCount > 180) { overlayPollTimer = null; return; }
        const provider = detectProvider();
        if (provider) {
          applyPendingPromptForProvider(provider).then(function(applied) {
            if (applied) {
              overlayIdleTicks = 0;
              overlayCurrentInterval = 400;
            } else {
              overlayIdleTicks++;
              if (overlayIdleTicks >= 3 && overlayCurrentInterval < 1200) {
                overlayCurrentInterval = 1200;
              }
            }
            scheduleOverlayPoll();
          }).catch(function() { scheduleOverlayPoll(); });
        } else {
          scheduleOverlayPoll();
        }
      }, overlayCurrentInterval);
    };
    scheduleOverlayPoll();
  }
})();