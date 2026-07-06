(function handleAutoOpenSidebar() {

  const url = new URL(window.location.href);

  if (url.searchParams.get("open_sidebar") === "1") {

    const _api = typeof browser !== "undefined" ? browser : (typeof chrome !== "undefined" ? chrome : null);

    const runtime = (_api && _api.sidebarAction) ? _api : (typeof api !== "undefined" ? api : null);

    if (runtime && runtime.sidebarAction && runtime.sidebarAction.open) {

      runtime.sidebarAction.open().then(() => {

        window.close();

      }).catch(() => {

        window.close();

      });

    } else {

      window.close();

    }

  }

})();



const ITEM_KEY = "items";

const CATEGORY_KEY = "categories";

const SELECTED_CATEGORY_KEY = "selectedCategory";

const SIDEBAR_NOTES_KEY = "sidebarNotes";

const SIDEBAR_NOTE_FOLDERS_KEY = "sidebarNoteFolders";

const SIDEBAR_NOTES_UI_KEY = "sidebarNotesUi";

const TRASH_KEY = "trashItems";

const CATEGORY_PICKER_LAST_LOCATION_KEY = "categoryPickerLastLocation";

const SUMMARY_MODE_PREFERENCE_KEY = "summaryModePreference";

const ATTACHMENTS_KEY = "sidebarNoteAttachments";

const PROMPT_TEMPLATES_KEY = "summaryPromptTemplates";

const PROMPT_HISTORY_KEY = "summaryPromptHistory";

const SUMMARY_HISTORY_INDEX_KEY = "summaryHistoryIndex";

const FLOATING_ICON_CHOICES = [

  { value: "icon_2.png", label: "Blue Plus" },

  { value: "icon_3.png", label: "Yellow Lightning" },

  { value: "custom", label: "Custom (PNG/SVG/GIF)" }

];



const showBadgeEl = document.querySelector("#showBadge");

const showPageActionEl = document.querySelector("#showPageAction");

const enableCategoryPickerEl = document.querySelector("#enableCategoryPicker");

const enableDedupeButtonEl = document.querySelector("#enableDedupeButton");

const deleteAfterOpenEl = document.querySelector("#deleteAfterOpen");

const globalLinkInBackgroundTabEl = document.querySelector("#globalLinkInBackgroundTab");

const randomAcrossAllCategoriesEl = document.querySelector("#randomAcrossAllCategories");

const contextMenuSaveToUncategorizedEl = document.querySelector("#contextMenuSaveToUncategorized");

const cycleIncludeAllEl = document.querySelector("#cycleIncludeAll");

const cycleIncludeUncategorizedEl = document.querySelector("#cycleIncludeUncategorized");

const zoomLevelEl = document.querySelector("#zoomLevel");

const pageSizeEl = document.querySelector("#pageSize");

const pickerAnimationEl = document.querySelector("#pickerAnimation");

const pickerAnimationDurationEl = document.querySelector("#pickerAnimationDuration");

const pickerStartModeEl = document.querySelector("#pickerStartMode");

const pickerHighlightColorEl = document.querySelector("#pickerHighlightColor");

const notesStartModeEl = document.querySelector("#notesStartMode");

const pickerLayoutEl = document.querySelector("#pickerLayout");

const pickerYoutubeThumbnailsEl = document.querySelector("#pickerYoutubeThumbnails");

const trashLimitEl = document.querySelector("#trashLimit");

const pickerHoverSoundEl = document.querySelector("#pickerHoverSound");

const hoverSoundFileEl = document.querySelector("#hoverSoundFile");

const uploadHoverSoundBtn = document.querySelector("#uploadHoverSound");

const clearHoverSoundBtn = document.querySelector("#clearHoverSound");

const hoverSoundStatusEl = document.querySelector("#hoverSoundStatus");

const hoverSoundSelectEl = document.querySelector("#hoverSoundSelect");

const themePresetEl = document.querySelector("#themePreset");

const customThemeSection = document.querySelector("#customThemeSection");

const customBgEl = document.querySelector("#customBg");

const customBgAltEl = document.querySelector("#customBgAlt");

const customPanelEl = document.querySelector("#customPanel");

const customPanelAltEl = document.querySelector("#customPanelAlt");

const customInkEl = document.querySelector("#customInk");

const customMutedEl = document.querySelector("#customMuted");

const customAccentEl = document.querySelector("#customAccent");

const customAccent2El = document.querySelector("#customAccent2");

const customAccent3El = document.querySelector("#customAccent3");

const customAccent4El = document.querySelector("#customAccent4");

const customBorderEl = document.querySelector("#customBorder");

const sidebarAiEnabledEl = document.querySelector("#sidebarAiEnabled");

const sidebarAiProviderEl = document.querySelector("#sidebarAiProvider");

const aiModeEl = document.querySelector("#aiMode");



const sidebarFocusF6DelayMsEl = document.querySelector("#sidebarFocusF6DelayMs");

const sidebarNativeFocusHelperEnabledEl = document.querySelector("#sidebarNativeFocusHelperEnabled");

const openNativeHelperSetupBtn = document.querySelector("#openNativeHelperSetup");

const openSelectionSearchSettingsBtn = document.querySelector("#openSelectionSearchSettings");

const summaryCustomPromptEl = document.querySelector("#summaryCustomPrompt");

const summaryPromptCharCountEl = document.querySelector("#summaryPromptCharCount");

const summaryOutputLanguageEl = document.querySelector("#summaryOutputLanguage");

const summaryToneEl = document.querySelector("#summaryTone");

const summaryMaxWordsEl = document.querySelector("#summaryMaxWords");

const summaryOpenModeEl = document.querySelector("#summaryOpenMode");

const closeOnSaveEl = document.querySelector("#closeOnSave");

const closeOnSaveAllTabsEl = document.querySelector("#closeOnSaveAllTabs");

const floatingButtonEnabledEl = document.querySelector("#floatingButtonEnabled");

const floatingAiSelectionEnabledEl = document.querySelector("#floatingAiSelectionEnabled");

const longPressGestureEnabledEl = document.querySelector("#longPressGestureEnabled");

const floatingButtonAutoSuspendTabThresholdEl = document.querySelector("#floatingButtonAutoSuspendTabThreshold");

const floatingButtonAutoSuspendStatusEl = document.querySelector("#floatingButtonAutoSuspendStatus");

const floatingButtonVisibilityModeEl = document.querySelector("#floatingButtonVisibilityMode");

const miniCategoryTriggerDirectionEl = document.querySelector("#miniCategoryTriggerDirection");

const miniCategoryPanelLayoutEl = document.querySelector("#miniCategoryPanelLayout");

const floatingButtonLongPressDurationEl = document.querySelector("#floatingButtonLongPressDuration");

const floatingButtonCategoryPickerLongPressDurationEl = document.querySelector("#floatingButtonCategoryPickerLongPressDuration");

const floatingButtonLongPressSwapEl = document.querySelector("#floatingButtonLongPressSwap");

const categoryPickerMouseGestureEl = document.querySelector("#categoryPickerMouseGesture");

const blockPickerOnTextCursorEl = document.querySelector("#blockPickerOnTextCursor");

let gestureSavedPattern = [];

const floatingSubButtonSizeEl = document.querySelector("#floatingSubButtonSize");

const floatingButtonSensitivityEl = document.querySelector("#floatingButtonSensitivity");

const floatingButtonHideTimeEl = document.querySelector("#floatingButtonHideTime");

const floatingButtonAnimationEl = document.querySelector("#floatingButtonAnimation");

const floatingButtonShowAnimDurationEl = document.querySelector("#floatingButtonShowAnimDuration");

const floatingButtonHideAnimDurationEl = document.querySelector("#floatingButtonHideAnimDuration");

const floatingButtonDomainExceptionsEl = document.querySelector("#floatingButtonDomainExceptions");

// floatingButtonAnchor removed from UI (position is draggable)

// floatingButtonOffsetX/OffsetY inputs removed from UI

const ctrlAltLinkSaveEnabledEl = document.querySelector("#ctrlAltLinkSaveEnabled");

const linkSaveModifierComboEl = document.querySelector("#linkSaveModifierCombo");

const linkSaveMouseButtonEl = document.querySelector("#linkSaveMouseButton");

const linkSaveBundleModifierEl = document.querySelector("#linkSaveBundleModifier");

const linkSaveBundleDurationEl = document.querySelector("#linkSaveBundleDuration");

const linkSaveDirectModifierEl = document.querySelector("#linkSaveDirectModifier");

const linkSaveActiveCategoryModifierEl = document.querySelector("#linkSaveActiveCategoryModifier");

const linkSavePromptCategoryEnabledEl = document.querySelector("#linkSavePromptCategoryEnabled");

const floatingButtonIconEl = document.querySelector("#floatingButtonIcon");

const floatingButtonIconPreviewEl = document.querySelector("#floatingButtonIconPreview");

const deleteFloatingIconBtn = document.querySelector("#deleteFloatingIcon");

const floatingButtonCustomIconInput = document.querySelector("#floatingButtonCustomIcon");

const uploadFloatingIconBtn = document.querySelector("#uploadFloatingIcon");

const clearFloatingIconBtn = document.querySelector("#clearFloatingIcon");

const floatingNextUpLabelEl = document.querySelector("#floatingNextUpLabel");

const floatingNextUpMaxWidthEl = document.querySelector("#floatingNextUpMaxWidth");

const categoryPaletteShortcutEl = document.querySelector("#categoryPaletteShortcut");

const pickerToggleDeleteAfterOpenShortcutEl = document.querySelector("#pickerToggleDeleteAfterOpenShortcut");

const pickerToggleShowHiddenShortcutEl = document.querySelector("#pickerToggleShowHiddenShortcut");

const pickerImportShortcutEl = document.querySelector("#pickerImportShortcut");

const pickerExportShortcutEl = document.querySelector("#pickerExportShortcut");

const pickerClearFavShortcutEl = document.querySelector("#pickerClearFavShortcut");

const pickerRestoreFavShortcutEl = document.querySelector("#pickerRestoreFavShortcut");

const pickerAutoNextShortcutEl = document.querySelector("#pickerAutoNextShortcut");

const pickerAutoRandomShortcutEl = document.querySelector("#pickerAutoRandomShortcut");

const pickerSelectPageShortcutEl = document.querySelector("#pickerSelectPageShortcut");

const pickerClearSelectionShortcutEl = document.querySelector("#pickerClearSelectionShortcut");

const pickerBulkDeleteShortcutEl = document.querySelector("#pickerBulkDeleteShortcut");

const pickerBulkFavShortcutEl = document.querySelector("#pickerBulkFavShortcut");

const pickerRenameCategoryShortcutEl = document.querySelector("#pickerRenameCategoryShortcut");

const pickerScanDupShortcutEl = document.querySelector("#pickerScanDupShortcut");

const pickerFavShortcutEl = document.querySelector("#pickerFavShortcut");

const pickerToggleFavShortcutEl = document.querySelector("#pickerToggleFavShortcut");

const pickerTrashShortcutEl = document.querySelector("#pickerTrashShortcut");

const pickerPinShortcutEl = document.querySelector("#pickerPinShortcut");

const commandPaletteShortcutEl = document.querySelector("#commandPaletteShortcut");

const rediscoverEnabledEl = document.querySelector("#rediscoverEnabled");

const rediscoverIntervalEl = document.querySelector("#rediscoverInterval");

const rediscoverIntervalUnitEl = document.querySelector("#rediscoverIntervalUnit");

const rediscoverDismissAfterEl = document.querySelector("#rediscoverDismissAfter");

const rediscoverModeRadios = document.querySelectorAll('input[name="rediscoverMode"]');

const rediscoverResetCursorBtn = document.querySelector("#rediscoverResetCursor");

const rediscoverColorEl = document.querySelector("#rediscoverColor");

let _lastRediscoverUnit = "jam";



const saveSettingsBtn = document.querySelector("#saveSettings");

const saveStatusEl = document.querySelector("#saveStatus");

const exportBackupBtn = document.querySelector("#exportBackup");

const importBackupBtn = document.querySelector("#importBackup");

const backupFileEl = document.querySelector("#backupFile");

const backupStatusEl = document.querySelector("#backupStatus");

const backupProgressEl = document.querySelector("#backupProgress");

const shortcutInputs = Array.from(document.querySelectorAll(".shortcut input[data-command]"));

const shortcutClearButtons = Array.from(document.querySelectorAll(".shortcut button[data-command]"));

const shortcutStatus = document.querySelector("#shortcutStatus");

const showHiddenCategoriesEl = document.querySelector("#showHiddenCategories");

const categoryVisibilityList = document.querySelector("#categoryVisibilityList");

const toggleCategoryListBtn = document.querySelector("#toggleCategoryList");

const categoryPager = document.querySelector("#categoryPager");

const prevCategoryPageBtn = document.querySelector("#prevCategoryPage");

const nextCategoryPageBtn = document.querySelector("#nextCategoryPage");

const categoryPageLabel = document.querySelector("#categoryPageLabel");

const categoryListContainer = document.querySelector("#categoryListContainer");

const keyboardShortcutRows = Array.from(document.querySelectorAll(".keyboard-shortcut"));

const toggleKeyboardListBtn = document.querySelector("#toggleKeyboardList");

const keyboardPager = document.querySelector("#keyboardPager");

const prevKeyboardPageBtn = document.querySelector("#prevKeyboardPage");

const nextKeyboardPageBtn = document.querySelector("#nextKeyboardPage");

const keyboardPageLabel = document.querySelector("#keyboardPageLabel");

const keyboardListContainer = document.querySelector("#keyboardListContainer");

const keyboardListEl = document.querySelector("#keyboardList");

const resetFloatingPositionBtn = document.querySelector("#resetFloatingPosition");

const openShortcutManagerBtn = document.querySelector("#openShortcutManager");

const pickerPageShortcutInputs = [

  pickerToggleDeleteAfterOpenShortcutEl,

  pickerToggleShowHiddenShortcutEl,

  pickerImportShortcutEl,

  pickerExportShortcutEl,

  pickerClearFavShortcutEl,

  pickerRestoreFavShortcutEl,

  pickerAutoNextShortcutEl,

  pickerAutoRandomShortcutEl,

  pickerSelectPageShortcutEl,

  pickerClearSelectionShortcutEl,

  pickerBulkDeleteShortcutEl,

  pickerBulkFavShortcutEl,

  pickerRenameCategoryShortcutEl,

  pickerScanDupShortcutEl,

  pickerFavShortcutEl,

  pickerToggleFavShortcutEl,

  pickerTrashShortcutEl,

    pickerPinShortcutEl,

    commandPaletteShortcutEl

  ].filter(Boolean);



let listeningInput = null;

let pendingSettings = { ...DEFAULT_SETTINGS };

let dirty = false;

let autoSaveTimer = null;

const AUTO_SAVE_DELAY = 1000; // 1 second

// Flag lazy-init: dropdown modifier belum dibina sehingga section "Quick Save" dibuka

let _lpLinkSaveDropdownsReady = false;

const CATEGORY_PAGE_SIZE = 5;

const KEYBOARD_PAGE_SIZE = 5;

let categoryPage = 1;

let categoryListHidden = false;

let totalCategoryPages = 1;

let keyboardPage = 1;

let keyboardListHidden = false;

let totalKeyboardPages = 1;

let shortcutUpdateInFlight = false;

let customFloatingIconDataUrl = "";

let customFloatingIcons = [];

let customHoverSoundDataUrl = "";

let customHoverSounds = [];

const MAX_CUSTOM_ICON_SLOTS = 10;

const MAX_CUSTOM_ICON_BYTES = 20 * 1024 * 1024; // ~20MB total to avoid storage quota issues

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2MB per icon

const MAX_HOVER_SOUND_BYTES = 400 * 1024; // 400 KB limit to keep storage light

const themeCore = typeof LocalPocketThemeCore !== "undefined" ? LocalPocketThemeCore : null;

const importCore = typeof LocalPocketImportCore !== "undefined" ? LocalPocketImportCore : null;

const settingsCore = typeof LocalPocketSettingsCore !== "undefined"

  ? LocalPocketSettingsCore

  : null;

const OPTION_LINK_SAVE_MODIFIER_COMBOS = settingsCore && Array.isArray(settingsCore.LINK_SAVE_MODIFIER_COMBOS)

  ? settingsCore.LINK_SAVE_MODIFIER_COMBOS.slice()

  : ["ctrl+alt", "ctrl+shift", "alt+shift", "alt"];

const SYMBOL_TRIGGER_KEYS = ["`", "-", "=", "[", "]", "\\", ";", "'", ",", ".", "/"];

const SPECIAL_TRIGGER_KEYS = [

  "Space",

  "Enter",

  "Tab",

  "Esc",

  "Backspace",

  "Delete",

  "Insert",

  "Home",

  "End",

  "PageUp",

  "PageDown",

  "Left",

  "Right",

  "Up",

  "Down",

  "CapsLock",

  "NumLock",

  "ScrollLock",

  "Pause",

  "PrintScreen",

  "Menu"

];





// Load saved gesture pattern from settings and render preview

function applyGestureSettings(settings) {

  if (!settings) return;

  // Simpan untuk backward compat (customGesturePattern sistem lama)

  gestureSavedPattern = Array.isArray(settings.customGesturePattern) ? settings.customGesturePattern : [];

}





const OPTION_LINK_SAVE_TRIGGER_GROUPS = [

  {

    label: "Modifier combos",

    values: OPTION_LINK_SAVE_MODIFIER_COMBOS

  },

  {

    label: "Letters",

    values: Array.from({ length: 26 }, (_entry, index) => String.fromCharCode(65 + index))

  },

  {

    label: "Numbers",

    values: Array.from({ length: 10 }, (_entry, index) => String(index))

  },

  {

    label: "Symbols",

    values: SYMBOL_TRIGGER_KEYS

  },

  {

    label: "Navigation keys",

    values: SPECIAL_TRIGGER_KEYS

  },

  {

    label: "Function keys",

    values: Array.from({ length: 24 }, (_entry, index) => `F${index + 1}`)

  }

];



function fallbackNormalizeLinkSaveKeyboardKey(value) {

  const raw = typeof value === "string" ? value.trim() : "";

  if (!raw) return "";

  const aliases = {

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

    menu: "Menu"

  };

  const alias = aliases[raw.toLowerCase()];

  if (alias) return alias;

  if (/^F\d{1,2}$/i.test(raw)) {

    const fn = Number.parseInt(raw.slice(1), 10);

    return Number.isFinite(fn) && fn >= 1 && fn <= 24 ? `F${fn}` : "";

  }

  if (raw.length === 1) return raw.toUpperCase();

  return "";

}



function normalizeLinkSaveTriggerSetting(value) {

  if (settingsCore && typeof settingsCore.normalizeLinkSaveTriggerValue === "function") {

    return settingsCore.normalizeLinkSaveTriggerValue(value);

  }

  const combo = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (OPTION_LINK_SAVE_MODIFIER_COMBOS.includes(combo)) return combo;

  const key = fallbackNormalizeLinkSaveKeyboardKey(value);

  return key || DEFAULT_SETTINGS.linkSaveModifierCombo;

}



function formatLinkSaveTriggerLabel(value) {

  const raw = typeof value === "string" ? value.trim() : "";

  if (!raw) return "";

  if (raw.includes("+")) {

    return raw

      .split("+")

      .map((part) => {

        if (part === "ctrl") return "Ctrl";

        if (part === "alt") return "Alt";

        if (part === "shift") return "Shift";

        if (part === "meta") return "Command / Meta";

        return part;

      })

      .join(" + ");

  }

  const labels = {

    Space: "Space",

    Enter: "Enter",

    Tab: "Tab",

    Esc: "Esc",

    Backspace: "Backspace",

    Delete: "Delete",

    Insert: "Insert",

    Home: "Home",

    End: "End",

    PageUp: "Page Up",

    PageDown: "Page Down",

    Left: "Arrow Left",

    Right: "Arrow Right",

    Up: "Arrow Up",

    Down: "Arrow Down",

    CapsLock: "Caps Lock",

    NumLock: "Num Lock",

    ScrollLock: "Scroll Lock",

    Pause: "Pause",

    PrintScreen: "Print Screen",

    Menu: "Menu",

    "`": "Backtick (`)",

    "-": "Minus (-)",

    "=": "Equals (=)",

    "[": "Left Bracket ([)",

    "]": "Right Bracket (])",

    "\\": "Backslash (\\)",

    ";": "Semicolon (;)",

    "'": "Apostrophe (')",

    ",": "Comma (,)",

    ".": "Period (.)",

    "/": "Slash (/)"

  };

  return labels[raw] || raw;

}



