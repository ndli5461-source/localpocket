/**
 * floatingButtonFull.js — FULL floating button implementation
 *
 * Content script kedua. Mengandungi semua logic butang terapung, gesture,
 * link-save, YouTube watcher, dll.
 *
 * Lazy-load optimization:
 *  - floatingButton.js (skeleton) menetapkan window.__lpSkipFull = true
 *    pada tab yang tidak memerlukan butang (sidebar, panel sempit, file://, dll.)
 *  - Fail ini self-bailout di baris pertama jika __lpSkipFull = true
 *  - Pada tab yang skip, tiada variable, event listener, atau DOM mutation berlaku
 *  - Pada tab yang proceed, window.__lpGetSharedSettings() digunakan supaya
 *    storage.local.get hanya berlaku SEKALI (dikongsi dengan skeleton)
 */

// ── Bailout awal — kurangkan overhead pada tab yang tidak perlukan butang ──
if (window.__lpSkipFull) { /* Tab ini skip — jangan buat apa-apa */ }
else {

// Elak jalankan dua kali (contoh: extension reload atau SPA navigation)
if (!window.__lpFullLoaded) {
window.__lpFullLoaded = true;

const lpApi = typeof browser !== "undefined" ? browser : (typeof chrome !== "undefined" ? chrome : null);
const SIDEBAR_WINDOW_NAME = "__LP_SIDEBAR__";

(function () {
  function setupAltQuoteKeydown() {
    if (typeof window === "undefined") return;
    if (window.__lpAltQuoteFocusInstalled) return;
    window.__lpAltQuoteFocusInstalled = true;
    window.addEventListener(
      "keydown",
      (event) => {
        if (!event) return;
        const isAltQuote =
          event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          (event.code === "Quote" || event.key === "'");
        if (!isAltQuote) return;
        try {
          const maybe = lpApi.runtime.sendMessage({
            type: "focus-sidebar-chat-input",
          });
          if (maybe && typeof maybe.then === "function") {
            maybe.catch(() => {});
          }
        } catch (err) {
          // ignore
        }
        event.preventDefault();
        event.stopPropagation();
      },
      true,
    );
  }

  function setupSelectionListener() {
    if (typeof window === "undefined") return;
    if (window.__lpSelectionListenerInstalled) return;
    window.__lpSelectionListenerInstalled = true;
    document.addEventListener("selectionchange", handleSelectionChange, { passive: true });
    // Dedahkan ke skeleton supaya proxy boleh forward terus
    window.__lpHandleSelectionChange = handleSelectionChange;
  }

  function setupTKeyThumbnailShortcut() {
    if (typeof window === "undefined") return;
    if (window.__lpTKeyThumbnailInstalled) return;
    if (location.hostname.includes("youtube.com") || location.hostname === "youtu.be") return;
    window.__lpTKeyThumbnailInstalled = true;
    let tKeyDown = false;
    window.addEventListener("keydown", (event) => {
      if (event.key === "t" || event.key === "T") tKeyDown = true;
    }, true);
    window.addEventListener("keyup", (event) => {
      if (event.key === "t" || event.key === "T") tKeyDown = false;
    }, true);
    document.addEventListener("click", (event) => {
      if (!tKeyDown) return;
      if (event.button !== 0) return;
      tKeyDown = false;
      const img = event.target.closest ? event.target.closest("img") : null;
      if (!img && event.target.tagName !== "IMG") return;
      const imageUrl = (img || event.target).src || "";
      if (!imageUrl) return;
      event.preventDefault();
      event.stopPropagation();
      lpApi.runtime.sendMessage({
        type: "set-thumbnail-from-shortcut",
        imageUrl: imageUrl,
        pageUrl: window.location.href,
      }).catch(() => {});
    }, true);
    document.addEventListener("contextmenu", (event) => {
      if (!tKeyDown) return;
      tKeyDown = false;
      const img = event.target.closest ? event.target.closest("img") : null;
      if (!img && event.target.tagName !== "IMG") return;
      const imageUrl = (img || event.target).src || "";
      if (!imageUrl) return;
      event.preventDefault();
      event.stopPropagation();
      lpApi.runtime.sendMessage({
        type: "set-thumbnail-from-shortcut",
        imageUrl: imageUrl,
        pageUrl: window.location.href,
        learn: true,
      }).catch(() => {});
    }, true);
  }

  // ── Thumbnail selection mode (gesture: set-thumbnail-from-image) ──
  let _thumbnailSelectionModeActive = false;
  let _thumbnailModePageUrl = "";
  function _lpEnterThumbnailSelectionMode(pageUrl) {
    if (_thumbnailSelectionModeActive) return;
    _thumbnailSelectionModeActive = true;
    _thumbnailModePageUrl = pageUrl || window.location.href;

    // Show toast
    showLinkToast("🖼️ Klik pada mana-mana gambar untuk set sebagai thumbnail...");

    const handler = (event) => {
      if (!_thumbnailSelectionModeActive) return;
      _thumbnailSelectionModeActive = false;
      document.removeEventListener("click", handler, true);

      const img = event.target.closest ? event.target.closest("img") : null;
      if (!img && event.target.tagName !== "IMG") {
        showLinkToast("❌ Bukan gambar. Sila cuba sekali lagi.");
        return;
      }
      const imageUrl = (img || event.target).src || "";
      if (!imageUrl) {
        showLinkToast("❌ Gambar tiada URL.");
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      lpApi.runtime.sendMessage({
        type: "set-thumbnail-from-shortcut",
        imageUrl: imageUrl,
        pageUrl: _thumbnailModePageUrl,
      }).then(() => {
        showLinkToast("✅ Thumbnail ditukar!");
      }).catch(() => {
        showLinkToast("❌ Gagal set thumbnail.");
      });
    };

    document.addEventListener("click", handler, true);

    // Auto-cancel after 10 seconds
    setTimeout(() => {
      if (_thumbnailSelectionModeActive) {
        _thumbnailSelectionModeActive = false;
        document.removeEventListener("click", handler, true);
      }
    }, 10000);
  }

  // Daftar listener berdasarkan settings — elakkan listener tak perlu pada setiap tab
  // NOTA: Guna _sharedSettingsPromise untuk share satu storage.local.get dengan loadSettings
  // dan initGesture — elak 3 reads berasingan pada setiap tab init
  let _sharedSettingsPromise = null;
  function _getSharedSettings() {
    // Guna promise yang telah dibuat oleh skeleton (floatingButton.js) jika ada.
    // Ini memastikan hanya SATU storage.local.get berlaku per tab.
    if (!_sharedSettingsPromise) {
      if (typeof window.__lpGetSharedSettings === "function") {
        _sharedSettingsPromise = window.__lpGetSharedSettings();
      } else {
        _sharedSettingsPromise = lpApi.storage.local.get(["settings", "floatingSizeOverride"])
          .then(data => data || {})
          .catch(() => ({}));
      }
    }
    return _sharedSettingsPromise;
  }

  (async function registerListenersBySettings() {
    if (typeof window === "undefined") return;
    try {
      const data = await _getSharedSettings();
      const s = data && data.settings ? data.settings : {};
      if (s.floatingButtonEnabled !== false) {
        setupAltQuoteKeydown();
      }
      if (s.floatingAiSelectionEnabled !== false) {
        setupSelectionListener();
      }
      setupTKeyThumbnailShortcut();
    } catch (_) {
      setupAltQuoteKeydown();
      setupSelectionListener();
      setupTKeyThumbnailShortcut();
    }
  })();

  // Jangan render butang terapung dalam panel sidebar (ditanda melalui window.name).
  if (typeof window !== "undefined" && window.name === SIDEBAR_WINDOW_NAME) {
    return;
  }
  // Elakkan butang terapung muncul dalam panel sempit (contoh: sidebar / panel pop-up).
  if (
    typeof window !== "undefined" &&
    window.outerWidth &&
    window.outerWidth <= 520
  ) {
    return;
  }
  const BTN_ID = "__pocket_btn";
  const CONTAINER_ID = "__pocket_container";
  const SHOW_ANIM_CLASS = "__pocket_show-anim";
  const IDLE_TIMEOUT = 1200;
  const SAVE_DEBOUNCE_MS = 500;
  let lastSaveTime = 0;
  let saveInProgress = false;
  const SETTINGS_KEY = "settings";
  const SIZE_OVERRIDE_KEY = "floatingSizeOverride";
  const ITEM_KEY = "items";
  const CATEGORY_KEY = "categories";
  const SELECTED_CATEGORY_KEY = "selectedCategory";
  const THEME_PRESETS = [
    "classic",
    "ocean",
    "sunset",
    "modern",
    "minimal",
    "cyber",
    "forest",
    "pastel",
    "mono",
    "oled",
    "sepia",
    "retro",
    "aurora",
    "custom",
  ];
  const YOUTUBE_LISTENER_REFRESH_MS = 1500;
  const YOUTUBE_ENDED_COOLDOWN_MS = 1200;
  const YOUTUBE_END_TIMESTAMP_TOLERANCE_SEC = 0.4;
  const DEBUG = false;

  function getMeta(nameOrProperty) {
    if (typeof document === "undefined") return "";
    const el =
      document.querySelector(`meta[property="${nameOrProperty}"]`) ||
      document.querySelector(`meta[name="${nameOrProperty}"]`);
    if (el) return el.getAttribute("content") || "";
    return "";
  }

  function absolutizeUrl(value) {
    if (!value) return "";
    try {
      return new URL(value, window.location.href).toString();
    } catch (err) {
      return value;
    }
  }

  function getThumbnailUrlFromPage() {
    const url = window.location.href;

    // 1. YouTube specific
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      const videoIdMatch = url.match(
        /(?:v=|\/embed\/|\/watch\?v=|\/\d\/|\/vi\/|youtu\.be\/|v\/|e\/|u\/\w+\/|embed\/|v=|\/shorts\/)([^#\&\?]*).*/,
      );
      const videoId = videoIdMatch ? videoIdMatch[1] : null;
      if (videoId && videoId.length === 11) {
        return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      }
    }

    // 2. Video patterns & meta
    const videoEl = document.querySelector("video");
    if (videoEl && videoEl.getAttribute("poster")) {
      return absolutizeUrl(videoEl.getAttribute("poster"));
    }

    const videoMeta =
      getMeta("og:image") ||
      getMeta("twitter:image") ||
      getMeta("image_src") ||
      getMeta("thumbnailUrl");
    if (
      videoMeta &&
      !videoMeta.includes("favicon") &&
      !videoMeta.includes("logo")
    ) {
      return absolutizeUrl(videoMeta);
    }

    // 3. Metadata (Standard)
    const metaSelectors = [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[name="image"]',
      'meta[property="image"]',
      'link[rel="image_src"]',
      'link[rel="apple-touch-icon"]',
    ];
    for (const sel of metaSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const content = el.getAttribute("content") || el.getAttribute("href");
        if (content) return absolutizeUrl(content);
      }
    }

    return "";
  }

  function findThumbnailNearElement(el) {
    if (!el) return "";
    try {
      const getImgSrc = (img) => {
        if (!img) return "";
        const src = img.currentSrc || img.src || img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-original");
        return (src && !src.includes("favicon") && !src.includes("data:image/svg")) ? absolutizeUrl(src) : "";
      };

      // 1. Look inside the element (anchor)
      const img = el.querySelector("img");
      let src = getImgSrc(img);
      if (src) return src;

      // 2. Look at siblings or parent siblings (common in cards)
      const parent = el.parentElement;
      if (parent) {
        const parentImg = parent.querySelector("img");
        src = getImgSrc(parentImg);
        if (src) return src;
      }

      // 3. Fallback for Instagram, Twitter, Facebook (look in closest article/card)
      const article = el.closest('article, [role="article"], [data-testid="tweet"], .Post');
      if (article) {
        // Find the largest image or first image that is not a tiny icon
        const articleImgs = article.querySelectorAll("img");
        for (let i = 0; i < articleImgs.length; i++) {
          const ai = articleImgs[i];
          if (ai.width && ai.width < 50) continue; // Skip tiny avatars/icons
          src = getImgSrc(ai);
          if (src) return src;
        }
      }
    } catch (err) {}
    return "";
  }

  // Default values
  const DEFAULT_HIDE_TIMEOUT = 100;
  const DEFAULT_SHOW_DISTANCE = 150;
  const DEFAULT_ANIMATION = "fade";
  const DEFAULT_SHOW_ANIM_MS = 200;
  const DEFAULT_HIDE_ANIM_MS = 100;
  const DEFAULT_BTN_SIZE = 84;
  const DEFAULT_ICON_RATIO = 0.86; // icon = button * ratio
  const DEFAULT_ICON_FILE = "icons/icon_2.png";
  const DEFAULT_OFFSET_X = 10;
  const DEFAULT_OFFSET_Y = 300;
  const VIEWPORT_MARGIN = 8; // keep button a few px inside the viewport
  const DEFAULT_LONG_PRESS_TRIGGER_MS = 800;
  const MAX_LONG_PRESS_TRIGGER_MS = 1000;
  const DEFAULT_CATEGORY_PICKER_LONG_PRESS_TRIGGER_MS = 250;
  const MAX_CATEGORY_PICKER_LONG_PRESS_TRIGGER_MS = 1000;
  const LONG_PRESS_MOVE_CANCEL_PX = 12;
  const LONG_PRESS_CLICK_SUPPRESS_MS = 500;
  const LINK_SAVE_MODIFIER_COMBOS = [
    "ctrl",
    "alt",
    "shift",
    "meta",
    "ctrl+alt",
    "ctrl+shift",
    "ctrl+meta",
    "alt+shift",
    "alt+meta",
    "shift+meta",
    "ctrl+alt+shift",
    "ctrl+alt+meta",
    "ctrl+shift+meta",
    "alt+shift+meta",
    "ctrl+alt+shift+meta",
  ];
  const LINK_SAVE_MOUSE_BUTTONS = ["left", "middle", "right", "hover"];
  const QUICK_LINK_SAVE_FAVORITE_ENTRY_ID = "__local_pocket_quick_favorite__";
  const LINK_SAVE_KEY_ALIASES = {
    space: "Space",
    spacebar: "Space",
    enter: "Enter",
    return: "Enter",
    tab: "Tab",
    escape: "Esc",
    esc: "Esc",
    backspace: "Backspace",
    delete: "Delete",
    del: "Delete",
    insert: "Insert",
    ins: "Insert",
    home: "Home",
    end: "End",
    pageup: "PageUp",
    pgup: "PageUp",
    pagedown: "PageDown",
    pgdn: "PageDown",
    arrowleft: "Left",
    left: "Left",
    arrowright: "Right",
    right: "Right",
    arrowup: "Up",
    up: "Up",
    arrowdown: "Down",
    down: "Down",
    capslock: "CapsLock",
    numlock: "NumLock",
    scrolllock: "ScrollLock",
    pause: "Pause",
    printscreen: "PrintScreen",
    menu: "Menu",
  };
  const LINK_SAVE_MOUSE_EVENT_MAP = {
    left: { eventType: "click", button: 0 },
    middle: { eventType: "auxclick", button: 1 },
    right: { eventType: "contextmenu", button: 2 },
  };

  function normalizeLinkSaveKeyboardKey(value) {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return "";
    const alias = LINK_SAVE_KEY_ALIASES[raw.toLowerCase()];
    if (alias) return alias;
    if (/^F\d{1,2}$/i.test(raw)) {
      const fn = Number.parseInt(raw.slice(1), 10);
      return Number.isFinite(fn) && fn >= 1 && fn <= 24 ? `F${fn}` : "";
    }
    if (raw.length === 1) return raw.toUpperCase();
    return "";
  }

  function normalizeLinkSaveTriggerValue(value) {
    const combo =
      typeof value === "string" ? value.trim().toLowerCase() : "";
    if (LINK_SAVE_MODIFIER_COMBOS.includes(combo)) return combo;
    const key = normalizeLinkSaveKeyboardKey(value);
    return key || "ctrl+alt";
  }

  function normalizeLinkSaveModifierCombo(value) {
    return normalizeLinkSaveTriggerValue(value);
  }

  function normalizeLinkSaveMouseButton(value) {
    const button =
      typeof value === "string" ? value.trim().toLowerCase() : "";
    return LINK_SAVE_MOUSE_BUTTONS.includes(button) ? button : "left";
  }

  function getLinkSaveModifierState(combo) {
    const parts = normalizeLinkSaveModifierCombo(combo).split("+");
    return {
      ctrl: parts.includes("ctrl"),
      alt: parts.includes("alt"),
      shift: parts.includes("shift"),
      meta: parts.includes("meta"),
    };
  }

  function isLinkSaveModifierCombo(value) {
    return LINK_SAVE_MODIFIER_COMBOS.includes(
      typeof value === "string" ? value.trim().toLowerCase() : "",
    );
  }

  function matchesLinkSaveModifierEvent(event, modifierState, mouseButton) {
    if (!!event.ctrlKey !== modifierState.ctrl) return false;
    if (!!event.altKey !== modifierState.alt) return false;
    if (!!event.shiftKey !== modifierState.shift) return false;
    if (!!event.metaKey !== modifierState.meta) return false;

    const mouseConfig = LINK_SAVE_MOUSE_EVENT_MAP[mouseButton];
    if (!mouseConfig) return false;
    return (
      event.type === mouseConfig.eventType && event.button === mouseConfig.button
    );
  }

  function matchesLinkSaveKeyboardEvent(event, requiredKey, mouseButton) {
    const mouseConfig = LINK_SAVE_MOUSE_EVENT_MAP[mouseButton];
    if (!mouseConfig) return false;
    if (event.type !== mouseConfig.eventType || event.button !== mouseConfig.button) {
      return false;
    }
    if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) {
      return false;
    }

    return !!requiredKey && linkSavePressedKeys.has(requiredKey);
  }

  function hoverModifierMatches(modifierState, event) {
    if (!modifierState) return false;
    const ctrl = event ? !!event.ctrlKey : linkSaveHeldModifiers.ctrl;
    const alt = event ? !!event.altKey : linkSaveHeldModifiers.alt;
    const shift = event ? !!event.shiftKey : linkSaveHeldModifiers.shift;
    const meta = event ? !!event.metaKey : linkSaveHeldModifiers.meta;
    return ctrl === modifierState.ctrl && alt === modifierState.alt && shift === modifierState.shift && meta === modifierState.meta;
  }

  function extractLinkTitle(a) {
    if (!a) return "";

    var ytFormatted = a.querySelector("#video-title, yt-formatted-string#video-title, span#video-title");
    if (ytFormatted) {
      var t = (ytFormatted.textContent || "").trim();
      if (t) return t.slice(0, 500);
    }

    var ariaLabel = (a.getAttribute("aria-label") || "").trim();
    if (ariaLabel && ariaLabel !== "true" && ariaLabel !== "false") {
      var ytMatch = ariaLabel.match(/^(.+?)\s+by\s+.+/);
      if (ytMatch) return ytMatch[1].trim().slice(0, 500);
      return ariaLabel.slice(0, 500);
    }

    var t = (a.title || "").trim();
    if (t && t !== "true" && t !== "false" && t !== "1" && t !== "0") return t.slice(0, 500);
    var img = a.querySelector("img");
    if (img) {
      t = (img.alt || "").trim();
      if (t) return t.slice(0, 500);
    }
    t = (a.textContent || "").trim();
    if (t && !/^\d+:\d{2}(?::\d{2})?$/.test(t.replace(/^▶\s*/, ""))) return t.slice(0, 500);

    // Fallback: cari #video-title di luar <a> (YouTube watch page sidebar)
    var look = a.parentElement;
    for (var i = 0; look && i < 3 && look !== document.body; i++) {
      ytFormatted = look.querySelector("#video-title, yt-formatted-string#video-title, span#video-title");
      if (ytFormatted) {
        t = (ytFormatted.textContent || "").trim();
        if (t) return t.slice(0, 500);
      }
      look = look.parentElement;
    }
    return "";
  }

  async function handleHoverLinkSave(matchType, clientX, clientY) {
    // Refresh URL & title dari cursor position
    try {
      const cx = typeof clientX === "number" ? clientX : lastClientX;
      const cy = typeof clientY === "number" ? clientY : lastClientY;
      if (cx > 0 || cy > 0) {
        const el = document.elementFromPoint(cx, cy);
        const a = el && el.closest("a[href]");
        if (a && a.href) {
          _hoveredLinkUrl = a.href;
          _hoveredLinkTitle = extractLinkTitle(a);
        }
      }
    } catch (_e) {}

    if (!_hoveredLinkUrl) return;
    if (linkSaveHoverLastSavedUrl === _hoveredLinkUrl && matchType !== "bundle") return;
    linkSaveHoverLastSavedUrl = _hoveredLinkUrl;

    const tag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea" || tag === "select") return;

    const payload = {
      url: _hoveredLinkUrl,
      title: _hoveredLinkTitle,
      clientX: typeof clientX === "number" ? clientX : lastClientX,
      clientY: typeof clientY === "number" ? clientY : lastClientY,
    };

    if (matchType === "direct") {
      try {
        await saveShortcutLinkToCategory(payload);
      } catch (err) {
        showLinkToast("Failed to save link");
      }
      return;
    }

    if (matchType === "activeCategory") {
      try {
        await saveShortcutLinkToCategory(payload, true);
      } catch (err) {
        showLinkToast("Failed to save link to active category");
      }
      return;
    }

    // bundle / primary — save terus tanpa countdown
    // Elak save URL yang sama berulang kali
    if (linkSaveBundlePayloads.findIndex(p => p.url === payload.url) >= 0) return;
    linkSaveBundlePayloads.push(payload);
    updateBundleBadge();

    // matchType "bundle" → save terus tanpa mini kategori (wasBundle=true)
    // matchType "primary" → mini kategori muncul kalau linkSavePromptCategoryEnabled (wasBundle=false)
    await commitLinkSaveBundle(matchType === "bundle");
  }

  // Listen for direct close requests from background (failsafe toggle).
  if (
    lpApi &&
    lpApi.runtime &&
    lpApi.runtime.onMessage &&
    !window.__lpClosePickerListener
  ) {
    window.__lpClosePickerListener = true;
    lpApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || message.type !== "close-category-picker-direct") return;
      const el = document.getElementById("__local_pocket_category_picker");
      const closed = !!el;
      if (el) {
        try {
          el.remove();
        } catch (err) {}
      }
      try {
        sendResponse && sendResponse({ closed });
      } catch (err) {}
      return true;
    });
  }

  function escHtml(s) { return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  let floatingButtonVisibilityMode = "hover";
  let miniCategoryTriggerDirection = "right";
  let miniCategoryPanelLayout = "list"; // "list", "grid", "horizontal", "radial", "wheel"
  let hideTimer = null;
  let isVisible = false;
  let miniCategoryPanel = null;
  let miniCategoryVisible = false;
  let miniCategoryPending = false;
  let miniCategoryTimer = null;
  let miniCategorySearchBuffer = "";
  let miniCategorySearchTimer = null;
  let initScheduled = false;
  let moveRaf = 0;
  let lastClientX = 0;
  let lastClientY = 0;
  let lastScrollY = window.scrollY || 0;
  let scrollRaf = 0;
  let aiSelectionContainer = null;
  let lastSelectedText = "";

  // Settings variables
  let hideTimeout = DEFAULT_HIDE_TIMEOUT;
  let showDistance = DEFAULT_SHOW_DISTANCE;
  let animationType = DEFAULT_ANIMATION;
  let showAnimMs = DEFAULT_SHOW_ANIM_MS;
  let hideAnimMs = DEFAULT_HIDE_ANIM_MS;
  let floatingButtonEnabled = true;
    let enableCategoryPicker = true;
    let floatingAiSelectionEnabled = true;
  let floatingButtonAutoSuspendActive = false;
  let blockPickerOnTextCursor = true;
  let floatingIconPath = DEFAULT_ICON_FILE;
  let floatingButtonWidth = DEFAULT_BTN_SIZE;
  let floatingButtonHeight = DEFAULT_BTN_SIZE;
  let floatingButtonAnchor = "custom";
  let floatingButtonOffsetX = DEFAULT_OFFSET_X;
  let floatingButtonOffsetY = DEFAULT_OFFSET_Y;
  let floatingButtonAnchorX = "right"; // 'left' or 'right'
  let floatingButtonAnchorY = "top"; // 'top' or 'bottom'
  let tempDragLeft = null;
  let tempDragTop = null;
  let hideAfterAnimTimeout = null;
  let styleSheet = null;
  let youtubeAutoNext = false;
  let youtubeAutoRandom = false;
  let deleteAfterOpenActive = false;
  let rediscoverEnabled = false;
let globalLinkInBackgroundTabActive = true;
  let floatingSubButtonSize = 32;
  let _gestureRuntimeEnabled = false;
  let youtubeWatchTimer = null;
  let youtubeTrackedVideo = null;
  let youtubeVideoHandlers = null;
  let youtubeLastHandledVideoId = "";
  let youtubeLastHandledAt = 0;
  let youtubeLastUrl = "";
  let youtubeEndSentForCurrentVideo = false;
  let buttonImg = null;
  let customIconObjectUrl = "";
  let customIcons = [];
  let ctrlAltLinkSaveEnabled = false;
  let linkSaveModifierCombo = "ctrl+alt";
  let linkSaveModifierState = getLinkSaveModifierState(linkSaveModifierCombo);
  let linkSaveKeyboardKey = "";
  let linkSaveMouseButton = "left";
  let linkSaveBundleModifier = "";
  let linkSaveBundleModifierState = null;
  let linkSaveBundleDuration = 2;
  let linkSaveBundleKeyboardKey = "";
  let linkSaveDirectModifier = "";
  let linkSaveDirectModifierState = null;
  let linkSaveDirectKeyboardKey = "";
  let linkSaveActiveCategoryModifier = "";
  let linkSaveActiveCategoryModifierState = null;
  let linkSaveActiveCategoryKeyboardKey = "";
  let linkSavePromptCategoryEnabled = false;
  let linkSavePinnedCategoryIds = [];
  const linkSavePressedKeys = new Set();
  let linkSaveListenersInstalled = false;
  let linkSaveCategoryChooserCleanup = null;
  let linkSaveHeldModifiers = { ctrl: false, alt: false, shift: false, meta: false };
  let linkSaveHoverLastSavedUrl = "";
  let _hoveredLinkUrl = "";
  let _hoveredLinkTitle = "";
  let linkSaveBundleTimer = null;
  let linkSaveBundlePayloads = [];
  let linkSaveBundleMode = false;
  let linkSaveBundleBadge = null;
  let linkSaveBundleCommitting = false;
  let modifierSaveTimer = null;
  let modifierSaveAborted = false;

  const commitLinkSaveBundle = async (wasBundle = false) => {
    if (linkSaveBundleCommitting) return;
    linkSaveBundleCommitting = true;
    _dismissBundleToast();
    try {
      if (linkSaveBundleTimer) {
        clearTimeout(linkSaveBundleTimer);
        linkSaveBundleTimer = null;
      }
      if (!linkSaveBundlePayloads || linkSaveBundlePayloads.length === 0) return;

      linkSaveBundleMode = false;
      const payloads = [...linkSaveBundlePayloads];
      linkSaveBundlePayloads = [];
      updateBundleBadge();

      // Kalau 1 link dan perlu category chooser (prompt enabled, bukan dari auto-bundle)
      if (payloads.length === 1 && wasBundle === false && linkSavePromptCategoryEnabled) {
        try {
          await openQuickLinkSaveCategoryChooser(payloads[0]);
        } catch (err) {
          showLinkToast("Failed to save link");
        }
        return;
      }

      // Semua kes lain — guna batch save (1 link atau lebih)
      try {
        let currentCategoryId = "";
        let currentCategoryName = "";
        try {
          const currentCat = await sendShortcutSavedLinkMessage({ type: "get-selected-category" });
          const rawCategoryId = (currentCat && currentCat.categoryId) || "";
          currentCategoryId = (rawCategoryId === "all" || rawCategoryId === "none") ? "" : rawCategoryId;
          currentCategoryName = (currentCat && currentCat.categoryName) || "";
        } catch (_) {}

        const batchPayloads = payloads.map(p => ({
          url: p.url || "",
          title: p.title || "",
          thumbnailUrl: p.thumbnailUrl || "",
          categoryId: currentCategoryId,
          useActiveCategory: true,
        }));

        const response = await sendShortcutSavedLinkMessage({
          type: "save-link-url-batch",
          payloads: batchPayloads,
        });

        if (response && response.ok) {
          const categoryName = (response.categoryName) || currentCategoryName || "Uncategorized";
          const categoryId = (response.categoryId) || currentCategoryId || "";
          showSavedLinkToast(categoryName, categoryId);
        } else {
          showLinkToast("Failed to save");
        }
      } catch (err) {
        showLinkToast("Failed to save");
      }
    } finally {
      linkSaveBundleCommitting = false;
    }
  };

  function updateBundleBadge() {
    if (!linkSaveBundleBadge) return;
    const count = linkSaveBundlePayloads.length;
    if (count > 0) {
      linkSaveBundleBadge.textContent = String(count);
      linkSaveBundleBadge.style.display = "flex";
    } else {
      linkSaveBundleBadge.style.display = "none";
    }
  }

  function cancelBundle() {
    linkSaveBundleMode = false;
    linkSaveBundlePayloads = [];
    if (linkSaveBundleTimer) {
      clearTimeout(linkSaveBundleTimer);
      linkSaveBundleTimer = null;
    }
    updateBundleBadge();
    _dismissBundleToast();
    showLinkToast("Bundle cancelled");
  }

  let nextUpTextEl = null;
  let nextUpTextInner = null;
  let nextUpMarqueeAnim = null;
  let nextUpHovering = false;
  let nextUpLastStart = 0;
  let nextUpTimer = null;
  let nextUpPending = false;
  let nextUpCache = null;
  let nextUpLastFetchedAt = 0;
  let floatingNextUpLabel = true;
  let floatingNextUpMaxWidth = 220;
  let themePreset = "classic";
  let themeColors = null;
  let floatingSuppressed = false; // per-tab, reset on refresh
  let floatingButtonDomainExceptions = [];
  let domainExcludedForCurrentHost = false;
  let isCurrentPageSaved = false;
  let isCurrentPageFavorite = false;
  let saveToggleBtn = null;
  let favoriteSaveBtn = null;
  let temporaryButtonPosition = null;
  let longPressTimer = null;
  let longPressTracking = false;
  let longPressIsRightButton = false;
  let longPressTimerFired = false;
  let longPressStartX = 0;
  let longPressStartY = 0;
  let longPressPendingReleaseClick = false;
  let longPressGestureEnabled = false; // disabled: left+right click toggle removed
  let _lastLeftClickTime = 0;
  let _lastRightClickTime = 0;
  const SIMULTANEOUS_CLICK_WINDOW_MS = 150;
  let _pendingToggleSignal = false;

  function isFloatingRuntimePaused() {
    return floatingSuppressed || !floatingButtonEnabled;
  }
  let longPressSuppressClickUntil = 0;
  let longPressTriggerMs = DEFAULT_LONG_PRESS_TRIGGER_MS;
  let categoryPickerLongPressTriggerMs = DEFAULT_CATEGORY_PICKER_LONG_PRESS_TRIGGER_MS;
  let longPressSwapEnabled = false;
  let categoryPickerGestureActive = false;
  let longPressRightActionAt = 0;
  let longPressSelectionHandler = null;

  // Button 5 (forward) category scroller state
  let button5ScrollerActive = false;
  let button5ScrollerCategories = [];
  let button5ScrollerAllCategories = [];
  let button5ScrollerCurrentIndex = 0;
  let button5ScrollerDom = null;
  let button5ScrollerTimer = null;
  let button5ScrollerMode = 0; // 0=normal, 1=hidden

  function _saveButton5ScrollerMode(mode) {
    lpApi.storage.local.get(SETTINGS_KEY).then((data) => {
      const settings = data && typeof data[SETTINGS_KEY] === "object" ? data[SETTINGS_KEY] : {};
      settings.button5ScrollerMode = mode;
      lpApi.storage.local.set({ [SETTINGS_KEY]: settings });
    });
  }

  function getActionForButton(isRightButton) {
    if (longPressSwapEnabled) {
      return isRightButton ? "floating-button" : "category-picker";
    }
    return isRightButton ? "category-picker" : "floating-button";
  }

  async function checkCurrentPageSaved() {
    try {
      const currentUrl = window.location.href;
      // Guna mesej ke background yang menggunakan urlIndexCache O(1)
      // Mengelak baca semua 1500+ items dari storage.local pada setiap tab
      const response = await lpApi.runtime.sendMessage({
        type: "check-url-saved",
        url: currentUrl,
      });
      isCurrentPageSaved = !!(response && response.saved);
      isCurrentPageFavorite = !!(response && response.favorite);
      updateSaveBtnUI();
      updateFavoriteBtnUI();
    } catch (err) {}
  }

  function updateSaveBtnUI() {
    if (!saveToggleBtn) return;
    saveToggleBtn.title = isCurrentPageSaved ? "S (Unsave Current Page)" : "S (Save Current Page)";
    saveToggleBtn.style.background = isCurrentPageSaved ? "rgba(59, 130, 246, 0.3)" : "rgba(0, 0, 0, 0.4)";
    saveToggleBtn.style.color = isCurrentPageSaved ? "#bfdbfe" : "#60a5fa";
    saveToggleBtn.style.boxShadow = isCurrentPageSaved ? "0 0 20px rgba(59, 130, 246, 0.8), inset 0 0 10px rgba(59, 130, 246, 0.5)" : "0 0 15px rgba(59, 130, 246, 0.6), inset 0 0 5px rgba(59, 130, 246, 0.3)";
  }

  function updateFavoriteBtnUI() {
    if (!favoriteSaveBtn) return;
    favoriteSaveBtn.title = isCurrentPageFavorite
      ? "Unfavorite Current Page"
      : "Favorite Current Page";
    favoriteSaveBtn.style.background = isCurrentPageFavorite
      ? "rgba(250, 204, 21, 0.16)"
      : "rgba(0, 0, 0, 0.48)";
    favoriteSaveBtn.style.borderColor = isCurrentPageFavorite
      ? "rgba(250, 204, 21, 0.45)"
      : "rgba(255, 255, 255, 0.16)";
    favoriteSaveBtn.style.color = isCurrentPageFavorite ? "#facc15" : "#ffffff";
    favoriteSaveBtn.style.boxShadow = isCurrentPageFavorite
      ? "0 0 16px rgba(250, 204, 21, 0.62), inset 0 0 7px rgba(250, 204, 21, 0.22)"
      : "0 0 9px rgba(255, 255, 255, 0.18), inset 0 0 3px rgba(255, 255, 255, 0.08)";
  }

  function updateRediscoverBtnUI(btn, enabled) {
    if (!btn) return;
    if (enabled) {
      btn.style.background = "rgba(20, 184, 166, 0.3)";
      btn.style.color = "#5eead4";
      btn.style.boxShadow = "0 0 20px rgba(20, 184, 166, 0.8), inset 0 0 10px rgba(20, 184, 166, 0.5)";
      btn.title = "Rediscover: ON (klik untuk matikan)";
    } else {
      btn.style.background = "rgba(0, 0, 0, 0.4)";
      btn.style.color = "#94a3b8";
      btn.style.boxShadow = "0 0 15px rgba(148, 163, 184, 0.3), inset 0 0 5px rgba(148, 163, 184, 0.1)";
      btn.title = "Rediscover: OFF (klik untuk aktifkan)";
    }
  }

  async function handleRediscoverToggleClick(e) {
    e.stopPropagation();
    e.preventDefault();

    const btn = document.getElementById("__pocket_rediscover_btn");
    const previousValue = rediscoverEnabled;
    const newValue = !previousValue;

    // Optimistic update — kemas kini visual serta-merta sebelum storage I/O
    rediscoverEnabled = newValue;
    updateRediscoverBtnUI(btn, newValue);

    try {
      // 1. Baca tetapan semasa dari storage
      const data = await lpApi.storage.local.get(SETTINGS_KEY);
      const settings = (data && data[SETTINGS_KEY]) ? { ...data[SETTINGS_KEY] } : {};
      settings.rediscoverEnabled = newValue;

      // 2. Simpan ke Settings_Storage
      await lpApi.storage.local.set({ [SETTINGS_KEY]: settings });

      // 3. Hantar mesej ke Background_Script (kegagalan tidak menyebabkan rollback)
      lpApi.runtime.sendMessage({
        type: "toggle-rediscover-enabled",
        enabled: newValue
      }).catch(() => {});

      // 4. Paparkan toast notification
      showLinkToast(newValue ? "Rediscover: ON" : "Rediscover: OFF");

    } catch (err) {
      // Rollback jika storage save gagal
      rediscoverEnabled = previousValue;
      updateRediscoverBtnUI(btn, previousValue);
    }
  }

  function log(...args) {
    if (DEBUG) {
      console.log(...args);
    }
  }

  function injectAnimationStyles() {
    if (styleSheet) return;

    const style = document.createElement("style");
    style.textContent = `
      @keyframes pocket-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes pocket-slide-in {
        from { opacity: 0; transform: translateX(50px); }
        to { opacity: 1; transform: translateX(0); }
      }
      
      @keyframes pocket-scale-in {
        from { opacity: 0; transform: scale(0.3); }
        to { opacity: 1; transform: scale(1); }
      }
      
      @keyframes pocket-bounce-in {
        0% { opacity: 0; transform: scale(0); }
        50% { transform: scale(1.2); }
        100% { opacity: 1; transform: scale(1); }
      }
      
      @keyframes pocket-pop-in {
        0% { opacity: 0; transform: scale(0) rotate(0deg); }
        100% { opacity: 1; transform: scale(1) rotate(0deg); }
      }
      
      .__pocket_show-anim {
        animation: pocket-fade-in 0.2s ease !important;
      }
      
      .__pocket_show-anim.slideIn {
        animation: pocket-slide-in 0.3s ease !important;
      }
      
      .__pocket_show-anim.scaleIn {
        animation: pocket-scale-in 0.3s ease !important;
      }
      
      .__pocket_show-anim.bounce {
        animation: pocket-bounce-in 0.4s ease !important;
      }
      
      .__pocket_show-anim.popIn {
        animation: pocket-pop-in 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55) !important;
      }
      .__pocket_marquee {
        -webkit-mask-image: linear-gradient(90deg, transparent 0, rgba(0,0,0,0.65) 8px, rgba(0,0,0,1) 18px, rgba(0,0,0,1) calc(100% - 18px), rgba(0,0,0,0.65) calc(100% - 8px), transparent 100%);
                mask-image: linear-gradient(90deg, transparent 0, rgba(0,0,0,0.65) 8px, rgba(0,0,0,1) 18px, rgba(0,0,0,1) calc(100% - 18px), rgba(0,0,0,0.65) calc(100% - 8px), transparent 100%);
      }
      /* Smooth transitions for container and button size/position */
      #__pocket_container {
        transition: opacity 160ms ease, left 180ms ease, right 180ms ease, top 180ms ease, bottom 180ms ease, transform 180ms ease;
      }
      #__pocket_btn {
        transition: transform 180ms ease, width 160ms ease, height 160ms ease, box-shadow 160ms ease;
      }
      #__pocket_btn img {
        transition: width 160ms ease, height 160ms ease;
      }
      /* Button 5 category scroller overlay */
      #__pocket_btn5_scroller {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
      }
      #__pocket_btn5_scroller_backdrop {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.25);
        z-index: 0;
        pointer-events: auto;
        opacity: 0;
        transition: opacity 0.2s ease;
      }
      #__pocket_btn5_scroller_backdrop.visible { opacity: 1; }
      #__pocket_btn5_scroller_panel {
        position: relative;
        z-index: 1;
        background: rgba(18, 18, 22, 0.95);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 20px;
        padding: 10px 14px 8px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.6);
        pointer-events: auto;
        transform: scale(0.95);
        opacity: 0;
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.18s ease;
        min-width: 320px;
        max-width: 85vw;
      }
      #__pocket_btn5_scroller_panel.visible {
        transform: scale(1);
        opacity: 1;
      }
      .__pocket_btn5_modebar {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0;
        padding: 0 0 8px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        margin-bottom: 8px;
      }
      .__pocket_btn5_mode_tab {
        padding: 6px 16px;
        font: 500 12px/1 system-ui, sans-serif;
        color: rgba(255,255,255,0.35);
        background: transparent;
        border: 1.5px solid transparent;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
      }
      .__pocket_btn5_mode_tab:hover {
        color: rgba(255,255,255,0.6);
        background: rgba(255,255,255,0.05);
      }
      .__pocket_btn5_mode_tab.active {
        color: #a78bfa;
        background: rgba(167,139,250,0.12);
        border-color: rgba(167,139,250,0.3);
      }
      .__pocket_btn5_scroll_area {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: none;
        scroll-snap-type: x mandatory;
        scroll-behavior: smooth;
        padding: 4px 2px;
        -webkit-overflow-scrolling: touch;
      }
      .__pocket_btn5_scroll_area::-webkit-scrollbar { display: none; }
      .__pocket_btn5_item {
        flex-shrink: 0;
        scroll-snap-align: center;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border-radius: 12px;
        font: 500 13px/1 system-ui, sans-serif;
        color: rgba(255,255,255,0.55);
        background: rgba(255,255,255,0.05);
        border: 1.5px solid transparent;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
        user-select: none;
      }
      .__pocket_btn5_item:hover {
        background: rgba(255,255,255,0.1);
        color: rgba(255,255,255,0.8);
      }
      .__pocket_btn5_item.active {
        background: rgba(72,213,151,0.15);
        border-color: rgba(72,213,151,0.5);
        color: #48d597;
        font-weight: 600;
        box-shadow: 0 0 12px rgba(72,213,151,0.15);
      }
      .__pocket_btn5_item .__pocket_btn5_dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: rgba(255,255,255,0.15);
        flex-shrink: 0;
        transition: all 0.15s ease;
      }
      .__pocket_btn5_item.active .__pocket_btn5_dot {
        background: #48d597;
        box-shadow: 0 0 6px rgba(72,213,151,0.5);
      }
      .__pocket_btn5_hint {
        text-align: center;
        font: 400 11px/1 system-ui, sans-serif;
        color: rgba(255,255,255,0.25);
        padding: 6px 0 0;
      }
    `;
    document.head.appendChild(style);
    styleSheet = style;
  }

  function applySettingsObject(settings) {
    const safe = settings && typeof settings === "object" ? settings : {};
    hideTimeout = safe.floatingButtonHideTime || DEFAULT_HIDE_TIMEOUT;
    const rawSensitivity = Number.parseInt(
      typeof safe.floatingButtonSensitivity !== "undefined"
        ? safe.floatingButtonSensitivity
        : safe.floatingButtonShowTime,
      10,
    );
    showDistance = Number.isFinite(rawSensitivity)
      ? Math.min(Math.max(rawSensitivity, 40), 600)
      : DEFAULT_SHOW_DISTANCE;
    animationType = safe.floatingButtonAnimation || DEFAULT_ANIMATION;
    showAnimMs =
      Number.parseInt(safe.floatingButtonShowAnimDuration, 10) ||
      DEFAULT_SHOW_ANIM_MS;
    hideAnimMs =
      Number.parseInt(safe.floatingButtonHideAnimDuration, 10) ||
      DEFAULT_HIDE_ANIM_MS;
    const rawLongPressDuration = Number.parseInt(
      safe.floatingButtonLongPressDuration,
      10,
    );
    longPressTriggerMs = Number.isFinite(rawLongPressDuration)
      ? Math.min(Math.max(rawLongPressDuration, 0), MAX_LONG_PRESS_TRIGGER_MS)
      : DEFAULT_LONG_PRESS_TRIGGER_MS;
    const rawCategoryPickerLongPressDuration = Number.parseInt(
      safe.floatingButtonCategoryPickerLongPressDuration,
      10,
    );
    categoryPickerLongPressTriggerMs = Number.isFinite(rawCategoryPickerLongPressDuration)
      ? Math.min(Math.max(rawCategoryPickerLongPressDuration, 0), MAX_CATEGORY_PICKER_LONG_PRESS_TRIGGER_MS)
      : DEFAULT_CATEGORY_PICKER_LONG_PRESS_TRIGGER_MS;
    longPressSwapEnabled = safe.floatingButtonLongPressSwap === true;
    categoryPickerGestureActive = safe.categoryPickerMouseGesture === true;
    floatingButtonAutoSuspendActive =
      safe.floatingButtonAutoSuspendActive === true;
    enableCategoryPicker = safe.enableCategoryPicker !== false;
    floatingAiSelectionEnabled = safe.floatingAiSelectionEnabled !== false;
    blockPickerOnTextCursor = safe.blockPickerOnTextCursor !== false;
    floatingButtonEnabled =
      safe.floatingButtonEnabled !== false &&
      floatingButtonAutoSuspendActive !== true;
    const size = Number.parseInt(safe.floatingButtonSize, 10);
    const widthVal = Number.parseInt(safe.floatingButtonWidth, 10);
    const heightVal = Number.parseInt(safe.floatingButtonHeight, 10);
    const resolvedWidth = Number.isFinite(widthVal)
      ? widthVal
      : Number.isFinite(size)
        ? size
        : typeof floatingButtonWidth === "number"
          ? floatingButtonWidth
          : DEFAULT_BTN_SIZE;
    const resolvedHeight = Number.isFinite(heightVal)
      ? heightVal
      : Number.isFinite(size)
        ? size
        : typeof floatingButtonHeight === "number"
          ? floatingButtonHeight
          : DEFAULT_BTN_SIZE;
    floatingButtonWidth = Math.min(Math.max(resolvedWidth, 40), 400);
    floatingButtonHeight = Math.min(Math.max(resolvedHeight, 40), 400);
    const anchorRaw =
      typeof safe.floatingButtonAnchor === "string"
        ? safe.floatingButtonAnchor.trim().toLowerCase()
        : "custom";
    // Always honor manual positioning; treat legacy "center" as custom with right/bottom anchor.
    // Convert any legacy anchor/offset combo to absolute left/top offsets
    const rawOffX = Number.parseInt(safe.floatingButtonOffsetX, 10);
    const rawOffY = Number.parseInt(safe.floatingButtonOffsetY, 10);
    const storedOffX = Number.isFinite(rawOffX) ? rawOffX : DEFAULT_OFFSET_X;
    const storedOffY = Number.isFinite(rawOffY) ? rawOffY : DEFAULT_OFFSET_Y;
    const widthForCalc = floatingButtonWidth || DEFAULT_BTN_SIZE;
    const heightForCalc = floatingButtonHeight || DEFAULT_BTN_SIZE;
    const anchorXRaw =
      safe.floatingButtonAnchorX === "right" ? "right" : "left";
    const anchorYRaw =
      safe.floatingButtonAnchorY === "bottom" ? "bottom" : "top";
    const leftFromAnchor =
      anchorXRaw === "left"
        ? storedOffX
        : Math.max(0, window.innerWidth - storedOffX - widthForCalc);
    const topFromAnchor =
      anchorYRaw === "top"
        ? storedOffY
        : Math.max(0, window.innerHeight - storedOffY - heightForCalc);
    floatingButtonAnchor = "custom";
    floatingButtonAnchorX = "left";
    floatingButtonAnchorY = "top";
    floatingButtonOffsetX = Math.min(
      Math.max(leftFromAnchor, 0),
      Math.max(0, window.innerWidth - widthForCalc),
    );
    floatingButtonOffsetY = Math.min(
      Math.max(topFromAnchor, 0),
      Math.max(0, window.innerHeight - heightForCalc),
    );
    ctrlAltLinkSaveEnabled = safe.ctrlAltLinkSaveEnabled === true;
    linkSaveModifierCombo = normalizeLinkSaveTriggerValue(
      safe.linkSaveModifierCombo,
    );
    if (isLinkSaveModifierCombo(linkSaveModifierCombo)) {
      linkSaveModifierState = getLinkSaveModifierState(linkSaveModifierCombo);
      linkSaveKeyboardKey = "";
    } else {
      linkSaveModifierState = null;
      linkSaveKeyboardKey = normalizeLinkSaveKeyboardKey(linkSaveModifierCombo);
    }
    linkSaveMouseButton = normalizeLinkSaveMouseButton(
      safe.linkSaveMouseButton,
    );
    const bundleModifierRaw = typeof safe.linkSaveBundleModifier === "string" ? safe.linkSaveBundleModifier.trim() : "";
    linkSaveBundleModifier = bundleModifierRaw ? normalizeLinkSaveTriggerValue(bundleModifierRaw) : "";
    if (linkSaveBundleModifier) {
      if (isLinkSaveModifierCombo(linkSaveBundleModifier)) {
        linkSaveBundleModifierState = getLinkSaveModifierState(linkSaveBundleModifier);
        linkSaveBundleKeyboardKey = "";
      } else {
        linkSaveBundleModifierState = null;
        linkSaveBundleKeyboardKey = normalizeLinkSaveKeyboardKey(linkSaveBundleModifier);
      }
    } else {
      linkSaveBundleModifierState = null;
      linkSaveBundleKeyboardKey = "";
    }
    linkSaveBundleDuration =
      typeof safe.linkSaveBundleDuration === "number" && safe.linkSaveBundleDuration >= 0
        ? Math.round(safe.linkSaveBundleDuration)
        : 2;
    const directModifierRaw = typeof safe.linkSaveDirectModifier === "string" ? safe.linkSaveDirectModifier.trim() : "";
    linkSaveDirectModifier = directModifierRaw ? normalizeLinkSaveTriggerValue(directModifierRaw) : "";
    if (linkSaveDirectModifier) {
      if (isLinkSaveModifierCombo(linkSaveDirectModifier)) {
        linkSaveDirectModifierState = getLinkSaveModifierState(linkSaveDirectModifier);
        linkSaveDirectKeyboardKey = "";
      } else {
        linkSaveDirectModifierState = null;
        linkSaveDirectKeyboardKey = normalizeLinkSaveKeyboardKey(linkSaveDirectModifier);
      }
    } else {
      linkSaveDirectModifierState = null;
      linkSaveDirectKeyboardKey = "";
    }
    const activeCategoryModifierRaw = typeof safe.linkSaveActiveCategoryModifier === "string" ? safe.linkSaveActiveCategoryModifier.trim() : "";
    linkSaveActiveCategoryModifier = activeCategoryModifierRaw ? normalizeLinkSaveTriggerValue(activeCategoryModifierRaw) : "";
    if (linkSaveActiveCategoryModifier) {
      if (isLinkSaveModifierCombo(linkSaveActiveCategoryModifier)) {
        linkSaveActiveCategoryModifierState = getLinkSaveModifierState(linkSaveActiveCategoryModifier);
        linkSaveActiveCategoryKeyboardKey = "";
      } else {
        linkSaveActiveCategoryModifierState = null;
        linkSaveActiveCategoryKeyboardKey = normalizeLinkSaveKeyboardKey(linkSaveActiveCategoryModifier);
      }
    } else {
      linkSaveActiveCategoryModifierState = null;
      linkSaveActiveCategoryKeyboardKey = "";
    }
    linkSavePromptCategoryEnabled =
      safe.linkSavePromptCategoryEnabled === true;

    linkSavePinnedCategoryIds = normalizeLinkSavePinnedCategoryIds(
      safe.linkSavePinnedCategoryIds,
    );
    floatingNextUpLabel = safe.floatingNextUpLabel !== false;
    themePreset = THEME_PRESETS.includes(
      (safe.themePreset || "").trim().toLowerCase(),
    )
      ? safe.themePreset.trim().toLowerCase()
      : "classic";
    themeColors = themePreset === "custom" && safe.customThemeColors
      ? resolveCustomThemeColors(safe.customThemeColors)
      : resolveThemeColors(themePreset);
    applyNextUpStyles();
    const iconFile =
      typeof safe.floatingButtonIcon === "string"
        ? safe.floatingButtonIcon.trim()
        : "";
    customIcons = Array.isArray(safe.floatingButtonCustomIcons)
      ? safe.floatingButtonCustomIcons
      : [];
    floatingButtonDomainExceptions = normalizeDomainExceptionList(
      safe.floatingButtonDomainExceptions,
    );
    if (!iconFile) {
      floatingIconPath = DEFAULT_ICON_FILE;
    } else if (iconFile.startsWith("data:")) {
      floatingIconPath = iconFile;
    } else if (iconFile.startsWith("custom:")) {
      floatingIconPath = iconFile;
    } else if (iconFile.startsWith("icons/")) {
      floatingIconPath = iconFile;
    } else {
      floatingIconPath = `icons/${iconFile}`;
    }
    if (floatingIconPath.startsWith("custom:")) {
      const key = floatingIconPath.slice("custom:".length);
      const exists = customIcons.some((c) => c && c.id === key);
      if (!exists) {
        floatingIconPath = DEFAULT_ICON_FILE;
      }
    }
    youtubeAutoNext = safe.youtubeAutoNext === true;
    youtubeAutoRandom = safe.youtubeAutoRandom === true;
    deleteAfterOpenActive = safe.deleteAfterOpen === true;
    rediscoverEnabled = (safe.rediscoverEnabled === true);
    const rBtn = document.getElementById("__pocket_rediscover_btn");
    if (rBtn) updateRediscoverBtnUI(rBtn, rediscoverEnabled);
    globalLinkInBackgroundTabActive = safe.globalLinkInBackgroundTab !== false;
    const mw = Number.parseInt(safe.floatingNextUpMaxWidth, 10);
    floatingNextUpMaxWidth = Number.isFinite(mw) && mw >= 50 ? mw : 220;

    const fsize = Number.parseInt(safe.floatingSubButtonSize, 10);
    floatingSubButtonSize = Number.isFinite(fsize) && fsize >= 20 && fsize <= 100 ? fsize : 32;
    _gestureRuntimeEnabled = safe.gestureEnabled === true || safe.categoryPickerMouseGesture === true;
    
    if (safe.floatingButtonVisibilityMode) {
      floatingButtonVisibilityMode = ["hover", "always", "scroll", "click", "longpress"].includes(safe.floatingButtonVisibilityMode)
        ? safe.floatingButtonVisibilityMode
        : "hover";
    }
    if (safe.miniCategoryTriggerDirection) {
      miniCategoryTriggerDirection = ["right", "left", "up", "down"].includes(safe.miniCategoryTriggerDirection)
        ? safe.miniCategoryTriggerDirection
        : "right";
    }
    if (safe.miniCategoryPanelLayout) {
      miniCategoryPanelLayout = ["list", "grid", "horizontal", "radial", "wheel"].includes(safe.miniCategoryPanelLayout)
        ? safe.miniCategoryPanelLayout
        : "list";
    }
    if (Number.isFinite(safe.button5ScrollerMode) && (safe.button5ScrollerMode === 0 || safe.button5ScrollerMode === 1)) {
      button5ScrollerMode = safe.button5ScrollerMode;
    }
    log("[Settings] Applied visibility mode:", floatingButtonVisibilityMode);
    if (floatingButtonVisibilityMode !== "longpress") {
      cancelLongPressTracking(true);
      temporaryButtonPosition = null;
    }

    if (nextUpTextEl) {
      nextUpTextEl.style.maxWidth = floatingNextUpMaxWidth + "px";
    }
    updateButtonSize();
    updateSubButtonsSize();
  }

  function updateSubButtonsSize() {
    const subSize = floatingSubButtonSize;
    const subFont = Math.max(10, Math.round(subSize * 0.45));
    const subScale = subSize / 48;
    const R_ARC = 160;
    function ap(deg) {
      const rad = deg * Math.PI / 180;
      return { x: Math.round(R_ARC * Math.cos(rad) * subScale), y: Math.round(-R_ARC * Math.sin(rad) * subScale) };
    }
    const pts = { S: ap(180), D: ap(162), B: ap(144), A: ap(126), G: ap(108), eye: ap(90), star: ap(72), P: ap(54), N: ap(36), X: ap(18), R: ap(0) };

    const sBtn = document.getElementById("__pocket_save_btn");
    if (sBtn) {
      sBtn.style.transform = `translate(-50%, -50%) translate(${pts.S.x}px, ${pts.S.y}px)`;
      sBtn.style.width = `${subSize}px`;
      sBtn.style.height = `${subSize}px`;
      sBtn.style.fontSize = `${subFont}px`;
    }
    const dBtn = document.getElementById("__pocket_delete_after_open_btn");
    if (dBtn) {
      dBtn.style.transform = `translate(-50%, -50%) translate(${pts.D.x}px, ${pts.D.y}px)`;
      dBtn.style.width = `${subSize}px`;
      dBtn.style.height = `${subSize}px`;
      dBtn.style.fontSize = `${subFont}px`;
    }
    const bBtn = document.getElementById("__pocket_bg_tab_btn");
    if (bBtn) {
      bBtn.style.transform = `translate(-50%, -50%) translate(${pts.B.x}px, ${pts.B.y}px)`;
      bBtn.style.width = `${subSize}px`;
      bBtn.style.height = `${subSize}px`;
      bBtn.style.fontSize = `${subFont}px`;
    }
    const aBtn = document.getElementById("__pocket_auto_next_btn");
    if (aBtn) {
      aBtn.style.transform = `translate(-50%, -50%) translate(${pts.A.x}px, ${pts.A.y}px)`;
      aBtn.style.width = `${subSize}px`;
      aBtn.style.height = `${subSize}px`;
      aBtn.style.fontSize = `${subFont}px`;
    }
    const gBtn = document.getElementById("__pocket_gesture_btn");
    if (gBtn) {
      gBtn.style.transform = `translate(-50%, -50%) translate(${pts.G.x}px, ${pts.G.y}px)`;
      gBtn.style.width = `${subSize}px`;
      gBtn.style.height = `${subSize}px`;
      gBtn.style.fontSize = `${subFont}px`;
    }
    const eyeBtn = document.getElementById("__pocket_eye_toggle_btn");
    if (eyeBtn) {
      eyeBtn.style.transform = `translate(-50%, -50%) translate(${pts.eye.x}px, ${pts.eye.y}px)`;
      eyeBtn.style.width = `${subSize}px`;
      eyeBtn.style.height = `${subSize}px`;
      eyeBtn.style.fontSize = `${Math.max(9, Math.round(subFont * 0.75))}px`;
    }
    const fBtn = document.getElementById("__pocket_favorite_save_btn");
    if (fBtn) {
      fBtn.style.transform = `translate(-50%, -50%) translate(${pts.star.x}px, ${pts.star.y}px)`;
      fBtn.style.width = `${subSize}px`;
      fBtn.style.height = `${subSize}px`;
      fBtn.style.fontSize = `${subFont}px`;
    }
    const pBtn = document.getElementById("__pocket_settings_btn");
    if (pBtn) {
      pBtn.style.transform = `translate(-50%, -50%) translate(${pts.P.x}px, ${pts.P.y}px)`;
      pBtn.style.width = `${subSize}px`;
      pBtn.style.height = `${subSize}px`;
      pBtn.style.fontSize = `${subFont}px`;
    }
    const nBtn = document.getElementById("__pocket_notes_btn");
    if (nBtn) {
      nBtn.style.transform = `translate(-50%, -50%) translate(${pts.N.x}px, ${pts.N.y}px)`;
      nBtn.style.width = `${subSize}px`;
      nBtn.style.height = `${subSize}px`;
      nBtn.style.fontSize = `${subFont}px`;
    }
    const xBtn = document.getElementById("__pocket_dismiss_btn");
    if (xBtn) {
      xBtn.style.transform = `translate(-50%, -50%) translate(${pts.X.x}px, ${pts.X.y}px)`;
      xBtn.style.width = `${subSize}px`;
      xBtn.style.height = `${subSize}px`;
      xBtn.style.fontSize = `${subFont}px`;
    }
    const rBtn = document.getElementById("__pocket_rediscover_btn");
    if (rBtn) {
      rBtn.style.transform = `translate(-50%, -50%) translate(${pts.R.x}px, ${pts.R.y}px)`;
      rBtn.style.width = `${subSize}px`;
      rBtn.style.height = `${subSize}px`;
      rBtn.style.fontSize = `${subFont}px`;
    }
  }

  function handleSelectionChange() {
    if (!floatingAiSelectionEnabled) {
      hideAiSelectionContainer();
      return;
    }
    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    if (!text) {
      hideAiSelectionContainer();
      return;
    }
    
    lastSelectedText = text;
    
    try {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      if (rect.width === 0 || rect.height === 0) {
        hideAiSelectionContainer();
        return;
      }
      
      showAiSelectionContainer(rect);
    } catch (e) {
      hideAiSelectionContainer();
    }
  }

  function showAiSelectionContainer(rect) {
    if (!aiSelectionContainer) {
      aiSelectionContainer = document.createElement("div");
      aiSelectionContainer.id = "__lp_ai_selection_container";
      aiSelectionContainer.style.cssText = `
        position: fixed;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s ease;
        opacity: 0;
        pointer-events: auto;
      `;

      const aiBtn = document.createElement("button");
      aiBtn.textContent = "Ai";
      aiBtn.title = "Hantar ke AI (Tekan Alt+W jika sidebar tidak terbuka)";
      aiBtn.style.cssText = `
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: rgba(59, 130, 246, 0.95);
        color: white;
        border: 2px solid rgba(255, 255, 255, 0.4);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        font-family: 'Orbitron', 'Rajdhani', sans-serif;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin: 0;
        transition: transform 0.2s ease, background 0.2s ease;
      `;

      aiBtn.addEventListener("mouseenter", () => { aiBtn.style.transform = "scale(1.1)"; aiBtn.style.background = "#2563eb"; });
      aiBtn.addEventListener("mouseleave", () => { aiBtn.style.transform = "scale(1)"; aiBtn.style.background = "rgba(59, 130, 246, 0.95)"; });
      
      aiBtn.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        const text = lastSelectedText;
        if (text) {
          lpApi.runtime.sendMessage({ type: "open-ai-sidebar-with-prompt", prompt: text })
            .catch(() => {});
          
          aiBtn.textContent = "✓";
          aiBtn.style.background = "#10b981";
          setTimeout(() => { 
            aiBtn.textContent = "Ai"; 
            aiBtn.style.background = "rgba(59, 130, 246, 0.95)";
          }, 1000);
        }
      });

      aiSelectionContainer.appendChild(aiBtn);
      document.body.appendChild(aiSelectionContainer);
    }
    
    const containerWidth = 34; 
    const containerHeight = 34;
    const spacing = 12;
    
    let top = rect.bottom + spacing;
    let left = rect.left + (rect.width / 2) - (containerWidth / 2);
    
    if (top + containerHeight > window.innerHeight - spacing) {
      top = rect.top - containerHeight - spacing;
    }
    
    left = Math.max(spacing, Math.min(left, window.innerWidth - containerWidth - spacing));
    
    aiSelectionContainer.style.top = top + "px";
    aiSelectionContainer.style.left = left + "px";
    aiSelectionContainer.style.opacity = "1";
    aiSelectionContainer.style.transform = "scale(1)";
    aiSelectionContainer.style.display = "flex";
  }

  function hideAiSelectionContainer() {
    if (aiSelectionContainer) {
      aiSelectionContainer.style.opacity = "0";
      aiSelectionContainer.style.transform = "scale(0.8)";
      setTimeout(() => {
        if (aiSelectionContainer && aiSelectionContainer.style.opacity === "0") {
          aiSelectionContainer.style.display = "none";
        }
      }, 200);
    }
  }

  function handleScrollVisibility() {
    log("[Scroll] Called, mode:", floatingButtonVisibilityMode, "suppressed:", floatingSuppressed);
    if (floatingButtonVisibilityMode !== "scroll" || floatingSuppressed) {
      log("[Scroll] Exiting early");
      return;
    }
    const currentScrollY = window.scrollY || 0;
    const diff = currentScrollY - lastScrollY;
    
    log("[Scroll] current:", currentScrollY, "last:", lastScrollY, "diff:", diff, "visible:", isVisible);
    
    if (Math.abs(diff) > 10) { // sensitivity threshold
      if (diff < 0) {
        // Scrolling UP
        if (!isVisible) {
          log("[Scroll] Showing pocket on scroll up");
          window.showPocket();
        }
      } else {
        // Scrolling DOWN
        if (isVisible) {
          log("[Scroll] Hiding pocket on scroll down");
          window.hidePocket();
        }
      }
    }
    lastScrollY = currentScrollY;
  }

  function refreshFloatingIcon() {
    if (!buttonImg) return;
    try {
      const targetSrc = resolveIconSrc();
      if (buttonImg.src !== targetSrc) {
        buttonImg.src = targetSrc;
      }
    } catch (err) {
      log("[Floating] Failed to refresh icon:", err);
    }
  }

  function showLinkToast(message) {
    try {
      const existing = document.getElementById("__pocket_link_toast");
      if (existing) existing.remove();
      const existingBundle = document.getElementById("__pocket_bundle_toast");
      if (existingBundle) existingBundle.remove();
      const toast = document.createElement("div");
      toast.id = "__pocket_link_toast";
      toast.textContent = message;
      toast.style.position = "fixed";
      toast.style.right = "14px";
      toast.style.bottom = "14px";
      toast.style.zIndex = "2147483646";
      toast.style.background = "rgba(24,24,24,0.92)";
      toast.style.color = "#f8f8f8";
      toast.style.padding = "10px 12px";
      toast.style.borderRadius = "10px";
      toast.style.fontSize = "13px";
      toast.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
      toast.style.pointerEvents = "none";
      toast.style.opacity = "0";
      toast.style.transition = "opacity 160ms ease";
      document.body.appendChild(toast);
      requestAnimationFrame(() => {
        toast.style.opacity = "1";
      });
      setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 200);
      }, 1400);
    } catch (err) {
      // ignore
    }
  }

  // Counter untuk track bilangan link yang disimpan dalam sesi bundle semasa
  // Track per kategori — setiap kategori ada counter sendiri
  const _savedLinkSessionCountByCategory = new Map();
  const _savedLinkSessionResetTimerByCategory = new Map();
  const SAVED_LINK_SESSION_RESET_MS = 5000; // Reset counter selepas 5 saat tanpa save baru

  function showSavedLinkToast(categoryName, categoryId) {
    try {
      // Kemaskini counter sesi per kategori
      const key = categoryId || categoryName || "__none__";
      const prev = _savedLinkSessionCountByCategory.get(key) || 0;
      const sessionCount = prev + 1;
      _savedLinkSessionCountByCategory.set(key, sessionCount);

      // Reset timer untuk kategori ini
      const existingTimer = _savedLinkSessionResetTimerByCategory.get(key);
      if (existingTimer) clearTimeout(existingTimer);
      _savedLinkSessionResetTimerByCategory.set(key, setTimeout(() => {
        _savedLinkSessionCountByCategory.delete(key);
        _savedLinkSessionResetTimerByCategory.delete(key);
      }, SAVED_LINK_SESSION_RESET_MS));

      // Buang mana-mana toast lama (link toast dan bundle toast)
      const existing = document.getElementById("__pocket_link_toast");
      if (existing) existing.remove();
      const existingBundle = document.getElementById("__pocket_bundle_toast");
      if (existingBundle) existingBundle.remove();
      const hue = stringToHue(categoryId || categoryName || "");
      const color = "hsl(" + hue + ", 70%, 58%)";
      const toast = document.createElement("div");
      toast.id = "__pocket_link_toast";
      toast.style.position = "fixed";
      toast.style.right = "16px";
      toast.style.bottom = "16px";
      toast.style.zIndex = "2147483647";
      toast.style.background = "linear-gradient(135deg, rgba(22,22,28,0.95) 0%, rgba(30,30,40,0.95) 100%)";
      toast.style.borderLeft = "4px solid " + color;
      toast.style.borderRadius = "12px";
      toast.style.padding = "14px 20px";
      toast.style.boxShadow = "0 12px 36px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)";
      toast.style.pointerEvents = "none";
      toast.style.display = "flex";
      toast.style.alignItems = "center";
      toast.style.gap = "12px";
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      toast.style.transition = "opacity 240ms ease, transform 240ms ease";
      const icon = document.createElement("span");
      icon.textContent = "\u2713";
      icon.style.display = "flex";
      icon.style.alignItems = "center";
      icon.style.justifyContent = "center";
      icon.style.width = "30px";
      icon.style.height = "30px";
      icon.style.borderRadius = "50%";
      icon.style.background = color;
      icon.style.color = "#fff";
      icon.style.fontSize = "16px";
      icon.style.fontWeight = "700";
      icon.style.flexShrink = "0";
      toast.appendChild(icon);
      const innerWrap = document.createElement("div");
      const msgLine = document.createElement("div");
      msgLine.textContent = sessionCount > 1 ? sessionCount + " links disimpan" : "Disimpan";
      msgLine.style.color = "rgba(255,255,255,0.8)";
      msgLine.style.fontSize = "13px";
      msgLine.style.fontWeight = "500";
      innerWrap.appendChild(msgLine);
      const nameLine = document.createElement("div");
      nameLine.textContent = categoryName || "Local Pocket";
      nameLine.style.color = color;
      nameLine.style.fontSize = "18px";
      nameLine.style.fontWeight = "700";
      nameLine.style.marginTop = "2px";
      innerWrap.appendChild(nameLine);
      toast.appendChild(innerWrap);
      document.body.appendChild(toast);
      requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateY(0)";
      });
      setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(6px)";
        setTimeout(() => toast.remove(), 260);
      }, 2500);
    } catch (err) {}
  }

  // ── Rediscover in-page toast ────────────────────────────────────────────────
  function _hexToRgba(hex, alpha) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) hex = "#8b5cf6";
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }

  function showRediscoverToast(title, url, excerpt, dismissMs, color, thumbnailUrl, toastRight, toastBottom, itemId, categoryId, categoryName, itemIndex, totalItems) {
    try {
      color = typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? color : "#8b5cf6";
      var c = color;
      const initRight = typeof toastRight === "number" ? toastRight : 16;
      const initBottom = typeof toastBottom === "number" ? toastBottom : 16;
      const existing = document.getElementById("__pocket_rediscover_toast");
      if (existing) existing.remove();

      const toast = document.createElement("div");
      toast.id = "__pocket_rediscover_toast";
      Object.assign(toast.style, {
        position: "fixed",
        right: initRight + "px",
        bottom: initBottom + "px",
        zIndex: "2147483647",
        background: "linear-gradient(135deg, rgba(18,18,26,0.97) 0%, rgba(28,28,42,0.97) 100%)",
        border: "1px solid " + _hexToRgba(c, 0.35),
        borderLeft: "4px solid " + c,
        borderRadius: "14px",
        padding: "14px 16px",
        boxShadow: "0 16px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.05)",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        maxWidth: "320px",
        minWidth: "240px",
        opacity: "0",
        transform: "translateY(12px)",
        transition: "opacity 240ms ease, transform 240ms ease",
        fontFamily: "system-ui, -apple-system, sans-serif",
        cursor: "default",
        pointerEvents: "auto",
      });

      // Header row: icon + label
      // Draggable position state
      let _dragRight = initRight;
      let _dragBottom = initBottom;

      const headerRow = document.createElement("div");
      Object.assign(headerRow.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        cursor: "grab",
        userSelect: "none",
      });

      const badge = document.createElement("span");
      badge.textContent = "✦ Rediscover";
      Object.assign(badge.style, {
        fontSize: "10px",
        fontWeight: "700",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: _hexToRgba(c, 0.85),
        padding: "2px 7px",
        background: _hexToRgba(c, 0.18),
        borderRadius: "99px",
        border: "1px solid " + _hexToRgba(c, 0.3),
      });



      // Interval shortcut buttons
      const intervalShortcuts = document.createElement("div");
      Object.assign(intervalShortcuts.style, {
        display: "flex",
        alignItems: "center",
        gap: "3px",
        marginLeft: "2px",
      });

      const intervalPresets = [
        { label: "20s", secs: 20 },
        { label: "1m",  secs: 60 },
        { label: "5m",  secs: 300 },
        { label: "10m", secs: 600 },
      ];

      // Load custom preset values from storage (if any)
      let _loadedPresets = false;
      function _loadPresetsFromStorage(cb) {
        try {
          lpApi.storage.local.get(SETTINGS_KEY).then(function (data) {
            var s = (data && data[SETTINGS_KEY]) ? data[SETTINGS_KEY] : {};
            var saved = s.rediscoverIntervalPresets;
            if (Array.isArray(saved) && saved.length === intervalPresets.length) {
              saved.forEach(function (val, i) {
                if (typeof val === "number" && val > 0) {
                  intervalPresets[i].secs = val;
                  intervalPresets[i].label = _secsToLabel(val);
                }
              });
            }
            if (cb) cb();
          }).catch(function () { if (cb) cb(); });
        } catch (_) { if (cb) cb(); }
      }

      function _savePresetsToStorage() {
        try {
          lpApi.storage.local.get(SETTINGS_KEY).then(function (data) {
            var s = (data && data[SETTINGS_KEY]) ? JSON.parse(JSON.stringify(data[SETTINGS_KEY])) : {};
            s.rediscoverIntervalPresets = intervalPresets.map(function (p) { return p.secs; });
            lpApi.storage.local.set({ [SETTINGS_KEY]: s }).catch(function () {});
          }).catch(function () {});
        } catch (_) {}
      }

      function _secsToLabel(secs) {
        if (secs < 60) return secs + "s";
        if (secs < 3600 && secs % 60 === 0) return (secs / 60) + "m";
        if (secs >= 3600 && secs % 3600 === 0) return (secs / 3600) + "j";
        if (secs >= 60) return (secs / 60).toFixed(1) + "m";
        return secs + "s";
      }

      function _labelToSecs(str) {
        str = str.trim().toLowerCase();
        var num = parseFloat(str);
        if (isNaN(num) || num <= 0) return 0;
        if (str.endsWith("j") || str.endsWith("h")) return Math.round(num * 3600);
        if (str.endsWith("m")) return Math.round(num * 60);
        return Math.round(num);
      }

      // Active edit popup reference (only one at a time)
      var _activeEditPopup = null;

      function _openEditPopup(btn, preset, idx) {
        // Close existing
        if (_activeEditPopup) {
          try { _activeEditPopup.remove(); } catch (_) {}
          _activeEditPopup = null;
        }

        const popup = document.createElement("div");
        _activeEditPopup = popup;
        Object.assign(popup.style, {
          position: "fixed",
          zIndex: "2147483648",
          background: "linear-gradient(135deg, rgba(18,18,26,0.98) 0%, rgba(28,28,42,0.98) 100%)",
          border: "1px solid " + _hexToRgba(c, 0.6),
          borderRadius: "10px",
          padding: "10px 12px",
          boxShadow: "0 12px 36px rgba(0,0,0,0.7)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          minWidth: "180px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        });

        // Title
        const popTitle = document.createElement("div");
        popTitle.textContent = "Edit butang \"" + preset.label + "\"";
        Object.assign(popTitle.style, {
          fontSize: "10px",
          fontWeight: "700",
          color: "#fff",
          marginBottom: "2px",
        });
        popup.appendChild(popTitle);

        // Input row
        const inputRow = document.createElement("div");
        Object.assign(inputRow.style, { display: "flex", gap: "6px", alignItems: "center" });

        const inp = document.createElement("input");
        inp.type = "text";
        inp.value = preset.label;
        inp.placeholder = "cth: 30s, 2m, 1j";
        Object.assign(inp.style, {
          flex: "1",
          fontSize: "12px",
          fontWeight: "700",
          padding: "4px 8px",
          borderRadius: "6px",
          border: "1px solid " + _hexToRgba(c, 0.5),
          background: "rgba(255,255,255,0.07)",
          color: "#fff",
          outline: "none",
          width: "0",
        });

        // hint
        const hint = document.createElement("div");
        hint.textContent = "s = saat  •  m = minit  •  j = jam";
        Object.assign(hint.style, {
          fontSize: "9px",
          color: "rgba(200,200,220,0.5)",
        });

        const savePopBtn = document.createElement("button");
        savePopBtn.textContent = "✓";
        Object.assign(savePopBtn.style, {
          fontSize: "13px",
          fontWeight: "700",
          padding: "3px 8px",
          borderRadius: "6px",
          border: "1px solid " + _hexToRgba(c, 0.7),
          background: _hexToRgba(c, 0.45),
          color: "#fff",
          cursor: "pointer",
        });

        inputRow.appendChild(inp);
        inputRow.appendChild(savePopBtn);
        popup.appendChild(inputRow);
        popup.appendChild(hint);

        document.body.appendChild(popup);

        // Position popup above/below the button
        var btnRect = btn.getBoundingClientRect();
        var popW = 200;
        var popH = 90;
        var left = btnRect.left;
        var top = btnRect.bottom + 6;
        if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
        if (top + popH > window.innerHeight - 8) top = btnRect.top - popH - 6;
        popup.style.left = left + "px";
        popup.style.top = top + "px";

        inp.focus();
        inp.select();

        function _applyEdit() {
          var newSecs = _labelToSecs(inp.value);
          if (newSecs <= 0) {
            inp.style.border = "1px solid rgba(239,68,68,0.8)";
            inp.focus();
            return;
          }
          preset.secs = newSecs;
          preset.label = _secsToLabel(newSecs);
          btn.textContent = preset.label;
          btn.title = "Klik: set interval  •  Klik kanan: edit nilai";
          _savePresetsToStorage();
          try { popup.remove(); } catch (_) {}
          _activeEditPopup = null;
          _applyActiveStates();
        }

        savePopBtn.addEventListener("click", function (e) { e.stopPropagation(); _applyEdit(); });
        inp.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { e.preventDefault(); _applyEdit(); }
          if (e.key === "Escape") { try { popup.remove(); } catch (_) {} _activeEditPopup = null; }
        });

        // Close on outside click
        setTimeout(function () {
          function _outsideClick(e) {
            if (!popup.contains(e.target) && e.target !== btn) {
              try { popup.remove(); } catch (_) {}
              _activeEditPopup = null;
              document.removeEventListener("mousedown", _outsideClick, true);
            }
          }
          document.addEventListener("mousedown", _outsideClick, true);
        }, 50);
      }

      // Build buttons — after loading saved presets
      var _currentIntervalSecs = 0;
      var _intervalBtns = [];

      function _applyActiveStates() {
        _intervalBtns.forEach(function (item) {
          var isActive = _currentIntervalSecs > 0 && item.preset.secs === _currentIntervalSecs;
          item.btn.dataset.active = isActive ? "1" : "";
          if (isActive) {
            item.btn.style.background = _hexToRgba(c, 0.65);
            item.btn.style.borderColor = c;
            item.btn.style.boxShadow = "0 0 6px " + _hexToRgba(c, 0.5);
          } else {
            item.btn.style.background = _hexToRgba(c, 0.18);
            item.btn.style.borderColor = _hexToRgba(c, 0.4);
            item.btn.style.boxShadow = "none";
          }
        });
      }

      function _buildIntervalButtons(currentSecs) {
        _currentIntervalSecs = typeof currentSecs === "number" ? currentSecs : _currentIntervalSecs;
        intervalShortcuts.innerHTML = "";
        _intervalBtns = [];
        intervalPresets.forEach(function (preset, idx) {
          const btn = document.createElement("button");
          btn.textContent = preset.label;
          btn.title = "Klik: set interval  •  Klik kanan: edit nilai";
          Object.assign(btn.style, {
            fontSize: "9px",
            fontWeight: "700",
            padding: "2px 5px",
            borderRadius: "5px",
            border: "1px solid " + _hexToRgba(c, 0.4),
            background: _hexToRgba(c, 0.18),
            color: "#fff",
            cursor: "pointer",
            lineHeight: "1.3",
            transition: "background 120ms, border-color 120ms, box-shadow 120ms",
          });
          _intervalBtns.push({ btn: btn, preset: preset });
          btn.addEventListener("mouseenter", function () {
            if (btn.dataset.active === "1") return;
            btn.style.background = _hexToRgba(c, 0.45);
            btn.style.borderColor = _hexToRgba(c, 0.8);
          });
          btn.addEventListener("mouseleave", function () {
            if (btn.dataset.active === "1") return;
            btn.style.background = _hexToRgba(c, 0.18);
            btn.style.borderColor = _hexToRgba(c, 0.4);
          });
          btn.addEventListener("click", function (e) {
            e.stopPropagation();
            _currentIntervalSecs = preset.secs;
            saveRediscoverSetting("rediscoverInterval", preset.secs);
            _applyActiveStates();
          });
          btn.addEventListener("contextmenu", function (e) {
            e.preventDefault();
            e.stopPropagation();
            _openEditPopup(btn, preset, idx);
          });
          intervalShortcuts.appendChild(btn);
        });
        _applyActiveStates();
      }

      // Load presets then read current interval to highlight active button
      _loadPresetsFromStorage(function () {
        try {
          lpApi.storage.local.get(SETTINGS_KEY).then(function (data) {
            var s = (data && data[SETTINGS_KEY]) ? data[SETTINGS_KEY] : {};
            var cur = typeof s.rediscoverInterval === "number" ? s.rediscoverInterval : 0;
            _buildIntervalButtons(cur);
          }).catch(function () { _buildIntervalButtons(0); });
        } catch (_) { _buildIntervalButtons(0); }
      });

      const closeBtn = document.createElement("button");
      closeBtn.textContent = "✕";
      Object.assign(closeBtn.style, {
        background: "none",
        border: "none",
        color: "rgba(255,255,255,0.4)",
        fontSize: "13px",
        cursor: "pointer",
        padding: "0 2px",
        lineHeight: "1",
      });
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toast.style.opacity = "0";
        toast.style.transform = "translateY(8px)";
        setTimeout(() => toast.remove(), 240);
      });

      headerRow.appendChild(badge);
      headerRow.appendChild(intervalShortcuts);
      headerRow.appendChild(closeBtn);
      toast.appendChild(headerRow);

      // Content row: thumbnail + text
      const contentRow = document.createElement("div");
      Object.assign(contentRow.style, {
        display: "flex",
        gap: "10px",
        alignItems: "flex-start",
      });

      // Enlarged thumbnail preview for rediscover toast
      const _rdEnlargedEl = document.createElement("div");
      Object.assign(_rdEnlargedEl.style, {
        position: "fixed",
        zIndex: "2147483650",
        display: "none",
        pointerEvents: "none",
        background: "#000",
        border: "2px solid rgba(255, 214, 51, 0.6)",
        borderRadius: "12px",
        boxShadow: "0 20px 50px rgba(0,0,0,0.6)",
        overflow: "hidden",
        width: "480px",
        height: "270px",
        opacity: "0",
        transition: "opacity 150ms ease, transform 150ms ease",
        transform: "scale(0.95)",
      });
      const _rdEnlargedImg = document.createElement("img");
      _rdEnlargedImg.style.width = "100%";
      _rdEnlargedImg.style.height = "100%";
      _rdEnlargedImg.style.objectFit = "contain";
      _rdEnlargedEl.appendChild(_rdEnlargedImg);
      document.body.appendChild(_rdEnlargedEl);
      let _rdEnlargedTimer = null;

      function _rdShowEnlarged(src, e) {
        if (!src) return;
        if (_rdEnlargedTimer) clearTimeout(_rdEnlargedTimer);
        _rdEnlargedImg.src = src;
        _rdEnlargedEl.style.display = "block";
        const padding = 20, w = 480, h = 270;
        let left = e.clientX + 25;
        let top = e.clientY - (h / 2);
        if (left + w + padding > window.innerWidth) left = e.clientX - w - 25;
        if (top + h + padding > window.innerHeight) top = window.innerHeight - h - padding;
        if (top < padding) top = padding;
        _rdEnlargedEl.style.left = left + "px";
        _rdEnlargedEl.style.top = top + "px";
        requestAnimationFrame(() => {
          _rdEnlargedEl.style.opacity = "1";
          _rdEnlargedEl.style.transform = "scale(1)";
        });
      }

      function _rdHideEnlarged() {
        _rdEnlargedEl.style.opacity = "0";
        _rdEnlargedEl.style.transform = "scale(0.95)";
        _rdEnlargedTimer = setTimeout(() => {
          _rdEnlargedEl.style.display = "none";
          _rdEnlargedImg.src = "";
        }, 150);
      }

      if (thumbnailUrl) {
        const img = document.createElement("img");
        img.src = thumbnailUrl;
        img.alt = "";
        img.onerror = function () { this.style.display = "none"; };
        Object.assign(img.style, {
          width: "48px",
          height: "48px",
          borderRadius: "8px",
          objectFit: "cover",
          flexShrink: "0",
          background: _hexToRgba(c, 0.1),
          cursor: "pointer",
        });
        img.title = "Klik kiri: buka di tab ini  |  Klik kanan: buka di background tab";
        img.addEventListener("mouseenter", (e) => { _rdShowEnlarged(thumbnailUrl, e); });
        img.addEventListener("mouseleave", () => { _rdHideEnlarged(); });
        img.addEventListener("click", (e) => {
          e.stopPropagation();
          if (url) {
            if (itemId) {
              try {
                lpApi.runtime.sendMessage({
                  type: "open-picker-item",
                  url,
                  newTab: false,
                  itemId,
                  categoryId: categoryId || "all",
                }).catch(() => { window.location.href = url; });
              } catch (_) { window.location.href = url; }
            } else {
              window.location.href = url;
            }
          }
          toast.style.opacity = "0";
          toast.style.transform = "translateY(8px)";
          setTimeout(() => toast.remove(), 240);
        });
        img.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (url) {
            try {
              lpApi.runtime.sendMessage({ type: "open-url-background-tab", url, itemId: itemId || "", categoryId: categoryId || "all" }).catch(() => {
                window.open(url, "_blank", "noopener");
              });
            } catch (_) { window.open(url, "_blank", "noopener"); }
          }
          toast.style.opacity = "0";
          toast.style.transform = "translateY(8px)";
          setTimeout(() => toast.remove(), 240);
        });
        contentRow.appendChild(img);
      }

      const textCol = document.createElement("div");
      Object.assign(textCol.style, {
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        minWidth: "0",
        flex: "1",
      });

      // Title — klik kiri buka di tab ini, klik kanan buka di background tab
      const titleEl = document.createElement("div");
      titleEl.textContent = title;
      titleEl.title = "Klik kiri: buka di tab ini  |  Klik kanan: buka di background tab";
      Object.assign(titleEl.style, {
        fontSize: "13px",
        fontWeight: "600",
        color: "#f0f0f8",
        lineHeight: "1.4",
        overflow: "hidden",
        display: "-webkit-box",
        WebkitLineClamp: "2",
        WebkitBoxOrient: "vertical",
        cursor: "pointer",
        textDecoration: "underline",
        textDecorationColor: "rgba(240,240,248,0.35)",
        textUnderlineOffset: "2px",
      });
      titleEl.addEventListener("mouseenter", function () {
        titleEl.style.color = _hexToRgba(c, 1);
        titleEl.style.textDecorationColor = _hexToRgba(c, 0.7);
      });
      titleEl.addEventListener("mouseleave", function () {
        titleEl.style.color = "#f0f0f8";
        titleEl.style.textDecorationColor = "rgba(240,240,248,0.35)";
      });
      titleEl.addEventListener("click", (e) => {
        e.stopPropagation();
        if (url) {
          if (itemId) {
            try {
              lpApi.runtime.sendMessage({
                type: "open-picker-item",
                url,
                newTab: false,
                itemId,
                categoryId: categoryId || "all",
              }).catch(() => { window.location.href = url; });
            } catch (_) { window.location.href = url; }
          } else {
            window.location.href = url;
          }
        }
        toast.style.opacity = "0";
        toast.style.transform = "translateY(8px)";
        setTimeout(() => toast.remove(), 240);
      });
      titleEl.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (url) {
          try {
            lpApi.runtime.sendMessage({ type: "open-url-background-tab", url, itemId: itemId || "", categoryId: categoryId || "all" }).catch(() => {
              window.open(url, "_blank", "noopener");
            });
          } catch (_) { window.open(url, "_blank", "noopener"); }
        }
        toast.style.opacity = "0";
        toast.style.transform = "translateY(8px)";
        setTimeout(() => toast.remove(), 240);
      });
      textCol.appendChild(titleEl);

      // Excerpt (optional)
      if (excerpt && excerpt !== url) {
        const excerptEl = document.createElement("div");
        excerptEl.textContent = excerpt.length > 100 ? excerpt.slice(0, 97) + "…" : excerpt;
        Object.assign(excerptEl.style, {
          fontSize: "11px",
          color: "rgba(200,200,220,0.6)",
          lineHeight: "1.4",
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: "2",
          WebkitBoxOrient: "vertical",
        });
        textCol.appendChild(excerptEl);
      }

      // Kategori + nombor link
      if (categoryName || (itemIndex > 0 && totalItems > 0)) {
        const metaRow = document.createElement("div");
        Object.assign(metaRow.style, {
          display: "flex",
          alignItems: "center",
          gap: "5px",
          flexWrap: "wrap",
          marginTop: "3px",
        });

        if (categoryName) {
          const catChip = document.createElement("span");
          catChip.textContent = "📁 " + categoryName;
          Object.assign(catChip.style, {
            fontSize: "10px",
            fontWeight: "700",
            color: "#ffffff",
            background: _hexToRgba(c, 0.45),
            border: "1px solid " + _hexToRgba(c, 0.7),
            borderRadius: "99px",
            padding: "2px 8px",
            maxWidth: "140px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          });
          metaRow.appendChild(catChip);
        }

        if (itemIndex > 0 && totalItems > 0) {
          const idxChip = document.createElement("span");
          idxChip.textContent = "#" + itemIndex + " / " + totalItems;
          Object.assign(idxChip.style, {
            fontSize: "10px",
            fontWeight: "700",
            color: "#ffffff",
            background: _hexToRgba(c, 0.45),
            border: "1px solid " + _hexToRgba(c, 0.7),
            borderRadius: "99px",
            padding: "2px 8px",
            whiteSpace: "nowrap",
          });
          metaRow.appendChild(idxChip);
        }

        textCol.appendChild(metaRow);
      }

      contentRow.appendChild(textCol);
      toast.appendChild(contentRow);


      let _totalMs = 0;
      let _totalPaused = 0;
      let _startAt = 0;
      let _pauseStart = 0;
      let autoDismissTimer = null;

      const settingsPanel = document.createElement("div");
      settingsPanel.style.display = "block";
      Object.assign(settingsPanel.style, {
        borderTop: "1px solid " + _hexToRgba(c, 0.2),
        paddingTop: "8px",
        marginTop: "4px",
        fontSize: "11px",
        color: "rgba(200,200,220,0.7)",
      });

      // ── Mode row ──
      const modeRow = document.createElement("div");
      Object.assign(modeRow.style, { display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" });
      const modeLabel = document.createElement("span");
      modeLabel.textContent = "Mode:";
      const seqBtn = document.createElement("button");
      seqBtn.textContent = "Urut";
      seqBtn.title = "Paling lama → termuda";
      const randBtn = document.createElement("button");
      randBtn.textContent = "Rawak";
      [seqBtn, randBtn].forEach(function (b) {
        Object.assign(b.style, {
          fontSize: "10px", fontWeight: "600", padding: "2px 8px",
          borderRadius: "4px", border: "1px solid " + _hexToRgba(c, 0.3),
          background: "transparent", color: "rgba(200,200,220,0.6)", cursor: "pointer",
        });
      });
      seqBtn.addEventListener("click", function () { saveRediscoverSetting("rediscoverMode", "sequential"); highlightSelected(modeRow, seqBtn); });
      randBtn.addEventListener("click", function () { saveRediscoverSetting("rediscoverMode", "random"); highlightSelected(modeRow, randBtn); });
      modeRow.appendChild(modeLabel);
      modeRow.appendChild(seqBtn);
      modeRow.appendChild(randBtn);
      settingsPanel.appendChild(modeRow);

      // ── Interval row ──
      const intRow = document.createElement("div");
      Object.assign(intRow.style, { display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px", flexWrap: "wrap" });
      const intLabel = document.createElement("span");
      intLabel.textContent = "Setiap:";
      const intInput = document.createElement("input");
      intInput.type = "number";
      intInput.min = "1";
      intInput.step = "any";
      Object.assign(intInput.style, {
        width: "58px", fontSize: "10px", padding: "1px 4px",
        background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
        color: "#f0f0f8", borderRadius: "4px",
      });
      const intUnit = document.createElement("select");
      Object.assign(intUnit.style, {
        fontSize: "10px", padding: "1px 2px",
        background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
        color: "#f0f0f8", borderRadius: "4px",
      });
      ["Saat", "Minit", "Jam"].forEach(function (u) {
        var opt = document.createElement("option");
        opt.value = u.toLowerCase();
        opt.textContent = u;
        intUnit.appendChild(opt);
      });
      function _readIntervalSec() {
        var v = Number.parseFloat(intInput.value);
        if (!Number.isFinite(v) || v < 1) return null;
        var u = intUnit.value;
        if (u === "jam") return Math.round(v * 3600);
        if (u === "minit") return Math.round(v * 60);
        return Math.round(v);
      }
      function _saveInterval() {
        var sec = _readIntervalSec();
        if (sec !== null) saveRediscoverSetting("rediscoverInterval", sec);
      }
      intInput.addEventListener("change", _saveInterval);
      intUnit.addEventListener("change", function () {
        var prev = this._lastUnit || "jam";
        var cur = this.value;
        if (prev !== cur) {
          var v = Number.parseFloat(intInput.value);
          if (Number.isFinite(v) && v > 0) {
            var toSec = { jam: 3600, minit: 60, saat: 1 };
            var fromSec = { jam: 1 / 3600, minit: 1 / 60, saat: 1 };
            var seconds = v * (toSec[prev] || 1);
            intInput.value = String(Math.round(seconds * (fromSec[cur] || 1) * 100) / 100);
          }
        }
        this._lastUnit = cur;
        _saveInterval();
      });
      intUnit._lastUnit = "jam";
      intRow.appendChild(intLabel);
      intRow.appendChild(intInput);
      intRow.appendChild(intUnit);
      settingsPanel.appendChild(intRow);

      // ── Color row ──
      const colorRow = document.createElement("div");
      Object.assign(colorRow.style, { display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" });
      const colorLabel = document.createElement("span");
      colorLabel.textContent = "Warna:";
      colorRow.appendChild(colorLabel);
      var colorPresets = ["#8b5cf6", "#ef4444", "#f97316", "#22c55e", "#06b6d4", "#3b82f6", "#ec4899", "#14b8a6"];
      colorPresets.forEach(function (hex) {
        var dot = document.createElement("button");
        dot.dataset.color = hex;
        Object.assign(dot.style, {
          width: "16px", height: "16px", borderRadius: "50%",
          background: hex, border: "2px solid transparent",
          cursor: "pointer", padding: "0", flexShrink: "0",
        });
        dot.addEventListener("click", function () {
          saveRediscoverSetting("rediscoverColor", hex);
          updateToastColor(hex);
          highlightSelected(colorRow, this, "2px solid rgba(255,255,255,0.5)");
        });
        colorRow.appendChild(dot);
      });
      settingsPanel.appendChild(colorRow);

      // ── Dismiss row ──
      const dismissRow = document.createElement("div");
      Object.assign(dismissRow.style, { display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px", flexWrap: "wrap" });
      const dismissLabel = document.createElement("span");
      dismissLabel.textContent = "Notification hilang selepas:";
      const dismissSelect = document.createElement("select");
      Object.assign(dismissSelect.style, {
        fontSize: "10px", padding: "1px 2px",
        background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
        color: "#f0f0f8", borderRadius: "4px",
      });
      var dismissOpts = [
        { label: "4 saat", val: 4000 },
        { label: "6 saat", val: 6000 },
        { label: "8 saat", val: 8000 },
        { label: "12 saat", val: 12000 },
        { label: "20 saat", val: 20000 },
        { label: "30 saat", val: 30000 },
        { label: "Jangan tutup", val: 0 },
      ];
      dismissOpts.forEach(function (o) {
        var opt = document.createElement("option");
        opt.value = String(o.val);
        opt.textContent = o.label;
        dismissSelect.appendChild(opt);
      });
      var _dismissRestart = false;
      dismissSelect.addEventListener("change", function () {
        var newVal = Number.parseInt(this.value, 10) || 0;
        saveRediscoverSetting("rediscoverDismissAfterMs", newVal);
        if (newVal === 0) {
          barFill.style.transform = "scaleX(1)";
          _totalMs = _INF;
          if (autoDismissTimer) { clearTimeout(autoDismissTimer); autoDismissTimer = null; }
          return;
        }
        // Transition from INF to real value
        if (_totalMs > _INF / 2) {
          _startAt = performance.now();
          _totalPaused = 0;
          _pauseStart = 0;
        }
        _totalMs = newVal;
        if (autoDismissTimer) { clearTimeout(autoDismissTimer); autoDismissTimer = null; }
        var rem = _remaining();
        autoDismissTimer = setTimeout(function () {
          if (!document.body.contains(toast)) return;
          toast.style.opacity = "0";
          toast.style.transform = "translateY(8px)";
          setTimeout(function () { try { toast.remove(); } catch (_) {} }, 240);
        }, rem);
        if (!_dismissRestart) {
          _dismissRestart = true;
          requestAnimationFrame(tickBar);
        }
      });
      dismissRow.appendChild(dismissLabel);
      dismissRow.appendChild(dismissSelect);
      settingsPanel.appendChild(dismissRow);

      // ── Helper: save setting ──
      function saveRediscoverSetting(key, val) {
        try {
          lpApi.storage.local.get(SETTINGS_KEY).then(function (data) {
            var s = (data && data[SETTINGS_KEY]) ? JSON.parse(JSON.stringify(data[SETTINGS_KEY])) : {};
            s[key] = val;
            lpApi.storage.local.set({ [SETTINGS_KEY]: s }).catch(function () {});
          }).catch(function () {});
        } catch (_) {}
      }

      // ── Helper: update toast accent color ──
      function updateToastColor(newColor) {
        c = newColor;
        toast.style.border = "1px solid " + _hexToRgba(c, 0.35);
        toast.style.borderLeft = "4px solid " + c;
        badge.style.color = _hexToRgba(c, 0.85);
        badge.style.background = _hexToRgba(c, 0.18);
        badge.style.border = "1px solid " + _hexToRgba(c, 0.3);
        barTrack.style.background = _hexToRgba(c, 0.15);
        barFill.style.background = "linear-gradient(90deg, " + c + ", " + _hexToRgba(c, 0.6) + ")";
        openBtn.style.background = _hexToRgba(c, 0.2);
        openBtn.style.border = "1px solid " + _hexToRgba(c, 0.4);
        openBtn.style.color = _hexToRgba(c, 0.75);
        openBtn._hoverColor = c;
      }

      function highlightSelected(container, el, borderStyle) {
        var defaultBorder = "1px solid " + _hexToRgba(c, 0.2);
        borderStyle = borderStyle || "1px solid " + _hexToRgba(c, 0.6);
        Array.from(container.querySelectorAll("button")).forEach(function (b) {
          b.style.border = defaultBorder;
        });
        if (el) el.style.border = borderStyle;
      }

      // ── Gear toggle ──
      // Load nilai semasa dari storage ke settings panel
      try {
        lpApi.storage.local.get(SETTINGS_KEY).then(function (data) {
          var s = (data && data[SETTINGS_KEY]) ? data[SETTINGS_KEY] : {};
          var intervalSec = typeof s.rediscoverInterval === "number" ? s.rediscoverInterval : 86400;
          if (intervalSec >= 3600 && intervalSec % 3600 === 0) {
            intInput.value = String(intervalSec / 3600);
            intUnit.value = "jam";
            intUnit._lastUnit = "jam";
          } else if (intervalSec >= 60 && intervalSec % 60 === 0) {
            intInput.value = String(intervalSec / 60);
            intUnit.value = "minit";
            intUnit._lastUnit = "minit";
          } else {
            intInput.value = String(intervalSec);
            intUnit.value = "saat";
            intUnit._lastUnit = "saat";
          }
          var dismissVal = typeof s.rediscoverDismissAfterMs === "number" ? s.rediscoverDismissAfterMs : 8000;
          dismissSelect.value = String(dismissVal);
          var mode = s.rediscoverMode === "random" ? "random" : "sequential";
          highlightSelected(modeRow, mode === "sequential" ? seqBtn : randBtn);
        }).catch(function () {});
      } catch (_) {}

      toast.appendChild(settingsPanel);

      // Dismiss progress bar
      const barTrack = document.createElement("div");
      Object.assign(barTrack.style, {
        height: "2px",
        background: _hexToRgba(c, 0.15),
        borderRadius: "2px",
        overflow: "hidden",
        marginTop: "2px",
      });
      const barFill = document.createElement("div");
      Object.assign(barFill.style, {
        height: "100%",
        width: "100%",
        background: "linear-gradient(90deg, " + c + ", " + _hexToRgba(c, 0.6) + ")",
        borderRadius: "2px",
        transformOrigin: "left center",
        transition: "none",
      });
      barTrack.appendChild(barFill);
      toast.appendChild(barTrack);

      // Fix hover listeners to use _hoverColor (kept for updateToastColor compatibility)
      const openBtn = { style: {}, _hoverColor: c, addEventListener: () => {} }; // stub — butang dibuang

      document.body.appendChild(toast);

      // Cleanup enlarged preview when toast is removed
      const _origToastRemove = toast.remove.bind(toast);
      toast.remove = function () {
        _rdHideEnlarged();
        try { _rdEnlargedEl.remove(); } catch (_) {}
        _origToastRemove();
      };

      // Animate in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          toast.style.opacity = "1";
          toast.style.transform = "translateY(0)";
        });
      });

      // Drag to reposition
      let _dragActive = false;
      let _dragStartX = 0;
      let _dragStartY = 0;
      let _dragBaseRight = _dragRight;
      let _dragBaseBottom = _dragBottom;

      function _onDragStart(e) {
        if (e.button !== 0) return;
        if (e.target === closeBtn || e.target === openBtn || e.target.closest("button")) return;
        _dragActive = true;
        _dragStartX = e.clientX;
        _dragStartY = e.clientY;
        _dragBaseRight = _dragRight;
        _dragBaseBottom = _dragBottom;
        headerRow.style.cursor = "grabbing";
        e.preventDefault();
        e.stopPropagation();
        document.addEventListener("mousemove", _onDragMove);
        document.addEventListener("mouseup", _onDragEnd);
      }

      function _onDragMove(e) {
        if (!_dragActive) return;
        const dx = e.clientX - _dragStartX;
        const dy = e.clientY - _dragStartY;
        _dragRight = Math.max(0, _dragBaseRight - dx);
        _dragBottom = Math.max(0, _dragBaseBottom - dy);
        toast.style.right = _dragRight + "px";
        toast.style.bottom = _dragBottom + "px";
      }

      function _onDragEnd() {
        if (!_dragActive) return;
        _dragActive = false;
        headerRow.style.cursor = "grab";
        document.removeEventListener("mousemove", _onDragMove);
        document.removeEventListener("mouseup", _onDragEnd);
        // Save position
        try {
          lpApi.storage.local.get(SETTINGS_KEY).then(function (data) {
            const s = (data && data[SETTINGS_KEY]) ? { ...data[SETTINGS_KEY] } : {};
            s.rediscoverToastRight = _dragRight;
            s.rediscoverToastBottom = _dragBottom;
            lpApi.storage.local.set({ [SETTINGS_KEY]: s }).catch(function () {});
          }).catch(function () {});
        } catch (_) {}
      }

      headerRow.addEventListener("mousedown", _onDragStart);

      // Animate progress bar shrink (pause/resume aware)
      const _INF = 999999999;
      var safeDismissMs = typeof dismissMs === "number" ? dismissMs : 8000;
      _totalMs = safeDismissMs > 0 ? safeDismissMs : _INF;
      _totalPaused = 0;
      _startAt = performance.now();
      _pauseStart = 0;

      function _activeElapsed() {
        return (performance.now() - _startAt) - _totalPaused;
      }

      function _remaining() {
        return Math.max(0, _totalMs - _activeElapsed());
      }

      function tickBar(now) {
        if (_totalMs > _INF / 2) {
          barFill.style.transform = "scaleX(1)";
          return;
        }
        var ratio = Math.max(0, 1 - Math.min(1, _activeElapsed() / _totalMs));
        barFill.style.transform = "scaleX(" + ratio + ")";
        if (ratio > 0 && document.body.contains(toast)) {
          requestAnimationFrame(tickBar);
        }
      }
      if (safeDismissMs > 0) {
        requestAnimationFrame(tickBar);
      } else {
        barFill.style.transform = "scaleX(1)";
      }

      // Auto-dismiss
      if (safeDismissMs > 0) {
        autoDismissTimer = setTimeout(function _dismiss() {
          if (!document.body.contains(toast)) return;
          toast.style.opacity = "0";
          toast.style.transform = "translateY(8px)";
          setTimeout(function () { try { toast.remove(); } catch (_) {} }, 240);
        }, safeDismissMs);
      }
    } catch (err) {}
  }

  // Listener untuk mesej show-rediscover-toast dari background
  if (!window.__lpRediscoverToastListenerInstalled) {
    window.__lpRediscoverToastListenerInstalled = true;
    lpApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.type !== "show-rediscover-toast") return;
      showRediscoverToast(
        message.title || "",
        message.url || "",
        message.excerpt || "",
        typeof message.dismissMs === "number" ? message.dismissMs : 8000,
        message.color,
        message.thumbnailUrl || "",
        message.toastRight,
        message.toastBottom,
        message.itemId || "",
        message.categoryId || "all",
        message.categoryName || "",
        typeof message.itemIndex === "number" ? message.itemIndex : 0,
        typeof message.totalItems === "number" ? message.totalItems : 0,
      );
      try { sendResponse({ ok: true }); } catch (_) {}
      return true;
    });
  }

  // ── Fullscreen Category Overlay (gesture action "open-category-fullscreen") ──
  const LP_CAT_OVERLAY_ID = "__lp_category_fullscreen_overlay";

  // Helper: hex → "r,g,b" string untuk rgba()
  function _lpHexToRgbParts(hex) {
    try {
      const h = (hex || "").replace("#","");
      if (h.length < 6) return "90,200,255";
      return `${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)}`;
    } catch (_) { return "90,200,255"; }
  }

  // Janakan warna unik per nama kategori (hue berdasarkan hash nama)
  function _lpCatHue(label) {
    let h = 0;
    for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) & 0xffffffff;
    return Math.abs(h) % 360;
  }

  // Emoji map berdasarkan kata kunci nama kategori
  const _LP_EMOJI_MAP = [
    ["all categor","🌐"],["uncategor","📋"],["youtube","▶️"],["video","🎬"],
    ["music","🎵"],["lagu","🎵"],["work","💼"],["kerja","💼"],["news","📰"],
    ["berita","📰"],["design","🎨"],["seni","🎨"],["art","🎨"],["code","💻"],
    ["coding","💻"],["dev","💻"],["read","📖"],["baca","📖"],["article","📖"],
    ["finance","💰"],["wang","💰"],["money","💰"],["game","🎮"],["gaming","🎮"],
    ["social","💬"],["sosial","💬"],["health","🏥"],["food","🍔"],["travel","✈️"],
    ["sport","⚽"],["sukan","⚽"],["photo","📷"],["gambar","📷"],["note","📝"],
    ["nota","📝"],["fav","⭐"],["hidden","👁️"],["ai","🤖"],["tech","⚙️"],
    ["shop","🛒"],["beli","🛒"],["tool","🔧"],["learn","📚"],["belajar","📚"],
  ];

  function _lpGetEmoji(label) {
    const l = label.toLowerCase();
    for (const [key, emoji] of _LP_EMOJI_MAP) {
      if (l.includes(key)) return emoji;
    }
    return "📁";
  }

  function buildCategoryFullscreenOverlay(categories, currentId, colors, countMap, initialShowHidden) {
    const existing = document.getElementById(LP_CAT_OVERLAY_ID);
    if (existing) { existing.remove(); return null; }

    const accent  = colors.accent  || "#5ac8ff";
    const panel   = colors.panel   || "rgba(18,18,18,0.94)";
    const panelAlt= colors.panelAlt|| "rgba(24,26,31,0.96)";
    const text    = colors.text    || "#f3f4f6";
    const muted   = colors.muted   || "#a3acb9";
    const border  = colors.border  || "rgba(255,255,255,0.12)";
    const accentRgb = _lpHexToRgbParts(accent);

    // total items untuk header info — guna countMap.all supaya tidak double-count
    const totalItems = (countMap && typeof countMap.all === "number") ? countMap.all : 0;

    // Helper: sanitize SVG — buang element/attribute berbahaya, return node
    function _sanitizeSvgNode(svgStr) {
      try {
        var doc = new DOMParser().parseFromString(svgStr, "image/svg+xml");
        var errNode = doc.querySelector("parsererror");
        if (errNode) return null;
        doc.querySelectorAll("script,foreignObject,iframe,object,embed").forEach(function(n){ n.remove(); });
        var svg = doc.querySelector("svg");
        if (!svg) return null;
        svg.querySelectorAll("*").forEach(function(el){
          for (var i = el.attributes.length - 1; i >= 0; i--) {
            var attrName = el.attributes[i].name.toLowerCase();
            if (attrName.startsWith("on")) {
              el.removeAttribute(el.attributes[i].name);
            }
          }
          if (el.hasAttribute("href")) {
            var h = el.getAttribute("href");
            if (h && h.trim().toLowerCase().startsWith("javascript:")) el.removeAttribute("href");
          }
          if (el.hasAttribute("xlink:href")) {
            var x = el.getAttribute("xlink:href");
            if (x && x.trim().toLowerCase().startsWith("javascript:")) el.removeAttribute("xlink:href");
          }
        });
        return doc.importNode(svg, true);
      } catch(e) { return null; }
    }

    // Helper: render icon (emoji, SVG, atau URL)
    function _olRenderIcon(el, icon, sizePx) {
      const sz = sizePx || 24;
      if (!icon) { el.textContent = "📁"; return; }
      if (icon.startsWith("http://") || icon.startsWith("https://") || icon.startsWith("data:image")) {
        const img = document.createElement("img");
        img.src = icon;
        img.style.cssText = `width:${sz}px;height:${sz}px;object-fit:contain;border-radius:4px;vertical-align:middle;display:block;`;
        img.onerror = () => { img.remove(); el.textContent = "📁"; };
        el.textContent = "";
        el.appendChild(img);
      } else if (icon.startsWith("<svg") || icon.startsWith("<SVG")) {
        var _svgNode = _sanitizeSvgNode(icon);
        if (_svgNode) {
          _svgNode.style.width = sz + "px";
          _svgNode.style.height = sz + "px";
          el.textContent = "";
          el.appendChild(_svgNode);
        }
      } else {
        el.textContent = icon;
      }
    }

    // ── Inject keyframe style sekali ────────────────────────────────
    if (!document.getElementById("__lp_catfs_style")) {
      const s = document.createElement("style");
      s.id = "__lp_catfs_style";
      s.textContent = `
        @keyframes __lp_ripple { to { transform:scale(4); opacity:0; } }
        @keyframes __lp_tilein { from { opacity:0; transform:translateY(10px) scale(0.94); } to { opacity:1; transform:none; } }
        #${LP_CAT_OVERLAY_ID} ::-webkit-scrollbar { width:5px; }
        #${LP_CAT_OVERLAY_ID} ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.15); border-radius:4px; }
        #${LP_CAT_OVERLAY_ID} ::-webkit-scrollbar-track { background:transparent; }
        #${LP_CAT_OVERLAY_ID} .__lp_tile_focused { outline: none; }
      `;
      (document.head || document.documentElement).appendChild(s);
    }

    // ── Backdrop — transparent, pointer-events hanya pada modal ────
    const backdrop = document.createElement("div");
    backdrop.id = LP_CAT_OVERLAY_ID;
    backdrop.style.cssText = `
      position:fixed;inset:0;z-index:2147483646;
      background:transparent;
      display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;
      opacity:0;transition:opacity 180ms ease;
      font-family:"Aptos","Segoe UI Variable","Segoe UI",sans-serif;
      pointer-events:none;
    `;

    // ── Modal — penuh skrin, pointer-events aktif ───────────────────
    const modal = document.createElement("div");
    modal.style.cssText = `
      position:fixed;inset:0;
      background:${panel};
      border:none;border-radius:0;
      padding:12px 16px 10px;
      display:flex;flex-direction:column;
      box-shadow:none;
      transform:translateY(-10px);
      transition:transform 200ms cubic-bezier(0.2,0.8,0.2,1),opacity 180ms ease;
      opacity:0;overflow:hidden;
      pointer-events:auto;
      z-index:2147483646;
    `;
    modal.addEventListener("click", e => e.stopPropagation());

    // ── Header top bar ───────────────────────────────────────────────
    const currentCat = categories.find(c => (c.id||c.categoryId) === currentId);
    const currentLabel = currentCat ? currentCat.label : "All categories";
    const currentCount = countMap && countMap[currentId] !== undefined ? countMap[currentId] : (countMap && countMap["all"]);

    const topBar = document.createElement("div");
    topBar.style.cssText = `
      display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-shrink:0;
      flex-wrap:wrap;row-gap:6px;
    `;

    const titleWrap = document.createElement("div");
    titleWrap.style.cssText = `flex:1;min-width:0;`;
    
    const titleHeader = document.createElement("div");
    titleHeader.style.cssText = `font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${muted};margin-bottom:2px`;
    titleHeader.textContent = "Pilih Kategori";
    
    const titleBody = document.createElement("div");
    titleBody.style.cssText = `font-size:13px;font-weight:700;color:${text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
    
    const accentSpan = document.createElement("span");
    accentSpan.style.color = accent;
    accentSpan.textContent = "▸ ";
    
    const countSpan = document.createElement("span");
    countSpan.style.cssText = `font-size:11px;font-weight:400;color:${muted};margin-left:5px`;
    countSpan.textContent = ` ${totalItems} item`;
    
    titleBody.appendChild(accentSpan);
    titleBody.appendChild(document.createTextNode(currentLabel));
    titleBody.appendChild(countSpan);
    
    titleWrap.appendChild(titleHeader);
    titleWrap.appendChild(titleBody);

    // ── Eye state var — inisialisasi terus dari settings yang dah diload ────
    let catOverlayShowHidden = typeof initialShowHidden === "number" ? initialShowHidden : 0;

    // ── View toggle (grid / list) ────────────────────────────────────
    let viewMode = "grid"; // "grid" | "list"
    const viewToggle = document.createElement("button");
    viewToggle.type = "button";
    viewToggle.title = "Tukar paparan";
    viewToggle.textContent = "⊞";
    viewToggle.style.cssText = `
      background:rgba(255,255,255,0.06);border:1px solid ${border};
      color:${muted};font-size:16px;padding:5px 10px;border-radius:8px;
      cursor:pointer;transition:all .12s;font-family:inherit;line-height:1;
    `;
    viewToggle.addEventListener("mouseover", () => { viewToggle.style.background="rgba(255,255,255,0.12)"; viewToggle.style.color=text; });
    viewToggle.addEventListener("mouseout",  () => { viewToggle.style.background="rgba(255,255,255,0.06)"; viewToggle.style.color=muted; });

    // ── Sort selector ────────────────────────────────────────────────
    let sortMode = "name"; // "name" | "count" | "hue"
    const sortSel = document.createElement("select");
    sortSel.style.cssText = `
      padding:5px 8px;border-radius:8px;border:1px solid ${border};
      background:rgba(255,255,255,0.06);color:${text};
      font-size:12px;font-family:inherit;cursor:pointer;outline:none;
    `;
    [["name","A–Z"],["count","Terbanyak"],["hue","Warna"]].forEach(([v,l]) => {
      const o = document.createElement("option");
      o.value = v; o.textContent = l;
      sortSel.appendChild(o);
    });

    // ── Search wrap ──────────────────────────────────────────────────
    const searchWrap = document.createElement("div");
    searchWrap.style.cssText = `position:relative;`;

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Cari…";
    searchInput.autocomplete = "off";
    searchInput.style.cssText = `
      width:110px;padding:5px 26px 5px 8px;border-radius:9px;
      border:1px solid ${border};background:rgba(255,255,255,0.07);
      color:${text};font-size:13px;outline:none;
      transition:border-color .15s;font-family:inherit;
    `;
    searchInput.addEventListener("focus", () => {
      searchInput.style.borderColor = accent;
    });
    searchInput.addEventListener("blur", () => {
      searchInput.style.borderColor = border;
    });

    const clearSearch = document.createElement("button");
    clearSearch.type = "button";
    clearSearch.textContent = "✕";
    clearSearch.style.cssText = `
      position:absolute;right:6px;top:50%;transform:translateY(-50%);
      background:none;border:none;color:${muted};font-size:11px;
      cursor:pointer;padding:2px;display:none;line-height:1;
    `;
    clearSearch.addEventListener("click", () => {
      searchInput.value = "";
      clearSearch.style.display = "none";
      filterAndRender();
      searchInput.focus();
    });
    searchWrap.append(searchInput, clearSearch);

    // ── Close btn ────────────────────────────────────────────────────
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = `
      background:rgba(255,255,255,0.06);border:1px solid ${border};
      color:${muted};font-size:13px;padding:6px 10px;border-radius:8px;
      cursor:pointer;transition:all .12s;font-family:inherit;line-height:1;
    `;
    closeBtn.addEventListener("mouseover", () => { closeBtn.style.background="rgba(255,80,80,0.18)"; closeBtn.style.color="#ff9090"; });
    closeBtn.addEventListener("mouseout",  () => { closeBtn.style.background="rgba(255,255,255,0.06)"; closeBtn.style.color=muted; });
    closeBtn.addEventListener("click", closeCategoryFullscreenOverlay);

    // ── 3 mode buttons (show/hide hidden categories) ──────────────
    function _applyOverlayModeActive() {
      modeBtns.forEach(btn => {
        const val = parseInt(btn.dataset.mode, 10);
        const active = val === catOverlayShowHidden;
        btn.style.background = active ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.04)';
        btn.style.borderColor = active ? accent : border;
        btn.style.color = active ? accent : muted;
        btn.style.fontWeight = active ? '700' : '400';
      });
    }
    function _readOverlayEyeState() {
      lpApi.storage.local.get(SETTINGS_KEY).then(d => {
        const s = d && d[SETTINGS_KEY] ? d[SETTINGS_KEY] : {};
        catOverlayShowHidden = s.showHiddenCategories || 0;
        _applyOverlayModeActive();
      }).catch(() => {});
    }
    const modeDefs = [
      { mode: 0, icon: '👁️',    label: 'Normal' },
      { mode: 1, icon: '👁️‍🗨️', label: 'Semua' },
      { mode: 2, icon: '🙈',     label: 'Hidden' },
    ];
    const modeBtns = [];
    const modeRow = document.createElement('div');
    modeRow.style.cssText = `display:flex;gap:4px;`;
    modeDefs.forEach(({ mode, icon, label }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.mode = mode;
      btn.title = label;
      btn.textContent = icon;
      btn.style.cssText = `
        background:rgba(255,255,255,0.04);border:1px solid ${border};
        color:${muted};font-size:12px;padding:5px 9px;border-radius:7px;
        cursor:pointer;transition:all .12s;font-family:inherit;line-height:1;
      `;
      btn.addEventListener('mouseover', () => {
        if (parseInt(btn.dataset.mode, 10) !== catOverlayShowHidden) {
          btn.style.background = 'rgba(255,255,255,0.12)';
          btn.style.color = text;
        }
      });
      btn.addEventListener('mouseout', () => {
        if (parseInt(btn.dataset.mode, 10) !== catOverlayShowHidden) {
          btn.style.background = 'rgba(255,255,255,0.04)';
          btn.style.color = muted;
        }
      });
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const val = parseInt(btn.dataset.mode, 10);
        if (val === catOverlayShowHidden) return;
        catOverlayShowHidden = val;
        try {
          const d = await lpApi.storage.local.get(SETTINGS_KEY);
          const s = d && d[SETTINGS_KEY] ? { ...d[SETTINGS_KEY] } : {};
          s.showHiddenCategories = val;
          await lpApi.storage.local.set({ [SETTINGS_KEY]: s });
        } catch (_) {}
        const el = document.getElementById(LP_CAT_OVERLAY_ID);
        if (el) {
          if (el._lpKeyDownCleanup) {
            document.removeEventListener('keydown', el._lpKeyDownCleanup, true);
          }
          if (el.parentNode) el.remove();
        }
        openCategoryFullscreenOverlay().catch(() => {});
      });
      btn.addEventListener('wheel', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        let next;
        if (e.deltaY < 0) {
          next = catOverlayShowHidden === 0 ? 2 : catOverlayShowHidden === 1 ? 0 : 1;
        } else {
          next = catOverlayShowHidden === 0 ? 1 : catOverlayShowHidden === 1 ? 2 : 0;
        }
        catOverlayShowHidden = next;
        try {
          const d = await lpApi.storage.local.get(SETTINGS_KEY);
          const s = d && d[SETTINGS_KEY] ? { ...d[SETTINGS_KEY] } : {};
          s.showHiddenCategories = next;
          await lpApi.storage.local.set({ [SETTINGS_KEY]: s });
        } catch (_) {}
        const el = document.getElementById(LP_CAT_OVERLAY_ID);
        if (el) {
          if (el._lpKeyDownCleanup) {
            document.removeEventListener('keydown', el._lpKeyDownCleanup, true);
          }
          if (el.parentNode) el.remove();
        }
        openCategoryFullscreenOverlay().catch(() => {});
      }, { passive: false });
      modeBtns.push(btn);
      modeRow.appendChild(btn);
    });
    _readOverlayEyeState();

    topBar.append(titleWrap, modeRow, sortSel, viewToggle, searchWrap, closeBtn);

    // ── Content area (grid / list) ───────────────────────────────────
    const contentArea = document.createElement("div");
    contentArea.style.cssText = `
      overflow-y:auto;flex:1;min-height:0;padding:2px 2px 8px;
      scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.14) transparent;
    `;

    // ── Focused tile tracker untuk keyboard nav ──────────────────────
    let focusedIndex = -1;
    let visibleTiles = [];

    function getTileBg(cat, hue) {
      return `linear-gradient(135deg,hsla(${hue},60%,35%,0.22),hsla(${hue},40%,20%,0.14))`;
    }
    function getTileBorder(cat, hue, isCurrent) {
      return isCurrent ? accent : `hsla(${hue},55%,55%,0.32)`;
    }

    function buildTile(cat, hue) {
      const catId = cat.id || cat.categoryId || "";
      const isCurrent = catId === currentId;
      const count = countMap && countMap[catId] !== undefined ? countMap[catId] : 0;
      const emoji = cat.icon || _lpGetEmoji(cat.label);

      const tile = document.createElement("button");
      tile.type = "button";
      tile.dataset.label = cat.label.toLowerCase();
      tile.dataset.catId = catId;
      tile.dataset.hue = hue;
      tile.tabIndex = 0;

      tile.style.cssText = `
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        text-align:center;padding:16px 10px 12px;border-radius:16px;position:relative;
        border:2px solid ${getTileBorder(cat,hue,isCurrent)};
        background:${isCurrent ? `rgba(${accentRgb},0.22)` : getTileBg(cat,hue)};
        color:${isCurrent ? accent : text};cursor:pointer;font-family:inherit;
        transition:transform .15s ease,box-shadow .15s ease,background .15s ease,border-color .15s ease;
        min-height:120px;outline:none;overflow:hidden;
      `;

      // Ripple layer
      const rippleLayer = document.createElement("span");
      rippleLayer.style.cssText = `position:absolute;inset:0;overflow:hidden;border-radius:inherit;pointer-events:none;`;
      tile.appendChild(rippleLayer);

      // Emoji
      const emojiEl = document.createElement("span");
      emojiEl.style.cssText = `font-size:48px;display:block;margin-bottom:7px;line-height:1;transition:transform .15s ease;`;
      _olRenderIcon(emojiEl, emoji, 52);
      tile.appendChild(emojiEl);

      // Label with search highlight wrapper
      const labelEl = document.createElement("span");
      labelEl.dataset.rawLabel = cat.label;
      labelEl.style.cssText = `font-size:12px;font-weight:600;word-break:break-word;line-height:1.35;display:block;`;
      labelEl.textContent = cat.label;
      tile.appendChild(labelEl);

      // Count badge
      const countBadge = document.createElement("span");
      countBadge.textContent = count;
      countBadge.style.cssText = `
        margin-top:6px;font-size:10px;font-weight:700;
        padding:2px 7px;border-radius:99px;
        background:${isCurrent ? `rgba(${accentRgb},0.28)` : "rgba(255,255,255,0.1)"};
        color:${isCurrent ? accent : muted};
        transition:all .15s;display:inline-block;
      `;
      tile.appendChild(countBadge);

      // Active checkmark
      if (isCurrent) {
        const check = document.createElement("span");
        check.textContent = "✓";
        check.style.cssText = `
          position:absolute;top:7px;right:9px;font-size:11px;font-weight:800;
          color:${accent};
          text-shadow:0 0 8px rgba(${accentRgb},0.6);
        `;
        tile.appendChild(check);
      }

      // Hidden badge (tunjuk jika kategori hidden)
      if (cat.hidden) {
        const hiddenBadge = document.createElement("span");
        hiddenBadge.textContent = "🙈";
        hiddenBadge.title = "Kategori tersembunyi";
        hiddenBadge.style.cssText = `
          position:absolute;top:7px;left:9px;font-size:12px;
          opacity:0.8;line-height:1;
        `;
        tile.appendChild(hiddenBadge);
      }

      // Hover / focus states
      const setHover = (on) => {
        if (on) {
          tile.style.transform = "translateY(-3px) scale(1.02)";
          tile.style.boxShadow = `0 8px 28px rgba(0,0,0,0.38),0 0 0 1px hsla(${hue},60%,55%,0.4)`;
          tile.style.borderColor = `hsla(${hue},70%,65%,0.7)`;
          tile.style.background = `linear-gradient(135deg,hsla(${hue},65%,42%,0.32),hsla(${hue},45%,28%,0.22))`;
          emojiEl.style.transform = "scale(1.15)";
          countBadge.style.background = `rgba(${accentRgb},0.22)`;
          countBadge.style.color = accent;
        } else {
          tile.style.transform = "";
          tile.style.boxShadow = "";
          tile.style.borderColor = getTileBorder(cat,hue,isCurrent);
          tile.style.background = isCurrent ? `rgba(${accentRgb},0.22)` : getTileBg(cat,hue);
          emojiEl.style.transform = "";
          countBadge.style.background = isCurrent ? `rgba(${accentRgb},0.28)` : "rgba(255,255,255,0.1)";
          countBadge.style.color = isCurrent ? accent : muted;
        }
      };
      tile.addEventListener("mouseover", () => setHover(true));
      tile.addEventListener("mouseout",  () => setHover(false));
      tile.addEventListener("focus", () => {
        tile.style.boxShadow = `0 0 0 3px rgba(${accentRgb},0.4)`;
        tile.style.borderColor = accent;
      });
      tile.addEventListener("blur", () => {
        tile.style.boxShadow = "";
        tile.style.borderColor = getTileBorder(cat,hue,isCurrent);
      });

      // Ripple on click
      tile.addEventListener("mousedown", (e) => {
        const r = document.createElement("span");
        r.style.cssText = `
          position:absolute;border-radius:50%;pointer-events:none;
          background:rgba(255,255,255,0.25);
          width:80px;height:80px;margin-left:-40px;margin-top:-40px;
          left:${e.offsetX}px;top:${e.offsetY}px;
          animation:__lp_ripple 500ms ease-out forwards;
        `;
        rippleLayer.appendChild(r);
        setTimeout(() => r.remove(), 520);
      });

      // Right-click untuk tukar icon
      const canChangeIcon = cat.canPin !== false;
      if (canChangeIcon) {
        tile.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          showOverlayIconPicker(cat, emojiEl, e.clientX, e.clientY);
        });
      }

      return tile;
    }

    function buildListRow(cat, hue) {
      const catId = cat.id || cat.categoryId || "";
      const isCurrent = catId === currentId;
      const count = countMap && countMap[catId] !== undefined ? countMap[catId] : 0;
      const emoji = cat.icon || _lpGetEmoji(cat.label);
      const pct = totalItems > 0 ? Math.round((count / totalItems) * 100) : 0;

      const row = document.createElement("button");
      row.type = "button";
      row.dataset.label = cat.label.toLowerCase();
      row.dataset.catId = catId;
      row.tabIndex = 0;
      row.style.cssText = `
        display:flex;align-items:center;gap:12px;width:100%;
        padding:10px 14px;border-radius:12px;
        border:1.5px solid ${isCurrent ? accent : "transparent"};
        background:${isCurrent ? `rgba(${accentRgb},0.14)` : "rgba(255,255,255,0.03)"};
        color:${text};cursor:pointer;font-family:inherit;text-align:left;
        transition:all .14s ease;outline:none;position:relative;overflow:hidden;
        margin-bottom:4px;
      `;

      // Coloured left stripe
      const stripe = document.createElement("span");
      stripe.style.cssText = `
        position:absolute;left:0;top:0;bottom:0;width:3px;
        background:hsla(${hue},70%,60%,0.7);border-radius:12px 0 0 12px;
      `;
      row.appendChild(stripe);

      const emojiSpan = document.createElement("span");
      emojiSpan.style.cssText = "font-size:32px;flex-shrink:0;margin-left:6px";
      _olRenderIcon(emojiSpan, emoji, 34);

      const infoSpan = document.createElement("span");
      infoSpan.style.cssText = "flex:1;min-width:0;";

      const labelSpan = document.createElement("span");
      labelSpan.dataset.rawLabel = cat.label;
      labelSpan.style.cssText = `font-size:13px;font-weight:600;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
      labelSpan.textContent = cat.label;

      const subSpan = document.createElement("span");
      subSpan.style.cssText = `font-size:10px;color:${muted};margin-top:1px;display:block;`;

      const barSpan = document.createElement("span");
      barSpan.style.cssText = `display:inline-block;width:${Math.max(pct,2)}%;max-width:100%;height:3px;background:hsla(${hue},65%,58%,0.55);border-radius:2px;vertical-align:middle;margin-right:4px;`;

      subSpan.appendChild(barSpan);
      subSpan.appendChild(document.createTextNode(` ${count} item`));

      infoSpan.appendChild(labelSpan);
      infoSpan.appendChild(subSpan);

      // Hidden tag dalam list row
      if (cat.hidden) {
        const hiddenTag = document.createElement("span");
        hiddenTag.textContent = "🙈 hidden";
        hiddenTag.style.cssText = `font-size:9px;color:${muted};margin-top:2px;display:block;opacity:0.7;`;
        infoSpan.appendChild(hiddenTag);
      }

      row.appendChild(emojiSpan);
      row.appendChild(infoSpan);

      if (isCurrent) {
        const checkSpan = document.createElement("span");
        checkSpan.style.cssText = `font-size:13px;font-weight:800;color:${accent}`;
        checkSpan.textContent = "✓";
        row.appendChild(checkSpan);
      }

      row.addEventListener("mouseover", () => {
        row.style.background = `rgba(${accentRgb},0.1)`;
        row.style.borderColor = `hsla(${hue},60%,60%,0.45)`;
      });
      row.addEventListener("mouseout", () => {
        row.style.background = isCurrent ? `rgba(${accentRgb},0.14)` : "rgba(255,255,255,0.03)";
        row.style.borderColor = isCurrent ? accent : "transparent";
      });
      row.addEventListener("focus", () => { row.style.boxShadow = `0 0 0 2px rgba(${accentRgb},0.4)`; });
      row.addEventListener("blur",  () => { row.style.boxShadow = ""; });

      // Right-click untuk tukar icon
      const canChangeIcon = cat.canPin !== false;
      if (canChangeIcon) {
        row.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          showOverlayIconPicker(cat, emojiSpan, e.clientX, e.clientY);
        });
      }

      return row;
    }

    // ── Icon picker untuk fullscreen overlay ────────────────────────
    const _OVERLAY_ICON_LIST = {
      "Umum": ["📁","📂","🗂️","📋","📌","📍","🔖","🏷️","💎","✨","⭐","🌟","💫","🔥","❤️","💜","💙","💚","🧡","💛"],
      "Kerja & Produktiviti": ["💼","🏢","📊","📈","📉","🗓️","📅","⏰","⏳","🔧","⚙️","🛠️","🔨","📎","🖇️","✂️","📏","📐","🗜️","💡"],
      "Maklumat & Pengetahuan": ["📚","📖","📰","📝","📓","📔","📕","📗","📘","📙","🎓","🧠","🔍","🔎","💡","🗣️","💬","💭","🗨️","📡"],
      "Media & Hiburan": ["🎬","🎭","🎨","🎵","🎶","🎤","🎧","📺","🎮","🕹️","🎯","🎪","🎠","🎡","🎢","🏆","🥇","🥈","🥉","🎁"],
      "Teknologi": ["💻","🖥️","⌨️","🖱️","💾","💿","📀","📱","📲","☎️","📞","📟","📠","🔌","🔋","📡","🚀","🛸","🤖","👾"],
      "Sosial & Komunikasi": ["💬","🗨️","🗯️","📧","📨","📩","📦","📫","📪","📬","📭","📮","🗳️","✅","❌","❓","❗","⁉️","🆗","🆕"],
      "Kewangan": ["💰","💵","💴","💶","💷","🪙","💳","💎","🏦","📈","📉","🏧","💰","💲","🎁","🎫","🎟️","🏆","🎯","💰"],
      "Makanan & Minuman": ["🍔","🍕","🍟","🌭","🍿","🧀","🥚","🍳","🥞","🧇","🥓","🥩","🍗","🍖","🌮","🌯","🥙","🧆","🥗","🍜"],
      "Alam & Cuaca": ["🌍","🌎","🌏","🌐","🗺️","🏔️","⛰️","🌋","🏕️","🏖️","🏜️","🏝️","🌲","🌳","🌴","🌵","🌾","🌿","☘️","🍀"],
      "Haiwan": ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🦅","🦆"],
      "Ikon & Simbol": ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️"],
      "Bendera": ["🏁","🚩","🎌","🏴","🏳️","🏳️‍🌈","🏳️‍⚧️","🏴‍☠️","🇺🇸","🇬🇧","🇯🇵","🇰🇷","🇨🇳","🇩🇪","🇫🇷","🇮🇹","🇪🇸","🇧🇷","🇮🇳","🇦🇺"],
    };

    let _overlayIconPickerPopup = null;

    async function _saveOverlayCategoryIcon(catId, icon) {
      try {
        const data = await lpApi.storage.local.get([CATEGORY_KEY]);
        const categories = data && data[CATEGORY_KEY] ? data[CATEGORY_KEY] : [];
        const next = categories.map(c => {
          if (String(c.id) === String(catId)) {
            return icon ? { ...c, icon } : (() => { const copy = { ...c }; delete copy.icon; return copy; })();
          }
          return c;
        });
        await lpApi.storage.local.set({ [CATEGORY_KEY]: next });
      } catch (_) {}
    }

    function showOverlayIconPicker(cat, emojiEl, clientX, clientY) {
      if (_overlayIconPickerPopup && _overlayIconPickerPopup.parentNode) {
        _overlayIconPickerPopup.parentNode.removeChild(_overlayIconPickerPopup);
      }
      _overlayIconPickerPopup = null;

      const popup = document.createElement("div");
      popup.style.cssText = `
        position:fixed;z-index:2147483647;background:rgba(25,25,35,0.97);
        border:1px solid rgba(255,255,255,0.15);border-radius:12px;
        padding:8px;max-width:380px;max-height:480px;overflow-y:auto;
        box-shadow:0 8px 32px rgba(0,0,0,0.5);backdrop-filter:blur(12px);
        scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.15) transparent;
      `;

      const title = document.createElement("div");
      title.textContent = `Tukar icon: ${cat.label}`;
      title.style.cssText = `
        font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);
        padding:2px 4px 6px;text-transform:uppercase;letter-spacing:.05em;
      `;
      popup.appendChild(title);

      // ── Search Iconify ──────────────────────────────────────────────
      const searchBox = document.createElement("div");
      searchBox.style.cssText = "margin-bottom:6px;";
      const searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.placeholder = "Cari icon dari web (contoh: home, heart, star)...";
      searchInput.style.cssText = `
        width:100%;padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);
        background:rgba(255,255,255,0.08);color:#fff;font-size:12px;outline:none;
        box-sizing:border-box;font-family:inherit;
      `;
      searchInput.addEventListener("focus", () => { searchInput.style.borderColor = "rgba(59,130,246,0.6)"; });
      searchInput.addEventListener("blur", () => { searchInput.style.borderColor = "rgba(255,255,255,0.15)"; });
      searchBox.appendChild(searchInput);

      const searchResults = document.createElement("div");
      searchResults.style.cssText = `
        display:flex;flex-wrap:wrap;gap:3px;margin-top:6px;min-height:0;max-height:140px;
        overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.15) transparent;
      `;
      searchBox.appendChild(searchResults);

      const searchLoading = document.createElement("div");
      searchLoading.style.cssText = "font-size:10px;color:rgba(255,255,255,0.3);padding:2px 0;display:none;";
      searchLoading.textContent = "Mencari...";
      searchBox.appendChild(searchLoading);

      let _searchTimer = null;
      searchInput.addEventListener("input", () => {
        const q = searchInput.value.trim();
        if (_searchTimer) clearTimeout(_searchTimer);
        if (!q) { searchResults.textContent = ""; return; }
        _searchTimer = setTimeout(async () => {
          searchLoading.style.display = "block";
          searchResults.textContent = "";
          try {
            const resp = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=30`);
            const data = await resp.json();
            const icons = data.icons || [];
            searchLoading.style.display = "none";
            if (!icons.length) {
              searchResults.textContent = "Tiada icon dijumpai";
              searchResults.style.cssText = "font-size:10px;color:rgba(255,255,255,0.3);";
              return;
            }
            const svgResp = await fetch(`https://api.iconify.design/${icons.map(i => i.replace(":", ".")).join(",")}.svg`);
            const svgText = await svgResp.text();
            const svgLines = svgText.split("\n").filter(l => l.trim());
            icons.forEach((iconName, idx) => {
              const svgData = svgLines[idx] || "";
              const btn = document.createElement("button");
              btn.type = "button";
              btn.title = iconName;
              btn.style.cssText = `
                width:32px;height:32px;display:flex;align-items:center;
                justify-content:center;border:none;background:rgba(255,255,255,0.06);
                border-radius:6px;cursor:pointer;transition:all .12s;padding:2px;
              `;
              if (svgData.startsWith("<svg")) {
                var _svgNode2 = _sanitizeSvgNode(svgData.replace(/width="[^"]*"/, 'width="20"').replace(/height="[^"]*"/, 'height="20"'));
                if (_svgNode2) {
                  _svgNode2.style.width = "20px";
                  _svgNode2.style.height = "20px";
                  btn.appendChild(_svgNode2);
                }
              }
              btn.addEventListener("mouseover", () => { btn.style.background = "rgba(59,130,246,0.4)"; btn.style.transform = "scale(1.15)"; });
              btn.addEventListener("mouseout", () => { btn.style.background = "rgba(255,255,255,0.06)"; btn.style.transform = "scale(1)"; });
              btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                await _saveOverlayCategoryIcon(cat.id, svgData);
                if (_overlayIconPickerPopup && _overlayIconPickerPopup.parentNode) {
                  _overlayIconPickerPopup.parentNode.removeChild(_overlayIconPickerPopup);
                }
                _overlayIconPickerPopup = null;
                filterAndRender();
              });
              searchResults.appendChild(btn);
            });
          } catch (_) {
            searchLoading.style.display = "none";
            searchResults.textContent = "Gagal mencari icon";
              searchResults.style.cssText = "font-size:10px;color:rgba(255,100,100,0.5);";
          }
        }, 400);
      });
      popup.appendChild(searchBox);

      // ── URL / Emoji input ───────────────────────────────────────────
      const customBox = document.createElement("div");
      customBox.style.cssText = "margin-bottom:6px;";
      const urlInput = document.createElement("input");
      urlInput.type = "text";
      urlInput.placeholder = "Paste emoji atau URL gambar dari web...";
      urlInput.style.cssText = `
        width:100%;padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);
        background:rgba(255,255,255,0.08);color:#fff;font-size:12px;outline:none;
        box-sizing:border-box;font-family:inherit;
      `;
      urlInput.addEventListener("focus", () => { urlInput.style.borderColor = "rgba(59,130,246,0.6)"; });
      urlInput.addEventListener("blur", () => { urlInput.style.borderColor = "rgba(255,255,255,0.15)"; });
      const urlApplyBtn = document.createElement("button");
      urlApplyBtn.type = "button";
      urlApplyBtn.textContent = "✓ Guna";
      urlApplyBtn.style.cssText = `
        margin-top:4px;padding:5px 12px;border-radius:6px;border:1px solid rgba(59,130,246,0.4);
        background:rgba(59,130,246,0.2);color:#93c5fd;font-size:11px;cursor:pointer;
        transition:background .12s;font-family:inherit;
      `;
      urlApplyBtn.addEventListener("mouseover", () => { urlApplyBtn.style.background = "rgba(59,130,246,0.4)"; });
      urlApplyBtn.addEventListener("mouseout", () => { urlApplyBtn.style.background = "rgba(59,130,246,0.2)"; });
      urlApplyBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const val = urlInput.value.trim();
        if (!val) return;
        await _saveOverlayCategoryIcon(cat.id, val);
        if (_overlayIconPickerPopup && _overlayIconPickerPopup.parentNode) {
          _overlayIconPickerPopup.parentNode.removeChild(_overlayIconPickerPopup);
        }
        _overlayIconPickerPopup = null;
        filterAndRender();
      });
      customBox.append(urlInput, urlApplyBtn);
      popup.appendChild(customBox);

      // ── Remove button ───────────────────────────────────────────────
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "❌ Buang icon";
      removeBtn.style.cssText = `
        display:block;width:100%;padding:6px 8px;margin-bottom:6px;
        background:rgba(255,80,80,0.15);border:1px solid rgba(255,80,80,0.3);
        border-radius:6px;color:#ff6b6b;font-size:11px;cursor:pointer;text-align:left;
        transition:background .12s;
      `;
      removeBtn.addEventListener("mouseover", () => removeBtn.style.background = "rgba(255,80,80,0.3)");
      removeBtn.addEventListener("mouseout", () => removeBtn.style.background = "rgba(255,80,80,0.15)");
      removeBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await _saveOverlayCategoryIcon(cat.id, "");
        if (_overlayIconPickerPopup && _overlayIconPickerPopup.parentNode) {
          _overlayIconPickerPopup.parentNode.removeChild(_overlayIconPickerPopup);
        }
        _overlayIconPickerPopup = null;
        filterAndRender();
      });
      popup.appendChild(removeBtn);

      // ── Emoji grid ──────────────────────────────────────────────────
      for (const [section, icons] of Object.entries(_OVERLAY_ICON_LIST)) {
        const sectionLabel = document.createElement("div");
        sectionLabel.textContent = section;
        sectionLabel.style.cssText = `
          font-size:10px;font-weight:700;color:rgba(255,255,255,0.35);
          padding:6px 4px 3px;text-transform:uppercase;letter-spacing:.04em;
        `;
        popup.appendChild(sectionLabel);

        const grid = document.createElement("div");
        grid.style.cssText = `display:flex;flex-wrap:wrap;gap:2px;margin-bottom:4px;`;
        icons.forEach(emoji => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = emoji;
          btn.style.cssText = `
            width:30px;height:30px;font-size:16px;display:flex;align-items:center;
            justify-content:center;border:none;background:rgba(255,255,255,0.06);
            border-radius:6px;cursor:pointer;transition:all .12s;padding:0;
          `;
          btn.addEventListener("mouseover", () => { btn.style.background = "rgba(59,130,246,0.4)"; btn.style.transform = "scale(1.2)"; });
          btn.addEventListener("mouseout", () => { btn.style.background = "rgba(255,255,255,0.06)"; btn.style.transform = "scale(1)"; });
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            await _saveOverlayCategoryIcon(cat.id, emoji);
            if (_overlayIconPickerPopup && _overlayIconPickerPopup.parentNode) {
              _overlayIconPickerPopup.parentNode.removeChild(_overlayIconPickerPopup);
            }
            _overlayIconPickerPopup = null;
            filterAndRender();
          });
          grid.appendChild(btn);
        });
        popup.appendChild(grid);
      }

      document.body.appendChild(popup);
      _overlayIconPickerPopup = popup;

      const pw = popup.offsetWidth || 380;
      const ph = popup.offsetHeight || 480;
      let px = clientX;
      let py = clientY;
      if (px + pw > window.innerWidth - 8) px = window.innerWidth - pw - 8;
      if (py + ph > window.innerHeight - 8) py = window.innerHeight - ph - 8;
      if (px < 8) px = 8;
      if (py < 8) py = 8;
      popup.style.left = px + "px";
      popup.style.top = py + "px";

      setTimeout(() => {
        const closePicker = (ev) => {
          if (_overlayIconPickerPopup && !_overlayIconPickerPopup.contains(ev.target)) {
            if (_overlayIconPickerPopup.parentNode) {
              _overlayIconPickerPopup.parentNode.removeChild(_overlayIconPickerPopup);
            }
            _overlayIconPickerPopup = null;
          }
        };
        document.addEventListener("click", closePicker, { once: true, capture: true });
        document.addEventListener("contextmenu", closePicker, { once: true, capture: true });
      }, 0);
    }

    // ── Highlight search match dalam label ───────────────────────────
    function highlightLabel(el, q) {
      const raw = el.dataset.rawLabel || el.textContent;
      el.textContent = "";
      if (!q) { el.textContent = raw; return; }
      const idx = raw.toLowerCase().indexOf(q);
      if (idx < 0) { el.textContent = raw; return; }
      const part1 = raw.slice(0, idx);
      const part2 = raw.slice(idx, idx + q.length);
      const part3 = raw.slice(idx + q.length);
      if (part1) {
        el.appendChild(document.createTextNode(part1));
      }
      const mark = document.createElement("mark");
      mark.style.cssText = `background:rgba(${accentRgb},0.35);color:${accent};border-radius:3px;padding:0 1px;`;
      mark.textContent = part2;
      el.appendChild(mark);
      if (part3) {
        el.appendChild(document.createTextNode(part3));
      }
    }
    function escHtml(s) { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

    // ── Sort & filter & render ───────────────────────────────────────
    function getSortedCategories() {
      const cats = [...categories];
      const allEntry = cats.find(c => c.id === "all" || c.categoryId === "all");
      const noneEntry = cats.find(c => c.id === "none" || c.categoryId === "none");
      const rest = cats.filter(c => c.id !== "all" && c.categoryId !== "all" && c.id !== "none" && c.categoryId !== "none");
      if (sortMode === "count") rest.sort((a,b) => ((countMap&&countMap[b.id||b.categoryId])||0) - ((countMap&&countMap[a.id||a.categoryId])||0));
      else if (sortMode === "hue") rest.sort((a,b) => _lpCatHue(a.label) - _lpCatHue(b.label));
      else rest.sort((a,b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
      const result = [];
      if (allEntry) result.push(allEntry);
      if (noneEntry) result.push(noneEntry);
      result.push(...rest);
      return result;
    }

    function filterAndRender() {
      const q = searchInput.value.trim().toLowerCase();
      clearSearch.style.display = q ? "block" : "none";
      const filtered = getSortedCategories().filter(c => !q || c.label.toLowerCase().includes(q));
      contentArea.innerHTML = "";
      visibleTiles = [];
      focusedIndex = -1;

      if (viewMode === "grid") {
        const gridEl = document.createElement("div");
        gridEl.style.cssText = `display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;padding:2px;`;
        filtered.forEach((cat, i) => {
          const hue = _lpCatHue(cat.label);
          const tile = buildTile(cat, hue);
          tile.style.animation = `__lp_tilein 200ms ease ${Math.min(i*18,200)}ms both`;
          const lEl = tile.querySelector("[data-raw-label]");
          if (lEl && q) highlightLabel(lEl, q);
          visibleTiles.push(tile);
          gridEl.appendChild(tile);
        });
        contentArea.appendChild(gridEl);
      } else {
        const listEl = document.createElement("div");
        listEl.style.cssText = `display:flex;flex-direction:column;padding:2px;`;
        filtered.forEach((cat, i) => {
          const hue = _lpCatHue(cat.label);
          const row = buildListRow(cat, hue);
          row.style.animation = `__lp_tilein 160ms ease ${Math.min(i*12,180)}ms both`;
          const lEl = row.querySelector("[data-raw-label]");
          if (lEl && q) highlightLabel(lEl, q);
          visibleTiles.push(row);
          listEl.appendChild(row);
        });
        contentArea.appendChild(listEl);
      }

      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.style.cssText = `text-align:center;padding:40px 20px;color:${muted};font-size:14px;`;
        empty.textContent = "Tiada kategori dijumpai.";
        contentArea.appendChild(empty);
      }
    }

    viewToggle.addEventListener("click", () => {
      viewMode = viewMode === "grid" ? "list" : "grid";
      viewToggle.textContent = viewMode === "grid" ? "⊞" : "☰";
      filterAndRender();
    });
    sortSel.addEventListener("change", () => { sortMode = sortSel.value; filterAndRender(); });
    searchInput.addEventListener("input", filterAndRender);

    contentArea.addEventListener("click", async (e) => {
      const el = e.target.closest("button[data-cat-id]");
      if (!el) return;
      const catId = el.dataset.catId;
      const cat = categories.find(c => (c.id||c.categoryId) === catId);
      const catLabel = cat ? cat.label : catId;
      try {
        await lpApi.storage.local.set({ [SELECTED_CATEGORY_KEY]: catId });
        try { const m = lpApi.runtime.sendMessage({ type:"request-badge" }); if (m&&m.catch) m.catch(()=>{}); } catch(_) {}
      } catch(_) {}
      closeCategoryFullscreenOverlay();
      showLinkToast(`📂 ${catLabel}`);
    });

    // ── Keyboard nav ─────────────────────────────────────────────────
    function onKeyDown(e) {
      if (e.key === "Escape") { closeCategoryFullscreenOverlay(); return; }
      if (document.activeElement === searchInput) {
        if (e.key === "Enter" && visibleTiles.length > 0) { visibleTiles[0].click(); e.preventDefault(); }
        return;
      }
      const cols = viewMode === "grid" ? Math.max(1, Math.floor((contentArea.clientWidth - 10) / 145)) : 1;
      const n = visibleTiles.length;
      if (!n) return;
      let next = focusedIndex;
      if (e.key === "ArrowRight")      next = focusedIndex < 0 ? 0 : Math.min(focusedIndex+1, n-1);
      else if (e.key === "ArrowLeft")  next = Math.max(focusedIndex <= 0 ? 0 : focusedIndex-1, 0);
      else if (e.key === "ArrowDown")  next = focusedIndex < 0 ? 0 : Math.min(focusedIndex+cols, n-1);
      else if (e.key === "ArrowUp")    next = Math.max((focusedIndex < 0 ? 0 : focusedIndex)-cols, 0);
      else if (e.key === "Enter" && focusedIndex >= 0) { visibleTiles[focusedIndex].click(); e.preventDefault(); return; }
      else return;
      e.preventDefault();
      focusedIndex = next;
      visibleTiles[focusedIndex].focus();
      visibleTiles[focusedIndex].scrollIntoView({ block:"nearest", inline:"nearest" });
    }
    document.addEventListener("keydown", onKeyDown, true);
    backdrop._lpKeyDownCleanup = onKeyDown;

    backdrop.addEventListener("click", closeCategoryFullscreenOverlay);
    modal.append(topBar, contentArea);
    backdrop.appendChild(modal);
    (document.body || document.documentElement).appendChild(backdrop);

    filterAndRender();
    requestAnimationFrame(() => {
      backdrop.style.opacity = "1";
      modal.style.opacity = "1";
      modal.style.transform = "translateY(0)";
      setTimeout(() => searchInput.focus(), 200);
    });
    return backdrop;
  }

  function closeCategoryFullscreenOverlay() {
    const el = document.getElementById(LP_CAT_OVERLAY_ID);
    if (!el) return;
    // Ambil modal (div pertama dalam backdrop)
    const modal = el.firstElementChild;
    if (modal) {
      modal.style.opacity = "0";
      modal.style.transform = "translateY(-10px)";
    }
    el.style.opacity = "0";
    if (el._lpKeyDownCleanup) {
      document.removeEventListener("keydown", el._lpKeyDownCleanup, true);
    }
    setTimeout(() => { if (el.parentNode) el.remove(); }, 200);
  }

  async function openCategoryFullscreenOverlay() {
    // Toggle: tutup jika dah terbuka
    if (document.getElementById(LP_CAT_OVERLAY_ID)) {
      closeCategoryFullscreenOverlay();
      return;
    }
    // Ambil data kategori + items + settings untuk count
    const [categories, storageData, settingsData] = await Promise.all([
      loadQuickLinkSaveCategoryEntries(),
      lpApi.storage.local.get([SELECTED_CATEGORY_KEY, ITEM_KEY]),
      lpApi.storage.local.get(SETTINGS_KEY),
    ]);
    const currentId = storageData && storageData[SELECTED_CATEGORY_KEY]
      ? String(storageData[SELECTED_CATEGORY_KEY])
      : "all";

    // Kira item count per kategori (logik sama seperti buildCategoryCounts dalam background.js)
    const items = (storageData && Array.isArray(storageData[ITEM_KEY])) ? storageData[ITEM_KEY] : [];
    const _settings = (settingsData && settingsData[SETTINGS_KEY]) ? settingsData[SETTINGS_KEY] : {};
    let showHiddenCat = _settings.showHiddenCategories;
    if (showHiddenCat === true) showHiddenCat = 1;
    if (showHiddenCat === false || typeof showHiddenCat === "undefined") showHiddenCat = 0;
    const hiddenCatIds = new Set(
      (Array.isArray(categories) ? categories : [])
        .filter(c => c && c.id && c.hidden)
        .map(c => String(c.id))
    );
    const countMap = { all: 0, none: 0, hiddenNone: 0, hiddenAll: 0 };
    items.forEach(item => {
      if (!item) return;
      const cid = item.categoryId ? String(item.categoryId) : "";
      if (!cid) {
        // Uncategorized
        countMap.none = (countMap.none || 0) + 1;
        if (showHiddenCat !== 2) countMap.all += 1;
      } else if (cid === "hidden_none") {
        countMap.hiddenNone = (countMap.hiddenNone || 0) + 1;
        countMap.hiddenAll = (countMap.hiddenAll || 0) + 1;
        if (showHiddenCat === 2 || showHiddenCat === 1) countMap.all += 1;
      } else {
        countMap[cid] = (countMap[cid] || 0) + 1;
        const isHidden = hiddenCatIds.has(cid);
        if (isHidden) countMap.hiddenAll = (countMap.hiddenAll || 0) + 1;
        if (showHiddenCat === 2) {
          if (isHidden) countMap.all += 1;
        } else if (showHiddenCat || !isHidden) {
          countMap.all += 1;
        }
      }
    });
    // Peta kunci camelCase ke ID sebenar yang digunakan oleh tile untuk lookup
    // Tile guna countMap[cat.id] — jadi "hidden_none" dan "all_hidden" mesti ada sebagai kunci terus
    countMap["hidden_none"] = countMap.hiddenNone;
    countMap["all_hidden"]  = countMap.hiddenAll;
    // "none" dan "all" dah betul kerana kunci countMap.none === countMap["none"]

    const colors = themeColors || resolveThemeColors(themePreset);
    buildCategoryFullscreenOverlay(categories, currentId, colors, countMap, showHiddenCat);
  }

  // Listener untuk gesture action "open-category-fullscreen" dari background
  if (!window.__lpCategoryFullscreenListenerInstalled) {
    window.__lpCategoryFullscreenListenerInstalled = true;
    lpApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.type !== "open-category-fullscreen") return;
      openCategoryFullscreenOverlay().catch(() => {});
      try { sendResponse({ ok: true }); } catch (_) {}
      return true;
    });
  }

  // Listener untuk gesture action "show-mini-categories" dari background
  if (!window.__lpShowMiniCategoriesListenerInstalled) {
    window.__lpShowMiniCategoriesListenerInstalled = true;
    lpApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.type !== "show-mini-categories") return;
      if (isVisible) {
        if (miniCategoryVisible) {
          hideMiniCategories();
        } else {
          showMiniCategories();
        }
      } else {
        // Button belum visible — show dulu, kemudian buka mini
        window.showPocket();
        setTimeout(() => showMiniCategories(), 220);
      }
      try { sendResponse({ ok: true }); } catch (_) {}
      return true;
    });
  }

  // Listener untuk gesture action "show-category-scroller" dari background
  if (!window.__lpShowCategoryScrollerListenerInstalled) {
    window.__lpShowCategoryScrollerListenerInstalled = true;
    lpApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.type !== "show-category-scroller") return;
      if (button5ScrollerActive) {
        hideButton5CategoryScroller(false);
      } else {
        // Toggle mode: Normal ↔ Hidden
        button5ScrollerMode = button5ScrollerMode === 0 ? 1 : 0;
        _saveButton5ScrollerMode(button5ScrollerMode);
        showButton5CategoryScroller();
      }
      try { sendResponse({ ok: true }); } catch (_) {}
      return true;
    });
  }

  // Listener untuk gesture action "set-thumbnail-from-image" dari background
  if (!window.__lpThumbnailSelectionModeListenerInstalled) {
    window.__lpThumbnailSelectionModeListenerInstalled = true;
    lpApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.type !== "enter-thumbnail-selection-mode") return;
      const pageUrl = message.pageUrl || window.location.href;
      _lpEnterThumbnailSelectionMode(pageUrl);
      try { sendResponse({ ok: true }); } catch (_) {}
      return true;
    });
  }

  // Listener untuk gesture action "open-link-save-category-chooser" dari background
  if (!window.__lpCategoryChooserForLinkListenerInstalled) {
    window.__lpCategoryChooserForLinkListenerInstalled = true;
    lpApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.type !== "open-category-chooser-for-link") return;
      const url = message.url || "";
      const title = message.title || "";
      if (url) {
        openQuickLinkSaveCategoryChooser({ url, title }).catch(() => {});
      }
      try { sendResponse({ ok: true }); } catch (_) {}
      return true;
    });
  }

  // Listener untuk quick-capture feedback toast dari background
  if (!window.__lpSavedLinkToastListenerInstalled) {
    window.__lpSavedLinkToastListenerInstalled = true;
    lpApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message && message.type === "show-saved-link-toast") {
        showSavedLinkToast(message.categoryName || "", message.categoryId || "");
        try { sendResponse && sendResponse({ ok: true }); } catch (_) {}
        return true;
      } else if (message && message.type === "show-toast-message") {
        showLinkToast(message.message || "");
        try { sendResponse && sendResponse({ ok: true }); } catch (_) {}
        return true;
      }
    });
  }

  // ── Bundle countdown toast ──────────────────────────────────────────────────
  // Shows a rich animated notification with a live progress bar and cancel button
  // while the 3-second bundle auto-save window is active.
  // Calling it again while one is already visible refreshes the link count.
  let _bundleToastEl = null;
  let _bundleToastRaf = null;
  let _bundleToastStart = 0;
  let _bundleToastDuration = 3000;
  let _bundleToastCancelCb = null;
  let _bundleToastCountEl = null;
  let _bundleToastBarEl = null;
  let _bundleToastSecsEl = null;

  function showBundleCountdownToast(linkCount, durationMs, onCancel) {
    try {
      _bundleToastCancelCb = onCancel || null;
      _bundleToastDuration = durationMs || 3000;

      // If toast already exists just refresh the count label and restart timer
      if (_bundleToastEl && document.body.contains(_bundleToastEl)) {
        if (_bundleToastCountEl) {
          _bundleToastCountEl.textContent = linkCount + " link" + (linkCount > 1 ? "s" : "");
        }
        _bundleToastStart = performance.now();
        return;
      }

      // ── Build toast ──────────────────────────────────────────────────────────
      const toast = document.createElement("div");
      toast.id = "__pocket_bundle_toast";
      _bundleToastEl = toast;

      Object.assign(toast.style, {
        position: "fixed",
        right: "16px",
        bottom: "16px",
        zIndex: "2147483646",
        background: "linear-gradient(135deg, rgba(15,15,22,0.97) 0%, rgba(25,25,38,0.97) 100%)",
        border: "1px solid rgba(139,92,246,0.35)",
        borderRadius: "14px",
        padding: "14px 16px 12px",
        boxShadow: "0 16px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(139,92,246,0.12), 0 0 24px rgba(139,92,246,0.18)",
        pointerEvents: "auto",
        minWidth: "230px",
        maxWidth: "290px",
        opacity: "0",
        transform: "translateY(12px) scale(0.96)",
        transition: "opacity 220ms cubic-bezier(0.34,1.56,0.64,1), transform 220ms cubic-bezier(0.34,1.56,0.64,1)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        userSelect: "none",
      });

      // Top row: icon + text + cancel button
      const topRow = document.createElement("div");
      Object.assign(topRow.style, {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        marginBottom: "10px",
      });

      // Animated bundle icon
      const iconWrap = document.createElement("div");
      Object.assign(iconWrap.style, {
        width: "34px",
        height: "34px",
        borderRadius: "10px",
        background: "linear-gradient(135deg, rgba(139,92,246,0.3) 0%, rgba(99,102,241,0.3) 100%)",
        border: "1px solid rgba(139,92,246,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "17px",
        flexShrink: "0",
        animation: "__lp_bundle_pulse 1.4s ease-in-out infinite",
      });
      iconWrap.textContent = "📦";
      topRow.appendChild(iconWrap);

      // Text block
      const textBlock = document.createElement("div");
      Object.assign(textBlock.style, { flex: "1", minWidth: "0" });

      const titleLine = document.createElement("div");
      Object.assign(titleLine.style, {
        color: "rgba(255,255,255,0.92)",
        fontSize: "13px",
        fontWeight: "600",
        lineHeight: "1.3",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      });
      titleLine.textContent = "Bundle auto-save";
      textBlock.appendChild(titleLine);

      const countLine = document.createElement("div");
      Object.assign(countLine.style, {
        color: "rgba(167,139,250,0.9)",
        fontSize: "12px",
        fontWeight: "500",
        marginTop: "2px",
      });
      countLine.textContent = linkCount + " link" + (linkCount > 1 ? "s" : "");
      _bundleToastCountEl = countLine;
      textBlock.appendChild(countLine);

      topRow.appendChild(textBlock);

      // Seconds badge — hanya tunjuk kalau ada countdown
      const secsBadge = document.createElement("div");
      Object.assign(secsBadge.style, {
        background: "rgba(139,92,246,0.18)",
        border: "1px solid rgba(139,92,246,0.35)",
        borderRadius: "8px",
        padding: "3px 8px",
        color: "rgba(167,139,250,1)",
        fontSize: "13px",
        fontWeight: "700",
        flexShrink: "0",
        minWidth: "32px",
        textAlign: "center",
        fontVariantNumeric: "tabular-nums",
        display: durationMs > 0 ? "" : "none",
      });
      secsBadge.textContent = "3s";
      _bundleToastSecsEl = secsBadge;
      topRow.appendChild(secsBadge);

      toast.appendChild(topRow);

      // Progress bar — hanya tunjuk kalau ada countdown
      const barTrack = document.createElement("div");
      Object.assign(barTrack.style, {
        height: "4px",
        borderRadius: "4px",
        background: "rgba(255,255,255,0.08)",
        overflow: "hidden",
        display: durationMs > 0 ? "" : "none",
      });

      const barFill = document.createElement("div");
      Object.assign(barFill.style, {
        height: "100%",
        width: "100%",
        borderRadius: "4px",
        background: "linear-gradient(90deg, #8b5cf6 0%, #6366f1 50%, #a78bfa 100%)",
        transformOrigin: "left center",
        transition: "none",
        boxShadow: "0 0 8px rgba(139,92,246,0.6)",
      });
      _bundleToastBarEl = barFill;
      barTrack.appendChild(barFill);
      toast.appendChild(barTrack);

      // Inject keyframe for pulse if not already present
      if (!document.getElementById("__lp_bundle_toast_style")) {
        const s = document.createElement("style");
        s.id = "__lp_bundle_toast_style";
        s.textContent = `
          @keyframes __lp_bundle_pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.12); opacity: 0.8; }
          }
        `;
        document.head.appendChild(s);
      }

      document.body.appendChild(toast);

      // Animate in
      requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateY(0) scale(1)";
      });

      // Start countdown animation loop
      _bundleToastStart = performance.now();

      function tick(now) {
        if (!_bundleToastEl || !document.body.contains(_bundleToastEl)) return;
        const elapsed = now - _bundleToastStart;
        const remaining = Math.max(0, _bundleToastDuration - elapsed);
        const progress = remaining / _bundleToastDuration; // 1 → 0

        if (_bundleToastBarEl) {
          _bundleToastBarEl.style.transform = "scaleX(" + progress + ")";
        }
        if (_bundleToastSecsEl) {
          const secs = Math.ceil(remaining / 1000);
          _bundleToastSecsEl.textContent = secs + "s";
          // Pulse red when 1 second left
          if (secs <= 1) {
            _bundleToastSecsEl.style.color = "rgba(252,165,165,1)";
            _bundleToastSecsEl.style.borderColor = "rgba(239,68,68,0.5)";
            _bundleToastSecsEl.style.background = "rgba(239,68,68,0.15)";
          } else {
            _bundleToastSecsEl.style.color = "rgba(167,139,250,1)";
            _bundleToastSecsEl.style.borderColor = "rgba(139,92,246,0.35)";
            _bundleToastSecsEl.style.background = "rgba(139,92,246,0.18)";
          }
        }

        if (remaining > 0) {
          _bundleToastRaf = requestAnimationFrame(tick);
        } else {
          // Auto-dismiss when timer fires
          _dismissBundleToast();
        }
      }

      if (_bundleToastRaf) cancelAnimationFrame(_bundleToastRaf);
      if (_bundleToastDuration > 0) {
        _bundleToastRaf = requestAnimationFrame(tick);
      }

    } catch (err) {
      // fallback to plain toast
      showLinkToast("Bundle · " + linkCount + " link" + (linkCount > 1 ? "s" : ""));
    }
  }

  function _dismissBundleToast() {
    if (_bundleToastRaf) {
      cancelAnimationFrame(_bundleToastRaf);
      _bundleToastRaf = null;
    }
    const el = _bundleToastEl;
    _bundleToastEl = null;
    _bundleToastCountEl = null;
    _bundleToastBarEl = null;
    _bundleToastSecsEl = null;
    if (!el) return;
    try {
      // Buang terus tanpa delay — elak overlap dengan saved toast
      el.remove();
    } catch (_) {}
  }
  // ────────────────────────────────────────────────────────────────────────────

  function stringToHue(str) {
    if (!str) return 142;
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return ((hash % 360) + 360) % 360;
  }

  function closeLinkSaveCategoryChooser() {
    if (typeof linkSaveCategoryChooserCleanup !== "function") return;
    try {
      linkSaveCategoryChooserCleanup();
    } catch (err) {
      // ignore
    }
    linkSaveCategoryChooserCleanup = null;
  }

  function normalizeQuickLinkChooserSearchText(value) {
    const raw = value ? String(value) : "";
    const normalized = typeof raw.normalize === "function"
      ? raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      : raw;
    return normalized.toLowerCase().trim();
  }

  function quickLinkChooserLabelMatches(label, query) {
    const safeLabel = normalizeQuickLinkChooserSearchText(label);
    const safeQuery = normalizeQuickLinkChooserSearchText(query);
    if (!safeLabel || !safeQuery) return false;
    return safeLabel.startsWith(safeQuery);
  }

  function normalizeLinkSavePinnedCategoryIds(value) {
    const entries = Array.isArray(value) ? value : [];
    const normalized = [];
    const seen = new Set();
    entries.forEach((entry) => {
      const id = entry ? String(entry).trim() : "";
      if (!id || seen.has(id)) return;
      seen.add(id);
      normalized.push(id.slice(0, 120));
    });
    return normalized.slice(0, 20);
  }

  function sortQuickLinkSaveCategories(categories, showHidden = 0) {
    return (Array.isArray(categories) ? categories : [])
      .filter((entry) => {
        if (!entry || !entry.id) return false;
        if (showHidden === 2) {
          return entry.hidden === true;
        }
        return showHidden || entry.hidden !== true;
      })
      .slice()
      .sort((a, b) => {
        const aName = a && a.name ? String(a.name) : "";
        const bName = b && b.name ? String(b.name) : "";
        return aName.localeCompare(bName, undefined, {
          sensitivity: "base",
        });
      });
  }

  async function loadQuickLinkSaveCategoryEntries() {
    const data = await lpApi.storage.local.get([
      CATEGORY_KEY,
      SELECTED_CATEGORY_KEY,
      SETTINGS_KEY,
    ]);
    const settings = data && data[SETTINGS_KEY] ? data[SETTINGS_KEY] : {};
    const showHidden = settings.showHiddenCategories;
    
    const selectedCategoryId =
      data && data[SELECTED_CATEGORY_KEY]
        ? String(data[SELECTED_CATEGORY_KEY])
        : "all";

    const categories = data && data[CATEGORY_KEY] ? data[CATEGORY_KEY] : [];
    const pinnedIds = normalizeLinkSavePinnedCategoryIds(
      settings.linkSavePinnedCategoryIds || linkSavePinnedCategoryIds
    );
    const pinnedSet = new Set(pinnedIds);

    // 1. Sort alphabetically (matching popup.js logic)
    const sortedCategories = categories
      .filter((cat) => {
        if (!cat || !cat.id) return false;
        if (showHidden === 2) {
          return !!cat.hidden;
        }
        return showHidden || !cat.hidden;
      })
      .sort((a, b) => {
        const aName = a && a.name ? String(a.name) : "";
        const bName = b && b.name ? String(b.name) : "";
        return aName.localeCompare(bName, undefined, { sensitivity: "base" });
      });

    const entries = [];

    // 2. Add "All categories" at the top (matching popup.js)
    if (showHidden !== 2) {
      entries.push({
        id: "all",
        categoryId: "all",
        label: "All categories",
        icon: "🌐",
        isCurrent: selectedCategoryId === "all",
        isPinned: false,
        canPin: false,
      });

      // 3. Add "Uncategorized" (matching popup.js)
      entries.push({
        id: "none",
        categoryId: "none",
        label: "Uncategorized",
        icon: "📋",
        isCurrent: selectedCategoryId === "none" || selectedCategoryId === "",
        isPinned: false,
        canPin: false,
      });
    }

    // 3b. Add "All categories (hidden)" and "Uncategorize (hidden)" for hidden mode
    if (showHidden >= 1) {
      entries.push({
        id: "all_hidden",
        categoryId: "all_hidden",
        label: "All categories (hidden)",
        icon: "👁️",
        isCurrent: selectedCategoryId === "all_hidden",
        isPinned: false,
        canPin: false,
      });
      entries.push({
        id: "hidden_none",
        categoryId: "hidden_none",
        label: "Uncategorize (hidden)",
        icon: "🙈",
        isCurrent: selectedCategoryId === "hidden_none",
        isPinned: false,
        canPin: false,
      });
    }

    // 4. Add regular categories with correct isPinned state
    sortedCategories.forEach((cat) => {
      if (showHidden === 2 && !cat.hidden) return; // Skip non-hidden categories in show hidden only mode
      const rawName = cat.name ? String(cat.name) : "(untitled)";
      const displayName = cat.hidden ? `${rawName} (hidden)` : rawName;
      entries.push({
        id: cat.id,
        categoryId: cat.id,
        label: displayName,
        icon: cat.icon || "",
        isCurrent: selectedCategoryId === String(cat.id),
        isPinned: pinnedSet.has(String(cat.id)),
        canPin: true,
      });
    });

    return entries;
  }

  function positionLinkSaveCategoryChooser(panel, clientX, clientY) {
    if (!panel) return;
    const margin = 12;
    const anchorX =
      Number.isFinite(clientX) && clientX >= 0
        ? clientX
        : window.innerWidth - 40;
    const anchorY =
      Number.isFinite(clientY) && clientY >= 0
        ? clientY
        : window.innerHeight - 40;
    panel.style.left = "0px";
    panel.style.top = "0px";
    panel.style.visibility = "hidden";
    const rect = panel.getBoundingClientRect();
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    const left = Math.min(Math.max(anchorX + 10, margin), maxLeft);
    const preferredTop = anchorY + 10;
    const fallbackTop = anchorY - rect.height - 10;
    const top =
      preferredTop <= maxTop
        ? preferredTop
        : Math.min(Math.max(fallbackTop, margin), maxTop);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.visibility = "visible";
  }

  function sendShortcutSavedLinkMessage(payload) {
    return new Promise((resolve, reject) => {
      try {
        lpApi.runtime.sendMessage(payload, (response) => {
          if (lpApi.runtime.lastError) {
            // Ignore "receiving end does not exist" — biasa berlaku bila background restart
            resolve({ ok: false, error: lpApi.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false });
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  async function toggleCurrentPageFavorite() {
    const nextFavorite = !isCurrentPageFavorite;
    try {
      const response = await sendShortcutSavedLinkMessage(
        nextFavorite
          ? {
              type: "save-current-tab",
              favorite: true,
            }
          : {
              type: "save-link-url",
              url: window.location.href,
              title: document.title,
              favorite: false,
            },
      );
      if (response && response.ok) {
        isCurrentPageSaved = true;
        isCurrentPageFavorite = response.favorite === true;
        updateSaveBtnUI();
        updateFavoriteBtnUI();
        if (nextFavorite) {
          const catName = response.categoryName ? String(response.categoryName) : "";
          const catId = response.categoryId ? String(response.categoryId) : "";
          if (catName) {
            showSavedLinkToast(catName, catId);
          } else {
            showLinkToast("Saved to Favorite");
          }
        } else {
          showLinkToast("Removed from Favorite");
        }
        return true;
      }
    } catch (err) {
      // ignore and fall through to error toast
    }
    showLinkToast(
      nextFavorite
        ? "Failed to save current page to Favorite"
        : "Failed to unfavorite current page",
    );
    return false;
  }

  async function persistLinkSavePinnedCategoryIds(nextIds) {
    const normalized = normalizeLinkSavePinnedCategoryIds(nextIds);
    const data = await lpApi.storage.local.get(SETTINGS_KEY);
    const settings =
      data && data[SETTINGS_KEY] && typeof data[SETTINGS_KEY] === "object"
        ? { ...data[SETTINGS_KEY] }
        : {};
    settings.linkSavePinnedCategoryIds = normalized;
    linkSavePinnedCategoryIds = normalized.slice();
    await lpApi.storage.local.set({ [SETTINGS_KEY]: settings });
    return linkSavePinnedCategoryIds.slice();
  }

  async function toggleLinkSavePinnedCategory(categoryId) {
    const normalizedId = categoryId ? String(categoryId).trim() : "";
    if (!normalizedId) return linkSavePinnedCategoryIds.slice();
    const nextIds = normalizeLinkSavePinnedCategoryIds(linkSavePinnedCategoryIds);
    const existingIndex = nextIds.indexOf(normalizedId);
    if (existingIndex >= 0) {
      nextIds.splice(existingIndex, 1);
    } else {
      nextIds.unshift(normalizedId);
    }
    return persistLinkSavePinnedCategoryIds(nextIds);
  }

  async function saveShortcutLinkToCategory(payload, useActiveCategory = false) {
    const now = Date.now();
    if (saveInProgress || now - lastSaveTime < SAVE_DEBOUNCE_MS) {
      return false;
    }
    const safePayload = payload && typeof payload === "object" ? payload : {};
    saveInProgress = true;
    try {
      const message = {
        type: "save-link-url",
        url: safePayload.url ? String(safePayload.url) : "",
        title: safePayload.title ? String(safePayload.title) : "",
        thumbnailUrl: safePayload.thumbnailUrl ? String(safePayload.thumbnailUrl) : "",
        useActiveCategory: useActiveCategory === true,
      };
      if (!useActiveCategory && Object.prototype.hasOwnProperty.call(safePayload, "categoryId")) {
        message.categoryId = String(safePayload.categoryId || "");
      }
      if (Object.prototype.hasOwnProperty.call(safePayload, "favorite")) {
        message.favorite = safePayload.favorite === true;
      }
      const response = await sendShortcutSavedLinkMessage(message);
      lastSaveTime = Date.now();
      saveInProgress = false;
      if (response && response.ok) {
        const catName = response.categoryName ? String(response.categoryName) : "";
        const catId = response.categoryId ? String(response.categoryId) : "";
        if (catName) {
          showSavedLinkToast(catName, catId);
        } else {
          showLinkToast("Saved to Local Pocket");
        }
        return true;
      }
    } catch (err) {
      lastSaveTime = Date.now();
      saveInProgress = false;
      // ignore and fall through to error toast
    }
    showLinkToast("Failed to save link");
    return false;
  }

  async function openQuickLinkSaveCategoryChooser(inputs) {
    const payloads = Array.isArray(inputs) ? inputs : [inputs];
    const safeInput = payloads[0] && typeof payloads[0] === "object" ? payloads[0] : {};
    const url = safeInput.url ? String(safeInput.url) : "";
    if (!url) return false;

    let entries = [];
    try {
      entries = await loadQuickLinkSaveCategoryEntries();
    } catch (err) {
      entries = [
        {
          id: "",
          categoryId: "",
          label: "Uncategorized",
          isCurrent: true,
          isPinned: false,
          canPin: false,
        },
      ];
    }

    if (entries.length <= 1) {
      let ok = true;
      for (const p of payloads) {
        const success = await saveShortcutLinkToCategory({
          url: p.url,
          title: p.title ? String(p.title) : "",
          categoryId: "",
          categoryLabel: "Uncategorized",
        });
        if (!success) ok = false;
      }
      if (payloads.length > 1) {
        showLinkToast(`Saved ${payloads.length} links to Uncategorized`);
      }
      return ok;
    }

    closeLinkSaveCategoryChooser();

    const colors = themeColors || resolveThemeColors(themePreset);
    const overlay = document.createElement("div");
    overlay.id = "__pocket_link_save_category_chooser";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "2147483646";
    overlay.style.background = "transparent";

    const panel = document.createElement("div");
    panel.style.position = "fixed";
    panel.style.width = "min(280px, calc(100vw - 24px))";
    panel.style.maxHeight = "min(60vh, 320px)";
    panel.style.padding = "10px";
    panel.style.borderRadius = "14px";
    panel.style.border = `1px solid ${colors.border || "rgba(255,255,255,0.16)"}`;
    panel.style.background =
      colors.panelAlt || colors.panel || "rgba(18,18,18,0.94)";
    panel.style.boxShadow = "0 18px 40px rgba(0,0,0,0.38)";
    panel.style.backdropFilter = "blur(10px)";
    panel.style.color = colors.text || "#fff";
    panel.style.fontFamily =
      "\"Space Grotesk\", \"Avenir Next\", \"Segoe UI\", sans-serif";
    panel.style.opacity = "0";
    panel.style.transform = "translateY(6px)";
    panel.style.transition = "opacity 140ms ease, transform 140ms ease";
    panel.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.gap = "12px";
    header.style.marginBottom = "8px";

    const title = document.createElement("div");
    title.textContent = "Simpan link ke";
    title.style.fontSize = "13px";
    title.style.fontWeight = "700";
    title.style.letterSpacing = "0.01em";

    // Butang mata — toggle show/hide hidden categories (sama seperti picker)
    let chooserShowHidden = 0;
    try {
      const d = await lpApi.storage.local.get(SETTINGS_KEY);
      chooserShowHidden = (d && d[SETTINGS_KEY] && d[SETTINGS_KEY].showHiddenCategories) || 0;
    } catch (_) {}

    const eyeBtn = document.createElement("button");
    eyeBtn.type = "button";
    eyeBtn.style.cssText = `
      background: none;
      border: none;
      cursor: pointer;
      font-size: 15px;
      line-height: 1;
      padding: 2px 5px;
      border-radius: 6px;
      transition: background 0.12s ease;
      outline: none;
      flex: 0 0 auto;
    `;
    function updateChooserEyeBtn(state) {
      if (state === 2) {
        eyeBtn.textContent = "🙈";
        eyeBtn.title = "Hanya hidden — klik untuk balik normal";
      } else if (state === 1 || state === true) {
        eyeBtn.textContent = "👁️‍🗨️";
        eyeBtn.title = "Papar semua — klik untuk hanya hidden";
      } else {
        eyeBtn.textContent = "👁️";
        eyeBtn.title = "Normal — klik untuk papar hidden";
      }
    }
    updateChooserEyeBtn(chooserShowHidden);
    eyeBtn.addEventListener("mouseover", () => { eyeBtn.style.background = "rgba(255,255,255,0.1)"; });
    eyeBtn.addEventListener("mouseout", () => { eyeBtn.style.background = "none"; });
    eyeBtn.addEventListener("click", async () => {
      let next = chooserShowHidden === true || chooserShowHidden === 1 ? 2 : chooserShowHidden === 2 ? 0 : 1;
      try {
        const d = await lpApi.storage.local.get(SETTINGS_KEY);
        const s = d && d[SETTINGS_KEY] ? d[SETTINGS_KEY] : {};
        s.showHiddenCategories = next;
        await lpApi.storage.local.set({ [SETTINGS_KEY]: s });
      } catch (_) {}
      await openQuickLinkSaveCategoryChooser(safeInput);
    });
    eyeBtn.addEventListener("wheel", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      let next;
      if (e.deltaY < 0) {
        next = chooserShowHidden === 0 ? 2 : chooserShowHidden === 1 ? 0 : 1;
      } else {
        next = chooserShowHidden === true || chooserShowHidden === 1 ? 2 : chooserShowHidden === 2 ? 0 : 1;
      }
      try {
        const d = await lpApi.storage.local.get(SETTINGS_KEY);
        const s = d && d[SETTINGS_KEY] ? d[SETTINGS_KEY] : {};
        s.showHiddenCategories = next;
        await lpApi.storage.local.set({ [SETTINGS_KEY]: s });
      } catch (_) {}
      await openQuickLinkSaveCategoryChooser(safeInput);
    }, { passive: false });

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Tutup";
    closeButton.style.border = `1px solid ${colors.border || "rgba(255,255,255,0.16)"}`;
    closeButton.style.background = "transparent";
    closeButton.style.color = colors.muted || colors.text || "#d1d5db";
    closeButton.style.borderRadius = "999px";
    closeButton.style.padding = "4px 10px";
    closeButton.style.fontSize = "11px";
    closeButton.style.cursor = "pointer";
    closeButton.addEventListener("click", () => {
      closeLinkSaveCategoryChooser();
    });

    header.append(title, eyeBtn, closeButton);

    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "7px";
    list.style.maxHeight = "min(48vh, 250px)";
    list.style.overflowY = "auto";
    list.style.overscrollBehavior = "contain";
    list.style.paddingRight = "2px";

    let saving = false;
    let firstActionButton = null;
    const chooserActionEntries = [];
    let chooserTypeBuffer = "";
    let chooserTypeBufferTimer = null;
    let chooserLastTypeAt = 0;
    const CHOOSER_TYPEAHEAD_RESET_MS = 900;

    function clearChooserTypeBuffer() {
      chooserTypeBuffer = "";
      chooserLastTypeAt = 0;
      if (chooserTypeBufferTimer) {
        clearTimeout(chooserTypeBufferTimer);
        chooserTypeBufferTimer = null;
      }
    }

    function queueChooserTypeBufferReset() {
      if (chooserTypeBufferTimer) {
        clearTimeout(chooserTypeBufferTimer);
      }
      chooserTypeBufferTimer = setTimeout(() => {
        chooserTypeBuffer = "";
        chooserLastTypeAt = 0;
        chooserTypeBufferTimer = null;
      }, CHOOSER_TYPEAHEAD_RESET_MS);
    }

    function focusQuickLinkChooserAction(entry) {
      if (!entry || !entry.button) return false;
      try {
        entry.button.focus({ preventScroll: true });
      } catch (err) {
        try {
          entry.button.focus();
        } catch (focusErr) {
          return false;
        }
      }
      if (typeof entry.button.scrollIntoView === "function") {
        try {
          entry.button.scrollIntoView({ block: "nearest" });
        } catch (err) {
          // ignore
        }
      }
      return true;
    }

    function focusQuickLinkChooserMatch(query, options = {}) {
      const safeQuery = normalizeQuickLinkChooserSearchText(query);
      if (!safeQuery) return false;
      const matches = chooserActionEntries.filter((entry) =>
        quickLinkChooserLabelMatches(entry.searchLabel, safeQuery),
      );
      if (!matches.length) return false;
      let targetEntry = matches[0];
      if (options && options.cycle) {
        const activeIndex = chooserActionEntries.findIndex(
          (entry) => entry && entry.button === document.activeElement,
        );
        if (activeIndex >= 0) {
          targetEntry = matches.find((entry) => entry.index > activeIndex) || matches[0];
        }
      }
      return focusQuickLinkChooserAction(targetEntry);
    }

    entries.forEach((entry) => {
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = entry.canPin ? "1fr auto" : "1fr";
      row.style.gap = "6px";
      row.style.alignItems = "stretch";

      const action = document.createElement("button");
      action.type = "button";
      action.style.display = "flex";
      action.style.alignItems = "center";
      action.style.justifyContent = "space-between";
      action.style.gap = "10px";
      action.style.width = "100%";
      action.style.borderRadius = "10px";
      action.style.border = `1px solid ${entry.isCurrent ? (colors.accent || "#5ac8ff") : (colors.border || "rgba(255,255,255,0.16)")}`;
      action.style.background = entry.isCurrent
        ? "rgba(255,255,255,0.08)"
        : "rgba(255,255,255,0.03)";
      action.style.color = colors.text || "#fff";
      action.style.padding = "9px 10px";
      action.style.cursor = "pointer";
      action.style.textAlign = "left";

      const label = document.createElement("span");
      label.textContent = entry.label;
      label.style.flex = "1 1 auto";
      label.style.minWidth = "0";
      label.style.whiteSpace = "nowrap";
      label.style.overflow = "hidden";
      label.style.textOverflow = "ellipsis";
      label.style.fontSize = "13px";
      label.style.fontWeight = entry.isCurrent ? "700" : "600";

      action.appendChild(label);

      if (entry.isCurrent) {
        const badge = document.createElement("span");
        badge.textContent = "Semasa";
        badge.style.flex = "0 0 auto";
        badge.style.padding = "3px 7px";
        badge.style.borderRadius = "999px";
        badge.style.background = colors.accent || "#5ac8ff";
        badge.style.color =
          themePreset === "minimal" || themePreset === "pastel"
            ? "#ffffff"
            : "#07121a";
        badge.style.fontSize = "10px";
        badge.style.fontWeight = "700";
        action.appendChild(badge);
      }

      action.addEventListener("click", async () => {
        if (saving) return;
        saving = true;
        action.disabled = true;
        const resolvedCategoryId = Object.prototype.hasOwnProperty.call(entry, "categoryId")
          ? String(entry.categoryId || "")
          : String(entry.id || "");
        
        let ok = true;
        for (const p of payloads) {
          const success = await saveShortcutLinkToCategory({
            url: p.url,
            title: p.title ? String(p.title) : "",
            categoryId: resolvedCategoryId,
            categoryLabel: entry.label,
            saveLabel: entry.favorite === true ? entry.label : "",
            favorite: entry.favorite === true,
          });
          if (!success) ok = false;
        }

        saving = false;
        if (ok) {
          closeLinkSaveCategoryChooser();
          if (payloads.length > 1) {
            showLinkToast(`Saved ${payloads.length} links to ${entry.label}`);
          }
          return;
        }
        action.disabled = false;
      });

      row.appendChild(action);

      if (entry.canPin) {
        const pinButton = document.createElement("button");
        pinButton.type = "button";
        pinButton.textContent = entry.isPinned ? "Pinned" : "Pin";
        pinButton.title = entry.isPinned
          ? `Nyahpin ${entry.label}`
          : `Pin ${entry.label}`;
        pinButton.style.borderRadius = "10px";
        pinButton.style.border = `1px solid ${entry.isPinned ? (colors.accent || "#5ac8ff") : (colors.border || "rgba(255,255,255,0.16)")}`;
        pinButton.style.background = entry.isPinned
          ? "rgba(255,255,255,0.1)"
          : "rgba(255,255,255,0.03)";
        pinButton.style.color = colors.text || "#fff";
        pinButton.style.padding = "0 10px";
        pinButton.style.fontSize = "11px";
        pinButton.style.fontWeight = "700";
        pinButton.style.cursor = "pointer";
        pinButton.style.minWidth = "58px";
        pinButton.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (saving) return;
          pinButton.disabled = true;
          try {
            await toggleLinkSavePinnedCategory(entry.id);
            await openQuickLinkSaveCategoryChooser(safeInput);
          } catch (err) {
            pinButton.disabled = false;
            showLinkToast("Failed to update pin");
          }
        });
        row.appendChild(pinButton);
      }

      if (!firstActionButton) {
        firstActionButton = action;
      }
      chooserActionEntries.push({
        index: chooserActionEntries.length,
        button: action,
        searchLabel: entry.label,
      });
      list.appendChild(row);
    });

    const hint = document.createElement("div");
    hint.textContent = "Tekan huruf awal kategori untuk lompat, Enter untuk pilih, ulang huruf untuk cycle. Favorite akan simpan ke Uncategorized. Esc atau klik luar untuk tutup";
    hint.style.marginTop = "8px";
    hint.style.fontSize = "11px";
    hint.style.color = colors.muted || "rgba(255,255,255,0.7)";

    panel.append(header, list, hint);
    overlay.appendChild(panel);
    (document.body || document.documentElement).appendChild(overlay);
    positionLinkSaveCategoryChooser(
      panel,
      Number(safeInput.clientX),
      Number(safeInput.clientY),
    );
    requestAnimationFrame(() => {
      panel.style.opacity = "1";
      panel.style.transform = "translateY(0)";
    });

    const handleDocumentKeydown = (event) => {
      if (!event) return;
      const isEscapeOrEnter = event.key === "Escape" || event.key === "Esc" || event.key === "Enter";
      const key = event.key ? String(event.key) : "";
      const isPrintable = key.length === 1;

      if (isEscapeOrEnter || (isPrintable && !event.ctrlKey && !event.altKey && !event.metaKey)) {
        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
        event.stopPropagation();
      }

      if (event.key === "Escape" || event.key === "Esc") {
        event.preventDefault();
        clearChooserTypeBuffer();
        closeLinkSaveCategoryChooser();
        return;
      }
      if (event.key === "Enter" && !event.ctrlKey && !event.altKey && !event.metaKey) {
        const activeEntry = chooserActionEntries.find(
          (entry) => entry && entry.button === document.activeElement,
        );
        const targetButton = activeEntry && activeEntry.button
          ? activeEntry.button
          : firstActionButton;
        if (targetButton && !saving && !targetButton.disabled) {
          event.preventDefault();
          targetButton.click();
        }
        return;
      }
      if (event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        return;
      }
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (key.length !== 1 || !/\S/.test(key)) return;
      const normalizedKey = normalizeQuickLinkChooserSearchText(key);
      if (!normalizedKey) return;
      const now = Date.now();
      const withinBufferWindow =
        chooserTypeBuffer
        && chooserLastTypeAt
        && now - chooserLastTypeAt <= CHOOSER_TYPEAHEAD_RESET_MS;
      const shouldCycleCurrentPrefix =
        withinBufferWindow
        && chooserTypeBuffer.length === 1
        && chooserTypeBuffer === normalizedKey;
      let nextQuery = normalizedKey;
      let matched = false;
      if (shouldCycleCurrentPrefix) {
        matched = focusQuickLinkChooserMatch(normalizedKey, { cycle: true });
      } else {
        nextQuery = withinBufferWindow ? chooserTypeBuffer + normalizedKey : normalizedKey;
        matched = focusQuickLinkChooserMatch(nextQuery);
        if (!matched && nextQuery.length > 1) {
          nextQuery = normalizedKey;
          matched = focusQuickLinkChooserMatch(nextQuery, { cycle: true });
        }
      }
      event.preventDefault();
      if (!matched) {
        clearChooserTypeBuffer();
        return;
      }
      chooserTypeBuffer = nextQuery;
      chooserLastTypeAt = now;
      queueChooserTypeBufferReset();
    };
    const handleViewportResize = () => {
      clearChooserTypeBuffer();
      closeLinkSaveCategoryChooser();
    };
    linkSaveCategoryChooserCleanup = () => {
      clearChooserTypeBuffer();
      window.removeEventListener("keydown", handleDocumentKeydown, true);
      window.removeEventListener("resize", handleViewportResize, true);
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    };
    overlay.addEventListener("click", () => {
      closeLinkSaveCategoryChooser();
    });
    window.addEventListener("keydown", handleDocumentKeydown, true);
    window.addEventListener("resize", handleViewportResize, true);
    if (firstActionButton) {
      firstActionButton.focus();
    }
    return true;
  }

  function resolveIconSrc() {
    if (floatingIconPath) {
      if (floatingIconPath.startsWith("data:")) {
        const url = dataUrlToObjectUrl(floatingIconPath);
        return url || floatingIconPath;
      }
      if (floatingIconPath.startsWith("custom:")) {
        const key = floatingIconPath.slice("custom:".length);
        const entry = customIcons.find((c) => c && c.id === key);
        if (entry && entry.dataUrl) {
          const url = dataUrlToObjectUrl(entry.dataUrl);
          return url || entry.dataUrl;
        }
        return lpApi.runtime.getURL(DEFAULT_ICON_FILE);
      }
      return lpApi.runtime.getURL(floatingIconPath);
    }
    return lpApi.runtime.getURL(DEFAULT_ICON_FILE);
  }

  function dataUrlToObjectUrl(dataUrl) {
    try {
      const parts = dataUrl.split(",");
      if (parts.length < 2) return dataUrl;
      const match = parts[0].match(/data:(.*?);base64/);
      const mime = match && match[1] ? match[1] : "image/png";
      const binary = atob(parts[1]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      if (customIconObjectUrl) {
        URL.revokeObjectURL(customIconObjectUrl);
      }
      customIconObjectUrl = URL.createObjectURL(
        new Blob([bytes], { type: mime }),
      );
      return customIconObjectUrl;
    } catch (err) {
      log("[Floating] Failed to convert data URL to object URL:", err);
      return dataUrl;
    }
  }

  function clampOffsetsToViewport(btnWidth, btnHeight) {
    // Ensure offsets keep the button fully visible after size changes (from top-left origin).
    const maxOffsetX = Math.max(
      0,
      Math.round(window.innerWidth - btnWidth - VIEWPORT_MARGIN),
    );
    const maxOffsetY = Math.max(
      0,
      Math.round(window.innerHeight - btnHeight - VIEWPORT_MARGIN),
    );
    let changed = false;

    const clampedOffsetX = Math.min(
      Math.max(floatingButtonOffsetX, 0),
      maxOffsetX,
    );
    if (clampedOffsetX !== floatingButtonOffsetX) {
      floatingButtonOffsetX = clampedOffsetX;
      changed = true;
    }
    const clampedOffsetY = Math.min(
      Math.max(floatingButtonOffsetY, 0),
      maxOffsetY,
    );
    if (clampedOffsetY !== floatingButtonOffsetY) {
      floatingButtonOffsetY = clampedOffsetY;
      changed = true;
    }
    return changed;
  }

  function getRenderedButtonPosition() {
    if (
      temporaryButtonPosition &&
      Number.isFinite(temporaryButtonPosition.left) &&
      Number.isFinite(temporaryButtonPosition.top)
    ) {
      return {
        left: temporaryButtonPosition.left,
        top: temporaryButtonPosition.top,
      };
    }
    return {
      left: floatingButtonOffsetX,
      top: floatingButtonOffsetY,
    };
  }

  function applyContainerPosition(container, left, top) {
    if (!container) return;
    container.style.left = Math.round(left) + "px";
    container.style.right = "auto";
    container.style.top = Math.round(top) + "px";
    container.style.bottom = "auto";
    container.style.transform = "none";
  }

  function syncContainerPosition() {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;
    const position = getRenderedButtonPosition();
    applyContainerPosition(container, position.left, position.top);
  }

  function setTemporaryButtonPositionFromPoint(clientX, clientY) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
    const btnWidth = floatingButtonWidth || DEFAULT_BTN_SIZE;
    const btnHeight = floatingButtonHeight || DEFAULT_BTN_SIZE;
    const left = Math.round(
      Math.min(
        Math.max(clientX - btnWidth / 2, VIEWPORT_MARGIN),
        Math.max(
          VIEWPORT_MARGIN,
          window.innerWidth - btnWidth - VIEWPORT_MARGIN,
        ),
      ),
    );
    const top = Math.round(
      Math.min(
        Math.max(clientY - btnHeight / 2, VIEWPORT_MARGIN),
        Math.max(
          VIEWPORT_MARGIN,
          window.innerHeight - btnHeight - VIEWPORT_MARGIN,
        ),
      ),
    );
    temporaryButtonPosition = { left, top };
    syncContainerPosition();
  }

  function clearTemporaryButtonPosition() {
    if (!temporaryButtonPosition) return;
    temporaryButtonPosition = null;
    syncContainerPosition();
  }

  function cancelLongPressTracking(clearSuppressedClick) {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (longPressSelectionHandler) {
      document.removeEventListener("selectionchange", longPressSelectionHandler);
      longPressSelectionHandler = null;
    }
    longPressTracking = false;
    longPressIsRightButton = false;
    longPressTimerFired = false;
    if (clearSuppressedClick) {
      longPressPendingReleaseClick = false;
      longPressSuppressClickUntil = 0;
    }
  }

  function shouldIgnoreLongPressTarget(target) {
    const element =
      target && target.nodeType === 1
        ? target
        : target && target.parentElement
          ? target.parentElement
          : null;
    if (!element) return false;
    // Never start long press tracking on the extension's own UI
    const pocketUi = document.getElementById(CONTAINER_ID);
    if (pocketUi && pocketUi.contains(element)) return true;
    const rediscoverToast = document.getElementById("__pocket_rediscover_toast");
    if (rediscoverToast && rediscoverToast.contains(element)) return true;
    const pomoRoot = document.getElementById("pomodoro-overlay-root");
    if (pomoRoot && pomoRoot.contains(element)) return true;
    // Skip all form elements and editable content
    if (element.isContentEditable) return true;
    if (element.closest("input, textarea, select, option, label")) return true;
    // Skip all interactive page elements so we don't block their click/mousedown
    if (element.closest("a[href], button, [role='button'], [role='link'], [role='menuitem'], [role='tab'], [role='option']")) return true;
    // Allow long-press on video/audio when in fullscreen mode
    if (element.closest("video, audio, canvas, embed, object") && !(document.fullscreenElement || document.webkitFullscreenElement)) return true;
    if (element.closest("img, svg, picture, figure")) return true;
    if (element.closest("[onclick], [draggable='true'], summary, details")) return true;
    // Skip elements that have their own pointer handlers (tabindex makes elements interactive)
    const closest = element.closest("[tabindex]");
    if (closest && closest.getAttribute("tabindex") !== "-1") return true;
    // Skip media player controls that are outside the <video>/<audio> element (e.g. YouTube controls)
    if (element.closest("[role='slider'], [role='progressbar'], [role='scrollbar'], [role='spinbutton']")) return true;
    if (element.closest(".ytp-progress-bar, .ytp-chrome-bottom, .ytp-chrome-top, .ytp-play-button, .ytp-volume-panel")) return true;
    // Skip if there is an active text selection — user is likely selecting text, not long-pressing
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const selRange = sel.getRangeAt(0);
      if (selRange && selRange.intersectsNode(element)) return true;
    }
    return false;
  }

  function hasTextSelection() {
    try {
      const sel = window.getSelection();
      return sel && !sel.isCollapsed && sel.toString().trim().length > 0;
    } catch (e) {
      return false;
    }
  }

  function isCursorTextCursor(x, y) {
    try {
      const el = document.elementFromPoint(x, y);
      if (!el) return false;
      
      // Check if element is editable (textarea, input, contenteditable)
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return true;
      if (el.isContentEditable) return true;
      
      // Check computed cursor style
      const computedStyle = window.getComputedStyle(el);
      const cursor = computedStyle ? computedStyle.cursor : '';
      
      // Text-related cursor values
      const textCursors = ['text', 'vertical-text'];
      return textCursors.includes(cursor);
    } catch (e) {
      return false;
    }
  }

  function isClickOnScrollbar(e) {
    const el = e.target;
    if (el.scrollHeight > el.clientHeight) {
      const rect = el.getBoundingClientRect();
      const sbWidth = el.offsetWidth - el.clientWidth;
      if (sbWidth > 0 && e.clientX >= rect.right - sbWidth) return true;
    }
    return false;
  }

  function getLongPressMoveTolerance() {
    const minMs = Math.min(categoryPickerLongPressTriggerMs, longPressTriggerMs);
    return Math.max(3, Math.min(LONG_PRESS_MOVE_CANCEL_PX, Math.round(minMs / 30)));
  }

  function beginLongPressTracking(event, isRightButton) {

    cancelLongPressTracking(false);
    longPressRightActionAt = 0;
    longPressPendingReleaseClick = false;
    longPressTracking = true;
    longPressIsRightButton = isRightButton === true;
    longPressTimerFired = false;
    longPressStartX = event.clientX;
    longPressStartY = event.clientY;
    const targetIsRightButton = longPressIsRightButton;
    const targetAction = getActionForButton(targetIsRightButton);

    // Cancel if text is selected or gesture is active
    if (targetAction === "category-picker" && (hasTextSelection() || categoryPickerGestureActive)) {
      longPressTracking = false;
      return;
    }

    const executeAction = () => {
      longPressTimer = null;
      longPressTimerFired = true;
      var inFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (
        !longPressTracking ||
        floatingSuppressed ||
        (!inFullscreen && floatingButtonVisibilityMode !== "longpress")
      ) {
        longPressTracking = false;
        return;
      }
      longPressTracking = false;
      if (targetAction === "category-picker") {
        if (enableCategoryPicker === false) {
          longPressTracking = false;
          return;
        }
        if (hasTextSelection()) {
          longPressTracking = false;
          return;
        }
        if (blockPickerOnTextCursor && isCursorTextCursor(longPressStartX, longPressStartY)) {
          log("[Floating] Long press ignored: cursor is over text-editable area");
          longPressTracking = false;
          return;
        }
        longPressPendingReleaseClick = true;
        try {
          const result = lpApi.runtime.sendMessage({
            type: "open-category-picker",
          });
          if (result && typeof result.then === "function") {
            result.catch((err) => {
              if (err) {
                console.warn(
                  "[Floating] Category picker failed:",
                  err.message || err,
                );
              }
            });
          }
        } catch (err) {
          console.warn(
            "[Floating] Category picker failed:",
            err && err.message ? err.message : err,
          );
        }
      } else {
        if (isVisible) {
          longPressPendingReleaseClick = true;
          return;
        }
        setTemporaryButtonPositionFromPoint(longPressStartX, longPressStartY);
        longPressPendingReleaseClick = true;
        window.showPocket();
      }
      if (targetIsRightButton) {
        longPressRightActionAt = Date.now();
      }
    };

    if (targetAction === "category-picker") {
      longPressTimer = setTimeout(executeAction, categoryPickerLongPressTriggerMs);
    } else {
      longPressTimer = setTimeout(executeAction, longPressTriggerMs);
    }
    longPressSelectionHandler = () => {
      if (hasTextSelection()) {
        cancelLongPressTracking(false);
      }
    };
    document.addEventListener("selectionchange", longPressSelectionHandler, { passive: true });
  }

  function toggleLongPressGesture() {
    longPressGestureEnabled = !longPressGestureEnabled;
    cancelLongPressTracking(true);
    showLinkToast((longPressGestureEnabled ? "✅ " : "❌ ") + (longPressGestureEnabled ? "Gesture Diaktifkan" : "Gesture Dimatikan"));
    lpApi.storage.local.get(SETTINGS_KEY).then((data) => {
      const settings = data && typeof data[SETTINGS_KEY] === "object" ? data[SETTINGS_KEY] : {};
      settings.longPressGestureEnabled = longPressGestureEnabled;
      lpApi.storage.local.set({ [SETTINGS_KEY]: settings });
    });
  }

  // ── Button 5 (forward) Category Scroller ──────────────────────────
  function getButton5FilteredCategories(mode, allEntries) {
    if (mode === 1) {
      return allEntries.filter(e => e.label && e.label.includes("(hidden)"));
    }
    // mode 0 = Normal: exclude hidden
    return allEntries.filter(e => !e.label || !e.label.includes("(hidden)"));
  }

  function showButton5CategoryScroller() {
    if (button5ScrollerActive) return;
    button5ScrollerActive = true;

    // Always load ALL categories (including hidden) so scroller mode filter works
    lpApi.storage.local.get([CATEGORY_KEY, SELECTED_CATEGORY_KEY]).then((data) => {
      if (!button5ScrollerActive) return;

      const selectedCategoryId = data && data[SELECTED_CATEGORY_KEY]
        ? String(data[SELECTED_CATEGORY_KEY]) : "all";
      const categories = data && data[CATEGORY_KEY] ? data[CATEGORY_KEY] : [];

      const allEntries = [];
      allEntries.push({
        id: "all", categoryId: "all", label: "All categories",
        isCurrent: selectedCategoryId === "all", isPinned: false,
      });
      allEntries.push({
        id: "hidden_all", categoryId: "hidden_all", label: "All categories (hidden)",
        isCurrent: selectedCategoryId === "hidden_all", isPinned: false,
      });
      allEntries.push({
        id: "none", categoryId: "none", label: "Uncategorized",
        isCurrent: selectedCategoryId === "none" || selectedCategoryId === "", isPinned: false,
      });
      allEntries.push({
        id: "hidden_none", categoryId: "hidden_none", label: "Uncategorized (hidden)",
        isCurrent: selectedCategoryId === "hidden_none", isPinned: false,
      });

      categories.forEach((cat) => {
        if (!cat || !cat.id) return;
        const rawName = cat.name ? String(cat.name) : "(untitled)";
        const displayName = cat.hidden ? rawName + " (hidden)" : rawName;
        allEntries.push({
          id: cat.id, categoryId: cat.id, label: displayName,
          isCurrent: selectedCategoryId === cat.id, isPinned: false,
        });
      });

      button5ScrollerAllCategories = allEntries;
      button5ScrollerCategories = getButton5FilteredCategories(button5ScrollerMode, allEntries);
      button5ScrollerCurrentIndex = button5ScrollerCategories.findIndex(e => e.isCurrent);
      if (button5ScrollerCurrentIndex < 0) button5ScrollerCurrentIndex = 0;

      const overlay = document.createElement("div");
      overlay.id = "__pocket_btn5_scroller";

      const backdrop = document.createElement("div");
      backdrop.id = "__pocket_btn5_scroller_backdrop";
      backdrop.addEventListener("click", (e) => {
        e.stopPropagation();
        hideButton5CategoryScroller(false);
      });

      const panel = document.createElement("div");
      panel.id = "__pocket_btn5_scroller_panel";

      // Mode tabs
      const modeBar = document.createElement("div");
      modeBar.className = "__pocket_btn5_modebar";

      function _renderModeTabs() {
        modeBar.replaceChildren();
        ["Normal", "Hidden"].forEach((lbl, i) => {
          const tab = document.createElement("div");
          tab.className = "__pocket_btn5_mode_tab" + (i === button5ScrollerMode ? " active" : "");
          tab.textContent = lbl;
          tab.addEventListener("click", (e) => {
            e.stopPropagation();
            if (i !== button5ScrollerMode) {
              button5ScrollerMode = i;
              _saveButton5ScrollerMode(i);
              button5ScrollerCategories = getButton5FilteredCategories(i, button5ScrollerAllCategories);
              button5ScrollerCurrentIndex = button5ScrollerCategories.findIndex(x => x.isCurrent);
              if (button5ScrollerCurrentIndex < 0) button5ScrollerCurrentIndex = 0;
              renderButton5ScrollerList();
            }
          });
          modeBar.appendChild(tab);
        });
      }
      _renderModeTabs();

      // Horizontal scroll area
      const scrollArea = document.createElement("div");
      scrollArea.className = "__pocket_btn5_scroll_area";

      button5ScrollerCategories.forEach((entry, idx) => {
        const item = document.createElement("div");
        item.className = "__pocket_btn5_item" + (idx === button5ScrollerCurrentIndex ? " active" : "");
        item.dataset.idx = idx;

        const dot = document.createElement("span");
        dot.className = "__pocket_btn5_dot";

        const label = document.createElement("span");
        label.textContent = entry.label || entry.id;

        item.append(dot, label);

        // Click to select
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          button5ScrollerCurrentIndex = idx;
          hideButton5CategoryScroller(true);
        });

        scrollArea.appendChild(item);
      });

      // Slow down wheel scrolling — satu item per tick
      scrollArea.addEventListener("wheel", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const items = scrollArea.children;
        if (!items.length) return;
        const itemWidth = items[0].offsetWidth + 6;
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        const direction = delta > 0 ? 1 : -1;
        scrollArea.scrollBy({ left: direction * itemWidth, behavior: "auto" });
      }, { passive: false });

      const hint = document.createElement("div");
      hint.className = "__pocket_btn5_hint";
      hint.textContent = "← → kategori · Scroll pilih · Enter sahkan · Esc tutup";

      panel.append(modeBar, scrollArea, hint);
      overlay.append(backdrop, panel);
      document.body.appendChild(overlay);
      button5ScrollerDom = { overlay, backdrop, panel, scrollArea, modeBar, _renderModeTabs };

      requestAnimationFrame(() => {
        // Scroll active item into view
        const activeItem = scrollArea.querySelector(".active");
        if (activeItem) {
          activeItem.scrollIntoView({ inline: "center", block: "nearest", behavior: "instant" });
        }
        backdrop.classList.add("visible");
        panel.classList.add("visible");
      });
    });
  }

  function renderButton5ScrollerList() {
    if (!button5ScrollerDom) return;
    const scrollArea = button5ScrollerDom.scrollArea;
    scrollArea.replaceChildren();

    button5ScrollerCategories.forEach((entry, idx) => {
      const item = document.createElement("div");
      item.className = "__pocket_btn5_item" + (idx === button5ScrollerCurrentIndex ? " active" : "");
      item.dataset.idx = idx;

      const dot = document.createElement("span");
      dot.className = "__pocket_btn5_dot";

      const label = document.createElement("span");
      label.textContent = entry.label || entry.id;

      item.append(dot, label);

      item.addEventListener("click", (e) => {
        e.stopPropagation();
        button5ScrollerCurrentIndex = idx;
        hideButton5CategoryScroller(true);
      });

      scrollArea.appendChild(item);
    });

    if (button5ScrollerDom._renderModeTabs) {
      button5ScrollerDom._renderModeTabs();
    }

    const activeItem = scrollArea.querySelector(".active");
    if (activeItem) {
      activeItem.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  }

  function updateButton5ScrollerHighlight(newIndex) {
    if (!button5ScrollerDom) return;
    const items = button5ScrollerDom.scrollArea.children;
    if (newIndex < 0 || newIndex >= items.length) return;
    if (newIndex === button5ScrollerCurrentIndex) return;

    const oldItem = items[button5ScrollerCurrentIndex];
    const newItem = items[newIndex];
    if (oldItem) oldItem.classList.remove("active");
    if (newItem) {
      newItem.classList.add("active");
      newItem.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
    button5ScrollerCurrentIndex = newIndex;
  }

  function hideButton5CategoryScroller(selectCategory) {
    if (!button5ScrollerActive) return;
    const dom = button5ScrollerDom;
    const currentIndex = button5ScrollerCurrentIndex;
    const categories = [...button5ScrollerCategories];
    button5ScrollerActive = false;
    button5ScrollerDom = null;
    button5ScrollerCategories = [];
    button5ScrollerAllCategories = [];

    if (selectCategory && dom) {
      const selectedEntry = categories[currentIndex];
      if (selectedEntry) {
        lpApi.storage.local.set({ [SELECTED_CATEGORY_KEY]: selectedEntry.id, categoryPickerLastLocation: null });
        showLinkToast("📁 " + (selectedEntry.label || selectedEntry.id));
      }
    }

    if (dom) {
      dom.backdrop.classList.remove("visible");
      dom.panel.classList.remove("visible");
      setTimeout(() => {
        if (dom.overlay && dom.overlay.parentNode) dom.overlay.parentNode.removeChild(dom.overlay);
      }, 220);
    }

    button5ScrollerCurrentIndex = 0;
  }

  // Triggered by simultaneous right+left click — same logic as clicking the "G" button
  async function _triggerGestureButtonToggle() {
    const newValue = !_gestureRuntimeEnabled;
    _gestureRuntimeEnabled = newValue;
    const gBtn = document.getElementById("__pocket_gesture_btn");
    if (gBtn) {
      gBtn.title = newValue ? "Gesture (Aktif)" : "Gesture (Tidak Aktif)";
      gBtn.style.background = newValue ? "rgba(34, 211, 238, 0.3)" : "rgba(0, 0, 0, 0.4)";
      gBtn.style.color = newValue ? "#cffafe" : "#22d3ee";
      gBtn.style.boxShadow = newValue ? "0 0 20px rgba(34, 211, 238, 0.8)" : "0 0 15px rgba(34, 211, 238, 0.6), inset 0 0 5px rgba(34, 211, 238, 0.3)";
    }
    showLinkToast((newValue ? "✅ " : "❌ ") + (newValue ? "Gesture Diaktifkan" : "Gesture Dimatikan"));
    try {
      const data = await lpApi.storage.local.get(SETTINGS_KEY);
      const settings = data && typeof data[SETTINGS_KEY] === "object" ? data[SETTINGS_KEY] : {};
      settings.gestureEnabled = newValue;
      if (!newValue) settings.categoryPickerMouseGesture = false;
      await lpApi.storage.local.set({ [SETTINGS_KEY]: settings });
    } catch (err) {}
    if (newValue && !_gestureDetectionStarted) {
      try {
        const data = await lpApi.storage.local.get(SETTINGS_KEY);
        const settings = data && typeof data[SETTINGS_KEY] === "object" ? data[SETTINGS_KEY] : {};
        _startGestureDetectionIfNeeded(settings);
      } catch (err) {}
    }
  }

  function getButtonCenter(btnWidth, btnHeight) {
    const container = document.getElementById(CONTAINER_ID);
    if (container) {
      const rect = container.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }
    const width = Number.isFinite(btnWidth)
      ? btnWidth
      : floatingButtonWidth || DEFAULT_BTN_SIZE;
    const height = Number.isFinite(btnHeight)
      ? btnHeight
      : floatingButtonHeight || DEFAULT_BTN_SIZE;
    const position = getRenderedButtonPosition();
    const left = position.left;
    const top = position.top;
    return {
      x: left + width / 2,
      y: top + height / 2,
    };
  }

  function distanceToButton(clientX, clientY) {
    const btnWidth = floatingButtonWidth || DEFAULT_BTN_SIZE;
    const btnHeight = floatingButtonHeight || DEFAULT_BTN_SIZE;
    const center = getButtonCenter(btnWidth, btnHeight);
    const x = typeof clientX === "number" ? clientX : lastClientX;
    const y = typeof clientY === "number" ? clientY : lastClientY;
    if (!Number.isFinite(x) || !Number.isFinite(y))
      return Number.POSITIVE_INFINITY;
    const dx = x - center.x;
    const dy = y - center.y;
    return Math.hypot(dx, dy);
  }

  function normalizeUrlForCompare(url) {
    try {
      const u = new URL(url);
      u.hash = "";
      if (
        (u.protocol === "https:" && u.port === "443") ||
        (u.protocol === "http:" && u.port === "80")
      ) {
        u.port = "";
      }
      const path = u.pathname.replace(/\/+$/g, "") || "/";
      u.pathname = path;
      // Strip media position params universally (YouTube t=, Vimeo t=, Twitch t=, etc.)
      const mediaPositionParams = ["t", "start", "time", "timestamp", "at", "seek", "position"];
      const isYoutube = /(?:^|\.)youtube\.com$|^youtu\.be$/i.test(u.hostname || "");
      const uiStateParams = ["tab", "view", "sort", "order", "page", "offset", "limit",
        "lang", "locale", "theme", "modal", "dialog", "panel", "sidebar", "section"];
      for (const p of mediaPositionParams) {
        u.searchParams.delete(p);
      }
      if (!isYoutube) {
        for (const p of uiStateParams) {
          u.searchParams.delete(p);
        }
      }
      return u.toString();
    } catch (err) {
      return String(url || "").trim();
    }
  }
  function normalizeDomainExceptionEntry(value) {
    if (!value || typeof value !== "string") return "";
    let raw = value.trim().toLowerCase();
    if (!raw) return "";
    let wildcard = false;
    if (raw.startsWith("*.")) {
      wildcard = true;
      raw = raw.slice(2);
    }
    if (!raw) return "";
    if (!raw.startsWith("http://") && !raw.startsWith("https://") && !raw.startsWith("//")) {
      raw = `https://${raw}`;
    } else if (raw.startsWith("//")) {
      raw = `https:${raw}`;
    }
    let hostname = "";
    try {
      hostname = new URL(raw).hostname;
    } catch (err) {
      const fallback = raw.replace(/^https?:\/\//, "");
      const slashIndex = fallback.indexOf("/");
      hostname = slashIndex >= 0 ? fallback.slice(0, slashIndex) : fallback;
    }
    hostname = hostname.replace(/^\.+|\.+$/g, "");
    if (!hostname) return "";
    if (!/^[a-z0-9.-]+$/.test(hostname)) return "";
    if (hostname.includes("..")) return "";
    return wildcard ? `*.${hostname}` : hostname;
  }

  function normalizeDomainExceptionList(value) {
    const entries = Array.isArray(value) ? value : [];
    const seen = new Set();
    const normalized = [];
    entries.forEach((entry) => {
      const candidate = normalizeDomainExceptionEntry(entry);
      if (candidate && !seen.has(candidate)) {
        seen.add(candidate);
        normalized.push(candidate);
      }
    });
    return normalized;
  }

  function isHostnameExcluded(hostname, patterns) {
    if (!hostname || !patterns || !patterns.length) return false;
    return patterns.some((pattern) => {
      if (!pattern) return false;
      if (pattern === hostname) return true;
      if (!pattern.startsWith("*.")) return false;
      const base = pattern.slice(2);
      if (!base) return false;
      if (hostname === base) return true;
      return hostname.endsWith(`.${base}`);
    });
  }

  function refreshDomainBlockState() {
    const host =
      window.location && window.location.hostname
        ? window.location.hostname.toLowerCase()
        : "";
    const prevState = domainExcludedForCurrentHost;
    domainExcludedForCurrentHost = Boolean(
      host && isHostnameExcluded(host, floatingButtonDomainExceptions),
    );
    return prevState !== domainExcludedForCurrentHost;
  }

  function urlsMatch(a, b) {
    if (!a || !b) return false;
    return normalizeUrlForCompare(a) === normalizeUrlForCompare(b);
  }

  function normalizeFavoritesSortMode(value) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();
    if (normalized === "asc" || normalized === "desc") return normalized;
    return "manual";
  }

  function sortItemsBySavedAt(items, direction) {
    const safe = Array.isArray(items) ? items.slice() : [];
    const sortDirection = direction === "asc" ? "asc" : "desc";
    return safe.sort((a, b) => {
      const ta = a && a.savedAt ? Date.parse(a.savedAt) : 0;
      const tb = b && b.savedAt ? Date.parse(b.savedAt) : 0;
      if (ta !== tb) return sortDirection === "asc" ? ta - tb : tb - ta;
      const idA = a && a.id ? String(a.id) : "";
      const idB = b && b.id ? String(b.id) : "";
      return idA.localeCompare(idB);
    });
  }

  function getManualOrderValue(item) {
    if (!item) return null;
    const raw = item.manualOrder;
    const value = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  function getFavoriteOrderValue(item) {
    if (!item) return null;
    const raw = item.favoriteOrder;
    const value = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  function sortItemsByManualOrder(list, fallbackDir) {
    const safe = Array.isArray(list) ? list.slice() : [];
    const dir = fallbackDir === "asc" ? "asc" : "desc";
    return safe.sort((a, b) => {
      const aOrder = getManualOrderValue(a);
      const bOrder = getManualOrderValue(b);
      if (aOrder !== null && bOrder !== null && aOrder !== bOrder)
        return aOrder - bOrder;
      if (aOrder !== null && bOrder === null) return -1;
      if (aOrder === null && bOrder !== null) return 1;
      const ta = a && a.savedAt ? Date.parse(a.savedAt) : 0;
      const tb = b && b.savedAt ? Date.parse(b.savedAt) : 0;
      if (ta !== tb) return dir === "asc" ? ta - tb : tb - ta;
      const idA = a && a.id ? String(a.id) : "";
      const idB = b && b.id ? String(b.id) : "";
      return idA.localeCompare(idB);
    });
  }

  function sortItemsByFavoriteOrder(list, fallbackDir) {
    const safe = Array.isArray(list) ? list.slice() : [];
    const dir = fallbackDir === "asc" ? "asc" : "desc";
    return safe.sort((a, b) => {
      const aOrder = getFavoriteOrderValue(a);
      const bOrder = getFavoriteOrderValue(b);
      if (aOrder !== null && bOrder !== null && aOrder !== bOrder)
        return aOrder - bOrder;
      if (aOrder !== null && bOrder === null) return -1;
      if (aOrder === null && bOrder !== null) return 1;
      const ta = a && a.savedAt ? Date.parse(a.savedAt) : 0;
      const tb = b && b.savedAt ? Date.parse(b.savedAt) : 0;
      if (ta !== tb) return dir === "asc" ? ta - tb : tb - ta;
      const idA = a && a.id ? String(a.id) : "";
      const idB = b && b.id ? String(b.id) : "";
      return idA.localeCompare(idB);
    });
  }

  function sortItemsForNextUp(list, selectedCategory, settings) {
    const favoriteSortMode = normalizeFavoritesSortMode(
      settings && settings.favoritesSortMode,
    );
    if (settings && settings.navigationFavoritesOnly === true) {
      if (favoriteSortMode === "manual") {
        return sortItemsByFavoriteOrder(list, "desc");
      }
      return sortItemsBySavedAt(list, favoriteSortMode);
    }
    const inAll = selectedCategory === "all";
    const hasManual =
      !inAll && list.some((it) => getManualOrderValue(it) !== null);
    if (hasManual) return sortItemsByManualOrder(list, "desc");
    return sortItemsBySavedAt(list, "desc");
  }

  async function fetchNextUp() {
    try {
      // Guna mesej ke background yang menggunakan cachedItems terus
      // Mengelak baca semua 1500+ items dari storage.local pada setiap floating button show
      const response = await lpApi.runtime.sendMessage({ type: "fetch-next-up" });
      if (!response || !response.ok || !Array.isArray(response.pool) || !response.pool.length) {
        return null;
      }
      const { pool, selected, favOnly, settings } = response;
      const ordered = sortItemsForNextUp(pool, favOnly ? "all" : selected, settings);
      if (!ordered || !ordered.length) return null;
      const currentUrl = window.location && window.location.href ? window.location.href : "";
      let next = ordered[0];
      const idx = currentUrl
        ? ordered.findIndex((it) => urlsMatch(it.url, currentUrl))
        : -1;
      if (idx >= 0 && ordered.length > 1) {
        const nextIdx = (idx + 1) % ordered.length;
        next = ordered[nextIdx];
      }
      return next || null;
    } catch (err) {
      return null;
    }
  }

  async function refreshNextUpLabel() {
    if (!nextUpTextEl) return;
    if (nextUpPending) return;
    const now = Date.now();
    if (
      nextUpLastFetchedAt &&
      now - nextUpLastFetchedAt < 1200 &&
      nextUpCache
    ) {
      if (nextUpTextInner)
        nextUpTextInner.textContent = "Next up: " + nextUpCache.title;
      const visible = floatingNextUpLabel && !!nextUpCache.title;
      nextUpTextEl.style.opacity = visible ? "1" : "0";
      nextUpTextEl.style.pointerEvents = visible ? "auto" : "none";
      if (visible) {
        runNextUpMarquee();
      } else {
        cancelNextUpMarquee();
      }
      return;
    }
    nextUpPending = true;
    const result = await fetchNextUp();
    nextUpPending = false;
    nextUpCache = result;
    nextUpLastFetchedAt = Date.now();
    if (!result || !result.title || !floatingNextUpLabel) {
      nextUpTextEl.style.opacity = "0";
      nextUpTextEl.style.pointerEvents = "none";
      if (nextUpTextInner) nextUpTextInner.textContent = "";
      cancelNextUpMarquee();
      return;
    }
    if (nextUpTextInner)
      nextUpTextInner.textContent = "Next up: " + result.title;
    nextUpTextEl.style.opacity = "1";
    nextUpTextEl.style.pointerEvents = "auto";
    runNextUpMarquee(nextUpHovering);
  }

  function resolveThemeColors(preset) {
    const key = typeof preset === "string" ? preset.toLowerCase() : "classic";
    const base = {
      panel: "rgba(18,18,18,0.9)",
      panelAlt: "rgba(24,26,31,0.92)",
      text: "#f3f4f6",
      muted: "#a3acb9",
      accent: "#5ac8ff",
      border: "rgba(255,255,255,0.12)",
    };
    if (key === "ocean")
      return {
        ...base,
        panel: "rgba(29,40,54,0.92)",
        panelAlt: "rgba(25,34,47,0.92)",
        text: "#eaf4ff",
        muted: "#a6bfd9",
        accent: "#6fa8ff",
        border: "rgba(111,168,255,0.26)",
      };
    if (key === "sunset")
      return {
        ...base,
        panel: "rgba(41,31,30,0.92)",
        panelAlt: "rgba(48,36,35,0.92)",
        text: "#fff1ea",
        muted: "#d6ada0",
        accent: "#f09a48",
        border: "rgba(240,154,72,0.3)",
      };
    if (key === "modern")
      return {
        ...base,
        panel: "rgba(16,18,23,0.92)",
        panelAlt: "rgba(20,24,32,0.94)",
        text: "#e7edf5",
        muted: "#9aa7b8",
        accent: "#5ac8ff",
        border: "rgba(90,200,255,0.26)",
      };
    if (key === "minimal")
      return {
        ...base,
        panel: "rgba(255,255,255,0.96)",
        panelAlt: "rgba(255,255,255,0.98)",
        text: "#1f2430",
        muted: "#5b6270",
        accent: "#3b82f6",
        border: "rgba(59,77,102,0.22)",
      };
    if (key === "cyber")
      return {
        ...base,
        panel: "rgba(12,15,28,0.94)",
        panelAlt: "rgba(8,11,22,0.94)",
        text: "#e4edff",
        muted: "#9cb6ff",
        accent: "#22d3ee",
        border: "rgba(34,211,238,0.26)",
      };
    if (key === "forest")
      return {
        ...base,
        panel: "rgba(16,26,20,0.94)",
        panelAlt: "rgba(12,20,15,0.94)",
        text: "#e8f5e9",
        muted: "#9fc3a9",
        accent: "#4ade80",
        border: "rgba(74,222,128,0.35)",
      };
    if (key === "pastel")
      return {
        ...base,
        panel: "rgba(255,249,241,0.96)",
        panelAlt: "rgba(255,255,255,0.98)",
        text: "#1f2a3d",
        muted: "#6c7a8a",
        accent: "#f59e0b",
        border: "rgba(245,158,11,0.28)",
      };
    if (key === "mono")
      return {
        ...base,
        panel: "rgba(22,22,24,0.94)",
        panelAlt: "rgba(18,18,20,0.94)",
        text: "#f5f5f5",
        muted: "#9ea0a6",
        accent: "#c0c4cc",
        border: "rgba(255,255,255,0.16)",
      };
    if (key === "aurora")
      return {
        ...base,
        panel: "rgba(17,24,40,0.94)",
        panelAlt: "rgba(12,18,32,0.94)",
        text: "#e8f0fe",
        muted: "#8fa8c8",
        accent: "#2dd4bf",
        border: "rgba(45,212,191,0.3)",
      };
    return base;
  }

  function resolveCustomThemeColors(cc) {
    function hx(val, fallback) {
      return typeof val === "string" && /^#[0-9a-f]{6}$/i.test(val) ? val : fallback;
    }
    function hexToRgba(hex, alpha) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
    }
    return {
      panel: hexToRgba(hx(cc.panel, "#0f3460"), 0.9),
      panelAlt: hexToRgba(hx(cc.panelAlt, "#1a1a4e"), 0.92),
      text: hx(cc.ink, "#e0e0e0"),
      muted: hx(cc.muted, "#a0a0b0"),
      accent: hx(cc.accent, "#e94560"),
      border: hexToRgba(hx(cc.border, "#2a2a4e"), 0.3),
    };
  }

  function applyNextUpStyles() {
    if (!nextUpTextEl) return;
    const colors = themeColors || resolveThemeColors(themePreset);
    const bgA = colors.accent || "#5ac8ff";
    const bgB = colors.panelAlt || colors.panel || "rgba(18,18,18,0.9)";
    const border = colors.border || "rgba(255,255,255,0.16)";
    const text = colors.text || "#fff";
    nextUpTextEl.style.background = `linear-gradient(135deg, ${bgA}, ${bgB})`;
    nextUpTextEl.style.color = text;
    nextUpTextEl.style.border = `1px solid ${border}`;
    nextUpTextEl.style.boxShadow = "0 10px 24px rgba(0,0,0,0.35)";
  }

  function cancelNextUpMarquee() {
    if (nextUpMarqueeAnim) {
      nextUpMarqueeAnim.cancel();
      nextUpMarqueeAnim = null;
    }
    if (nextUpTextInner) {
      nextUpTextInner.style.transform = "translateX(0)";
    }
    if (nextUpTextEl) {
      nextUpTextEl.classList.remove("__pocket_marquee");
    }
  }

  function runNextUpMarquee(forceLoop = false) {
    if (!nextUpTextEl || !nextUpTextInner || !floatingNextUpLabel) return;
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    cancelNextUpMarquee();
    const overflow = nextUpTextInner.scrollWidth - nextUpTextEl.clientWidth;
    if (overflow <= 6) return;
    nextUpTextEl.classList.add("__pocket_marquee");
    const distance = Math.max(12, overflow + 12); // ensure right edge fully reveals
    const duration = Math.min(20000, Math.max(5000, distance * 30));
    const loop = forceLoop || nextUpHovering;
    const keyframes = [
      { transform: "translateX(0px)" },
      { transform: `translateX(-${distance}px)` },
    ];
    const now = Date.now();
    if (!loop && now - nextUpLastStart < 200) return;
    nextUpLastStart = now;
    const startAnim = () => {
      if (!nextUpTextEl || !nextUpTextInner) return;
      nextUpTextInner.style.transform = "translateX(0px)";
      nextUpMarqueeAnim = nextUpTextInner.animate(keyframes, {
        duration,
        easing: "linear",
        iterations: loop ? Infinity : 1,
        direction: loop ? "alternate" : "normal",
        fill: loop ? "both" : "forwards",
      });
      if (nextUpMarqueeAnim) {
        nextUpMarqueeAnim.onfinish = () => {
          nextUpMarqueeAnim = null;
          if (!loop) {
            setTimeout(() => {
              if (nextUpTextInner)
                nextUpTextInner.style.transform = "translateX(0)";
              if (nextUpTextEl)
                nextUpTextEl.classList.remove("__pocket_marquee");
            }, 120);
          }
        };
      }
    };
    setTimeout(startAnim, 180); // brief rest so first words are readable
  }

  function openNextUpLink(newTab = false) {
    const target = nextUpCache;
    if (!floatingNextUpLabel || !target || !target.url) return;
    try {
      const send =
        lpApi && lpApi.runtime && lpApi.runtime.sendMessage
          ? lpApi.runtime.sendMessage({
              type: "open-picker-item",
              url: target.url,
              newTab,
            })
          : null;
      if (send && typeof send.then === "function") {
        send.catch(() => {});
      } else {
        window.open(target.url, "_blank");
      }
      setTimeout(() => refreshNextUpLabel(), 200);
    } catch (err) {
      // ignore
    }
  }

  async function persistOffsetsIfChanged(changed) {
    if (!changed) return;
    try {
      const data = await lpApi.storage.local.get(SETTINGS_KEY);
      const settings = data[SETTINGS_KEY] || {};
      settings.floatingButtonOffsetX = floatingButtonOffsetX;
      settings.floatingButtonOffsetY = floatingButtonOffsetY;
      settings.floatingButtonAnchor = "custom";
      settings.floatingButtonAnchorX = "left";
      settings.floatingButtonAnchorY = "top";
      await lpApi.storage.local.set({ [SETTINGS_KEY]: settings });
    } catch (err) {
      log("[Floating] Failed to persist clamped offsets:", err);
    }
  }

  async function persistSizeIfChanged(sizePx) {
    if (!Number.isFinite(sizePx)) return;
    try {
      const data = await lpApi.storage.local.get([
        SETTINGS_KEY,
        SIZE_OVERRIDE_KEY,
      ]);
      const settings = data[SETTINGS_KEY] || {};
      settings.floatingButtonWidth = sizePx;
      settings.floatingButtonHeight = sizePx;
      settings.floatingButtonSize = sizePx;
      settings.floatingButtonSizePreset = "custom";
      await lpApi.storage.local.set({
        [SETTINGS_KEY]: settings,
        [SIZE_OVERRIDE_KEY]: { width: sizePx, height: sizePx, size: sizePx },
      });
    } catch (err) {
      log("[Floating] Failed to persist size:", err);
    }
  }

  function updateButtonSize() {
    const btn = document.getElementById(BTN_ID);
    const container = document.getElementById(CONTAINER_ID);
    if (!btn || !buttonImg || !container) return;
    const btnWidth = floatingButtonWidth || DEFAULT_BTN_SIZE;
    const btnHeight = floatingButtonHeight || DEFAULT_BTN_SIZE;
    const iconSize = Math.round(
      Math.min(btnWidth, btnHeight) * DEFAULT_ICON_RATIO,
    );
    const offsetsChanged = clampOffsetsToViewport(btnWidth, btnHeight);
    btn.style.width = btnWidth + "px";
    btn.style.height = btnHeight + "px";
    buttonImg.style.width = iconSize + "px";
    buttonImg.style.height = iconSize + "px";
    if (nextUpTextEl) {
      nextUpTextEl.style.top = "100%";
      nextUpTextEl.style.marginTop = "8px";
    }
    // Position is always stored as offsets from top-left unless a temp summon is active.
    syncContainerPosition();
    persistOffsetsIfChanged(offsetsChanged);
  }

  function isYouTubeHost(rawUrl) {
    try {
      const parsed = rawUrl ? new URL(rawUrl) : new URL(window.location.href);
      const host = parsed.hostname.toLowerCase();
      return (
        host === "youtu.be" ||
        host.endsWith("youtube.com") ||
        host.endsWith("youtube-nocookie.com")
      );
    } catch (err) {
      return false;
    }
  }

  function extractYouTubeVideoId(rawUrl) {
    if (!rawUrl) return "";
    try {
      const parsed = new URL(rawUrl);
      const host = parsed.hostname.toLowerCase();
      if (host === "youtu.be") {
        return parsed.pathname.replace(/^\/+/, "").split("/")[0] || "";
      }
      if (
        !host.endsWith("youtube.com") &&
        !host.endsWith("youtube-nocookie.com")
      ) {
        return "";
      }
      if (parsed.pathname.startsWith("/watch")) {
        return parsed.searchParams.get("v") || "";
      }
      const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/?#]+)/);
      const liveMatch = parsed.pathname.match(/^\/live\/([^/?#]+)/);
      const embedMatch = parsed.pathname.match(/^\/embed\/([^/?#]+)/);
      return (
        (shortsMatch && shortsMatch[1]) ||
        (liveMatch && liveMatch[1]) ||
        (embedMatch && embedMatch[1]) ||
        ""
      );
    } catch (err) {
      return "";
    }
  }

  function isYouTubePlaybackUrl(rawUrl) {
    return !!extractYouTubeVideoId(rawUrl);
  }

  function removeYouTubeEndedListener() {
    if (youtubeTrackedVideo && youtubeVideoHandlers) {
      if (youtubeVideoHandlers.onEnded) {
        youtubeTrackedVideo.removeEventListener(
          "ended",
          youtubeVideoHandlers.onEnded,
        );
      }
      if (youtubeVideoHandlers.onTimeUpdate) {
        youtubeTrackedVideo.removeEventListener(
          "timeupdate",
          youtubeVideoHandlers.onTimeUpdate,
        );
      }
      if (youtubeVideoHandlers.onPause) {
        youtubeTrackedVideo.removeEventListener(
          "pause",
          youtubeVideoHandlers.onPause,
        );
      }
      if (youtubeVideoHandlers.onPlay) {
        youtubeTrackedVideo.removeEventListener(
          "play",
          youtubeVideoHandlers.onPlay,
        );
      }
    }
    youtubeTrackedVideo = null;
    youtubeVideoHandlers = null;
    youtubeEndSentForCurrentVideo = false;
  }

  function isVideoAtTimestampEnd(video) {
    if (!video) return false;
    const duration = Number(video.duration);
    const currentTime = Number(video.currentTime);
    if (!Number.isFinite(duration) || !Number.isFinite(currentTime))
      return false;
    if (duration <= 0 || currentTime <= 0) return false;
    if (video.seeking) return false;
    const remaining = duration - currentTime;
    return remaining <= YOUTUBE_END_TIMESTAMP_TOLERANCE_SEC;
  }

  function notifyYouTubeVideoEnded() {
    if (!lpApi.runtime || !lpApi.runtime.sendMessage) return;
    try {
      const response = lpApi.runtime.sendMessage({
        type: "youtube-video-ended",
        url: window.location.href,
      });
      if (response && typeof response.catch === "function") {
        response.catch(() => {});
      }
    } catch (err) {
      log("[Floating] youtube-video-ended failed:", err);
    }
  }

  function handleYouTubeVideoEnded() {
    if (!youtubeAutoNext && !youtubeAutoRandom) return;
    if (document.querySelector(".ad-showing")) return;
    const videoId = extractYouTubeVideoId(window.location.href);
    if (!videoId) return;
    if (
      youtubeEndSentForCurrentVideo &&
      youtubeLastHandledVideoId === videoId
    ) {
      return;
    }
    const now = Date.now();
    if (
      youtubeLastHandledVideoId === videoId &&
      now - youtubeLastHandledAt < YOUTUBE_ENDED_COOLDOWN_MS
    ) {
      return;
    }
    youtubeLastHandledVideoId = videoId;
    youtubeLastHandledAt = now;
    youtubeEndSentForCurrentVideo = true;
    notifyYouTubeVideoEnded();
  }

  function attachYouTubeEndedListener() {
    if (!isYouTubePlaybackUrl(window.location.href)) {
      removeYouTubeEndedListener();
      return;
    }
    const video = document.querySelector("video");
    if (!video) return;
    if (youtubeTrackedVideo === video) {
      if (isVideoAtTimestampEnd(video)) {
        handleYouTubeVideoEnded();
      } else {
        youtubeEndSentForCurrentVideo = false;
      }
      return;
    }
    removeYouTubeEndedListener();
    youtubeTrackedVideo = video;
    youtubeVideoHandlers = {
      onEnded: () => handleYouTubeVideoEnded(),
      onTimeUpdate: () => {
        if (isVideoAtTimestampEnd(video)) {
          handleYouTubeVideoEnded();
        } else {
          youtubeEndSentForCurrentVideo = false;
        }
      },
      onPause: () => {
        if (isVideoAtTimestampEnd(video)) {
          handleYouTubeVideoEnded();
        }
      },
      onPlay: () => {
        youtubeEndSentForCurrentVideo = false;
      },
    };
    youtubeTrackedVideo.addEventListener(
      "ended",
      youtubeVideoHandlers.onEnded,
      { passive: true },
    );
    youtubeTrackedVideo.addEventListener(
      "timeupdate",
      youtubeVideoHandlers.onTimeUpdate,
      { passive: true },
    );
    youtubeTrackedVideo.addEventListener(
      "pause",
      youtubeVideoHandlers.onPause,
      { passive: true },
    );
    youtubeTrackedVideo.addEventListener("play", youtubeVideoHandlers.onPlay, {
      passive: true,
    });
    if (isVideoAtTimestampEnd(video)) {
      handleYouTubeVideoEnded();
    } else {
      youtubeEndSentForCurrentVideo = false;
    }
  }

  function refreshYouTubeWatcher() {
    if (!isYouTubeHost(window.location.href)) return;
    if (!floatingButtonEnabled) {
      removeYouTubeEndedListener();
      return;
    }
    const currentUrl = window.location.href;
    if (currentUrl !== youtubeLastUrl) {
      youtubeLastUrl = currentUrl;
      youtubeLastHandledVideoId = "";
      youtubeLastHandledAt = 0;
      youtubeEndSentForCurrentVideo = false;
    }
    if (!youtubeAutoNext && !youtubeAutoRandom) {
      removeYouTubeEndedListener();
      return;
    }
    attachYouTubeEndedListener();
  }

  function initYouTubeWatcher() {
    if (!isYouTubeHost(window.location.href)) return;
    if (!floatingButtonEnabled) {
      removeYouTubeEndedListener();
      return;
    }
    if (youtubeWatchTimer) return;
    const handleNavigation = () => {
      refreshYouTubeWatcher();
    };
    const handleVisibility = () => {
      if (document.hidden) {
        clearInterval(youtubeWatchTimer);
        youtubeWatchTimer = null;
      } else if (!youtubeWatchTimer) {
        youtubeWatchTimer = setInterval(() => {
          refreshYouTubeWatcher();
        }, YOUTUBE_LISTENER_REFRESH_MS);
        handleNavigation();
      }
    };
    window.addEventListener("yt-navigate-finish", handleNavigation, {
      passive: true,
    });
    window.addEventListener("popstate", handleNavigation, { passive: true });
    document.addEventListener("selectionchange", handleSelectionChange, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility, { passive: true });
    youtubeWatchTimer = setInterval(() => {
      refreshYouTubeWatcher();
    }, YOUTUBE_LISTENER_REFRESH_MS);
    refreshYouTubeWatcher();
  }

  // Load settings from storage
  async function loadSettings() {
    try {
      // Guna shared promise jika ada (dari registerListenersBySettings) — elak double read
      const data = await (_sharedSettingsPromise ? _getSharedSettings() : lpApi.storage.local.get([SETTINGS_KEY, SIZE_OVERRIDE_KEY]));
      // Reset shared promise selepas guna supaya settings seterusnya selalu fresh
      _sharedSettingsPromise = null;
      const settings = data[SETTINGS_KEY] || {};
      const sizeOverride = data[SIZE_OVERRIDE_KEY];
      if (sizeOverride && typeof sizeOverride === "object") {
        const oW = Number.parseInt(sizeOverride.width, 10);
        const oH = Number.parseInt(sizeOverride.height, 10);
        const oS = Number.parseInt(sizeOverride.size, 10);
        if (Number.isFinite(oW)) settings.floatingButtonWidth = oW;
        if (Number.isFinite(oH)) settings.floatingButtonHeight = oH;
        if (Number.isFinite(oS)) settings.floatingButtonSize = oS;
        settings.floatingButtonSizePreset = "custom";
      }
      applySettingsObject(settings);
      refreshDomainBlockState();
      log(
        "[Floating] Settings loaded - enabled:",
        floatingButtonEnabled,
        "hideTimeout:",
        hideTimeout,
        "showDistance:",
        showDistance,
        "animation:",
        animationType,
      );
    } catch (err) {
      log("[Floating] Failed to load settings:", err);
      hideTimeout = DEFAULT_HIDE_TIMEOUT;
      showDistance = DEFAULT_SHOW_DISTANCE;
      animationType = DEFAULT_ANIMATION;
      floatingButtonEnabled = true;
      youtubeAutoNext = false;
      youtubeAutoRandom = false;
    }
    refreshYouTubeWatcher();
  }

  // Listen for settings changes and apply live
  try {
    if (lpApi && lpApi.storage && typeof lpApi.storage.onChanged !== "undefined") {
      lpApi.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (!changes[SETTINGS_KEY]) return;
        try {
          const next = changes[SETTINGS_KEY].newValue || {};
          const wasEnabled = floatingButtonEnabled;
          const wasDomainExcluded = domainExcludedForCurrentHost;
          applySettingsObject(next);
          refreshDomainBlockState();
          if (domainExcludedForCurrentHost) {
            if (!wasDomainExcluded && typeof window.hidePocket === "function") {
              window.hidePocket();
            }
            log("[Floating] Floating button hidden on this domain (exception list).");
            return;
          }
          if (
            wasDomainExcluded &&
            !domainExcludedForCurrentHost &&
            floatingButtonEnabled
          ) {
            if (!document.getElementById(CONTAINER_ID)) {
              injectAnimationStyles();
              init();
            }
          }
          log(
            "[Floating] Settings updated via storage.onChanged - enabled:",
            floatingButtonEnabled,
            "hideTimeout:",
            hideTimeout,
            "showDistance:",
            showDistance,
            "animation:",
            animationType,
          );

          // Handle enable/disable toggle
          if (wasEnabled && !floatingButtonEnabled) {
            // User disabled the floating button
            if (typeof window.hidePocket === "function") {
              window.hidePocket();
            }
          } else if (!wasEnabled && floatingButtonEnabled) {
            // User enabled the floating button - initialize if not already done
            if (!document.getElementById(CONTAINER_ID)) {
              injectAnimationStyles();
              initYouTubeWatcher();
              init();
            }
          }
          
          // Pastikan listener selection sentiasa aktif jika setting membenarkan
          document.removeEventListener("selectionchange", handleSelectionChange);
          document.addEventListener("selectionchange", handleSelectionChange, { passive: true });

          // If currently visible, refresh animation immediately
          const c = document.getElementById(CONTAINER_ID);
          if (c) {
            const aBtn = document.getElementById("__pocket_auto_next_btn");
            if (aBtn) {
              aBtn.title = youtubeAutoNext ? "Auto Next (Aktif)" : "Auto Next (Tidak Aktif)";
              aBtn.style.background = youtubeAutoNext ? "rgba(14, 116, 144, 0.86)" : "rgba(0,0,0,0.65)";
              aBtn.style.color = youtubeAutoNext ? "#bae6fd" : "#ccc";
              aBtn.style.boxShadow = youtubeAutoNext ? "0 0 10px rgba(14, 116, 144, 0.6)" : "0 4px 12px rgba(0,0,0,0.35)";
            }
            const dBtn = document.getElementById("__pocket_delete_after_open_btn");
            if (dBtn) {
              dBtn.title = deleteAfterOpenActive ? "Delete After Opening (Aktif)" : "Delete After Opening (Tidak Aktif)";
              dBtn.style.background = deleteAfterOpenActive ? "rgba(220, 38, 38, 0.86)" : "rgba(0,0,0,0.65)";
              dBtn.style.color = deleteAfterOpenActive ? "#fecaca" : "#ccc";
              dBtn.style.boxShadow = deleteAfterOpenActive ? "0 0 10px rgba(220, 38, 38, 0.6)" : "0 4px 12px rgba(0,0,0,0.35)";
            }
            const bBtn = document.getElementById("__pocket_bg_tab_btn");
            if (bBtn) {
              bBtn.title = globalLinkInBackgroundTabActive ? "Background Tab (Aktif)" : "Background Tab (Tidak Aktif)";
              bBtn.style.background = globalLinkInBackgroundTabActive ? "rgba(34, 197, 94, 0.3)" : "rgba(0, 0, 0, 0.4)";
              bBtn.style.color = globalLinkInBackgroundTabActive ? "#bbf7d0" : "#4ade80";
              bBtn.style.boxShadow = globalLinkInBackgroundTabActive ? "0 0 20px rgba(34, 197, 94, 0.8)" : "0 0 15px rgba(34, 197, 94, 0.6), inset 0 0 5px rgba(34, 197, 94, 0.3)";
            }
            const gBtn = document.getElementById("__pocket_gesture_btn");
            if (gBtn) {
              gBtn.title = _gestureRuntimeEnabled ? "Gesture (Aktif)" : "Gesture (Tidak Aktif)";
              gBtn.style.background = _gestureRuntimeEnabled ? "rgba(34, 211, 238, 0.3)" : "rgba(0, 0, 0, 0.4)";
              gBtn.style.color = _gestureRuntimeEnabled ? "#cffafe" : "#22d3ee";
              gBtn.style.boxShadow = _gestureRuntimeEnabled ? "0 0 20px rgba(34, 211, 238, 0.8)" : "0 0 15px rgba(34, 211, 238, 0.6), inset 0 0 5px rgba(34, 211, 238, 0.3)";
            }
            if (isVisible) {
              // restart show to apply new animation
              window.showPocket();
            }
          }
          refreshFloatingIcon();
          refreshYouTubeWatcher();
          // Invalidate Next Up cache when settings change (e.g. navigationFavoritesOnly)
          nextUpCache = null;
          nextUpLastFetchedAt = 0;
          if (floatingNextUpLabel && nextUpTextEl && isVisible) {
            refreshNextUpLabel();
          }
        } catch (e) {
          log("[Floating] Error applying changed settings:", e);
        }
      });
    }
  } catch (e) {
    log("[Floating] Could not attach storage.onChanged listener", e);
  }

  async function showMiniCategories() {
    if (miniCategoryVisible || miniCategoryPending || !isVisible) return;
    if (!miniCategoryPanel) return;

    miniCategoryPending = true;
    try {
      const categories = await loadQuickLinkSaveCategoryEntries();
      if (!isVisible) return;

      let showHiddenState = 0;
      try {
        const data = await lpApi.storage.local.get(SETTINGS_KEY);
        const s = data && data[SETTINGS_KEY] ? data[SETTINGS_KEY] : {};
        showHiddenState = s.showHiddenCategories || 0;
      } catch (_) {}
      renderMiniCategoryItems(categories, showHiddenState);

      const isRadialLayout = miniCategoryPanelLayout === "radial" || miniCategoryPanelLayout === "wheel";
      miniCategoryPanel.style.display = isRadialLayout ? "block" : "flex";

      // Position panel ikut direction
      const offset = 80;
      miniCategoryPanel.style.left = "auto";
      miniCategoryPanel.style.right = "auto";
      miniCategoryPanel.style.top = "auto";
      miniCategoryPanel.style.bottom = "auto";

      if (miniCategoryTriggerDirection === "left") {
        miniCategoryPanel.style.right = `calc(100% + ${offset}px)`;
        miniCategoryPanel.style.top = "50%";
        miniCategoryPanel.style.transform = "translate(0, -50%)";
      } else if (miniCategoryTriggerDirection === "up") {
        miniCategoryPanel.style.bottom = `calc(100% + 12px)`;
        miniCategoryPanel.style.left = "50%";
        miniCategoryPanel.style.transform = "translate(-50%, 0)";
      } else if (miniCategoryTriggerDirection === "down") {
        miniCategoryPanel.style.top = `calc(100% + 12px)`;
        miniCategoryPanel.style.left = "50%";
        miniCategoryPanel.style.transform = "translate(-50%, 0)";
      } else {
        const btnRect = document.getElementById(BTN_ID).getBoundingClientRect();
        const panelWidth = isRadialLayout ? 260 : 160;
        if (btnRect.right + offset + panelWidth > window.innerWidth) {
          miniCategoryPanel.style.right = `calc(100% + ${offset}px)`;
        } else {
          miniCategoryPanel.style.left = `calc(100% + ${offset}px)`;
        }
        miniCategoryPanel.style.top = "50%";
        miniCategoryPanel.style.transform = "translate(0, -50%)";
      }

      requestAnimationFrame(() => { miniCategoryPanel.style.opacity = "1"; });
      miniCategoryVisible = true;
    } finally {
      miniCategoryPending = false;
    }
  }

  function hideMiniCategories() {
    miniCategoryPending = false;
    if (!miniCategoryVisible || !miniCategoryPanel) return;
    // Cleanup keyboard listener jika ada
    if (miniCategoryPanel._kbCleanup) {
      miniCategoryPanel._kbCleanup();
      miniCategoryPanel._kbCleanup = null;
    }
    miniCategoryPanel.style.opacity = "0";
    setTimeout(() => {
      if (!miniCategoryVisible) miniCategoryPanel.style.display = "none";
    }, 200);
    miniCategoryVisible = false;
    miniCategorySearchBuffer = "";
    if (miniCategorySearchTimer) clearTimeout(miniCategorySearchTimer);
  }

  function renderMiniCategoryItems(categories, showHiddenState) {
    if (!miniCategoryPanel) return;
    miniCategoryPanel.innerHTML = "";

    // ── Header dengan butang mata ────────────────────────────────────
    const header = document.createElement("div");
    header.style.cssText = `
      display:flex;align-items:center;justify-content:space-between;
      padding:2px 6px 6px;border-bottom:1px solid rgba(255,255,255,0.07);
      margin-bottom:4px;flex-shrink:0;
    `;
    const headerTitle = document.createElement("span");
    headerTitle.textContent = "Kategori";
    headerTitle.style.cssText = `font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,0.4);`;

    const searchBufferDisplay = document.createElement("span");
    searchBufferDisplay.id = "__pocket_mini_search_buf";
    searchBufferDisplay.style.cssText = `font-size:11px;font-weight:600;color:#ffd700;margin:0 4px;display:none;`;
    window.__pocketMiniSearchBufEl = searchBufferDisplay;

    const eyeToggleBtn = document.createElement("button");
    eyeToggleBtn.type = "button";
    function updateEyeBtn(state) {
      if (state === 2) { eyeToggleBtn.textContent = "🙈"; eyeToggleBtn.title = "Hanya hidden"; }
      else if (state === 1 || state === true) { eyeToggleBtn.textContent = "👁️‍🗨️"; eyeToggleBtn.title = "Papar semua"; }
      else { eyeToggleBtn.textContent = "👁️"; eyeToggleBtn.title = "Normal"; }
    }
    updateEyeBtn(showHiddenState);
    eyeToggleBtn.style.cssText = `background:none;border:none;cursor:pointer;font-size:14px;line-height:1;padding:2px 4px;border-radius:6px;transition:background .12s;outline:none;`;
    eyeToggleBtn.addEventListener("mouseover", () => { eyeToggleBtn.style.background = "rgba(255,255,255,0.1)"; });
    eyeToggleBtn.addEventListener("mouseout",  () => { eyeToggleBtn.style.background = "none"; });
    eyeToggleBtn.addEventListener("click", async () => {
      let next = showHiddenState === 1 || showHiddenState === true ? 2 : showHiddenState === 2 ? 0 : 1;
      try {
        const data = await lpApi.storage.local.get(SETTINGS_KEY);
        const s = data && data[SETTINGS_KEY] ? data[SETTINGS_KEY] : {};
        s.showHiddenCategories = next;
        await lpApi.storage.local.set({ [SETTINGS_KEY]: s });
      } catch (_) {}
      const newCats = await loadQuickLinkSaveCategoryEntries();
      renderMiniCategoryItems(newCats, next);
    });
    eyeToggleBtn.addEventListener("wheel", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      let next;
      if (e.deltaY < 0) {
        next = showHiddenState === 0 ? 2 : showHiddenState === 1 ? 0 : 1;
      } else {
        next = showHiddenState === 1 || showHiddenState === true ? 2 : showHiddenState === 2 ? 0 : 1;
      }
      try {
        const data = await lpApi.storage.local.get(SETTINGS_KEY);
        const s = data && data[SETTINGS_KEY] ? data[SETTINGS_KEY] : {};
        s.showHiddenCategories = next;
        await lpApi.storage.local.set({ [SETTINGS_KEY]: s });
      } catch (_) {}
      const newCats = await loadQuickLinkSaveCategoryEntries();
      renderMiniCategoryItems(newCats, next);
    }, { passive: false });
    header.append(headerTitle, searchBufferDisplay, eyeToggleBtn);

    function _updateSearchBufferDisplay() {
      if (searchBufferDisplay) {
        var txt = (miniCategorySearchBuffer || "").trim();
        searchBufferDisplay.textContent = txt ? "\"" + txt : "";
        searchBufferDisplay.style.display = txt ? "" : "none";
      }
    }
    _updateSearchBufferDisplay();

    // ── Bina item berdasarkan layout ─────────────────────────────────
    const layout = miniCategoryPanelLayout || "list";

    // ── Helper: janakan hue unik per nama kategori ───────────────────
    function _lpMiniHue(label) {
      let h = 0;
      for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) & 0xffffffff;
      return Math.abs(h) % 360;
    }

    // ── Helper: pilih kategori ───────────────────────────────────────
    async function _miniSelectCat(cat) {
      await lpApi.storage.local.set({ [SELECTED_CATEGORY_KEY]: cat.id || "none" });
      try { const m = lpApi.runtime.sendMessage({ type:"request-badge" }); if(m&&m.catch) m.catch(()=>{}); } catch(_) {}
      hideMiniCategories();
      showLinkToast(`📂 ${cat.label}`);
    }

    // ── Helper: highlight state ──────────────────────────────────────
    function applyHighlight(el, on, isCurrent) {
      if (on) {
        el.style.background = "rgba(99,179,237,0.42)";
        el.style.borderColor = "rgba(99,179,237,0.9)";
        el.style.color = "#fff";
        el.style.transform = "scale(1.06)";
        el.style.boxShadow = "0 0 0 2px rgba(99,179,237,0.45)";
        try { el.scrollIntoView({ block:"nearest", inline:"nearest" }); } catch(_) {}
      } else {
        el.style.background = isCurrent ? "rgba(59,130,246,0.38)" : "rgba(255,255,255,0.07)";
        el.style.borderColor = isCurrent ? "rgba(59,130,246,0.65)" : "rgba(255,255,255,0.1)";
        el.style.color = isCurrent ? "#fff" : "#ccc";
        el.style.transform = "";
        el.style.boxShadow = "";
      }
    }

    // ── Helper: bina item button dengan huruf pertama bold ────────────
    function _lpRenderIconInto(el, icon, sizePx) {
      const sz = sizePx || 18;
      if (!icon) { el.textContent = "📁"; return; }
      if (icon.startsWith("http://") || icon.startsWith("https://") || icon.startsWith("data:image")) {
        const img = document.createElement("img");
        img.src = icon;
        img.style.cssText = `width:${sz}px;height:${sz}px;object-fit:contain;border-radius:3px;vertical-align:middle;display:inline-block;margin-right:4px;`;
        img.onerror = () => { img.remove(); el.textContent = "📁"; };
        el.textContent = "";
        el.appendChild(img);
      } else if (icon.startsWith("<svg") || icon.startsWith("<SVG")) {
        var _svgNode3 = _sanitizeSvgNode(icon);
        if (_svgNode3) {
          _svgNode3.style.width = sz + "px";
          _svgNode3.style.height = sz + "px";
          el.textContent = "";
          el.appendChild(_svgNode3);
        }
      } else {
        el.textContent = icon;
      }
    }

    function makeCatItem(cat, extraStyle, shortLbl) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "__pocket_mini_category_item";
      el.dataset.label = cat.label.toLowerCase();
      el.dataset.catId = cat.id || "none";
      el.title = cat.label;
      el.style.cssText = extraStyle;
      const displayLbl = shortLbl || cat.label;
      const icon = cat.icon || _lpGetEmoji(cat.label);

      const iconSpan = document.createElement("span");
      iconSpan.style.cssText = "margin-right:4px;font-size:1.1em;";
      _lpRenderIconInto(iconSpan, icon);
      el.appendChild(iconSpan);

      const firstSpan = document.createElement("span");
      firstSpan.style.cssText = "font-weight:800;color:rgba(255,255,255,0.9)";
      firstSpan.textContent = displayLbl.slice(0, 1);
      el.appendChild(firstSpan);
      el.appendChild(document.createTextNode(displayLbl.slice(1)));

      el.addEventListener("click", async (e) => { e.stopPropagation(); await _miniSelectCat(cat); });
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!cat.canPin) return;
        showMiniCategoryIconPicker(cat, el, e.clientX, e.clientY);
      });
      return el;
    }

    // ── Icon picker untuk kategori mini ─────────────────────────────
    const _MINI_ICON_LIST = {
      "Umum": ["📁","📂","🗂️","📋","📌","📍","🔖","🏷️","💎","✨","⭐","🌟","💫","🔥","❤️","💜","💙","💚","🧡","💛"],
      "Kerja & Produktiviti": ["💼","🏢","📊","📈","📉","🗓️","📅","⏰","⏳","🔧","⚙️","🛠️","🔨","📎","🖇️","✂️","📏","📐","🗜️","💡"],
      "Maklumat & Pengetahuan": ["📚","📖","📰","📝","📓","📔","📕","📗","📘","📙","🎓","🧠","🔍","🔎","💡","🗣️","💬","💭","🗨️","📡"],
      "Media & Hiburan": ["🎬","🎭","🎨","🎵","🎶","🎤","🎧","📺","🎮","🕹️","🎯","🎪","🎠","🎡","🎢","🏆","🥇","🥈","🥉","🎁"],
      "Teknologi": ["💻","🖥️","⌨️","🖱️","💾","💿","📀","📱","📲","☎️","📞","📟","📠","🔌","🔋","📡","🚀","🛸","🤖","👾"],
      "Sosial & Komunikasi": ["💬","🗨️","🗯️","📧","📨","📩","📦","📫","📪","📬","📭","📮","🗳️","✅","❌","❓","❗","⁉️","🆗","🆕"],
      "Kewangan": ["💰","💵","💴","💶","💷","🪙","💳","💎","🏦","📈","📉","🏧","💰","💲","🎁","🎫","🎟️","🏆","🎯","💰"],
      "Makanan & Minuman": ["🍔","🍕","🍟","🌭","🍿","🧀","🥚","🍳","🥞","🧇","🥓","🥩","🍗","🍖","🌮","🌯","🥙","🧆","🥗","🍜"],
      "Alam & Cuaca": ["🌍","🌎","🌏","🌐","🗺️","🏔️","⛰️","🌋","🏕️","🏖️","🏜️","🏝️","🌲","🌳","🌴","🌵","🌾","🌿","☘️","🍀"],
      "Haiwan": ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🦅","🦆"],
      "Ikon & Simbol": ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️"],
      "Bendera": ["🏁","🚩","🎌","🏴","🏳️","🏳️‍🌈","🏳️‍⚧️","🏴‍☠️","🇺🇸","🇬🇧","🇯🇵","🇰🇷","🇨🇳","🇩🇪","🇫🇷","🇮🇹","🇪🇸","🇧🇷","🇮🇳","🇦🇺"],
    };

    let _miniIconPickerPopup = null;

    function showMiniCategoryIconPicker(cat, anchorEl, clientX, clientY) {
      closeMiniCategoryIconPicker();
      const popup = document.createElement("div");
      popup.style.cssText = `
        position:fixed;z-index:2147483647;background:rgba(25,25,35,0.97);
        border:1px solid rgba(255,255,255,0.15);border-radius:12px;
        padding:8px;max-width:380px;max-height:480px;overflow-y:auto;
        box-shadow:0 8px 32px rgba(0,0,0,0.5);backdrop-filter:blur(12px);
        scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.15) transparent;
      `;

      const title = document.createElement("div");
      title.textContent = `Tukar icon: ${cat.label}`;
      title.style.cssText = `
        font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);
        padding:2px 4px 6px;text-transform:uppercase;letter-spacing:.05em;
      `;
      popup.appendChild(title);

      // ── Search Iconify ──────────────────────────────────────────────
      const searchBox = document.createElement("div");
      searchBox.style.cssText = "margin-bottom:6px;";
      const searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.placeholder = "Cari icon dari web (contoh: home, heart, star)...";
      searchInput.style.cssText = `
        width:100%;padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);
        background:rgba(255,255,255,0.08);color:#fff;font-size:12px;outline:none;
        box-sizing:border-box;font-family:inherit;
      `;
      searchInput.addEventListener("focus", () => { searchInput.style.borderColor = "rgba(59,130,246,0.6)"; });
      searchInput.addEventListener("blur", () => { searchInput.style.borderColor = "rgba(255,255,255,0.15)"; });
      searchBox.appendChild(searchInput);

      const searchResults = document.createElement("div");
      searchResults.style.cssText = `
        display:flex;flex-wrap:wrap;gap:3px;margin-top:6px;min-height:0;max-height:140px;
        overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.15) transparent;
      `;
      searchBox.appendChild(searchResults);

      const searchLoading = document.createElement("div");
      searchLoading.style.cssText = "font-size:10px;color:rgba(255,255,255,0.3);padding:2px 0;display:none;";
      searchLoading.textContent = "Mencari...";
      searchBox.appendChild(searchLoading);

      let _searchTimer = null;
      searchInput.addEventListener("input", () => {
        const q = searchInput.value.trim();
        if (_searchTimer) clearTimeout(_searchTimer);
        if (!q) { searchResults.textContent = ""; return; }
        _searchTimer = setTimeout(async () => {
          searchLoading.style.display = "block";
          searchResults.textContent = "";
          try {
            const resp = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=30`);
            const data = await resp.json();
            const icons = data.icons || [];
            searchLoading.style.display = "none";
            if (!icons.length) {
              searchResults.textContent = "Tiada icon dijumpai";
              searchResults.style.cssText = "font-size:10px;color:rgba(255,255,255,0.3);";
              return;
            }
            // Fetch SVG untuk semua icon sekaligus
            const svgResp = await fetch(`https://api.iconify.design/${icons.map(i => i.replace(":", ".")).join(",")}.svg`);
            const svgText = await svgResp.text();
            // Parse SVG responses (setiap line adalah satu SVG)
            const svgLines = svgText.split("\n").filter(l => l.trim());
            icons.forEach((iconName, idx) => {
              const svgData = svgLines[idx] || "";
              const btn = document.createElement("button");
              btn.type = "button";
              btn.title = iconName;
              btn.style.cssText = `
                width:32px;height:32px;display:flex;align-items:center;
                justify-content:center;border:none;background:rgba(255,255,255,0.06);
                border-radius:6px;cursor:pointer;transition:all .12s;padding:2px;
              `;
              if (svgData.startsWith("<svg")) {
                var _svgNode4 = _sanitizeSvgNode(svgData.replace(/width="[^"]*"/, 'width="20"').replace(/height="[^"]*"/, 'height="20"'));
                if (_svgNode4) {
                  _svgNode4.style.width = "20px";
                  _svgNode4.style.height = "20px";
                  btn.appendChild(_svgNode4);
                }
              }
              btn.addEventListener("mouseover", () => { btn.style.background = "rgba(59,130,246,0.4)"; btn.style.transform = "scale(1.15)"; });
              btn.addEventListener("mouseout", () => { btn.style.background = "rgba(255,255,255,0.06)"; btn.style.transform = "scale(1)"; });
              btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                await _saveCategoryIcon(cat.id, svgData);
                closeMiniCategoryIconPicker();
                refreshMiniCategories();
              });
              searchResults.appendChild(btn);
            });
          } catch (_) {
            searchLoading.style.display = "none";
            searchResults.textContent = "Gagal mencari icon";
              searchResults.style.cssText = "font-size:10px;color:rgba(255,100,100,0.5);";
          }
        }, 400);
      });
      popup.appendChild(searchBox);

      // ── URL / Emoji input ───────────────────────────────────────────
      const customBox = document.createElement("div");
      customBox.style.cssText = "margin-bottom:6px;";
      const urlInput = document.createElement("input");
      urlInput.type = "text";
      urlInput.placeholder = "Paste emoji atau URL gambar dari web...";
      urlInput.style.cssText = `
        width:100%;padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);
        background:rgba(255,255,255,0.08);color:#fff;font-size:12px;outline:none;
        box-sizing:border-box;font-family:inherit;
      `;
      urlInput.addEventListener("focus", () => { urlInput.style.borderColor = "rgba(59,130,246,0.6)"; });
      urlInput.addEventListener("blur", () => { urlInput.style.borderColor = "rgba(255,255,255,0.15)"; });
      const urlApplyBtn = document.createElement("button");
      urlApplyBtn.type = "button";
      urlApplyBtn.textContent = "✓ Guna";
      urlApplyBtn.style.cssText = `
        margin-top:4px;padding:5px 12px;border-radius:6px;border:1px solid rgba(59,130,246,0.4);
        background:rgba(59,130,246,0.2);color:#93c5fd;font-size:11px;cursor:pointer;
        transition:background .12s;font-family:inherit;
      `;
      urlApplyBtn.addEventListener("mouseover", () => { urlApplyBtn.style.background = "rgba(59,130,246,0.4)"; });
      urlApplyBtn.addEventListener("mouseout", () => { urlApplyBtn.style.background = "rgba(59,130,246,0.2)"; });
      urlApplyBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const val = urlInput.value.trim();
        if (!val) return;
        await _saveCategoryIcon(cat.id, val);
        closeMiniCategoryIconPicker();
        refreshMiniCategories();
      });
      customBox.append(urlInput, urlApplyBtn);
      popup.appendChild(customBox);

      // ── Remove button ───────────────────────────────────────────────
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "❌ Buang icon";
      removeBtn.style.cssText = `
        display:block;width:100%;padding:6px 8px;margin-bottom:6px;
        background:rgba(255,80,80,0.15);border:1px solid rgba(255,80,80,0.3);
        border-radius:6px;color:#ff6b6b;font-size:11px;cursor:pointer;text-align:left;
        transition:background .12s;
      `;
      removeBtn.addEventListener("mouseover", () => removeBtn.style.background = "rgba(255,80,80,0.3)");
      removeBtn.addEventListener("mouseout", () => removeBtn.style.background = "rgba(255,80,80,0.15)");
      removeBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await _saveCategoryIcon(cat.id, "");
        closeMiniCategoryIconPicker();
        refreshMiniCategories();
      });
      popup.appendChild(removeBtn);

      // ── Emoji grid ──────────────────────────────────────────────────
      for (const [section, icons] of Object.entries(_MINI_ICON_LIST)) {
        const sectionLabel = document.createElement("div");
        sectionLabel.textContent = section;
        sectionLabel.style.cssText = `
          font-size:10px;font-weight:700;color:rgba(255,255,255,0.35);
          padding:6px 4px 3px;text-transform:uppercase;letter-spacing:.04em;
        `;
        popup.appendChild(sectionLabel);

        const grid = document.createElement("div");
        grid.style.cssText = `display:flex;flex-wrap:wrap;gap:2px;margin-bottom:4px;`;
        icons.forEach(emoji => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = emoji;
          btn.style.cssText = `
            width:30px;height:30px;font-size:16px;display:flex;align-items:center;
            justify-content:center;border:none;background:rgba(255,255,255,0.06);
            border-radius:6px;cursor:pointer;transition:all .12s;padding:0;
          `;
          btn.addEventListener("mouseover", () => { btn.style.background = "rgba(59,130,246,0.4)"; btn.style.transform = "scale(1.2)"; });
          btn.addEventListener("mouseout", () => { btn.style.background = "rgba(255,255,255,0.06)"; btn.style.transform = "scale(1)"; });
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            await _saveCategoryIcon(cat.id, emoji);
            closeMiniCategoryIconPicker();
            refreshMiniCategories();
          });
          grid.appendChild(btn);
        });
        popup.appendChild(grid);
      }

      document.body.appendChild(popup);
      _miniIconPickerPopup = popup;

      const pw = popup.offsetWidth || 380;
      const ph = popup.offsetHeight || 480;
      let px = clientX;
      let py = clientY;
      if (px + pw > window.innerWidth - 8) px = window.innerWidth - pw - 8;
      if (py + ph > window.innerHeight - 8) py = window.innerHeight - ph - 8;
      if (px < 8) px = 8;
      if (py < 8) py = 8;
      popup.style.left = px + "px";
      popup.style.top = py + "px";

      setTimeout(() => {
        document.addEventListener("click", closeMiniCategoryIconPicker, { once: true, capture: true });
        document.addEventListener("contextmenu", closeMiniCategoryIconPicker, { once: true, capture: true });
      }, 0);
    }

    function closeMiniCategoryIconPicker() {
      if (_miniIconPickerPopup && _miniIconPickerPopup.parentNode) {
        _miniIconPickerPopup.parentNode.removeChild(_miniIconPickerPopup);
      }
      _miniIconPickerPopup = null;
    }

    async function _saveCategoryIcon(catId, icon) {
      try {
        const data = await lpApi.storage.local.get([CATEGORY_KEY]);
        const categories = data && data[CATEGORY_KEY] ? data[CATEGORY_KEY] : [];
        const next = categories.map(c => {
          if (String(c.id) === String(catId)) {
            return icon ? { ...c, icon } : (() => { const copy = { ...c }; delete copy.icon; return copy; })();
          }
          return c;
        });
        await lpApi.storage.local.set({ [CATEGORY_KEY]: next });
      } catch (_) {}
    }

    async function refreshMiniCategories() {
      if (!miniCategoryVisible || !miniCategoryPanel) return;
      try {
        const categories = await loadQuickLinkSaveCategoryEntries();
        let showHiddenState = 0;
        try {
          const data = await lpApi.storage.local.get(SETTINGS_KEY);
          const s = data && data[SETTINGS_KEY] ? data[SETTINGS_KEY] : {};
          showHiddenState = s.showHiddenCategories || 0;
        } catch (_) {}
        renderMiniCategoryItems(categories, showHiddenState);
      } catch (_) {}
    }

    // ── Keyboard navigation (dikongsi semua layout) ───────────────────
    let _kbItems = [];
    let _kbIdx = -1;
    let _kbLastKey = "";
    let _kbLastAt  = 0;
    let _kbSameCount = 0;

    function _kbHighlight(newIdx) {
      if (_kbIdx >= 0 && _kbItems[_kbIdx]) applyHighlight(_kbItems[_kbIdx].el, false, _kbItems[_kbIdx].cat.isCurrent);
      _kbIdx = newIdx;
      if (_kbIdx >= 0 && _kbItems[_kbIdx]) applyHighlight(_kbItems[_kbIdx].el, true, _kbItems[_kbIdx].cat.isCurrent);
      _updateSearchBufferDisplay();
    }

    function _kbUpdateLabelHighlights() {
      if (layout === "radial" || layout === "wheel") return;
      var buf = miniCategorySearchBuffer || "";
      var showDim = buf && buf.length > 0;
      _kbItems.forEach(function (entry) {
        var el = entry.el;
        var label = entry.cat.label;
        var lower = label.toLowerCase();
        el.textContent = "";
        if (buf && lower.startsWith(buf)) {
          const matchSpan = document.createElement("span");
          matchSpan.style.cssText = "font-weight:800;color:#ffd700;background:rgba(255,200,50,0.2);border-radius:3px;padding:0 1px";
          matchSpan.textContent = label.slice(0, buf.length);
          el.appendChild(matchSpan);
          el.appendChild(document.createTextNode(label.slice(buf.length)));
        } else if (showDim) {
          const dimSpan = document.createElement("span");
          dimSpan.style.cssText = "font-weight:400;color:rgba(255,255,255,0.3)";
          dimSpan.textContent = label;
          el.appendChild(dimSpan);
        } else {
          const firstSpan = document.createElement("span");
          firstSpan.style.cssText = "font-weight:800;color:rgba(255,255,255,0.9)";
          firstSpan.textContent = label.slice(0, 1);
          el.appendChild(firstSpan);
          el.appendChild(document.createTextNode(label.slice(1)));
        }
      });
    }

    function _kbHandleKey(e) {
      if (!miniCategoryVisible) return;
      if (e.key === "Escape") { hideMiniCategories(); e.preventDefault(); return; }
      if (e.key === "Enter" && _kbIdx >= 0 && _kbItems[_kbIdx]) {
        _miniSelectCat(_kbItems[_kbIdx].cat); e.preventDefault(); return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        _kbHighlight(Math.min(_kbIdx + 1, _kbItems.length - 1)); e.preventDefault(); return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        _kbHighlight(Math.max(_kbIdx <= 0 ? 0 : _kbIdx - 1, 0)); e.preventDefault(); return;
      }
      if (e.key === "Backspace" && miniCategorySearchBuffer) {
        miniCategorySearchBuffer = miniCategorySearchBuffer.slice(0, -1);
        _kbLastAt = Date.now();
        _kbSameCount = 0;
        _kbUpdateLabelHighlights();
        if (miniCategorySearchBuffer) {
          var matches = _kbItems.map(function (o, i) { return { item: o, idx: i }; }).filter(function (o) { return o.item.cat.label.toLowerCase().startsWith(miniCategorySearchBuffer); });
          if (matches.length) { _kbHighlight(matches[0].idx); }
        }
        if (miniCategorySearchTimer) clearTimeout(miniCategorySearchTimer);
        miniCategorySearchTimer = setTimeout(function () { miniCategorySearchBuffer = ""; _kbUpdateLabelHighlights(); _updateSearchBufferDisplay(); }, 1500);
        _updateSearchBufferDisplay();
        e.preventDefault(); return;
      }
      if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
        var k = e.key.toLowerCase();
        var now = Date.now();
        if (now - _kbLastAt > 1200) { miniCategorySearchBuffer = ""; _kbSameCount = 0; }
        if (k === _kbLastKey && now - _kbLastAt < 1200) { _kbSameCount++; } else { _kbSameCount = 0; }
        _kbLastKey = k; _kbLastAt = now;
        if (miniCategorySearchBuffer === "" || _kbSameCount > 0) {
          miniCategorySearchBuffer = k;
        } else {
          miniCategorySearchBuffer += k;
        }
        if (miniCategorySearchTimer) clearTimeout(miniCategorySearchTimer);
        miniCategorySearchTimer = setTimeout(function () { miniCategorySearchBuffer = ""; _kbUpdateLabelHighlights(); _updateSearchBufferDisplay(); }, 1500);
        var matches = _kbItems.map(function (o, i) { return { item: o, idx: i }; }).filter(function (o) { return o.item.cat.label.toLowerCase().startsWith(miniCategorySearchBuffer); });
        if (!matches.length) {
          miniCategorySearchBuffer = k;
          matches = _kbItems.map(function (o, i) { return { item: o, idx: i }; }).filter(function (o) { return o.item.cat.label.toLowerCase().startsWith(k); });
        }
        _kbUpdateLabelHighlights();
        if (matches.length) {
          _kbHighlight(matches[Math.min(_kbSameCount, matches.length - 1)].idx);
          try { matches[Math.min(_kbSameCount, matches.length - 1)].item.el.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (_) {}
        }
        _updateSearchBufferDisplay();
        e.preventDefault(); return;
      }
      if (miniCategoryVisible) { e.preventDefault(); e.stopPropagation(); }
    }
    document.addEventListener("keydown", _kbHandleKey, true);
    miniCategoryPanel._kbCleanup = function () { document.removeEventListener("keydown", _kbHandleKey, true); };
    if (layout === "grid") {
      // ── GRID: 3-kolum warna unik ──────────────────────────────────
      miniCategoryPanel.appendChild(header);
      const grid = document.createElement("div");
      grid.style.cssText = `display:grid;grid-template-columns:repeat(3,1fr);gap:5px;max-height:320px;overflow-y:auto;padding:3px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.12) transparent;`;
      categories.forEach(cat => {
        const hue = _lpMiniHue(cat.label);
        const tile = makeCatItem(cat,
          `padding:9px 5px;border-radius:10px;font-size:11px;cursor:pointer;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:all .15s;outline:none;font-family:inherit;width:100%;border:1.5px solid ${cat.isCurrent?"rgba(59,130,246,0.65)":"hsla("+hue+",50%,55%,0.28)"};background:${cat.isCurrent?"rgba(59,130,246,0.35)":"hsla("+hue+",50%,25%,0.22)"};color:${cat.isCurrent?"#fff":"#ccc"};`
        );
        tile.addEventListener("mouseover", () => applyHighlight(tile, true, cat.isCurrent));
        tile.addEventListener("mouseout",  () => applyHighlight(tile, false, cat.isCurrent));
        _kbItems.push({ el: tile, cat });
        grid.appendChild(tile);
      });
      miniCategoryPanel.appendChild(grid);

    } else if (layout === "horizontal") {
      // ── HORIZONTAL: chip mendatar + arrow scroll ──────────────────
      miniCategoryPanel.appendChild(header);
      const hWrap = document.createElement("div");
      hWrap.style.cssText = `display:flex;align-items:center;gap:3px;`;
      const bar = document.createElement("div");
      bar.style.cssText = `display:flex;flex-direction:row;gap:6px;overflow-x:auto;overflow-y:hidden;padding:3px 2px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.15) transparent;max-width:min(80vw,500px);`;
      const makeArrow = (dir) => {
        const a = document.createElement("button");
        a.type = "button"; a.textContent = dir==="left"?"‹":"›";
        a.style.cssText = `flex-shrink:0;background:rgba(255,255,255,0.1);border:none;color:#fff;font-size:18px;padding:0 7px;cursor:pointer;border-radius:6px;line-height:28px;transition:background .12s;outline:none;`;
        a.addEventListener("mouseover",()=>a.style.background="rgba(255,255,255,0.22)");
        a.addEventListener("mouseout", ()=>a.style.background="rgba(255,255,255,0.1)");
        a.addEventListener("click",(e)=>{e.stopPropagation();bar.scrollBy({left:dir==="left"?-160:160,behavior:"smooth"});});
        return a;
      };
      categories.forEach(cat => {
        const hue = _lpMiniHue(cat.label);
        const chip = makeCatItem(cat,
          `flex-shrink:0;padding:6px 13px;border-radius:20px;font-size:12px;cursor:pointer;white-space:nowrap;transition:all .15s;outline:none;font-family:inherit;border:1.5px solid ${cat.isCurrent?"rgba(59,130,246,0.65)":"hsla("+hue+",50%,55%,0.3)"};background:${cat.isCurrent?"rgba(59,130,246,0.4)":"hsla("+hue+",50%,22%,0.2)"};color:${cat.isCurrent?"#fff":"#ccc"};`
        );
        chip.addEventListener("mouseover", () => applyHighlight(chip, true, cat.isCurrent));
        chip.addEventListener("mouseout",  () => applyHighlight(chip, false, cat.isCurrent));
        _kbItems.push({ el: chip, cat });
        bar.appendChild(chip);
      });
      hWrap.append(makeArrow("left"), bar, makeArrow("right"));
      miniCategoryPanel.appendChild(hWrap);

    } else if (layout === "radial") {
      // ── RADIAL: bulatan penuh 360° ────────────────────────────────
      miniCategoryPanel.style.cssText = `position:absolute;left:auto;top:auto;display:block;background:none;border:none;box-shadow:none;padding:0;z-index:2147483647;opacity:0;transition:opacity .2s ease;pointer-events:auto;overflow:visible;`;
      const MAX = Math.min(categories.length, 12);
      const radius = 100 + Math.min(MAX,12)*3, btnSize = 54;
      const sz = (radius+btnSize)*2+12;
      const wrap = document.createElement("div");
      wrap.style.cssText = `position:relative;width:${sz}px;height:${sz}px;`;
      const curCatR = categories.find(c=>c.isCurrent);
      const curHueR = curCatR?_lpMiniHue(curCatR.label):210;
      const centerR = document.createElement("div");
      centerR.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:56px;height:56px;border-radius:50%;background:rgba(20,20,20,0.95);border:2px solid hsla(${curHueR},60%,55%,0.6);display:flex;align-items:center;justify-content:center;font-size:8px;color:rgba(255,255,255,0.55);text-align:center;pointer-events:none;padding:5px;line-height:1.3;font-weight:600;`;
      centerR.textContent = curCatR?curCatR.label.slice(0,10):"●";
      wrap.appendChild(centerR);
      categories.slice(0,MAX).forEach((cat,i) => {
        const angle = (i/MAX)*360-90, rad=angle*Math.PI/180, hue=_lpMiniHue(cat.label);
        const x=sz/2+radius*Math.cos(rad)-btnSize/2, y=sz/2+radius*Math.sin(rad)-btnSize/2;
        const s=cat.label.length>7?cat.label.slice(0,6)+"…":cat.label;
        const btn = makeCatItem(cat,
          `position:absolute;left:${Math.round(x)}px;top:${Math.round(y)}px;width:${btnSize}px;height:${btnSize}px;border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;font-size:10px;line-height:1.2;padding:4px;word-break:break-word;cursor:pointer;transition:all .15s;outline:none;font-family:inherit;backdrop-filter:blur(8px);box-shadow:0 3px 14px rgba(0,0,0,0.45);border:2px solid ${cat.isCurrent?"rgba(59,130,246,0.85)":"hsla("+hue+",55%,55%,0.38)"};background:${cat.isCurrent?"rgba(59,130,246,0.45)":"hsla("+hue+",45%,18%,0.92)"};color:${cat.isCurrent?"#fff":"#ccc"};`,s
        );
        btn.addEventListener("mouseover",()=>applyHighlight(btn,true,cat.isCurrent));
        btn.addEventListener("mouseout", ()=>applyHighlight(btn,false,cat.isCurrent));
        _kbItems.push({el:btn,cat}); wrap.appendChild(btn);
      });
      miniCategoryPanel.appendChild(wrap);

    } else if (layout === "wheel") {
      // ── WHEEL: arc separuh (195°→345°) ────────────────────────────
      miniCategoryPanel.style.cssText = `position:absolute;left:auto;top:auto;display:block;background:none;border:none;box-shadow:none;padding:0;z-index:2147483647;opacity:0;transition:opacity .2s ease;pointer-events:auto;overflow:visible;`;
      const MAX = Math.min(categories.length,9), radius=105, btnSize=54;
      const startDeg=195, endDeg=345, sz=(radius+btnSize)*2+12, halfH=radius+btnSize+6;
      const wrap = document.createElement("div");
      wrap.style.cssText = `position:relative;width:${sz}px;height:${halfH}px;`;
      const curCatW = categories.find(c=>c.isCurrent);
      const curHueW = curCatW?_lpMiniHue(curCatW.label):210;
      const centerW = document.createElement("div");
      centerW.style.cssText = `position:absolute;left:50%;top:${halfH-btnSize/2}px;transform:translate(-50%,-50%);width:52px;height:52px;border-radius:50%;background:rgba(20,20,20,0.95);border:2px solid hsla(${curHueW},60%,55%,0.6);display:flex;align-items:center;justify-content:center;font-size:8px;color:rgba(255,255,255,0.55);text-align:center;pointer-events:none;padding:4px;line-height:1.3;font-weight:600;`;
      centerW.textContent = curCatW?curCatW.label.slice(0,10):"●";
      wrap.appendChild(centerW);
      categories.slice(0,MAX).forEach((cat,i) => {
        const angle=startDeg+(i/Math.max(MAX-1,1))*(endDeg-startDeg), rad=angle*Math.PI/180, hue=_lpMiniHue(cat.label);
        const x=sz/2+radius*Math.cos(rad)-btnSize/2, y=halfH+radius*Math.sin(rad)-btnSize/2;
        const s=cat.label.length>7?cat.label.slice(0,6)+"…":cat.label;
        const btn = makeCatItem(cat,
          `position:absolute;left:${Math.round(x)}px;top:${Math.round(y)}px;width:${btnSize}px;height:${btnSize}px;border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;font-size:10px;line-height:1.2;padding:4px;word-break:break-word;cursor:pointer;transition:all .15s;outline:none;font-family:inherit;backdrop-filter:blur(8px);box-shadow:0 3px 14px rgba(0,0,0,0.45);border:2px solid ${cat.isCurrent?"rgba(59,130,246,0.85)":"hsla("+hue+",55%,55%,0.38)"};background:${cat.isCurrent?"rgba(59,130,246,0.45)":"hsla("+hue+",45%,18%,0.92)"};color:${cat.isCurrent?"#fff":"#ccc"};`,s
        );
        btn.addEventListener("mouseover",()=>applyHighlight(btn,true,cat.isCurrent));
        btn.addEventListener("mouseout", ()=>applyHighlight(btn,false,cat.isCurrent));
        _kbItems.push({el:btn,cat}); wrap.appendChild(btn);
      });
      miniCategoryPanel.appendChild(wrap);

    } else {
      // ── LIST (default): senarai menegak + stripe warna ────────────
      miniCategoryPanel.appendChild(header);
      const itemsContainer = document.createElement("div");
      itemsContainer.id = "__pocket_mini_items_container";
      itemsContainer.style.cssText = `display:flex;flex-direction:column;gap:3px;max-height:360px;overflow-y:auto;padding:2px;scrollbar-width:none;`;
      categories.forEach(cat => {
        const hue = _lpMiniHue(cat.label);
        const item = makeCatItem(cat,
          `padding:6px 12px;border-radius:7px;font-size:12px;cursor:pointer;white-space:nowrap;transition:all .15s;outline:none;font-family:inherit;width:100%;text-align:left;border-left:3px solid hsla(${hue},60%,55%,0.55);border-top:1px solid rgba(255,255,255,0.04);border-right:1px solid rgba(255,255,255,0.04);border-bottom:1px solid rgba(255,255,255,0.04);background:${cat.isCurrent?"rgba(59,130,246,0.38)":"rgba(255,255,255,0.07)"};color:${cat.isCurrent?"#fff":"#ccc"};`
        );
        item.addEventListener("mouseover", () => applyHighlight(item, true, cat.isCurrent));
        item.addEventListener("mouseout",  () => applyHighlight(item, false, cat.isCurrent));
        _kbItems.push({ el: item, cat });
        itemsContainer.appendChild(item);
      });
      miniCategoryPanel.appendChild(itemsContainer);
    }
  }

    function init() {
    // Don't inject twice
    if (document.getElementById(CONTAINER_ID)) {
      log("[Floating] Already injected");
      return;
    }

    // Container
    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.style.cssText = `
      position: fixed;
      left: ${floatingButtonOffsetX}px;
      top: ${floatingButtonOffsetY}px;
      right: auto;
      bottom: auto;
      transform: none;
      z-index: 2147483646;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition: opacity 160ms ease, left 180ms ease, right 180ms ease, top 180ms ease, bottom 180ms ease, transform 180ms ease;
    `;

    // Mini Category Panel
    miniCategoryPanel = document.createElement("div");
    miniCategoryPanel.id = "__pocket_mini_category_panel";
    miniCategoryPanel.style.cssText = `
      position: absolute;
      left: auto;
      top: auto;
      display: none;
      flex-direction: column;
      background: rgba(20, 20, 20, 0.9);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 6px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.6);
      z-index: 2147483647;
      opacity: 0;
      transition: opacity 0.2s ease;
      pointer-events: auto;
      min-width: 140px;
      overflow: visible;
    `;
    container.appendChild(miniCategoryPanel);

    const subSize = floatingSubButtonSize;
    const subFont = Math.max(10, Math.round(subSize * 0.45));
    const subScale = subSize / 48;
    // Semi-circle arc layout: 11 butang dari 180° → 0°, radius 160, spacing 18° (simetri)
    // Sudut: S=180°, D=162°, B=144°, A=126°, G=108°, 👁=90°, ★=72°, P=54°, N=36°, X=18°, R=0°
    const R_ARC = 160;
    function arcPt(deg) {
      const rad = deg * Math.PI / 180;
      return {
        x: Math.round(R_ARC * Math.cos(rad) * subScale),
        y: Math.round(-R_ARC * Math.sin(rad) * subScale),
      };
    }
    const ptS   = arcPt(180); // S  (-160, 0)
    const ptD   = arcPt(162); // D  (-152, -49)
    const ptB   = arcPt(144); // B  (-129, -94)
    const ptA   = arcPt(126); // A  (-94, -129)
    const ptG   = arcPt(108); // G  (-49, -152)
    const ptEye = arcPt(90);  // 👁  (0, -160)
    const ptStar = arcPt(72); // ★  (+49, -152)
    const ptP   = arcPt(54);  // P  (+94, -129)
    const ptN   = arcPt(36);  // N  (+129, -94)
    const ptX   = arcPt(18);  // X  (+152, -49)
    const ptR   = arcPt(0);   // R  (+160, 0)
    const dismissTranslateX = ptX.x;
    const dismissTranslateY = ptX.y;
    const notesTranslateX = ptN.x;
    const notesTranslateY = ptN.y;

    // Delete After Open toggle button ("D" button)
    const deleteBtn = document.createElement("button");
    deleteBtn.id = "__pocket_delete_after_open_btn";
    deleteBtn.setAttribute("aria-label", "Toggle Delete After Opening");
    deleteBtn.title = deleteAfterOpenActive ? "Delete After Opening (Aktif)" : "Delete After Opening (Tidak Aktif)";
    deleteBtn.textContent = "D";
    deleteBtn.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) translate(${ptD.x}px, ${ptD.y}px);
      width: ${subSize}px;
      height: ${subSize}px;
      border-radius: 50%;
      background: ${deleteAfterOpenActive ? "rgba(168, 85, 247, 0.3)" : "rgba(0, 0, 0, 0.4)"};
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: ${deleteAfterOpenActive ? "#e9d5ff" : "#c084fc"};
      box-shadow: ${deleteAfterOpenActive ? "0 0 20px rgba(168, 85, 247, 0.8)" : "0 0 15px rgba(168, 85, 247, 0.6), inset 0 0 5px rgba(168, 85, 247, 0.3)"};
      font-size: ${subFont}px;
      font-weight: 700;
      font-family: 'Orbitron', 'Rajdhani', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
      padding: 0;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      z-index: 10;
    `;
    deleteBtn.addEventListener("mouseover", function() {
      this.style.background = deleteAfterOpenActive ? "rgba(168, 85, 247, 0.5)" : "rgba(0, 0, 0, 0.6)";
      this.style.borderColor = "rgba(255,255,255,0.4)";
      this.style.transform = `translate(-50%, -50%) translate(${ptD.x}px, ${ptD.y}px) scale(1.1)`;
    });
    deleteBtn.addEventListener("mouseout", function() {
      this.style.background = deleteAfterOpenActive ? "rgba(168, 85, 247, 0.3)" : "rgba(0, 0, 0, 0.4)";
      this.style.borderColor = "rgba(255,255,255,0.1)";
      this.style.transform = `translate(-50%, -50%) translate(${ptD.x}px, ${ptD.y}px) scale(1)`;
    });
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const newValue = !deleteAfterOpenActive;
      deleteAfterOpenActive = newValue;
      deleteBtn.title = deleteAfterOpenActive ? "Delete After Opening (Aktif)" : "Delete After Opening (Tidak Aktif)";
      deleteBtn.style.background = deleteAfterOpenActive ? "rgba(168, 85, 247, 0.3)" : "rgba(0, 0, 0, 0.4)";
      deleteBtn.style.color = deleteAfterOpenActive ? "#e9d5ff" : "#c084fc";
      deleteBtn.style.boxShadow = deleteAfterOpenActive ? "0 0 20px rgba(168, 85, 247, 0.8)" : "0 0 15px rgba(168, 85, 247, 0.6), inset 0 0 5px rgba(168, 85, 247, 0.3)";
      
      lpApi.storage.local.get("settings").then((data) => {
        const settings = data && data.settings ? data.settings : {};
        settings.deleteAfterOpen = newValue;
        lpApi.storage.local.set({ settings }).catch(() => {});
      }).catch(() => {});
    });

    // Auto Next toggle button ("A" button)
    const autoNextBtn = document.createElement("button");
    autoNextBtn.id = "__pocket_auto_next_btn";
    autoNextBtn.setAttribute("aria-label", "Toggle Auto Next");
    autoNextBtn.title = youtubeAutoNext ? "Auto Next (Aktif)" : "Auto Next (Tidak Aktif)";
    autoNextBtn.textContent = "A";
    autoNextBtn.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) translate(${ptA.x}px, ${ptA.y}px);
      width: ${subSize}px;
      height: ${subSize}px;
      border-radius: 50%;
      background: ${youtubeAutoNext ? "rgba(236, 72, 153, 0.3)" : "rgba(0, 0, 0, 0.4)"};
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: ${youtubeAutoNext ? "#fbcfe8" : "#f472b6"};
      box-shadow: ${youtubeAutoNext ? "0 0 20px rgba(236, 72, 153, 0.8)" : "0 0 15px rgba(236, 72, 153, 0.6), inset 0 0 5px rgba(236, 72, 153, 0.3)"};
      font-size: ${subFont}px;
      font-weight: 700;
      font-family: 'Orbitron', 'Rajdhani', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
      padding: 0;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      z-index: 10;
    `;
    autoNextBtn.addEventListener("mouseover", function() {
      this.style.background = youtubeAutoNext ? "rgba(236, 72, 153, 0.5)" : "rgba(0, 0, 0, 0.6)";
      this.style.borderColor = "rgba(255,255,255,0.4)";
      this.style.transform = `translate(-50%, -50%) translate(${ptA.x}px, ${ptA.y}px) scale(1.1)`;
    });
    autoNextBtn.addEventListener("mouseout", function() {
      this.style.background = youtubeAutoNext ? "rgba(236, 72, 153, 0.3)" : "rgba(0, 0, 0, 0.4)";
      this.style.borderColor = "rgba(255, 255, 255, 0.1)";
      this.style.transform = `translate(-50%, -50%) translate(${ptA.x}px, ${ptA.y}px) scale(1)`;
    });
    autoNextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const newValue = !youtubeAutoNext;
      youtubeAutoNext = newValue;
      autoNextBtn.title = youtubeAutoNext ? "Auto Next (Aktif)" : "Auto Next (Tidak Aktif)";
      autoNextBtn.style.background = youtubeAutoNext ? "rgba(236, 72, 153, 0.3)" : "rgba(0, 0, 0, 0.4)";
      autoNextBtn.style.color = youtubeAutoNext ? "#fbcfe8" : "#f472b6";
      autoNextBtn.style.boxShadow = youtubeAutoNext ? "0 0 20px rgba(236, 72, 153, 0.8)" : "0 0 15px rgba(236, 72, 153, 0.6), inset 0 0 5px rgba(236, 72, 153, 0.3)";
      
      lpApi.storage.local.get("settings").then((data) => {
        const settings = data && data.settings ? data.settings : {};
        settings.youtubeAutoNext = newValue;
        lpApi.storage.local.set({ settings }).catch(() => {});
      }).catch(() => {});
    });

    const favoriteSaveBtnLocal = document.createElement("button");
    favoriteSaveBtn = favoriteSaveBtnLocal;
    favoriteSaveBtn.id = "__pocket_favorite_save_btn";
    favoriteSaveBtn.setAttribute("aria-label", "Toggle Favorite for current page");
    favoriteSaveBtn.textContent = "\u2605";
    favoriteSaveBtn.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) translate(${ptStar.x}px, ${ptStar.y}px);
      width: ${subSize}px;
      height: ${subSize}px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #facc15;
      box-shadow: 0 0 15px rgba(250, 204, 21, 0.6), inset 0 0 5px rgba(250, 204, 21, 0.25);
      font-size: ${subFont}px;
      font-weight: 700;
      font-family: 'Orbitron', 'Rajdhani', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
      padding: 0;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      z-index: 10;
    `;
    updateFavoriteBtnUI();
    favoriteSaveBtn.addEventListener("mouseover", function() {
      this.style.background = isCurrentPageFavorite
        ? "rgba(250, 204, 21, 0.28)"
        : "rgba(255, 255, 255, 0.12)";
      this.style.borderColor = "rgba(255,255,255,0.4)";
      this.style.transform = `translate(-50%, -50%) translate(${ptStar.x}px, ${ptStar.y}px) scale(1.1)`;
    });
    favoriteSaveBtn.addEventListener("mouseout", function() {
      updateFavoriteBtnUI();
      this.style.transform = `translate(-50%, -50%) translate(${ptStar.x}px, ${ptStar.y}px) scale(1)`;
    });
    favoriteSaveBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (favoriteSaveBtn.disabled) return;
      favoriteSaveBtn.disabled = true;
      favoriteSaveBtn.style.opacity = "0.75";
      favoriteSaveBtn.style.cursor = "wait";
      try {
        await toggleCurrentPageFavorite();
      } finally {
        favoriteSaveBtn.disabled = false;
        favoriteSaveBtn.style.opacity = "1";
        favoriteSaveBtn.style.cursor = "pointer";
        updateFavoriteBtnUI();
      }
    });

    const saveToggleBtnLocal = document.createElement("button");
    saveToggleBtn = saveToggleBtnLocal;
    saveToggleBtn.id = "__pocket_save_btn";
    saveToggleBtn.setAttribute("aria-label", "Toggle Save Page");
    saveToggleBtn.textContent = "S";
    saveToggleBtn.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) translate(${ptS.x}px, ${ptS.y}px);
      width: ${subSize}px;
      height: ${subSize}px;
      border-radius: 50%;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-size: ${subFont}px;
      font-weight: 700;
      font-family: 'Orbitron', 'Rajdhani', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
      padding: 0;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      z-index: 10;
    `;
    updateSaveBtnUI();
    saveToggleBtn.addEventListener("mouseover", function() {
      this.style.transform = `translate(-50%, -50%) translate(${ptS.x}px, ${ptS.y}px) scale(1.1)`;
      this.style.borderColor = "rgba(255,255,255,0.4)";
      this.style.background = isCurrentPageSaved ? "rgba(59, 130, 246, 0.5)" : "rgba(0, 0, 0, 0.6)";
    });
    saveToggleBtn.addEventListener("mouseout", function() {
      this.style.transform = `translate(-50%, -50%) translate(${ptS.x}px, ${ptS.y}px) scale(1)`;
      this.style.borderColor = "rgba(255, 255, 255, 0.1)";
      this.style.background = isCurrentPageSaved ? "rgba(59, 130, 246, 0.3)" : "rgba(0, 0, 0, 0.4)";
    });
    saveToggleBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      // Optimistic update
      const wasSaved = isCurrentPageSaved;
      isCurrentPageSaved = !wasSaved;
      updateSaveBtnUI();

      const rollback = () => {
        isCurrentPageSaved = wasSaved;
        updateSaveBtnUI();
      };

      try {
        if (wasSaved) {
          lpApi.runtime.sendMessage({ type: "remove-link-url", url: window.location.href }).catch(() => { rollback(); });
        } else {
          const thumbnailUrl = getThumbnailUrlFromPage();
          const resp = await lpApi.runtime.sendMessage({ 
            type: "save-link-url", 
            url: window.location.href, 
            title: document.title,
            thumbnailUrl
          }).catch(() => null);
          if (resp && resp.ok) {
            showSavedLinkToast(resp.categoryName || "", resp.categoryId || "");
          } else {
            rollback();
            showLinkToast("Failed to save page");
          }
        }
      } catch (err) { rollback(); }
    });

    // Settings (P) button
    const settingsBtn = document.createElement("button");
    settingsBtn.id = "__pocket_settings_btn";
    settingsBtn.setAttribute("aria-label", "Buka Tetapan");
    settingsBtn.title = "Settings (S)";
    settingsBtn.textContent = "P";
    settingsBtn.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) translate(${ptP.x}px, ${ptP.y}px);
      width: ${subSize}px;
      height: ${subSize}px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #fb923c;
      box-shadow: 0 0 15px rgba(249, 115, 22, 0.6), inset 0 0 5px rgba(249, 115, 22, 0.3);
      font-size: ${subFont}px;
      font-weight: 700;
      font-family: 'Orbitron', 'Rajdhani', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
      padding: 0;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      z-index: 10;
    `;
    settingsBtn.addEventListener("mouseover", function() {
      this.style.background = "rgba(0, 0, 0, 0.6)";
      this.style.borderColor = "rgba(255,255,255,0.4)";
      this.style.transform = `translate(-50%, -50%) translate(${ptP.x}px, ${ptP.y}px) scale(1.1)`;
    });
    settingsBtn.addEventListener("mouseout", function() {
      this.style.background = "rgba(0, 0, 0, 0.4)";
      this.style.borderColor = "rgba(255, 255, 255, 0.1)";
      this.style.transform = `translate(-50%, -50%) translate(${ptP.x}px, ${ptP.y}px) scale(1)`;
    });
    settingsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        lpApi.runtime.sendMessage({ type: "open-options" }).catch(() => {});
      } catch (err) {}
    });

    // Notes (N) button
    const notesBtn = document.createElement("button");
    notesBtn.id = "__pocket_notes_btn";
    notesBtn.setAttribute("aria-label", "Buka notepad");
    notesBtn.title = "Open Notepad (N)";
    notesBtn.textContent = "N";
    notesBtn.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) translate(${notesTranslateX}px, ${notesTranslateY}px);
      width: ${subSize}px;
      height: ${subSize}px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.32);
      color: #f8fafc;
      box-shadow: 0 0 16px rgba(255, 255, 255, 0.2), inset 0 0 5px rgba(255, 255, 255, 0.14);
      font-size: ${subFont}px;
      font-family: 'Orbitron', 'Rajdhani', sans-serif;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
      padding: 0;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      z-index: 10;
    `;
    notesBtn.addEventListener("mouseover", function() {
      this.style.background = "rgba(255, 255, 255, 0.12)";
      this.style.borderColor = "rgba(255,255,255,0.72)";
      this.style.transform = `translate(-50%, -50%) translate(${notesTranslateX}px, ${notesTranslateY}px) scale(1.1)`;
    });
    notesBtn.addEventListener("mouseout", function() {
      this.style.background = "rgba(0, 0, 0, 0.4)";
      this.style.borderColor = "rgba(255, 255, 255, 0.32)";
      this.style.transform = `translate(-50%, -50%) translate(${notesTranslateX}px, ${notesTranslateY}px) scale(1)`;
    });
    notesBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        lpApi.runtime.sendMessage({ type: "open-notes-sidebar" }).catch(() => {});
      } catch (err) {}
    });

    // Dismiss (X) button to hide for current tab
    const dismissBtn = document.createElement("button");
    dismissBtn.id = "__pocket_dismiss_btn";
    dismissBtn.setAttribute("aria-label", "Hide floating button");
    dismissBtn.title = "Hide floating button for this tab";
    dismissBtn.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) translate(${dismissTranslateX}px, ${dismissTranslateY}px);
      width: ${subSize}px;
      height: ${subSize}px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #ef4444;
      box-shadow: 0 0 15px rgba(239, 68, 68, 0.6), inset 0 0 5px rgba(239, 68, 68, 0.3);
      font-size: ${subFont}px;
      font-family: 'Orbitron', 'Rajdhani', sans-serif;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
      padding: 0;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      z-index: 10;
    `;
    dismissBtn.textContent = "✕";
    dismissBtn.addEventListener("mouseover", function() {
      this.style.background = "rgba(0, 0, 0, 0.6)";
      this.style.borderColor = "rgba(255,255,255,0.4)";
      this.style.transform = `translate(-50%, -50%) translate(${dismissTranslateX}px, ${dismissTranslateY}px) scale(1.1)`;
    });
    dismissBtn.addEventListener("mouseout", function() {
      this.style.background = "rgba(0, 0, 0, 0.4)";
      this.style.borderColor = "rgba(255, 255, 255, 0.1)";
      this.style.transform = `translate(-50%, -50%) translate(${dismissTranslateX}px, ${dismissTranslateY}px) scale(1)`;
    });
    dismissBtn.textContent = "X";
    dismissBtn.style.transform = `translate(-50%, -50%) translate(${dismissTranslateX}px, ${dismissTranslateY}px)`;
    dismissBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      floatingSuppressed = true;
      window.hidePocket();
    });

    // Background Tab toggle button ("B" button)
    const bgTabBtn = document.createElement("button");
    bgTabBtn.id = "__pocket_bg_tab_btn";
    bgTabBtn.setAttribute("aria-label", "Toggle Background Tab for Next/Random Link");
    bgTabBtn.title = globalLinkInBackgroundTabActive ? "Background Tab (Aktif)" : "Background Tab (Tidak Aktif)";
    bgTabBtn.textContent = "B";
    bgTabBtn.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) translate(${ptB.x}px, ${ptB.y}px);
      width: ${subSize}px;
      height: ${subSize}px;
      border-radius: 50%;
      background: ${globalLinkInBackgroundTabActive ? "rgba(34, 197, 94, 0.3)" : "rgba(0, 0, 0, 0.4)"};
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: ${globalLinkInBackgroundTabActive ? "#bbf7d0" : "#4ade80"};
      box-shadow: ${globalLinkInBackgroundTabActive ? "0 0 20px rgba(34, 197, 94, 0.8)" : "0 0 15px rgba(34, 197, 94, 0.6), inset 0 0 5px rgba(34, 197, 94, 0.3)"};
      font-size: ${subFont}px;
      font-weight: 700;
      font-family: 'Orbitron', 'Rajdhani', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
      padding: 0;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      z-index: 10;
    `;
    bgTabBtn.addEventListener("mouseover", function() {
      this.style.background = globalLinkInBackgroundTabActive ? "rgba(34, 197, 94, 0.5)" : "rgba(0, 0, 0, 0.6)";
      this.style.borderColor = "rgba(255,255,255,0.4)";
      this.style.transform = `translate(-50%, -50%) translate(${ptB.x}px, ${ptB.y}px) scale(1.1)`;
    });
    bgTabBtn.addEventListener("mouseout", function() {
      this.style.background = globalLinkInBackgroundTabActive ? "rgba(34, 197, 94, 0.3)" : "rgba(0, 0, 0, 0.4)";
      this.style.borderColor = "rgba(255, 255, 255, 0.1)";
      this.style.transform = `translate(-50%, -50%) translate(${ptB.x}px, ${ptB.y}px) scale(1)`;
    });
    bgTabBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const newValue = !globalLinkInBackgroundTabActive;
      globalLinkInBackgroundTabActive = newValue;
      bgTabBtn.title = globalLinkInBackgroundTabActive ? "Background Tab (Aktif)" : "Background Tab (Tidak Aktif)";
      bgTabBtn.style.background = globalLinkInBackgroundTabActive ? "rgba(34, 197, 94, 0.3)" : "rgba(0, 0, 0, 0.4)";
      bgTabBtn.style.color = globalLinkInBackgroundTabActive ? "#bbf7d0" : "#4ade80";
      bgTabBtn.style.boxShadow = globalLinkInBackgroundTabActive ? "0 0 20px rgba(34, 197, 94, 0.8)" : "0 0 15px rgba(34, 197, 94, 0.6), inset 0 0 5px rgba(34, 197, 94, 0.3)";
      
      lpApi.storage.local.get("settings").then((data) => {
        const settings = data && data.settings ? data.settings : {};
        settings.globalLinkInBackgroundTab = newValue;
        lpApi.storage.local.set({ settings }).catch(() => {});
      }).catch(() => {});
    });

    // Gesture toggle button ("G" button)
    const gestureBtn = document.createElement("button");
    gestureBtn.id = "__pocket_gesture_btn";
    gestureBtn.setAttribute("aria-label", "Toggle Gesture Detection");
    gestureBtn.title = _gestureRuntimeEnabled ? "Gesture (Aktif)" : "Gesture (Tidak Aktif)";
    gestureBtn.textContent = "G";
    gestureBtn.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) translate(${ptG.x}px, ${ptG.y}px);
      width: ${subSize}px;
      height: ${subSize}px;
      border-radius: 50%;
      background: ${_gestureRuntimeEnabled ? "rgba(34, 211, 238, 0.3)" : "rgba(0, 0, 0, 0.4)"};
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: ${_gestureRuntimeEnabled ? "#cffafe" : "#22d3ee"};
      box-shadow: ${_gestureRuntimeEnabled ? "0 0 20px rgba(34, 211, 238, 0.8)" : "0 0 15px rgba(34, 211, 238, 0.6), inset 0 0 5px rgba(34, 211, 238, 0.3)"};
      font-size: ${subFont}px;
      font-weight: 700;
      font-family: 'Orbitron', 'Rajdhani', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
      padding: 0;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      z-index: 10;
    `;
    gestureBtn.addEventListener("mouseover", function() {
      this.style.background = _gestureRuntimeEnabled ? "rgba(34, 211, 238, 0.5)" : "rgba(0, 0, 0, 0.6)";
      this.style.borderColor = "rgba(255,255,255,0.4)";
      this.style.transform = `translate(-50%, -50%) translate(${ptG.x}px, ${ptG.y}px) scale(1.1)`;
    });
    gestureBtn.addEventListener("mouseout", function() {
      this.style.background = _gestureRuntimeEnabled ? "rgba(34, 211, 238, 0.3)" : "rgba(0, 0, 0, 0.4)";
      this.style.borderColor = "rgba(255, 255, 255, 0.1)";
      this.style.transform = `translate(-50%, -50%) translate(${ptG.x}px, ${ptG.y}px) scale(1)`;
    });
    gestureBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const newValue = !_gestureRuntimeEnabled;
      _gestureRuntimeEnabled = newValue;
      gestureBtn.title = _gestureRuntimeEnabled ? "Gesture (Aktif)" : "Gesture (Tidak Aktif)";
      gestureBtn.style.background = _gestureRuntimeEnabled ? "rgba(34, 211, 238, 0.3)" : "rgba(0, 0, 0, 0.4)";
      gestureBtn.style.color = _gestureRuntimeEnabled ? "#cffafe" : "#22d3ee";
      gestureBtn.style.boxShadow = _gestureRuntimeEnabled ? "0 0 20px rgba(34, 211, 238, 0.8)" : "0 0 15px rgba(34, 211, 238, 0.6), inset 0 0 5px rgba(34, 211, 238, 0.3)";
      
      try {
        const data = await lpApi.storage.local.get("settings");
        const settings = data && data.settings ? data.settings : {};
        settings.gestureEnabled = newValue;
        if (!newValue) {
          settings.categoryPickerMouseGesture = false;
        }
        await lpApi.storage.local.set({ settings });
      } catch (err) {}
      
      // If turning ON and gesture detection hasn't started yet, initialize it
      if (newValue && !_gestureDetectionStarted) {
        try {
          const data = await lpApi.storage.local.get("settings");
          const settings = data && data.settings ? data.settings : {};
          _startGestureDetectionIfNeeded(settings);
        } catch (err) {}
      }
    });

    // Eye toggle button ("👁" — show/hide hidden categories)
    const eyeBtn = document.createElement("button");
    eyeBtn.id = "__pocket_eye_toggle_btn";
    eyeBtn.setAttribute("aria-label", "Toggle show hidden categories");
    eyeBtn.title = "Togol paparan kategori hidden";
    eyeBtn.textContent = "👁";
    const eyeTx = ptEye.x;
    const eyeTy = ptEye.y;
    eyeBtn.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) translate(${eyeTx}px, ${eyeTy}px);
      width: ${subSize}px;
      height: ${subSize}px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.32);
      color: #f8fafc;
      box-shadow: 0 0 16px rgba(255, 255, 255, 0.2), inset 0 0 5px rgba(255, 255, 255, 0.14);
      font-size: ${Math.max(9, Math.round(subFont * 0.75))}px;
      font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
      padding: 0;
      overflow: hidden;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      z-index: 10;
    `;
    function updateEyeBtnIcon(state) {
      if (state === 2) {
        eyeBtn.textContent = "🙈";
        eyeBtn.title = "Hanya papar kategori hidden — klik untuk balik normal";
      } else if (state === 1 || state === true) {
        eyeBtn.textContent = "👁️‍🗨️";
        eyeBtn.title = "Papar semua kategori — klik untuk hanya hidden";
      } else {
        eyeBtn.textContent = "👁️";
        eyeBtn.title = "Normal — klik untuk papar kategori hidden";
      }
    }
    (async () => {
      try {
        const _data = await lpApi.storage.local.get(SETTINGS_KEY);
        const _s = _data && _data[SETTINGS_KEY] ? _data[SETTINGS_KEY] : {};
        updateEyeBtnIcon(_s.showHiddenCategories || 0);
      } catch (_) {}
    })();
    eyeBtn.addEventListener("mouseover", function() {
      this.style.background = "rgba(255, 255, 255, 0.12)";
      this.style.borderColor = "rgba(255,255,255,0.72)";
      this.style.transform = `translate(-50%, -50%) translate(${eyeTx}px, ${eyeTy}px) scale(1.1)`;
    });
    eyeBtn.addEventListener("mouseout", function() {
      this.style.background = "rgba(0, 0, 0, 0.4)";
      this.style.borderColor = "rgba(255, 255, 255, 0.32)";
      this.style.transform = `translate(-50%, -50%) translate(${eyeTx}px, ${eyeTy}px) scale(1)`;
    });
    eyeBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        const _data = await lpApi.storage.local.get(SETTINGS_KEY);
        const _s = _data && _data[SETTINGS_KEY] ? _data[SETTINGS_KEY] : {};
        const current = _s.showHiddenCategories || 0;
        let next = current >= 2 ? 0 : current + 1;
        _s.showHiddenCategories = next;
        await lpApi.storage.local.set({ [SETTINGS_KEY]: _s });
        updateEyeBtnIcon(next);
        try {
          if (!miniCategoryVisible) {
            await showMiniCategories();
          } else {
            const nc = await loadQuickLinkSaveCategoryEntries();
            renderMiniCategoryItems(nc, next);
          }
        } catch (_) {}
      } catch (_) {}
    });
    eyeBtn.addEventListener("wheel", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const _data = await lpApi.storage.local.get(SETTINGS_KEY);
        const _s = _data && _data[SETTINGS_KEY] ? _data[SETTINGS_KEY] : {};
        const current = _s.showHiddenCategories || 0;
        let next;
        if (e.deltaY < 0) {
          next = current === 0 ? 2 : current === 1 ? 0 : 1;
        } else {
          next = current === true || current === 1 ? 2 : current === 2 ? 0 : 1;
        }
        _s.showHiddenCategories = next;
        await lpApi.storage.local.set({ [SETTINGS_KEY]: _s });
        updateEyeBtnIcon(next);
        try {
          if (!miniCategoryVisible) {
            await showMiniCategories();
          } else {
            const nc = await loadQuickLinkSaveCategoryEntries();
            renderMiniCategoryItems(nc, next);
          }
        } catch (_) {}
      } catch (_) {}
    }, { passive: false });

    // Rediscover toggle ("R") button
    const rediscoverBtn = document.createElement("button");
    rediscoverBtn.id = "__pocket_rediscover_btn";
    rediscoverBtn.setAttribute("aria-label", "Toggle Rediscover notification");
    rediscoverBtn.textContent = "R";
    const rTx = ptR.x;
    const rTy = ptR.y;
    rediscoverBtn.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) translate(${rTx}px, ${rTy}px);
      width: ${subSize}px;
      height: ${subSize}px;
      border-radius: 50%;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-size: ${subFont}px;
      font-family: 'Orbitron', 'Rajdhani', sans-serif;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
      padding: 0;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      z-index: 10;
    `;
    updateRediscoverBtnUI(rediscoverBtn, rediscoverEnabled);
    rediscoverBtn.addEventListener("mouseover", function() {
      this.style.transform = `translate(-50%, -50%) translate(${rTx}px, ${rTy}px) scale(1.1)`;
    });
    rediscoverBtn.addEventListener("mouseout", function() {
      this.style.transform = `translate(-50%, -50%) translate(${rTx}px, ${rTy}px) scale(1)`;
    });
    rediscoverBtn.addEventListener("click", handleRediscoverToggleClick);

    // Button
    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.style.cssText = `
      width: ${DEFAULT_BTN_SIZE}px;
      height: ${DEFAULT_BTN_SIZE}px;
      border: none;
      border-radius: 50%;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: none;
      transition: transform 0.18s ease;
      pointer-events: auto;
      padding: 0;
    `;

    // Icon
    const img = document.createElement("img");
    img.src = resolveIconSrc();
    img.style.cssText = `
      width: ${Math.round(DEFAULT_BTN_SIZE * DEFAULT_ICON_RATIO)}px;
      height: ${Math.round(DEFAULT_BTN_SIZE * DEFAULT_ICON_RATIO)}px;
      pointer-events: none;
      border-radius: 50%;
    `;

    btn.appendChild(img);
    buttonImg = img;
    updateButtonSize();

    // Next-up label (create once; visibility controlled by setting)
    nextUpTextEl = document.createElement("div");
    nextUpTextEl.style.position = "absolute";
    nextUpTextEl.style.left = "50%";
    nextUpTextEl.style.top = "100%";
    nextUpTextEl.style.marginTop = "8px";
    nextUpTextEl.style.transform = "translate(-50%, 0)";
    nextUpTextEl.style.padding = "4px 10px";
    nextUpTextEl.style.borderRadius = "10px";
    nextUpTextEl.style.background = "rgba(0,0,0,0.72)";
    nextUpTextEl.style.color = "#fff";
    nextUpTextEl.style.fontSize = "11px";
    nextUpTextEl.style.fontWeight = "600";
    nextUpTextEl.style.boxShadow = "0 6px 16px rgba(0,0,0,0.28)";
    nextUpTextEl.style.pointerEvents = "auto";
    nextUpTextEl.style.whiteSpace = "nowrap";
    nextUpTextEl.style.maxWidth = floatingNextUpMaxWidth + "px";
    nextUpTextEl.style.overflow = "hidden";
    nextUpTextEl.style.textOverflow = "ellipsis";
    nextUpTextEl.style.opacity = "0";
    nextUpTextEl.style.transition = "opacity 120ms ease";
    nextUpTextEl.style.cursor = "pointer";
    nextUpTextInner = document.createElement("span");
    nextUpTextInner.style.display = "inline-block";
    nextUpTextInner.style.paddingRight = "2px";
    nextUpTextInner.style.willChange = "transform";
    nextUpTextEl.appendChild(nextUpTextInner);
    nextUpTextEl.addEventListener("click", (event) => {
      event.stopPropagation();
      openNextUpLink();
    });
    nextUpTextEl.addEventListener("auxclick", (event) => {
      if (event.button === 1) {
        event.stopPropagation();
        openNextUpLink(true);
      }
    });
    nextUpTextEl.addEventListener("pointerenter", () => {
      nextUpHovering = true;
      runNextUpMarquee(true);
    });
    nextUpTextEl.addEventListener("pointerleave", () => {
      nextUpHovering = false;
      cancelNextUpMarquee();
    });
    applyNextUpStyles();

    // Drag to move support (bounded), snap to nearest edge on release, persist
    let isDraggingBtn = false;
    let dragPointerId = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragMoved = false;
    let ignoreNextClick = false;
    const DRAG_ACTIVATE_PX = 5;
    let containerPrevTransition = "";
    btn.style.touchAction = "none";
    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return; // only primary
      isDraggingBtn = true;
      dragPointerId = e.pointerId;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragMoved = false;
      ignoreNextClick = false;
      try {
        btn.setPointerCapture(dragPointerId);
      } catch (err) {}
      btn.style.cursor = "grabbing";
      // Disable transitions during drag for instant responsive movement
      const containerEl = document.getElementById(CONTAINER_ID);
      if (containerEl) {
        containerPrevTransition = containerEl.style.transition || "";
        containerEl.style.transition = "none";
      }
      e.preventDefault();
      e.stopPropagation();
    });
    btn.addEventListener("pointermove", (e) => {
      if (!isDraggingBtn || e.pointerId !== dragPointerId) return;
      const clientX = e.clientX;
      const clientY = e.clientY;
      const rect = btn.getBoundingClientRect();
      const btnWidth = rect.width;
      const btnHeight = rect.height;
      if (!dragMoved) {
        const dx = Math.abs(clientX - dragStartX);
        const dy = Math.abs(clientY - dragStartY);
        if (dx <= DRAG_ACTIVATE_PX && dy <= DRAG_ACTIVATE_PX) {
          e.preventDefault();
          e.stopPropagation();
          return; // ignore tiny movement so it feels like a tap
        }
        dragMoved = true;
      }
      // Compute left/top and clamp so button never goes off-screen (8px margin)
      const margin = 8;
      const newLeft = Math.round(
        Math.min(
          Math.max(clientX - btnWidth / 2, margin),
          Math.max(margin, window.innerWidth - btnWidth - margin),
        ),
      );
      const newTop = Math.round(
        Math.min(
          Math.max(clientY - btnHeight / 2, margin),
          Math.max(margin, window.innerHeight - btnHeight - margin),
        ),
      );
      const containerEl = document.getElementById(CONTAINER_ID);
      if (containerEl) {
        containerEl.style.left = newLeft + "px";
        containerEl.style.top = newTop + "px";
        containerEl.style.right = "auto";
        containerEl.style.bottom = "auto";
        containerEl.style.transform = "none";
      }
      // Keep temp drag coords until release
      tempDragLeft = newLeft;
      tempDragTop = newTop;
      floatingButtonAnchor = "custom";
      e.preventDefault();
      e.stopPropagation();
    });
    btn.addEventListener("pointerup", (e) => {
      if (!isDraggingBtn || e.pointerId !== dragPointerId) return;
      try {
        btn.releasePointerCapture(dragPointerId);
      } catch (err) {}
      isDraggingBtn = false;
      dragPointerId = null;
      btn.style.cursor = "pointer";
      const hadDrag = dragMoved;
      const containerEl = document.getElementById(CONTAINER_ID);
      if (!hadDrag) {
        if (containerEl) containerEl.style.transition = containerPrevTransition;
        dragMoved = false;
        tempDragLeft = null;
        tempDragTop = null;
        return;
      }
      ignoreNextClick = true;
      if (!containerEl) return;

      // Store absolute offsets (no snapping).
      const rect = btn.getBoundingClientRect();
      const btnWidth = rect.width;
      const btnHeight = rect.height;
      const left = tempDragLeft != null ? tempDragLeft : rect.left;
      const top = tempDragTop != null ? tempDragTop : rect.top;
      const storedOffsetX = Math.round(
        Math.min(
          Math.max(left, VIEWPORT_MARGIN),
          Math.max(
            VIEWPORT_MARGIN,
            window.innerWidth - btnWidth - VIEWPORT_MARGIN,
          ),
        ),
      );
      const storedOffsetY = Math.round(
        Math.min(
          Math.max(top, VIEWPORT_MARGIN),
          Math.max(
            VIEWPORT_MARGIN,
            window.innerHeight - btnHeight - VIEWPORT_MARGIN,
          ),
        ),
      );

      // Re-enable transitions for smooth snap animation
      containerEl.style.transition =
        "left 180ms ease, right 180ms ease, top 180ms ease, bottom 180ms ease, transform 180ms ease";
      requestAnimationFrame(() => {
        containerEl.style.left = storedOffsetX + "px";
        containerEl.style.right = "auto";
        containerEl.style.top = storedOffsetY + "px";
        containerEl.style.bottom = "auto";
      });
      // Clear transition after animation completes (don't leave it on)
      setTimeout(() => {
        if (containerEl) containerEl.style.transition = "none";
      }, 220);

      // Update runtime vars
      floatingButtonAnchor = "custom";
      floatingButtonAnchorX = "left";
      floatingButtonAnchorY = "top";
      floatingButtonOffsetX = storedOffsetX;
      floatingButtonOffsetY = storedOffsetY;

      // Clear temporary position so distance tracker uses new pinned position
      if (temporaryButtonPosition) {
        temporaryButtonPosition = null;
      }

      // Persist new offsets to storage (with anchorX/Y)
      (async () => {
        try {
          const data = await lpApi.storage.local.get([
            SETTINGS_KEY,
            SIZE_OVERRIDE_KEY,
          ]);
          const settings = data[SETTINGS_KEY] || {};
          settings.floatingButtonOffsetX = floatingButtonOffsetX;
          settings.floatingButtonOffsetY = floatingButtonOffsetY;
          settings.floatingButtonAnchor = "custom";
          settings.floatingButtonAnchorX = floatingButtonAnchorX;
          settings.floatingButtonAnchorY = floatingButtonAnchorY;
          // Also persist current size to keep tabs in sync.
          settings.floatingButtonWidth = floatingButtonWidth;
          settings.floatingButtonHeight = floatingButtonHeight;
          settings.floatingButtonSize = Math.max(
            floatingButtonWidth,
            floatingButtonHeight,
          );
          settings.floatingButtonSizePreset = "custom";
          await lpApi.storage.local.set({
            [SETTINGS_KEY]: settings,
            [SIZE_OVERRIDE_KEY]: {
              width: floatingButtonWidth,
              height: floatingButtonHeight,
              size: Math.max(floatingButtonWidth, floatingButtonHeight),
            },
          });
        } catch (err) {
          log("[Floating] Failed to save offsets:", err);
        }
      })();

      tempDragLeft = null;
      tempDragTop = null;
      dragMoved = false;

      e.preventDefault();
      e.stopPropagation();
    });
    btn.addEventListener("pointercancel", (e) => {
      if (!isDraggingBtn || e.pointerId !== dragPointerId) return;
      try {
        btn.releasePointerCapture(dragPointerId);
      } catch (err) {}
      isDraggingBtn = false;
      dragPointerId = null;
      btn.style.cursor = "pointer";
      tempDragLeft = null;
      tempDragTop = null;
      dragMoved = false;
      ignoreNextClick = true;
      const containerEl = document.getElementById(CONTAINER_ID);
      if (containerEl) containerEl.style.transition = containerPrevTransition;
    });
    // Double click to reset to defaults
    btn.addEventListener("dblclick", (e) => {
      floatingButtonAnchor = "custom";
      floatingButtonAnchorX = "left";
      floatingButtonAnchorY = "top";
      floatingButtonOffsetX = Math.max(
        VIEWPORT_MARGIN,
        Math.round((window.innerWidth - floatingButtonWidth) / 2),
      );
      floatingButtonOffsetY = Math.max(
        VIEWPORT_MARGIN,
        Math.round((window.innerHeight - floatingButtonHeight) / 2),
      );
      updateButtonSize();
      (async () => {
        try {
          const data = await lpApi.storage.local.get(SETTINGS_KEY);
          const settings = data[SETTINGS_KEY] || {};
          settings.floatingButtonOffsetX = floatingButtonOffsetX;
          settings.floatingButtonOffsetY = floatingButtonOffsetY;
          settings.floatingButtonAnchor = "custom";
          settings.floatingButtonAnchorX = floatingButtonAnchorX;
          settings.floatingButtonAnchorY = floatingButtonAnchorY;
          await lpApi.storage.local.set({ [SETTINGS_KEY]: settings });
          showLinkToast("Floating button reset to center");
        } catch (err) {
          log("[Floating] Failed to save reset offsets:", err);
        }
      })();
    });

    // Right click to resize quickly
    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (floatingButtonVisibilityMode === "longpress") return;
      const currentSize = Number.isFinite(floatingButtonWidth)
        ? floatingButtonWidth
        : DEFAULT_BTN_SIZE;
      const input = window.prompt(
        "Set floating icon size (px, 40-400):",
        String(currentSize),
      );
      if (input === null) return;
      const parsed = Number.parseInt(input, 10);
      if (!Number.isFinite(parsed)) {
        showLinkToast("Size must be a number.");
        return;
      }
      const clamped = Math.min(Math.max(parsed, 40), 400);
      floatingButtonWidth = clamped;
      floatingButtonHeight = clamped;
      updateButtonSize();
      persistSizeIfChanged(clamped);
      showLinkToast(`Icon size set to ${clamped}px`);
    });

    // Button hover
    btn.onmouseover = function () {
      this.style.transform = "scale(1.08)";
      clearTimeout(hideTimer);
    };

    btn.onmouseout = function (e) {
      this.style.transform = "scale(1)";
      const clientX =
        e && typeof e.clientX === "number" ? e.clientX : lastClientX;
      const clientY =
        e && typeof e.clientY === "number" ? e.clientY : lastClientY;
      hideIfOutsideZone(clientX, clientY);
    };

    // Click handler (fire-and-forget to minimize latency)
    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (ignoreNextClick) {
        ignoreNextClick = false;
        log("[Floating] Click suppressed after drag");
        return;
      }
      log("[Floating] Left click detected - open category picker");
      if (enableCategoryPicker === false) {
        log("[Floating] Left click ignored: enableCategoryPicker is disabled");
        return;
      }
      if (blockPickerOnTextCursor && isCursorTextCursor(e.clientX, e.clientY)) {
        log("[Floating] Left click ignored: cursor is over text-editable area");
        return;
      }
      try {
        const result = lpApi.runtime.sendMessage({
          type: "open-category-picker",
        });
        if (result && typeof result.then === "function") {
          result.catch((err) => {
            if (err) {
              console.warn(
                "[Floating] Category picker failed:",
                err.message || err,
              );
            }
          });
        }
      } catch (err) {
        console.warn(
          "[Floating] Category picker failed:",
          err && err.message ? err.message : err,
        );
      }
    };

    // Hide on click outside zone
    document.addEventListener(
      "click",
      function (e) {
        // If a long press just fired, silently skip this click for hide/show logic
        // but do NOT call preventDefault/stopPropagation — page must receive the click normally.
        if (longPressSuppressClickUntil) {
          if (Date.now() <= longPressSuppressClickUntil) {
            longPressSuppressClickUntil = 0;
            return; // skip hide/show logic only, page click proceeds normally
          }
          longPressSuppressClickUntil = 0;
        }
        if (!isVisible) return;
        const c = document.getElementById(CONTAINER_ID);
        if (!c) return;

        // Check if click is on button or container
        if (c.contains(e.target) || btn.contains(e.target)) {
          return; // Click is inside, don't hide
        }

        // Click is outside zone, hide immediately
        window.hidePocket(true);
      },
      true,
    ); // Use capture phase

    // Modifier+Click on link to save the link URL
    if (!linkSaveListenersInstalled) {
      linkSaveListenersInstalled = true;
      document.addEventListener(
        "keydown",
        (event) => {
          if (!ctrlAltLinkSaveEnabled) return;
          linkSaveHeldModifiers.ctrl = !!event.ctrlKey;
          linkSaveHeldModifiers.alt = !!event.altKey;
          linkSaveHeldModifiers.shift = !!event.shiftKey;
          linkSaveHeldModifiers.meta = !!event.metaKey;

          const isModifierKey = ["Control", "Alt", "Shift", "Meta"].includes(event.key);
          const key = normalizeLinkSaveKeyboardKey(event.key);
          if (key) {
            linkSavePressedKeys.add(key);
            // If any non-modifier key is pressed, abort any pending modifier save
            if (modifierSaveTimer) {
              modifierSaveAborted = true;
            }
          }
          if (!key && !isModifierKey) {
            return;
          }

          if (linkSaveMouseButton === "hover" && _hoveredLinkUrl) {
            const _noMod = !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
            const isKeyboardMatch = _noMod && key && linkSaveKeyboardKey === key;
            const isBundleKeyboardMatch = _noMod && key && linkSaveBundleKeyboardKey && key === linkSaveBundleKeyboardKey;
            const isDirectKeyboardMatch = _noMod && key && linkSaveDirectKeyboardKey && key === linkSaveDirectKeyboardKey;
            const isActiveKeyboardMatch = _noMod && key && linkSaveActiveCategoryKeyboardKey && key === linkSaveActiveCategoryKeyboardKey;
            const isPrimaryModifierMatch = linkSaveModifierState && isModifierKey && (linkSavePressedKeys.size === 0) && hoverModifierMatches(linkSaveModifierState, event);
            const isBundleModifierMatch = linkSaveBundleModifierState && isModifierKey && (linkSavePressedKeys.size === 0) && hoverModifierMatches(linkSaveBundleModifierState, event);
            const isDirectModifierMatch = linkSaveDirectModifierState && isModifierKey && (linkSavePressedKeys.size === 0) && hoverModifierMatches(linkSaveDirectModifierState, event);
            const isActiveCategoryModifierMatch = linkSaveActiveCategoryModifierState && isModifierKey && (linkSavePressedKeys.size === 0) && hoverModifierMatches(linkSaveActiveCategoryModifierState, event);
            const isModifierMatch = isPrimaryModifierMatch || isBundleModifierMatch || isDirectModifierMatch || isActiveCategoryModifierMatch;
            const isKeyMatch = isKeyboardMatch || isBundleKeyboardMatch || isDirectKeyboardMatch || isActiveKeyboardMatch;
            if (isKeyMatch || isModifierMatch) {
              const tag = (event.target && event.target.tagName) ? event.target.tagName.toLowerCase() : "";
              if (tag !== "input" && tag !== "textarea" && tag !== "select") {
                if (!isModifierMatch) {
                  event.preventDefault();
                  event.stopPropagation();
                }

                let matchType = "primary";
                if (isDirectModifierMatch) {
                  matchType = "direct";
                } else if (isActiveCategoryModifierMatch) {
                  matchType = "activeCategory";
                } else if (isBundleModifierMatch) {
                  matchType = "bundle";
                } else if (isDirectKeyboardMatch) {
                  matchType = "direct";
                } else if (isActiveKeyboardMatch) {
                  matchType = "activeCategory";
                } else if (isBundleKeyboardMatch) {
                  matchType = "bundle";
                }

                if (isModifierMatch) {
                  if (modifierSaveTimer) clearTimeout(modifierSaveTimer);
                  modifierSaveAborted = false;
                  modifierSaveTimer = setTimeout(() => {
                    modifierSaveTimer = null;
                    if (!modifierSaveAborted && linkSavePressedKeys.size === 0) {
                      handleHoverLinkSave(matchType, lastClientX, lastClientY);
                    }
                  }, 150);
                } else {
                  handleHoverLinkSave(matchType, lastClientX, lastClientY);
                }
              }
            }
          }
        },
        true,
      );
      document.addEventListener(
        "keyup",
        async (event) => {
          if (!ctrlAltLinkSaveEnabled) return;
          linkSaveHeldModifiers.ctrl = !!event.ctrlKey;
          linkSaveHeldModifiers.alt = !!event.altKey;
          linkSaveHeldModifiers.shift = !!event.shiftKey;
          linkSaveHeldModifiers.meta = !!event.metaKey;

          const isModifierKey = ["Control", "Alt", "Shift", "Meta"].includes(event.key);
          if (isModifierKey) {
            if (modifierSaveTimer) {
              clearTimeout(modifierSaveTimer);
              modifierSaveTimer = null;
            }
          }

          linkSaveHoverLastSavedUrl = "";

          const key = normalizeLinkSaveKeyboardKey(event.key);
          if (key) linkSavePressedKeys.delete(key);
        },
        true,
      );
      window.addEventListener("blur", () => {
        linkSavePressedKeys.clear();
        if (typeof commitLinkSaveBundle === "function") commitLinkSaveBundle(true);
      });
      window.addEventListener("beforeunload", () => {
        if (typeof commitLinkSaveBundle === "function") commitLinkSaveBundle(true);
      });
      document.addEventListener(
        "visibilitychange",
        () => {
          if (document.hidden) {
            linkSavePressedKeys.clear();
            if (typeof commitLinkSaveBundle === "function") commitLinkSaveBundle(true);
          }
        },
        true,
      );

      const handleModifiedLinkSave = async (event) => {
        if (!floatingButtonEnabled) return;
        if (!ctrlAltLinkSaveEnabled) return;
        
        let isPrimaryMatch = false;
        if (linkSaveModifierState) {
          isPrimaryMatch = matchesLinkSaveModifierEvent(event, linkSaveModifierState, linkSaveMouseButton);
        } else {
          isPrimaryMatch = matchesLinkSaveKeyboardEvent(event, linkSaveKeyboardKey, linkSaveMouseButton);
        }

        let isBundleMatch = false;
        if (linkSaveBundleModifier) {
          if (linkSaveBundleModifierState) {
            isBundleMatch = matchesLinkSaveModifierEvent(event, linkSaveBundleModifierState, linkSaveMouseButton);
          } else {
            isBundleMatch = matchesLinkSaveKeyboardEvent(event, linkSaveBundleKeyboardKey, linkSaveMouseButton);
          }
        }

        let isDirectMatch = false;
        if (linkSaveDirectModifier) {
          if (linkSaveDirectModifierState) {
            isDirectMatch = matchesLinkSaveModifierEvent(event, linkSaveDirectModifierState, linkSaveMouseButton);
          } else {
            isDirectMatch = matchesLinkSaveKeyboardEvent(event, linkSaveDirectKeyboardKey, linkSaveMouseButton);
          }
        }

        let isActiveCategoryMatch = false;
        if (linkSaveActiveCategoryModifier) {
          if (linkSaveActiveCategoryModifierState) {
            isActiveCategoryMatch = matchesLinkSaveModifierEvent(event, linkSaveActiveCategoryModifierState, linkSaveMouseButton);
          } else {
            isActiveCategoryMatch = matchesLinkSaveKeyboardEvent(event, linkSaveActiveCategoryKeyboardKey, linkSaveMouseButton);
          }
        }

        if (!isPrimaryMatch && !isBundleMatch && !isDirectMatch && !isActiveCategoryMatch) {
          return;
        }
        const singleAnchor =
          event.target && event.target.closest
            ? event.target.closest("a[href]")
            : null;

        if (!singleAnchor) return;
        const href = singleAnchor.getAttribute("href");
        if (!href || href.startsWith("javascript:")) return;
        let resolvedUrl = "";
        try {
          resolvedUrl = new URL(href, window.location.href).toString();
        } catch (err) {
          return;
        }
        if (!/^https?:/i.test(resolvedUrl)) return;
        event.preventDefault();
        event.stopPropagation();
        
        const payload = {
          url: resolvedUrl,
          title: extractLinkTitle(singleAnchor),
          thumbnailUrl: findThumbnailNearElement(singleAnchor),
          clientX: Number.isFinite(event.clientX) ? event.clientX : 0,
          clientY: Number.isFinite(event.clientY) ? event.clientY : 0,
        };

        if (isDirectMatch) {
          try {
            await saveShortcutLinkToCategory(payload);
          } catch (err) {
            showLinkToast("Failed to save link");
          }
          return;
        }

        if (isActiveCategoryMatch) {
          try {
            await saveShortcutLinkToCategory(payload, true);
          } catch (err) {
            showLinkToast("Failed to save link to active category");
          }
          return;
        }

        const existingIndex = linkSaveBundlePayloads.findIndex(p => p.url === payload.url);
        if (existingIndex < 0) {
          linkSaveBundlePayloads.push(payload);
        }

        updateBundleBadge();

        // isBundleMatch → save terus tanpa mini kategori (wasBundle=true)
        // isPrimaryMatch → mini kategori muncul kalau linkSavePromptCategoryEnabled (wasBundle=false)
        commitLinkSaveBundle(isBundleMatch === true);
      };

      document.addEventListener("mouseover", function(e) {
        if (!ctrlAltLinkSaveEnabled) return;
        var a = e.target.closest("a[href]");
        if (a && a.href) {
          _hoveredLinkUrl = a.href;
          _hoveredLinkTitle = extractLinkTitle(a);
          lastClientX = e.clientX;
          lastClientY = e.clientY;

          if (linkSaveMouseButton === "hover") {
            var isPrimaryModifierMatch = linkSaveModifierState && (linkSavePressedKeys.size === 0) && hoverModifierMatches(linkSaveModifierState, e);
            var isBundleModifierMatch = linkSaveBundleModifierState && (linkSavePressedKeys.size === 0) && hoverModifierMatches(linkSaveBundleModifierState, e);
            var isDirectModifierMatch = linkSaveDirectModifierState && (linkSavePressedKeys.size === 0) && hoverModifierMatches(linkSaveDirectModifierState, e);
            var isActiveCategoryModifierMatch = linkSaveActiveCategoryModifierState && (linkSavePressedKeys.size === 0) && hoverModifierMatches(linkSaveActiveCategoryModifierState, e);
            var isModifierMatch = isPrimaryModifierMatch || isBundleModifierMatch || isDirectModifierMatch || isActiveCategoryModifierMatch;
            var _noMod = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
            var keyHeldPrimary = _noMod && linkSaveKeyboardKey && linkSavePressedKeys.has(linkSaveKeyboardKey);
            var keyHeldBundle = _noMod && linkSaveBundleKeyboardKey && linkSavePressedKeys.has(linkSaveBundleKeyboardKey);
            var keyHeldDirect = _noMod && linkSaveDirectKeyboardKey && linkSavePressedKeys.has(linkSaveDirectKeyboardKey);
            var keyHeldActive = _noMod && linkSaveActiveCategoryKeyboardKey && linkSavePressedKeys.has(linkSaveActiveCategoryKeyboardKey);
            var anyKeyHeld = keyHeldPrimary || keyHeldBundle || keyHeldDirect || keyHeldActive;
            if (isModifierMatch || anyKeyHeld) {
              var matchType = "primary";
              if (isDirectModifierMatch) {
                matchType = "direct";
              } else if (isActiveCategoryModifierMatch) {
                matchType = "activeCategory";
              } else if (isBundleModifierMatch) {
                matchType = "bundle";
              } else {
                if (keyHeldDirect) matchType = "direct";
                else if (keyHeldActive) matchType = "activeCategory";
                else if (keyHeldBundle) matchType = "bundle";
              }
              handleHoverLinkSave(matchType, e.clientX, e.clientY);
            }
          }
        }
      }, true);
      document.addEventListener("mouseout", function(e) {
        if (!ctrlAltLinkSaveEnabled) return;
        if (!e.target.closest("a[href]")) {
          _hoveredLinkUrl = "";
          _hoveredLinkTitle = "";
          linkSaveHoverLastSavedUrl = "";
        }
      }, true);
      document.addEventListener("click", handleModifiedLinkSave, true);
      document.addEventListener("auxclick", handleModifiedLinkSave, true);
      document.addEventListener("contextmenu", handleModifiedLinkSave, true);
    }

    container.appendChild(btn);
    container.appendChild(nextUpTextEl);
    container.appendChild(autoNextBtn);
    container.appendChild(favoriteSaveBtn);
    container.appendChild(deleteBtn);
    container.appendChild(dismissBtn);
    container.appendChild(bgTabBtn);
    container.appendChild(gestureBtn);
    container.appendChild(eyeBtn);
    container.appendChild(notesBtn);
    container.appendChild(rediscoverBtn);
    container.appendChild(settingsBtn);
    if (saveToggleBtn) container.appendChild(saveToggleBtn);

    // Bundle badge
    linkSaveBundleBadge = document.createElement("div");
    linkSaveBundleBadge.id = "__pocket_bundle_badge";
    linkSaveBundleBadge.style.cssText = `
      position: absolute;
      top: -6px;
      right: -6px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #f59e0b;
      color: #000;
      font-size: 11px;
      font-weight: 800;
      font-family: 'Orbitron', 'Rajdhani', sans-serif;
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 20;
      box-shadow: 0 0 8px rgba(245, 158, 11, 0.8);
      pointer-events: none;
    `;
    linkSaveBundleBadge.textContent = "0";
    container.appendChild(linkSaveBundleBadge);

    (document.fullscreenElement || document.webkitFullscreenElement || document.body).appendChild(container);
    // Reposition floating button when fullscreen state changes
    document.addEventListener("fullscreenchange", function () {
      var c = document.getElementById(CONTAINER_ID);
      if (!c) return;
      var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (fsEl && c.parentNode !== fsEl) {
        fsEl.appendChild(c);
      } else if (!fsEl && c.parentNode !== document.body) {
        document.body.appendChild(c);
      }
    });

    // ── Mouse gesture detection for category picker ──
    
    // Show function with animation
    window.showPocket = function () {
      if (isFloatingRuntimePaused()) return;
      const c = document.getElementById(CONTAINER_ID);
      if (c) {
        // cancel pending hide after anim
        if (hideAfterAnimTimeout) {
          clearTimeout(hideAfterAnimTimeout);
          hideAfterAnimTimeout = null;
        }
        clearTimeout(hideTimer);
        c.style.animation = "none";
        c.style.visibility = "visible";
        c.style.opacity = "1";
        c.style.pointerEvents = "auto";

        // Reflow to restart animation
        void c.offsetWidth;

        // Apply animation based on type and duration
        c.className = "";
        c.classList.add(SHOW_ANIM_CLASS);
        if (animationType && animationType !== "fade") {
          c.classList.add(animationType);
        }
        c.style.animationDuration = showAnimMs + "ms";

        isVisible = true;
        if (floatingNextUpLabel) {
          refreshNextUpLabel();
        } else if (nextUpTextEl) {
          nextUpTextEl.style.opacity = "0";
          nextUpTextEl.style.pointerEvents = "none";
        }
      }
    };

    // Hide function - animate opacity then hide
    window.hidePocket = function (force = false) {
      if ((miniCategoryVisible || miniCategoryPending) && !force) return; // Don't hide if mini category is being used or pending unless forced
      const c = document.getElementById(CONTAINER_ID);
      if (c) {
        if (force) hideMiniCategories();
        // clear any previous hide-after-animation timer
        if (hideAfterAnimTimeout) clearTimeout(hideAfterAnimTimeout);

        // Use CSS transition to fade out quickly
        c.style.animation = "none";
        c.style.animationDuration = "0ms";
        c.style.transition = `opacity ${hideAnimMs}ms ease`;
        c.style.opacity = "0";
        if (nextUpTextEl) {
          nextUpTextEl.style.opacity = "0";
          nextUpTextEl.style.pointerEvents = "none";
        }

        // After transition end, hide and reset
        hideAfterAnimTimeout = setTimeout(() => {
          c.style.visibility = "hidden";
          c.style.pointerEvents = "none";
          c.className = "";
          clearTemporaryButtonPosition();
          hideAfterAnimTimeout = null;
        }, hideAnimMs + 10);

        isVisible = false;
      }
    };

    function hideIfOutsideZone(clientX, clientY) {
      if (!isVisible) return;
      if (floatingButtonVisibilityMode === "always" || floatingButtonVisibilityMode === "click") return;
      if (miniCategoryVisible || miniCategoryPending) return;
      
      const dist = distanceToButton(clientX, clientY);
      if (dist >= showDistance) {
        window.hidePocket();
      }
    }

    function handleMove(e) {
      if (!floatingButtonEnabled) return;
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      if (longPressTracking) {
        const dx = e.clientX - longPressStartX;
        const dy = e.clientY - longPressStartY;
        if (Math.hypot(dx, dy) > getLongPressMoveTolerance()) {
          cancelLongPressTracking(false);
        }
      }
      if (isFloatingRuntimePaused()) return;
      if (moveRaf) return;
      moveRaf = window.requestAnimationFrame(() => {
        moveRaf = 0;
        
        if (floatingButtonVisibilityMode === "always") {
          if (!isVisible) window.showPocket();
          // Still allow mini categories in always mode
          const btnRect = btn.getBoundingClientRect();
          const triggerDist = 300;
          let shouldShowMiniAlways = false;
          if (miniCategoryTriggerDirection === "right") {
            shouldShowMiniAlways = lastClientX > btnRect.right + 2 && lastClientX < btnRect.right + triggerDist &&
              lastClientY > btnRect.top - 40 && lastClientY < btnRect.bottom + 40;
          } else if (miniCategoryTriggerDirection === "left") {
            shouldShowMiniAlways = lastClientX < btnRect.left - 2 && lastClientX > btnRect.left - triggerDist &&
              lastClientY > btnRect.top - 40 && lastClientY < btnRect.bottom + 40;
          } else if (miniCategoryTriggerDirection === "up") {
            shouldShowMiniAlways = lastClientY < btnRect.top - 2 && lastClientY > btnRect.top - triggerDist &&
              lastClientX > btnRect.left - 40 && lastClientX < btnRect.right + 40;
          } else if (miniCategoryTriggerDirection === "down") {
            shouldShowMiniAlways = lastClientY > btnRect.bottom + 2 && lastClientY < btnRect.bottom + triggerDist &&
              lastClientX > btnRect.left - 40 && lastClientX < btnRect.right + 40;
          }
          if (shouldShowMiniAlways) {
            showMiniCategories();
          } else if (miniCategoryVisible || miniCategoryPending) {
            const panelRect = miniCategoryPanel.getBoundingClientRect();
            const isOverPanel = lastClientX >= panelRect.left - 20 && lastClientX <= panelRect.right + 20 &&
                               lastClientY >= panelRect.top - 20 && lastClientY <= panelRect.bottom + 20;
            if (!isOverPanel) {
              hideMiniCategories();
            }
          }
          return;
        } else if (floatingButtonVisibilityMode === "scroll" || floatingButtonVisibilityMode === "click") {
          // Hover logic is disabled in scroll and click modes
          return;
        } else if (floatingButtonVisibilityMode === "longpress") {
          if (!isVisible) return;
          const distToBtn = distanceToButton(lastClientX, lastClientY);

          // Mini category logic for longpress mode
          const btnRect = btn.getBoundingClientRect();
          const margin = 10;
          const isOverBtn = lastClientX >= btnRect.left - margin && lastClientX <= btnRect.right + margin &&
                            lastClientY >= btnRect.top - margin && lastClientY <= btnRect.bottom + margin;
          
          if (!isOverBtn) {
            const triggerDistance = 350;
            let shouldShowMini = false;
            if (miniCategoryTriggerDirection === "right") {
              shouldShowMini = lastClientX > btnRect.right + 2 && lastClientX < btnRect.right + triggerDistance &&
                lastClientY > btnRect.top - 60 && lastClientY < btnRect.bottom + 60;
            } else if (miniCategoryTriggerDirection === "left") {
              shouldShowMini = lastClientX < btnRect.left - 2 && lastClientX > btnRect.left - triggerDistance &&
                lastClientY > btnRect.top - 60 && lastClientY < btnRect.bottom + 60;
            } else if (miniCategoryTriggerDirection === "up") {
              shouldShowMini = lastClientY < btnRect.top - 2 && lastClientY > btnRect.top - triggerDistance &&
                lastClientX > btnRect.left - 60 && lastClientX < btnRect.right + 60;
            } else if (miniCategoryTriggerDirection === "down") {
              shouldShowMini = lastClientY > btnRect.bottom + 2 && lastClientY < btnRect.bottom + triggerDistance &&
                lastClientX > btnRect.left - 60 && lastClientX < btnRect.right + 60;
            }
            if (shouldShowMini) {
              if (!miniCategoryVisible && !miniCategoryPending) showMiniCategories();
            } else if (miniCategoryVisible || miniCategoryPending) {
              const panelRect = miniCategoryPanel.getBoundingClientRect();
              const isOverPanel = lastClientX >= panelRect.left - 40 && lastClientX <= panelRect.right + 20 &&
                                 lastClientY >= panelRect.top - 40 && lastClientY <= panelRect.bottom + 40;
              if (!isOverPanel && distToBtn > showDistance + 100) {
                hideMiniCategories();
              }
            }
          }

          if (distToBtn >= showDistance && !miniCategoryVisible && !miniCategoryPending) {
            window.hidePocket();
          } else {
            clearTimeout(hideTimer);
            if (floatingNextUpLabel && !nextUpPending) {
              if (nextUpTimer) clearTimeout(nextUpTimer);
              nextUpTimer = setTimeout(() => {
                refreshNextUpLabel();
                nextUpTimer = null;
              }, 120);
            }
          }
          return;
        }

        const distToBtn = distanceToButton(lastClientX, lastClientY);

        // Mini category trigger logic: show if mouse moves to the right of the button
        if (isVisible) {
          const btnRect = btn.getBoundingClientRect();
          const margin = 10;
          const isOverBtn = lastClientX >= btnRect.left - margin && lastClientX <= btnRect.right + margin &&
                            lastClientY >= btnRect.top - margin && lastClientY <= btnRect.bottom + margin;
          
          const triggerDistance = 350;
          let shouldShowMini = false;

          if (miniCategoryTriggerDirection === "right") {
            shouldShowMini = lastClientX > btnRect.right + 2 && lastClientX < btnRect.right + triggerDistance &&
              lastClientY > btnRect.top - 60 && lastClientY < btnRect.bottom + 60;
          } else if (miniCategoryTriggerDirection === "left") {
            shouldShowMini = lastClientX < btnRect.left - 2 && lastClientX > btnRect.left - triggerDistance &&
              lastClientY > btnRect.top - 60 && lastClientY < btnRect.bottom + 60;
          } else if (miniCategoryTriggerDirection === "up") {
            shouldShowMini = lastClientY < btnRect.top - 2 && lastClientY > btnRect.top - triggerDistance &&
              lastClientX > btnRect.left - 60 && lastClientX < btnRect.right + 60;
          } else if (miniCategoryTriggerDirection === "down") {
            shouldShowMini = lastClientY > btnRect.bottom + 2 && lastClientY < btnRect.bottom + triggerDistance &&
              lastClientX > btnRect.left - 60 && lastClientX < btnRect.right + 60;
          }

          if (shouldShowMini || isOverBtn) {
            if (!miniCategoryVisible && !miniCategoryPending) showMiniCategories();
          }
          // Left side (asal) — open notes overlay jika direction bukan kiri
          else if (miniCategoryTriggerDirection !== "left" &&
              lastClientX < btnRect.left - 2 && lastClientX > btnRect.left - triggerDistance &&
              lastClientY > btnRect.top - 60 && lastClientY < btnRect.bottom + 60) {
            try {
              lpApi.runtime.sendMessage({ type: "toggle-notes-overlay", open: true });
            } catch (err) {}
          } else if (miniCategoryVisible || miniCategoryPending) {
            // Keep visible if mouse is over the mini panel area or in the gap
            const panelRect = miniCategoryPanel.getBoundingClientRect();
            const isOverPanel = lastClientX >= panelRect.left - 40 && lastClientX <= panelRect.right + 20 &&
                                lastClientY >= panelRect.top - 40 && lastClientY <= panelRect.bottom + 40;
            if (!isOverPanel && distToBtn > showDistance + 100) {
              hideMiniCategories();
            }
          }
        }

        if (!isVisible) {
          // Show when cursor is close to the button's anchor side
          if (distToBtn < showDistance) {
            window.showPocket();
          }
        } else {
          // When visible, hide if cursor moves away from the button
          if (distToBtn >= showDistance && !miniCategoryVisible && !miniCategoryPending) {
            // Cursor moved outside zone, hide immediately
            window.hidePocket();
          } else {
            // Cursor still in zone, keep visible
            clearTimeout(hideTimer);
            if (floatingNextUpLabel && !nextUpPending) {
              if (nextUpTimer) clearTimeout(nextUpTimer);
              nextUpTimer = setTimeout(() => {
                refreshNextUpLabel();
                nextUpTimer = null;
              }, 120);
            }
          }
        }
      });
    }

    // Event listeners
    document.addEventListener(
      "keydown",
      (event) => {
        if (!miniCategoryVisible) return;
        // Letter-key type-ahead handled by _kbHandleKey inside renderMiniCategoryItems
        if (event.key.length === 1 && /[a-zA-Z0-9]/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
          // Let _kbHandleKey handle it — just prevent page shortcuts
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true
    );

    document.addEventListener("mousemove", handleMove, { passive: true });

    // Separate capture-phase mousemove to cancel long press tracking
    // even when a page element captures the pointer (e.g. video scrub, drag operations).
    // Uses dynamic movement tolerance — shorter trigger durations need more stillness.
    document.addEventListener("mousemove", (e) => {
      if (!longPressTracking) return;
      const dx = e.clientX - longPressStartX;
      const dy = e.clientY - longPressStartY;
      if (Math.hypot(dx, dy) > getLongPressMoveTolerance()) {
        cancelLongPressTracking(false);
      }
    }, { capture: true, passive: true });

    document.addEventListener(
      "mousedown",
      (e) => {
        const isRightButton = e.button === 2;
        if (!isRightButton && e.button !== 0) return;
        // Skip if click is on the native scrollbar (outside the document's client area)
        if (
          e.clientX > document.documentElement.clientWidth ||
          e.clientY > document.documentElement.clientHeight
        ) {
          cancelLongPressTracking(false);
          return;
        }
        // Skip if click is on a native scrollbar (inside viewport, e.g. overflow:scroll)
        if (isClickOnScrollbar(e)) {
          cancelLongPressTracking(false);
          return;
        }
        // Always cancel if conditions not met — do NOT preventDefault so page events work
        var inFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (
          (!inFullscreen && floatingButtonVisibilityMode !== "longpress") ||
          isFloatingRuntimePaused() ||
          (getActionForButton(isRightButton) === "floating-button" && isVisible) ||
          e.defaultPrevented ||
          e.ctrlKey ||
          e.altKey ||
          e.shiftKey ||
          e.metaKey ||
          shouldIgnoreLongPressTarget(e.target) ||
          hasTextSelection()
        ) {
          cancelLongPressTracking(false);
          return;
        }
        // Begin tracking but do NOT call preventDefault/stopPropagation
        // so the page's own mousedown handlers (menus, drag, selection, etc.) still work.
        beginLongPressTracking(e, isRightButton);
      },
      { passive: true, capture: true },
    );

    // Simultaneous left+right click gesture toggle is disabled when using 'both' mode for gestureMouseButton

    // Right+Left simultaneous click toggles the "G" gesture button
    // Skip this if gestureMouseButton is 'both' to avoid conflict
    document.addEventListener("mousedown", (e) => {
      // Skip if gesture is configured to use both buttons simultaneously
      // cfg is defined in _runGestureSystem (outside this IIFE) — read via exposed property
      if (typeof _runGestureSystem === "function" && _runGestureSystem._mouseButtons === 3) return;
      
      const _now = Date.now();
      if (e.button === 0) {
        if (_lastRightClickTime > 0 && _now - _lastRightClickTime <= SIMULTANEOUS_CLICK_WINDOW_MS) {
          _lastLeftClickTime = 0;
          _lastRightClickTime = 0;
          _pendingToggleSignal = true;
          _triggerGestureButtonToggle();
          setTimeout(() => { _pendingToggleSignal = false; }, 200);
          return;
        }
        _lastLeftClickTime = _now;
      } else if (e.button === 2) {
        if (_lastLeftClickTime > 0 && _now - _lastLeftClickTime <= SIMULTANEOUS_CLICK_WINDOW_MS) {
          _lastLeftClickTime = 0;
          _lastRightClickTime = 0;
          _pendingToggleSignal = true;
          _triggerGestureButtonToggle();
          setTimeout(() => { _pendingToggleSignal = false; }, 200);
          return;
        }
        _lastRightClickTime = _now;
      }
    }, { capture: true, passive: true });

    document.addEventListener(
      "mouseup",
      () => {
        if (longPressPendingReleaseClick) {
          longPressSuppressClickUntil =
            Date.now() + LONG_PRESS_CLICK_SUPPRESS_MS;
          longPressPendingReleaseClick = false;
        }
        cancelLongPressTracking(false);
      },
      { capture: true, passive: true },
    );

    document.addEventListener(
      "contextmenu",
      (e) => {
        if (_pendingToggleSignal) {
          _pendingToggleSignal = false;
          e.preventDefault();
          return false;
        }
        if (longPressTracking && longPressIsRightButton) {
          e.preventDefault();
          return false;
        }
        if (longPressRightActionAt && Date.now() - longPressRightActionAt < 300) {
          longPressRightActionAt = 0;
          e.preventDefault();
          return false;
        }
        const pickerVisible = document.getElementById("__local_pocket_category_picker");
        if (pickerVisible) {
          e.preventDefault();
          return false;
        }
      },
      { passive: false, capture: true },
    );

    // ── Button 5 (forward) category scroller ──────────────────────
    // Opened via gesture action "show-category-scroller" or BrowserForward key

    // Suppress popstate while scroller is active (some browsers fire this for forward button)
    window.addEventListener("popstate", (e) => {
      if (button5ScrollerActive) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    }, { capture: true });

    // Keyboard: BrowserForward key opens/closes scroller
    function triggerButton5Keyboard() {
      if (isFloatingRuntimePaused()) return;
      if (button5ScrollerActive) {
        hideButton5CategoryScroller(false);
        return;
      }
      showButton5CategoryScroller();
    }

    document.addEventListener("mousemove", (e) => {
      if (!button5ScrollerActive || !button5ScrollerDom) return;

      // Update hover highlight on scroller items
      const items = button5ScrollerDom.scrollArea.children;
      for (let i = 0; i < items.length; i++) {
        const rect = items[i].getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
          if (i !== button5ScrollerCurrentIndex) {
            updateButton5ScrollerHighlight(i);
          }
          break;
        }
      }
    }, { capture: true, passive: true });

    // Escape key closes button 5 scroller + type-ahead letter search
    let button5TypeAheadBuffer = "";
    let button5TypeAheadTimer = null;

    function handleButton5Key(e) {
      // ── Open scroller via BrowserForward key ──
      if (!button5ScrollerActive) {
        if (e.key === "BrowserForward") {
          e.preventDefault();
          e.stopPropagation();
          triggerButton5Keyboard();
          return;
        }
        return;
      }

      // ── Scroller is active — handle navigation ──
      const totalItems = button5ScrollerCategories.length;

      // Escape = close
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        hideButton5CategoryScroller(false);
        return;
      }

      // Block browser navigation keys while scroller active
      if (e.key === "BrowserForward" || e.key === "BrowserBack" ||
          (e.key === "Backspace" && !e.target.closest("input, textarea, [contenteditable]"))) {
        e.preventDefault();
        e.stopPropagation();
      }

      // Arrow Left/Right = change category
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        if (totalItems === 0) return;
        const dir = e.key === "ArrowRight" ? 1 : -1;
        let newIndex = button5ScrollerCurrentIndex + dir;
        newIndex = Math.max(0, Math.min(totalItems - 1, newIndex));
        updateButton5ScrollerHighlight(newIndex);
        return;
      }

      // Enter = confirm selection
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        hideButton5CategoryScroller(true);
        return;
      }

      // ── Type-ahead letter search ──
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        const ch = e.key.toLowerCase();
        button5TypeAheadBuffer += ch;
        if (button5TypeAheadTimer) clearTimeout(button5TypeAheadTimer);
        button5TypeAheadTimer = setTimeout(() => { button5TypeAheadBuffer = ""; }, 800);

        // Find first category whose label starts with the typed buffer
        const matchIdx = button5ScrollerCategories.findIndex(entry => {
          const lbl = (entry.label || entry.id || "").toLowerCase();
          return lbl.startsWith(button5TypeAheadBuffer);
        });
        if (matchIdx >= 0) {
          updateButton5ScrollerHighlight(matchIdx);
        } else {
          // Try single-char match if buffer yields nothing
          const singleIdx = button5ScrollerCategories.findIndex(entry => {
            const lbl = (entry.label || entry.id || "").toLowerCase();
            return lbl.startsWith(ch);
          });
          if (singleIdx >= 0) {
            button5TypeAheadBuffer = ch;
            updateButton5ScrollerHighlight(singleIdx);
          }
        }
        return;
      }
    }

    document.addEventListener("keydown", handleButton5Key, { capture: true });

    document.addEventListener("click", (e) => {
      if (floatingButtonVisibilityMode !== "click" || isFloatingRuntimePaused()) return;
      // For click mode, show/hide if clicked in the right edge area
      if (e.clientX > window.innerWidth - 200) { // 200px from right edge
        if (isVisible) {
          window.hidePocket();
        } else {
          window.showPocket();
        }
      }
    }, { passive: true });
    
    document.addEventListener("scroll", () => {
      log("[Scroll Event] Fired, mode:", floatingButtonVisibilityMode);
      if (floatingButtonVisibilityMode === "scroll") {
        handleScrollVisibility();
      } else {
        lastScrollY = window.scrollY || 0; // maintain sync just in case mode switches
      }
    }, { passive: true });

    document.addEventListener(
      "mouseleave",
      () => {
        cancelLongPressTracking(false);
        if (floatingButtonVisibilityMode !== "always" && floatingButtonVisibilityMode !== "scroll" && floatingButtonVisibilityMode !== "click") {
          window.hidePocket(true);
        }
      },
      { passive: true },
    );
    document.addEventListener(
      "visibilitychange",
      () => {
        closeLinkSaveCategoryChooser();
        cancelLongPressTracking(true);
        if (document.hidden) {
          window.hidePocket(true);
        }
      },
      { passive: true },
    );

    if (lpApi.storage && lpApi.storage.onChanged) {
      // Track bilangan items terakhir untuk detect perubahan sebenar (tambah/buang)
      // vs perubahan data sahaja (thumbnail, title) — elak baca 1500 items pada setiap save
      let lastKnownItemCount = -1;
      let checkSavedDebounceTimer = null;

      lpApi.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (changes.items) {
          const newValue = changes.items.newValue;
          const newCount = Array.isArray(newValue) ? newValue.length : -1;
          const countChanged = lastKnownItemCount < 0 || newCount !== lastKnownItemCount;
          lastKnownItemCount = newCount >= 0 ? newCount : lastKnownItemCount;

          // Hanya update checkCurrentPageSaved apabila bilangan item berubah
          // (tambah/buang item). Skip apabila hanya data berubah (thumbnail, title, progress)
          // untuk elak lag dengan 1500+ items.
          if (countChanged) {
            if (checkSavedDebounceTimer) clearTimeout(checkSavedDebounceTimer);
            checkSavedDebounceTimer = setTimeout(() => {
              checkSavedDebounceTimer = null;
              checkCurrentPageSaved();
            }, 200);
          }

          // Invalidate Next Up cache apabila bilangan item berubah sahaja
          if (countChanged) {
            nextUpCache = null;
            nextUpLastFetchedAt = 0;
            if (floatingNextUpLabel && nextUpTextEl && isVisible) {
              refreshNextUpLabel();
            }
          }
        }
        if (changes.selectedCategory) {
          // Invalidate Next Up cache when selected category changes
          nextUpCache = null;
          nextUpLastFetchedAt = 0;
          if (floatingNextUpLabel && nextUpTextEl && isVisible) {
            refreshNextUpLabel();
          }
        }
      });
    }

    checkCurrentPageSaved();

    log(
      "[Floating] Button initialized - hideTimeout:",
      hideTimeout,
      "ms, animation:",
      animationType,
    );
  }

  function scheduleInit() {
    if (initScheduled) return;
    initScheduled = true;
    const run = async () => {
      initScheduled = false;
      await loadSettings();
      if (domainExcludedForCurrentHost) {
        log("[Floating] Floating button hidden on this domain (exception list).");
        return;
      }
      if (!floatingButtonEnabled) {
        log("[Floating] Floating button is disabled");
        return;
      }
      initYouTubeWatcher();
      injectAnimationStyles();
      if (document.body) {
        init();
        return;
      }
      document.addEventListener("DOMContentLoaded", init, { once: true });
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT });
    } else {
      setTimeout(run, 400);
    }
  }

  const protocol =
    window.location && window.location.protocol ? window.location.protocol : "";
  if (protocol === "http:" || protocol === "https:") {
    scheduleInit();
  }


// ============================================================
// Mouse Gesture System — ikut Gesturefy (Robbendebiene)
// Mouse Gesture (Gesturefy-style)
// ============================================================

// Detect sama ada kita dalam embedded frame (iframe)
const _IS_EMBEDDED_FRAME = (function() {
  try { return window.self !== window.top; } catch (_) { return true; }
})();

let _gestureDetectionStarted = false;

function _startGestureDetectionIfNeeded(settings) {
  if (_gestureDetectionStarted) return;
  const enabled = settings.gestureEnabled === true || settings.gestureEnabled === "true"
    || settings.categoryPickerMouseGesture === true;
  if (!enabled) return;
  _gestureDetectionStarted = true;
  _runGestureSystem(settings);
}

// Reload settings bila berubah — aktif tanpa reload tab
if (lpApi.storage && lpApi.storage.onChanged) {
  lpApi.storage.onChanged.addListener((changes) => {
    if (!changes.settings) return;
    const s = changes.settings.newValue;
    if (!s) return;
    // Update runtime flag segera
    _gestureRuntimeEnabled = s.gestureEnabled === true || s.categoryPickerMouseGesture === true;
    // Refresh config dalam engine jika sudah berjalan
    if (typeof _runGestureSystem._refreshCfg === "function") {
      _runGestureSystem._refreshCfg(s);
    }
    _startGestureDetectionIfNeeded(s);
  });
}

(async function initGesture() {
  try {
    const data = await _getSharedSettings();
    const s = data && data.settings ? data.settings : {};
    _startGestureDetectionIfNeeded(s);
  } catch (_) {}
})();

// ──────────────────────────────────────────────────────────────────
function _runGestureSystem(initialSettings) {
  try {
    // ── Config — dibina semula setiap kali settings berubah ──────
    let cfg = buildCfg(initialSettings);
    _runGestureSystem._mouseButtons = cfg.mouseButtons;

    // Gunakan listener yang sama dari luar (onChanged sudah subscribe di atas)
    // Expose fungsi refresh config supaya listener luar boleh update
    _runGestureSystem._refreshCfg = function(s) {
      cfg = buildCfg(s);
      _runGestureSystem._mouseButtons = cfg.mouseButtons;
    };

    function buildCfg(s) {
      const btn = s.gestureMouseButton || "right";
      const supKey = s.gestureSuppressionKey || "";
      let allMappings = Array.isArray(s.gestureActionMappings) ? s.gestureActionMappings : [];
      
      // Migration: Add AI Sidebar gesture if missing and AI Overlay uses old pattern
      const hasAiSidebar = allMappings.some(m => m.action === "open-ai-sidebar");
      const aiOverlay = allMappings.find(m => m.action === "toggle-ai-overlay");
      if (!hasAiSidebar && aiOverlay) {
        const overlayPatternStr = JSON.stringify(aiOverlay.pattern);
        // Check if AI Overlay still uses old pattern [[0, -200], [0, 200], [0, 200]] (up-down)
        if (overlayPatternStr === JSON.stringify([[0, -200], [0, 200], [0, 200]])) {
          // Update AI Overlay to up-right and add AI Sidebar as up-left
          aiOverlay.pattern = [[0, -200], [200, 0], [200, 0]];
          allMappings.push({
            id: "g_default_up_lt",
            name: "AI Sidebar",
            pattern: [[0, -200], [-200, 0], [-200, 0]],
            action: "open-ai-sidebar",
            gestureType: "dir"
          });
          // Save updated mappings to storage
          try {
            lpApi.storage.local.get("settings").then(data => {
              const settings = data && data.settings ? data.settings : {};
              settings.gestureActionMappings = allMappings;
              lpApi.storage.local.set({ settings }).catch(() => {});
            }).catch(() => {});
          } catch (_) {}
        }
      }
      
      // Per-site exclusions — URL pattern list (Gesturefy-style)
      const exclusions = Array.isArray(s.gestureExclusions) ? s.gestureExclusions : [];
      // Fix 3: Pre-compile exclusion RegExp semasa buildCfg, bukan pada setiap pointerdown
      const exclusionRegexps = exclusions.map(pattern => {
        try {
          const escaped = pattern.replace(/[-[\]{}()+?.,\\^$|#\s]/g, m => m === '*' ? '.*' : '\\' + m);
          return new RegExp('^' + escaped + '$');
        } catch (_) { return null; }
      }).filter(Boolean);
      return {
        // Gesturefy bitmask: left=1, right=2, middle=4, both (left+right)=3
        mouseButtons: btn === "left" ? 1 : btn === "middle" ? 4 : btn === "both" ? 3 : 2,
        singleBtn:    btn === "left" ? 0 : btn === "middle" ? 1 : btn === "both" ? 3 : 2,
        suppressionKey: supKey,
        distThreshold: typeof s.gestureDistanceThreshold === "number" ? s.gestureDistanceThreshold : 10,
        traceColor:   s.gestureTraceColor  || "#e94560",
        traceWidth:   typeof s.gestureTraceWidth === "number" ? s.gestureTraceWidth : 3,
        traceLineGrowth: s.gestureTraceLineGrowth !== false,
        timeoutActive: s.gestureTimeoutActive === true,
        timeoutMs:    (typeof s.gestureTimeoutDuration === "number" ? s.gestureTimeoutDuration : 2) * 1000,
        // Gesturefy-compatible matching
        matchingAlgorithm: s.gestureMatchingAlgorithm || "combined",
        deviationTolerance: typeof s.gestureDeviationTolerance === "number" ? s.gestureDeviationTolerance : 0.15,
        differenceThreshold: typeof s.gestureDifferenceThreshold === "number" ? s.gestureDifferenceThreshold : 0.12,
        // Command label style
        cmdFontSize:  s.gestureCommandFontSize  || "2.5vh",
        cmdFontColor: s.gestureCommandFontColor || "#ffffff",
        // Bina bg color dengan opacity dari slider: hex6 + opacity byte
        cmdBgColor: (() => {
          const base = (s.gestureCommandBgColor || "#000000b8").slice(0, 7);
          const opacity = typeof s.gestureCommandBgOpacity === "number" ? s.gestureCommandBgOpacity : 72;
          const alphaByte = Math.round(opacity / 100 * 255).toString(16).padStart(2, "0");
          return base + alphaByte;
        })(),
        cmdPosX:      typeof s.gestureCommandPositionX === "number" ? s.gestureCommandPositionX : 50,
        cmdPosY:      typeof s.gestureCommandPositionY === "number" ? s.gestureCommandPositionY : 92,
        // Smart suppression — disable gesture bila detect pemilihan teks
        gestureSmartSuppression: s.gestureSmartSuppression !== false,
        // Per-site exclusions
        exclusions,
        exclusionRegexps,
        // Gesture arah — pattern array tidak kosong, bukan "shape"
        gestureMappings: allMappings.filter(m =>
          m && m.action && m.gestureType !== "shape" && Array.isArray(m.pattern) && m.pattern.length >= 1
        ),
        // Gesture bentuk bebas — ada shapeData.points
        shapeMappings: allMappings.filter(m =>
          m && m.action && m.gestureType === "shape" && m.shapeData && Array.isArray(m.shapeData.points)
        ),
      };
    }

    // Semak sama ada URL semasa dalam senarai exclusion
    // Fix 3: Guna pre-compiled RegExp dari cfg — tiada new RegExp() pada setiap pointerdown
    function isCurrentUrlExcluded(cfg) {
      if (!cfg.exclusionRegexps || !cfg.exclusionRegexps.length) return false;
      const href = window.location.href;
      for (const re of cfg.exclusionRegexps) {
        if (re.test(href)) return true;
      }
      return false;
    }

    // ── GestureMatcher module ────────────────────────────────────
    const GM = (typeof window !== "undefined" && window.GestureMatcher) || null;

    // Action labels untuk command overlay
    const ACTION_LABELS = {
      "open-category-picker":           "Buka Category Picker",
      "open-first-item":                "Buka Item Pertama",
      "open-random-item":               "Buka Item Rawak",
      "cycle-category":                 "Kategori Seterusnya",
      "cycle-category-prev":            "Kategori Sebelumnya",
      "save-to-local-pocket":           "Simpan Halaman",
      "save-current-tab-favorite":      "Simpan ke Favourite",
      "picker-next-item":               "Link Seterusnya",
      "picker-random-item":             "Link Rawak",
      "picker-save-all-tabs":           "Simpan Semua Tab",
      "picker-open-settings":           "Buka Tetapan",
      "picker-youtube-summary":         "Summary AI",
      "open-ai-sidebar":                "Buka AI Sidebar",
      "toggle-ai-overlay":              "AI Overlay",
      "toggle-notes-overlay":           "Togol Nota",
      "toggle-pomodoro-overlay":        "Pomodoro Timer 🍅",
      "open-summary-history-page":      "Sejarah Ringkasan",
      "open-firefox-native-ai-sidebar": "Firefox AI Sidebar",
      "picker-new-category":            "Kategori Baru",
      "picker-delete-category":         "Padam Kategori",
      "picker-toggle-favorites":        "Togol Favourites",
      // New actions
      "toggle-delete-after-open":       "Togol Delete-After-Open ♻️",
      "toggle-auto-next":               "Togol Auto-Next YouTube ⏭️",
      "toggle-auto-random":             "Togol Auto-Random YouTube 🔀",
      "open-trash":                     "Buka Tong Sampah 🗑️",
      "toggle-nav-favorites-only":      "Navigasi Favourite Sahaja ⭐",
      "scan-duplicates":                "Imbas Link Pendua 👯",
      "export-backup":                  "Eksport Backup ⬆️",
      "toggle-show-hidden-categories":  "Togol Kategori Tersembunyi 👁️",
      "toggle-pin-picker":              "Pin / Nyahpin Picker 📌",
      "toggle-auto-page-turn":          "Togol Auto Page-Turn ⇅",
      "cycle-ai-provider":              "Tukar Provider AI 🤖",
      "toggle-rediscover":              "Togol Rediscover 🔁",
      "toggle-floating-button":         "Togol Butang Terapung 🔘",
      "toggle-ai-selection":            "Togol AI Selection Button ✨",
      "toggle-global-background-tab":   "Togol Tab Latar 📑",
      "open-gesture-settings":          "Buka Tetapan Gesture 🖱️",
      "show-mini-categories":            "Togol Senarai Kategori Mini 📂",
      "open-category-fullscreen":        "Pilih Kategori (Overlay Penuh) 🗂️",
      "show-category-scroller":          "Togol Kategori Scroller ↔️",
      "quick-capture-link":             "Simpan Link/Thumbnail disasarkan (Quick Capture) 📌",
      "set-thumbnail-from-image":       "Tukar Thumbnail dari Gambar 🖼️",
      "open-link-save-category-chooser": "Buka Pemilih Kategori (Simpan Link) 📂",
    };

    function dispatchAction(action, data) {
      if (!action) return;
      lpApi.runtime.sendMessage({ type: "gesture-action", action, data }).catch(() => {});
    }

    // Kemas kini statistik gesture (useCount + lastUsedAt) bila gesture berjaya dijalankan
    function trackGestureUsage(matchedMapping) {
      if (!matchedMapping || !matchedMapping.id) return;
      try {
        lpApi.storage.local.get("settings").then((data) => {
          const s = data && data.settings ? data.settings : {};
          const maps = Array.isArray(s.gestureActionMappings) ? s.gestureActionMappings : [];
          let changed = false;
          const next = maps.map((m) => {
            if (!m || m.id !== matchedMapping.id) return m;
            changed = true;
            return { ...m, useCount: ((m.useCount || 0) + 1), lastUsedAt: Date.now() };
          });
          if (changed) {
            s.gestureActionMappings = next;
            lpApi.storage.local.set({ settings: s }).catch(() => {});
          }
        }).catch(() => {});
      } catch (_) {}
    }

    // Simpan titik raw semasa untuk shape matching
    let _rawPoints = [];

    function findMatch(drawn) {
      if (!drawn || !drawn.length) return null;

      // 1. Cuba gesture bentuk bebas dulu jika ada shape mappings
      if (cfg.shapeMappings && cfg.shapeMappings.length && GM && GM.matchShapeGesture && _rawPoints.length >= 10) {
        for (const m of cfg.shapeMappings) {
          const thresh = typeof m.shapeThreshold === "number" ? m.shapeThreshold : 0.80;
          if (GM.matchShapeGesture(_rawPoints, m.shapeData, thresh)) return m;
        }
      }

      // 2. Gesture arah — guna algoritma Gesturefy (DTW + Proportion combined)
      if (!cfg.gestureMappings.length) return null;
      if (GM && GM.getClosestGestureByPattern) {
        return GM.getClosestGestureByPattern(
          drawn,
          cfg.gestureMappings,
          cfg.deviationTolerance,
          cfg.matchingAlgorithm
        );
      }
      // Fallback jika GM tidak tersedia
      return fallbackMatch(drawn) ? cfg.gestureMappings.find(m => fallbackMatchPair(drawn, m.pattern)) || null : null;
    }

    // Fallback matching tanpa GM module
    function fallbackMatchPair(a, b) {
      if (!a || !b || !a.length || !b.length) return false;
      function v2d(vx, vy) {
        let deg = Math.atan2(vy, vx) * 180 / Math.PI;
        if (deg < 0) deg += 360;
        return ["→","↘","↓","↙","←","↖","↑","↗"][Math.round(deg / 45) % 8];
      }
      const dedup = arr => arr.map(v => v2d(v[0], v[1])).filter((d, i, ar) => i === 0 || d !== ar[i-1]).join("");
      return dedup(a) === dedup(b);
    }

    function fallbackMatch(drawn) {
      return drawn && drawn.length >= 1;
    }

    // PatternConstructor — guna GM atau fallback inline
    // Nota: differenceThreshold diambil dari cfg supaya boleh dikemas kini bila settings berubah
    const PCtor = GM ? GM.PatternConstructor : (function() {
      function vdd(v1x, v1y, v2x, v2y) {
        const a = Math.atan2(v2y, v2x) - Math.atan2(v1y, v1x);
        if (a >  Math.PI) return a - 2 * Math.PI;
        if (a <= -Math.PI) return a + 2 * Math.PI;
        return a;
      }
      function Ctor(df, dt) {
        this.differenceThreshold = df; this.distanceThreshold = dt;
        this.clear();
      }
      Ctor.prototype.clear = function() {
        this._lEx=this._lEy=this._px=this._py=this._lx=this._ly=this._pvx=this._pvy=null;
        this._vecs=[];
      };
      Ctor.prototype.addPoint = function(x, y) {
        if (this._px===null) { this._lEx=x; this._lEy=y; this._px=x; this._py=y; }
        else {
          const nvx=x-this._px, nvy=y-this._py, d=Math.hypot(nvx,nvy);
          if (d > this.distanceThreshold) {
            if (this._pvx===null) { this._pvx=nvx; this._pvy=nvy; }
            else if (Math.abs(vdd(this._pvx,this._pvy,nvx,nvy)) > this.differenceThreshold) {
              this._vecs.push([this._px-this._lEx, this._py-this._lEy]);
              this._pvx=nvx; this._pvy=nvy; this._lEx=this._px; this._lEy=this._py;
            }
            this._px=x; this._py=y;
          }
        }
        this._lx=x; this._ly=y;
      };
      Ctor.prototype.getPattern = function() {
        if (this._lx===null||this._lEx===null) return [];
        return [...this._vecs, [this._lx-this._lEx, this._ly-this._lEy]];
      };
      return Ctor;
    }());

    // ── MouseGestureView — ikut Gesturefy tepat ─────────────────
    // Overlay popover + canvas (growing-line trace) + command label
    const Overlay = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    try { Overlay.popover = "manual"; } catch (_) {}
    Overlay.style.cssText = "all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important;";

    const Canvas = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
    Canvas.style.cssText = "all:initial!important;pointer-events:none!important;";
    const Ctx = Canvas.getContext("2d");

    // Command label — posisi, saiz, warna semua boleh dikonfigur (seperti Gesturefy)
    const Command = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    Command.style.cssText = [
      "all:initial!important",
      "position:fixed!important",
      "--cmdX:50",
      "--cmdY:92",
      `left:calc(var(--cmdX) * 1%)!important`,
      `top:calc(var(--cmdY) * 1%)!important`,
      `transform:translate(calc(var(--cmdX) * -1%), calc(var(--cmdY) * -1%))!important`,
      "font-family:system-ui,Arial,sans-serif!important",
      "font-size:2.5vh!important",
      "font-weight:700!important",
      "color:#fff!important",
      "background:#000000b8!important",
      "border-radius:20px!important",
      "padding:0.4em 0.8em 0.35em!important",
      "pointer-events:none!important",
      "white-space:nowrap!important",
      "text-align:center!important",
      "text-shadow:0.01em 0.01em 0.01em rgba(0,0,0,0.5)!important",
      "border:1px solid rgba(255,255,255,0.12)!important",
      "backdrop-filter:blur(6px)!important",
      "max-width:50vw!important",
    ].join(";");

    // Kemas kini style command label dari cfg
    function applyCommandStyle() {
      Command.style.setProperty("font-size", cfg.cmdFontSize, "important");
      Command.style.setProperty("color", cfg.cmdFontColor, "important");
      Command.style.setProperty("background", cfg.cmdBgColor, "important");
      Command.style.setProperty("--cmdX", String(cfg.cmdPosX));
      Command.style.setProperty("--cmdY", String(cfg.cmdPosY));
      Command.style.setProperty("left", `calc(${cfg.cmdPosX} * 1%)`, "important");
      Command.style.setProperty("top", `calc(${cfg.cmdPosY} * 1%)`, "important");
      Command.style.setProperty("transform", `translate(calc(${cfg.cmdPosX} * -1%), calc(${cfg.cmdPosY} * -1%))`, "important");
    }

    function maximizeCanvas() {
      const tmp = { fillStyle: Ctx.fillStyle, strokeStyle: Ctx.strokeStyle,
                    lineCap: Ctx.lineCap,     lineJoin: Ctx.lineJoin,
                    lineWidth: Ctx.lineWidth };
      Canvas.width  = window.innerWidth;
      Canvas.height = window.innerHeight;
      Object.assign(Ctx, tmp);
    }

    // Gesturefy createGrowingLine — Path2D dengan arc di kedua hujung
    function createGrowingLine(x1, y1, x2, y2, sw, ew) {
      const angle = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
      const path  = new Path2D();
      path.arc(x1, y1, Math.max(sw, 0.1) / 2, angle, angle + Math.PI);
      path.arc(x2, y2, Math.max(ew, 0.1) / 2, angle + Math.PI, angle);
      path.closePath();
      return path;
    }

    let _traceTW = 0, _traceX = 0, _traceY = 0;

    const View = {
      initialize(x, y) {
        const host = document.fullscreenElement || document.webkitFullscreenElement
          || document.body || document.documentElement;
        if (!host) return;
        Overlay.appendChild(Canvas);
        host.appendChild(Overlay);
        try { Overlay.showPopover(); } catch (_) {}
        maximizeCanvas();
        applyCommandStyle();
        Ctx.fillStyle = cfg.traceColor;
        _traceTW = 0; _traceX = x; _traceY = y;
        window.addEventListener("resize", maximizeCanvas, true);
      },

      updateTrace(points) {
        if (!Overlay.isConnected) return;
        const path = new Path2D();
        const tw = cfg.traceWidth;
        const growthDist = tw * 50;
        for (const pt of points) {
          const dist = Math.hypot(pt.x - _traceX, pt.y - _traceY);
          if (cfg.traceLineGrowth) {
            const newW = Math.min(_traceTW + dist / growthDist * tw, tw);
            path.addPath(createGrowingLine(_traceX, _traceY, pt.x, pt.y, _traceTW, newW));
            _traceTW = newW;
          } else {
            path.addPath(createGrowingLine(_traceX, _traceY, pt.x, pt.y, tw, tw));
          }
          _traceX = pt.x; _traceY = pt.y;
        }
        Ctx.fillStyle = cfg.traceColor;
        Ctx.fill(path);
      },

      // Update command label: tunjuk arah + nama tindakan (atau arah sahaja kalau belum match)
      // Warna bertukar hijau bila ada padanan
      updateCommand(dirStr, actionLabel) {
        if (!Overlay.isConnected) return;
        let text = "";
        if (dirStr && actionLabel) {
          text = dirStr + "  ·  " + actionLabel;
        } else if (dirStr) {
          text = dirStr;
        } else if (actionLabel) {
          text = actionLabel;
        }
        if (text) {
          Command.textContent = text;
          // Hijau bila ada padanan, gunakan warna konfigurasi kalau belum
          const hasMatch = !!(dirStr && actionLabel);
          Command.style.setProperty("color",
            hasMatch ? "#4ade80" : cfg.cmdFontColor, "important");
          Command.style.setProperty("border-color",
            hasMatch ? "rgba(74,222,128,0.4)" : "rgba(255,255,255,0.12)", "important");
          if (!Overlay.contains(Command)) Overlay.appendChild(Command);
        } else {
          Command.remove();
        }
      },

      terminate() {
        window.removeEventListener("resize", maximizeCanvas, true);
        try { Overlay.hidePopover(); } catch (_) {}
        Overlay.remove(); Canvas.remove(); Command.remove();
        // Clear canvas content
        try { Ctx.clearRect(0, 0, Canvas.width, Canvas.height); } catch (_) {}
        _traceTW = 0;
        Command.textContent = "";
        // Reset command style untuk use seterusnya
        Command.style.setProperty("color", cfg.cmdFontColor || "#fff", "important");
        Command.style.setProperty("border-color", "rgba(255,255,255,0.12)", "important");
      },

      // Flash merah sekilas bila tiada padanan — feedback visual tanpa perlu overlay kekal
      flashNoMatch() {
        const flash = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
        flash.style.cssText = [
          "all:initial!important",
          "position:fixed!important",
          "inset:0!important",
          "background:rgba(239,68,68,0.18)!important",
          "pointer-events:none!important",
          "z-index:2147483646!important",
          "transition:opacity 0.35s ease-out!important",
          "opacity:1!important",
        ].join(";");
        const host = document.fullscreenElement || document.webkitFullscreenElement || document.body || document.documentElement;
        if (!host) return;
        host.appendChild(flash);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            flash.style.setProperty("opacity", "0", "important");
            setTimeout(() => { try { flash.remove(); } catch (_) {} }, 380);
          });
        });
      },
    };

    // ── MouseGestureController ───────────────────────────────────
    // States: PASSIVE → PENDING → ACTIVE (port dari Gesturefy)
    // ABORTED tidak guna state berasingan — terus reset
    const PASSIVE = 0, PENDING = 1, ACTIVE = 2;
    let mgState   = PASSIVE;
    let mgBuffer  = [];
    let mgTimerId = null;
    let _lastHoveredLinkUrl = null;
    let _lastHoveredLinkText = null;
    let _lastPointerDownAt = 0;
    let _selWatchHandler = null; // selectionchange watchdog
    function findTargetLinkUrl(el) {
      if (!el) return null;
      let current = el;
      while (current && current !== document.body && current !== document.documentElement) {
        if (current.tagName === "A" && current.getAttribute("href")) {
          try {
            return new URL(current.getAttribute("href"), document.baseURI).toString();
          } catch (_) {
            return current.getAttribute("href");
          }
        }
        current = current.parentElement;
      }
      return null;
    }
    function extractLinkText(el) {
      if (!el) return "";
      var foundA = null;
      var current = el;
      while (current && current !== document.body && current !== document.documentElement) {
        if (current.tagName === "A") {
          foundA = current;
          var yt = current.querySelector("#video-title, yt-formatted-string#video-title, span#video-title");
          if (yt) { var ytTxt = (yt.textContent || "").trim(); if (ytTxt) return ytTxt.slice(0, 300); }
          var ariaLabel = (current.getAttribute("aria-label") || "").trim();
          if (ariaLabel && ariaLabel !== "true" && ariaLabel !== "false") {
            var ytMatch = ariaLabel.match(/^(.+?)\s+by\s+.+/);
            if (ytMatch) return ytMatch[1].trim().slice(0, 300);
            return ariaLabel.slice(0, 300);
          }
          var titleAttr = current.getAttribute("title");
          if (titleAttr && titleAttr.trim()) return titleAttr.trim();
          var img = current.querySelector("img");
          if (img) {
            var alt = img.getAttribute("alt");
            if (alt && alt.trim()) return alt.trim();
          }
          var txt = (current.textContent || "").trim();
          if (txt && !/^\d+:\d{2}(?::\d{2})?$/.test(txt.replace(/^▶\s*/, ""))) return txt.slice(0, 300);
          break;
        }
        current = current.parentElement;
      }
      if (foundA) {
        var look = foundA.parentElement;
        for (var i = 0; look && i < 3 && look !== document.body; i++) {
          var yt2 = look.querySelector("#video-title, yt-formatted-string#video-title, span#video-title");
          if (yt2) { var ytTxt2 = (yt2.textContent || "").trim(); if (ytTxt2) return ytTxt2.slice(0, 300); }
          look = look.parentElement;
        }
      }
      return "";
    }
    // differenceThreshold dari cfg (Gesturefy default: 0.12 rad ~7°, lebih sensitif dari lama 0.5)
    const pc = new PCtor(cfg.differenceThreshold, 10);

    // Abort: buang overlay, buang suppress, reset — tanpa dispatch action
    function mgAbort() {
      _stopSelectionWatch();
      const wasActive = mgState === ACTIVE;
      if (wasActive) {
        View.terminate();
        neglectPreventDefault();
      } else {
        _removePreventListeners();
      }
      _mgCleanupListeners();
      // Release pointer capture
      const first = mgBuffer[0];
      if (first) {
        try { first.target && first.target.releasePointerCapture(first.pointerId); } catch (_) {}
        try { document.documentElement.releasePointerCapture(first.pointerId); } catch (_) {}
      }
      mgBuffer = [];
      _rawPoints = [];
      pc.clear();
      mgState = PASSIVE;
      if (mgTimerId !== null) { clearTimeout(mgTimerId); mgTimerId = null; }
      // Reset preview state
      _lastPatternLength = 0;
      _lastMatchedAction = null;
      if (_cmdUpdateRaf) { cancelAnimationFrame(_cmdUpdateRaf); _cmdUpdateRaf = 0; }
    }

    // Reset selepas gesture selesai (terminate) — sama tapi boleh dispatch action
    function mgReset() {
      _stopSelectionWatch();
      _mgCleanupListeners();
      if (mgState === ACTIVE) {
        neglectPreventDefault();
      } else {
        _removePreventListeners();
      }
      const first = mgBuffer[0];
      if (first) {
        try { first.target && first.target.releasePointerCapture(first.pointerId); } catch (_) {}
        try { document.documentElement.releasePointerCapture(first.pointerId); } catch (_) {}
      }
      mgBuffer = [];
      _rawPoints = [];
      pc.clear();
      mgState = PASSIVE;
      if (mgTimerId !== null) { clearTimeout(mgTimerId); mgTimerId = null; }
      // Reset preview state
      _lastPatternLength = 0;
      _lastMatchedAction = null;
      if (_cmdUpdateRaf) { cancelAnimationFrame(_cmdUpdateRaf); _cmdUpdateRaf = 0; }
    }

    function _mgCleanupListeners() {
      document.removeEventListener("pointermove",     onPointermove, true);
      document.removeEventListener("pointerup",       onPointerup,   true);
      document.removeEventListener("dragstart",       onDragstart,   true);
      document.removeEventListener("visibilitychange",onVisibility,  true);
    }

    function mgInitialize(event) {
      mgBuffer.push(event);
      mgState = PENDING;
      document.addEventListener("pointermove",     onPointermove, true);
      document.addEventListener("pointerup",       onPointerup,   true);
      document.addEventListener("dragstart",       onDragstart,   true);
      document.addEventListener("visibilitychange",onVisibility,  true);
      if (mgTimerId) clearTimeout(mgTimerId);
      mgTimerId = setTimeout(mgAbort, cfg.timeoutActive ? cfg.timeoutMs : 5000);
      // Start selectionchange watchdog — if browser detects text selection, abort
      _startSelectionWatch();
      // Jangan setPointerCapture untuk left button atau both (left+right) — ia block native selection
      if (cfg.mouseButtons !== 1 && cfg.mouseButtons !== 3) {
        try {
          const tgt = (event.composedPath && event.composedPath()[0]) || event.target;
          tgt.setPointerCapture(event.pointerId);
        } catch (_) {}
      }
    }

    function mgUpdate(event) {
      mgBuffer.push(event);
      // getCoalescedEvents() mesti dipanggil segera untuk prevent clearing (Firefox bug)
      const coal = (typeof event.getCoalescedEvents === "function")
        ? (event.getCoalescedEvents() || [])
        : [];

      if (mgState === PENDING) {
        const init = mgBuffer[0];
        const dist = Math.hypot(event.clientX - init.clientX, event.clientY - init.clientY);
        if (dist > cfg.distThreshold) {
          // Gesture disahkan — ACTIVE
          mgState = ACTIVE;
          preparePreventDefault();
          try { document.documentElement.setPointerCapture(event.pointerId); } catch (_) {}

          // Replay semua buffered events ke PatternConstructor dan _rawPoints
          const allEvts = mgBuffer.flatMap(ev => {
            const c = (typeof ev.getCoalescedEvents === "function") ? (ev.getCoalescedEvents() || []) : [];
            return c.length ? c : [ev];
          });

          View.initialize(init.clientX, init.clientY);
          _rawPoints = [];
          for (const ev of allEvts) {
            pc.addPoint(ev.clientX, ev.clientY);
            _rawPoints.push({ x: ev.clientX, y: ev.clientY });
          }
          View.updateTrace(allEvts.map(ev => ({ x: ev.clientX, y: ev.clientY })));
          _updateViewCommand();
        }
      } else if (mgState === ACTIVE) {
        const evts = coal.length ? coal : [event];
        for (const ev of evts) {
          pc.addPoint(ev.clientX, ev.clientY);
          _rawPoints.push({ x: ev.clientX, y: ev.clientY });
        }
        View.updateTrace(evts.map(ev => ({ x: ev.clientX, y: ev.clientY })));
        _updateViewCommand();

        // Timeout: reset timer setiap kali ada movement (ikut Gesturefy)
        if (cfg.timeoutActive) {
          if (mgTimerId) clearTimeout(mgTimerId);
          mgTimerId = setTimeout(mgAbort, cfg.timeoutMs);
        }
      }
    }

    // Update command label: tunjuk arah + nama tindakan
    // Fix 1: Guna threshold lebih longgar semasa preview (2× deviationTolerance)
    //        supaya label muncul lebih awal semasa gesture belum lengkap
    // Fix 2: Debounce — skip kalau pattern tidak berubah sejak update terakhir
    let _lastPatternLength = 0;
    let _lastMatchedAction = null;
    let _cmdUpdateRaf = 0;

    function _updateViewCommand() {
      // Debounce via rAF — hanya satu update per frame
      if (_cmdUpdateRaf) return;
      _cmdUpdateRaf = requestAnimationFrame(() => {
        _cmdUpdateRaf = 0;
        _doUpdateViewCommand();
      });
    }

    function _doUpdateViewCommand() {
      const cur = pc.getPattern();
      // Skip kalau tiada data bermakna
      if (!cur.length && _rawPoints.length < 10) return;

      // Skip kalau pattern tidak berubah sejak update terakhir (tiada segmen baru)
      // pc.getPattern() mengembalikan array baru setiap kali, tapi kita boleh check
      // panjang pattern sebagai proksi untuk "pattern berubah"
      const curLen = cur.length;
      const rawLen = _rawPoints.length;

      let dirStr = "";
      let label = null;

      // Cuba cari padanan dengan threshold preview (2× lebih longgar)
      // Ini membolehkan label muncul lebih awal semasa lukisan
      let matched = null;
      if (cur.length >= 1) {
        // Shape gesture — semak raw points
        if (cfg.shapeMappings && cfg.shapeMappings.length && GM && GM.matchShapeGesture && rawLen >= 10) {
          for (const m of cfg.shapeMappings) {
            const thresh = typeof m.shapeThreshold === "number" ? Math.max(0.5, m.shapeThreshold - 0.2) : 0.60;
            if (GM.matchShapeGesture(_rawPoints, m.shapeData, thresh)) { matched = m; break; }
          }
        }
        // Gesture arah — guna threshold preview yang lebih longgar
        if (!matched && cfg.gestureMappings.length && GM && GM.getClosestGestureByPattern) {
          const previewTolerance = Math.min(cfg.deviationTolerance * 2.5, 1.2);
          matched = GM.getClosestGestureByPattern(cur, cfg.gestureMappings, previewTolerance, cfg.matchingAlgorithm);
        }
      }

      if (matched && matched.gestureType === "shape") {
        dirStr = "✦";
      } else if (GM && cur.length) {
        dirStr = GM.patternToDirectionString(cur, false);
      }

      label = matched ? (matched.customLabel || matched.name || ACTION_LABELS[matched.action] || matched.action) : null;

      // Elak update DOM yang tidak perlu — skip kalau output sama
      const newAction = matched ? matched.action : null;
      if (newAction === _lastMatchedAction && curLen === _lastPatternLength) return;
      _lastPatternLength = curLen;
      _lastMatchedAction = newAction;

      View.updateCommand(dirStr, label);
    }

    function mgTerminate(event) {
      mgBuffer.push(event);
      if (mgState === ACTIVE) {
        const drawn = pc.getPattern();
        View.terminate();
        if (drawn.length >= 1) {
          const matched = findMatch(drawn);
          if (matched) {
            const data = {};
            if (matched.action === "quick-capture-link" || matched.action === "open-link-save-category-chooser") {
              data.linkUrl = _lastHoveredLinkUrl;
              if (_lastHoveredLinkText) {
                data.linkText = _lastHoveredLinkText;
              }
            }
            // Block category picker gesture if cursor is over text-editable area
            if (matched.action === "open-category-picker" && blockPickerOnTextCursor) {
              const lastEvent = mgBuffer[mgBuffer.length - 1];
              if (lastEvent && isCursorTextCursor(lastEvent.clientX, lastEvent.clientY)) {
                log("[Floating] Gesture ignored: cursor is over text-editable area");
                View.flashNoMatch();
              } else {
                dispatchAction(matched.action, data);
                trackGestureUsage(matched);
              }
            } else {
              dispatchAction(matched.action, data);
              trackGestureUsage(matched);
            }
          } else {
            // Visual feedback — tiada padanan: flash merah sekilas
            View.flashNoMatch();
          }
        }
      }
      mgReset();
    }

    // ── Smart text selection detection ───────────────────────────
    // Approach:
    //   1. Cursor CSS check — if browser shows text cursor (I-beam),
    //      it's a text selection area. No guesswork needed.
    //   2. cursor:auto fallback — use caretRangeFromPoint.
    //   3. Double-click/tap watchdog.
    //   4. Selectionchange watchdog during PENDING state.

    function _getCaretRangeFromPoint(x, y) {
      try {
        if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
        if (document.caretPositionFromPoint) {
          var cp = document.caretPositionFromPoint(x, y);
          if (cp && cp.offsetNode) {
            var r = document.createRange();
            r.setStart(cp.offsetNode, cp.offset);
            r.collapse(true);
            return r;
          }
        }
      } catch (_) {}
      return null;
    }

    // Dapatkan cursor CSS efektif (naik parent kalau inherit)
    function _getEffectiveCursor(el) {
      while (el && el.nodeType === 1) {
        try {
          var c = window.getComputedStyle(el).cursor;
          if (c && c !== "inherit" && c !== "") return c;
        } catch (_) {}
        el = el.parentElement;
      }
      return "auto";
    }

    function _isElementSelectable(el) {
      if (!el) return true;
      try {
        var cs = window.getComputedStyle(el);
        var us = cs.getPropertyValue("user-select") || cs.getPropertyValue("-webkit-user-select");
        if (us === "none") return false;
      } catch (_) {}
      return true;
    }

    function isTextSelectionIntent(event) {
      // Already selected text — user is extending it
      try {
        var sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return true;
      } catch (_) {}
      // Double-click/double-tap dalam 300ms — confirm text selection
      if (_lastPointerDownAt && (Date.now() - _lastPointerDownAt < 300)) return true;
      var tgt = event.target;
      if (!tgt || tgt.nodeType !== 1) return false;
      // Cursor CSS check — browser sendiri tahu tempat text selection
      var cursor = _getEffectiveCursor(tgt);
      // cursor:text → confirm area teks. cursor:auto → check caret.
      if (cursor === "text" || cursor === "vertical-text") return true;
      if (cursor === "auto") {
        var range = _getCaretRangeFromPoint(event.clientX, event.clientY);
        if (range && range.startContainer && range.startContainer.nodeType === 3) {
          var text = range.startContainer.textContent || "";
          var offset = range.startOffset;
          if (offset < text.length && text.trim().length > 0) {
            var el = range.startContainer.parentElement;
            if (el && _isElementSelectable(el)) return true;
          }
        }
      }
      // cursor:default, cursor:pointer, dll → gesture dibenarkan
      return false;
    }

    // ── Selection watchdog ────────────────────────────────────────
    // Monitor browser's selectionchange to detect text selection during
    // gesture PENDING state. This is the most reliable indicator.
    function _startSelectionWatch() {
      _stopSelectionWatch();
      _selWatchHandler = function() {
        try {
          var sel = window.getSelection();
          if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
            if (mgState === PENDING) {
              // Browser started text selection — abort gesture
              mgAbort();
            }
          }
        } catch (_) {}
      };
      document.addEventListener("selectionchange", _selWatchHandler, { passive: true });
    }

    function _stopSelectionWatch() {
      if (_selWatchHandler) {
        try { document.removeEventListener("selectionchange", _selWatchHandler); } catch (_) {}
        _selWatchHandler = null;
      }
    }

    // ── Pointer handlers ─────────────────────────────────────────
    function onPointerdown(event) {
      if (!event.isTrusted) return;
      if (!_gestureRuntimeEnabled) return;
      // For 'both' mode, initialize when either button is pressed
      // Gesture will only activate during move when both buttons are pressed
      if (cfg.mouseButtons === 3) {
        if (event.button !== 0 && event.button !== 2) return;
      } else {
        if (event.buttons !== cfg.mouseButtons) return;
      }
      // Suppression key — tahan kekunci ini untuk disable gesture (seperti Gesturefy)
      if (cfg.suppressionKey && event[cfg.suppressionKey]) return;
      // Smart suppression — disable gesture kalau nampak macam nak select teks
      if (isTextSelectionIntent(event)) {
        _lastPointerDownAt = Date.now();
        return;
      }
      // Per-site exclusion check (Gesturefy-style) — guna cached RegExp
      if (isCurrentUrlExcluded(cfg)) return;
      const tgt = event.target;
      if (tgt && (tgt.isContentEditable || tgt.tagName === "INPUT"
          || tgt.tagName === "TEXTAREA" || tgt.tagName === "SELECT")) return;
      if (document.getElementById("__local_pocket_category_picker")) return;
      // Skip gesture kalau click pada pomodoro overlay — biar drag berfungsi
      if (tgt && tgt.closest && tgt.closest("#pomodoro-overlay-root")) return;
      // Skip gesture kalau click pada floating button — biar drag berfungsi
      if (tgt && tgt.closest && tgt.closest("#" + CONTAINER_ID)) return;
      if (cfg.mouseButtons === 4) event.preventDefault();
      // Kemas kini differenceThreshold bila cfg berubah
      pc.differenceThreshold = cfg.differenceThreshold;
      _lastHoveredLinkUrl = findTargetLinkUrl(tgt);
      _lastHoveredLinkText = extractLinkText(tgt);
      _lastPointerDownAt = Date.now();
      mgInitialize(event);
    }

    function onPointermove(event) {
      if (!event.isTrusted) return;

      // For 'both' mode, only update gesture when both buttons are pressed (buttons === 3)
      if (cfg.mouseButtons === 3) {
        if (event.buttons === 3) {
          mgUpdate(event);
          if (mgState === ACTIVE) {
            try { window.getSelection().removeAllRanges(); } catch (_) {}
          }
        }
      } else if (event.buttons === cfg.mouseButtons) {
        mgUpdate(event);
        // Hanya clear selection gesture bila da ACTIVE (dah confirm gesture, bukan text selection)
        // Untuk left button (1) atau both (3) - clear selection bila gesture aktif
        if ((cfg.mouseButtons === 1 || cfg.mouseButtons === 3) && mgState === ACTIVE) {
          try { window.getSelection().removeAllRanges(); } catch (_) {}
        }
      } else if (event.button !== -1) {
        // button !== -1 bermaksud ada perubahan pada button state
        if (event.button === cfg.singleBtn) {
          // Butang gesture dilepas semasa butang lain masih ditekan
          mgTerminate(event);
        } else {
          // Butang lain ditekan/dilepas → batal gesture
          mgAbort();
        }
      } else if (event.buttons === 0) {
        // Semua butang dilepas (edge case — pointerup sepatutnya handle ini)
        mgTerminate(event);
      }
    }

    function onPointerup(event) {
      if (!event.isTrusted) return;
      // For 'both' mode, terminate gesture when either button is released
      if (cfg.mouseButtons === 3) {
        if (event.button === 0 || event.button === 2) {
          mgTerminate(event);
        }
      } else {
        if (event.button === cfg.singleBtn) mgTerminate(event);
      }
    }

    function onDragstart(event) {
      if (!event.isTrusted) return;
      // For 'both' mode, prevent drag when both buttons are pressed
      if (cfg.mouseButtons === 3) {
        if (event.buttons === 3) event.preventDefault();
      } else {
        if (event.buttons === cfg.mouseButtons) event.preventDefault();
      }
    }

    function onVisibility() {
      if (mgState !== PASSIVE) mgAbort();
    }

    document.addEventListener("pointerdown", onPointerdown, true);

    // ── Prevention — ikut Gesturefy tepat ───────────────────────
    // preparePreventDefault: tambah listeners (dipanggil bila gesture ACTIVE)
    // neglectPreventDefault: buang listeners selepas 200ms (dipanggil selepas gesture selesai)
    // _removePreventListeners: buang terus (untuk PENDING reset yang tak sempat aktif)
    const PREVENT_WAIT_MS = 200;
    let preventTimer = null;

    function onPreventEvent(event) {
      if (event.isTrusted) { event.preventDefault(); event.stopPropagation(); }
    }

    function _removePreventListeners() {
      if (preventTimer !== null) { clearTimeout(preventTimer); preventTimer = null; }
      document.removeEventListener("contextmenu", onPreventEvent, true);
      document.removeEventListener("click",       onPreventEvent, true);
      document.removeEventListener("auxclick",    onPreventEvent, true);
      document.removeEventListener("mouseup",     onPreventEvent, true);
      document.removeEventListener("mousedown",   onPreventEvent, true);
    }

    function preparePreventDefault() {
      // Bersihkan timeout lama kalau ada
      if (preventTimer !== null) { clearTimeout(preventTimer); preventTimer = null; }
      document.addEventListener("contextmenu", onPreventEvent, true);
      document.addEventListener("click",       onPreventEvent, true);
      document.addEventListener("auxclick",    onPreventEvent, true);
      document.addEventListener("mouseup",     onPreventEvent, true);
      document.addEventListener("mousedown",   onPreventEvent, true);
      // Cross-frame: relay ke main frame melalui background (Gesturefy-style)
      if (_IS_EMBEDDED_FRAME) {
        try {
          lpApi.runtime.sendMessage({
            type: "gesture-frame-relay",
            subject: "mouseGestureControllerPreparePreventDefault"
          }).catch(() => {});
        } catch (_) {}
      }
    }

    function neglectPreventDefault() {
      // Tangguhkan 200ms sebelum buang (beri masa prevent post-gesture clicks)
      preventTimer = setTimeout(_removePreventListeners, PREVENT_WAIT_MS);
      // Cross-frame: relay ke main frame melalui background
      if (_IS_EMBEDDED_FRAME) {
        try {
          lpApi.runtime.sendMessage({
            type: "gesture-frame-relay",
            subject: "mouseGestureControllerNeglectPreventDefault",
            data: { timestamp: Date.now() }
          }).catch(() => {});
        } catch (_) {}
      }
    }

    // ── Cross-frame broadcast receiver (main frame sahaja) ──────
    // Terima broadcast dari background yang dihantar oleh iframe
    if (!_IS_EMBEDDED_FRAME && lpApi && lpApi.runtime && lpApi.runtime.onMessage) {
      lpApi.runtime.onMessage.addListener(function gestureFrameBroadcastListener(msg) {
        if (!msg || msg.type !== "gesture-frame-broadcast") return;
        const subject = msg.subject;
        const data = msg.data || {};
        switch (subject) {
          case "mouseGestureControllerPreparePreventDefault":
            preparePreventDefault();
            break;
          case "mouseGestureControllerNeglectPreventDefault": {
            const elapsed = Date.now() - (data.timestamp || Date.now());
            const wait = Math.max(PREVENT_WAIT_MS - elapsed, 0);
            if (preventTimer !== null) { clearTimeout(preventTimer); preventTimer = null; }
            preventTimer = setTimeout(_removePreventListeners, wait);
            break;
          }
          case "mouseGestureViewInitialize":
            if (data.x != null && data.y != null) {
              const x = data.x - (window.mozInnerScreenX || 0);
              const y = data.y - (window.mozInnerScreenY || 0);
              View.initialize(x, y);
            }
            break;
          case "mouseGestureViewUpdateGestureTrace":
            if (Array.isArray(data.points)) {
              const pts = data.points.map(p => ({
                x: p.x - (window.mozInnerScreenX || 0),
                y: p.y - (window.mozInnerScreenY || 0)
              }));
              View.updateTrace(pts);
            }
            break;
          case "mouseGestureViewTerminate":
            View.terminate();
            break;
        }
      });
    }

    // ── Dalam iframe: relay View events ke main frame ──────────
    // Gesture mula dalam iframe — redirect initialize/updateTrace/terminate ke main frame
    if (_IS_EMBEDDED_FRAME) {
      // Override View untuk iframe: hantar ke main frame melalui background
      const _origViewInit = View.initialize.bind(View);
      View.initialize = function(x, y) {
        try {
          lpApi.runtime.sendMessage({
            type: "gesture-frame-relay",
            subject: "mouseGestureViewInitialize",
            data: {
              x: x + (window.mozInnerScreenX || 0),
              y: y + (window.mozInnerScreenY || 0)
            }
          }).catch(() => {});
        } catch (_) {}
        // Dalam iframe kita tidak perlu buat apa-apa selain relay
      };
      const _origViewUpdate = View.updateTrace.bind(View);
      View.updateTrace = function(points) {
        try {
          lpApi.runtime.sendMessage({
            type: "gesture-frame-relay",
            subject: "mouseGestureViewUpdateGestureTrace",
            data: {
              points: points.map(p => ({
                x: p.x + (window.mozInnerScreenX || 0),
                y: p.y + (window.mozInnerScreenY || 0)
              }))
            }
          }).catch(() => {});
        } catch (_) {}
      };
      View.terminate = function() {
        try {
          lpApi.runtime.sendMessage({
            type: "gesture-frame-relay",
            subject: "mouseGestureViewTerminate"
          }).catch(() => {});
        } catch (_) {}
      };
    }

    // ── Wheel + Rocker gesture controllers ──────────────────────
    // (dipotong — tidak diperlukan oleh user)

  } catch (_) {
    // Senyap — jangan ganggu halaman web
  }
}

})();

} // end: if (!window.__lpFullLoaded)
} // end: if (!window.__lpSkipFull)
