/**
 * Arleco — episode hearts (Supabase + local fallback).
 */
(function () {
  var cache = {};

  function getClient() {
    return window.ScenaAuth && ScenaAuth.getClient ? ScenaAuth.getClient() : null;
  }

  function useCloud() {
    return window.ScenaAuth && ScenaAuth.isConfigured && ScenaAuth.isConfigured() && !!getClient();
  }

  function storageKey(seriesId, episodeId) {
    return "scena.hearts." + seriesId + "." + episodeId;
  }

  function cacheKey(seriesId, episodeId) {
    return seriesId + ":" + episodeId;
  }

  function readLocal(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function writeLocal(key, list) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }

  function userIdFrom(profile) {
    if (!profile) return null;
    return profile.userId || profile.id || null;
  }

  function setCache(seriesId, episodeId, list) {
    cache[cacheKey(seriesId, episodeId)] = list.slice();
    if (!useCloud()) writeLocal(storageKey(seriesId, episodeId), cache[cacheKey(seriesId, episodeId)]);
  }

  function getCache(seriesId, episodeId) {
    var key = cacheKey(seriesId, episodeId);
    if (cache[key]) return cache[key].slice();
    if (!useCloud()) return readLocal(storageKey(seriesId, episodeId));
    return [];
  }

  window.ScenaHearts = {
    load: function (seriesId, episodeId) {
      if (!seriesId || !episodeId) return Promise.resolve([]);

      if (!useCloud()) {
        setCache(seriesId, episodeId, readLocal(storageKey(seriesId, episodeId)));
        return Promise.resolve(getCache(seriesId, episodeId));
      }

      var sb = getClient();
      return sb.from("episode_hearts")
        .select("user_id, created_at")
        .eq("series_id", seriesId)
        .eq("episode_id", episodeId)
        .then(function (result) {
          if (result.error) throw result.error;
          var list = (result.data || []).map(function (row) {
            return { userId: row.user_id, createdAt: row.created_at };
          });
          setCache(seriesId, episodeId, list);
          return list;
        })
        .catch(function () {
          setCache(seriesId, episodeId, readLocal(storageKey(seriesId, episodeId)));
          return getCache(seriesId, episodeId);
        });
    },

    count: function (seriesId, episodeId) {
      if (!seriesId || !episodeId) return 0;
      return getCache(seriesId, episodeId).length;
    },

    isHearted: function (seriesId, episodeId, profile) {
      var userId = userIdFrom(profile);
      if (!seriesId || !episodeId || !userId) return false;
      return getCache(seriesId, episodeId).some(function (h) {
        return h.userId === userId;
      });
    },

    toggle: function (seriesId, episodeId, profile) {
      var userId = userIdFrom(profile);
      if (!seriesId || !episodeId || !userId) return Promise.resolve(null);

      var list = getCache(seriesId, episodeId);
      var idx = list.findIndex(function (h) { return h.userId === userId; });
      var hearted = idx < 0;

      if (!useCloud()) {
        if (idx >= 0) list.splice(idx, 1);
        else list.push({ userId: userId, createdAt: new Date().toISOString() });
        setCache(seriesId, episodeId, list);
        return Promise.resolve({ hearted: hearted, count: list.length });
      }

      var sb = getClient();
      var op = hearted
        ? sb.from("episode_hearts").insert({ series_id: seriesId, episode_id: episodeId, user_id: userId })
        : sb.from("episode_hearts").delete().match({ series_id: seriesId, episode_id: episodeId, user_id: userId });

      return op.then(function (result) {
        if (result.error) throw result.error;
        return window.ScenaHearts.load(seriesId, episodeId).then(function (loaded) {
          return { hearted: hearted, count: loaded.length };
        });
      }).catch(function () { return null; });
    },

    /** Distinct series the user has hearted (for “liked with updates” home rail). */
    listMyHeartedSeries: function (userId) {
      if (!userId) return Promise.resolve([]);
      if (!useCloud()) {
        var found = {};
        try {
          for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (!key || key.indexOf("scena.hearts.") !== 0) continue;
            var parts = key.split(".");
            if (parts.length < 4) continue;
            var seriesId = parts[2];
            var list = readLocal(key);
            if (list.some(function (h) { return h.userId === userId; })) {
              var latest = list.reduce(function (max, h) {
                return h.userId === userId && h.createdAt > max ? h.createdAt : max;
              }, "");
              if (!found[seriesId] || latest > found[seriesId]) found[seriesId] = latest;
            }
          }
        } catch (e) { /* ignore */ }
        return Promise.resolve(Object.keys(found).map(function (id) {
          return { seriesId: id, lastHeartedAt: found[id] };
        }));
      }
      var sb = getClient();
      return sb.from("episode_hearts")
        .select("series_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200)
        .then(function (res) {
          if (res.error) throw res.error;
          var bySeries = {};
          (res.data || []).forEach(function (row) {
            if (!row.series_id) return;
            if (!bySeries[row.series_id]) {
              bySeries[row.series_id] = row.created_at || "";
            }
          });
          return Object.keys(bySeries).map(function (id) {
            return { seriesId: id, lastHeartedAt: bySeries[id] };
          });
        })
        .catch(function () { return []; });
    },
  };
})();
