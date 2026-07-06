/* global module */
(function attachLocalPocketImportCore(globalScope) {
  const IMPORT_TRACKING_QUERY_PARAM_KEYS = new Set([
    "fbclid",
    "gclid",
    "igshid",
    "mc_cid",
    "mc_eid",
    "mkt_tok",
    "msclkid",
    "ref",
    "si",
    "spm",
    "vero_conv",
    "vero_id",
    "yclid"
  ]);

  function coerceArray(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return Object.values(value);
    return [];
  }

  function parseUrlLenient(rawUrl) {
    const raw = rawUrl ? String(rawUrl).trim() : "";
    if (!raw) return null;
    try {
      return new URL(raw);
    } catch (_err) {
      // try next strategy
    }
    if (raw.startsWith("//")) {
      try {
        return new URL(`https:${raw}`);
      } catch (_err) {
        // try next strategy
      }
    }
    if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(raw)) {
      try {
        return new URL(`https://${raw}`);
      } catch (_err) {
        // invalid URL
      }
    }
    return null;
  }

  function isAllowedImportedProtocol(protocol) {
    const normalized = String(protocol || "").toLowerCase();
    return normalized === "http:" || normalized === "https:" || normalized === "file:";
  }

  function normalizeImportedUrl(rawUrl) {
    const parsed = parseUrlLenient(rawUrl);
    if (!parsed) return "";
    if (!isAllowedImportedProtocol(parsed.protocol)) return "";
    parsed.hash = "";
    if ((parsed.protocol === "https:" && parsed.port === "443")
      || (parsed.protocol === "http:" && parsed.port === "80")) {
      parsed.port = "";
    }
    return parsed.toString();
  }

  function extractYouTubeVideoId(rawUrl) {
    const parsed = parseUrlLenient(rawUrl);
    if (!parsed) return "";
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") {
      const idFromPath = parsed.pathname.replace(/^\/+/, "").split("/")[0];
      return /^[A-Za-z0-9_-]{6,}$/.test(idFromPath) ? idFromPath : "";
    }
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      if (parsed.pathname.startsWith("/watch")) {
        const v = parsed.searchParams.get("v");
        return /^[A-Za-z0-9_-]{6,}$/.test(String(v || "")) ? String(v) : "";
      }
      const shorts = parsed.pathname.match(/^\/shorts\/([^/?#]+)/);
      if (shorts && /^[A-Za-z0-9_-]{6,}$/.test(shorts[1])) return shorts[1];
      const live = parsed.pathname.match(/^\/live\/([^/?#]+)/);
      if (live && /^[A-Za-z0-9_-]{6,}$/.test(live[1])) return live[1];
      const embed = parsed.pathname.match(/^\/embed\/([^/?#]+)/);
      if (embed && /^[A-Za-z0-9_-]{6,}$/.test(embed[1])) return embed[1];
    }
    return "";
  }

  function normalizeImportedUrlForCompare(rawUrl) {
    const parsed = parseUrlLenient(rawUrl);
    if (!parsed) return "";
    if (!isAllowedImportedProtocol(parsed.protocol)) return "";
    parsed.hash = "";
    if ((parsed.protocol === "https:" && parsed.port === "443")
      || (parsed.protocol === "http:" && parsed.port === "80")) {
      parsed.port = "";
    }
    const trimmedPath = parsed.pathname.replace(/\/+$/g, "");
    parsed.pathname = trimmedPath ? trimmedPath : "/";
    const keptParams = [];
    parsed.searchParams.forEach((value, key) => {
      const normalizedKey = String(key || "").toLowerCase();
      if (!normalizedKey) return;
      if (normalizedKey.startsWith("utm_")) return;
      if (IMPORT_TRACKING_QUERY_PARAM_KEYS.has(normalizedKey)) return;
      keptParams.push([key, value]);
    });
    if (keptParams.length) {
      keptParams.sort((a, b) => {
        const keyOrder = a[0].localeCompare(b[0]);
        if (keyOrder !== 0) return keyOrder;
        return a[1].localeCompare(b[1]);
      });
      const nextParams = new URLSearchParams();
      keptParams.forEach(([key, value]) => nextParams.append(key, value));
      parsed.search = `?${nextParams.toString()}`;
    } else {
      parsed.search = "";
    }
    return parsed.toString();
  }

  function buildImportedUrlCompareCandidates(rawUrl) {
    const normalized = normalizeImportedUrlForCompare(rawUrl);
    const candidates = new Set();
    if (normalized) {
      candidates.add(normalized);
    }
    const youtubeId = extractYouTubeVideoId(rawUrl);
    if (youtubeId) {
      const encoded = encodeURIComponent(youtubeId);
      candidates.add(`https://www.youtube.com/watch?v=${encoded}`);
      candidates.add(`https://youtube.com/watch?v=${encoded}`);
      candidates.add(`https://m.youtube.com/watch?v=${encoded}`);
      candidates.add(`https://youtu.be/${encoded}`);
    }
    return candidates;
  }

  function dedupeImportedItems(items) {
    const list = Array.isArray(items) ? items : [];
    const deduped = [];
    const candidateToIndex = new Map();
    list.forEach((item) => {
      if (!item || typeof item !== "object" || !item.url) return;
      const candidates = buildImportedUrlCompareCandidates(item.url);
      let existingIndex = -1;
      candidates.forEach((candidate) => {
        if (existingIndex >= 0) return;
        if (candidateToIndex.has(candidate)) {
          existingIndex = candidateToIndex.get(candidate);
        }
      });
      if (existingIndex < 0) {
        const nextIndex = deduped.length;
        deduped.push(item);
        candidates.forEach((candidate) => candidateToIndex.set(candidate, nextIndex));
        return;
      }
      const existing = deduped[existingIndex] && typeof deduped[existingIndex] === "object"
        ? deduped[existingIndex]
        : {};
      // B4 fix: protect identity and provenance fields from being overwritten
      // by a later/duplicate entry. Only enrich fields that are absent in the
      // primary (existing) item. `favorite` is OR-merged, numeric metrics take
      // the max, and the remaining enrichment fields are filled only when empty.
      const PROTECTED_FIELDS = ["id", "time_added", "savedAt", "categoryId"];
      const ENRICH_ONLY_FIELDS = ["title", "excerpt", "content", "thumbnailUrl", "faviconUrl", "byline", "siteName", "wordCount", "readingTime"];

      const merged = { ...existing };
      for (const [key, val] of Object.entries(item)) {
        if (PROTECTED_FIELDS.includes(key)) continue; // always keep existing
        if (ENRICH_ONLY_FIELDS.includes(key)) {
          // Only fill if existing value is absent or empty
          if (merged[key] === undefined || merged[key] === null || merged[key] === "") {
            merged[key] = val;
          }
        } else {
          merged[key] = val;
        }
      }
      // Explicit overrides that require special merge logic
      merged.favorite = !!(existing.favorite || item.favorite);
      merged.wordCount = Math.max(Number(existing.wordCount) || 0, Number(item.wordCount) || 0);
      merged.readingTime = Math.max(Number(existing.readingTime) || 0, Number(item.readingTime) || 0);
      if (!existing.categoryId && item.categoryId) {
        merged.categoryId = item.categoryId;
      }
      if (!existing.faviconUrl && item.faviconUrl) {
        merged.faviconUrl = item.faviconUrl;
      }
      // Re-assert protected fields (belt-and-braces)
      for (const field of PROTECTED_FIELDS) {
        if (existing[field] !== undefined) merged[field] = existing[field];
      }
      deduped[existingIndex] = merged;
      const mergedCandidates = buildImportedUrlCompareCandidates(merged.url);
      mergedCandidates.forEach((candidate) => candidateToIndex.set(candidate, existingIndex));
    });
    return deduped;
  }

  function normalizeImportedItems(rawItems) {
    const list = coerceArray(rawItems);
    const normalized = [];
    list.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const normalizedUrl = normalizeImportedUrl(entry.url);
      if (!normalizedUrl) return;
      normalized.push({ ...entry, url: normalizedUrl });
    });
    return dedupeImportedItems(normalized);
  }

  const api = {
    IMPORT_TRACKING_QUERY_PARAM_KEYS,
    coerceArray,
    parseUrlLenient,
    isAllowedImportedProtocol,
    normalizeImportedUrl,
    extractYouTubeVideoId,
    normalizeImportedUrlForCompare,
    buildImportedUrlCompareCandidates,
    dedupeImportedItems,
    normalizeImportedItems
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope && typeof globalScope === "object") {
    globalScope.LocalPocketImportCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
