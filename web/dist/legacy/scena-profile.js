/**
 * Arleco — reader/creator account profile (display name, username, pronouns, avatar).
 */
(function () {
  var cache = {};

  function storageKey(userId) {
    return "scena.profile." + (userId || "local");
  }

  function readLocal(userId) {
    try {
      var raw = localStorage.getItem(storageKey(userId));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeLocal(userId, profile) {
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(profile));
      return true;
    } catch (e) {
      return false;
    }
  }

  function oauthAvatarFromUser(user) {
    var meta = (user && user.user_metadata) || {};
    return meta.avatar_url || meta.picture || meta.photo || "";
  }

  function defaultFromSession(session) {
    var user = session && session.user;
    if (!user) return null;
    var email = user.email || "";
    var meta = user.user_metadata || {};
    return {
      id: user.id,
      email: email,
      displayName: String(meta.full_name || meta.name || email.split("@")[0] || "Reader").trim() || "Reader",
      username: "",
      pronouns: "",
      avatarUrl: oauthAvatarFromUser(user),
    };
  }

  function normalize(row, sessionFallback) {
    var base = sessionFallback || {};
    return {
      id: row.id || base.id || null,
      email: row.email || base.email || "",
      displayName: String(row.display_name || row.displayName || base.displayName || "Reader").trim() || "Reader",
      username: String(row.username || base.username || "").trim(),
      pronouns: String(row.pronouns || base.pronouns || "").trim(),
      avatarUrl: row.avatar_url || row.avatarUrl || base.avatarUrl || "",
      adultVerifiedAt: row.adult_verified_at || row.adultVerifiedAt || base.adultVerifiedAt || "",
    };
  }

  function initials(profile) {
    var name = (profile && profile.displayName) || "?";
    var parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  function avatarColor(userId) {
    var id = String(userId || "anon");
    var hash = 0;
    for (var i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    return "hsl(" + (Math.abs(hash) % 360) + ", 42%, 40%)";
  }

  function authorSnapshot(profile) {
    if (!profile) return null;
    return {
      userId: profile.id || null,
      displayName: profile.displayName || "Reader",
      username: profile.username || "",
      pronouns: profile.pronouns || "",
      avatarUrl: profile.avatarUrl || "",
    };
  }

  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  window.ScenaProfile = {
    PRONOUN_OPTIONS: [
      "",
      "she/her",
      "he/him",
      "they/them",
      "she/they",
      "he/they",
      "any pronouns",
      "ask me",
    ],

    normalize: normalize,
    initials: initials,
    avatarColor: avatarColor,
    authorSnapshot: authorSnapshot,
    sessionProfile: defaultFromSession,

    isAdultVerified: function (profile) {
      return Boolean(profile && profile.adultVerifiedAt);
    },

    seriesNeedsAgeGate: function (series) {
      if (!series) return false;
      return (series.contentFlags || []).indexOf("sexual_content") >= 0;
    },

    /** Public author block for comments UI */
    renderAvatar: function (profile, className) {
      className = className || "comment-avatar";
      if (profile && profile.avatarUrl) {
        return '<img class="' + escapeAttr(className) + '" src="' + escapeAttr(profile.avatarUrl) + '" alt="">';
      }
      var color = avatarColor(profile && profile.userId ? profile.userId : (profile && profile.id));
      var label = initials(profile);
      return '<span class="' + escapeAttr(className) + ' comment-avatar--initials" style="background:' +
        escapeAttr(color) + '" aria-hidden="true">' + escapeHtml(label) + "</span>";
    },

    renderAuthorLine: function (author) {
      if (!author) return "Reader";
      var name = escapeHtml(author.displayName || "Reader");
      var handle = author.username ? " @" + escapeHtml(author.username) : "";
      var pronouns = author.pronouns
        ? ' <span class="comment-pronouns">(' + escapeHtml(author.pronouns) + ")</span>"
        : "";
      return name + handle + pronouns;
    },

    get: function (userId, session) {
      if (!userId) return Promise.resolve(null);
      if (cache[userId]) return Promise.resolve(cache[userId]);

      var fallback = defaultFromSession(session) || normalize({ id: userId }, { id: userId, displayName: "Reader" });
      var local = readLocal(userId);
      if (local) {
        cache[userId] = normalize(local, fallback);
      }

      if (!window.ScenaAuth || !ScenaAuth.getClient) {
        var cached = cache[userId] || fallback;
        cache[userId] = cached;
        return Promise.resolve(cached);
      }

      var sb = ScenaAuth.getClient();
      if (!sb) {
        cache[userId] = cache[userId] || fallback;
        return Promise.resolve(cache[userId]);
      }

      return sb.from("profiles")
        .select("id, email, display_name, username, pronouns, avatar_url")
        .eq("id", userId)
        .maybeSingle()
        .then(function (r) {
          var profile;
          if (r.error || !r.data) {
            profile = cache[userId] || fallback;
          } else {
            profile = normalize(r.data, fallback);
            if (local && local.avatarUrl && !profile.avatarUrl) {
              profile.avatarUrl = local.avatarUrl;
            }
          }
          cache[userId] = profile;
          writeLocal(userId, profile);
          return profile;
        })
        .catch(function () {
          cache[userId] = cache[userId] || fallback;
          return cache[userId];
        });
    },

    update: function (userId, patch, session) {
      if (!userId) return Promise.reject(new Error("Not signed in"));
      patch = patch || {};

      return ScenaProfile.get(userId, session).then(function (current) {
        var next = {
          id: userId,
          email: current.email,
          displayName: patch.displayName != null ? String(patch.displayName).trim() : current.displayName,
          username: patch.username != null ? String(patch.username).trim().replace(/^@/, "") : current.username,
          pronouns: patch.pronouns != null ? String(patch.pronouns).trim() : current.pronouns,
          avatarUrl: patch.avatarUrl != null ? patch.avatarUrl : current.avatarUrl,
          adultVerifiedAt: patch.adultVerifiedAt != null
            ? String(patch.adultVerifiedAt || "")
            : current.adultVerifiedAt || "",
        };

        if (!next.displayName) next.displayName = "Reader";

        if (next.username && !/^[a-zA-Z0-9_]{3,24}$/.test(next.username)) {
          return Promise.reject(new Error("Username must be 3–24 letters, numbers, or underscores."));
        }

        cache[userId] = next;
        writeLocal(userId, next);

        var sb = window.ScenaAuth && ScenaAuth.getClient ? ScenaAuth.getClient() : null;
        if (!sb) return next;

        var row = {
          display_name: next.displayName,
          username: next.username || null,
          pronouns: next.pronouns || null,
        };

        if (patch.avatarUrl != null) {
          if (next.avatarUrl && next.avatarUrl.length > 120000) {
            writeLocal(userId, next);
          } else {
            row.avatar_url = next.avatarUrl || null;
          }
        }

        return sb.from("profiles").update(row).eq("id", userId).then(function (r) {
          if (r.error) throw r.error;
          return next;
        });
      });
    },

    clearCache: function (userId) {
      if (userId) delete cache[userId];
      else cache = {};
    },
  };
})();
