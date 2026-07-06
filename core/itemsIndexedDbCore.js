/* global module */
(function attachLocalPocketItemsIndexedDbCore(globalScope) {
  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function coerceArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function stableStringify(value) {
    try {
      return JSON.stringify(value);
    } catch (_err) {
      return "";
    }
  }

  // Banding item secara field-by-field untuk elak object spread + JSON.stringify
  // yang mahal untuk setiap item semasa sync (3000 operasi untuk 1500 items)
  function itemsContentEqual(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    // Banding scalar fields yang biasa berubah
    const scalarFields = [
      "url", "title", "excerpt", "status", "favorite",
      "time_added", "time_updated", "time_read", "time_favorited",
      "resolved_url", "resolved_title", "given_url", "given_title",
      "word_count", "lang", "is_article", "is_index", "has_video",
      "has_image", "sort_id", "amp_url", "top_image_url"
    ];
    for (const field of scalarFields) {
      if (a[field] !== b[field]) return false;
    }
    // Banding tags — semak panjang dahulu sebelum buat deep compare
    const aTags = a.tags;
    const bTags = b.tags;
    const aTagsIsObj = aTags && typeof aTags === "object";
    const bTagsIsObj = bTags && typeof bTags === "object";
    if (aTagsIsObj !== bTagsIsObj) return false;
    if (aTagsIsObj && bTagsIsObj) {
      const aKeys = Object.keys(aTags);
      const bKeys = Object.keys(bTags);
      if (aKeys.length !== bKeys.length) return false;
      for (const key of aKeys) {
        if (!Object.prototype.hasOwnProperty.call(bTags, key)) return false;
      }
    }
    // Banding authors array
    const aAuthors = a.authors;
    const bAuthors = b.authors;
    const aIsArr = Array.isArray(aAuthors);
    const bIsArr = Array.isArray(bAuthors);
    if (aIsArr !== bIsArr) return false;
    if (aIsArr && bIsArr && aAuthors.length !== bAuthors.length) return false;
    // Fallback stringify hanya untuk field-field lain yang tidak dijangka
    // Buang content & textContent yang besar sebelum stringify
    const aRest = stableStringify({ ...a, content: undefined, textContent: undefined,
      url: undefined, title: undefined, excerpt: undefined, status: undefined,
      favorite: undefined, time_added: undefined, time_updated: undefined,
      time_read: undefined, time_favorited: undefined, resolved_url: undefined,
      resolved_title: undefined, given_url: undefined, given_title: undefined,
      word_count: undefined, lang: undefined, is_article: undefined,
      is_index: undefined, has_video: undefined, has_image: undefined,
      sort_id: undefined, amp_url: undefined, top_image_url: undefined,
      tags: undefined, authors: undefined });
    const bRest = stableStringify({ ...b, content: undefined, textContent: undefined,
      url: undefined, title: undefined, excerpt: undefined, status: undefined,
      favorite: undefined, time_added: undefined, time_updated: undefined,
      time_read: undefined, time_favorited: undefined, resolved_url: undefined,
      resolved_title: undefined, given_url: undefined, given_title: undefined,
      word_count: undefined, lang: undefined, is_article: undefined,
      is_index: undefined, has_video: undefined, has_image: undefined,
      sort_id: undefined, amp_url: undefined, top_image_url: undefined,
      tags: undefined, authors: undefined });
    return aRest === bRest;
  }

  function createStore(options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const dbName = safeOptions.dbName ? String(safeOptions.dbName) : "local-pocket-items-db";
    const storeName = safeOptions.storeName ? String(safeOptions.storeName) : "items";
    const hasIndexedDb = typeof indexedDB !== "undefined" && !!indexedDB;
    let dbPromise = null;

    function requestToPromise(request) {
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          const message = request.error && request.error.message
            ? request.error.message
            : "IndexedDB request failed";
          reject(new Error(message));
        };
      });
    }

    function waitForTransaction(tx) {
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => {
          const message = tx.error && tx.error.message ? tx.error.message : "IndexedDB transaction aborted";
          reject(new Error(message));
        };
        tx.onerror = () => {
          const message = tx.error && tx.error.message ? tx.error.message : "IndexedDB transaction failed";
          reject(new Error(message));
        };
      });
    }

    function openDb() {
      if (!hasIndexedDb) {
        return Promise.reject(new Error("IndexedDB unavailable"));
      }
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 2); // Version bump for indexes
        request.onupgradeneeded = (event) => {
          const db = request.result;
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: "id" });
            // Add indexes for faster queries
            store.createIndex("categoryId", "item.categoryId", { unique: false });
            store.createIndex("time_added", "item.time_added", { unique: false });
            store.createIndex("favorite", "item.favorite", { unique: false });
          } else {
            // If store exists, check if indexes are present
            const store = event.target.transaction.objectStore(storeName);
            if (!store.indexNames.contains("categoryId")) {
              store.createIndex("categoryId", "item.categoryId", { unique: false });
            }
            if (!store.indexNames.contains("time_added")) {
              store.createIndex("time_added", "item.time_added", { unique: false });
            }
            if (!store.indexNames.contains("favorite")) {
              store.createIndex("favorite", "item.favorite", { unique: false });
            }
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); dbPromise = null; };
          db.onclose = () => { dbPromise = null; };
          resolve(db);
        };
        request.onerror = () => {
          const message = request.error && request.error.message
            ? request.error.message
            : "Failed to open IndexedDB";
          reject(new Error(message));
        };
      }).catch((err) => {
        dbPromise = null;
        throw err;
      });
      return dbPromise;
    }

    async function runTransaction(mode, runner) {
      const db = await openDb();
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const value = await runner(store, tx);
      await waitForTransaction(tx);
      return value;
    }

    function normalizeRecord(item, order) {
      return {
        id: item && item.id != null ? String(item.id) : String(order),
        order,
        item
      };
    }

    async function list() {
      if (!hasIndexedDb) return [];
      const rows = await runTransaction("readonly", (store) => requestToPromise(store.getAll()));
      return coerceArray(rows)
        .slice()
        .sort((a, b) => {
          const aOrder = Number.isFinite(a && a.order) ? a.order : 0;
          const bOrder = Number.isFinite(b && b.order) ? b.order : 0;
          return aOrder - bOrder;
        })
        .map((row) => (row && row.item && typeof row.item === "object" ? row.item : null))
        .filter(Boolean);
    }

    async function clear() {
      if (!hasIndexedDb) return;
      await runTransaction("readwrite", (store) => {
        store.clear();
      });
    }

    async function replaceAll(items) {
      if (!hasIndexedDb) return { updated: 0, deleted: 0 };
      const safeItems = coerceArray(items).filter((item) => item && typeof item === "object");
      await runTransaction("readwrite", (store) => {
        store.clear();
        safeItems.forEach((item, index) => {
          store.put(normalizeRecord(item, index));
        });
      });
      return { updated: safeItems.length, deleted: 0 };
    }

    async function applyIncremental(previousItems, nextItems) {
      if (!hasIndexedDb) return { updated: 0, deleted: 0 };
      const prev = coerceArray(previousItems).filter((item) => item && typeof item === "object");
      const next = coerceArray(nextItems).filter((item) => item && typeof item === "object");
      const getId = (item, index) => {
        return item.id != null ? String(item.id) : "__idx:" + index;
      };

      const prevById = new Map();
      const prevOrderById = new Map();
      prev.forEach((item, index) => {
        const key = getId(item, index);
        prevById.set(key, item);
        prevOrderById.set(key, index);
      });

      const nextById = new Map();
      next.forEach((item, index) => {
        const key = getId(item, index);
        nextById.set(key, item);
      });

      const idsToDelete = [];
      prevById.forEach((_value, key) => {
        if (!nextById.has(key)) {
          idsToDelete.push(key);
        }
      });

      const recordsToPut = [];
      next.forEach((item, index) => {
        if (!item) return;
        const key = getId(item, index);
        const prevItem = prevById.get(key);
        if (!prevItem) {
          recordsToPut.push(normalizeRecord(item, index));
          return;
        }
        const prevOrder = prevOrderById.get(key);
        if (prevOrder !== index) {
          recordsToPut.push(normalizeRecord(item, index));
          return;
        }
        if (!itemsContentEqual(prevItem, item)) {
          recordsToPut.push(normalizeRecord(item, index));
        }
      });

      if (!idsToDelete.length && !recordsToPut.length) {
        return { updated: 0, deleted: 0 };
      }

      await runTransaction("readwrite", (store) => {
        idsToDelete.forEach((id) => store.delete(id));
        recordsToPut.forEach((record) => store.put(record));
      });

      return {
        updated: recordsToPut.length,
        deleted: idsToDelete.length
      };
    }

    async function isAvailable() {
      if (!hasIndexedDb) return false;
      try {
        await openDb();
        return true;
      } catch (_err) {
        return false;
      }
    }

    return {
      isAvailable,
      list,
      clear,
      replaceAll,
      applyIncremental
    };
  }

  const api = {
    createStore
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope && typeof globalScope === "object") {
    globalScope.LocalPocketItemsIndexedDbCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
