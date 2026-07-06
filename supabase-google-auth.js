/**
 * Supabase Google Sign-In Handler for Background Script
 * Uses browser.identity.launchWebAuthFlow with fallback to opening OAuth tab
 */

(function attachSupabaseGoogleAuthHandler() {
  'use strict';

  const api = typeof browser !== 'undefined' ? browser : chrome;
  const SUPABASE_URL = 'https://ybrghrwoqajhjucnxcgh.supabase.co';

  // Get OAuth redirect URL based on target environment
  function getRedirectUrl(useIdentity = false) {
    if (useIdentity && api.identity && typeof api.identity.getRedirectURL === 'function') {
      return api.identity.getRedirectURL();
    }
    return api.runtime.getURL('options.html');
  }

  // Helper to decode JWT and store in extension local storage
  function decodeAndStoreTokens(accessToken, refreshToken, tabId = null) {
    if (!accessToken) return null;

    // Decode JWT
    let payload;
    try {
      const parts = accessToken.split('.');
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
      payload = JSON.parse(atob(padded));
    } catch (e) {
      console.error('[SupabaseAuth] JWT decode failed:', e);
      return null;
    }

    const uid = payload.sub;
    const email = payload.email;
    if (!uid) return null;

    console.log('[SupabaseAuth] Signed in successfully as:', email);

    // Store credentials
    api.storage.local.set({
      firebase_id_token: accessToken,
      firebase_user_uid: uid,
      firebase_user_email: email,
      supabase_refresh_token: refreshToken
    }, () => {
      // Notify options page tab if tabId is provided
      if (tabId !== null) {
        api.tabs.sendMessage(tabId, {
          type: 'supabase_oauth_tokens',
          accessToken,
          refreshToken,
          user: { uid, email }
        }).catch(() => {});
      }

      // Broadcast success message to all extension components
      api.runtime.sendMessage({
        type: 'supabase_google_signin_success',
        type2: 'firebase_google_signin_success',
        user: { uid, email },
        token: accessToken,
        refreshToken
      }).catch(() => {});

      // Init sync
      const syncMod = typeof LocalPocketSupabaseSyncCore !== 'undefined'
        ? LocalPocketSupabaseSyncCore : null;
      if (syncMod) syncMod.initializeSync();
    });

    return { uid, email };
  }

  // Detect when Supabase redirects back to our options.html with tokens in hash (for tab fallback flow)
  api.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const url = changeInfo.url || '';
    if (!url) return;

    const optionsUrl = getRedirectUrl(false);
    // Check if this tab is our options.html AND has OAuth tokens
    if (!url.startsWith(optionsUrl.replace('options.html', '')) && !url.includes('/options.html')) return;

    const hashIdx = url.indexOf('#');
    if (hashIdx < 0) return;
    const fragment = url.slice(hashIdx + 1);
    if (!fragment.includes('access_token=')) return;

    console.log('[SupabaseAuth] OAuth callback detected in tab');

    const params = new URLSearchParams(fragment);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token') || '';

    decodeAndStoreTokens(accessToken, refreshToken, tabId);
  });

  // Handle sign-in request — use launchWebAuthFlow if available, fall back to opening OAuth tab
  async function handleGoogleSignIn() {
    try {
      const useIdentity = !!(api.identity && typeof api.identity.launchWebAuthFlow === 'function');
      const redirectTo = getRedirectUrl(useIdentity);
      const authUrl = `${SUPABASE_URL}/auth/v1/authorize?` +
        `provider=google` +
        `&redirect_to=${encodeURIComponent(redirectTo)}` +
        `&scopes=email%20profile`;

      if (useIdentity) {
        console.log('[SupabaseAuth] Initiating launchWebAuthFlow, redirect_to:', redirectTo);
        
        const responseUrl = await new Promise((resolve, reject) => {
          api.identity.launchWebAuthFlow({
            url: authUrl,
            interactive: true
          }, (redirectUrl) => {
            if (api.runtime.lastError) {
              reject(new Error(api.runtime.lastError.message));
            } else if (!redirectUrl) {
              reject(new Error('Sign-in flow cancelled or returned no URL'));
            } else {
              resolve(redirectUrl);
            }
          });
        });

        console.log('[SupabaseAuth] launchWebAuthFlow succeeded');

        // Parse token and refresh token from the returned redirect URL's hash fragment
        const hashIdx = responseUrl.indexOf('#');
        if (hashIdx >= 0) {
          const fragment = responseUrl.slice(hashIdx + 1);
          const params = new URLSearchParams(fragment);
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token') || '';
          const errorDescription = params.get('error_description');

          if (accessToken) {
            const user = decodeAndStoreTokens(accessToken, refreshToken);
            if (user) {
              return { success: true, user, token: accessToken, refreshToken };
            }
          } else if (errorDescription) {
            throw new Error(errorDescription);
          }
        }
        throw new Error('No access token found in redirect URL');
      } else {
        console.log('[SupabaseAuth] launchWebAuthFlow not supported, falling back to opening OAuth tab, redirect_to:', redirectTo);

        await new Promise((resolve, reject) => {
          api.tabs.create({ url: authUrl }, (tab) => {
            if (api.runtime.lastError) reject(new Error(api.runtime.lastError.message));
            else resolve(tab);
          });
        });

        return { success: true, message: 'Google Sign-In tab opened' };
      }
    } catch (err) {
      console.error('[SupabaseAuth] Error in handleGoogleSignIn:', err);
      return { success: false, error: err.message };
    }
  }

  api.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'firebase_google_signin' || request.type === 'supabase_google_signin') {
      handleGoogleSignIn().then(sendResponse).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }
  });

  console.log('[SupabaseAuth] Google Sign-In handler loaded');
  console.log('[SupabaseAuth] Default OAuth redirect URL:', getRedirectUrl(true));
})();
