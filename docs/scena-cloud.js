/**
 * Scena — cloud sync (Supabase Postgres + Storage)
 * "Easy save": whole series JSON in studio_series, images in series-assets bucket.
 */
(function () {
  var BUCKET = "series-assets";
  var BUCKET_MISSING_HINT =
    "Storage bucket \"series-assets\" was not found in the Supabase project this site is using. " +
    "Confirm Netlify/env SCENA_CONFIG points at the same project where you created the bucket, " +
    "or run docs/supabase-cloud-setup.sql in that project's SQL editor.";
  var BUCKET_POLICY_HINT =
    "Storage upload blocked. The bucket may exist, but upload policies are missing or wrong. " +
    "Run docs/supabase-cloud-setup.sql in Supabase SQL Editor (section 3 — storage policies).";
  var BUCKET_SETUP_HINT = BUCKET_POLICY_HINT;

  var bucketReadyPromise = null;

  function getClient() {
    return window.ScenaAuth && ScenaAuth.getClient ? ScenaAuth.getClient() : null;
  }

  function config() {
    return window.SCENA_CONFIG || {};
  }

  function projectLabel() {
    var url = (config().supabaseUrl || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    return url ? " (Supabase: " + url + ")" : "";
  }

  function publicUrl(storagePath) {
    var base = (config().supabaseUrl || "").replace(/\/$/, "");
    return base + "/storage/v1/object/public/" + BUCKET + "/" + storagePath;
  }

  function errorMessage(err) {
    if (!err) return "";
    if (typeof err === "string") return err;
    return err.message || err.error || err.statusText || String(err);
  }

  function isBucketMissingError(err) {
    var msg = errorMessage(err).toLowerCase();
    return msg.indexOf("bucket not found") >= 0 ||
      msg.indexOf("bucket does not exist") >= 0 ||
      msg.indexOf("invalid bucket") >= 0;
  }

  function isInlineImage(url) {
    return typeof url === "string" && url.indexOf("data:") === 0;
  }

  function extFromDataUrl(dataUrl) {
    if (dataUrl.indexOf("image/png") >= 0) return "png";
    if (dataUrl.indexOf("image/webp") >= 0) return "webp";
    if (dataUrl.indexOf("image/gif") >= 0) return "gif";
    return "jpg";
  }

  function mimeFromDataUrl(dataUrl) {
    var match = dataUrl.match(/^data:([^;]+);/);
    return match ? match[1] : "image/jpeg";
  }

  function dataUrlToBlob(dataUrl) {
    var parts = dataUrl.split(",");
    var mime = mimeFromDataUrl(dataUrl);
    var raw = atob(parts[1] || "");
    var len = raw.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = raw.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function assetPath(userId, seriesId, category, assetId, ext) {
    return userId + "/" + seriesId + "/" + category + "/" + assetId + "." + ext;
  }

  function isStoragePolicyError(err) {
    var msg = errorMessage(err).toLowerCase();
    return msg.indexOf("row-level security") >= 0 ||
      msg.indexOf("permission denied") >= 0 ||
      msg.indexOf("not allowed") >= 0 ||
      msg.indexOf("violates row-level") >= 0 ||
      msg.indexOf("unauthorized") >= 0 ||
      msg.indexOf("jwt") >= 0 ||
      msg.indexOf("policy") >= 0;
  }

  function storageSetupError(err) {
    if (isBucketMissingError(err)) {
      return new Error(BUCKET_MISSING_HINT + projectLabel());
    }
    if (isStoragePolicyError(err)) {
      return new Error(BUCKET_POLICY_HINT + projectLabel());
    }
    var raw = errorMessage(err);
    if (!raw) return new Error("Storage error." + projectLabel());
    return new Error(raw + projectLabel());
  }

  function resetBucketCache() {
    bucketReadyPromise = null;
  }

  function probeBucket(sb) {
    return sb.storage.from(BUCKET).list("", { limit: 1 }).then(function (result) {
      if (result.error) throw result.error;
      return true;
    });
  }

  function checkBucketAccess() {
    resetBucketCache();
    var sb = getClient();
    if (!sb) return Promise.reject(new Error("Cloud storage is not configured."));
    if (bucketReadyPromise) return bucketReadyPromise;
    bucketReadyPromise = probeBucket(sb).then(function () {
      return true;
    }).catch(function (err) {
      bucketReadyPromise = null;
      throw storageSetupError(err);
    });
    return bucketReadyPromise;
  }

  function uploadBlob(storagePath, blob) {
    var sb = getClient();
    if (!sb) return Promise.reject(new Error("Cloud storage is not available."));
    return sb.storage.from(BUCKET).upload(storagePath, blob, {
      upsert: true,
      contentType: blob.type || "application/octet-stream",
    }).then(function (result) {
      if (result.error) throw storageSetupError(result.error);
      return publicUrl(storagePath);
    });
  }

  function uploadDataUrl(userId, seriesId, category, assetId, dataUrl) {
    if (!isInlineImage(dataUrl)) return Promise.resolve(dataUrl);
    var ext = extFromDataUrl(dataUrl);
    var path = assetPath(userId, seriesId, category, assetId, ext);
    return uploadBlob(path, dataUrlToBlob(dataUrl));
  }

  function cloneSeries(series) {
    return JSON.parse(JSON.stringify(series));
  }

  function externalizeSeriesImages(userId, series) {
    var tasks = [];

    function queue(category, assetId, getter, setter) {
      var current = getter();
      if (!isInlineImage(current)) return;
      tasks.push(
        uploadDataUrl(userId, series.id, category, assetId, current).then(function (url) {
          setter(url);
        })
      );
    }

    queue("thumb", "thumbnail", function () { return series.thumbnailDataUrl; }, function (url) {
      series.thumbnailDataUrl = url;
    });
    queue("banner", "banner", function () { return series.bannerDataUrl; }, function (url) {
      series.bannerDataUrl = url;
    });

    if (series.readerUi && series.readerUi.customSprites) {
      var sprites = series.readerUi.customSprites;
      queue("reader-ui", "dialogue-box", function () { return sprites.dialogueBox; }, function (url) {
        sprites.dialogueBox = url;
      });
      queue("reader-ui", "choice-button", function () { return sprites.choiceButton; }, function (url) {
        sprites.choiceButton = url;
      });
    }

    (series.characterProfiles || []).forEach(function (profile) {
      (profile.sprites || []).forEach(function (sprite) {
        queue("sprites/" + profile.id, sprite.id, function () { return sprite.dataUrl; }, function (url) {
          sprite.dataUrl = url;
        });
      });
    });

    (series.backgroundScenes || []).forEach(function (scene) {
      var layers = scene.layers || {};
      ["bg", "mg", "fg"].forEach(function (layerKey) {
        queue("stages/" + scene.id, layerKey, function () { return layers[layerKey]; }, function (url) {
          if (!scene.layers) scene.layers = { bg: null, mg: null, fg: null };
          scene.layers[layerKey] = url;
        });
      });
    });

    (series.assets || []).forEach(function (asset) {
      queue("assets/" + (asset.category || "misc"), asset.id, function () { return asset.dataUrl; }, function (url) {
        asset.dataUrl = url;
      });
    });

    if (!tasks.length) return Promise.resolve(series);

    return Promise.all(tasks).then(function () { return series; });
  }

  function upsertSeries(sb, userId, prepared, series) {
    return sb.from("studio_series").upsert({
      id: prepared.id,
      user_id: userId,
      data: prepared,
      updated_at: prepared.updatedAt,
    }, { onConflict: "user_id,id" }).then(function (result) {
      if (result.error) throw result.error;
      Object.keys(prepared).forEach(function (key) {
        if (key !== "id") series[key] = prepared[key];
      });
      series.updatedAt = prepared.updatedAt;
      return series;
    });
  }

  window.ScenaCloud = {
    BUCKET: BUCKET,
    setupHint: BUCKET_SETUP_HINT,

    isAvailable: function () {
      return Boolean(getClient() && window.ScenaAuth && ScenaAuth.isConfigured && ScenaAuth.isConfigured());
    },

    isBucketMissingError: isBucketMissingError,

    checkStorage: function () {
      return checkBucketAccess().then(function () {
        return { ok: true };
      }).catch(function (err) {
        return { ok: false, error: errorMessage(err) || BUCKET_SETUP_HINT };
      });
    },

    publicUrl: publicUrl,

    newAssetId: function (prefix) {
      return (prefix || "img").replace(/[^a-z0-9-]/gi, "-") + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
    },

    uploadImage: function (userId, seriesId, category, assetId, dataUrl) {
      return uploadDataUrl(userId, seriesId, category, assetId, dataUrl).catch(function (err) {
        if ((isBucketMissingError(err) || isStoragePolicyError(err)) && isInlineImage(dataUrl)) {
          return dataUrl;
        }
        throw err;
      });
    },

    loadAllSeries: function (userId) {
      var sb = getClient();
      if (!sb) return Promise.reject(new Error("Cloud is not available."));
      return sb.from("studio_series")
        .select("data, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .then(function (result) {
          if (result.error) throw result.error;
          return (result.data || []).map(function (row) { return row.data; });
        });
    },

    listPublishedSeries: function () {
      var sb = getClient();
      if (!sb) return Promise.resolve([]);
      return sb.from("studio_series")
        .select("id, user_id, data, updated_at")
        .order("updated_at", { ascending: false })
        .then(function (result) {
          if (result.error) throw result.error;
          return (result.data || []).filter(function (row) {
            var data = row.data || {};
            if (data.templateSource) return false;
            if (data.status === "published") return true;
            return (data.episodes || []).some(function (ep) {
              if (window.ScenaStore && ScenaStore.isEpisodePublic) {
                return ScenaStore.isEpisodePublic(ep) ||
                  (ScenaStore.isEpisodeScheduled && ScenaStore.isEpisodeScheduled(ep));
              }
              return ep.isLive;
            });
          });
        });
    },

    loadPublishedSeriesById: function (seriesId) {
      var sb = getClient();
      if (!sb) return Promise.resolve(null);
      return sb.from("studio_series")
        .select("id, user_id, data, updated_at")
        .eq("id", seriesId)
        .maybeSingle()
        .then(function (result) {
          if (result.error) throw result.error;
          if (!result.data) return null;
          return {
            id: result.data.id,
            user_id: result.data.user_id,
            data: result.data.data,
            updated_at: result.data.updated_at,
          };
        });
    },

    saveSeries: function (userId, series) {
      var sb = getClient();
      if (!sb) return Promise.resolve({ ok: false, error: "Cloud is not available." });
      if (!series || !series.id) return Promise.resolve({ ok: false, error: "Invalid series." });

      var payload = cloneSeries(series);
      payload.updatedAt = new Date().toISOString();
      var storageWarning = null;

      return externalizeSeriesImages(userId, payload).catch(function (err) {
        if (isBucketMissingError(err) || isStoragePolicyError(err)) {
          storageWarning = errorMessage(storageSetupError(err));
          return payload;
        }
        throw err;
      }).then(function (prepared) {
        return upsertSeries(sb, userId, prepared, series).then(function () {
          return {
            ok: true,
            cloud: true,
            imagesPending: !!storageWarning,
            warning: storageWarning,
            series: series,
          };
        });
      }).catch(function (err) {
        return {
          ok: false,
          cloud: false,
          error: errorMessage(err) || "Could not save to cloud.",
        };
      });
    },

    deleteSeries: function (userId, seriesId) {
      var sb = getClient();
      if (!sb) return Promise.resolve({ ok: false });
      return sb.from("studio_series")
        .delete()
        .eq("user_id", userId)
        .eq("id", seriesId)
        .then(function (result) {
          if (result.error) throw result.error;
          return { ok: true };
        })
        .catch(function () {
          return { ok: false };
        });
    },

    fetchPlatformReaderStats: function () {
      var sb = getClient();
      if (!sb) return Promise.resolve(null);
      return sb.rpc("platform_reader_stats").then(function (result) {
        if (result.error) throw result.error;
        var data = result.data || {};
        var bySeries = data.chapters_by_series || data.readers_by_series || {};
        var weekly = parseInt(data.chapters_read_this_week, 10) ||
          parseInt(data.readers_this_week, 10) || 0;
        return {
          chaptersReadThisWeek: weekly,
          chaptersBySeries: bySeries,
          readersThisWeek: weekly,
          readersBySeries: bySeries,
        };
      }).catch(function () {
        return null;
      });
    },

    readerKey: function () {
      try {
        var key = localStorage.getItem("scena_reader_key");
        if (!key) {
          key = "anon_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
          localStorage.setItem("scena_reader_key", key);
        }
        return key;
      } catch (e) {
        return "anon_ephemeral";
      }
    },

    recordEpisodeRead: function (seriesId, episodeId, userId) {
      var sb = getClient();
      if (!sb || !seriesId || !episodeId) return Promise.resolve(false);
      var row = {
        series_id: seriesId,
        episode_id: episodeId,
        reader_key: userId || this.readerKey(),
      };
      if (userId) row.user_id = userId;
      return sb.from("episode_reads").insert(row).then(function (result) {
        return !result.error;
      }).catch(function () {
        return false;
      });
    },
  };
})();
