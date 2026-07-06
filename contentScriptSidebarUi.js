(function () {
  const SETTINGS_KEY = "settings";
  if (typeof window === "undefined") return;
  
  // Jika dimuatkan dalam overlay (bukan sidebar biasa), jangan inject switcher UI
  // kerana overlay sudah ada provider dropdown sendiri di topbar.
  //
  // Cara detect overlay context (mengikut keutamaan):
  // 1. window.name === "__LP_OVERLAY__" (set oleh iframe overlay, tapi hilang bila cross-origin nav)
  // 2. sessionStorage "__lpOverlayContext" === "1" (kekal walaupun cross-origin nav dalam tab sama)
  // 3. Lebar frame > 420px DAN bukan top window (overlay lebar ~480px, sidebar sempit <400px)
  function isOverlayContext() {
    if (window.name === "__LP_OVERLAY__") {
      try { sessionStorage.setItem("__lpOverlayContext", "1"); } catch (_) {}
      return true;
    }
    try {
      if (sessionStorage.getItem("__lpOverlayContext") === "1") return true;
    } catch (_) {}
    try {
      const params = new URLSearchParams(window.location.search || "");
      if (params.get("lp_overlay") === "1") return true;
    } catch (_) {}
    // Lebar frame overlay adalah DEFAULT_W (480px), sidebar Firefox sempit (<400px)
    // Semak bukan top window supaya tidak affect halaman biasa yang lebar
    if (window !== window.top && typeof window.innerWidth === "number" && window.innerWidth > 420) {
      // Tapi ini mungkin false positive untuk halaman biasa dalam iframe lebar
      // Hanya apply jika ada lp_sidebar param atau window.name sidebar
      if (window.name === "__LP_SIDEBAR__") return false;
      return false; // Jangan guna lebar sahaja — terlalu berisiko false positive
    }
    return false;
  }

  if (isOverlayContext()) return;

  // Determine if we can show the provider switcher
  // Only use hasLpParam and hasLpName (not hasLpReferrer) to avoid
  // leaking into child iframes within the AI provider page
  const hasLpParam = window.location.search.includes("lp_sidebar=1");
  const hasLpName = window.name === "__LP_SIDEBAR__";
  let canShowSwitcher = hasLpParam || hasLpName;

  // IMPORTANT: Prevent multiple dropdowns!
  // 1. Do NOT inject into sidebar.html itself. We only want it inside the AI's frame.
  //    (sidebar.html has the #ai-frame element, or protocol is moz-extension:)
  if (document.getElementById("ai-frame") || window.location.protocol.includes("extension")) {
    canShowSwitcher = false;
  }

  // 2. Do NOT inject if we are an iframe inside the main AI frame.
  // The main AI frame's parent is the top window (sidebar.html).
  // If our parent is NOT the top window, we are an inner child iframe.
  if (canShowSwitcher && window.parent !== window.top && window !== window.top) {
    canShowSwitcher = false;
  }

  const SIDEBAR_CONTEXT_SESSION_KEY = "__LP_SIDEBAR_ONCE__";
  const SWITCHER_HOST_ID = "lp-sidebar-provider-switcher-host";
  
  const SIDEBAR_TRANSLATION_ADDON_STYLE_ID = "lp-sidebar-translation-addon-style";
  const SIMPLE_TRANSLATE_ROOT_ID = "simple-translate";
  const SWITCHER_RESET_DELAY_MS = 2500;
  const SIDEBAR_TRANSLATION_ADDON_SELECTOR = [
    `#${SIMPLE_TRANSLATE_ROOT_ID}`,
    'div.notranslate[style*="all: initial"]',
    'div.notranslate[style*="all:initial"]'
  ].join(", ");

  const PROVIDER_OPTIONS = [
    { value: "chatgpt", label: "ChatGPT" },
    { value: "claude", label: "Claude" },
    { value: "gemini", label: "Gemini" },
    { value: "google", label: "Google" },
    { value: "perplexity", label: "Perplexity" },
    { value: "copilot", label: "Copilot" },
    { value: "grok", label: "Grok" },
    { value: "deepseek", label: "DeepSeek" },
    { value: "poe", label: "Poe" },
    { value: "mistral", label: "Mistral" }
  ];

  let sidebarTranslationAddonObserver = null;
  let sidebarDocumentRootStyleSnapshot = null;
  let sidebarTwpLayoutResetTimer = null;

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
    if (window.name === "__LP_SIDEBAR__") {
      try { window.sessionStorage.setItem(SIDEBAR_CONTEXT_SESSION_KEY, "1"); } catch (err) {}
      return true;
    }
    
    // Check if width is narrow (sidebar-like)
    const isNarrow = window.innerWidth < 900;
    if (isNarrow) {
      return true;
    }
    
    // Check referrer for sidebar context
    try {
      const ref = String(document.referrer || "").toLowerCase();
      if (ref.includes("lp_sidebar=1") || ref.includes("sidebar.html")) {
        return true;
      }
    } catch (err) {}
    
    return false;
  }

  const PROVIDER_URLS = {
    chatgpt: "https://chatgpt.com/",
    claude: "https://claude.ai/new",
    gemini: "https://gemini.google.com/app",
    google: "https://www.google.com/",
    perplexity: "https://www.perplexity.ai/",
    copilot: "https://copilot.microsoft.com/",
    grok: "https://grok.com/",
    deepseek: "https://chat.deepseek.com/",
    poe: "https://poe.com/",
    mistral: "https://chat.mistral.ai/chat"
  };

  function detectCurrentProvider() {
    const host = String(window.location.hostname || "");
    if (host.includes("chatgpt.com") || host.includes("chat.openai.com")) return "chatgpt";
    if (host.includes("claude.ai")) return "claude";
    if (host.includes("gemini.google.com")) return "gemini";
    if (host.includes("perplexity.ai")) return "perplexity";
    if (host.includes("copilot.microsoft.com")) return "copilot";
    if (host.includes("grok.com")) return "grok";
    if (host.includes("deepseek.com")) return "deepseek";
    if (host.includes("poe.com")) return "poe";
    if (host.includes("chat.mistral.ai")) return "mistral";
    return "";
  }

  function resolveProviderFromHost() {
    const host = String(window.location.hostname || "").toLowerCase();
    for (const key of Object.keys(PROVIDER_URLS)) {
      try {
        const url = new URL(PROVIDER_URLS[key]);
        const providerHost = url.hostname.toLowerCase();
        if (host === providerHost || host.endsWith("." + providerHost)) {
          return key;
        }
      } catch (err) {}
    }
    return "";
  }

  function getExtensionApi() {
    if (typeof browser !== "undefined") return browser;
    if (typeof chrome !== "undefined") return chrome;
    return null;
  }

  function runtimeSendMessage(message) {
    const api = getExtensionApi();
    if (!api || !api.runtime || !api.runtime.sendMessage) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        resolve(value == null ? null : value);
      };
      try {
        const maybePromise = api.runtime.sendMessage(message, (response) => {
          const runtimeErr = api.runtime && api.runtime.lastError;
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

  function storageGetLocal(key) {
    const api = getExtensionApi();
    if (!api || !api.storage || !api.storage.local || !api.storage.local.get) {
      return Promise.resolve({});
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        resolve(value && typeof value === "object" ? value : {});
      };
      try {
        const maybePromise = api.storage.local.get(key, (value) => {
          const runtimeErr = api.runtime && api.runtime.lastError;
          if (runtimeErr) {
            finish({});
            return;
          }
          finish(value);
        });
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then(finish).catch(() => finish({}));
        }
      } catch (err) {
        finish({});
      }
    });
  }

  function normalizeThemePreset(value) {
    const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (
      raw === "ocean"
      || raw === "sunset"
      || raw === "modern"
      || raw === "minimal"
      || raw === "cyber"
      || raw === "forest"
      || raw === "pastel"
      || raw === "mono"
      || raw === "oled"
      || raw === "sepia"
      || raw === "retro"
      || raw === "aurora"
      || raw === "custom"
    ) return raw;
    return "classic";
  }

  async function getStoredThemePreset() {
    try {
      const data = await storageGetLocal(SETTINGS_KEY);
      const settings = data && data[SETTINGS_KEY] && typeof data[SETTINGS_KEY] === "object"
        ? data[SETTINGS_KEY]
        : null;
      return {
        preset: normalizeThemePreset(settings && settings.themePreset),
        customColors: settings && settings.customThemeColors && typeof settings.customThemeColors === "object"
          ? { ...settings.customThemeColors }
          : null
      };
    } catch (err) {
      return { preset: "classic", customColors: null };
    }
  }

  function getThemePalette(themePreset) {
    const palettes = {
      classic: {
        text: "#f6f2eb",
        muted: "rgba(246, 242, 235, 0.68)",
        panel: "rgba(36, 27, 22, 0.88)",
        panelStrong: "rgba(43, 31, 25, 0.94)",
        surface: "rgba(255, 255, 255, 0.05)",
        surfaceHover: "rgba(255, 255, 255, 0.09)",
        border: "rgba(255, 219, 188, 0.18)",
        accent: "#f3a15f",
        accentSoft: "rgba(243, 161, 95, 0.18)",
        accentAlt: "#4fb7d4",
        danger: "#ffb4b4",
        dangerBg: "rgba(255, 84, 84, 0.14)",
        shadow: "0 18px 48px rgba(0, 0, 0, 0.4)",
        font: "\"Aptos\", \"Segoe UI Variable\", \"Segoe UI\", sans-serif"
      },
      modern: {
        text: "#eef4ff",
        muted: "rgba(238, 244, 255, 0.66)",
        panel: "rgba(11, 18, 30, 0.88)",
        panelStrong: "rgba(16, 24, 38, 0.94)",
        surface: "rgba(255, 255, 255, 0.05)",
        surfaceHover: "rgba(97, 208, 255, 0.12)",
        border: "rgba(97, 208, 255, 0.2)",
        accent: "#61d0ff",
        accentSoft: "rgba(97, 208, 255, 0.18)",
        accentAlt: "#8aa2ff",
        danger: "#ffb4b4",
        dangerBg: "rgba(255, 124, 116, 0.16)",
        shadow: "0 18px 48px rgba(0, 0, 0, 0.42)",
        font: "\"Aptos\", \"Segoe UI Variable\", \"Segoe UI\", sans-serif"
      },
      minimal: {
        text: "#1f2430",
        muted: "rgba(31, 36, 48, 0.62)",
        panel: "rgba(255, 255, 255, 0.86)",
        panelStrong: "rgba(255, 255, 255, 0.95)",
        surface: "rgba(59, 130, 246, 0.05)",
        surfaceHover: "rgba(37, 99, 235, 0.12)",
        border: "rgba(100, 116, 139, 0.18)",
        accent: "#2563eb",
        accentSoft: "rgba(37, 99, 235, 0.16)",
        accentAlt: "#14b8a6",
        danger: "#b91c1c",
        dangerBg: "rgba(220, 38, 38, 0.12)",
        shadow: "0 18px 48px rgba(148, 163, 184, 0.24)",
        font: "\"Aptos\", \"Segoe UI Variable\", \"Segoe UI\", sans-serif"
      },
      cyber: {
        text: "#edf5ff",
        muted: "rgba(237, 245, 255, 0.68)",
        panel: "rgba(8, 12, 22, 0.9)",
        panelStrong: "rgba(10, 16, 28, 0.95)",
        surface: "rgba(255, 255, 255, 0.05)",
        surfaceHover: "rgba(34, 211, 238, 0.14)",
        border: "rgba(87, 130, 255, 0.2)",
        accent: "#22d3ee",
        accentSoft: "rgba(34, 211, 238, 0.18)",
        accentAlt: "#7c3aed",
        danger: "#ffb4c9",
        dangerBg: "rgba(251, 113, 133, 0.14)",
        shadow: "0 18px 50px rgba(0, 0, 0, 0.48)",
        font: "\"Aptos\", \"Segoe UI Variable\", \"Segoe UI\", sans-serif"
      },
      ocean: {
        text: "#eef7ff",
        muted: "rgba(238, 247, 255, 0.68)",
        panel: "rgba(17, 32, 48, 0.88)",
        panelStrong: "rgba(21, 39, 58, 0.95)",
        surface: "rgba(255, 255, 255, 0.05)",
        surfaceHover: "rgba(67, 201, 183, 0.13)",
        border: "rgba(123, 181, 230, 0.18)",
        accent: "#43c9b7",
        accentSoft: "rgba(67, 201, 183, 0.18)",
        accentAlt: "#56a7ff",
        danger: "#ffd0cc",
        dangerBg: "rgba(255, 133, 120, 0.14)",
        shadow: "0 18px 46px rgba(0, 18, 36, 0.42)",
        font: "\"Aptos\", \"Segoe UI Variable\", \"Segoe UI\", sans-serif"
      },
      sunset: {
        text: "#fff0e5",
        muted: "rgba(255, 240, 229, 0.66)",
        panel: "rgba(50, 33, 31, 0.9)",
        panelStrong: "rgba(57, 38, 35, 0.95)",
        surface: "rgba(255, 255, 255, 0.05)",
        surfaceHover: "rgba(240, 140, 84, 0.14)",
        border: "rgba(255, 196, 152, 0.18)",
        accent: "#f08c54",
        accentSoft: "rgba(240, 140, 84, 0.18)",
        accentAlt: "#b983ff",
        danger: "#ffd1cf",
        dangerBg: "rgba(255, 138, 123, 0.14)",
        shadow: "0 18px 50px rgba(28, 10, 5, 0.44)",
        font: "\"Aptos\", \"Segoe UI Variable\", \"Segoe UI\", sans-serif"
      },
      forest: {
        text: "#edf7ee",
        muted: "rgba(237, 247, 238, 0.66)",
        panel: "rgba(15, 28, 20, 0.9)",
        panelStrong: "rgba(17, 31, 22, 0.95)",
        surface: "rgba(255, 255, 255, 0.05)",
        surfaceHover: "rgba(74, 222, 128, 0.14)",
        border: "rgba(111, 193, 137, 0.18)",
        accent: "#4ade80",
        accentSoft: "rgba(74, 222, 128, 0.18)",
        accentAlt: "#84cc16",
        danger: "#ffd2d8",
        dangerBg: "rgba(251, 113, 133, 0.14)",
        shadow: "0 18px 46px rgba(0, 0, 0, 0.42)",
        font: "\"Aptos\", \"Segoe UI Variable\", \"Segoe UI\", sans-serif"
      },
      pastel: {
        text: "#1f2b3f",
        muted: "rgba(31, 43, 63, 0.62)",
        panel: "rgba(255, 253, 248, 0.9)",
        panelStrong: "rgba(255, 255, 255, 0.96)",
        surface: "rgba(245, 158, 11, 0.05)",
        surfaceHover: "rgba(139, 92, 246, 0.12)",
        border: "rgba(168, 85, 247, 0.16)",
        accent: "#f59e0b",
        accentSoft: "rgba(245, 158, 11, 0.16)",
        accentAlt: "#8b5cf6",
        danger: "#be123c",
        dangerBg: "rgba(225, 29, 72, 0.12)",
        shadow: "0 18px 44px rgba(236, 164, 91, 0.24)",
        font: "\"Aptos\", \"Segoe UI Variable\", \"Segoe UI\", sans-serif"
      },
      mono: {
        text: "#f5f5f5",
        muted: "rgba(245, 245, 245, 0.64)",
        panel: "rgba(24, 25, 30, 0.9)",
        panelStrong: "rgba(28, 29, 34, 0.95)",
        surface: "rgba(255, 255, 255, 0.04)",
        surfaceHover: "rgba(209, 213, 219, 0.12)",
        border: "rgba(255, 255, 255, 0.14)",
        accent: "#d1d5db",
        accentSoft: "rgba(209, 213, 219, 0.14)",
        accentAlt: "#9ca3af",
        danger: "#fecaca",
        dangerBg: "rgba(248, 113, 113, 0.12)",
        shadow: "0 18px 48px rgba(0, 0, 0, 0.42)",
        font: "\"Aptos\", \"Segoe UI Variable\", \"Segoe UI\", sans-serif"
      },
      oled: {
        text: "#fafafa",
        muted: "rgba(250, 250, 250, 0.66)",
        panel: "rgba(6, 6, 6, 0.92)",
        panelStrong: "rgba(10, 10, 10, 0.97)",
        surface: "rgba(255, 255, 255, 0.04)",
        surfaceHover: "rgba(102, 227, 255, 0.12)",
        border: "rgba(255, 255, 255, 0.12)",
        accent: "#66e3ff",
        accentSoft: "rgba(102, 227, 255, 0.16)",
        accentAlt: "#8b5cf6",
        danger: "#ffd0d0",
        dangerBg: "rgba(255, 122, 122, 0.12)",
        shadow: "0 18px 58px rgba(0, 0, 0, 0.65)",
        font: "\"Aptos\", \"Segoe UI Variable\", \"Segoe UI\", sans-serif"
      },
      sepia: {
        text: "#302117",
        muted: "rgba(48, 33, 23, 0.62)",
        panel: "rgba(255, 248, 235, 0.9)",
        panelStrong: "rgba(255, 250, 241, 0.96)",
        surface: "rgba(138, 93, 43, 0.05)",
        surfaceHover: "rgba(138, 93, 43, 0.12)",
        border: "rgba(102, 67, 36, 0.16)",
        accent: "#8a5d2b",
        accentSoft: "rgba(138, 93, 43, 0.16)",
        accentAlt: "#b7793f",
        danger: "#92400e",
        dangerBg: "rgba(180, 83, 9, 0.12)",
        shadow: "0 18px 46px rgba(110, 78, 39, 0.2)",
        font: "\"Aptos\", \"Segoe UI Variable\", \"Segoe UI\", sans-serif"
      },
      retro: {
        text: "#f4ead6",
        muted: "rgba(244, 234, 214, 0.66)",
        panel: "rgba(35, 27, 18, 0.92)",
        panelStrong: "rgba(42, 33, 23, 0.96)",
        surface: "rgba(255, 255, 255, 0.04)",
        surfaceHover: "rgba(246, 196, 83, 0.14)",
        border: "rgba(246, 196, 83, 0.18)",
        accent: "#f6c453",
        accentSoft: "rgba(246, 196, 83, 0.16)",
        accentAlt: "#88b17b",
        danger: "#ffd6b5",
        dangerBg: "rgba(249, 115, 22, 0.12)",
        shadow: "0 18px 50px rgba(0, 0, 0, 0.48)",
        font: "\"Aptos\", \"Segoe UI Variable\", \"Segoe UI\", sans-serif"
      },
      aurora: {
        text: "#e8f0fe",
        muted: "rgba(232, 240, 254, 0.66)",
        panel: "rgba(17, 24, 40, 0.92)",
        panelStrong: "rgba(12, 18, 32, 0.96)",
        surface: "rgba(255, 255, 255, 0.04)",
        surfaceHover: "rgba(45, 212, 191, 0.14)",
        border: "rgba(45, 212, 191, 0.18)",
        accent: "#2dd4bf",
        accentSoft: "rgba(45, 212, 191, 0.18)",
        accentAlt: "#818cf8",
        danger: "#ffd0d0",
        dangerBg: "rgba(255, 122, 122, 0.12)",
        shadow: "0 18px 58px rgba(0, 0, 0, 0.50)",
        font: "\"Aptos\", \"Segoe UI Variable\", \"Segoe UI\", sans-serif"
      }
    };
    return palettes[normalizeThemePreset(themePreset)] || palettes.classic;
  }

  function resolveCustomThemePalette(cc) {
    function hx(val, fallback) {
      return typeof val === "string" && /^#[0-9a-f]{6}$/i.test(val) ? val : fallback;
    }
    function hexToRgba(hex, alpha) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
    }
    const bg = hx(cc && cc.bg, "#1a1a2e");
    const bgAlt = hx(cc && cc.bgAlt, "#16213e");
    const panel = hx(cc && cc.panel, "#0f3460");
    const panelAlt = hx(cc && cc.panelAlt, "#1a1a4e");
    const ink = hx(cc && cc.ink, "#e0e0e0");
    const muted = hx(cc && cc.muted, "#a0a0b0");
    const accent = hx(cc && cc.accent, "#e94560");
    const accent2 = hx(cc && cc.accent2, "#f5a623");
    const accent3 = hx(cc && cc.accent3, "#533483");
    const accent4 = hx(cc && cc.accent4, "#0f3460");
    const border = hx(cc && cc.border, "#2a2a4e");
    return {
      text: ink,
      muted: hexToRgba(ink, 0.66),
      panel: hexToRgba(bg, 0.9),
      panelStrong: hexToRgba(bgAlt, 0.95),
      surface: hexToRgba(bg, 0.5),
      surfaceHover: hexToRgba(accent, 0.14),
      border: "1px solid " + border,
      accent: accent,
      accentSoft: hexToRgba(accent, 0.18),
      accentAlt: accent2,
      danger: "#ffb4b4",
      dangerBg: "rgba(255, 84, 84, 0.14)",
      shadow: "0 18px 48px rgba(0, 0, 0, 0.4)",
      font: "\"Aptos\", \"Segoe UI Variable\", \"Segoe UI\", sans-serif"
    };
  }

  function getSavedPosition() {
    try {
      const saved = window.localStorage.getItem("__lp_sidebar_ui_pos");
      if (saved) return JSON.parse(saved);
    } catch (err) {}
    return null;
  }

  function savePosition(x, y) {
    try {
      window.localStorage.setItem("__lp_sidebar_ui_pos", JSON.stringify({ x, y }));
    } catch (err) {}
  }

  function ensureHost() {
    let host = document.getElementById(SWITCHER_HOST_ID);
    if (host) return host;

    const root = document.documentElement || document.body;
    if (!root) return null;

    host = document.createElement("div");
    host.id = SWITCHER_HOST_ID;

    const pos = getSavedPosition();
    const cssText = pos
      ? `position:fixed; left:${pos.x}px; top:${pos.y}px; z-index:2147483647; pointer-events:none; touch-action:none;`
      : "position:fixed; top:12px; right:12px; z-index:2147483647; pointer-events:none; touch-action:none;";

    host.style.cssText = cssText;
    root.appendChild(host);
    return host;
  }



  function getDocumentRootStyleSnapshot() {
    if (sidebarDocumentRootStyleSnapshot) return sidebarDocumentRootStyleSnapshot;
    const root = document.documentElement;
    sidebarDocumentRootStyleSnapshot = {
      height: root ? root.style.height || "" : "",
      paddingTop: root ? root.style.paddingTop || "" : "",
      paddingBottom: root ? root.style.paddingBottom || "" : ""
    };
    return sidebarDocumentRootStyleSnapshot;
  }

  function restoreDocumentRootStyleSnapshot() {
    const root = document.documentElement;
    const snapshot = getDocumentRootStyleSnapshot();
    if (!root || !snapshot) return;
    root.style.height = snapshot.height;
    root.style.paddingTop = snapshot.paddingTop;
    root.style.paddingBottom = snapshot.paddingBottom;
  }

  function scheduleTwpLayoutReset() {
    if (sidebarTwpLayoutResetTimer) {
      window.clearTimeout(sidebarTwpLayoutResetTimer);
      sidebarTwpLayoutResetTimer = null;
    }

    let attemptsRemaining = 8;
    const tick = () => {
      restoreDocumentRootStyleSnapshot();
      if (attemptsRemaining <= 0) {
        sidebarTwpLayoutResetTimer = null;
        return;
      }
      attemptsRemaining -= 1;
      sidebarTwpLayoutResetTimer = window.setTimeout(tick, 1000);
    };

    tick();
  }

  function isSimpleTranslateElement(element) {
    return !!element && element.id === SIMPLE_TRANSLATE_ROOT_ID;
  }

  function isTwpTranslateWebPagesElement(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.tagName !== "DIV") return false;
    if (!element.classList.contains("notranslate")) return false;
    return /(^|;)\s*all\s*:\s*initial\s*;?/i.test(String(element.getAttribute("style") || ""));
  }

  function suppressSidebarTranslationAddon(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.id === SWITCHER_HOST_ID) return false;

    const isSimpleTranslate = isSimpleTranslateElement(element);
    const isTwpTranslateWebPages = isTwpTranslateWebPagesElement(element);
    if (!isSimpleTranslate && !isTwpTranslateWebPages) return false;

    element.style.setProperty("display", "none", "important");
    element.style.setProperty("visibility", "hidden", "important");
    element.style.setProperty("opacity", "0", "important");
    element.style.setProperty("pointer-events", "none", "important");
    element.setAttribute("aria-hidden", "true");
    element.dataset.lpSidebarSuppressed = "true";

    if (isTwpTranslateWebPages) {
      scheduleTwpLayoutReset();
    }
    return true;
  }

  function scanAndSuppressSidebarTranslationAddons(rootNode) {
    if (!(rootNode instanceof Element)) return;

    const seen = new Set();
    const maybeSuppress = (element) => {
      if (!(element instanceof HTMLElement) || seen.has(element)) return;
      seen.add(element);
      suppressSidebarTranslationAddon(element);
    };

    maybeSuppress(rootNode);
    if (!rootNode.querySelectorAll) return;

    rootNode.querySelectorAll(SIDEBAR_TRANSLATION_ADDON_SELECTOR).forEach((element) => {
      maybeSuppress(element);
    });
  }

  function ensureSidebarTranslationAddonSuppressor() {
    getDocumentRootStyleSnapshot();

    let style = document.getElementById(SIDEBAR_TRANSLATION_ADDON_STYLE_ID);
    if (!style) {
      const root = document.head || document.documentElement || document.body;
      if (!root) return;
      style = document.createElement("style");
      style.id = SIDEBAR_TRANSLATION_ADDON_STYLE_ID;
      style.textContent = `
        ${SIDEBAR_TRANSLATION_ADDON_SELECTOR} {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `;
      root.appendChild(style);
    }

    scanAndSuppressSidebarTranslationAddons(document.documentElement || document.body);

    if (sidebarTranslationAddonObserver) return;
    const observeRoot = document.documentElement || document.body;
    if (!observeRoot) return;

    sidebarTranslationAddonObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          scanAndSuppressSidebarTranslationAddons(node);
        });
      });
    });
    sidebarTranslationAddonObserver.observe(observeRoot, { childList: true, subtree: true });
  }

  function setBusyState(shell, trigger, optionButtons, isBusy) {
    const busy = !!isBusy;
    shell.dataset.busy = busy ? "true" : "false";
    trigger.disabled = busy;
    optionButtons.forEach((button) => {
      button.disabled = busy;
    });
  }

  async function injectSwitcherUi(retries = 3) {
    if (document.getElementById("local-pocket-switcher-injected")) {
        return;
    }
    // Only inject switcher in sidebar iframe context (not on sidebar.html or main page)
    if (!canShowSwitcher) return;
    // Set window.name so it persists for future navigations within sidebar frame
    try { window.name = "__LP_SIDEBAR__"; } catch (_) {}
    const host = ensureHost();
    if (!host) {
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 500));
        return injectSwitcherUi(retries - 1);
      }
      return;
    }

    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    if (!shadow) {
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 500));
        return injectSwitcherUi(retries - 1);
      }
      return;
    }

    const currentProvider = detectCurrentProvider() || resolveProviderFromHost() || "chatgpt";
    const themeData = await getStoredThemePreset();
    const palette = themeData.preset === "custom"
      ? resolveCustomThemePalette(themeData.customColors)
      : getThemePalette(themeData.preset);

    const style = document.createElement("style");
    style.textContent = `
      :host {
        all: initial;
      }

      *, *::before, *::after {
        box-sizing: border-box;
      }

      /* Entrance Animation for Menu */
      @keyframes menuEntrance {
        0% { opacity: 0; transform: translateY(-10px) scale(0.96); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }

      .shell {
        position: relative;
        width: auto;
        pointer-events: auto;
        font: 500 13px/1.4 ${palette.font};
        color: ${palette.text};
        z-index: 99999;
      }

      .trigger {
        display: flex;
        width: auto;
        min-width: 140px;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 14px;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 24px;
        background: linear-gradient(135deg, ${palette.panelStrong}, ${palette.panel});
        color: inherit;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05);
        backdrop-filter: blur(24px) saturate(160%);
        transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
      }

      .trigger:hover,
      .trigger:focus-visible {
        border-color: ${palette.accent};
        background: linear-gradient(135deg, ${palette.surfaceHover}, ${palette.panel});
        transform: translateY(-2px);
        box-shadow: 0 12px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.1);
        outline: none;
      }

      .trigger:active {
        transform: translateY(0);
      }

      .trigger:disabled {
        cursor: progress;
        opacity: 0.6;
        transform: none;
      }

      .current-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        min-width: 0;
      }

      .ai-icon {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: ${palette.accent};
        box-shadow: 0 0 12px ${palette.accent};
        display: inline-block;
        flex-shrink: 0;
        animation: pulse 3s infinite alternate;
      }

      @keyframes pulse {
        0% { box-shadow: 0 0 6px ${palette.accentSoft}; }
        100% { box-shadow: 0 0 14px ${palette.accent}; }
      }

      .current {
        font-weight: 600;
        letter-spacing: 0.2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .caret-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: ${palette.surface};
        transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
      }

      .caret {
        width: 6px;
        height: 6px;
        border-right: 2px solid ${palette.text};
        border-bottom: 2px solid ${palette.text};
        transform: translateY(-2px) rotate(45deg);
        transition: border-color 0.3s;
      }

      .shell[data-open="true"] .caret-wrapper {
        transform: rotate(180deg);
        background: ${palette.accentSoft};
      }
      .shell[data-open="true"] .caret {
        border-color: ${palette.accent};
      }

      .menu {
        position: absolute;
        top: calc(100% + 10px);
        right: 0;
        display: none;
        width: 260px;
        padding: 14px;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 20px;
        background: linear-gradient(145deg, ${palette.panelStrong}, ${palette.panel});
        box-shadow: 0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
        backdrop-filter: blur(32px) saturate(180%);
        transform-origin: top right;
      }

      .shell[data-open="true"] .menu {
        display: flex;
        flex-direction: column;
        gap: 10px;
        animation: menuEntrance 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }

      .menu-header {
        padding: 4px 6px 8px;
        border-bottom: 1px solid ${palette.surfaceHover};
        margin-bottom: 4px;
      }

      .menu-title {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.3px;
        background: linear-gradient(90deg, #fff, ${palette.muted});
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }

      .menu-subtitle {
        font-size: 11px;
        color: ${palette.muted};
        margin-top: 4px;
      }

      .options {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 50vh;
        overflow-y: auto;
        padding-right: 4px;
      }

      /* Custom Scrollbar for Options */
      .options::-webkit-scrollbar { width: 4px; }
      .options::-webkit-scrollbar-track { background: transparent; }
      .options::-webkit-scrollbar-thumb { background: ${palette.surfaceHover}; border-radius: 4px; }
      .options::-webkit-scrollbar-thumb:hover { background: ${palette.muted}; }

      .option {
        display: flex;
        width: 100%;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        border: none;
        border-radius: 12px;
        background: transparent;
        color: ${palette.muted};
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
        position: relative;
        overflow: hidden;
      }

      .option::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3px;
        background: ${palette.accent};
        transform: scaleY(0);
        transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
        border-radius: 0 4px 4px 0;
      }

      .option:hover,
      .option:focus-visible {
        background: ${palette.surfaceHover};
        color: ${palette.text};
        transform: translateX(4px);
        outline: none;
      }

      .option[aria-selected="true"] {
        background: ${palette.surface};
        color: ${palette.text};
        font-weight: 600;
      }

      .option[aria-selected="true"]::before {
        transform: scaleY(0.6);
      }

      .option-name {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 13px;
      }

      .option-icon {
        font-size: 14px;
        opacity: 0.7;
        transition: opacity 0.2s;
      }

      .option:hover .option-icon,
      .option[aria-selected="true"] .option-icon {
        opacity: 1;
        color: ${palette.accent};
      }

      .check {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: ${palette.accent};
        color: #fff;
        font-size: 11px;
        opacity: 0;
        transform: scale(0.5);
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .option[aria-selected="true"] .check {
        opacity: 1;
        transform: scale(1);
      }

      @media (max-width: 480px) {
        .trigger {
          min-width: 120px;
          padding: 6px 12px;
        }
        .current { font-size: 12px; }
      }
    `;

    const shell = document.createElement("div");
    shell.className = "shell";
    shell.dataset.open = "false";
    shell.dataset.busy = "false";

    const trigger = document.createElement("button");
    trigger.className = "trigger";
    trigger.type = "button";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");

    const currentWrap = document.createElement("span");
    currentWrap.className = "current-wrap";

    const aiIcon = document.createElement("span");
    aiIcon.className = "ai-icon";

    const currentLabel = document.createElement("span");
    currentLabel.className = "current";

    const caretWrapper = document.createElement("span");
    caretWrapper.className = "caret-wrapper";
    
    const caret = document.createElement("span");
    caret.className = "caret";
    caret.setAttribute("aria-hidden", "true");

    const menu = document.createElement("div");
    menu.className = "menu";

    const menuHeader = document.createElement("div");
    menuHeader.className = "menu-header";

    const menuTitle = document.createElement("div");
    menuTitle.className = "menu-title";
    menuTitle.textContent = "AI Provider";

    const menuSubtitle = document.createElement("div");
    menuSubtitle.className = "menu-subtitle";
    menuSubtitle.textContent = "Tukar enjin pintar pilihan anda.";

    const optionsList = document.createElement("div");
    optionsList.className = "options";
    optionsList.setAttribute("role", "listbox");

    currentWrap.appendChild(aiIcon);
    currentWrap.appendChild(currentLabel);
    caretWrapper.appendChild(caret);
    trigger.appendChild(currentWrap);
    trigger.appendChild(caretWrapper);
    
    menuHeader.appendChild(menuTitle);
    menuHeader.appendChild(menuSubtitle);
    menu.appendChild(menuHeader);
    menu.appendChild(optionsList);
    
    shell.appendChild(trigger);
    shell.appendChild(menu);

    shadow.replaceChildren(style, shell);

    if (!shell || !trigger || !currentLabel || !optionsList) return;

    const currentOption = PROVIDER_OPTIONS.find((opt) => opt.value === currentProvider);
    currentLabel.textContent = currentOption ? currentOption.label : "AI";

    const providerIcons = {
      chatgpt: "🤖",
      claude: "🧠",
      gemini: "✨",
      perplexity: "🔍",
      copilot: "💻",
      grok: "🚀",
      deepseek: "🐋",
      poe: "🔮",
      mistral: "🌪️"
    };

    const optionButtons = [];
    PROVIDER_OPTIONS.forEach((opt) => {
      const optionButton = document.createElement("button");
      const optionLabel = document.createElement("span");
      const optionIcon = document.createElement("span");
      const optionNameText = document.createElement("span");
      const checkMark = document.createElement("span");
      
      optionButton.type = "button";
      optionButton.className = "option";
      optionButton.setAttribute("role", "option");
      optionButton.dataset.provider = opt.value;
      optionButton.setAttribute("aria-selected", opt.value === currentProvider ? "true" : "false");
      
      optionLabel.className = "option-name";
      optionIcon.className = "option-icon";
      optionIcon.textContent = providerIcons[opt.value] || "🔹";
      optionNameText.textContent = opt.label;
      
      optionLabel.appendChild(optionIcon);
      optionLabel.appendChild(optionNameText);

      checkMark.className = "check";
      checkMark.setAttribute("aria-hidden", "true");
      checkMark.textContent = "\u2713";
      
      optionButton.appendChild(optionLabel);
      optionButton.appendChild(checkMark);
      
      optionButtons.push(optionButton);
      optionsList.appendChild(optionButton);
      
      optionButton.addEventListener("pointerdown", (e) => {
        // Prevent the document-level pointerdown from closing the menu
        // when user presses down on an option button
        e.stopPropagation();
      });

      optionButton.addEventListener("click", async () => {
        if (shell.dataset.busy === "true") return;
        if (opt.value === currentProvider) {
          shell.dataset.open = "false";
          trigger.setAttribute("aria-expanded", "false");
          return;
        }

        setBusyState(shell, trigger, optionButtons, true);
        shell.dataset.open = "false";
        trigger.setAttribute("aria-expanded", "false");

        // Fire-and-forget: save the new provider to settings in background.
        runtimeSendMessage({
          type: "sidebar-ui-switch-provider",
          provider: opt.value
        }).catch(() => {});

        // Set sessionStorage AND window.name BEFORE navigation to preserve context
        try {
          window.sessionStorage.setItem(SIDEBAR_CONTEXT_SESSION_KEY, "1");
        } catch (_) {}
        try {
          window.name = "__LP_SIDEBAR__";
        } catch (_) {}

        // Navigate to the new provider
        // In sidebar iframe (window !== window.top), always use location.replace
        // to avoid interference with elements named "ai-frame" on the provider page
        try {
          if (window !== window.top) {
            window.name = "__LP_SIDEBAR__";
            window.location.replace(buildProviderUrl(opt.value));
          } else {
            const iframe = document.getElementById("ai-frame");
            if (iframe) {
              iframe.src = buildProviderUrl(opt.value);
              currentLabel.textContent = opt.label;
              optionButtons.forEach((btn) => {
                btn.setAttribute("aria-selected", btn.dataset.provider === opt.value ? "true" : "false");
              });
              setTimeout(() => {
                setBusyState(shell, trigger, optionButtons, false);
              }, 1000);
            } else {
              window.name = "__LP_SIDEBAR__";
              window.location.replace(buildProviderUrl(opt.value));
            }
          }
        } catch (err) {
          setBusyState(shell, trigger, optionButtons, false);
        }
      });
    });



    const closeMenu = () => {
      shell.dataset.open = "false";
      trigger.setAttribute("aria-expanded", "false");
    };

    const toggleMenu = () => {
      if (shell.dataset.busy === "true") return;
      const nextOpen = shell.dataset.open !== "true";
      shell.dataset.open = nextOpen ? "true" : "false";
      trigger.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    };

    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialHostX = 0;
    let initialHostY = 0;
    let dragThresholdMet = false;

    const onPointerMove = (event) => {
      if (!isDragging) return;

      const dx = event.clientX - dragStartX;
      const dy = event.clientY - dragStartY;

      if (!dragThresholdMet && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        dragThresholdMet = true;
        trigger.classList.add("dragging");
        closeMenu();
      }

      if (dragThresholdMet) {
        event.preventDefault();
        requestAnimationFrame(() => {
          if (!isDragging) return;
          let newX = initialHostX + dx;
          let newY = initialHostY + dy;

          const maxX = Math.max(0, window.innerWidth - host.offsetWidth);
          const maxY = Math.max(0, window.innerHeight - host.offsetHeight);

          newX = Math.max(0, Math.min(newX, maxX));
          newY = Math.max(0, Math.min(newY, maxY));

          host.style.right = "auto";
          host.style.left = `${newX}px`;
          host.style.top = `${newY}px`;
        });
      }
    };

    const onPointerUp = () => {
      if (!isDragging) return;
      isDragging = false;
      trigger.classList.remove("dragging");

      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);

      if (dragThresholdMet) {
        const rect = host.getBoundingClientRect();
        savePosition(rect.left, rect.top);

        const captureClick = (clickEvent) => {
          clickEvent.stopPropagation();
          clickEvent.preventDefault();
          trigger.removeEventListener("click", captureClick, true);
        };
        trigger.addEventListener("click", captureClick, true);
        setTimeout(() => trigger.removeEventListener("click", captureClick, true), 50);
      }
    };

    trigger.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary) return;
      if (event.button !== 0 && event.pointerType === "mouse") return;

      isDragging = true;
      dragThresholdMet = false;
      dragStartX = event.clientX;
      dragStartY = event.clientY;

      const rect = host.getBoundingClientRect();
      initialHostX = rect.left;
      initialHostY = rect.top;

      document.addEventListener("pointermove", onPointerMove, { passive: false });
      document.addEventListener("pointerup", onPointerUp);
      document.addEventListener("pointercancel", onPointerUp);
    });

    trigger.addEventListener("click", () => {
      if (!dragThresholdMet) {
        toggleMenu();
      }
    });

    document.addEventListener("pointerdown", (event) => {
      // Only close if the menu is currently open
      if (shell.dataset.open !== "true") return;

      // composedPath() traverses shadow DOM boundaries correctly.
      // If the host element (or anything inside it) is in the path, the click is inside.
      const path = event.composedPath ? event.composedPath() : [];
      const isInside = path.indexOf(host) !== -1;
      
      if (!isInside) {
        closeMenu();
      }
    }, true);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    });

    // Tandakan bahawa switcher telah berjaya diinject
    try {
      const sentinel = document.createElement("meta");
      sentinel.id = "local-pocket-switcher-injected";
      sentinel.setAttribute("aria-hidden", "true");
      sentinel.style.display = "none";
      (document.head || document.documentElement || document.body).appendChild(sentinel);
    } catch (e) {}
  }

  function buildProviderUrl(providerKey) {
    const base = PROVIDER_URLS[providerKey] || PROVIDER_URLS.chatgpt;
    try {
      const url = new URL(base);
      url.searchParams.set("lp_sidebar", "1");
      url.searchParams.set("lp_reload", Date.now().toString(36));
      return url.toString();
    } catch (err) {
      return base + (base.includes("?") ? "&" : "?") + "lp_sidebar=1";
    }
  }

  function listenForNavigateMessage() {
    const api = getExtensionApi();
    if (!api || !api.runtime || !api.runtime.onMessage) return;
    api.runtime.onMessage.addListener((message) => {
      if (!message || message.type !== "sidebar-ui-navigate-provider") return;
      const provider = message.provider;
      if (!provider || !PROVIDER_URLS[provider]) return;
      try {
        window.name = "__LP_SIDEBAR__";
        window.location.replace(buildProviderUrl(provider));
      } catch (err) {}
    });
  }

