/**
 * floatingButton.js — SKELETON (ringan, ~150 baris)
 *
 * Dimuatkan ke SETIAP tab sebagai content script.
 * Tanggungjawabnya yang kecil:
 *  1. Setup listeners keyboard/thumbnail yang perlu aktif sejak awal
 *  2. Buat satu storage read dan cache hasilnya (window.__lpGetSharedSettings)
 *  3. Skip tab sidebar / panel sempit sebelum floatingButtonFull.js jalan
 *
 * floatingButtonFull.js ialah content script kedua yang melakukan semua
 * kerja berat — ia akan self-bailout (return awal) jika skeleton menandakan
 * tab ini tidak perlukan butang terapung (window.__lpSkipFull = true).
 *
 * Ini mengurangkan overhead: pada tab yang skip, floatingButtonFull.js
 * parse sekali (V8 cache) tetapi tidak menjalankan sebarang logic,
 * mengosongkan semua event listeners, DOM mutations dan storage reads.
 */

const lpApi = typeof browser !== "undefined" ? browser : (typeof chrome !== "undefined" ? chrome : null);
// B7 fix: if lpApi is null (sandboxed frame or non-extension context), bail out
// early before any code runs. Every lpApi.runtime.* and lpApi.storage.* call
// below would throw TypeError otherwise.
if (!lpApi) {
  // Nothing to set up — exit the content script silently.
  void 0; // placeholder so the IIFE below can still run safely
}
const SIDEBAR_WINDOW_NAME = "__LP_SIDEBAR__";

(function () {
  // B7 fix: if lpApi is null (sandboxed frame, non-extension context) abort
  // immediately — every lpApi.* call below would throw TypeError otherwise.
  if (!lpApi) return;

  // ── 1. Listeners ringan — aktif pada semua tab tanpa tunggu settings ──────

  function setupAltQuoteKeydown() {
    if (typeof window === "undefined") return;
    if (window.__lpAltQuoteFocusInstalled) return;
    window.__lpAltQuoteFocusInstalled = true;
    
    const handleKeydown = (event) => {
      if (!event) return;
      const isAltQuote =
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (event.code === "Quote" || event.key === "'");
      if (!isAltQuote) return;
      try {
        const maybe = lpApi.runtime.sendMessage({ type: "focus-sidebar-chat-input" });
        if (maybe && typeof maybe.then === "function") maybe.catch(err => console.error("[FloatingButton] Failed to focus sidebar chat:", err));
      } catch (err) {
        console.error("[FloatingButton] Alt+Quote handler error:", err);
      }
      event.preventDefault();
      event.stopPropagation();
    };
    
    window.addEventListener("keydown", handleKeydown, true);
    
    // Cleanup on page unload
    window.addEventListener("beforeunload", () => {
      window.removeEventListener("keydown", handleKeydown, true);
    });
  }

  function setupTKeyThumbnailShortcut() {
    if (typeof window === "undefined") return;
    if (window.__lpTKeyThumbnailInstalled) return;
    if (location.hostname.includes("youtube.com") || location.hostname === "youtu.be") return;
    window.__lpTKeyThumbnailInstalled = true;
    let tKeyDown = false;
    
    const handleKeydown = (e) => { if (e.key === "t" || e.key === "T") tKeyDown = true; };
    const handleKeyup = (e) => { if (e.key === "t" || e.key === "T") tKeyDown = false; };
    const handleClick = (event) => {
      if (!tKeyDown || event.button !== 0) return;
      tKeyDown = false;
      const img = event.target.closest ? event.target.closest("img") : null;
      if (!img && event.target.tagName !== "IMG") return;
      const imageUrl = (img || event.target).src || "";
      if (!imageUrl) return;
      event.preventDefault();
      event.stopPropagation();
      lpApi.runtime.sendMessage({ type: "set-thumbnail-from-shortcut", imageUrl, pageUrl: window.location.href }).catch(err => console.error("[FloatingButton] Failed to set thumbnail:", err));
    };
    const handleContextmenu = (event) => {
      if (!tKeyDown) return;
      tKeyDown = false;
      const img = event.target.closest ? event.target.closest("img") : null;
      if (!img && event.target.tagName !== "IMG") return;
      const imageUrl = (img || event.target).src || "";
      if (!imageUrl) return;
      event.preventDefault();
      event.stopPropagation();
      lpApi.runtime.sendMessage({ type: "set-thumbnail-from-shortcut", imageUrl, pageUrl: window.location.href, learn: true }).catch(err => console.error("[FloatingButton] Failed to set thumbnail (learn):", err));
    };
    
    window.addEventListener("keydown", handleKeydown, true);
    window.addEventListener("keyup", handleKeyup, true);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("contextmenu", handleContextmenu, true);
    
    // Cleanup on page unload
    window.addEventListener("beforeunload", () => {
      window.removeEventListener("keydown", handleKeydown, true);
      window.removeEventListener("keyup", handleKeyup, true);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("contextmenu", handleContextmenu, true);
    });
  }

  // ── 2. Satu storage read dikongsi — elak double read dengan floatingButtonFull.js ──
  //
  // floatingButtonFull.js akan panggil window.__lpGetSharedSettings() dan mendapat
  // Promise yang sama (atau data yang sudah resolved) — tiada storage.local.get kedua.

  let _sharedSettingsPromise = null;
  function _getSharedSettings() {
    if (!_sharedSettingsPromise) {
      _sharedSettingsPromise = lpApi.storage.local.get(["settings", "floatingSizeOverride"])
        .then(data => data || {})
        .catch(() => ({}));
    }
    return _sharedSettingsPromise;
  }
  window.__lpGetSharedSettings = _getSharedSettings; // dedah untuk floatingButtonFull.js

  // ── 3. Daftar listeners berdasarkan settings ──────────────────────────────
  (async function registerListenersBySettings() {
    if (typeof window === "undefined") return;
    try {
      const data = await _getSharedSettings();
      const s = data && data.settings ? data.settings : {};
      if (s.floatingButtonEnabled !== false) {
        setupAltQuoteKeydown();
      }
      // selectionchange listener diuruskan oleh floatingButtonFull.js kerana
      // ia memerlukan handleSelectionChange yang ada di sana.
      setupTKeyThumbnailShortcut();
    } catch (_) {
      setupAltQuoteKeydown();
      setupTKeyThumbnailShortcut();
    }
  })();

  // ── 4. Tanda tab yang tidak memerlukan butang terapung ────────────────────
  //
  // floatingButtonFull.js akan check window.__lpSkipFull pada permulaan
  // dan return awal jika true — mengelak semua overhead per-tab.

  // Tab sidebar tidak perlukan butang terapung
  if (typeof window !== "undefined" && window.name === SIDEBAR_WINDOW_NAME) {
    window.__lpSkipFull = true;
    return;
  }

  // Panel sempit (sidebar extension UI, popup) tidak perlukan butang terapung
  if (typeof window !== "undefined" && window.outerWidth && window.outerWidth <= 520) {
    window.__lpSkipFull = true;
    return;
  }

  // Protocol bukan web — extension pages, about:, dll.
  const _proto = window.location && window.location.protocol ? window.location.protocol : "";
  if (_proto !== "http:" && _proto !== "https:" && _proto !== "file:") {
    window.__lpSkipFull = true;
    return;
  }

  // ── 5. Tandakan skeleton sudah selesai — floatingButtonFull.js boleh proceed ──
  window.__lpSkeletonReady = true;

})();