function populateDropdownWithOptions(selectEl, selectedValue, includeNone = false) {

  if (!selectEl) return;

  selectEl.replaceChildren();

  const seen = new Set();

  

  if (includeNone) {

    const option = document.createElement("option");

    option.value = "";

    option.textContent = "Tiada (sentiasa kumpul)";

    selectEl.appendChild(option);

    seen.add("");

  }



  OPTION_LINK_SAVE_TRIGGER_GROUPS.forEach((group) => {

    const optgroup = document.createElement("optgroup");

    optgroup.label = group.label;

    group.values.forEach((value) => {

      const normalized = normalizeLinkSaveTriggerSetting(value);

      if (!normalized || seen.has(normalized)) return;

      seen.add(normalized);

      const option = document.createElement("option");

      option.value = normalized;

      option.textContent = formatLinkSaveTriggerLabel(normalized);

      optgroup.appendChild(option);

    });

    if (optgroup.children.length) {

      selectEl.appendChild(optgroup);

    }

  });

  if (!seen.has(selectedValue)) {

    const fallbackGroup = document.createElement("optgroup");

    fallbackGroup.label = "Current value";

    const option = document.createElement("option");

    option.value = selectedValue;

    option.textContent = formatLinkSaveTriggerLabel(selectedValue);

    fallbackGroup.appendChild(option);

    selectEl.appendChild(fallbackGroup);

  }

  selectEl.value = selectedValue;

}



function populateLinkSaveModifierOptions() {

  const selectedValue = normalizeLinkSaveTriggerSetting(

    (pendingSettings && pendingSettings.linkSaveModifierCombo) || DEFAULT_SETTINGS.linkSaveModifierCombo

  );

  populateDropdownWithOptions(linkSaveModifierComboEl, selectedValue, false);

}



function populateBundleModifierOptions() {

  const selectedValue = (pendingSettings && pendingSettings.linkSaveBundleModifier) || "";

  populateDropdownWithOptions(linkSaveBundleModifierEl, selectedValue, true);

}



function populateDirectModifierOptions() {

  const selectedValue = (pendingSettings && pendingSettings.linkSaveDirectModifier) || "";

  populateDropdownWithOptions(linkSaveDirectModifierEl, selectedValue, true);

}



function populateActiveCategoryModifierOptions() {

  const selectedValue = (pendingSettings && pendingSettings.linkSaveActiveCategoryModifier) || "";

  populateDropdownWithOptions(linkSaveActiveCategoryModifierEl, selectedValue, true);

}



function normalizeThemePresetValue(value) {

  if (themeCore && typeof themeCore.normalizeThemePreset === "function") {

    return themeCore.normalizeThemePreset(value);

  }

  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (["ocean", "sunset", "modern", "minimal", "cyber", "forest", "pastel", "mono", "oled", "sepia", "retro"].includes(raw)) return raw;

  return "classic";

}



function normalizeSidebarAiProviderValue(value) {

  if (typeof normalizeSidebarAiProvider === "function") {

    return normalizeSidebarAiProvider(value);

  }

  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (["claude", "gemini", "perplexity", "copilot", "grok", "deepseek", "poe", "mistral"].includes(raw)) {

    return raw;

  }

  return "chatgpt";

}



function normalizeFloatingIconValue(value) {

  const raw = typeof value === "string" ? value.trim() : "";

  if (raw.startsWith("data:")) return raw;

  if (raw.startsWith("custom:")) return raw;

  const found = FLOATING_ICON_CHOICES.find((opt) => opt.value === raw);

  return found ? found.value : FLOATING_ICON_CHOICES[0].value;

}



function populateFloatingIconOptions() {

  if (!floatingButtonIconEl) return;

  floatingButtonIconEl.replaceChildren();

  [...FLOATING_ICON_CHOICES, ...customFloatingIcons.map((c) => ({

    value: `custom:${c.id}`,

    label: c.label || "Custom"

  }))].forEach((opt) => {

    const option = document.createElement("option");

    option.value = opt.value;

    option.textContent = opt.label;

    floatingButtonIconEl.appendChild(option);

  });

}



function updateFloatingIconPreview(value) {

  if (!floatingButtonIconPreviewEl) return;

  const normalized = normalizeFloatingIconValue(value);

  let resolved = "";

  if (normalized.startsWith("data:")) {

    resolved = normalized;

  } else if (normalized === "custom" && customFloatingIconDataUrl) {

    resolved = customFloatingIconDataUrl;

  } else if (normalized.startsWith("custom:")) {

    const id = normalized.slice("custom:".length);

    const entry = customFloatingIcons.find((c) => c && c.id === id);

    if (entry && entry.dataUrl) {

      resolved = entry.dataUrl;

    }

  } else {

    const fallback = FLOATING_ICON_CHOICES[0].value;

    const chosen = normalized === "custom" ? fallback : normalized;

    resolved = typeof api !== "undefined" && api.runtime && api.runtime.getURL

      ? api.runtime.getURL(`icons/${chosen}`)

      : `icons/${chosen}`;

  }

  floatingButtonIconPreviewEl.src = resolved;

  floatingButtonIconPreviewEl.alt = `Floating button ${normalized.startsWith("data:") ? "custom" : normalized}`;

}



const CUSTOM_COLOR_MAP = [

  { id: "customBg", css: "--bg", key: "bg" },

  { id: "customBgAlt", css: "--bg-alt", key: "bgAlt" },

  { id: "customPanel", css: "--panel", key: "panel" },

  { id: "customPanelAlt", css: "--panel-alt", key: "panelAlt" },

  { id: "customInk", css: "--ink", key: "ink" },

  { id: "customMuted", css: "--muted", key: "muted" },

  { id: "customAccent", css: "--accent", key: "accent" },

  { id: "customAccent2", css: "--accent-2", key: "accent2" },

  { id: "customAccent3", css: "--accent-3", key: "accent3" },

  { id: "customAccent4", css: "--accent-4", key: "accent4" },

  { id: "customBorder", css: "--border", key: "border" },

];



function applyCustomThemeVars(colors) {

  const root = document.documentElement;

  CUSTOM_COLOR_MAP.forEach(({ css, key }) => {

    if (colors && colors[key]) {

      root.style.setProperty(css, colors[key]);

    }

  });

}



function populateCustomColorPickers(colors) {

  const map = {

    customBg: "bg", customBgAlt: "bgAlt", customPanel: "panel",

    customPanelAlt: "panelAlt", customInk: "ink", customMuted: "muted",

    customAccent: "accent", customAccent2: "accent2", customAccent3: "accent3",

    customAccent4: "accent4", customBorder: "border"

  };

  const els = {

    customBg: customBgEl, customBgAlt: customBgAltEl, customPanel: customPanelEl,

    customPanelAlt: customPanelAltEl, customInk: customInkEl, customMuted: customMutedEl,

    customAccent: customAccentEl, customAccent2: customAccent2El, customAccent3: customAccent3El,

    customAccent4: customAccent4El, customBorder: customBorderEl

  };

  Object.entries(map).forEach(([elId, key]) => {

    const el = els[elId];

    if (el && colors && colors[key]) {

      el.value = colors[key];

    }

  });

}



function readCustomColorsFromPickers() {

  const result = {};

  const els = {

    bg: customBgEl, bgAlt: customBgAltEl, panel: customPanelEl,

    panelAlt: customPanelAltEl, ink: customInkEl, muted: customMutedEl,

    accent: customAccentEl, accent2: customAccent2El, accent3: customAccent3El,

    accent4: customAccent4El, border: customBorderEl

  };

  Object.entries(els).forEach(([key, el]) => {

    if (el) result[key] = el.value;

  });

  return result;

}



function toggleCustomThemeSection(show) {

  if (customThemeSection) {

    customThemeSection.hidden = !show;

  }

}



function applyThemePreset(value) {

  const theme = normalizeThemePresetValue(value);

  if (themeCore && typeof themeCore.applyThemePresetToDocument === "function") {

    themeCore.applyThemePresetToDocument(document, value);

  } else {

    document.documentElement.setAttribute("data-theme", theme);

  }

  if (themePresetEl) themePresetEl.value = theme;

  if (theme === "custom") {

    const saved = readCustomColorsFromPickers();

    applyCustomThemeVars(saved);

  }

  toggleCustomThemeSection(theme === "custom");

}



function collectSettings(textContent) {

  const lines = String(textContent || "").split("\n");

  const parsed = [];

  const seen = new Set();

  lines.forEach((line) => {

    const raw = line ? line.trim() : "";

    if (!raw || raw.startsWith("#")) return;

    const separator = raw.includes("=>") ? "=>" : (raw.includes("->") ? "->" : "");

    if (!separator) return;

    const parts = raw.split(separator);

    if (parts.length < 2) return;

    const pattern = parts[0] ? parts[0].trim() : "";

    const category = parts.slice(1).join(separator).trim();

    if (!pattern || !category) return;

    const key = `${pattern.toLowerCase()}=>${category.toLowerCase()}`;

    if (seen.has(key)) return;

    seen.add(key);

    parsed.push({ pattern, category });

  });

  return parsed.slice(0, 100);

}



function applySettings(settings) {

  showBadgeEl.checked = !!settings.showBadge;

  showPageActionEl.checked = !!settings.showPageAction;

  if (enableCategoryPickerEl) enableCategoryPickerEl.checked = settings.enableCategoryPicker !== false;

  if (enableDedupeButtonEl) enableDedupeButtonEl.checked = settings.enableDedupeButton !== false;

  deleteAfterOpenEl.checked = !!settings.deleteAfterOpen;

  if (globalLinkInBackgroundTabEl) globalLinkInBackgroundTabEl.checked = settings.globalLinkInBackgroundTab !== false;

  if (randomAcrossAllCategoriesEl) randomAcrossAllCategoriesEl.checked = settings.randomAcrossAllCategories === true;

  if (contextMenuSaveToUncategorizedEl) {

    contextMenuSaveToUncategorizedEl.checked = settings.contextMenuSaveToUncategorized === true;

  }

  cycleIncludeAllEl.checked = settings.cycleIncludeAll !== false;

  cycleIncludeUncategorizedEl.checked = settings.cycleIncludeUncategorized !== false;

  zoomLevelEl.value = settings.zoomLevel || "md";

  pageSizeEl.value = String(settings.pageSize || 10);

  if (pickerAnimationEl) pickerAnimationEl.value = settings.pickerAnimation || "fade";

  if (pickerAnimationDurationEl) pickerAnimationDurationEl.value = String(settings.pickerAnimationDuration || 200);

  if (pickerStartModeEl) {

    const startMode = settings.pickerStartMode || "home";

    // Normalize legacy "last" to "last-category"

    const normalizedMode = (startMode === "last") ? "last-category" : startMode;

    pickerStartModeEl.value = ["home", "last-category", "last-page", "last-link"].includes(normalizedMode)

      ? normalizedMode

      : "home";

  }

  if (pickerHighlightColorEl) {

    const color = typeof settings.pickerHighlightColor === "string" && /^#[0-9a-f]{6}$/i.test(settings.pickerHighlightColor)

      ? settings.pickerHighlightColor

      : DEFAULT_SETTINGS.pickerHighlightColor;

    pickerHighlightColorEl.value = color;

  }

  if (notesStartModeEl) notesStartModeEl.value = settings.notesStartMode === "last" ? "last" : "home";

  if (pickerLayoutEl) pickerLayoutEl.value = settings.pickerLayout === "compact" ? "compact" : "cozy";

  if (pickerYoutubeThumbnailsEl) pickerYoutubeThumbnailsEl.checked = settings.pickerYoutubeThumbnails !== false;

  if (trashLimitEl) trashLimitEl.value = typeof settings.trashLimit === "number" ? settings.trashLimit : 0;

  if (pickerHoverSoundEl) pickerHoverSoundEl.checked = settings.pickerHoverSound === true;

  customHoverSounds = Array.isArray(settings.pickerHoverSounds) ? settings.pickerHoverSounds.slice(0, 10) : [];

  const activeSoundId = settings.activePickerHoverSoundId || "";

  renderHoverSoundOptions(activeSoundId);

  applyThemePreset(settings.themePreset || "classic");

  if (settings.customThemeColors) {

    populateCustomColorPickers(settings.customThemeColors);

    if ((settings.themePreset || "classic") === "custom") {

      applyCustomThemeVars(settings.customThemeColors);

    }

  }

  if (sidebarAiEnabledEl) {

    sidebarAiEnabledEl.checked = settings.sidebarAiEnabled !== false;

  }

  if (sidebarAiProviderEl) {

    sidebarAiProviderEl.value = normalizeSidebarAiProviderValue(settings.sidebarAiProvider);

  }

  if (aiModeEl) {

    aiModeEl.value = settings.aiMode === "overlay" ? "overlay" : "sidebar";

  }

  if (sidebarFocusF6DelayMsEl) {

    sidebarFocusF6DelayMsEl.value = String(

      typeof settings.sidebarFocusF6DelayMs === "number"

        ? settings.sidebarFocusF6DelayMs

        : DEFAULT_SETTINGS.sidebarFocusF6DelayMs,

    );

  }

  if (sidebarNativeFocusHelperEnabledEl) {

    sidebarNativeFocusHelperEnabledEl.checked = settings.sidebarNativeFocusHelperEnabled !== false;

  }

  if (summaryCustomPromptEl) {

    summaryCustomPromptEl.value = typeof settings.summaryCustomPrompt === "string" ? settings.summaryCustomPrompt : "";

  }

  if (summaryOutputLanguageEl) {

    summaryOutputLanguageEl.value = typeof settings.summaryOutputLanguage === "string" ? settings.summaryOutputLanguage : "ms";

  }

  if (summaryToneEl) {

    summaryToneEl.value = typeof settings.summaryTone === "string" ? settings.summaryTone : "neutral";

  }

  if (summaryMaxWordsEl) {

    const maxWords = Number.isFinite(settings.summaryMaxWords) ? settings.summaryMaxWords : 0;

    summaryMaxWordsEl.value = String(maxWords);

  }

  if (summaryOpenModeEl) {

    summaryOpenModeEl.value = ["sidebar", "overlay", "native-sidebar"].includes(settings.summaryOpenMode) ? settings.summaryOpenMode : "sidebar";

  }

  closeOnSaveEl.checked = !!settings.closeOnSave;

  closeOnSaveAllTabsEl.checked = !!settings.closeOnSaveAllTabs;

  floatingButtonEnabledEl.checked = settings.floatingButtonEnabled !== false;

  if (floatingAiSelectionEnabledEl) floatingAiSelectionEnabledEl.checked = settings.floatingAiSelectionEnabled !== false;

  if (longPressGestureEnabledEl) longPressGestureEnabledEl.checked = settings.longPressGestureEnabled !== false;

  if (floatingButtonAutoSuspendTabThresholdEl) {

    floatingButtonAutoSuspendTabThresholdEl.value = String(

      typeof settings.floatingButtonAutoSuspendTabThreshold === "number"

        ? settings.floatingButtonAutoSuspendTabThreshold

        : DEFAULT_SETTINGS.floatingButtonAutoSuspendTabThreshold,

    );

  }

  updateFloatingButtonAutoSuspendStatus(settings);

  if (floatingButtonVisibilityModeEl) {

    floatingButtonVisibilityModeEl.value = ["hover", "always", "scroll", "click", "longpress"].includes(settings.floatingButtonVisibilityMode) ? settings.floatingButtonVisibilityMode : "hover";

  }

  if (miniCategoryTriggerDirectionEl) {

    miniCategoryTriggerDirectionEl.value = ["right", "left", "up", "down"].includes(settings.miniCategoryTriggerDirection) ? settings.miniCategoryTriggerDirection : "right";

  }

  if (miniCategoryPanelLayoutEl) {

    miniCategoryPanelLayoutEl.value = ["list", "grid", "horizontal", "radial", "wheel"].includes(settings.miniCategoryPanelLayout) ? settings.miniCategoryPanelLayout : "list";

  }

  if (floatingButtonLongPressDurationEl) {

    const floatingLongPressDuration =

      typeof settings.floatingButtonLongPressDuration === "number"

        ? settings.floatingButtonLongPressDuration

        : DEFAULT_SETTINGS.floatingButtonLongPressDuration;

    floatingButtonLongPressDurationEl.value = String(floatingLongPressDuration);

  }

  if (floatingButtonCategoryPickerLongPressDurationEl) {

    const categoryPickerLongPressDuration =

      typeof settings.floatingButtonCategoryPickerLongPressDuration === "number"

        ? settings.floatingButtonCategoryPickerLongPressDuration

        : DEFAULT_SETTINGS.floatingButtonCategoryPickerLongPressDuration;

    floatingButtonCategoryPickerLongPressDurationEl.value = String(categoryPickerLongPressDuration);

  }

  if (floatingButtonLongPressSwapEl) floatingButtonLongPressSwapEl.checked = settings.floatingButtonLongPressSwap === true;

  if (categoryPickerMouseGestureEl) categoryPickerMouseGestureEl.checked = settings.categoryPickerMouseGesture === true;

  if (blockPickerOnTextCursorEl) blockPickerOnTextCursorEl.checked = settings.blockPickerOnTextCursor !== false;

  applyGestureSettings(settings);



  if (floatingSubButtonSizeEl) {

    floatingSubButtonSizeEl.value = String(settings.floatingSubButtonSize || 32);

  }

  if (floatingNextUpLabelEl) floatingNextUpLabelEl.checked = settings.floatingNextUpLabel !== false;

  if (floatingNextUpMaxWidthEl) floatingNextUpMaxWidthEl.value = String(settings.floatingNextUpMaxWidth || 220);

  const sensitivityValue = typeof settings.floatingButtonSensitivity !== "undefined"

    ? settings.floatingButtonSensitivity

    : settings.floatingButtonShowTime;

  if (floatingButtonSensitivityEl) floatingButtonSensitivityEl.value = String(sensitivityValue || 150);

  if (floatingButtonHideTimeEl) floatingButtonHideTimeEl.value = String(settings.floatingButtonHideTime || 100);

  floatingButtonAnimationEl.value = settings.floatingButtonAnimation || "fade";

  // position is managed by drag; no UI element to set

  if (ctrlAltLinkSaveEnabledEl) ctrlAltLinkSaveEnabledEl.checked = settings.ctrlAltLinkSaveEnabled === true;

  if (linkSaveModifierComboEl) {

    const selected = normalizeLinkSaveTriggerSetting(settings.linkSaveModifierCombo || "ctrl+alt");

    // Populat dropdown hanya jika sudah diinit (lazy init) — elak bina ~240 option semasa page load

    if (_lpLinkSaveDropdownsReady) {

      populateLinkSaveModifierOptions();

      linkSaveModifierComboEl.value = selected;

    } else {

      // Simpan nilai — akan diapply oleh _ensureLinkSaveDropdowns bila section dibuka

      linkSaveModifierComboEl.dataset.pendingValue = selected;

    }

  }

  if (linkSaveBundleModifierEl) {

    if (_lpLinkSaveDropdownsReady) {

      populateBundleModifierOptions();

      linkSaveBundleModifierEl.value = settings.linkSaveBundleModifier || "";

    } else {

      linkSaveBundleModifierEl.dataset.pendingValue = settings.linkSaveBundleModifier || "";

    }

  }

  if (linkSaveBundleDurationEl) {

    linkSaveBundleDurationEl.value = String(settings.linkSaveBundleDuration ?? 3);

  }

  if (linkSaveDirectModifierEl) {

    if (_lpLinkSaveDropdownsReady) {

      populateDirectModifierOptions();

      linkSaveDirectModifierEl.value = settings.linkSaveDirectModifier || "";

    } else {

      linkSaveDirectModifierEl.dataset.pendingValue = settings.linkSaveDirectModifier || "";

    }

  }

  if (linkSaveActiveCategoryModifierEl) {

    if (_lpLinkSaveDropdownsReady) {

      populateActiveCategoryModifierOptions();

      linkSaveActiveCategoryModifierEl.value = settings.linkSaveActiveCategoryModifier || "";

    } else {

      linkSaveActiveCategoryModifierEl.dataset.pendingValue = settings.linkSaveActiveCategoryModifier || "";

    }

  }

  if (linkSaveMouseButtonEl) linkSaveMouseButtonEl.value = settings.linkSaveMouseButton || "left";

  if (linkSavePromptCategoryEnabledEl) {

    linkSavePromptCategoryEnabledEl.checked = settings.linkSavePromptCategoryEnabled === true;

  }

  customFloatingIcons = Array.isArray(settings.floatingButtonCustomIcons) ? settings.floatingButtonCustomIcons.slice(0, 10) : [];

  populateFloatingIconOptions();

  if (floatingButtonIconEl) {

    const icon = settings.floatingButtonIcon || FLOATING_ICON_CHOICES[0].value;

    if (icon.startsWith("custom:")) {

      floatingButtonIconEl.value = icon;

      customFloatingIconDataUrl = "";

    } else if (icon.startsWith("data:")) {

      customFloatingIconDataUrl = icon;

      floatingButtonIconEl.value = "custom";

    } else {

      customFloatingIconDataUrl = "";

      floatingButtonIconEl.value = normalizeFloatingIconValue(icon);

    }

    updateFloatingIconPreview(icon);

  }

  if (floatingButtonShowAnimDurationEl) floatingButtonShowAnimDurationEl.value = String(settings.floatingButtonShowAnimDuration || 200);

  if (floatingButtonHideAnimDurationEl) floatingButtonHideAnimDurationEl.value = String(settings.floatingButtonHideAnimDuration || 100);

  if (floatingButtonDomainExceptionsEl) {

    const list = Array.isArray(settings.floatingButtonDomainExceptions)

      ? settings.floatingButtonDomainExceptions

      : [];

    floatingButtonDomainExceptionsEl.value = list.join("\n");

  }

  if (showHiddenCategoriesEl) showHiddenCategoriesEl.checked = !!settings.showHiddenCategories;

  if (categoryPaletteShortcutEl) {

    categoryPaletteShortcutEl.value = (settings.categoryPaletteShortcut || DEFAULT_SETTINGS.categoryPaletteShortcut || "M").trim();

  }

  if (pickerToggleDeleteAfterOpenShortcutEl) {

    pickerToggleDeleteAfterOpenShortcutEl.value = typeof settings.pickerToggleDeleteAfterOpenShortcut === "string"

      ? settings.pickerToggleDeleteAfterOpenShortcut.trim()

      : "";

  }

  if (pickerToggleShowHiddenShortcutEl) {

    pickerToggleShowHiddenShortcutEl.value = typeof settings.pickerToggleShowHiddenShortcut === "string"

      ? settings.pickerToggleShowHiddenShortcut.trim()

      : "";

  }

  if (commandPaletteShortcutEl) {

    commandPaletteShortcutEl.value = typeof settings.commandPaletteShortcut === "string"

      ? settings.commandPaletteShortcut.trim()

      : "Ctrl+K";

  }

  const _pickerShortcuts = {

    pickerImportShortcut: pickerImportShortcutEl,

    pickerExportShortcut: pickerExportShortcutEl,

    pickerClearFavShortcut: pickerClearFavShortcutEl,

    pickerRestoreFavShortcut: pickerRestoreFavShortcutEl,

    pickerAutoNextShortcut: pickerAutoNextShortcutEl,

    pickerAutoRandomShortcut: pickerAutoRandomShortcutEl,

    pickerSelectPageShortcut: pickerSelectPageShortcutEl,

    pickerClearSelectionShortcut: pickerClearSelectionShortcutEl,

    pickerBulkDeleteShortcut: pickerBulkDeleteShortcutEl,

    pickerBulkFavShortcut: pickerBulkFavShortcutEl,

    pickerRenameCategoryShortcut: pickerRenameCategoryShortcutEl,

    pickerScanDupShortcut: pickerScanDupShortcutEl,

    pickerFavShortcut: pickerFavShortcutEl,

    pickerToggleFavShortcut: pickerToggleFavShortcutEl,

    pickerTrashShortcut: pickerTrashShortcutEl,

    pickerPinShortcut: pickerPinShortcutEl

  };

  for (const [key, el] of Object.entries(_pickerShortcuts)) {

    if (el) el.value = typeof settings[key] === "string" ? settings[key].trim() : "";

  }

  if (rediscoverEnabledEl) rediscoverEnabledEl.checked = settings.rediscoverEnabled === true;

  if (rediscoverIntervalEl) {

    const intervalSecs = typeof settings.rediscoverInterval === "number" ? settings.rediscoverInterval : 86400;

    if (rediscoverIntervalUnitEl) {

      if (intervalSecs >= 3600 && intervalSecs % 3600 === 0) {

        rediscoverIntervalEl.value = String(intervalSecs / 3600);

        rediscoverIntervalUnitEl.value = "jam";

      } else if (intervalSecs >= 60 && intervalSecs % 60 === 0) {

        rediscoverIntervalEl.value = String(intervalSecs / 60);

        rediscoverIntervalUnitEl.value = "minit";

      } else {

        rediscoverIntervalEl.value = String(intervalSecs);

        rediscoverIntervalUnitEl.value = "saat";

      }

      _lastRediscoverUnit = rediscoverIntervalUnitEl.value;

    } else {

      rediscoverIntervalEl.value = String(Math.round(intervalSecs / 60));

    }

  }

  if (rediscoverDismissAfterEl) {

    rediscoverDismissAfterEl.value = String(typeof settings.rediscoverDismissAfterMs === "number" ? settings.rediscoverDismissAfterMs : 8000);

  }

  const mode = settings.rediscoverMode === "random" ? "random" : "sequential";

  rediscoverModeRadios.forEach((radio) => {

    if (radio.value === mode) radio.checked = true;

  });

  if (rediscoverColorEl) {

    rediscoverColorEl.value = typeof settings.rediscoverColor === "string" && settings.rediscoverColor

      ? settings.rediscoverColor

      : "#8b5cf6";

  }

}



