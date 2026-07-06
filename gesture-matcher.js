(function () {
  "use strict";

  // ================================================================
  // GestureMatcher — dua mod pengesanan:
  //   1. "dir"   — 8-arah sequence (lama, untuk gesture ↓→ ↑← dll)
  //   2. "shape" — $1 Unistroke Recognizer (untuk bentuk M, C, U, V, Z dll)
  // ================================================================

  // ── 8 arah standard ─────────────────────────────────────────────
  const DIR = {
    R:  "→",
    DR: "↘",
    D:  "↓",
    DL: "↙",
    L:  "←",
    UL: "↖",
    U:  "↑",
    UR: "↗",
  };
  const DIR_LIST = [DIR.R, DIR.DR, DIR.D, DIR.DL, DIR.L, DIR.UL, DIR.U, DIR.UR];

  function vectorDirectionDifference(v1x, v1y, v2x, v2y) {
    const a = Math.atan2(v2y, v2x) - Math.atan2(v1y, v1x);
    if (a >  Math.PI) return a - 2 * Math.PI;
    if (a <= -Math.PI) return a + 2 * Math.PI;
    return a;
  }

  function getDistance(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  }

  function vectorToDirection(vx, vy) {
    let deg = Math.atan2(vy, vx) * 180 / Math.PI;
    if (deg < 0) deg += 360;
    return DIR_LIST[Math.round(deg / 45) % 8];
  }

  function patternToDirectionString(pattern, dedup) {
    if (!pattern || pattern.length === 0) return "";
    const dirs = pattern.map(v => vectorToDirection(v[0], v[1]));
    if (!dedup) return dirs.join("");
    return dirs.filter((d, i) => i === 0 || d !== dirs[i - 1]).join("");
  }

  function matchPatterns(drawn, stored) {
    if (!drawn || !stored || !drawn.length || !stored.length) return false;
    const a = patternToDirectionString(drawn,  true);
    const b = patternToDirectionString(stored, true);
    return a === b && a.length > 0;
  }

  // ── PatternConstructor (Gesturefy port) ─────────────────────────
  class PatternConstructor {
    constructor(differenceThreshold = 0.5, distanceThreshold = 10) {
      this.differenceThreshold = differenceThreshold;
      this.distanceThreshold   = distanceThreshold;
      this.clear();
    }

    clear() {
      this._lEx  = null;
      this._lEy  = null;
      this._px   = null;
      this._py   = null;
      this._lx   = null;
      this._ly   = null;
      this._pvx  = null;
      this._pvy  = null;
      this._vecs = [];
    }

    addPoint(x, y) {
      let change = 0;
      if (this._px === null) {
        this._lEx = x; this._lEy = y;
        this._px  = x; this._py  = y;
      } else {
        const nvx = x - this._px;
        const nvy = y - this._py;
        const d   = Math.hypot(nvx, nvy);
        if (d > this.distanceThreshold) {
          if (this._pvx === null) {
            this._pvx = nvx; this._pvy = nvy;
          } else {
            const diff = vectorDirectionDifference(this._pvx, this._pvy, nvx, nvy);
            if (Math.abs(diff) > this.differenceThreshold) {
              this._vecs.push([this._px - this._lEx, this._py - this._lEy]);
              this._pvx = nvx; this._pvy = nvy;
              this._lEx = this._px; this._lEy = this._py;
              change++;
            }
          }
          this._px = x; this._py = y;
          change++;
        }
      }
      this._lx = x; this._ly = y;
      return change;
    }

    getPattern() {
      if (this._lx === null || this._lEx === null) return [];
      return [...this._vecs, [this._lx - this._lEx, this._ly - this._lEy]];
    }
  }

  PatternConstructor.PASSED_NO_THRESHOLD = 0;
  PatternConstructor.PASSED_DISTANCE_THRESHOLD = 1;
  PatternConstructor.PASSED_DIFFERENCE_THRESHOLD = 2;

  // ================================================================
  // $1 Unistroke Recognizer (Wobbrock, Wilson & Li, 2007)
  // Diubahsuai untuk: simpan sebagai titik {x,y}[], tanpa template nama
  // Membolehkan pengesanan bentuk bebas: M, C, U, V, Z, spiral, dll
  // ================================================================

  const NUM_POINTS = 64;    // bilangan titik untuk resample
  const SQUARE_SIZE = 250;  // saiz kotak normalisasi
  const ORIGIN = { x: 0, y: 0 };
  const DIAGONAL = Math.sqrt(SQUARE_SIZE * SQUARE_SIZE + SQUARE_SIZE * SQUARE_SIZE);
  const HALF_DIAGONAL = 0.5 * DIAGONAL;
  const ANGLE_RANGE = Math.PI; // ±180°
  const ANGLE_PRECISION = Math.PI / 90; // 2°
  const PHI = 0.5 * (-1.0 + Math.sqrt(5.0)); // Golden Ratio

  // ── LRU Cache for gesture matching ─────────────────────────────────
  const MATCH_CACHE_SIZE = 50;
  const MATCH_CACHE_TTL = 300000; // 5 minutes
  const matchCache = new Map();

  function getCacheKey(pattern, algorithm, threshold) {
    // Create a hash key from pattern, algorithm, and threshold
    const patternStr = JSON.stringify(pattern);
    return `${patternStr}|${algorithm}|${threshold}`;
  }

  function getCachedMatch(key) {
    const entry = matchCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > MATCH_CACHE_TTL) {
      matchCache.delete(key);
      return null;
    }
    // Move to end (most recently used)
    matchCache.delete(key);
    matchCache.set(key, entry);
    return entry.result;
  }

  function setCachedMatch(key, result) {
    if (matchCache.size >= MATCH_CACHE_SIZE) {
      // Remove oldest entry (first in Map)
      const firstKey = matchCache.keys().next().value;
      matchCache.delete(firstKey);
    }
    matchCache.set(key, { result, timestamp: Date.now() });
  }

  function clearMatchCache() {
    matchCache.clear();
  }

  // Resample: agihkan semula titik secara seragam sepanjang laluan
  // Optimized with pre-allocated array
  function resample(points, n) {
    let I = pathLength(points) / (n - 1);
    let D = 0;
    const newpoints = new Array(n);
    newpoints[0] = { x: points[0].x, y: points[0].y };
    let newIdx = 1;
    for (let i = 1; i < points.length && newIdx < n; i++) {
      const d = dist(points[i - 1], points[i]);
      if ((D + d) >= I) {
        const qx = points[i - 1].x + ((I - D) / d) * (points[i].x - points[i - 1].x);
        const qy = points[i - 1].y + ((I - D) / d) * (points[i].y - points[i - 1].y);
        newpoints[newIdx++] = { x: qx, y: qy };
        points.splice(i, 0, { x: qx, y: qy });
        D = 0;
      } else {
        D += d;
      }
    }
    if (newIdx === n - 1) {
      newpoints[newIdx] = { x: points[points.length - 1].x, y: points[points.length - 1].y };
    }
    return newpoints.slice(0, newIdx);
  }

  // Pusingan berasaskan sudut centroid
  function indicativeAngle(points) {
    const c = centroid(points);
    return Math.atan2(c.y - points[0].y, c.x - points[0].x);
  }

  function rotateBy(points, radians) {
    const c = centroid(points);
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return points.map(p => ({
      x: (p.x - c.x) * cos - (p.y - c.y) * sin + c.x,
      y: (p.x - c.x) * sin + (p.y - c.y) * cos + c.y,
    }));
  }

  // Scale ke dalam kotak SQUARE_SIZE × SQUARE_SIZE
  function scaleTo(points, size) {
    const B = boundingBox(points);
    const scaledPoints = points.map(p => ({
      x: p.x * (size / Math.max(B.width, 1)),
      y: p.y * (size / Math.max(B.height, 1)),
    }));
    return scaledPoints;
  }

  // Pindahkan centroid ke origin
  function translateTo(points, pt) {
    const c = centroid(points);
    return points.map(p => ({
      x: p.x + pt.x - c.x,
      y: p.y + pt.y - c.y,
    }));
  }

  function distanceAtBestAngle(points, T, a, b, threshold) {
    let x1 = PHI * a + (1.0 - PHI) * b;
    let f1 = pathDistance(points, rotateBy(T, x1));
    let x2 = (1.0 - PHI) * a + PHI * b;
    let f2 = pathDistance(points, rotateBy(T, x2));
    while (Math.abs(b - a) > threshold) {
      if (f1 < f2) {
        b = x2;
        x2 = x1;
        f2 = f1;
        x1 = PHI * a + (1.0 - PHI) * b;
        f1 = pathDistance(points, rotateBy(T, x1));
      } else {
        a = x1;
        x1 = x2;
        f1 = f2;
        x2 = (1.0 - PHI) * a + PHI * b;
        f2 = pathDistance(points, rotateBy(T, x2));
      }
    }
    return Math.min(f1, f2);
  }

  function distanceAtAngle(points, T, radians) {
    const newpoints = rotateBy(T, radians);
    return pathDistance(points, newpoints);
  }

  function centroid(points) {
    let x = 0, y = 0;
    const len = points.length;
    for (let i = 0; i < len; i++) {
      const p = points[i];
      x += p.x;
      y += p.y;
    }
    return { x: x / len, y: y / len };
  }

  function boundingBox(points) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const len = points.length;
    for (let i = 0; i < len; i++) {
      const p = points[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  function pathDistance(pts1, pts2) {
    let d = 0;
    const n = Math.min(pts1.length, pts2.length);
    for (let i = 0; i < n; i++) d += dist(pts1[i], pts2[i]);
    return d / n;
  }

  function pathLength(points) {
    let d = 0;
    for (let i = 1; i < points.length; i++) d += dist(points[i - 1], points[i]);
    return d;
  }

  function dist(p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }

  /**
   * Normalize titik-titik untuk simpanan dan perbandingan:
   * resample → pusingan → scale → translate ke origin
   */
  function normalizePoints(rawPoints) {
    if (!rawPoints || rawPoints.length < 2) return null;
    let pts = rawPoints.map(p => ({ x: p.x, y: p.y }));
    pts = resample(pts, NUM_POINTS);
    const radians = indicativeAngle(pts);
    pts = rotateBy(pts, -radians);
    pts = scaleTo(pts, SQUARE_SIZE);
    pts = translateTo(pts, ORIGIN);
    return pts;
  }

  /**
   * Bandingkan dua set titik yang sudah dinormalize
   * Return skor 0.0–1.0 (1.0 = padanan sempurna)
   */
  function recognizeShape(candidatePoints, templatePoints) {
    if (!candidatePoints || !templatePoints) return 0;
    if (candidatePoints.length !== templatePoints.length) return 0;
    const d = distanceAtBestAngle(
      candidatePoints, templatePoints,
      -ANGLE_RANGE, ANGLE_RANGE, ANGLE_PRECISION
    );
    return 1.0 - d / HALF_DIAGONAL;
  }

  /**
   * Tukar titik-titik mentah (dari rekoder) → format simpanan shape
   * Format: { type: "shape", points: [{x,y},...] }
   */
  function rawPointsToShapeData(rawPoints) {
    const normalized = normalizePoints(rawPoints);
    if (!normalized) return null;
    return { type: "shape", points: normalized };
  }

  /**
   * Bandingkan gesture dilukis dengan template tersimpan
   * Threshold: skor > 0.80 dianggap padanan
   */
  function matchShapeGesture(drawnRawPoints, storedShapeData, threshold) {
    if (!drawnRawPoints || !storedShapeData || !storedShapeData.points) return false;
    const t = typeof threshold === "number" ? threshold : 0.80;
    const normalized = normalizePoints(drawnRawPoints);
    if (!normalized) return false;
    const score = recognizeShape(normalized, storedShapeData.points);
    return score >= t;
  }

  /**
   * Detect bentuk dan hasilkan label untuk paparan
   * Berdasarkan bounding box & ciri-ciri laluan
   */
  function detectShapeLabel(rawPoints) {
    if (!rawPoints || rawPoints.length < 3) return "?";
    // Bounding box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of rawPoints) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const W = maxX - minX, H = maxY - minY;
    if (W < 10 && H < 10) return "•";
    return "bentuk bebas";
  }

  // ================================================================
  // Gesturefy-compatible matching algorithms
  // Port dari Gesturefy 3.2.18: patternSimilarityByProportion + patternSimilarityByDTW
  // ================================================================

  /**
   * vectorDirectionDifferenceNorm — perbezaan arah dua vektor
   * Julat: (-1, 1], 0 = sama arah, 1 = bertentangan
   * (Gesturefy commons.mjs vectorDirectionDifference)
   */
  function vectorDirectionDifferenceNorm(v1x, v1y, v2x, v2y) {
    let a = Math.atan2(v1x, v1y) - Math.atan2(v2x, v2y);
    if (a > Math.PI) a -= 2 * Math.PI;
    else if (a <= -Math.PI) a += 2 * Math.PI;
    return a / Math.PI;
  }

  /**
   * patternMagnitude — jumlah panjang semua vektor dalam pattern
   */
  function patternMagnitude(pattern) {
    return pattern.reduce((total, v) => total + Math.hypot(v[0], v[1]), 0);
  }

  /**
   * patternSimilarityByProportion
   * Bandingkan dua pattern mengikut kadar panjang relatif setiap segmen.
   * Julat: 0 (sempurna) → 1 (berbeza sepenuhnya)
   * Port tepat dari Gesturefy matching-algorithms.mjs
   */
  function patternSimilarityByProportion(patternA, patternB) {
    if (!patternA.length || !patternB.length) return 1;
    const totalA = patternMagnitude(patternA);
    const totalB = patternMagnitude(patternB);
    if (totalA === 0 || totalB === 0) return 1;

    let totalDiff = 0;
    let a = 0, b = 0;
    let propStartA = 0, propStartB = 0;

    while (a < patternA.length && b < patternB.length) {
      const vA = patternA[a], vB = patternB[b];
      const magA = Math.hypot(vA[0], vA[1]);
      const magB = Math.hypot(vB[0], vB[1]);
      const propA = magA / totalA;
      const propB = magB / totalB;
      const propEndA = propStartA + propA;
      const propEndB = propStartB + propB;

      // Overlap antara dua segmen
      const overlap = Math.max(0, Math.min(propEndA, propEndB) - Math.max(propStartA, propStartB));

      const diff = Math.abs(vectorDirectionDifferenceNorm(vA[0], vA[1], vB[0], vB[1]));
      totalDiff += diff * overlap;

      if (propEndA > propEndB) {
        b++;
        propStartB = propEndB;
      } else if (propEndA < propEndB) {
        a++;
        propStartA = propEndA;
      } else {
        a++; b++;
        propStartA = propEndA;
        propStartB = propEndB;
      }
    }
    return totalDiff;
  }

  /**
   * patternSimilarityByDTW
   * Dynamic Time Warping — toleran terhadap variasi kelajuan melukis.
   * Julat: 0 (sempurna) → 1 (berbeza sepenuhnya)
   * Port tepat dari Gesturefy matching-algorithms.mjs
   */
  function patternSimilarityByDTW(patternA, patternB) {
    if (!patternA.length || !patternB.length) return 1;
    const rows = patternA.length;
    const cols = patternB.length;
    // Guna typed array untuk prestasi lebih baik
    const DTW = new Float32Array(rows * cols).fill(Infinity);
    const idx = (i, j) => i * cols + j;

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const cost = Math.abs(vectorDirectionDifferenceNorm(
          patternA[i][0], patternA[i][1],
          patternB[j][0], patternB[j][1]
        ));
        let prev = Infinity;
        if (i > 0 && j > 0) prev = Math.min(DTW[idx(i-1,j)], DTW[idx(i,j-1)], DTW[idx(i-1,j-1)]);
        else if (i > 0) prev = DTW[idx(i-1,j)];
        else if (j > 0) prev = DTW[idx(i,j-1)];
        else prev = 0;
        DTW[idx(i,j)] = cost + prev;
      }
    }
    return DTW[idx(rows-1, cols-1)] / Math.max(rows, cols);
  }

  /**
   * getClosestGestureByPattern
   * Cari gesture yang paling hampir dengan pattern yang dilukis.
   * algorithm: "strict" | "shape-independent" | "combined" (default)
   * maxDeviation: nilai maksimum perbezaan yang diterima
   * Mengembalikan mapping yang paling hampir, atau null jika tiada.
   * Port dari Gesturefy background.mjs getClosestGestureByPattern
   */
  function getClosestGestureByPattern(pattern, mappings, maxDeviation, algorithm) {
    if (!pattern || !pattern.length || !mappings || !mappings.length) return null;
    const dev = typeof maxDeviation === "number" ? maxDeviation : 0.15;
    const algo = algorithm || "combined";

    // Check cache first
    const cacheKey = getCacheKey(pattern, algo, dev);
    const cached = getCachedMatch(cacheKey);
    if (cached !== null) return cached;

    let best = null;

    if (algo === "strict") {
      let lowest = dev;
      for (const m of mappings) {
        if (!m.pattern || !m.pattern.length) continue;
        const diff = patternSimilarityByProportion(pattern, m.pattern);
        if (diff < lowest) {
          lowest = diff;
          best = m;
          // Early exit if perfect match found
          if (diff === 0) break;
        }
      }
    } else if (algo === "shape-independent") {
      let lowest = dev;
      for (const m of mappings) {
        if (!m.pattern || !m.pattern.length) continue;
        const diff = patternSimilarityByDTW(pattern, m.pattern);
        if (diff < lowest) {
          lowest = diff;
          best = m;
          // Early exit if perfect match found
          if (diff === 0) break;
        }
      }
    } else {
      // combined (default) — sama seperti Gesturefy
      let lowestCombined = Infinity;
      for (const m of mappings) {
        if (!m.pattern || !m.pattern.length) continue;
        const dtwDiff = patternSimilarityByDTW(pattern, m.pattern);
        if (dtwDiff > dev) continue; // pre-filter cepat
        const propDiff = patternSimilarityByProportion(pattern, m.pattern);
        const combined = dtwDiff + propDiff;
        if (combined < lowestCombined) {
          lowestCombined = combined;
          best = m;
          // Early exit if very good match found (combined < 0.1)
          if (combined < 0.1) break;
        }
      }
      // Pastikan combined score tidak melebihi had (2× maxDeviation untuk combined)
      if (best !== null) {
        const dtwCheck = patternSimilarityByDTW(pattern, best.pattern);
        if (dtwCheck > dev) best = null;
      }
    }
    // Cache the result
    setCachedMatch(cacheKey, best);
    return best;
  }

  // ── Exports ────────────────────────────────────────────────────
  window.GestureMatcher = {
    // Mode lama (8 arah)
    DIR,
    DIR_LIST,
    PatternConstructor,
    vectorDirectionDifference,
    getDistance,
    vectorToDirection,
    patternToDirectionString,
    matchPatterns,

    // Mode baru (bentuk bebas — $1 Recognizer)
    rawPointsToShapeData,
    matchShapeGesture,
    normalizePoints,
    recognizeShape,
    detectShapeLabel,
    NUM_POINTS,

    // Gesturefy-compatible matching (baru)
    patternSimilarityByProportion,
    patternSimilarityByDTW,
    getClosestGestureByPattern,
    vectorDirectionDifferenceNorm,
  };

})();
