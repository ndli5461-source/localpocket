// Use var to avoid any accidental redeclaration across scripts.
var api = typeof browser !== "undefined" ? browser : (typeof chrome !== "undefined" ? chrome : {});

const selectionSearchEnabledEl = document.querySelector("#selectionSearchEnabled");
const engineListEl = document.querySelector("#selectionSearchEngineList");
const addEngineBtn = document.querySelector("#addSelectionEngine");
const addGroupBtn = document.querySelector("#addSelectionGroup");
const addSeparatorBtn = document.querySelector("#addSelectionSeparator");
const importFirefoxEnginesBtn = document.querySelector("#importFirefoxEngines");
const importSssBtn = document.querySelector("#importSss");
const importSssFileEl = document.querySelector("#importSssFile");
const importSssStatusEl = document.querySelector("#importSssStatus");
const backToMainSettingsBtn = document.querySelector("#backToMainSettings");
const saveStatusEl = document.querySelector("#saveStatus");

const selectionOpenBehaviorEl = document.querySelector("#selectionOpenBehavior");
const selectionMinCharsEl = document.querySelector("#selectionMinChars");
const selectionMaxCharsEl = document.querySelector("#selectionMaxChars");
const selectionPopupDelayEl = document.querySelector("#selectionPopupDelay");
const selectionPopupLocationEl = document.querySelector("#selectionPopupLocation");
const selectionLeftClickEl = document.querySelector("#selectionLeftClick");
const selectionRightClickEl = document.querySelector("#selectionRightClick");
const selectionMiddleClickEl = document.querySelector("#selectionMiddleClick");
const selectionShortcutClickEl = document.querySelector("#selectionShortcutClick");
const selectionAllowEditableEl = document.querySelector("#selectionAllowEditable");
const selectionHideOnScrollEl = document.querySelector("#selectionHideOnScroll");
const selectionHideOnRightClickEl = document.querySelector("#selectionHideOnRightClick");
const selectionHideOnEngineClickEl = document.querySelector("#selectionHideOnEngineClick");
const selectionAllowShortcutWithoutPopupEl = document.querySelector("#selectionAllowShortcutWithoutPopup");
const selectionPopupAnimationEl = document.querySelector("#selectionPopupAnimation");

const selectionContextMenuEnabledEl = document.querySelector("#selectionContextMenuEnabled");
const selectionContextMenuLeftEl = document.querySelector("#selectionContextMenuLeft");
const selectionContextMenuRightEl = document.querySelector("#selectionContextMenuRight");
const selectionContextMenuMiddleEl = document.querySelector("#selectionContextMenuMiddle");
const selectionContextMenuTitleEl = document.querySelector("#selectionContextMenuTitle");

let pendingSettings = { ...DEFAULT_SETTINGS };
let dirty = false;
let autoSaveTimer = null;
const AUTO_SAVE_DELAY = 800;

function setSaveStatus(message, isError) {
  if (!saveStatusEl) return;
  saveStatusEl.textContent = message || "";
  saveStatusEl.classList.toggle("error", !!isError);
}

function setImportStatus(message, isError) {
  if (!importSssStatusEl) return;
  importSssStatusEl.textContent = message || "";
  importSssStatusEl.classList.toggle("error", !!isError);
}

function normalizeUrlTemplate(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  return raw.replace(/\{searchTerms\}/g, "%s");
}

function normalizeShortcut(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  if (raw.length === 1) return raw.toUpperCase();
  return raw.slice(0, 2).toUpperCase();
}

function cloneEnginesList(list) {
  return Array.isArray(list) ? list.map((entry) => ({ ...entry })) : [];
}

function ensureEnginesList(settings) {
  if (Array.isArray(settings.selectionSearchEnginesList) && settings.selectionSearchEnginesList.length) {
    return cloneEnginesList(settings.selectionSearchEnginesList);
  }
  return cloneEnginesList(DEFAULT_SETTINGS.selectionSearchEnginesList);
}

let engineList = [];

