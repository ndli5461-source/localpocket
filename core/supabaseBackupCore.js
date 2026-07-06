/**
 * Supabase Backup Core Module
 * Handles backup and restore of full extension states to Supabase DB.
 */

(function attachLocalPocketSupabaseBackupCore(globalScope) {
  'use strict';

  const BACKUP_TABLE = 'cloud_backups';

  let supabaseClient = null;

  function initializeCloudSync() {
    if (supabaseClient) return true;
    try {
      const authCore = globalScope.LocalPocketSupabaseAuthCore;
      if (authCore && authCore._getSupabaseClient) {
        const shared = authCore._getSupabaseClient();
        if (shared) {
          supabaseClient = shared;
          return true;
        }
      }

      // Check if config is globally loaded
      const config = window.supabaseConfig;
      if (config && config.supabaseUrl && typeof supabase !== 'undefined') {
        supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseKey);
        return true;
      }

      console.error('Supabase client not available for backup initialization');
      return false;
    } catch (err) {
      console.error('Backup init error:', err);
      return false;
    }
  }

  async function gatherBackupData() {
    const api = typeof browser !== 'undefined' ? browser : chrome;
    const [allData, commands] = await Promise.all([
      api.storage.local.get(),
      api.commands ? api.commands.getAll() : Promise.resolve([])
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
      notesUi: allData.sidebarNotesUi && typeof allData.sidebarNotesUi === 'object' ? allData.sidebarNotesUi : null,
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

  function estimateBytes(str) {
    try {
      return new Blob([str]).size;
    } catch (e) {
      return str.length;
    }
  }

  /**
   * Upload Backup to Supabase
   */
  async function uploadBackup(uid, progressCallback) {
    if (!supabaseClient) throw new Error('Supabase not initialised');
    if (!uid) throw new Error('Invalid UID');

    if (typeof progressCallback === 'function') {
      progressCallback({ phase: 'gather', progress: 0 });
    }
    const backupData = await gatherBackupData();

    if (typeof progressCallback === 'function') {
      progressCallback({ phase: 'upload', progress: 0.1 });
    }

    const json = JSON.stringify(backupData);
    const bytes = estimateBytes(json);

    // Write full backup JSON payload in a single row
    const { error } = await supabaseClient
      .from(BACKUP_TABLE)
      .upsert({
        user_id: uid,
        backup_json: json,
        size: bytes,
        updated_at: Date.now()
      });

    if (error) {
      console.error('Supabase backup upload failed:', error.message);
      return { success: false, error: error.message };
    }

    if (typeof progressCallback === 'function') {
      progressCallback({ phase: 'upload', progress: 1 });
    }

    return { success: true, size: bytes, parts: 1 };
  }

  /**
   * Check if backup exists in Supabase
   */
  async function backupExists(uid) {
    if (!supabaseClient) return false;
    try {
      const { data, error } = await supabaseClient
        .from(BACKUP_TABLE)
        .select('updated_at')
        .eq('user_id', uid)
        .maybeSingle();

      if (error || !data) return false;
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Download Backup from Supabase
   */
  async function downloadBackup(uid) {
    if (!supabaseClient) throw new Error('Supabase not initialised');
    if (!uid) throw new Error('Invalid UID');

    try {
      const { data, error } = await supabaseClient
        .from(BACKUP_TABLE)
        .select('backup_json')
        .eq('user_id', uid)
        .maybeSingle();

      if (error) throw error;
      if (!data || !data.backup_json) return { success: false, error: 'no_backup' };

      const parsed = JSON.parse(data.backup_json);
      return { success: true, data: parsed };
    } catch (err) {
      console.error('Supabase backup download error:', err);
      return { success: false, error: 'download_failed' };
    }
  }

  const exportApi = {
    initializeCloudSync,
    gatherBackupData,
    uploadBackup,
    backupExists,
    downloadBackup
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = exportApi;
  if (globalScope && typeof globalScope === 'object') {
    globalScope.LocalPocketCloudSyncCore = exportApi;
    globalScope.LocalPocketSupabaseBackupCore = exportApi;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
