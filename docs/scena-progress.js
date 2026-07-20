/**

 * Scena — reader save data: multiple playthroughs per series, chapter locks, cloud sync.

 */

(function () {

  var cache = {};

  var cloudSaveTimers = {};

  var MAX_SAVES = 8;



  function storageKey(scopeId, seriesId) {

    return "scena.progress." + (scopeId || "anon") + "." + seriesId;

  }



  function cacheKey(scopeId, seriesId) {

    return (scopeId || "anon") + ":" + seriesId;

  }



  function getClient() {

    return window.ScenaAuth && ScenaAuth.getClient ? ScenaAuth.getClient() : null;

  }



  function useCloud(scopeId) {

    return scopeId && scopeId !== "anon" &&

      window.ScenaAuth && ScenaAuth.isConfigured && ScenaAuth.isConfigured() &&

      !!getClient();

  }



  function readLocal(scopeId, seriesId) {

    try {

      var raw = localStorage.getItem(storageKey(scopeId, seriesId));

      return raw ? JSON.parse(raw) : null;

    } catch (e) {

      return null;

    }

  }



  function writeLocal(scopeId, seriesId, data) {

    try {

      localStorage.setItem(storageKey(scopeId, seriesId), JSON.stringify(data));

      return true;

    } catch (e) {

      return false;

    }

  }



  function emptyProgress() {

    return {

      endingsUnlocked: [],

      episodes: {},

      keyItems: {},

    };

  }



  function normalizeProgress(data) {

    if (!data) return emptyProgress();

    data.endingsUnlocked = data.endingsUnlocked || [];

    data.episodes = data.episodes || {};

    data.keyItems = data.keyItems || {};

    return data;

  }



  function newSaveId() {

    return "save_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);

  }



  function createSaveSlot(id, label, data) {

    var now = new Date().toISOString();

    return {

      id: id,

      label: label || "Playthrough",

      createdAt: now,

      updatedAt: now,

      data: normalizeProgress(data),

    };

  }



  function consolidateSaveBundle(raw) {
    raw = normalizeSaveBundle(raw);
    var ids = Object.keys(raw.saves);

    var emptyIds = ids.filter(function (id) {
      var data = raw.saves[id].data || emptyProgress();
      return !(data.endingsUnlocked || []).length && !Object.keys(data.episodes || {}).length;
    });
    if (emptyIds.length > 1) {
      emptyIds.sort(function (a, b) {
        return new Date(raw.saves[a].createdAt || 0).getTime() -
          new Date(raw.saves[b].createdAt || 0).getTime();
      });
      var keepId = emptyIds[0];
      for (var e = 1; e < emptyIds.length; e++) {
        delete raw.saves[emptyIds[e]];
      }
      ids = Object.keys(raw.saves);
      if (!raw.saves[raw.activeSaveId]) {
        raw.activeSaveId = keepId;
      }
    }

    var labelCounts = {};
    ids.forEach(function (id) {
      var label = raw.saves[id].label || "Playthrough";
      labelCounts[label] = (labelCounts[label] || 0) + 1;
    });

    var slots = ids.map(function (id) {
      return { id: id, slot: raw.saves[id] };
    });
    slots.sort(function (a, b) {
      return new Date(a.slot.createdAt || 0).getTime() -
        new Date(b.slot.createdAt || 0).getTime();
    });
    slots.forEach(function (item, index) {
      var slot = item.slot;
      var autoLabel = /^Playthrough \d+$/.test(slot.label || "");
      if (autoLabel || labelCounts[slot.label] > 1) {
        slot.label = "Playthrough " + (index + 1);
      }
    });

    return raw;
  }

  function normalizeSaveBundle(raw) {

    if (!raw) {

      var id = newSaveId();

      return {

        activeSaveId: id,

        saves: (function () {

          var saves = {};

          saves[id] = createSaveSlot(id, "Playthrough 1");

          return saves;

        })(),

      };

    }



    if (raw.episodes && !raw.saves) {

      var legacyId = newSaveId();

      return {

        activeSaveId: legacyId,

        saves: (function () {

          var saves = {};

          saves[legacyId] = createSaveSlot(legacyId, "Playthrough 1", raw);

          return saves;

        })(),

      };

    }



    raw.saves = raw.saves || {};

    Object.keys(raw.saves).forEach(function (key) {

      var slot = raw.saves[key];

      if (!slot) return;

      slot.id = slot.id || key;

      slot.label = slot.label || "Playthrough";

      slot.createdAt = slot.createdAt || new Date().toISOString();

      slot.updatedAt = slot.updatedAt || slot.createdAt;

      slot.data = normalizeProgress(slot.data);

    });



    if (!raw.activeSaveId || !raw.saves[raw.activeSaveId]) {

      var keys = Object.keys(raw.saves);

      if (keys.length) {

        raw.activeSaveId = keys[0];

      } else {

        var freshId = newSaveId();

        raw.activeSaveId = freshId;

        raw.saves[freshId] = createSaveSlot(freshId, "Playthrough 1");

      }

    }



    return raw;

  }



  function uniq(arr) {

    var out = [];

    (arr || []).forEach(function (x) {

      if (x && out.indexOf(x) < 0) out.push(x);

    });

    return out;

  }



  function setCache(scopeId, seriesId, bundle) {

    var normalized = consolidateSaveBundle(JSON.parse(JSON.stringify(bundle)));

    cache[cacheKey(scopeId, seriesId)] = normalized;

    writeLocal(scopeId, seriesId, normalized);

    if (useCloud(scopeId)) scheduleCloudSave(scopeId, seriesId, normalized);

    return normalized;

  }



  function scheduleCloudSave(scopeId, seriesId, bundle) {

    var timerKey = cacheKey(scopeId, seriesId);

    if (cloudSaveTimers[timerKey]) clearTimeout(cloudSaveTimers[timerKey]);

    cloudSaveTimers[timerKey] = setTimeout(function () {

      cloudSaveTimers[timerKey] = null;

      window.ScenaProgress.flush(scopeId, seriesId, bundle);

    }, 500);

  }



  function flushToCloud(scopeId, seriesId, bundle) {

    var sb = getClient();

    if (!sb || !useCloud(scopeId)) return Promise.resolve(false);

    return sb.from("reader_progress").upsert({

      user_id: scopeId,

      series_id: seriesId,

      data: normalizeSaveBundle(bundle),

      updated_at: new Date().toISOString(),

    }, { onConflict: "user_id,series_id" }).then(function (result) {

      return !result.error;

    }).catch(function () { return false; });

  }



  function mergeSaveBundles(cloud, local) {

    var merged = normalizeSaveBundle(JSON.parse(JSON.stringify(cloud || {})));

    var localBundle = normalizeSaveBundle(local || {});



    Object.keys(localBundle.saves).forEach(function (saveId) {

      var localSlot = localBundle.saves[saveId];

      var cloudSlot = merged.saves[saveId];

      if (!cloudSlot) {

        merged.saves[saveId] = localSlot;

        return;

      }

      var localData = localSlot.data || emptyProgress();

      var cloudData = cloudSlot.data || emptyProgress();

      var localUpdated = new Date(localSlot.updatedAt || 0).getTime();

      var cloudUpdated = new Date(cloudSlot.updatedAt || 0).getTime();

      if (localUpdated >= cloudUpdated) {

        merged.saves[saveId] = localSlot;

      } else {

        merged.saves[saveId] = cloudSlot;

      }

      if (localData.endingsUnlocked.length || Object.keys(localData.episodes).length) {

        var pick = localUpdated >= cloudUpdated ? localData : cloudData;

        merged.saves[saveId].data = normalizeProgress(JSON.parse(JSON.stringify(pick)));

      }

    });



    if (localBundle.activeSaveId && merged.saves[localBundle.activeSaveId]) {

      merged.activeSaveId = localBundle.activeSaveId;

    }

    return merged;

  }



  function nextPlaythroughLabel(bundle) {

    var used = {};

    Object.keys(bundle.saves || {}).forEach(function (id) {

      var label = bundle.saves[id].label || "";

      var match = /^Playthrough (\d+)$/.exec(label);

      if (match) used[parseInt(match[1], 10)] = true;

    });

    var n = 1;

    while (used[n]) n++;

    return "Playthrough " + n;

  }



  function activeSlot(bundle) {

    bundle = consolidateSaveBundle(bundle);

    return bundle.saves[bundle.activeSaveId];

  }



  function chaptersFinished(progress, series) {

    if (!series) {

      return Object.keys(progress.episodes || {}).filter(function (id) {

        return progress.episodes[id] && progress.episodes[id].completed;

      }).length;

    }

    return (ScenaStore.orderedEpisodes(series) || []).filter(function (ep) {

      var rec = progress.episodes[ep.id];

      return rec && rec.completed;

    }).length;

  }



  function inProgressEpisode(progress, series) {

    if (!series) return null;

    var ordered = ScenaStore.orderedEpisodes(series) || [];

    for (var i = ordered.length - 1; i >= 0; i--) {

      var ep = ordered[i];

      var rec = progress.episodes[ep.id];

      if (rec && rec.checkpoint && !rec.completed) return ep;

    }

    for (var j = 0; j < ordered.length; j++) {

      var ep2 = ordered[j];

      var rec2 = progress.episodes[ep2.id];

      if (rec2 && rec2.checkpoint && !rec2.completed) return ep2;

    }

    return null;

  }



  window.ScenaProgress = {

    scopeFromUser: function (userId) {

      return userId || "anon";

    },



    ready: function (scopeId, seriesId) {

      if (!seriesId) return Promise.resolve(emptyProgress());



      if (!useCloud(scopeId)) {

        var localBundle = consolidateSaveBundle(readLocal(scopeId, seriesId));

        cache[cacheKey(scopeId, seriesId)] = localBundle;

        writeLocal(scopeId, seriesId, localBundle);

        return Promise.resolve(activeSlot(localBundle).data);

      }



      var sb = getClient();

      return sb.from("reader_progress")

        .select("data")

        .eq("user_id", scopeId)

        .eq("series_id", seriesId)

        .maybeSingle()

        .then(function (result) {

          if (result.error) throw result.error;

          var cloudRaw = result.data && result.data.data ? result.data.data : null;

          var cloudBundle = normalizeSaveBundle(cloudRaw);

          var localBundle = normalizeSaveBundle(readLocal(scopeId, seriesId));

          var merged = consolidateSaveBundle(mergeSaveBundles(cloudBundle, localBundle));

          cache[cacheKey(scopeId, seriesId)] = merged;

          writeLocal(scopeId, seriesId, merged);

          return flushToCloud(scopeId, seriesId, merged).then(function () {

            return activeSlot(merged).data;

          });

        })

        .catch(function () {

          var fallback = consolidateSaveBundle(readLocal(scopeId, seriesId));

          cache[cacheKey(scopeId, seriesId)] = fallback;

          return activeSlot(fallback).data;

        });

    },



    flush: function (scopeId, seriesId, bundle) {

      var data = bundle || cache[cacheKey(scopeId, seriesId)] || this.getBundle(scopeId, seriesId);

      if (cloudSaveTimers[cacheKey(scopeId, seriesId)]) {

        clearTimeout(cloudSaveTimers[cacheKey(scopeId, seriesId)]);

        cloudSaveTimers[cacheKey(scopeId, seriesId)] = null;

      }

      return flushToCloud(scopeId, seriesId, data);

    },



    getBundle: function (scopeId, seriesId) {

      if (!seriesId) return consolidateSaveBundle(null);

      var key = cacheKey(scopeId, seriesId);

      if (cache[key]) return consolidateSaveBundle(JSON.parse(JSON.stringify(cache[key])));

      return consolidateSaveBundle(readLocal(scopeId, seriesId));

    },



    get: function (scopeId, seriesId) {

      return normalizeProgress(JSON.parse(JSON.stringify(activeSlot(this.getBundle(scopeId, seriesId)).data)));

    },



    getActiveSaveId: function (scopeId, seriesId) {

      return this.getBundle(scopeId, seriesId).activeSaveId;

    },



    listSaves: function (scopeId, seriesId, series) {

      var bundle = this.getBundle(scopeId, seriesId);

      var self = this;

      return Object.keys(bundle.saves).map(function (saveId) {

        return self.describeSave(scopeId, bundle.saves[saveId], series, saveId === bundle.activeSaveId);

      }).sort(function (a, b) {

        return String(b.updatedAt).localeCompare(String(a.updatedAt));

      });

    },



    describeSave: function (scopeId, slot, series, isActive) {

      if (!slot) return null;

      var progress = slot.data || emptyProgress();

      var finished = chaptersFinished(progress, series);

      var total = series && series.episodes ? series.episodes.length : 0;

      var inProgress = inProgressEpisode(progress, series);

      var resumeEpisode = series && window.ScenaStore

        ? this.getResumeEpisodeForProgress(scopeId, series, progress)

        : null;

      var summary = "Not started";

      if (inProgress) {

        summary = "Ch. " + (inProgress.number || "?") + " — in progress";

      } else if (finished > 0) {

        summary = finished + (total ? (" / " + total) : "") + " chapters done";

      }

      return {

        id: slot.id,

        label: slot.label,

        isActive: !!isActive,

        summary: summary,

        endingsUnlocked: (progress.endingsUnlocked || []).length,

        chaptersFinished: finished,

        updatedAt: slot.updatedAt,

        createdAt: slot.createdAt,

        resumeEpisodeId: resumeEpisode ? resumeEpisode.id : null,

        resumeLabel: resumeEpisode

          ? (resumeEpisode.title || ("Chapter " + resumeEpisode.number))

          : null,

        hasCheckpoint: !!(inProgress && progress.episodes[inProgress.id] &&

          progress.episodes[inProgress.id].checkpoint),

      };

    },



    getResumeEpisodeForProgress: function (scopeId, series, progress) {

      if (!series || !window.ScenaStore) return null;

      progress = progress || this.get(scopeId, series.id);

      var ordered = ScenaStore.orderedEpisodes(series) || [];

      var inProg = inProgressEpisode(progress, series);

      if (inProg && this.isEpisodeUnlocked(scopeId, series, inProg)) return inProg;

      for (var i = 0; i < ordered.length; i++) {

        var ep = ordered[i];

        if (!this.isEpisodeUnlocked(scopeId, series, ep)) break;

        var rec = progress.episodes[ep.id];

        if (!rec || !rec.completed) return ep;

      }

      return ordered[0] || null;

    },



    getResumeEpisode: function (scopeId, series) {

      return this.getResumeEpisodeForProgress(scopeId, series, this.get(scopeId, series.id));

    },



    resumeUrl: function (scopeId, seriesId, series) {

      var ep = this.getResumeEpisode(scopeId, series);

      if (!ep) return this.seriesMenuUrl(seriesId);

      return this.playUrl(seriesId, ep.id, false);

    },



    resumeUrlForSave: function (scopeId, seriesId, series, saveId) {

      var bundle = this.getBundle(scopeId, seriesId);

      var slot = bundle.saves[saveId];

      if (!slot) return this.seriesMenuUrl(seriesId);

      var progress = slot.data || emptyProgress();

      var ep = this.getResumeEpisodeForProgress(scopeId, series, progress);

      if (!ep) return this.seriesMenuUrl(seriesId);

      return this.playUrl(seriesId, ep.id, false);

    },



    setActiveSave: function (scopeId, seriesId, saveId) {

      var bundle = this.getBundle(scopeId, seriesId);

      if (!bundle.saves[saveId]) return false;

      bundle.activeSaveId = saveId;

      setCache(scopeId, seriesId, bundle);

      return true;

    },



    createSave: function (scopeId, seriesId, label) {

      var bundle = this.getBundle(scopeId, seriesId);

      if (Object.keys(bundle.saves).length >= MAX_SAVES) {

        return { ok: false, error: "Maximum of " + MAX_SAVES + " save files reached." };

      }

      var id = newSaveId();

      bundle.saves[id] = createSaveSlot(id, label || nextPlaythroughLabel(bundle), emptyProgress());

      bundle.activeSaveId = id;

      setCache(scopeId, seriesId, bundle);

      return { ok: true, saveId: id };

    },



    deleteSave: function (scopeId, seriesId, saveId) {

      var bundle = this.getBundle(scopeId, seriesId);

      var keys = Object.keys(bundle.saves);

      if (keys.length <= 1) {

        return { ok: false, error: "Keep at least one save file." };

      }

      if (!bundle.saves[saveId]) {

        return { ok: false, error: "Save file not found." };

      }

      delete bundle.saves[saveId];

      if (bundle.activeSaveId === saveId) {

        bundle.activeSaveId = Object.keys(bundle.saves)[0];

      }

      setCache(scopeId, seriesId, bundle);

      return { ok: true, activeSaveId: bundle.activeSaveId };

    },



    save: function (scopeId, seriesId, progress) {

      if (!seriesId) return false;

      var bundle = this.getBundle(scopeId, seriesId);

      var slot = activeSlot(bundle);

      slot.data = normalizeProgress(progress);

      slot.updatedAt = new Date().toISOString();

      bundle.saves[slot.id] = slot;

      setCache(scopeId, seriesId, bundle);

      return true;

    },



    episodeRecord: function (scopeId, seriesId, episodeId) {

      var progress = this.get(scopeId, seriesId);

      if (!progress.episodes[episodeId]) {

        progress.episodes[episodeId] = {

          completed: false,

          completedAt: null,

          exitNodeId: null,

          endingKeys: [],

          metrics: null,

          checkpoint: null,

          choicesMade: [],

        };

      }

      return progress.episodes[episodeId];

    },



    isEpisodeUnlocked: function (scopeId, series, episode) {

      if (!episode || !series) return false;

      if (window.ScenaStore && ScenaStore.isEpisodePublic) {
        if (!ScenaStore.isEpisodePublic(episode)) return false;
      } else if (!episode.isLive && episode.isLive !== undefined) {
        return false;
      }

      var num = episode.number || 1;

      if (num <= 1) return true;

      if (!window.ScenaStore || !ScenaStore.previousEpisode) return num <= 1;

      var prev = ScenaStore.previousEpisode(series, episode);

      if (!prev) return true;

      var rec = this.get(scopeId, series.id).episodes[prev.id];

      return !!(rec && rec.completed);

    },



    priorChoicesMade: function (scopeId, series, episode) {

      if (!series || !episode || !window.ScenaStore) return [];

      var ordered = ScenaStore.orderedEpisodes(series);

      var idx = ordered.findIndex(function (ep) { return ep.id === episode.id; });

      if (idx <= 0) return [];

      var progress = this.get(scopeId, series.id);

      var all = [];

      for (var i = 0; i < idx; i++) {

        var rec = progress.episodes[ordered[i].id];

        if (!rec || !rec.choicesMade) continue;

        rec.choicesMade.forEach(function (choiceId) {

          if (choiceId && all.indexOf(choiceId) < 0) all.push(choiceId);

        });

      }

      return all;

    },



    restartEpisode: function (scopeId, series, episode) {

      if (!series || !episode || !window.ScenaStore) return;

      var progress = this.get(scopeId, series.id);

      var ordered = ScenaStore.orderedEpisodes(series);

      var idx = ordered.findIndex(function (ep) { return ep.id === episode.id; });

      if (idx < 0) return;



      for (var i = idx; i < ordered.length; i++) {

        delete progress.episodes[ordered[i].id];

      }



      var remainingKeys = [];

      Object.keys(progress.episodes).forEach(function (epId) {

        var rec = progress.episodes[epId];

        if (rec && rec.endingKeys) remainingKeys = remainingKeys.concat(rec.endingKeys);

      });

      progress.endingsUnlocked = uniq(remainingKeys);

      this.save(scopeId, series.id, progress);

      if (useCloud(scopeId)) this.flush(scopeId, series.id, this.getBundle(scopeId, series.id));

    },



    resetSeries: function (scopeId, seriesId) {

      if (!seriesId) return;

      var id = newSaveId();

      var bundle = {

        activeSaveId: id,

        saves: {},

      };

      bundle.saves[id] = createSaveSlot(id, "Playthrough 1", emptyProgress());

      setCache(scopeId, seriesId, bundle);

      if (useCloud(scopeId)) this.flush(scopeId, seriesId, bundle);

    },



    lockReason: function (scopeId, series, episode) {

      if (window.ScenaStore && ScenaStore.isEpisodeScheduled && ScenaStore.isEpisodeScheduled(episode)) {
        var when = ScenaStore.episodePublishAt(episode);
        return "This chapter drops " + (when
          ? new Date(when).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
          : "soon") + ".";
      }

      if (this.isEpisodeUnlocked(scopeId, series, episode)) return "";

      if (!window.ScenaStore || !ScenaStore.previousEpisode) return "Complete the previous chapter first.";

      var prev = ScenaStore.previousEpisode(series, episode);

      var prevTitle = prev && prev.title ? prev.title : "the previous chapter";

      return "Finish \"" + prevTitle + "\" to unlock this chapter.";

    },



    saveCheckpoint: function (scopeId, seriesId, episodeId, checkpoint) {

      var progress = this.get(scopeId, seriesId);

      var rec = this.episodeRecord(scopeId, seriesId, episodeId);

      rec.checkpoint = checkpoint

        ? {

          playNodeId: checkpoint.playNodeId,

          metrics: checkpoint.metrics ? Object.assign({}, checkpoint.metrics) : null,

          keyItems: checkpoint.keyItems ? Object.assign({}, checkpoint.keyItems) : null,

          dialogueLog: (checkpoint.dialogueLog || []).slice(),

          choicesMade: (checkpoint.choicesMade || []).slice(),

          updatedAt: new Date().toISOString(),

        }

        : null;

      progress.episodes[episodeId] = rec;

      this.save(scopeId, seriesId, progress);

    },



    clearCheckpoint: function (scopeId, seriesId, episodeId) {

      this.saveCheckpoint(scopeId, seriesId, episodeId, null);

    },



    keyItemsForEpisodeStart: function (scopeId, series, episode) {

      var progress = this.get(scopeId, series.id);

      return progress.keyItems ? Object.assign({}, progress.keyItems) : {};

    },



    mergeEpisodeKeyItems: function (scopeId, seriesId, episodeId, keyItems) {

      var progress = this.get(scopeId, seriesId);

      progress.keyItems = progress.keyItems || {};

      if (keyItems) {

        Object.keys(keyItems).forEach(function (id) {

          var n = parseInt(keyItems[id], 10) || 0;

          if (n > 0) progress.keyItems[id] = 1;

        });

      }

      this.save(scopeId, seriesId, progress);

      return progress.keyItems;

    },



    metricsForEpisodeStart: function (scopeId, series, episode) {

      var metrics = {};

      (series.metrics || []).forEach(function (m) {

        if (m.key) metrics[m.key] = parseFloat(m.defaultValue) || 0;

      });

      if (!episode || (episode.number || 1) <= 1) return metrics;



      if (!window.ScenaStore || !ScenaStore.previousEpisode) return metrics;

      var prev = ScenaStore.previousEpisode(series, episode);

      if (!prev) return metrics;



      var rec = this.get(scopeId, series.id).episodes[prev.id];

      if (rec && rec.completed && rec.metrics) {

        Object.keys(rec.metrics).forEach(function (k) {

          metrics[k] = rec.metrics[k];

        });

      }

      return metrics;

    },



    carryForwardPreview: function (scopeId, series, episode) {

      return this.metricsForEpisodeStart(scopeId, series, episode);

    },



    completeEpisode: function (opts) {

      opts = opts || {};

      if (!opts.seriesId || !opts.episodeId) return null;



      var progress = this.get(opts.scopeId, opts.seriesId);

      var rec = this.episodeRecord(opts.scopeId, opts.seriesId, opts.episodeId);

      rec.completed = true;

      rec.completedAt = new Date().toISOString();

      rec.exitNodeId = opts.exitNodeId || null;

      rec.metrics = opts.metrics ? Object.assign({}, opts.metrics) : null;

      rec.keyItems = opts.keyItems ? Object.assign({}, opts.keyItems) : null;

      rec.choicesMade = (opts.choicesMade || []).slice();

      rec.checkpoint = null;



      var keys = (opts.endingKeys || []).filter(Boolean);

      rec.endingKeys = keys;

      progress.endingsUnlocked = uniq(progress.endingsUnlocked.concat(keys));

      if (opts.keyItems) {

        progress.keyItems = progress.keyItems || {};

        Object.keys(opts.keyItems).forEach(function (id) {

          if (opts.keyItems[id]) progress.keyItems[id] = true;

        });

      }

      progress.episodes[opts.episodeId] = rec;

      this.save(opts.scopeId, opts.seriesId, progress);

      if (useCloud(opts.scopeId)) this.flush(opts.scopeId, opts.seriesId, this.getBundle(opts.scopeId, opts.seriesId));

      return rec;

    },



    countUnlockedEndings: function (scopeId, seriesId) {

      return this.get(scopeId, seriesId).endingsUnlocked.length;

    },



    countTotalEndings: function (series) {

      if (!series || !window.ScenaStore) return 0;

      var total = 0;

      (ScenaStore.orderedEpisodes(series) || []).forEach(function (ep) {

        total += ScenaStore.episodeEndingDefinitions(series, ep).length;

      });

      return total;

    },



    seriesMenuUrl: function (seriesId) {

      return "series.html?series=" + encodeURIComponent(seriesId);

    },



    playUrl: function (seriesId, episodeId, restart) {

      var url = "play.html?series=" + encodeURIComponent(seriesId) +

        "&episode=" + encodeURIComponent(episodeId);

      if (restart) url += "&restart=1";

      return url;

    },

  };

})();