function createEngineRow(entry, index) {
  const row = document.createElement("div");
  row.className = "selection-engine-row";
  row.dataset.index = String(index);

  const popupInput = document.createElement("input");
  popupInput.type = "checkbox";
  popupInput.checked = entry.showPopup !== false && entry.type !== "group" && entry.type !== "separator";
  popupInput.addEventListener("change", handleSettingChange);
  row.appendChild(popupInput);

  const contextInput = document.createElement("input");
  contextInput.type = "checkbox";
  contextInput.checked = entry.showContextMenu === true;
  contextInput.addEventListener("change", handleSettingChange);
  row.appendChild(contextInput);

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = entry.name || "";
  nameInput.placeholder = entry.type === "group" ? "Group name" : "Engine name";
  nameInput.addEventListener("input", handleSettingChange);
  row.appendChild(nameInput);

  const urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.value = entry.url || "";
  urlInput.placeholder = entry.type === "engine" ? "Search URL" : (entry.type === "open-link" ? "(Open link)" : "(Copy)");
  urlInput.disabled = entry.type !== "engine";
  urlInput.addEventListener("input", handleSettingChange);
  row.appendChild(urlInput);

  const iconInput = document.createElement("input");
  iconInput.type = "text";
  iconInput.value = entry.iconUrl || "";
  iconInput.placeholder = "Icon URL";
  iconInput.disabled = entry.type === "separator";
  iconInput.addEventListener("input", handleSettingChange);
  row.appendChild(iconInput);

  const shortcutInput = document.createElement("input");
  shortcutInput.type = "text";
  shortcutInput.value = entry.shortcut || "";
  shortcutInput.placeholder = "Key";
  shortcutInput.maxLength = 2;
  shortcutInput.addEventListener("input", handleSettingChange);
  row.appendChild(shortcutInput);

  const actions = document.createElement("div");
  actions.className = "engine-actions";
  const upBtn = document.createElement("button");
  upBtn.type = "button";
  upBtn.className = "ghost";
  upBtn.textContent = "↑";
  upBtn.title = "Move up";
  upBtn.addEventListener("click", () => moveEngine(index, -1));
  actions.appendChild(upBtn);

  const downBtn = document.createElement("button");
  downBtn.type = "button";
  downBtn.className = "ghost";
  downBtn.textContent = "↓";
  downBtn.title = "Move down";
  downBtn.addEventListener("click", () => moveEngine(index, 1));
  actions.appendChild(downBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "ghost danger";
  deleteBtn.textContent = "×";
  deleteBtn.title = "Remove";
  deleteBtn.addEventListener("click", () => removeEngine(index));
  actions.appendChild(deleteBtn);

  row.appendChild(actions);
  row.dataset.popup = "selection-engine-row";
  row.__engineControls = {
    popupInput,
    contextInput,
    nameInput,
    urlInput,
    iconInput,
    shortcutInput
  };
  return row;
}

function renderEngineList() {
  if (!engineListEl) return;
  engineListEl.innerHTML = "";
  engineList.forEach((entry, index) => {
    const row = createEngineRow(entry, index);
    engineListEl.appendChild(row);
  });
}

function moveEngine(index, delta) {
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= engineList.length) return;
  const next = engineList.slice();
  const [moved] = next.splice(index, 1);
  next.splice(nextIndex, 0, moved);
  engineList = next;
  renderEngineList();
  handleSettingChange();
}

function removeEngine(index) {
  if (index < 0 || index >= engineList.length) return;
  engineList = engineList.filter((_entry, idx) => idx !== index);
  renderEngineList();
  handleSettingChange();
}

