/**
 * Supabase Authentication Core Module
 * Drop-in replacement for firebaseAuthCore.js
 * Uses Supabase Auth (email/password + Google OAuth)
 */

(function attachLocalPocketSupabaseAuthCore(globalScope) {
  'use strict';

  const STORAGE_KEYS = {
    ACCESS_TOKEN:  'firebase_id_token',    // keep same key names for compatibility
    USER_UID:      'firebase_user_uid',
    USER_EMAIL:    'firebase_user_email',
    REFRESH_TOKEN: 'supabase_refresh_token',
    DEVICE_ID:     'firebase_device_id'
  };

  let _supabase = null;
  let _authReadyResolve = null;
  let _authReadyPromise = new Promise(r => { _authReadyResolve = r; });
  let _authReady = false;
  let _authStateListeners = [];

  // ── Init ────────────────────────────────────────────────────────────────────

  function _getApi() {
    return typeof browser !== 'undefined' ? browser : chrome;
  }

  function _buildSupabaseClient(url, anonKey) {
    // Use the UMD build of @supabase/supabase-js loaded via supabase-js.js
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      console.error('[SupabaseAuth] supabase-js not loaded');
      return null;
    }
    return supabase.createClient(url, anonKey, {
      auth: {
        storage: {
          // Store tokens in chrome.storage.local instead of localStorage
          // (localStorage is not available in background service workers)
          async getItem(key) {
            return new Promise(resolve => {
              _getApi().storage.local.get(key, r => resolve(r[key] || null));
            });
          },
          async setItem(key, value) {
            return new Promise(resolve => {
              _getApi().storage.local.set({ [key]: value }, resolve);
            });
          },
          async removeItem(key) {
            return new Promise(resolve => {
              _getApi().storage.local.remove(key, resolve);
            });
          }
        },
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      }
    });
  }

  function initializeSupabaseAuth(config) {
    if (_supabase) return true;
    try {
      const url = (config && config.url) || (typeof supabaseConfig !== 'undefined' && supabaseConfig.url);
      const key = (config && config.anonKey) || (typeof supabaseConfig !== 'undefined' && supabaseConfig.anonKey);
      if (!url || !key || key === 'PASTE_YOUR_ANON_KEY_HERE') {
        console.error('[SupabaseAuth] Missing config');
        return false;
      }
      _supabase = _buildSupabaseClient(url, key);
      if (!_supabase) return false;

      // Listen for auth state changes
      _supabase.auth.onAuthStateChange(async (event, session) => {
        if (!_authReady) {
          _authReady = true;
          if (_authReadyResolve) { _authReadyResolve(); _authReadyResolve = null; }
        }
        if (session && session.user) {
          await _storeAuthData(session.user.id, session.user.email, session.access_token, session.refresh_token);
        } else if (event === 'SIGNED_OUT') {
          await _clearAuthData();
        }
        _notifyListeners(session ? session.user : null);
      });

      // Try to restore existing session
      _supabase.auth.getSession().then(({ data }) => {
        if (!_authReady) {
          _authReady = true;
          if (_authReadyResolve) { _authReadyResolve(); _authReadyResolve = null; }
        }
        if (data && data.session && data.session.user) {
          _storeAuthData(data.session.user.id, data.session.user.email, data.session.access_token, data.session.refresh_token);
        }
      }).catch(() => {
        if (!_authReady) {
          _authReady = true;
          if (_authReadyResolve) { _authReadyResolve(); _authReadyResolve = null; }
        }
      });

      return true;
    } catch (err) {
      console.error('[SupabaseAuth] init error:', err);
      return false;
    }
  }

  // ── Auth operations ─────────────────────────────────────────────────────────

  async function login(email, password) {
    if (!_supabase) return { success: false, error: 'Not initialized' };
    try {
      const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
      if (error) return { success: false, error: error.message };
      const user = data.user;
      await _storeAuthData(user.id, user.email, data.session.access_token, data.session.refresh_token);
      return { success: true, user: { uid: user.id, email: user.email }, token: data.session.access_token };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function register(email, password) {
    if (!_supabase) return { success: false, error: 'Not initialized' };
    try {
      const { data, error } = await _supabase.auth.signUp({ email, password });
      if (error) return { success: false, error: error.message };
      const user = data.user;
      if (data.session) {
        await _storeAuthData(user.id, user.email, data.session.access_token, data.session.refresh_token);
      }
      return { success: true, user: { uid: user.id, email: user.email } };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function loginWithGoogle() {
    // Trigger Google OAuth via Supabase — handled by supabase-google-auth.js
    return { success: true, redirect: true, message: 'Redirecting to Google Sign-In...' };
  }

  async function getRedirectResult() {
    // Handled by supabase-google-auth.js background listener
    return { success: false, error: 'Use Google Sign-In flow' };
  }

  async function logout() {
    if (!_supabase) return { success: false, error: 'Not initialized' };
    try {
      const { error } = await _supabase.auth.signOut();
      if (error) return { success: false, error: error.message };
      await _clearAuthData();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function getCurrentUser() {
    if (!_supabase) return null;
    try {
      const { data } = await _supabase.auth.getUser();
      if (data && data.user) return { uid: data.user.id, email: data.user.email };
      return null;
    } catch { return null; }
  }

  async function getIdToken(forceRefresh = false) {
    if (!_supabase) return null;
    try {
      if (forceRefresh) {
        const { data, error } = await _supabase.auth.refreshSession();
        if (error || !data.session) return null;
        await _storeAuthData(data.user.id, data.user.email, data.session.access_token, data.session.refresh_token);
        return data.session.access_token;
      }
      const { data } = await _supabase.auth.getSession();
      return data.session ? data.session.access_token : null;
    } catch { return null; }
  }

  async function isAuthenticated() {
    const stored = await getStoredAuthData();
    return !!(stored[STORAGE_KEYS.ACCESS_TOKEN] && stored[STORAGE_KEYS.USER_UID]);
  }

  async function waitForAuthReady(timeoutMs = 10000) {
    if (_authReady) return;
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Auth ready timeout')), timeoutMs)
    );
    await Promise.race([_authReadyPromise, timeout]);
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  async function _storeAuthData(uid, email, accessToken, refreshToken) {
    const api = _getApi();
    return new Promise(resolve => {
      const d = {
        [STORAGE_KEYS.ACCESS_TOKEN]: accessToken,
        [STORAGE_KEYS.USER_UID]: uid,
        [STORAGE_KEYS.USER_EMAIL]: email
      };
      if (refreshToken) d[STORAGE_KEYS.REFRESH_TOKEN] = refreshToken;
      api.storage.local.set(d, resolve);
    });
  }

  async function _clearAuthData() {
    const api = _getApi();
    return new Promise(resolve => {
      api.storage.local.remove([
        STORAGE_KEYS.ACCESS_TOKEN,
        STORAGE_KEYS.USER_UID,
        STORAGE_KEYS.USER_EMAIL,
        STORAGE_KEYS.REFRESH_TOKEN
      ], resolve);
    });
  }

  async function getStoredAuthData() {
    const api = _getApi();
    return new Promise(resolve => {
      api.storage.local.get([
        STORAGE_KEYS.ACCESS_TOKEN,
        STORAGE_KEYS.USER_UID,
        STORAGE_KEYS.USER_EMAIL
      ], r => resolve(r || {}));
    });
  }

  async function getDeviceId() {
    const api = _getApi();
    return new Promise(resolve => {
      api.storage.local.get([STORAGE_KEYS.DEVICE_ID], result => {
        if (result && result[STORAGE_KEYS.DEVICE_ID]) {
          resolve(result[STORAGE_KEYS.DEVICE_ID]);
          return;
        }
        const deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        api.storage.local.set({ [STORAGE_KEYS.DEVICE_ID]: deviceId }, () => resolve(deviceId));
      });
    });
  }

  function onAuthStateChanged(callback) {
    if (typeof callback === 'function') _authStateListeners.push(callback);
  }

  function removeAuthStateChangedListener(callback) {
    const i = _authStateListeners.indexOf(callback);
    if (i > -1) _authStateListeners.splice(i, 1);
  }

  function _notifyListeners(user) {
    _authStateListeners.forEach(cb => { try { cb(user); } catch (e) {} });
  }

  // Expose the raw Supabase client for sync modules
  function getSupabaseClient() { return _supabase; }

  const api = {
    initializeFirebaseAuth: initializeSupabaseAuth, // keep same name for compatibility
    initializeSupabaseAuth,
    login, register, loginWithGoogle, getRedirectResult,
    logout, getCurrentUser, getIdToken,
    onAuthStateChanged, removeAuthStateChangedListener,
    getStoredAuthData, getDeviceId, isAuthenticated, waitForAuthReady,
    getSupabaseClient,
    STORAGE_KEYS
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (globalScope && typeof globalScope === 'object') {
    globalScope.LocalPocketFirebaseAuthCore = api;      // backward compat
    globalScope.LocalPocketSupabaseAuthCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
