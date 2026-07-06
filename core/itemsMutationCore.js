/* global module */
(function attachLocalPocketItemsMutationCore(globalScope) {
  function coerceArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizePayload(payload) {
    return payload && typeof payload === "object" ? payload : {};
  }

  function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    if (parsed < min) return min;
    if (parsed > max) return max;
    return parsed;
  }

  function normalizeReadingProgress(value) {
    const source = value && typeof value === "object" ? value : {};
    const percent = Math.round(clampNumber(source.percent, 0, 100, 0) * 10) / 10;
    const scrollTop = Math.round(clampNumber(source.scrollTop, 0, 50000000, 0));
    const scrollHeight = Math.round(clampNumber(source.scrollHeight, 0, 50000000, 0));
    const viewportHeight = Math.round(clampNumber(source.viewportHeight, 0, 50000000, 0));
    const updatedAt = source.updatedAt ? String(source.updatedAt) : new Date().toISOString();
    return {
      percent,
      scrollTop,
      scrollHeight,
      viewportHeight,
      updatedAt,
      completed: source.completed === true || percent >= 99.5
    };
  }

  function normalizeNoteEntry(value) {
    const source = value && typeof value === "object" ? value : {};
    const id = source.id ? String(source.id).trim() : "";
    const text = source.text ? String(source.text).trim() : "";
    if (!id || !text) return null;
    const quote = source.quote ? String(source.quote).trim() : "";
    const createdAt = source.createdAt ? String(source.createdAt) : new Date().toISOString();
    return {
      id: id.slice(0, 80),
      text: text.slice(0, 2000),
      quote: quote.slice(0, 500),
      createdAt
    };
  }

  function normalizeHighlightEntry(value) {
    const source = value && typeof value === "object" ? value : {};
    const id = source.id ? String(source.id).trim() : "";
    const text = source.text ? String(source.text).trim() : "";
    if (!id || !text) return null;
    const colorRaw = source.color ? String(source.color).trim().toLowerCase() : "yellow";
    const color = ["yellow", "green", "blue", "pink"].includes(colorRaw) ? colorRaw : "yellow";
    const createdAt = source.createdAt ? String(source.createdAt) : new Date().toISOString();
    return {
      id: id.slice(0, 80),
      text: text.slice(0, 800),
      color,
      createdAt
    };
  }

  function normalizeWritingDraft(value) {
    const source = value && typeof value === "object" ? value : {};
    const text = source.text == null ? "" : String(source.text);
    const updatedAt = source.updatedAt ? String(source.updatedAt) : new Date().toISOString();
    return {
      text: text.slice(0, 200000),
      updatedAt
    };
  }

  function applyItemMutation(items, action, payload) {
    const safeItems = coerceArray(items);
    const safeAction = action ? String(action) : "";
    const safePayload = normalizePayload(payload);

    let nextItems = safeItems.slice();
    let changed = false;
    let removedItems = [];

    if (safeAction === "set-favorite") {
      const itemId = safePayload.itemId ? String(safePayload.itemId) : "";
      if (!itemId) return { ok: false, reason: "missing-item-id" };
      const nextFavorite = safePayload.favorite === true;
      nextItems = safeItems.map((item) => {
        if (!item || item.id !== itemId) return item;
        if (!!item.favorite === nextFavorite) return item;
        changed = true;
        return { ...item, favorite: nextFavorite };
      });
    } else if (safeAction === "delete-by-id") {
      const itemId = safePayload.itemId ? String(safePayload.itemId) : "";
      if (!itemId) return { ok: false, reason: "missing-item-id" };
      const matchIndex = safeItems.findIndex((item) => item && item.id === itemId);
      if (matchIndex >= 0) {
        removedItems = [safeItems[matchIndex]];
        nextItems = safeItems.filter((_, idx) => idx !== matchIndex);
        changed = true;
      }
    } else if (safeAction === "clear-all") {
      if (safeItems.length) {
        removedItems = safeItems.slice();
        nextItems = [];
        changed = true;
      }
    } else if (safeAction === "set-category") {
      const itemId = safePayload.itemId ? String(safePayload.itemId) : "";
      if (!itemId) return { ok: false, reason: "missing-item-id" };
      const nextCategory = safePayload.categoryId ? String(safePayload.categoryId) : "";
      nextItems = safeItems.map((item) => {
        if (!item || item.id !== itemId) return item;
        const currentCategory = item.categoryId ? String(item.categoryId) : "";
        if (currentCategory === nextCategory) return item;
        changed = true;
        const nextItem = { ...item, categoryId: nextCategory };
        if (Object.prototype.hasOwnProperty.call(nextItem, "manualOrder")) {
          delete nextItem.manualOrder;
        }
        return nextItem;
      });
    } else if (safeAction === "set-reading-progress") {
      const itemId = safePayload.itemId ? String(safePayload.itemId) : "";
      if (!itemId) return { ok: false, reason: "missing-item-id" };
      const progressSource = safePayload.progress && typeof safePayload.progress === "object"
        ? safePayload.progress
        : safePayload;
      const nextProgress = normalizeReadingProgress(progressSource);
      nextItems = safeItems.map((item) => {
        if (!item || item.id !== itemId) return item;
        const currentProgress = item.readingProgress && typeof item.readingProgress === "object"
          ? normalizeReadingProgress(item.readingProgress)
          : null;
        if (
          currentProgress
          && currentProgress.percent === nextProgress.percent
          && currentProgress.scrollTop === nextProgress.scrollTop
          && currentProgress.scrollHeight === nextProgress.scrollHeight
          && currentProgress.viewportHeight === nextProgress.viewportHeight
          && currentProgress.completed === nextProgress.completed
        ) {
          return item;
        }
        changed = true;
        return { ...item, readingProgress: nextProgress };
      });
    } else if (safeAction === "add-note") {
      const itemId = safePayload.itemId ? String(safePayload.itemId) : "";
      if (!itemId) return { ok: false, reason: "missing-item-id" };
      const nextNote = normalizeNoteEntry(safePayload.note && typeof safePayload.note === "object" ? safePayload.note : safePayload);
      if (!nextNote) return { ok: false, reason: "invalid-note" };
      nextItems = safeItems.map((item) => {
        if (!item || item.id !== itemId) return item;
        const notes = coerceArray(item.notes).filter((entry) => entry && typeof entry === "object");
        const existingIndex = notes.findIndex((entry) => String(entry.id || "") === nextNote.id);
        let nextNotes = notes;
        if (existingIndex >= 0) {
          const existing = normalizeNoteEntry(notes[existingIndex]);
          if (
            existing
            && existing.text === nextNote.text
            && existing.quote === nextNote.quote
          ) {
            return item;
          }
          nextNotes = notes.slice();
          nextNotes[existingIndex] = nextNote;
          changed = true;
        } else {
          nextNotes = [nextNote, ...notes];
          changed = true;
        }
        return { ...item, notes: nextNotes.slice(0, 200) };
      });
    } else if (safeAction === "delete-note") {
      const itemId = safePayload.itemId ? String(safePayload.itemId) : "";
      const noteId = safePayload.noteId ? String(safePayload.noteId) : "";
      if (!itemId) return { ok: false, reason: "missing-item-id" };
      if (!noteId) return { ok: false, reason: "missing-note-id" };
      nextItems = safeItems.map((item) => {
        if (!item || item.id !== itemId) return item;
        const notes = coerceArray(item.notes).filter((entry) => entry && typeof entry === "object");
        const filtered = notes.filter((entry) => String(entry.id || "") !== noteId);
        if (filtered.length === notes.length) return item;
        changed = true;
        return { ...item, notes: filtered };
      });
    } else if (safeAction === "add-highlight") {
      const itemId = safePayload.itemId ? String(safePayload.itemId) : "";
      if (!itemId) return { ok: false, reason: "missing-item-id" };
      const nextHighlight = normalizeHighlightEntry(
        safePayload.highlight && typeof safePayload.highlight === "object" ? safePayload.highlight : safePayload
      );
      if (!nextHighlight) return { ok: false, reason: "invalid-highlight" };
      nextItems = safeItems.map((item) => {
        if (!item || item.id !== itemId) return item;
        const highlights = coerceArray(item.highlights).filter((entry) => entry && typeof entry === "object");
        const existingIndex = highlights.findIndex((entry) => String(entry.id || "") === nextHighlight.id);
        let nextHighlights = highlights;
        if (existingIndex >= 0) {
          const existing = normalizeHighlightEntry(highlights[existingIndex]);
          if (existing && existing.text === nextHighlight.text && existing.color === nextHighlight.color) {
            return item;
          }
          nextHighlights = highlights.slice();
          nextHighlights[existingIndex] = nextHighlight;
          changed = true;
        } else {
          nextHighlights = [nextHighlight, ...highlights];
          changed = true;
        }
        return { ...item, highlights: nextHighlights.slice(0, 300) };
      });
    } else if (safeAction === "delete-highlight") {
      const itemId = safePayload.itemId ? String(safePayload.itemId) : "";
      const highlightId = safePayload.highlightId ? String(safePayload.highlightId) : "";
      if (!itemId) return { ok: false, reason: "missing-item-id" };
      if (!highlightId) return { ok: false, reason: "missing-highlight-id" };
      nextItems = safeItems.map((item) => {
        if (!item || item.id !== itemId) return item;
        const highlights = coerceArray(item.highlights).filter((entry) => entry && typeof entry === "object");
        const filtered = highlights.filter((entry) => String(entry.id || "") !== highlightId);
        if (filtered.length === highlights.length) return item;
        changed = true;
        return { ...item, highlights: filtered };
      });
    } else if (safeAction === "set-writing-draft") {
      const itemId = safePayload.itemId ? String(safePayload.itemId) : "";
      if (!itemId) return { ok: false, reason: "missing-item-id" };
      const nextDraft = normalizeWritingDraft(
        safePayload.draft && typeof safePayload.draft === "object" ? safePayload.draft : safePayload
      );
      nextItems = safeItems.map((item) => {
        if (!item || item.id !== itemId) return item;
        const currentDraft = item.writingDraft && typeof item.writingDraft === "object"
          ? normalizeWritingDraft(item.writingDraft)
          : null;
        if (currentDraft && currentDraft.text === nextDraft.text) return item;
        changed = true;
        return { ...item, writingDraft: nextDraft };
      });
    } else if (safeAction === "delete-uncategorized") {
      const removed = safeItems.filter((item) => item && !item.categoryId);
      if (removed.length) {
        removedItems = removed;
        nextItems = safeItems.filter((item) => item && item.categoryId);
        changed = true;
      }
    } else if (safeAction === "clear-category") {
      const categoryId = safePayload.categoryId ? String(safePayload.categoryId) : "";
      if (!categoryId) return { ok: false, reason: "missing-category-id" };
      nextItems = safeItems.map((item) => {
        if (!item || item.categoryId !== categoryId) return item;
        changed = true;
        const nextItem = { ...item, categoryId: "" };
        if (Object.prototype.hasOwnProperty.call(nextItem, "manualOrder")) {
          delete nextItem.manualOrder;
        }
        return nextItem;
      });
    } else if (safeAction === "replace-all") {
      nextItems = coerceArray(safePayload.items);
      changed = true;
    } else {
      return { ok: false, reason: "unknown-action" };
    }

    return {
      ok: true,
      changed,
      items: nextItems,
      removedItems
    };
  }

  /**
   * Trigger sync for item mutations
   * @param {string} dataType - Data type (items, categories, settings, notes)
   * @param {Object|Array} data - Data to sync
   * @param {string} documentId - Document ID (optional)
   */
  async function triggerSync(dataType, data, documentId = null) {
    try {
      // Check if sync core is available
      if (typeof LocalPocketFirestoreSyncCore !== 'undefined') {
        const syncCore = LocalPocketFirestoreSyncCore;

        // Check if sync is enabled
        const syncEnabled = await syncCore.isSyncEnabled();
        if (!syncEnabled) {
          return;
        }

        // Guard: do not attempt Firestore sync if user is not authenticated.
        // Without this check, every mutation by a guest user would fire a
        // permission-denied write to Firestore, permanently poisoning the
        // pending-sync queue with operations that can never succeed.
        const authCore = typeof LocalPocketFirebaseAuthCore !== 'undefined'
          ? LocalPocketFirebaseAuthCore
          : null;
        if (authCore) {
          const isAuthed = await authCore.isAuthenticated();
          if (!isAuthed) {
            return;
          }
        }

        // Trigger sync
        await syncCore.syncData(dataType, data, documentId);
      }
    } catch (err) {
      console.error('Sync trigger error:', err);
      // Don't block the main operation if sync fails
    }
  }

  /**
   * Apply item mutation with sync trigger
   * @param {Array} items - Current items
   * @param {string} action - Mutation action
   * @param {Object} payload - Mutation payload
   * @param {boolean} enableSync - Whether to trigger sync (default: true)
   * @returns {Object} Mutation result
   */
  function applyItemMutationWithSync(items, action, payload, enableSync = true) {
    const result = applyItemMutation(items, action, payload);
    
    if (result.ok && result.changed && enableSync) {
      // Only sync items that actually changed, not the entire array.
      // applyItemMutation returns the full nextItems array — we need to find
      // just the mutated ones by comparing against the original list so we
      // don't fire a Firestore write for every item on every mutation.
      const originalIds = new Set(coerceArray(items).map(i => i && i.id).filter(Boolean));
      const originalMap = new Map(coerceArray(items).filter(i => i && i.id).map(i => [i.id, i]));

      result.items.forEach(item => {
        if (!item || !item.id) return;
        const original = originalMap.get(item.id);
        // Sync if the item is new or its reference changed (mutation core returns
        // a new object only when something actually changed on that specific item)
        if (!original || original !== item) {
          triggerSync('items', item, item.id);
        }
      });

      // Sync removed items (delete from Firestore)
      if (result.removedItems && result.removedItems.length > 0) {
        result.removedItems.forEach(item => {
          if (item && item.id) {
            // For deleted items, we still sync to mark as deleted
            triggerSync('items', { ...item, deleted: true }, item.id);
          }
        });
      }
    }
    
    return result;
  }

  const api = {
    applyItemMutation,
    applyItemMutationWithSync,
    triggerSync
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope && typeof globalScope === "object") {
    globalScope.LocalPocketItemsMutationCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
