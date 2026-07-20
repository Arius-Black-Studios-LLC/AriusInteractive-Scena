/**
 * Scena — public discover catalog (demos + published creator series).
 */
(function () {
  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  var DEMO_META = {
    "signal-lost": {
      genres: "scifi",
      cover: "d",
      flags: ["Sci-fi", "Strong language"],
      description: "Sci-fi mystery aboard Kerberos-9 — long chapters, dead comms, and a signal from inside the hull.",
      readersWeek: 1240,
    },
    "cafe-at-sunset": {
      genres: "romance",
      cover: "b",
      flags: ["Romance"],
      description: "A cozy romance with two playable chapters and too much matcha.",
      readersWeek: 680,
    },
  };

  function stableHash(str) {
    var hash = 0;
    var s = String(str || "");
    for (var i = 0; i < s.length; i++) {
      hash = ((hash << 5) - hash) + s.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function formatReaderCount(n) {
    n = parseInt(n, 10) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 10000) return Math.round(n / 1000) + "k";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return String(n);
  }

  function baselineReadersWeek(entry) {
    var meta = DEMO_META[entry.id];
    if (meta && meta.readersWeek) return meta.readersWeek;
    return 60 + (stableHash(entry.id) % 220) + (entry.liveCount || 1) * 35;
  }

  function resolveReaderStats(entries, cloudStats) {
    var bySeries = (cloudStats && (cloudStats.chaptersBySeries || cloudStats.readersBySeries)) || {};
    var enriched = (entries || []).map(function (entry) {
      var real = parseInt(bySeries[entry.id], 10) || 0;
      var display = real > 0 ? real : (entry.isDemo ? baselineReadersWeek(entry) : 0);
      return Object.assign({}, entry, {
        chaptersReadThisWeek: display,
        chaptersReadThisWeekLabel: formatReaderCount(display),
        readersThisWeek: display,
        readersThisWeekLabel: formatReaderCount(display),
      });
    });
    var realWeekly = cloudStats
      ? (parseInt(cloudStats.chaptersReadThisWeek, 10) ||
         parseInt(cloudStats.readersThisWeek, 10) || 0)
      : 0;
    var displayWeekly = realWeekly;
    if (!displayWeekly) {
      displayWeekly = enriched.reduce(function (sum, entry) {
        return sum + (entry.chaptersReadThisWeek || entry.readersThisWeek || 0);
      }, 0);
    }
    return {
      entries: enriched,
      chaptersReadThisWeek: displayWeekly,
      chaptersReadThisWeekLabel: formatReaderCount(displayWeekly),
      readersThisWeek: displayWeekly,
      readersThisWeekLabel: formatReaderCount(displayWeekly),
      readersSuffix: displayWeekly >= 1000 ? "+" : "",
    };
  }

  function isPublishedSeries(series) {
    if (!series) return false;
    if (series.status === "published") return true;
    return window.ScenaStore && ScenaStore.hasPublishedEpisodes(series);
  }

  function shouldListInCatalog(series) {
    if (!series || !series.id) return false;
    if (series.templateSource) return false;
    return isPublishedSeries(series);
  }

  function liveEpisodeLabel(series) {
    var eps = window.ScenaStore ? ScenaStore.orderedEpisodes(series) : (series.episodes || []);
    var live = eps.filter(function (ep) {
      return window.ScenaStore && ScenaStore.isEpisodePublic
        ? ScenaStore.isEpisodePublic(ep)
        : ep.isLive;
    });
    if (!live.length) return "";
    if (live.length === 1) return "Ch. 1";
    var maxNum = live.reduce(function (n, ep) {
      return Math.max(n, ep.number || 0);
    }, live.length);
    return "Ch. 1–" + maxNum;
  }

  function genreTags(series, demoMeta) {
    if (demoMeta && demoMeta.genres) return demoMeta.genres;
    var flags = series.contentFlags || [];
    if (!flags.length) return "story";
    return flags.join(" ");
  }

  function flagLabels(series, demoMeta) {
    if (demoMeta && demoMeta.flags) return demoMeta.flags;
    var keys = series.contentFlags || [];
    var defs = (window.ScenaStore && ScenaStore.CONTENT_FLAGS) || [];
    return keys.map(function (key) {
      var def = defs.find(function (item) { return item.key === key; });
      return def ? def.label : key;
    });
  }

  function coverKey(series, demoMeta, index) {
    if (demoMeta && demoMeta.cover) return demoMeta.cover;
    var keys = ["e", "f", "a", "c"];
    return keys[index % keys.length];
  }

  function entryFromSeries(series, opts) {
    opts = opts || {};
    var demoMeta = DEMO_META[series.id] || null;
    var desc = series.shortDescription || (demoMeta && demoMeta.description) || "Episodic visual novel on Scena.";
    var thumbStyle = series.thumbnailDataUrl
      ? (' style="background-image:url(' + escapeAttr(series.thumbnailDataUrl) + ');background-size:cover;background-position:center;background-repeat:no-repeat"')
      : "";
    return {
      id: series.id,
      title: series.title || "Untitled",
      description: desc,
      genres: genreTags(series, demoMeta),
      epLabel: liveEpisodeLabel(series),
      liveCount: (window.ScenaStore ? ScenaStore.orderedEpisodes(series) : (series.episodes || []))
        .filter(function (ep) {
          return window.ScenaStore && ScenaStore.isEpisodePublic
            ? ScenaStore.isEpisodePublic(ep)
            : ep.isLive;
        }).length,
      href: "series.html?series=" + encodeURIComponent(series.id),
      cover: coverKey(series, demoMeta, opts.index || 0),
      thumbStyle: thumbStyle,
      flags: flagLabels(series, demoMeta),
      updatedAt: series.updatedAt || "",
      isDemo: !!opts.isDemo,
      ownerId: opts.ownerId || null,
    };
  }

  function renderCard(entry) {
    var flagsHtml = (entry.flags || []).map(function (label) {
      return '<span class="flag">' + escapeHtml(label) + "</span>";
    }).join("");
    var readersHtml = (entry.chaptersReadThisWeekLabel || entry.readersThisWeekLabel)
      ? ('<div class="card-readers">' + escapeHtml(entry.chaptersReadThisWeekLabel || entry.readersThisWeekLabel) + " chapters read this week</div>")
      : "";
    return (
      '<div class="card-wrap">' +
        '<a class="card" href="' + escapeAttr(entry.href) + '" data-title="' + escapeAttr(entry.title) +
          '" data-genres="' + escapeAttr(entry.genres) + '" data-cover="' + escapeAttr(entry.cover) + '">' +
          '<div class="card-thumb' + (entry.thumbStyle ? " card-thumb--image" : "") + '"' + (entry.thumbStyle || "") + ">" +
            (entry.epLabel ? ('<span class="card-ep">' + escapeHtml(entry.epLabel) + "</span>") : "") +
          "</div>" +
          '<div class="card-body">' +
            '<div class="card-title">' + escapeHtml(entry.title) + "</div>" +
            '<div class="card-desc">' + escapeHtml(entry.description) + "</div>" +
            readersHtml +
            (flagsHtml ? ('<div class="flags">' + flagsHtml + "</div>") : "") +
          "</div>" +
        "</a>" +
      "</div>"
    );
  }

  function mergeEntries(existing, entry, seen) {
    if (!entry || !entry.id || seen[entry.id]) return;
    seen[entry.id] = true;
    existing.push(entry);
  }

  window.ScenaCatalog = {
    isPublishedSeries: isPublishedSeries,

    fetchReaderStats: function () {
      if (window.ScenaCloud && ScenaCloud.fetchPlatformReaderStats) {
        return ScenaCloud.fetchPlatformReaderStats();
      }
      return Promise.resolve(null);
    },

    enrichReaderStats: function (entries, cloudStats) {
      return resolveReaderStats(entries, cloudStats);
    },

    listDiscover: function (userId) {
      var entries = [];
      var seen = {};
      var index = 0;

      if (window.ScenaDemo && ScenaDemo.templateIds) {
        ScenaDemo.templateIds().forEach(function (id) {
          var series = ScenaDemo.getSeries(id);
          if (!series) return;
          mergeEntries(entries, entryFromSeries(series, { isDemo: true, index: index++ }), seen);
        });
      }

      var localPromise = window.ScenaStore && ScenaStore.ready
        ? ScenaStore.ready(userId)
        : Promise.resolve();

      return localPromise.then(function () {
        if (userId && window.ScenaStore) {
          ScenaStore.listSeries(userId).forEach(function (series) {
            if (!shouldListInCatalog(series)) return;
            mergeEntries(entries, entryFromSeries(series, { ownerId: userId, index: index++ }), seen);
          });
        }

        if (!window.ScenaCloud || !ScenaCloud.isAvailable || !ScenaCloud.listPublishedSeries) {
          return entries;
        }

        return ScenaCloud.listPublishedSeries().then(function (rows) {
          (rows || []).forEach(function (row) {
            var series = row.data;
            if (!series || !shouldListInCatalog(series)) return;
            if (window.ScenaStore && ScenaStore.normalizeSeries) ScenaStore.normalizeSeries(series);
            mergeEntries(entries, entryFromSeries(series, { ownerId: row.user_id, index: index++ }), seen);
          });
          entries.sort(function (a, b) {
            if (a.isDemo && !b.isDemo) return -1;
            if (!a.isDemo && b.isDemo) return 1;
            return String(b.updatedAt).localeCompare(String(a.updatedAt));
          });
          return entries;
        }).catch(function () {
          return entries;
        });
      });
    },

    resolveSeries: function (seriesId, userId) {
      if (!seriesId) return Promise.resolve(null);

      if (window.ScenaDemo && ScenaDemo.isDemo(seriesId)) {
        return Promise.resolve(ScenaDemo.getSeries(seriesId));
      }

      var localPromise = window.ScenaStore && ScenaStore.ready
        ? ScenaStore.ready(userId)
        : Promise.resolve();

      return localPromise.then(function () {
        if (userId && window.ScenaStore) {
          var local = ScenaStore.getSeries(userId, seriesId);
          if (local) return local;
        }

        if (!window.ScenaCloud || !ScenaCloud.loadPublishedSeriesById) {
          return null;
        }

        return ScenaCloud.loadPublishedSeriesById(seriesId).then(function (row) {
          if (!row || !row.data) return null;
          if (!shouldListInCatalog(row.data) && !(userId && row.user_id === userId)) {
            return null;
          }
          var series = row.data;
          if (window.ScenaStore && ScenaStore.normalizeSeries) ScenaStore.normalizeSeries(series);
          return series;
        }).catch(function () {
          return null;
        });
      });
    },

    renderDiscoverGrid: function (gridEl, entries, readerBundle) {
      if (!gridEl) return;
      var list = readerBundle && readerBundle.entries ? readerBundle.entries : (entries || []);
      var emptyHtml = '<p class="empty-state" id="emptyState">No series match your search. Try another genre or term.</p>';
      gridEl.innerHTML = list.map(renderCard).join("") + emptyHtml;
    },

    formatReaderCount: formatReaderCount,
  };
})();