function readFormSettings() {

  const parsedSensitivity = (() => {

    const raw = floatingButtonSensitivityEl ? floatingButtonSensitivityEl.value : "150";

    const parsed = Number.parseInt(raw, 10);

    return Number.isFinite(parsed) ? parsed : 150;

  })();

  return {

    showBadge: !!showBadgeEl.checked,

    showPageAction: !!showPageActionEl.checked,

    enableCategoryPicker: !!(enableCategoryPickerEl && enableCategoryPickerEl.checked),

    enableDedupeButton: !!(enableDedupeButtonEl && enableDedupeButtonEl.checked),

    deleteAfterOpen: !!deleteAfterOpenEl.checked,

    globalLinkInBackgroundTab: !!(globalLinkInBackgroundTabEl && globalLinkInBackgroundTabEl.checked),

    randomAcrossAllCategories: !!(randomAcrossAllCategoriesEl && randomAcrossAllCategoriesEl.checked),

    contextMenuSaveToUncategorized: !!(contextMenuSaveToUncategorizedEl && contextMenuSaveToUncategorizedEl.checked),

    cycleIncludeAll: !!cycleIncludeAllEl.checked,

    cycleIncludeUncategorized: !!cycleIncludeUncategorizedEl.checked,

    zoomLevel: zoomLevelEl.value || "md",

    pageSize: Number.parseInt(pageSizeEl.value, 10) || 10,

    pickerAnimation: pickerAnimationEl ? (pickerAnimationEl.value || "fade") : "fade",

    pickerAnimationDuration: Number.parseInt(pickerAnimationDurationEl ? pickerAnimationDurationEl.value : "200", 10) || 200,

    pickerStartMode: pickerStartModeEl ? pickerStartModeEl.value : "home",

    pickerHighlightColor: pickerHighlightColorEl ? pickerHighlightColorEl.value : DEFAULT_SETTINGS.pickerHighlightColor,

    notesStartMode: notesStartModeEl ? notesStartModeEl.value : "home",

    pickerLayout: pickerLayoutEl ? pickerLayoutEl.value : DEFAULT_SETTINGS.pickerLayout,

    pickerYoutubeThumbnails: !!(pickerYoutubeThumbnailsEl && pickerYoutubeThumbnailsEl.checked),

    trashLimit: Number.parseInt(trashLimitEl ? trashLimitEl.value : "0", 10) || 0,

    floatingNextUpLabel: !!(floatingNextUpLabelEl && floatingNextUpLabelEl.checked),

    floatingNextUpMaxWidth: Number.parseInt(floatingNextUpMaxWidthEl ? floatingNextUpMaxWidthEl.value : "220", 10) || 220,

    pickerHoverSound: !!(pickerHoverSoundEl && pickerHoverSoundEl.checked),

    pickerHoverSounds: customHoverSounds.slice(0, 10),

    activePickerHoverSoundId: hoverSoundSelectEl ? hoverSoundSelectEl.value : "",

    themePreset: normalizeThemePresetValue(themePresetEl ? themePresetEl.value : "classic"),

    customThemeColors: readCustomColorsFromPickers(),

    sidebarAiEnabled: !!(sidebarAiEnabledEl && sidebarAiEnabledEl.checked),

    sidebarAiProvider: normalizeSidebarAiProviderValue(sidebarAiProviderEl ? sidebarAiProviderEl.value : "chatgpt"),

    aiMode: aiModeEl ? aiModeEl.value : "sidebar",

    summaryDeliveryMode: "sidebar",

    sidebarFocusF6DelayMs: sidebarFocusF6DelayMsEl

      ? (Number.parseInt(sidebarFocusF6DelayMsEl.value, 10) || 0)

      : DEFAULT_SETTINGS.sidebarFocusF6DelayMs,

    sidebarNativeFocusHelperEnabled: !!(sidebarNativeFocusHelperEnabledEl && sidebarNativeFocusHelperEnabledEl.checked),

    summaryCustomPrompt: summaryCustomPromptEl ? summaryCustomPromptEl.value.trim() : "",

    summaryOutputLanguage: summaryOutputLanguageEl ? summaryOutputLanguageEl.value : "ms",

    summaryTone: summaryToneEl ? summaryToneEl.value : "neutral",

    summaryMaxWords: summaryMaxWordsEl

      ? (Number.parseInt(summaryMaxWordsEl.value, 10) || 0)

      : DEFAULT_SETTINGS.summaryMaxWords,

    summaryOpenMode: summaryOpenModeEl

      ? (["sidebar", "overlay", "native-sidebar"].includes(summaryOpenModeEl.value) ? summaryOpenModeEl.value : "sidebar")

      : DEFAULT_SETTINGS.summaryOpenMode,

    closeOnSave: !!closeOnSaveEl.checked,

    closeOnSaveAllTabs: !!closeOnSaveAllTabsEl.checked,

    floatingButtonEnabled: !!floatingButtonEnabledEl.checked,

    floatingAiSelectionEnabled: !!(floatingAiSelectionEnabledEl && floatingAiSelectionEnabledEl.checked),

    longPressGestureEnabled: !!(longPressGestureEnabledEl && longPressGestureEnabledEl.checked),

    floatingButtonAutoSuspendTabThreshold: floatingButtonAutoSuspendTabThresholdEl

      ? Math.max(0, Number.parseInt(floatingButtonAutoSuspendTabThresholdEl.value, 10) || 0)

      : DEFAULT_SETTINGS.floatingButtonAutoSuspendTabThreshold,

    floatingButtonVisibilityMode: floatingButtonVisibilityModeEl ? floatingButtonVisibilityModeEl.value : "hover",

    miniCategoryTriggerDirection: miniCategoryTriggerDirectionEl ? miniCategoryTriggerDirectionEl.value : "right",

    miniCategoryPanelLayout: miniCategoryPanelLayoutEl ? miniCategoryPanelLayoutEl.value : "list",

    floatingButtonLongPressDuration: (() => {

      if (!floatingButtonLongPressDurationEl) {

        return DEFAULT_SETTINGS.floatingButtonLongPressDuration;

      }

      const parsed = Number.parseInt(floatingButtonLongPressDurationEl.value, 10);

      return Number.isFinite(parsed)

        ? parsed

        : DEFAULT_SETTINGS.floatingButtonLongPressDuration;

    })(),

    floatingButtonCategoryPickerLongPressDuration: (() => {

      if (!floatingButtonCategoryPickerLongPressDurationEl) {

        return DEFAULT_SETTINGS.floatingButtonCategoryPickerLongPressDuration;

      }

      const parsed = Number.parseInt(floatingButtonCategoryPickerLongPressDurationEl.value, 10);

      return Number.isFinite(parsed)

        ? parsed

        : DEFAULT_SETTINGS.floatingButtonCategoryPickerLongPressDuration;

    })(),

    floatingButtonLongPressSwap: !!(floatingButtonLongPressSwapEl && floatingButtonLongPressSwapEl.checked),

    categoryPickerMouseGesture: !!(categoryPickerMouseGestureEl && categoryPickerMouseGestureEl.checked),

    blockPickerOnTextCursor: !!(blockPickerOnTextCursorEl && blockPickerOnTextCursorEl.checked),

    customGesturePattern: gestureSavedPattern.length > 0 ? gestureSavedPattern : [],





    floatingSubButtonSize: floatingSubButtonSizeEl ? (Number.parseInt(floatingSubButtonSizeEl.value, 10) || 32) : 32,

    floatingButtonSensitivity: parsedSensitivity,

    // Keep legacy field in sync for older builds.

    floatingButtonShowTime: parsedSensitivity,

    floatingButtonHideTime: Number.parseInt(floatingButtonHideTimeEl.value, 10) || 100,

    floatingButtonAnimation: floatingButtonAnimationEl.value || "fade",

    // floatingButtonAnchor is not set via UI anymore

    // floatingButtonOffsetX/Y removed from UI

    ctrlAltLinkSaveEnabled: !!(ctrlAltLinkSaveEnabledEl && ctrlAltLinkSaveEnabledEl.checked),

    linkSaveModifierCombo: linkSaveModifierComboEl ? linkSaveModifierComboEl.value : "ctrl+alt",

    linkSaveMouseButton: linkSaveMouseButtonEl ? linkSaveMouseButtonEl.value : "left",

    linkSaveBundleModifier: linkSaveBundleModifierEl ? linkSaveBundleModifierEl.value : "",

    linkSaveBundleDuration: linkSaveBundleDurationEl

      ? Math.max(0, Number.parseInt(linkSaveBundleDurationEl.value, 10) || 0)

      : 3,

    linkSaveDirectModifier: linkSaveDirectModifierEl ? linkSaveDirectModifierEl.value : "",

    linkSaveActiveCategoryModifier: linkSaveActiveCategoryModifierEl ? linkSaveActiveCategoryModifierEl.value : "",

    linkSavePromptCategoryEnabled: !!(linkSavePromptCategoryEnabledEl && linkSavePromptCategoryEnabledEl.checked),

    floatingButtonIcon: (() => {

      const selectVal = floatingButtonIconEl ? floatingButtonIconEl.value : DEFAULT_SETTINGS.floatingButtonIcon;

      if (selectVal === "custom" && customFloatingIconDataUrl) {

        return customFloatingIconDataUrl;

      }

      if (selectVal && selectVal.startsWith("custom:")) return selectVal;

      return normalizeFloatingIconValue(selectVal);

    })(),

    floatingButtonCustomIcons: customFloatingIcons.slice(0, MAX_CUSTOM_ICON_SLOTS),

    showHiddenCategories: showHiddenCategoriesEl.checked ? 1 : 0,

    floatingButtonShowAnimDuration: floatingButtonShowAnimDurationEl ? (Number.parseInt(floatingButtonShowAnimDurationEl.value, 10) || 200) : 200,

    floatingButtonHideAnimDuration: floatingButtonHideAnimDurationEl ? (Number.parseInt(floatingButtonHideAnimDurationEl.value, 10) || 100) : 100,

    floatingButtonDomainExceptions: (() => {

      if (!floatingButtonDomainExceptionsEl) return [];

      return floatingButtonDomainExceptionsEl.value

        .split(/\r?\n/)

        .map((line) => (line ? line.trim() : ""))

        .filter(Boolean);

    })(),

    categoryPaletteShortcut: (() => {

      const raw = categoryPaletteShortcutEl ? categoryPaletteShortcutEl.value : DEFAULT_SETTINGS.categoryPaletteShortcut;

      const trimmed = typeof raw === "string" ? raw.trim() : DEFAULT_SETTINGS.categoryPaletteShortcut;

      return trimmed || DEFAULT_SETTINGS.categoryPaletteShortcut;

    })(),

    pickerToggleDeleteAfterOpenShortcut: (() => {

      const raw = pickerToggleDeleteAfterOpenShortcutEl ? pickerToggleDeleteAfterOpenShortcutEl.value : DEFAULT_SETTINGS.pickerToggleDeleteAfterOpenShortcut;

      return typeof raw === "string" ? raw.trim() : DEFAULT_SETTINGS.pickerToggleDeleteAfterOpenShortcut;

    })(),

    pickerToggleShowHiddenShortcut: (() => {

      const raw = pickerToggleShowHiddenShortcutEl ? pickerToggleShowHiddenShortcutEl.value : DEFAULT_SETTINGS.pickerToggleShowHiddenShortcut;

      return typeof raw === "string" ? raw.trim() : DEFAULT_SETTINGS.pickerToggleShowHiddenShortcut;

    })(),

    pickerImportShortcut: pickerImportShortcutEl ? pickerImportShortcutEl.value.trim() : "",

    pickerExportShortcut: pickerExportShortcutEl ? pickerExportShortcutEl.value.trim() : "",

    pickerClearFavShortcut: pickerClearFavShortcutEl ? pickerClearFavShortcutEl.value.trim() : "",

    pickerRestoreFavShortcut: pickerRestoreFavShortcutEl ? pickerRestoreFavShortcutEl.value.trim() : "",

    pickerAutoNextShortcut: pickerAutoNextShortcutEl ? pickerAutoNextShortcutEl.value.trim() : "",

    pickerAutoRandomShortcut: pickerAutoRandomShortcutEl ? pickerAutoRandomShortcutEl.value.trim() : "",

    pickerSelectPageShortcut: pickerSelectPageShortcutEl ? pickerSelectPageShortcutEl.value.trim() : "",

    pickerClearSelectionShortcut: pickerClearSelectionShortcutEl ? pickerClearSelectionShortcutEl.value.trim() : "",

    pickerBulkDeleteShortcut: pickerBulkDeleteShortcutEl ? pickerBulkDeleteShortcutEl.value.trim() : "",

    pickerBulkFavShortcut: pickerBulkFavShortcutEl ? pickerBulkFavShortcutEl.value.trim() : "",

    pickerRenameCategoryShortcut: pickerRenameCategoryShortcutEl ? pickerRenameCategoryShortcutEl.value.trim() : "",

    pickerScanDupShortcut: pickerScanDupShortcutEl ? pickerScanDupShortcutEl.value.trim() : "",

    pickerFavShortcut: pickerFavShortcutEl ? pickerFavShortcutEl.value.trim() : "",

    pickerToggleFavShortcut: pickerToggleFavShortcutEl ? pickerToggleFavShortcutEl.value.trim() : "",

    pickerTrashShortcut: pickerTrashShortcutEl ? pickerTrashShortcutEl.value.trim() : "",

    pickerPinShortcut: pickerPinShortcutEl ? pickerPinShortcutEl.value.trim() : "",

    commandPaletteShortcut: (() => {

      const raw = commandPaletteShortcutEl ? commandPaletteShortcutEl.value : DEFAULT_SETTINGS.commandPaletteShortcut;

      return typeof raw === "string" && raw.trim() ? raw.trim() : "Ctrl+K";

    })(),

    rediscoverEnabled: !!(rediscoverEnabledEl && rediscoverEnabledEl.checked),

    rediscoverInterval: (() => {

      const raw = rediscoverIntervalEl ? rediscoverIntervalEl.value : "86400";

      const num = Math.max(1, Number.parseFloat(raw) || 86400);

      const unit = rediscoverIntervalUnitEl ? rediscoverIntervalUnitEl.value : "minit";

      if (unit === "jam") return Math.round(num * 3600);

      if (unit === "minit") return Math.round(num * 60);

      return Math.round(num); // saat

    })(),

    rediscoverDismissAfterMs: (() => {

      const raw = rediscoverDismissAfterEl ? rediscoverDismissAfterEl.value : "8000";

      return Number.parseInt(raw, 10) || 8000;

    })(),

    rediscoverMode: (() => {

      let mode = "sequential";

      rediscoverModeRadios.forEach((radio) => {

        if (radio.checked) mode = radio.value;

      });

      return mode;

    })(),

    rediscoverColor: rediscoverColorEl ? rediscoverColorEl.value : "#8b5cf6"

  };

}





function setSaveStatus(message, isError) {

  if (!saveStatusEl) return;

  saveStatusEl.textContent = message || "";

  saveStatusEl.classList.toggle("error", !!isError);

}



function setShortcutStatus(message, isError) {

  if (!shortcutStatus) return;

  shortcutStatus.textContent = message || "";

  shortcutStatus.classList.toggle("error", !!isError);

}



async function copyTextToClipboard(text) {

  const value = typeof text === "string" ? text : String(text || "");

  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {

    await navigator.clipboard.writeText(value);

    return;

  }

  const textarea = document.createElement("textarea");

  textarea.value = value;

  textarea.setAttribute("readonly", "readonly");

  textarea.style.position = "fixed";

  textarea.style.opacity = "0";

  textarea.style.pointerEvents = "none";

  document.body.appendChild(textarea);

  textarea.focus();

  textarea.select();

  const ok = document.execCommand("copy");

  textarea.remove();

  if (!ok) {

    throw new Error("Clipboard copy failed");

  }

}



function markDirty() {

  dirty = true;

  setSaveStatus("Saving...", false);

  triggerAutoSave();

}



function triggerAutoSave() {

  if (autoSaveTimer) {

    clearTimeout(autoSaveTimer);

  }

  autoSaveTimer = setTimeout(async () => {

    await saveSettings();

  }, AUTO_SAVE_DELAY);

}



function readFileAsDataUrl(file) {

  return new Promise((resolve, reject) => {

    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);

    reader.onerror = (err) => reject(err);

    reader.readAsDataURL(file);

  });

}



function estimateDataUrlBytes(dataUrl) {

  if (!dataUrl || typeof dataUrl !== "string") return 0;

  // Rough estimate: base64 expands by ~4/3; subtract prefix

  const comma = dataUrl.indexOf(",");

  const b64 = comma >= 0 ? dataUrl.length - comma - 1 : dataUrl.length;

  return Math.floor(b64 * 0.75);

}