function injectPopupToolbar() {
    const POPUP_TOOLBAR_ID = "lp-popup-toolbar";
    if (document.getElementById(POPUP_TOOLBAR_ID)) return;
    const host = document.createElement("div");
    host.id = POPUP_TOOLBAR_ID;
    const root = document.documentElement || document.body;
    if (!root) return;
    const shadow = host.attachShadow({ mode: "closed" });
    const currentProvider = detectCurrentProvider() || resolveProviderFromHost() || "chatgpt";
    const currentLabel = PROVIDER_OPTIONS.find(o => o.value === currentProvider)?.label || "AI";

    const styles = document.createElement("style");
    styles.textContent = `
:host{all:initial;position:fixed;top:4px;right:8px;z-index:2147483647}
*{box-sizing:border-box;margin:0;padding:0}
.toolbar{display:flex;align-items:center;gap:4px;pointer-events:auto;background:linear-gradient(145deg,rgba(16,16,22,0.92),rgba(12,12,16,0.88));border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:2px 2px 2px 8px;box-shadow:0 8px 24px rgba(0,0,0,0.35);backdrop-filter:blur(16px);font-family:"Segoe UI Variable","Segoe UI",system-ui,-apple-system,sans-serif;color:#f0edea;font-size:12px;user-select:none;transition:opacity 0.15s}
.toolbar:hover{opacity:1!important}
.provider-btn{display:flex;align-items:center;gap:3px;padding:3px 8px;border:1px solid rgba(255,255,255,0.06);border-radius:14px;background:rgba(255,255,255,0.04);color:#f0edea;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background 0.12s}
.provider-btn:hover{background:rgba(255,255,255,0.1)}
.caret{width:0;height:0;border-left:3px solid transparent;border-right:3px solid transparent;border-top:4px solid rgba(255,255,255,0.4);transition:transform 0.2s}
.toolbar[data-open="true"] .caret{transform:rotate(180deg);border-top-color:#61d0ff}
.menu{position:absolute;top:calc(100% + 4px);right:0;min-width:150px;max-height:240px;overflow-y:auto;background:linear-gradient(145deg,rgba(20,20,25,0.98),rgba(15,15,18,0.98));border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:4px;box-shadow:0 12px 32px rgba(0,0,0,0.5);backdrop-filter:blur(24px);display:none;transform-origin:top right}
@keyframes menuIn{0%{opacity:0;transform:translateY(-6px) scale(0.96)}100%{opacity:1;transform:translateY(0) scale(1)}}
.toolbar[data-open="true"] .menu{display:flex;flex-direction:column;gap:1px;animation:menuIn 0.2s cubic-bezier(0.16,1,0.3,1) forwards}
.menu::-webkit-scrollbar{width:4px}
.menu::-webkit-scrollbar-track{background:transparent}
.menu::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}
.opt{display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border-radius:6px;color:rgba(255,255,255,0.55);font-size:11px;font-weight:500;cursor:pointer;transition:all 0.12s;border:none;background:transparent;width:100%;text-align:left}
.opt:hover{background:rgba(255,255,255,0.06);color:#fff}
.opt[data-sel="1"]{background:rgba(97,208,255,0.08);color:#fff;font-weight:600}
.check{width:12px;height:12px;border-radius:50%;background:#61d0ff;color:#000;font-size:7px;font-weight:800;display:flex;align-items:center;justify-content:center;opacity:0;transform:scale(0.5);transition:all 0.2s}
.opt[data-sel="1"] .check{opacity:1;transform:scale(1)}
.close-btn{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border:none;border-radius:50%;background:transparent;color:rgba(255,255,255,0.35);font-size:14px;line-height:1;cursor:pointer;transition:background 0.12s,color 0.12s}
.close-btn:hover{background:rgba(255,255,255,0.08);color:#ff6b6b}
.sep{height:1px;background:rgba(255,255,255,0.06);margin:3px 0}
`;
    shadow.appendChild(styles);

    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    toolbar.dataset.open = "false";

    const providerBtn = document.createElement("button");
    providerBtn.className = "provider-btn";
    providerBtn.type = "button";
    const labelSpan = document.createElement("span");
    labelSpan.textContent = currentLabel;
    const caret = document.createElement("span");
    caret.className = "caret";
    providerBtn.appendChild(labelSpan);
    providerBtn.appendChild(caret);

    const closeBtn = document.createElement("button");
    closeBtn.className = "close-btn";
    closeBtn.type = "button";
    closeBtn.title = "Close popup";
    closeBtn.textContent = "\u00d7";

    const menu = document.createElement("div");
    menu.className = "menu";

    PROVIDER_OPTIONS.forEach(function(opt) {
      const btn = document.createElement("button");
      btn.className = "opt";
      btn.type = "button";
      btn.dataset.provider = opt.value;
      btn.dataset.sel = opt.value === currentProvider ? "1" : "0";
      const nameSpan = document.createElement("span");
      nameSpan.textContent = opt.label;
      const check = document.createElement("span");
      check.className = "check";
      check.textContent = "\u2713";
      btn.appendChild(nameSpan);
      btn.appendChild(check);
      btn.addEventListener("pointerdown", function(e) {
        // Prevent document-level pointerdown from closing menu prematurely
        e.stopPropagation();
      });
      btn.addEventListener("click", function() {
        if (opt.value === currentProvider) { toolbar.dataset.open = "false"; return; }
        runtimeSendMessage({
          type: "update-ai-overlay-popup",
          provider: opt.value
        }).catch(function() {});
        toolbar.dataset.open = "false";
      });
      menu.appendChild(btn);
    });

    const sep = document.createElement("div");
    sep.className = "sep";
    const closeOpt = document.createElement("button");
    closeOpt.className = "opt";
    closeOpt.type = "button";
    closeOpt.style.color = "rgba(255,107,107,0.7)";
    closeOpt.textContent = "Close popup";
    closeOpt.addEventListener("pointerdown", function(e) {
      e.stopPropagation();
    });
    closeOpt.addEventListener("click", function() {
      toolbar.dataset.open = "false";
      runtimeSendMessage({ type: "close-ai-overlay-popup" }).catch(function() {});
    });
    menu.appendChild(sep);
    menu.appendChild(closeOpt);

    toolbar.appendChild(providerBtn);
    toolbar.appendChild(closeBtn);
    toolbar.appendChild(menu);
    shadow.appendChild(toolbar);
    root.appendChild(host);

    providerBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      toolbar.dataset.open = toolbar.dataset.open === "true" ? "false" : "true";
    });
    document.addEventListener("pointerdown", function(e) {
      if (toolbar.dataset.open !== "true") return;
      // composedPath() traverses shadow DOM boundaries correctly.
      // If the host element is in the path, the click is inside.
      const path = e.composedPath ? e.composedPath() : [];
      const isInside = path.indexOf(host) !== -1;
      if (!isInside) {
        toolbar.dataset.open = "false";
      }
    }, true);
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape") {
        if (toolbar.dataset.open === "true") {
          toolbar.dataset.open = "false";
        } else {
          runtimeSendMessage({ type: "close-ai-overlay-popup" }).catch(function() {});
        }
      }
    });
  }

function start() {
    // Popup toolbar: inject if lp_popup=1
    try {
      const pp = new URLSearchParams(window.location.search).get("lp_popup");
      if (pp === "1") { injectPopupToolbar(); return; }
    } catch (_) {}
    if (!isSidebarContext()) return;
    listenForNavigateMessage();
    ensureSidebarTranslationAddonSuppressor();
    if (document.body) {
        injectSwitcherUi().catch(() => {});
    } else {
        document.addEventListener("DOMContentLoaded", () => {
            injectSwitcherUi().catch(() => {});
        }, { once: true });
    }
    // Fallback: cuba inject semula jika gagal kali pertama (contoh: SPA navigation)
    [2000, 4000, 8000].forEach((delay) => {
        setTimeout(() => {
            if (!document.getElementById("local-pocket-switcher-injected")) {
                injectSwitcherUi().catch(() => {});
            }
        }, delay);
    });

    window.addEventListener("beforeunload", () => {
      if (sidebarTranslationAddonObserver) {
        sidebarTranslationAddonObserver.disconnect();
        sidebarTranslationAddonObserver = null;
      }
    }, { once: true });
}
start();
})();
