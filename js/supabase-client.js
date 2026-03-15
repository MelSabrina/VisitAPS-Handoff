/**
 * supabase-client.js — Supabase client initialization and auth helpers
 *
 * Provides:
 *   window.supabaseClient  — the Supabase client instance
 *   window.VisitAuth       — auth helper methods (login, logout, getSession, getUser)
 */

(function () {
  'use strict';

  var SUPABASE_URL = 'https://asmfwqsygqebhywujuvo.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_kYWhsnzlR3I8MO1ufQnDNA_skePVmct';

  // Initialize Supabase client
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.supabaseClient = client;

  // ── Auth helpers ──────────────────────────────────────────────────────────
  window.VisitAuth = {

    /**
     * Login with email and password
     * @param {string} email
     * @param {string} password
     * @returns {Promise<{user, session, error}>}
     */
    login: function (email, password) {
      return client.auth.signInWithPassword({
        email: email,
        password: password
      }).then(function (result) {
        if (result.error) {
          return { user: null, session: null, error: result.error };
        }
        return {
          user: result.data.user,
          session: result.data.session,
          error: null
        };
      });
    },

    /**
     * Logout — clears Supabase session
     * @returns {Promise<{error}>}
     */
    logout: function () {
      return client.auth.signOut().then(function (result) {
        sessionStorage.clear();
        return { error: result.error || null };
      });
    },

    /**
     * Get current session (from localStorage, managed by Supabase)
     * @returns {Promise<{session, error}>}
     */
    getSession: function () {
      return client.auth.getSession().then(function (result) {
        return {
          session: result.data.session,
          error: result.error || null
        };
      });
    },

    /**
     * Get current user from session
     * @returns {Promise<{user, error}>}
     */
    getUser: function () {
      return client.auth.getUser().then(function (result) {
        return {
          user: result.data.user || null,
          error: result.error || null
        };
      });
    },

    /**
     * Check if there's an active session
     * @returns {Promise<boolean>}
     */
    isLoggedIn: function () {
      return client.auth.getSession().then(function (result) {
        return !!(result.data.session);
      });
    },

    /**
     * Update the current user's password
     * @param {string} newPassword
     * @returns {Promise<{error}>}
     */
    updatePassword: function (newPassword) {
      return client.auth.updateUser({ password: newPassword }).then(function (result) {
        return { error: result.error || null };
      });
    }
  };

})();
