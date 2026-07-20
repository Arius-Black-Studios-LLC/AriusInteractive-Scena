/**
 * Scena — episode comments with replies & reactions (Supabase + local fallback).
 */
(function () {
  var REACTIONS = ["❤️", "👍", "😂", "✨"];
  var cache = {};

  function getClient() {
    return window.ScenaAuth && ScenaAuth.getClient ? ScenaAuth.getClient() : null;
  }

  function useCloud() {
    return window.ScenaAuth && ScenaAuth.isConfigured && ScenaAuth.isConfigured() && !!getClient();
  }

  function storageKey(seriesId, episodeId) {
    return "scena.comments." + seriesId + "." + episodeId;
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

  function normalizeAuthor(comment) {
    if (comment.author && typeof comment.author === "object") {
      return {
        userId: comment.author.userId || comment.userId || null,
        displayName: comment.author.displayName || "Reader",
        username: comment.author.username || "",
        pronouns: comment.author.pronouns || "",
        avatarUrl: comment.author.avatarUrl || "",
      };
    }
    return {
      userId: comment.userId || null,
      displayName: String(comment.author || "Reader").trim() || "Reader",
      username: "",
      pronouns: "",
      avatarUrl: "",
    };
  }

  function normalizeComment(comment) {
    comment.author = normalizeAuthor(comment);
    comment.reactions = comment.reactions && typeof comment.reactions === "object" ? comment.reactions : {};
    comment.parentId = comment.parentId || null;
    comment.text = comment.text || comment.body || "";
    return comment;
  }

  function buildAuthor(profile) {
    var userId = userIdFrom(profile);
    if (!userId) return null;
    var author = window.ScenaProfile
      ? ScenaProfile.authorSnapshot(profile)
      : {
        userId: userId,
        displayName: profile.displayName || "Reader",
        username: profile.username || "",
        pronouns: profile.pronouns || "",
        avatarUrl: profile.avatarUrl || "",
      };
    if (author && !author.userId) author.userId = userId;
    return author;
  }

  function threadComments(flat) {
    var top = [];
    var byId = {};
    flat.forEach(function (c) {
      byId[c.id] = c;
      c.replies = [];
    });
    flat.forEach(function (c) {
      if (c.parentId && byId[c.parentId]) byId[c.parentId].replies.push(c);
      else if (!c.parentId) top.push(c);
    });
    top.sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
    top.forEach(function (c) {
      c.replies.sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
    });
    return top;
  }

  function buildReactionsMap(rows) {
    var map = {};
    (rows || []).forEach(function (row) {
      if (!map[row.comment_id]) map[row.comment_id] = {};
      if (!map[row.comment_id][row.emoji]) map[row.comment_id][row.emoji] = [];
      map[row.comment_id][row.emoji].push(row.user_id);
    });
    return map;
  }

  function rowToComment(row, reactionsMap) {
    return normalizeComment({
      id: row.id,
      userId: row.user_id,
      author: row.author,
      parentId: row.parent_id,
      text: row.body,
      reactions: reactionsMap[row.id] || {},
      createdAt: row.created_at,
    });
  }

  function setCacheFlat(seriesId, episodeId, flat) {
    cache[cacheKey(seriesId, episodeId)] = flat.map(normalizeComment);
    if (!useCloud()) writeLocal(storageKey(seriesId, episodeId), cache[cacheKey(seriesId, episodeId)]);
  }

  function getCacheFlat(seriesId, episodeId) {
    var key = cacheKey(seriesId, episodeId);
    if (cache[key]) return cache[key].slice();
    if (!useCloud()) return readLocal(storageKey(seriesId, episodeId)).map(normalizeComment);
    return [];
  }

  function loadFromCloud(seriesId, episodeId) {
    var sb = getClient();
    if (!sb) return Promise.resolve([]);

    return sb.from("episode_comments")
      .select("id, series_id, episode_id, user_id, parent_id, body, author, created_at")
      .eq("series_id", seriesId)
      .eq("episode_id", episodeId)
      .order("created_at", { ascending: true })
      .then(function (result) {
        if (result.error) throw result.error;
        var comments = result.data || [];
        if (!comments.length) return [];
        var ids = comments.map(function (c) { return c.id; });
        return sb.from("comment_reactions")
          .select("comment_id, user_id, emoji")
          .in("comment_id", ids)
          .then(function (reactResult) {
            if (reactResult.error) throw reactResult.error;
            var reactionsMap = buildReactionsMap(reactResult.data || []);
            return comments.map(function (row) { return rowToComment(row, reactionsMap); });
          });
      });
  }

  window.ScenaComments = {
    REACTIONS: REACTIONS,

    load: function (seriesId, episodeId) {
      if (!seriesId || !episodeId) return Promise.resolve([]);
      if (!useCloud()) {
        setCacheFlat(seriesId, episodeId, readLocal(storageKey(seriesId, episodeId)));
        return Promise.resolve(getCacheFlat(seriesId, episodeId));
      }
      return loadFromCloud(seriesId, episodeId).then(function (flat) {
        setCacheFlat(seriesId, episodeId, flat);
        return flat;
      }).catch(function () {
        setCacheFlat(seriesId, episodeId, readLocal(storageKey(seriesId, episodeId)));
        return getCacheFlat(seriesId, episodeId);
      });
    },

    listFlat: function (seriesId, episodeId) {
      if (!seriesId || !episodeId) return [];
      return getCacheFlat(seriesId, episodeId);
    },

    list: function (seriesId, episodeId) {
      return threadComments(this.listFlat(seriesId, episodeId));
    },

    findById: function (seriesId, episodeId, commentId) {
      if (!commentId) return null;
      return this.listFlat(seriesId, episodeId).find(function (c) { return c.id === commentId; }) || null;
    },

    add: function (seriesId, episodeId, text, authorProfile, parentId) {
      text = String(text || "").trim();
      if (!seriesId || !episodeId || !text) return Promise.resolve(null);
      var author = buildAuthor(authorProfile);
      if (!author) return Promise.resolve(null);

      if (parentId) {
        var parent = this.findById(seriesId, episodeId, parentId);
        if (!parent) return Promise.resolve(null);
      }

      if (!useCloud()) {
        var key = storageKey(seriesId, episodeId);
        var list = getCacheFlat(seriesId, episodeId);
        var comment = {
          id: "c_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
          userId: author.userId,
          author: author,
          parentId: parentId || null,
          text: text,
          reactions: {},
          createdAt: new Date().toISOString(),
        };
        list.push(comment);
        setCacheFlat(seriesId, episodeId, list);
        return Promise.resolve(comment);
      }

      var sb = getClient();
      return sb.from("episode_comments").insert({
        series_id: seriesId,
        episode_id: episodeId,
        user_id: author.userId,
        parent_id: parentId || null,
        body: text,
        author: author,
      }).select("id, series_id, episode_id, user_id, parent_id, body, author, created_at")
        .single()
        .then(function (result) {
          if (result.error) throw result.error;
          return window.ScenaComments.load(seriesId, episodeId).then(function () {
            return window.ScenaComments.findById(seriesId, episodeId, result.data.id);
          });
        })
        .catch(function () { return null; });
    },

    reactionCount: function (comment, emoji) {
      if (!comment || !comment.reactions) return 0;
      var list = comment.reactions[emoji];
      return Array.isArray(list) ? list.length : 0;
    },

    hasReaction: function (comment, emoji, profile) {
      var userId = userIdFrom(profile);
      if (!comment || !comment.reactions || !userId) return false;
      var list = comment.reactions[emoji];
      return Array.isArray(list) && list.indexOf(userId) >= 0;
    },

    toggleReaction: function (seriesId, episodeId, commentId, emoji, profile) {
      if (REACTIONS.indexOf(emoji) < 0) return Promise.resolve(null);
      var userId = userIdFrom(profile);
      if (!seriesId || !episodeId || !commentId || !userId) return Promise.resolve(null);

      var flat = getCacheFlat(seriesId, episodeId);
      var comment = flat.find(function (c) { return c.id === commentId; });
      if (!comment) return Promise.resolve(null);

      var had = this.hasReaction(comment, emoji, profile);

      if (!useCloud()) {
        comment.reactions = comment.reactions || {};
        comment.reactions[emoji] = comment.reactions[emoji] || [];
        var idx = comment.reactions[emoji].indexOf(userId);
        if (idx >= 0) comment.reactions[emoji].splice(idx, 1);
        else comment.reactions[emoji].push(userId);
        if (!comment.reactions[emoji].length) delete comment.reactions[emoji];
        setCacheFlat(seriesId, episodeId, flat);
        return Promise.resolve({
          emoji: emoji,
          active: !had,
          count: (comment.reactions[emoji] || []).length,
        });
      }

      var sb = getClient();
      var op = had
        ? sb.from("comment_reactions").delete().match({ comment_id: commentId, user_id: userId, emoji: emoji })
        : sb.from("comment_reactions").insert({ comment_id: commentId, user_id: userId, emoji: emoji });

      return op.then(function (result) {
        if (result.error) throw result.error;
        return window.ScenaComments.load(seriesId, episodeId).then(function () {
          var updated = window.ScenaComments.findById(seriesId, episodeId, commentId);
          return {
            emoji: emoji,
            active: !had,
            count: updated ? window.ScenaComments.reactionCount(updated, emoji) : 0,
          };
        });
      }).catch(function () { return null; });
    },
  };
})();