function renderHoverSoundOptions(activeId) {

  if (!hoverSoundSelectEl) return;

  hoverSoundSelectEl.replaceChildren();

  const builtIn = document.createElement("option");

  builtIn.value = "";

  builtIn.textContent = "Default click";

  hoverSoundSelectEl.appendChild(builtIn);

  customHoverSounds.forEach((s) => {

    const opt = document.createElement("option");

    opt.value = s.id;

    opt.textContent = s.label || "Sound";

    hoverSoundSelectEl.appendChild(opt);

  });

  const targetId = customHoverSounds.some((s) => s.id === activeId) ? activeId : "";

  hoverSoundSelectEl.value = targetId;

  setHoverSoundStatus(

    targetId ? "Custom sound terpilih." : (customHoverSounds.length ? "Custom ada, tapi default dipilih." : "No custom sound."),

    false

  );

}



function setHoverSoundStatus(message, isError) {

  if (!hoverSoundStatusEl) return;

  hoverSoundStatusEl.textContent = message || "";

  hoverSoundStatusEl.classList.toggle("error", !!isError);

}



function updateFloatingButtonAutoSuspendStatus(settings) {

  if (!floatingButtonAutoSuspendStatusEl) return;

  const thresholdRaw = Number.parseInt(

    settings && settings.floatingButtonAutoSuspendTabThreshold,

    10,

  );

  const threshold = Number.isFinite(thresholdRaw) ? Math.max(0, thresholdRaw) : 0;

  const tabCountRaw = Number.parseInt(

    settings && settings.floatingButtonAutoSuspendTabCount,

    10,

  );

  const tabCount = Number.isFinite(tabCountRaw) ? Math.max(0, tabCountRaw) : 0;

  const isActive = settings && settings.floatingButtonAutoSuspendActive === true;

  if (threshold <= 0) {

    floatingButtonAutoSuspendStatusEl.textContent =

      "Auto pause dimatikan. Tetapkan 1 atau lebih untuk aktifkan had tab.";

    floatingButtonAutoSuspendStatusEl.classList.remove("error");

    return;

  }

  floatingButtonAutoSuspendStatusEl.textContent = isActive

    ? `Floating button sedang pause. ${tabCount} tab web melebihi had ${threshold}.`

    : `Floating button aktif. Had semasa ${threshold} tab web.`;

  floatingButtonAutoSuspendStatusEl.classList.toggle("error", isActive);

}



async function saveSettings() {

  if (!dirty) return;

  // Preserve position (offset/anchor) when saving by reading current stored settings

  const currentStored = await getSettings();

  pendingSettings = { ...pendingSettings, ...readFormSettings() };

  // Preserve floatingButtonOffsetX/Y and anchor/anchorX/Y from stored to avoid resetting position

  if (currentStored) {

    pendingSettings.floatingButtonOffsetX = currentStored.floatingButtonOffsetX;

    pendingSettings.floatingButtonOffsetY = currentStored.floatingButtonOffsetY;

    pendingSettings.floatingButtonAnchor = currentStored.floatingButtonAnchor;

    pendingSettings.floatingButtonAnchorX = currentStored.floatingButtonAnchorX;

    pendingSettings.floatingButtonAnchorY = currentStored.floatingButtonAnchorY;

    // Preserve floating button size fields (edited via icon, not options UI)

    pendingSettings.floatingButtonWidth = currentStored.floatingButtonWidth;

    pendingSettings.floatingButtonHeight = currentStored.floatingButtonHeight;

    pendingSettings.floatingButtonSize = currentStored.floatingButtonSize;

    pendingSettings.floatingButtonSizePreset = currentStored.floatingButtonSizePreset;

  }

  try {

    await setSettings(pendingSettings);

    // Bila settings disimpan dari Options page, clear summaryTonePreference
    // supaya nilai dari Options page yang digunakan (bukan butang sidebar)
    try {
      await api.storage.local.remove("summaryTonePreference");
    } catch (_) {}

    dirty = false;

    setSaveStatus("✓ Settings saved.", false);

  } catch (err) {

    setSaveStatus("Failed to save settings.", true);

  }

}



function isModifierKey(key) {

  return ["Shift", "Control", "Alt", "Meta"].includes(key);

}



function normalizeKey(key) {

  if (!key) return "";

  const map = {

    " ": "Space",

    ArrowLeft: "Left",

    ArrowRight: "Right",

    ArrowUp: "Up",

    ArrowDown: "Down",

    Escape: "Esc",

    Enter: "Enter",

    Tab: "Tab",

    Home: "Home",

    End: "End",

    PageUp: "PageUp",

    PageDown: "PageDown",

    Insert: "Insert",

    Delete: "Delete"

  };

  if (map[key]) return map[key];

  if (/^F\d{1,2}$/i.test(key)) return key.toUpperCase();

  if (key.length === 1) return key.toUpperCase();

  return "";

}



function isAltPressed(event) {

  return event.altKey || (typeof event.getModifierState === "function" && event.getModifierState("Alt"));

}



function buildShortcut(event) {

  const parts = [];

  if (event.ctrlKey) parts.push("Ctrl");

  if (isAltPressed(event)) parts.push("Alt");

  const capsLockOn = typeof event.getModifierState === "function" && event.getModifierState("CapsLock");

  const isLetter = event.key && event.key.length === 1 && /[a-zA-Z]/.test(event.key);

  const isShiftCounteracting = event.shiftKey && capsLockOn && isLetter;

  if (event.shiftKey && !isShiftCounteracting) parts.push("Shift");

  if (event.metaKey) parts.push("Command");

  const key = normalizeKey(event.key);

  if (!key) return "";

  parts.push(key);

  return parts.join("+");

}



function hasRequiredModifier(event) {

  return event.ctrlKey || isAltPressed(event) || event.metaKey;

}



function normalizeShortcutForCompare(shortcut) {

  return String(shortcut || "")

    .trim()

    .toLowerCase()

    .replace(/\s+/g, "");

}



function getCommandDisplayName(command) {

  if (!command) return "";

  if (command.description) return String(command.description);

  if (command.name) return String(command.name);

  return "";

}



function startListening(inputEl) {

  if (!inputEl) return;

  if (listeningInput && listeningInput !== inputEl) {

    listeningInput.classList.remove("listening");

  }

  listeningInput = inputEl;

  inputEl.classList.add("listening");

  setShortcutStatus("Press your shortcut now…", false);

}



function stopListening() {

  if (!listeningInput) return;

  listeningInput.classList.remove("listening");

  listeningInput = null;

}



async function loadShortcut() {

  if (!api.commands || !api.commands.getAll) {

    setShortcutStatus("Keyboard shortcuts are not available in this browser.", true);

    return;

  }

  try {

    const commands = await api.commands.getAll();

    shortcutInputs.forEach((inputEl) => {

      const commandName = inputEl.dataset.command;

      const command = commands.find((entry) => entry.name === commandName);

      inputEl.value = command && command.shortcut ? command.shortcut : "";

    });

  } catch (err) {

    setShortcutStatus("Failed to read current shortcut.", true);

  }

}



async function applyShortcut(commandName, shortcutValue, inputEl) {

  if (!api.commands || !api.commands.update) {

    setShortcutStatus("This browser does not allow updating shortcuts here. Use the shortcut manager.", true);

    return;

  }

  if (shortcutUpdateInFlight) {

    setShortcutStatus("Please wait, another shortcut update is in progress.", true);

    return;

  }

  shortcutUpdateInFlight = true;

  try {

    let previousShortcut = "";

    let commands = [];

    try {

      commands = await api.commands.getAll();

      const currentCommand = commands.find((entry) => entry.name === commandName);

      previousShortcut = currentCommand && currentCommand.shortcut ? currentCommand.shortcut : "";

      const normalizedNext = normalizeShortcutForCompare(shortcutValue);

      if (normalizedNext) {

        const conflict = commands.find((entry) => (

          entry

          && entry.name !== commandName

          && normalizeShortcutForCompare(entry.shortcut) === normalizedNext

        ));

        if (conflict) {

          if (inputEl) {

            inputEl.value = previousShortcut;

          }

          setShortcutStatus(`Shortcut already used by: ${getCommandDisplayName(conflict)}.`, true);

          return;

        }

      }

      await api.commands.update({ name: commandName, shortcut: shortcutValue });

    } catch (err) {

      if (inputEl) {

        inputEl.value = previousShortcut;

      }

      const msg = err && err.message ? String(err.message) : "";

      if (msg && msg.toLowerCase().includes("user")) {

        setShortcutStatus("Browser controls shortcuts. Use the shortcut manager button.", true);

      } else {

        setShortcutStatus("Shortcut rejected. It may conflict or be invalid.", true);

      }

      return;

    }

    try {

      commands = await api.commands.getAll();

      const command = commands.find((entry) => entry.name === commandName);

      const current = command && command.shortcut ? command.shortcut : "";

      if (current === shortcutValue) {

        setShortcutStatus(shortcutValue ? "Shortcut saved." : "Shortcut cleared.", false);

        if (inputEl) {

          inputEl.value = current;

        }

      } else {

        if (inputEl) {

          inputEl.value = current;

        }

        setShortcutStatus("Shortcut not applied. It may conflict with another shortcut.", true);

      }

    } catch (err) {

      setShortcutStatus("Could not verify the shortcut.", true);

    }

  } finally {

    shortcutUpdateInFlight = false;

  }

}



async function handleShortcutKeydown(event) {

  if (!listeningInput) return;

  event.preventDefault();

  event.stopPropagation();

  const commandName = listeningInput.dataset.command;

  if (!commandName) {

    setShortcutStatus("Missing command name for this shortcut.", true);

    stopListening();

    return;

  }



  if (event.key === "Escape") {

    setShortcutStatus("Canceled.", false);

    stopListening();

    return;

  }



  if ((event.key === "Backspace" || event.key === "Delete") && !event.ctrlKey && !isAltPressed(event) && !event.shiftKey && !event.metaKey) {

    await applyShortcut(commandName, "", listeningInput);

    stopListening();

    return;

  }



  if (isModifierKey(event.key)) return;



  if (!hasRequiredModifier(event)) {

    setShortcutStatus("Use Ctrl, Alt, or Command with your shortcut.", true);

    return;

  }



  const shortcutValue = buildShortcut(event);

  if (!shortcutValue) {

    setShortcutStatus("This key is not supported for shortcuts.", true);

    return;

  }

  listeningInput.value = shortcutValue;

  await applyShortcut(commandName, shortcutValue, listeningInput);

  stopListening();

}



async function setCategoryHidden(categoryId, hidden) {

  if (!categoryId) return;

  const data = await api.storage.local.get(CATEGORY_KEY);

  const categories = coerceArray(data[CATEGORY_KEY]);

  let changed = false;

  const next = categories.map((cat) => {

    if (!cat || !cat.id) return cat;

    if (cat.id !== categoryId) return cat;

    const previousHidden = cat.hidden === true;

    if (previousHidden === hidden) return cat;

    changed = true;

    return { ...cat, hidden };

  });

  if (!changed) return;

  await api.storage.local.set({ [CATEGORY_KEY]: next });

  await loadCategoryVisibilityList();

}



function updateCategoryPagerControls(totalPages, totalItems) {

  const safeTotal = Math.max(1, totalPages);

  totalCategoryPages = safeTotal;

  if (categoryPage > safeTotal) categoryPage = safeTotal;

  if (categoryPage < 1) categoryPage = 1;

  if (categoryPageLabel) {

    categoryPageLabel.textContent = totalItems > 0

      ? `Page ${categoryPage} of ${safeTotal}`

      : "No categories to show";

  }

  if (prevCategoryPageBtn) {

    prevCategoryPageBtn.disabled = categoryListHidden || totalItems === 0 || categoryPage <= 1;

  }

  if (nextCategoryPageBtn) {

    nextCategoryPageBtn.disabled = categoryListHidden || totalItems === 0 || categoryPage >= safeTotal;

  }

  if (categoryPager) {

    categoryPager.classList.toggle("collapsed", categoryListHidden || totalItems === 0);

  }

}



function updateCategoryListVisibility() {

  if (categoryListContainer) {

    categoryListContainer.classList.toggle("collapsed", categoryListHidden);

  }

  if (categoryVisibilityList) {

    categoryVisibilityList.setAttribute("aria-hidden", categoryListHidden ? "true" : "false");

  }

  if (toggleCategoryListBtn) {

    toggleCategoryListBtn.textContent = categoryListHidden ? "Show categories" : "Hide categories";

  }

}



function updateKeyboardPagerControls(totalPages, totalItems) {

  const safeTotal = Math.max(1, totalPages);

  totalKeyboardPages = safeTotal;

  if (keyboardPage > safeTotal) keyboardPage = safeTotal;

  if (keyboardPage < 1) keyboardPage = 1;

  if (keyboardPageLabel) {

    keyboardPageLabel.textContent = totalItems > 0

      ? `Page ${keyboardPage} of ${safeTotal}`

      : "No shortcuts";

  }

  if (prevKeyboardPageBtn) {

    prevKeyboardPageBtn.disabled = keyboardListHidden || totalItems === 0 || keyboardPage <= 1;

  }

  if (nextKeyboardPageBtn) {

    nextKeyboardPageBtn.disabled = keyboardListHidden || totalItems === 0 || keyboardPage >= safeTotal;

  }

  if (keyboardPager) {

    keyboardPager.classList.toggle("collapsed", keyboardListHidden || totalItems === 0);

  }

}



function updateKeyboardListVisibility() {

  if (keyboardListContainer) {

    keyboardListContainer.classList.toggle("collapsed", keyboardListHidden);

  }

  if (keyboardListEl) {

    keyboardListEl.setAttribute("aria-hidden", keyboardListHidden ? "true" : "false");

  }

  if (toggleKeyboardListBtn) {

    toggleKeyboardListBtn.textContent = keyboardListHidden ? "Show shortcuts" : "Hide shortcuts";

  }

}



function loadKeyboardShortcutList(resetPage = false) {

  if (!keyboardShortcutRows.length) {

    updateKeyboardPagerControls(1, 0);

    return;

  }

  if (resetPage) keyboardPage = 1;

  const totalItems = keyboardShortcutRows.length;

  const totalPages = Math.max(1, Math.ceil(totalItems / KEYBOARD_PAGE_SIZE));

  if (keyboardPage > totalPages) keyboardPage = totalPages;

  const startIndex = (keyboardPage - 1) * KEYBOARD_PAGE_SIZE;

  const endIndex = startIndex + KEYBOARD_PAGE_SIZE;

  const visibleRows = [];

  keyboardShortcutRows.forEach((row, index) => {

    const visible = index >= startIndex && index < endIndex;

    row.style.borderBottom = "";

    row.style.display = visible ? "flex" : "none";

    if (visible) {

      visibleRows.push(row);

    }

  });

  if (visibleRows.length) {

    visibleRows[visibleRows.length - 1].style.borderBottom = "none";

  }

  updateKeyboardPagerControls(totalPages, totalItems);

}



async function loadCategoryVisibilityList(resetPage = false) {

  if (!categoryVisibilityList) return;

  if (resetPage) categoryPage = 1;

  categoryVisibilityList.replaceChildren();

  try {

    const data = await api.storage.local.get(CATEGORY_KEY);

    const categories = coerceArray(data[CATEGORY_KEY]);

    if (!categories.length) {

      categoryVisibilityList.textContent = "No categories yet.";

      updateCategoryPagerControls(1, 0);

      return;

    }

    const sorted = categories.slice().sort((a, b) => {

      const aName = a && a.name ? a.name : "";

      const bName = b && b.name ? b.name : "";

      return aName.localeCompare(bName, undefined, { sensitivity: "base" });

    });

    const showHidden = showHiddenCategoriesEl ? showHiddenCategoriesEl.checked : false;

    const filtered = sorted.filter((cat) => cat && cat.id && (showHidden || !cat.hidden));

    if (!filtered.length) {

      const hint = document.createElement("div");

      hint.className = "hint";

      hint.textContent = showHidden

        ? "No categories to display."

        : "No visible categories. Toggle \"Show hidden categories\" to manage hidden ones.";

      categoryVisibilityList.appendChild(hint);

      updateCategoryPagerControls(1, 0);

      return;

    }

    const totalItems = filtered.length;

    const totalPages = Math.max(1, Math.ceil(totalItems / CATEGORY_PAGE_SIZE));

    if (categoryPage > totalPages) {

      categoryPage = totalPages;

    }

    const startIndex = (categoryPage - 1) * CATEGORY_PAGE_SIZE;

    const pageItems = filtered.slice(startIndex, startIndex + CATEGORY_PAGE_SIZE);

    pageItems.forEach((cat) => {

      if (!cat || !cat.id) return;

      const row = document.createElement("div");

      row.className = "category-row";

      if (cat.hidden) row.classList.add("hidden");

      const label = document.createElement("span");

      const title = cat.name ? cat.name : "(untitled)";

      label.textContent = cat.hidden ? `${title} (hidden)` : title;

      const button = document.createElement("button");

      button.type = "button";

      button.className = "ghost";

      button.textContent = cat.hidden ? "Unhide" : "Hide";

      button.addEventListener("click", async () => {

        button.disabled = true;

        await setCategoryHidden(cat.id, !cat.hidden);

        button.disabled = false;

      });

      row.append(label, button);

      categoryVisibilityList.appendChild(row);

    });

    updateCategoryPagerControls(totalPages, totalItems);

  } catch (err) {

    console.error("Failed to load categories", err);

    categoryVisibilityList.textContent = "Unable to load categories.";

    updateCategoryPagerControls(1, 0);

  }

}





async function load() {

  // ── Lazy-init untuk bahagian yang jarang dibuka ──────────────────────────

  // Dropdown modifier combo (4 buah) masing-masing bina ~60+ option elements.

  // Defer sehingga section "Quick Save on Links" dibuka supaya

  // page load lebih cepat (~40% kurang kerja DOM semasa init).

  let _linkSaveDropdownsPopulated = false;

  function _ensureLinkSaveDropdowns() {

    if (_linkSaveDropdownsPopulated) return;

    _linkSaveDropdownsPopulated = true;

    _lpLinkSaveDropdownsReady = true;

    populateLinkSaveModifierOptions();

    populateBundleModifierOptions();

    populateDirectModifierOptions();

    populateActiveCategoryModifierOptions();

    if (linkSaveModifierComboEl) {

      const selected = normalizeLinkSaveTriggerSetting(pendingSettings.linkSaveModifierCombo || "ctrl+alt");

      const pending = linkSaveModifierComboEl.dataset.pendingValue;

      linkSaveModifierComboEl.value = pending !== undefined ? pending : selected;

      delete linkSaveModifierComboEl.dataset.pendingValue;

    }

    if (linkSaveBundleModifierEl) {

      const pending = linkSaveBundleModifierEl.dataset.pendingValue;

      linkSaveBundleModifierEl.value = pending !== undefined ? pending : (pendingSettings.linkSaveBundleModifier || "");

      delete linkSaveBundleModifierEl.dataset.pendingValue;

    }

    if (linkSaveDirectModifierEl) {

      const pending = linkSaveDirectModifierEl.dataset.pendingValue;

      linkSaveDirectModifierEl.value = pending !== undefined ? pending : (pendingSettings.linkSaveDirectModifier || "");

      delete linkSaveDirectModifierEl.dataset.pendingValue;

    }

    if (linkSaveActiveCategoryModifierEl) {

      const pending = linkSaveActiveCategoryModifierEl.dataset.pendingValue;

      linkSaveActiveCategoryModifierEl.value = pending !== undefined ? pending : (pendingSettings.linkSaveActiveCategoryModifier || "");

      delete linkSaveActiveCategoryModifierEl.dataset.pendingValue;

    }

  }



  // Pasang listener pada semua <details> dalam section "Quick Save on Links"

  document.querySelectorAll(".settings-group").forEach((details) => {

    if (details.tagName !== "DETAILS") return;

    const summaryText = details.querySelector(".settings-group-title");

    if (summaryText && summaryText.textContent.includes("Quick Save")) {

      details.addEventListener("toggle", function onToggle() {

        if (details.open) {

          _ensureLinkSaveDropdowns();

          details.removeEventListener("toggle", onToggle);

        }

      });

    }

  });



  // Lazy load category list — guna IntersectionObserver jika tersedia

  let _categoryListLoaded = false;

  function _ensureCategoryList() {

    if (_categoryListLoaded) return;

    _categoryListLoaded = true;

    loadCategoryVisibilityList(true).catch(() => {});

    updateCategoryListVisibility();

  }



  const categorySection = document.getElementById("categorySettings");

  if (categorySection && typeof IntersectionObserver !== "undefined") {

    const catObs = new IntersectionObserver((entries) => {

      if (entries.some((e) => e.isIntersecting)) {

        _ensureCategoryList();

        catObs.disconnect();

      }

    }, { threshold: 0.01 });

    catObs.observe(categorySection);

  } else {

    _categoryListLoaded = true; // fallback: load terus

  }



  // Lazy load keyboard shortcut list

  let _keyboardListLoaded = false;

  function _ensureKeyboardList() {

    if (_keyboardListLoaded) return;

    _keyboardListLoaded = true;

    loadKeyboardShortcutList(true);

    updateKeyboardListVisibility();

  }



  const keyboardSection = document.getElementById("keyboardSettings");

  if (keyboardSection && typeof IntersectionObserver !== "undefined") {

    const kbdObs = new IntersectionObserver((entries) => {

      if (entries.some((e) => e.isIntersecting)) {

        _ensureKeyboardList();

        kbdObs.disconnect();

      }

    }, { threshold: 0.01 });

    kbdObs.observe(keyboardSection);

  } else {

    _keyboardListLoaded = true; // fallback: load terus

  }



  // ── Init utama — jalan seperti biasa ─────────────────────────────────────

  const settings = await getSettings();

  pendingSettings = { ...settings };

  dirty = false;

  applySettings(settings);

  setSaveStatus("", false);

  loadShortcut();



  // Jika IntersectionObserver tidak tersedia, load semua terus

  if (!_categoryListLoaded) {

    _ensureCategoryList();

  }

  if (!_keyboardListLoaded) {

    _ensureKeyboardList();

  }

}



