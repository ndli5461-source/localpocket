(function initLocalPocketNotesOverlay() {
  if (typeof window === "undefined") return;
  if (window.__lpNotesOverlayInstalled) return;
  window.__lpNotesOverlayInstalled = true;
  if (window.name === "__LP_SIDEBAR__") return;

  const api = typeof browser !== "undefined" ? browser : (typeof chrome !== "undefined" ? chrome : null);
  if (!api || !api.storage || !api.runtime) return;

  const SETTINGS_KEY = "settings";
  const NOTES_KEY = "sidebarNotes";
  const FOLDERS_KEY = "sidebarNoteFolders";
  const NOTES_UI_KEY = "sidebarNotesUi";
  const ATTACHMENTS_KEY = "sidebarNoteAttachments";
  const SAVE_DELAY_MS = 500;
  const ROOT_ID = "__lp_notes_overlay_root";
  const EDITOR_FRAME_URL = api.runtime.getURL("notesEditorFrame.html");
  const MOBILE_BREAKPOINT = 640;
  const PANEL_VIEWPORT_MARGIN = 24;
  const DEFAULT_PANEL_WIDTH = 820;
  const DEFAULT_PANEL_HEIGHT = 800;
  const VIEW_ALL = "all";
  const VIEW_PINNED = "pinned";
  const VIEW_TASKS = "tasks";
  const DRAWER_MODE_CATEGORIES = "categories";
  const DRAWER_MODE_NOTES = "notes";
  const VALID_VIEWS = new Set([VIEW_ALL, VIEW_PINNED, VIEW_TASKS]);
  const FILTER_ALL_FOLDERS = "__all__";
  const FILTER_UNCATEGORIZED = "__uncategorized__";
  const UNCATEGORIZED_LABEL = "Unsorted";
  const NOTE_DELETE_UNDO_MS = 8000;
  const MAX_ATTACHMENT_DATA_URL_LENGTH = 8 * 1024 * 1024;
  const MAX_EMBEDDED_IMAGE_SIZE = 500 * 1024; // 500KB max for embedded images
  const TRASH_KEY = "sidebarNotesTrash";
  const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days default
  const EXTERNAL_SYNC_CHECK_INTERVAL_MS = 5000;
  const THEME_CHOICES = [
    { value: "classic", label: "Classic" },
    { value: "minimal", label: "Light" },
    { value: "modern", label: "Dark" },
    { value: "cyber", label: "Neon" },
    { value: "ocean", label: "Ocean" },
    { value: "sunset", label: "Sunset" },
    { value: "forest", label: "Forest" },
    { value: "pastel", label: "Pastel" },
    { value: "mono", label: "Mono" },
    { value: "oled", label: "OLED" },
    { value: "sepia", label: "Sepia" },
    { value: "retro", label: "Retro" },
    { value: "aurora", label: "Aurora" },
    { value: "custom", label: "Custom" }
  ];
  const THEME_CHOICE_MAP = new Map(THEME_CHOICES.map((entry) => [entry.value, entry.label]));

  const state = {
    mounted: false,
    open: false,
    previousFocus: null,
    panelMode: "picker",
    pickerPosition: null,
    folders: [],
    notes: [],
    attachments: {},
    ui: {
      activeNoteId: "",
      notesDrawerOpen: false,
      drawerMode: DRAWER_MODE_CATEGORIES,
      activeView: VIEW_ALL,
      activeFolderFilter: FILTER_ALL_FOLDERS,
      pinnedFolderIds: [],
      hiddenFolderIds: [],
      showHiddenFolders: false,
      favoriteFolderSortMode: "manual",
      folderPage: 0,
      notePage: 0,
      selectedNoteIds: [],
      searchQuery: "",
      closeOnOutsideClick: true,
      panelWidth: DEFAULT_PANEL_WIDTH,
      panelHeight: DEFAULT_PANEL_HEIGHT,
      zenMode: false
    },
    settings: {},
    pageContext: null,
    saveTimer: null,
    resizeSession: null,
    panelDragSession: null,
    externalSyncTimer: null,
    pendingExternalReload: false,
    lastLocalChangeAt: 0,
    trash: [],
    trashPanelOpen: false,
    undoDeleteTimer: null,
    pendingUndoDelete: null,
    dialog: {
      open: false,
      mode: "",
      title: "",
      message: "",
      inputLabel: "",
      inputValue: "",
      inputPlaceholder: "",
      confirmLabel: "OK",
      cancelLabel: "Cancel",
      danger: false,
      resolver: null
    },
    folderPalette: {
      open: false,
      query: "",
      activeIndex: 0,
      options: [],
      pendingTargetId: "",
      pendingOffset: 0
    },
    folderContextMenu: {
      open: false,
      folderId: "",
      anchorX: 0,
      anchorY: 0
    },
    folderKeyboardIndex: 0,
    editor: {
      token: "",
      ready: false,
      title: "",
      content: "",
      pendingFocusTarget: "content",
      pendingFocusSelectAll: false,
      lastTheme: "",
      dirty: false,
      previewMode: false,
      attachmentMap: {}
    },
    refs: {},
    shadow: null
  };
  let draggedNoteId = "";

  function normalizeThemePreset(value) {
    const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (raw === "custom" || raw === "aurora" || raw === "ocean" || raw === "sunset" || raw === "modern" || raw === "minimal" || raw === "cyber" || raw === "forest" || raw === "pastel" || raw === "mono" || raw === "oled" || raw === "sepia" || raw === "retro") return raw;
    return "classic";
  }

  function getThemeLabel(value) {
    const key = normalizeThemePreset(value);
    return THEME_CHOICE_MAP.get(key) || "Theme";
  }

  function makeAttachmentId() {
    return `attachment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function makeAttachmentUri(attachmentId) {
    return `lp-attachment://${String(attachmentId || "").trim()}`;
  }

  function parseAttachmentId(value) {
    const raw = String(value || "").trim();
    const match = raw.match(/^lp-attachment:\/\/([a-z0-9-]+)/i);
    return match ? String(match[1]) : "";
  }

  function extractAttachmentIdsFromContent(content) {
    const matches = String(content || "").match(/lp-attachment:\/\/([a-z0-9-]+)/gi) || [];
    const ids = new Set();
    matches.forEach((entry) => {
      const id = parseAttachmentId(entry);
      if (id) ids.add(id);
    });
    return ids;
  }

  function getReferencedAttachmentIds(notes) {
    const ids = new Set();
    coerceArray(notes).forEach((note) => {
      extractAttachmentIdsFromContent(note && note.content ? note.content : "").forEach((id) => ids.add(id));
    });
    return ids;
  }

  function normalizeAttachments(value) {
    const next = {};
    if (!value || typeof value !== "object") return next;
    Object.keys(value).forEach((key) => {
      const entry = value[key];
      if (!entry || typeof entry !== "object") return;
      const id = entry.id ? String(entry.id).trim() : String(key || "").trim();
      const dataUrl = entry.dataUrl ? String(entry.dataUrl) : "";
      if (!id || !dataUrl || dataUrl.length > MAX_ATTACHMENT_DATA_URL_LENGTH) return;
      next[id] = {
        id,
        name: entry.name ? String(entry.name).slice(0, 160) : `attachment-${id}`,
        mimeType: entry.mimeType ? String(entry.mimeType).slice(0, 120) : "application/octet-stream",
        dataUrl,
        createdAt: entry.createdAt ? String(entry.createdAt) : new Date().toISOString()
      };
    });
    return next;
  }

  function pruneAttachmentsMap(attachments, notes) {
    const normalized = normalizeAttachments(attachments);
    const referencedIds = getReferencedAttachmentIds(notes);
    if (!referencedIds.size) return {};
    const next = {};
    referencedIds.forEach((id) => {
      if (normalized[id]) {
        next[id] = normalized[id];
      }
    });
    return next;
  }

  function buildAttachmentMapForContent(content) {
    const ids = extractAttachmentIdsFromContent(content);
    const next = {};
    ids.forEach((id) => {
      if (state.attachments[id]) {
        next[id] = state.attachments[id];
      }
    });
    return next;
  }

  function buildPageContextSnippet(context) {
    const source = context && typeof context === "object" ? context : null;
    if (!source) return "";
    const title = source.title ? String(source.title).trim() : "";
    const url = source.url ? String(source.url).trim() : "";
    if (title && url) {
      return `[${title}](${url})`;
    }
    if (url) {
      return url;
    }
    return title;
  }

  function storageGet(keys) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        resolve(value && typeof value === "object" ? value : {});
      };
      try {
        const maybePromise = api.storage.local.get(keys, (value) => {
          const err = api.runtime && api.runtime.lastError;
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

  function storageSet(value) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (err) => {
        if (done) return;
        done = true;
        if (err) reject(err);
        else resolve();
      };
      try {
        const maybePromise = api.storage.local.set(value, () => {
          const err = api.runtime && api.runtime.lastError;
          finish(err || null);
        });
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then(() => finish(null)).catch(finish);
        }
      } catch (err) {
        finish(err);
      }
    });
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        resolve(value == null ? null : value);
      };
      try {
        const maybePromise = api.runtime.sendMessage(message, (response) => {
          const err = api.runtime && api.runtime.lastError;
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

  function coerceArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function makeId(prefix) {
    const head = prefix ? String(prefix) : "entry";
    return `${head}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeSearchQuery(value) {
    const raw = value ? String(value).replace(/\s+/g, " ").trim() : "";
    return raw.slice(0, 120);
  }

  function normalizeView(value) {
    const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
    return VALID_VIEWS.has(raw) ? raw : VIEW_ALL;
  }

  function normalizeFolderName(value) {
    const raw = value ? String(value).replace(/\s+/g, " ").trim() : "";
    return raw.slice(0, 60);
  }

  function clampPanelWidth(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(360, Math.min(1400, Math.round(numeric)));
  }

  function clampPanelHeight(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(360, Math.min(1200, Math.round(numeric)));
  }

  function getEditorBaseHeight() {
    const frame = state.refs.editorFrame;
    const editorPane = frame && frame.parentElement ? frame.parentElement : null;
    if (!editorPane) {
      return Math.max(320, Math.min(760, Math.round(window.innerHeight * 0.58)));
    }
    const toolbar = editorPane.querySelector(".editor-toolbar");
    const footer = editorPane.querySelector(".editor-footer");
    const paneStyles = window.getComputedStyle(editorPane);
    const gap = parseFloat(paneStyles.rowGap || paneStyles.gap || "0") || 0;
    const paddingTop = parseFloat(paneStyles.paddingTop || "0") || 0;
    const paddingBottom = parseFloat(paneStyles.paddingBottom || "0") || 0;
    const available = editorPane.clientHeight
      - (toolbar ? toolbar.offsetHeight : 0)
      - (footer ? footer.offsetHeight : 0)
      - gap * 2
      - paddingTop
      - paddingBottom;
    return Math.max(300, Math.min(900, Math.round(available || 0)));
  }

  function countWords(text) {
    const raw = text ? String(text).trim() : "";
    if (!raw) return 0;
    return raw.split(/\s+/).filter(Boolean).length;
  }

  function countChars(text) {
    return text ? String(text).length : 0;
  }

  function formatUpdatedAt(iso) {
    const date = iso ? new Date(iso) : null;
    if (!date || Number.isNaN(date.getTime())) return "Updated just now";
    return `Updated ${date.toLocaleString([], {
      hour: "numeric",
      minute: "2-digit",
      day: "numeric",
      month: "short"
    })}`;
  }

  function formatDeletedAt(iso) {
    const date = iso ? new Date(iso) : null;
    if (!date || Number.isNaN(date.getTime())) return "Deleted just now";
    return `Deleted ${date.toLocaleString([], {
      hour: "numeric",
      minute: "2-digit",
      day: "numeric",
      month: "short"
    })}`;
  }

  function getNoteTitle(note) {
    if (!note) return "Untitled note";
    const raw = note.title ? String(note.title).trim() : "";
    return raw || "Untitled note";
  }

  function getNoteSortTimestamp(note) {
    return Date.parse((note && (note.updatedAt || note.createdAt)) || "") || 0;
  }

  function compareNotes(left, right) {
    const leftPinned = left && left.isPinned === true;
    const rightPinned = right && right.isPinned === true;
    if (leftPinned !== rightPinned) {
      return leftPinned ? -1 : 1;
    }
    const timeDiff = getNoteSortTimestamp(right) - getNoteSortTimestamp(left);
    if (timeDiff) return timeDiff;
    return getNoteTitle(left).localeCompare(getNoteTitle(right), undefined, { sensitivity: "base" });
  }

  function buildFolderMap(folders) {
    const map = new Map();
    coerceArray(folders).forEach((folder) => {
      if (!folder || typeof folder !== "object") return;
      const id = folder.id ? String(folder.id).trim() : "";
      if (!id) return;
      map.set(id, folder);
    });
    return map;
  }

  function normalizeFolders(value) {
    const next = [];
    const seenIds = new Set();
    const seenNames = new Set();
    coerceArray(value).forEach((entry, index) => {
      if (!entry || typeof entry !== "object") return;
      const id = entry.id ? String(entry.id).trim() : "";
      const name = normalizeFolderName(entry.name);
      if (!id || !name || id === "general" || seenIds.has(id)) return;
      const lowered = name.toLowerCase();
      if (seenNames.has(lowered)) return;
      seenIds.add(id);
      seenNames.add(lowered);
      next.push({
        id: id.slice(0, 80),
        name,
        order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : index,
        createdAt: entry.createdAt ? String(entry.createdAt) : new Date().toISOString()
      });
    });
    return next.sort((left, right) => {
      const orderDiff = Number(left.order || 0) - Number(right.order || 0);
      if (orderDiff) return orderDiff;
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    });
  }

  function getFolderById(folderId) {
    return buildFolderMap(state.folders).get(folderId) || null;
  }

  function getFolderLabel(folderId) {
    if (!folderId) return UNCATEGORIZED_LABEL;
    const folder = getFolderById(folderId);
    return folder && folder.name ? folder.name : UNCATEGORIZED_LABEL;
  }

  function normalizeNotes(value, folders) {
    const folderMap = buildFolderMap(folders);
    return coerceArray(value)
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const id = entry.id ? String(entry.id).trim() : "";
        if (!id) return null;
        const rawFolderId = entry.folderId ? String(entry.folderId).trim() : "";
        return {
          id: id.slice(0, 80),
          title: entry.title == null ? "" : String(entry.title).slice(0, 120),
          content: entry.content == null ? "" : String(entry.content).slice(0, 200000),
          folderId: rawFolderId && folderMap.has(rawFolderId) ? rawFolderId : "",
          isPinned: entry.isPinned === true,
          pinnedAt: entry.isPinned === true && entry.pinnedAt ? String(entry.pinnedAt) : "",
          createdAt: entry.createdAt ? String(entry.createdAt) : new Date().toISOString(),
          updatedAt: entry.updatedAt ? String(entry.updatedAt) : new Date().toISOString()
        };
      })
      .filter(Boolean)
      .sort(compareNotes);
  }

  function normalizeFolderFilter(value, folders) {
    const raw = typeof value === "string" ? value.trim() : "";
    if (raw === FILTER_ALL_FOLDERS || raw === FILTER_UNCATEGORIZED) {
      return raw;
    }
    return buildFolderMap(folders).has(raw) ? raw : FILTER_ALL_FOLDERS;
  }

  function normalizePinnedFolderIds(value, folders) {
    const folderMap = buildFolderMap(folders);
    const seen = new Set();
    return coerceArray(value)
      .map((entry) => (entry == null ? "" : String(entry).trim()))
      .filter((id) => {
        if (!id || seen.has(id) || !folderMap.has(id)) return false;
        seen.add(id);
        return true;
      });
  }

  function normalizeHiddenFolderIds(value, folders) {
    return normalizePinnedFolderIds(value, folders);
  }

  function normalizeFavoriteFolderSortMode(value) {
    const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
    return raw === "asc" || raw === "desc" ? raw : "manual";
  }

  function normalizeSelectedNoteIds(value, notes) {
    const noteIds = new Set(coerceArray(notes).map((note) => (note && note.id ? String(note.id) : "")));
    const seen = new Set();
    return coerceArray(value)
      .map((entry) => String(entry || "").trim())
      .filter((id) => {
        if (!id || seen.has(id) || !noteIds.has(id)) return false;
        seen.add(id);
        return true;
      });
  }

  function normalizeDrawerMode(value) {
    return String(value || "").toLowerCase() === DRAWER_MODE_NOTES
      ? DRAWER_MODE_NOTES
      : DRAWER_MODE_CATEGORIES;
  }

  function normalizeUi(value, folders, notes) {
    const noteIds = new Set(notes.map((note) => note.id));
    const source = value && typeof value === "object" ? value : {};
    const fallbackFolderFilter = typeof source.activeFolderId === "string" ? source.activeFolderId : FILTER_ALL_FOLDERS;
    const activeFolderFilter = normalizeFolderFilter(source.activeFolderFilter || fallbackFolderFilter, folders);
    const activeNoteId = source.activeNoteId && noteIds.has(String(source.activeNoteId))
      ? String(source.activeNoteId)
      : (notes[0] ? notes[0].id : "");
    return {
      activeNoteId,
      notesDrawerOpen: source.notesDrawerOpen === true,
      drawerMode: normalizeDrawerMode(source.drawerMode),
      activeView: normalizeView(source.activeView),
      activeFolderFilter,
      pinnedFolderIds: normalizePinnedFolderIds(source.pinnedFolderIds, folders),
      hiddenFolderIds: normalizeHiddenFolderIds(source.hiddenFolderIds, folders),
      showHiddenFolders: source.showHiddenFolders === true,
      favoriteFolderSortMode: normalizeFavoriteFolderSortMode(source.favoriteFolderSortMode),
      folderPage: Math.max(0, Number.isFinite(Number(source.folderPage)) ? Number(source.folderPage) : 0),
      notePage: Math.max(0, Number.isFinite(Number(source.notePage)) ? Number(source.notePage) : 0),
      selectedNoteIds: normalizeSelectedNoteIds(source.selectedNoteIds, notes),
      searchQuery: normalizeSearchQuery(source.searchQuery),
      closeOnOutsideClick: source.closeOnOutsideClick !== false,
      panelWidth: clampPanelWidth(source.panelWidth) || DEFAULT_PANEL_WIDTH,
      panelHeight: clampPanelHeight(source.panelHeight) || DEFAULT_PANEL_HEIGHT,
      zenMode: source.zenMode === true
    };
  }

  function createBlankNote(folderId) {
    const now = new Date().toISOString();
    return {
      id: makeId("note"),
      title: "",
      content: "",
      folderId: folderId || "",
      isPinned: false,
      pinnedAt: "",
      createdAt: now,
      updatedAt: now
    };
  }

  function getSortedNotes(notes) {
    return coerceArray(notes).slice().sort(compareNotes);
  }

  function getActiveNote() {
    return state.notes.find((note) => note && note.id === state.ui.activeNoteId) || null;
  }

  function ensureActiveNoteExists() {
    if (!state.notes.length) {
      const note = createBlankNote("");
      state.notes = [note];
      state.ui.activeNoteId = note.id;
      state.ui.activeView = VIEW_ALL;
      state.ui.activeFolderFilter = FILTER_ALL_FOLDERS;
      return;
    }
    if (state.ui.activeNoteId && state.notes.some((note) => note.id === state.ui.activeNoteId)) {
      return;
    }
    state.ui.activeNoteId = state.notes[0].id;
  }

  function parseChecklistItems(content) {
    const raw = String(content || "");
    const lines = raw.split("\n");
    const items = [];
    lines.forEach((line, index) => {
      const match = line.match(/^(\s*)[-*]\s\[( |x|X)\]\s?(.*)$/);
      if (!match) return;
      items.push({
        lineIndex: index,
        indent: match[1] || "",
        checked: String(match[2] || "").toLowerCase() === "x",
        text: match[3] || ""
      });
    });
    return items;
  }

  function getChecklistStats(note) {
    const items = parseChecklistItems(note && note.content ? note.content : "");
    const total = items.length;
    const open = items.filter((item) => item.checked !== true).length;
    return { total, open };
  }

  function noteMatchesView(note, view) {
    if (!note) return false;
    if (view === VIEW_PINNED) {
      return note.isPinned === true;
    }
    if (view === VIEW_TASKS) {
      return getChecklistStats(note).total > 0;
    }
    return true;
  }

  function noteMatchesQuery(note, query) {
    const needle = normalizeSearchQuery(query).toLowerCase();
    if (!needle) return true;
    return [
      getNoteTitle(note),
      note && note.content ? note.content : "",
      getFolderLabel(note && note.folderId ? note.folderId : "")
    ].some((value) => String(value || "").toLowerCase().includes(needle));
  }

  function noteMatchesFolderFilter(note, folderFilter) {
    if (folderFilter === FILTER_ALL_FOLDERS) return true;
    if (folderFilter === FILTER_UNCATEGORIZED) {
      return !(note && note.folderId);
    }
    return !!(note && note.folderId === folderFilter);
  }

  function getBaseFilteredNotes() {
    const query = normalizeSearchQuery(state.ui.searchQuery);
    return getSortedNotes(state.notes).filter((note) => {
      if (!noteMatchesView(note, state.ui.activeView)) return false;
      return noteMatchesQuery(note, query);
    });
  }

  function getVisibleNotes() {
    return getBaseFilteredNotes().filter((note) => noteMatchesFolderFilter(note, state.ui.activeFolderFilter));
  }

  function getViewCountsForCurrentScope() {
    const scopedNotes = getSortedNotes(state.notes).filter((note) => {
      if (!noteMatchesFolderFilter(note, state.ui.activeFolderFilter)) return false;
      return noteMatchesQuery(note, state.ui.searchQuery);
    });
    return scopedNotes.reduce((counts, note) => {
      counts.all += 1;
      if (note && note.isPinned === true) {
        counts.pinned += 1;
      }
      if (getChecklistStats(note).total > 0) {
        counts.tasks += 1;
      }
      return counts;
    }, { all: 0, pinned: 0, tasks: 0 });
  }

  function getDrawerSelectedNoteId(visibleNotes) {
    const notes = coerceArray(visibleNotes);
    if (!notes.length) return "";
    if (notes.some((note) => note && note.id === state.ui.activeNoteId)) {
      return state.ui.activeNoteId;
    }
    return notes[0] && notes[0].id ? String(notes[0].id) : "";
  }

  function getSelectedNoteIdsInScope(visibleNotes) {
    const visibleIdSet = new Set(coerceArray(visibleNotes).map((note) => (note && note.id ? String(note.id) : "")));
    return coerceArray(state.ui.selectedNoteIds).filter((id) => visibleIdSet.has(String(id)));
  }

  function hasPageContext() {
    return !!(state.pageContext && (state.pageContext.title || state.pageContext.url));
  }

  function getPreferredCategoryIdForNewNote() {
    const activeNote = getActiveNote();
    if (activeNote && activeNote.folderId) {
      return String(activeNote.folderId);
    }
    const activeFilter = state.ui.activeFolderFilter;
    if (activeFilter && activeFilter !== FILTER_ALL_FOLDERS && activeFilter !== FILTER_UNCATEGORIZED && getFolderById(activeFilter)) {
      return activeFilter;
    }
    return "";
  }

  function getCurrentContextCategoryLabel() {
    const categoryId = getPreferredCategoryIdForNewNote();
    return categoryId ? getFolderLabel(categoryId) : UNCATEGORIZED_LABEL;
  }

  function isNotesDrawerPage() {
    return state.ui.drawerMode === DRAWER_MODE_NOTES;
  }

  function isPickerPanelMode() {
    return state.panelMode === "picker";
  }

  function preparePickerLandingPage() {
    state.panelMode = "picker";
    state.ui.notesDrawerOpen = true;
    state.ui.drawerMode = DRAWER_MODE_CATEGORIES;
    state.ui.folderPage = 0;
    setFolderKeyboardIndexFromActiveFilter();
  }

  function openDrawerCategoriesPage() {
    preparePickerLandingPage();
  }

  function openDrawerNotesPage(folderId = state.ui.activeFolderFilter) {
    state.ui.activeFolderFilter = normalizeFolderFilter(folderId, state.folders);
    state.ui.notesDrawerOpen = true;
    state.ui.drawerMode = DRAWER_MODE_NOTES;
    state.ui.notePage = 0;
  }

  function getFolderCounts(notes) {
    const counts = new Map();
    counts.set(FILTER_ALL_FOLDERS, notes.length);
    counts.set(FILTER_UNCATEGORIZED, 0);
    state.folders.forEach((folder) => {
      counts.set(folder.id, 0);
    });
    notes.forEach((note) => {
      const folderId = note && note.folderId ? note.folderId : "";
      const key = folderId && counts.has(folderId) ? folderId : FILTER_UNCATEGORIZED;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }

  function hueFromString(input) {
    const text = String(input || "");
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % 360;
  }

  function getCategoryColorKey(folderId) {
    const id = folderId ? String(folderId) : "";
    if (!id || id === FILTER_UNCATEGORIZED) return "__uncategorized__";
    if (id === FILTER_ALL_FOLDERS) return "__all__";
    return id;
  }

  function getFolderRowPalette(folderId) {
    const colorKey = getCategoryColorKey(folderId);
    const hue = hueFromString(colorKey);
    const saturation = colorKey === "__uncategorized__"
      ? 36
      : (colorKey === "__all__" ? 46 : 68);
    const strongSaturation = Math.min(90, saturation + 12);
    return {
      rowBorder: `hsla(${hue}, ${saturation}%, 64%, 0.34)`,
      rowBackground: `hsla(${hue}, ${saturation}%, 56%, 0.14)`,
      rowBackgroundActive: `hsla(${hue}, ${Math.min(92, saturation + 10)}%, 58%, 0.24)`,
      dot: `hsl(${hue}, ${strongSaturation}%, 70%)`,
      dotRing: `hsla(${hue}, ${strongSaturation}%, 64%, 0.48)`,
      countBorder: `hsla(${hue}, ${strongSaturation}%, 70%, 0.58)`,
      countBackground: `hsla(${hue}, ${strongSaturation}%, 62%, 0.27)`,
      countColor: "#fff"
    };
  }

  function getOrderedFolderList() {
    const pinnedIds = normalizePinnedFolderIds(state.ui.pinnedFolderIds, state.folders);
    const pinned = new Set(pinnedIds);
    const hidden = new Set(normalizeHiddenFolderIds(state.ui.hiddenFolderIds, state.folders));
    const pinnedFolders = [];
    const regularFolders = [];
    const folderMap = buildFolderMap(state.folders);
    state.folders.forEach((folder) => {
      if (!folder) return;
      if (hidden.has(folder.id) && state.ui.showHiddenFolders !== true) return;
      if (!pinned.has(folder.id)) {
        regularFolders.push(folder);
      }
    });
    const favoriteSortMode = normalizeFavoriteFolderSortMode(state.ui.favoriteFolderSortMode);
    if (favoriteSortMode === "manual") {
      pinnedIds.forEach((id) => {
        const folder = folderMap.get(id);
        if (!folder || (hidden.has(id) && state.ui.showHiddenFolders !== true)) return;
        pinnedFolders.push(folder);
      });
    } else {
      pinnedIds.forEach((id) => {
        const folder = folderMap.get(id);
        if (!folder || (hidden.has(id) && state.ui.showHiddenFolders !== true)) return;
        pinnedFolders.push(folder);
      });
      pinnedFolders.sort((a, b) => {
        const left = a && a.name ? a.name : "";
        const right = b && b.name ? b.name : "";
        return favoriteSortMode === "asc"
          ? left.localeCompare(right, undefined, { sensitivity: "base" })
          : right.localeCompare(left, undefined, { sensitivity: "base" });
      });
    }
    return [...pinnedFolders, ...regularFolders];
  }

  function getFolderFilterRows() {
    const rows = [
      { id: FILTER_ALL_FOLDERS, label: "All Categories", pinned: false, system: true },
      { id: FILTER_UNCATEGORIZED, label: UNCATEGORIZED_LABEL, pinned: false, system: true },
      ...getOrderedFolderList().map((folder) => ({
        id: folder.id,
        label: folder.name,
        pinned: state.ui.pinnedFolderIds.includes(folder.id),
        hidden: state.ui.hiddenFolderIds.includes(folder.id),
        system: false
      }))
    ];
    const query = normalizeSearchQuery(state.ui.searchQuery).toLowerCase();
    if (!query || isNotesDrawerPage()) {
      return rows;
    }
    return rows.filter((row) => String(row && row.label ? row.label : "").toLowerCase().includes(query));
  }

  function getAssignableFolderRows() {
    return [
      { id: "", label: UNCATEGORIZED_LABEL },
      ...getOrderedFolderList().map((folder) => ({ id: folder.id, label: folder.name }))
    ];
  }

  function getCurrentFolderRowIndex() {
    const rows = getFolderFilterRows();
    const index = rows.findIndex((row) => row.id === state.ui.activeFolderFilter);
    return index >= 0 ? index : 0;
  }

  function getFolderPageSize() {
    return 500;
  }

  function getNotePageSize() {
    return 500;
  }

  function getFolderPagerState() {
    const rows = getFolderFilterRows();
    const pageSize = getFolderPageSize();
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const activeIndex = Math.max(0, rows.findIndex((row) => row.id === state.ui.activeFolderFilter));
    const preferredPage = Math.max(0, Number(state.ui.folderPage) || 0);
    const activePage = Math.min(totalPages - 1, Math.max(preferredPage, Math.floor(activeIndex / pageSize)));
    const start = activePage * pageSize;
    return {
      rows,
      pageSize,
      totalPages,
      activePage,
      visibleRows: rows.slice(start, start + pageSize)
    };
  }

  function getNotePagerState(visibleNotes) {
    const rows = coerceArray(visibleNotes);
    const pageSize = getNotePageSize();
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const activeIndex = Math.max(0, rows.findIndex((note) => note && note.id === getDrawerSelectedNoteId(rows)));
    const preferredPage = Math.max(0, Number(state.ui.notePage) || 0);
    const activePage = Math.min(totalPages - 1, Math.max(preferredPage, Math.floor(activeIndex / pageSize)));
    const start = activePage * pageSize;
    return {
      rows,
      pageSize,
      totalPages,
      activePage,
      visibleRows: rows.slice(start, start + pageSize)
    };
  }

  function isEditableElement(target) {
    if (!target || !(target instanceof HTMLElement)) return false;
    const tag = target.tagName ? target.tagName.toLowerCase() : "";
    if (target.isContentEditable) return true;
    if (tag === "input" || tag === "textarea" || tag === "select" || tag === "iframe") return true;
    return !!target.closest('input, textarea, select, [contenteditable="true"], iframe');
  }

  function setFolderKeyboardIndexFromActiveFilter() {
    state.folderKeyboardIndex = getCurrentFolderRowIndex();
  }

  function closeFolderContextMenu() {
    if (state.folderContextMenu.open !== true) return;
    state.folderContextMenu = {
      open: false,
      folderId: "",
      anchorX: 0,
      anchorY: 0
    };
    render();
  }

  function closeFolderPalette() {
    if (state.folderPalette.open !== true) return;
    state.folderPalette = {
      open: false,
      query: "",
      activeIndex: 0,
      options: [],
      pendingTargetId: "",
      pendingOffset: 0
    };
    render();
  }

  function getViewLabel(view) {
    if (view === VIEW_PINNED) return "Pinned";
    if (view === VIEW_TASKS) return "Tasks";
    return "All Notes";
  }

  function getFolderFilterLabel(filterId) {
    if (filterId === FILTER_UNCATEGORIZED) {
      return UNCATEGORIZED_LABEL;
    }
    if (filterId === FILTER_ALL_FOLDERS) {
      return "All Categories";
    }
    return getFolderLabel(filterId);
  }

  function getNotesSummaryLabel(visibleNotes) {
    const count = visibleNotes.length;
    const query = normalizeSearchQuery(state.ui.searchQuery);
    if (query) {
      return `${count} result${count === 1 ? "" : "s"} for "${query}"`;
    }
    const base = state.ui.activeView === VIEW_PINNED
      ? `${count} pinned note${count === 1 ? "" : "s"}`
      : state.ui.activeView === VIEW_TASKS
        ? `${count} note${count === 1 ? "" : "s"} with tasks`
        : `${count} note${count === 1 ? "" : "s"}`;
    if (state.ui.activeFolderFilter === FILTER_ALL_FOLDERS) {
      return base;
    }
    return `${base} in ${getFolderFilterLabel(state.ui.activeFolderFilter)}`;
  }

  function getEmptyNotesLabel() {
    const query = normalizeSearchQuery(state.ui.searchQuery);
    if (query) {
      return `No results for "${query}".`;
    }
    if (state.ui.activeView === VIEW_PINNED) {
      return "No pinned notes yet.";
    }
    if (state.ui.activeView === VIEW_TASKS) {
      return "No notes with checklist items yet.";
    }
    if (state.ui.activeFolderFilter === FILTER_UNCATEGORIZED) {
      return "No uncategorized notes yet.";
    }
    if (state.ui.activeFolderFilter !== FILTER_ALL_FOLDERS) {
      return `No notes in ${getFolderFilterLabel(state.ui.activeFolderFilter)}.`;
    }
    return "No notes yet.";
  }

  function getNotePreview(note, query) {
    const content = String(note && note.content ? note.content : "").replace(/\s+/g, " ").trim();
    if (!content) return "Empty note";
    const needle = normalizeSearchQuery(query).toLowerCase();
    if (!needle) {
      return content;
    }
    const matchIndex = content.toLowerCase().indexOf(needle);
    if (matchIndex === -1) {
      return content;
    }
    const start = Math.max(0, matchIndex - 36);
    const end = Math.min(content.length, matchIndex + needle.length + 72);
    let snippet = content.slice(start, end).trim();
    if (start > 0) snippet = `...${snippet}`;
    if (end < content.length) snippet = `${snippet}...`;
    return snippet;
  }

  function buildHighlightedFragment(value, query) {
    const raw = String(value || "");
    const fragment = document.createDocumentFragment();
    const needle = normalizeSearchQuery(query);
    if (!needle) {
      fragment.appendChild(document.createTextNode(raw));
      return fragment;
    }
    const lower = raw.toLowerCase();
    const search = needle.toLowerCase();
    if (!search) {
      fragment.appendChild(document.createTextNode(raw));
      return fragment;
    }
    let cursor = 0;
    while (cursor < raw.length) {
      const index = lower.indexOf(search, cursor);
      if (index === -1) {
        fragment.appendChild(document.createTextNode(raw.slice(cursor)));
        break;
      }
      fragment.appendChild(document.createTextNode(raw.slice(cursor, index)));
      const mark = document.createElement("mark");
      mark.textContent = raw.slice(index, index + search.length);
      fragment.appendChild(mark);
      cursor = index + search.length;
    }
    return fragment;
  }

  function setHighlightedContent(target, value, query) {
    if (!target) return;
    target.replaceChildren(buildHighlightedFragment(value, query));
  }

  function setSaveStatus(message, tone) {
    const el = state.refs.saveStatus;
    if (!el) return;
    el.textContent = message || "Ready";
    el.dataset.tone = tone || "";
  }

  function renderUndoToast() {
    const toast = state.refs.undoToast;
    const messageEl = state.refs.undoToastMessage;
    if (!toast || !messageEl) return;
    const pending = state.pendingUndoDelete;
    if (!pending) {
      toast.style.display = "none";
      return;
    }
    messageEl.textContent = pending.message || "Note deleted";
    toast.style.display = "flex";
  }

  function clearPendingUndoDelete() {
    if (state.undoDeleteTimer) {
      clearTimeout(state.undoDeleteTimer);
      state.undoDeleteTimer = null;
    }
    state.pendingUndoDelete = null;
    renderUndoToast();
  }

  function clearFolderDropTargets() {
    if (!state.shadow) return;
    state.shadow.querySelectorAll(".folder-row-button.drop-target").forEach((button) => {
      button.classList.remove("drop-target");
    });
  }

  function getDroppableFolderId(filterId) {
    if (filterId === FILTER_ALL_FOLDERS) return null;
    if (filterId === FILTER_UNCATEGORIZED) return "";
    return getFolderById(filterId) ? filterId : null;
  }

  function renderDialog() {
    const layer = state.refs.dialogLayer;
    if (!layer) return;
    const dialog = state.dialog;
    const inputMode = dialog.mode === "prompt";
    layer.style.display = dialog.open === true ? "flex" : "none";
    if (dialog.open !== true) return;
    if (state.refs.dialogTitle) state.refs.dialogTitle.textContent = dialog.title || "Dialog";
    if (state.refs.dialogMessage) state.refs.dialogMessage.textContent = dialog.message || "";
    if (state.refs.dialogInputWrap) state.refs.dialogInputWrap.style.display = inputMode ? "grid" : "none";
    if (state.refs.dialogInputLabel) state.refs.dialogInputLabel.textContent = dialog.inputLabel || "Input";
    if (state.refs.dialogInput) {
      state.refs.dialogInput.value = dialog.inputValue || "";
      state.refs.dialogInput.placeholder = dialog.inputPlaceholder || "";
    }
    if (state.refs.dialogConfirm) {
      state.refs.dialogConfirm.textContent = dialog.confirmLabel || "OK";
      if (dialog.danger === true) {
        state.refs.dialogConfirm.style.background = "linear-gradient(135deg,rgba(210,76,76,0.8),rgba(210,76,76,0.6))";
        state.refs.dialogConfirm.style.borderColor = "rgba(255,143,143,0.4)";
      } else {
        state.refs.dialogConfirm.style.background = "linear-gradient(135deg,#5ac8ff,#3a8fff)";
        state.refs.dialogConfirm.style.borderColor = "transparent";
      }
    }
    if (state.refs.dialogCancel) {
      state.refs.dialogCancel.textContent = dialog.cancelLabel || "Cancel";
    }
    setTimeout(() => {
      if (dialog.open !== true) return;
      if (inputMode && state.refs.dialogInput) {
        state.refs.dialogInput.focus();
        if (typeof state.refs.dialogInput.select === "function") {
          state.refs.dialogInput.select();
        }
      } else if (state.refs.dialogConfirm) {
        state.refs.dialogConfirm.focus();
      }
    }, 0);
  }

  function renderTrashPanel() {
    const layer = state.refs.trashLayer;
    const list = state.refs.trashList;
    const empty = state.refs.trashEmpty;
    const meta = state.refs.trashMeta;
    const openButton = state.refs.openTrashButton;
    const emptyButton = state.refs.emptyTrashButton;
    const trash = coerceArray(state.trash);
    if (openButton) {
      openButton.disabled = trash.length === 0;
      openButton.textContent = trash.length > 0 ? `Trash (${trash.length})` : "Trash";
    }
    if (!layer || !list || !empty || !meta) return;
    layer.style.display = state.trashPanelOpen === true ? "flex" : "none";
    meta.textContent = trash.length
      ? `${trash.length} deleted note${trash.length === 1 ? "" : "s"} kept for up to 30 days.`
      : "Deleted notes will appear here.";
    list.replaceChildren();
    empty.style.display = trash.length > 0 ? "none" : "block";
    if (emptyButton) {
      emptyButton.disabled = trash.length === 0;
    }
    if (!trash.length) return;
    const items = trash.map((entry) => {
      const wrapper = document.createElement("div");
      wrapper.style.cssText = "display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px 14px;background:rgba(255,255,255,0.04);";
      const info = document.createElement("div");
      const title = document.createElement("div");
      title.style.cssText = "font-size:13px;font-weight:700;color:#f3f4f6;";
      title.textContent = getNoteTitle(entry && entry.note);
      const preview = document.createElement("div");
      preview.style.cssText = "margin-top:3px;color:#a3acb9;font-size:12px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;";
      preview.textContent = getNotePreview(entry && entry.note, "");
      const itemMeta = document.createElement("div");
      itemMeta.style.cssText = "margin-top:4px;color:#a3acb9;font-size:11px;";
      itemMeta.textContent = formatDeletedAt(entry && entry.deletedAt);
      info.append(title, preview, itemMeta);
      const restoreButton = document.createElement("button");
      restoreButton.type = "button";
      restoreButton.style.cssText = "padding:4px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#f3f4f6;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;outline:none;";
      restoreButton.textContent = "Restore";
      restoreButton.setAttribute("data-action", "restore-trash-note");
      restoreButton.setAttribute("data-trash-note-id", entry && entry.id ? String(entry.id) : "");
      wrapper.append(info, restoreButton);
      return wrapper;
    });
    list.append(...items);
  }

  function startFolderLabelMarquee(labelEl) {
    if (!labelEl || !labelEl.__lpMarqueeInner) return;
    const inner = labelEl.__lpMarqueeInner;
    labelEl.classList.remove("marquee-active");
    labelEl.style.removeProperty("--lp-folder-marquee-shift");
    const overflow = inner.scrollWidth - labelEl.clientWidth;
    if (!(overflow > 12)) return;
    labelEl.style.setProperty("--lp-folder-marquee-shift", `${-Math.min(overflow, 180)}px`);
    labelEl.classList.add("marquee-active");
  }

  function stopFolderLabelMarquee(labelEl) {
    if (!labelEl) return;
    labelEl.classList.remove("marquee-active");
    labelEl.style.removeProperty("--lp-folder-marquee-shift");
  }

  function getFolderContextMenuFolder() {
    return getFolderById(state.folderContextMenu.folderId);
  }

  function renderFolderContextMenu() {
    const layer = state.refs.folderMenuLayer;
    const menu = state.refs.folderContextMenu;
    if (!layer || !menu) return;
    const folder = getFolderContextMenuFolder();
    const open = state.folderContextMenu.open === true && !!folder;
    layer.hidden = !open;
    if (!open) return;
    menu.style.left = `${Math.max(12, state.folderContextMenu.anchorX)}px`;
    menu.style.top = `${Math.max(12, state.folderContextMenu.anchorY)}px`;
    if (state.refs.folderMenuTitle) {
      state.refs.folderMenuTitle.textContent = folder.name || "Category";
    }
    if (state.refs.folderMenuPin) {
      const pinned = state.ui.pinnedFolderIds.includes(folder.id);
      state.refs.folderMenuPin.textContent = pinned ? "Unpin Category" : "Pin Category";
    }
    if (state.refs.folderMenuOpen) {
      state.refs.folderMenuOpen.textContent = "View Notes";
    }
    if (state.refs.folderMenuHide) {
      const hidden = state.ui.hiddenFolderIds.includes(folder.id);
      state.refs.folderMenuHide.textContent = hidden ? "Unhide Category" : "Hide Category";
    }
    if (state.refs.folderMenuMoveNote) {
      state.refs.folderMenuMoveNote.disabled = !getActiveNote();
    }
  }

  function buildFolderPaletteOptions() {
    const counts = getFolderCounts(getBaseFilteredNotes());
    return getAssignableFolderRows().map((row) => ({
      id: row.id,
      label: row.label,
      searchText: row.label.toLowerCase(),
      count: row.id ? (counts.get(row.id) || 0) : (counts.get(FILTER_UNCATEGORIZED) || 0)
    }));
  }

  function renderFolderPalette() {
    const layer = state.refs.folderPaletteLayer;
    const list = state.refs.folderPaletteList;
    if (!layer || !list) return;
    const open = state.folderPalette.open === true;
    layer.style.pointerEvents = open ? "auto" : "none";
    layer.style.display = open ? "block" : "none";
    if (!open) return;
    if (state.refs.folderPaletteTitle) {
      const note = getActiveNote();
      state.refs.folderPaletteTitle.textContent = note
        ? `Move "${getNoteTitle(note)}" to category`
        : "Move note to category";
    }
    if (state.refs.folderPaletteInput && state.refs.folderPaletteInput.value !== state.folderPalette.query) {
      state.refs.folderPaletteInput.value = state.folderPalette.query;
    }
    const query = normalizeSearchQuery(state.folderPalette.query).toLowerCase();
    const allOptions = buildFolderPaletteOptions();
    let filtered = query
      ? allOptions.filter((opt) => opt.searchText.includes(query))
      : allOptions;
    if (query) {
      filtered = filtered
        .map((opt, idx) => {
          const starts = opt.searchText.startsWith(query);
          const pos = opt.searchText.indexOf(query);
          return { opt, starts, pos: pos >= 0 ? pos : 9999, idx };
        })
        .sort((a, b) => {
          if (a.starts !== b.starts) return a.starts ? -1 : 1;
          if (a.pos !== b.pos) return a.pos - b.pos;
          return a.opt.label.localeCompare(b.opt.label, undefined, { sensitivity: "base" });
        })
        .map((entry) => entry.opt);
    }
    state.folderPalette.options = filtered;
    if (state.folderPalette.pendingTargetId && filtered.length) {
      const baseIndex = filtered.findIndex((opt) => opt.id === state.folderPalette.pendingTargetId);
      if (baseIndex >= 0) {
        state.folderPalette.activeIndex = ((baseIndex + state.folderPalette.pendingOffset) % filtered.length + filtered.length) % filtered.length;
      }
      state.folderPalette.pendingTargetId = "";
      state.folderPalette.pendingOffset = 0;
    }
    if (state.folderPalette.activeIndex >= filtered.length) {
      state.folderPalette.activeIndex = Math.max(0, filtered.length - 1);
    }
    list.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "color:#a3acb9;font-size:13px;padding:8px 4px;";
      empty.textContent = "No matching categories.";
      list.appendChild(empty);
      return;
    }
    filtered.forEach((opt, index) => {
      const palette = getFolderRowPalette(opt.id || FILTER_UNCATEGORIZED);
      const isActive = index === state.folderPalette.activeIndex;
      const row = document.createElement("button");
      row.type = "button";
      row.style.cssText = [
        "display:flex","align-items:center","justify-content:space-between",
        "gap:10px","width:100%","padding:9px 12px","border-radius:10px",
        "border:1px solid " + (isActive ? palette.rowBorder : "rgba(255,255,255,0.08)"),
        "background:" + (isActive ? palette.rowBackgroundActive : palette.rowBackground),
        "color:#f3f4f6","cursor:pointer","text-align:left","outline:none",
        "box-sizing:border-box"
      ].join(";");
      row.addEventListener("mouseenter", () => {
        state.folderPalette.activeIndex = index;
        renderFolderPalette();
      });
      row.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        chooseFolderPaletteOption(index).catch(() => {
          setSaveStatus("Could not move note", "error");
        });
      });
      const dot = document.createElement("span");
      dot.style.cssText = "width:9px;height:9px;border-radius:999px;flex:0 0 auto;background:" + palette.dot + ";box-shadow:0 0 0 1px " + palette.dotRing + ";";
      const label = document.createElement("span");
      label.style.cssText = "flex:1 1 auto;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:13px;";
      label.textContent = opt.label;
      const meta = document.createElement("span");
      meta.style.cssText = "flex:0 0 auto;font-size:11px;color:#a3acb9;background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:999px;";
      meta.textContent = `${opt.count} note${opt.count === 1 ? "" : "s"}`;
      row.append(dot, label, meta);
      list.appendChild(row);
      if (isActive) {
        setTimeout(() => { try { row.scrollIntoView({ block: "nearest" }); } catch (_) {} }, 0);
      }
    });
  }

  function closeDialog(result) {
    const resolver = state.dialog && typeof state.dialog.resolver === "function"
      ? state.dialog.resolver
      : null;
    state.dialog = {
      open: false,
      mode: "",
      title: "",
      message: "",
      inputLabel: "",
      inputValue: "",
      inputPlaceholder: "",
      confirmLabel: "OK",
      cancelLabel: "Cancel",
      danger: false,
      resolver: null
    };
    renderDialog();
    if (resolver) {
      resolver(result || { confirmed: false, value: "" });
    }
  }

  function openDialog(config) {
    const options = config && typeof config === "object" ? config : {};
    if (state.dialog.open) {
      closeDialog({ confirmed: false, value: "" });
    }
    return new Promise((resolve) => {
      state.dialog = {
        open: true,
        mode: options.mode === "prompt" ? "prompt" : "confirm",
        title: options.title ? String(options.title) : "Dialog",
        message: options.message ? String(options.message) : "",
        inputLabel: options.inputLabel ? String(options.inputLabel) : "",
        inputValue: options.inputValue ? String(options.inputValue) : "",
        inputPlaceholder: options.inputPlaceholder ? String(options.inputPlaceholder) : "",
        confirmLabel: options.confirmLabel ? String(options.confirmLabel) : "OK",
        cancelLabel: options.cancelLabel ? String(options.cancelLabel) : "Cancel",
        danger: options.danger === true,
        resolver: resolve
      };
      renderDialog();
    });
  }

  function showPromptDialog(options) {
    return openDialog({
      ...options,
      mode: "prompt"
    });
  }

  function showConfirmDialog(options) {
    return openDialog({
      ...options,
      mode: "confirm"
    });
  }

  function handleDialogInputKeydown(event) {
    if (!state.dialog.open) return;
    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      handleAction("confirm-dialog");
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      handleAction("cancel-dialog");
    }
  }

  function isEventFromOverlay(event) {
    if (!event || !state.refs.host) return false;
    if (typeof event.composedPath === "function") {
      const path = event.composedPath();
      if (path.includes(state.refs.host) || path.includes(state.refs.overlay)) {
        return true;
      }
    }
    const target = event.target;
    return !!(target && state.refs.host.contains(target));
  }

  function eventPathIncludes(event, node) {
    if (!event || !node) return false;
    if (typeof event.composedPath === "function") {
      const path = event.composedPath();
      return path.includes(node);
    }
    const target = event.target;
    return !!(target && node.contains && node.contains(target));
  }

  function stopOverlayEvent(event) {
    if (!event) return;
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
    event.stopPropagation();
  }

  function markStateDirty() {
    state.editor.dirty = true;
    state.lastLocalChangeAt = Date.now();
  }

  function syncActiveNoteFromInputs(updateTimestamp) {
    const note = getActiveNote();
    if (!note) return null;
    note.title = String(state.editor.title || "").slice(0, 120);
    note.content = String(state.editor.content || "").slice(0, 200000);
    if (updateTimestamp !== false) {
      note.updatedAt = new Date().toISOString();
    }
    return note;
  }

  async function syncActiveNoteFromEditor(updateTimestamp, options = {}) {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(50, options.timeoutMs) : 180;
    let snapshot = null;
    try {
      snapshot = await requestEditorDomSnapshot(timeoutMs);
    } catch (err) {
      snapshot = null;
    }
    if (snapshot) {
      state.editor.title = snapshot.title != null ? String(snapshot.title).slice(0, 120) : "";
      state.editor.content = snapshot.content != null ? String(snapshot.content).slice(0, 200000) : "";
    }
    return syncActiveNoteFromInputs(updateTimestamp);
  }

  async function persist(successMessage, options = {}) {
    const saveStartedAt = Number.isFinite(options.saveStartedAt) ? options.saveStartedAt : Date.now();
    state.folders = normalizeFolders(state.folders);
    state.notes = normalizeNotes(state.notes, state.folders);
    state.ui = normalizeUi(state.ui, state.folders, state.notes);
    state.attachments = pruneAttachmentsMap(state.attachments, state.notes);
    const payload = {
      [NOTES_KEY]: state.notes,
      [NOTES_UI_KEY]: state.ui,
      [ATTACHMENTS_KEY]: state.attachments
    };
    if (options.includeFolders === true) {
      payload[FOLDERS_KEY] = state.folders;
    }
    await storageSet(payload);
    render();
    if (state.lastLocalChangeAt > saveStartedAt) {
      state.editor.dirty = true;
      setSaveStatus("Saving...", "saving");
      if (!state.saveTimer && state.open) {
        scheduleSave({ markDirty: false });
      }
      return;
    }
    state.editor.dirty = false;
    setSaveStatus(successMessage || "Autosaved", "");
  }

  async function persistUiOnly(successMessage) {
    state.ui = normalizeUi(state.ui, state.folders, state.notes);
    await storageSet({
      [NOTES_UI_KEY]: state.ui
    });
    render();
    if (successMessage) {
      setSaveStatus(successMessage, "");
    }
  }

  async function persistAttachmentsOnly(successMessage) {
    state.attachments = normalizeAttachments(state.attachments);
    await storageSet({
      [ATTACHMENTS_KEY]: state.attachments
    });
    if (successMessage) {
      setSaveStatus(successMessage, "");
    }
  }

  function scheduleSave(options = {}) {
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
    }
    if (options.markDirty !== false) {
      markStateDirty();
    }
    setSaveStatus("Saving...", "saving");
    state.saveTimer = setTimeout(async () => {
      state.saveTimer = null;
      const saveStartedAt = Date.now();
      try {
        await syncActiveNoteFromEditor(true, { timeoutMs: 260 });
        await persist("Autosaved", { saveStartedAt });
      } catch (err) {
        setSaveStatus("Save failed", "error");
      }
    }, SAVE_DELAY_MS);
  }

  async function flushSave(successMessage, options = {}) {
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
    }
    const saveStartedAt = Date.now();
    await syncActiveNoteFromEditor(true, { timeoutMs: 260 });
    setSaveStatus("Saving...", "saving");
    try {
      await persist(successMessage || "Saved", {
        saveStartedAt,
        includeFolders: options.includeFolders === true
      });
    } catch (err) {
      setSaveStatus("Save failed", "error");
    }
  }

  function getResponsivePanelWidth() {
    if (window.innerWidth <= MOBILE_BREAKPOINT) return 0;
    const fallback = Math.min(DEFAULT_PANEL_WIDTH, Math.round(window.innerWidth - PANEL_VIEWPORT_MARGIN));
    const preferred = clampPanelWidth(state.ui.panelWidth) || fallback;
    const max = Math.max(360, window.innerWidth - PANEL_VIEWPORT_MARGIN);
    return Math.max(360, Math.min(max, preferred));
  }

  function getResponsivePanelHeight() {
    if (window.innerWidth <= MOBILE_BREAKPOINT) return 0;
    const fallback = Math.min(DEFAULT_PANEL_HEIGHT, Math.round(window.innerHeight - PANEL_VIEWPORT_MARGIN));
    const preferred = clampPanelHeight(state.ui.panelHeight) || fallback;
    const max = Math.max(360, window.innerHeight - PANEL_VIEWPORT_MARGIN);
    return Math.max(360, Math.min(max, preferred));
  }

  function clampPickerPosition(width, height, left, top) {
    const margin = 12;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);
    return {
      left: Math.min(Math.max(Math.round(left), margin), maxLeft),
      top: Math.min(Math.max(Math.round(top), margin), maxTop)
    };
  }

  function applyOverlayLayout() {
    // Overlay is now full-screen backdrop (flex centering) — no position needed
    // Shell position is handled by drag (pickerPosition)
    const shell = state.refs.shell;
    if (!shell) return;
    if (state.pickerPosition) {
      shell.style.position = "fixed";
      shell.style.left = state.pickerPosition.left + "px";
      shell.style.top = state.pickerPosition.top + "px";
      shell.style.transform = "none";
    } else {
      shell.style.position = "";
      shell.style.left = "";
      shell.style.top = "";
      shell.style.transform = "";
    }
  }

  function handleTopbarPointerDown(event) {
    if (!state.open || !state.refs.shell) return;
    if (event.button !== 0) return;
    if (event.target && typeof event.target.closest === "function" && event.target.closest("button,input,select,textarea,a,label")) {
      return;
    }
    const shell = state.refs.shell;
    const rect = shell.getBoundingClientRect();
    state.panelDragSession = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top
    };
    if (state.refs.mpHeader) state.refs.mpHeader.style.cursor = "grabbing";
    try { event.target.setPointerCapture && event.target.setPointerCapture(event.pointerId); } catch (_) {}
    event.preventDefault();
    stopOverlayEvent(event);
  }

  function handleTopbarPointerMove(event) {
    if (!state.panelDragSession || !state.refs.shell) return;
    if (event.pointerId !== state.panelDragSession.pointerId) return;
    const next = {
      left: Math.round(state.panelDragSession.left + (event.clientX - state.panelDragSession.startX)),
      top: Math.round(state.panelDragSession.top + (event.clientY - state.panelDragSession.startY))
    };
    state.pickerPosition = next;
    applyOverlayLayout();
    event.preventDefault();
    stopOverlayEvent(event);
  }

  function handleTopbarPointerUp(event) {
    if (!state.panelDragSession) return;
    if (event.pointerId !== state.panelDragSession.pointerId) return;
    state.panelDragSession = null;
    if (state.refs.mpHeader) state.refs.mpHeader.style.cursor = "grab";
    stopOverlayEvent(event);
  }

  function handleTopbarDoubleClick(event) {
    if (!isPickerPanelMode()) return;
    if (event.target && typeof event.target.closest === "function" && event.target.closest("button,input,select,textarea,a,label")) {
      return;
    }
    state.pickerPosition = null;
    applyOverlayLayout();
    stopOverlayEvent(event);
  }

  function autoResizeContentInput() {
    const frame = state.refs.editorFrame;
    if (!frame) return;
    frame.style.minHeight = `${getEditorBaseHeight()}px`;
  }

  function queueEditorFocus(target, selectAll) {
    state.editor.pendingFocusTarget = target === "title" ? "title" : "content";
    state.editor.pendingFocusSelectAll = selectAll === true;
    if (!state.editor.ready || !state.refs.editorFrame || !state.refs.editorFrame.contentWindow) return;
    state.refs.editorFrame.contentWindow.postMessage({
      type: "lp-notes-focus",
      token: state.editor.token,
      target: state.editor.pendingFocusTarget,
      selectAll: state.editor.pendingFocusSelectAll === true
    }, "*");
  }

  function postEditorMessage(message) {
    if (!state.refs.editorFrame || !state.refs.editorFrame.contentWindow || !state.editor.ready) return false;
    state.refs.editorFrame.contentWindow.postMessage({
      ...message,
      token: state.editor.token
    }, "*");
    return true;
  }

  function syncEditorFrameWithNote(note) {
    const theme = normalizeThemePreset(state.settings.themePreset);
    const nextTitle = note ? (note.title || "") : "";
    const nextContent = note ? (note.content || "") : "";
    const attachmentMap = buildAttachmentMapForContent(nextContent);
    if (!state.editor.ready) {
      state.editor.title = nextTitle;
      state.editor.content = nextContent;
      state.editor.lastTheme = theme;
      state.editor.attachmentMap = attachmentMap;
      return;
    }
    if (
      state.editor.title === nextTitle &&
      state.editor.content === nextContent &&
      state.editor.lastTheme === theme &&
      JSON.stringify(state.editor.attachmentMap) === JSON.stringify(attachmentMap)
    ) {
      return;
    }
    state.editor.title = nextTitle;
    state.editor.content = nextContent;
    state.editor.lastTheme = theme;
    state.editor.attachmentMap = attachmentMap;
    postEditorMessage({
      type: "lp-notes-set-note",
      note: {
        title: nextTitle,
        content: nextContent
      },
      themePreset: theme,
      customThemeColors: state.settings.customThemeColors || null,
      previewMode: state.editor.previewMode === true,
      attachmentMap
    });
  }

  // ========== TRASH SYSTEM ==========
  function normalizeTrashItem(value) {
    if (!value || typeof value !== "object") return null;
    const id = value.id ? String(value.id).trim() : "";
    if (!id) return null;
    return {
      id,
      note: value.note && typeof value.note === "object" ? value.note : null,
      deletedAt: value.deletedAt ? String(value.deletedAt) : new Date().toISOString()
    };
  }

  async function getTrash() {
    const data = await storageGet([TRASH_KEY]);
    const raw = data[TRASH_KEY];
    if (!raw || !Array.isArray(raw)) return [];
    return raw.map(normalizeTrashItem).filter(Boolean);
  }

  async function persistTrash(trash) {
    const normalized = coerceArray(trash).map(normalizeTrashItem).filter(Boolean);
    await storageSet({ [TRASH_KEY]: normalized });
  }

  async function addToTrash(note) {
    if (!note || !note.id) return;
    const trash = await getTrash();
    const existingIndex = trash.findIndex((t) => t && t.id === note.id);
    if (existingIndex >= 0) {
      trash.splice(existingIndex, 1);
    }
    trash.unshift({
      id: note.id,
      note: { ...note },
      deletedAt: new Date().toISOString()
    });
    // Prune old items beyond retention period
    const cutoff = Date.now() - TRASH_RETENTION_MS;
    const pruned = trash.filter((t) => {
      if (!t || !t.deletedAt) return false;
      return Date.parse(t.deletedAt) > cutoff;
    });
    await persistTrash(pruned);
  }

  async function restoreFromTrash(noteId) {
    if (!noteId) return null;
    const trash = await getTrash();
    const index = trash.findIndex((t) => t && t.id === noteId);
    if (index < 0) return null;
    const item = trash[index];
    trash.splice(index, 1);
    await persistTrash(trash);
    return item && item.note ? item.note : null;
  }

  async function emptyTrash() {
    await persistTrash([]);
  }

  async function refreshTrash() {
    state.trash = await getTrash();
  }

  // ========== EXTERNAL SYNC ==========
  function startExternalSyncTimer() {
    if (state.externalSyncTimer) return;
    state.externalSyncTimer = setInterval(async () => {
      if (!state.open || state.pendingExternalReload || document.hidden) return;
      try {
        const data = await storageGet([NOTES_KEY, FOLDERS_KEY]);
        const remoteNotes = coerceArray(data[NOTES_KEY]);
        const remoteFolders = coerceArray(data[FOLDERS_KEY]);
        const localNoteIds = new Set(state.notes.map((n) => n && n.id));
        const remoteNoteIds = new Set(remoteNotes.map((n) => n && n.id));
        // Check if any notes were added/removed externally
        let hasExternalChange = false;
        for (const id of remoteNoteIds) {
          if (!localNoteIds.has(id)) {
            hasExternalChange = true;
            break;
          }
        }
        if (!hasExternalChange) {
          for (const id of localNoteIds) {
            if (!remoteNoteIds.has(id)) {
              hasExternalChange = true;
              break;
            }
          }
        }
        if (hasExternalChange) {
          state.pendingExternalReload = true;
          // Don't reload while user is typing - will reload on next check or blur
        }
      } catch (err) {
        // ignore sync errors
      }
    }, EXTERNAL_SYNC_CHECK_INTERVAL_MS);
  }

  function stopExternalSyncTimer() {
    if (state.externalSyncTimer) {
      clearInterval(state.externalSyncTimer);
      state.externalSyncTimer = null;
    }
  }

  async function reloadFromExternal() {
    if (!state.pendingExternalReload) return;
    state.pendingExternalReload = false;
    const data = await storageGet([NOTES_KEY, FOLDERS_KEY, ATTACHMENTS_KEY, TRASH_KEY]);
    state.folders = normalizeFolders(data[FOLDERS_KEY]);
    state.notes = normalizeNotes(data[NOTES_KEY], state.folders);
    state.attachments = pruneAttachmentsMap(data[ATTACHMENTS_KEY], state.notes);
    state.trash = coerceArray(data[TRASH_KEY]).map(normalizeTrashItem).filter(Boolean);
    ensureActiveNoteExists();
    render();
    setSaveStatus("Synced from other tabs", "");
  }

  // ========== RENDER OPTIMIZATION ==========
  let renderScheduled = false;
  const RENDER_BATCH_DELAY = 16; // ~1 frame

  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderScheduled = false;
      if (state.mounted) {
        render();
      }
    });
  }

  function handleEditorStateChange(payload) {
    state.editor.title = payload && payload.title != null ? String(payload.title).slice(0, 120) : "";
    state.editor.content = payload && payload.content != null ? String(payload.content).slice(0, 200000) : "";
    syncActiveNoteFromInputs(true);
    setSaveStatus("Saving...", "saving");
    scheduleSave();
    // Optimized: only update editor metadata, not full render
    renderEditorMetadataOnly();
  }

  function renderEditorMetadataOnly() {
    if (!state.refs.editorMeta) return;
    const note = getActiveNote();
    if (!note) {
      state.refs.editorMeta.textContent = "0 words";
      return;
    }
    const stats = getChecklistStats(note);
    const parts = [
      `${countWords(note.content)} words`,
      `${countChars(note.content)} chars`,
      formatUpdatedAt(note.updatedAt)
    ];
    if (stats.total > 0) {
      parts.push(stats.open === 0 ? "all tasks done" : `${stats.open}/${stats.total} tasks open`);
    }
    state.refs.editorMeta.textContent = parts.join(" | ");
  }

  function handleEditorFrameMessage(event) {
    const frameWindow = state.refs.editorFrame && state.refs.editorFrame.contentWindow;
    if (!frameWindow || event.source !== frameWindow) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "lp-notes-editor-ready") {
      state.editor.ready = true;
      if (!state.editor.token) {
        state.editor.token = makeId("notes-editor");
      }
      postEditorMessage({
        type: "lp-notes-init",
        note: {
          title: state.editor.title || "",
          content: state.editor.content || ""
        },
        themePreset: normalizeThemePreset(state.settings.themePreset),
        customThemeColors: state.settings.customThemeColors || null,
        previewMode: state.editor.previewMode === true,
        attachmentMap: buildAttachmentMapForContent(state.editor.content || "")
      });
      syncEditorFrameWithNote(getActiveNote());
      if (state.open) {
        queueEditorFocus(state.editor.pendingFocusTarget, state.editor.pendingFocusSelectAll);
      }
      return;
    }
    if (!state.editor.token || data.token !== state.editor.token) return;
    if (data.type === "lp-notes-editor-state") {
      handleEditorStateChange(data);
      return;
    }
    if (data.type === "lp-notes-save-request") {
      flushSave("Saved").catch(() => { });
      return;
    }
    if (data.type === "lp-notes-command") {
      handleEditorCommand(data.command, data.payload);
      return;
    }
    if (data.type === "lp-notes-attachment-request") {
      handleAttachmentRequest(data).catch(() => {
        postEditorMessage({
          type: "lp-notes-attachment-response",
          requestId: data && data.requestId ? String(data.requestId) : "",
          ok: false,
          error: "Attachment save failed"
        });
      });
      return;
    }
    if (data.type === "lp-notes-close-request") {
      close();
    }
  }

  function buildStyles() {
    return `
      :host { all: initial; }
      * { box-sizing: border-box; }
      .lp-overlay { font-family: -apple-system, "Segoe UI", sans-serif; }
      .lp-overlay[data-open="true"] { opacity: 1 !important; pointer-events: auto !important; }
      .lp-editor-frame { display: block; width: 100%; height: 100%; border: none; background: transparent; }
      input:focus, button:focus { outline: none; }
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 999px; }
      ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
    `;
  }


  function buildMarkup() {
    // ── Helper ──────────────────────────────────────────────────────────────
    const P = "rgba(18,18,18,0.88)";       // panel background
    const B = "1px solid rgba(255,255,255,0.08)"; // panel border
    const TXT = "#f3f4f6";                 // primary text
    const MUTED = "#a3acb9";              // muted text
    const ACCENT = "#5ac8ff";             // accent
    const CHIP = "rgba(255,255,255,0.06)"; // chip/input bg
    const CHIPB = "1px solid rgba(255,255,255,0.12)"; // chip border
    const INPB = "1px solid rgba(255,255,255,0.12)";  // input border
    const INPBG = "rgba(255,255,255,0.06)";
    const SHADOW = "0 18px 40px rgba(0,0,0,0.45)";
    const RADIUS = "18px";
    const BTN_STYLE = [
      "width:28px","height:28px","border-radius:8px",
      "border:1px solid rgba(255,255,255,0.12)","background:rgba(255,255,255,0.06)",
      "color:inherit","font-size:14px","cursor:pointer","display:inline-flex",
      "align-items:center","justify-content:center","outline:none","flex-shrink:0"
    ].join(";");

    function mk(tag, css, text) {
      const el = document.createElement(tag);
      if (css) el.style.cssText = css;
      if (text != null) el.textContent = text;
      return el;
    }
    function btn(label, role, action, extraCss) {
      const el = mk("button", BTN_STYLE + (extraCss ? ";" + extraCss : ""), label);
      el.type = "button";
      if (role) el.setAttribute("data-role", role);
      if (action) el.setAttribute("data-action", action);
      return el;
    }
    function smallBtn(label, role, action) {
      const el = mk("button", [
        "padding:3px 10px","border-radius:8px",
        "border:" + CHIPB,"background:" + CHIP,"color:" + TXT,
        "font-size:11px","font-weight:600","cursor:pointer","outline:none"
      ].join(";"), label);
      el.type = "button";
      if (role) el.setAttribute("data-role", role);
      if (action) el.setAttribute("data-action", action);
      return el;
    }

    // ── Overlay (backdrop) ───────────────────────────────────────────────────
    const overlay = mk("div", [
      "position:fixed","inset:0","z-index:2147483647",
      "display:flex","align-items:center","justify-content:center",
      "background:rgba(0,0,0,0.55)","opacity:0","pointer-events:none",
      "transition:opacity 180ms ease"
    ].join(";"));
    overlay.className = "lp-overlay";
    overlay.setAttribute("data-open", "false");

    // ── Shell (panelShell) ───────────────────────────────────────────────────
    const shell = mk("div", [
      "display:flex","flex-direction:row","align-items:stretch","gap:10px",
      "max-width:98vw","max-height:92vh","box-sizing:border-box"
    ].join(";"));
    shell.setAttribute("data-role", "shell");
    overlay.appendChild(shell);

    // ════════════════════════════════════════════════════════════════════════
    // LEFT PANEL — senarai kategori (sama persis macam categorySidePanel)
    // ════════════════════════════════════════════════════════════════════════
    const leftPanel = mk("div", [
      "display:flex","flex-direction:column",
      "width:min(220px,22vw)","min-width:180px","max-height:92vh",
      "background:" + P, "border:" + B, "border-radius:" + RADIUS,
      "box-shadow:" + SHADOW, "padding:10px 6px",
      "box-sizing:border-box","overflow:hidden","gap:4px"
    ].join(";"));
    leftPanel.setAttribute("data-role", "left-panel");

    // Left panel header
    const lpHeader = mk("div", [
      "display:flex","align-items:center","justify-content:space-between",
      "padding:2px 8px 6px","flex:0 0 auto",
      "border-bottom:1px solid rgba(255,255,255,0.08)","margin-bottom:2px"
    ].join(";"));
    const lpTitle = mk("span", [
      "color:" + MUTED,"font-size:10px","font-weight:700",
      "letter-spacing:0.06em","text-transform:uppercase"
    ].join(";"), "NOTES");
    lpTitle.setAttribute("data-role", "lp-title");
    const lpNewBtn = mk("button", [
      "display:inline-flex","align-items:center","justify-content:center",
      "padding:2px 7px","border-radius:6px","border:" + CHIPB,
      "background:" + CHIP,"color:" + ACCENT,"font-size:9px","font-weight:700",
      "letter-spacing:0.05em","cursor:pointer","line-height:1.4","outline:none"
    ].join(";"), "NEW");
    lpNewBtn.type = "button";
    lpNewBtn.setAttribute("data-role", "lp-new-btn");
    lpNewBtn.setAttribute("data-action", "new-note");
    lpNewBtn.title = "Nota baru";
    lpHeader.append(lpTitle, lpNewBtn);

    // Left panel list
    const lpList = mk("div", [
      "display:flex","flex-direction:column","flex:1 1 auto",
      "overflow-y:auto","overscroll-behavior:contain","gap:2px"
    ].join(";"));
    lpList.setAttribute("data-role", "lp-list");

    leftPanel.append(lpHeader, lpList);
    shell.appendChild(leftPanel);

    // ════════════════════════════════════════════════════════════════════════
    // MAIN PANEL — senarai nota & editor
    // ════════════════════════════════════════════════════════════════════════
    const mainPanel = mk("div", [
      "display:flex","flex-direction:column","gap:7px",
      "width:min(680px,72vw)","min-width:400px","max-width:98vw","max-height:92vh",
      "background:" + P,"border:" + B,"border-radius:" + RADIUS,
      "box-shadow:" + SHADOW,"backdrop-filter:blur(4px)",
      "padding:10px 14px 12px","box-sizing:border-box",
      "min-height:480px","height:min(720px,calc(100vh - 28px))",
      "overflow:hidden","color:" + TXT,"position:relative"
    ].join(";"));
    mainPanel.setAttribute("data-role", "main-panel");

    // Main header
    const mpHeader = mk("div", [
      "display:flex","align-items:center","gap:8px",
      "flex:0 0 auto","cursor:grab","user-select:none","min-height:36px"
    ].join(";"));
    mpHeader.setAttribute("data-role", "mp-header");

    const mpBackBtn = mk("button", [
      "width:28px","height:28px","border-radius:8px",
      "border:1px solid rgba(255,255,255,0.12)","background:rgba(255,255,255,0.08)",
      "color:#fff","cursor:pointer","font-size:16px","display:none",
      "align-items:center","justify-content:center","flex-shrink:0","outline:none"
    ].join(";"), "←");
    mpBackBtn.type = "button";
    mpBackBtn.setAttribute("data-role", "mp-back-btn");
    mpBackBtn.title = "Kembali";

    const mpTitle = mk("div", [
      "color:" + TXT,"font-size:16px","font-weight:600",
      "flex:1 1 auto","overflow:hidden","text-overflow:ellipsis","white-space:nowrap"
    ].join(";"), "Notes");
    mpTitle.setAttribute("data-role", "mp-title");

    const mpActionRight = mk("div", "display:flex;align-items:center;gap:6px;flex-shrink:0;");

    const mpNewNoteBtn = btn("✏️", "mp-new-note-btn", "new-note");
    mpNewNoteBtn.title = "Nota baru";

    const mpDeleteBtn = btn("🗑️", "mp-delete-btn", "delete-note");
    mpDeleteBtn.title = "Padam nota";
    mpDeleteBtn.style.color = "#ff8f8f";

    const mpPinBtn = btn("📌", "mp-pin-btn", "toggle-pin");
    mpPinBtn.setAttribute("data-role", "pin-button");
    mpPinBtn.title = "Pin nota";

    const mpTrashBtn = btn("♻️", "mp-trash-btn", "open-trash");
    mpTrashBtn.setAttribute("data-role", "open-trash-button");
    mpTrashBtn.title = "Tong sampah";

    // Butang AI — buka AI sidebar
    const mpAiBtn = mk("button", [
      "width:28px","height:28px","border-radius:8px",
      "border:1px solid rgba(100,200,255,0.25)","background:rgba(100,200,255,0.08)",
      "color:#7ab8ff","font-size:13px","font-weight:700","cursor:pointer","display:inline-flex",
      "align-items:center","justify-content:center","outline:none","flex-shrink:0",
      "transition:all 150ms ease"
    ].join(";"), "AI");
    mpAiBtn.type = "button";
    mpAiBtn.setAttribute("data-role", "mp-ai-btn");
    mpAiBtn.setAttribute("data-action", "open-ai");
    mpAiBtn.title = "Buka AI sidebar";

    // Panel pin button
    const mpPanelPinBtn = mk("button", [
      "width:28px","height:28px","border-radius:8px",
      "border:1px solid rgba(255,255,255,0.12)","background:rgba(255,255,255,0.06)",
      "color:inherit","font-size:14px","cursor:pointer","display:inline-flex",
      "align-items:center","justify-content:center","outline:none","flex-shrink:0",
      "opacity:0.4","transition:all 200ms ease"
    ].join(";"), "📍");
    mpPanelPinBtn.type = "button";
    mpPanelPinBtn.setAttribute("data-role", "mp-panel-pin-btn");
    mpPanelPinBtn.setAttribute("data-action", "toggle-panel-pin");
    mpPanelPinBtn.title = "Pin panel supaya tak tutup bila klik luar";

    const mpSaveStatus = mk("span", [
      "font-size:10px","color:" + MUTED,"padding:2px 8px",
      "border-radius:999px","border:1px solid rgba(255,255,255,0.1)",
      "background:rgba(255,255,255,0.04)","flex-shrink:0","white-space:nowrap"
    ].join(";"), "Ready");
    mpSaveStatus.setAttribute("data-role", "save-status");

    mpActionRight.append(mpNewNoteBtn, mpPinBtn, mpDeleteBtn, mpTrashBtn, mpAiBtn, mpPanelPinBtn, mpSaveStatus);
    mpHeader.append(mpBackBtn, mpTitle, mpActionRight);

    // Search input
    const mpSearch = mk("input", [
      "width:100%","padding:7px 10px","box-sizing:border-box",
      "border-radius:8px","border:" + INPB,"background:" + INPBG,
      "color:" + TXT,"font-size:13px","outline:none","flex:0 0 auto"
    ].join(";"));
    mpSearch.type = "text";
    mpSearch.placeholder = "Filter...";
    mpSearch.setAttribute("data-role", "mp-search");

    // Category/folder select for note
    const mpCatWrap = mk("div", [
      "display:flex","align-items:center","gap:6px",
      "flex:0 0 auto","padding:2px 0"
    ].join(";"));
    mpCatWrap.setAttribute("data-role", "mp-cat-wrap");
    const mpCatLabel = mk("span", "font-size:11px;color:" + MUTED + ";flex-shrink:0;", "Kategori:");
    const mpCatSelect = mk("select", [
      "flex:1 1 auto","padding:3px 8px","border-radius:8px",
      "border:" + CHIPB,"background:rgba(12,12,12,0.85)",
      "color:" + TXT,"font-size:12px","outline:none","cursor:pointer"
    ].join(";"));
    mpCatSelect.setAttribute("data-role", "folder-select");
    const mpCatAddBtn = smallBtn("+", "mp-cat-add-btn", "new-folder-for-note");
    mpCatAddBtn.title = "Tambah kategori";
    mpCatWrap.append(mpCatLabel, mpCatSelect, mpCatAddBtn);

    // Notes list
    const mpList = mk("div", [
      "display:flex","flex-direction:column","gap:4px",
      "overflow-y:auto","overscroll-behavior:contain",
      "flex:1 1 auto","min-height:0"
    ].join(";"));
    mpList.setAttribute("data-role", "mp-list");

    // Pager
    const mpPager = mk("div", [
      "display:none","align-items:center","justify-content:space-between",
      "gap:8px","flex:0 0 auto"
    ].join(";"));
    mpPager.setAttribute("data-role", "mp-pager");
    const mpPrev = mk("button", [
      "padding:3px 10px","border-radius:8px","border:" + CHIPB,
      "background:" + CHIP,"color:" + TXT,"font-size:12px",
      "cursor:pointer","outline:none"
    ].join(";"), "←");
    mpPrev.type = "button";
    mpPrev.setAttribute("data-role", "mp-prev");
    mpPrev.setAttribute("data-action", "npp-page-prev");
    const mpNext = mk("button", [
      "padding:3px 10px","border-radius:8px","border:" + CHIPB,
      "background:" + CHIP,"color:" + TXT,"font-size:12px",
      "cursor:pointer","outline:none"
    ].join(";"), "→");
    mpNext.type = "button";
    mpNext.setAttribute("data-role", "mp-next");
    mpNext.setAttribute("data-action", "npp-page-next");
    const mpPagerInfo = mk("span", "color:" + MUTED + ";font-size:12px;", "1/1");
    mpPagerInfo.setAttribute("data-role", "mp-pager-info");
    mpPager.append(mpPrev, mpPagerInfo, mpNext);

    // Editor frame
    const mpEditor = mk("div", [
      "display:none","flex-direction:column","flex:1 1 auto","min-height:0","gap:6px"
    ].join(";"));
    mpEditor.setAttribute("data-role", "mp-editor");

    const mpEditorMeta = mk("div", "font-size:11px;color:" + MUTED + ";flex:0 0 auto;", "0 words");
    mpEditorMeta.setAttribute("data-role", "editor-meta");

    const editorFrame = document.createElement("iframe");
    editorFrame.className = "lp-editor-frame";
    editorFrame.setAttribute("data-role", "editor-frame");
    editorFrame.setAttribute("src", EDITOR_FRAME_URL);
    editorFrame.setAttribute("title", "Note editor");
    editorFrame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    editorFrame.style.cssText = [
      "display:block","width:100%","flex:1 1 auto","min-height:200px",
      "border:1px solid rgba(255,255,255,0.1)","border-radius:12px",
      "background:rgba(255,255,255,0.02)"
    ].join(";");

    // SSS — Selection Search Send to AI floating button
    const sssBtn = mk("button", [
      "display:none","position:absolute","z-index:10",
      "right:16px","bottom:16px",
      "padding:6px 14px","border-radius:999px",
      "border:1px solid rgba(100,200,255,0.4)","background:rgba(16,18,28,0.96)",
      "color:#7ab8ff","font-size:12px","font-weight:700","cursor:pointer",
      "white-space:nowrap","gap:5px","align-items:center",
      "box-shadow:0 4px 16px rgba(0,0,0,0.4)","outline:none",
      "transition:opacity 120ms ease"
    ].join(";"), "✦ AI");
    sssBtn.type = "button";
    sssBtn.setAttribute("data-role", "sss-btn");
    sssBtn.title = "Hantar teks terpilih ke AI sidebar (SSS)";

    // SSS Search — butang toggle enable/disable (sama fungsi dengan sidebar AI)
    const mpEditorMetaRow = mk("div", [
      "display:flex","align-items:center","justify-content:space-between",
      "gap:8px","flex:0 0 auto"
    ].join(";"));
    const sssSearchToggle = mk("button", [
      "display:inline-flex","align-items:center","justify-content:center",
      "gap:4px","padding:3px 10px","border-radius:999px",
      "border:1px solid rgba(255,255,255,0.15)","background:rgba(0,0,0,0.2)",
      "color:#555","font-size:11px","font-weight:700","cursor:pointer",
      "outline:none","white-space:nowrap","flex:0 0 auto",
      "transition:background 120ms ease,color 120ms ease,border-color 120ms ease"
    ].join(";"), "🔍 SSS");
    sssSearchToggle.type = "button";
    sssSearchToggle.setAttribute("data-role", "sss-search-toggle");
    sssSearchToggle.setAttribute("aria-pressed", "false");
    sssSearchToggle.title = "Selection Search dalam nota";
    mpEditorMetaRow.append(mpEditorMeta, sssSearchToggle);

    // SSS Search — popup senarai enjin carian untuk teks terpilih dalam nota
    const sssSearchPopup = mk("div", [
      "position:fixed","z-index:2147483646","display:none",
      "flex-direction:column","gap:5px",
      "width:min(230px,calc(100vw - 20px))","max-height:min(45vh,340px)",
      "padding:10px","border-radius:14px",
      "border:1px solid rgba(255,255,255,0.12)",
      "background:linear-gradient(180deg,rgba(23,26,38,0.99),rgba(13,15,23,0.99))",
      "color:#eef2ff","font-size:12px","font-weight:600",
      "box-shadow:0 20px 46px rgba(0,0,0,0.5)","overflow:hidden"
    ].join(";"));
    sssSearchPopup.setAttribute("data-role", "sss-search-popup");

    mpEditor.style.position = "relative";
    mpEditor.append(mpEditorMetaRow, editorFrame, sssBtn);

    // Hint
    const mpHint = mk("div", [
      "color:rgba(255,255,255,0.4)","font-size:11px","flex:0 0 auto"
    ].join(";"), "↑↓ pilih | Enter buka | Esc tutup");
    mpHint.setAttribute("data-role", "mp-hint");

    mainPanel.append(mpHeader, mpSearch, mpCatWrap, mpList, mpPager, mpEditor, mpHint);
    shell.appendChild(mainPanel);

    // ── Dialog layer (absolute, covers both panels) ──────────────────────────
    const dialogWrap = mk("div", [
      "position:fixed","inset:0","z-index:2147483648",
      "display:none","align-items:center","justify-content:center",
      "background:rgba(0,0,0,0.56)"
    ].join(";"));
    dialogWrap.setAttribute("data-role", "dialog-layer");
    const dialogCard = mk("div", [
      "position:relative","z-index:1",
      "width:min(420px,calc(100% - 32px))","display:grid","gap:14px",
      "padding:18px","border-radius:20px",
      "border:1px solid rgba(255,255,255,0.12)",
      "background:rgba(16,18,24,0.98)","color:" + TXT,
      "box-shadow:0 22px 60px rgba(0,0,0,0.36)"
    ].join(";"));
    dialogCard.setAttribute("role", "dialog");
    dialogCard.setAttribute("aria-modal", "true");
    const dialogTitle = mk("div", "font-size:17px;font-weight:700;", "");
    dialogTitle.setAttribute("data-role", "dialog-title");
    const dialogMsg = mk("div", "font-size:14px;color:rgba(255,255,255,0.7);line-height:1.5;", "");
    dialogMsg.setAttribute("data-role", "dialog-message");
    const dialogInputWrap = mk("label", "display:grid;gap:8px;");
    dialogInputWrap.setAttribute("data-role", "dialog-input-wrap");
    dialogInputWrap.style.display = "none";
    const dialogInputLabel = mk("span", "font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:" + MUTED + ";", "");
    dialogInputLabel.setAttribute("data-role", "dialog-input-label");
    const dialogInput = mk("input", [
      "width:100%","min-height:42px","border:1px solid rgba(255,255,255,0.12)",
      "border-radius:10px","background:rgba(255,255,255,0.04)",
      "color:" + TXT,"padding:0 14px","font-size:14px","outline:none"
    ].join(";"));
    dialogInput.type = "text";
    dialogInput.setAttribute("data-role", "dialog-input");
    dialogInput.setAttribute("maxlength", "120");
    dialogInput.setAttribute("autocomplete", "off");
    dialogInputWrap.append(dialogInputLabel, dialogInput);
    const dialogActions = mk("div", "display:flex;justify-content:flex-end;gap:8px;");
    const dialogCancel = mk("button", [
      "padding:6px 16px","border-radius:10px","border:" + CHIPB,
      "background:" + CHIP,"color:" + TXT,"font-size:13px","font-weight:600",
      "cursor:pointer","outline:none"
    ].join(";"), "Cancel");
    dialogCancel.type = "button";
    dialogCancel.setAttribute("data-role", "dialog-cancel");
    dialogCancel.setAttribute("data-action", "cancel-dialog");
    const dialogConfirm = mk("button", [
      "padding:6px 16px","border-radius:10px",
      "border:1px solid transparent",
      "background:linear-gradient(135deg,#5ac8ff,#3a8fff)",
      "color:#fff","font-size:13px","font-weight:700",
      "cursor:pointer","outline:none"
    ].join(";"), "OK");
    dialogConfirm.type = "button";
    dialogConfirm.setAttribute("data-role", "dialog-confirm");
    dialogConfirm.setAttribute("data-action", "confirm-dialog");
    dialogActions.append(dialogCancel, dialogConfirm);
    dialogCard.append(dialogTitle, dialogMsg, dialogInputWrap, dialogActions);
    dialogWrap.appendChild(dialogCard);
    overlay.appendChild(dialogWrap);

    // ── Undo toast ───────────────────────────────────────────────────────────
    const undoToast = mk("div", [
      "display:none","align-items:center","justify-content:space-between",
      "gap:10px","padding:8px 12px",
      "border:1px solid rgba(255,214,51,0.35)","border-radius:12px",
      "background:rgba(255,214,51,0.1)","color:#ffe48a",
      "position:fixed","bottom:24px","left:50%",
      "transform:translateX(-50%)","z-index:2147483650","white-space:nowrap"
    ].join(";"));
    undoToast.setAttribute("data-role", "undo-toast");
    const undoMsg = mk("span", "font-size:12px;", "");
    undoMsg.setAttribute("data-role", "undo-toast-message");
    const undoBtn = mk("button", [
      "padding:3px 10px","border-radius:8px",
      "border:1px solid rgba(255,255,255,0.25)",
      "background:rgba(255,255,255,0.12)","color:#fff5c1",
      "font-size:12px","cursor:pointer","outline:none"
    ].join(";"), "Undo");
    undoBtn.type = "button";
    undoBtn.setAttribute("data-role", "undo-delete-button");
    undoBtn.setAttribute("data-action", "undo-delete-note");
    undoToast.append(undoMsg, undoBtn);
    overlay.appendChild(undoToast);

    // ── Trash layer ──────────────────────────────────────────────────────────
    const trashLayer = mk("div", [
      "position:fixed","inset:0","z-index:2147483648",
      "display:none","align-items:center","justify-content:center",
      "background:rgba(0,0,0,0.62)","padding:16px"
    ].join(";"));
    trashLayer.setAttribute("data-role", "trash-layer");
    const trashCard = mk("div", [
      "position:relative","z-index:1",
      "width:min(640px,calc(100% - 32px))",
      "max-height:min(72vh,760px)","display:grid",
      "grid-template-rows:auto auto minmax(0,1fr) auto",
      "gap:14px","padding:18px","border-radius:18px",
      "border:1px solid rgba(255,255,255,0.12)",
      "background:rgba(16,18,24,0.98)","color:" + TXT,
      "box-shadow:0 22px 60px rgba(0,0,0,0.36)"
    ].join(";"));
    trashCard.setAttribute("role", "dialog");
    const trashHead = mk("div", "display:flex;align-items:flex-start;justify-content:space-between;gap:16px;");
    const trashTitleWrap = mk("div", "");
    const trashTitleEl = mk("div", "font-size:17px;font-weight:700;", "Deleted Notes");
    const trashMetaEl = mk("div", "font-size:13px;color:rgba(255,255,255,0.6);margin-top:4px;", "");
    trashMetaEl.setAttribute("data-role", "trash-meta");
    trashTitleWrap.append(trashTitleEl, trashMetaEl);
    const trashCloseBtn = mk("button", [
      "padding:4px 12px","border-radius:8px","border:" + CHIPB,
      "background:" + CHIP,"color:" + TXT,"font-size:12px",
      "cursor:pointer","outline:none"
    ].join(";"), "Close");
    trashCloseBtn.type = "button";
    trashCloseBtn.setAttribute("data-action", "close-trash");
    trashHead.append(trashTitleWrap, trashCloseBtn);
    const trashEmpty = mk("div", [
      "border:1px dashed rgba(255,255,255,0.15)","border-radius:12px",
      "padding:16px","color:" + MUTED,"font-size:13px","text-align:center"
    ].join(";"), "No deleted notes.");
    trashEmpty.setAttribute("data-role", "trash-empty");
    trashEmpty.style.display = "none";
    const trashList = mk("div", "min-height:80px;max-height:min(50vh,480px);overflow:auto;display:grid;gap:8px;padding-right:4px;");
    trashList.setAttribute("data-role", "trash-list");
    const trashActions = mk("div", "display:flex;justify-content:flex-end;gap:8px;");
    const emptyTrashBtn = mk("button", [
      "padding:6px 14px","border-radius:8px",
      "border:1px solid rgba(255,143,143,0.3)",
      "background:rgba(255,143,143,0.1)","color:#ff8f8f",
      "font-size:12px","font-weight:600","cursor:pointer","outline:none"
    ].join(";"), "Empty trash");
    emptyTrashBtn.type = "button";
    emptyTrashBtn.setAttribute("data-role", "empty-trash-button");
    emptyTrashBtn.setAttribute("data-action", "empty-trash");
    trashActions.appendChild(emptyTrashBtn);
    trashCard.append(trashHead, trashEmpty, trashList, trashActions);
    trashLayer.appendChild(trashCard);
    overlay.appendChild(trashLayer);

    // ── Folder palette (move note to category) ──────────────────────────────���
    const palLayer = mk("div", [
      "position:fixed","inset:0","z-index:2147483649",
      "display:none","pointer-events:none"
    ].join(";"));
    palLayer.setAttribute("data-role", "folder-palette-layer");
    const palBox = mk("div", [
      "position:absolute","left:50%","top:14%",
      "transform:translateX(-50%)","pointer-events:auto",
      "width:min(420px,calc(100% - 24px))",
      "max-height:min(72vh,640px)","display:grid",
      "grid-template-rows:auto auto minmax(0,1fr)",
      "gap:10px","padding:12px","border-radius:18px",
      "border:1px solid rgba(255,255,255,0.12)",
      "background:rgba(16,18,24,0.98)",
      "box-shadow:0 22px 60px rgba(0,0,0,0.36)","color:" + TXT
    ].join(";"));
    palBox.setAttribute("data-role", "folder-palette");
    const palTitle = mk("div", "font-size:13px;font-weight:700;", "Move note to category");
    palTitle.setAttribute("data-role", "folder-palette-title");
    const palInput = mk("input", [
      "width:100%","min-height:42px","border:1px solid rgba(255,255,255,0.12)",
      "border-radius:12px","background:rgba(255,255,255,0.04)",
      "color:" + TXT,"padding:0 14px","font-size:14px","outline:none"
    ].join(";"));
    palInput.type = "text";
    palInput.setAttribute("autocomplete", "off");
    palInput.setAttribute("placeholder", "Type category name");
    palInput.setAttribute("data-role", "folder-palette-input");
    const palList = mk("div", "min-height:100px;max-height:min(52vh,440px);overflow:auto;display:grid;gap:6px;");
    palList.setAttribute("data-role", "folder-palette-list");
    palBox.append(palTitle, palInput, palList);
    palLayer.appendChild(palBox);
    overlay.appendChild(palLayer);

    // ── Import file input (hidden) ───────────────────────────────────────────
    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = ".txt,text/plain";
    importInput.multiple = true;
    importInput.style.display = "none";
    importInput.setAttribute("data-role", "import-txt-input");
    overlay.appendChild(importInput);

    // SSS Search popup — anak overlay supaya position:fixed kekal atas segala panel
    overlay.appendChild(sssSearchPopup);

    return overlay;
  }


  function ensureMounted() {
    if (state.mounted) return;
    const host = document.createElement("div");
    host.id = ROOT_ID;
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = buildStyles();
    shadow.append(style, buildMarkup());
    state.shadow = shadow;
    state.refs.host = host;

    // ── New refs matching new buildMarkup ──────────────────────────────────
    state.refs.overlay        = shadow.querySelector(".lp-overlay");
    state.refs.shell          = shadow.querySelector('[data-role="shell"]');
    state.refs.leftPanel      = shadow.querySelector('[data-role="left-panel"]');
    state.refs.lpList         = shadow.querySelector('[data-role="lp-list"]');
    state.refs.lpTitle        = shadow.querySelector('[data-role="lp-title"]');
    state.refs.mainPanel      = shadow.querySelector('[data-role="main-panel"]');
    state.refs.mpHeader       = shadow.querySelector('[data-role="mp-header"]');
    state.refs.mpTitle        = shadow.querySelector('[data-role="mp-title"]');
    state.refs.mpBackBtn      = shadow.querySelector('[data-role="mp-back-btn"]');
    state.refs.mpSearch       = shadow.querySelector('[data-role="mp-search"]');
    state.refs.mpCatWrap      = shadow.querySelector('[data-role="mp-cat-wrap"]');
    state.refs.mpList         = shadow.querySelector('[data-role="mp-list"]');
    state.refs.mpPager        = shadow.querySelector('[data-role="mp-pager"]');
    state.refs.mpPagerInfo    = shadow.querySelector('[data-role="mp-pager-info"]');
    state.refs.mpPrev         = shadow.querySelector('[data-role="mp-prev"]');
    state.refs.mpNext         = shadow.querySelector('[data-role="mp-next"]');
    state.refs.mpEditor       = shadow.querySelector('[data-role="mp-editor"]');
    state.refs.mpHint         = shadow.querySelector('[data-role="mp-hint"]');
    state.refs.editorFrame    = shadow.querySelector('[data-role="editor-frame"]');
    state.refs.editorMeta     = shadow.querySelector('[data-role="editor-meta"]');
    state.refs.saveStatus     = shadow.querySelector('[data-role="save-status"]');
    state.refs.mpPanelPinBtn  = shadow.querySelector('[data-role="mp-panel-pin-btn"]');
    state.refs.sssBtn         = shadow.querySelector('[data-role="sss-btn"]');
    state.refs.sssSearchToggle = shadow.querySelector('[data-role="sss-search-toggle"]');
    state.refs.sssSearchPopup = shadow.querySelector('[data-role="sss-search-popup"]');
    state.refs.mpAiBtn        = shadow.querySelector('[data-role="mp-ai-btn"]');
    state.refs.folderSelect   = shadow.querySelector('[data-role="folder-select"]');
    state.refs.importFileInput = shadow.querySelector('[data-role="import-txt-input"]');
    // pin button (mp-pin-btn uses data-role="pin-button" too)
    state.refs.pinButtons     = Array.from(shadow.querySelectorAll('[data-role="pin-button"]'));
    state.refs.openTrashButton = shadow.querySelector('[data-role="mp-trash-btn"]');

    // Dialog refs
    state.refs.dialogLayer    = shadow.querySelector('[data-role="dialog-layer"]');
    state.refs.dialogTitle    = shadow.querySelector('[data-role="dialog-title"]');
    state.refs.dialogMessage  = shadow.querySelector('[data-role="dialog-message"]');
    state.refs.dialogInputWrap = shadow.querySelector('[data-role="dialog-input-wrap"]');
    state.refs.dialogInputLabel = shadow.querySelector('[data-role="dialog-input-label"]');
    state.refs.dialogInput    = shadow.querySelector('[data-role="dialog-input"]');
    state.refs.dialogConfirm  = shadow.querySelector('[data-role="dialog-confirm"]');
    state.refs.dialogCancel   = shadow.querySelector('[data-role="dialog-cancel"]');

    // Trash refs
    state.refs.trashLayer     = shadow.querySelector('[data-role="trash-layer"]');
    state.refs.trashMeta      = shadow.querySelector('[data-role="trash-meta"]');
    state.refs.trashList      = shadow.querySelector('[data-role="trash-list"]');
    state.refs.trashEmpty     = shadow.querySelector('[data-role="trash-empty"]');
    state.refs.emptyTrashButton = shadow.querySelector('[data-role="empty-trash-button"]');

    // Undo toast
    state.refs.undoToast      = shadow.querySelector('[data-role="undo-toast"]');
    state.refs.undoToastMessage = shadow.querySelector('[data-role="undo-toast-message"]');
    state.refs.undoDeleteButton = shadow.querySelector('[data-role="undo-delete-button"]');

    // Folder palette
    state.refs.folderPaletteLayer = shadow.querySelector('[data-role="folder-palette-layer"]');
    state.refs.folderPalette  = shadow.querySelector('[data-role="folder-palette"]');
    state.refs.folderPaletteTitle = shadow.querySelector('[data-role="folder-palette-title"]');
    state.refs.folderPaletteInput = shadow.querySelector('[data-role="folder-palette-input"]');
    state.refs.folderPaletteList = shadow.querySelector('[data-role="folder-palette-list"]');

    // ── Event wiring ───────────────────────────────────────────────────────
    shadow.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", () => handleAction(el.getAttribute("data-action") || ""));
    });

    if (state.refs.mpSearch) {
      state.refs.mpSearch.addEventListener("input", (e) => {
        state.ui.searchQuery = normalizeSearchQuery(e.target.value);
        state.ui.notePage = 0;
        render();
      });
    }

    if (state.refs.mpBackBtn) {
      state.refs.mpBackBtn.addEventListener("click", () => {
        if (state.panelMode === "editor") {
          state.panelMode = "picker";
          state.ui.drawerMode = DRAWER_MODE_NOTES;
        } else {
          state.ui.drawerMode = DRAWER_MODE_CATEGORIES;
        }
        render();
      });
    }

    if (state.refs.folderSelect) {
      state.refs.folderSelect.addEventListener("change", (e) => {
        handleFolderSelectChange(e).catch(() => setSaveStatus("Could not update category", "error"));
      });
    }

    if (state.refs.dialogInput) {
      state.refs.dialogInput.addEventListener("keydown", handleDialogInputKeydown);
    }

    if (state.refs.importFileInput) {
      state.refs.importFileInput.addEventListener("change", (e) => {
        const files = e.target && e.target.files ? e.target.files : null;
        importTxtFromFileList(files).catch(() => setSaveStatus("Import failed", "error"));
        if (e.target) e.target.value = "";
      });
    }

    if (state.refs.trashList) {
      state.refs.trashList.addEventListener("click", handleTrashListClick);
    }

    // ── SSS Search — selection search popup dalam nota ─────────────────────
    // Sama fungsi dengan selection search di sidebar AI: bila user pilih teks
    // dalam editor nota, popup senarai enjin carian dipaparkan. Boleh
    // enable/disable melalui butang toggle (dikongsi dengan tetapan sidebar).
    const SSS_DEFAULT_ENGINES = [
      { id: "copy", type: "copy", name: "Copy to clipboard", url: "", iconUrl: "", showPopup: true, shortcut: "" },
      { id: "google", type: "engine", name: "Google", url: "https://www.google.com/search?q=%s", iconUrl: "", showPopup: true, shortcut: "" },
      { id: "bing", type: "engine", name: "Bing", url: "https://www.bing.com/search?q=%s", iconUrl: "", showPopup: true, shortcut: "" },
      { id: "ddg", type: "engine", name: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s", iconUrl: "", showPopup: true, shortcut: "" }
    ];
    let _sssSearchEnabled = true;
    let _sssSearchText = "";
    let _sssSearchSignature = "";

    // Helper element tempatan (mk() hanya wujud dalam skop buildMarkup)
    function sssMk(tag, css, text) {
      const el = document.createElement(tag);
      if (css) el.style.cssText = css;
      if (text != null) el.textContent = text;
      return el;
    }

    function sssSearchSettingsEnabled(settings) {
      const s = settings && typeof settings === "object" ? settings : {};
      const popupEnabled = s.selectionSearchPopup && typeof s.selectionSearchPopup === "object"
        ? s.selectionSearchPopup.enabled !== false
        : true;
      return popupEnabled && s.selectionSearchEnabled !== false;
    }

    function applySssSearchToggleUI(enabled) {
      const btn = state.refs.sssSearchToggle;
      if (!btn) return;
      btn.setAttribute("aria-pressed", enabled ? "true" : "false");
      btn.title = enabled
        ? "Selection Search: ON (klik untuk matikan)"
        : "Selection Search: OFF (klik untuk hidupkan)";
      btn.style.background = enabled ? "rgba(59,130,246,0.18)" : "rgba(0,0,0,0.2)";
      btn.style.borderColor = enabled ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.15)";
      btn.style.color = enabled ? "#7ab8ff" : "#555";
    }

    function loadSssSearchState() {
      storageGet(SETTINGS_KEY).then((data) => {
        const settings = data && data[SETTINGS_KEY] ? data[SETTINGS_KEY] : {};
        _sssSearchEnabled = sssSearchSettingsEnabled(settings);
        applySssSearchToggleUI(_sssSearchEnabled);
        if (!_sssSearchEnabled) hideSssSearchPopup();
      }).catch(() => {
        _sssSearchEnabled = true;
        applySssSearchToggleUI(true);
      });
    }

    function handleSssSearchToggle() {
      _sssSearchEnabled = !_sssSearchEnabled;
      applySssSearchToggleUI(_sssSearchEnabled);
      if (!_sssSearchEnabled) hideSssSearchPopup();
      else if (_sssSearchText) showSssSearchPopup();
      // Simpan KEDUA-DUA flag — sama logik dengan sidebar.js supaya
      // applySelectionSearchSettings dalam iframe AI tidak reject.
      storageGet(SETTINGS_KEY).then((data) => {
        const settings = data && data[SETTINGS_KEY] ? data[SETTINGS_KEY] : {};
        settings.selectionSearchEnabled = _sssSearchEnabled;
        if (settings.selectionSearchPopup && typeof settings.selectionSearchPopup === "object") {
          settings.selectionSearchPopup.enabled = _sssSearchEnabled;
        } else {
          settings.selectionSearchPopup = { enabled: _sssSearchEnabled };
        }
        storageSet({ [SETTINGS_KEY]: settings }).catch(() => {});
      });
    }

    function getSssSearchEngines() {
      const settings = state.settings && typeof state.settings === "object" ? state.settings : {};
      const list = Array.isArray(settings.selectionSearchEnginesList)
        ? settings.selectionSearchEnginesList
        : [];
      const usable = list.filter((entry) => entry && typeof entry === "object");
      return usable.length ? usable : SSS_DEFAULT_ENGINES;
    }

    function buildSssSearchUrl(entry, query) {
      if (!entry) return "";
      if (entry.type === "open-link") {
        const raw = String(query || "").trim();
        if (!raw) return "";
        try {
          if (/^https?:\/\//i.test(raw)) return new URL(raw).toString();
          return new URL("https://" + raw).toString();
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

    function activateSssSearchEngine(entry) {
      const query = _sssSearchText;
      if (!entry || !query) return;
      if (entry.type === "copy") {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(query).catch(() => {});
        }
        hideSssSearchPopup();
        return;
      }
      const url = buildSssSearchUrl(entry, query);
      if (url) {
        sendRuntimeMessage({ type: "selection-search-open-url", url, active: true })
          .catch(() => { try { window.open(url, "_blank"); } catch (_) {} });
      }
      hideSssSearchPopup();
    }

    function renderSssSearchPopup() {
      const popup = state.refs.sssSearchPopup;
      if (!popup) return;
      const engines = getSssSearchEngines();
      const signature = JSON.stringify(engines.map((e) => [e.id, e.name, e.type, e.iconUrl, e.showPopup, e.shortcut]));
      if (signature === _sssSearchSignature && popup.childNodes.length) return;
      _sssSearchSignature = signature;
      popup.textContent = "";

      const title = sssMk("div", "font-size:12px;font-weight:700;color:#fff;padding:0 2px 4px;", "SSS Nota");
      popup.appendChild(title);

      const listWrap = sssMk("div", "display:flex;flex-direction:column;gap:4px;overflow-y:auto;flex:1 1 auto;");
      engines.forEach((entry) => {
        if (!entry) return;
        if (entry.type === "separator") {
          listWrap.appendChild(sssMk("div", "height:1px;background:rgba(255,255,255,0.08);margin:3px 0;"));
          return;
        }
        if (entry.type === "group") {
          listWrap.appendChild(sssMk("div", "padding:3px 2px 1px;color:rgba(255,255,255,0.48);font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;", entry.name || "Group"));
          return;
        }
        if (entry.showPopup !== true) return;
        const btn = sssMk("button", [
          "display:flex","align-items:center","gap:8px","width:100%",
          "padding:8px 10px","border-radius:10px",
          "border:1px solid rgba(255,255,255,0.06)","background:rgba(255,255,255,0.03)",
          "color:#edf2ff","font-size:12px","font-weight:600","cursor:pointer",
          "text-align:left","transition:background 120ms ease,border-color 120ms ease"
        ].join(";"));
        btn.type = "button";
        btn.addEventListener("mouseenter", () => {
          btn.style.background = "rgba(255,214,51,0.12)";
          btn.style.borderColor = "rgba(255,214,51,0.24)";
        });
        btn.addEventListener("mouseleave", () => {
          btn.style.background = "rgba(255,255,255,0.03)";
          btn.style.borderColor = "rgba(255,255,255,0.06)";
        });
        if (entry.iconUrl) {
          const icon = document.createElement("img");
          icon.src = entry.iconUrl;
          icon.alt = "";
          icon.style.cssText = "width:16px;height:16px;border-radius:4px;object-fit:cover;flex:0 0 auto;pointer-events:none;";
          btn.appendChild(icon);
        } else {
          const bullet = sssMk("span", [
            "display:inline-flex","align-items:center","justify-content:center",
            "width:16px","height:16px","border-radius:999px",
            "background:rgba(255,214,51,0.16)","color:#ffe38a",
            "font-size:10px","font-weight:700","flex:0 0 auto","pointer-events:none"
          ].join(";"), (entry.name || "S").slice(0, 1).toUpperCase());
          btn.appendChild(bullet);
        }
        const label = sssMk("span", "flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none;", entry.name || "Engine");
        btn.appendChild(label);
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          activateSssSearchEngine(entry);
        });
        listWrap.appendChild(btn);
      });
      popup.appendChild(listWrap);
    }

    function positionSssSearchPopup(frameX, frameY) {
      const popup = state.refs.sssSearchPopup;
      if (!popup) return;
      const margin = 8;
      let left = margin;
      let top = margin;
      const frame = state.refs.editorFrame;
      const frameRect = frame ? frame.getBoundingClientRect() : null;
      if (frameRect && Number.isFinite(frameX) && Number.isFinite(frameY)) {
        left = frameRect.left + frameX + 12;
        top = frameRect.top + frameY + 14;
      } else if (frameRect) {
        left = frameRect.right - 250;
        top = frameRect.top + 12;
      }
      const width = Math.max(popup.offsetWidth || 0, 200);
      const height = Math.max(popup.offsetHeight || 0, 120);
      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
      top = Math.max(margin, Math.min(top, window.innerHeight - height - margin));
      popup.style.left = left + "px";
      popup.style.top = top + "px";
    }

    function showSssSearchPopup(frameX, frameY) {
      const popup = state.refs.sssSearchPopup;
      if (!popup || !_sssSearchEnabled || !_sssSearchText) return;
      const settings = state.settings && typeof state.settings === "object" ? state.settings : {};
      const popupCfg = settings.selectionSearchPopup && typeof settings.selectionSearchPopup === "object"
        ? settings.selectionSearchPopup
        : {};
      const minChars = Number.isFinite(Number(popupCfg.minChars)) ? Math.max(0, Number(popupCfg.minChars)) : 0;
      const maxChars = Number.isFinite(Number(popupCfg.maxChars)) ? Math.max(0, Number(popupCfg.maxChars)) : 0;
      if (minChars > 0 && _sssSearchText.length < minChars) { hideSssSearchPopup(); return; }
      if (maxChars > 0 && _sssSearchText.length > maxChars) { hideSssSearchPopup(); return; }
      renderSssSearchPopup();
      popup.style.display = "flex";
      positionSssSearchPopup(frameX, frameY);
    }

    function hideSssSearchPopup() {
      const popup = state.refs.sssSearchPopup;
      if (popup) popup.style.display = "none";
    }

    if (state.refs.sssSearchToggle) {
      state.refs.sssSearchToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        handleSssSearchToggle();
      });
      loadSssSearchState();
    }

    // Kemas kini toggle bila settings berubah dari tempat lain (sidebar/options)
    if (api.storage && api.storage.onChanged) {
      api.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local" || !changes[SETTINGS_KEY]) return;
        const next = changes[SETTINGS_KEY].newValue;
        _sssSearchEnabled = sssSearchSettingsEnabled(next);
        applySssSearchToggleUI(_sssSearchEnabled);
        _sssSearchSignature = "";
        if (!_sssSearchEnabled) hideSssSearchPopup();
      });
    }

    // SSS — listen untuk selection dalam editor iframe
    window.addEventListener("message", (evt) => {
      if (!state.open || state.panelMode !== "editor") return;
      const d = evt.data;
      if (!d || typeof d !== "object") return;
      if (d.type === "lp-notes-selection" || d.type === "lp-notes-text-selected") {
        const text = d.text ? String(d.text).trim() : "";
        const sssBtn = state.refs.sssBtn;
        if (sssBtn) {
          if (text.length > 0) {
            sssBtn.style.display = "inline-flex";
            sssBtn._selectedText = text;
          } else {
            sssBtn.style.display = "none";
            sssBtn._selectedText = "";
          }
        }
        // SSS Search popup — papar/sembunyi ikut pilihan teks & toggle
        _sssSearchText = text;
        if (text.length > 0 && _sssSearchEnabled) {
          showSssSearchPopup(Number(d.x), Number(d.y));
        } else {
          hideSssSearchPopup();
        }
      }
    });

    if (state.refs.sssBtn) {
      state.refs.sssBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const text = state.refs.sssBtn._selectedText || "";
        if (!text) return;
        sendRuntimeMessage({ type: "open-ai-sidebar-with-prompt", prompt: text })
          .then(() => { if (state.refs.sssBtn) state.refs.sssBtn.style.display = "none"; })
          .catch(() => { sendRuntimeMessage({ type: "open-ai-sidebar" }).catch(() => {}); });
      });
    }

    if (state.refs.folderPaletteInput) {
      state.refs.folderPaletteInput.addEventListener("input", handleFolderPaletteInput);
    }

    // Drag to move panel (mpHeader)
    if (state.refs.mpHeader) {
      state.refs.mpHeader.addEventListener("pointerdown", handleTopbarPointerDown);
      state.refs.mpHeader.addEventListener("pointermove", handleTopbarPointerMove);
      state.refs.mpHeader.addEventListener("pointerup", handleTopbarPointerUp);
      state.refs.mpHeader.addEventListener("pointercancel", handleTopbarPointerUp);
      state.refs.mpHeader.addEventListener("lostpointercapture", handleTopbarPointerUp);
      state.refs.mpHeader.addEventListener("dblclick", handleTopbarDoubleClick);
    }

    // Auto-focus left panel on mouseenter, unfocus on main panel mouseenter
    if (state.refs.leftPanel) {
      state.refs.leftPanel.addEventListener("mouseenter", () => {
        if (state.open) lpFocus();
      });
    }
    if (state.refs.mainPanel) {
      state.refs.mainPanel.addEventListener("mouseenter", () => {
        if (lpFocused) lpUnfocus();
      });
    }

    ["click","dblclick","mousedown","mouseup","pointerdown","pointerup",
     "contextmenu","wheel","keyup","keypress"].forEach((t) => {
      shadow.addEventListener(t, handleOverlayInteraction);
    });

    window.addEventListener("keydown", handleOverlayKeydown, true);
    window.addEventListener("keydown", handleDocumentKeydown, true);
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    window.addEventListener("message", handleEditorFrameMessage);
    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("beforeunload", () => { flushSave("Saved").catch(() => {}); });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        flushSave("Saved").catch(() => {});
      } else if (document.visibilityState === "visible" && state.open && state.pendingExternalReload) {
        reloadFromExternal();
      }
    });

    if (!state.editor.token) state.editor.token = makeId("notes-editor");
    state.mounted = true;
  }

  // ── Row style helpers (sama macam background.js category picker) ──────────
  const ROW_PANEL  = "rgba(18,18,18,0.88)";
  const ROW_TXT    = "#f3f4f6";

  // ── Left panel focus state (keyboard nav + type-to-search) ───────────────
  let lpFocused = false;
  let lpActiveIndex = -1;
  let lpSearchBuffer = "";
  let lpSearchTimer = null;
  // mpActiveNoteId — nota yang aktif untuk keyboard/hover
  let mpActiveNoteId = "";
  // panelPinned — panel tidak tutup bila klik luar (macam category picker pinBtn)
  let panelPinned = false;

  // Smart emoji map (sama macam background.js)
  const LP_EMOJI_MAP = [
    ["all","🌐"],["uncategor","📋"],["unsorted","📋"],["youtube","▶️"],
    ["video","🎬"],["music","🎵"],["lagu","🎵"],["work","💼"],["kerja","💼"],
    ["news","📰"],["berita","📰"],["design","🎨"],["seni","🎨"],["art","🎨"],
    ["code","💻"],["coding","💻"],["dev","💻"],["read","📖"],["baca","📖"],
    ["article","📖"],["finance","💰"],["wang","💰"],["money","💰"],
    ["game","🎮"],["gaming","🎮"],["social","💬"],["sosial","💬"],
    ["health","🏥"],["food","🍔"],["travel","✈️"],["sport","⚽"],
    ["sukan","⚽"],["photo","📷"],["gambar","📷"],["note","📝"],
    ["nota","📝"],["fav","⭐"],["hidden","👁️"],["ai","🤖"],["tech","⚙️"],
    ["shop","🛒"],["beli","🛒"],["tool","🔧"],["learn","📚"],["belajar","📚"],
    ["research","🔬"],["idea","💡"],["project","📂"],["personal","👤"],
    ["family","👨‍👩‍👧"],["journal","📓"],["task","✅"],["todo","✅"],
  ];

  function lpGetEmoji(label) {
    const l = (label || "").toLowerCase();
    for (const [key, emoji] of LP_EMOJI_MAP) {
      if (l.includes(key)) return emoji;
    }
    return "📁";
  }
  const ROW_MUTED  = "#a3acb9";
  const ROW_ACCENT = "#5ac8ff";
  const ROW_CHIP   = "rgba(255,255,255,0.06)";
  const ROW_CHIPB  = "rgba(255,255,255,0.12)";
  const ROW_INPBG  = "rgba(255,255,255,0.06)";

  function makePickerRow(isActive, isKbActive) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.style.cssText = [
      "display:flex","align-items:center","justify-content:space-between",
      "gap:4px","width:100%","padding:6px 8px","border-radius:8px",
      "border:1px solid " + (isActive ? "rgba(90,200,255,0.5)" : isKbActive ? "rgba(255,214,51,0.35)" : "transparent"),
      "background:" + (isActive ? ROW_CHIP : isKbActive ? "rgba(255,214,51,0.08)" : "transparent"),
      "color:" + (isActive ? ROW_ACCENT : ROW_TXT),
      "font-size:12px","font-weight:" + (isActive ? "600" : "400"),
      "text-align:left","cursor:pointer",
      "transition:background 120ms ease,border 120ms ease",
      "outline:none","box-sizing:border-box"
    ].join(";");
    if (!isActive && !isKbActive) btn.style.opacity = "0.75";
    btn.addEventListener("mouseenter", () => {
      if (!isActive) { btn.style.background = ROW_INPBG; btn.style.opacity = "1"; }
    });
    btn.addEventListener("mouseleave", () => {
      if (!isActive) {
        btn.style.background = isKbActive ? "rgba(255,214,51,0.08)" : "transparent";
        btn.style.opacity = isKbActive ? "1" : "0.75";
      }
    });
    return btn;
  }

  function makeIconSpan(icon, size) {
    const sp = document.createElement("span");
    sp.style.cssText = [
      "flex:0 0 auto","margin-right:4px","font-size:" + (size || 14) + "px",
      "line-height:1","display:inline-flex","align-items:center",
      "justify-content:center","width:18px","height:18px"
    ].join(";");
    sp.textContent = icon || "📁";
    return sp;
  }

  function makeDotSpan(color) {
    const sp = document.createElement("span");
    sp.style.cssText = [
      "flex:0 0 auto","width:8px","height:8px","border-radius:999px",
      "margin-right:4px","background:" + (color || ROW_MUTED)
    ].join(";");
    return sp;
  }

  function makeLabelSpan(text) {
    const sp = document.createElement("span");
    sp.style.cssText = "flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    sp.textContent = text || "";
    return sp;
  }

  function makeCountSpan(count, isActive) {
    const sp = document.createElement("span");
    sp.style.cssText = [
      "flex:0 0 auto","font-size:10px","font-weight:600",
      "color:" + (isActive ? ROW_ACCENT : ROW_MUTED),
      "background:" + ROW_CHIP,
      "padding:1px 5px","border-radius:999px","min-width:18px","text-align:center"
    ].join(";");
    sp.textContent = String(count);
    return sp;
  }

  // ── Render left panel (folder/category list) ─────────────────────────────
  function renderLeftPanel() {
    const list = state.refs.lpList;
    if (!list) return;
    list.replaceChildren();

    const baseNotes = getBaseFilteredNotes();
    const counts = getFolderCounts(baseNotes);
    const rows = getFolderFilterRows();

    rows.forEach((row, idx) => {
      const isActive = row.id === state.ui.activeFolderFilter;
      const isKb = lpFocused && idx === lpActiveIndex;
      const countVal = counts.get(row.id) || 0;

      const btn = makePickerRow(isActive, isKb);
      btn.setAttribute("data-folder-row-id", row.id);
      btn.setAttribute("data-cat-label", row.label);
      btn.setAttribute("data-cat-idx", String(idx));

      // Smart emoji
      const emoji = row.id === FILTER_ALL_FOLDERS ? "🌐"
        : row.id === FILTER_UNCATEGORIZED ? "📋"
        : lpGetEmoji(row.label);

      btn.append(makeIconSpan(emoji), makeLabelSpan(row.label), makeCountSpan(countVal, isActive));

      btn.addEventListener("click", () => {
        lpActiveIndex = idx;
        state.ui.activeFolderFilter = row.id;
        state.ui.drawerMode = DRAWER_MODE_NOTES;
        state.ui.notePage = 0;
        state.panelMode = "picker"; // pastikan panel utama tunjuk nota, bukan editor
        render();
      });

      list.appendChild(btn);
    });

    // Scroll active/keyboard item into view
    if (lpFocused && lpActiveIndex >= 0) {
      const kbBtn = list.querySelector(`[data-cat-idx="${lpActiveIndex}"]`);
      if (kbBtn) kbBtn.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      const activeBtn = list.querySelector(`[data-folder-row-id="${state.ui.activeFolderFilter}"]`);
      if (activeBtn) activeBtn.scrollIntoView({ behavior: "auto", block: "nearest" });
    }

    // Left panel focus border (macam background.js)
    if (state.refs.leftPanel) {
      state.refs.leftPanel.style.outline = lpFocused
        ? "2px solid rgba(90,200,255,0.5)"
        : "";
      state.refs.leftPanel.style.outlineOffset = lpFocused ? "-2px" : "";
    }
  }

  // ── Left panel focus helpers ──────────────────────���──────────────────────
  function lpFocus() {
    if (lpFocused) return;
    lpFocused = true;
    const rows = getFolderFilterRows();
    // Set index ke row aktif kalau ada
    const curIdx = rows.findIndex((r) => r.id === state.ui.activeFolderFilter);
    lpActiveIndex = curIdx >= 0 ? curIdx : 0;
    renderLeftPanel();
  }

  function lpUnfocus() {
    if (!lpFocused) return;
    lpFocused = false;
    lpActiveIndex = -1;
    lpSearchBuffer = "";
    if (lpSearchTimer) { clearTimeout(lpSearchTimer); lpSearchTimer = null; }
    renderLeftPanel();
  }

  function lpKeydown(event) {
    if (!lpFocused || !state.open) return false;
    const rows = getFolderFilterRows();
    if (!rows.length) return false;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      lpActiveIndex = Math.min(lpActiveIndex + 1, rows.length - 1);
      state.ui.activeFolderFilter = rows[lpActiveIndex].id;
      state.ui.drawerMode = DRAWER_MODE_NOTES;
      state.ui.notePage = 0;
      state.panelMode = "picker";
      render();
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      lpActiveIndex = Math.max(lpActiveIndex - 1, 0);
      state.ui.activeFolderFilter = rows[lpActiveIndex].id;
      state.ui.drawerMode = DRAWER_MODE_NOTES;
      state.ui.notePage = 0;
      state.panelMode = "picker";
      render();
      return true;
    }
    if (event.key === "ArrowRight" || event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      // Fokus ke main panel
      lpUnfocus();
      if (state.refs.mpSearch) {
        state.refs.mpSearch.focus();
      }
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      lpUnfocus();
      return true;
    }

    // Type-to-search (sama macam background.js)
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      const typedKey = event.key.toLowerCase();
      const isRepeat = lpSearchBuffer.length === 1 && lpSearchBuffer === typedKey;
      if (lpSearchTimer) clearTimeout(lpSearchTimer);

      if (isRepeat) {
        // Cycle ke row seterusnya yang bermula dengan huruf sama
        const startFrom = lpActiveIndex + 1;
        let matchIdx = -1;
        for (let i = startFrom; i < rows.length; i++) {
          if ((rows[i].label || "").toLowerCase().startsWith(typedKey)) { matchIdx = i; break; }
        }
        if (matchIdx < 0) {
          for (let i = 0; i < startFrom; i++) {
            if ((rows[i].label || "").toLowerCase().startsWith(typedKey)) { matchIdx = i; break; }
          }
        }
        if (matchIdx >= 0) {
          lpActiveIndex = matchIdx;
          state.ui.activeFolderFilter = rows[matchIdx].id;
          state.ui.drawerMode = DRAWER_MODE_NOTES;
          state.ui.notePage = 0;
          state.panelMode = "picker";
          render();
        }
      } else {
        lpSearchBuffer += typedKey;
        let matchIdx = -1;
        for (let i = 0; i < rows.length; i++) {
          if ((rows[i].label || "").toLowerCase().startsWith(lpSearchBuffer)) { matchIdx = i; break; }
        }
        if (matchIdx < 0 && lpSearchBuffer.length > 1) {
          lpSearchBuffer = typedKey;
          for (let i = 0; i < rows.length; i++) {
            if ((rows[i].label || "").toLowerCase().startsWith(lpSearchBuffer)) { matchIdx = i; break; }
          }
        }
        if (matchIdx >= 0) {
          lpActiveIndex = matchIdx;
          state.ui.activeFolderFilter = rows[matchIdx].id;
          state.ui.drawerMode = DRAWER_MODE_NOTES;
          state.ui.notePage = 0;
          state.panelMode = "picker";
          render();
        }
      }

      lpSearchTimer = setTimeout(() => {
        lpSearchBuffer = "";
        lpSearchTimer = null;
      }, 800);

      return true;
    }

    return false;
  }

  // ── Render main panel ────────────────────────────────────────────────────
  function renderMainPanel() {
    const inEditor = state.panelMode === "editor";
    // Panel utama selalu tunjuk nota kecuali dalam editor mode
    const inNotes = !inEditor;

    const r = state.refs;
    if (!r.mainPanel) return;

    // Title
    if (r.mpTitle) {
      if (inEditor) {
        const note = getActiveNote();
        r.mpTitle.textContent = note ? getNoteTitle(note) : "Notes";
      } else {
        const lbl = state.ui.activeFolderFilter === FILTER_ALL_FOLDERS ? "All Notes"
          : state.ui.activeFolderFilter === FILTER_UNCATEGORIZED ? UNCATEGORIZED_LABEL
          : getFolderLabel(state.ui.activeFolderFilter);
        r.mpTitle.textContent = lbl;
      }
    }

    // Back button — show dalam editor mode sahaja
    if (r.mpBackBtn) {
      r.mpBackBtn.style.display = inEditor ? "inline-flex" : "none";
    }

    // Search — show dalam notes list
    if (r.mpSearch) {
      r.mpSearch.style.display = inNotes ? "block" : "none";
      if (inNotes && r.mpSearch.value !== (state.ui.searchQuery || "")) {
        r.mpSearch.value = state.ui.searchQuery || "";
      }
    }

    // Category selector — show dalam editor sahaja
    if (r.mpCatWrap) {
      r.mpCatWrap.style.display = inEditor ? "flex" : "none";
      if (inEditor) renderFolderSelectNew();
    }

    // List vs editor
    if (r.mpList)   r.mpList.style.display   = inEditor ? "none" : "flex";
    if (r.mpEditor) r.mpEditor.style.display  = inEditor ? "flex" : "none";
    // SSS Search popup hanya relevan dalam mod editor
    if (!inEditor && r.sssSearchPopup) r.sssSearchPopup.style.display = "none";
    if (r.mpHint) {
      if (inEditor) {
        r.mpHint.style.display = "none";
      } else {
        r.mpHint.style.display = "block";
        r.mpHint.textContent = "↑↓ pilih | Enter buka | D padam (hover) | Swipe kiri padam | Esc tutup";
      }
    }
    if (r.mpPager)  r.mpPager.style.display   = "none";

    if (inNotes) {
      renderNotesListNew();
    } else {
      renderEditorNew();
    }

    // Save status
    if (r.saveStatus) {
      // leave as-is — setSaveStatus() handles it
    }

    // Pin button — guna nota yang di-hover/highlight dalam picker, atau nota aktif dalam editor
    const targetNote = (state.panelMode === "picker" && mpActiveNoteId)
      ? state.notes.find((n) => n && n.id === mpActiveNoteId) || null
      : getActiveNote();
    const pinBtns = Array.isArray(r.pinButtons) ? r.pinButtons : [];
    pinBtns.forEach((btn) => {
      if (!btn) return;
      const isPinned = targetNote && targetNote.isPinned;
      btn.textContent = isPinned ? "📌" : "📌";
      btn.title = isPinned ? "Unpin" : "Pin to top";
      btn.style.opacity = targetNote ? (isPinned ? "1" : "0.7") : "0.3";
      btn.style.color = isPinned ? "#ffd700" : "inherit";
      btn.disabled = !targetNote;
    });

    // Trash button
    const hasTrash = coerceArray(state.trash).length > 0;
    if (r.openTrashButton) {
      r.openTrashButton.disabled = !hasTrash;
      r.openTrashButton.title = hasTrash ? "Tong sampah (" + state.trash.length + ")" : "Tiada nota dipadam";
    }
  }

  // Category list in main panel (when no folder selected yet)
  function renderCategoryModeMain() {
    const list = state.refs.mpList;
    if (!list) return;
    list.replaceChildren();

    const baseNotes = getBaseFilteredNotes();
    const counts = getFolderCounts(baseNotes);
    const rows = getFolderFilterRows();

    const emptyMsg = document.createElement("div");
    emptyMsg.style.cssText = "color:" + ROW_MUTED + ";font-size:12px;padding:8px 4px;";
    emptyMsg.textContent = "Pilih kategori untuk lihat nota.";
    if (rows.length === 0) { list.appendChild(emptyMsg); return; }

    rows.forEach((row) => {
      const isActive = row.id === state.ui.activeFolderFilter;
      const countVal = counts.get(row.id) || 0;
      const btn = makePickerRow(isActive, false);
      const emoji = row.id === FILTER_ALL_FOLDERS ? "🌐"
        : row.id === FILTER_UNCATEGORIZED ? "📋" : "📁";
      btn.append(makeIconSpan(emoji), makeLabelSpan(row.label + " (" + countVal + ")"), makeCountSpan(countVal, isActive));
      btn.addEventListener("click", () => {
        state.ui.activeFolderFilter = row.id;
        state.ui.drawerMode = DRAWER_MODE_NOTES;
        state.ui.notePage = 0;
        render();
      });
      list.appendChild(btn);
    });
  }

  // Notes list in main panel
  function renderNotesListNew() {
    const list = state.refs.mpList;
    if (!list) return;
    list.replaceChildren();

    const visibleNotes = getVisibleNotes();
    const pager = getNotePagerState(visibleNotes);
    state.ui.notePage = pager.activePage;

    if (!visibleNotes.length) {
      const emptyEl = document.createElement("div");
      emptyEl.style.cssText = "color:" + ROW_MUTED + ";font-size:12px;padding:8px 4px;";
      emptyEl.textContent = getEmptyNotesLabel();
      list.appendChild(emptyEl);
      if (state.refs.mpPager) state.refs.mpPager.style.display = "none";
      return;
    }

    const pageNotes = pager.visibleRows;
    const drawerSelectedNoteId = getDrawerSelectedNoteId(pageNotes);

    const pageStartIndex = pager.activePage * pager.pageSize;

    pageNotes.forEach((note, i) => {
      const noteNumber = pageStartIndex + i + 1;
      const isActive = note.id === state.ui.activeNoteId;
      const isKb = note.id === mpActiveNoteId && !isActive;
      const wordCount = countWords(note.content);
      const palette = getFolderRowPalette(note.id);

      // ── Shell wrapper untuk swipe gesture ───────────────────────────────
      const shell = document.createElement("div");
      shell.style.cssText = [
        "position:relative","width:100%","overflow:hidden",
        "border-radius:8px","flex-shrink:0"
      ].join(";");

      // Delete indicator (di belakang, merah)
      const delIndicator = document.createElement("div");
      delIndicator.style.cssText = [
        "position:absolute","inset:0","display:flex",
        "align-items:center","justify-content:flex-end",
        "gap:6px","padding:0 14px",
        "background:linear-gradient(135deg,rgba(210,76,76,0.72),rgba(210,76,76,0.5))",
        "color:#fff3f3","font-size:11px","font-weight:700",
        "letter-spacing:0.06em","text-transform:uppercase",
        "opacity:0","pointer-events:none",
        "transition:opacity 150ms ease,background 150ms ease",
        "border-radius:8px"
      ].join(";");
      delIndicator.textContent = "🗑 Delete";

      // Row button
      const btn = makePickerRow(isActive, isKb);
      btn.setAttribute("data-note-row-id", note.id);
      btn.style.position = "relative";
      btn.style.touchAction = "pan-y";
      btn.style.userSelect = "none";

      const numSpan = document.createElement("span");
      numSpan.style.cssText = [
        "flex:0 0 auto",
        "min-width:18px",
        "text-align:right",
        "font-size:10px",
        "font-variant-numeric:tabular-nums",
        "color:" + ROW_MUTED,
        "opacity:" + (isActive ? "0.9" : "0.6")
      ].join(";");
      numSpan.textContent = noteNumber + ".";

      btn.append(
        numSpan,
        makeDotSpan(palette.dot),
        makeLabelSpan(getNoteTitle(note)),
        makeCountSpan(wordCount + "w", isActive)
      );

      if (note.isPinned) {
        const pin = document.createElement("span");
        pin.style.cssText = "flex:0 0 auto;font-size:10px;margin-left:2px;";
        pin.textContent = "📌";
        btn.insertBefore(pin, btn.lastChild);
      }

      shell.append(delIndicator, btn);

      // Track hover — sama macam activeIndex dalam background.js
      shell.addEventListener("mouseenter", () => {
        mpActiveNoteId = note.id;
        // Update highlight tanpa full rebuild — sama macam background.js
        if (state.refs.mpList) {
          state.refs.mpList.querySelectorAll("[data-note-row-id]").forEach((b) => {
            const nid = b.getAttribute("data-note-row-id");
            const isCurActive = nid === state.ui.activeNoteId;
            const isNowHover = nid === note.id && !isCurActive;
            b.style.border = isCurActive
              ? "1px solid rgba(90,200,255,0.5)"
              : isNowHover ? "1px solid rgba(255,214,51,0.35)" : "1px solid transparent";
            b.style.background = isCurActive
              ? "rgba(255,255,255,0.06)"
              : isNowHover ? "rgba(255,214,51,0.08)" : "transparent";
            b.style.opacity = (isCurActive || isNowHover) ? "1" : "0.75";
          });
        }
      });
      shell.addEventListener("mouseleave", () => {
        if (mpActiveNoteId === note.id) mpActiveNoteId = "";
      });

      // ── Swipe logic ──────────────────────────────────────────────────────
      let ptId = null, startX = 0, startY = 0;
      let swipeOffset = 0, swipeActive = false, swipeTracking = false;
      let suppressClick = false, suppressTimer = null;

      const resetSwipe = () => {
        btn.style.transform = "";
        btn.style.transition = "";
        delIndicator.style.opacity = "0";
        delIndicator.style.background = "linear-gradient(135deg,rgba(210,76,76,0.72),rgba(210,76,76,0.5))";
        swipeOffset = 0; swipeActive = false; swipeTracking = false;
        if (ptId != null && btn.hasPointerCapture && btn.hasPointerCapture(ptId)) {
          try { btn.releasePointerCapture(ptId); } catch (_) {}
        }
        ptId = null;
      };

      btn.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        ptId = e.pointerId; startX = e.clientX; startY = e.clientY;
        swipeOffset = 0; swipeActive = false; swipeTracking = true;
        suppressClick = false;
      });

      btn.addEventListener("pointermove", (e) => {
        if (!swipeTracking || ptId == null || e.pointerId !== ptId) return;
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if (!swipeActive) {
          if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
          if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { resetSwipe(); return; }
          if (dx > -10 || Math.abs(dx) < Math.abs(dy)) return;
          swipeActive = true;
          suppressClick = true;
          try { btn.setPointerCapture(ptId); } catch (_) {}
        }
        e.preventDefault();
        swipeOffset = Math.max(-130, Math.min(0, dx));
        btn.style.transition = "none";
        btn.style.transform = "translateX(" + swipeOffset + "px)";
        const progress = Math.min(1, Math.abs(swipeOffset) / 108);
        delIndicator.style.opacity = String(progress);
        if (Math.abs(swipeOffset) >= 108) {
          delIndicator.style.background = "linear-gradient(135deg,rgba(210,76,76,0.96),rgba(210,76,76,0.72))";
        } else {
          delIndicator.style.background = "linear-gradient(135deg,rgba(210,76,76,0.72),rgba(210,76,76,0.5))";
        }
      });

      const finalizeSwipe = () => {
        if (ptId == null) return;
        const shouldDelete = swipeActive && Math.abs(swipeOffset) >= 108;
        if (!shouldDelete) {
          btn.style.transition = "transform 200ms ease";
          resetSwipe();
          if (suppressClick) {
            suppressTimer = setTimeout(() => { suppressClick = false; }, 250);
          }
          return;
        }
        // Animate out then delete
        btn.style.transition = "transform 200ms ease, opacity 200ms ease";
        btn.style.transform = "translateX(-100%)";
        btn.style.opacity = "0";
        resetSwipe();
        setTimeout(() => {
          deleteNoteById(note.id, { confirm: false }).catch(() => {
            setSaveStatus("Could not delete note", "error");
          });
        }, 180);
      };

      btn.addEventListener("pointerup", (e) => {
        if (ptId == null || e.pointerId !== ptId) return;
        finalizeSwipe();
      });
      btn.addEventListener("pointercancel", (e) => {
        if (ptId == null || e.pointerId !== ptId) return;
        btn.style.transition = "transform 200ms ease";
        resetSwipe();
        suppressClick = false;
      });

      btn.addEventListener("click", (e) => {
        if (suppressClick) {
          e.preventDefault(); e.stopPropagation();
          return;
        }
        state.ui.activeNoteId = note.id;
        state.panelMode = "editor";
        render();
        queueEditorFocus("content", false);
      });

      list.appendChild(shell);
    });

    // Pager
    const r = state.refs;
    if (r.mpPager && r.mpPagerInfo && r.mpPrev && r.mpNext) {
      const showPager = pager.totalPages > 1;
      r.mpPager.style.display = showPager ? "flex" : "none";
      r.mpPagerInfo.textContent = (pager.activePage + 1) + " / " + pager.totalPages;
      r.mpPrev.disabled = pager.activePage <= 0;
      r.mpNext.disabled = pager.activePage >= pager.totalPages - 1;
    }
  }

  // Folder select dropdown in editor mode
  function renderFolderSelectNew() {
    const select = state.refs.folderSelect;
    if (!select) return;
    const note = getActiveNote();
    const currentValue = note && note.folderId ? note.folderId : "";
    const options = [
      { value: "", label: UNCATEGORIZED_LABEL },
      ...state.folders.map((f) => ({ value: f.id, label: f.name }))
    ];
    select.replaceChildren(...options.map((opt) => {
      const el = document.createElement("option");
      el.value = opt.value;
      el.textContent = opt.label;
      return el;
    }));
    select.value = options.some((o) => o.value === currentValue) ? currentValue : "";
    select.disabled = !note;
  }

  // Editor mode
  function renderEditorNew() {
    const note = getActiveNote();
    autoResizeContentInput();
    syncEditorFrameWithNote(note);

    // Editor meta (word count etc)
    if (state.refs.editorMeta) {
      if (!note) {
        state.refs.editorMeta.textContent = "0 words";
      } else {
        const stats = getChecklistStats(note);
        const parts = [
          countWords(note.content) + " words",
          countChars(note.content) + " chars",
          formatUpdatedAt(note.updatedAt)
        ];
        if (stats.total > 0) {
          parts.push(stats.open === 0 ? "all done" : stats.open + "/" + stats.total + " tasks");
        }
        state.refs.editorMeta.textContent = parts.join(" | ");
      }
    }
  }

  // ── Main render function ─────────────────────────────────────────────────
  function render() {
    if (!state.mounted) return;
    const overlay = state.refs.overlay;
    if (!overlay) return;

    overlay.dataset.open = state.open ? "true" : "false";
    overlay.style.opacity = state.open ? "1" : "0";
    overlay.style.pointerEvents = state.open ? "auto" : "none";

    applyOverlayLayout();

    renderLeftPanel();
    renderMainPanel();
    renderDialog();
    renderTrashPanel();
    renderUndoToast();
    renderFolderPalette();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sanitizePathSegment(value, fallback) {
    const raw = String(value || "").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
    const next = raw.slice(0, 80);
    return next || fallback || "note";
  }

  function noteToTxtBytes(note) {
    const title = getNoteTitle(note);
    const body = note && note.content != null ? String(note.content) : "";
    const text = `${title}\n\n${body}`;
    const encoded = new TextEncoder().encode(text);
    if (encoded.length > 0) return encoded;
    return new TextEncoder().encode(`${title || "Untitled note"}\n\n`);
  }

  function requestEditorDomSnapshot(timeoutMs = 3000) {
    return new Promise((resolve) => {
      const frame = state.refs.editorFrame;
      const win = frame && frame.contentWindow;
      if (!win || state.editor.ready !== true || !state.editor.token) {
        resolve(null);
        return;
      }
      const token = state.editor.token;
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        window.removeEventListener("message", onMessage);
        clearTimeout(timer);
        resolve(value);
      };
      const onMessage = (event) => {
        const d = event.data;
        if (!d || typeof d !== "object" || d.type !== "lp-notes-export-snapshot-reply") return;
        if (d.token !== token) return;
        finish({
          title: d.title != null ? String(d.title) : "",
          content: d.content != null ? String(d.content) : ""
        });
      };
      const timer = setTimeout(() => finish(null), Math.max(50, Number(timeoutMs) || 3000));
      window.addEventListener("message", onMessage);
      try {
        var _targetOrigin = (function() {
          try { return new URL(api.runtime.getURL("/")).origin; } catch (_) { return "*"; }
        })();
        win.postMessage({ type: "lp-notes-export-snapshot-request", token }, _targetOrigin);
      } catch (err) {
        finish(null);
      }
    });
  }

  async function mergeNoteWithStorageFallback(note) {
    if (!note || !note.id) return note;
    const c = String(note.content != null ? note.content : "");
    if (c.length > 0) return note;
    const data = await storageGet([NOTES_KEY]);
    const list = coerceArray(data[NOTES_KEY]);
    const stored = list.find((n) => n && String(n.id) === String(note.id));
    if (!stored || typeof stored !== "object") return note;
    const sc = String(stored.content != null ? stored.content : "");
    if (!sc) return note;
    const memTitle = String(note.title != null ? note.title : "").trim();
    const st = String(stored.title != null ? stored.title : "").trim();
    return {
      ...note,
      title: (memTitle || st).slice(0, 120),
      content: sc.slice(0, 200000)
    };
  }

  function noteSnapshotForExport(note, domSnap) {
    if (!note) return note;
    if (note.id !== state.ui.activeNoteId) return note;

    if (domSnap && typeof domSnap === "object") {
      return {
        ...note,
        title: String(domSnap.title != null ? domSnap.title : "").slice(0, 120),
        content: String(domSnap.content != null ? domSnap.content : "").slice(0, 200000)
      };
    }

    const stTitle = String(note.title != null ? note.title : "");
    const stContent = String(note.content != null ? note.content : "");
    const edReady = state.editor.ready === true;
    const edTitle = String(state.editor.title != null ? state.editor.title : "");
    const edContent = String(state.editor.content != null ? state.editor.content : "");

    if (!edReady) {
      return {
        ...note,
        title: stTitle.slice(0, 120),
        content: stContent.slice(0, 200000)
      };
    }

    const titleOut = edTitle.trim() !== "" ? edTitle : (stTitle.trim() !== "" ? stTitle : getNoteTitle(note));
    const contentOut = edContent.length > 0 ? edContent : stContent;

    return {
      ...note,
      title: titleOut.slice(0, 120),
      content: contentOut.slice(0, 200000)
    };
  }

  function zipEntryPayloadBytes(value) {
    if (value == null) return new Uint8Array(0);
    try {
      return new Uint8Array(value);
    } catch (err) {
      return new Uint8Array(0);
    }
  }

  function crc32(uint8) {
    if (!crc32.table) {
      crc32.table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
          c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        crc32.table[i] = c >>> 0;
      }
    }
    const table = crc32.table;
    let crc = 0xffffffff;
    for (let i = 0; i < uint8.length; i++) {
      crc = table[(crc ^ uint8[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function createZipStoreBlob(entries) {
    const encoder = new TextEncoder();
    const items = coerceArray(entries).map((entry) => {
      const path = entry && entry.path ? String(entry.path) : "note.txt";
      return {
        path,
        nameBytes: encoder.encode(path),
        data: zipEntryPayloadBytes(entry && entry.data)
      };
    });

    let localBlockSize = 0;
    items.forEach((item) => {
      localBlockSize += 30 + item.nameBytes.length + item.data.length;
    });
    let centralSize = 0;
    items.forEach((item) => {
      centralSize += 46 + item.nameBytes.length;
    });
    const centralOffset = localBlockSize;
    const totalSize = localBlockSize + centralSize + 22;
    const out = new Uint8Array(totalSize);
    let pos = 0;
    const localHeaderOffsets = [];

    items.forEach((item) => {
      const data = item.data;
      const checksum = crc32(data);
      const size = data.length;
      localHeaderOffsets.push(pos);

      const lv = new DataView(out.buffer, out.byteOffset + pos, 30);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0, true);
      lv.setUint32(14, checksum, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, item.nameBytes.length, true);
      lv.setUint16(28, 0, true);
      out.set(item.nameBytes, pos + 30);
      out.set(data, pos + 30 + item.nameBytes.length);
      pos += 30 + item.nameBytes.length + size;
    });

    items.forEach((item, index) => {
      const data = item.data;
      const checksum = crc32(data);
      const size = data.length;
      const localOff = localHeaderOffsets[index];

      const cv = new DataView(out.buffer, out.byteOffset + pos, 46);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0, true);
      cv.setUint32(16, checksum, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, item.nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, localOff, true);
      out.set(item.nameBytes, pos + 46);
      pos += 46 + item.nameBytes.length;
    });

    const ev = new DataView(out.buffer, out.byteOffset + pos, 22);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, items.length, true);
    ev.setUint16(10, items.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, centralOffset, true);
    ev.setUint16(20, 0, true);

    return new Blob([out], { type: "application/zip" });
  }

  function triggerDownloadBlob(blob, filename) {
    const safeName = String(filename || "download")
      .trim()
      .replace(/[\\/:*?"<>|]/g, "-")
      .slice(0, 180) || "download";
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeName;
    link.style.display = "none";
    (document.body || document.documentElement).appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function exportActiveNoteTxt() {
    let domSnap = null;
    try {
      domSnap = await requestEditorDomSnapshot();
    } catch (err) {
      domSnap = null;
    }
    const note = getActiveNote();
    if (!note) return;
    let snap = noteSnapshotForExport(note, domSnap);
    snap = await mergeNoteWithStorageFallback(snap);
    const bytes = noteToTxtBytes(snap);
    const blob = new Blob([bytes], { type: "text/plain;charset=utf-8" });
    triggerDownloadBlob(blob, `${sanitizePathSegment(getNoteTitle(snap), "note")}.txt`);
    setSaveStatus("Exported .txt", "");
  }

  async function buildExportAllZipEntries(domSnap) {
    const seen = new Set();
    const entries = [];
    const activeId = state.ui.activeNoteId;
    const notes = getSortedNotes(state.notes.slice());
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      if (!note) continue;
      let snap = noteSnapshotForExport(note, note.id === activeId ? domSnap : null);
      snap = await mergeNoteWithStorageFallback(snap);
      const folderLabel = snap.folderId ? getFolderLabel(snap.folderId) : UNCATEGORIZED_LABEL;
      const folderSeg = sanitizePathSegment(folderLabel, UNCATEGORIZED_LABEL);
      const titleBase = sanitizePathSegment(getNoteTitle(snap), "note");
      let fileBase = titleBase;
      let path = `${folderSeg}/${fileBase}.txt`;
      let n = 2;
      while (seen.has(path)) {
        fileBase = `${titleBase} (${n})`;
        path = `${folderSeg}/${fileBase}.txt`;
        n += 1;
      }
      seen.add(path);
      entries.push({
        path,
        data: noteToTxtBytes(snap)
      });
    }
    return entries;
  }

  async function exportAllNotesTxtZip() {
    if (!state.notes.length) return;
    let domSnap = null;
    try {
      domSnap = await requestEditorDomSnapshot();
    } catch (err) {
      domSnap = null;
    }
    const zipEntries = await buildExportAllZipEntries(domSnap);
    if (!zipEntries.length) return;
    const blob = createZipStoreBlob(zipEntries);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    triggerDownloadBlob(blob, `local-pocket-notes-${stamp}.zip`);
    setSaveStatus(`Exported ${zipEntries.length} note(s) in .zip`, "");
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("read failed"));
      reader.readAsText(file);
    });
  }

  async function importTxtFromFileList(fileList) {
    const files = Array.from(fileList || []).filter((file) => {
      if (!file || file.size > 2500000) return false;
      const name = file.name ? String(file.name).toLowerCase() : "";
      return !name || name.endsWith(".txt") || file.type === "text/plain";
    });
    if (!files.length) {
      const attempted = Array.from(fileList || []);
      if (attempted.length) {
        setSaveStatus("Only .txt or plain text files can be imported", "error");
      }
      return;
    }
    await syncActiveNoteFromEditor(false);
    const folderId = getNewNoteFolderId();
    const newNotes = [];
    for (const file of files) {
      const name = file.name ? String(file.name) : "";
      const text = await readFileAsText(file);
      const baseTitle = name.replace(/\.txt$/i, "").trim() || "Imported";
      const note = createBlankNote(folderId);
      note.title = baseTitle.slice(0, 120);
      note.content = String(text || "").slice(0, 200000);
      note.updatedAt = new Date().toISOString();
      newNotes.push(note);
    }
    if (!newNotes.length) {
      setSaveStatus("No .txt files selected", "error");
      return;
    }
    state.notes = getSortedNotes([...newNotes, ...state.notes]);
    state.ui.activeNoteId = newNotes[0].id;
    state.ui.notesDrawerOpen = false;
    render();
    try {
      await persist(`Imported ${newNotes.length} note(s)`);
    } catch (err) {
      setSaveStatus("Save failed", "error");
    }
  }

  function handleOverlayInteraction(event) {
    if (!state.open || !isEventFromOverlay(event)) return;
    stopOverlayEvent(event);
  }

  function handleOverlayKeydown(event) {
    if (!state.open || !isEventFromOverlay(event)) return;

    // ── Folder palette keyboard ──────────────────────────────────────────
    if (state.folderPalette.open) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeFolderPalette();
        stopOverlayEvent(event);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setFolderPaletteActiveIndex(state.folderPalette.activeIndex + 1);
        stopOverlayEvent(event);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setFolderPaletteActiveIndex(state.folderPalette.activeIndex - 1);
        stopOverlayEvent(event);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        chooseFolderPaletteOption(state.folderPalette.activeIndex).catch(() => {});
        stopOverlayEvent(event);
        return;
      }
      stopOverlayEvent(event);
      return;
    }

    // ── Dialog keyboard ──────────────────────────────────────────────────
    if (state.dialog && state.dialog.open) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog({ confirmed: false, value: "" });
        stopOverlayEvent(event);
      }
      return;
    }

    // ── Left panel keyboard nav (feature 1 + 2) ──────────────────────────
    if (lpFocused) {
      if (lpKeydown(event)) {
        stopOverlayEvent(event);
        return;
      }
    }

    // ── Global shortcuts ─────────────────────────────────────────────────
    if (event.key === "Escape" && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      if (lpFocused) {
        lpUnfocus();
      } else if (state.panelMode === "editor") {
        state.panelMode = "picker";
        state.ui.drawerMode = DRAWER_MODE_NOTES;
        render();
      } else if (isNotesDrawerPage()) {
        state.ui.drawerMode = DRAWER_MODE_CATEGORIES;
        render();
      } else {
        close();
      }
      stopOverlayEvent(event);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      flushSave("Saved").catch(() => {});
      stopOverlayEvent(event);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "n") {
      event.preventDefault();
      createNewNote().catch(() => setSaveStatus("Could not create note", "error"));
      stopOverlayEvent(event);
      return;
    }

    // ── Main panel note list keyboard (sama macam background.js: D=delete activeIndex) ─────
    if (!lpFocused && state.panelMode === "picker") {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        const notes = getVisibleNotes();
        const idx = notes.findIndex((n) => n.id === (mpActiveNoteId || state.ui.activeNoteId));
        const next = notes[Math.min(idx + 1, notes.length - 1)];
        if (next) { mpActiveNoteId = next.id; render(); }
        stopOverlayEvent(event);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        const notes = getVisibleNotes();
        const idx = notes.findIndex((n) => n.id === (mpActiveNoteId || state.ui.activeNoteId));
        const prev = notes[Math.max(idx - 1, 0)];
        if (prev) { mpActiveNoteId = prev.id; render(); }
        stopOverlayEvent(event);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const targetId = mpActiveNoteId || state.ui.activeNoteId;
        if (targetId) {
          state.ui.activeNoteId = targetId;
          state.panelMode = "editor";
          render();
          queueEditorFocus("content", false);
        }
        stopOverlayEvent(event);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        changeNotePage(-1);
        stopOverlayEvent(event);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        changeNotePage(1);
        stopOverlayEvent(event);
        return;
      }
      // D — delete nota pada activeIndex (hover atau keyboard highlight)
      // Sama persis macam background.js line ~15418
      if (
        (event.key === "d" || event.key === "D")
        && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
        && !isEditableElement(event.target)
      ) {
        const targetId = mpActiveNoteId;
        if (targetId) {
          event.preventDefault();
          if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
          mpActiveNoteId = "";
          deleteNoteById(targetId, { confirm: false }).catch(() => {
            setSaveStatus("Could not delete note", "error");
          });
          stopOverlayEvent(event);
          return;
        }
      }
    }
  }
  function toggleNotesDrawer() {
    state.folderContextMenu.open = false;
    state.folderPalette.open = false;
    if (!isPickerPanelMode()) {
      preparePickerLandingPage();
      render();
      return;
    }
    if (state.ui.notesDrawerOpen !== true) {
      preparePickerLandingPage();
      render();
      return;
    }
    if (isNotesDrawerPage()) {
      returnDrawerToCategories();
      return;
    }
    close();
    return;
  }

  function toggleOutsideClickMode() {
    state.ui.closeOnOutsideClick = state.ui.closeOnOutsideClick !== true;
    render();
    persistUiOnly(state.ui.closeOnOutsideClick ? "Outside click will close" : "Outside click ignored").catch(() => {
      setSaveStatus("Save failed", "error");
    });
  }

  function showNotesSettingsMenu() {
    const currentMode = state.settings && state.settings.notesStartMode === "last" ? "last" : "home";
    const newMode = currentMode === "last" ? "home" : "last";
    const modeLabel = newMode === "last" ? "Nota terakhir dibuka" : "Senarai kategori";
    state.settings = { ...state.settings, notesStartMode: newMode };
    api.storage.local.set({ settings: state.settings }).then(() => {
      setSaveStatus(`Notepad akan buka: ${modeLabel}`, "success");
    }).catch(() => {
      setSaveStatus("Gagal simpan", "error");
    });
  }

  function handleSearchInput(event) {
    state.ui.searchQuery = normalizeSearchQuery(event && event.target ? event.target.value : "");
    state.ui.notesDrawerOpen = true;
    if (!isNotesDrawerPage()) {
      state.ui.folderPage = 0;
    } else {
      state.ui.notePage = 0;
    }
    render();
  }

  function handleFolderPaletteInput(event) {
    state.folderPalette.query = normalizeSearchQuery(event && event.target ? event.target.value : "");
    state.folderPalette.activeIndex = 0;
    renderFolderPalette();
  }

  function openFolderContextMenu(folderId, anchorX, anchorY) {
    const folder = getFolderById(folderId);
    if (!folder) return;
    closeFolderPalette();
    const rect = state.refs.overlay ? state.refs.overlay.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    const menuHeight = 320;
    const x = Math.max(12, Math.min((rect.width || 0) - 232, anchorX - rect.left));
    const maxY = Math.max(0, (window.innerHeight || 0) - menuHeight - 24);
    const rawY = anchorY - rect.top;
    const y = Math.max(12, Math.min(maxY, rawY));
    state.ui.activeFolderFilter = folder.id;
    state.ui.notesDrawerOpen = true;
    state.folderContextMenu = {
      open: true,
      folderId: folder.id,
      anchorX: x,
      anchorY: y
    };
    render();
  }

  function openFolderPalette(targetId = "", offset = 0) {
    if (!getActiveNote()) {
      setSaveStatus("Open or create a note first", "error");
      return;
    }
    closeFolderContextMenu();
    state.folderPalette = {
      open: true,
      query: "",
      activeIndex: 0,
      options: [],
      pendingTargetId: String(targetId || ""),
      pendingOffset: Number.isFinite(offset) ? offset : 0
    };
    render();
    setTimeout(() => {
      if (state.folderPalette.open !== true || !state.refs.folderPaletteInput) return;
      state.refs.folderPaletteInput.focus();
      if (typeof state.refs.folderPaletteInput.select === "function") {
        state.refs.folderPaletteInput.select();
      }
    }, 0);
  }

  function setFolderPaletteActiveIndex(next) {
    const total = state.folderPalette.options.length;
    if (!total) return;
    state.folderPalette.activeIndex = ((next % total) + total) % total;
    renderFolderPalette();
  }

  async function assignActiveNoteToFolder(folderId, successMessage) {
    const note = getActiveNote();
    if (!note) return;
    await moveNoteToFolder(note.id, folderId);
    if (successMessage) {
      setSaveStatus(successMessage, "");
    }
  }

  async function chooseFolderPaletteOption(index) {
    const option = state.folderPalette.options[index];
    if (!option) return;
    await assignActiveNoteToFolder(option.id, `Moved to ${option.label}`);
    closeFolderPalette();
  }

  function selectAdjacentFolderFilter(offset) {
    const rows = getFolderFilterRows();
    if (!rows.length) return;
    const current = getCurrentFolderRowIndex();
    const nextIndex = ((current + offset) % rows.length + rows.length) % rows.length;
    state.folderKeyboardIndex = nextIndex;
    state.ui.activeFolderFilter = rows[nextIndex].id;
    state.ui.notesDrawerOpen = true;
    render();
    const target = state.shadow && state.shadow.querySelector(`[data-folder-row-id="${rows[nextIndex].id}"]`);
    if (target && typeof target.scrollIntoView === "function") {
      try {
        target.scrollIntoView({ block: "nearest" });
      } catch (err) {}
    }
  }

  async function openSelectedNoteInActiveFilter() {
    const visibleNotes = getVisibleNotes();
    const selectedId = getDrawerSelectedNoteId(visibleNotes);
    const next = visibleNotes.find((note) => note && note.id === selectedId) || visibleNotes[0];
    if (!next) return;
    await syncActiveNoteFromEditor(false);
    state.ui.activeNoteId = next.id;
    state.panelMode = "editor";
    state.ui.notesDrawerOpen = false;
    render();
    queueEditorFocus("content", false);
  }

  function returnDrawerToCategories() {
    openDrawerCategoriesPage();
    render();
  }

  async function moveActiveNoteByFolderOffset(offset) {
    const note = getActiveNote();
    if (!note) return;
    const rows = getAssignableFolderRows();
    const currentId = note.folderId ? String(note.folderId) : "";
    const currentIndex = Math.max(0, rows.findIndex((row) => row.id === currentId));
    const nextIndex = ((currentIndex + offset) % rows.length + rows.length) % rows.length;
    const next = rows[nextIndex];
    if (!next) return;
    await assignActiveNoteToFolder(next.id, `Moved to ${next.label}`);
  }

  async function togglePinnedFolder(folderId) {
    const folder = getFolderById(folderId);
    if (!folder) return;
    const current = normalizePinnedFolderIds(state.ui.pinnedFolderIds, state.folders);
    state.ui.pinnedFolderIds = current.includes(folder.id)
      ? current.filter((id) => id !== folder.id)
      : [...current, folder.id];
    await persistUiOnly(current.includes(folder.id) ? "Category unpinned" : "Category pinned");
  }

  async function cycleFavoriteFolderSortMode() {
    const current = normalizeFavoriteFolderSortMode(state.ui.favoriteFolderSortMode);
    state.ui.favoriteFolderSortMode = current === "manual"
      ? "asc"
      : current === "asc"
        ? "desc"
        : "manual";
    state.ui.folderPage = 0;
    await persistUiOnly(
      state.ui.favoriteFolderSortMode === "manual"
        ? "Favorite order: manual"
        : state.ui.favoriteFolderSortMode === "asc"
          ? "Favorite order: A-Z"
          : "Favorite order: Z-A"
    );
  }

  async function toggleHiddenFoldersVisibility() {
    state.ui.showHiddenFolders = state.ui.showHiddenFolders !== true;
    state.ui.folderPage = 0;
    await persistUiOnly(state.ui.showHiddenFolders ? "Hidden categories shown" : "Hidden categories hidden");
  }

  async function toggleHiddenFolder(folderId) {
    const folder = getFolderById(folderId);
    if (!folder) return;
    const current = normalizeHiddenFolderIds(state.ui.hiddenFolderIds, state.folders);
    const isHidden = current.includes(folder.id);
    state.ui.hiddenFolderIds = isHidden
      ? current.filter((id) => id !== folder.id)
      : [...current, folder.id];
    if (!isHidden && state.ui.activeFolderFilter === folder.id) {
      state.ui.activeFolderFilter = FILTER_ALL_FOLDERS;
    }
    state.ui.folderPage = 0;
    await persistUiOnly(isHidden ? "Category visible" : "Category hidden");
  }

  function changeFolderPage(offset) {
    const pager = getFolderPagerState();
    const next = Math.max(0, Math.min(pager.totalPages - 1, pager.activePage + offset));
    if (next === pager.activePage) return;
    state.ui.folderPage = next;
    render();
  }

  function changeNotePage(offset) {
    const pager = getNotePagerState(getVisibleNotes());
    const next = Math.max(0, Math.min(pager.totalPages - 1, pager.activePage + offset));
    if (next === pager.activePage) return;
    state.ui.notePage = next;
    render();
  }

  async function updateThemePreset(themePreset, successMessage) {
    const nextTheme = normalizeThemePreset(themePreset);
    if (normalizeThemePreset(state.settings.themePreset) === nextTheme) {
      return;
    }
    state.settings = {
      ...state.settings,
      themePreset: nextTheme
    };
    render();
    try {
      await storageSet({
        [SETTINGS_KEY]: state.settings
      });
      setSaveStatus(successMessage || `Theme: ${getThemeLabel(nextTheme)}`, "");
    } catch (err) {
      setSaveStatus("Save failed", "error");
    }
  }

  function handleThemeSelectChange(event) {
    const nextTheme = event && event.target ? String(event.target.value || "") : "classic";
    updateThemePreset(nextTheme, `Theme set to ${getThemeLabel(nextTheme)}`).catch(() => { });
  }

  function togglePreviewMode() {
    state.editor.previewMode = state.editor.previewMode !== true;
    postEditorMessage({
      type: "lp-notes-set-preview",
      previewMode: state.editor.previewMode === true,
      attachmentMap: buildAttachmentMapForContent(state.editor.content || "")
    });
    renderEditorToolbarActions();
    setSaveStatus(state.editor.previewMode ? "Preview mode" : "Write mode", "");
  }

  function insertPageContextIntoNote() {
    const snippet = buildPageContextSnippet(state.pageContext);
    if (!snippet) {
      setSaveStatus("No page context available", "error");
      return;
    }
    const text = state.editor.content && state.editor.content.trim()
      ? `\n\n${snippet}\n`
      : `${snippet}\n\n`;
    if (!postEditorMessage({
      type: "lp-notes-insert-content",
      text
    })) {
      setSaveStatus("Editor not ready", "error");
      return;
    }
    queueEditorFocus("content", false);
  }

  function maybeSeedNoteWithPageContext(note) {
    if (!note || !state.pageContext) return note;
    const title = state.pageContext.title ? String(state.pageContext.title).trim() : "";
    const url = state.pageContext.url ? String(state.pageContext.url).trim() : "";
    if (!title && !url) return note;
    if (!note.title) {
      note.title = title.slice(0, 120);
    }
    if (!note.content) {
      note.content = buildPageContextSnippet(state.pageContext);
    }
    return note;
  }

  async function selectAdjacentNote(direction) {
    await syncActiveNoteFromEditor(false);
    const visibleNotes = getVisibleNotes();
    if (!visibleNotes.length) return;
    const currentIndex = visibleNotes.findIndex((note) => note && note.id === state.ui.activeNoteId);
    const nextIndex = currentIndex < 0
      ? 0
      : Math.max(0, Math.min(visibleNotes.length - 1, currentIndex + direction));
    const target = visibleNotes[nextIndex];
    if (!target || target.id === state.ui.activeNoteId) return;
    state.ui.activeNoteId = target.id;
    state.ui.notesDrawerOpen = true;
    render();
    queueEditorFocus("content", false);
  }

  function handleEditorCommand(command, payload) {
    const action = command ? String(command) : "";
    if (!action) return;
    if (action === "new-note") {
      createNewNote().catch(() => {
        setSaveStatus("Could not create note", "error");
      });
      return;
    }
    if (action === "duplicate-note") {
      duplicateNote().catch(() => {
        setSaveStatus("Could not duplicate note", "error");
      });
      return;
    }
    if (action === "focus-search") {
      state.panelMode = "picker";
      state.ui.notesDrawerOpen = true;
      state.ui.drawerMode = DRAWER_MODE_NOTES;
      render();
      if (state.refs.searchInput) {
        state.refs.searchInput.focus();
        if (typeof state.refs.searchInput.select === "function") {
          state.refs.searchInput.select();
        }
      }
      return;
    }
    if (action === "toggle-preview") {
      togglePreviewMode();
      return;
    }
    if (action === "select-prev-note") {
      selectAdjacentNote(-1).catch(() => {
        setSaveStatus("Could not switch note", "error");
      });
      return;
    }
    if (action === "select-next-note") {
      selectAdjacentNote(1).catch(() => {
        setSaveStatus("Could not switch note", "error");
      });
      return;
    }
    if (action === "insert-page-context") {
      insertPageContextIntoNote();
      return;
    }
    if (action === "focus-title") {
      queueEditorFocus("title", payload && payload.selectAll === true);
      return;
    }
  }

  function setActiveView(view) {
    state.ui.activeView = normalizeView(view);
    state.ui.notesDrawerOpen = true;
    render();
    persistUiOnly().catch(() => {
      setSaveStatus("Save failed", "error");
    });
  }

  function focusNotesSearch(selectAll = true) {
    state.panelMode = "picker";
    state.ui.notesDrawerOpen = true;
    if (!isNotesDrawerPage()) {
      state.ui.drawerMode = DRAWER_MODE_NOTES;
    }
    render();
    if (state.refs.searchInput) {
      state.refs.searchInput.focus();
      if (selectAll && typeof state.refs.searchInput.select === "function") {
        state.refs.searchInput.select();
      }
    }
  }

  function filterByActiveNoteCategory() {
    const note = getActiveNote();
    if (!note || !note.folderId) {
      setSaveStatus("Open a categorized note first", "error");
      return;
    }
    openDrawerNotesPage(String(note.folderId));
    render();
    persistUiOnly(`Filtered by ${getFolderLabel(note.folderId)}`).catch(() => {
      setSaveStatus("Save failed", "error");
    });
  }

  function folderNameExists(name, excludeId) {
    const target = normalizeFolderName(name).toLowerCase();
    if (!target) return false;
    return state.folders.some((folder) =>
      folder &&
      folder.id !== excludeId &&
      folder.name.toLowerCase() === target
    );
  }

  async function createFolder(options = {}) {
    const assignToActiveNote = options && options.assignToActiveNote === true;
    const result = await showPromptDialog({
      title: "New category",
      message: "Create a category to organise notes.",
      inputLabel: "Category name",
      inputPlaceholder: "e.g. Research",
      confirmLabel: "Create"
    });
    if (!result || result.confirmed !== true) return;
    const name = normalizeFolderName(result.value);
    if (!name) return;
    if (folderNameExists(name, "")) {
      setSaveStatus("Category already exists", "error");
      return;
    }
    const folder = {
      id: makeId("folder"),
      name,
      order: state.folders.length,
      createdAt: new Date().toISOString()
    };
    state.folders = normalizeFolders([...state.folders, folder]);
    if (assignToActiveNote) {
      const note = getActiveNote();
      if (note) {
        note.folderId = folder.id;
        note.updatedAt = new Date().toISOString();
      }
    }
    state.ui.activeFolderFilter = folder.id;
    render();
    await flushSave(assignToActiveNote ? "Category created and assigned" : "Category created", {
      includeFolders: true
    });
  }

  async function renameFolder() {
    const activeId = state.ui.activeFolderFilter;
    const folder = activeId !== FILTER_ALL_FOLDERS && activeId !== FILTER_UNCATEGORIZED
      ? getFolderById(activeId)
      : null;
    if (!folder) {
      setSaveStatus("Select a category first", "error");
      return;
    }
    const result = await showPromptDialog({
      title: "Rename category",
      message: `Update the name for "${folder.name}".`,
      inputLabel: "Category name",
      inputValue: folder.name || "",
      confirmLabel: "Rename"
    });
    if (!result || result.confirmed !== true) return;
    const name = normalizeFolderName(result.value);
    if (!name || name === folder.name) return;
    if (folderNameExists(name, folder.id)) {
      setSaveStatus("Category already exists", "error");
      return;
    }
    folder.name = name;
    render();
    await flushSave("Category renamed", { includeFolders: true });
  }

  async function deleteFolder() {
    const activeId = state.ui.activeFolderFilter;
    const folder = activeId !== FILTER_ALL_FOLDERS && activeId !== FILTER_UNCATEGORIZED
      ? getFolderById(activeId)
      : null;
    if (!folder) {
      setSaveStatus("Select a category first", "error");
      return;
    }
    const noteCount = state.notes.filter((note) => note && note.folderId === folder.id).length;
    const result = await showConfirmDialog({
      title: "Delete category",
      message: `Delete "${folder.name}"? ${noteCount} note${noteCount === 1 ? "" : "s"} will move to ${UNCATEGORIZED_LABEL}.`,
      confirmLabel: "Delete",
      danger: true
    });
    if (!result || result.confirmed !== true) return;
    state.folders = normalizeFolders(state.folders.filter((entry) => entry && entry.id !== folder.id));
    state.ui.pinnedFolderIds = state.ui.pinnedFolderIds.filter((id) => id !== folder.id);
    state.notes = state.notes.map((note) => {
      if (!note || note.folderId !== folder.id) return note;
      return {
        ...note,
        folderId: "",
        updatedAt: new Date().toISOString()
      };
    });
    state.ui.activeFolderFilter = FILTER_ALL_FOLDERS;
    render();
    await flushSave("Category deleted", { includeFolders: true });
  }

  function getNewNoteFolderId() {
    const filter = state.ui.activeFolderFilter;
    if (filter === FILTER_UNCATEGORIZED) return "";
    if (filter !== FILTER_ALL_FOLDERS && getFolderById(filter)) {
      return filter;
    }
    return "";
  }

  async function createNewNote(options = {}) {
    await syncActiveNoteFromEditor(false);
    const folderId = options && Object.prototype.hasOwnProperty.call(options, "folderId")
      ? String(options.folderId || "")
      : getNewNoteFolderId();
    const note = maybeSeedNoteWithPageContext(createBlankNote(folderId));
    state.notes = getSortedNotes([note, ...state.notes]);
    state.ui.activeNoteId = note.id;
    state.panelMode = "editor";
    state.ui.notesDrawerOpen = false;
    render();
    scheduleSave();
    queueEditorFocus("title", true);
  }

  async function createNoteFromCurrentPage() {
    if (!hasPageContext()) {
      setSaveStatus("No page context available", "error");
      return;
    }
    const folderId = getPreferredCategoryIdForNewNote();
    await createNewNote({ folderId });
    setSaveStatus(
      folderId
        ? `Created page note in ${getFolderLabel(folderId)}`
        : "Created page note",
      ""
    );
  }

  async function createNoteInCurrentCategory() {
    const folderId = getPreferredCategoryIdForNewNote();
    await createNewNote({ folderId });
    setSaveStatus(
      folderId
        ? `Created note in ${getFolderLabel(folderId)}`
        : "Created unsorted note",
      ""
    );
  }

  async function duplicateNote() {
    await syncActiveNoteFromEditor(true);
    const note = getActiveNote();
    if (!note) return;
    const now = new Date().toISOString();
    const copy = {
      ...note,
      id: makeId("note"),
      title: `${getNoteTitle(note)} Copy`.slice(0, 120),
      isPinned: false,
      pinnedAt: "",
      createdAt: now,
      updatedAt: now
    };
    state.notes = getSortedNotes([copy, ...state.notes]);
    state.ui.activeNoteId = copy.id;
    render();
    scheduleSave();
  }

  function restoreDeletedNote() {
    const pending = state.pendingUndoDelete;
    if (!pending || !pending.note) return;
    const exists = state.notes.some((entry) => entry && entry.id === pending.note.id);
    clearPendingUndoDelete();
    restoreFromTrash(pending.note.id)
      .then(() => refreshTrash())
      .then(() => render())
      .catch(() => null);
    if (exists) return;
    state.notes = getSortedNotes([pending.note, ...state.notes]);
    state.ui.activeNoteId = pending.note.id;
    render();
    scheduleSave();
    queueEditorFocus("title", true);
  }

  function queueDeletedNoteUndo(note) {
    clearPendingUndoDelete();
    state.pendingUndoDelete = {
      note,
      message: `"${getNoteTitle(note)}" deleted.`
    };
    renderUndoToast();
    state.undoDeleteTimer = setTimeout(() => {
      clearPendingUndoDelete();
    }, NOTE_DELETE_UNDO_MS);
  }

  async function moveNoteToFolder(noteId, folderId) {
    const targetId = noteId ? String(noteId) : "";
    if (!targetId) return;
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
    }
    if (targetId === state.ui.activeNoteId) {
      await syncActiveNoteFromEditor(false, { timeoutMs: 260 });
    } else if (state.editor.dirty === true) {
      await syncActiveNoteFromEditor(true, { timeoutMs: 260 });
    }
    const note = state.notes.find((entry) => entry && entry.id === targetId);
    if (!note) return;
    const nextFolderId = folderId && getFolderById(folderId) ? String(folderId) : "";
    if (note.folderId === nextFolderId) return;
    note.folderId = nextFolderId;
    note.updatedAt = new Date().toISOString();
    state.notes = getSortedNotes(state.notes);
    if (note.id === state.ui.activeNoteId && state.ui.activeFolderFilter !== FILTER_ALL_FOLDERS) {
      state.ui.activeFolderFilter = nextFolderId || FILTER_UNCATEGORIZED;
    }
    render();
    const saveStartedAt = Date.now();
    setSaveStatus("Saving...", "saving");
    try {
      await persist(nextFolderId ? `Moved to ${getFolderLabel(nextFolderId)}` : "Moved to Unsorted", {
        saveStartedAt
      });
    } catch (err) {
      setSaveStatus("Save failed", "error");
    }
  }

  async function deleteNoteById(noteId, options = {}) {
    const targetId = noteId ? String(noteId) : "";
    if (!targetId) return;
    if (targetId === state.ui.activeNoteId) {
      await syncActiveNoteFromEditor(false, { timeoutMs: 260 });
    }
    const note = state.notes.find((entry) => entry && entry.id === targetId);
    if (!note) return;
    if (options.confirm !== false) {
      const result = await showConfirmDialog({
        title: "Delete note",
        message: `Delete "${getNoteTitle(note)}"? You can undo this for a few seconds.`,
        confirmLabel: "Delete",
        danger: true
      });
      if (!result || result.confirmed !== true) return;
    }
    const removedNote = {
      ...note
    };
    state.notes = state.notes.filter((entry) => entry && entry.id !== targetId);
    await addToTrash(removedNote);
    await refreshTrash();
    ensureActiveNoteExists();
    render();
    scheduleSave();
    queueDeletedNoteUndo(removedNote);
  }

  async function openTrashPanel() {
    await refreshTrash();
    state.trashPanelOpen = true;
    render();
  }

  function closeTrashPanel() {
    state.trashPanelOpen = false;
    render();
  }

  async function restoreTrashNote(noteId) {
    const targetId = noteId ? String(noteId) : "";
    if (!targetId) return;
    const restored = await restoreFromTrash(targetId);
    if (!restored) return;
    const exists = state.notes.some((entry) => entry && entry.id === restored.id);
    await refreshTrash();
    if (exists) {
      render();
      return;
    }
    state.notes = getSortedNotes([restored, ...state.notes]);
    state.ui.activeNoteId = restored.id;
    render();
    scheduleSave();
    queueEditorFocus("title", true);
    setSaveStatus("Restored from trash", "");
  }

  async function clearTrash() {
    const hasTrash = coerceArray(state.trash).length > 0;
    if (!hasTrash) return;
    const result = await showConfirmDialog({
      title: "Empty trash",
      message: "Permanently remove all deleted notes from the trash list?",
      confirmLabel: "Empty trash",
      danger: true
    });
    if (!result || result.confirmed !== true) return;
    await emptyTrash();
    await refreshTrash();
    render();
    setSaveStatus("Trash emptied", "");
  }

  async function deleteNote() {
    const note = getActiveNote();
    if (!note) return;
    await deleteNoteById(note.id, { confirm: true });
  }

  async function toggleNotePin(noteId) {
    await syncActiveNoteFromEditor(false);
    const targetId = noteId ? String(noteId) : state.ui.activeNoteId;
    if (!targetId) return;
    const note = state.notes.find((entry) => entry && entry.id === targetId);
    if (!note) return;
    const nextPinned = note.isPinned !== true;
    note.isPinned = nextPinned;
    note.pinnedAt = nextPinned ? new Date().toISOString() : "";
    note.updatedAt = new Date().toISOString();
    state.notes = getSortedNotes(state.notes);
    render();
    scheduleSave();
  }

  function selectVisibleNotePage() {
    const pager = getNotePagerState(getVisibleNotes());
    const pageIds = pager.visibleRows
      .map((note) => (note && note.id ? String(note.id) : ""))
      .filter(Boolean);
    state.ui.selectedNoteIds = Array.from(new Set([
      ...coerceArray(state.ui.selectedNoteIds),
      ...pageIds
    ]));
    render();
  }

  function clearSelectedNotes() {
    state.ui.selectedNoteIds = [];
    render();
  }

  async function moveSelectedNotesToCategory() {
    const targetValue = state.refs.bulkNoteMoveSelect
      ? String(state.refs.bulkNoteMoveSelect.value || "")
      : "";
    const selectedIds = getSelectedNoteIdsInScope(getVisibleNotes());
    if (!selectedIds.length) {
      setSaveStatus("No notes selected", "error");
      return;
    }
    const targetFolderId = targetValue === FILTER_UNCATEGORIZED ? "" : targetValue;
    for (const noteId of selectedIds) {
      await moveNoteToFolder(noteId, targetFolderId);
    }
    state.ui.selectedNoteIds = [];
    if (state.refs.bulkNoteMoveSelect) {
      state.refs.bulkNoteMoveSelect.value = "";
    }
    setSaveStatus(
      targetFolderId
        ? `Moved ${selectedIds.length} note${selectedIds.length === 1 ? "" : "s"} to ${getFolderLabel(targetFolderId)}`
        : `Moved ${selectedIds.length} note${selectedIds.length === 1 ? "" : "s"} to ${UNCATEGORIZED_LABEL}`,
      ""
    );
    render();
  }

  async function handleFolderSelectChange(event) {
    const selected = event && event.target ? String(event.target.value || "") : "";
    const note = getActiveNote();
    if (!note) return;
    await moveNoteToFolder(note.id, selected);
  }

  function handleTrashListClick(event) {
    const button = event && event.target && typeof event.target.closest === "function"
      ? event.target.closest('[data-action="restore-trash-note"]')
      : null;
    if (!button) return;
    const noteId = button.getAttribute("data-trash-note-id") || "";
    restoreTrashNote(noteId).catch(() => {
      setSaveStatus("Could not restore note", "error");
    });
  }

  async function openAiSidebar() {
    await flushSave("Saved");
    const response = await sendRuntimeMessage({ type: "open-ai-sidebar" });
    if (!response || response.ok !== true) {
      setSaveStatus("Could not open AI", "error");
    }
  }

  function handleAction(action) {
    if (action === "close-dialog" || action === "cancel-dialog") {
      closeDialog({ confirmed: false, value: "" });
      return;
    }
    if (action === "confirm-dialog") {
      closeDialog({
        confirmed: true,
        value: state.refs.dialogInput ? String(state.refs.dialogInput.value || "") : ""
      });
      return;
    }
    if (action === "close") {
      close();
      return;
    }
    if (action === "npp-page-prev") {
      changeNotePage(-1);
      return;
    }
    if (action === "npp-page-next") {
      changeNotePage(1);
      return;
    }
    if (action === "npp-back" || action === "npp-back-to-categories" || action === "drawer-back-to-categories") {
      if (state.panelMode === "editor") {
        state.panelMode = "picker";
        state.ui.drawerMode = DRAWER_MODE_NOTES;
      } else {
        state.ui.drawerMode = DRAWER_MODE_CATEGORIES;
      }
      render();
      return;
    }
    if (action === "open-trash") {
      openTrashPanel().catch(() => setSaveStatus("Could not open trash", "error"));
      return;
    }
    if (action === "toggle-panel-pin") {
      panelPinned = !panelPinned;
      // Update butang visual
      if (state.refs.mpPanelPinBtn) {
        state.refs.mpPanelPinBtn.style.opacity = panelPinned ? "1" : "0.4";
        state.refs.mpPanelPinBtn.style.background = panelPinned ? "rgba(100,180,255,0.18)" : "rgba(255,255,255,0.06)";
        state.refs.mpPanelPinBtn.style.borderColor = panelPinned ? "rgba(100,180,255,0.5)" : "rgba(255,255,255,0.12)";
        state.refs.mpPanelPinBtn.style.color = panelPinned ? "#7ab8ff" : "inherit";
        state.refs.mpPanelPinBtn.title = panelPinned ? "Panel dikunci — klik untuk nyahpin" : "Pin panel supaya tak tutup bila klik luar";
      }
      setSaveStatus(panelPinned ? "Panel dikunci" : "Panel bebas", "");
      return;
    }
    if (action === "close-trash") {
      closeTrashPanel();
      return;
    }
    if (action === "toggle-pin-folder") {
      const folder = getFolderContextMenuFolder();
      if (!folder) return;
      togglePinnedFolder(folder.id).catch(() => {
        setSaveStatus("Could not pin category", "error");
      });
      closeFolderContextMenu();
      return;
    }
    if (action === "open-folder-view") {
      const folder = getFolderContextMenuFolder();
      if (!folder) return;
      openDrawerNotesPage(folder.id);
      state.ui.notePage = 0;
      closeFolderContextMenu();
      render();
      return;
    }
    if (action === "toggle-hide-folder") {
      const folder = getFolderContextMenuFolder();
      if (!folder) return;
      closeFolderContextMenu();
      toggleHiddenFolder(folder.id).catch(() => {
        setSaveStatus("Could not update category", "error");
      });
      return;
    }
    if (action === "new-note-in-folder") {
      const folder = getFolderContextMenuFolder();
      if (!folder) return;
      closeFolderContextMenu();
      createNewNote({ folderId: folder.id }).catch(() => {
        setSaveStatus("Could not create note", "error");
      });
      return;
    }
    if (action === "move-note-here") {
      const folder = getFolderContextMenuFolder();
      if (!folder) return;
      closeFolderContextMenu();
      assignActiveNoteToFolder(folder.id, `Moved to ${folder.name}`).catch(() => {
        setSaveStatus("Could not move note", "error");
      });
      return;
    }
    if (action === "cycle-folder-favorite-sort") {
      cycleFavoriteFolderSortMode().catch(() => {
        setSaveStatus("Could not update favorite order", "error");
      });
      return;
    }
    if (action === "toggle-hidden-folders") {
      toggleHiddenFoldersVisibility().catch(() => {
        setSaveStatus("Could not update hidden categories", "error");
      });
      return;
    }
    if (action === "folder-page-prev") {
      changeFolderPage(-1);
      return;
    }
    if (action === "folder-page-next") {
      changeFolderPage(1);
      return;
    }
    if (action === "note-page-prev") {
      changeNotePage(-1);
      return;
    }
    if (action === "note-page-next") {
      changeNotePage(1);
      return;
    }
    if (action === "select-note-page") {
      selectVisibleNotePage();
      return;
    }
    if (action === "clear-note-selection") {
      clearSelectedNotes();
      return;
    }
    if (action === "move-selected-notes") {
      moveSelectedNotesToCategory().catch(() => {
        setSaveStatus("Could not move selected notes", "error");
      });
      return;
    }
    if (action === "set-view-all") {
      setActiveView(VIEW_ALL);
      return;
    }
    if (action === "set-view-pinned") {
      setActiveView(VIEW_PINNED);
      return;
    }
    if (action === "set-view-tasks") {
      setActiveView(VIEW_TASKS);
      return;
    }
    if (action === "new-folder") {
      createFolder().catch(() => {
        setSaveStatus("Could not create category", "error");
      });
      return;
    }
    if (action === "new-folder-for-note") {
      createFolder({ assignToActiveNote: true }).catch(() => {
        setSaveStatus("Could not create category", "error");
      });
      return;
    }
    if (action === "rename-folder") {
      closeFolderContextMenu();
      renameFolder().catch(() => {
        setSaveStatus("Could not rename category", "error");
      });
      return;
    }
    if (action === "delete-folder") {
      closeFolderContextMenu();
      deleteFolder().catch(() => {
        setSaveStatus("Could not delete category", "error");
      });
      return;
    }
    if (action === "new-note") {
      createNewNote().catch(() => {
        setSaveStatus("Could not create note", "error");
      });
      return;
    }
    if (action === "new-note-from-page") {
      createNoteFromCurrentPage().catch(() => {
        setSaveStatus("Could not create page note", "error");
      });
      return;
    }
    if (action === "new-note-in-active-category") {
      createNoteInCurrentCategory().catch(() => {
        setSaveStatus("Could not create note", "error");
      });
      return;
    }
    if (action === "filter-active-category") {
      filterByActiveNoteCategory();
      return;
    }
    if (action === "open-ai") {
      openAiSidebar().catch(() => {
        setSaveStatus("Could not open AI", "error");
      });
      return;
    }
    if (action === "save-now") {
      flushSave("Saved").catch(() => { });
      return;
    }
    if (action === "toggle-pin") {
      // Pin nota yang di-hover/highlight ATAU nota aktif dalam editor
      const targetId = (state.panelMode === "picker" && mpActiveNoteId)
        ? mpActiveNoteId
        : state.ui.activeNoteId;
      toggleNotePin(targetId).catch(() => {
        setSaveStatus("Could not pin note", "error");
      });
      return;
    }
    if (action === "duplicate-note") {
      duplicateNote().catch(() => {
        setSaveStatus("Could not duplicate note", "error");
      });
      return;
    }
    if (action === "open-trash") {
      openTrashPanel().catch(() => {
        setSaveStatus("Could not open trash", "error");
      });
      return;
    }
    if (action === "close-trash") {
      closeTrashPanel();
      return;
    }
    if (action === "empty-trash") {
      clearTrash().catch(() => {
        setSaveStatus("Could not empty trash", "error");
      });
      return;
    }
    if (action === "delete-note") {
      // Padam nota yang di-hover/highlight dalam picker, atau nota aktif dalam editor
      const delTargetId = (state.panelMode === "picker" && mpActiveNoteId)
        ? mpActiveNoteId
        : state.ui.activeNoteId;
      if (delTargetId) {
        deleteNoteById(delTargetId, { confirm: state.panelMode === "editor" }).catch(() => {
          setSaveStatus("Could not delete note", "error");
        });
      }
      return;
    }
    if (action === "undo-delete-note") {
      restoreDeletedNote();
      return;
    }
    if (action === "toggle-preview") {
      togglePreviewMode();
      return;
    }
    if (action === "insert-page-context") {
      insertPageContextIntoNote();
      return;
    }
    if (action === "export-note-txt") {
      exportActiveNoteTxt().catch(() => {
        setSaveStatus("Export failed", "error");
      });
      return;
    }
    if (action === "import-note-txt") {
      if (state.refs.importFileInput) {
        state.refs.importFileInput.click();
      }
      return;
    }
    if (action === "export-all-notes-txt") {
      exportAllNotesTxtZip().catch(() => {
        setSaveStatus("Export failed", "error");
      });
      return;
    }
  }

  function handleDocumentKeydown(event) {
    if (!state.open) return;

    // ── Hover + D — delete nota yang di-hover walaupun fokus di luar overlay ──
    // handleOverlayKeydown hanya jalan bila fokus DALAM overlay; bila user
    // hanya hover dengan mouse (fokus masih pada page), event keydown tak
    // melalui overlay, jadi kita handle di sini.
    if (
      !isEventFromOverlay(event)
      && state.panelMode === "picker"
      && (event.key === "d" || event.key === "D")
      && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
      && mpActiveNoteId
      && !isEditableElement(event.target)
      && !state.folderPalette.open
      && !(state.dialog && state.dialog.open)
    ) {
      const targetId = mpActiveNoteId;
      mpActiveNoteId = "";
      event.preventDefault();
      stopOverlayEvent(event);
      deleteNoteById(targetId, { confirm: false }).catch(() => {
        setSaveStatus("Could not delete note", "error");
      });
      return;
    }

    if (event.key === "Escape" && !event.ctrlKey && !event.altKey && !event.metaKey) {
      if (isEventFromOverlay(event)) return;
      if (panelPinned) return; // Panel dikunci
      close();
    }
  }

  function handleDocumentPointerDown(event) {
    if (!state.open) return;

    // Klik dalam folder palette — handle dulu
    if (state.folderPalette.open) {
      const insidePalette = eventPathIncludes(event, state.refs.folderPalette);
      if (!insidePalette && isEventFromOverlay(event)) {
        closeFolderPalette();
        return;
      }
    }

    // Jangan close bila panelPinned aktif
    if (panelPinned) return;

    // Jangan close bila closeOnOutsideClick dimatikan
    if (state.ui.closeOnOutsideClick !== true) return;

    const fromOverlay = isEventFromOverlay(event);

    if (fromOverlay) {
      // Klik dalam shadow DOM — check sama ada klik pada backdrop atau panel
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      const shell = state.refs.shell;
      const dlg = state.refs.dialogLayer;
      const trash = state.refs.trashLayer;
      const insideUI = (shell && path.includes(shell)) ||
        (dlg && dlg.style.display !== "none" && path.includes(dlg)) ||
        (trash && trash.style.display !== "none" && path.includes(trash));
      if (!insideUI) {
        // Klik pada backdrop — close
        close();
      }
    } else {
      // Klik betul-betul luar overlay (luar shadow DOM host) — close
      close();
    }
  }

  function handleWindowResize() {
    if (!state.mounted) return;
    if (state.ui.zenMode) return;
    applyOverlayLayout();
    autoResizeContentInput();
  }

  function handleResizePointerMove(event) {
    if (!state.resizeSession) return;
    if (state.resizeSession.mode === "y") {
      const max = Math.max(360, window.innerHeight - 24);
      const delta = event.clientY - state.resizeSession.startY;
      state.ui.panelHeight = Math.max(360, Math.min(max, Math.round(state.resizeSession.startHeight + delta)));
    } else {
      const max = Math.max(360, window.innerWidth - 24);
      const delta = state.resizeSession.startX - event.clientX;
      state.ui.panelWidth = Math.max(360, Math.min(max, Math.round(state.resizeSession.startWidth + delta)));
    }
    applyOverlayLayout();
  }

  function finishResizeSession(saveLayout) {
    if (!state.resizeSession) return;
    window.removeEventListener("pointermove", handleResizePointerMove, true);
    window.removeEventListener("pointerup", handleResizePointerUp, true);
    window.removeEventListener("pointercancel", handleResizePointerUp, true);
    if (state.refs.resizeHandle) {
      state.refs.resizeHandle.classList.remove("active");
    }
    if (state.refs.resizeHandleY) {
      state.refs.resizeHandleY.classList.remove("active");
    }
    state.resizeSession = null;
    if (saveLayout) {
      persistUiOnly("Panel size saved").catch(() => {
        setSaveStatus("Save failed", "error");
      });
    }
  }

  function handleResizePointerUp(event) {
    if (!state.resizeSession) return;
    if (event.pointerId !== state.resizeSession.pointerId) return;
    finishResizeSession(true);
  }

  function handleResizePointerDown(event) {
    if (!state.open || state.resizeSession || window.innerWidth <= MOBILE_BREAKPOINT) return;
    event.preventDefault();
    stopOverlayEvent(event);
    const rect = state.refs.overlay.getBoundingClientRect();
    state.resizeSession = {
      pointerId: event.pointerId,
      mode: "x",
      startX: event.clientX,
      startWidth: Math.round(rect.width)
    };
    state.refs.resizeHandle.classList.add("active");
    window.addEventListener("pointermove", handleResizePointerMove, true);
    window.addEventListener("pointerup", handleResizePointerUp, true);
    window.addEventListener("pointercancel", handleResizePointerUp, true);
  }

  function handleResizeVerticalPointerDown(event) {
    if (!state.open || state.resizeSession || window.innerWidth <= MOBILE_BREAKPOINT || !state.refs.resizeHandleY) return;
    event.preventDefault();
    stopOverlayEvent(event);
    const rect = state.refs.overlay.getBoundingClientRect();
    state.resizeSession = {
      pointerId: event.pointerId,
      mode: "y",
      startY: event.clientY,
      startHeight: Math.round(rect.height)
    };
    state.refs.resizeHandleY.classList.add("active");
    window.addEventListener("pointermove", handleResizePointerMove, true);
    window.addEventListener("pointerup", handleResizePointerUp, true);
    window.addEventListener("pointercancel", handleResizePointerUp, true);
  }

  async function loadState() {
    const data = await storageGet([SETTINGS_KEY, FOLDERS_KEY, NOTES_KEY, NOTES_UI_KEY, ATTACHMENTS_KEY, TRASH_KEY]);
    state.settings = data[SETTINGS_KEY] && typeof data[SETTINGS_KEY] === "object" ? data[SETTINGS_KEY] : {};
    state.folders = normalizeFolders(data[FOLDERS_KEY]);
    state.notes = normalizeNotes(data[NOTES_KEY], state.folders);
    state.ui = normalizeUi(data[NOTES_UI_KEY], state.folders, state.notes);
    setFolderKeyboardIndexFromActiveFilter();
    state.attachments = pruneAttachmentsMap(data[ATTACHMENTS_KEY], state.notes);
    state.trash = coerceArray(data[TRASH_KEY]).map(normalizeTrashItem).filter(Boolean);
    ensureActiveNoteExists();
    render();
  }

  async function open(options = {}) {
    ensureMounted();
    if (options && options.pageContext) {
      state.pageContext = options.pageContext && typeof options.pageContext === "object"
        ? {
          title: options.pageContext.title ? String(options.pageContext.title) : "",
          url: options.pageContext.url ? String(options.pageContext.url) : ""
        }
        : null;
    }
    await loadState();
    state.trashPanelOpen = false;

    // Always start in picker mode (category list)
    state.panelMode = "picker";
    state.ui.drawerMode = DRAWER_MODE_CATEGORIES;

    const notesStartMode = state.settings && state.settings.notesStartMode === "last" ? "last" : "home";
    if (notesStartMode === "last") {
      const activeNote = getActiveNote();
      if (activeNote) {
        state.panelMode = "editor";
      }
    }

    state.previousFocus = document.activeElement && document.activeElement !== document.body
      ? document.activeElement : null;
    state.open = true;
    render();
    setSaveStatus("Ready", "");
    if (state.panelMode === "editor") {
      queueEditorFocus("content", false);
    }
  }

  async function close() {
    finishResizeSession(false);
    closeFolderContextMenu();
    closeFolderPalette();
    // Reset left panel focus state
    lpFocused = false;
    lpActiveIndex = -1;
    lpSearchBuffer = "";
    if (lpSearchTimer) { clearTimeout(lpSearchTimer); lpSearchTimer = null; }
    mpActiveNoteId = "";
    panelPinned = false;
    if (state.refs.mpPanelPinBtn) {
      state.refs.mpPanelPinBtn.style.opacity = "0.4";
      state.refs.mpPanelPinBtn.style.background = "rgba(255,255,255,0.06)";
      state.refs.mpPanelPinBtn.style.borderColor = "rgba(255,255,255,0.12)";
      state.refs.mpPanelPinBtn.style.color = "inherit";
    }
    state.trashPanelOpen = false;
    state.open = false;
    render();
    // Synchronous blur — host + iframe content, supaya keyboard bebas serta-merta
    if (state.refs.host) state.refs.host.blur();
    if (state.refs.editorFrame && state.refs.editorFrame.contentDocument) {
      const ae = state.refs.editorFrame.contentDocument.activeElement;
      if (ae && typeof ae.blur === "function") ae.blur();
    }
    postEditorMessage({ type: "lp-notes-blur" });
    // Fokus semula ke elemen asal lepas render settle supaya keyboard berfungsi segera
    await flushSave("Saved");
    requestAnimationFrame(() => {
      const prev = state.previousFocus;
      state.previousFocus = null;
      if (prev && typeof prev.focus === "function" && document.contains(prev)) {
        try { prev.focus({ preventScroll: true }); } catch (_) {}
      } else {
        const video = document.querySelector("video");
        if (video && typeof video.focus === "function") {
          try { video.focus({ preventScroll: true }); } catch (_) {}
        } else if (document.body && typeof document.body.focus === "function") {
          document.body.focus({ preventScroll: true });
        }
      }
    });
  }

  async function toggle(options = {}) {
    if (options && options.open === true) {
      await open(options);
      return true;
    }
    if (options && options.close === true) {
      await close();
      return true;
    }
    if (state.open) {
      await close();
      return true;
    }
    await open(options);
    return true;
  }

  api.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") return undefined;
    if (message.type === "toggle-notes-overlay") {
      return toggle(message).then(() => ({ ok: true })).catch(() => ({ ok: false }));
    }
    if (message.type === "set-notes-overlay-context") {
      state.pageContext = message.pageContext && typeof message.pageContext === "object"
        ? {
          title: message.pageContext.title ? String(message.pageContext.title) : "",
          url: message.pageContext.url ? String(message.pageContext.url) : ""
        }
        : null;
      return Promise.resolve({ ok: true });
    }
    return undefined;
  });

  if (api.storage && api.storage.onChanged) {
    api.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (changes[SETTINGS_KEY] && state.open) {
        state.settings = changes[SETTINGS_KEY].newValue && typeof changes[SETTINGS_KEY].newValue === "object"
          ? changes[SETTINGS_KEY].newValue
          : {};
        render();
      }
      // Sync notes from other tabs/windows
      if ((changes[NOTES_KEY] || changes[FOLDERS_KEY]) && state.open) {
        state.pendingExternalReload = true;
        if (!state.editor.dirty) {
          reloadFromExternal();
        }
      }
    });
  }

  window.LocalPocketNotesOverlay = {
    open,
    close,
    toggle,
    setPageContext(context) {
      state.pageContext = context && typeof context === "object"
        ? {
          title: context.title ? String(context.title) : "",
          url: context.url ? String(context.url) : ""
        }
        : null;
    }
  };
})();
