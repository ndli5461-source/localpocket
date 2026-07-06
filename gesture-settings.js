(function () {
  "use strict";

  // ── Semua tindakan yang boleh di-assign ──────────────────────────
  const ACTIONS = [
    { id: "open-category-picker",           label: "Buka / Tutup Category Picker",        group: "Picker" },
    { id: "picker-new-category",            label: "Picker: Tambah kategori baru",         group: "Picker" },
    { id: "picker-delete-category",         label: "Picker: Padam kategori",              group: "Picker" },
    { id: "picker-toggle-favorites",        label: "Picker: Togol filter Favourite",       group: "Picker" },
    { id: "toggle-pin-picker",              label: "Picker: Pin / nyahpin panel",          group: "Picker" },
    { id: "toggle-auto-page-turn",          label: "Picker: Togol auto page-turn",         group: "Picker" },
    { id: "open-first-item",                label: "Buka item pertama",                   group: "Navigasi" },
    { id: "open-random-item",               label: "Buka item rawak",                     group: "Navigasi" },
    { id: "toggle-random-across-all",       label: "Togol rawak semua kategori 🌐🎲",     group: "Navigasi" },
    { id: "cycle-category",                 label: "Kategori seterusnya",                 group: "Navigasi" },
    { id: "cycle-category-prev",            label: "Kategori sebelumnya",                 group: "Navigasi" },
    { id: "picker-next-item",               label: "Global: buka link seterusnya",        group: "Navigasi" },
    { id: "picker-random-item",             label: "Global: buka link rawak",             group: "Navigasi" },
    { id: "toggle-nav-favorites-only",      label: "Togol navigasi Favourite sahaja ⭐",  group: "Navigasi" },
    { id: "save-to-local-pocket",           label: "Simpan / arkib halaman semasa",       group: "Simpan" },
    { id: "save-current-tab-favorite",      label: "Simpan halaman ke Favourite",         group: "Simpan" },
    { id: "quick-capture-link",           label: "Simpan Link/Thumbnail disasarkan (Quick Capture) 📌", group: "Simpan" },
    { id: "picker-save-all-tabs",           label: "Simpan semua tab terbuka",            group: "Simpan" },
    { id: "export-backup",                  label: "Eksport backup ke JSON ⬆️",           group: "Simpan" },
    { id: "open-ai-sidebar",                label: "Buka / tutup AI Sidebar",             group: "AI" },
    { id: "toggle-ai-overlay",              label: "Togol AI Overlay (tetingkap terapung)",group: "AI" },
    { id: "picker-youtube-summary",         label: "Summary AI (halaman/YouTube)",        group: "AI" },
    { id: "open-summary-history-page",      label: "Buka sejarah ringkasan AI",           group: "AI" },
    { id: "open-firefox-native-ai-sidebar", label: "Buka Firefox Native AI Sidebar",     group: "AI" },
    { id: "cycle-ai-provider",              label: "Tukar provider AI (ChatGPT→Claude→...)",group: "AI" },
    { id: "toggle-notes-overlay",           label: "Togol panel Nota",                   group: "Nota" },
    { id: "toggle-pomodoro-overlay",        label: "Togol Pomodoro Timer 🍅",           group: "Timer" },
    { id: "open-trash",                     label: "Buka tong sampah 🗑️",               group: "Pengurusan" },
    { id: "scan-duplicates",                label: "Imbas & buang link pendua 👯",        group: "Pengurusan" },
    { id: "toggle-delete-after-open",       label: "Togol padam link selepas buka ♻️",   group: "Pengurusan" },
    { id: "toggle-auto-next",               label: "Togol Auto-Next YouTube ⏭️",          group: "Pengurusan" },
    { id: "toggle-auto-random",             label: "Togol Auto-Random YouTube 🔀",        group: "Pengurusan" },
    { id: "toggle-show-hidden-categories",  label: "Togol papar kategori tersembunyi 👁️",group: "Pengurusan" },
    { id: "toggle-rediscover",              label: "Togol Rediscover (jumpa semula link lama)",group: "Pengurusan" },
    { id: "toggle-floating-button",         label: "Togol butang terapung ON/OFF",        group: "Tetapan" },
    { id: "toggle-ai-selection",            label: "Togol AI button pada teks dipilih",   group: "Tetapan" },
    { id: "toggle-global-background-tab",   label: "Togol buka link dalam tab latar",     group: "Tetapan" },
    { id: "open-gesture-settings",          label: "Buka tetapan Gesture 🖱️",            group: "Tetapan" },
    { id: "picker-open-settings",           label: "Buka halaman Tetapan",               group: "Tetapan" },
    { id: "show-mini-categories",           label: "Togol senarai kategori mini 📂",     group: "Navigasi" },
    { id: "open-category-fullscreen",       label: "Pilih kategori (overlay penuh) 🗂️", group: "Navigasi" },
    { id: "show-category-scroller",         label: "Togol kategori scroller ↔️",          group: "Navigasi" },
    { id: "set-thumbnail-from-image",      label: "Tukar thumbnail dari gambar 🖼️",      group: "Simpan" },
    { id: "open-link-save-category-chooser", label: "Buka pemilih kategori (simpan link) 📂", group: "Simpan" },
  ];

  // ── Preset gestures (mode arah — simple, 1–2 arah) ─────────────
  const PRESETS = [
    { name: "Buka Picker",       pattern: [[0,100]],            action: "open-category-picker",         dir: "↓" },
    { name: "Item Pertama",      pattern: [[100,0]],            action: "open-first-item",              dir: "→" },
    { name: "Item Rawak",        pattern: [[-100,0]],           action: "open-random-item",             dir: "←" },
    { name: "Rawak Semua 🌐",   pattern: [[-100,0],[100,0]],   action: "toggle-random-across-all",     dir: "←→" },
    { name: "Simpan",            pattern: [[0,-100]],           action: "save-to-local-pocket",         dir: "↑" },
    { name: "Kategori Depan",    pattern: [[0,100],[100,0]],    action: "cycle-category",               dir: "↓→" },
    { name: "Kategori Belakang", pattern: [[0,100],[-100,0]],   action: "cycle-category-prev",          dir: "↓←" },
    { name: "Nota",              pattern: [[100,0],[0,100]],    action: "toggle-notes-overlay",         dir: "→↓" },
    { name: "AI Sidebar",        pattern: [[0,-100],[-100,0]],  action: "open-ai-sidebar",              dir: "↑←" },
    { name: "AI Overlay",        pattern: [[0,-100],[100,0]],   action: "toggle-ai-overlay",            dir: "↑→" },
    { name: "Simpan Fav",        pattern: [[0,-100],[0,-100]],  action: "save-current-tab-favorite",    dir: "↑↑" },
    { name: "Tetapan",           pattern: [[0,100],[0,100]],    action: "picker-open-settings",         dir: "↓↓" },
    { name: "Summary AI",        pattern: [[100,0],[-100,0]],   action: "picker-youtube-summary",       dir: "→←" },
    { name: "Tong Sampah",       pattern: [[-100,0],[0,100]],   action: "open-trash",                   dir: "←↓" },
    { name: "Imbas Pendua",      pattern: [[-100,0],[0,-100]],  action: "scan-duplicates",              dir: "←↑" },
    { name: "Delete-After-Open", pattern: [[100,0],[0,-100]],   action: "toggle-delete-after-open",     dir: "→↑" },
    { name: "Auto-Next YT",      pattern: [[0,-100],[0,100]],   action: "toggle-auto-next",             dir: "↑↓" },
    { name: "Fav Sahaja",        pattern: [[0,100],[100,0],[100,0]], action: "toggle-nav-favorites-only", dir: "↓→→" },
    { name: "Eksport Backup",    pattern: [[100,0],[100,0],[0,-100]], action: "export-backup",           dir: "→→↑" },
    { name: "Pilih Kategori 🗂️", pattern: [[-100,0],[-100,0]],      action: "open-category-fullscreen", dir: "←←" },
  ];

  // ── State ────────────────────────────────────────────────────────
  const GM = window.GestureMatcher || null;
  let mappings   = [];
  let editingId  = null;
  let currentPattern  = [];   // untuk mode "dir" — [[vx,vy],...]
  let currentRawPts   = [];   // untuk mode "shape" — [{x,y},...]
  let currentShapeData = null;// { type:"shape", points:[...normalized] }
  let currentMode = "dir";    // "dir" atau "shape"
  let isRecording    = false;
  let recordPoints   = [];

  // ── DOM refs ─────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const gestureEnabledToggle      = $("gestureEnabledToggle");
  const gestureMouseButtonSel     = $("gestureMouseButton");
  const gestureDistSlider         = $("gestureDistanceThreshold");
  const gestureDistLabel          = $("gestureDistanceLabel");
  const gestureTraceColorInput    = $("gestureTraceColor");
  const gestureTraceWidthSlider   = $("gestureTraceWidth");
  const gestureTraceWidthLabel    = $("gestureTraceWidthLabel");
  const gestureTraceLineGrowthTog = $("gestureTraceLineGrowth");
  const gestureTimeoutToggle      = $("gestureTimeoutToggle");
  const gestureTimeoutRow         = $("gestureTimeoutRow");
  const gestureTimeoutSlider      = $("gestureTimeoutDuration");
  const gestureTimeoutLabel       = $("gestureTimeoutLabel");
  const gestureSuppressionKey     = $("gestureSuppressionKey");
  const gestureSmartSuppressionTog = $("gestureSmartSuppression");
  // Matching algorithm controls
  const gestureMatchingAlgoSel    = $("gestureMatchingAlgorithm");
  const gestureDeviationSlider    = $("gestureDeviationTolerance");
  const gestureDeviationLabel     = $("gestureDeviationLabel");
  const gestureDiffThreshSlider   = $("gestureDifferenceThreshold");
  const gestureDiffThreshLabel    = $("gestureDiffThreshLabel");
  // Command label controls
  const gestureCmdFontSizeInput   = $("gestureCommandFontSize");
  const gestureCmdFontColorInput  = $("gestureCommandFontColor");
  const gestureCmdBgColorInput    = $("gestureCommandBgColor");
  const gestureCmdBgOpacitySlider = $("gestureCommandBgOpacity");
  const gestureCmdBgOpacityLabel  = $("gestureCmdBgOpacityLabel");
  const gestureCmdPosXSlider      = $("gestureCommandPositionX");
  const gestureCmdPosXLabel       = $("gestureCmdPosXLabel");
  const gestureCmdPosYSlider      = $("gestureCommandPositionY");
  const gestureCmdPosYLabel       = $("gestureCmdPosYLabel");
  // Exclusions
  const gestureExclusionList      = $("gestureExclusionList");
  const gestureExclusionInput     = $("gestureExclusionInput");
  const gestureExclusionAddBtn    = $("gestureExclusionAddBtn");
  const gestureExcludeCurrentBtn  = $("gestureExcludeCurrentBtn");
  const gestureCurrentUrlEl       = $("gestureCurrentUrl");
  // Gesture list
  const gestureListEl          = $("gestureList");
  const gestureEmptyEl         = $("gestureEmpty");
  const gestureEditor          = $("gestureEditor");
  const gestEditAction         = $("gestEditAction");
  const gestEditName           = $("gestEditName");
  const gestModeDir             = $("gestModeDir");
  const gestModeShape           = $("gestModeShape");
  const gestShapeThreshRow      = $("gestShapeThreshRow");
  const gestShapeThreshSlider   = $("gestShapeThreshSlider");
  const gestShapeThreshLabel    = $("gestShapeThreshLabel");
  const gestCanvasWrap         = $("gestCanvasWrap");
  const gestCanvas             = $("gestCanvas");
  const gestCanvasHint         = $("gestCanvasHint");
  const gestStatus             = $("gestStatus");
  const gestClearBtn           = $("gestClearBtn");
  const gestTestBtn            = $("gestTestBtn");
  const gestSaveBtn            = $("gestSaveBtn");
  const gestCancelBtn          = $("gestCancelBtn");
  const gestAddBtn             = $("gestAddBtn");
  const gestResetBtn           = $("gestResetBtn");
  const gestUndoBtn            = $("gestUndoBtn");
  const gestExportBtn          = $("gestExportBtn");
  const gestImportBtn          = $("gestImportBtn");
  const gestImportFile         = $("gestImportFile");
  const gestEditCustomLabel    = $("gestEditCustomLabel");
  const presetGrid             = $("presetGrid");
  const backBtn                = $("backBtn");
  const saveStatusEl           = $("saveStatus");

  // State exclusions
  let exclusions = [];
  // Undo snapshot — simpan satu level undo
  let _undoSnapshot = null;

  // ── Helpers ──────────────────────────────────────────────────────
  function genId() { return "g_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,6); }

  function actionLabel(id) {
    const a = ACTIONS.find(x => x.id === id);
    return a ? a.label : id;
  }

  function setSaveStatus(msg, isError) {
    if (!saveStatusEl) return;
    saveStatusEl.textContent = msg || "";
    saveStatusEl.style.color = isError ? "#f87171" : "#4ade80";
  }

  function setStatus(msg, color) {
    if (!gestStatus) return;
    gestStatus.textContent = msg || "";
    gestStatus.style.color = color || "var(--muted)";
  }

  // Dapatkan threshold bentuk dari slider (0.60–0.98)
  function getShapeThreshold() {
    if (!gestShapeThreshSlider) return 0.80;
    return Number(gestShapeThreshSlider.value) / 100;
  }

  // ── Mode selector ────────────────────────────────────────────────
  function switchMode(mode) {
    currentMode = mode;
    // Reset state
    currentPattern   = [];
    currentRawPts    = [];
    currentShapeData = null;

    // Tunjuk/sembunyi threshold row (hanya untuk shape)
    if (gestShapeThreshRow) {
      gestShapeThreshRow.style.display = (mode === "shape") ? "" : "none";
    }
    // Kemas kini label hint kanvas
    if (gestCanvasHint) {
      if (mode === "shape") {
        gestCanvasHint.innerHTML = "✦ Lukis bentuk bebas di sini ✦<br>"
          + "<span style='font-size:12px;opacity:.7;'>M, C, U, V, Z atau apa sahaja — lepaskan untuk selesai</span>";
      } else {
        gestCanvasHint.innerHTML = "✦ Tahan &amp; lukis gesture di sini ✦<br>"
          + "<span style='font-size:12px;opacity:.7;'>Lepaskan untuk selesai</span>";
      }
      gestCanvasHint.style.display = "flex";
    }
    resizeCanvas();
    clearCanvas();
    if (gestSaveBtn) gestSaveBtn.disabled = true;
    if (gestTestBtn) gestTestBtn.disabled = true;
    setStatus(mode === "shape"
      ? "Mod Bentuk Bebas — lukis apa sahaja (M, C, U, V, Z...)"
      : "Mod Arah — lukis anak panah untuk tetapkan gesture.");
  }

  // ── Populate action <select> ─────────────────────────────────────
  function populateActionSelect(sel, selectedId) {
    if (!sel) return;
    sel.replaceChildren();
    const groups = {};
    for (const a of ACTIONS) {
      if (!groups[a.group]) groups[a.group] = [];
      groups[a.group].push(a);
    }
    for (const [grp, items] of Object.entries(groups)) {
      const og = document.createElement("optgroup");
      og.label = grp;
      for (const a of items) {
        const opt = document.createElement("option");
        opt.value = a.id;
        opt.textContent = a.label;
        if (a.id === selectedId) opt.selected = true;
        og.appendChild(opt);
      }
      sel.appendChild(og);
    }
  }

  // ── Canvas helpers ───────────────────────────────────────────────
  function resizeCanvas() {
    if (!gestCanvas || !gestCanvasWrap) return;
    const r = gestCanvasWrap.getBoundingClientRect();
    if (r.width < 10) return;
    gestCanvas.width  = Math.round(r.width);
    gestCanvas.height = Math.round(r.height);
  }

  function clearCanvas() {
    if (!gestCanvas) return;
    const ctx = gestCanvas.getContext("2d");
    const cw = gestCanvas.width, ch = gestCanvas.height;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = "#111118";
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    const gs = Math.round(cw / 12);
    for (let x = gs; x < cw; x += gs) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,ch); ctx.stroke(); }
    for (let y = gs; y < ch; y += gs) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(cw,y); ctx.stroke(); }
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.beginPath(); ctx.moveTo(cw/2,0); ctx.lineTo(cw/2,ch); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,ch/2); ctx.lineTo(cw,ch/2); ctx.stroke();
  }

  // Lukis semula pattern arah tersimpan
  function renderPatternOnCanvas(pattern) {
    if (!gestCanvas || !pattern || !pattern.length) return;
    clearCanvas();
    const ctx = gestCanvas.getContext("2d");
    const cw = gestCanvas.width, ch = gestCanvas.height;
    const traceColor = gestureTraceColorInput ? gestureTraceColorInput.value : "#e94560";
    const traceW = gestureTraceWidthSlider ? Number(gestureTraceWidthSlider.value) : 3;

    const pts = [{x:0,y:0}];
    for (const v of pattern) pts.push({x: pts[pts.length-1].x + v[0], y: pts[pts.length-1].y + v[1]});

    let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
    for (const p of pts) {
      if (p.x<minX) minX=p.x; if (p.x>maxX) maxX=p.x;
      if (p.y<minY) minY=p.y; if (p.y>maxY) maxY=p.y;
    }
    const pw = Math.max(maxX-minX,1), ph = Math.max(maxY-minY,1);
    const pad = Math.round(Math.min(cw,ch)*0.15);
    const scale = Math.min((cw-pad*2)/pw, (ch-pad*2)/ph);
    const ocx = (minX+maxX)/2, ocy = (minY+maxY)/2;
    const mapped = pts.map(p => ({
      x: (p.x-ocx)*scale + cw/2,
      y: (p.y-ocy)*scale + ch/2,
    }));

    ctx.fillStyle = traceColor;
    const growthDist = traceW * 50;
    let lastW = 0, prevX = mapped[0].x, prevY = mapped[0].y;
    for (let i = 1; i < mapped.length; i++) {
      const dx = mapped[i].x - prevX, dy = mapped[i].y - prevY;
      const dist = Math.hypot(dx, dy);
      const newW = Math.min(lastW + dist / growthDist * traceW, traceW);
      const path = createGrowingLinePath(prevX, prevY, mapped[i].x, mapped[i].y, lastW, newW);
      ctx.fill(path);
      lastW = newW; prevX = mapped[i].x; prevY = mapped[i].y;
    }

    ctx.beginPath(); ctx.arc(mapped[0].x, mapped[0].y, 5, 0, Math.PI*2);
    ctx.fillStyle = "#48d597"; ctx.fill();
    const lp = mapped[mapped.length-1];
    ctx.beginPath(); ctx.arc(lp.x, lp.y, 4, 0, Math.PI*2);
    ctx.fillStyle = "#f5a623"; ctx.fill();

    if (GM) {
      const dirStr = GM.patternToDirectionString(pattern, true);
      if (dirStr) {
        ctx.save();
        ctx.font = "bold 20px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const tw = ctx.measureText(dirStr).width + 16;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(cw/2 - tw/2, 4, tw, 28, 5);
        else ctx.rect(cw/2 - tw/2, 4, tw, 28);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillText(dirStr, cw/2, 9);
        ctx.restore();
      }
    }
  }

  // Lukis semula shape gesture dari titik raw tersimpan
  function renderShapeOnCanvas(rawPoints, label) {
    if (!gestCanvas || !rawPoints || rawPoints.length < 2) return;
    clearCanvas();
    const ctx = gestCanvas.getContext("2d");
    const cw = gestCanvas.width, ch = gestCanvas.height;
    const traceColor = gestureTraceColorInput ? gestureTraceColorInput.value : "#e94560";
    const traceW = gestureTraceWidthSlider ? Number(gestureTraceWidthSlider.value) : 3;

    // Scale & center
    let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
    for (const p of rawPoints) {
      if (p.x<minX) minX=p.x; if (p.x>maxX) maxX=p.x;
      if (p.y<minY) minY=p.y; if (p.y>maxY) maxY=p.y;
    }
    const pw = Math.max(maxX-minX,1), ph = Math.max(maxY-minY,1);
    const pad = Math.round(Math.min(cw,ch)*0.15);
    const sc = Math.min((cw-pad*2)/pw, (ch-pad*2)/ph);
    const ocx = (minX+maxX)/2, ocy = (minY+maxY)/2;
    const mapped = rawPoints.map(p => ({
      x: (p.x-ocx)*sc + cw/2,
      y: (p.y-ocy)*sc + ch/2,
    }));

    // Lukis laluan
    ctx.fillStyle = traceColor;
    const growthDist = traceW * 50;
    let lastW = 0, prevX = mapped[0].x, prevY = mapped[0].y;
    for (let i = 1; i < mapped.length; i++) {
      const dx = mapped[i].x - prevX, dy = mapped[i].y - prevY;
      const dist = Math.hypot(dx, dy);
      const newW = Math.min(lastW + dist / growthDist * traceW, traceW);
      ctx.fill(createGrowingLinePath(prevX, prevY, mapped[i].x, mapped[i].y, lastW, newW));
      lastW = newW; prevX = mapped[i].x; prevY = mapped[i].y;
    }

    // Titik mula & akhir
    ctx.beginPath(); ctx.arc(mapped[0].x, mapped[0].y, 5, 0, Math.PI*2);
    ctx.fillStyle = "#48d597"; ctx.fill();
    const lp = mapped[mapped.length-1];
    ctx.beginPath(); ctx.arc(lp.x, lp.y, 4, 0, Math.PI*2);
    ctx.fillStyle = "#f5a623"; ctx.fill();

    // Label "Bentuk Bebas" + nama (jika ada)
    const displayLabel = label || "✦ Bentuk Bebas";
    ctx.save();
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const tw = ctx.measureText(displayLabel).width + 16;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cw/2 - tw/2, 4, tw, 26, 5);
    else ctx.rect(cw/2 - tw/2, 4, tw, 26);
    ctx.fill();
    ctx.fillStyle = "#a78bfa";
    ctx.fillText(displayLabel, cw/2, 8);
    ctx.restore();
  }

  function createGrowingLinePath(x1,y1,x2,y2,sw,ew) {
    const dvx = x2-x1, dvy = y2-y1;
    const angle = Math.atan2(dvy, dvx) + Math.PI/2;
    const path = new Path2D();
    path.arc(x1, y1, (sw||0.1)/2, angle, angle+Math.PI);
    path.arc(x2, y2, (ew||0.1)/2, angle+Math.PI, angle);
    path.closePath();
    return path;
  }

  // ── SVG preview untuk kad gesture ───────────────────────────────
  function buildSvgPreview(m, W, H) {
    W = W || 64; H = H || 52;
    // Shape mode — guna rawPoints jika ada
    const pts = (m.gestureType === "shape" && m.rawPoints && m.rawPoints.length >= 2)
      ? m.rawPoints
      : null;
    const pattern = (!pts && m.pattern && m.pattern.length) ? m.pattern : null;

    if (!pts && !pattern) return "";

    let svgPts;
    if (pts) {
      svgPts = pts;
    } else {
      // Bina titik dari pattern
      const built = [{x:0,y:0}];
      for (const v of pattern) built.push({x:built[built.length-1].x+v[0], y:built[built.length-1].y+v[1]});
      svgPts = built;
    }

    let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
    for (const p of svgPts) { if(p.x<minX)minX=p.x; if(p.x>maxX)maxX=p.x; if(p.y<minY)minY=p.y; if(p.y>maxY)maxY=p.y; }
    const pw=Math.max(maxX-minX,1), ph=Math.max(maxY-minY,1);
    const pad=8, scale=Math.min((W-pad*2)/pw,(H-pad*2)/ph);
    const cx=(minX+maxX)/2, cy=(minY+maxY)/2;
    const mapPt = p => ({
      x: ((p.x-cx)*scale+W/2),
      y: ((p.y-cy)*scale+H/2),
    });
    const mapped = svgPts.map(mapPt);

    // Kurangkan bilangan titik untuk SVG (ambil setiap nth)
    const step = Math.max(1, Math.floor(mapped.length / 32));
    const reduced = mapped.filter((_, i) => i % step === 0 || i === mapped.length - 1);
    const d = reduced.map((p,i)=>(i===0?"M":"L")+p.x.toFixed(1)+","+p.y.toFixed(1)).join(" ");

    const last = mapped[mapped.length-1];
    const prev = mapped[Math.max(0, mapped.length-2)];
    const ang  = Math.atan2(last.y-prev.y, last.x-prev.x);
    const al   = 7;
    const ax1  = (last.x - al*Math.cos(ang-0.5)).toFixed(1);
    const ay1  = (last.y - al*Math.sin(ang-0.5)).toFixed(1);
    const ax2  = (last.x - al*Math.cos(ang+0.5)).toFixed(1);
    const ay2  = (last.y - al*Math.sin(ang+0.5)).toFixed(1);
    const lx   = last.x.toFixed(1), ly = last.y.toFixed(1);
    const sx   = mapped[0].x.toFixed(1), sy = mapped[0].y.toFixed(1);

    const strokeColor = gestureTraceColorInput ? gestureTraceColorInput.value : "#e94560";

    // Kira anggaran panjang path untuk stroke-dasharray animation
    let pathLen = 0;
    for (let i = 1; i < reduced.length; i++) {
      pathLen += Math.hypot(reduced[i].x - reduced[i-1].x, reduced[i].y - reduced[i-1].y);
    }
    pathLen = Math.ceil(pathLen) + 10;

    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`
      + `<path d="${d}" stroke="${strokeColor}" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"`
      + ` stroke-dasharray="${pathLen}" style="--path-len:${pathLen}"/>`
      + `<polyline points="${lx},${ly} ${ax1},${ay1}" stroke="#f5a623" stroke-width="2" stroke-linecap="round"/>`
      + `<polyline points="${lx},${ly} ${ax2},${ay2}" stroke="#f5a623" stroke-width="2" stroke-linecap="round"/>`
      + `<circle cx="${sx}" cy="${sy}" r="3" fill="#48d597"/>`
      + `</svg>`;
  }

  // ── Render senarai gesture ───────────────────────────────────────
  function renderList() {
    gestureListEl.replaceChildren();
    if (!mappings.length) {
      gestureEmptyEl.style.display = "block";
      return;
    }
    gestureEmptyEl.style.display = "none";

    for (const m of mappings) {
      const card = document.createElement("div");
      card.className = "gest-card";

      const preview = document.createElement("div");
      preview.className = "gest-card-preview";
      const svgStr = buildSvgPreview(m);
      if (svgStr) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgStr, "image/svg+xml");
        const svgEl = doc.documentElement;
        if (svgEl && svgEl.tagName && svgEl.tagName.toLowerCase() !== "parsererror") {
          preview.appendChild(document.adoptNode(svgEl));
        }
      }
      // Badge mod
      if (m.gestureType === "shape") {
        const badge = document.createElement("div");
        badge.style.cssText = "position:absolute;bottom:3px;right:4px;font-size:9px;color:#a78bfa;font-weight:700;letter-spacing:.5px;";
        badge.textContent = "BENTUK";
        preview.style.position = "relative";
        preview.appendChild(badge);
      }

      const body = document.createElement("div");
      body.className = "gest-card-body";

      const nameEl = document.createElement("div");
      nameEl.className = "gest-card-name";
      nameEl.textContent = (m.name && m.name !== "Gesture") ? m.name : actionLabel(m.action);

      const dirEl = document.createElement("div");
      dirEl.className = "gest-card-dir";
      if (m.gestureType === "shape") {
        dirEl.textContent = "✦ Bentuk Bebas";
        dirEl.style.color = "#a78bfa";
        dirEl.style.fontSize = ".85rem";
      } else {
        dirEl.textContent = GM ? GM.patternToDirectionString(m.pattern, true) : "";
      }

      const actEl = document.createElement("div");
      actEl.className = "gest-card-act";
      actEl.textContent = actionLabel(m.action);

      body.append(nameEl, dirEl, actEl);

      const btns = document.createElement("div");
      btns.className = "gest-card-btns";

      // Drag handle untuk reorder
      const dragHandle = document.createElement("span");
      dragHandle.textContent = "⠿";
      dragHandle.title = "Seret untuk susun semula";
      dragHandle.style.cssText = "cursor:grab;color:var(--muted);font-size:16px;padding:0 4px;user-select:none;touch-action:none;";
      dragHandle.draggable = false;

      const editBtn = document.createElement("button");
      editBtn.type = "button"; editBtn.className = "ghost"; editBtn.textContent = "✎";
      editBtn.title = "Edit"; editBtn.addEventListener("click", () => startEdit(m.id, card));

      const delBtn = document.createElement("button");
      delBtn.type = "button"; delBtn.className = "ghost danger"; delBtn.textContent = "✕";
      delBtn.title = "Padam"; delBtn.addEventListener("click", () => deleteMapping(m.id));

      btns.append(dragHandle, editBtn, delBtn);
      card.append(preview, body, btns);

      // ── Drag reorder ──────────────────────────────────────────────
      card.draggable = true;
      card.dataset.gestureId = m.id;
      dragHandle.addEventListener("mousedown", () => { card.draggable = true; });

      card.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", m.id);
        card.style.opacity = "0.4";
      });
      card.addEventListener("dragend", () => { card.style.opacity = ""; card.style.outline = ""; });
      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        card.style.outline = "2px solid var(--accent)";
      });
      card.addEventListener("dragleave", () => { card.style.outline = ""; });
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        card.style.outline = "";
        const fromId = e.dataTransfer.getData("text/plain");
        const toId = m.id;
        if (fromId === toId) return;
        const fromIdx = mappings.findIndex(x => x.id === fromId);
        const toIdx   = mappings.findIndex(x => x.id === toId);
        if (fromIdx < 0 || toIdx < 0) return;
        const [moved] = mappings.splice(fromIdx, 1);
        mappings.splice(toIdx, 0, moved);
        saveMappings();
        renderList();
        renderPresets();
      });

      gestureListEl.appendChild(card);
    }
  }

  // ── Render preset grid ───────────────────────────────────────────
  function renderPresets() {
    if (!presetGrid) return;
    presetGrid.replaceChildren();
    for (const p of PRESETS) {
      const used = mappings.some(m => m.gestureType !== "shape" && m.action === p.action
        && GM && GM.patternToDirectionString(m.pattern) === p.dir);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "preset-chip";
      if (used) chip.disabled = true;
      chip.title = p.name + " — " + actionLabel(p.action);

      const dspan = document.createElement("span");
      dspan.className = "pdir"; dspan.textContent = p.dir;
      const nspan = document.createElement("span");
      nspan.textContent = p.name;
      chip.append(dspan, nspan);

      if (!used) {
        chip.addEventListener("click", () => {
          mappings.push({ id: genId(), name: p.name, pattern: p.pattern.map(v=>[...v]), action: p.action });
          saveMappings();
          renderList();
          renderPresets();
          setStatus("✓ Preset '" + p.name + "' ditambah.", "#4ade80");
        });
      }
      presetGrid.appendChild(chip);
    }
  }

  // ── Editor ───────────────────────────────────────────────────────
  function openEditor(m, cardEl) {
    editingId = m ? m.id : null;
    // Sisip editor selepas kad yang diklik
    if (cardEl && cardEl.parentNode) {
      cardEl.parentNode.insertBefore(gestureEditor, cardEl.nextSibling);
    }
    gestureEditor.classList.add("open");
    gestureEditor.scrollIntoView({ behavior: "smooth", block: "start" });
    _openingEditor = true;
    populateActionSelect(gestEditAction, m ? m.action : ACTIONS[0].id);
    const defaultLabel = actionLabel(m ? m.action : ACTIONS[0].id);
    _lastDefaultLabel = defaultLabel;
    gestEditName.value = m ? m.name : defaultLabel;
    if (gestEditCustomLabel) gestEditCustomLabel.value = m && m.customLabel ? m.customLabel : defaultLabel;
    _openingEditor = false;

    // Tentukan mod berdasarkan mapping yang dimuatkan
    const mode = (m && m.gestureType === "shape") ? "shape" : "dir";
    currentMode = mode;
    currentPattern   = (m && m.pattern && mode === "dir") ? m.pattern.map(v=>[...v]) : [];
    currentRawPts    = (m && m.rawPoints && mode === "shape") ? m.rawPoints : [];
    currentShapeData = (m && m.shapeData && mode === "shape") ? m.shapeData : null;

    // Kemas kini radio button
    if (gestModeDir)   gestModeDir.checked   = (mode === "dir");
    if (gestModeShape) gestModeShape.checked = (mode === "shape");
    if (gestShapeThreshRow) gestShapeThreshRow.style.display = (mode === "shape") ? "" : "none";
    // Set threshold jika ada dalam mapping
    if (gestShapeThreshSlider && m && m.shapeThreshold) {
      gestShapeThreshSlider.value = String(Math.round(m.shapeThreshold * 100));
      if (gestShapeThreshLabel) gestShapeThreshLabel.textContent = Math.round(m.shapeThreshold * 100) + "%";
    }

    if (gestAddBtn) gestAddBtn.style.display = "none";
    setTimeout(() => {
      resizeCanvas();
      // Update hint ikut mode
      if (gestCanvasHint) {
        if (mode === "shape") {
          gestCanvasHint.innerHTML = "✦ Lukis bentuk bebas di sini ✦<br>"
            + "<span style='font-size:12px;opacity:.7;'>M, C, U, V, Z atau apa sahaja — lepaskan untuk selesai</span>";
        } else {
          gestCanvasHint.innerHTML = "✦ Tahan &amp; lukis gesture di sini ✦<br>"
            + "<span style='font-size:12px;opacity:.7;'>Lepaskan untuk selesai</span>";
        }
      }
      if (mode === "shape" && currentRawPts.length >= 2) {
        renderShapeOnCanvas(currentRawPts, m.name);
        if (gestCanvasHint) gestCanvasHint.style.display = "none";
        if (gestSaveBtn) gestSaveBtn.disabled = false;
        if (gestTestBtn) gestTestBtn.disabled = false;
        setStatus("Gesture bentuk bebas sedia. Lukis semula atau terus simpan.", "#4ade80");
      } else if (mode === "dir" && currentPattern.length) {
        renderPatternOnCanvas(currentPattern);
        if (gestCanvasHint) gestCanvasHint.style.display = "none";
        if (gestSaveBtn) gestSaveBtn.disabled = false;
        if (gestTestBtn) gestTestBtn.disabled = false;
        if (GM) setStatus("Gesture sedia: " + GM.patternToDirectionString(currentPattern, true), "#4ade80");
      } else {
        clearCanvas();
        if (gestCanvasHint) gestCanvasHint.style.display = "flex";
        if (gestSaveBtn) gestSaveBtn.disabled = true;
        if (gestTestBtn) gestTestBtn.disabled = true;
        setStatus(mode === "shape"
          ? "Lukis bentuk bebas pada kanvas (M, C, U, V, Z...)."
          : "Lukis gesture di kanvas di bawah.");
      }
    }, 30);
  }

  function closeEditor() {
    editingId = null;
    currentPattern   = [];
    currentRawPts    = [];
    currentShapeData = null;
    gestureEditor.classList.remove("open");
    // Kembalikan editor ke kedudukan asal (selepas senarai gesture)
    if (gestureEmptyEl && gestureEmptyEl.parentNode) {
      gestureEmptyEl.parentNode.insertBefore(gestureEditor, gestureEmptyEl.nextSibling);
    }
    if (gestAddBtn) gestAddBtn.style.display = "";
    setStatus("");
  }

  function startEdit(id, cardEl) {
    if (editingId === id && gestureEditor.classList.contains("open")) {
      closeEditor();
      return;
    }
    const m = mappings.find(x => x.id === id);
    if (!m) return;
    openEditor(m, cardEl);
  }

  function saveEdit() {
    const name = gestEditName.value.trim() || actionLabel(action);
    const action = gestEditAction.value;
    const customLabel = gestEditCustomLabel ? gestEditCustomLabel.value.trim() : "";
    if (!action) { setStatus("Sila pilih tindakan.", "#f87171"); return; }

    // Simpan undo snapshot sebelum save
    _undoSnapshot = mappings.map(m => ({ ...m }));
    if (gestUndoBtn) gestUndoBtn.disabled = false;

    if (currentMode === "shape") {
      // Mode bentuk bebas
      if (!currentShapeData || !currentRawPts.length) {
        setStatus("Sila lukis bentuk gesture dahulu.", "#f87171"); return;
      }
      const newMapping = {
        id: editingId || genId(),
        name,
        action,
        gestureType: "shape",
        shapeData: currentShapeData,
        rawPoints: currentRawPts,
        normalizedPoints: currentShapeData.points, // Cache normalized points for faster matching
        shapeThreshold: getShapeThreshold(),
        pattern: [],
      };
      if (customLabel) newMapping.customLabel = customLabel;
      if (editingId) {
        const idx = mappings.findIndex(x => x.id === editingId);
        if (idx >= 0) mappings[idx] = newMapping;
        else mappings.push(newMapping);
      } else {
        newMapping.id = genId();
        mappings.push(newMapping);
      }
      saveMappings();
      renderList();
      renderPresets();
      closeEditor();
      setSaveStatus("Disimpan.", false);
    } else {
      // Mode arah
      if (!currentPattern || currentPattern.length < 1) {
        setStatus("Sila lukis gesture dahulu.", "#f87171"); return;
      }
      const newDirStr = GM ? GM.patternToDirectionString(currentPattern, true) : "";

      // Exact string conflict (lama)
      const exactConflict = newDirStr && mappings.find(m =>
        m.id !== editingId && m.gestureType !== "shape"
        && GM && GM.patternToDirectionString(m.pattern, true) === newDirStr
      );
      if (exactConflict) {
        setStatus(`⚠ Gesture "${newDirStr}" sudah ada untuk "${actionLabel(exactConflict.action)}". Lukis arah yang berbeza.`, "#fbbf24");
        return;
      }

      // DTW conflict detection — amaran sahaja (bukan block)
      if (GM && GM.getClosestGestureByPattern) {
        const dirMappings = mappings.filter(m => m.id !== editingId && m.gestureType !== "shape" && m.pattern && m.pattern.length);
        const dtwClose = GM.getClosestGestureByPattern(currentPattern, dirMappings, 0.12, "combined");
        if (dtwClose) {
          const dtwDir = GM.patternToDirectionString(dtwClose.pattern, true);
          setStatus(`⚠ Mungkin terlalu mirip dengan "${dtwDir}" (${actionLabel(dtwClose.action)}). Simpan tetap atau lukis semula.`, "#f59e0b");
          // Biarkan user decide — jangan return, bagi chance klik Simpan lagi
          if (gestSaveBtn) gestSaveBtn.dataset.dtwWarned = "1";
          if (gestSaveBtn && gestSaveBtn.dataset.dtwWarned !== "confirmed") {
            gestSaveBtn.dataset.dtwWarned = "confirmed";
            return; // first click = warning, second click = proceed
          }
        }
      }
      if (gestSaveBtn) delete gestSaveBtn.dataset.dtwWarned;

      if (editingId) {
        const m = mappings.find(x => x.id === editingId);
        if (m) {
          m.name = name; m.action = action; m.pattern = currentPattern.slice();
          m.gestureType = "dir"; m.customLabel = customLabel || undefined;
          delete m.shapeData; delete m.rawPoints;
        }
      } else {
        const entry = { id: genId(), name, action, pattern: currentPattern.slice(), gestureType: "dir" };
        if (customLabel) entry.customLabel = customLabel;
        mappings.push(entry);
      }
      saveMappings();
      renderList();
      renderPresets();
      closeEditor();
      setSaveStatus("Disimpan.", false);
    }
  }

  async function deleteMapping(id) {
    _undoSnapshot = mappings.map(m => ({ ...m }));
    if (gestUndoBtn) gestUndoBtn.disabled = false;
    mappings = mappings.filter(m => m.id !== id);
    if (editingId === id) closeEditor();
    await saveMappings();
    renderList();
    renderPresets();
    setSaveStatus("Gesture dipadam.", false);
  }

  async function saveMappings() {
    try {
      await setSettings({ gestureActionMappings: mappings });
      setSaveStatus("Disimpan.", false);
    } catch(e) {
      setSaveStatus("Gagal menyimpan.", true);
    }
  }

  // ── Canvas recorder ──────────────────────────────────────────────
  function setupCanvasRecorder() {
    if (!gestCanvas) return;

    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => {
        resizeCanvas();
        if (currentMode === "shape" && currentRawPts.length >= 2) {
          renderShapeOnCanvas(currentRawPts);
        } else if (currentPattern.length) {
          renderPatternOnCanvas(currentPattern);
        } else {
          clearCanvas();
        }
      }).observe(gestCanvasWrap);
    }
    setTimeout(resizeCanvas, 60);

    const getXY = (e) => {
      const r = gestCanvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    let pc = null;
    const traceColor = () => gestureTraceColorInput ? gestureTraceColorInput.value : "#e94560";
    const traceW = () => gestureTraceWidthSlider ? Number(gestureTraceWidthSlider.value) : 3;
    // Fix 4: Ambil differenceThreshold dari settings semasa (Gesturefy default: 0.12)
    // supaya sensitivity kanvas rekod sama dengan masa execution
    const getDiffThreshold = () => {
      if (gestureDiffThreshSlider) return Number(gestureDiffThreshSlider.value) / 100;
      return 0.12;
    };

    let ctx = null;
    let lastPt = null;
    let lastTW  = 0;
    let debounceTimer = null;
    const DEBOUNCE_DELAY = 100; // ms

    gestCanvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (e.button !== 0) return;
      isRecording = true;

      // Reset ikut mod semasa
      if (currentMode === "shape") {
        currentRawPts = [];
        currentShapeData = null;
      } else {
        // Fix 4: Guna differenceThreshold dari settings (bukan hardcoded 0.5)
        if (GM) pc = new GM.PatternConstructor(getDiffThreshold(), 10);
        currentPattern = [];
      }
      recordPoints = [];

      const {x,y} = getXY(e);
      recordPoints.push({x,y});
      if (currentMode === "shape") {
        currentRawPts.push({x,y});
      } else if (pc) {
        pc.addPoint(x,y);
      }

      resizeCanvas();
      clearCanvas();
      if (gestCanvasHint) gestCanvasHint.style.display = "none";
      ctx = gestCanvas.getContext("2d");
      ctx.fillStyle = traceColor();
      lastPt = {x,y}; lastTW = 0;

      ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2);
      ctx.fillStyle = "#48d597"; ctx.fill();
      ctx.fillStyle = traceColor();

      gestSaveBtn.disabled = true;
      if (gestTestBtn) gestTestBtn.disabled = true;
      setStatus(currentMode === "shape" ? "Melukis bentuk..." : "Melukis...");
      try { gestCanvas.setPointerCapture(e.pointerId); } catch(_) {}
    });

    gestCanvas.addEventListener("pointermove", (e) => {
      if (!isRecording) return;
      const {x,y} = getXY(e);
      recordPoints.push({x,y});

      if (currentMode === "shape") {
        currentRawPts.push({x,y});
      } else if (pc) {
        pc.addPoint(x,y);
      }

      // Lukis trace
      if (ctx && lastPt) {
        const tw = traceW();
        const growthDist = tw * 50;
        const dist = Math.hypot(x - lastPt.x, y - lastPt.y);
        const newW = Math.min(lastTW + dist / growthDist * tw, tw);
        ctx.fillStyle = traceColor();
        ctx.fill(createGrowingLinePath(lastPt.x, lastPt.y, x, y, lastTW, newW));
        lastTW = newW;
      }
      lastPt = {x,y};

      // Update label status
      if (currentMode === "shape") {
        setStatus("Melukis bentuk... (" + currentRawPts.length + " titik)");
      } else if (pc && GM) {
        const cur = pc.getPattern();
        if (cur.length) {
          const dirStr = GM.patternToDirectionString(cur, false);
          setStatus("Melukis: " + dirStr);
          if (ctx) {
            const cw = gestCanvas.width, ch = gestCanvas.height;
            ctx.save();
            ctx.font = "bold 22px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            const tw2 = ctx.measureText(dirStr).width + 16;
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(cw/2 - tw2/2, 4, tw2, 30, 6) : ctx.rect(cw/2 - tw2/2, 4, tw2, 30);
            ctx.fill();
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            ctx.fillText(dirStr, cw/2, 10);
            ctx.restore();
          }
        }
      }
    });

    gestCanvas.addEventListener("pointerup", () => {
      if (!isRecording) return;
      isRecording = false;

      // Clear existing debounce timer
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      // Debounce gesture processing
      debounceTimer = setTimeout(() => {
        if (currentMode === "shape") {
          // Mode bentuk bebas — proses titik raw
          if (!currentRawPts || currentRawPts.length < 10) {
            setStatus("⚠ Lukisan terlalu pendek. Cuba lukis dengan lebih teliti.", "#f87171");
            clearCanvas();
            if (gestCanvasHint) gestCanvasHint.style.display = "flex";
            gestSaveBtn.disabled = true;
            return;
          }

          // Normalize dan simpan
          if (GM && GM.rawPointsToShapeData) {
            currentShapeData = GM.rawPointsToShapeData(currentRawPts);
          }

          if (!currentShapeData) {
            setStatus("⚠ Gagal memproses bentuk. Cuba lukis semula.", "#f87171");
            return;
          }

          // Render semula dengan versi scaled
          renderShapeOnCanvas(currentRawPts, "✦ Bentuk dirakam");
          gestSaveBtn.disabled = false;
          if (gestTestBtn) gestTestBtn.disabled = false;
          if (gestCanvasHint) gestCanvasHint.style.display = "none";
          setStatus("✓ Bentuk dirakam (" + currentRawPts.length + " titik) — Pilih tindakan dan klik Simpan.", "#4ade80");

        } else {
          // Mode arah (lama)
          let pattern = [];
          if (pc) pattern = pc.getPattern();

          if (!pattern || pattern.length < 1) {
            setStatus("⚠ Terlalu pendek atau lurus. Lukis dengan beberapa perubahan arah.", "#f87171");
            clearCanvas();
            if (gestCanvasHint) gestCanvasHint.style.display = "flex";
            gestSaveBtn.disabled = true;
            return;
          }

          currentPattern = pattern;
          renderPatternOnCanvas(pattern);
          gestSaveBtn.disabled = false;
          if (gestTestBtn) gestTestBtn.disabled = false;
          if (gestCanvasHint) gestCanvasHint.style.display = "none";

          const dirStr = GM ? GM.patternToDirectionString(pattern, true) : "";
          const conflict = dirStr && mappings.find(m =>
            m.id !== editingId && m.gestureType !== "shape"
            && GM && GM.patternToDirectionString(m.pattern, true) === dirStr
          );
          if (conflict) {
            setStatus(`⚠ Gesture "${dirStr}" sudah ada untuk "${actionLabel(conflict.action)}". Klik Simpan untuk ganti, atau lukis semula.`, "#fbbf24");
          } else {
            setStatus(`✓  ${dirStr || "Gesture dirakam"}  — Pilih tindakan dan klik Simpan.`, "#4ade80");
          }
        }
      }, DEBOUNCE_DELAY);
    });

    gestCanvas.addEventListener("pointercancel", () => {
      isRecording = false;
      if (pc) pc.clear();
      recordPoints = [];
      currentRawPts = [];
      clearCanvas();
      if (gestCanvasHint) gestCanvasHint.style.display = "flex";
      setStatus("");
      gestSaveBtn.disabled = true;
    });
  }

  // ── Load semua tetapan dari storage ─────────────────────────────
  async function loadAll() {
    try {
      const s = await getSettings();

      if (gestureEnabledToggle) gestureEnabledToggle.checked = s.gestureEnabled === true;
      if (gestureMouseButtonSel) gestureMouseButtonSel.value = s.gestureMouseButton || "right";
      
      // Disable toggle button if 'both' is selected
      if (gestureEnabledToggle && gestureMouseButtonSel) {
        const isBoth = gestureMouseButtonSel.value === "both";
        gestureEnabledToggle.disabled = isBoth;
      }
      if (gestureDistSlider) {
        gestureDistSlider.value = String(s.gestureDistanceThreshold || 10);
        if (gestureDistLabel) gestureDistLabel.textContent = (s.gestureDistanceThreshold || 10) + "px";
      }
      if (gestureTraceColorInput) gestureTraceColorInput.value = s.gestureTraceColor || "#e94560";
      if (gestureTraceWidthSlider) {
        gestureTraceWidthSlider.value = String(s.gestureTraceWidth || 3);
        if (gestureTraceWidthLabel) gestureTraceWidthLabel.textContent = String(s.gestureTraceWidth || 3);
      }
      const timeoutActive = s.gestureTimeoutActive === true;
      if (gestureTimeoutToggle) gestureTimeoutToggle.checked = timeoutActive;
      if (gestureTimeoutRow) gestureTimeoutRow.style.display = timeoutActive ? "" : "none";
      if (gestureTimeoutSlider) {
        gestureTimeoutSlider.value = String(s.gestureTimeoutDuration || 2);
        if (gestureTimeoutLabel) gestureTimeoutLabel.textContent = (s.gestureTimeoutDuration || 2) + "s";
      }
      if (gestureSuppressionKey) gestureSuppressionKey.value = s.gestureSuppressionKey || "";
      if (gestureSmartSuppressionTog) gestureSmartSuppressionTog.checked = s.gestureSmartSuppression !== false;

      // Trace lineGrowth
      if (gestureTraceLineGrowthTog) gestureTraceLineGrowthTog.checked = s.gestureTraceLineGrowth !== false;

      // Matching algorithm
      if (gestureMatchingAlgoSel) gestureMatchingAlgoSel.value = s.gestureMatchingAlgorithm || "combined";
      const devTol = typeof s.gestureDeviationTolerance === "number" ? s.gestureDeviationTolerance : 0.15;
      if (gestureDeviationSlider) {
        gestureDeviationSlider.value = String(Math.round(devTol * 100));
        if (gestureDeviationLabel) gestureDeviationLabel.textContent = devTol.toFixed(2);
      }
      const diffThresh = typeof s.gestureDifferenceThreshold === "number" ? s.gestureDifferenceThreshold : 0.12;
      if (gestureDiffThreshSlider) {
        gestureDiffThreshSlider.value = String(Math.round(diffThresh * 100));
        if (gestureDiffThreshLabel) gestureDiffThreshLabel.textContent = diffThresh.toFixed(2);
      }

      // Command label
      if (gestureCmdFontSizeInput) gestureCmdFontSizeInput.value = s.gestureCommandFontSize || "2.5vh";
      if (gestureCmdFontColorInput) gestureCmdFontColorInput.value = (s.gestureCommandFontColor || "#ffffff").slice(0, 7);
      if (gestureCmdBgColorInput) gestureCmdBgColorInput.value = (s.gestureCommandBgColor || "#000000b8").slice(0, 7);
      if (gestureCmdBgOpacitySlider) {
        const opVal = typeof s.gestureCommandBgOpacity === "number" ? s.gestureCommandBgOpacity : 72;
        gestureCmdBgOpacitySlider.value = String(opVal);
        if (gestureCmdBgOpacityLabel) gestureCmdBgOpacityLabel.textContent = opVal + "%";
      }
      if (gestureCmdPosXSlider) {
        gestureCmdPosXSlider.value = String(s.gestureCommandPositionX != null ? s.gestureCommandPositionX : 50);
        if (gestureCmdPosXLabel) gestureCmdPosXLabel.textContent = (s.gestureCommandPositionX != null ? s.gestureCommandPositionX : 50) + "%";
      }
      if (gestureCmdPosYSlider) {
        gestureCmdPosYSlider.value = String(s.gestureCommandPositionY != null ? s.gestureCommandPositionY : 92);
        if (gestureCmdPosYLabel) gestureCmdPosYLabel.textContent = (s.gestureCommandPositionY != null ? s.gestureCommandPositionY : 92) + "%";
      }

      // Exclusions
      exclusions = Array.isArray(s.gestureExclusions) ? [...s.gestureExclusions] : [];
      renderExclusions();

      // Tunjuk URL semasa (untuk butang "Kecualikan Laman Ini")
      if (gestureCurrentUrlEl) {
        try {
          const tabs = await api.tabs.query({ active: true, currentWindow: true });
          if (tabs && tabs[0] && tabs[0].url) {
            gestureCurrentUrlEl.textContent = tabs[0].url;
          }
        } catch (_) {
          // tabs API mungkin tidak tersedia dalam konteks ini
          if (gestureCurrentUrlEl) gestureCurrentUrlEl.textContent = "";
        }
      }

      mappings = Array.isArray(s.gestureActionMappings) ? s.gestureActionMappings : getDefaultMappings();
      if (!Array.isArray(s.gestureActionMappings)) {
        await setSettings({ gestureActionMappings: mappings });
      }

      // Fix nama "Gesture" lama → guna nama tindakan
      let needsSave = false;
      for (const m of mappings) {
        if (!m.name || m.name === "Gesture") {
          m.name = actionLabel(m.action);
          needsSave = true;
        }
        if (!m.customLabel) {
          m.customLabel = actionLabel(m.action);
          needsSave = true;
        }
      }
      
      // Migration: Add AI Sidebar gesture if missing and AI Overlay uses old pattern
      const hasAiSidebar = mappings.some(m => m.action === "open-ai-sidebar");
      const aiOverlay = mappings.find(m => m.action === "toggle-ai-overlay");
      if (!hasAiSidebar && aiOverlay) {
        const overlayPatternStr = JSON.stringify(aiOverlay.pattern);
        // Check if AI Overlay still uses old pattern [[0, -200], [0, 200], [0, 200]] (up-down)
        if (overlayPatternStr === JSON.stringify([[0, -200], [0, 200], [0, 200]])) {
          // Update AI Overlay to up-right and add AI Sidebar as up-left
          aiOverlay.pattern = [[0, -200], [200, 0], [200, 0]];
          mappings.push({
            id: genId(),
            name: "AI Sidebar",
            pattern: [[0, -200], [-200, 0], [-200, 0]],
            action: "open-ai-sidebar",
            gestureType: "dir"
          });
          needsSave = true;
        }
      }
      
      if (needsSave) await setSettings({ gestureActionMappings: mappings });

      renderList();
      renderPresets();
    } catch(e) {
      setSaveStatus("Gagal membaca tetapan.", true);
    }
  }

  // ── Render exclusion list ────────────────────────────────────────
  function renderExclusions() {
    if (!gestureExclusionList) return;
    gestureExclusionList.replaceChildren();
    if (!exclusions.length) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.style.cssText = "font-size:.82rem;opacity:.6;margin:0;";
      empty.textContent = "Tiada laman dikecualikan.";
      gestureExclusionList.appendChild(empty);
      return;
    }
    for (const pattern of exclusions) {
      const item = document.createElement("div");
      item.className = "exclusion-item";
      const span = document.createElement("span");
      span.textContent = pattern;
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "ghost danger";
      delBtn.textContent = "✕";
      delBtn.style.padding = "2px 8px";
      delBtn.addEventListener("click", async () => {
        exclusions = exclusions.filter(p => p !== pattern);
        await setSettings({ gestureExclusions: exclusions });
        renderExclusions();
        setSaveStatus("Disimpan.", false);
      });
      item.append(span, delBtn);
      gestureExclusionList.appendChild(item);
    }
  }

  function getDefaultMappings() {
    return PRESETS.slice(0, 8).map(p => ({
      id: genId(), name: p.name, pattern: p.pattern.map(v=>[...v]), action: p.action, gestureType: "dir",
    }));
  }

  // ── Event listeners ──────────────────────────────────────────────

  if (gestureEnabledToggle) {
    gestureEnabledToggle.addEventListener("change", async () => {
      await setSettings({ gestureEnabled: gestureEnabledToggle.checked, categoryPickerMouseGesture: gestureEnabledToggle.checked });
      setSaveStatus("Disimpan.", false);
    });
  }
  if (gestureMouseButtonSel) {
    gestureMouseButtonSel.addEventListener("change", async () => {
      const isBoth = gestureMouseButtonSel.value === "both";
      
      // Disable the toggle button when 'both' is selected to avoid conflicts
      // But keep gesture enabled - the gesture will still work with both buttons
      if (isBoth && gestureEnabledToggle) {
        gestureEnabledToggle.disabled = true;
      } else {
        // Re-enable toggle button when not using 'both'
        if (gestureEnabledToggle) {
          gestureEnabledToggle.disabled = false;
        }
      }
      await setSettings({ gestureMouseButton: gestureMouseButtonSel.value });
      setSaveStatus("Disimpan.", false);
    });
  }
  if (gestureDistSlider) {
    gestureDistSlider.addEventListener("input", async () => {
      if (gestureDistLabel) gestureDistLabel.textContent = gestureDistSlider.value + "px";
      await setSettings({ gestureDistanceThreshold: Number(gestureDistSlider.value) });
    });
  }
  if (gestureTraceColorInput) {
    gestureTraceColorInput.addEventListener("input", async () => {
      await setSettings({ gestureTraceColor: gestureTraceColorInput.value });
      if (currentMode === "shape" && currentRawPts.length) renderShapeOnCanvas(currentRawPts);
      else if (currentPattern.length) renderPatternOnCanvas(currentPattern);
    });
  }
  if (gestureTraceWidthSlider) {
    gestureTraceWidthSlider.addEventListener("input", async () => {
      if (gestureTraceWidthLabel) gestureTraceWidthLabel.textContent = gestureTraceWidthSlider.value;
      await setSettings({ gestureTraceWidth: Number(gestureTraceWidthSlider.value) });
      if (currentMode === "shape" && currentRawPts.length) renderShapeOnCanvas(currentRawPts);
      else if (currentPattern.length) renderPatternOnCanvas(currentPattern);
    });
  }
  if (gestureTimeoutToggle) {
    gestureTimeoutToggle.addEventListener("change", async () => {
      if (gestureTimeoutRow) gestureTimeoutRow.style.display = gestureTimeoutToggle.checked ? "" : "none";
      await setSettings({ gestureTimeoutActive: gestureTimeoutToggle.checked });
      setSaveStatus("Disimpan.", false);
    });
  }
  if (gestureTimeoutSlider) {
    gestureTimeoutSlider.addEventListener("input", async () => {
      if (gestureTimeoutLabel) gestureTimeoutLabel.textContent = gestureTimeoutSlider.value + "s";
      await setSettings({ gestureTimeoutDuration: Number(gestureTimeoutSlider.value) });
    });
  }
  if (gestureSuppressionKey) {
    gestureSuppressionKey.addEventListener("change", async () => {
      await setSettings({ gestureSuppressionKey: gestureSuppressionKey.value });
      setSaveStatus("Disimpan.", false);
    });
  }
  if (gestureSmartSuppressionTog) {
    gestureSmartSuppressionTog.addEventListener("change", async () => {
      await setSettings({ gestureSmartSuppression: gestureSmartSuppressionTog.checked });
      setSaveStatus("Disimpan.", false);
    });
  }

  // Trace lineGrowth toggle
  if (gestureTraceLineGrowthTog) {
    gestureTraceLineGrowthTog.addEventListener("change", async () => {
      await setSettings({ gestureTraceLineGrowth: gestureTraceLineGrowthTog.checked });
      setSaveStatus("Disimpan.", false);
    });
  }

  // Matching algorithm
  if (gestureMatchingAlgoSel) {
    gestureMatchingAlgoSel.addEventListener("change", async () => {
      await setSettings({ gestureMatchingAlgorithm: gestureMatchingAlgoSel.value });
      setSaveStatus("Disimpan.", false);
    });
  }
  if (gestureDeviationSlider) {
    gestureDeviationSlider.addEventListener("input", async () => {
      const val = Number(gestureDeviationSlider.value) / 100;
      if (gestureDeviationLabel) gestureDeviationLabel.textContent = val.toFixed(2);
      await setSettings({ gestureDeviationTolerance: val });
    });
  }
  if (gestureDiffThreshSlider) {
    gestureDiffThreshSlider.addEventListener("input", async () => {
      const val = Number(gestureDiffThreshSlider.value) / 100;
      if (gestureDiffThreshLabel) gestureDiffThreshLabel.textContent = val.toFixed(2);
      await setSettings({ gestureDifferenceThreshold: val });
      // Fix 4: Kemas kini pc semasa bila slider bergerak — supaya lukisan seterusnya guna nilai baru
      if (pc && GM) pc.differenceThreshold = val;
    });
  }

  // Command label listeners
  if (gestureCmdFontSizeInput) {
    gestureCmdFontSizeInput.addEventListener("change", async () => {
      await setSettings({ gestureCommandFontSize: gestureCmdFontSizeInput.value.trim() || "2.5vh" });
      setSaveStatus("Disimpan.", false);
    });
  }
  if (gestureCmdFontColorInput) {
    gestureCmdFontColorInput.addEventListener("input", async () => {
      await setSettings({ gestureCommandFontColor: gestureCmdFontColorInput.value });
    });
  }
  if (gestureCmdBgColorInput) {
    gestureCmdBgColorInput.addEventListener("input", async () => {
      // Guna opacity dari slider, bukan hardcode b8
      const opVal = gestureCmdBgOpacitySlider ? Number(gestureCmdBgOpacitySlider.value) : 72;
      const alphaByte = Math.round(opVal / 100 * 255).toString(16).padStart(2, "0");
      await setSettings({ gestureCommandBgColor: gestureCmdBgColorInput.value + alphaByte });
    });
  }
  if (gestureCmdBgOpacitySlider) {
    gestureCmdBgOpacitySlider.addEventListener("input", async () => {
      const opVal = Number(gestureCmdBgOpacitySlider.value);
      if (gestureCmdBgOpacityLabel) gestureCmdBgOpacityLabel.textContent = opVal + "%";
      const alphaByte = Math.round(opVal / 100 * 255).toString(16).padStart(2, "0");
      const baseColor = gestureCmdBgColorInput ? gestureCmdBgColorInput.value : "#000000";
      await setSettings({ gestureCommandBgOpacity: opVal, gestureCommandBgColor: baseColor + alphaByte });
    });
  }
  if (gestureCmdPosXSlider) {
    gestureCmdPosXSlider.addEventListener("input", async () => {
      if (gestureCmdPosXLabel) gestureCmdPosXLabel.textContent = gestureCmdPosXSlider.value + "%";
      await setSettings({ gestureCommandPositionX: Number(gestureCmdPosXSlider.value) });
    });
  }
  if (gestureCmdPosYSlider) {
    gestureCmdPosYSlider.addEventListener("input", async () => {
      if (gestureCmdPosYLabel) gestureCmdPosYLabel.textContent = gestureCmdPosYSlider.value + "%";
      await setSettings({ gestureCommandPositionY: Number(gestureCmdPosYSlider.value) });
    });
  }

  // Exclusions
  async function addExclusion(pattern) {
    const trimmed = pattern.trim();
    if (!trimmed) return;
    if (exclusions.includes(trimmed)) {
      setSaveStatus("Sudah ada dalam senarai.", true);
      return;
    }
    exclusions.push(trimmed);
    await setSettings({ gestureExclusions: exclusions });
    renderExclusions();
    setSaveStatus("Disimpan.", false);
    if (gestureExclusionInput) gestureExclusionInput.value = "";
  }
  if (gestureExclusionAddBtn) {
    gestureExclusionAddBtn.addEventListener("click", () => {
      if (gestureExclusionInput) addExclusion(gestureExclusionInput.value);
    });
  }
  if (gestureExclusionInput) {
    gestureExclusionInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addExclusion(gestureExclusionInput.value); }
    });
  }
  if (gestureExcludeCurrentBtn) {
    gestureExcludeCurrentBtn.addEventListener("click", async () => {
      const url = gestureCurrentUrlEl ? gestureCurrentUrlEl.textContent : "";
      if (!url) return;
      try {
        const u = new URL(url);
        const pattern = `${u.protocol}//${u.hostname}/*`;
        addExclusion(pattern);
      } catch (_) {
        addExclusion(url);
      }
    });
  }

  // Mode toggle (radio button)
  if (gestModeDir) {
    gestModeDir.addEventListener("change", () => { if (gestModeDir.checked) switchMode("dir"); });
  }
  if (gestModeShape) {
    gestModeShape.addEventListener("change", () => { if (gestModeShape.checked) switchMode("shape"); });
  }

  // Threshold slider untuk shape
  if (gestShapeThreshSlider) {
    gestShapeThreshSlider.addEventListener("input", () => {
      if (gestShapeThreshLabel) gestShapeThreshLabel.textContent = gestShapeThreshSlider.value + "%";
    });
  }

  // Auto-update nama & label overlay bila tindakan berubah (untuk gesture baru)
  let _lastDefaultLabel = "";
  let _openingEditor = false;
  if (gestEditAction) {
    gestEditAction.addEventListener("change", () => {
      if (editingId || _openingEditor) return;
      const newLabel = actionLabel(gestEditAction.value);
      if (gestEditName.value === _lastDefaultLabel || !gestEditName.value) {
        gestEditName.value = newLabel;
      }
      if (gestEditCustomLabel && (gestEditCustomLabel.value === _lastDefaultLabel || !gestEditCustomLabel.value)) {
        gestEditCustomLabel.value = newLabel;
      }
      _lastDefaultLabel = newLabel;
    });
  }

  // Editor butang
  if (gestAddBtn) {
    gestAddBtn.addEventListener("click", () => openEditor(null));
  }
  if (gestUndoBtn) {
    gestUndoBtn.addEventListener("click", async () => {
      if (!_undoSnapshot) return;
      mappings = _undoSnapshot;
      _undoSnapshot = null;
      gestUndoBtn.disabled = true;
      await saveMappings();
      renderList();
      renderPresets();
      setSaveStatus("✓ Undo berjaya.", false);
    });
  }
  if (gestExportBtn) {
    gestExportBtn.addEventListener("click", () => {
      try {
        const data = { version: "1.0", exportedAt: new Date().toISOString(), gestures: mappings };
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = `local-pocket-gestures-${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setSaveStatus("✓ Gesture dieksport.", false);
      } catch (e) {
        setSaveStatus("Gagal eksport.", true);
      }
    });
  }
  if (gestImportBtn) {
    gestImportBtn.addEventListener("click", () => { if (gestImportFile) gestImportFile.click(); });
  }
  if (gestImportFile) {
    gestImportFile.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      gestImportFile.value = "";
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        // Support format: { gestures: [...] } atau terus array
        const imported = Array.isArray(data) ? data : (Array.isArray(data.gestures) ? data.gestures : null);
        if (!imported) { setSaveStatus("Format tidak dikenali.", true); return; }
        const valid = imported.filter(m => m && m.id && m.action && Array.isArray(m.pattern));
        if (!valid.length) { setSaveStatus("Tiada gesture sah dalam fail.", true); return; }
        // Gabung — skip ID yang dah ada
        const existingIds = new Set(mappings.map(m => m.id));
        let added = 0;
        for (const m of valid) {
          if (existingIds.has(m.id)) { m.id = genId(); }
          if (!m.name || m.name === "Gesture") m.name = actionLabel(m.action);
          if (!m.customLabel) m.customLabel = actionLabel(m.action);
          mappings.push(m);
          added++;
        }
        _undoSnapshot = mappings.slice(0, mappings.length - added);
        if (gestUndoBtn) gestUndoBtn.disabled = false;
        await saveMappings();
        renderList();
        renderPresets();
        setSaveStatus(`✓ ${added} gesture diimport.`, false);
      } catch (e) {
        setSaveStatus("Gagal import: " + (e.message || "fail tidak sah"), true);
      }
    });
  }

  // Canvas shake bila tiada padanan dalam test
  function shakeCanvas() {
    if (!gestCanvasWrap) return;
    gestCanvasWrap.classList.remove("gest-canvas-shake");
    void gestCanvasWrap.offsetWidth; // reflow
    gestCanvasWrap.classList.add("gest-canvas-shake");
    setTimeout(() => gestCanvasWrap.classList.remove("gest-canvas-shake"), 400);
  }
  if (gestResetBtn) {
    gestResetBtn.addEventListener("click", async () => {
      if (!confirm("Reset semua gesture ke senarai default? Gesture yang dibuat sendiri akan dipadam.")) return;
      _undoSnapshot = mappings.map(m => ({ ...m }));
      if (gestUndoBtn) gestUndoBtn.disabled = false;
      mappings = getDefaultMappings();
      await saveMappings();
      renderList();
      renderPresets();
      setStatus("✓ Gesture direset ke default.", "#4ade80");
    });
  }
  if (gestTestBtn) {
    gestTestBtn.addEventListener("click", () => {
      if (currentMode === "shape") {
        if (!currentShapeData || !currentRawPts.length) return;
        if (!GM || !GM.matchShapeGesture) { setStatus("GestureMatcher tidak tersedia.", "#f87171"); return; }
        const thresh = getShapeThreshold();
        const matches = mappings.filter(m =>
          m.id !== editingId && m.gestureType === "shape" && m.shapeData
          && GM.matchShapeGesture(currentRawPts, m.shapeData, thresh)
        );
        if (matches.length) {
          setStatus("✓ Padanan: " + matches.map(m => `"${m.name}"`).join(", "), "#4ade80");
        } else {
          setStatus("Tiada padanan dengan gesture bentuk yang sedia ada. Bentuk ini unik.", "#60a5fa");
          shakeCanvas();
        }
      } else {
        if (!currentPattern || !currentPattern.length) return;
        if (!GM) { setStatus("GestureMatcher tidak tersedia.", "#f87171"); return; }
        const drawn = currentPattern;
        const dirStr = GM.patternToDirectionString(drawn, true);
        // Guna DTW matching (sama seperti runtime) untuk test yang lebih tepat
        const dirMappings = mappings.filter(m => m.id !== editingId && m.gestureType !== "shape" && m.pattern && m.pattern.length);
        let match = null;
        if (GM.getClosestGestureByPattern) {
          const devTol = gestureDeviationSlider ? Number(gestureDeviationSlider.value) / 100 : 0.15;
          const algo = gestureMatchingAlgoSel ? gestureMatchingAlgoSel.value : "combined";
          match = GM.getClosestGestureByPattern(drawn, dirMappings, devTol, algo);
        } else {
          match = dirMappings.find(m => GM.matchPatterns(drawn, m.pattern)) || null;
        }
        if (match) {
          setStatus(`✓ Padanan: "${match.name}" → ${actionLabel(match.action)}  (${dirStr})`, "#4ade80");
        } else {
          setStatus(`Tiada padanan untuk gesture "${dirStr}". Gesture ini unik.`, "#60a5fa");
          shakeCanvas();
        }
      }
    });
  }
  if (gestSaveBtn) {
    gestSaveBtn.addEventListener("click", saveEdit);
  }
  if (gestCancelBtn) {
    gestCancelBtn.addEventListener("click", closeEditor);
  }
  if (gestClearBtn) {
    gestClearBtn.addEventListener("click", () => {
      currentPattern   = [];
      currentRawPts    = [];
      currentShapeData = null;
      isRecording = false;
      recordPoints = [];
      resizeCanvas();
      clearCanvas();
      if (gestCanvasHint) gestCanvasHint.style.display = "flex";
      if (gestSaveBtn) gestSaveBtn.disabled = true;
      if (gestTestBtn) gestTestBtn.disabled = true;
      setStatus(currentMode === "shape"
        ? "Kanvas dikosongkan. Lukis bentuk baru."
        : "Kanvas dikosongkan. Lukis gesture baru.");
    });
  }

  if (backBtn) {
    backBtn.addEventListener("click", () => { window.location.href = "options.html"; });
  }

  if (gestureEditor) {
    new MutationObserver(() => {
      if (gestureEditor.classList.contains("open")) setTimeout(resizeCanvas, 30);
    }).observe(gestureEditor, { attributes: true, attributeFilter: ["class"] });
  }

  // ── Init ─────────────────────────────────────────────────────────
  populateActionSelect(gestEditAction, ACTIONS[0].id);
  setupCanvasRecorder();
  loadAll();

  // ── Sync hint teks ikut mod yang dipilih ─────────────────────────
  (function syncGestModeHint() {
    const dirHint   = document.getElementById("gestModeDirHint");
    const shapeHint = document.getElementById("gestModeShapeHint");
    const threshRow = document.getElementById("gestShapeThreshRow");
    const threshHint = document.getElementById("gestShapeThreshHint");
    function syncHint() {
      const isShape = document.getElementById("gestModeShape").checked;
      if (dirHint)    dirHint.style.display    = isShape ? "none" : "";
      if (shapeHint)  shapeHint.style.display  = isShape ? "" : "none";
      if (threshRow)  threshRow.style.display  = isShape ? "" : "none";
      if (threshHint) threshHint.style.display = isShape ? "" : "none";
    }
    const modeDirEl   = document.getElementById("gestModeDir");
    const modeShapeEl = document.getElementById("gestModeShape");
    if (modeDirEl)   modeDirEl.addEventListener("change", syncHint);
    if (modeShapeEl) modeShapeEl.addEventListener("change", syncHint);
    syncHint();
  })();

})();
