/* global module */
(function attachLocalPocketCategoryAutoRuleCore(globalScope) {
  function coerceArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeRuleEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const pattern = entry.pattern ? String(entry.pattern).trim() : "";
    const category = entry.category ? String(entry.category).trim() : "";
    if (!pattern || !category) return null;
    return {
      pattern: pattern.slice(0, 160),
      category: category.slice(0, 120)
    };
  }

  function normalizeRules(value) {
    const entries = coerceArray(value);
    const normalized = [];
    const seen = new Set();
    entries.forEach((entry) => {
      const rule = normalizeRuleEntry(entry);
      if (!rule) return;
      const key = `${rule.pattern.toLowerCase()}=>${rule.category.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      normalized.push(rule);
    });
    return normalized.slice(0, 100);
  }

  function getHostFromUrl(rawUrl) {
    try {
      return new URL(String(rawUrl || "")).hostname.toLowerCase().replace(/^\.+|\.+$/g, "");
    } catch (err) {
      return "";
    }
  }

  function normalizeDomainPattern(value) {
    let raw = String(value || "").trim().toLowerCase();
    if (!raw) return "";
    if (!raw.startsWith("http://") && !raw.startsWith("https://") && !raw.startsWith("//")) {
      raw = `https://${raw}`;
    } else if (raw.startsWith("//")) {
      raw = `https:${raw}`;
    }
    let host = "";
    try {
      host = new URL(raw).hostname.toLowerCase();
    } catch (err) {
      const fallback = raw.replace(/^https?:\/\//, "");
      const slashIndex = fallback.indexOf("/");
      host = slashIndex >= 0 ? fallback.slice(0, slashIndex) : fallback;
    }
    host = host.replace(/^\.+|\.+$/g, "");
    if (host.startsWith("*.")) host = host.slice(2);
    return host;
  }

  function hostMatchesDomain(hostname, domainPattern) {
    const host = String(hostname || "").toLowerCase();
    const domain = normalizeDomainPattern(domainPattern);
    if (!host || !domain) return false;
    return host === domain || host.endsWith(`.${domain}`);
  }

  function parseRegexSource(rawSource) {
    const raw = String(rawSource || "").trim();
    if (!raw) return null;

    let source = raw;
    let flags = "i";
    if (raw.startsWith("/") && raw.lastIndexOf("/") > 0) {
      const boundary = raw.lastIndexOf("/");
      source = raw.slice(1, boundary);
      flags = raw.slice(boundary + 1) || "i";
    }
    try {
      return new RegExp(source, flags);
    } catch (err) {
      return null;
    }
  }

  function parseRuleConditionToken(token) {
    let raw = String(token || "").trim();
    if (!raw) return null;

    let invert = false;
    while (raw.startsWith("!")) {
      invert = !invert;
      raw = raw.slice(1).trim();
    }
    if (!raw) return null;

    let scope = "any";
    let needle = raw;
    const colonIndex = raw.indexOf(":");
    if (colonIndex > 0) {
      const maybeScope = raw.slice(0, colonIndex).trim().toLowerCase();
      if (["any", "url", "title", "site", "domain", "regex"].includes(maybeScope)) {
        scope = maybeScope;
        needle = raw.slice(colonIndex + 1).trim();
      }
    }
    if (!needle) return null;

    return { invert, scope, needle };
  }

  function parseRuleConditions(pattern) {
    const raw = String(pattern || "");
    return raw
      .split("&&")
      .map((part) => parseRuleConditionToken(part))
      .filter(Boolean);
  }

  function isAsciiWordChar(char) {
    return /^[a-z0-9]$/i.test(String(char || ""));
  }

  function isSimpleWordNeedle(value) {
    return /^[a-z0-9]+$/i.test(String(value || ""));
  }

  function hasWholeWordMatch(haystack, needle) {
    const source = String(haystack || "");
    const target = String(needle || "");
    if (!source || !target) return false;

    let index = source.indexOf(target);
    while (index >= 0) {
      const before = index > 0 ? source.charAt(index - 1) : "";
      const afterIndex = index + target.length;
      const after = afterIndex < source.length ? source.charAt(afterIndex) : "";
      if (!isAsciiWordChar(before) && !isAsciiWordChar(after)) {
        return true;
      }
      index = source.indexOf(target, index + 1);
    }
    return false;
  }

  function matchTextWithSmartWordBoundary(haystack, needle, options = {}) {
    const source = String(haystack || "");
    const target = String(needle || "");
    if (!source || !target) return false;
    if (!source.includes(target)) return false;

    const shouldUseWordBoundary = options.wordBoundaryForShortToken === true
      && target.length <= 3
      && isSimpleWordNeedle(target);
    if (!shouldUseWordBoundary) return true;
    return hasWholeWordMatch(source, target);
  }

  function buildCandidateContext(candidate) {
    const safe = candidate && typeof candidate === "object" ? candidate : {};
    const url = safe.url ? String(safe.url) : "";
    const title = safe.title ? String(safe.title) : "";
    const siteName = safe.siteName ? String(safe.siteName) : "";
    const host = getHostFromUrl(url);
    const anyText = `${url}\n${title}\n${siteName}\n${host}`;

    return {
      url,
      title,
      siteName,
      host,
      anyText,
      urlLower: url.toLowerCase(),
      titleLower: title.toLowerCase(),
      siteLower: siteName.toLowerCase(),
      hostLower: host.toLowerCase(),
      anyLower: anyText.toLowerCase()
    };
  }

  function normalizeCategoryKey(value) {
    return value ? String(value).trim().toLowerCase() : "";
  }

  function tokenizeNeedle(value) {
    return String(value || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter(Boolean);
  }

  function scoreTextNeedle(needle) {
    const raw = String(needle || "").trim();
    if (!raw) return 0;
    const tokens = tokenizeNeedle(raw);
    let score = Math.min(raw.length, 18);
    if (tokens.length > 1) {
      score += Math.min((tokens.length - 1) * 7, 21);
    }
    if (tokens.some((token) => token.length >= 8)) {
      score += 6;
    }
    if (tokens.length === 1 && tokens[0] && tokens[0].length <= 3) {
      score += 8;
    }
    return score;
  }

  function scoreConditionSpecificity(condition) {
    if (!condition) return 0;
    const needle = String(condition.needle || "").trim();
    if (!needle) return 0;
    if (condition.scope === "domain") {
      const domain = normalizeDomainPattern(needle);
      if (!domain) return 0;
      const labels = domain.split(".").filter(Boolean);
      return labels.length * 6 + Math.min(domain.length, 14);
    }
    if (condition.scope === "regex") {
      const regex = parseRegexSource(needle);
      const source = regex ? regex.source : needle;
      return 14 + Math.min(source.length, 22);
    }
    if (condition.scope === "url") {
      let score = scoreTextNeedle(needle);
      if (needle.includes("/")) score += 8;
      if (needle.includes("?") || needle.includes("=")) score += 4;
      return score;
    }
    if (condition.scope === "site") {
      return scoreTextNeedle(needle) + 4;
    }
    return scoreTextNeedle(needle);
  }

  function scoreRuleCondition(condition) {
    if (!condition) return 0;
    const baseScoreByScope = {
      any: 18,
      url: 28,
      title: 40,
      site: 24,
      domain: 20,
      regex: 42
    };
    const scope = baseScoreByScope[condition.scope] ? condition.scope : "any";
    const score = baseScoreByScope[scope] + scoreConditionSpecificity(condition);
    if (!condition.invert) return score;
    return Math.max(8, Math.round(score * 0.45));
  }

  function scoreMatchedRuleConditions(conditions) {
    const list = Array.isArray(conditions) ? conditions : [];
    if (!list.length) return 0;

    let score = 0;
    let positiveCount = 0;
    let invertCount = 0;
    let hasDomain = false;
    let hasTitle = false;
    let hasUrl = false;
    let hasRegex = false;

    list.forEach((condition) => {
      score += scoreRuleCondition(condition);
      if (condition.invert) {
        invertCount += 1;
      } else {
        positiveCount += 1;
      }
      hasDomain = hasDomain || condition.scope === "domain";
      hasTitle = hasTitle || condition.scope === "title";
      hasUrl = hasUrl || condition.scope === "url";
      hasRegex = hasRegex || condition.scope === "regex";
    });

    if (positiveCount > 1) {
      score += (positiveCount - 1) * 12;
    }
    if (invertCount > 0) {
      score += invertCount * 4;
    }
    if (hasDomain && hasTitle) {
      score += 10;
    }
    if (hasTitle && hasUrl) {
      score += 6;
    }
    if (hasRegex) {
      score += 6;
    }
    return score;
  }

  function compareRuleMatchEntries(a, b) {
    if ((b && b.score) !== (a && a.score)) {
      return (b && b.score ? b.score : 0) - (a && a.score ? a.score : 0);
    }
    const aConditions = a && Array.isArray(a.conditions) ? a.conditions.length : 0;
    const bConditions = b && Array.isArray(b.conditions) ? b.conditions.length : 0;
    if (bConditions !== aConditions) return bConditions - aConditions;
    return (a && typeof a.index === "number" ? a.index : 0)
      - (b && typeof b.index === "number" ? b.index : 0);
  }

  function buildRuleMatchEntry(rule, context, index) {
    if (!rule || typeof rule !== "object") return null;
    const conditions = parseRuleConditions(rule.pattern);
    if (!conditions.length) return null;
    for (const condition of conditions) {
      if (!matchRuleCondition(condition, context)) {
        return null;
      }
    }
    return {
      rule,
      conditions,
      score: scoreMatchedRuleConditions(conditions),
      index: typeof index === "number" ? index : 0,
      normalizedCategory: normalizeCategoryKey(rule.category)
    };
  }

  function matchRuleCondition(condition, context) {
    if (!condition || !context) return false;
    let matched = false;
    const needleLower = String(condition.needle || "").toLowerCase();

    if (condition.scope === "url") {
      matched = context.urlLower.includes(needleLower);
    } else if (condition.scope === "title") {
      matched = matchTextWithSmartWordBoundary(context.titleLower, needleLower, {
        wordBoundaryForShortToken: true
      });
    } else if (condition.scope === "site") {
      matched = context.siteLower.includes(needleLower) || context.hostLower.includes(needleLower);
    } else if (condition.scope === "domain") {
      matched = hostMatchesDomain(context.host, condition.needle);
    } else if (condition.scope === "regex") {
      const regex = parseRegexSource(condition.needle);
      matched = !!(regex && regex.test(context.anyText));
    } else {
      matched = matchTextWithSmartWordBoundary(context.anyLower, needleLower, {
        wordBoundaryForShortToken: true
      });
    }

    return condition.invert ? !matched : matched;
  }

  function ruleMatchesCandidate(rule, candidate) {
    if (!rule || typeof rule !== "object") return false;
    const conditions = parseRuleConditions(rule.pattern);
    if (!conditions.length) return false;
    const context = buildCandidateContext(candidate);
    for (const condition of conditions) {
      if (!matchRuleCondition(condition, context)) {
        return false;
      }
    }
    return true;
  }

  function rankMatchingRules(rules, candidate) {
    const normalizedRules = normalizeRules(rules);
    if (!normalizedRules.length) return [];
    const context = buildCandidateContext(candidate);
    const matches = [];
    normalizedRules.forEach((rule, index) => {
      const entry = buildRuleMatchEntry(rule, context, index);
      if (entry) matches.push(entry);
    });
    matches.sort(compareRuleMatchEntries);
    return matches;
  }

  function compareCategoryMatches(a, b) {
    if ((b && b.score) !== (a && a.score)) {
      return (b && b.score ? b.score : 0) - (a && a.score ? a.score : 0);
    }
    if ((b && b.bestRuleScore) !== (a && a.bestRuleScore)) {
      return (b && b.bestRuleScore ? b.bestRuleScore : 0)
        - (a && a.bestRuleScore ? a.bestRuleScore : 0);
    }
    if ((b && b.matchedRuleCount) !== (a && a.matchedRuleCount)) {
      return (b && b.matchedRuleCount ? b.matchedRuleCount : 0)
        - (a && a.matchedRuleCount ? a.matchedRuleCount : 0);
    }
    return (a && typeof a.firstMatchedRuleIndex === "number" ? a.firstMatchedRuleIndex : 0)
      - (b && typeof b.firstMatchedRuleIndex === "number" ? b.firstMatchedRuleIndex : 0);
  }

  const IMPORTANT_SHORT_CATEGORY_TOKENS = new Set([
    "ai",
    "pc",
    "ui",
    "ux",
    "diy",
    "3d",
    "2d"
  ]);

  const CATEGORY_CONTEXT_STOP_WORDS = new Set([
    "a",
    "an",
    "and",
    "by",
    "for",
    "from",
    "how",
    "in",
    "of",
    "on",
    "or",
    "the",
    "to",
    "with"
  ]);

  const CATEGORY_CONTEXT_GENERIC_NAMES = new Set([
    "default",
    "general",
    "misc",
    "miscellaneous",
    "other",
    "uncategorized"
  ]);

  const CATEGORY_CONTEXT_ALIASES = {
    ai: ["artificial intelligence", "machine learning", "llm", "gpt", "chatgpt", "claude", "gemini", "copilot"],
    audiobook: ["audio book", "audible", "narrated"],
    diy: ["do it yourself", "how to make", "step by step"],
    drama: ["tv series", "series", "film"],
    guitar: ["chord", "fingerstyle", "acoustic guitar"],
    health: ["wellness", "medical", "nutrition"],
    islam: ["quran", "hadith", "muslim", "tafsir"],
    movies: ["movie", "film", "cinema"],
    music: ["song", "album", "playlist"],
    pc: ["computer", "desktop", "windows", "laptop"],
    wallpaper: ["background", "4k wallpaper"],
    wiki: ["wikipedia"]
  };

  const CATEGORY_STARTER_RULE_HINTS = {
    ai: {
      domains: ["chatgpt.com", "claude.ai", "gemini.google.com"],
      titles: ["artificial intelligence", "machine learning", "llm"]
    },
    "anime/manga": {
      domains: ["myanimelist.net", "anilist.co", "mangadex.org"],
      titles: ["anime", "manga", "manhwa"]
    },
    audiobook: {
      domains: ["audible.com", "librivox.org", "storytel.com"],
      titles: ["audiobook", "audio book"]
    },
    "better memory": {
      titles: ["memory palace", "mnemonic", "spaced repetition"]
    },
    "brain/think": {
      titles: ["critical thinking", "mental model", "reasoning"]
    },
    coin: {
      domains: ["coindesk.com", "cointelegraph.com"],
      titles: ["bitcoin", "crypto", "altcoin"]
    },
    diy: {
      domains: ["instructables.com"],
      titles: ["diy", "do it yourself", "how to make"]
    },
    health: {
      domains: ["healthline.com", "mayoclinic.org"],
      titles: ["wellness", "medical", "nutrition"]
    },
    indo: {
      domains: ["kompas.com", "detik.com"],
      titles: ["indonesia", "indonesian"]
    },
    islam: {
      domains: ["quran.com", "sunnah.com", "islamqa.info"],
      titles: ["quran", "hadith", "tafsir"]
    },
    "learn 2 learn": {
      titles: ["learning how to learn", "metacognition", "study technique"]
    },
    "learning by game": {
      titles: ["game-based learning", "gamification"]
    },
    malaysia: {
      domains: ["bharian.com.my", "astroawani.com"],
      titles: ["malaysia", "malaysian"]
    },
    masak: {
      domains: ["allrecipes.com", "cookpad.com"],
      titles: ["recipe", "resepi", "cooking"]
    },
    "movies/drama": {
      domains: ["imdb.com", "letterboxd.com", "rottentomatoes.com"],
      titles: ["movie", "film", "drama"]
    },
    "music/guitar": {
      domains: ["ultimate-guitar.com", "songsterr.com"],
      titles: ["guitar", "fingerstyle", "chord"]
    },
    pc: {
      domains: ["pcpartpicker.com", "tomshardware.com"],
      titles: ["pc build", "computer", "windows"]
    },
    "self improvement": {
      titles: ["self improvement", "productivity", "discipline"]
    },
    "tech/factory": {
      domains: ["automationworld.com", "controleng.com"],
      titles: ["manufacturing", "industrial automation", "factory"]
    },
    wallpaper: {
      domains: ["wallhaven.cc"],
      titles: ["wallpaper", "background 4k"]
    },
    wiki: {
      domains: ["wikipedia.org", "wikidata.org"],
      sites: ["wikipedia", "wikidata"]
    }
  };

  const CATEGORY_STARTER_FALLBACK_SKIP = new Set([
    "aa",
    "belajar",
    "fakta",
    "hiburan",
    "knowledge",
    "other",
    "self improvement 2",
    "uncategorized"
  ]);

  function buildCategoryContextProfile(categoryName) {
    const normalizedName = normalizeCategoryKey(categoryName).replace(/\s+/g, " ").trim();
    if (!normalizedName || CATEGORY_CONTEXT_GENERIC_NAMES.has(normalizedName)) {
      return {
        category: "",
        normalizedCategory: "",
        primaryPhrases: [],
        aliasPhrases: [],
        primaryTokens: [],
        aliasTokens: []
      };
    }

    const primaryPhraseSet = new Set([normalizedName]);
    normalizedName
      .split(/[\/|,&]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => primaryPhraseSet.add(part));

    const primaryTokenSet = new Set();
    normalizedName
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter(Boolean)
      .forEach((token) => {
        if (CATEGORY_CONTEXT_STOP_WORDS.has(token)) return;
        if (token.length <= 2 && !IMPORTANT_SHORT_CATEGORY_TOKENS.has(token)) return;
        primaryTokenSet.add(token);
      });

    const aliasPhraseSet = new Set();
    const aliasTokenSet = new Set();
    const aliasSources = [
      ...Array.from(primaryPhraseSet),
      ...Array.from(primaryTokenSet)
    ];
    aliasSources.forEach((source) => {
      const aliases = Array.isArray(CATEGORY_CONTEXT_ALIASES[source])
        ? CATEGORY_CONTEXT_ALIASES[source]
        : [];
      aliases.forEach((alias) => {
        const normalizedAlias = normalizeCategoryKey(alias).replace(/\s+/g, " ").trim();
        if (!normalizedAlias || primaryPhraseSet.has(normalizedAlias)) return;
        aliasPhraseSet.add(normalizedAlias);
        normalizedAlias
          .split(/[^a-z0-9]+/i)
          .map((token) => token.trim())
          .filter(Boolean)
          .forEach((token) => {
            if (CATEGORY_CONTEXT_STOP_WORDS.has(token)) return;
            if (token.length <= 2 && !IMPORTANT_SHORT_CATEGORY_TOKENS.has(token)) return;
            if (!primaryTokenSet.has(token)) aliasTokenSet.add(token);
          });
      });
    });

    return {
      category: String(categoryName || "").trim(),
      normalizedCategory: normalizedName,
      primaryPhrases: Array.from(primaryPhraseSet),
      aliasPhrases: Array.from(aliasPhraseSet),
      primaryTokens: Array.from(primaryTokenSet),
      aliasTokens: Array.from(aliasTokenSet)
    };
  }

  function normalizeHintList(values, options = {}) {
    const list = Array.isArray(values) ? values : [];
    const normalized = [];
    const seen = new Set();
    const maxItems = Number.isFinite(options.maxItems) ? options.maxItems : Infinity;
    list.forEach((value) => {
      if (normalized.length >= maxItems) return;
      const candidate = normalizeCategoryKey(value).replace(/\s+/g, " ").trim();
      if (!candidate || seen.has(candidate)) return;
      seen.add(candidate);
      normalized.push(candidate);
    });
    return normalized;
  }

  function buildRuleKey(pattern, category) {
    return `${normalizeCategoryKey(pattern)}=>${normalizeCategoryKey(category)}`;
  }

  function addStarterRule(list, seen, pattern, category) {
    const normalizedPattern = String(pattern || "").trim();
    const normalizedCategory = String(category || "").trim();
    if (!normalizedPattern || !normalizedCategory) return false;
    const key = buildRuleKey(normalizedPattern, normalizedCategory);
    if (seen.has(key)) return false;
    seen.add(key);
    list.push({ pattern: normalizedPattern, category: normalizedCategory });
    return true;
  }

  function sortHintValues(values) {
    return normalizeHintList(values).sort((a, b) => {
      if (b.length !== a.length) return b.length - a.length;
      return a.localeCompare(b);
    });
  }

  function shouldGenerateFallbackRuleForCategory(profile) {
    if (!profile || !profile.normalizedCategory) return false;
    if (CATEGORY_CONTEXT_GENERIC_NAMES.has(profile.normalizedCategory)) return false;
    if (CATEGORY_STARTER_FALLBACK_SKIP.has(profile.normalizedCategory)) return false;
    if (/^\w{1,2}$/.test(profile.normalizedCategory) && !IMPORTANT_SHORT_CATEGORY_TOKENS.has(profile.normalizedCategory)) {
      return false;
    }
    return true;
  }

  function buildStarterRuleCandidatesForCategory(category) {
    const categoryName = category && category.name ? String(category.name).trim() : "";
    const profile = buildCategoryContextProfile(categoryName);
    if (!profile.normalizedCategory) return [];

    const starterHints = CATEGORY_STARTER_RULE_HINTS[profile.normalizedCategory] || null;
    const rules = [];
    const seen = new Set();

    if (starterHints) {
      sortHintValues(starterHints.domains).slice(0, 3).forEach((domain) => {
        addStarterRule(rules, seen, `domain:${domain}`, profile.category);
      });
      sortHintValues(starterHints.sites).slice(0, 2).forEach((site) => {
        addStarterRule(rules, seen, `site:${site}`, profile.category);
      });
      sortHintValues(starterHints.titles).slice(0, 3).forEach((title) => {
        addStarterRule(rules, seen, `title:${title}`, profile.category);
      });
    }

    if (!shouldGenerateFallbackRuleForCategory(profile)) {
      return rules.slice(0, 4);
    }

    const fallbackPhrases = profile.primaryPhrases
      .filter((phrase) => phrase !== profile.normalizedCategory)
      .concat(profile.normalizedCategory)
      .sort((a, b) => {
        if (b.length !== a.length) return b.length - a.length;
        return a.localeCompare(b);
      });
    fallbackPhrases.slice(0, 2).forEach((phrase) => {
      addStarterRule(rules, seen, `title:${phrase}`, profile.category);
    });

    profile.primaryTokens
      .slice()
      .sort((a, b) => {
        if (b.length !== a.length) return b.length - a.length;
        return a.localeCompare(b);
      })
      .slice(0, 2)
      .forEach((token) => {
        if (token === profile.normalizedCategory) return;
        addStarterRule(rules, seen, `title:${token}`, profile.category);
      });

    profile.aliasPhrases
      .slice()
      .sort((a, b) => {
        if (b.length !== a.length) return b.length - a.length;
        return a.localeCompare(b);
      })
      .slice(0, 1)
      .forEach((phrase) => {
        addStarterRule(rules, seen, `title:${phrase}`, profile.category);
      });

    return rules.slice(0, 4);
  }

  function generateStarterRules(categories, existingRules) {
    const existing = normalizeRules(existingRules);
    const merged = existing.slice();
    const generatedRules = [];
    const seen = new Set(merged.map((rule) => buildRuleKey(rule.pattern, rule.category)));
    const usedCategories = [];
    const skippedCategories = [];

    const list = Array.isArray(categories) ? categories : [];
    list.forEach((category) => {
      const categoryName = category && category.name ? String(category.name).trim() : "";
      if (!categoryName) return;
      const candidates = buildStarterRuleCandidatesForCategory(category);
      if (!candidates.length) {
        skippedCategories.push(categoryName);
        return;
      }
      let addedForCategory = 0;
      candidates.forEach((rule) => {
        if (merged.length >= 100) return;
        if (addStarterRule(merged, seen, rule.pattern, rule.category)) {
          generatedRules.push(rule);
          addedForCategory += 1;
        }
      });
      if (addedForCategory > 0) {
        usedCategories.push(categoryName);
      } else {
        skippedCategories.push(categoryName);
      }
    });

    return {
      rules: normalizeRules(merged),
      generatedRules: normalizeRules(generatedRules),
      addedCount: generatedRules.length,
      usedCategories,
      skippedCategories
    };
  }

  function addCategoryContextSignal(signals, seen, type, value, score) {
    const normalizedValue = String(value || "").trim();
    if (!normalizedValue || !Number.isFinite(score) || score <= 0) return 0;
    const key = `${type}:${normalizedValue}`;
    if (seen.has(key)) return 0;
    seen.add(key);
    signals.push({ type, value: normalizedValue, score });
    return score;
  }

  function matchSoftCategoryText(haystack, needle) {
    return matchTextWithSmartWordBoundary(haystack, needle, {
      wordBoundaryForShortToken: true
    });
  }

  function scoreCategoryContextProfile(profile, context) {
    if (!profile || !context || !profile.normalizedCategory) return null;
    const signals = [];
    const seen = new Set();
    let score = 0;

    profile.primaryPhrases.forEach((phrase) => {
      if (matchSoftCategoryText(context.titleLower, phrase)) {
        score += addCategoryContextSignal(signals, seen, "title-phrase", phrase, 30);
      }
      if (matchSoftCategoryText(context.siteLower, phrase)) {
        score += addCategoryContextSignal(signals, seen, "site-phrase", phrase, 18);
      }
      if (matchSoftCategoryText(context.hostLower, phrase)) {
        score += addCategoryContextSignal(signals, seen, "host-phrase", phrase, 20);
      }
      if (matchSoftCategoryText(context.urlLower, phrase)) {
        score += addCategoryContextSignal(signals, seen, "url-phrase", phrase, 14);
      }
    });

    profile.aliasPhrases.forEach((phrase) => {
      if (matchSoftCategoryText(context.titleLower, phrase)) {
        score += addCategoryContextSignal(signals, seen, "title-alias", phrase, 18);
      }
      if (matchSoftCategoryText(context.siteLower, phrase)) {
        score += addCategoryContextSignal(signals, seen, "site-alias", phrase, 12);
      }
      if (matchSoftCategoryText(context.hostLower, phrase)) {
        score += addCategoryContextSignal(signals, seen, "host-alias", phrase, 14);
      }
      if (matchSoftCategoryText(context.urlLower, phrase)) {
        score += addCategoryContextSignal(signals, seen, "url-alias", phrase, 10);
      }
    });

    profile.primaryTokens.forEach((token) => {
      if (matchSoftCategoryText(context.titleLower, token)) {
        score += addCategoryContextSignal(signals, seen, "title-token", token, 12);
      }
      if (matchSoftCategoryText(context.siteLower, token)) {
        score += addCategoryContextSignal(signals, seen, "site-token", token, 8);
      }
      if (matchSoftCategoryText(context.hostLower, token)) {
        score += addCategoryContextSignal(signals, seen, "host-token", token, 8);
      }
      if (matchSoftCategoryText(context.urlLower, token)) {
        score += addCategoryContextSignal(signals, seen, "url-token", token, 6);
      }
    });

    profile.aliasTokens.forEach((token) => {
      if (matchSoftCategoryText(context.titleLower, token)) {
        score += addCategoryContextSignal(signals, seen, "title-alias-token", token, 8);
      }
      if (matchSoftCategoryText(context.siteLower, token)) {
        score += addCategoryContextSignal(signals, seen, "site-alias-token", token, 5);
      }
      if (matchSoftCategoryText(context.hostLower, token)) {
        score += addCategoryContextSignal(signals, seen, "host-alias-token", token, 5);
      }
      if (matchSoftCategoryText(context.urlLower, token)) {
        score += addCategoryContextSignal(signals, seen, "url-alias-token", token, 4);
      }
    });

    if (signals.length > 1) {
      score += Math.min((signals.length - 1) * 4, 12);
    }
    if (score < 18) return null;

    return {
      category: profile.category,
      normalizedCategory: profile.normalizedCategory,
      score,
      matchedSignals: signals
    };
  }

  function rankCategoryMatches(rules, candidate) {
    const matches = rankMatchingRules(rules, candidate);
    if (!matches.length) return [];

    const byCategory = new Map();
    matches.forEach((entry) => {
      if (!entry.normalizedCategory) return;
      if (!byCategory.has(entry.normalizedCategory)) {
        byCategory.set(entry.normalizedCategory, []);
      }
      byCategory.get(entry.normalizedCategory).push(entry);
    });

    const ranked = [];
    byCategory.forEach((entries, normalizedCategory) => {
      const ordered = entries.slice().sort(compareRuleMatchEntries);
      const bestEntry = ordered[0];
      const supportScore = ordered
        .slice(1)
        .reduce((sum, entry) => sum + Math.round(entry.score * 0.35), 0);
      ranked.push({
        category: bestEntry.rule.category,
        normalizedCategory,
        score: bestEntry.score + supportScore + Math.max(0, ordered.length - 1) * 6,
        bestRule: bestEntry.rule,
        bestRuleScore: bestEntry.score,
        matchedRules: ordered.map((entry) => entry.rule),
        matchedRuleCount: ordered.length,
        firstMatchedRuleIndex: bestEntry.index
      });
    });
    ranked.sort(compareCategoryMatches);
    return ranked;
  }

  function findBestCategoryMatch(rules, candidate) {
    const ranked = rankCategoryMatches(rules, candidate);
    return ranked.length ? ranked[0] : null;
  }

  function rankCategoryNameMatches(categories, candidate) {
    const list = Array.isArray(categories) ? categories : [];
    if (!list.length) return [];
    const context = buildCandidateContext(candidate);
    const ranked = [];
    list.forEach((category, index) => {
      const profile = buildCategoryContextProfile(category && category.name ? category.name : "");
      const match = scoreCategoryContextProfile(profile, context);
      if (!match) return;
      ranked.push({
        ...match,
        index
      });
    });
    ranked.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((b.matchedSignals ? b.matchedSignals.length : 0) !== (a.matchedSignals ? a.matchedSignals.length : 0)) {
        return (b.matchedSignals ? b.matchedSignals.length : 0)
          - (a.matchedSignals ? a.matchedSignals.length : 0);
      }
      return (typeof a.index === "number" ? a.index : 0) - (typeof b.index === "number" ? b.index : 0);
    });
    return ranked;
  }

  function rankResolvedCategoryMatches(rules, categories, candidate) {
    const explicitMatches = rankCategoryMatches(rules, candidate);
    const implicitMatches = rankCategoryNameMatches(categories, candidate);
    const merged = new Map();

    explicitMatches.forEach((entry) => {
      if (!entry.normalizedCategory) return;
      merged.set(entry.normalizedCategory, {
        category: entry.category,
        normalizedCategory: entry.normalizedCategory,
        score: entry.score,
        explicitScore: entry.score,
        contextScore: 0,
        bestRule: entry.bestRule,
        bestRuleScore: entry.bestRuleScore,
        matchedRules: entry.matchedRules,
        matchedRuleCount: entry.matchedRuleCount,
        contextSignals: [],
        firstMatchedRuleIndex: entry.firstMatchedRuleIndex
      });
    });

    implicitMatches.forEach((entry) => {
      if (!entry.normalizedCategory) return;
      if (!merged.has(entry.normalizedCategory)) {
        merged.set(entry.normalizedCategory, {
          category: entry.category,
          normalizedCategory: entry.normalizedCategory,
          score: 0,
          explicitScore: 0,
          contextScore: 0,
          bestRule: null,
          bestRuleScore: 0,
          matchedRules: [],
          matchedRuleCount: 0,
          contextSignals: [],
          firstMatchedRuleIndex: Number.MAX_SAFE_INTEGER
        });
      }
      const current = merged.get(entry.normalizedCategory);
      current.category = current.category || entry.category;
      current.contextScore = entry.score;
      current.contextSignals = entry.matchedSignals || [];
    });

    const ranked = Array.from(merged.values());
    ranked.forEach((entry) => {
      if (entry.explicitScore > 0) {
        entry.score = Math.round((entry.explicitScore * 1.6) + (entry.contextScore * 0.45));
      } else {
        entry.score = entry.contextScore;
      }
    });
    ranked.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.explicitScore !== a.explicitScore) return b.explicitScore - a.explicitScore;
      if (b.contextScore !== a.contextScore) return b.contextScore - a.contextScore;
      if (b.bestRuleScore !== a.bestRuleScore) return b.bestRuleScore - a.bestRuleScore;
      if (b.matchedRuleCount !== a.matchedRuleCount) return b.matchedRuleCount - a.matchedRuleCount;
      return a.firstMatchedRuleIndex - b.firstMatchedRuleIndex;
    });
    return ranked;
  }

  function findResolvedCategoryMatch(rules, categories, candidate) {
    const ranked = rankResolvedCategoryMatches(rules, categories, candidate);
    return ranked.length ? ranked[0] : null;
  }

  function findMatchingRule(rules, candidate) {
    const bestCategory = findBestCategoryMatch(rules, candidate);
    return bestCategory ? bestCategory.bestRule : null;
  }

  const api = {
    normalizeRules,
    ruleMatchesCandidate,
    rankMatchingRules,
    rankCategoryMatches,
    rankCategoryNameMatches,
    generateStarterRules,
    findBestCategoryMatch,
    rankResolvedCategoryMatches,
    findResolvedCategoryMatch,
    findMatchingRule
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope && typeof globalScope === "object") {
    globalScope.LocalPocketCategoryAutoRuleCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