function handleSettingChange() {

  pendingSettings = { ...pendingSettings, ...readFormSettings() };

  updateFloatingButtonAutoSuspendStatus(pendingSettings);

  applyThemePreset(pendingSettings.themePreset);

  markDirty();

}



showBadgeEl.addEventListener("change", handleSettingChange);

showPageActionEl.addEventListener("change", handleSettingChange);

if (enableCategoryPickerEl) enableCategoryPickerEl.addEventListener("change", handleSettingChange);

if (enableDedupeButtonEl) enableDedupeButtonEl.addEventListener("change", handleSettingChange);

deleteAfterOpenEl.addEventListener("change", handleSettingChange);

if (globalLinkInBackgroundTabEl) globalLinkInBackgroundTabEl.addEventListener("change", handleSettingChange);

if (randomAcrossAllCategoriesEl) randomAcrossAllCategoriesEl.addEventListener("change", handleSettingChange);

if (contextMenuSaveToUncategorizedEl) contextMenuSaveToUncategorizedEl.addEventListener("change", handleSettingChange);

cycleIncludeAllEl.addEventListener("change", handleSettingChange);

cycleIncludeUncategorizedEl.addEventListener("change", handleSettingChange);

zoomLevelEl.addEventListener("change", handleSettingChange);

pageSizeEl.addEventListener("change", handleSettingChange);

if (pickerAnimationEl) pickerAnimationEl.addEventListener("change", handleSettingChange);

if (pickerAnimationDurationEl) pickerAnimationDurationEl.addEventListener("change", handleSettingChange);

if (pickerStartModeEl) pickerStartModeEl.addEventListener("change", handleSettingChange);

if (pickerHighlightColorEl) pickerHighlightColorEl.addEventListener("input", handleSettingChange);

if (notesStartModeEl) notesStartModeEl.addEventListener("change", handleSettingChange);

if (pickerLayoutEl) pickerLayoutEl.addEventListener("change", handleSettingChange);

if (pickerYoutubeThumbnailsEl) pickerYoutubeThumbnailsEl.addEventListener("change", handleSettingChange);

if (trashLimitEl) trashLimitEl.addEventListener("change", handleSettingChange);

if (floatingNextUpLabelEl) floatingNextUpLabelEl.addEventListener("change", handleSettingChange);

if (floatingNextUpMaxWidthEl) floatingNextUpMaxWidthEl.addEventListener("input", handleSettingChange);

if (floatingAiSelectionEnabledEl) floatingAiSelectionEnabledEl.addEventListener("change", handleSettingChange);

if (longPressGestureEnabledEl) longPressGestureEnabledEl.addEventListener("change", handleSettingChange);

if (pickerHoverSoundEl) pickerHoverSoundEl.addEventListener("change", handleSettingChange);

if (hoverSoundSelectEl) hoverSoundSelectEl.addEventListener("change", handleSettingChange);

if (themePresetEl) themePresetEl.addEventListener("change", handleSettingChange);

const allCustomColorEls = [customBgEl, customBgAltEl, customPanelEl, customPanelAltEl, customInkEl, customMutedEl, customAccentEl, customAccent2El, customAccent3El, customAccent4El, customBorderEl];

allCustomColorEls.forEach(function(el) {

  if (el) el.addEventListener("input", handleSettingChange);

});

if (sidebarAiProviderEl) sidebarAiProviderEl.addEventListener("change", handleSettingChange);

  if (aiModeEl) aiModeEl.addEventListener("change", handleSettingChange);

  if (sidebarFocusF6DelayMsEl) sidebarFocusF6DelayMsEl.addEventListener("change", handleSettingChange);

  if (sidebarNativeFocusHelperEnabledEl) sidebarNativeFocusHelperEnabledEl.addEventListener("change", handleSettingChange);

if (summaryCustomPromptEl) {

  summaryCustomPromptEl.addEventListener("input", handleSettingChange);

  summaryCustomPromptEl.addEventListener("input", updatePromptCharCount);

}

if (summaryOutputLanguageEl) summaryOutputLanguageEl.addEventListener("change", handleSettingChange);

if (summaryToneEl) summaryToneEl.addEventListener("change", handleSettingChange);

if (summaryMaxWordsEl) summaryMaxWordsEl.addEventListener("input", handleSettingChange);

if (summaryOpenModeEl) summaryOpenModeEl.addEventListener("change", handleSettingChange);



function updatePromptCharCount() {

  if (!summaryPromptCharCountEl || !summaryCustomPromptEl) return;

  const text = summaryCustomPromptEl.value;

  const count = text.length;

  const maxChars = 5000;

  const percentage = (count / maxChars) * 100;

  

  summaryPromptCharCountEl.textContent = `${count}/${maxChars}`;

  

  if (percentage >= 95) {

    summaryPromptCharCountEl.style.color = "#ff6b6b";

  } else if (percentage >= 80) {

    summaryPromptCharCountEl.style.color = "#ffd93d";

  } else {

    summaryPromptCharCountEl.style.color = "#888";

  }

}



// Initialize character count on load

if (summaryCustomPromptEl) {

  updatePromptCharCount();

}



// --- Prompt Template Management ---

const summaryPromptTemplateSaveEl = document.querySelector("#summaryPromptTemplateSave");

const summaryPromptTemplateListEl = document.querySelector("#summaryPromptTemplateList");

const summaryPromptSuggestionsEl = document.querySelector("#summaryPromptSuggestions");

const summaryPromptSuggestionsListEl = document.querySelector("#summaryPromptSuggestionsList");

const exportPromptTemplatesEl = document.querySelector("#exportPromptTemplates");

const importPromptTemplatesEl = document.querySelector("#importPromptTemplates");

const importPromptTemplatesFileEl = document.querySelector("#importPromptTemplatesFile");

const templatePreviewModalEl = document.querySelector("#templatePreviewModal");

const previewTemplateNameEl = document.querySelector("#previewTemplateName");

const previewTemplateContentEl = document.querySelector("#previewTemplateContent");

const closePreviewModalEl = document.querySelector("#closePreviewModal");



async function loadPromptTemplates() {

  if (!summaryPromptTemplateListEl) return [];

  try {

    const data = await api.storage.local.get(PROMPT_TEMPLATES_KEY);

    const templates = Array.isArray(data[PROMPT_TEMPLATES_KEY]) ? data[PROMPT_TEMPLATES_KEY] : [];

    

    summaryPromptTemplateListEl.innerHTML = "";

    

    if (templates.length === 0) {

      summaryPromptTemplateListEl.innerHTML = '<div class="hint" style="text-align:center;color:#666;padding:20px;">Tiada templat disimpan</div>';

      return templates;

    }

    

    templates.forEach((t, i) => {

      const card = document.createElement("div");

      card.style.cssText = "background:#2a2a2a;border:1px solid #444;border-radius:6px;padding:10px;margin-bottom:8px;position:relative;";

      

      const previewText = t.text.length > 100 ? t.text.slice(0, 100) + "..." : t.text;

      

      const headerDiv = document.createElement("div");

      headerDiv.style.cssText = "display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;";

      

      const titleStrong = document.createElement("strong");

      titleStrong.style.cssText = "color:#ddd;font-size:13px;";

      titleStrong.textContent = t.name || "Templat " + (i + 1);

      headerDiv.appendChild(titleStrong);

      

      const buttonGroup = document.createElement("div");

      buttonGroup.style.cssText = "display:flex;gap:4px;";

      

      const moveUpBtn = document.createElement("button");

      moveUpBtn.className = "template-move-up";

      moveUpBtn.dataset.idx = i;

      moveUpBtn.style.cssText = "padding:3px 8px;border-radius:4px;border:1px solid #555;background:#2a2a2a;color:#ddd;font-size:11px;cursor:pointer;";

      moveUpBtn.title = "Move up";

      moveUpBtn.textContent = "⬆️";

      if (i === 0) moveUpBtn.disabled = true;

      buttonGroup.appendChild(moveUpBtn);

      

      const moveDownBtn = document.createElement("button");

      moveDownBtn.className = "template-move-down";

      moveDownBtn.dataset.idx = i;

      moveDownBtn.style.cssText = "padding:3px 8px;border-radius:4px;border:1px solid #555;background:#2a2a2a;color:#ddd;font-size:11px;cursor:pointer;";

      moveDownBtn.title = "Move down";

      moveDownBtn.textContent = "⬇️";

      if (i === templates.length - 1) moveDownBtn.disabled = true;

      buttonGroup.appendChild(moveDownBtn);

      

      const applyBtn = document.createElement("button");

      applyBtn.className = "template-apply";

      applyBtn.dataset.idx = i;

      applyBtn.style.cssText = "padding:3px 8px;border-radius:4px;border:1px solid #4a9;background:#1a3a2a;color:#7fcfa0;font-size:11px;cursor:pointer;";

      applyBtn.title = "Apply templat ini";

      applyBtn.textContent = "Apply";

      buttonGroup.appendChild(applyBtn);

      

      const previewBtn = document.createElement("button");

      previewBtn.className = "template-preview";

      previewBtn.dataset.idx = i;

      previewBtn.style.cssText = "padding:3px 8px;border-radius:4px;border:1px solid #555;background:#2a2a2a;color:#ddd;font-size:11px;cursor:pointer;";

      previewBtn.title = "Preview templat ini";

      previewBtn.textContent = "👁️";

      buttonGroup.appendChild(previewBtn);

      

      const duplicateBtn = document.createElement("button");

      duplicateBtn.className = "template-duplicate";

      duplicateBtn.dataset.idx = i;

      duplicateBtn.style.cssText = "padding:3px 8px;border-radius:4px;border:1px solid #555;background:#2a2a2a;color:#ddd;font-size:11px;cursor:pointer;";

      duplicateBtn.title = "Duplicate templat ini";

      duplicateBtn.textContent = "📋";

      buttonGroup.appendChild(duplicateBtn);

      

      const editBtn = document.createElement("button");

      editBtn.className = "template-edit";

      editBtn.dataset.idx = i;

      editBtn.style.cssText = "padding:3px 8px;border-radius:4px;border:1px solid #49a;background:#1a2a3a;color:#7fcfff;font-size:11px;cursor:pointer;";

      editBtn.title = "Edit templat ini";

      editBtn.textContent = "✏️";

      buttonGroup.appendChild(editBtn);

      

      const deleteBtn = document.createElement("button");

      deleteBtn.className = "template-delete";

      deleteBtn.dataset.idx = i;

      deleteBtn.style.cssText = "padding:3px 8px;border-radius:4px;border:1px solid #a55;background:#3a1a1a;color:#ff9090;font-size:11px;cursor:pointer;";

      deleteBtn.title = "Padam templat ini";

      deleteBtn.textContent = "🗑";

      buttonGroup.appendChild(deleteBtn);

      

      headerDiv.appendChild(buttonGroup);

      card.appendChild(headerDiv);

      

      const hintDiv = document.createElement("div");

      hintDiv.className = "hint";

      hintDiv.style.cssText = "margin:0;color:#888;font-size:11px;line-height:1.4;";

      hintDiv.textContent = previewText;

      card.appendChild(hintDiv);

      

      summaryPromptTemplateListEl.appendChild(card);

    });

    

    return templates;

  } catch (err) {

    console.error("Error loading templates:", err);

    return [];

  }

}



function escapeHtml(text) {

  const div = document.createElement("div");

  div.textContent = text;

  return div.innerHTML;

}



// Handle template card clicks

if (summaryPromptTemplateListEl) {

  summaryPromptTemplateListEl.addEventListener("click", async (e) => {

    const target = e.target;

    const idx = target.dataset.idx;

    if (idx === undefined) return;

    

    const numIdx = Number(idx);

    

    if (target.classList.contains("template-move-up")) {

      try {

        const data = await api.storage.local.get(PROMPT_TEMPLATES_KEY);

        const templates = Array.isArray(data[PROMPT_TEMPLATES_KEY]) ? data[PROMPT_TEMPLATES_KEY] : [];

        if (numIdx > 0 && numIdx < templates.length) {

          const temp = templates[numIdx];

          templates[numIdx] = templates[numIdx - 1];

          templates[numIdx - 1] = temp;

          await api.storage.local.set({ [PROMPT_TEMPLATES_KEY]: templates });

          await loadPromptTemplates();

          setSaveStatus("✓ Templat dipindahkan ke atas.", false);

        }

      } catch (err) {

        console.error("Error moving template up:", err);

        setSaveStatus("Gagal pindahkan templat.", true);

      }

    } else if (target.classList.contains("template-move-down")) {

      try {

        const data = await api.storage.local.get(PROMPT_TEMPLATES_KEY);

        const templates = Array.isArray(data[PROMPT_TEMPLATES_KEY]) ? data[PROMPT_TEMPLATES_KEY] : [];

        if (numIdx >= 0 && numIdx < templates.length - 1) {

          const temp = templates[numIdx];

          templates[numIdx] = templates[numIdx + 1];

          templates[numIdx + 1] = temp;

          await api.storage.local.set({ [PROMPT_TEMPLATES_KEY]: templates });

          await loadPromptTemplates();

          setSaveStatus("✓ Templat dipindahkan ke bawah.", false);

        }

      } catch (err) {

        console.error("Error moving template down:", err);

        setSaveStatus("Gagal pindahkan templat.", true);

      }

    } else if (target.classList.contains("template-preview")) {

      try {

        const data = await api.storage.local.get(PROMPT_TEMPLATES_KEY);

        const templates = Array.isArray(data[PROMPT_TEMPLATES_KEY]) ? data[PROMPT_TEMPLATES_KEY] : [];

        if (numIdx >= 0 && numIdx < templates.length) {

          const template = templates[numIdx];

          if (previewTemplateNameEl && previewTemplateContentEl && templatePreviewModalEl) {

            previewTemplateNameEl.textContent = template.name || "Template Preview";

            previewTemplateContentEl.textContent = template.text || "";

            templatePreviewModalEl.style.display = "flex";

          }

        }

      } catch (err) {

        console.error("Error previewing template:", err);

        setSaveStatus("Gagal preview templat.", true);

      }

    } else if (target.classList.contains("template-apply")) {

      try {

        const data = await api.storage.local.get(PROMPT_TEMPLATES_KEY);

        const templates = Array.isArray(data[PROMPT_TEMPLATES_KEY]) ? data[PROMPT_TEMPLATES_KEY] : [];

        if (numIdx >= 0 && numIdx < templates.length) {

          if (summaryCustomPromptEl) {

            summaryCustomPromptEl.value = templates[numIdx].text || "";

            handleSettingChange();

            updatePromptCharCount();

          }

          setSaveStatus("✓ Templat \"" + templates[numIdx].name + "\" diaplikasi.", false);

        }

      } catch (err) {

        console.error("Error applying template:", err);

        setSaveStatus("Gagal aplikasi templat.", true);

      }

    } else if (target.classList.contains("template-duplicate")) {

      try {

        const data = await api.storage.local.get(PROMPT_TEMPLATES_KEY);

        const templates = Array.isArray(data[PROMPT_TEMPLATES_KEY]) ? data[PROMPT_TEMPLATES_KEY] : [];

        if (numIdx >= 0 && numIdx < templates.length) {

          const original = templates[numIdx];

          let newName = original.name + " (Copy)";

          let counter = 1;

          while (templates.some(t => t.name === newName)) {

            newName = original.name + " (Copy " + counter + ")";

            counter++;

          }

          const newTemplate = { name: newName, text: original.text };

          templates.push(newTemplate);

          await api.storage.local.set({ [PROMPT_TEMPLATES_KEY]: templates });

          await loadPromptTemplates();

          setSaveStatus("✓ Templat \"" + newName + "\" berjaya diduplikasi.", false);

        }

      } catch (err) {

        console.error("Error duplicating template:", err);

        setSaveStatus("Gagal duplikasi templat: " + (err.message || "Unknown error"), true);

      }

    } else if (target.classList.contains("template-edit")) {

      try {

        const data = await api.storage.local.get(PROMPT_TEMPLATES_KEY);

        const templates = Array.isArray(data[PROMPT_TEMPLATES_KEY]) ? data[PROMPT_TEMPLATES_KEY] : [];

        if (numIdx >= 0 && numIdx < templates.length) {

          const template = templates[numIdx];

          const newName = prompt("Nama baru untuk templat ini:", template.name);

          if (newName === null) return;

          if (!newName || !newName.trim()) {

            setSaveStatus("Nama templat diperlukan.", true);

            return;

          }

          const trimmedName = newName.trim().slice(0, 50);

          const newText = prompt("Kandungan baru untuk templat ini:", template.text);

          if (newText === null) return;

          if (!newText || !newText.trim()) {

            setSaveStatus("Kandungan templat diperlukan.", true);

            return;

          }

          templates[numIdx] = { name: trimmedName, text: newText.trim() };

          await api.storage.local.set({ [PROMPT_TEMPLATES_KEY]: templates });

          await loadPromptTemplates();

          if (summaryCustomPromptEl) {

            summaryCustomPromptEl.value = newText.trim();

            handleSettingChange();

          }

          setSaveStatus("✓ Templat \"" + trimmedName + "\" berjaya dikemaskini.", false);

        }

      } catch (err) {

        console.error("Error editing template:", err);

        setSaveStatus("Gagal edit templat: " + (err.message || "Unknown error"), true);

      }

    } else if (target.classList.contains("template-delete")) {

      try {

        const data = await api.storage.local.get(PROMPT_TEMPLATES_KEY);

        const templates = Array.isArray(data[PROMPT_TEMPLATES_KEY]) ? data[PROMPT_TEMPLATES_KEY] : [];

        if (numIdx >= 0 && numIdx < templates.length) {

          const removed = templates.splice(numIdx, 1);

          await api.storage.local.set({ [PROMPT_TEMPLATES_KEY]: templates });

          await loadPromptTemplates();

          setSaveStatus("✓ Templat \"" + (removed[0] && removed[0].name || "?") + "\" dipadam.", false);

        }

      } catch (err) {

        console.error("Error deleting template:", err);

        setSaveStatus("Gagal padam templat: " + (err.message || "Unknown error"), true);

      }

    }

  });

}



if (summaryPromptTemplateSaveEl) {

  summaryPromptTemplateSaveEl.addEventListener("click", async () => {

    const text = summaryCustomPromptEl ? summaryCustomPromptEl.value.trim() : "";

    if (!text) {

      setSaveStatus("Tulis prompt dahulu sebelum simpan sebagai templat.", true);

      return;

    }

    const name = prompt("Nama untuk templat ini:");

    if (!name || !name.trim()) {

      setSaveStatus("Nama templat diperlukan.", true);

      return;

    }

    const trimmedName = name.trim().slice(0, 50);

    try {

      const data = await api.storage.local.get(PROMPT_TEMPLATES_KEY);

      const templates = Array.isArray(data[PROMPT_TEMPLATES_KEY]) ? data[PROMPT_TEMPLATES_KEY] : [];

      templates.push({ name: trimmedName, text });

      await api.storage.local.set({ [PROMPT_TEMPLATES_KEY]: templates });

      await loadPromptTemplates();

      setSaveStatus("✓ Templat \"" + trimmedName + "\" berjaya disimpan.", false);

    } catch (err) {

      console.error("Error saving template:", err);

      setSaveStatus("Gagal simpan templat: " + (err.message || "Unknown error"), true);

    }

  });

}



loadPromptTemplates();



// --- Prompt Suggestions Management ---

const DEFAULT_SUGGESTIONS = [

  { text: "Explain like I'm 5 years old. Provide 3 core takeaways.", name: "Simple Explanation" },

  { text: "Focus on actionable steps and practical implementation.", name: "Action-Oriented" },

  { text: "Summarize in bullet points with key insights.", name: "Bullet Summary" },

  { text: "Identify pros and cons of the main points.", name: "Pros & Cons" },

  { text: "Extract and explain technical terms used.", name: "Technical Terms" },

  { text: "Provide a timeline of events discussed.", name: "Timeline" },

  { text: "Summarize for a business audience with ROI focus.", name: "Business Summary" },

  { text: "Highlight controversial points and different perspectives.", name: "Critical Analysis" }

];



