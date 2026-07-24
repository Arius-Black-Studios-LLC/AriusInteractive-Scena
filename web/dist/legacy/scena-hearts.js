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
  };
})();