function createEmptyEngine(type) {
  const id = `engine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  if (type === "separator") {
    return {
      id,
      type: "separator",
      name: "Separator",
      url: "",
      iconUrl: "",
      showPopup: true,
      showContextMenu: false,
      shortcut: ""
    };
  }
  if (type === "group") {
    return {
      id,
      type: "group",
      name: "Group",
      url: "",
      iconUrl: "",
      showPopup: false,
      showContextMenu: false,
      shortcut: ""
    };
  }
  return {
    id,
    type: "engine",
    name: "New engine",
    url: "",
    iconUrl: "",
    showPopup: true,
    showContextMenu: true,
    shortcut: ""
  };
}

function readEngineRows() {
  const rows = Array.from(document.querySelectorAll(".selection-engine-row"));
  const list = [];
  rows.forEach((row, index) => {
    const controls = row.__engineControls;
    const prev = engineList[index] || {};
    if (!controls) return;
    list.push({
      id: prev.id || `engine-${index}`,
      type: prev.type || "engine",
      name: controls.nameInput.value.trim().slice(0, 80),
      url: normalizeUrlTemplate(controls.urlInput.value),
      iconUrl: controls.iconInput.value.trim().slice(0, 500),
      showPopup: controls.popupInput.checked,
      showContextMenu: controls.contextInput.checked,
      shortcut: normalizeShortcut(controls.shortcutInput.value)
    });
  });
  return list;
}

function applySettings(settings) {
  if (selectionSearchEnabledEl) {
    selectionSearchEnabledEl.checked = settings.selectionSearchPopup
      ? settings.selectionSearchPopup.enabled !== false
      : true;
  }
  const popup = settings.selectionSearchPopup || DEFAULT_SETTINGS.selectionSearchPopup;
  if (selectionOpenBehaviorEl) selectionOpenBehaviorEl.value = popup.openBehavior || "auto";
  if (selectionMinCharsEl) selectionMinCharsEl.value = String(popup.minChars || 0);
  if (selectionMaxCharsEl) selectionMaxCharsEl.value = String(popup.maxChars || 0);
  if (selectionPopupDelayEl) selectionPopupDelayEl.value = String(popup.delayMs || 0);
  if (selectionPopupLocationEl) selectionPopupLocationEl.value = popup.location || "cursor";
  if (selectionLeftClickEl) selectionLeftClickEl.value = popup.leftClickAction || "new-background-tab";
  if (selectionRightClickEl) selectionRightClickEl.value = popup.rightClickAction || "new-tab";
  if (selectionMiddleClickEl) selectionMiddleClickEl.value = popup.middleClickAction || "new-tab";
  if (selectionShortcutClickEl) selectionShortcutClickEl.value = popup.shortcutAction || "new-background-tab";
  if (selectionAllowEditableEl) selectionAllowEditableEl.checked = popup.allowOnEditable === true;
  if (selectionHideOnScrollEl) selectionHideOnScrollEl.checked = popup.hideOnScroll !== false;
  if (selectionHideOnRightClickEl) selectionHideOnRightClickEl.checked = popup.hideOnRightClick !== false;
  if (selectionHideOnEngineClickEl) selectionHideOnEngineClickEl.checked = popup.hideOnEngineClick !== false;
  if (selectionAllowShortcutWithoutPopupEl) {
    selectionAllowShortcutWithoutPopupEl.checked = popup.allowShortcutsWithoutPopup !== false;
  }
  if (selectionPopupAnimationEl) selectionPopupAnimationEl.value = String(popup.animationMs || 100);

  const contextMenu = settings.selectionSearchContextMenu || DEFAULT_SETTINGS.selectionSearchContextMenu;
  if (selectionContextMenuEnabledEl) selectionContextMenuEnabledEl.checked = contextMenu.enabled === true;
  if (selectionContextMenuLeftEl) selectionContextMenuLeftEl.value = contextMenu.leftClickAction || "new-tab";
  if (selectionContextMenuRightEl) selectionContextMenuRightEl.value = contextMenu.rightClickAction || "new-tab";
  if (selectionContextMenuMiddleEl) selectionContextMenuMiddleEl.value = contextMenu.middleClickAction || "new-background-tab";
  if (selectionContextMenuTitleEl) selectionContextMenuTitleEl.value = contextMenu.title || "Search for \"%s\"";

  engineList = ensureEnginesList(settings);
  renderEngineList();
}

function collectSettings() {
  const selectionSearchPopup = {
    enabled: selectionSearchEnabledEl ? selectionSearchEnabledEl.checked !== false : true,
    openBehavior: selectionOpenBehaviorEl ? selectionOpenBehaviorEl.value : "auto",
    minChars: Number.parseInt(selectionMinCharsEl ? selectionMinCharsEl.value : "0", 10) || 0,
    maxChars: Number.parseInt(selectionMaxCharsEl ? selectionMaxCharsEl.value : "0", 10) || 0,
    delayMs: Number.parseInt(selectionPopupDelayEl ? selectionPopupDelayEl.value : "0", 10) || 0,
    location: selectionPopupLocationEl ? selectionPopupLocationEl.value : "cursor",
    leftClickAction: selectionLeftClickEl ? selectionLeftClickEl.value : "new-background-tab",
    rightClickAction: selectionRightClickEl ? selectionRightClickEl.value : "new-tab",
    middleClickAction: selectionMiddleClickEl ? selectionMiddleClickEl.value : "new-tab",
    shortcutAction: selectionShortcutClickEl ? selectionShortcutClickEl.value : "new-background-tab",
    allowOnEditable: selectionAllowEditableEl ? selectionAllowEditableEl.checked === true : false,
    hideOnScroll: selectionHideOnScrollEl ? selectionHideOnScrollEl.checked !== false : true,
    hideOnRightClick: selectionHideOnRightClickEl ? selectionHideOnRightClickEl.checked !== false : true,
    hideOnEngineClick: selectionHideOnEngineClickEl ? selectionHideOnEngineClickEl.checked !== false : true,
    allowShortcutsWithoutPopup: selectionAllowShortcutWithoutPopupEl
      ? selectionAllowShortcutWithoutPopupEl.checked !== false
      : true,
    animationMs: Number.parseInt(selectionPopupAnimationEl ? selectionPopupAnimationEl.value : "100", 10) || 100
  };
  const selectionSearchContextMenu = {
    enabled: selectionContextMenuEnabledEl ? selectionContextMenuEnabledEl.checked === true : false,
    leftClickAction: selectionContextMenuLeftEl ? selectionContextMenuLeftEl.value : "new-tab",
    rightClickAction: selectionContextMenuRightEl ? selectionContextMenuRightEl.value : "new-tab",
    middleClickAction: selectionContextMenuMiddleEl ? selectionContextMenuMiddleEl.value : "new-background-tab",
    title: selectionContextMenuTitleEl ? selectionContextMenuTitleEl.value.trim() : "Search for \"%s\""
  };
  return {
    selectionSearchPopup,
    selectionSearchContextMenu,
    selectionSearchEnginesList: readEngineRows()
  };
}

function handleSettingChange() {
  dirty = true;
  setSaveStatus("Saving...", false);
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(saveSettings, AUTO_SAVE_DELAY);
}

async function saveSettings() {
  try {
    const next = collectSettings();
    pendingSettings = await setSettings(next);
    dirty = false;
    setSaveStatus("Saved.", false);
  } catch (err) {
    console.error("Failed to save selection settings", err);
    setSaveStatus("Failed to save.", true);
  }
}

function registerListeners() {
  [
    selectionSearchEnabledEl,
    selectionOpenBehaviorEl,
    selectionMinCharsEl,
    selectionMaxCharsEl,
    selectionPopupDelayEl,
    selectionPopupLocationEl,
    selectionLeftClickEl,
    selectionRightClickEl,
    selectionMiddleClickEl,
    selectionShortcutClickEl,
    selectionAllowEditableEl,
    selectionHideOnScrollEl,
    selectionHideOnRightClickEl,
    selectionHideOnEngineClickEl,
    selectionAllowShortcutWithoutPopupEl,
    selectionPopupAnimationEl,
    selectionContextMenuEnabledEl,
    selectionContextMenuLeftEl,
    selectionContextMenuRightEl,
    selectionContextMenuMiddleEl,
    selectionContextMenuTitleEl
  ].forEach((el) => {
    if (!el) return;
    const eventName = el.tagName === "INPUT" && el.type === "text" ? "input" : "change";
    el.addEventListener(eventName, handleSettingChange);
  });
}

function extractSssEngines(parsed) {
  if (parsed && Array.isArray(parsed.searchEngines)) return parsed.searchEngines;
  if (parsed && parsed.settings && Array.isArray(parsed.settings.searchEngines)) {
    return parsed.settings.searchEngines;
  }
  if (parsed && parsed.data && Array.isArray(parsed.data.searchEngines)) {
    return parsed.data.searchEngines;
  }
  return [];
}

function mapSssEnginesToList(engines) {
  const list = [];
  engines.forEach((engine) => {
    if (!engine || typeof engine !== "object") return;
    const type = engine.type ? String(engine.type).toLowerCase() : "";
    if (type === "group") {
      list.push({
        id: engine.id || `group-${Date.now().toString(36)}`,
        type: "group",
        name: String(engine.name || engine.title || "Group").slice(0, 80),
        url: "",
        iconUrl: "",
        showPopup: false,
        showContextMenu: false,
        shortcut: ""
      });
      return;
    }
    if (type === "separator") {
      list.push({
        id: engine.id || `sep-${Date.now().toString(36)}`,
        type: "separator",
        name: "Separator",
        url: "",
        iconUrl: "",
        showPopup: true,
        showContextMenu: false,
        shortcut: ""
      });
      return;
    }
    const label = String(engine.name || engine.title || engine.label || "").trim();
    const url = String(engine.searchUrl || engine.url || engine.template || "").trim();
    const enabled = engine.enabled !== false && engine.isEnabled !== false;
    if (!url && type !== "copy" && type !== "open-link") return;
    list.push({
      id: engine.id || `engine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      type: type === "copy" ? "copy" : (type === "open-link" ? "open-link" : "engine"),
      name: label || "Engine",
      url: normalizeUrlTemplate(url),
      iconUrl: String(engine.iconUrl || engine.icon || "").trim(),
      showPopup: enabled,
      showContextMenu: enabled,
      shortcut: normalizeShortcut(engine.shortcut || "")
    });
  });
  return list.length ? list : cloneEnginesList(DEFAULT_SETTINGS.selectionSearchEnginesList);
}