async function loadPromptSuggestions() {

  if (!summaryPromptSuggestionsListEl) return;

  

  try {

    const historyData = await api.storage.local.get(PROMPT_HISTORY_KEY);

    const history = Array.isArray(historyData[PROMPT_HISTORY_KEY]) ? historyData[PROMPT_HISTORY_KEY] : [];

    

    const suggestions = [...DEFAULT_SUGGESTIONS];

    

    const usedTexts = new Set(suggestions.map(s => s.text));

    

    history.slice(0, 5).forEach(entry => {

      if (entry.promptText && !usedTexts.has(entry.promptText)) {

        suggestions.push({

          text: entry.promptText,

          name: "From History"

        });

        usedTexts.add(entry.promptText);

      }

    });

    

    summaryPromptSuggestionsListEl.innerHTML = "";

    

    if (suggestions.length === 0) {

      summaryPromptSuggestionsListEl.innerHTML = '<span class="hint" style="color:#666;font-size:11px;">Tiada saranan</span>';

      return;

    }

    

    suggestions.slice(0, 8).forEach((suggestion, i) => {

      const chip = document.createElement("button");

      chip.type = "button";

      chip.className = "suggestion-chip";

      chip.dataset.suggestion = suggestion.text;

      chip.textContent = suggestion.name;

      chip.style.cssText = "padding:4px 10px;border-radius:12px;border:1px solid #555;background:#2a2a2a;color:#ddd;font-size:11px;cursor:pointer;transition:all 0.2s;";

      chip.title = suggestion.text;

      

      chip.addEventListener("mouseenter", () => {

        chip.style.borderColor = "#7fcfa0";

        chip.style.background = "#1a3a2a";

      });

      chip.addEventListener("mouseleave", () => {

        chip.style.borderColor = "#555";

        chip.style.background = "#2a2a2a";

      });

      

      summaryPromptSuggestionsListEl.appendChild(chip);

    });

  } catch (err) {

    console.error("Error loading suggestions:", err);

  }

}



if (summaryPromptSuggestionsListEl) {

  summaryPromptSuggestionsListEl.addEventListener("click", (e) => {

    const target = e.target;

    if (target.classList.contains("suggestion-chip")) {

      const suggestion = target.dataset.suggestion;

      if (summaryCustomPromptEl) {

        summaryCustomPromptEl.value = suggestion;

        handleSettingChange();

        updatePromptCharCount();

      }

      setSaveStatus("✓ Saranan diaplikasi.", false);

    }

  });

}



loadPromptSuggestions();



// --- Template Export/Import Management ---

if (exportPromptTemplatesEl) {

  exportPromptTemplatesEl.addEventListener("click", async () => {

    try {

      const data = await api.storage.local.get(PROMPT_TEMPLATES_KEY);

      const templates = Array.isArray(data[PROMPT_TEMPLATES_KEY]) ? data[PROMPT_TEMPLATES_KEY] : [];

      

      if (templates.length === 0) {

        setSaveStatus("Tiada templat untuk diexport.", true);

        return;

      }

      

      const exportData = {

        version: "1.0",

        exportDate: new Date().toISOString(),

        templates: templates

      };

      

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });

      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");

      a.href = url;

      a.download = "prompt-templates-" + new Date().toISOString().slice(0, 10) + ".json";

      document.body.appendChild(a);

      a.click();

      document.body.removeChild(a);

      URL.revokeObjectURL(url);

      

      setSaveStatus("✓ " + templates.length + " templat berjaya diexport.", false);

    } catch (err) {

      console.error("Error exporting templates:", err);

      setSaveStatus("Gagal export templat: " + (err.message || "Unknown error"), true);

    }

  });

}



if (importPromptTemplatesEl && importPromptTemplatesFileEl) {

  importPromptTemplatesEl.addEventListener("click", () => {

    importPromptTemplatesFileEl.click();

  });

  

  importPromptTemplatesFileEl.addEventListener("change", async (e) => {

    const file = e.target.files[0];

    if (!file) return;

    

    try {

      const text = await file.text();

      const importData = JSON.parse(text);

      

      if (!Array.isArray(importData.templates)) {

        setSaveStatus("Format fail tidak sah. Tiada array templat dijumpai.", true);

        return;

      }

      

      const validTemplates = importData.templates.filter(t => 

        t && typeof t.name === "string" && typeof t.text === "string"

      );

      

      if (validTemplates.length === 0) {

        setSaveStatus("Tiada templat sah dalam fail.", true);

        return;

      }

      

      const action = confirm(`Import ${validTemplates.length} templat?\n\nKlik OK untuk tambah ke templat sedia ada.\nKlik Cancel untuk gantikan semua templat.`);

      

      const data = await api.storage.local.get(PROMPT_TEMPLATES_KEY);

      const existingTemplates = Array.isArray(data[PROMPT_TEMPLATES_KEY]) ? data[PROMPT_TEMPLATES_KEY] : [];

      

      let finalTemplates;

      if (action) {

        finalTemplates = [...existingTemplates, ...validTemplates];

      } else {

        finalTemplates = validTemplates;

      }

      

      await api.storage.local.set({ [PROMPT_TEMPLATES_KEY]: finalTemplates });

      await loadPromptTemplates();

      setSaveStatus("✓ " + validTemplates.length + " templat berjaya diimport.", false);

      

      importPromptTemplatesFileEl.value = "";

    } catch (err) {

      console.error("Error importing templates:", err);

      setSaveStatus("Gagal import templat: " + (err.message || "Unknown error"), true);

      importPromptTemplatesFileEl.value = "";

    }

  });

}



if (closePreviewModalEl && templatePreviewModalEl) {

  closePreviewModalEl.addEventListener("click", () => {

    templatePreviewModalEl.style.display = "none";

  });

  

  templatePreviewModalEl.addEventListener("click", (e) => {

    if (e.target === templatePreviewModalEl) {

      templatePreviewModalEl.style.display = "none";

    }

  });

}







// --- End Prompt Template Management ---

closeOnSaveEl.addEventListener("change", handleSettingChange);

closeOnSaveAllTabsEl.addEventListener("change", handleSettingChange);

floatingButtonEnabledEl.addEventListener("change", handleSettingChange);

if (floatingButtonAutoSuspendTabThresholdEl) {

  floatingButtonAutoSuspendTabThresholdEl.addEventListener("change", handleSettingChange);

}

if (floatingButtonVisibilityModeEl) floatingButtonVisibilityModeEl.addEventListener("change", handleSettingChange);

if (miniCategoryTriggerDirectionEl) miniCategoryTriggerDirectionEl.addEventListener("change", handleSettingChange);

if (miniCategoryPanelLayoutEl) miniCategoryPanelLayoutEl.addEventListener("change", handleSettingChange);

if (floatingButtonLongPressDurationEl) floatingButtonLongPressDurationEl.addEventListener("change", handleSettingChange);

if (floatingButtonCategoryPickerLongPressDurationEl) floatingButtonCategoryPickerLongPressDurationEl.addEventListener("change", handleSettingChange);

if (floatingButtonLongPressSwapEl) floatingButtonLongPressSwapEl.addEventListener("change", handleSettingChange);

if (categoryPickerMouseGestureEl) categoryPickerMouseGestureEl.addEventListener("change", handleSettingChange);

if (blockPickerOnTextCursorEl) blockPickerOnTextCursorEl.addEventListener("change", handleSettingChange);



// Gesturefy-style collapsible toggle handler

for (const el of document.querySelectorAll("[data-collapse]")) {

  el.addEventListener("change", function() {

    const target = document.querySelector(this.dataset.collapse);

    if (target) {

      if (this.checked) {

        target.style.height = target.scrollHeight + "px";

        target.classList.remove("hide");

        target.addEventListener("transitionend", function handler() {

          target.style.height = "auto";

          target.removeEventListener("transitionend", handler);

        }, { once: true });

      } else {

        target.style.height = target.scrollHeight + "px";

        requestAnimationFrame(() => {

          target.style.height = "0px";

          target.classList.add("hide");

        });

      }

    }

  });

  // Initial state

  const target = document.querySelector(el.dataset.collapse);

  if (target) {

    if (el.checked) {

      target.style.height = "auto";

      target.classList.remove("hide");

    } else {

      target.style.height = "0px";

      target.classList.add("hide");

    }

  }

}



if (floatingSubButtonSizeEl) floatingSubButtonSizeEl.addEventListener("input", handleSettingChange);

if (floatingButtonSensitivityEl) floatingButtonSensitivityEl.addEventListener("change", handleSettingChange);

if (floatingButtonHideTimeEl) floatingButtonHideTimeEl.addEventListener("change", handleSettingChange);

floatingButtonAnimationEl.addEventListener("change", handleSettingChange);

// floatingButtonAnchor UI listener removed

if (ctrlAltLinkSaveEnabledEl) ctrlAltLinkSaveEnabledEl.addEventListener("change", handleSettingChange);

if (linkSaveModifierComboEl) linkSaveModifierComboEl.addEventListener("change", handleSettingChange);

if (linkSaveMouseButtonEl) linkSaveMouseButtonEl.addEventListener("change", handleSettingChange);

if (linkSaveBundleModifierEl) linkSaveBundleModifierEl.addEventListener("change", handleSettingChange);

if (linkSaveBundleDurationEl) linkSaveBundleDurationEl.addEventListener("change", handleSettingChange);

if (linkSaveDirectModifierEl) linkSaveDirectModifierEl.addEventListener("change", handleSettingChange);

if (linkSaveActiveCategoryModifierEl) linkSaveActiveCategoryModifierEl.addEventListener("change", handleSettingChange);

if (linkSavePromptCategoryEnabledEl) linkSavePromptCategoryEnabledEl.addEventListener("change", handleSettingChange);

if (floatingButtonIconEl) {

  floatingButtonIconEl.addEventListener("change", () => {

    const val = floatingButtonIconEl.value;

    if (val === "custom" && !customFloatingIconDataUrl) {

      setSaveStatus("Upload icon dulu untuk pilihan Custom.", true);

      floatingButtonIconEl.value = FLOATING_ICON_CHOICES[0].value;

    }

    if (val.startsWith("custom:")) {

      const exists = customFloatingIcons.some((c) => c && `custom:${c.id}` === val);

      if (!exists) {

        floatingButtonIconEl.value = FLOATING_ICON_CHOICES[0].value;

      }

    }

    updateFloatingIconPreview(floatingButtonIconEl.value);

    handleSettingChange();

  });

}

// Reset floating button position handler

if (resetFloatingPositionBtn) {

  resetFloatingPositionBtn.addEventListener("click", async () => {

    try {

      const partial = {

        floatingButtonAnchor: "custom",

        floatingButtonAnchorX: "right",

        floatingButtonAnchorY: "bottom",

        floatingButtonOffsetX: 10,

        floatingButtonOffsetY: 50

      };

      await setSettings(partial);

      const settings = await getSettings();

      pendingSettings = { ...settings };

      applySettings(settings);

      setSaveStatus("Floating button position reset.", false);

    } catch (err) {

      setSaveStatus("Failed to reset position.", true);

    }

  });

}

if (uploadFloatingIconBtn && floatingButtonCustomIconInput) {

  uploadFloatingIconBtn.addEventListener("click", () => {

    floatingButtonCustomIconInput.click();

  });

}

if (floatingButtonCustomIconInput) {

  floatingButtonCustomIconInput.addEventListener("change", async () => {

    const file = floatingButtonCustomIconInput.files && floatingButtonCustomIconInput.files[0];

    if (!file) return;

    const allowedTypes = new Set(["image/png", "image/svg+xml", "image/gif", ""]);

    const ext = (file.name || "").toLowerCase();

    const looksAllowedExt = ext.endsWith(".png") || ext.endsWith(".svg") || ext.endsWith(".gif");

    if (!allowedTypes.has(file.type) && !looksAllowedExt) {

      setSaveStatus("Hanya PNG, SVG, atau GIF dibenarkan.", true);

      floatingButtonCustomIconInput.value = "";

      return;

    }

    if (file.size > MAX_UPLOAD_BYTES) { // 2 MB cap to keep storage light

      setSaveStatus("Icon terlalu besar (maks 2MB).", true);

      floatingButtonCustomIconInput.value = "";

      return;

    }

    try {

      const dataUrl = await readFileAsDataUrl(file);

      const newBytes = estimateDataUrlBytes(dataUrl);

      const currentBytes = customFloatingIcons.reduce((sum, c) => sum + estimateDataUrlBytes(c && c.dataUrl), 0);

      if (currentBytes + newBytes > MAX_CUSTOM_ICON_BYTES) {

        setSaveStatus("Jumlah ikon custom melebihi had (20MB). Padamkan beberapa ikon dahulu.", true);

        return;

      }

      const base = (file.name || "Custom").replace(/\.[^.]+$/, "");

      const label = base ? base.slice(0, 40) : "Custom";

      const id = String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8);

      const entry = { id, label, dataUrl };

      customFloatingIcons = [entry, ...customFloatingIcons].slice(0, MAX_CUSTOM_ICON_SLOTS);

      populateFloatingIconOptions();

      if (floatingButtonIconEl) floatingButtonIconEl.value = `custom:${id}`;

      updateFloatingIconPreview(`custom:${id}`);

      handleSettingChange();

      setSaveStatus("Custom icon dimuat naik.", false);

    } catch (err) {

      setSaveStatus("Gagal baca fail icon.", true);

    } finally {

      floatingButtonCustomIconInput.value = "";

    }

  });

}

if (uploadHoverSoundBtn && hoverSoundFileEl) {

  uploadHoverSoundBtn.addEventListener("click", () => hoverSoundFileEl.click());

}

if (hoverSoundFileEl) {

  hoverSoundFileEl.addEventListener("change", async () => {

    const file = hoverSoundFileEl.files && hoverSoundFileEl.files[0];

    if (!file) return;

    const allowed = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/webm", ""]);

    const name = file.name || "audio";

    if (!allowed.has(file.type)) {

      setHoverSoundStatus("Fail: format tidak disokong (guna MP3/WAV/OGG).", true);

      hoverSoundFileEl.value = "";

      return;

    }

    if (file.size > MAX_HOVER_SOUND_BYTES) {

      setHoverSoundStatus("Fail: saiz melebihi 400KB.", true);

      hoverSoundFileEl.value = "";

      return;

    }

    try {

      const dataUrl = await readFileAsDataUrl(file);

      const id = `sound-${Date.now().toString(36)}`;

      const label = name.slice(0, 60) || "Audio";

      customHoverSounds = [{ id, label, dataUrl }, ...customHoverSounds].slice(0, 10);

      renderHoverSoundOptions(id);

      setHoverSoundStatus(`Custom sound dimuat naik (${name}).`, false);

      handleSettingChange();

    } catch (err) {

      setHoverSoundStatus("Gagal muat naik audio.", true);

    } finally {

      hoverSoundFileEl.value = "";

    }

  });

}

if (clearHoverSoundBtn) {

  clearHoverSoundBtn.addEventListener("click", () => {

    const selectedId = hoverSoundSelectEl ? hoverSoundSelectEl.value : "";

    if (!selectedId) return;

    customHoverSounds = customHoverSounds.filter((s) => s.id !== selectedId);

    const nextId = customHoverSounds[0] ? customHoverSounds[0].id : "";

    renderHoverSoundOptions(nextId);

    setHoverSoundStatus("Custom sound dibuang.", false);

    handleSettingChange();

  });

}

if (clearFloatingIconBtn) {

  clearFloatingIconBtn.addEventListener("click", () => {

    const val = floatingButtonIconEl ? floatingButtonIconEl.value : "";

    if (val && val.startsWith("custom:")) {

      const targetId = val.slice("custom:".length);

      customFloatingIcons = customFloatingIcons.filter((c) => c && c.id !== targetId);

    } else {

      customFloatingIcons = [];

    }

    populateFloatingIconOptions();

    if (floatingButtonIconEl) floatingButtonIconEl.value = FLOATING_ICON_CHOICES[0].value;

    updateFloatingIconPreview(floatingButtonIconEl ? floatingButtonIconEl.value : FLOATING_ICON_CHOICES[0].value);

    handleSettingChange();

    setSaveStatus("Custom icon dibuang.", false);

  });

}

if (deleteFloatingIconBtn) {

  deleteFloatingIconBtn.addEventListener("click", () => {

    if (!floatingButtonIconEl) return;

    const val = floatingButtonIconEl.value;

    if (!val.startsWith("custom:")) {

      setSaveStatus("Pilih ikon custom untuk dipadam.", true);

      return;

    }

    const targetId = val.slice("custom:".length);

    const beforeCount = customFloatingIcons.length;

    customFloatingIcons = customFloatingIcons.filter((c) => c && c.id !== targetId);

    if (customFloatingIcons.length === beforeCount) {

      setSaveStatus("Ikon custom tidak ditemui.", true);

      return;

    }

    populateFloatingIconOptions();

    floatingButtonIconEl.value = FLOATING_ICON_CHOICES[0].value;

    updateFloatingIconPreview(floatingButtonIconEl.value);

    handleSettingChange();

    setSaveStatus("Ikon custom dipadam.", false);

  });

}

if (floatingButtonShowAnimDurationEl) floatingButtonShowAnimDurationEl.addEventListener("change", handleSettingChange);

if (floatingButtonHideAnimDurationEl) floatingButtonHideAnimDurationEl.addEventListener("change", handleSettingChange);

if (floatingButtonDomainExceptionsEl) floatingButtonDomainExceptionsEl.addEventListener("input", handleSettingChange);

if (showHiddenCategoriesEl) showHiddenCategoriesEl.addEventListener("change", handleSettingChange);

if (categoryPaletteShortcutEl) categoryPaletteShortcutEl.addEventListener("input", handleSettingChange);

if (showHiddenCategoriesEl) {

  showHiddenCategoriesEl.addEventListener("change", () => {

    categoryPage = 1;

    loadCategoryVisibilityList(true);

  });

}



if (toggleCategoryListBtn) {

  toggleCategoryListBtn.addEventListener("click", () => {

    categoryListHidden = !categoryListHidden;

    updateCategoryListVisibility();

    if (!categoryListHidden) {

      loadCategoryVisibilityList();

    }

  });

}



if (prevCategoryPageBtn) {

  prevCategoryPageBtn.addEventListener("click", () => {

    if (categoryPage <= 1) return;

    categoryPage -= 1;

    loadCategoryVisibilityList();

  });

}



if (nextCategoryPageBtn) {

  nextCategoryPageBtn.addEventListener("click", () => {

    if (categoryPage >= totalCategoryPages) return;

    categoryPage += 1;

    loadCategoryVisibilityList();

  });

}



if (toggleKeyboardListBtn) {

  toggleKeyboardListBtn.addEventListener("click", () => {

    keyboardListHidden = !keyboardListHidden;

    updateKeyboardListVisibility();

    if (!keyboardListHidden) {

      loadKeyboardShortcutList();

    }

  });

}



if (prevKeyboardPageBtn) {

  prevKeyboardPageBtn.addEventListener("click", () => {

    if (keyboardPage <= 1) return;

    keyboardPage -= 1;

    loadKeyboardShortcutList();

  });

}



if (nextKeyboardPageBtn) {

  nextKeyboardPageBtn.addEventListener("click", () => {

    if (keyboardPage >= totalKeyboardPages) return;

    keyboardPage += 1;

    loadKeyboardShortcutList();

  });

}



if (openShortcutManagerBtn) {

  openShortcutManagerBtn.addEventListener("click", () => {

    const ua = (navigator && navigator.userAgent ? navigator.userAgent.toLowerCase() : "");

    const isEdge = ua.includes("edg/");

    const isFirefox = ua.includes("firefox");

    const url = isFirefox

      ? "about:addons"

      : (isEdge ? "edge://extensions/shortcuts" : "chrome://extensions/shortcuts");

    try {

      if (api.tabs && api.tabs.create) {

        api.tabs.create({ url });

      } else {

        window.open(url, "_blank");

      }

    } catch (err) {

      window.open(url, "_blank");

    }

  });

}



if (openSelectionSearchSettingsBtn) {

  openSelectionSearchSettingsBtn.addEventListener("click", () => {

    try {

      window.location.href = "options-sss.html";

    } catch (_err) {

      window.open("options-sss.html", "_self");

    }

  });

}





var openGestureSettingsBtn = document.querySelector("#openGestureSettings");

if (openGestureSettingsBtn) {

  openGestureSettingsBtn.addEventListener("click", () => {

    window.location.href = "gesture-settings.html";

  });

}



if (rediscoverEnabledEl) rediscoverEnabledEl.addEventListener("change", handleSettingChange);

if (rediscoverIntervalEl) rediscoverIntervalEl.addEventListener("change", handleSettingChange);

if (rediscoverIntervalUnitEl) {

  rediscoverIntervalUnitEl.addEventListener("change", function () {

    const oldUnit = _lastRediscoverUnit;

    const newUnit = this.value;

    const rawVal = rediscoverIntervalEl ? rediscoverIntervalEl.value : "";

    const num = Number.parseFloat(rawVal);

    if (Number.isFinite(num) && num > 0 && oldUnit !== newUnit) {

      const unitToSec = { jam: 3600, minit: 60, saat: 1 };

      const secToUnit = { jam: 1 / 3600, minit: 1 / 60, saat: 1 };

      const seconds = num * (unitToSec[oldUnit] || 1);

      const converted = seconds * (secToUnit[newUnit] || 1);

      rediscoverIntervalEl.value = String(Math.round(converted * 100) / 100);

    }

    _lastRediscoverUnit = newUnit;

    handleSettingChange();

  });

}

if (rediscoverDismissAfterEl) rediscoverDismissAfterEl.addEventListener("change", handleSettingChange);

rediscoverModeRadios.forEach((radio) => {

  radio.addEventListener("change", handleSettingChange);

});

