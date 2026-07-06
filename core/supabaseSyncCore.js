/**
 * Supabase Sync Core Module
 * Drop-in replacement for firestoreSyncCore.js + cloudSyncCore.js
 *
 * Architecture:
 *   - sync_data table: one row per (user_id, key) — incremental sync
 *   - backup_data table: one row per user — full JSON backup
 *
 * Limits (Supabase free tier):
 *   - Unlimited reads & writes (no daily quota like Firestore)
 *   - 500MB database storage
 *   - 2GB bandwidth/month
 */

(function attachLocalPocketSupabaseSyncCore(globalScope) {
  'use strict';

  const STORAGE_KEYS = {
    SYNCED_TIMESTAMPS: 'synced_item_timestamps',
    LAST_SYNC_TIME:    'last_sync_time',
    SYNC_ENABLED:      'sync_enabled',
    PENDING_QUEUE:     'pending_sync_queue'
  };

  const SCHEMA_VERSION = 1;
  const MAX_DOCUMENT_BYTES = 900000; // 900KB safety cap per value

  // ── State ───────────────────────────────────────────────────────────────────
  let _supabase = null;
  let _initialized = false;
  let _currentDeviceId = null;
  let _debounceMap = new Map(); // docKey → { timer, settler }
  const DEBOUNCE_MS = 500;

  // Daily write budget (soft cap — Supabase has no hard daily limit but
  // keeps things sane for devices with many rapid changes)
  let _dailyWrites = 0;
  let _dailyResetAt = Date.now();
  const DAILY_WRITE_BUDGET = 50000; // very generous for Supabase free tier

  // Per-cycle write cap for syncAllData
  const MAX_WRITES_PER_CYCLE = 500;

  const api_local = typeof browser !== 'undefined' ? browser : chrome;

  // ── Init ────────────────────────────────────────────────────────────────────

  function initializeSync(supabaseClientOrConfig) {
    if (_initialized) return true;
    try {
      // Accept either a pre-built client or a config object
      if (supabaseClientOrConfig && typeof supabaseClientOrConfig.from === 'function') {
        _supabase = supabaseClientOrConfig;
      } else {
        // Get from auth core
        const authCore = globalScope.LocalPocketSupabaseAuthCore || globalScope.LocalPocketFirebaseAuthCore;
        if (authCore && typeof authCore.getSupabaseClient === 'function') {
          _supabase = authCore.getSupabaseClient();
        }
      }
      if (!_supabase) {
        console.error('[SupabaseSync] No Supabase client available');
        return false;
      }
      _initialized = true;
      return true;
    } catch (err) {
      console.error('[SupabaseSync] init error:', err);
      return false;
    }
  }

  function _ensureClient() {
    if (_supabase) return true;
    const authCore = globalScope.LocalPocketSupabaseAuthCore || globalScope.LocalPocketFirebaseAuthCore;
    if (authCore && typeof authCore.getSupabaseClient === 'function') {
      _supabase = authCore.getSupabaseClient();
    }
    return !!_supabase;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function _createSettler() {
    let res, rej;
    const promise = new Promise((r, j) => { res = r; rej = j; });
    return { promise, resolve: res, reject: rej };
  }

  function _trackWrite(n) {
    const now = Date.now();
    if (now - _dailyResetAt >= 86400000) { _dailyWrites = 0; _dailyResetAt = now; }
    _dailyWrites += (n || 1);
  }

  function _budgetExceeded() {
    const now = Date.now();
    if (now - _dailyResetAt >= 86400000) { _dailyWrites = 0; _dailyResetAt = now; return false; }
    return _dailyWrites >= DAILY_WRITE_BUDGET;
  }

  function _safeJson(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
  }

  function _estimateBytes(v) {
    try { return new Blob([JSON.stringify(v)]).size; } catch { return Infinity; }
  }

  async function _getUid() {
    const authCore = globalScope.LocalPocketSupabaseAuthCore || globalScope.LocalPocketFirebaseAuthCore;
    if (!authCore) return null;
    try {
      await authCore.waitForAuthReady();
    } catch {}
    const stored = await authCore.getStoredAuthData();
    const uid = stored[authCore.STORAGE_KEYS.USER_UID];
    return uid && uid !== 'undefined' ? uid : null;
  }

  async function _getDeviceId() {
    if (_currentDeviceId) return _currentDeviceId;
    const authCore = globalScope.LocalPocketSupabaseAuthCore || globalScope.LocalPocketFirebaseAuthCore;
    if (authCore && typeof authCore.getDeviceId === 'function') {
      _currentDeviceId = await authCore.getDeviceId();
    }
    return _currentDeviceId || 'unknown';
  }

  function _updateLastSyncTime() {
    api_local.storage.local.set({ [STORAGE_KEYS.LAST_SYNC_TIME]: Date.now() }, () => {});
  }

  // ── Core: upsert one key ─────────────────────────────────────────────────────

  async function _upsertKey(uid, dataType, docId, value) {
    if (!_ensureClient()) return { success: false, error: 'No client' };
    if (!uid) return { success: false, error: 'No UID' };
    if (_budgetExceeded()) return { success: false, error: 'daily_budget_exceeded' };

    const safe = _safeJson(value);
    if (safe === null) return { success: false, error: 'Serialization failed' };
    if (_estimateBytes(safe) > MAX_DOCUMENT_BYTES) return { success: false, error: 'Value too large' };

    const key = `${dataType}:${docId}`;
    const payload = {
      user_id: uid,
      key,
      value: safe,
      updated_at: new Date().toISOString(),
      device_id: await _getDeviceId(),
      schema_version: SCHEMA_VERSION
    };

    try {
      const { error } = await _supabase
        .from('sync_data')
        .upsert(payload, { onConflict: 'user_id,key' });
      if (error) throw error;
      _trackWrite(1);
      _updateLastSyncTime();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message, queued: true };
    }
  }

  // ── syncData (per-doc debounced, replaces firestoreSyncCore.syncData) ────────

  async function syncData(dataType, data, documentId = null) {
    if (!_initialized && !_ensureClient()) {
      return { success: false, error: 'Not initialized' };
    }

    const uid = await _getUid();
    if (!uid) return { success: false, error: 'Not authenticated' };
    if (!_currentDeviceId) _currentDeviceId = await _getDeviceId();

    const resolvedDocId = documentId
      || (data && typeof data === 'object' && data.id ? String(data.id).replace(/\//g, '_') : null)
      || ('_' + dataType);
    const docKey = `${dataType}:${resolvedDocId}`;

    const existing = _debounceMap.get(docKey);
    if (existing) clearTimeout(existing.timer);

    const settler = (existing && existing.settler) || _createSettler();

    const timer = setTimeout(async () => {
      _debounceMap.delete(docKey);
      try {
        const result = await _upsertKey(uid, dataType, resolvedDocId, data);
        settler.resolve(result);
      } catch (err) {
        settler.reject(err);
      }
    }, DEBOUNCE_MS);

    _debounceMap.set(docKey, { timer, settler });
    return settler.promise;
  }

  // ── syncAllData (batch upsert, replaces firestoreSyncCore.syncAllData) ────────

  async function syncAllData(progressCallback) {
    const dataTypes = ['items', 'categories', 'settings', 'notes'];
    const results = {};

    const uid = await _getUid();
    if (!uid) {
      if (progressCallback) progressCallback({ error: 'Invalid user UID' });
      return { success: false, error: 'Invalid user UID', results };
    }
    if (!_ensureClient()) return { success: false, error: 'No client', results };
    if (_budgetExceeded()) {
      if (progressCallback) progressCallback({ status: 'complete', synced: 0, failed: 0, budgetExceeded: true });
      return { success: false, error: 'daily_budget_exceeded', results };
    }

    const syncedTimestamps = await new Promise(resolve => {
      api_local.storage.local.get([STORAGE_KEYS.SYNCED_TIMESTAMPS], r =>
        resolve(r[STORAGE_KEYS.SYNCED_TIMESTAMPS] || {})
      );
    });

    let totalSynced = 0, totalFailed = 0, totalSkipped = 0, totalWritesThisCycle = 0;

    for (const dataType of dataTypes) {
      if (totalWritesThisCycle >= MAX_WRITES_PER_CYCLE) {
        console.warn('[SupabaseSync] Per-cycle cap reached, deferring remaining');
        break;
      }

      try {
        const storageData = await new Promise(resolve =>
          api_local.storage.local.get([dataType], r => resolve(r))
        );
        if (!storageData[dataType]) continue;

        const data = storageData[dataType];
        const entries = [];

        if (Array.isArray(data)) {
          for (const item of data) {
            if (!item || !item.id) continue;
            const docId = String(item.id).replace(/\//g, '_');
            const stampKey = `${dataType}:${docId}`;
            const itemTime = item.savedAt || item.updatedAt || 0;
            if (syncedTimestamps[stampKey] === itemTime) { totalSkipped++; continue; }
            entries.push({ docId, item, stampKey, itemTime });
          }
        } else if (typeof data === 'object') {
          for (const [key, value] of Object.entries(data)) {
            const docId = String(key).replace(/\//g, '_');
            const stampKey = `${dataType}:${docId}`;
            const itemTime = (value && (value.savedAt || value.updatedAt)) || 0;
            if (syncedTimestamps[stampKey] === itemTime) { totalSkipped++; continue; }
            entries.push({ docId, item: value, stampKey, itemTime });
          }
        }

        if (entries.length === 0) continue;

        if (progressCallback) progressCallback({ dataType, status: 'start', total: entries.length, synced: totalSynced, failed: totalFailed });

        // Batch upsert in chunks of 100
        const CHUNK = 100;
        const deviceId = await _getDeviceId();
        const now = new Date().toISOString();

        for (let i = 0; i < entries.length; i += CHUNK) {
          if (totalWritesThisCycle >= MAX_WRITES_PER_CYCLE) break;
          if (_budgetExceeded()) break;

          const chunk = entries.slice(i, i + CHUNK);
          const rows = [];

          for (const { docId, item } of chunk) {
            const safe = _safeJson(item);
            if (safe === null || _estimateBytes(safe) > MAX_DOCUMENT_BYTES) {
              totalFailed++;
              continue;
            }
            rows.push({
              user_id: uid,
              key: `${dataType}:${docId}`,
              value: safe,
              updated_at: now,
              device_id: deviceId,
              schema_version: SCHEMA_VERSION
            });
          }

          if (rows.length === 0) continue;

          try {
            const { error } = await _supabase
              .from('sync_data')
              .upsert(rows, { onConflict: 'user_id,key' });

            if (error) {
              console.error('[SupabaseSync] Batch upsert error:', error.message);
              totalFailed += rows.length;
            } else {
              totalSynced += rows.length;
              totalWritesThisCycle += rows.length;
              _trackWrite(rows.length);
              // Update timestamps for successfully synced items
              for (let j = 0; j < chunk.length && j < rows.length; j++) {
                syncedTimestamps[`${dataType}:${chunk[j].docId}`] = chunk[j].itemTime;
              }
            }
          } catch (err) {
            console.error('[SupabaseSync] Batch error:', err.message);
            totalFailed += rows.length;
          }

          if (progressCallback) progressCallback({ dataType, status: 'progress', total: entries.length, synced: totalSynced, failed: totalFailed });
        }

        results[dataType] = { success: true, count: entries.length };
        if (progressCallback) progressCallback({ dataType, status: 'done', total: entries.length, synced: totalSynced, failed: totalFailed });

      } catch (err) {
        console.error(`[SupabaseSync] Sync ${dataType} error:`, err);
        results[dataType] = { success: false, error: err.message };
      }
    }

    // Persist updated timestamps
    await new Promise(resolve => {
      api_local.storage.local.set({ [STORAGE_KEYS.SYNCED_TIMESTAMPS]: syncedTimestamps }, resolve);
    });

    _updateLastSyncTime();
    if (progressCallback) progressCallback({ status: 'complete', synced: totalSynced, failed: totalFailed, skipped: totalSkipped });
    return { success: true, results };
  }

  async function manualSync(progressCallback) {
    // Retry pending queue first
    await retryPendingSync().catch(() => {});
    return syncAllData(progressCallback);
  }

  // ── loadSyncedData ───────────────────────────────────────────────────────────

  async function loadSyncedData(dataType) {
    if (!_ensureClient()) return { success: false, error: 'No client', data: [] };
    const uid = await _getUid();
    if (!uid) return { success: false, error: 'Not authenticated', data: [] };

    try {
      const prefix = `${dataType}:`;
      const { data, error } = await _supabase
        .from('sync_data')
        .select('key, value, updated_at, device_id')
        .eq('user_id', uid)
        .like('key', `${prefix}%`)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const items = (data || []).map(row => ({
        id: row.key.slice(prefix.length),
        value: row.value,
        meta: { updatedAt: row.updated_at, updatedByDeviceId: row.device_id }
      }));

      return { success: true, data: items };
    } catch (err) {
      return { success: false, error: err.message, data: [] };
    }
  }

  // ── Pending queue retry ─────────────────────────────────────────────────────

  async function retryPendingSync() {
    const result = await new Promise(resolve =>
      api_local.storage.local.get([STORAGE_KEYS.PENDING_QUEUE], r =>
        resolve(r[STORAGE_KEYS.PENDING_QUEUE] || [])
      )
    );
    if (!result.length) return { success: true, message: 'No pending operations' };

    const uid = await _getUid();
    if (!uid) return { success: false, error: 'Not authenticated' };

    const failed = [];
    let processed = 0;

    for (const op of result) {
      const delay = Math.min(Math.pow(2, op.retryCount || 0) * 1000, 60000);
      if (Date.now() - (op.timestamp || 0) < delay) { failed.push(op); continue; }

      const r = await _upsertKey(uid, op.dataType, op.documentId, op.data);
      if (r.success) {
        processed++;
      } else {
        op.retryCount = (op.retryCount || 0) + 1;
        op.timestamp = Date.now();
        failed.push(op);
      }
    }

    await new Promise(resolve =>
      api_local.storage.local.set({ [STORAGE_KEYS.PENDING_QUEUE]: failed }, resolve)
    );

    return { success: true, processed, failed: failed.length };
  }

  // ── Full backup (replaces cloudSyncCore) ────────────────────────────────────

  async function _gatherBackupData() {
    const [allData, commands] = await Promise.all([
      api_local.storage.local.get(),
      api_local.commands ? api_local.commands.getAll() : Promise.resolve([])
    ]);

    const settings = allData.settings || {};
    const settingsClean = { ...settings };
    delete settingsClean.floatingButtonCustomIcons;

    const summaryHistoryKeys = Object.keys(allData).filter(k => k.startsWith('summary_history_'));
    const summaryHistoryData = {};
    for (const key of summaryHistoryKeys) {
      summaryHistoryData[key] = allData[key];
    }

    return {
      items: Array.isArray(allData.items) ? allData.items : [],
      categories: Array.isArray(allData.categories) ? allData.categories : [],
      selectedCategory: allData.selectedCategory || 'none',
      notes: Array.isArray(allData.sidebarNotes) ? allData.sidebarNotes : [],
      noteFolders: Array.isArray(allData.sidebarNoteFolders) ? allData.sidebarNoteFolders : [],
      notesUi: allData.sidebarNotesUi || null,
      trash: Array.isArray(allData.trashItems) ? allData.trashItems : [],
      notesTrash: Array.isArray(allData.sidebarNotesTrash) ? allData.sidebarNotesTrash : [],
      promptTemplates: Array.isArray(allData.summaryPromptTemplates) ? allData.summaryPromptTemplates : null,
      categoryPickerLastLocation: allData.categoryPickerLastLocation || null,
      summaryModePreference: allData.summaryModePreference || null,
      summaryHistoryIndex: allData.summaryHistoryIndex || null,
      summaryHistory: summaryHistoryData,
      summaryHistoryFlat: Array.isArray(allData.summaryHistory) ? allData.summaryHistory : [],
      attachments: allData.sidebarNoteAttachments || null,
      settings: settingsClean,
      shortcuts: commands.map(c => ({ name: c.name, shortcut: c.shortcut })),
      pomodoroState: allData.pomodoroState || null,
      pomodoroHistory: Array.isArray(allData.pomodoroHistory) ? allData.pomodoroHistory : [],
      uiPrefs: {
        lpPickerWidth: allData.lpPickerWidth || null,
        lpPickerHeight: allData.lpPickerHeight || null,
        lpPickerOpacity: allData.lpPickerOpacity !== undefined ? allData.lpPickerOpacity : null,
        floatingSizeOverride: allData.floatingSizeOverride || null,
        selectionPopupPosition: allData['__lpSelectionSearchPopupPosition'] || null
      },
      sidebarAiEnabled: allData.sidebarAiEnabled || false,
      cloudAutoSync: allData.cloud_auto_sync !== undefined ? allData.cloud_auto_sync : true,
      summaryTonePreference: allData.summaryTonePreference || null,
      summaryCustomPrompt: typeof allData.summaryCustomPrompt === 'string' ? allData.summaryCustomPrompt : null,
      meta: { exportedAt: new Date().toISOString(), version: 3 }
    };
  }

  async function uploadBackup(uid, progressCallback) {
    if (!_ensureClient()) throw new Error('Supabase not initialised');
    if (!uid) throw new Error('Invalid UID');

    if (typeof progressCallback === 'function') progressCallback({ phase: 'gather', progress: 0 });
    const backupData = await _gatherBackupData();
    const json = JSON.stringify(backupData);
    const bytes = json.length;

    if (typeof progressCallback === 'function') progressCallback({ phase: 'upload', progress: 0.1 });

    const { error } = await _supabase
      .from('backup_data')
      .upsert({
        user_id: uid,
        backup_json: json,
        size_bytes: bytes,
        exported_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) throw new Error(error.message);

    if (typeof progressCallback === 'function') progressCallback({ phase: 'upload', progress: 1 });
    _trackWrite(1);
    return { success: true, size: bytes, parts: 1 };
  }

  async function downloadBackup(uid) {
    if (!_ensureClient()) throw new Error('Supabase not initialised');
    if (!uid) throw new Error('Invalid UID');

    const { data, error } = await _supabase
      .from('backup_data')
      .select('backup_json, exported_at')
      .eq('user_id', uid)
      .single();

    if (error || !data) return { success: false, error: 'no_backup' };

    try {
      const parsed = JSON.parse(data.backup_json);
      return { success: true, data: parsed };
    } catch {
      return { success: false, error: 'parse_failed' };
    }
  }

  async function backupExists(uid) {
    if (!_ensureClient()) return false;
    try {
      const { data } = await _supabase
        .from('backup_data')
        .select('user_id')
        .eq('user_id', uid)
        .single();
      return !!data;
    } catch { return false; }
  }

  // ── Misc ─────────────────────────────────────────────────────────────────────

  async function isSyncEnabled() {
    return new Promise(resolve =>
      api_local.storage.local.get([STORAGE_KEYS.SYNC_ENABLED], r =>
        resolve(r[STORAGE_KEYS.SYNC_ENABLED] !== false)
      )
    );
  }

  async function setSyncEnabled(enabled) {
    return new Promise(resolve =>
      api_local.storage.local.set({ [STORAGE_KEYS.SYNC_ENABLED]: enabled }, resolve)
    );
  }

  async function getLastSyncTime() {
    return new Promise(resolve =>
      api_local.storage.local.get([STORAGE_KEYS.LAST_SYNC_TIME], r =>
        resolve(r[STORAGE_KEYS.LAST_SYNC_TIME] || 0)
      )
    );
  }

  function checkFirestoreAccess() {
    // Compatibility shim — Supabase doesn't need a separate access check
    return Promise.resolve({ accessible: true });
  }

  const moduleApi = {
    // Init
    initializeSync,
    initializeFirestore: initializeSync,         // backward compat
    initializeCloudSync: () => _ensureClient(),  // backward compat
    // Sync
    syncData, syncAllData, manualSync, loadSyncedData, retryPendingSync,
    checkFirestoreAccess,
    // Backup (cloudSyncCore compat)
    gatherBackupData: _gatherBackupData,
    uploadBackup, downloadBackup, backupExists,
    // Utils
    isSyncEnabled, setSyncEnabled, getLastSyncTime,
    SCHEMA_VERSION,
    _getFirestoreInstance: () => null  // compat shim
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = moduleApi;
  if (globalScope && typeof globalScope === 'object') {
    globalScope.LocalPocketFirestoreSyncCore = moduleApi;  // backward compat
    globalScope.LocalPocketCloudSyncCore = moduleApi;       // backward compat
    globalScope.LocalPocketSupabaseSyncCore = moduleApi;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