async function handleSssImportFile(file) {
  if (!file) return;
  try {
    setImportStatus("Parsing file...", false);
    const text = await file.text();
    const parsed = JSON.parse(text);
    const engines = extractSssEngines(parsed);
    if (!engines.length) {
      setImportStatus("No search engines found in file.", true);
      return;
    }
    engineList = mapSssEnginesToList(engines);
    renderEngineList();
    handleSettingChange();
    setImportStatus("Imported SSS engines.", false);
  } catch (err) {
    console.error("Import failed", err);
    setImportStatus("Import failed. Please check the JSON file.", true);
  } finally {
    if (importSssFileEl) importSssFileEl.value = "";
  }
}

async function importFirefoxEngines() {
  try {
    if (!api.search || typeof api.search.get !== "function") {
      setImportStatus("Firefox search API not available. Add 'search' permission.", true);
      return;
    }
    const engines = await api.search.get();
    if (!Array.isArray(engines) || !engines.length) {
      setImportStatus("No Firefox search engines found.", true);
      return;
    }
    const mapped = engines.map((engine) => ({
      id: `fx-${engine.name}-${Math.random().toString(36).slice(2, 6)}`,
      type: "engine",
      name: engine.name || "Firefox engine",
      url: normalizeUrlTemplate(engine.template || engine.searchUrl || ""),
      iconUrl: engine.favicon || "",
      showPopup: true,
      showContextMenu: true,
      shortcut: ""
    })).filter((entry) => entry.url);
    if (!mapped.length) {
      setImportStatus("No valid search templates from Firefox.", true);
      return;
    }
    engineList = [...engineList, ...mapped];
    renderEngineList();
    handleSettingChange();
    setImportStatus("Added Firefox search engines.", false);
  } catch (err) {
    console.error("Firefox import failed", err);
    setImportStatus("Failed to import Firefox engines.", true);
  }
}

