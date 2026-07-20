/**
 * Scena creator studio — local cache + Supabase cloud sync
 */
(function () {
  var root = typeof globalThis !== "undefined" ? globalThis : window;
  var LS_KEY = "scena_studio_v1";
  var IDB_NAME = "scena_studio_db";
  var IDB_VERSION = 1;
  var IDB_STORE = "kv";
  var IDB_KEY = "studio_v1";

  var memory = null;
  var loadPromise = null;
  var useIdb = typeof indexedDB !== "undefined";
  var cloudUserId = null;
  var activeSeriesId = null;

  function uid() {
    return "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  function slugify(text) {
    return (text || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "untitled";
  }

  function readLocalStorage() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!useIdb) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      var req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = function (e) {
        e.target.result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error("IndexedDB open failed")); };
    });
  }

  function writeToIdb(data) {
    if (!useIdb) {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(data));
        return Promise.resolve();
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(data, IDB_KEY);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error("IndexedDB write failed")); };
      });
    });
  }

  function loadFromStorage() {
    if (!useIdb) {
      memory = readLocalStorage();
      return Promise.resolve(memory);
    }
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readonly");
        var req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = function () {
          if (req.result) {
            resolve(req.result);
            return;
          }
          var legacy = readLocalStorage();
          if (legacy && Object.keys(legacy).length) {
            writeToIdb(legacy).then(function () {
              try { localStorage.removeItem(LS_KEY); } catch (e) {}
              resolve(legacy);
            }).catch(function () { resolve(legacy); });
          } else {
            resolve({});
          }
        };
        req.onerror = function () { reject(req.error); };
      });
    }).catch(function () {
      memory = readLocalStorage();
      return memory;
    });
  }

  function readAll() {
    if (memory) return memory;
    return readLocalStorage();
  }

  function writeAll(data) {
    memory = data;
    return writeToIdb(data);
  }

  function storageErrorMessage(err) {
    if (err && (err.name === "QuotaExceededError" || String(err.message || "").toLowerCase().indexOf("quota") >= 0)) {
      return "Project storage is full. Remove unused series or old image layers, then try again.";
    }
    return (err && err.message) || "Could not save your series.";
  }

  function cloudEnabled() {
    return Boolean(cloudUserId && window.ScenaCloud && ScenaCloud.isAvailable());
  }

  function mergeSeriesLists(localList, cloudList) {
    var byId = {};
    (localList || []).forEach(function (s) { if (s && s.id) byId[s.id] = s; });
    (cloudList || []).forEach(function (s) {
      if (!s || !s.id) return;
      var existing = byId[s.id];
      if (!existing || new Date(s.updatedAt || 0) >= new Date(existing.updatedAt || 0)) {
        byId[s.id] = s;
      }
    });
    return Object.values(byId);
  }

  function syncFromCloud(userId, localData) {
    if (!cloudEnabled()) return Promise.resolve(localData || {});
    return ScenaCloud.loadAllSeries(userId).then(function (cloudSeries) {
      var data = localData || {};
      var localList = data[userId] || [];
      data[userId] = mergeSeriesLists(localList, cloudSeries);
      memory = data;
      return writeToIdb(data).then(function () { return data; }).catch(function () { return data; });
    }).catch(function () {
      return localData || {};
    });
  }

  function compressionOptions(purpose) {
    if (purpose === "stage-bg" || purpose === "stage-mg") {
      return { maxDim: 1920, quality: 0.8, forceJpeg: true };
    }
    if (purpose === "stage-fg") {
      return { maxDim: 1920, quality: 0.92, forceJpeg: false };
    }
    if (purpose === "sprite") {
      return { maxDim: 1280, quality: 0.82, forceJpeg: false };
    }
    if (purpose === "thumb" || purpose === "banner") {
      return { maxDim: 960, quality: 0.85, forceJpeg: true };
    }
    return { maxDim: 1280, quality: 0.82, forceJpeg: false };
  }

  function compressImageDataUrl(dataUrl, file, opts) {
    opts = opts || {};
    var maxDim = opts.maxDim || 1280;
    var quality = opts.quality || 0.82;
    var forceJpeg = opts.forceJpeg || false;
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var w = img.width;
        var h = img.height;
        var scale = Math.min(1, maxDim / Math.max(w, h));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        var ctx = canvas.getContext("2d");
        var mime = forceJpeg ? "image/jpeg" : (file && file.type === "image/png" ? "image/png" : "image/jpeg");
        if (mime === "image/jpeg") {
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        try {
          resolve(canvas.toDataURL(mime, mime === "image/jpeg" ? quality : undefined));
        } catch (e) {
          resolve(dataUrl);
        }
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }

  function emptySeries() {
    return {
      id: uid(),
      title: "",
      slug: "",
      shortDescription: "",
      longDescription: "",
      thumbnailDataUrl: "",
      bannerDataUrl: "",
      contentFlags: [],
      metrics: [],
      assets: [],
      characterProfiles: [],
      backgroundScenes: [],
      nodes: [],
      edges: [],
      episodes: [],
      entryNodeId: null,
      readerUi: null,
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  var ROUTE_ELSE_ID = "__scena_else__";

  function emptyBeatData(overrides) {
    var base = {
      characterProfileId: null,
      spriteId: null,
      slot: "center",
      backgroundSceneId: null,
      overrideStage: false,
      overrideCharacter: false,
      dialogueText: "",
      dialogue: [],
      choices: [],
      requiresChoiceIds: [],
      dialogueVariants: [],
      autoAdvance: false,
      isRouteGate: false,
      routeRules: [],
      isEnd: false,
      sets: [],
      bgmAssetId: null,
      voiceAssetId: null,
      sfxAssetId: null,
      overrideBgm: false,
      beatKind: null,
      grantsKeyItemId: null,
      keyItemDelta: 1,
    };
    if (!overrides) return base;
    var merged = Object.assign({}, base, overrides);
    if (overrides.choices) merged.choices = overrides.choices;
    if (overrides.dialogue) merged.dialogue = overrides.dialogue;
    if (overrides.sets) merged.sets = overrides.sets;
    if (overrides.routeRules) merged.routeRules = overrides.routeRules;
    return merged;
  }

  function inferBeatKindFromFlags(node) {
    if (!node || !node.data) return "story";
    if (node.data.beatKind === "key-item") return "key-item";
    if (node.data.beatKind === "flow-gate") return "flow-gate";
    if (node.data.beatKind === "metric-route-gate") return "flow-gate";
    if (node.data.beatKind === "choice-route-gate" || node.data.beatKind === "route-gate") return "flow-gate";
    if (isLegacyChoiceRouteGateNode(node)) return "flow-gate";
    if (node.data.grantsKeyItemId) return "key-item";
    if (node.data.autoAdvance && !isRouterNode(node)) return "logic";
    return "story";
  }

  function beatKindTitle(kind) {
    switch (kind) {
      case "logic": return "Metrics";
      case "flow-gate": return "Flow gate";
      case "choice-route-gate": return "Flow gate";
      case "metric-route-gate": return "Flow gate";
      case "route-gate": return "Flow gate";
      case "key-item": return "Key item";
      default: return "Story beat";
    }
  }

  function normalizeMetric(metric) {
    if (!metric) return metric;
    if (metric.hiddenFromPlayer == null && metric.hidden != null) {
      metric.hiddenFromPlayer = !!metric.hidden;
    }
    if (metric.hiddenFromPlayer == null) metric.hiddenFromPlayer = false;
    if (metric.hiddenFromInventory == null) metric.hiddenFromInventory = false;
    delete metric.hidden;
    if (metric.dataUrl == null && metric.iconDataUrl) metric.dataUrl = metric.iconDataUrl;
    delete metric.iconDataUrl;
    return metric;
  }

  function metricHiddenFromPlayer(metric) {
    metric = normalizeMetric(metric || {});
    return !!metric.hiddenFromPlayer;
  }

  function metricHiddenFromInventory(metric) {
    metric = normalizeMetric(metric || {});
    return !!metric.hiddenFromInventory;
  }

  function normalizeKeyItemAsset(asset) {
    if (!asset || asset.kind !== (root.ScenaKeyItem ? ScenaKeyItem.KIND : "keyItem")) return asset;
    if (asset.hiddenFromPlayer == null && asset.hidden != null) {
      asset.hiddenFromPlayer = !!asset.hidden;
    }
    if (asset.hiddenFromPlayer == null) asset.hiddenFromPlayer = false;
    if (asset.hiddenFromInventory == null) asset.hiddenFromInventory = false;
    delete asset.hidden;
    return asset;
  }

  function isPresentationBeatKind(kind) {
    return kind === "story";
  }

  function isLegacyChoiceRouteGateNode(node) {
    if (!node || !node.data) return false;
    if (node.data.isRouteGate) return true;
    return Boolean(node.data.autoAdvance && node.data.routeRules && node.data.routeRules.length &&
      node.data.beatKind !== "metric-route-gate" &&
      node.data.beatKind !== "key-item" &&
      node.data.beatKind !== "logic");
  }

  function isRouterNode(node) {
    if (!node || !node.data) return false;
    var kind = node.data.beatKind;
    if (kind === "flow-gate") return true;
    if (kind === "choice-route-gate" || kind === "route-gate") return true;
    if (kind === "metric-route-gate") return true;
    return isLegacyChoiceRouteGateNode(node);
  }

  function isRouteGateNode(node) {
    return isRouterNode(node);
  }

  function inventoryKeyItemCount(inventory, assetId) {
    return parseInt(inventory && inventory[assetId], 10) || 0;
  }

  function applyKeyItemChange(inventory, assetId, delta) {
    if (!inventory || !assetId) return inventory || {};
    var d = delta != null ? (parseInt(delta, 10) || 0) : 1;
    if (d === 0) return inventory;
    if (d > 0) {
      inventory[assetId] = 1;
    } else {
      delete inventory[assetId];
    }
    return inventory;
  }

  function normalizeRouteChecks(rule) {
    if (!rule) return [];
    if (rule.checks && rule.checks.length) {
      return rule.checks.map(function (check) {
        if (!check || !check.type) return null;
        if (check.type === "choice") {
          return { type: "choice", choiceIds: (check.choiceIds || []).slice() };
        }
        if (check.type === "metric") {
          return {
            type: "metric",
            metricKey: check.metricKey,
            op: check.op || "gte",
            value: check.value != null ? check.value : 0,
          };
        }
        if (check.type === "keyItem") {
          return { type: "keyItem", assetId: check.assetId || null, mode: check.mode || "has" };
        }
        return null;
      }).filter(Boolean);
    }
    var checks = [];
    if (rule.choiceIds && rule.choiceIds.length) {
      checks.push({ type: "choice", choiceIds: rule.choiceIds.slice() });
    }
    if (rule.requiresMetric && rule.requiresMetric.metricKey) {
      checks.push({
        type: "metric",
        metricKey: rule.requiresMetric.metricKey,
        op: rule.requiresMetric.op || "gte",
        value: rule.requiresMetric.value != null ? rule.requiresMetric.value : 0,
      });
    }
    return checks;
  }

  function checkPasses(check, ctx) {
    if (!check) return true;
    ctx = ctx || {};
    if (check.type === "choice") {
      var required = check.choiceIds || [];
      if (!required.length) return true;
      return required.every(function (choiceId) {
        return (ctx.choicesMade || []).indexOf(choiceId) >= 0;
      });
    }
    if (check.type === "metric") {
      return choiceMeetsMetricRequirement(ctx.metrics || {}, {
        metricKey: check.metricKey,
        op: check.op,
        value: check.value,
      });
    }
    if (check.type === "keyItem") {
      if (!check.assetId) return true;
      var has = inventoryKeyItemCount(ctx.keyItems, check.assetId) > 0;
      return (check.mode || "has") === "missing" ? !has : has;
    }
    return true;
  }

  function routeRulePasses(rule, ctx) {
    var checks = normalizeRouteChecks(rule);
    if (!checks.length) return false;
    var mode = rule && rule.matchMode === "or" ? "or" : "and";
    if (mode === "or") {
      return checks.some(function (check) { return checkPasses(check, ctx); });
    }
    return checks.every(function (check) { return checkPasses(check, ctx); });
  }

  function formatFlowCheckLabel(series, check) {
    if (!check || !check.type) return "";
    if (check.type === "choice") {
      var ids = check.choiceIds || [];
      if (!ids.length) return "Prior choice";
      var labels = ids.map(function (choiceId) {
        var found = null;
        (series.nodes || []).some(function (node) {
          if (!node.data || !node.data.choices) return false;
          return node.data.choices.some(function (c) {
            if (c.id === choiceId) {
              found = c.choiceText || c.label || choiceId;
              return true;
            }
            return false;
          });
        });
        return found || choiceId;
      });
      return "Picked: " + labels.join(", ");
    }
    if (check.type === "metric") {
      return formatMetricRequirementLabel(series, check);
    }
    if (check.type === "keyItem") {
      var name = formatKeyItemRequirementLabel(series, { assetId: check.assetId, mode: check.mode });
      if (!name) return "Key item";
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
    return "";
  }

  function resolveFlowGateRouteId(node, choicesMade, metrics, keyItems) {
    if (!node || !node.data) return null;
    var ctx = {
      choicesMade: choicesMade || [],
      metrics: metrics || {},
      keyItems: keyItems || {},
    };
    var rules = node.data.routeRules || [];
    for (var i = 0; i < rules.length; i++) {
      if (routeRulePasses(rules[i], ctx)) return rules[i].id;
    }
    return ROUTE_ELSE_ID;
  }

  function resolveChoiceRouteGateRouteId(node, choicesMade) {
    return resolveFlowGateRouteId(node, choicesMade, {}, {});
  }

  function resolveMetricRouteGateRouteId(node, metrics) {
    return resolveFlowGateRouteId(node, [], metrics, {});
  }

  function resolveRouterRouteId(node, choicesMade, metrics, keyItems) {
    if (!isRouterNode(node)) return null;
    return resolveFlowGateRouteId(node, choicesMade, metrics, keyItems);
  }

  function resolveRouteGateRouteId(node, choicesMade, metrics) {
    return resolveRouterRouteId(node, choicesMade, metrics);
  }

  function normalizeChoiceChecks(choice) {
    if (!choice) return [];
    if (choice.requiresChecks && choice.requiresChecks.length) {
      return choice.requiresChecks.map(function (check) {
        if (!check || !check.type) return null;
        if (check.type === "choice") {
          return { type: "choice", choiceIds: (check.choiceIds || []).slice() };
        }
        if (check.type === "metric") {
          return {
            type: "metric",
            metricKey: check.metricKey,
            op: check.op || "gte",
            value: check.value != null ? check.value : 0,
          };
        }
        if (check.type === "keyItem") {
          return { type: "keyItem", assetId: check.assetId || null, mode: check.mode || "has" };
        }
        return null;
      }).filter(Boolean);
    }
    var checks = [];
    if (choice.requiresChoiceIds && choice.requiresChoiceIds.length) {
      checks.push({ type: "choice", choiceIds: choice.requiresChoiceIds.slice() });
    }
    if (choice.requiresMetric && choice.requiresMetric.metricKey) {
      checks.push({
        type: "metric",
        metricKey: choice.requiresMetric.metricKey,
        op: choice.requiresMetric.op || "gte",
        value: choice.requiresMetric.value != null ? choice.requiresMetric.value : 0,
      });
    }
    if (choice.requiresKeyItem && choice.requiresKeyItem.assetId) {
      checks.push({
        type: "keyItem",
        assetId: choice.requiresKeyItem.assetId,
        mode: choice.requiresKeyItem.mode === "missing" ? "missing" : "has",
      });
    }
    return checks;
  }

  function syncChoiceGateFields(choice) {
    if (!choice) return choice;
    var checks = normalizeChoiceChecks(choice);
    if (checks.length) {
      choice.requiresChecks = checks;
    } else {
      delete choice.requiresChecks;
      delete choice.gateMatchMode;
    }
    delete choice.requiresChoiceIds;
    delete choice.requiresMetric;
    delete choice.requiresKeyItem;
    return choice;
  }

  function normalizeChoice(ch) {
    if (!ch) return ch;
    if (!ch.choiceText && ch.label) ch.choiceText = ch.label;
    if (!ch.label && ch.choiceText) ch.label = ch.choiceText;
    syncChoiceGateFields(ch);
    if (ch.gateMatchMode !== "or") delete ch.gateMatchMode;
    return ch;
  }

  function migrateNode(node) {
    if (!node) return node;
    if (node.type === "beat") {
      node.data = node.data || emptyBeatData();
      if (node.data.choices) node.data.choices = node.data.choices.map(normalizeChoice);
      if (!node.data.dialogueText && node.data.dialogue && node.data.dialogue.length) {
        node.data.dialogueText = node.data.dialogue.map(function (d) {
          return (d.speaker ? d.speaker + ": " : "") + d.text;
        }).join("\n");
      }
      if (node.data.overrideStage === undefined) node.data.overrideStage = false;
      if (node.data.overrideCharacter === undefined) node.data.overrideCharacter = false;
      if (node.data.overrideBgm === undefined) node.data.overrideBgm = false;
      if (!node.data.requiresChoiceIds) node.data.requiresChoiceIds = [];
      if (!node.data.dialogueVariants) node.data.dialogueVariants = [];
      if (!node.data.routeRules) node.data.routeRules = [];
      if (node.data.isRouteGate === undefined) node.data.isRouteGate = isRouterNode(node);
      if (node.data.bgmAssetId === undefined) node.data.bgmAssetId = null;
      if (node.data.voiceAssetId === undefined) node.data.voiceAssetId = null;
      if (node.data.sfxAssetId === undefined) node.data.sfxAssetId = null;
      if (node.data.beatKind === "prior-choice" || node.data.beatKind === "metric-dialogue" ||
          node.data.beatKind === "metric-choice") {
        node.data.beatKind = "story";
      }
      if (node.data.beatKind === "dialogue-router") {
        node.data.beatKind = "flow-gate";
      }
      if (node.data.beatKind === "choice-route-gate" ||
          node.data.beatKind === "metric-route-gate" ||
          node.data.beatKind === "route-gate") {
        node.data.beatKind = "flow-gate";
      }
      if (node.data.routeRules && node.data.routeRules.length) {
        node.data.routeRules = node.data.routeRules.map(function (rule) {
          return {
            id: rule.id || uid("route"),
            label: rule.label || "",
            matchMode: rule.matchMode === "or" ? "or" : "and",
            checks: normalizeRouteChecks(rule),
          };
        });
      }
      if (!node.data.beatKind) node.data.beatKind = inferBeatKindFromFlags(node);
      if (node.data.grantsKeyItemId === undefined) node.data.grantsKeyItemId = null;
      if (node.data.keyItemDelta === undefined) node.data.keyItemDelta = 1;
      return node;
    }

    var data = node.data || {};
    if (node.type === "scene") {
      node.type = "beat";
      node.data = emptyBeatData({
        characterProfileId: data.characterProfileId || null,
        spriteId: data.spriteId || null,
        slot: data.slot || "center",
        backgroundSceneId: data.backgroundSceneId || null,
        dialogue: data.dialogue || [{ speaker: "", text: "Your story begins here." }],
        dialogueText: (data.dialogue || []).map(function (d) {
          return (d.speaker ? d.speaker + ": " : "") + (d.text || "");
        }).join("\n") || data.title || "",
      });
    } else if (node.type === "choice") {
      node.type = "beat";
      node.data = emptyBeatData({
        dialogueText: data.prompt || "",
        dialogue: data.prompt ? [{ speaker: "", text: data.prompt }] : [],
        choices: (data.choices || []).map(function (ch) {
          return normalizeChoice({
            id: ch.id || uid(),
            label: ch.label || "Option",
            choiceText: ch.label || "Option",
          });
        }),
      });
    } else if (node.type === "logic") {
      node.type = "beat";
      node.data = emptyBeatData({
        beatKind: "logic",
        autoAdvance: true,
        sets: data.sets || [{ metricKey: "", op: "add", value: 1 }],
      });
    } else {
      node.type = "beat";
      node.data = emptyBeatData();
    }
    return node;
  }

  function defaultGraph() {
    var startId = uid();
    var branchId = uid();
    var choiceA = uid();
    var choiceB = uid();
    return {
      entryNodeId: startId,
      nodes: [
        {
          id: startId,
          type: "beat",
          x: 80,
          y: 120,
          data: emptyBeatData({
            dialogue: [{ speaker: "", text: "Your story begins here." }],
            dialogueText: "Your story begins here.",
          }),
        },
        {
          id: branchId,
          type: "beat",
          x: 380,
          y: 120,
          data: emptyBeatData({
            dialogueText: "What do you do?",
            dialogue: [{ speaker: "", text: "What do you do?" }],
            choices: [
              { id: choiceA, label: "Option A", choiceText: "Option A" },
              { id: choiceB, label: "Option B", choiceText: "Option B" },
            ],
          }),
        },
      ],
      edges: [{ id: uid(), source: startId, target: branchId, choiceId: null }],
    };
  }

  function defaultReaderUi() {
    return {
      preset: "scena-classic",
      aspectRatio: "16:9",
      colors: {},
      sizes: { dialogueScale: 1, choiceScale: 1, cornerRadius: 6 },
      shapes: { dialogue: "bar", choice: "rounded" },
      customSprites: { dialogueBox: null, choiceButton: null },
      sounds: { clickAssetId: null },
      menu: {
        enabled: true,
        showTranscript: true,
        showInventory: true,
        showAudioSettings: true,
        inventoryDisplay: "grid",
        showInventoryHud: false,
      },
    };
  }

  var AUDIO_KINDS = [
    { id: "bgm", label: "Background music", hint: "Loops during play — set on the opening beat, inherited by later beats" },
    { id: "voice", label: "Voice line", hint: "Recorded dialogue — plays when entering a story beat" },
    { id: "sfx", label: "Sound effect", hint: "One-shot cue when entering a beat" },
    { id: "ui", label: "Button click", hint: "UI feedback on choices — set in Series settings" },
  ];

  var READER_UI_PRESETS = {
    "scena-classic": {
      colors: {
        dialogueBg: "rgba(0,0,0,0.75)",
        dialogueText: "#ffffff",
        accent: "#2a9d8f",
        choiceBg: "rgba(255,255,255,0.08)",
        choiceText: "#ffffff",
        choiceBorder: "rgba(255,255,255,0.15)",
        speaker: "#2a9d8f",
      },
      shapes: { dialogue: "bar", choice: "rounded" },
    },
    "scena-minimal": {
      colors: {
        dialogueBg: "rgba(0,0,0,0.5)",
        dialogueText: "#f5f5f5",
        accent: "#ffffff",
        choiceBg: "transparent",
        choiceText: "#ffffff",
        choiceBorder: "rgba(255,255,255,0.35)",
        speaker: "#d0d0d0",
      },
      shapes: { dialogue: "minimal", choice: "underline" },
    },
    "scena-frame": {
      colors: {
        dialogueBg: "rgba(20,18,16,0.92)",
        dialogueText: "#fff8e8",
        accent: "#c9a227",
        choiceBg: "rgba(201,162,39,0.12)",
        choiceText: "#fff8e8",
        choiceBorder: "#c9a227",
        speaker: "#c9a227",
      },
      shapes: { dialogue: "frame", choice: "frame" },
    },
    custom: {
      colors: {
        dialogueBg: "rgba(0,0,0,0.75)",
        dialogueText: "#ffffff",
        accent: "#2a9d8f",
        choiceBg: "rgba(255,255,255,0.08)",
        choiceText: "#ffffff",
        choiceBorder: "rgba(255,255,255,0.15)",
        speaker: "#2a9d8f",
      },
      shapes: { dialogue: "bar", choice: "rounded" },
    },
  };

  function layoutNodeGroup(series, nodeIds, startX, baseY, hGap, vGap, preferredEntryId) {
    var idSet = {};
    nodeIds.forEach(function (id) { idSet[id] = true; });
    var edges = (series.edges || []).filter(function (e) {
      return idSet[e.source] && idSet[e.target];
    });
    var positions = {};
    var queue = [];
    var visited = {};

    var roots = nodeIds.filter(function (id) {
      return !edges.some(function (e) { return e.target === id; });
    });
    if (!roots.length && preferredEntryId && idSet[preferredEntryId]) {
      roots = [preferredEntryId];
    }
    if (!roots.length) roots = nodeIds.slice(0, 1);

    roots.forEach(function (rootId, i) {
      var laneOffset = roots.length > 1 ? i - (roots.length - 1) / 2 : 0;
      queue.push({ id: rootId, depth: 0, lane: laneOffset * 1.4 });
    });

    while (queue.length) {
      var item = queue.shift();
      if (!idSet[item.id] || visited[item.id]) continue;
      visited[item.id] = true;
      positions[item.id] = {
        x: startX + item.depth * hGap,
        y: baseY + item.lane * vGap,
      };

      var out = edges.filter(function (e) { return e.source === item.id; });
      var choiceOut = out.filter(function (e) { return e.choiceId; });
      var linearOut = out.filter(function (e) { return !e.choiceId; });

      choiceOut.forEach(function (e, i) {
        if (visited[e.target]) return;
        var spread = choiceOut.length > 1 ? i - (choiceOut.length - 1) / 2 : 0;
        queue.push({ id: e.target, depth: item.depth + 1, lane: item.lane + spread * 1.5 });
      });
      linearOut.forEach(function (e) {
        if (visited[e.target]) return;
        queue.push({ id: e.target, depth: item.depth + 1, lane: item.lane });
      });
    }

    var maxX = startX;
    var fallbackLane = 0;
    (series.nodes || []).forEach(function (n) {
      if (!idSet[n.id]) return;
      if (!positions[n.id]) {
        positions[n.id] = { x: startX, y: baseY + fallbackLane * vGap };
        fallbackLane++;
      }
      n.x = Math.round(positions[n.id].x);
      n.y = Math.round(positions[n.id].y);
      maxX = Math.max(maxX, n.x);
    });

    return maxX;
  }

  function collectLaterEpisodeEntrySeeds(series, episodes) {
    var laterEntry = {};
    var nodeById = {};
    (series.nodes || []).forEach(function (n) { nodeById[n.id] = n; });

    episodes.forEach(function (ep, idx) {
      if (idx === 0) return;
      if (ep.startNodeId && nodeById[ep.startNodeId]) laterEntry[ep.startNodeId] = true;
    });

    episodes.forEach(function (ep, idx) {
      if (idx >= episodes.length - 1) return;
      (ep.branchEndings || []).forEach(function (branch) {
        if (!branch.exitNodeId) return;
        (series.edges || []).forEach(function (edge) {
          if (edge.source === branch.exitNodeId && nodeById[edge.target]) {
            laterEntry[edge.target] = true;
          }
        });
      });
    });

    return laterEntry;
  }

  function episodeEntrySeeds(series, episode, episodeIndex, episodes, nodeMap) {
    var seeds = [];
    var nodeById = {};
    (series.nodes || []).forEach(function (n) { nodeById[n.id] = n; });

    if (episode.startNodeId && nodeById[episode.startNodeId]) seeds.push(episode.startNodeId);
    if (episodeIndex === 0 && series.entryNodeId && nodeById[series.entryNodeId]) {
      if (seeds.indexOf(series.entryNodeId) < 0) seeds.unshift(series.entryNodeId);
    }
    if (episodeIndex > 0) {
      var prevEp = episodes[episodeIndex - 1];
      var prevIds = Object.keys(nodeMap).filter(function (id) { return nodeMap[id] === prevEp.id; });
      (series.edges || []).forEach(function (edge) {
        if (prevIds.indexOf(edge.source) < 0 || !nodeById[edge.target]) return;
        if (seeds.indexOf(edge.target) < 0) seeds.push(edge.target);
      });
    }
    return seeds;
  }

  function buildEpisodeNodeMap(series) {
    var episodes = (series.episodes || []).slice().sort(function (a, b) {
      return (a.number || 0) - (b.number || 0);
    });
    if (!episodes.length) return {};

    var nodeById = {};
    (series.nodes || []).forEach(function (n) { nodeById[n.id] = n; });
    var nodeMap = {};
    var laterEntry = collectLaterEpisodeEntrySeeds(series, episodes);

    episodes.forEach(function (ep, idx) {
      var seeds = episodeEntrySeeds(series, ep, idx, episodes, nodeMap);
      var queue = seeds.slice();
      var visited = {};

      while (queue.length) {
        var id = queue.shift();
        if (visited[id] || nodeMap[id] || !nodeById[id]) continue;
        visited[id] = true;
        nodeMap[id] = ep.id;

        (series.edges || []).forEach(function (edge) {
          if (edge.source !== id || nodeMap[edge.target]) return;
          if (idx === 0 && laterEntry[edge.target]) return;
          queue.push(edge.target);
        });
      }
    });

    (series.nodes || []).forEach(function (n) {
      if (!nodeMap[n.id]) nodeMap[n.id] = episodes[episodes.length - 1].id;
    });

    return nodeMap;
  }

  var EPISODE_REGION_PAD_Y = 72;
  var EPISODE_REGION_PAD_X = 32;

  function updateEpisodeRegions(series) {
    if (!series || !(series.episodes || []).length) return series;
    var sorted = (series.episodes || [])
      .filter(function (ep) { return typeof ep.boundaryX === "number" && !isNaN(ep.boundaryX); })
      .sort(function (a, b) { return a.boundaryX - b.boundaryX; });

    sorted.forEach(function (ep, idx) {
      var leftX = idx > 0 ? sorted[idx - 1].boundaryX : 0;
      var rightX = ep.boundaryX;
      var inBand = (series.nodes || []).filter(function (n) {
        var size = nodeGraphSize(n);
        var cx = n.x + size.width / 2;
        return cx >= leftX && cx < rightX;
      });

      if (!inBand.length) {
        ep.regionTop = null;
        ep.regionBottom = null;
        return;
      }

      var top = Infinity;
      var bottom = -Infinity;
      inBand.forEach(function (n) {
        var size = nodeGraphSize(n);
        top = Math.min(top, n.y);
        bottom = Math.max(bottom, n.y + size.height);
      });
      ep.regionTop = Math.round(top - EPISODE_REGION_PAD_Y);
      ep.regionBottom = Math.round(bottom + EPISODE_REGION_PAD_Y);
    });

    return series;
  }

  function nodeGraphSize(node) {
    if (!node) return { width: 220, height: 120 };
    if (node.type !== "beat") return { width: 220, height: 120 };
    var data = node.data || {};
    if (isRouterNode(node)) {
      var ruleCount = (data.routeRules || []).length + 1;
      return { width: 200, height: 56 + ruleCount * 34 };
    }
    if (data.autoAdvance && !(data.choices && data.choices.length)) {
      return { width: 108, height: 72 };
    }
    if (data.choices && data.choices.length) {
      return { width: 220, height: 96 + data.choices.length * 34 };
    }
    return { width: 220, height: 120 };
  }

  function nodeHasLinearOutgoing(nodeId, edges) {
    return edges.some(function (e) { return e.source === nodeId && !e.choiceId; });
  }

  function nodeExitsEpisode(series, node, edges) {
    var ep = episodeForNodeInline(series, node);
    if (!ep) return false;
    return edges.some(function (e) {
      if (e.source !== node.id) return false;
      var targetNode = (series.nodes || []).find(function (n) { return n.id === e.target; });
      if (!targetNode) return true;
      var targetEp = episodeForNodeInline(series, targetNode);
      return !targetEp || targetEp.id !== ep.id;
    });
  }

  function isImplicitStoryEnding(series, node, edges) {
    if (edges.some(function (e) { return e.source === node.id; })) return false;
    var ep = episodeForNodeInline(series, node);
    if (!ep) return false;
    var ordered = (series.episodes || []).slice().sort(function (a, b) {
      return (a.number || 0) - (b.number || 0);
    });
    return ordered.length && ordered[ordered.length - 1].id === ep.id;
  }

  function initMetricRanges(series) {
    var min = {};
    var max = {};
    (series.metrics || []).forEach(function (m) {
      if (!m.key) return;
      var v = parseFloat(m.defaultValue);
      if (isNaN(v)) v = 0;
      min[m.key] = v;
      max[m.key] = v;
    });
    return { min: min, max: max };
  }

  function cloneMetricRanges(ranges) {
    return { min: Object.assign({}, ranges.min), max: Object.assign({}, ranges.max) };
  }

  function metricRangeKeyUnion(a, b) {
    var keys = {};
    Object.keys(a.min || {}).forEach(function (k) { keys[k] = true; });
    Object.keys(a.max || {}).forEach(function (k) { keys[k] = true; });
    Object.keys(b.min || {}).forEach(function (k) { keys[k] = true; });
    Object.keys(b.max || {}).forEach(function (k) { keys[k] = true; });
    return Object.keys(keys);
  }

  function tryWidenMetricRanges(stored, incoming) {
    var widened = false;
    metricRangeKeyUnion(stored, incoming).forEach(function (key) {
      var inMin = incoming.min[key];
      var inMax = incoming.max[key];
      if (typeof inMin === "number") {
        if (typeof stored.min[key] !== "number" || inMin < stored.min[key]) {
          stored.min[key] = inMin;
          widened = true;
        }
      }
      if (typeof inMax === "number") {
        if (typeof stored.max[key] !== "number" || inMax > stored.max[key]) {
          stored.max[key] = inMax;
          widened = true;
        }
      }
    });
    return widened;
  }

  function applySetsToMetricRanges(ranges, sets) {
    var out = cloneMetricRanges(ranges);
    (sets || []).forEach(function (set) {
      if (!set || !set.metricKey) return;
      var key = set.metricKey;
      var amount = parseFloat(set.value);
      if (isNaN(amount)) amount = 0;
      var op = set.op || "add";
      var curMin = typeof out.min[key] === "number" ? out.min[key] : 0;
      var curMax = typeof out.max[key] === "number" ? out.max[key] : 0;
      if (op === "set") {
        out.min[key] = out.max[key] = amount;
      } else if (op === "add") {
        out.min[key] = curMin + amount;
        out.max[key] = curMax + amount;
      } else if (op === "subtract") {
        out.min[key] = curMin - amount;
        out.max[key] = curMax - amount;
      } else if (op === "multiply") {
        out.min[key] = curMin * amount;
        out.max[key] = curMax * amount;
        if (out.min[key] > out.max[key]) {
          var swap = out.min[key];
          out.min[key] = out.max[key];
          out.max[key] = swap;
        }
      }
    });
    return out;
  }

  function metricRangeCanSatisfy(min, max, op, threshold) {
    threshold = parseFloat(threshold);
    if (isNaN(threshold)) return true;
    if (typeof min !== "number") min = 0;
    if (typeof max !== "number") max = min;
    op = op || "gte";
    if (op === "gt") return max > threshold;
    if (op === "gte") return max >= threshold;
    if (op === "lt") return min < threshold;
    if (op === "lte") return min <= threshold;
    if (op === "eq") return min <= threshold && max >= threshold;
    if (op === "neq") return !(min === max && min === threshold);
    return max >= threshold;
  }

  function choiceHasMetricGate(choice) {
    return normalizeChoiceChecks(choice).some(function (check) {
      return check.type === "metric" && check.metricKey;
    });
  }

  function choiceHasPriorChoiceGate(choice) {
    return normalizeChoiceChecks(choice).some(function (check) {
      return check.type === "choice" && check.choiceIds && check.choiceIds.length;
    });
  }

  function choiceHasKeyItemGate(choice) {
    return normalizeChoiceChecks(choice).some(function (check) {
      return check.type === "keyItem" && check.assetId;
    });
  }

  function choiceGateCheckCount(choice) {
    return normalizeChoiceChecks(choice).length;
  }

  function choicePriorChoiceIds(choice) {
    var ids = [];
    normalizeChoiceChecks(choice).forEach(function (check) {
      if (check.type !== "choice") return;
      (check.choiceIds || []).forEach(function (id) {
        if (ids.indexOf(id) < 0) ids.push(id);
      });
    });
    return ids;
  }

  function choiceRequiresKeyItems(choice, assetIds) {
    assetIds = assetIds || [];
    if (!assetIds.length) return false;
    var checks = normalizeChoiceChecks(choice).filter(function (check) {
      return check.type === "keyItem" && check.assetId && (check.mode || "has") === "has";
    });
    return assetIds.every(function (assetId) {
      return checks.some(function (check) { return check.assetId === assetId; });
    });
  }

  function choiceFirstMetricCheck(choice) {
    return normalizeChoiceChecks(choice).find(function (check) {
      return check.type === "metric" && check.metricKey;
    }) || null;
  }

  function choiceFirstKeyItemCheck(choice) {
    return normalizeChoiceChecks(choice).find(function (check) {
      return check.type === "keyItem" && check.assetId;
    }) || null;
  }

  function choiceMeetsKeyItemRequirement(keyItems, requirement) {
    if (!requirement || !requirement.assetId) return true;
    keyItems = keyItems || {};
    var has = inventoryKeyItemCount(keyItems, requirement.assetId) > 0;
    return (requirement.mode || "has") === "missing" ? !has : has;
  }

  function choiceHasAnyGate(choice) {
    return choiceGateCheckCount(choice) > 0;
  }

  function choiceMeetsPriorChoiceRequirement(choicesMade, choice) {
    var checks = normalizeChoiceChecks(choice).filter(function (check) {
      return check.type === "choice";
    });
    if (!checks.length) return true;
    choicesMade = choicesMade || [];
    return checks.every(function (check) {
      return (check.choiceIds || []).every(function (choiceId) {
        return choicesMade.indexOf(choiceId) >= 0;
      });
    });
  }

  function choiceMeetsMetricRequirement(metrics, requirement) {
    if (!requirement || !requirement.metricKey) return true;
    metrics = metrics || {};
    var val = parseFloat(metrics[requirement.metricKey]);
    if (isNaN(val)) val = 0;
    var threshold = parseFloat(requirement.value);
    if (isNaN(threshold)) return true;
    var op = requirement.op || "gte";
    if (op === "gt") return val > threshold;
    if (op === "gte") return val >= threshold;
    if (op === "lt") return val < threshold;
    if (op === "lte") return val <= threshold;
    if (op === "eq") return val === threshold;
    if (op === "neq") return val !== threshold;
    return val >= threshold;
  }

  function choiceActiveGateCount(choice) {
    return choiceGateCheckCount(choice);
  }

  function choiceMeetsGates(choice, metrics, choicesMade, keyItems) {
    if (!choice) return true;
    var checks = normalizeChoiceChecks(choice);
    if (!checks.length) return true;
    var ctx = { metrics: metrics, choicesMade: choicesMade, keyItems: keyItems };
    var mode = choice.gateMatchMode === "or" ? "or" : "and";
    if (mode === "or") {
      return checks.some(function (check) { return checkPasses(check, ctx); });
    }
    return checks.every(function (check) { return checkPasses(check, ctx); });
  }

  function filterVisibleChoices(choices, metrics, choicesMade, keyItems) {
    return (choices || []).filter(function (c) {
      return choiceMeetsGates(c, metrics, choicesMade, keyItems);
    });
  }

  function formatKeyItemRequirementLabel(series, req) {
    if (!req || !req.assetId) return "";
    var asset = (series.assets || []).find(function (a) {
      return a && a.id === req.assetId && a.kind === (root.ScenaKeyItem ? ScenaKeyItem.KIND : "keyItem");
    });
    var name = (asset && asset.label) || "item";
    return (req.mode || "has") === "missing" ? ("missing " + name) : ("has " + name);
  }

  function formatMetricOpSymbol(op) {
    if (op === "gt") return ">";
    if (op === "gte") return "≥";
    if (op === "lt") return "<";
    if (op === "lte") return "≤";
    if (op === "eq") return "=";
    if (op === "neq") return "≠";
    return "≥";
  }

  function formatMetricRequirementLabel(series, req) {
    if (!req || !req.metricKey) return "";
    var metric = (series.metrics || []).find(function (m) { return m.key === req.metricKey; });
    var name = (metric && (metric.displayName || metric.key)) || req.metricKey;
    return name + " " + formatMetricOpSymbol(req.op) + " " + req.value;
  }

  function validateMetricGatedChoices(series) {
    var issues = [];
    var nodes = series.nodes || [];
    var edges = series.edges || [];
    var entry = ScenaStore.resolveEntryNode(series);
    if (!entry) return issues;

    var nodesById = {};
    nodes.forEach(function (n) { nodesById[n.id] = n; });

    var visited = {};
    var worklist = [{ nodeId: entry.id, choicesMade: [], ranges: initMetricRanges(series) }];
    var reachableGatedChoiceIds = {};
    var allGatedChoiceIds = {};

    nodes.forEach(function (n) {
      if (!n.data || !n.data.choices) return;
      n.data.choices.forEach(function (c) {
        if (choiceHasMetricGate(c)) {
          allGatedChoiceIds[c.id] = { node: n, choice: c };
        }
      });
    });

    function stateKey(nodeId, choicesMade) {
      return nodeId + "\0" + choicesMade.slice().sort().join(",");
    }

    function pushState(nodeId, choicesMade, ranges) {
      worklist.push({ nodeId: nodeId, choicesMade: choicesMade, ranges: ranges });
    }

    while (worklist.length) {
      var state = worklist.pop();
      var node = nodesById[state.nodeId];
      if (!node) continue;

      var sk = stateKey(state.nodeId, state.choicesMade);
      if (visited[sk]) {
        if (!tryWidenMetricRanges(visited[sk], state.ranges)) continue;
      } else {
        visited[sk] = cloneMetricRanges(state.ranges);
      }
      var ranges = cloneMetricRanges(visited[sk]);

      if (!ScenaStore.beatMeetsChoiceRequirements(node, state.choicesMade)) {
        var skipEdge = edges.find(function (e) { return e.source === node.id && !e.choiceId; });
        if (skipEdge) pushState(skipEdge.target, state.choicesMade, ranges);
        continue;
      }

      if (isRouterNode(node)) {
        var pointMetrics = {};
        metricRangeKeyUnion(ranges, ranges).forEach(function (key) {
          pointMetrics[key] = ranges.max[key];
        });
        var routeId = resolveRouterRouteId(node, state.choicesMade, pointMetrics);
        var routeEdge = edges.find(function (e) { return e.source === node.id && e.choiceId === routeId; });
        if (routeEdge) pushState(routeEdge.target, state.choicesMade, ranges);
        continue;
      }

      if (ScenaStore.shouldAutoAdvance(node)) {
        var afterLogic = applySetsToMetricRanges(ranges, node.data.sets);
        var logicEdge = edges.find(function (e) { return e.source === node.id && !e.choiceId; });
        if (logicEdge) pushState(logicEdge.target, state.choicesMade, afterLogic);
        continue;
      }

      if (ScenaStore.hasChoices(node)) {
        var atChoice = applySetsToMetricRanges(ranges, node.data.sets);
        var choices = node.data.choices || [];
        var visibleOnPath = choices.filter(function (c) {
          if (!choiceHasMetricGate(c)) return true;
          var req = choiceFirstMetricCheck(c);
          if (!req) return true;
          return metricRangeCanSatisfy(
            atChoice.min[req.metricKey],
            atChoice.max[req.metricKey],
            req.op,
            req.value
          );
        });
        if (choices.length && !visibleOnPath.length) {
          issues.push({
            severity: "error",
            code: "metric-no-visible-choices",
            message: ScenaStore.nodeLabel(node) +
              ": readers can reach this choice beat with no options available — relax metric gates or add an always-visible choice.",
            nodeId: node.id,
          });
        }
        choices.forEach(function (c) {
          if (!choiceHasMetricGate(c)) return;
          var req = choiceFirstMetricCheck(c);
          if (!req) return;
          if (metricRangeCanSatisfy(
            atChoice.min[req.metricKey],
            atChoice.max[req.metricKey],
            req.op,
            req.value
          )) {
            reachableGatedChoiceIds[c.id] = true;
          }
        });
        choices.forEach(function (c) {
          if (choiceHasMetricGate(c)) {
            var req = choiceFirstMetricCheck(c);
            if (!req || !metricRangeCanSatisfy(
              atChoice.min[req.metricKey],
              atChoice.max[req.metricKey],
              req.op,
              req.value
            )) {
              return;
            }
          }
          var edge = edges.find(function (e) { return e.source === node.id && e.choiceId === c.id; });
          if (!edge) return;
          pushState(edge.target, state.choicesMade.concat([c.id]), atChoice);
        });
        continue;
      }

      var linearEdge = edges.find(function (e) { return e.source === node.id && !e.choiceId; });
      if (linearEdge) pushState(linearEdge.target, state.choicesMade, ranges);
    }

    Object.keys(allGatedChoiceIds).forEach(function (choiceId) {
      if (reachableGatedChoiceIds[choiceId]) return;
      var info = allGatedChoiceIds[choiceId];
      var req = choiceFirstMetricCheck(info.choice);
      var reqLabel = formatMetricRequirementLabel(series, req);
      issues.push({
        severity: "error",
        code: "metric-gate-unreachable",
        message: ScenaStore.nodeLabel(info.node) + ': choice "' +
          (info.choice.choiceText || info.choice.label || choiceId) +
          '" requires ' + reqLabel + ", but no story path can meet that before this beat.",
        nodeId: info.node.id,
      });
    });

    return issues;
  }

  function validateGraph(series) {
    var issues = [];
    var nodes = series.nodes || [];
    var edges = series.edges || [];
    var entry = ScenaStore.resolveEntryNode(series);
    var entryId = entry ? entry.id : null;
    var reachable = {};

    if (entryId) {
      var queue = [entryId];
      while (queue.length) {
        var id = queue.shift();
        if (reachable[id]) continue;
        reachable[id] = true;
        edges.forEach(function (e) {
          if (e.source === id && !reachable[e.target]) queue.push(e.target);
        });
      }
    } else {
      issues.push({
        severity: "error",
        code: "no-entry",
        message: "Story has no entry beat — mark a beat as the opening or connect your graph.",
      });
    }

    nodes.forEach(function (n) {
      var label = ScenaStore.nodeLabel(n);
      if (entryId && !reachable[n.id]) {
        issues.push({
          severity: "warn",
          code: "unreachable",
          message: label + " is not reachable from the story entry.",
          nodeId: n.id,
        });
      }
      if (ScenaStore.sortedEpisodesByBoundary(series).length && !ScenaStore.episodeForNode(series, n)) {
        issues.push({
          severity: "warn",
          code: "outside-region",
          message: label + " sits outside every chapter region — it will not publish or play in an episode.",
          nodeId: n.id,
        });
      }
    });

    nodes.forEach(function (n) {
      var label = ScenaStore.nodeLabel(n);
      if (n.data && n.data.isEnd) return;

      if (ScenaStore.hasChoices(n)) {
        (n.data.choices || []).forEach(function (choice) {
          if (!edges.some(function (e) { return e.source === n.id && e.choiceId === choice.id; })) {
            issues.push({
              severity: "error",
              code: "open-choice",
              message: label + ': choice "' + (choice.label || choice.id) + '" has no outgoing connection.',
              nodeId: n.id,
            });
          }
        });
        return;
      }

      if (ScenaStore.isRouteGate(n)) {
        (n.data.routeRules || []).forEach(function (rule) {
          if (!edges.some(function (e) { return e.source === n.id && e.choiceId === rule.id; })) {
            issues.push({
              severity: "error",
              code: "open-route",
              message: ScenaStore.nodeLabel(n) + ': route "' + (rule.label || rule.id) +
                '" has no outgoing connection.',
              nodeId: n.id,
            });
          }
        });
        if (!edges.some(function (e) { return e.source === n.id && e.choiceId === ROUTE_ELSE_ID; })) {
          issues.push({
            severity: "error",
            code: "open-route-else",
            message: ScenaStore.nodeLabel(n) + ' is missing its Else connection.',
            nodeId: n.id,
          });
        }
        return;
      }

      if (ScenaStore.shouldAutoAdvance(n)) {
        if (!edges.some(function (e) { return e.source === n.id && !e.choiceId; })) {
          issues.push({
            severity: "error",
            code: "dead-logic",
            message: label + " (logic) has no Next connection.",
            nodeId: n.id,
          });
        }
        return;
      }

      if (!nodeHasLinearOutgoing(n.id, edges) &&
          !nodeExitsEpisode(series, n, edges) &&
          !isImplicitStoryEnding(series, n, edges)) {
        issues.push({
          severity: "warn",
          code: "dead-end",
          message: label + " has no Next connection (dark house).",
          nodeId: n.id,
        });
      }
    });

    nodes.forEach(function (n) {
      var label = ScenaStore.nodeLabel(n);
      var hasIn = edges.some(function (e) { return e.target === n.id; });
      if (!hasIn && n.id !== entryId && n.id !== series.entryNodeId) {
        issues.push({
          severity: "warn",
          code: "orphan",
          message: label + " has no incoming connections.",
          nodeId: n.id,
        });
      }
    });

    (series.episodes || []).forEach(function (ep) {
      var epNodes = ScenaStore.nodesInEpisode(series, ep);
      var epLabel = ep.title || ("Episode " + ep.number);
      if (typeof ep.boundaryX !== "number" || isNaN(ep.boundaryX)) {
        issues.push({
          severity: "warn",
          code: "no-boundary",
          message: epLabel + " has no boundary line on the graph.",
          episodeId: ep.id,
        });
        return;
      }
      if (ep.isLive && !epNodes.length) {
        issues.push({
          severity: "error",
          code: "empty-episode",
          message: epLabel + " is live but has no beats inside its shaded region.",
          episodeId: ep.id,
        });
      }
      if (epNodes.length) {
        var epReachable = {};
        var starts = [];
        if (ep.entryNodeIds && ep.entryNodeIds.length) {
          ep.entryNodeIds.forEach(function (id) {
            if (epNodes.some(function (n) { return n.id === id; })) starts.push(id);
          });
        }
        if (ep.number === 1 && entryId && epNodes.some(function (n) { return n.id === entryId; })) {
          starts.push(entryId);
        }
        if (ep.startNodeId && epNodes.some(function (n) { return n.id === ep.startNodeId; })) {
          starts.push(ep.startNodeId);
        }
        epNodes.forEach(function (n) {
          if (!edges.some(function (e) { return e.target === n.id; })) starts.push(n.id);
        });
        starts = starts.filter(function (id, i, arr) { return arr.indexOf(id) === i; });

        var epQueue = starts.slice();
        while (epQueue.length) {
          var cur = epQueue.shift();
          if (epReachable[cur]) continue;
          epReachable[cur] = true;
          edges.forEach(function (e) {
            if (e.source !== cur) return;
            if (!epNodes.some(function (n) { return n.id === e.target; })) return;
            if (!epReachable[e.target]) epQueue.push(e.target);
          });
        }

        epNodes.forEach(function (n) {
          if (!epReachable[n.id]) {
            issues.push({
              severity: "warn",
              code: "episode-disconnected",
              message: ScenaStore.nodeLabel(n) + " is inside " + epLabel + " but not connected to the rest of that chapter.",
              nodeId: n.id,
              episodeId: ep.id,
            });
          }
        });
      }

      var orderedEps = ScenaStore.orderedEpisodes(series);
      var epIdx = orderedEps.findIndex(function (item) { return item.id === ep.id; });
      var prevEp = epIdx > 0 ? orderedEps[epIdx - 1] : null;
      if (prevEp) {
        var prevLabel = prevEp.title || ("Episode " + prevEp.number);
        var entryIds = ep.entryNodeIds && ep.entryNodeIds.length
          ? ep.entryNodeIds.slice()
          : crossChapterEdgesInline(series, prevEp, ep).map(function (edge) { return edge.target; })
            .filter(function (id, i, arr) { return arr.indexOf(id) === i; });
        var chapterLinks = crossChapterEdgesInline(series, prevEp, ep);

        if (!entryIds.length) {
          issues.push({
            severity: "error",
            code: "no-chapter-entry",
            message: epLabel + " has no entry beat. Drag a connection from the previous chapter's ending beat(s) into this chapter's region.",
            episodeId: ep.id,
          });
        }
        if (!chapterLinks.length) {
          issues.push({
            severity: "error",
            code: "no-chapter-link",
            message: epLabel + " is not linked from " + prevLabel + ". Connect the last beat(s) of the previous chapter to this chapter's entry beat(s).",
            episodeId: ep.id,
          });
        }
        entryIds.forEach(function (entryId) {
          if (!chapterLinks.some(function (edge) { return edge.target === entryId; })) {
            var entryNode = (series.nodes || []).find(function (n) { return n.id === entryId; });
            issues.push({
              severity: "warn",
              code: "entry-not-linked",
              message: (entryNode ? ScenaStore.nodeLabel(entryNode) : entryId) +
                " is marked as a " + epLabel + " entry but has no incoming link from " + prevLabel + ".",
              nodeId: entryId,
              episodeId: ep.id,
            });
          }
        });
      }
    });

    validateMetricGatedChoices(series).forEach(function (item) { issues.push(item); });

    var errors = issues.filter(function (item) { return item.severity === "error"; });
    return { ok: errors.length === 0, issues: issues, errorCount: errors.length, warnCount: issues.length - errors.length };
  }

  function episodeForNodeInline(series, node) {
    if (!node) return null;
    var size = nodeGraphSize(node);
    var centerX = node.x + size.width / 2;
    var centerY = node.y + size.height / 2;
    var sorted = (series.episodes || [])
      .filter(function (ep) { return typeof ep.boundaryX === "number" && !isNaN(ep.boundaryX); })
      .sort(function (a, b) { return a.boundaryX - b.boundaryX; });
    var left = 0;
    for (var i = 0; i < sorted.length; i++) {
      var ep = sorted[i];
      if (centerX >= left && centerX < ep.boundaryX) {
        if (typeof ep.regionTop === "number" && typeof ep.regionBottom === "number") {
          if (centerY >= ep.regionTop && centerY <= ep.regionBottom) return ep;
          return null;
        }
        return ep;
      }
      left = ep.boundaryX;
    }
    return null;
  }

  function nodesInEpisodeInline(series, episode) {
    return (series.nodes || []).filter(function (n) {
      var ep = episodeForNodeInline(series, n);
      return ep && ep.id === episode.id;
    });
  }

  function episodeHasNodes(series, episode) {
    return nodesInEpisodeInline(series, episode).length > 0;
  }

  function episodePublishAt(ep) {
    if (!ep) return null;
    return ep.publishAt || ep.publishedAt || null;
  }

  function normalizeEpisodePublish(ep) {
    if (!ep) return ep;
    if (ep.publishedAt && !ep.publishAt) ep.publishAt = ep.publishedAt;
    if (ep.publishAt && !ep.publishedAt) ep.publishedAt = ep.publishAt;
    return ep;
  }

  function isEpisodePublic(ep, now) {
    if (!ep || !ep.isLive) return false;
    var at = episodePublishAt(ep);
    if (!at) return true;
    now = now || new Date();
    return new Date(at) <= now;
  }

  function isEpisodeScheduled(ep, now) {
    if (!ep || !ep.isLive) return false;
    var at = episodePublishAt(ep);
    if (!at) return false;
    now = now || new Date();
    return new Date(at) > now;
  }

  function episodePublishStatus(ep, now) {
    if (!ep || !ep.isLive) return "draft";
    if (isEpisodeScheduled(ep, now)) return "scheduled";
    if (isEpisodePublic(ep, now)) return "live";
    return "draft";
  }

  function publishEpisodeInline(series, episode, opts) {
    opts = opts || {};
    if (!episode) return;
    var when = opts.when || "now";
    var at = opts.at;
    episode.isLive = true;
    if (when === "schedule" && at) {
      var scheduled = new Date(at);
      if (isNaN(scheduled.getTime())) {
        var badNow = new Date().toISOString();
        episode.publishAt = badNow;
        episode.publishedAt = badNow;
      } else {
        var iso = scheduled.toISOString();
        episode.publishAt = iso;
        episode.publishedAt = iso;
      }
    } else {
      var nowIso = new Date().toISOString();
      episode.publishAt = nowIso;
      episode.publishedAt = nowIso;
    }
    if (!series) return;
    series.status = (series.episodes || []).some(function (item) {
      return isEpisodePublic(item) || isEpisodeScheduled(item);
    }) ? "published" : "draft";
  }

  function unpublishEpisodeInline(series, episode) {
    if (!episode) return;
    episode.isLive = false;
    episode.publishedAt = null;
    episode.publishAt = null;
    if (!series) return;
    series.status = (series.episodes || []).some(function (ep) {
      return isEpisodePublic(ep) || isEpisodeScheduled(ep);
    }) ? "published" : "draft";
  }

  function computeEpisodeConnectivityOrder(series) {
    var episodes = (series.episodes || []).filter(function (ep) {
      return typeof ep.boundaryX === "number" && !isNaN(ep.boundaryX);
    });
    if (!episodes.length) {
      return (series.episodes || []).slice().sort(function (a, b) {
        return (a.number || 0) - (b.number || 0);
      });
    }

    var epById = {};
    episodes.forEach(function (ep) { epById[ep.id] = ep; });

    var adj = {};
    episodes.forEach(function (ep) { adj[ep.id] = []; });

    (series.edges || []).forEach(function (edge) {
      var src = (series.nodes || []).find(function (n) { return n.id === edge.source; });
      var tgt = (series.nodes || []).find(function (n) { return n.id === edge.target; });
      if (!src || !tgt) return;
      var srcEp = episodeForNodeInline(series, src);
      var tgtEp = episodeForNodeInline(series, tgt);
      if (!srcEp || !tgtEp || srcEp.id === tgtEp.id) return;
      if (adj[srcEp.id].indexOf(tgtEp.id) < 0) adj[srcEp.id].push(tgtEp.id);
    });

    var entryNode = ScenaStore.resolveEntryNode(series);
    var startEp = entryNode ? episodeForNodeInline(series, entryNode) : null;
    if (!startEp) {
      startEp = episodes.slice().sort(function (a, b) { return a.boundaryX - b.boundaryX; })[0];
    }

    var ordered = [];
    var visited = {};
    var queue = startEp ? [startEp.id] : [];

    while (queue.length) {
      var id = queue.shift();
      if (visited[id] || !epById[id]) continue;
      visited[id] = true;
      ordered.push(epById[id]);
      (adj[id] || []).forEach(function (nextId) {
        if (!visited[nextId]) queue.push(nextId);
      });
    }

    episodes.slice().sort(function (a, b) { return a.boundaryX - b.boundaryX; }).forEach(function (ep) {
      if (!visited[ep.id]) ordered.push(ep);
    });

    return ordered;
  }

  function renumberEpisodesByConnectivity(series) {
    var ordered = computeEpisodeConnectivityOrder(series);
    ordered.forEach(function (ep, idx) {
      ep.number = idx + 1;
    });
    return ordered;
  }

  function syncSeriesEpisodeState(series) {
    if (!series) return series;
    if ((series.episodes || []).length && ScenaStore.sortedEpisodesByBoundary(series).length) {
      updateEpisodeRegions(series);
    }
    (series.episodes || []).forEach(function (ep) {
      var hasBoundary = typeof ep.boundaryX === "number" && !isNaN(ep.boundaryX);
      if (!hasBoundary || !episodeHasNodes(series, ep)) {
        if (ep.isLive) unpublishEpisodeInline(series, ep);
      }
    });
    renumberEpisodesByConnectivity(series);
    syncEpisodeEntriesInline(series);
    ScenaStore.ensureEntryNode(series);
    return series;
  }

  function deleteEpisodeRegion(series, episodeId) {
    var ep = (series.episodes || []).find(function (item) { return item.id === episodeId; });
    if (!ep) return { ok: false, reason: "not-found" };
    if (episodeHasNodes(series, ep)) return { ok: false, reason: "has-nodes" };
    unpublishEpisodeInline(series, ep);
    series.episodes = (series.episodes || []).filter(function (item) { return item.id !== episodeId; });
    syncSeriesEpisodeState(series);
    return { ok: true };
  }

  function crossChapterEdgesInline(series, fromEp, toEp) {
    if (!fromEp || !toEp) return [];
    var fromIds = {};
    nodesInEpisodeInline(series, fromEp).forEach(function (n) { fromIds[n.id] = true; });
    var toIds = {};
    nodesInEpisodeInline(series, toEp).forEach(function (n) { toIds[n.id] = true; });
    return (series.edges || []).filter(function (edge) {
      return fromIds[edge.source] && toIds[edge.target];
    });
  }

  function syncEpisodeEntriesInline(series) {
    if (!series || !(series.episodes || []).length) return series;

    var ordered = computeEpisodeConnectivityOrder(series);

    ordered.forEach(function (ep, idx) {
      var epNodeIds = nodesInEpisodeInline(series, ep).map(function (n) { return n.id; });
      var ids = [];
      var prev = idx > 0 ? ordered[idx - 1] : null;

      if (prev) {
        var prevIds = nodesInEpisodeInline(series, prev).map(function (n) { return n.id; });
        (series.edges || []).forEach(function (edge) {
          if (prevIds.indexOf(edge.source) >= 0 && epNodeIds.indexOf(edge.target) >= 0 && ids.indexOf(edge.target) < 0) {
            ids.push(edge.target);
          }
        });
      } else if (series.entryNodeId && epNodeIds.indexOf(series.entryNodeId) >= 0) {
        ids.push(series.entryNodeId);
      }

      if (!ids.length && ep.startNodeId && epNodeIds.indexOf(ep.startNodeId) >= 0) {
        ids.push(ep.startNodeId);
      }

      ep.entryNodeIds = ids;
      if (ids.length && (!ep.startNodeId || ids.indexOf(ep.startNodeId) < 0)) {
        ep.startNodeId = ids[0];
      }
    });

    return series;
  }

  function layoutTemplateGraph(series) {
    if (!series || !(series.nodes || []).length) return series;

    var nodeWidth = 220;
    var hGap = 320;
    var vGap = 420;
    var regionPad = 48;
    var epEndPad = 240;
    var baseY = 100;

    var episodes = (series.episodes || []).slice().sort(function (a, b) {
      return (a.number || 0) - (b.number || 0);
    });

    if (!episodes.length) {
      layoutNodeGroup(
        series,
        series.nodes.map(function (n) { return n.id; }),
        80,
        baseY,
        hGap,
        vGap,
        series.entryNodeId
      );
      return series;
    }

    var nodeEp = buildEpisodeNodeMap(series);
    var cursorX = 80;

    episodes.forEach(function (ep, idx) {
      var ids = series.nodes.filter(function (n) { return nodeEp[n.id] === ep.id; }).map(function (n) { return n.id; });
      if (!ids.length) return;
      if (idx > 0 && typeof episodes[idx - 1].boundaryX === "number") {
        cursorX = episodes[idx - 1].boundaryX + regionPad;
      }
      var entry = idx === 0 ? (series.entryNodeId || ep.startNodeId) : (ep.startNodeId || null);
      var maxX = layoutNodeGroup(series, ids, cursorX, baseY, hGap, vGap, entry);
      ep.boundaryX = maxX + nodeWidth + epEndPad;
    });

    updateEpisodeRegions(series);
    syncEpisodeEntriesInline(series);
    return series;
  }

  function applyDemoGraphToSeries(series, demo) {
    if (!series || !demo) return series;
    series.nodes = JSON.parse(JSON.stringify(demo.nodes || []));
    series.edges = JSON.parse(JSON.stringify(demo.edges || []));
    series.episodes = JSON.parse(JSON.stringify(demo.episodes || []));
    series.entryNodeId = demo.entryNodeId || series.entryNodeId;
    series.characterProfiles = JSON.parse(JSON.stringify(demo.characterProfiles || []));
    series.backgroundScenes = JSON.parse(JSON.stringify(demo.backgroundScenes || []));
    series.metrics = JSON.parse(JSON.stringify(demo.metrics || []));
    ScenaStore.normalizeSeries(series);
    layoutTemplateGraph(series);
    return series;
  }

  function lockSeriesToEpisodeOne(series) {
    if (!series) return series;
    var ordered = ScenaStore.orderedEpisodes(series);
    if (!ordered.length) return series;
    ordered.forEach(function (ep, index) {
      if (index === 0) {
        publishEpisodeInline(series, ep, { when: "now" });
      } else {
        unpublishEpisodeInline(series, ep);
      }
    });
    series.status = ordered[0].isLive ? "published" : "draft";
    return series;
  }

  window.ScenaStore = {
    CONTENT_FLAGS: [
      { key: "romance", label: "Romance" },
      { key: "violence", label: "Violence" },
      { key: "horror", label: "Horror" },
      { key: "sexual_content", label: "Sexual content" },
      { key: "strong_language", label: "Strong language" },
      { key: "gore", label: "Gore" },
      { key: "substance_use", label: "Substance use" },
      { key: "self_harm", label: "Self-harm themes" },
    ],

    ROUTE_ELSE_ID: ROUTE_ELSE_ID,

    isRouteGate: function (node) {
      return isRouterNode(node);
    },

    isRouterNode: function (node) {
      return isRouterNode(node);
    },

    getBeatKind: function (node) {
      if (!node) return "story";
      migrateNode(node);
      return node.data.beatKind || "story";
    },

    beatKindTitle: beatKindTitle,

    isPresentationBeatKind: isPresentationBeatKind,

    resolveRouteGateRouteId: function (node, choicesMade, metrics, keyItems) {
      return resolveRouterRouteId(node, choicesMade, metrics, keyItems);
    },

    resolveRouterRouteId: function (node, choicesMade, metrics, keyItems) {
      return resolveRouterRouteId(node, choicesMade, metrics, keyItems);
    },

    resolveFlowGateRouteId: resolveFlowGateRouteId,

    normalizeRouteChecks: normalizeRouteChecks,

    normalizeChoiceChecks: normalizeChoiceChecks,

    syncChoiceGateFields: syncChoiceGateFields,

    choiceGateCheckCount: choiceGateCheckCount,

    choicePriorChoiceIds: choicePriorChoiceIds,

    choiceRequiresKeyItems: choiceRequiresKeyItems,

    choiceFirstMetricCheck: choiceFirstMetricCheck,

    choiceFirstKeyItemCheck: choiceFirstKeyItemCheck,

    routeRulePasses: routeRulePasses,

    applyKeyItemChange: applyKeyItemChange,

    inventoryKeyItemCount: inventoryKeyItemCount,

    choiceHasKeyItemGate: choiceHasKeyItemGate,

    choiceMeetsKeyItemRequirement: choiceMeetsKeyItemRequirement,

    formatKeyItemRequirementLabel: formatKeyItemRequirementLabel,
    formatFlowCheckLabel: formatFlowCheckLabel,

    resolveRouteGateEdge: function (series, node, choicesMade, metrics, keyItems) {
      if (!node) return null;
      var routeId = resolveRouterRouteId(node, choicesMade, metrics, keyItems);
      if (!routeId) return null;
      var edge = (series.edges || []).find(function (e) {
        return e.source === node.id && e.choiceId === routeId;
      }) || null;
      if (!edge && routeId !== ROUTE_ELSE_ID) {
        edge = (series.edges || []).find(function (e) {
          return e.source === node.id && e.choiceId === ROUTE_ELSE_ID;
        }) || null;
      }
      return edge;
    },

    resolveRouterEdge: function (series, node, choicesMade, metrics, keyItems) {
      return this.resolveRouteGateEdge(series, node, choicesMade, metrics, keyItems);
    },

    slugify: slugify,

    ready: function (userId) {
      if (userId) cloudUserId = userId;
      if (!loadPromise) {
        loadPromise = loadFromStorage().then(function (data) {
          memory = data || {};
          if (cloudUserId) {
            return syncFromCloud(cloudUserId, memory);
          }
          return memory;
        });
      }
      return loadPromise;
    },

    setActiveSeries: function (seriesId) {
      activeSeriesId = seriesId || null;
    },

    isCloudEnabled: cloudEnabled,

    READER_UI_PRESETS: READER_UI_PRESETS,
    defaultReaderUi: defaultReaderUi,

    resolveReaderUi: function (series) {
      var base = defaultReaderUi();
      var saved = (series && series.readerUi) ? series.readerUi : {};
      var presetKey = saved.preset || base.preset;
      var preset = READER_UI_PRESETS[presetKey] || READER_UI_PRESETS["scena-classic"];
      return {
        preset: presetKey,
        aspectRatio: saved.aspectRatio || base.aspectRatio,
        colors: Object.assign({}, preset.colors, saved.colors || {}),
        sizes: Object.assign({}, base.sizes, saved.sizes || {}),
        shapes: Object.assign({}, preset.shapes, saved.shapes || {}),
        customSprites: Object.assign({}, base.customSprites, saved.customSprites || {}),
        menu: Object.assign({}, base.menu, saved.menu || {}),
      };
    },

    resolveReaderMenu: function (series) {
      var ui = this.ensureReaderUi(series);
      var base = defaultReaderUi().menu;
      return Object.assign({}, base, ui.menu || {});
    },

    ensureReaderUi: function (series) {
      if (!series.readerUi) series.readerUi = defaultReaderUi();
      else {
        series.readerUi = Object.assign(defaultReaderUi(), series.readerUi);
        series.readerUi.colors = series.readerUi.colors || {};
        series.readerUi.sizes = Object.assign(defaultReaderUi().sizes, series.readerUi.sizes || {});
        series.readerUi.shapes = Object.assign(defaultReaderUi().shapes, series.readerUi.shapes || {});
        series.readerUi.customSprites = Object.assign(defaultReaderUi().customSprites, series.readerUi.customSprites || {});
        series.readerUi.sounds = Object.assign(defaultReaderUi().sounds, series.readerUi.sounds || {});
        series.readerUi.menu = Object.assign(defaultReaderUi().menu, series.readerUi.menu || {});
      }
      return series.readerUi;
    },

    AUDIO_KINDS: AUDIO_KINDS,

    ensureAssets: function (series) {
      if (!series.assets) series.assets = [];
      this.ensureDefaultAudio(series);
      return series.assets;
    },

    ensureDefaultAudio: function (series) {
      if (!series.assets) series.assets = [];
      var defaults = window.ScenaDefaultAudio || [];
      defaults.forEach(function (def) {
        if (!series.assets.some(function (a) { return a.id === def.id; })) {
          series.assets.push(Object.assign({}, def));
        }
      });
      return series.assets;
    },

    getAudioAsset: function (series, assetId) {
      if (!assetId) return null;
      var fromSeries = this.ensureAssets(series).find(function (a) { return a.id === assetId; });
      if (fromSeries) return fromSeries;
      var defaults = window.ScenaDefaultAudio || [];
      return defaults.find(function (a) { return a.id === assetId; }) || null;
    },

    listAudioAssets: function (series, kind) {
      var keyKind = root.ScenaKeyItem ? ScenaKeyItem.KIND : "keyItem";
      return this.ensureAssets(series).filter(function (a) {
        if (!a || !a.dataUrl) return false;
        if (a.kind === keyKind) return false;
        if (kind) return a.kind === kind || (!a.kind && kind === "sfx" && a.category === "audio");
        return a.kind === "bgm" || a.kind === "voice" || a.kind === "sfx" || a.kind === "ui" || !a.kind;
      });
    },

    defaultClickAssetId: function () {
      return "def_ui_tap";
    },

    audioKindLabel: function (kind) {
      var match = AUDIO_KINDS.find(function (k) { return k.id === kind; });
      return match ? match.label : kind || "Audio";
    },

    episodePlayUrl: function (seriesId, episodeId, from) {
      var url = "play.html?series=" + encodeURIComponent(seriesId) +
        "&episode=" + encodeURIComponent(episodeId);
      if (from) url += "&from=" + encodeURIComponent(from);
      return url;
    },

    fileToAudioDataUrl: function (file, options) {
      options = options || {};
      var seriesId = options.seriesId || activeSeriesId;
      return new Promise(function (resolve, reject) {
        if (!file) return reject(new Error("No file"));
        var name = (file.name || "").toLowerCase();
        var isAudio = (file.type && file.type.indexOf("audio/") === 0) ||
          /\.(mp3|wav|ogg|m4a|aac|webm|flac)$/i.test(name);
        if (!isAudio) return reject(new Error("Choose an audio file (MP3, WAV, OGG)."));
        if (file.size > 12 * 1024 * 1024) {
          return reject(new Error("Audio must be under 12 MB."));
        }
        var reader = new FileReader();
        reader.onload = function () {
          var dataUrl = reader.result;
          if (cloudEnabled() && cloudUserId && seriesId && window.ScenaCloud) {
            var assetId = ScenaCloud.newAssetId("audio");
            return ScenaCloud.uploadImage(cloudUserId, seriesId, "audio", assetId, dataUrl).then(function (url) {
              resolve({ dataUrl: url, mimeType: file.type || "audio/mpeg" });
            }).catch(function (err) {
              reject(err || new Error("Could not upload audio."));
            });
          }
          resolve({ dataUrl: dataUrl, mimeType: file.type || "audio/mpeg" });
        };
        reader.onerror = function () { reject(new Error("Could not read audio file.")); };
        reader.readAsDataURL(file);
      });
    },

    listSeries: function (userId) {
      var data = readAll();
      var list = (data[userId] || []).slice();
      list.sort(function (a, b) {
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      });
      return list;
    },

    getSeries: function (userId, seriesId) {
      var s = this.listSeries(userId).find(function (x) { return x.id === seriesId; }) || null;
      return s ? this.normalizeSeries(s) : null;
    },

    createSeries: function (userId) {
      if (!userId) return Promise.reject(new Error("Sign in to create a series."));
      var data = readAll();
      if (!data[userId]) data[userId] = [];
      var series = emptySeries();
      var graph = defaultGraph();
      series.nodes = graph.nodes;
      series.edges = graph.edges;
      series.entryNodeId = graph.entryNodeId;
      data[userId].push(series);
      return writeAll(data).then(function () {
        if (cloudEnabled() && userId && window.ScenaCloud) {
          ScenaCloud.saveSeries(userId, series).catch(function () { /* local copy is source of truth */ });
        }
        return this.normalizeSeries(series);
      }.bind(this));
    },

    hasTemplateImport: function (userId, templateId) {
      return this.listSeries(userId).some(function (s) {
        return s.templateSource === templateId;
      });
    },

    importTemplateSeries: function (userId, templateId) {
      if (!userId) return Promise.reject(new Error("Sign in to import templates."));
      if (!window.ScenaDemo || !ScenaDemo.getSeries) {
        return Promise.reject(new Error("Templates are not available."));
      }
      var demo = ScenaDemo.getSeries(templateId);
      if (!demo) return Promise.reject(new Error("Template not found."));

      var existing = this.listSeries(userId).find(function (s) {
        return s.templateSource === templateId;
      });
      if (existing) {
        var refreshed = JSON.parse(JSON.stringify(existing));
        applyDemoGraphToSeries(refreshed, demo);
        refreshed.updatedAt = new Date().toISOString();
        return this.saveSeries(userId, refreshed).then(function (result) {
          return result.series || refreshed;
        });
      }

      var copy = JSON.parse(JSON.stringify(demo));
      copy.id = uid();
      copy.templateSource = templateId;
      copy.status = "draft";
      copy.title = demo.title || "Imported template";
      copy.slug = slugify(copy.title + "-copy");
      copy.createdAt = new Date().toISOString();
      copy.updatedAt = copy.createdAt;
      this.normalizeSeries(copy);
      layoutTemplateGraph(copy);

      var data = readAll();
      if (!data[userId]) data[userId] = [];
      data[userId].push(copy);

      return writeAll(data).then(function () {
        if (cloudEnabled() && userId) {
          return ScenaCloud.saveSeries(userId, copy).then(function () {
            return ScenaStore.normalizeSeries(copy);
          });
        }
        return ScenaStore.normalizeSeries(copy);
      });
    },

    resetSeriesForCreator: function (userId, seriesId, opts) {
      opts = opts || {};
      if (!userId) return Promise.reject(new Error("Sign in to reset this series."));
      var series = this.getSeries(userId, seriesId);
      if (!series) return Promise.reject(new Error("Series not found."));

      var restoredGraph = false;
      if (series.templateSource && window.ScenaDemo && ScenaDemo.getSeries) {
        var demo = ScenaDemo.getSeries(series.templateSource);
        if (demo) {
          applyDemoGraphToSeries(series, demo);
          restoredGraph = true;
        }
      }

      lockSeriesToEpisodeOne(series);
      series.updatedAt = new Date().toISOString();

      return this.saveSeries(userId, series).then(function (result) {
        if (result.ok === false) {
          return Promise.reject(new Error(result.error || "Could not save reset series."));
        }
        if (window.ScenaProgress) {
          var scopeId = ScenaProgress.scopeFromUser(userId);
          ScenaProgress.resetSeries(scopeId, series.id);
        }
        return {
          series: result.series || series,
          restoredGraph: restoredGraph,
          templateSource: series.templateSource || null,
        };
      });
    },

    layoutTemplateGraph: layoutTemplateGraph,
    buildEpisodeNodeMap: buildEpisodeNodeMap,
    updateEpisodeRegions: updateEpisodeRegions,
    syncEpisodeEntries: syncEpisodeEntriesInline,
    crossChapterEdges: function (series, fromEp, toEp) {
      return crossChapterEdgesInline(series, fromEp, toEp);
    },
    nodeGraphSize: nodeGraphSize,
    validateGraph: validateGraph,

    ensureTemplateImports: function (userId, templateIds) {
      if (!userId || !templateIds || !templateIds.length) return Promise.resolve([]);
      var self = this;
      var imported = [];
      return templateIds.reduce(function (chain, templateId) {
        return chain.then(function () {
          return self.importTemplateSeries(userId, templateId).then(function (series) {
            imported.push(series);
          }).catch(function () { /* skip failed template */ });
        });
      }, Promise.resolve()).then(function () { return imported; });
    },

    saveSeries: function (userId, series) {
      var data = readAll();
      if (!data[userId]) data[userId] = [];
      series.updatedAt = new Date().toISOString();
      if (this.hasPublishedEpisodes(series)) {
        series.status = "published";
      }
      if (!series.backgroundScenes) series.backgroundScenes = [];
      if (!series.characterProfiles) series.characterProfiles = [];
      var idx = data[userId].findIndex(function (s) { return s.id === series.id; });
      if (idx === -1) data[userId].push(series);
      else data[userId][idx] = series;

      return writeAll(data).then(function () {
        if (cloudEnabled() && userId) {
          return ScenaCloud.saveSeries(userId, series).then(function (cloudResult) {
            if (!cloudResult.ok) {
              return { ok: false, error: cloudResult.error || "Could not save to cloud.", local: true };
            }
            return {
              ok: true,
              cloud: true,
              imagesPending: cloudResult.imagesPending,
              warning: cloudResult.warning,
              series: series,
            };
          });
        }
        return { ok: true, cloud: false, series: series };
      }).catch(function (e) {
        return { ok: false, error: storageErrorMessage(e) };
      });
    },

    deleteSeries: function (userId, seriesId) {
      var data = readAll();
      if (!data[userId]) return Promise.resolve();
      data[userId] = data[userId].filter(function (s) { return s.id !== seriesId; });
      if (activeSeriesId === seriesId) activeSeriesId = null;
      return writeAll(data).then(function () {
        if (cloudEnabled() && userId && window.ScenaCloud) {
          ScenaCloud.deleteSeries(userId, seriesId).catch(function () { /* local delete succeeded */ });
        }
      });
    },

    fileToDataUrl: function (file, options) {
      options = options || {};
      var purpose = options.purpose || "default";
      var seriesId = options.seriesId || activeSeriesId;
      var opts = compressionOptions(purpose);
      return new Promise(function (resolve, reject) {
        if (!file) return reject(new Error("No file"));
        if (file.size > 25 * 1024 * 1024) {
          return reject(new Error("Image must be under 25 MB before upload."));
        }
        var reader = new FileReader();
        reader.onload = function () {
          compressImageDataUrl(reader.result, file, opts).then(function (dataUrl) {
            if (cloudEnabled() && cloudUserId && seriesId && window.ScenaCloud) {
              var category = purpose.replace(/[^a-z0-9-]/gi, "-") || "upload";
              var assetId = ScenaCloud.newAssetId(category);
              return ScenaCloud.uploadImage(cloudUserId, seriesId, category, assetId, dataUrl).then(resolve).catch(function (err) {
                reject(err || new Error("Could not upload to cloud."));
              });
            }
            resolve(dataUrl);
          }).catch(function () {
            resolve(reader.result);
          });
        };
        reader.onerror = function () { reject(new Error("Could not read image file.")); };
        reader.readAsDataURL(file);
      });
    },

    hasPublishedEpisodes: function (series) {
      return (series.episodes || []).some(function (ep) {
        return isEpisodePublic(ep) || isEpisodeScheduled(ep);
      });
    },

    episodePublishAt: episodePublishAt,

    isEpisodePublic: isEpisodePublic,

    isEpisodeScheduled: isEpisodeScheduled,

    episodePublishStatus: episodePublishStatus,

    publishEpisode: function (series, episodeOrId, opts) {
      if (!series) return series;
      var ep = typeof episodeOrId === "string"
        ? (series.episodes || []).find(function (item) { return item.id === episodeOrId; })
        : episodeOrId;
      publishEpisodeInline(series, ep, opts);
      syncSeriesEpisodeState(series);
      return series;
    },

    sortedEpisodesByBoundary: function (series) {
      return (series.episodes || [])
        .filter(function (ep) { return typeof ep.boundaryX === "number" && !isNaN(ep.boundaryX); })
        .sort(function (a, b) { return a.boundaryX - b.boundaryX; });
    },

    nodeCenterX: function (node, width) {
      var size = nodeGraphSize(node);
      if (width && width !== size.width) {
        return (node && typeof node.x === "number" ? node.x : 0) + width / 2;
      }
      return (node && typeof node.x === "number" ? node.x : 0) + size.width / 2;
    },

    nodeCenterY: function (node) {
      var size = nodeGraphSize(node);
      return (node && typeof node.y === "number" ? node.y : 0) + size.height / 2;
    },

    episodeForNode: function (series, node, width) {
      if (!node) return null;
      var size = nodeGraphSize(node);
      var centerX = node.x + size.width / 2;
      var centerY = node.y + size.height / 2;
      var sorted = this.sortedEpisodesByBoundary(series);
      var left = 0;
      for (var i = 0; i < sorted.length; i++) {
        var ep = sorted[i];
        if (centerX >= left && centerX < ep.boundaryX) {
          if (typeof ep.regionTop === "number" && typeof ep.regionBottom === "number") {
            if (centerY >= ep.regionTop && centerY <= ep.regionBottom) return ep;
            return null;
          }
          return ep;
        }
        left = ep.boundaryX;
      }
      return null;
    },

    episodeAtCanvasPoint: function (series, x, y) {
      var sorted = this.sortedEpisodesByBoundary(series);
      var left = 0;
      for (var i = 0; i < sorted.length; i++) {
        var ep = sorted[i];
        if (typeof ep.boundaryX !== "number" || isNaN(ep.boundaryX)) continue;
        if (x < left || x >= ep.boundaryX) {
          left = ep.boundaryX;
          continue;
        }
        if (typeof ep.regionTop === "number" && typeof ep.regionBottom === "number") {
          if (y >= ep.regionTop && y <= ep.regionBottom) return ep;
          return null;
        }
        return ep;
      }
      return null;
    },

    isNodeInPublishedEpisode: function (series, node, width) {
      var ep = this.episodeForNode(series, node, width);
      return Boolean(ep && isEpisodePublic(ep));
    },

    episodeRegionSummary: function (series, ep) {
      if (!ep) return "—";
      if (typeof ep.boundaryX === "number") {
        var sorted = this.sortedEpisodesByBoundary(series);
        var idx = sorted.findIndex(function (e) { return e.id === ep.id; });
        var prevX = idx > 0 ? sorted[idx - 1].boundaryX : 0;
        return "x " + Math.round(prevX) + " → " + Math.round(ep.boundaryX);
      }
      var start = this.nodeLabel(series.nodes.find(function (n) { return n.id === ep.startNodeId; }));
      var end = this.nodeLabel(series.nodes.find(function (n) { return n.id === ep.endNodeId; }));
      if (start === "Unknown" && end === "Unknown") return "Set boundary on graph";
      return start + " → " + end;
    },

    episodeBounds: function (series, episode) {
      if (!episode || typeof episode.boundaryX !== "number" || isNaN(episode.boundaryX)) {
        return { leftX: 0, rightX: null, topY: null, bottomY: null };
      }
      var sorted = this.sortedEpisodesByBoundary(series);
      var idx = sorted.findIndex(function (e) { return e.id === episode.id; });
      return {
        leftX: idx > 0 ? sorted[idx - 1].boundaryX : 0,
        rightX: episode.boundaryX,
        topY: typeof episode.regionTop === "number" ? episode.regionTop : null,
        bottomY: typeof episode.regionBottom === "number" ? episode.regionBottom : null,
      };
    },

    nodesInEpisode: function (series, episode, nodeWidth) {
      nodeWidth = nodeWidth || 220;
      if (!episode) return [];
      return (series.nodes || []).filter(function (n) {
        var ep = ScenaStore.episodeForNode(series, n, nodeWidth);
        return ep && ep.id === episode.id;
      });
    },

    nodeInEpisode: function (series, node, episode, nodeWidth) {
      if (!node || !episode) return false;
      return this.nodesInEpisode(series, episode, nodeWidth).some(function (n) {
        return n.id === node.id;
      });
    },

    isEpisodePlayTarget: function (series, node, episode, nodeWidth) {
      if (!node || !episode) return false;
      if (this.nodeInEpisode(series, node, episode, nodeWidth)) return true;
      if (isRouterNode(node) || this.shouldAutoAdvance(node)) return true;
      return false;
    },

    episodePlayStart: function (series, episode, nodeWidth) {
      nodeWidth = nodeWidth || 220;
      var entries = this.episodeEntryNodes(series, episode);
      if (entries.length === 1) return entries[0];
      if (entries.length > 1 && episode.startNodeId) {
        var preferred = entries.find(function (n) { return n.id === episode.startNodeId; });
        if (preferred) return preferred;
      }
      if (entries.length) return entries[0];

      var nodes = this.nodesInEpisode(series, episode, nodeWidth);
      if (!nodes.length) return null;
      var entry = this.resolveEntryNode(series);
      if (entry && nodes.some(function (n) { return n.id === entry.id; })) return entry;
      nodes.sort(function (a, b) { return a.x - b.x; });
      return nodes[0];
    },

    orderedEpisodes: function (series) {
      return computeEpisodeConnectivityOrder(series);
    },

    computeEpisodeConnectivityOrder: computeEpisodeConnectivityOrder,

    syncSeriesEpisodeState: syncSeriesEpisodeState,

    unpublishEpisode: function (series, episodeOrId) {
      if (!series) return series;
      var ep = typeof episodeOrId === "string"
        ? (series.episodes || []).find(function (item) { return item.id === episodeOrId; })
        : episodeOrId;
      unpublishEpisodeInline(series, ep);
      syncSeriesEpisodeState(series);
      return series;
    },

    deleteEpisodeRegion: deleteEpisodeRegion,

    episodeHasNodes: function (series, episode) {
      return episodeHasNodes(series, episode);
    },

    nextEpisode: function (series, episode) {
      if (!episode) return null;
      var ordered = this.orderedEpisodes(series);
      var idx = ordered.findIndex(function (ep) { return ep.id === episode.id; });
      if (idx < 0 || idx >= ordered.length - 1) return null;
      return ordered[idx + 1];
    },

    previousEpisode: function (series, episode) {
      if (!episode) return null;
      var ordered = this.orderedEpisodes(series);
      var idx = ordered.findIndex(function (ep) { return ep.id === episode.id; });
      if (idx <= 0) return null;
      return ordered[idx - 1];
    },

    computeEpisodeEntryNodeIds: function (series, episode) {
      if (!episode) return [];
      var epNodeIds = this.nodesInEpisode(series, episode).map(function (n) { return n.id; });
      var ids = [];
      var prev = this.previousEpisode(series, episode);

      if (prev) {
        var prevIds = this.nodesInEpisode(series, prev).map(function (n) { return n.id; });
        (series.edges || []).forEach(function (edge) {
          if (prevIds.indexOf(edge.source) >= 0 && epNodeIds.indexOf(edge.target) >= 0 && ids.indexOf(edge.target) < 0) {
            ids.push(edge.target);
          }
        });
      } else if (series.entryNodeId && epNodeIds.indexOf(series.entryNodeId) >= 0) {
        ids.push(series.entryNodeId);
      }

      if (!ids.length && episode.startNodeId && epNodeIds.indexOf(episode.startNodeId) >= 0) {
        ids.push(episode.startNodeId);
      }

      return ids;
    },

    episodeEntryNodes: function (series, episode) {
      var ids = (episode && episode.entryNodeIds && episode.entryNodeIds.length)
        ? episode.entryNodeIds.slice()
        : this.computeEpisodeEntryNodeIds(series, episode);
      return ids.map(function (id) {
        return (series.nodes || []).find(function (n) { return n.id === id; }) || null;
      }).filter(Boolean);
    },

    isEpisodeEntryBeat: function (series, nodeId) {
      if (!nodeId) return null;
      var node = (series.nodes || []).find(function (n) { return n.id === nodeId; });
      if (!node) return null;
      var ep = this.episodeForNode(series, node);
      if (!ep) return null;
      var ids = (ep.entryNodeIds && ep.entryNodeIds.length)
        ? ep.entryNodeIds
        : this.computeEpisodeEntryNodeIds(series, ep);
      return ids.indexOf(nodeId) >= 0 ? ep : null;
    },

    episodeContinuityStart: function (series, episode, exitNodeId, nodeWidth, prevChoicesMade) {
      nodeWidth = nodeWidth || 220;
      var epNodes = this.nodesInEpisode(series, episode, nodeWidth);
      if (!epNodes.length) return null;

      function nodeById(id) {
        return (series.nodes || []).find(function (n) { return n.id === id; }) || null;
      }

      function inEpisode(id) {
        return epNodes.some(function (n) { return n.id === id; });
      }

      if (exitNodeId) {
        var edges = (series.edges || []).filter(function (e) { return e.source === exitNodeId; });
        var choices = prevChoicesMade || [];
        var choiceMatches = [];

        edges.forEach(function (e) {
          if (e.choiceId && choices.indexOf(e.choiceId) >= 0 && inEpisode(e.target)) {
            choiceMatches.push(e);
          }
        });

        if (choiceMatches.length === 1) {
          return nodeById(choiceMatches[0].target);
        }
        if (choiceMatches.length > 1) {
          choiceMatches.sort(function (a, b) {
            var aEntry = episode.entryNodeIds && episode.entryNodeIds.indexOf(a.target) >= 0 ? 0 : 1;
            var bEntry = episode.entryNodeIds && episode.entryNodeIds.indexOf(b.target) >= 0 ? 0 : 1;
            return aEntry - bEntry;
          });
          return nodeById(choiceMatches[0].target);
        }

        for (var i = 0; i < edges.length; i++) {
          if (edges[i].choiceId) continue;
          if (inEpisode(edges[i].target)) return nodeById(edges[i].target);
        }
      }

      var prevEp = this.previousEpisode(series, episode);
      if (prevEp && prevChoicesMade && prevChoicesMade.length) {
        var prevIds = this.nodesInEpisode(series, prevEp, nodeWidth).map(function (n) { return n.id; });
        var crossMatches = [];
        (series.edges || []).forEach(function (e) {
          if (prevIds.indexOf(e.source) < 0 || !inEpisode(e.target) || !e.choiceId) return;
          if (prevChoicesMade.indexOf(e.choiceId) >= 0) crossMatches.push(e);
        });
        if (crossMatches.length === 1) {
          return nodeById(crossMatches[0].target);
        }
        if (crossMatches.length > 1) {
          crossMatches.sort(function (a, b) {
            var aEntry = episode.entryNodeIds && episode.entryNodeIds.indexOf(a.target) >= 0 ? 0 : 1;
            var bEntry = episode.entryNodeIds && episode.entryNodeIds.indexOf(b.target) >= 0 ? 0 : 1;
            return aEntry - bEntry;
          });
          return nodeById(crossMatches[0].target);
        }
      }

      var entryNodes = this.episodeEntryNodes(series, episode);
      if (entryNodes.length === 1) return entryNodes[0];

      if (episode.startNodeId) {
        var start = nodeById(episode.startNodeId);
        if (start && inEpisode(start.id)) return start;
      }

      return this.episodePlayStart(series, episode, nodeWidth);
    },

    episodeEndingDefinitions: function (series, episode) {
      if (!episode) return [];

      if (episode.branchEndings && episode.branchEndings.length) {
        return episode.branchEndings.map(function (b) {
          return {
            key: episode.id + ":branch:" + b.id,
            episodeId: episode.id,
            nodeId: b.exitNodeId || null,
            label: b.label || b.id,
          };
        });
      }

      var defs = [];
      var nodes = this.nodesInEpisode(series, episode, 220);
      nodes.forEach(function (n) {
        if (!n.data || !n.data.isEnd) return;
        defs.push({
          key: episode.id + ":" + n.id,
          episodeId: episode.id,
          nodeId: n.id,
          label: n.data.endingLabel || ScenaStore.nodeLabel(n),
        });
      });
      return defs;
    },

    seriesMenuUrl: function (seriesId) {
      return "series.html?series=" + encodeURIComponent(seriesId);
    },

    normalizeEpisodes: function (series) {
      series.episodes = series.episodes || [];
      series.episodes.forEach(function (ep, i) {
        if (!ep.number) ep.number = i + 1;
        normalizeEpisodePublish(ep);
      });
      return series.episodes;
    },

    emptyBeatData: emptyBeatData,
    migrateNode: migrateNode,

    hasChoices: function (node) {
      return Boolean(node && node.data && node.data.choices && node.data.choices.length > 0);
    },

    isLinearBeat: function (node) {
      return Boolean(node && node.type === "beat" && !this.hasChoices(node) && !(node.data && node.data.isEnd));
    },

    shouldAutoAdvance: function (node) {
      var kind = this.getBeatKind(node);
      if (kind === "flow-gate") return true;
      if (kind === "choice-route-gate" || kind === "route-gate") return true;
      if (kind === "metric-route-gate") return true;
      if (kind === "logic" || kind === "key-item") return true;
      return Boolean(node && node.data && node.data.autoAdvance && !this.hasChoices(node));
    },

    isKeyItemGrant: function (node) {
      return this.getBeatKind(node) === "key-item";
    },

    listKeyItemAssets: function (series) {
      var kind = root.ScenaKeyItem ? ScenaKeyItem.KIND : "keyItem";
      return this.ensureAssets(series).filter(function (a) {
        return a && a.kind === kind;
      });
    },

    getKeyItemAsset: function (series, assetId) {
      if (!assetId) return null;
      return this.listKeyItemAssets(series).find(function (a) { return a.id === assetId; }) || null;
    },

    createKeyItemAsset: function (series, spec) {
      spec = spec || {};
      var defaultIcon = root.ScenaKeyItem ? ScenaKeyItem.iconForLabel(spec.label || "") : null;
      var iconUrl = spec.iconDataUrl || spec.dataUrl || (defaultIcon ? defaultIcon.dataUrl : null);
      var KeyItem = root.ScenaKeyItem;
      var item = KeyItem
        ? new KeyItem(Object.assign({}, spec, { id: spec.id || this.assetUid("ki"), iconDataUrl: iconUrl }))
        : {
          id: spec.id || this.assetUid("ki"),
          kind: "keyItem",
          label: spec.label || "Untitled item",
          description: spec.description || "",
          hiddenFromPlayer: !!(spec.hiddenFromPlayer != null ? spec.hiddenFromPlayer : spec.hidden),
          hiddenFromInventory: !!spec.hiddenFromInventory,
          dataUrl: iconUrl,
        };
      var asset = KeyItem ? item.toAsset() : item;
      this.ensureAssets(series).push(asset);
      return asset;
    },

    grantKeyItem: function (inventory, assetId, amount) {
      if (!inventory || !assetId) return inventory || {};
      var n = amount != null ? (parseInt(amount, 10) || 0) : 1;
      if (n <= 0) return inventory;
      inventory[assetId] = (parseInt(inventory[assetId], 10) || 0) + n;
      return inventory;
    },

    hasKeyItem: function (inventory, assetId) {
      return (parseInt(inventory && inventory[assetId], 10) || 0) > 0;
    },

    keyItemCount: function (inventory, assetId) {
      return parseInt(inventory && inventory[assetId], 10) || 0;
    },

    listVisibleKeyItems: function (series, inventory) {
      inventory = inventory || {};
      var self = this;
      var rows = [];
      this.listKeyItemAssets(series).forEach(function (asset) {
        asset = normalizeKeyItemAsset(asset);
        var count = self.keyItemCount(inventory, asset.id);
        if (count <= 0) return;
        var item = root.ScenaKeyItem ? ScenaKeyItem.fromAsset(asset) : null;
        if (item && !item.isVisibleInInventory()) return;
        if (!item && (asset.hiddenFromPlayer || asset.hiddenFromInventory)) return;
        rows.push({ asset: asset, count: 1 });
      });
      return rows;
    },

    listVisibleHudKeyItems: function (series, inventory) {
      inventory = inventory || {};
      var self = this;
      var rows = [];
      this.listKeyItemAssets(series).forEach(function (asset) {
        asset = normalizeKeyItemAsset(asset);
        var count = self.keyItemCount(inventory, asset.id);
        if (count <= 0) return;
        var item = root.ScenaKeyItem ? ScenaKeyItem.fromAsset(asset) : null;
        if (item && !item.isVisibleToPlayer()) return;
        if (!item && asset.hiddenFromPlayer) return;
        rows.push({ asset: asset, count: 1 });
      });
      return rows;
    },

    listVisibleInventoryMetrics: function (series, metrics) {
      metrics = metrics || {};
      var rows = [];
      (series.metrics || []).forEach(function (metric) {
        metric = normalizeMetric(metric);
        if (!metric.key || metricHiddenFromPlayer(metric) || metricHiddenFromInventory(metric)) return;
        var val = metrics[metric.key];
        if (val == null) val = metric.defaultValue;
        rows.push({ metric: metric, value: val });
      });
      return rows;
    },

    listVisibleHudMetrics: function (series, metrics) {
      metrics = metrics || {};
      var rows = [];
      (series.metrics || []).forEach(function (metric) {
        metric = normalizeMetric(metric);
        if (!metric.key || metricHiddenFromPlayer(metric)) return;
        var val = metrics[metric.key];
        if (val == null) val = metric.defaultValue;
        rows.push({ metric: metric, value: val });
      });
      return rows;
    },

    normalizeMetric: normalizeMetric,

    normalizeKeyItemAsset: normalizeKeyItemAsset,

    beatMeetsChoiceRequirements: function (node, choicesMade) {
      if (!node || !node.data) return true;
      var required = node.data.requiresChoiceIds || [];
      if (!required.length) return true;
      choicesMade = choicesMade || [];
      return required.every(function (choiceId) {
        return choicesMade.indexOf(choiceId) >= 0;
      });
    },

    choiceHasMetricGate: choiceHasMetricGate,

    choiceMeetsMetricRequirement: choiceMeetsMetricRequirement,

    choiceHasPriorChoiceGate: choiceHasPriorChoiceGate,

    choiceHasAnyGate: choiceHasAnyGate,

    choiceMeetsPriorChoiceRequirement: choiceMeetsPriorChoiceRequirement,

    filterVisibleChoices: function (node, metrics, choicesMade, keyItems) {
      if (!node || !node.data || !this.hasChoices(node)) return [];
      return filterVisibleChoices(node.data.choices, metrics, choicesMade, keyItems);
    },

    formatMetricRequirementLabel: formatMetricRequirementLabel,

    metricCompareOps: function () {
      return [
        { id: "gte", label: "At least" },
        { id: "gt", label: "Greater than" },
        { id: "lte", label: "At most" },
        { id: "lt", label: "Less than" },
        { id: "eq", label: "Equal to" },
        { id: "neq", label: "Not equal to" },
      ];
    },

    resolveBeatDialogue: function (node) {
      if (!node || !node.data) return { text: "", speaker: null };
      return { text: node.data.dialogueText || "", speaker: null };
    },

    allSeriesChoiceIds: function (series) {
      return this.listSeriesChoices(series).map(function (c) { return c.id; });
    },

    listSeriesChoices: function (series) {
      var self = this;
      var choices = [];
      (series.nodes || []).forEach(function (node) {
        if (!node.data || !node.data.choices || !node.data.choices.length) return;
        var ep = self.episodeForNode(series, node);
        var dialoguePreview = node.data.dialogueText || "";
        if (!dialoguePreview && node.data.dialogue && node.data.dialogue[0]) {
          dialoguePreview = node.data.dialogue[0].text || "";
        }
        if (dialoguePreview.length > 72) {
          dialoguePreview = dialoguePreview.slice(0, 69) + "…";
        }
        var beatLabel = self.nodeLabel(node);
        node.data.choices.forEach(function (choice) {
          if (!choice.id) return;
          choices.push({
            id: choice.id,
            label: choice.choiceText || choice.label || choice.id,
            beatId: node.id,
            beatLabel: beatLabel,
            episodeNumber: ep ? ep.number : null,
            episodeTitle: ep ? ep.title : "Offstage",
            dialoguePreview: dialoguePreview,
          });
        });
      });
      choices.sort(function (a, b) {
        var epA = a.episodeNumber == null ? 9999 : a.episodeNumber;
        var epB = b.episodeNumber == null ? 9999 : b.episodeNumber;
        if (epA !== epB) return epA - epB;
        if (a.beatId !== b.beatId) return a.beatId < b.beatId ? -1 : 1;
        return a.label < b.label ? -1 : 1;
      });
      return choices;
    },

    resolveChoiceLabels: function (series, episode, choiceIds) {
      var epNum = episode && episode.number;
      var catalog = this.listSeriesChoices(series);
      return (choiceIds || []).map(function (id) {
        var match = catalog.find(function (c) {
          return c.id === id && (epNum == null || c.episodeNumber === epNum);
        }) || catalog.find(function (c) { return c.id === id; });
        return {
          id: id,
          label: match ? match.label : id,
        };
      });
    },

    speakerDisplayName: function (node, series) {
      var data = (node && node.data) || {};
      if (data.characterProfileId && series) {
        var profile = this.getCharacter(series, data.characterProfileId);
        if (profile && profile.name) return profile.name;
      }
      return "Narration";
    },

    nodeLabel: function (node) {
      if (!node) return "Unknown";
      if (node.type !== "beat") return node.type;
      var kind = this.getBeatKind(node);
      if (kind !== "story") return beatKindTitle(kind);
      var data = node.data || {};
      if (this.hasChoices(node)) {
        var count = data.choices.length;
        return count === 1 ? "1 choice" : count + " choices";
      }
      var text = data.dialogueText || "";
      if (!text && data.dialogue && data.dialogue[0]) {
        text = data.dialogue[0].text || "";
      }
      if (text) return text.length > 32 ? text.slice(0, 32) + "…" : text;
      return "Story beat";
    },

    colorFromName: function (name) {
      var palette = ["#ff8c00", "#7c6fd4", "#e63946", "#2a9d8f", "#457b9d", "#f4a261", "#9b5de5", "#06d6a0"];
      var hash = 0;
      var str = String(name || "default");
      for (var i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
      return palette[Math.abs(hash) % palette.length];
    },

    normalizeSeries: function (series) {
      if (!series) return series;
      if (!series.nodes) series.nodes = [];
      if (!series.edges) series.edges = [];
      if (!series.episodes) series.episodes = [];
      if (!series.characterProfiles) series.characterProfiles = [];
      if (!series.backgroundScenes) series.backgroundScenes = [];
      if (!series.metrics) series.metrics = [];
      series.metrics = series.metrics.map(function (m) { return normalizeMetric(m); });
      if (!series.assets) series.assets = [];
      series.assets = series.assets.map(function (a) { return normalizeKeyItemAsset(a); });
      if (series.nodes && series.nodes.length) {
        var store = this;
        series.nodes = series.nodes.map(function (n) { return migrateNode(n); });
        series.nodes.forEach(function (n) {
          var isEntry = !store.nodeHasIncomingLinks(series, n.id);
          if (isEntry) {
            n.data.overrideStage = false;
            n.data.overrideCharacter = false;
            n.data.overrideBgm = false;
          } else {
            if (n.data.backgroundSceneId && !n.data.overrideStage) n.data.overrideStage = true;
            if (n.data.characterProfileId && !n.data.overrideCharacter) n.data.overrideCharacter = true;
            if (n.data.bgmAssetId && !n.data.overrideBgm && !isEntry) n.data.overrideBgm = true;
          }
        });
      }
      this.ensureDefaultAudio(series);
      this.normalizeEpisodes(series);
      this.ensureReaderUi(series);
      this.ensureEntryNode(series);
      try {
        if (this.sortedEpisodesByBoundary(series).length) {
          syncSeriesEpisodeState(series);
        }
      } catch (e) {
        /* keep editor usable if episode sync fails on legacy data */
      }
      return series;
    },

    buildIncomingAdjacency: function (series) {
      var incoming = {};
      (series.edges || []).forEach(function (e) {
        if (!e.target) return;
        if (!incoming[e.target]) incoming[e.target] = [];
        if (incoming[e.target].indexOf(e.source) < 0) incoming[e.target].push(e.source);
      });
      return incoming;
    },

    nodeHasIncomingLinks: function (series, nodeId) {
      var incoming = this.buildIncomingAdjacency(series);
      return Boolean(incoming[nodeId] && incoming[nodeId].length);
    },

    findEntryCandidates: function (series) {
      var incoming = this.buildIncomingAdjacency(series);
      return (series.nodes || []).filter(function (n) {
        return !incoming[n.id] || !incoming[n.id].length;
      });
    },

    inferEntryNodeId: function (series) {
      if (!series || !series.nodes || !series.nodes.length) return null;
      var candidates = this.findEntryCandidates(series);
      if (!candidates.length) return series.nodes[0].id;
      if (candidates.length === 1) return candidates[0].id;
      candidates.sort(function (a, b) {
        var ax = typeof a.x === "number" ? a.x : 0;
        var bx = typeof b.x === "number" ? b.x : 0;
        if (ax !== bx) return ax - bx;
        return (typeof a.y === "number" ? a.y : 0) - (typeof b.y === "number" ? b.y : 0);
      });
      return candidates[0].id;
    },

    resolveEntryNodeId: function (series) {
      if (!series || !series.nodes || !series.nodes.length) return null;
      if (series.entryNodeId) {
        var assigned = series.nodes.some(function (n) { return n.id === series.entryNodeId; });
        if (assigned) return series.entryNodeId;
      }
      return this.inferEntryNodeId(series);
    },

    resolveEntryNode: function (series) {
      var id = this.resolveEntryNodeId(series);
      if (!id) return null;
      return (series.nodes || []).find(function (n) { return n.id === id; }) || null;
    },

    ensureEntryNode: function (series) {
      if (!series || !series.nodes || !series.nodes.length) {
        if (series) series.entryNodeId = null;
        return null;
      }
      var resolved = this.resolveEntryNodeId(series);
      if (!series.entryNodeId || !series.nodes.some(function (n) { return n.id === series.entryNodeId; })) {
        series.entryNodeId = resolved;
      }
      return series.entryNodeId;
    },

    isStoryEntryBeat: function (series, nodeId) {
      return Boolean(nodeId && this.resolveEntryNodeId(series) === nodeId);
    },

    isEntryBeat: function (series, nodeId) {
      return !this.nodeHasIncomingLinks(series, nodeId);
    },

    resolvePresentation: function (series, nodeId) {
      var result = {
        backgroundSceneId: null,
        characterProfileId: null,
        spriteId: null,
        slot: "center",
        hasStage: false,
        hasCharacter: false,
      };
      if (!nodeId || !series.nodes || !series.nodes.length) return result;

      var incoming = this.buildIncomingAdjacency(series);
      var nodesById = {};
      series.nodes.forEach(function (n) { nodesById[n.id] = n; });

      var visited = {};
      var queue = [];

      function isEntry(id) {
        return !incoming[id] || !incoming[id].length;
      }

      function consider(node) {
        if (!node || !node.data) return;
        var d = node.data;
        var entry = isEntry(node.id);
        if (!result.hasStage && (entry || d.overrideStage) && d.backgroundSceneId) {
          result.backgroundSceneId = d.backgroundSceneId;
          result.hasStage = true;
        }
        if (!result.hasCharacter && (entry || d.overrideCharacter) && d.characterProfileId) {
          result.characterProfileId = d.characterProfileId;
          result.spriteId = d.spriteId || null;
          result.slot = d.slot || "center";
          result.hasCharacter = true;
        }
      }

      function enqueueParents(id) {
        (incoming[id] || []).forEach(function (pid) {
          if (!visited[pid]) {
            visited[pid] = true;
            queue.push(pid);
          }
        });
      }

      var start = nodesById[nodeId];
      if (!start) return result;
      consider(start);
      visited[nodeId] = true;
      enqueueParents(nodeId);

      while (queue.length && (!result.hasStage || !result.hasCharacter)) {
        var currentId = queue.shift();
        consider(nodesById[currentId]);
        enqueueParents(currentId);
      }

      return result;
    },

    inheritedStageLabel: function (series, nodeId) {
      var resolved = this.resolvePresentation(series, nodeId);
      if (!resolved.hasStage) return "None yet — set a stage on the opening beat";
      var bg = this.getBackground(series, resolved.backgroundSceneId);
      return bg ? bg.name : "Unknown stage";
    },

    inheritedCharacterLabel: function (series, nodeId) {
      var resolved = this.resolvePresentation(series, nodeId);
      if (!resolved.hasCharacter) return "Narration (no character on stage)";
      var profile = this.getCharacter(series, resolved.characterProfileId);
      var name = profile ? profile.name : "Character";
      var sprites = this.spritesForProfile(series, resolved.characterProfileId);
      var sp = sprites.find(function (s) { return s.id === resolved.spriteId; });
      var pose = sp ? sp.label : "default pose";
      return name + " · " + pose + " · " + (resolved.slot || "center");
    },

    resolveAudio: function (series, nodeId) {
      var result = { bgmAssetId: null, hasBgm: false };
      if (!nodeId || !series.nodes || !series.nodes.length) return result;

      var incoming = this.buildIncomingAdjacency(series);
      var nodesById = {};
      series.nodes.forEach(function (n) { nodesById[n.id] = n; });

      var visited = {};
      var queue = [];

      function isEntry(id) {
        return !incoming[id] || !incoming[id].length;
      }

      function consider(node) {
        if (!node || !node.data) return;
        var d = node.data;
        var entry = isEntry(node.id);
        if (!result.hasBgm && (entry || d.overrideBgm) && d.bgmAssetId) {
          result.bgmAssetId = d.bgmAssetId;
          result.hasBgm = true;
        }
      }

      function enqueueParents(id) {
        (incoming[id] || []).forEach(function (pid) {
          if (!visited[pid]) {
            visited[pid] = true;
            queue.push(pid);
          }
        });
      }

      var start = nodesById[nodeId];
      if (!start) return result;
      consider(start);
      visited[nodeId] = true;
      enqueueParents(nodeId);

      while (queue.length && !result.hasBgm) {
        var currentId = queue.shift();
        consider(nodesById[currentId]);
        enqueueParents(currentId);
      }

      return result;
    },

    inheritedBgmLabel: function (series, nodeId) {
      var resolved = this.resolveAudio(series, nodeId);
      if (!resolved.hasBgm) return "None yet — set background music on the opening beat";
      var asset = this.getAudioAsset(series, resolved.bgmAssetId);
      return asset ? asset.label : "Unknown clip";
    },

    ensureProfiles: function (series) {
      this.normalizeSeries(series);
      return series.characterProfiles;
    },

    ensureBackgrounds: function (series) {
      this.normalizeSeries(series);
      return series.backgroundScenes;
    },

    getCharacter: function (series, profileId) {
      return this.ensureProfiles(series).find(function (p) { return p.id === profileId; }) || null;
    },

    getBackground: function (series, sceneId) {
      return this.ensureBackgrounds(series).find(function (b) { return b.id === sceneId; }) || null;
    },

    spritesForProfile: function (series, profileId) {
      var profile = this.getCharacter(series, profileId);
      return profile ? (profile.sprites || []) : [];
    },

    assetUid: function (prefix) {
      return (prefix || "a") + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
    },
  };
})();
