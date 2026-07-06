(function () {
  "use strict";
  const api = typeof browser !== "undefined" ? browser : chrome;
  const DEBUG = false;

  if (typeof window === "undefined") return;
  if (window.__lpShortcutsInterceptorInstalled) return;
  window.__lpShortcutsInterceptorInstalled = true;

  if (DEBUG) console.log("[LP ShortcutInterceptor] Script loaded on:", window.location.href);

  let lastProcessedAt = 0;
  const DEBOUNCE_MS = 300;
  let commandPaletteShortcut = "Ctrl+K";

  function parseShortcut(str, event) {
    if (!str || !event) return false;
    var parts = str.split("+").map(function(p) { return p.trim(); }).filter(Boolean);
    if (!parts.length) return false;
    var key = parts.pop().toLowerCase();
    var needCtrl = false, needAlt = false, needShift = false, needMeta = false;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].toLowerCase();
      if (p === "ctrl" || p === "control") needCtrl = true;
      else if (p === "alt") needAlt = true;
      else if (p === "shift") needShift = true;
      else if (p === "meta" || p === "cmd" || p === "command") needMeta = true;
    }
    var eventKey = (event.key || "").toLowerCase();
    return eventKey === key &&
      event.ctrlKey === needCtrl &&
      event.altKey === needAlt &&
      event.shiftKey === needShift &&
      event.metaKey === needMeta;
  }

  function storageGetLocal(key) {
    if (!api || !api.storage || !api.storage.local || !api.storage.local.get) {
      return Promise.resolve({});
    }
    return new Promise(function(resolve) {
      var done = false;
      var finish = function(value) {
        if (done) return;
        done = true;
        resolve(value && typeof value === "object" ? value : {});
      };
      try {
        var maybePromise = api.storage.local.get(key, function(value) {
          var runtimeErr = api.runtime && api.runtime.lastError;
          if (runtimeErr) {
            finish({});
            return;
          }
          finish(value);
        });
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then(finish).catch(function() { finish({}); });
        }
      } catch (err) {
        finish({});
      }
    });
  }

  function runtimeSendMessage(message) {
    if (!api || !api.runtime || !api.runtime.sendMessage) {
      return Promise.resolve(null);
    }
    return new Promise(function(resolve) {
      var done = false;
      var finish = function(value) {
        if (done) return;
        done = true;
        resolve(value == null ? null : value);
      };
      try {
        var maybePromise = api.runtime.sendMessage(message, function(response) {
          var runtimeErr = api.runtime && api.runtime.lastError;
          if (runtimeErr) {
            finish(null);
            return;
          }
          finish(response);
        });
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then(finish).catch(function() { finish(null); });
        }
      } catch (err) {
        finish(null);
      }
    });
  }

  storageGetLocal("settings").then(function(data) {
    var s = data && data.settings ? data.settings : {};
    if (s.commandPaletteShortcut) commandPaletteShortcut = s.commandPaletteShortcut;
  }).catch(function(){});

  api.storage.onChanged.addListener(function(changes, area) {
    if (area !== "local") return;
    if (changes.settings && changes.settings.newValue) {
      var v = changes.settings.newValue.commandPaletteShortcut;
      if (v) commandPaletteShortcut = v;
    }
  });

  function handleKeydown(event) {
    if (!event) return;

    // Debounce: skip if we just processed a shortcut (prevents double-fire
    // between window and document capture-phase listeners)
    const now = Date.now();
    if (now - lastProcessedAt < DEBOUNCE_MS) {
      if (DEBUG) console.log("[LP ShortcutInterceptor] DEBOUNCED");
      return;
    }

    const isEscape = event.key === "Escape" || event.key === "Esc";
    const isAltA =
      event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      (event.key || "").toLowerCase() === "a";
    const isAltShiftI =
      event.altKey &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      (event.key || "").toLowerCase() === "i";
    const isAltShiftA =
      event.altKey &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      (event.key || "").toLowerCase() === "a";
    const isAltShiftO =
      event.altKey &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      (event.key || "").toLowerCase() === "o";
    const isAltF =
      event.altKey &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      (event.key || "").toLowerCase() === "f";
    const isCmdPalette = parseShortcut(commandPaletteShortcut, event);

    // YouTube: jangan intercept Ctrl+K (YouTube guna untuk search)
    const isYouTube = location.hostname.includes("youtube.com") || location.hostname === "youtu.be";
    if (isYouTube && isCmdPalette) return;

    if (!isEscape && !isAltA && !isAltShiftI && !isAltShiftA && !isAltShiftO && !isAltF && !isCmdPalette) return;

    if (DEBUG) console.log("[LP ShortcutInterceptor] SHORTCUT MATCHED! isAltA:", isAltA, "isAltShiftI:", isAltShiftI, "isAltShiftA:", isAltShiftA, "isAltShiftO:", isAltShiftO, "isEscape:", isEscape);

    const picker = document.getElementById("__local_pocket_category_picker");
    const notes = document.getElementById("__lp_notes_overlay_root");
    const ai = document.getElementById("__lp_ai_overlay_root");
    const pomodoro = document.getElementById("pomodoro-overlay-root");

    // 1. Handle Escape key to close open overlays cleanly
    if (isEscape) {
      let intercepted = false;
      const cmdPalette = document.getElementById("__lp_cmd_palette");
      if (cmdPalette) {
        cmdPalette.remove();
        intercepted = true;
      }
      if (picker) {
        try {
          runtimeSendMessage({ type: "close-category-picker-direct" });
          picker.remove();
        } catch (err) {
          console.error("[LP ShortcutInterceptor] Error closing picker:", err);
        }
        intercepted = true;
      }
      if (notes && notes.shadowRoot) {
        const overlayEl = notes.shadowRoot.querySelector(".overlay");
        if (overlayEl && overlayEl.dataset.open === "true") {
          runtimeSendMessage({ type: "toggle-notes-overlay" });
          intercepted = true;
        }
      }
      if (ai) {
        try {
          const overlayEl = ai.shadowRoot && ai.shadowRoot.querySelector('[data-role="overlay"]');
          if (overlayEl && overlayEl.dataset.open === "true") {
            runtimeSendMessage({ type: "toggle-ai-overlay" });
            intercepted = true;
          }
        } catch (err) {
          console.error("[LP ShortcutInterceptor] Error closing AI overlay:", err);
        }
      }
      if (pomodoro && pomodoro.style.display !== "none") {
        try {
          runtimeSendMessage({ type: "toggle-pomodoro-overlay" });
          intercepted = true;
        } catch (err) {
          console.error("[LP ShortcutInterceptor] Error closing pomodoro overlay:", err);
        }
      }
      if (intercepted) {
        lastProcessedAt = now;
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
      }
      return;
    }

    // 2. Handle overlay shortcuts
    const tag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : "";
    const isTyping = tag === "input" || tag === "textarea" || tag === "select" || (event.target && event.target.isContentEditable);

    if (isAltA) {
      if (isTyping) {
        if (DEBUG) console.log("[LP ShortcutInterceptor] Alt+A ignored - user is typing");
        return;
      }
      lastProcessedAt = now;
      try {
        if (DEBUG) console.log("[LP ShortcutInterceptor] Sending open-category-picker message...");
        runtimeSendMessage({ type: "open-category-picker" }).then(function(response) {
          if (DEBUG) console.log("[LP ShortcutInterceptor] open-category-picker response:", response);
        }).catch(function(err) {
          console.error("[LP ShortcutInterceptor] open-category-picker error:", err);
        });
      } catch (err) {
        console.error("[LP ShortcutInterceptor] Error in Alt+A handler:", err);
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
    } else if (isAltShiftI) {
      lastProcessedAt = now;
      try {
        if (DEBUG) console.log("[LP ShortcutInterceptor] Sending open-ai-sidebar message...");
        runtimeSendMessage({ type: "open-ai-sidebar" }).then(function(response) {
          if (DEBUG) console.log("[LP ShortcutInterceptor] open-ai-sidebar response:", response);
        }).catch(function(err) {
          console.error("[LP ShortcutInterceptor] open-ai-sidebar error:", err);
        });
      } catch (err) {
        console.error("[LP ShortcutInterceptor] Error in Alt+Shift+I handler:", err);
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
    } else if (isAltShiftA) {
      lastProcessedAt = now;
      try {
        const selectedText = window.getSelection ? window.getSelection().toString() : "";
        if (DEBUG) console.log("[LP ShortcutInterceptor] Sending toggle-ai-overlay message...");
        runtimeSendMessage({
          type: "toggle-ai-overlay",
          selectedText: selectedText
        }).then(function(response) {
          if (DEBUG) console.log("[LP ShortcutInterceptor] toggle-ai-overlay response:", response);
        }).catch(function(err) {
          console.error("[LP ShortcutInterceptor] toggle-ai-overlay error:", err);
        });
      } catch (err) {
        console.error("[LP ShortcutInterceptor] Error in Alt+Shift+A handler:", err);
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
    } else if (isAltShiftO) {
      lastProcessedAt = now;
      try {
        if (DEBUG) console.log("[LP ShortcutInterceptor] Sending open-notes-sidebar message...");
        runtimeSendMessage({ type: "open-notes-sidebar" }).then(function(response) {
          if (DEBUG) console.log("[LP ShortcutInterceptor] open-notes-sidebar response:", response);
        }).catch(function(err) {
          console.error("[LP ShortcutInterceptor] open-notes-sidebar error:", err);
        });
      } catch (err) {
        console.error("[LP ShortcutInterceptor] Error in Alt+Shift+O handler:", err);
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
    } else if (isAltF) {
      const picker = document.getElementById("__local_pocket_category_picker");
      if (picker) {
        lastProcessedAt = now;
        try {
          if (DEBUG) console.log("[LP ShortcutInterceptor] Sending category-picker-command:toggle-favorites...");
          runtimeSendMessage({ type: "category-picker-command", command: "toggle-favorites" }).then(function(response) {
            if (DEBUG) console.log("[LP ShortcutInterceptor] toggle-favorites response:", response);
          }).catch(function(err) {
            console.error("[LP ShortcutInterceptor] toggle-favorites error:", err);
          });
        } catch (err) {
          console.error("[LP ShortcutInterceptor] Error in Alt+F handler:", err);
        }
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
      }
    } else if (isCmdPalette) {
      var existingPalette = document.getElementById("__lp_cmd_palette");
      if (existingPalette) {
        lastProcessedAt = now;
        existingPalette.remove();
        if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (isTyping) {
        if (DEBUG) console.log("[LP ShortcutInterceptor] Command palette shortcut ignored - user is typing");
        return;
      }
      lastProcessedAt = now;
      try {
        if (DEBUG) console.log("[LP ShortcutInterceptor] Sending open-command-palette...");
        runtimeSendMessage({ type: "open-command-palette" }).then(function(response) {
          if (DEBUG) console.log("[LP ShortcutInterceptor] open-command-palette response:", response);
        }).catch(function(err) {
          console.error("[LP ShortcutInterceptor] open-command-palette error:", err);
        });
      } catch (err) {
        console.error("[LP ShortcutInterceptor] Error in command palette handler:", err);
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
    }
  }

  // ====== PRIMARY: Window-level capture ======
  // window.addEventListener fires FIRST in capture phase (window -> document -> html -> body -> ... -> target).
  if (DEBUG) console.log("[LP ShortcutInterceptor] Adding window keydown listener...");
  window.addEventListener("keydown", handleKeydown, true);

  // Document-level capture is NOT needed — window capture already covers all keydown events.
  // Adding both would cause every keypress to log twice (as seen with the "2" counter in console).

  // Cleanup function to prevent memory leaks
  const cleanup = () => {
    window.removeEventListener("keydown", handleKeydown, true);
  };

  // Call cleanup on page unload
  window.addEventListener("beforeunload", cleanup);

  if (DEBUG) console.log("[LP ShortcutInterceptor] Initialization complete!");
})();
