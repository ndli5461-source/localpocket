(function initPomodoroOverlay() {
  console.log("[Pomodoro] Script loading on:", window.location.href);
  if (typeof window === "undefined") {
    console.log("[Pomodoro] Window is undefined, returning");
    return;
  }
  if (window.__lpPomodoroOverlayInstalled) {
    console.log("[Pomodoro] Already installed, skipping");
    return;
  }
  window.__lpPomodoroOverlayInstalled = true;
  if (window.name === "__LP_SIDEBAR__") {
    console.log("[Pomodoro] Skipping sidebar window");
    return;
  }

  const api = typeof browser !== "undefined" ? browser : (typeof chrome !== "undefined" ? chrome : null);
  console.log("[Pomodoro] API check:", { api: !!api, storage: !!(api && api.storage), storageLocal: !!(api && api.storage && api.storage.local), runtime: !!(api && api.runtime) });
  if (!api || !api.storage || !api.runtime || !api.storage.local) {
    console.log("[Pomodoro] API not available, returning");
    return;
  }
  console.log("[Pomodoro] Initialization complete, setting up message listener");

  const ROOT_ID = "pomodoro-overlay-root";

  const DEFAULT_TIMES = {
    focus: 25,
    shortBreak: 5,
    longBreak: 15
  };

  const MODE_LABELS = {
    focus: "Focus Time",
    shortBreak: "Short Break",
    longBreak: "Long Break"
  };

  const state = {
    open: false,
    mode: "focus",
    timeLeft: DEFAULT_TIMES.focus * 60,
    totalTime: DEFAULT_TIMES.focus * 60,
    running: false,
    sessions: 0,
    totalFocusTime: 0,
    settings: {
      focusTime: DEFAULT_TIMES.focus,
      shortBreakTime: DEFAULT_TIMES.shortBreak,
      longBreakTime: DEFAULT_TIMES.longBreak,
      autoStartTimer: false,
      autoStartBreaks: false,
      soundNotifications: true,
      notificationSound: "chime",
      soundVolume: 0.3,
      customSound: null,
      theme: "default",
      darkMode: true,
      dailyGoal: 0,
      showBgIndicator: true
    },
    minimized: false,
    previousFocus: null,
    originalTitle: null,
    closeTimeoutId: null,
    openAnimTimeoutId: null,
    wasDragging: false,
    currentTask: null,
    currentNotes: null,
    history: []
  };

  let root, timerTime, timerLabel, timerProgress, startPauseBtn, resetBtn, skipBtn;
  let sessionsCount, totalTime, sessionDotsContainer;
  let minimizeBtn, closeBtn, settingsToggle, settingsPanel, resizeHandle;
  let modeButtons = [];
  let focusTimeInput, shortBreakTimeInput, longBreakTimeInput;
  let autoStartTimerCheckbox, autoStartBreaksCheckbox, soundNotificationsCheckbox, soundSelect, testSoundBtn;

  let taskInput, notesInput, distractionBtn, volumeSlider, volumeValue;
  let themeSelect, darkModeToggle, dailyGoalInput, showBgIndicatorCheckbox;
  let statsToggle, statsPanel;
  let customSoundInput;
  let historyData = [];

  let audioContext = null;
  let listenersAttached = false;
  let bgIndicatorInterval = null;
  let notificationDismissTimeout = null;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let isResizing = false;

  const SOUND_PATTERNS = {
    chime: [
      { freq: 800, duration: 0.1 },
      { freq: 600, duration: 0.1 },
      { freq: 800, duration: 0.3 }
    ],
    bell: [
      { freq: 523.25, duration: 0.5 },
      { freq: 659.25, duration: 0.5 },
      { freq: 783.99, duration: 0.8 }
    ],
    ding: [
      { freq: 1200, duration: 0.15 },
      { freq: 1000, duration: 0.15 }
    ],
    alert: [
      { freq: 880, duration: 0.1 },
      { freq: 0, duration: 0.1 },
      { freq: 880, duration: 0.1 },
      { freq: 0, duration: 0.1 },
      { freq: 880, duration: 0.2 }
    ],
    gentle: [
      { freq: 440, duration: 0.3 },
      { freq: 523.25, duration: 0.3 },
      { freq: 659.25, duration: 0.4 }
    ],
    upbeat: [
      { freq: 523.25, duration: 0.1 },
      { freq: 659.25, duration: 0.1 },
      { freq: 783.99, duration: 0.1 },
      { freq: 1046.50, duration: 0.3 }
    ]
  };

  const MODE_COLORS = {
    focus: { from: "#ff6b6b", to: "#feca57" },
    shortBreak: { from: "#48dbfb", to: "#0abde3" },
    longBreak: { from: "#55efc4", to: "#00b894" }
  };

  const THEMES = {
    default: { surface: "#1e1814", surfaceStrong: "#2c231c", ink: "#f6eee7", inkSoft: "#d6c3b3", muted: "#b1917b", accent: "#ffb36a", accent2: "#ff8a5b" },
    sunset: { surface: "#1a1418", surfaceStrong: "#2a1c22", ink: "#f5e6e8", inkSoft: "#d4b8be", muted: "#b18a94", accent: "#ff7b6b", accent2: "#ff5a5b" },
    ocean: { surface: "#0e1724", surfaceStrong: "#162338", ink: "#e0ecf5", inkSoft: "#a8c4d9", muted: "#6e95b5", accent: "#5bc0eb", accent2: "#3a9fd4" },
    forest: { surface: "#0f1a12", surfaceStrong: "#1a2e20", ink: "#e2efe5", inkSoft: "#aec9b5", muted: "#76a384", accent: "#7ed957", accent2: "#5ab83a" },
    midnight: { surface: "#0e0e14", surfaceStrong: "#181826", ink: "#dcdcf0", inkSoft: "#a8a8cc", muted: "#7272a3", accent: "#8870ff", accent2: "#6a4fe0" },
    lavender: { surface: "#18141e", surfaceStrong: "#261c34", ink: "#e8e0f0", inkSoft: "#c4b4d9", muted: "#9a84b5", accent: "#c084fc", accent2: "#a855f7" }
  };

  function _pomoSend(type, payload, cb) {
    var msg = { type: type };
    if (payload) { for (var k in payload) { if (payload.hasOwnProperty(k)) msg[k] = payload[k]; } }
    if (typeof cb === "function") {
      api.runtime.sendMessage(msg, cb);
    } else {
      api.runtime.sendMessage(msg).catch(function() {});
    }
  }

  function _pomoApplyState(s) {
    if (!s) return;
    state.mode = s.mode || "focus";
    state.timeLeft = s.timeLeft != null ? s.timeLeft : state.timeLeft;
    state.totalTime = s.totalTime != null ? s.totalTime : state.totalTime;
    state.running = s.running === true;
    state.sessions = s.sessions || 0;
    state.totalFocusTime = s.totalFocusTime || 0;
    if (s.currentTask != null) state.currentTask = s.currentTask;
    if (s.settings) {
      for (var k in s.settings) {
        if (s.settings.hasOwnProperty(k)) state.settings[k] = s.settings[k];
      }
    }
    if (s.minimized != null) state.minimized = s.minimized;
  }

  function _syncSettingsToInputs() {
    if (focusTimeInput) focusTimeInput.value = state.settings.focusTime;
    if (shortBreakTimeInput) shortBreakTimeInput.value = state.settings.shortBreakTime;
    if (longBreakTimeInput) longBreakTimeInput.value = state.settings.longBreakTime;
    if (autoStartTimerCheckbox) autoStartTimerCheckbox.checked = state.settings.autoStartTimer;
    if (autoStartBreaksCheckbox) autoStartBreaksCheckbox.checked = state.settings.autoStartBreaks;
    if (soundNotificationsCheckbox) soundNotificationsCheckbox.checked = state.settings.soundNotifications;
    if (soundSelect) soundSelect.value = state.settings.notificationSound || "chime";
    if (volumeSlider) volumeSlider.value = (state.settings.soundVolume || 0.3) * 100;
    if (volumeValue) volumeValue.textContent = Math.round((state.settings.soundVolume || 0.3) * 100) + "%";
    if (themeSelect) themeSelect.value = state.settings.theme || "default";
    if (darkModeToggle) darkModeToggle.checked = state.settings.darkMode !== false;
    if (dailyGoalInput) dailyGoalInput.value = state.settings.dailyGoal || 0;
    if (showBgIndicatorCheckbox) showBgIndicatorCheckbox.checked = state.settings.showBgIndicator !== false;
    if (taskInput) taskInput.value = state.currentTask || "";
  }

  function createOverlay() {
    console.log("[Pomodoro] createOverlay called");
    if (document.getElementById(ROOT_ID)) {
      console.log("[Pomodoro] Overlay already exists");
      return;
    }

    const style = document.createElement("style");
    style.textContent = `
      #${ROOT_ID} {
        --pomo-surface: #1e1814;
        --pomo-surface-strong: #2c231c;
        --pomo-surface-soft: rgba(255, 255, 255, 0.05);
        --pomo-line: rgba(255, 229, 200, 0.12);
        --pomo-line-strong: rgba(255, 229, 200, 0.26);
        --pomo-ink: #f6eee7;
        --pomo-ink-soft: #d6c3b3;
        --pomo-muted: #b1917b;
        --pomo-accent: #ffb36a;
        --pomo-accent-2: #ff8a5b;
        --pomo-active-from: #ff6b6b;
        --pomo-active-to: #feca57;
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: min(500px, calc(100vw - 24px));
        max-height: 96vh;
        border: 1px solid var(--pomo-line);
        border-radius: 20px;
        background: var(--pomo-surface);
        box-shadow: 0 14px 28px rgba(0, 0, 0, 0.16);
        display: none;
        flex-direction: column;
        z-index: 2147483647;
        font-family: "Aptos", "Segoe UI", sans-serif;
        color: var(--pomo-ink);
        color-scheme: dark;
        overflow: hidden;
        transition: opacity 200ms ease, transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      #${ROOT_ID}.pomo-opening {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.96);
      }
      #${ROOT_ID}.pomo-closing {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.96);
        pointer-events: none;
      }
      .pomodoro-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 18px;
        border-bottom: 1px solid var(--pomo-line);
        cursor: grab;
        user-select: none;
        flex-shrink: 0;
      }
      .pomodoro-header:active { cursor: grabbing; }
      .pomodoro-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .pomodoro-brand-mark {
        width: 12px;
        height: 12px;
        border-radius: 999px;
        background: linear-gradient(135deg, var(--pomo-accent), var(--pomo-accent-2));
        box-shadow: 0 0 0 5px rgba(255, 255, 255, 0.04);
        flex-shrink: 0;
      }
      .pomodoro-brand-title {
        font: 700 16px/1 "Aptos Display", "Segoe UI", sans-serif;
        color: var(--pomo-ink);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .pomodoro-header-controls {
        display: flex;
        gap: 6px;
        flex-shrink: 0;
      }
      .pomodoro-header-btn {
        width: 34px;
        height: 34px;
        border: 1px solid var(--pomo-line);
        border-radius: 999px;
        background: var(--pomo-surface-soft);
        color: var(--pomo-ink-soft);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        transition: all 150ms ease;
      }
      .pomodoro-header-btn:hover {
        border-color: var(--pomo-line-strong);
        background: rgba(255, 255, 255, 0.12);
        color: var(--pomo-ink);
      }
      .pomodoro-content {
        flex: 1;
        padding: 18px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
        overflow-y: auto;
      }
      .timer-modes {
        display: flex;
        gap: 4px;
        padding: 4px;
        border: 1px solid var(--pomo-line);
        border-radius: 14px;
        background: var(--pomo-surface-soft);
        width: 100%;
      }
      .timer-mode-btn {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid transparent;
        border-radius: 999px;
        background: transparent;
        color: var(--pomo-muted);
        cursor: pointer;
        font: 700 11px/1 "Aptos Display", "Segoe UI", sans-serif;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        transition: all 140ms ease;
      }
      .timer-mode-btn:hover {
        color: var(--pomo-ink-soft);
        background: rgba(255, 255, 255, 0.04);
      }
      .timer-mode-btn.active {
        border-color: var(--pomo-line-strong);
        background: rgba(255, 255, 255, 0.1);
        color: var(--pomo-ink);
      }
      .timer-display {
        position: relative;
        width: 200px;
        height: 200px;
      }
      .timer-ring {
        transform: rotate(-90deg);
      }
      .timer-ring-bg {
        fill: none;
        stroke: var(--pomo-line);
        stroke-width: 8;
      }
      .timer-ring-progress {
        fill: none;
        stroke: url(#pomoModeGradient);
        stroke-width: 8;
        stroke-linecap: round;
        stroke-dashoffset: 0;
        transition: stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .timer-text {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
      }
      .timer-time {
        font-size: 48px;
        font-weight: 800;
        background: linear-gradient(135deg, var(--pomo-active-from), var(--pomo-active-to));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        font-variant-numeric: tabular-nums;
        letter-spacing: -2px;
      }
      .timer-label {
        font: 500 12px/1 "Aptos", "Segoe UI", sans-serif;
        color: var(--pomo-muted);
        margin-top: 6px;
      }
      .timer-controls {
        display: flex;
        gap: 8px;
        width: 100%;
      }
      .timer-btn-primary {
        flex: 2;
        min-height: 42px;
        padding: 0 16px;
        border: 1px solid transparent;
        border-radius: 14px;
        background: linear-gradient(135deg, var(--pomo-accent), var(--pomo-accent-2));
        color: #ffffff;
        font: 700 13px/1 "Aptos Display", "Segoe UI", sans-serif;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: all 150ms ease;
      }
      .timer-btn-primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(255, 179, 106, 0.3);
      }
      .timer-btn-primary:active { transform: translateY(0); }
      .timer-btn-primary.running {
        background: var(--pomo-surface-soft);
        border-color: var(--pomo-line);
        color: var(--pomo-ink);
      }
      .timer-btn-primary.running:hover {
        border-color: var(--pomo-line-strong);
        background: rgba(255, 255, 255, 0.12);
      }
      .timer-btn-primary kbd {
        font: 600 9px/1 "Aptos Display", "Segoe UI", sans-serif;
        padding: 2px 5px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.15);
        opacity: 0.7;
        margin-left: 2px;
      }
      .timer-btn-primary.running kbd {
        border-color: var(--pomo-line);
        background: var(--pomo-surface-soft);
      }
      .timer-btn-secondary {
        flex: 1;
        min-height: 42px;
        padding: 0 14px;
        border: 1px solid var(--pomo-line);
        border-radius: 14px;
        background: var(--pomo-surface-soft);
        color: var(--pomo-ink-soft);
        font: 600 12px/1 "Aptos Display", "Segoe UI", sans-serif;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: all 150ms ease;
      }
      .timer-btn-secondary:hover {
        border-color: var(--pomo-line-strong);
        background: rgba(255, 255, 255, 0.12);
        color: var(--pomo-ink);
      }
      .timer-btn-secondary:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        transform: none !important;
      }
      .timer-btn-secondary kbd {
        font: 600 9px/1 "Aptos Display", "Segoe UI", sans-serif;
        padding: 2px 5px;
        border: 1px solid var(--pomo-line);
        border-radius: 4px;
        background: var(--pomo-surface-soft);
        opacity: 0.6;
      }
      .timer-stats {
        display: flex;
        gap: 8px;
        width: 100%;
      }
      .stat-item {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 12px;
        border: 1px solid var(--pomo-line);
        border-radius: 14px;
        background: var(--pomo-surface-soft);
      }
      .stat-value {
        font: 800 20px/1 "Aptos Display", "Segoe UI", sans-serif;
        color: var(--pomo-accent);
      }
      .stat-label {
        font: 700 10px/1 "Aptos Display", "Segoe UI", sans-serif;
        color: var(--pomo-muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .session-dots {
        display: flex;
        gap: 6px;
        align-items: center;
        justify-content: center;
        width: 100%;
      }
      .session-dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        border: 1.5px solid var(--pomo-line-strong);
        background: transparent;
        transition: all 200ms ease;
      }
      .session-dot.filled {
        background: var(--pomo-accent);
        border-color: var(--pomo-accent);
        box-shadow: 0 0 6px rgba(255, 179, 106, 0.4);
      }
      .settings-toggle {
        width: 100%;
        padding: 10px;
        border: 1px solid var(--pomo-line);
        border-radius: 14px;
        background: transparent;
        color: var(--pomo-muted);
        font: 600 12px/1 "Aptos Display", "Segoe UI", sans-serif;
        cursor: pointer;
        transition: all 140ms ease;
      }
      .settings-toggle:hover {
        border-color: var(--pomo-line-strong);
        color: var(--pomo-ink-soft);
        background: var(--pomo-surface-soft);
      }
      .settings-panel {
        display: none;
        padding: 16px;
        background: var(--pomo-surface-soft);
        border: 1px solid var(--pomo-line);
        border-radius: 14px;
        width: 100%;
        gap: 2px;
        box-sizing: border-box;
        max-height: none;
      }
      .settings-panel.open {
        display: flex;
        flex-direction: column;
      }
      .setting-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        width: 100%;
        box-sizing: border-box;
        padding: 8px 0;
        border-bottom: 1px solid var(--pomo-line);
      }
      .setting-row:last-child { border-bottom: none; }
      .setting-label {
        font: 500 12px/1 "Aptos", "Segoe UI", sans-serif;
        color: var(--pomo-ink-soft);
        flex: 1;
        min-width: 0;
      }
      .setting-input {
        width: 60px;
        min-height: 32px;
        padding: 0 10px;
        border: 1px solid var(--pomo-line);
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.04);
        color: var(--pomo-ink);
        font: 600 13px/1 "Aptos", "Segoe UI", sans-serif;
        text-align: center;
        transition: border-color 150ms ease;
        flex-shrink: 0;
      }
      .setting-input:focus {
        outline: none;
        border-color: var(--pomo-line-strong);
        box-shadow: 0 0 0 3px rgba(99, 211, 255, 0.12);
      }
      .setting-checkbox {
        width: 16px;
        height: 16px;
        accent-color: var(--pomo-accent);
        cursor: pointer;
        flex-shrink: 0;
      }
      .setting-select {
        min-height: 32px;
        padding: 0 12px;
        border: 1px solid var(--pomo-line);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.04);
        color: var(--pomo-ink);
        font: 700 12px/1 "Aptos Display", "Segoe UI", sans-serif;
        cursor: pointer;
        transition: border-color 150ms ease;
        flex-shrink: 0;
      }
      .setting-select:focus {
        outline: none;
        border-color: var(--pomo-line-strong);
        box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.08);
      }
      .setting-select option {
        background: var(--pomo-surface-strong);
        color: var(--pomo-ink);
      }
      .test-sound-btn {
        min-height: 32px;
        padding: 0 10px;
        border: 1px solid var(--pomo-line);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.04);
        color: var(--pomo-ink-soft);
        font: 700 11px/1 "Aptos Display", "Segoe UI", sans-serif;
        cursor: pointer;
        transition: all 150ms ease;
        flex-shrink: 0;
      }
      .test-sound-btn:hover {
        border-color: var(--pomo-line-strong);
        background: rgba(255, 255, 255, 0.12);
        color: var(--pomo-ink);
      }
      .resize-handle {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 24px;
        height: 24px;
        cursor: nwse-resize;
      }
      .resize-handle::after {
        content: "";
        position: absolute;
        bottom: 6px;
        right: 6px;
        width: 10px;
        height: 10px;
        border-radius: 2px;
        background: linear-gradient(135deg, transparent 50%, var(--pomo-muted) 50%);
        opacity: 0.4;
        transition: opacity 140ms ease;
      }
      .resize-handle:hover::after { opacity: 0.7; }
      .minimized .pomodoro-content,
      .minimized .resize-handle { display: none; }
      .minimized .pomodoro-header { border-radius: 20px; border-bottom: none; }
      @keyframes pomoPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
      .timer-running .timer-time {
        animation: pomoPulse 2s ease-in-out infinite;
      }
      #pomodoro-bg-indicator {
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 10px 18px;
        border: 1px solid var(--pomo-line, rgba(255, 229, 200, 0.12));
        border-radius: 999px;
        background: var(--pomo-surface, #1e1814);
        color: var(--pomo-ink, #f6eee7);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
        font: 600 13px/1 "Aptos Display", "Segoe UI", sans-serif;
        z-index: 2147483646;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: transform 150ms ease, box-shadow 150ms ease;
        animation: pomoSlideIn 300ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      #pomodoro-bg-indicator:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.32);
      }
      @keyframes pomoSlideIn {
        from { transform: translateY(60px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      @keyframes pomoSlideOut {
        from { transform: translateY(0); opacity: 1; }
        to { transform: translateY(60px); opacity: 0; }
      }
      .pomo-task-row {
        display: flex;
        gap: 6px;
        width: 100%;
        align-items: center;
      }
      .pomo-task-input {
        flex: 1;
        min-height: 36px;
        padding: 0 12px;
        border: 1px solid var(--pomo-line);
        border-radius: 10px;
        background: var(--pomo-surface-soft);
        color: var(--pomo-ink);
        font: 500 12px/1 "Aptos", "Segoe UI", sans-serif;
        transition: border-color 150ms ease;
      }
      .pomo-task-input:focus {
        outline: none;
        border-color: var(--pomo-line-strong);
      }
      .pomo-distract-btn {
        width: 36px;
        height: 36px;
        border: 1px solid var(--pomo-line);
        border-radius: 999px;
        background: var(--pomo-surface-soft);
        color: var(--pomo-muted);
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: all 150ms ease;
      }
      .pomo-distract-btn:hover {
        border-color: var(--pomo-line-strong);
        color: var(--pomo-accent);
        background: rgba(255, 179, 106, 0.1);
      }
      .pomo-volume-row {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
      }
      .pomo-volume-slider {
        flex: 1;
        accent-color: var(--pomo-accent);
        height: 4px;
        cursor: pointer;
      }
      .pomo-volume-value {
        font: 600 11px/1 "Aptos Display", "Segoe UI", sans-serif;
        color: var(--pomo-muted);
        min-width: 36px;
        text-align: right;
      }
      .pomo-stats-panel {
        display: none;
        padding: 16px;
        background: var(--pomo-surface-soft);
        border: 1px solid var(--pomo-line);
        border-radius: 14px;
        width: 100%;
        gap: 8px;
        box-sizing: border-box;
        flex-direction: column;
      }
      .pomo-stats-panel.open {
        display: flex;
      }
      .pomo-stat-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 0;
        border-bottom: 1px solid var(--pomo-line);
      }
      .pomo-stat-row:last-child { border-bottom: none; }
      .pomo-stat-label-sm {
        font: 500 11px/1 "Aptos", "Segoe UI", sans-serif;
        color: var(--pomo-ink-soft);
      }
      .pomo-stat-value-sm {
        font: 700 11px/1 "Aptos Display", "Segoe UI", sans-serif;
        color: var(--pomo-accent);
      }
      .pomo-custom-sound-row {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
      }
      .pomo-custom-sound-input {
        font: 500 11px/1 "Aptos", "Segoe UI", sans-serif;
        color: var(--pomo-ink-soft);
        flex: 1;
      }
      .pomo-notes-textarea {
        width: 100%;
        min-height: 60px;
        padding: 10px;
        border: 1px solid var(--pomo-line);
        border-radius: 10px;
        background: var(--pomo-surface-soft);
        color: var(--pomo-ink);
        font: 500 11px/1.4 "Aptos", "Segoe UI", sans-serif;
        resize: vertical;
        box-sizing: border-box;
        transition: border-color 150ms ease;
      }
      .pomo-notes-textarea:focus {
        outline: none;
        border-color: var(--pomo-line-strong);
      }
    `;
    document.head.appendChild(style);

    root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="pomodoro-header">
        <div class="pomodoro-brand">
          <div class="pomodoro-brand-mark"></div>
          <span class="pomodoro-brand-title">Pomodoro</span>
        </div>
        <div class="pomodoro-header-controls">
          <button class="pomodoro-header-btn" id="minimizeBtn" title="Minimize (M)">−</button>
          <button class="pomodoro-header-btn" id="closeBtn" title="Close (Esc)">✕</button>
        </div>
      </div>
      <div class="pomodoro-content">
        <div class="timer-modes">
          <button class="timer-mode-btn active" data-mode="focus">Focus</button>
          <button class="timer-mode-btn" data-mode="shortBreak">Short Break</button>
          <button class="timer-mode-btn" data-mode="longBreak">Long Break</button>
        </div>
        <div class="timer-display">
          <svg class="timer-ring" width="200" height="200" viewBox="0 0 200 200">
            <defs>
              <linearGradient id="pomoModeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#ff6b6b" />
                <stop offset="100%" style="stop-color:#feca57" />
              </linearGradient>
            </defs>
            <circle class="timer-ring-bg" cx="100" cy="100" r="90" />
            <circle class="timer-ring-progress" id="timerProgress" cx="100" cy="100" r="90" />
          </svg>
          <div class="timer-text">
            <div class="timer-time" id="timerTime">25:00</div>
            <div class="timer-label" id="timerLabel">Focus Time</div>
          </div>
        </div>
        <div class="timer-controls">
          <button class="timer-btn-primary" id="startPauseBtn">
            <span>▶</span> Start <kbd>Space</kbd>
          </button>
          <button class="timer-btn-secondary" id="resetBtn">
            <span>↺</span> Reset <kbd>R</kbd>
          </button>
          <button class="timer-btn-secondary" id="skipBtn">
            <span>⏭</span> Skip <kbd>S</kbd>
          </button>
        </div>
        <div class="timer-stats">
          <div class="stat-item">
            <div class="stat-value" id="sessionsCount">0</div>
            <div class="stat-label">Sessions</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="totalTime">0m</div>
            <div class="stat-label">Focus Time</div>
          </div>
        </div>
        <div class="session-dots" id="sessionDots"></div>
        <div class="pomo-task-row">
          <input type="text" class="pomo-task-input" id="taskInput" placeholder="What are you working on?">
          <button class="pomo-distract-btn" id="distractionBtn" title="Log distraction">!</button>
        </div>
        <button class="settings-toggle" id="settingsToggle">⚙ Settings</button>
        <div class="settings-panel" id="settingsPanel">
          <div class="setting-row">
            <span class="setting-label">Focus (min)</span>
            <input type="number" class="setting-input" id="focusTime" value="25" min="1" max="60">
          </div>
          <div class="setting-row">
            <span class="setting-label">Short Break (min)</span>
            <input type="number" class="setting-input" id="shortBreakTime" value="5" min="1" max="30">
          </div>
          <div class="setting-row">
            <span class="setting-label">Long Break (min)</span>
            <input type="number" class="setting-input" id="longBreakTime" value="15" min="1" max="60">
          </div>
          <div class="setting-row">
            <span class="setting-label">Auto-start Timer</span>
            <input type="checkbox" class="setting-checkbox" id="autoStartTimer">
          </div>
          <div class="setting-row">
            <span class="setting-label">Auto-start Breaks</span>
            <input type="checkbox" class="setting-checkbox" id="autoStartBreaks">
          </div>
          <div class="setting-row">
            <span class="setting-label">Sound Notifications</span>
            <input type="checkbox" class="setting-checkbox" id="soundNotifications" checked>
          </div>
          <div class="setting-row">
            <span class="setting-label">Notification Sound</span>
            <select class="setting-select" id="soundSelect">
              <option value="chime">Chime</option>
              <option value="bell">Bell</option>
              <option value="ding">Ding</option>
              <option value="alert">Alert</option>
              <option value="gentle">Gentle</option>
              <option value="upbeat">Upbeat</option>
            </select>
            <button class="test-sound-btn" id="testSoundBtn">Test</button>
          </div>
          <div class="setting-row">
            <span class="setting-label">Volume</span>
            <div class="pomo-volume-row">
              <input type="range" class="pomo-volume-slider" id="volumeSlider" min="0" max="100" value="30">
              <span class="pomo-volume-value" id="volumeValue">30%</span>
            </div>
          </div>
          <div class="setting-row">
            <span class="setting-label">Custom Sound</span>
            <div class="pomo-custom-sound-row">
              <input type="file" class="pomo-custom-sound-input" id="customSoundInput" accept="audio/*">
            </div>
          </div>
          <div class="setting-row">
            <span class="setting-label">Theme</span>
            <select class="setting-select" id="themeSelect">
              <option value="default">Default</option>
              <option value="sunset">Sunset</option>
              <option value="ocean">Ocean</option>
              <option value="forest">Forest</option>
              <option value="midnight">Midnight</option>
              <option value="lavender">Lavender</option>
            </select>
          </div>
          <div class="setting-row">
            <span class="setting-label">Dark Mode</span>
            <input type="checkbox" class="setting-checkbox" id="darkModeToggle" checked>
          </div>
          <div class="setting-row">
            <span class="setting-label">Daily Goal</span>
            <input type="number" class="setting-input" id="dailyGoalInput" value="0" min="0" max="20">
          </div>
          <div class="setting-row">
            <span class="setting-label">Mini Timer (overlay closed)</span>
            <input type="checkbox" class="setting-checkbox" id="showBgIndicatorCheckbox" checked>
          </div>
        </div>
        <textarea class="pomo-notes-textarea" id="notesInput" placeholder="Session notes (optional)..." style="display:none;"></textarea>
        <button class="settings-toggle" id="statsToggle">📊 Stats</button>
        <div class="pomo-stats-panel" id="statsPanel">
          <div class="pomo-stat-row">
            <span class="pomo-stat-label-sm">Today</span>
            <span class="pomo-stat-value-sm" id="statToday">0</span>
          </div>
          <div class="pomo-stat-row">
            <span class="pomo-stat-label-sm">This Week</span>
            <span class="pomo-stat-value-sm" id="statWeek">0</span>
          </div>
          <div class="pomo-stat-row">
            <span class="pomo-stat-label-sm">Total Sessions</span>
            <span class="pomo-stat-value-sm" id="statTotalSessions">0</span>
          </div>
          <div class="pomo-stat-row">
            <span class="pomo-stat-label-sm">Total Focus Time</span>
            <span class="pomo-stat-value-sm" id="statTotalTime">0m</span>
          </div>
          <div class="pomo-stat-row">
            <span class="pomo-stat-label-sm">Daily Goal</span>
            <span class="pomo-stat-value-sm" id="statGoal">0 / 0</span>
          </div>
        </div>
      </div>
      <div class="resize-handle" id="resizeHandle"></div>
    `;
    document.body.appendChild(root);

    timerTime = document.getElementById("timerTime");
    timerLabel = document.getElementById("timerLabel");
    timerProgress = document.getElementById("timerProgress");
    startPauseBtn = document.getElementById("startPauseBtn");
    resetBtn = document.getElementById("resetBtn");
    skipBtn = document.getElementById("skipBtn");
    sessionsCount = document.getElementById("sessionsCount");
    totalTime = document.getElementById("totalTime");
    sessionDotsContainer = document.getElementById("sessionDots");
    minimizeBtn = document.getElementById("minimizeBtn");
    closeBtn = document.getElementById("closeBtn");
    settingsToggle = document.getElementById("settingsToggle");
    settingsPanel = document.getElementById("settingsPanel");
    resizeHandle = document.getElementById("resizeHandle");
    modeButtons = document.querySelectorAll(".timer-mode-btn");
    focusTimeInput = document.getElementById("focusTime");
    shortBreakTimeInput = document.getElementById("shortBreakTime");
    longBreakTimeInput = document.getElementById("longBreakTime");
    autoStartTimerCheckbox = document.getElementById("autoStartTimer");
    autoStartBreaksCheckbox = document.getElementById("autoStartBreaks");
    soundNotificationsCheckbox = document.getElementById("soundNotifications");
    soundSelect = document.getElementById("soundSelect");
    testSoundBtn = document.getElementById("testSoundBtn");
    taskInput = document.getElementById("taskInput");
    notesInput = document.getElementById("notesInput");
    distractionBtn = document.getElementById("distractionBtn");
    volumeSlider = document.getElementById("volumeSlider");
    volumeValue = document.getElementById("volumeValue");
    themeSelect = document.getElementById("themeSelect");
    darkModeToggle = document.getElementById("darkModeToggle");
    dailyGoalInput = document.getElementById("dailyGoalInput");
    statsToggle = document.getElementById("statsToggle");
    statsPanel = document.getElementById("statsPanel");
    customSoundInput = document.getElementById("customSoundInput");
    showBgIndicatorCheckbox = document.getElementById("showBgIndicatorCheckbox");

    if (!listenersAttached) {
      attachEventListeners();
      listenersAttached = true;
    }
  }

  function attachEventListeners() {
    startPauseBtn.addEventListener("click", function() {
      var cmd = state.running ? "pomodoro-pause" : "pomodoro-start";
      _pomoSend(cmd, null, function(resp) {
        if (resp && resp.state) {
          var wasRunning = state.running;
          _pomoApplyState(resp.state);
          updateDisplay();
          if (state.running && !wasRunning) {
            if (!audioContext) initAudio();
            showBackgroundIndicator();
          } else if (!state.running && wasRunning) {
            hideBackgroundIndicator();
          }
        }
      });
    });
    resetBtn.addEventListener("click", function() {
      _pomoSend("pomodoro-reset", null, function(resp) {
        if (resp && resp.state) { _pomoApplyState(resp.state); updateDisplay(); }
      });
    });
    skipBtn.addEventListener("click", function() {
      _pomoSend("pomodoro-skip", null, function(resp) {
        if (resp && resp.state) {
          _pomoApplyState(resp.state);
          updateDisplay();
          showNotesInput();
        }
      });
    });
    minimizeBtn.addEventListener("click", function() {
      state.minimized = !state.minimized;
      root.classList.toggle("minimized", state.minimized);
      _pomoSend("pomodoro-update-settings", { settings: { minimized: state.minimized } });
    });
    closeBtn.addEventListener("click", close);

    settingsToggle.addEventListener("click", function() {
      settingsPanel.classList.toggle("open");
    });

    statsToggle.addEventListener("click", function() {
      statsPanel.classList.toggle("open");
      if (statsPanel.classList.contains("open")) loadAndRenderStats();
    });

    modeButtons.forEach(function(btn) {
      btn.addEventListener("click", function() {
        _pomoSend("pomodoro-switch-mode", { mode: btn.dataset.mode }, function(resp) {
          if (resp && resp.state) {
            _pomoApplyState(resp.state);
            updateDisplay();
            modeButtons.forEach(function(b) { b.classList.toggle("active", b.dataset.mode === state.mode); });
          }
        });
      });
    });

    focusTimeInput.addEventListener("change", function(e) {
      var val = parseInt(e.target.value);
      if (val >= 1 && val <= 60) {
        state.settings.focusTime = val;
        _pomoSend("pomodoro-update-settings", { settings: { focusTime: val } });
        if (state.mode === "focus" && !state.running) {
          state.totalTime = val * 60;
          state.timeLeft = val * 60;
          updateDisplay();
        }
      }
    });

    shortBreakTimeInput.addEventListener("change", function(e) {
      var val = parseInt(e.target.value);
      if (val >= 1 && val <= 30) {
        state.settings.shortBreakTime = val;
        _pomoSend("pomodoro-update-settings", { settings: { shortBreakTime: val } });
        if (state.mode === "shortBreak" && !state.running) {
          state.totalTime = val * 60;
          state.timeLeft = val * 60;
          updateDisplay();
        }
      }
    });

    longBreakTimeInput.addEventListener("change", function(e) {
      var val = parseInt(e.target.value);
      if (val >= 1 && val <= 60) {
        state.settings.longBreakTime = val;
        _pomoSend("pomodoro-update-settings", { settings: { longBreakTime: val } });
        if (state.mode === "longBreak" && !state.running) {
          state.totalTime = val * 60;
          state.timeLeft = val * 60;
          updateDisplay();
        }
      }
    });

    autoStartTimerCheckbox.addEventListener("change", function(e) {
      state.settings.autoStartTimer = e.target.checked;
      _pomoSend("pomodoro-update-settings", { settings: { autoStartTimer: e.target.checked } });
    });

    autoStartBreaksCheckbox.addEventListener("change", function(e) {
      state.settings.autoStartBreaks = e.target.checked;
      _pomoSend("pomodoro-update-settings", { settings: { autoStartBreaks: e.target.checked } });
    });

    soundNotificationsCheckbox.addEventListener("change", function(e) {
      state.settings.soundNotifications = e.target.checked;
      _pomoSend("pomodoro-update-settings", { settings: { soundNotifications: e.target.checked } });
      if (e.target.checked && !audioContext) initAudio();
    });

    soundSelect.addEventListener("change", function(e) {
      state.settings.notificationSound = e.target.value;
      _pomoSend("pomodoro-update-settings", { settings: { notificationSound: e.target.value } });
    });

    testSoundBtn.addEventListener("click", function() {
      if (!audioContext) initAudio();
      playNotificationSound();
    });

    // Volume slider
    volumeSlider.addEventListener("input", function(e) {
      var vol = parseInt(e.target.value) / 100;
      state.settings.soundVolume = vol;
      if (volumeValue) volumeValue.textContent = Math.round(vol * 100) + "%";
      _pomoSend("pomodoro-update-settings", { settings: { soundVolume: vol } });
    });

    // Theme selector
    themeSelect.addEventListener("change", function(e) {
      state.settings.theme = e.target.value;
      applyTheme(e.target.value);
      _pomoSend("pomodoro-update-settings", { settings: { theme: e.target.value } });
    });

    // Dark mode toggle
    darkModeToggle.addEventListener("change", function(e) {
      state.settings.darkMode = e.target.checked;
      applyTheme(state.settings.theme);
      _pomoSend("pomodoro-update-settings", { settings: { darkMode: e.target.checked } });
    });

    // Daily goal
    dailyGoalInput.addEventListener("change", function(e) {
      var val = parseInt(e.target.value);
      if (val >= 0 && val <= 20) {
        state.settings.dailyGoal = val;
        _pomoSend("pomodoro-update-settings", { settings: { dailyGoal: val } });
      }
    });

    // Show/hide background indicator on overlay close
    showBgIndicatorCheckbox.addEventListener("change", function(e) {
      state.settings.showBgIndicator = e.target.checked;
      _pomoSend("pomodoro-update-settings", { settings: { showBgIndicator: e.target.checked } });
      if (!e.target.checked) hideBackgroundIndicator();
      else if (state.running && !state.open) showBackgroundIndicator();
    });

    // Task input
    taskInput.addEventListener("change", function(e) {
      state.currentTask = e.target.value || null;
      _pomoSend("pomodoro-update-task", { task: state.currentTask });
    });

    // Notes input
    notesInput.addEventListener("change", function(e) {
      state.currentNotes = e.target.value || null;
      _pomoSend("pomodoro-update-notes", { notes: state.currentNotes });
    });

    // Distraction button
    distractionBtn.addEventListener("click", function() {
      var note = prompt("What distracted you?");
      if (note !== null) {
        _pomoSend("pomodoro-add-distraction", { note: note || "" });
      }
    });

    // Custom sound upload
    customSoundInput.addEventListener("change", function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev) {
        state.settings.customSound = ev.target.result;
        _pomoSend("pomodoro-update-settings", { settings: { customSound: ev.target.result } });
      };
      reader.readAsDataURL(file);
    });

    const header = document.querySelector(".pomodoro-header");
    header.addEventListener("mousedown", function(e) {
      if (e.target.closest(".pomodoro-header-controls")) return;
      e.stopPropagation();
      isDragging = true;
      state.wasDragging = false;
      var rect = root.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;
      root.style.transform = "none";
      root.style.left = rect.left + "px";
      root.style.top = rect.top + "px";
    });

    resizeHandle.addEventListener("mousedown", function(e) {
      isResizing = true;
      e.preventDefault();
    });
  }

  function initAudio() {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.error("[Pomodoro] Failed to initialize audio context:", e);
    }
  }

  function playNotificationSound() {
    if (!state.settings.soundNotifications) return;
    if (!audioContext) initAudio();
    if (!audioContext) return;
    var pattern = SOUND_PATTERNS[state.settings.notificationSound] || SOUND_PATTERNS.chime;
    try {
      if (audioContext.state === "suspended") audioContext.resume().catch(function() {});
      var startTime = audioContext.currentTime;
      pattern.forEach(function(note) {
        if (note.freq === 0) { startTime += note.duration; return; }
        var oscillator = audioContext.createOscillator();
        var gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.setValueAtTime(note.freq, startTime);
        oscillator.type = "sine";
        var volume = state.settings.soundVolume != null ? state.settings.soundVolume : 0.3;
        gainNode.gain.setValueAtTime(volume, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + note.duration);
        oscillator.start(startTime);
        oscillator.stop(startTime + note.duration);
        startTime += note.duration;
      });
    } catch (e) {
      console.error("[Pomodoro] Failed to play sound:", e);
    }
  }

  function applyTheme(themeName) {
    if (!root) return;
    var t = THEMES[themeName] || THEMES.default;
    var isDark = state.settings.darkMode !== false;
    if (!isDark) {
      t = { surface: "#f5f0eb", surfaceStrong: "#ede5dc", ink: "#1a1410", inkSoft: "#4a3f38", muted: "#8a7a6e", accent: "#e8965a", accent2: "#d97a45" };
    }
    root.style.setProperty("--pomo-surface", t.surface);
    root.style.setProperty("--pomo-surface-strong", t.surfaceStrong);
    root.style.setProperty("--pomo-ink", t.ink);
    root.style.setProperty("--pomo-ink-soft", t.inkSoft);
    root.style.setProperty("--pomo-muted", t.muted);
    root.style.setProperty("--pomo-accent", t.accent);
    root.style.setProperty("--pomo-accent-2", t.accent2);
  }

  function showNotesInput() {
    if (notesInput) {
      notesInput.style.display = "block";
      notesInput.focus();
    }
  }

  function loadAndRenderStats() {
    _pomoSend("pomodoro-get-history", null, function(resp) {
      if (resp && resp.history) {
        historyData = resp.history;
        renderStats();
      }
    });
  }

  function renderStats() {
    if (!statsPanel) return;
    var todayStr = new Date().toISOString().slice(0, 10);
    var todayCount = 0, weekCount = 0;
    var totalMinutes = 0;
    var now = new Date();
    var weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    var weekStartStr = weekStart.toISOString().slice(0, 10);

    for (var i = 0; i < historyData.length; i++) {
      var h = historyData[i];
      if (!h.completed || h.mode !== "focus") continue;
      var d = h.date ? h.date.slice(0, 10) : "";
      if (d === todayStr) todayCount++;
      if (d >= weekStartStr && d <= todayStr) weekCount++;
      totalMinutes += Math.floor((h.duration || 0) / 60);
    }

    var todayEl = document.getElementById("statToday");
    var weekEl = document.getElementById("statWeek");
    var totalSessEl = document.getElementById("statTotalSessions");
    var totalTimeEl = document.getElementById("statTotalTime");
    var goalEl = document.getElementById("statGoal");

    if (todayEl) todayEl.textContent = todayCount + " pomodoro" + (todayCount !== 1 ? "s" : "");
    if (weekEl) weekEl.textContent = weekCount + " pomodoro" + (weekCount !== 1 ? "s" : "");
    if (totalSessEl) totalSessEl.textContent = state.sessions;
    if (totalTimeEl) totalTimeEl.textContent = formatTotalTime(Math.round(totalMinutes));
    if (goalEl) {
      var goal = state.settings.dailyGoal || 0;
      goalEl.textContent = todayCount + " / " + goal + (goal > 0 ? " (" + (todayCount >= goal ? "Done!" : Math.round(todayCount / goal * 100) + "%)") : "");
    }
  }

  function showInPageNotification(title, message, type) {
    if (!type) type = "success";
    var existing = document.getElementById("pomodoro-notification");
    if (existing) existing.remove();
    if (notificationDismissTimeout) { clearTimeout(notificationDismissTimeout); notificationDismissTimeout = null; }

    var notification = document.createElement("div");
    notification.id = "pomodoro-notification";
    var bgColor = type === "success"
      ? "linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)"
      : "linear-gradient(135deg, #48dbfb 0%, #0abde3 100%)";
    var icon = type === "success" ? "🎉" : "☕";

    notification.style.cssText = [
      "position: fixed; top: 30px; right: 30px;",
      "background: " + bgColor + "; color: white;",
      "padding: 20px 25px; border-radius: 16px;",
      "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;",
      "z-index: 2147483648;",
      "box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);",
      "display: flex; align-items: flex-start; gap: 15px;",
      "min-width: 300px; max-width: 400px;",
      "animation: slideInRight 0.5s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer;"
    ].join(" ");

    var iconDiv = document.createElement("div");
    iconDiv.style.cssText = "font-size:32px;line-height:1;";
    iconDiv.textContent = icon;

    var textDiv = document.createElement("div");
    textDiv.style.cssText = "flex:1;";

    var titleDiv = document.createElement("div");
    titleDiv.style.cssText = "font-size:18px;font-weight:700;margin-bottom:6px;";
    titleDiv.textContent = title;

    var msgDiv = document.createElement("div");
    msgDiv.style.cssText = "font-size:14px;opacity:0.9;";
    msgDiv.textContent = message;

    textDiv.appendChild(titleDiv);
    textDiv.appendChild(msgDiv);

    var closeNotifBtn = document.createElement("button");
    closeNotifBtn.className = "close-btn";
    closeNotifBtn.style.cssText = "background:rgba(255,255,255,0.2);border:none;color:white;width:24px;height:24px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;transition:all 0.2s;";
    closeNotifBtn.textContent = "\u2715";

    notification.appendChild(iconDiv);
    notification.appendChild(textDiv);
    notification.appendChild(closeNotifBtn);

    var notifStyle = document.getElementById("pomodoro-notif-style");
    if (!notifStyle) {
      notifStyle = document.createElement("style");
      notifStyle.id = "pomodoro-notif-style";
      notifStyle.textContent = [
        "@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }",
        "@keyframes slideOutRight { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }",
        "#pomodoro-notification:hover { transform: translateY(-2px); box-shadow: 0 15px 50px rgba(0, 0, 0, 0.4); }",
        "#pomodoro-notification .close-btn:hover { background: rgba(255,255,255,0.3); transform: scale(1.1); }"
      ].join(" ");
      document.head.appendChild(notifStyle);
    }

    var notifCloseBtn = notification.querySelector(".close-btn");
    notifCloseBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      dismissNotification();
    });

    notification.addEventListener("click", function(e) {
      e.stopPropagation();
      dismissNotification();
      toggle();
    });

    document.body.appendChild(notification);
    notificationDismissTimeout = setTimeout(dismissNotification, 8000);

    function dismissNotification() {
      if (notificationDismissTimeout) { clearTimeout(notificationDismissTimeout); notificationDismissTimeout = null; }
      if (!notification.parentNode) return;
      notification.style.animation = "slideOutRight 0.5s cubic-bezier(0.4, 0, 0.2, 1)";
      setTimeout(function() {
        if (notification.parentNode) notification.remove();
      }, 500);
    }
  }

  function formatTime(seconds) {
    var mins = Math.floor(seconds / 60);
    var secs = seconds % 60;
    return (mins < 10 ? "0" : "") + mins + ":" + (secs < 10 ? "0" : "") + secs;
  }

  function formatTotalTime(minutes) {
    if (minutes < 60) return minutes + "m";
    var hours = Math.floor(minutes / 60);
    var mins = minutes % 60;
    return hours + "h " + mins + "m";
  }

  function updateDisplay() {
    if (!timerTime || !root) return;
    timerTime.textContent = formatTime(state.timeLeft);
    timerLabel.textContent = MODE_LABELS[state.mode];

    var colors = MODE_COLORS[state.mode] || MODE_COLORS.focus;
    root.style.setProperty("--pomo-active-from", colors.from);
    root.style.setProperty("--pomo-active-to", colors.to);
    applyTheme(state.settings.theme || "default");

    var gradStops = document.querySelectorAll("#pomoModeGradient stop");
    if (gradStops.length >= 2) {
      gradStops[0].style.stopColor = colors.from;
      gradStops[1].style.stopColor = colors.to;
    }

    var circumference = 2 * Math.PI * 90;
    var progress = state.totalTime > 0 ? state.timeLeft / state.totalTime : 1;
    timerProgress.style.strokeDasharray = circumference;
    timerProgress.style.strokeDashoffset = circumference * (1 - progress);

    sessionsCount.textContent = state.sessions;
    totalTime.textContent = formatTotalTime(state.totalFocusTime);

    if (state.running) {
      root.classList.add("timer-running");
      startPauseBtn.innerHTML = '<span>⏸</span> Pause <kbd>Space</kbd>';
      startPauseBtn.classList.add("running");
    } else {
      root.classList.remove("timer-running");
      startPauseBtn.innerHTML = '<span>▶</span> Start <kbd>Space</kbd>';
      startPauseBtn.classList.remove("running");
    }

    renderSessionDots();

    if (state.running && state.timeLeft > 0) {
      if (!state.originalTitle) state.originalTitle = document.title;
      document.title = "[" + formatTime(state.timeLeft) + "] " + state.originalTitle;
    } else if (state.originalTitle) {
      document.title = state.originalTitle;
    }
  }

  function renderSessionDots() {
    if (!sessionDotsContainer) return;
    var cyclePos = state.sessions % 4;
    sessionDotsContainer.textContent = "";
    for (var i = 0; i < 4; i++) {
      var dot = document.createElement("span");
      dot.className = "session-dot" + (i < cyclePos ? " filled" : "");
      sessionDotsContainer.appendChild(dot);
    }
  }

  function toggle() {
    console.log("[Pomodoro] toggle() called, state.open:", state.open);
    if (state.open) {
      console.log("[Pomodoro] Closing overlay");
      close();
      return false;
    }

    var existingIndicator = document.getElementById("pomodoro-bg-indicator");
    if (existingIndicator) existingIndicator.remove();
    if (bgIndicatorInterval) { clearInterval(bgIndicatorInterval); bgIndicatorInterval = null; }

    console.log("[Pomodoro] Creating overlay");
    createOverlay();
    state.open = true;
    console.log("[Pomodoro] Overlay created, state.open set to true");

    if (state.closeTimeoutId) { clearTimeout(state.closeTimeoutId); state.closeTimeoutId = null; }
    if (state.openAnimTimeoutId) { clearTimeout(state.openAnimTimeoutId); state.openAnimTimeoutId = null; }

    root.style.display = "flex";
    root.classList.remove("pomo-closing");
    root.classList.add("pomo-opening");

    if (!state.previousFocus) {
      state.previousFocus = document.activeElement;
    }

    // Subscribe to background state
    _pomoSend("pomodoro-subscribe", null, function(resp) {
      if (resp && resp.state) {
        _pomoApplyState(resp.state);
        updateDisplay();
        _syncSettingsToInputs();
        applyTheme(state.settings.theme || "default");
        // Restore minimized state (Bug 8)
        if (state.minimized) root.classList.add("minimized");
        else root.classList.remove("minimized");
        if (state.running) {
          if (!state.originalTitle) state.originalTitle = document.title;
        }
      }
    });

    var removeOpening = function() {
      if (root) root.classList.remove("pomo-opening");
    };
    requestAnimationFrame(function() {
      requestAnimationFrame(removeOpening);
    });
    state.openAnimTimeoutId = setTimeout(removeOpening, 100);

    return true;
  }

  function close() {
    if (!state.open || !root) return;
    state.open = false;

    root.classList.add("pomo-closing");

    if (state.originalTitle) {
      document.title = state.originalTitle;
      state.originalTitle = null;
    }

    if (state.closeTimeoutId) clearTimeout(state.closeTimeoutId);
    if (state.openAnimTimeoutId) { clearTimeout(state.openAnimTimeoutId); state.openAnimTimeoutId = null; }

    state.closeTimeoutId = setTimeout(function() {
      if (root) {
        root.style.display = "none";
        root.classList.remove("pomo-closing");
      }
      state.closeTimeoutId = null;
    }, 250);

    // Show background indicator if timer still running (Bug 5)
    if (state.running) {
      showBackgroundIndicator();
    } else {
      // Only unsubscribe if timer is not running (keep receiving updates for bg indicator)
      _pomoSend("pomodoro-unsubscribe");
    }

    if (state.previousFocus) {
      state.previousFocus.focus();
      state.previousFocus = null;
    }
  }

  function showBackgroundIndicator() {
    if (state.settings.showBgIndicator === false) return;
    var existing = document.getElementById("pomodoro-bg-indicator");
    if (existing) existing.remove();
    if (bgIndicatorInterval) { clearInterval(bgIndicatorInterval); bgIndicatorInterval = null; }

    var indicator = document.createElement("div");
    indicator.id = "pomodoro-bg-indicator";
    var bgIconSpan = document.createElement("span");
    bgIconSpan.textContent = "🍅";
    var bgTimeSpan = document.createElement("span");
    bgTimeSpan.id = "bg-timer-time";
    bgTimeSpan.textContent = formatTime(state.timeLeft);
    indicator.appendChild(bgIconSpan);
    indicator.appendChild(bgTimeSpan);

    indicator.addEventListener("click", function() {
      toggle();
    });

    document.body.appendChild(indicator);

    bgIndicatorInterval = setInterval(function() {
      var bgIndicator = document.getElementById("pomodoro-bg-indicator");
      var bgTimerTime = document.getElementById("bg-timer-time");
      if (!bgIndicator || !bgTimerTime || !state.running) {
        clearInterval(bgIndicatorInterval);
        bgIndicatorInterval = null;
        if (bgIndicator) bgIndicator.remove();
        return;
      }
      bgTimerTime.textContent = formatTime(state.timeLeft);
    }, 1000);
  }

  function hideBackgroundIndicator() {
    var existing = document.getElementById("pomodoro-bg-indicator");
    if (existing) existing.remove();
    if (bgIndicatorInterval) { clearInterval(bgIndicatorInterval); bgIndicatorInterval = null; }
  }

  document.addEventListener("mousemove", function(e) {
    if (!isDragging || !root) return;
    state.wasDragging = true;
    root.style.left = (e.clientX - dragOffset.x) + "px";
    root.style.top = (e.clientY - dragOffset.y) + "px";
  });

  document.addEventListener("mouseup", function() {
    if (isDragging) {
      state.wasDragging = true;
    }
    isDragging = false;
    if (root) {
      root.style.transform = "";
      root.style.left = "";
      root.style.top = "";
    }
  });

  document.addEventListener("mousemove", function(e) {
    if (!isResizing || !root) return;
    var rect = root.getBoundingClientRect();
    var newWidth = e.clientX - rect.left;
    var newHeight = e.clientY - rect.top;
    if (newWidth >= 300) root.style.width = newWidth + "px";
    if (newHeight >= 400) root.style.height = newHeight + "px";
  });

  document.addEventListener("mouseup", function() {
    isResizing = false;
  });

  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape" && state.open) {
      close();
      return;
    }
    if (!state.open) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;

    switch (e.key) {
      case " ":
        e.preventDefault();
        var cmd = state.running ? "pomodoro-pause" : "pomodoro-start";
        _pomoSend(cmd, null, function(resp) {
          if (resp && resp.state) {
            var wasRunning = state.running;
            _pomoApplyState(resp.state);
            updateDisplay();
            if (state.running && !wasRunning) {
              if (!audioContext) initAudio();
              showBackgroundIndicator();
            } else if (!state.running && wasRunning) {
              hideBackgroundIndicator();
            }
          }
        });
        break;
      case "r":
      case "R":
        _pomoSend("pomodoro-reset", null, function(resp) {
          if (resp && resp.state) { _pomoApplyState(resp.state); updateDisplay(); }
        });
        break;
      case "s":
      case "S":
        _pomoSend("pomodoro-skip", null, function(resp) {
          if (resp && resp.state) {
            _pomoApplyState(resp.state);
            updateDisplay();
            showNotesInput();
          }
        });
        break;
      case "1":
        _pomoSend("pomodoro-switch-mode", { mode: "focus" }, function(resp) {
          if (resp && resp.state) {
            _pomoApplyState(resp.state);
            updateDisplay();
            modeButtons.forEach(function(b) { b.classList.toggle("active", b.dataset.mode === "focus"); });
          }
        });
        break;
      case "2":
        _pomoSend("pomodoro-switch-mode", { mode: "shortBreak" }, function(resp) {
          if (resp && resp.state) {
            _pomoApplyState(resp.state);
            updateDisplay();
            modeButtons.forEach(function(b) { b.classList.toggle("active", b.dataset.mode === "shortBreak"); });
          }
        });
        break;
      case "3":
        _pomoSend("pomodoro-switch-mode", { mode: "longBreak" }, function(resp) {
          if (resp && resp.state) {
            _pomoApplyState(resp.state);
            updateDisplay();
            modeButtons.forEach(function(b) { b.classList.toggle("active", b.dataset.mode === "longBreak"); });
          }
        });
        break;
      case "m":
      case "M":
        state.minimized = !state.minimized;
        root.classList.toggle("minimized", state.minimized);
        _pomoSend("pomodoro-update-settings", { settings: { minimized: state.minimized } });
        break;
    }
  });

  document.addEventListener("click", function(e) {
    if (!state.open || !root) return;
    if (root.contains(e.target)) return;
    if (state.wasDragging) { state.wasDragging = false; return; }
    close();
  });

  // Listen for state updates from background
  api.runtime.onMessage.addListener(function pomoMessageHandler(message, sender, sendResponse) {
    if (!message || typeof message !== "object") return false;

    if (message.type === "toggle-pomodoro-overlay") {
      try {
        var opened = toggle();
        sendResponse({ ok: opened });
        return true;
      } catch (err) {
        console.error("[Pomodoro] Toggle error:", err);
        sendResponse({ ok: false, error: String(err) });
        return true;
      }
    }

    if (message.type === "pomodoro-state") {
      if (message.state) {
        var wasRunning = state.running;
        _pomoApplyState(message.state);
        if (state.open) {
          updateDisplay();
          _syncSettingsToInputs();
        }
        // Show/hide background indicator based on running state
        if (state.running && !wasRunning) {
          showBackgroundIndicator();
        } else if (!state.running && wasRunning) {
          hideBackgroundIndicator();
        }
        // Show in-page notification when completed
        if (message.completed === "focus" || message.completed === "break") {
          playNotificationSound();
          if (message.completed === "focus") {
            showInPageNotification("Pomodoro Complete!", "Great job! Time for a well-deserved break.", "success");
          } else {
            showInPageNotification("Break Complete!", "Ready to get back to work?", "break");
          }
        }
      }
      return false;
    }

    return false;
  });

  // Initialize: check if timer is running and show background indicator
  _pomoSend("pomodoro-subscribe", null, function(resp) {
    if (resp && resp.state) {
      _pomoApplyState(resp.state);
      if (state.running) {
        showBackgroundIndicator();
      }
    }
  });
})();