if (rediscoverColorEl) rediscoverColorEl.addEventListener("input", handleSettingChange);

if (rediscoverResetCursorBtn) {

  rediscoverResetCursorBtn.addEventListener("click", async () => {

    try {

      const s = await getSettings();

      s.rediscoverCursor = null;

      await setSettings(s);

      pendingSettings.rediscoverCursor = null;

      setSaveStatus("✓ Progress rediscover direset ke link paling lama.", false);

    } catch (err) {

      setSaveStatus("Gagal reset progress.", true);

    }

  });

}



if (openNativeHelperSetupBtn) {

  openNativeHelperSetupBtn.addEventListener("click", () => {

    try {

      window.location.href = "native-helper-setup.html";

    } catch (_err) {

      window.open("native-helper-setup.html", "_self");

    }

  });

}



// Autosave is now enabled - no manual save button needed

// saveSettingsBtn.addEventListener("click", saveSettings);



shortcutInputs.forEach((inputEl) => {

  inputEl.addEventListener("focus", () => startListening(inputEl));

  inputEl.addEventListener("click", () => startListening(inputEl));

  inputEl.addEventListener("keydown", handleShortcutKeydown);

  inputEl.addEventListener("blur", stopListening);

});



shortcutClearButtons.forEach((buttonEl) => {

  buttonEl.addEventListener("click", () => {

    const commandName = buttonEl.dataset.command;

    if (!commandName) return;

    const inputEl = shortcutInputs.find((input) => input.dataset.command === commandName);

    applyShortcut(commandName, "", inputEl);

  });

});



function handleCategoryPaletteShortcutKeydown(event) {

  if (!categoryPaletteShortcutEl || event.target !== categoryPaletteShortcutEl) return;

  event.preventDefault();

  event.stopPropagation();



  if (event.key === "Escape") {

    categoryPaletteShortcutEl.value = pendingSettings.categoryPaletteShortcut || DEFAULT_SETTINGS.categoryPaletteShortcut;

    return;

  }

  if ((event.key === "Backspace" || event.key === "Delete") && !event.ctrlKey && !isAltPressed(event) && !event.shiftKey && !event.metaKey) {

    categoryPaletteShortcutEl.value = "";

    handleSettingChange();

    return;

  }

  if (isModifierKey(event.key)) return;

  const shortcutValue = buildShortcut(event);

  if (!shortcutValue) {

    setSaveStatus("Key tidak disokong.", true);

    return;

  }

  categoryPaletteShortcutEl.value = shortcutValue;

  setSaveStatus("Shortcut dikemas kini (belum disimpan).", false);

  handleSettingChange();

}



if (categoryPaletteShortcutEl) {

  categoryPaletteShortcutEl.addEventListener("keydown", handleCategoryPaletteShortcutKeydown);

  categoryPaletteShortcutEl.addEventListener("focus", () => categoryPaletteShortcutEl.select());

}



function getPickerPageShortcutStoredValue(settingKey) {

  if (!settingKey) return "";

  const raw = pendingSettings && typeof pendingSettings[settingKey] === "string"

    ? pendingSettings[settingKey]

    : DEFAULT_SETTINGS[settingKey];

  return typeof raw === "string" ? raw.trim() : "";

}



function handlePickerPageShortcutKeydown(event) {

  const inputEl = event.target;

  const settingKey = inputEl && inputEl.dataset ? inputEl.dataset.settingKey : "";

  if (!settingKey) return;

  event.preventDefault();

  event.stopPropagation();



  if (event.key === "Escape") {

    inputEl.value = getPickerPageShortcutStoredValue(settingKey);

    return;

  }

  if ((event.key === "Backspace" || event.key === "Delete") && !event.ctrlKey && !isAltPressed(event) && !event.shiftKey && !event.metaKey) {

    inputEl.value = "";

    setSaveStatus("Shortcut dikosongkan (belum disimpan).", false);

    handleSettingChange();

    return;

  }

  if (isModifierKey(event.key)) return;

  const shortcutValue = buildShortcut(event);

  if (!shortcutValue) {

    setSaveStatus("Key tidak disokong.", true);

    return;

  }

  inputEl.value = shortcutValue;

  setSaveStatus("Shortcut dikemas kini (belum disimpan).", false);

  handleSettingChange();

}



pickerPageShortcutInputs.forEach((inputEl) => {

  inputEl.addEventListener("keydown", handlePickerPageShortcutKeydown);

  inputEl.addEventListener("focus", () => inputEl.select());

});



api.storage.onChanged.addListener((changes, area) => {

  if (area !== "local") return;

  if (changes[SETTINGS_KEY]) {

    if (dirty) {

      setSaveStatus("Settings changed elsewhere. Save to overwrite.", true);

      return;

    }

    const next = mergeSettings(changes[SETTINGS_KEY].newValue);

    pendingSettings = { ...next };

    applySettings(next);

  }

  if (changes[CATEGORY_KEY]) {

    loadCategoryVisibilityList();

  }

});

let _downloadInProgress = false;
let _autoSyncTimer = null;
let _autoSyncRunning = false;
let _autoSyncNeeded = false;
let _autoSyncLastChange = 0;
// Debounce: 500ms. Selepas perubahan pertama, timer akan reset jika ada perubahan lagi.
const _AUTO_SYNC_DEBOUNCE_MS = 500;

const _AUTO_SYNC_DATA_KEYS = new Set([
  'items', 'categories', 'selectedCategory',
  'sidebarNotes', 'sidebarNoteFolders', 'sidebarNotesUi',
  'trashItems', 'summaryPromptTemplates',
  'categoryPickerLastLocation', 'summaryModePreference',
  'sidebarNoteAttachments',
  'settings'
]);

// Auto-sync dihandle oleh background.js — options page tak perlu auto-sync sendiri

// 🔧 Backup (export / import) handlers





function setBackupStatus(message, isError) {

  if (!backupStatusEl) return;

  backupStatusEl.textContent = message || "";

  backupStatusEl.classList.toggle("error", !!isError);

  if (backupProgressEl) {

    backupProgressEl.style.display = message && message.includes("Processing") ? "block" : "none";

  }

}



function coerceArray(value) {

  if (Array.isArray(value)) return value;

  if (value && typeof value === "object") return Object.values(value);

  return [];

}



function hasOwn(obj, key) {

  return !!(obj && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, key));

}



function getImportedBackupValue(payload, keys) {

  const sources = [payload];

  if (payload && typeof payload === "object") {

    if (payload.storage && typeof payload.storage === "object") sources.push(payload.storage);

    if (payload.local && typeof payload.local === "object") sources.push(payload.local);

    if (payload.data && typeof payload.data === "object") sources.push(payload.data);

  }

  for (const source of sources) {

    for (const key of keys) {

      if (hasOwn(source, key)) {

        return source[key];

      }

    }

  }

  return undefined;

}



function normalizeImportedFolderName(value) {

  const raw = value ? String(value).replace(/\s+/g, " ").trim() : "";

  return raw.slice(0, 60);

}



function normalizeImportedNoteFolders(rawFolders) {

  const next = [];

  const seenIds = new Set();

  const seenNames = new Set();

  coerceArray(rawFolders).forEach((entry, index) => {

    if (!entry || typeof entry !== "object") return;

    const name = normalizeImportedFolderName(

      entry.name || entry.label || entry.title || entry.folderName || entry.categoryName

    );

    if (!name) return;

    const idSource = entry.id || entry.folderId || entry.categoryId || entry.key || "";

    const id = idSource

      ? String(idSource).trim().slice(0, 80)

      : `folder-${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "imported"}`;

    if (!id || id === "general" || seenIds.has(id)) return;

    const loweredName = name.toLowerCase();

    if (seenNames.has(loweredName)) return;

    seenIds.add(id);

    seenNames.add(loweredName);

    next.push({

      id,

      name,

      order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : index,

      createdAt: entry.createdAt || entry.created || entry.addedAt || new Date().toISOString()

    });

  });

  return next.sort((left, right) => {

    const orderDiff = Number(left.order || 0) - Number(right.order || 0);

    if (orderDiff) return orderDiff;

    return String(left.name || "").localeCompare(String(right.name || ""), undefined, { sensitivity: "base" });

  });

}



function normalizeImportedNotes(rawNotes, folders) {

  const normalizedFolders = Array.isArray(folders) ? folders : [];

  const folderIdByKey = new Map();

  normalizedFolders.forEach((folder) => {

    if (!folder || typeof folder !== "object" || !folder.id) return;

    const id = String(folder.id).trim();

    const name = folder.name ? String(folder.name).trim().toLowerCase() : "";

    if (id) folderIdByKey.set(id, id);

    if (name) folderIdByKey.set(name, id);

  });



  const notes = [];

  const seenIds = new Set();

  const importStamp = Date.now().toString(36);

  coerceArray(rawNotes).forEach((entry, index) => {

    if (!entry || typeof entry !== "object") return;

    let id = entry.id || entry.noteId || entry.uuid || entry._id || "";

    id = id ? String(id).trim().slice(0, 80) : `imported-note-${importStamp}-${index}`;

    if (!id) return;

    if (seenIds.has(id)) {

      id = `${id.slice(0, 64)}-${index}`;

    }

    seenIds.add(id);



    const title = entry.title != null

      ? entry.title

      : entry.name != null

        ? entry.name

        : entry.label != null

          ? entry.label

          : "";

    const content = entry.content != null

      ? entry.content

      : entry.body != null

        ? entry.body

        : entry.text != null

          ? entry.text

          : entry.note != null

            ? entry.note

            : entry.value != null

              ? entry.value

              : "";

    const rawFolderValue = entry.folderId != null

      ? entry.folderId

      : entry.noteFolderId != null

        ? entry.noteFolderId

        : entry.categoryId != null

          ? entry.categoryId

          : entry.folder != null

            ? entry.folder

            : entry.category != null

              ? entry.category

              : entry.folderName != null

                ? entry.folderName

                : entry.categoryName != null

                  ? entry.categoryName

                  : "";

    const folderLookupKey = rawFolderValue ? String(rawFolderValue).trim() : "";

    const folderId = folderLookupKey

      ? (folderIdByKey.get(folderLookupKey) || folderIdByKey.get(folderLookupKey.toLowerCase()) || "")

      : "";

    const isPinned = entry.isPinned === true || entry.pinned === true;

    const createdAt = entry.createdAt || entry.created || entry.addedAt || new Date().toISOString();

    const updatedAt = entry.updatedAt || entry.updated || entry.modifiedAt || entry.lastEditedAt || createdAt;

    const pinnedAt = isPinned

      ? (entry.pinnedAt || entry.favoriteAt || updatedAt || createdAt)

      : "";



    notes.push({

      id,

      title: title == null ? "" : String(title).slice(0, 120),

      content: content == null ? "" : String(content).slice(0, 200000),

      folderId,

      isPinned,

      pinnedAt: pinnedAt ? String(pinnedAt) : "",

      createdAt: String(createdAt),

      updatedAt: String(updatedAt)

    });

  });

  return notes;

}



function normalizeImportedNotesUi(rawUi) {

  return rawUi && typeof rawUi === "object" ? rawUi : null;

}



function normalizeImportedItems(rawItems) {

  if (importCore && typeof importCore.normalizeImportedItems === "function") {

    return importCore.normalizeImportedItems(rawItems);

  }

  const list = coerceArray(rawItems);

  const normalized = [];

  list.forEach((entry) => {

    if (!entry || typeof entry !== "object") return;

    try {

      const parsed = new URL(String(entry.url || "").trim());

      const protocol = String(parsed.protocol || "").toLowerCase();

      if (protocol !== "http:" && protocol !== "https:" && protocol !== "file:") return;

      parsed.hash = "";

      normalized.push({ ...entry, url: parsed.toString() });

    } catch (_err) {

      // ignore malformed URL

    }

  });

  return normalized;

}



async function exportBackup() {

  try {

    setBackupStatus("Preparing backup with notes...", false);



    if (dirty) {

      await saveSettings();

    }



    const [data, fullSettings, commands] = await Promise.all([

      api.storage.local.get([

        ITEM_KEY,

        CATEGORY_KEY,

        SELECTED_CATEGORY_KEY,

        SIDEBAR_NOTES_KEY,

        SIDEBAR_NOTE_FOLDERS_KEY,

        SIDEBAR_NOTES_UI_KEY,

        TRASH_KEY,

        PROMPT_TEMPLATES_KEY,

        CATEGORY_PICKER_LAST_LOCATION_KEY,

        SUMMARY_MODE_PREFERENCE_KEY,

        ATTACHMENTS_KEY

      ]),

      getSettings(),

      api.commands ? api.commands.getAll() : Promise.resolve([])

    ]);



    const payload = {

      items: coerceArray(data[ITEM_KEY]),

      categories: coerceArray(data[CATEGORY_KEY]),

      selectedCategory: data[SELECTED_CATEGORY_KEY] ? data[SELECTED_CATEGORY_KEY] : "none",

      notes: coerceArray(data[SIDEBAR_NOTES_KEY]),

      noteFolders: coerceArray(data[SIDEBAR_NOTE_FOLDERS_KEY]),

      notesUi: data[SIDEBAR_NOTES_UI_KEY] && typeof data[SIDEBAR_NOTES_UI_KEY] === "object"

        ? data[SIDEBAR_NOTES_UI_KEY]

        : null,

      trash: coerceArray(data[TRASH_KEY]),

      promptTemplates: Array.isArray(data[PROMPT_TEMPLATES_KEY]) ? data[PROMPT_TEMPLATES_KEY] : null,

      categoryPickerLastLocation: data[CATEGORY_PICKER_LAST_LOCATION_KEY] && typeof data[CATEGORY_PICKER_LAST_LOCATION_KEY] === "object"

        ? data[CATEGORY_PICKER_LAST_LOCATION_KEY]

        : null,

      summaryModePreference: data[SUMMARY_MODE_PREFERENCE_KEY] || null,

      attachments: data[ATTACHMENTS_KEY] && typeof data[ATTACHMENTS_KEY] === "object"

        ? data[ATTACHMENTS_KEY]

        : null,

      settings: fullSettings,

      shortcuts: commands.map((command) => ({ name: command.name, shortcut: command.shortcut })),

      meta: { exportedAt: new Date().toISOString(), version: 3 }

    };

    const json = JSON.stringify(payload, null, 2);

    const blob = new Blob([json], { type: "application/json" });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

    link.href = url;

    link.download = `local-pocket-backup-${stamp}.json`;

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);

    setBackupStatus("Backup with notes saved.", false);

  } catch (err) {

    console.error("Export failed", err);

    setBackupStatus("Export failed.", true);

  }

}



async function restoreFromBackupPayload(parsed, statusFn) {

  const api = typeof browser !== 'undefined' ? browser : chrome;

  const rawIncomingItemsValue = getImportedBackupValue(parsed, ["items", ITEM_KEY]);

  const rawIncomingItems = typeof rawIncomingItemsValue !== "undefined"
    ? coerceArray(rawIncomingItemsValue) : null;

  const incomingItems = rawIncomingItems ? normalizeImportedItems(rawIncomingItems) : null;

  const dedupedItemCount = rawIncomingItems && incomingItems
    ? Math.max(0, rawIncomingItems.length - incomingItems.length) : 0;

  const rawIncomingCategoriesValue = getImportedBackupValue(parsed, ["categories", CATEGORY_KEY]);

  const incomingCategories = typeof rawIncomingCategoriesValue !== "undefined"
    ? coerceArray(rawIncomingCategoriesValue) : null;

  const incomingSelected = getImportedBackupValue(parsed, ["selectedCategory", "selected", SELECTED_CATEGORY_KEY]);

  const rawIncomingNoteFoldersValue = getImportedBackupValue(parsed, ["noteFolders", SIDEBAR_NOTE_FOLDERS_KEY]);

  const incomingNoteFolders = typeof rawIncomingNoteFoldersValue !== "undefined"
    ? normalizeImportedNoteFolders(rawIncomingNoteFoldersValue) : null;

  const rawIncomingNotesValue = getImportedBackupValue(parsed, ["notes", SIDEBAR_NOTES_KEY]);

  const incomingNotes = typeof rawIncomingNotesValue !== "undefined"
    ? normalizeImportedNotes(rawIncomingNotesValue, incomingNoteFolders || []) : null;

  const rawIncomingNotesUiValue = getImportedBackupValue(parsed, ["notesUi", SIDEBAR_NOTES_UI_KEY]);

  const incomingNotesUi = normalizeImportedNotesUi(rawIncomingNotesUiValue);

  const rawIncomingSettingsValue = getImportedBackupValue(parsed, ["settings", SETTINGS_KEY]);

  const incomingSettings = rawIncomingSettingsValue && typeof rawIncomingSettingsValue === "object"
    ? mergeSettings(rawIncomingSettingsValue) : null;

  const rawIncomingShortcutsValue = getImportedBackupValue(parsed, ["shortcuts"]);

  const incomingShortcuts = typeof rawIncomingShortcutsValue !== "undefined"
    ? coerceArray(rawIncomingShortcutsValue) : null;

  const rawIncomingTrashValue = getImportedBackupValue(parsed, ["trash", TRASH_KEY]);

  const incomingTrash = typeof rawIncomingTrashValue !== "undefined"
    ? coerceArray(rawIncomingTrashValue) : null;

  const rawIncomingPromptTemplatesValue = getImportedBackupValue(parsed, ["promptTemplates", PROMPT_TEMPLATES_KEY]);

  const incomingPromptTemplates = typeof rawIncomingPromptTemplatesValue !== "undefined"
    ? coerceArray(rawIncomingPromptTemplatesValue) : null;

  const rawIncomingPickerLastLocationValue = getImportedBackupValue(parsed, ["categoryPickerLastLocation", CATEGORY_PICKER_LAST_LOCATION_KEY]);

  const incomingPickerLastLocation = rawIncomingPickerLastLocationValue && typeof rawIncomingPickerLastLocationValue === "object"
    ? rawIncomingPickerLastLocationValue : null;

  const rawIncomingSummaryModePreferenceValue = getImportedBackupValue(parsed, ["summaryModePreference", SUMMARY_MODE_PREFERENCE_KEY]);

  const incomingSummaryModePreference = rawIncomingSummaryModePreferenceValue || null;

  const rawIncomingSummaryHistoryIndexValue = getImportedBackupValue(parsed, ["summaryHistoryIndex", SUMMARY_HISTORY_INDEX_KEY]);

  const incomingSummaryHistoryIndex = rawIncomingSummaryHistoryIndexValue || null;

  const rawIncomingSummaryHistoryValue = getImportedBackupValue(parsed, ["summaryHistory"]);

  const incomingSummaryHistory = rawIncomingSummaryHistoryValue && typeof rawIncomingSummaryHistoryValue === "object"
    ? rawIncomingSummaryHistoryValue : null;

  const rawIncomingAttachmentsValue = getImportedBackupValue(parsed, ["attachments", ATTACHMENTS_KEY]);

  const incomingAttachments = rawIncomingAttachmentsValue && typeof rawIncomingAttachmentsValue === "object"
    ? rawIncomingAttachmentsValue : null;

  const notePayloadPresent = incomingNotes !== null || incomingNoteFolders !== null || incomingNotesUi !== null;

  if (!incomingItems && !incomingCategories && !incomingSettings && !incomingNotes && !incomingNoteFolders && !incomingNotesUi) {
    if (typeof statusFn === 'function') statusFn('Backup has no items, categories, notes or settings.', true);
    return false;
  }

  const toSet = {};

  if (incomingCategories) toSet[CATEGORY_KEY] = incomingCategories;
  if (typeof incomingSelected !== "undefined") toSet[SELECTED_CATEGORY_KEY] = incomingSelected;
  if (incomingNotes) toSet[SIDEBAR_NOTES_KEY] = incomingNotes;
  if (incomingNoteFolders) toSet[SIDEBAR_NOTE_FOLDERS_KEY] = incomingNoteFolders;
  if (incomingNotesUi) toSet[SIDEBAR_NOTES_UI_KEY] = incomingNotesUi;
  if (incomingSettings) toSet[SETTINGS_KEY] = incomingSettings;
  if (incomingTrash) toSet[TRASH_KEY] = incomingTrash;
  if (incomingPromptTemplates) toSet[PROMPT_TEMPLATES_KEY] = incomingPromptTemplates;
  if (incomingPickerLastLocation) toSet[CATEGORY_PICKER_LAST_LOCATION_KEY] = incomingPickerLastLocation;
  if (incomingSummaryModePreference) toSet[SUMMARY_MODE_PREFERENCE_KEY] = incomingSummaryModePreference;
  if (incomingSummaryHistoryIndex) toSet[SUMMARY_HISTORY_INDEX_KEY] = incomingSummaryHistoryIndex;
  if (incomingAttachments) toSet[ATTACHMENTS_KEY] = incomingAttachments;

  if (incomingItems) {
    if (typeof statusFn === 'function') statusFn('Processing items...', false);
    const mutation = await api.runtime.sendMessage({
      type: "items-mutate",
      action: "replace-all",
      payload: { items: incomingItems, isImported: true }
    });
    if (!mutation || mutation.ok !== true) {
      throw new Error("Failed to restore items");
    }
  }

  await api.storage.local.set(toSet);

  if (incomingSummaryHistory && typeof incomingSummaryHistory === "object") {
    const summaryHistoryToSet = {};
    for (const [key, value] of Object.entries(incomingSummaryHistory)) {
      if (key.startsWith("summary_history_") && value) {
        summaryHistoryToSet[key] = value;
      }
    }
    if (Object.keys(summaryHistoryToSet).length > 0) {
      await api.storage.local.set(summaryHistoryToSet);
    }
  }

  if (incomingShortcuts && api.commands && api.commands.update) {
    for (const shortcut of incomingShortcuts) {
      try {
        if (shortcut.name && typeof shortcut.shortcut === "string") {
          await api.commands.update({ name: shortcut.name, shortcut: shortcut.shortcut });
        }
      } catch (shortcutErr) {
        console.warn('Could not restore shortcut for ' + shortcut.name, shortcutErr);
      }
    }
  }

  return true;
}

