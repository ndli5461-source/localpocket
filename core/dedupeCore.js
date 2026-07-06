/* global module */
(function attachLocalPocketDedupeCore(globalScope) {
  function dedupeItemsByUrl(items, deps) {
    const safeDeps = deps && typeof deps === "object" ? deps : {};
    const coerceArray = typeof safeDeps.coerceArray === "function"
      ? safeDeps.coerceArray
      : ((value) => (Array.isArray(value) ? value : []));
    const normalizeUrl = typeof safeDeps.normalizeUrl === "function"
      ? safeDeps.normalizeUrl
      : ((value) => String(value || ""));
    const buildUrlCompareCandidates = typeof safeDeps.buildUrlCompareCandidates === "function"
      ? safeDeps.buildUrlCompareCandidates
      : ((value) => {
        const raw = String(value || "").trim();
        return raw ? new Set([raw]) : new Set();
      });
    const mergeDuplicateItems = typeof safeDeps.mergeDuplicateItems === "function"
      ? safeDeps.mergeDuplicateItems
      : ((primary, duplicate) => {
        const safePrimary = primary || {};
        const safeDuplicate = duplicate || {};
        // Start from primary as base — only enrich with fields from duplicate
        // that are missing or empty in primary. This prevents an older/lower-
        // quality duplicate from overwriting title, content, thumbnail, etc.
        // that primary already has. Protected fields are always kept from primary.
        const PROTECTED_FIELDS = ["id", "time_added", "categoryId", "favorite"];
        const ENRICH_ONLY_FIELDS = ["title", "excerpt", "content", "thumbnailUrl", "faviconUrl", "byline", "siteName", "wordCount", "readingTime"];
        const merged = { ...safePrimary };
        for (const [key, val] of Object.entries(safeDuplicate)) {
          if (PROTECTED_FIELDS.includes(key)) continue; // always keep primary
          if (ENRICH_ONLY_FIELDS.includes(key)) {
            // Only fill in if primary value is absent/empty
            const primaryVal = safePrimary[key];
            if (primaryVal === undefined || primaryVal === null || primaryVal === "") {
              merged[key] = val;
            }
          } else {
            // For other fields (metadata, flags, etc.) prefer duplicate (newer data)
            merged[key] = val;
          }
        }
        // Re-assert protected fields from primary (belt-and-braces)
        for (const field of PROTECTED_FIELDS) {
          if (safePrimary[field] !== undefined) {
            merged[field] = safePrimary[field];
          }
        }
        return merged;
      });

    const source = coerceArray(items);
    const deduped = [];
    const candidateToIndex = new Map();
    let changed = false;

    source.forEach((rawItem) => {
      if (!rawItem || typeof rawItem !== "object") {
        deduped.push(rawItem);
        return;
      }
      const normalizedUrl = rawItem.url ? normalizeUrl(rawItem.url) : "";
      const item = normalizedUrl && normalizedUrl !== rawItem.url
        ? { ...rawItem, url: normalizedUrl }
        : rawItem;
      if (item !== rawItem) changed = true;

      const candidates = buildUrlCompareCandidates(item.url);
      let existingIndex = -1;
      if (candidates && candidates.size) {
        for (const candidate of candidates) {
          if (candidateToIndex.has(candidate)) {
            existingIndex = candidateToIndex.get(candidate);
            break;
          }
        }
      }

      if (existingIndex < 0) {
        const nextIndex = deduped.length;
        deduped.push(item);
        if (candidates && candidates.size) {
          candidates.forEach((candidate) => {
            candidateToIndex.set(candidate, nextIndex);
          });
        }
        return;
      }

      changed = true;
      const merged = mergeDuplicateItems(deduped[existingIndex], item);
      deduped[existingIndex] = merged;
      const mergedCandidates = buildUrlCompareCandidates(merged && merged.url ? merged.url : "");
      if (mergedCandidates && mergedCandidates.size) {
        mergedCandidates.forEach((candidate) => {
          candidateToIndex.set(candidate, existingIndex);
        });
      }
    });

    return {
      items: deduped,
      changed
    };
  }

  const api = {
    dedupeItemsByUrl
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope && typeof globalScope === "object") {
    globalScope.LocalPocketDedupeCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
