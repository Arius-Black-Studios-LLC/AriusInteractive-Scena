/**
 * Arleco — Supabase password auth (browser)
 */
(function () {
  var client = null;
  // Captured before Supabase strips the tokens out of the URL.
  var landedFromRecoveryLink = /(^|[#&])type=recovery(&|$)/.test(window.location.hash || "");

  function getConfig() {
    return window.ARLECO_CONFIG || window.SCENA_CONFIG || {};
  }

  function isConfigured() {
    var c = getConfig();
    var url = String(c.supabaseUrl || "").trim();
    var key = String(c.supabaseAnonKey || "").trim();
    if (!url || !key) return false;
    if (/YOUR_PROJECT|YOUR_ANON|test\.supabase\.co/i.test(url)) return false;
    if (/YOUR_ANON|test-key|^YOUR_/i.test(key)) return false;
    return true;
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (!client && window.supabase) {
      client = window.supabase.createClient(getConfig().supabaseUrl, getConfig().supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          // Email links (recovery, confirmation, magic link) must work when opened
          // on a different device than the one that requested them. PKCE keeps the
          // verifier in the requesting browser's storage, so it cannot.
          flowType: "implicit",
        },
      });
    }
    return client;
  }

  function redirectUrl() {
    var cfg = getConfig();
    var currentOrigin = window.location.origin;
    var configured = String(cfg.authRedirectUrl || "").trim();
    if (configured) {
      try {
        var parsed = new URL(configured, currentOrigin);
        // Never send production users to a localhost or retired deployment URL.
        if (
          parsed.origin === currentOrigin &&
          !/^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname)
        ) {
          return parsed.origin + "/";
        }
      } catch (e) { /* use current origin */ }
    }
    return currentOrigin + "/";
  }

  function postLoginKey() {
    return "scena_post_login";
  }

  function setPostLogin(path) {
    try {
      if (path) sessionStorage.setItem(postLoginKey(), path);
      else sessionStorage.removeItem(postLoginKey());
    } catch (e) { /* private browsing */ }
  }

  function consumePostLogin() {
    try {
      var path = sessionStorage.getItem(postLoginKey()) || "";
      sessionStorage.removeItem(postLoginKey());
      return path;
    } catch (e) {
      return "";
    }
  }

  function cleanAuthUrl() {
    if (!window.history.replaceState) return;
    window.history.replaceState(
      {},
      document.title,
      isRecoveryLanding() ? "/account?reset=1" : window.location.pathname
    );
  }

  function pageName() {
    var parts = window.location.pathname.split("/");
    return parts[parts.length - 1] || "";
  }

  function isAlreadyOnPage(path) {
    if (!path) return true;
    var target = path.split("/").pop() || path;
    return pageName() === target;
  }

  function isRecoveryLanding() {
    return new URLSearchParams(window.location.search).get("reset") === "1";
  }

  function maybeRedirectAfterSignIn() {
    // Stay put while the user is choosing a new password.
    if (isRecoveryLanding()) return;
    var path = consumePostLogin();
    if (!path) return;
    if (isAlreadyOnPage(path)) return;
    window.location.href = path;
  }

  function projectRef() {
    var url = getConfig().supabaseUrl || "";
    var match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
    return match ? match[1] : "";
  }

  function readSessionFromStorage() {
    try {
      var stores = [localStorage, sessionStorage];
      for (var s = 0; s < stores.length; s++) {
        var store = stores[s];
        if (!store) continue;
        for (var i = 0; i < store.length; i++) {
          var k = store.key(i);
          if (!k || k.indexOf("sb-") !== 0) continue;
          if (k.indexOf("auth-token") < 0) continue;
          if (k.indexOf("code-verifier") >= 0) continue;
          var parsed = parseStoredSession(store.getItem(k));
          if (parsed) return parsed;
        }
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function parseStoredSession(raw) {
    if (!raw) return null;
    var data = JSON.parse(raw);
    if (Array.isArray(data) && data[0] && data[0].access_token) return data[0];
    if (data && data.access_token && data.user) return data;
    if (data && data.currentSession) return data.currentSession;
    if (data && data.session) return data.session;
    return null;
  }

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) reject(new Error(label || "Timed out"));
      }, ms);
      promise.then(function (value) {
        done = true;
        clearTimeout(timer);
        resolve(value);
      }).catch(function (err) {
        done = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  function finishInit(session) {
    if (window.ScenaAuth.onSessionChange) {
      window.ScenaAuth.onSessionChange(session);
    }
    if (session && landedFromRecoveryLink && !isRecoveryLanding()) {
      // Supabase falls back to the project Site URL when the redirect path is not
      // allow-listed, so send recovery landings to the password form ourselves.
      window.location.replace("/account?reset=1");
      return session;
    }
    if (session) {
      cleanAuthUrl();
    }
    return session;
  }

  window.ScenaAuth = {
    isConfigured: isConfigured,
    getClient: getClient,
    isFileProtocol: function () {
      return window.location.protocol === "file:";
    },

    getStoredSession: readSessionFromStorage,

    init: function () {
      var sb = getClient();
      if (!sb) return Promise.resolve(readSessionFromStorage());

      var cached = readSessionFromStorage();
      if (cached) {
        sb.auth.onAuthStateChange(function (event, session) {
          if (window.ScenaAuth.onSessionChange) {
            window.ScenaAuth.onSessionChange(session);
          }
          if (event === "SIGNED_IN" && session) {
            cleanAuthUrl();
            maybeRedirectAfterSignIn();
          }
        });
        finishInit(cached);
      }

      return withTimeout(sb.auth.getSession(), 5000, "Session check timed out").then(function (result) {
        var session = (result && result.data && result.data.session) || cached;
        if (!cached) {
          sb.auth.onAuthStateChange(function (event, session) {
            if (window.ScenaAuth.onSessionChange) {
              window.ScenaAuth.onSessionChange(session);
            }
            if (event === "SIGNED_IN" && session) {
              cleanAuthUrl();
              maybeRedirectAfterSignIn();
            }
          });
        }
        return finishInit(session);
      }).catch(function () {
        return finishInit(cached || null);
      });
    },

    signInWithEmail: function (email, role, postLoginPath) {
      var sb = getClient();
      if (!sb) {
        return Promise.reject(new Error("Supabase is not configured. Fill in docs/scena-config.js with your project URL and anon key."));
      }
      if (window.location.protocol === "file:") {
        return Promise.reject(new Error("This page is open as a file, not a website. Magic links need http://. Open http://127.0.0.1:5500/ instead (run docs\\serve.ps1 first if needed)."));
      }

      if (postLoginPath) {
        setPostLogin(postLoginPath);
      } else if (role === "creator") {
        setPostLogin("/studio");
      }

      return sb.auth.signInWithOtp({
        email: email,
        options: {
          emailRedirectTo: redirectUrl(),
          data: { intended_role: role || "reader" },
        },
      }).then(function (result) {
        if (result.error) throw result.error;
        return result;
      });
    },

    signInWithPassword: function (email, password) {
      var sb = getClient();
      if (!sb) {
        return Promise.reject(new Error("Supabase is not configured."));
      }
      return sb.auth.signInWithPassword({
        email: String(email || "").trim().toLowerCase(),
        password: password,
      }).then(function (result) {
        if (result.error) throw result.error;
        return result.data && result.data.session;
      });
    },

    signUpWithPassword: function (email, password, username, role) {
      var sb = getClient();
      if (!sb) {
        return Promise.reject(new Error("Supabase is not configured."));
      }
      var cleanUsername = String(username || "").trim();
      return sb.auth.signUp({
        email: String(email || "").trim().toLowerCase(),
        password: password,
        options: {
          emailRedirectTo: redirectUrl(),
          data: {
            username: cleanUsername,
            display_name: cleanUsername,
            intended_role: role || "creator",
          },
        },
      }).then(function (result) {
        if (result.error) throw result.error;
        var session = result.data && result.data.session;
        var user = result.data && result.data.user;
        if (!session || !user || !cleanUsername) return session;
        return sb.from("profiles").update({
          username: cleanUsername,
          display_name: cleanUsername,
          intended_role: role || "creator",
        }).eq("id", user.id).then(function (profileResult) {
          if (profileResult.error) throw profileResult.error;
          return session;
        });
      });
    },

    resetPassword: function (email) {
      var sb = getClient();
      if (!sb) {
        return Promise.reject(new Error("Supabase is not configured."));
      }
      return sb.auth.resetPasswordForEmail(
        String(email || "").trim().toLowerCase(),
        { redirectTo: window.location.origin + "/account?reset=1" }
      ).then(function (result) {
        if (result.error) throw result.error;
      });
    },

    updatePassword: function (password) {
      var sb = getClient();
      if (!sb) {
        return Promise.reject(new Error("Supabase is not configured."));
      }
      return sb.auth.updateUser({ password: password }).then(function (result) {
        if (result.error) throw result.error;
      });
    },

    signOut: function () {
      var sb = getClient();
      if (!sb) return Promise.resolve();
      return sb.auth.signOut();
    },

    getSession: function () {
      var sb = getClient();
      if (!sb) return Promise.resolve(null);
      return sb.auth.getSession().then(function (r) { return r.data.session; });
    },

    onSessionChange: null,
  };
})();
