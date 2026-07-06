/* global module */
(function attachLocalPocketThemeCore(globalScope) {
  const DEFAULT_THEME = "classic";
  const SUPPORTED_THEMES = new Set([
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
    "custom"
  ]);

  function normalizeThemePreset(value) {
    const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
    return SUPPORTED_THEMES.has(raw) ? raw : DEFAULT_THEME;
  }

  function applyThemePresetToDocument(doc, value) {
    const safeDoc = doc && typeof doc === "object" ? doc : null;
    const theme = normalizeThemePreset(value);
    if (safeDoc && safeDoc.documentElement && safeDoc.documentElement.setAttribute) {
      safeDoc.documentElement.setAttribute("data-theme", theme);
    }
    return theme;
  }

  const api = {
    DEFAULT_THEME,
    normalizeThemePreset,
    applyThemePresetToDocument
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope && typeof globalScope === "object") {
    globalScope.LocalPocketThemeCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