function initImport() {
  if (importSssBtn && importSssFileEl) {
    importSssBtn.addEventListener("click", (e) => {
      e.preventDefault();
      setImportStatus("", false);
      importSssFileEl.click();
    });
    importSssFileEl.addEventListener("change", (e) => {
      const file = e.target && e.target.files ? e.target.files[0] : null;
      handleSssImportFile(file);
    });
  }
  if (importFirefoxEnginesBtn) {
    importFirefoxEnginesBtn.addEventListener("click", (e) => {
      e.preventDefault();
      importFirefoxEngines();
    });
  }
}

async function load() {
  const settings = await getSettings();
  pendingSettings = { ...settings };
  applySettings(settings);
  registerListeners();
}

if (addEngineBtn) {
  addEngineBtn.addEventListener("click", () => {
    engineList.push(createEmptyEngine("engine"));
    renderEngineList();
    handleSettingChange();
  });
}

if (addGroupBtn) {
  addGroupBtn.addEventListener("click", () => {
    engineList.push(createEmptyEngine("group"));
    renderEngineList();
    handleSettingChange();
  });
}

if (addSeparatorBtn) {
  addSeparatorBtn.addEventListener("click", () => {
    engineList.push(createEmptyEngine("separator"));
    renderEngineList();
    handleSettingChange();
  });
}

if (backToMainSettingsBtn) {
  backToMainSettingsBtn.addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = "options.html";
  });
}

load().then(initImport).catch((err) => {
  console.error("Failed to load selection settings", err);
  setSaveStatus("Failed to load settings.", true);
});
