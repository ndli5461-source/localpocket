(function () {
  if (typeof window === "undefined") return;
  if (window.__lpAiOverlayInstalled) return;
  window.__lpAiOverlayInstalled = true;
  if (window.name === "__LP_SIDEBAR__") return;

  const api = typeof browser !== "undefined" ? browser : (typeof chrome !== "undefined" ? chrome : null);
  if (!api || !api.storage || !api.runtime) return;

  const FRAME_SRC_KEY = "lpAiOverlayFrameSrc";

  const state = {
    open: false,
    popupActive: false,
    currentProvider: "chatgpt"
  };

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

  // Restore provider from sessionStorage
  try {
    const saved = sessionStorage.getItem(FRAME_SRC_KEY);
    if (saved && PROVIDER_OPTIONS.find(o => o.value === saved)) {
      state.currentProvider = saved;
    }
  } catch (_) {}

  // Load provider from settings
  try {
    api.storage.local.get("settings", function (data) {
      const raw = data && data.settings && data.settings.sidebarAiProvider;
      if (raw && PROVIDER_OPTIONS.find(o => o.value === raw)) {
        state.currentProvider = raw;
        try { sessionStorage.setItem(FRAME_SRC_KEY, raw); } catch (_) {}
      }
    });
  } catch (_) {}

  function openPopupWindow() {
    state.popupActive = true;
    try { sessionStorage.setItem(FRAME_SRC_KEY, state.currentProvider); } catch (_) {}
    api.runtime.sendMessage({
      type: "open-ai-overlay-popup",
      provider: state.currentProvider,
      width: 960,
      height: 560
    }).catch(err => console.error("[AiOverlay] Failed to send message:", err));
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    if (state.popupActive) {
      state.popupActive = false;
      api.runtime.sendMessage({ type: "close-ai-overlay-popup" }).catch(err => console.error("[AiOverlay] Failed to close popup:", err));
    }
  }

  function toggle(selectedText) {
    if (state.open) {
      close();
      return false;
    }
    state.open = true;
    if (selectedText) {
      api.runtime.sendMessage({
        type: "open-ai-sidebar-with-prompt",
        prompt: selectedText,
        provider: state.currentProvider,
        fromOverlay: true
      }).catch(function () {}).finally(function () {
        openPopupWindow();
      });
    } else {
      openPopupWindow();
    }
    return true;
  }

  api.runtime.onMessage.addListener(function (message) {
    if (!message || typeof message !== "object") return undefined;

    if (message.type === "toggle-ai-overlay") {
      const opened = toggle(message.selectedText || "");
      return Promise.resolve({ ok: opened });
    }

    if (message.type === "ai-overlay-popup-closed") {
      state.popupActive = false;
      if (state.open) state.open = false;
      return undefined;
    }

    if (message.type === "sidebar-ui-switch-provider") {
      const newProvider = message.provider ? String(message.provider).trim().toLowerCase() : "";
      if (newProvider && PROVIDER_OPTIONS.find(o => o.value === newProvider)) {
        state.currentProvider = newProvider;
        try { sessionStorage.setItem(FRAME_SRC_KEY, newProvider); } catch (_) {}
        if (state.popupActive) {
          api.runtime.sendMessage({
            type: "update-ai-overlay-popup",
            provider: newProvider
          }).catch(err => console.error("[AiOverlay] Failed to send message:", err));
        }
      }
      return undefined;
    }

    return undefined;
  });
})();
