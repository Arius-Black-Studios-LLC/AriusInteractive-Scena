/**
 * Scena — creator badges & achievements
 */
(function () {
  var LS_PREFIX = "scena_badges_";
  var LEGACY_LEARN_KEY = "scena_learn_progress";
  var currentUserId = null;
  var cache = null;

  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function storageKey(userId) {
    return LS_PREFIX + (userId || "local");
  }

  function defaultProgress() {
    return {
      unlocked: [],
      unlockedAt: {},
      stats: {
        lessonsCompleted: [],
        seriesCount: 0,
        publishedEpisodes: 0,
        totalReaders: 0,
      },
    };
  }

  function loadLocal(userId) {
    try {
      var raw = localStorage.getItem(storageKey(userId));
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return null;
  }

  function saveLocal(userId, data) {
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(data));
    } catch (e) { /* ignore */ }
  }

  function migrateLegacyLessons(progress) {
    try {
      var legacy = JSON.parse(localStorage.getItem(LEGACY_LEARN_KEY) || "{}");
      if (legacy.completed && legacy.completed.length) {
        legacy.completed.forEach(function (id) {
          if (progress.stats.lessonsCompleted.indexOf(id) < 0) {
            progress.stats.lessonsCompleted.push(id);
          }
        });
      }
    } catch (e) { /* ignore */ }
    return progress;
  }

  function uniq(arr) {
    var out = [];
    (arr || []).forEach(function (x) {
      if (x && out.indexOf(x) < 0) out.push(x);
    });
    return out;
  }

  function countPublishedEpisodes(userId) {
    if (!window.ScenaStore || !userId) return 0;
    var total = 0;
    ScenaStore.listSeries(userId).forEach(function (s) {
      (s.episodes || []).forEach(function (ep) {
        if (window.ScenaStore && ScenaStore.isEpisodePublic) {
          if (ScenaStore.isEpisodePublic(ep)) total++;
        } else if (ep.isLive) {
          total++;
        }
      });
    });
    return total;
  }

  function buildContext(userId) {
    var progress = window.ScenaBadges.getProgress(userId);
    var seriesCount = (window.ScenaStore && userId) ? ScenaStore.listSeries(userId).length : 0;
    return {
      lessonsCompleted: progress.stats.lessonsCompleted || [],
      seriesCount: seriesCount,
      publishedEpisodes: countPublishedEpisodes(userId),
      totalReaders: progress.stats.totalReaders || 0,
    };
  }

  var BADGES = [
    { id: "lesson_connect-two-nodes", title: "Through-line", description: "Master linking beats — the continuous thread Stanislavski called the through-line", icon: "🎭", category: "conservatory",
      test: function (c) { return c.lessonsCompleted.indexOf("connect-two-nodes") >= 0; } },
    { id: "lesson_spawn-from-port", title: "Wings", description: "Bring a new beat on from the wings — entrance without leaving the stage", icon: "🚪", category: "conservatory",
      test: function (c) { return c.lessonsCompleted.indexOf("spawn-from-port") >= 0; } },
    { id: "lesson_logic-metrics-reconverge", title: "Peripeteia", description: "Branch the plot through reversal, then reconverge — Aristotle's sudden turn of fortune", icon: "⚡", category: "conservatory",
      test: function (c) { return c.lessonsCompleted.indexOf("logic-metrics-reconverge") >= 0; } },
    { id: "lesson_metric-add-subtract", title: "Fate's ledger", description: "Add and subtract via signed amounts — positive adds, negative subtracts", icon: "📜", category: "conservatory",
      test: function (c) { return c.lessonsCompleted.indexOf("metric-add-subtract") >= 0; } },
    { id: "lesson_setup-character", title: "Casting call", description: "Fill the dramatis personae — name, color, and pose for your players", icon: "🎭", category: "conservatory",
      test: function (c) { return c.lessonsCompleted.indexOf("setup-character") >= 0; } },
    { id: "lesson_setup-stage", title: "Painted scene", description: "Build scenic flats and layers — the painted backdrop behind your dialogue", icon: "🏛", category: "conservatory",
      test: function (c) { return c.lessonsCompleted.indexOf("setup-stage") >= 0; } },
    { id: "lesson_inherit-visuals", title: "Curtain rise", description: "Block stage and player on the opening beat — inheritance, override, and parallax", icon: "🌙", category: "conservatory",
      test: function (c) { return c.lessonsCompleted.indexOf("inherit-visuals") >= 0; } },
    { id: "lesson_publish-episode", title: "Opening night", description: "Draw a chapter line and define Episode 1 — two endings, one published block", icon: "🎪", category: "conservatory",
      test: function (c) { return c.lessonsCompleted.indexOf("publish-episode") >= 0; } },
    { id: "lesson_sound-design", title: "Orchestration", description: "Inherited music, voice, and cues on the opening beat", icon: "🎵", category: "conservatory",
      test: function (c) { return c.lessonsCompleted.indexOf("sound-design") >= 0; } },
    { id: "lesson_route-gate-if-else", title: "Fork remembered", description: "Flow gate — if/else paths when distant choices steer a merged route", icon: "⎇", category: "conservatory",
      test: function (c) { return c.lessonsCompleted.indexOf("route-gate-if-else") >= 0; } },
    { id: "lesson_chapter-memory-routes", title: "Twin chapters", description: "Two chapter-two openings wired like Café at Sunset", icon: "☕", category: "conservatory",
      test: function (c) { return c.lessonsCompleted.indexOf("chapter-memory-routes") >= 0; } },
    { id: "lesson_metric-dialogue-branches", title: "Lines by metric", description: "Flow gate — branch to different beats when a metric crosses a threshold", icon: "📊", category: "conservatory",
      test: function (c) { return c.lessonsCompleted.indexOf("metric-dialogue-branches") >= 0; } },
    { id: "lesson_key-items-flow", title: "Brass key", description: "Key items and Flow gates — grant inventory, branch on has item, gate choices", icon: "🗝", category: "conservatory",
      test: function (c) { return c.lessonsCompleted.indexOf("key-items-flow") >= 0; } },
    { id: "lesson_choices-simple", title: "Fork in the road", description: "Plain Choices — wire paths with no hidden requirements", icon: "⑂", category: "conservatory",
      test: function (c) { return c.lessonsCompleted.indexOf("choices-simple") >= 0; } },
    { id: "lesson_choices-one-gate", title: "Whispers only", description: "Hide one option with a single prior-choice gate", icon: "🤫", category: "conservatory",
      test: function (c) { return c.lessonsCompleted.indexOf("choices-one-gate") >= 0; } },
    { id: "lesson_choices-two-required", title: "Two ways in", description: "One fork — key, lockpick, or empty; Unlock shows only with a tool", icon: "🔓", category: "conservatory",
      test: function (c) { return c.lessonsCompleted.indexOf("choices-two-required") >= 0; } },
    { id: "lesson_choices-or-same-path", title: "Both halves of the ticket", description: "Both medallions in one run — AND logic, old-house puzzle", icon: "🎫", category: "conservatory",
      test: function (c) { return c.lessonsCompleted.indexOf("choices-or-same-path") >= 0; } },
    { id: "lesson_metrics-affection-supplies", title: "Hearts & tallies", description: "Affection scores and potion tallies via Metrics blocks", icon: "💗", category: "conservatory",
      test: function (c) { return c.lessonsCompleted.indexOf("metrics-affection-supplies") >= 0; } },
    { id: "academy_graduate", title: "Globe laureate", description: "Complete every conservatory lesson — stagecraft worthy of the house", icon: "👑", category: "conservatory",
      test: function (c) {
        var required = ["connect-two-nodes", "spawn-from-port", "logic-metrics-reconverge", "metric-add-subtract", "setup-character", "setup-stage", "inherit-visuals", "publish-episode", "sound-design", "route-gate-if-else", "chapter-memory-routes", "metric-dialogue-branches", "key-items-flow", "choices-simple", "choices-one-gate", "choices-two-required", "choices-or-same-path", "metrics-affection-supplies"];
        return required.every(function (id) { return c.lessonsCompleted.indexOf(id) >= 0; });
      } },

    { id: "first_series", title: "First folio", description: "Draft your first serial — a play told across many acts", icon: "📖", category: "playwright",
      test: function (c) { return c.seriesCount >= 1; } },
    { id: "first_publish", title: "Opening night", description: "Raise the curtain on your first published episode", icon: "🎪", category: "playwright",
      test: function (c) { return c.publishedEpisodes >= 1; } },
    { id: "episodes_5", title: "Repertory", description: "Five episodes live — a rotating repertory for the house", icon: "🎬", category: "playwright",
      test: function (c) { return c.publishedEpisodes >= 5; } },
    { id: "episodes_10", title: "The canon", description: "Ten episodes published — a body of work for posterity", icon: "📚", category: "playwright",
      test: function (c) { return c.publishedEpisodes >= 10; } },

    { id: "first_reader", title: "First patron", description: "One soul in the house has witnessed your play", icon: "🎟", category: "house",
      test: function (c) { return c.totalReaders >= 1; } },
    { id: "readers_10", title: "Gallery rising", description: "Ten patrons — the gallery seats are filling", icon: "👥", category: "house",
      test: function (c) { return c.totalReaders >= 10; } },
    { id: "readers_100", title: "Standing room", description: "One hundred readers — standing room only at your show", icon: "⭐", category: "house",
      test: function (c) { return c.totalReaders >= 100; } },
    { id: "readers_1000", title: "Immortal chorus", description: "A thousand voices — the Greek chorus remembers your name", icon: "🏛", category: "house",
      test: function (c) { return c.totalReaders >= 1000; } },
  ];

  function badgeById(id) {
    return BADGES.find(function (b) { return b.id === id; }) || null;
  }

  function unlockBadge(progress, badgeId) {
    if (progress.unlocked.indexOf(badgeId) >= 0) return false;
    progress.unlocked.push(badgeId);
    progress.unlockedAt[badgeId] = new Date().toISOString();
    return true;
  }

  function syncCloud(userId, progress) {
    if (!userId || !window.ScenaAuth || !ScenaAuth.getClient) return Promise.resolve();
    var sb = ScenaAuth.getClient();
    if (!sb) return Promise.resolve();
    return sb.from("profiles").update({
      badges: progress.unlocked,
      creator_stats: {
        lessonsCompleted: progress.stats.lessonsCompleted,
        seriesCount: progress.stats.seriesCount,
        publishedEpisodes: progress.stats.publishedEpisodes,
        totalReaders: progress.stats.totalReaders,
        unlockedAt: progress.unlockedAt,
      },
    }).eq("id", userId).then(function () { return null; }).catch(function () { return null; });
  }

  function loadCloud(userId) {
    if (!userId || !window.ScenaAuth || !ScenaAuth.getClient) return Promise.resolve(null);
    var sb = ScenaAuth.getClient();
    if (!sb) return Promise.resolve(null);
    return sb.from("profiles").select("badges, creator_stats").eq("id", userId).maybeSingle()
      .then(function (r) {
        if (r.error || !r.data) return null;
        var stats = r.data.creator_stats || {};
        return {
          unlocked: r.data.badges || [],
          unlockedAt: stats.unlockedAt || {},
          stats: {
            lessonsCompleted: stats.lessonsCompleted || [],
            seriesCount: stats.seriesCount || 0,
            publishedEpisodes: stats.publishedEpisodes || 0,
            totalReaders: stats.totalReaders || 0,
          },
        };
      }).catch(function () { return null; });
  }

  function mergeProgress(local, remote) {
    var out = defaultProgress();
    var sources = [local, remote].filter(Boolean);
    sources.forEach(function (src) {
      (src.unlocked || []).forEach(function (id) {
        if (out.unlocked.indexOf(id) < 0) out.unlocked.push(id);
        if (src.unlockedAt && src.unlockedAt[id]) out.unlockedAt[id] = src.unlockedAt[id];
      });
      if (src.stats) {
        out.stats.lessonsCompleted = uniq(out.stats.lessonsCompleted.concat(src.stats.lessonsCompleted || []));
        out.stats.seriesCount = Math.max(out.stats.seriesCount, src.stats.seriesCount || 0);
        out.stats.publishedEpisodes = Math.max(out.stats.publishedEpisodes, src.stats.publishedEpisodes || 0);
        out.stats.totalReaders = Math.max(out.stats.totalReaders, src.stats.totalReaders || 0);
      }
    });
    return out;
  }

  window.ScenaBadges = {
    all: BADGES,

    init: function (userId) {
      currentUserId = userId || null;
      var local = migrateLegacyLessons(loadLocal(userId) || defaultProgress());
      cache = local;
      if (!userId) return Promise.resolve(cache);
      return loadCloud(userId).then(function (remote) {
        cache = mergeProgress(local, remote);
        saveLocal(userId, cache);
        return cache;
      });
    },

    getProgress: function (userId) {
      userId = userId || currentUserId;
      if (cache && (userId === currentUserId || !userId)) return cache;
      cache = migrateLegacyLessons(loadLocal(userId) || defaultProgress());
      return cache;
    },

    isUnlocked: function (badgeId, userId) {
      var p = this.getProgress(userId);
      return p.unlocked.indexOf(badgeId) >= 0;
    },

    lessonBadgeId: function (lessonId) {
      return "lesson_" + lessonId;
    },

    recordLessonComplete: function (lessonId, userId) {
      userId = userId || currentUserId;
      var progress = this.getProgress(userId);
      if (progress.stats.lessonsCompleted.indexOf(lessonId) < 0) {
        progress.stats.lessonsCompleted.push(lessonId);
      }
      return this.evaluate(userId, progress);
    },

    recordSeriesCreated: function (userId) {
      userId = userId || currentUserId;
      var progress = this.getProgress(userId);
      progress.stats.seriesCount = Math.max(progress.stats.seriesCount, (window.ScenaStore ? ScenaStore.listSeries(userId).length : 0));
      return this.evaluate(userId, progress);
    },

    recordEpisodePublished: function (userId) {
      userId = userId || currentUserId;
      var progress = this.getProgress(userId);
      progress.stats.publishedEpisodes = countPublishedEpisodes(userId);
      return this.evaluate(userId, progress);
    },

    recordReaders: function (totalReaders, userId) {
      userId = userId || currentUserId;
      var progress = this.getProgress(userId);
      progress.stats.totalReaders = Math.max(progress.stats.totalReaders || 0, totalReaders || 0);
      return this.evaluate(userId, progress);
    },

    evaluate: function (userId, progress) {
      userId = userId || currentUserId;
      progress = progress || this.getProgress(userId);
      var ctx = buildContext(userId);
      progress.stats.seriesCount = ctx.seriesCount;
      progress.stats.publishedEpisodes = ctx.publishedEpisodes;

      var newly = [];
      BADGES.forEach(function (badge) {
        if (progress.unlocked.indexOf(badge.id) >= 0) return;
        try {
          if (badge.test(ctx)) {
            if (unlockBadge(progress, badge.id)) newly.push(badge);
          }
        } catch (e) { /* ignore */ }
      });

      cache = progress;
      saveLocal(userId, progress);
      syncCloud(userId, progress);
      return newly;
    },

    checkAll: function (userId) {
      return this.evaluate(userId);
    },

    renderGrid: function (container, opts) {
      if (!container) return;
      opts = opts || {};
      var userId = opts.userId || currentUserId;
      var progress = this.getProgress(userId);
      var category = opts.category || null;
      var list = BADGES.filter(function (b) { return !category || b.category === category; });

      container.innerHTML =
        '<div class="badge-grid">' +
          list.map(function (badge) {
            var unlocked = progress.unlocked.indexOf(badge.id) >= 0;
            return '<div class="badge-card' + (unlocked ? " is-unlocked" : " is-locked") + '" title="' + escapeHtml(badge.description) + '">' +
              '<div class="badge-icon" aria-hidden="true">' + badge.icon + '</div>' +
              '<div class="badge-meta">' +
                '<strong>' + escapeHtml(badge.title) + '</strong>' +
                '<span>' + escapeHtml(badge.description) + '</span>' +
              '</div>' +
            '</div>';
          }).join("") +
        '</div>';
    },

    renderSummary: function (container, userId) {
      if (!container) return;
      userId = userId || currentUserId;
      var progress = this.getProgress(userId);
      var unlocked = progress.unlocked.length;
      var total = BADGES.length;
      container.innerHTML =
        '<p class="badge-summary-text"><strong>' + unlocked + '</strong> of ' + total + ' laurels earned</p>';
    },

    showUnlockCelebration: function (badges, toastFn) {
      if (!badges || !badges.length) return;
      badges.forEach(function (badge, i) {
        setTimeout(function () {
          var msg = "Laurel earned: " + badge.icon + " " + badge.title;
          if (typeof toastFn === "function") toastFn(msg);
          else if (window.ScenaBadges._defaultToast) window.ScenaBadges._defaultToast(msg);
        }, i * 400);
      });
    },
  };
})();