function handleImportFileChange(event) {

  const file = event.target && event.target.files && event.target.files[0];

  if (!file) return;

  const reader = new FileReader();

  reader.onload = async (e) => {

    try {

      setBackupStatus("Parsing file...", false);

      const text = e.target.result;

      const parsed = JSON.parse(text);

      if (!parsed || typeof parsed !== "object") {

        setBackupStatus("Invalid backup file.", true);

        backupFileEl.value = "";

        return;

      }



      const ok = await restoreFromBackupPayload(parsed, setBackupStatus);

      if (!ok) {

        backupFileEl.value = "";

        return;

      }

      setBackupStatus("Backup imported successfully. Page will reload.", false);

      backupFileEl.value = "";

      setTimeout(() => window.location.reload(), 1500);

    } catch (err) {

      console.error("Import failed", err);

      setBackupStatus("Import failed. File may be invalid.", true);

      backupFileEl.value = "";

    }

  };



  reader.onerror = () => {

    setBackupStatus("Could not read file.", true);

    backupFileEl.value = "";

  };

  reader.readAsText(file);

}



function initBackupHandlers() {

  if (!exportBackupBtn || !importBackupBtn || !backupFileEl) {

    console.warn("Backup controls missing", { exportBackupBtn, importBackupBtn, backupFileEl });

    setBackupStatus("Backup controls not found on page.", true);

    return;

  }



  exportBackupBtn.addEventListener("click", async (e) => {

    e.preventDefault();

    setBackupStatus("", false);

    await exportBackup();

  });



  importBackupBtn.addEventListener("click", (e) => {

    e.preventDefault();

    backupFileEl.click();

  });



  backupFileEl.addEventListener("change", handleImportFileChange);

}



// Supabase Auth and Sync Handlers

let authCore = null;

let cloudSync = null;

// Storage keys — same values as supabaseAuthCore.js STORAGE_KEYS for compatibility
const STORAGE_KEYS = {
  ID_TOKEN: 'firebase_id_token',
  USER_UID: 'firebase_user_uid',
  USER_EMAIL: 'firebase_user_email',
  DEVICE_ID: 'firebase_device_id'
};


async function initSupabaseAuth() {

  try {

    // Config is loaded via script tag in HTML as window.supabaseConfig
    const cfg = typeof supabaseConfig !== 'undefined' ? supabaseConfig : null;

    // Check if config is available and not a template
    if (!cfg || !cfg.url || !cfg.anonKey || cfg.anonKey === 'PASTE_YOUR_ANON_KEY_HERE') {
      const w = document.getElementById('supabaseConfigWarning') || document.getElementById('firebaseConfigWarning');
      if (w) w.style.display = 'block';
      return false;
    }

    // Initialize Supabase Auth (also registers as LocalPocketFirebaseAuthCore for compat)
    if (typeof LocalPocketSupabaseAuthCore !== 'undefined') {
      authCore = LocalPocketSupabaseAuthCore;
      authCore.initializeSupabaseAuth(cfg);
    } else if (typeof LocalPocketFirebaseAuthCore !== 'undefined') {
      authCore = LocalPocketFirebaseAuthCore;
      authCore.initializeSupabaseAuth(cfg);
    }

    // Initialize Supabase Sync (also registered as LocalPocketCloudSyncCore + LocalPocketFirestoreSyncCore)
    if (typeof LocalPocketSupabaseSyncCore !== 'undefined') {
      cloudSync = LocalPocketSupabaseSyncCore;
      cloudSync.initializeSync();
    } else if (typeof LocalPocketCloudSyncCore !== 'undefined') {
      cloudSync = LocalPocketCloudSyncCore;
      if (typeof cloudSync.initializeSync === 'function') cloudSync.initializeSync();
      else if (typeof cloudSync.initializeCloudSync === 'function') cloudSync.initializeCloudSync();
    }

    if (authCore) {

      // Check for Google Sign-In redirect result (check URL hash for tokens)
      const hash = window.location.hash;
      if (hash && hash.includes('access_token=')) {
        // Parse Supabase OAuth callback tokens from URL hash
        const params = new URLSearchParams(hash.replace(/^#/, ''));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken) {
          const client = authCore.getSupabaseClient ? authCore.getSupabaseClient() : null;
          if (client) {
            try {
              const { data, error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken || '' });
              if (!error && data && data.user) {
                showUserInfo(data.user.email, data.user.id);
                if (cloudSync) await loadSyncedData();
                // Clean URL
                window.history.replaceState({}, document.title, window.location.pathname);
              }
            } catch (e) { console.error('[Auth] setSession error:', e); }
          }
        }
      }

      // Check if user is already authenticated
      const isAuthenticated = await authCore.isAuthenticated();
      if (isAuthenticated) {
        const authData = await authCore.getStoredAuthData();
        showUserInfo(authData[STORAGE_KEYS.USER_EMAIL], authData[STORAGE_KEYS.USER_UID]);
        updateSyncStatus();
      } else {
        showAuthForms();

      }

    }



    return true;

  } catch (err) {

    console.error('Supabase initialization error:', err);

    document.getElementById('supabaseConfigWarning').style.display = 'block';

    return false;

  }

}



async function checkAuthState() {

  if (!authCore) return;



  const isAuthenticated = await authCore.isAuthenticated();

  

  if (isAuthenticated) {

    const authData = await authCore.getStoredAuthData();

    showUserInfo(authData[STORAGE_KEYS.USER_EMAIL], authData[STORAGE_KEYS.USER_UID]);

    updateSyncStatus();

  } else {

    showAuthForms();

  }

}



function showAuthForms() {

  document.getElementById('authForms').style.display = 'block';

  document.getElementById('userInfo').style.display = 'none';

}



function showUserInfo(email, uid) {

  document.getElementById('authForms').style.display = 'none';

  document.getElementById('userInfo').style.display = 'block';

  document.getElementById('userEmail').textContent = email;

  document.getElementById('userUid').textContent = `UID: ${uid.substring(0, 8)}...`;

}



async function updateSyncStatus() {

  const api = typeof browser !== 'undefined' ? browser : chrome;

  const lastSync = await new Promise((resolve) => {

    api.storage.local.get('cloud_last_sync_time', (r) => {

      resolve(r.cloud_last_sync_time || 0);

    });

  });

  const lastSyncEl = document.getElementById('lastSyncTime');

  

  if (lastSync > 0) {

    const date = new Date(lastSync);

    lastSyncEl.textContent = `Last synced: ${date.toLocaleString()}`;

    document.getElementById('syncStatus').textContent = 'Synced';

  } else {

    lastSyncEl.textContent = 'Not synced yet';

    document.getElementById('syncStatus').textContent = 'Not synced';

  }

}



function setAuthStatus(message, isError = false) {

  const statusEl = document.getElementById('loginStatus');

  if (statusEl) {

    statusEl.textContent = message;

    statusEl.style.color = isError ? '#ff9090' : '#7fcfa0';

  }

}



function setRegisterStatus(message, isError = false) {

  const statusEl = document.getElementById('registerStatus');

  if (statusEl) {

    statusEl.textContent = message;

    statusEl.style.color = isError ? '#ff9090' : '#7fcfa0';

  }

}



function setSyncStatusMessage(message, isError = false) {

  const statusEl = document.getElementById('syncStatusMessage');

  if (statusEl) {

    statusEl.textContent = message;

    statusEl.style.color = isError ? '#ff9090' : '#7fcfa0';

  }

}



async function handleLogin() {

  const email = document.getElementById('loginEmail').value.trim();

  const password = document.getElementById('loginPassword').value;



  if (!email || !password) {

    setAuthStatus('Please enter email and password', true);

    return;

  }



  setAuthStatus('Logging in...', false);



  if (!authCore) {

    setAuthStatus('Supabase not initialized', true);

    return;

  }



  const result = await authCore.login(email, password);



  if (result.success) {

    setAuthStatus('Login successful!', false);

    showUserInfo(result.user.email, result.user.uid);

    

    // Load synced data from Firebase

    if (cloudSync) {

      await loadSyncedData();

    }

  } else {

    setAuthStatus(`Login failed: ${result.error}`, true);

  }

}



async function handleRegister() {

  const email = document.getElementById('registerEmail').value.trim();

  const password = document.getElementById('registerPassword').value;

  const confirmPassword = document.getElementById('registerConfirmPassword').value;



  if (!email || !password || !confirmPassword) {

    setRegisterStatus('Please fill all fields', true);

    return;

  }



  if (password.length < 6) {

    setRegisterStatus('Password must be at least 6 characters', true);

    return;

  }



  if (password !== confirmPassword) {

    setRegisterStatus('Passwords do not match', true);

    return;

  }



  setRegisterStatus('Creating account...', false);



  if (!authCore) {

    setRegisterStatus('Supabase not initialized', true);

    return;

  }



  const result = await authCore.register(email, password);



  if (result.success) {

    setRegisterStatus('Account created successfully!', false);

    showUserInfo(result.user.email, result.user.uid);

  } else {

    setRegisterStatus(`Registration failed: ${result.error}`, true);

  }

}



async function handleGoogleSignIn() {

  setAuthStatus('Opening Google Sign-In...', false);



  const api = typeof browser !== 'undefined' ? browser : chrome;

  try {
    setAuthStatus('Opening Google Sign-In...', false);

    const result = await new Promise((resolve) => {
      api.runtime.sendMessage({ type: 'supabase_google_signin' }, (response) => {
        // response may be undefined if background script doesn't call sendResponse
        resolve(response || null);
      });
    });

    if (!result) {
      // launchWebAuthFlow is async — result comes back via supabase_google_signin_success message
      setAuthStatus('Waiting for Google Sign-In completion...', false);
    } else if (result.success) {
      setAuthStatus('Google Sign-In successful!', false);
      if (result.uid) {
        showUserInfo(result.email || '', result.uid);
        if (cloudSync) await loadSyncedData().catch(() => {});
      }
    } else {
      setAuthStatus(`Google Sign-In failed: ${result.error || 'Unknown error'}`, true);
    }

  } catch (err) {
    console.error('Google Sign-In error:', err);
    setAuthStatus('Google Sign-In failed: ' + (err.message || 'Network error'), true);
  }

}



// Listen for Google Sign-In success from background script

(function setupGoogleSignInListener() {

  const api = typeof browser !== 'undefined' ? browser : chrome;

  api.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (message.type === 'supabase_google_signin_success' || message.type === 'firebase_google_signin_success') {

      setAuthStatus('Authenticating with Supabase...', false);

      

      if (authCore) {
        const client = authCore.getSupabaseClient ? authCore.getSupabaseClient() : null;
        if (client && message.token) {
          client.auth.setSession({
            access_token: message.token,
            refresh_token: message.refreshToken || ''
          }).then(async ({ data, error }) => {
            if (error) {
              console.error('[Auth] setSession error:', error);
              setAuthStatus('Supabase authentication failed', true);
              return;
            }
            const user = data && data.user;
            if (user) {
              setAuthStatus('Google Sign-In successful!', false);
              showUserInfo(user.email, user.id);
              if (cloudSync) await loadSyncedData();
            }
          }).catch((error) => {
            console.error('[Auth] setSession exception:', error);
            setAuthStatus('Supabase authentication failed', true);
          });
        } else {
          // Fallback: store token manually (from background script direct storage)
          setAuthStatus('Google Sign-In successful!', false);
          showUserInfo(message.user && message.user.email, message.user && message.user.uid);
          if (cloudSync) loadSyncedData().catch(() => {});
        }
      }

    }

  });

})();



async function handleLogout() {

  if (!authCore) return;



  const result = await authCore.logout();



  if (result.success) {

    showAuthForms();

    setSyncStatusMessage('Logged out. Local data preserved.', false);

  } else {

    setSyncStatusMessage(`Logout failed: ${result.error}`, true);

  }

}



async function handleManualSync() {

  if (!cloudSync) {
    setSyncStatusMessage('Cloud sync not available', true);
    return;
  }

  // Guard: tidak boleh sync kalau belum login
  if (!authCore) {
    setSyncStatusMessage('Please sign in to sync', true);
    return;
  }
  const isAuthed = await authCore.isAuthenticated();
  if (!isAuthed) {
    setSyncStatusMessage('Please sign in before syncing', true);
    return;
  }

  setSyncStatusMessage('Syncing to cloud...', false);

  try {

    const authData = await authCore.getStoredAuthData();

    const uid = authData[STORAGE_KEYS.USER_UID];

    if (!uid) throw new Error('Not authenticated');

    // Fix Bug #4: Run incremental Supabase sync FIRST so synced_item_timestamps
    // is updated. Previously only uploadBackup() was called, meaning the next
    // auto-sync would re-upload all items (timestamps never updated by blob backup).
    const syncCore = typeof LocalPocketSupabaseSyncCore !== 'undefined'
      ? LocalPocketSupabaseSyncCore
      : (typeof LocalPocketFirestoreSyncCore !== 'undefined' ? LocalPocketFirestoreSyncCore : null);

    if (syncCore) {
      setSyncStatusMessage('Syncing items to Supabase...', false);
      await syncCore.manualSync((progress) => {
        if (progress && progress.synced !== undefined) {
          setSyncStatusMessage(`Syncing... ${progress.synced} items`, false);
        }
      });
    }

    setSyncStatusMessage('Uploading backup to cloud...', false);

    const result = await cloudSync.uploadBackup(uid, (progress) => {

      if (progress.phase === 'upload') {

        setSyncStatusMessage(`Uploading... ${Math.round(progress.progress * 100)}%`, false);

      }

    });

    if (result.success) {

      const api = typeof browser !== 'undefined' ? browser : chrome;

      await new Promise((resolve) => {

        api.storage.local.set({ cloud_last_sync_time: Date.now() }, () => resolve());

      });

      setSyncStatusMessage('Cloud sync completed successfully', false);

      updateSyncStatus();

    } else {

      setSyncStatusMessage('Cloud sync failed', true);

    }

  } catch (err) {

    console.error('Cloud sync error:', err);

    setSyncStatusMessage('Cloud sync failed: ' + err.message, true);

  }

}



async function loadSyncedData() {

  if (!cloudSync || !authCore) return;

  setSyncStatusMessage('Downloading backup from cloud...', false);

  try {

    const authData = await authCore.getStoredAuthData();

    const uid = authData[STORAGE_KEYS.USER_UID];

    if (!uid) {

      setSyncStatusMessage('Not authenticated', true);

      return;

    }

    const result = await cloudSync.downloadBackup(uid);

    if (!result.success) {

      if (result.error === 'no_backup') {

        setSyncStatusMessage('No cloud backup found. First sync will create one.', false);

      } else {

        setSyncStatusMessage('Failed to download backup', true);

      }

      return;

    }

    // Fix #4: Compare cloud backup timestamp vs newest local data timestamp.
    // We compare cloudExportedAt against the newest savedAt/updatedAt across
    // local items, categories and notes — NOT cloud_last_sync_time, which only
    // updates when a sync runs and would be stale if the user made local changes
    // that haven't been synced yet.
    const cloudExportedAt = result.data && result.data.meta && result.data.meta.exportedAt
      ? new Date(result.data.meta.exportedAt).getTime()
      : 0;
    if (cloudExportedAt > 0) {
      const api = typeof browser !== 'undefined' ? browser : chrome;
      const localRaw = await new Promise(resolve => {
        api.storage.local.get(['items', 'categories', 'sidebarNotes', 'cloud_last_sync_time'], r => resolve(r));
      });

      // Find the newest savedAt/updatedAt among local items, categories, notes
      let newestLocalMs = localRaw.cloud_last_sync_time || 0;
      const _pickNewest = (arr) => {
        if (!Array.isArray(arr)) return;
        arr.forEach(function(item) {
          if (!item) return;
          const t = item.savedAt || item.updatedAt || 0;
          const ms = t ? new Date(t).getTime() : 0;
          if (ms > newestLocalMs) newestLocalMs = ms;
        });
      };
      _pickNewest(localRaw.items);
      _pickNewest(localRaw.categories);
      _pickNewest(localRaw.sidebarNotes);

      if (newestLocalMs > cloudExportedAt) {
        setSyncStatusMessage('Local data is more recent than cloud backup. Skipping restore to protect unsaved changes.', false);
        return;
      }
    }

    _downloadInProgress = true;
    setSyncStatusMessage('Restoring from cloud backup...', false);
    let ok;
    try {

    ok = await restoreFromBackupPayload(result.data, setSyncStatusMessage);

    } finally {
      _downloadInProgress = false;
    }

    if (ok) {

      setSyncStatusMessage('Cloud backup restored successfully. Reloading...', false);

      setTimeout(() => window.location.reload(), 1500);

    }

  } catch (err) {

    console.error('Load synced data error:', err);

    setSyncStatusMessage('Failed to load synced data: ' + err.message, true);

  }

}



function initAuthHandlers() {

  // Login form

  const loginBtn = document.getElementById('loginBtn');

  const showRegisterBtn = document.getElementById('showRegisterBtn');

  const googleSignInBtn = document.getElementById('googleSignInBtn');

  

  if (loginBtn) {

    loginBtn.addEventListener('click', handleLogin);

  }



  if (googleSignInBtn) {

    googleSignInBtn.addEventListener('click', handleGoogleSignIn);

  }



  if (showRegisterBtn) {

    showRegisterBtn.addEventListener('click', () => {

      document.getElementById('loginForm').style.display = 'none';

      document.getElementById('registerForm').style.display = 'block';

      setAuthStatus('', false);

    });

  }



  // Register form

  const registerBtn = document.getElementById('registerBtn');

  const showLoginBtn = document.getElementById('showLoginBtn');

  

  if (registerBtn) {

    registerBtn.addEventListener('click', handleRegister);

  }



  if (showLoginBtn) {

    showLoginBtn.addEventListener('click', () => {

      document.getElementById('registerForm').style.display = 'none';

      document.getElementById('loginForm').style.display = 'block';

      setRegisterStatus('', false);

    });

  }



  // User info

  const logoutBtn = document.getElementById('logoutBtn');

  const manualSyncBtn = document.getElementById('manualSyncBtn');

  const autoSyncEnabled = document.getElementById('autoSyncEnabled');
  const syncNotificationEnabled = document.getElementById('syncNotificationEnabled');

  

  if (logoutBtn) {

    logoutBtn.addEventListener('click', handleLogout);

  }



  if (manualSyncBtn) {

    manualSyncBtn.addEventListener('click', handleManualSync);

  }



  if (autoSyncEnabled) {

    const api = typeof browser !== 'undefined' ? browser : chrome;

    api.storage.local.get('cloud_auto_sync', (result) => {
      if (result.cloud_auto_sync === undefined) {
        api.storage.local.set({ cloud_auto_sync: true });
      } else {
        autoSyncEnabled.checked = !!result.cloud_auto_sync;
      }
    });

    autoSyncEnabled.addEventListener('change', async (e) => {

      await new Promise((resolve) => {

        api.storage.local.set({ cloud_auto_sync: e.target.checked }, () => resolve());

      });

    });

  }

  if (syncNotificationEnabled) {
    const api = typeof browser !== 'undefined' ? browser : chrome;
    api.storage.local.get('cloud_sync_notification', (result) => {
      // Default: enabled
      syncNotificationEnabled.checked = result.cloud_sync_notification !== false;
    });
    syncNotificationEnabled.addEventListener('change', async (e) => {
      await new Promise((resolve) => {
        api.storage.local.set({ cloud_sync_notification: e.target.checked }, () => resolve());
      });
    });
  }

}



async function initAuthAndSync() {

  const supabaseInitialized = await initSupabaseAuth();

  

  if (supabaseInitialized) {

    initAuthHandlers();

    await checkAuthState();

    // Auto-sync dihandle oleh background.js — tiada fallback diperlukan lagi
  }

}



document.addEventListener('DOMContentLoaded', () => {

  load().then(() => {

    initBackupHandlers();

    initAuthAndSync();

    // Debug print Firefox identity redirect URL
    const api = typeof browser !== 'undefined' ? browser : chrome;
    if (api.identity && typeof api.identity.getRedirectURL === 'function') {
      const el = document.getElementById('debugRedirectUrl');
      if (el) {
        el.textContent = `Redirect URL: ${api.identity.getRedirectURL()}`;
      }
    }

  }).catch((err) => {

    console.error("Initialization failed", err);

    setBackupStatus("Failed to initialize options page.", true);

  });

});

