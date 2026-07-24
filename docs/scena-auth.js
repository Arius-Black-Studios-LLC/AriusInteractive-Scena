/**
 * Arleco — Supabase magic-link auth (browser)
 */
(function () {
  var client = null;

  function getConfig() {
    return window.ARLECO_CONFIG || window.SCENA_CONFIG || {};
  }

  function isConfigured() {
    var c = getConfig();
    return Boolean(c.supabaseUrl && c.supabaseAnonKey);
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (!client && window.supabase) {
      client = window.supabase.createClient(getConfig().supabaseUrl, getConfig().supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    }
    return client;
  }

  function redirectUrl() {
    var cfg = getConfig();
    if (cfg.authRedirectUrl) return cfg.authRedirectUrl;
    return window.location.origin + window.location.pathname;
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
    window.history.replaceState({}, document.title, redirectUrl());
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

  function maybeRedirectAfterSignIn() {
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
