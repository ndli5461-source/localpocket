(function () {
  const SETTINGS_KEY = "settings";
  const PROVIDER_CONFIGS = {
    chatgpt: { url: "https://chatgpt.com/" },
    claude: { url: "https://claude.ai/" },
    gemini: { url: "https://gemini.google.com/app" },
    perplexity: { url: "https://www.perplexity.ai/" },
    copilot: { url: "https://copilot.microsoft.com/" },
    grok: { url: "https://grok.com/" },
    deepseek: { url: "https://chat.deepseek.com/" },
    poe: { url: "https://poe.com/" },
    mistral: { url: "https://chat.mistral.ai/chat" }
  };

  function normalizeProvider(value) {
    const key = typeof value === "string" ? value.trim().toLowerCase() : "";
    return Object.prototype.hasOwnProperty.call(PROVIDER_CONFIGS, key) ? key : "chatgpt";
  }

  function buildOverlayUrl(providerKey) {
    const normalizedProvider = normalizeProvider(providerKey);
    const config = PROVIDER_CONFIGS[normalizedProvider] || PROVIDER_CONFIGS.chatgpt;

    try {
      const url = new URL(config.url);
      url.searchParams.set("lp_popup", "1");
      return url.toString();
    } catch (err) {
      const sep = config.url.includes("?") ? "&" : "?";
      return `${config.url}${sep}lp_popup=1`;
    }
  }

  function getExtensionApi() {
    if (typeof browser !== "undefined") return browser;
    if (typeof chrome !== "undefined") return chrome;
    return null;
  }

  function storageGetLocal(key) {
    const extensionApi = getExtensionApi();
    if (!extensionApi || !extensionApi.storage || !extensionApi.storage.local || !extensionApi.storage.local.get) {
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
        const maybePromise = extensionApi.storage.local.get(key, (value) => {
          const err = extensionApi.runtime && extensionApi.runtime.lastError;
          if (err) {
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

  function storageSetLocal(data) {
    const extensionApi = getExtensionApi();
    if (!extensionApi || !extensionApi.storage || !extensionApi.storage.local || !extensionApi.storage.local.set) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      try {
        const maybePromise = extensionApi.storage.local.set(data, () => {
          const err = extensionApi.runtime && extensionApi.runtime.lastError;
          if (err) {
            console.error("Storage set error:", err);
          }
          finish();
        });
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then(finish).catch(() => finish());
        }
      } catch (err) {
        finish();
      }
    });
  }

  function runtimeSendMessage(message) {
    const extensionApi = getExtensionApi();
    if (!extensionApi || !extensionApi.runtime || !extensionApi.runtime.sendMessage) {
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
        const maybePromise = extensionApi.runtime.sendMessage(message, (response) => {
          const err = extensionApi.runtime && extensionApi.runtime.lastError;
          if (err) {
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

  function normalizeSummaryMode(value) {
    var v = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (v === "auto" || v === "quick" || v === "deep" || v === "action" || v === "study" || v === "research" || v === "custom") return v;
    return "deep";
  }

  // UI Elements
  const providerDropdown = document.getElementById("lp-provider-dropdown");
  const aiModeDropdown = document.getElementById("lp-ai-mode-dropdown");
  const summaryModeDropdown = document.getElementById("lp-summary-mode-dropdown");
  const iframe = document.getElementById("lp-overlay-iframe");

  let currentProvider = "chatgpt";
  let currentAiMode = "overlay";

  // Load AI provider in iframe
  function loadProviderInIframe(provider) {
    const url = buildOverlayUrl(provider);
    iframe.src = url;
    currentProvider = provider;
    providerDropdown.value = provider;
  }

  // Handle provider dropdown change
  function handleProviderChange() {
    const newProvider = providerDropdown.value;
    if (newProvider && newProvider !== currentProvider) {
      loadProviderInIframe(newProvider);
      // Save to storage
      storageGetLocal(SETTINGS_KEY).then(data => {
        const settings = data && data[SETTINGS_KEY] ? data[SETTINGS_KEY] : {};
        settings.sidebarAiProvider = newProvider;
        storageSetLocal({ [SETTINGS_KEY]: settings }).catch(err => console.error("[OverlayWrapper] Failed to save settings:", err));
      });
      // Notify background script
      runtimeSendMessage({
        type: "sidebar-ui-switch-provider",
        provider: newProvider
      }).catch(err => console.error("[OverlayWrapper] Failed to send message:", err));
    }
  }

  // Handle AI mode dropdown change
  function handleAiModeChange() {
    const newMode = aiModeDropdown.value;
    if (newMode && newMode !== currentAiMode) {
      currentAiMode = newMode;
      // Save to storage
      storageGetLocal(SETTINGS_KEY).then(data => {
        const settings = data && data[SETTINGS_KEY] ? data[SETTINGS_KEY] : {};
        settings.aiMode = newMode;
        storageSetLocal({ [SETTINGS_KEY]: settings }).catch(err => console.error("[OverlayWrapper] Failed to save settings:", err));
      });
      // If switching to sidebar, close overlay and open sidebar
      if (newMode === "sidebar") {
        runtimeSendMessage({ type: "open-ai-sidebar" }).catch(err => console.error("[OverlayWrapper] Failed to open sidebar:", err));
        window.close();
      }
    }
  }

  // Handle summary mode dropdown change
  function handleSummaryModeChange() {
    const newMode = normalizeSummaryMode(summaryModeDropdown.value);
    if (newMode) {
      storageSetLocal({ summaryModePreference: newMode }).catch(err => console.error("[OverlayWrapper] Failed to save summary mode:", err));
    }
  }

  // ── Custom Prompt Panel ────────────────────────────────────────────────

  const customPromptPanel = document.getElementById("lp-custom-prompt-panel");
  const customPromptTextarea = document.getElementById("lp-custom-prompt-textarea");
  const customPromptSaveBtn = document.getElementById("lp-custom-prompt-save-btn");
  const customPromptClearBtn = document.getElementById("lp-custom-prompt-clear-btn");
  const customPromptTemplateList = document.getElementById("lp-custom-prompt-template-list");
  const customPromptToggle = document.getElementById("lp-custom-prompt-toggle");
  const summaryPageBtn = document.getElementById("lp-summary-page-btn");
  const selSearchToggleBtn = document.getElementById("lp-sel-search-toggle");

  // ── Selection Search Toggle ────────────────────────────────────────────
  let _selSearchEnabled = true;

  function applySelSearchToggleUI(enabled) {
    if (!selSearchToggleBtn) return;
    selSearchToggleBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
    selSearchToggleBtn.title = enabled ? "Selection Search: ON (klik untuk matikan)" : "Selection Search: OFF (klik untuk hidupkan)";
    selSearchToggleBtn.style.background = enabled ? "rgba(59,130,246,0.18)" : "rgba(0,0,0,0.2)";
    selSearchToggleBtn.style.borderColor = enabled ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.15)";
    selSearchToggleBtn.style.color = enabled ? "#7ab8ff" : "#555";
  }

  async function loadSelSearchState() {
    try {
      const data = await storageGetLocal(SETTINGS_KEY);
      const settings = data && data[SETTINGS_KEY] ? data[SETTINGS_KEY] : {};
      // Cek KEDUA-DUA flag — sama logik dengan applySelectionSearchSettings dalam iframe
      const popupEnabled = settings.selectionSearchPopup && typeof settings.selectionSearchPopup === "object"
        ? settings.selectionSearchPopup.enabled !== false
        : true;
      _selSearchEnabled = popupEnabled && settings.selectionSearchEnabled !== false;
    } catch (_) {
      _selSearchEnabled = true;
    }
    applySelSearchToggleUI(_selSearchEnabled);
  }

  function handleSelSearchToggle() {
    _selSearchEnabled = !_selSearchEnabled;
    applySelSearchToggleUI(_selSearchEnabled);
    // Simpan ke storage — kemas kini KEDUA-DUA selectionSearchEnabled DAN
    // selectionSearchPopup.enabled supaya applySelectionSearchSettings dalam
    // contentScriptSidebarAi.js tidak reject kerana satu nilai masih false.
    storageGetLocal(SETTINGS_KEY).then(data => {
      const settings = data && data[SETTINGS_KEY] ? data[SETTINGS_KEY] : {};
      settings.selectionSearchEnabled = _selSearchEnabled;
      if (settings.selectionSearchPopup && typeof settings.selectionSearchPopup === "object") {
        settings.selectionSearchPopup.enabled = _selSearchEnabled;
      } else {
        settings.selectionSearchPopup = { enabled: _selSearchEnabled };
      }
      storageSetLocal({ [SETTINGS_KEY]: settings }).catch(err => console.error("[OverlayWrapper] Failed to save selectionSearchEnabled:", err));
    });
    try {
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: "__lp_selection_search_toggle", enabled: _selSearchEnabled }, "*");
      }
    } catch (_) {}
  }

  function showCustomPromptPanel(show) {
    if (!customPromptPanel) return;
    customPromptPanel.style.display = show ? "flex" : "none";
    if (customPromptToggle) {
      customPromptToggle.style.background = show ? "rgba(110,180,255,0.2)" : "rgba(0,0,0,0.2)";
      customPromptToggle.style.color = show ? "#8ab8ff" : "#aaa";
    }
  }

  function toggleCustomPromptPanel() {
    showCustomPromptPanel(!customPromptPanel || customPromptPanel.style.display !== "flex");
  }

  async function loadCustomPromptText() {
    try {
      const data = await storageGetLocal(SETTINGS_KEY);
      const settings = data && data[SETTINGS_KEY] ? data[SETTINGS_KEY] : {};
      if (customPromptTextarea) {
        customPromptTextarea.value = typeof settings.summaryCustomPrompt === "string" ? settings.summaryCustomPrompt : "";
      }
    } catch (err) {
      if (customPromptTextarea) customPromptTextarea.value = "";
    }
  }

  function saveCustomPromptText(text) {
    storageGetLocal(SETTINGS_KEY).then(data => {
      const settings = data && data[SETTINGS_KEY] ? data[SETTINGS_KEY] : {};
      settings.summaryCustomPrompt = text;
      storageSetLocal({ [SETTINGS_KEY]: settings }).catch(err => console.error("[OverlayWrapper] Failed to save custom prompt:", err));
    }).catch(err => console.error("[OverlayWrapper] Failed to load settings for custom prompt:", err));
  }

  async function getPromptTemplates() {
    try {
      const data = await storageGetLocal("summaryPromptTemplates");
      return Array.isArray(data.summaryPromptTemplates) ? data.summaryPromptTemplates : [];
    } catch (err) {
      return [];
    }
  }

  function savePromptTemplates(templates) {
    storageSetLocal({ summaryPromptTemplates: templates }).catch(err => console.error("[OverlayWrapper] Failed to save prompt templates:", err));
  }

  function renderTemplateList(templates) {
    if (!customPromptTemplateList) return;
    customPromptTemplateList.textContent = "";
    
    if (!templates || templates.length === 0) {
      return;
    }
    
    var header = document.createElement("div");
    header.style.fontSize = "11px";
    header.style.color = "#888";
    header.style.margin = "4px 0 2px";
    header.textContent = "Templat Tersimpan:";
    customPromptTemplateList.appendChild(header);
    
    templates.forEach(function(t, i) {
      var name = t.name || ("Templat " + (i + 1));
      var div = document.createElement("div");
      div.style.display = "flex";
      div.style.alignItems = "center";
      div.style.gap = "4px";
      div.style.padding = "4px 6px";
      div.style.borderRadius = "6px";
      div.style.background = "rgba(255,255,255,0.04)";
      div.style.fontSize = "11px";
      
      var span = document.createElement("span");
      span.style.flex = "1";
      span.style.overflow = "hidden";
      span.style.textOverflow = "ellipsis";
      span.style.whiteSpace = "nowrap";
      span.style.color = "#ccc";
      span.textContent = name;
      div.appendChild(span);
      
      var applyBtn = document.createElement("button");
      applyBtn.dataset.tplApply = i;
      applyBtn.style.padding = "2px 6px";
      applyBtn.style.borderRadius = "4px";
      applyBtn.style.border = "1px solid rgba(110,180,255,0.3)";
      applyBtn.style.background = "rgba(70,140,255,0.1)";
      applyBtn.style.color = "#8ab8ff";
      applyBtn.style.fontSize = "10px";
      applyBtn.style.cursor = "pointer";
      applyBtn.textContent = "Apply";
      applyBtn.addEventListener("click", function(e) { handleApplyTemplate(i); });
      div.appendChild(applyBtn);
      
      var editBtn = document.createElement("button");
      editBtn.dataset.tplEdit = i;
      editBtn.style.padding = "2px 6px";
      editBtn.style.borderRadius = "4px";
      editBtn.style.border = "1px solid rgba(200,180,100,0.3)";
      editBtn.style.background = "rgba(200,180,60,0.1)";
      editBtn.style.color = "#d4c878";
      editBtn.style.fontSize = "10px";
      editBtn.style.cursor = "pointer";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", function(e) { handleEditTemplate(i); });
      div.appendChild(editBtn);
      
      var delBtn = document.createElement("button");
      delBtn.dataset.tplDel = i;
      delBtn.style.padding = "2px 6px";
      delBtn.style.borderRadius = "4px";
      delBtn.style.border = "1px solid rgba(255,100,100,0.3)";
      delBtn.style.background = "rgba(255,60,60,0.1)";
      delBtn.style.color = "#ff9090";
      delBtn.style.fontSize = "10px";
      delBtn.style.cursor = "pointer";
      delBtn.textContent = "Del";
      delBtn.addEventListener("click", function(e) { handleDeleteTemplate(i); });
      div.appendChild(delBtn);
      
      var dupBtn = document.createElement("button");
      dupBtn.dataset.tplDup = i;
      dupBtn.style.padding = "2px 6px";
      dupBtn.style.borderRadius = "4px";
      dupBtn.style.border = "1px solid rgba(150,200,150,0.3)";
      dupBtn.style.background = "rgba(100,200,100,0.1)";
      dupBtn.style.color = "#90d090";
      dupBtn.style.fontSize = "10px";
      dupBtn.style.cursor = "pointer";
      dupBtn.textContent = "Dup";
      dupBtn.addEventListener("click", function(e) { handleDuplicateTemplate(i); });
      div.appendChild(dupBtn);
      
      customPromptTemplateList.appendChild(div);
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  var _customPromptDebounceTimer = null;

  function handleCustomPromptInput() {
    if (_customPromptDebounceTimer) clearTimeout(_customPromptDebounceTimer);
    _customPromptDebounceTimer = setTimeout(function() {
      saveCustomPromptText(customPromptTextarea ? customPromptTextarea.value : "");
    }, 1500);
  }

  function handleSaveAsTemplate() {
    var text = customPromptTextarea ? customPromptTextarea.value.trim() : "";
    if (!text) {
      alert("Tulis arahan custom prompt dahulu sebelum simpan sebagai templat.");
      return;
    }
    var name = prompt("Nama untuk templat ini:");
    if (!name || !name.trim()) return;
    var trimmedName = name.trim().slice(0, 50);
    getPromptTemplates().then(function(templates) {
      templates.push({ name: trimmedName, text: text });
      savePromptTemplates(templates);
      renderTemplateList(templates);
    });
  }

  function handleApplyTemplate(index) {
    getPromptTemplates().then(function(templates) {
      var tpl = templates[index];
      if (!tpl) return;
      if (customPromptTextarea) customPromptTextarea.value = tpl.text;
      saveCustomPromptText(tpl.text);
    });
  }

  function handleEditTemplate(index) {
    getPromptTemplates().then(function(templates) {
      var tpl = templates[index];
      if (!tpl) return;
      var newName = prompt("Nama baru templat:", tpl.name || "");
      if (!newName || !newName.trim()) return;
      var newText = prompt("Teks baru untuk templat:", tpl.text || "");
      if (newText === null) return;
      templates[index] = { name: newName.trim(), text: newText.trim() };
      savePromptTemplates(templates);
      renderTemplateList(templates);
    });
  }

  function handleDeleteTemplate(index) {
    getPromptTemplates().then(function(templates) {
      var tpl = templates[index];
      if (!tpl) return;
      if (!confirm('Padam templat "' + (tpl.name || "?") + '"?')) return;
      templates.splice(index, 1);
      savePromptTemplates(templates);
      renderTemplateList(templates);
    });
  }

  function handleDuplicateTemplate(index) {
    getPromptTemplates().then(function(templates) {
      var tpl = templates[index];
      if (!tpl) return;
      var dupName = (tpl.name || "Templat") + " (Copy)";
      var counter = 1;
      while (templates.some(function(t) { return t.name === dupName; })) {
        counter++;
        dupName = (tpl.name || "Templat") + " (Copy " + counter + ")";
      }
      templates.push({ name: dupName, text: tpl.text });
      savePromptTemplates(templates);
      renderTemplateList(templates);
    });
  }

  function handleClearPrompt() {
    if (customPromptTextarea) customPromptTextarea.value = "";
    saveCustomPromptText("");
  }

  // ── End Custom Prompt ──────────────────────────────────────────────────

  // Disable iframe pointer events when dropdown is open
  function disableIframePointerEvents() {
    iframe.classList.add("pointer-events-none");
  }

  // Enable iframe pointer events when dropdown is closed
  function enableIframePointerEvents() {
    iframe.classList.remove("pointer-events-none");
  }

  // Get initial provider from URL params
  function getInitialProvider() {
    try {
      const params = new URLSearchParams(window.location.search || "");
      return params.get("provider") || "chatgpt";
    } catch (err) {
      return "chatgpt";
    }
  }

  // Initialize
  async function init() {
    // Load settings
    const data = await storageGetLocal(SETTINGS_KEY);
    const settings = data && data[SETTINGS_KEY] ? data[SETTINGS_KEY] : {};
    
    // Get initial provider from URL params or settings
    const urlProvider = getInitialProvider();
    currentProvider = normalizeProvider(urlProvider);
    currentAiMode = settings.aiMode === "overlay" ? "overlay" : "sidebar";
    
    providerDropdown.value = currentProvider;
    aiModeDropdown.value = currentAiMode;

    // Load summary mode preference
    try {
      const modeData = await storageGetLocal("summaryModePreference");
      const savedMode = modeData && modeData.summaryModePreference ? modeData.summaryModePreference : "deep";
      summaryModeDropdown.value = normalizeSummaryMode(savedMode);
    } catch (err) {
      summaryModeDropdown.value = "deep";
    }

    // Load custom prompt text and templates
    await loadCustomPromptText();
    var templates = await getPromptTemplates();
    renderTemplateList(templates);

    // Load selection search toggle state
    await loadSelSearchState();

    // Load provider in iframe
    loadProviderInIframe(currentProvider);

    // Add event listeners
    providerDropdown.addEventListener("change", handleProviderChange);
    aiModeDropdown.addEventListener("change", handleAiModeChange);
    summaryModeDropdown.addEventListener("change", handleSummaryModeChange);
    if (customPromptToggle) customPromptToggle.addEventListener("click", toggleCustomPromptPanel);
    if (selSearchToggleBtn) selSearchToggleBtn.addEventListener("click", handleSelSearchToggle);
    if (summaryPageBtn) summaryPageBtn.addEventListener("click", function() {
      runtimeSendMessage({ type: "trigger-summary-from-sidebar" }).catch(function(err) {
        console.error("[OverlayWrapper] Failed to trigger summary:", err);
      });
    });
    if (customPromptTextarea) customPromptTextarea.addEventListener("input", handleCustomPromptInput);
    if (customPromptTextarea) {
      // Suppress AI iframe auto-focus while user is typing in the custom prompt textarea
      customPromptTextarea.addEventListener("focus", function() {
        try {
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: "suppress-ai-focus", durationMs: 60000 }, "*");
          }
        } catch (err) {}
      });
      customPromptTextarea.addEventListener("blur", function() {
        try {
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: "suppress-ai-focus", durationMs: 0 }, "*");
          }
        } catch (err) {}
      });
    }
    if (customPromptSaveBtn) customPromptSaveBtn.addEventListener("click", handleSaveAsTemplate);
    if (customPromptClearBtn) customPromptClearBtn.addEventListener("click", handleClearPrompt);
    
    // Disable iframe pointer events when dropdown is focused
    providerDropdown.addEventListener("focus", disableIframePointerEvents);
    aiModeDropdown.addEventListener("focus", disableIframePointerEvents);
    summaryModeDropdown.addEventListener("focus", disableIframePointerEvents);
    
    // Enable iframe pointer events when dropdown is blurred
    providerDropdown.addEventListener("blur", enableIframePointerEvents);
    aiModeDropdown.addEventListener("blur", enableIframePointerEvents);
    summaryModeDropdown.addEventListener("blur", enableIframePointerEvents);
    
    // Enable iframe pointer events after selection
    providerDropdown.addEventListener("change", enableIframePointerEvents);
    aiModeDropdown.addEventListener("change", enableIframePointerEvents);
    summaryModeDropdown.addEventListener("change", enableIframePointerEvents);

    // Handle F6 keydown to prevent focus going to dropdown buttons
    document.addEventListener("keydown", (event) => {
      if (event.key === "F6" && event.isTrusted) {
        event.preventDefault();
        event.stopPropagation();
        // Focus iframe first, then send message to focus input
        iframe.focus();
        try {
          iframe.contentWindow.postMessage({ type: "focus-input", forceFocus: true }, "*");
        } catch (err) {}
      }
    }, true);

    // Notify background script that overlay is loaded
    runtimeSendMessage({ type: "ai-overlay-wrapper-loaded", provider: currentProvider }).catch(() => {});

    // Relay postMessage dari iframe AI ke background — untuk butang "Ai" teks pilihan
    window.addEventListener("message", function(event) {
      if (!event || !event.data) return;
      if (event.data.type === "__lp_ai_sel_send") {
        const text = typeof event.data.text === "string" ? event.data.text.trim() : "";
        if (!text) return;
        runtimeSendMessage({ type: "open-ai-sidebar-with-prompt", prompt: text }).catch(() => {});
      }
    });
  }

  // Start
  init();
})();
