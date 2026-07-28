/**
 * Arleco — community game jams (hosted by any signed-in creator).
 * Local-first storage; prize pools use ScenaWallet when available.
 */
(function () {
  var STORAGE_KEY = "arleco_game_jams";

  var SUBMISSION_MODES = [
    { id: "new_series", label: "New series only", hint: "Entrants must publish a brand-new series during the jam window." },
    { id: "new_episode", label: "New episode only", hint: "Entrants add a new episode to an existing series." },
    { id: "either", label: "New series or new episode", hint: "Either a new series or a new episode on an existing one." },
  ];

  var WINNER_MODES = [
    { id: "auto_likes", label: "Most likes (automatic)", hint: "When judging ends, the entries with the most likes place.", jamTypes: ["game"] },
    { id: "auto_rating", label: "Highest rated (automatic)", hint: "When judging ends, the highest-rated marketplace assets place. Rate entries during judging.", jamTypes: ["asset"] },
    { id: "host_picks", label: "Host picks winners", hint: "You choose 1st–Nth after submissions close.", jamTypes: ["game", "asset"] },
    { id: "unranked", label: "Unranked", hint: "No official winners — showcase only. Available when there is no Ducat prize.", jamTypes: ["game", "asset"], requiresNoPrize: true },
  ];

  var MAX_WINNERS = 10;

  var PARTICIPANT_PRIZE_MODES = [
    { id: "none", label: "Host-funded only" },
    { id: "optional", label: "Participants may add Ducats" },
    { id: "required", label: "Participants must add Ducats" },
  ];

  var ASSET_SUBMISSION_MODES = [
    { id: "new_listing", label: "Made during jam only", hint: "Entrants submit assets they created in their library during the submission window (not purchases, not older assets)." },
    { id: "either", label: "Made during jam, or new shop listing", hint: "Submit a library asset made during the jam, or publish one to the shop and enter it." },
    { id: "existing_listing", label: "Existing shop listing", hint: "Entrants may submit a live listing they already published (still must be seller-owned, not a purchase)." },
  ];

  var ASSET_CATEGORIES = [
    { id: "character", label: "Characters" },
    { id: "stage", label: "Stages" },
    { id: "item", label: "Items" },
    { id: "audio", label: "Audio" },
    { id: "pack", label: "Packs" },
  ];

  function jamTypeLabel(jamType) {
    return jamType === "asset" ? "Asset jam" : "Game jam";
  }

  function isAssetJam(jam) {
    migrateJam(jam);
    return jam.jamType === "asset";
  }

  function isGameJam(jam) {
    return !isAssetJam(jam);
  }

  function winnerModesFor(jamType, prizeEnabled) {
    var type = jamType === "asset" ? "asset" : "game";
    return WINNER_MODES.filter(function (m) {
      if ((m.jamTypes || []).indexOf(type) < 0) return false;
      if (m.requiresNoPrize && prizeEnabled) return false;
      return true;
    });
  }

  function clampWinnerCount(n) {
    n = parseInt(n, 10) || 1;
    if (n < 1) n = 1;
    if (n > MAX_WINNERS) n = MAX_WINNERS;
    return n;
  }

  function defaultPrizeSplits(n) {
    n = clampWinnerCount(n);
    if (n === 1) return [100];
    if (n === 2) return [70, 30];
    if (n === 3) return [50, 30, 20];
    if (n === 4) return [40, 30, 20, 10];
    if (n === 5) return [35, 25, 20, 12, 8];
    var base = Math.floor(100 / n);
    var splits = [];
    for (var i = 0; i < n; i++) splits.push(base);
    var rem = 100 - base * n;
    for (var j = 0; j < rem; j++) splits[j] += 1;
    return splits;
  }

  function normalizePrizeSplits(raw, winnerCount) {
    winnerCount = clampWinnerCount(winnerCount);
    var splits = Array.isArray(raw) ? raw.map(function (x) { return Math.max(0, parseInt(x, 10) || 0); }) : [];
    if (splits.length !== winnerCount) {
      splits = defaultPrizeSplits(winnerCount);
    }
    var sum = splits.reduce(function (a, b) { return a + b; }, 0);
    if (sum <= 0) splits = defaultPrizeSplits(winnerCount);
    return splits;
  }

  /** Largest-remainder allocation — whole Ducats only, always sums to total. */
  function allocatePrizeShares(total, splits) {
    total = Math.max(0, Math.floor(Number(total) || 0));
    splits = (splits || []).map(function (p) { return Math.max(0, parseInt(p, 10) || 0); });
    if (!total || !splits.length) return splits.map(function () { return 0; });
    var raw = splits.map(function (pct) { return (total * pct) / 100; });
    var floors = raw.map(function (r) { return Math.floor(r); });
    var allocated = floors.reduce(function (a, b) { return a + b; }, 0);
    var remainder = total - allocated;
    var order = raw.map(function (r, i) {
      return { i: i, frac: r - floors[i] };
    }).sort(function (a, b) {
      if (b.frac !== a.frac) return b.frac - a.frac;
      return a.i - b.i;
    });
    for (var k = 0; k < remainder; k++) {
      floors[order[k % order.length].i] += 1;
    }
    return floors;
  }

  function getWinnerIds(jam) {
    if (!jam) return [];
    var count = jam.winnerMode === "unranked" ? 0 : clampWinnerCount(jam.winnerCount || 1);
    var raw = Array.isArray(jam.winnerSubmissionIds) ? jam.winnerSubmissionIds.slice() : [];
    if (!raw.length && jam.winnerSubmissionId) raw = [jam.winnerSubmissionId];
    var out = [];
    for (var i = 0; i < count; i++) out.push(raw[i] || null);
    return out;
  }

  function setWinnerIds(jam, ids) {
    var count = jam.winnerMode === "unranked" ? 0 : clampWinnerCount(jam.winnerCount || 1);
    var stored = [];
    for (var i = 0; i < count; i++) stored.push((ids && ids[i]) || null);
    jam.winnerSubmissionIds = stored;
    jam.winnerSubmissionId = stored.find(Boolean) || null;
  }

  function submissionAvgRating(sub) {
    var ratings = (sub && sub.ratings) || {};
    var keys = Object.keys(ratings);
    if (keys.length) {
      var sum = 0;
      keys.forEach(function (uid) { sum += Math.max(0, parseInt(ratings[uid], 10) || 0); });
      return { avg: sum / keys.length, count: keys.length };
    }
    var avg = Number(sub && sub.marketplaceRatingAvg) || 0;
    var count = Math.max(0, parseInt(sub && sub.marketplaceRatingCount, 10) || 0);
    return { avg: avg, count: count };
  }

  function ordinalPlace(n) {
    var v = n % 100;
    if (v >= 11 && v <= 13) return n + "th";
    switch (n % 10) {
      case 1: return n + "st";
      case 2: return n + "nd";
      case 3: return n + "rd";
      default: return n + "th";
    }
  }

  function renderPrizeSplitChartHtml(splits, poolEstimate) {
    splits = splits || [];
    poolEstimate = Math.max(0, parseInt(poolEstimate, 10) || 0);
    var amounts = allocatePrizeShares(poolEstimate, splits);
    return splits.map(function (pct, i) {
      var width = Math.max(2, Math.min(100, pct));
      return (
        '<div class="jam-split-row" data-split-index="' + i + '">' +
          '<div class="jam-split-place">' + escapeHtml(ordinalPlace(i + 1)) + "</div>" +
          '<div class="jam-split-bar-wrap">' +
            '<div class="jam-split-bar" style="width:' + width + '%"></div>' +
          "</div>" +
          '<div class="jam-split-pct">' +
            '<input type="number" class="jam-split-input" name="prizeSplit" data-prize-split="' + i +
              '" min="0" max="100" step="1" value="' + escapeAttr(String(pct)) + '">' +
            "<span>%</span>" +
          "</div>" +
          '<div class="jam-split-ducats" title="Estimated whole Ducats from current host contribution">' +
            escapeHtml(String(amounts[i] || 0)) + " ♦" +
          "</div>" +
        "</div>"
      );
    }).join("");
  }

  function submissionEntryType(sub) {
    if (!sub) return "game";
    if (sub.entryType === "asset" || sub.listingId) return "asset";
    return "game";
  }

  var JAM_COVER_PRESETS = [
    { id: "a", label: "Rose", css: "linear-gradient(135deg, #fde8ef 0%, #f5c2d4 100%)" },
    { id: "b", label: "Amber", css: "linear-gradient(135deg, #fff3e0 0%, #ffd59a 100%)" },
    { id: "c", label: "Lilac", css: "linear-gradient(135deg, #e8eaf6 0%, #9fa8da 100%)" },
    { id: "d", label: "Sea", css: "linear-gradient(135deg, #e0f2f1 0%, #80cbc4 100%)" },
    { id: "e", label: "Berry", css: "linear-gradient(135deg, #fce4ec 0%, #f48fb1 100%)" },
    { id: "f", label: "Grape", css: "linear-gradient(135deg, #ede7f6 0%, #b39ddb 100%)" },
    { id: "g", label: "Sunset", css: "linear-gradient(145deg, #ff6b6b 0%, #feca57 100%)" },
    { id: "h", label: "Forest", css: "linear-gradient(145deg, #2d6a4f 0%, #95d5b2 100%)" },
  ];

  function defaultCoverStyle() {
    return {
      mode: "preset",
      preset: "a",
      color: "#7c1128",
      gradientFrom: "#7c1128",
      gradientTo: "#f5c2d4",
      angle: 135,
      imageDataUrl: "",
    };
  }

  function jamMenuIconLabel(title) {
    var words = String(title || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "?";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  function normalizeCoverStyle(raw) {
    var style = defaultCoverStyle();
    raw = raw || {};
    if (raw.mode && ["preset", "solid", "gradient", "photo"].indexOf(raw.mode) >= 0) {
      style.mode = raw.mode;
    }
    if (raw.preset && JAM_COVER_PRESETS.some(function (p) { return p.id === raw.preset; })) {
      style.preset = raw.preset;
    }
    if (raw.color && /^#[0-9a-fA-F]{6}$/.test(raw.color)) style.color = raw.color;
    if (raw.gradientFrom && /^#[0-9a-fA-F]{6}$/.test(raw.gradientFrom)) style.gradientFrom = raw.gradientFrom;
    if (raw.gradientTo && /^#[0-9a-fA-F]{6}$/.test(raw.gradientTo)) style.gradientTo = raw.gradientTo;
    style.angle = Math.max(0, Math.min(360, parseInt(raw.angle, 10) || style.angle));
    if (raw.imageDataUrl && String(raw.imageDataUrl).indexOf("data:image/") === 0) {
      style.imageDataUrl = String(raw.imageDataUrl);
    }
    if (style.mode === "photo" && !style.imageDataUrl) style.mode = "preset";
    return style;
  }

  function coverStyleInlineStyle(style) {
    style = normalizeCoverStyle(style);
    if (style.mode === "photo" && style.imageDataUrl) {
      return "background-image:url(" + style.imageDataUrl + ");background-size:cover;background-position:center;";
    }
    if (style.mode === "solid") {
      return "background:" + style.color + ";";
    }
    if (style.mode === "gradient") {
      return "background:linear-gradient(" + style.angle + "deg," + style.gradientFrom + "," + style.gradientTo + ");";
    }
    var preset = JAM_COVER_PRESETS.find(function (p) { return p.id === style.preset; }) || JAM_COVER_PRESETS[0];
    return "background:" + preset.css + ";";
  }

  function renderJamCover(style, opts) {
    opts = opts || {};
    style = normalizeCoverStyle(style);
    var classes = "jam-cover";
    if (opts.compact) classes += " jam-cover--compact";
    if (opts.menu) classes += " jam-cover--menu";
    if (opts.featured) classes += " jam-cover--featured";
    if (opts.detail) classes += " jam-cover--detail";
    if (style.mode === "preset") classes += " jam-cover--preset-" + style.preset;
    var inline = style.mode !== "preset" ? ' style="' + escapeAttr(coverStyleInlineStyle(style)) + '"' : "";
    var glyph = opts.hideGlyph
      ? ""
      : '<span class="jam-cover-glyph">' + escapeHtml(opts.glyph || jamMenuIconLabel(opts.title || "")) + "</span>";
    return '<div class="' + classes + '"' + inline + ">" + glyph + "</div>";
  }

  function readCoverStyleFromForm(form) {
    if (!form) return defaultCoverStyle();
    var modeEl = form.querySelector("[name=coverMode]");
    var mode = modeEl ? modeEl.value : "preset";
    return normalizeCoverStyle({
      mode: mode,
      preset: form.coverPreset && form.coverPreset.value,
      color: form.coverColor && form.coverColor.value,
      gradientFrom: form.coverGradientFrom && form.coverGradientFrom.value,
      gradientTo: form.coverGradientTo && form.coverGradientTo.value,
      angle: form.coverGradientAngle && form.coverGradientAngle.value,
      imageDataUrl: form.coverImageData && form.coverImageData.value,
    });
  }

  function updateJamCoverPreview(root, title) {
    var form = root && root.querySelector ? root.querySelector("#jamForm") : null;
    var preview = root && root.querySelector ? root.querySelector("#jamCoverPreview") : null;
    if (!form || !preview) return;
    var style = readCoverStyleFromForm(form);
    preview.innerHTML = renderJamCover(style, { menu: true, title: title || "Jam title" });
    root.querySelectorAll("[data-jam-cover-mode]").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-jam-cover-mode") === style.mode);
    });
    root.querySelectorAll(".jam-cover-panel").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-panel") !== style.mode;
    });
    root.querySelectorAll("[data-jam-cover-preset]").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-jam-cover-preset") === style.preset);
    });
  }

  function compressCoverImage(file, maxW, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var w = img.width;
        var h = img.height;
        if (w > maxW) {
          h = Math.round(h * maxW / w);
          w = maxW;
        }
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        cb(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = function () { cb(null); };
      img.src = reader.result;
    };
    reader.onerror = function () { cb(null); };
    reader.readAsDataURL(file);
  }

  function bindCoverStyleEditor(root, opts) {
    opts = opts || {};
    var form = root && root.querySelector("#jamForm");
    if (!form) return;
    if (opts.coverStyle && form.coverImageData && opts.coverStyle.imageDataUrl) {
      form.coverImageData.value = opts.coverStyle.imageDataUrl;
    }
    var titleInput = form.querySelector("[name=title]");

    function refreshPreview() {
      updateJamCoverPreview(root, titleInput && titleInput.value);
    }

    root.querySelectorAll("[data-jam-cover-mode]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.getAttribute("data-jam-cover-mode");
        var modeEl = form.querySelector("[name=coverMode]");
        if (modeEl) modeEl.value = mode;
        refreshPreview();
      });
    });

    root.querySelectorAll("[data-jam-cover-preset]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var preset = btn.getAttribute("data-jam-cover-preset");
        if (form.coverPreset) form.coverPreset.value = preset;
        if (form.coverMode) form.coverMode.value = "preset";
        refreshPreview();
      });
    });

    ["coverColor", "coverGradientFrom", "coverGradientTo", "coverGradientAngle"].forEach(function (name) {
      var el = form[name];
      if (!el) return;
      el.addEventListener("input", function () {
        if (form.coverMode) form.coverMode.value = name === "coverColor" ? "solid" : "gradient";
        refreshPreview();
      });
    });

    var photoInput = form.querySelector("#jamCoverPhoto");
    if (photoInput) {
      photoInput.addEventListener("change", function () {
        var file = photoInput.files && photoInput.files[0];
        if (!file) return;
        if (file.size > 8 * 1024 * 1024) {
          if (window.alert) window.alert("Photo must be under 8 MB.");
          photoInput.value = "";
          return;
        }
        compressCoverImage(file, 960, function (dataUrl) {
          if (!dataUrl) {
            if (window.alert) window.alert("Could not read that image.");
            return;
          }
          if (dataUrl.length > 280000) {
            if (window.alert) window.alert("Image is still too large — try a smaller photo.");
            return;
          }
          if (form.coverImageData) form.coverImageData.value = dataUrl;
          if (form.coverMode) form.coverMode.value = "photo";
          refreshPreview();
        });
      });
    }

    var clearPhotoBtn = root.querySelector("#jamCoverPhotoClear");
    if (clearPhotoBtn) {
      clearPhotoBtn.addEventListener("click", function () {
        if (form.coverImageData) form.coverImageData.value = "";
        if (photoInput) photoInput.value = "";
        if (form.coverMode) form.coverMode.value = "preset";
        refreshPreview();
      });
    }

    if (titleInput) titleInput.addEventListener("input", refreshPreview);
    refreshPreview();
  }

  function renderCoverStyleEditor(draft) {
    draft = migrateJam(draft || {});
    var style = normalizeCoverStyle(draft.coverStyle);
    var presetSwatches = JAM_COVER_PRESETS.map(function (p) {
      return (
        '<button type="button" class="jam-cover-swatch jam-cover--preset-' + escapeAttr(p.id) +
          (style.preset === p.id && style.mode === "preset" ? " is-active" : "") +
          '" data-jam-cover-preset="' + escapeAttr(p.id) + '" title="' + escapeAttr(p.label) + '">' +
          "</button>"
      );
    }).join("");

    var modeBtn = function (mode, label) {
      return (
        '<button type="button" class="jam-cover-mode-btn' + (style.mode === mode ? " is-active" : "") +
          '" data-jam-cover-mode="' + escapeAttr(mode) + '">' + escapeHtml(label) + "</button>"
      );
    };

    return (
      '<section class="form-section jam-cover-section">' +
        "<h2>Jam look</h2>" +
        '<p class="field-hint">Customize the icon and banner readers see on Discover and the jam browse list.</p>' +
        '<div class="jam-cover-editor">' +
          '<div class="jam-cover-preview-wrap">' +
            '<span class="field-hint">Home page icon preview</span>' +
            '<div id="jamCoverPreview"></div>' +
          "</div>" +
          '<div class="jam-cover-controls">' +
            '<input type="hidden" name="coverMode" value="' + escapeAttr(style.mode) + '">' +
            '<input type="hidden" name="coverPreset" value="' + escapeAttr(style.preset) + '">' +
            '<input type="hidden" name="coverImageData" value="">' +
            '<div class="jam-cover-mode-tabs">' +
              modeBtn("preset", "Presets") +
              modeBtn("solid", "Color") +
              modeBtn("gradient", "Gradient") +
              modeBtn("photo", "Photo") +
            "</div>" +
            '<div class="jam-cover-panel" data-panel="preset"' + (style.mode === "preset" ? "" : " hidden") + ">" +
              '<div class="jam-cover-swatches">' + presetSwatches + "</div></div>" +
            '<div class="jam-cover-panel" data-panel="solid"' + (style.mode === "solid" ? "" : " hidden") + ">" +
              '<label class="jam-cover-color-field"><span>Background color</span>' +
              '<input type="color" name="coverColor" value="' + escapeAttr(style.color) + '"></label></div>' +
            '<div class="jam-cover-panel" data-panel="gradient"' + (style.mode === "gradient" ? "" : " hidden") + ">" +
              '<div class="jam-cover-gradient-fields">' +
                '<label class="jam-cover-color-field"><span>From</span>' +
                '<input type="color" name="coverGradientFrom" value="' + escapeAttr(style.gradientFrom) + '"></label>' +
                '<label class="jam-cover-color-field"><span>To</span>' +
                '<input type="color" name="coverGradientTo" value="' + escapeAttr(style.gradientTo) + '"></label>' +
                '<label class="jam-cover-angle-field"><span>Angle</span>' +
                '<input type="range" name="coverGradientAngle" min="0" max="360" value="' +
                  escapeAttr(String(style.angle)) + '"></label>' +
              "</div></div>" +
            '<div class="jam-cover-panel" data-panel="photo"' + (style.mode === "photo" ? "" : " hidden") + ">" +
              '<input type="file" id="jamCoverPhoto" accept="image/png,image/jpeg,image/webp">' +
              '<button type="button" class="btn btn-ghost btn-sm" id="jamCoverPhotoClear">Remove photo</button>' +
              '<p class="field-hint">Photos are resized for storage. Use a wide image for best results.</p></div>' +
          "</div>" +
        "</div>" +
      "</section>"
    );
  }

  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  function contentFlags() {
    return (window.ScenaStore && ScenaStore.MATURE_CONTENT_FLAGS) || [];
  }

  function genreTagDefs() {
    return (window.ScenaStore && ScenaStore.GENRE_TAGS) || [];
  }

  function migrateJam(jam) {
    if (!jam) return jam;
    if (!Array.isArray(jam.genres)) jam.genres = [];
    if (!Array.isArray(jam.contentFlags)) jam.contentFlags = [];
    if (!jam.keywords) jam.keywords = "";
    if (!jam.tagline) jam.tagline = "";
    var genreKeys = genreTagDefs().map(function (g) { return g.key; });
    var matureKeys = contentFlags().map(function (g) { return g.key; });
    (jam.contentFlags || []).slice().forEach(function (key) {
      if (genreKeys.indexOf(key) >= 0 && jam.genres.indexOf(key) < 0) jam.genres.push(key);
    });
    jam.contentFlags = (jam.contentFlags || []).filter(function (key) {
      return matureKeys.indexOf(key) >= 0;
    });
    jam.ageRestricted = !!(jam.ageRestricted || (jam.contentFlags || []).length > 0);
    if (!jam.jamType) {
      if (jam.requireFreeListing === true ||
          jam.assetSubmissionMode ||
          (Array.isArray(jam.allowedCategories) && jam.allowedCategories.length > 0) ||
          (jam.submissions || []).some(function (s) { return s.entryType === "asset" || s.listingId; })) {
        jam.jamType = "asset";
      } else {
        jam.jamType = "game";
      }
    }
    if (!jam.assetSubmissionMode) {
      jam.assetSubmissionMode = jam.jamType === "asset" ? "new_listing" : "either";
    }
    if (!Array.isArray(jam.allowedCategories)) jam.allowedCategories = [];
    if (jam.requireFreeListing == null) jam.requireFreeListing = jam.jamType === "asset";
    if (!jam.coverStyle) jam.coverStyle = defaultCoverStyle();
    else jam.coverStyle = normalizeCoverStyle(jam.coverStyle);
    if (!jam.winnerMode) jam.winnerMode = jam.jamType === "asset" ? "auto_rating" : "auto_likes";
    if (jam.winnerMode === "auto_likes" && jam.jamType === "asset") jam.winnerMode = "auto_rating";
    if (jam.winnerMode === "auto_rating" && jam.jamType !== "asset") jam.winnerMode = "auto_likes";
    if (jam.prizeEnabled && jam.winnerMode === "unranked") jam.winnerMode = jam.jamType === "asset" ? "auto_rating" : "auto_likes";
    jam.winnerCount = jam.winnerMode === "unranked" ? 0 : clampWinnerCount(jam.winnerCount || 1);
    if (jam.winnerMode === "unranked") {
      jam.prizeSplits = [];
    } else {
      jam.prizeSplits = normalizePrizeSplits(jam.prizeSplits, jam.winnerCount || 1);
    }
    if (!Array.isArray(jam.winnerSubmissionIds)) {
      jam.winnerSubmissionIds = jam.winnerSubmissionId ? [jam.winnerSubmissionId] : [];
    }
    (jam.submissions || []).forEach(function (s) {
      if (!s.entryType) s.entryType = s.listingId ? "asset" : "game";
      if (!s.ratings) s.ratings = {};
    });
    return jam;
  }

  function jamHasMatureFlags(jam) {
    if (!jam) return false;
    return (jam.contentFlags || []).length > 0;
  }

  function jamGenreLabels(jam) {
    migrateJam(jam);
    return (jam.genres || []).map(function (key) {
      return window.ScenaStore && ScenaStore.labelForGenre
        ? ScenaStore.labelForGenre(key)
        : key;
    });
  }

  function sprintKey(jam) {
    var d = parseIso(jam.submissionStart);
    if (!d) return "unknown";
    var start = new Date(d.getTime());
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    return start.toISOString().slice(0, 10);
  }

  function sprintLabel(key) {
    if (key === "unknown") return "Unscheduled";
    var d = parseIso(key + "T12:00:00");
    if (!d) return key;
    return "Week of " + d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function groupBySprint(jams) {
    var map = {};
    (jams || []).forEach(function (jam) {
      var key = sprintKey(jam);
      if (!map[key]) map[key] = [];
      map[key].push(jam);
    });
    return Object.keys(map).sort().reverse().map(function (key) {
      return { key: key, label: sprintLabel(key), jams: map[key] };
    });
  }

  function queryJams(rows, opts) {
    opts = opts || {};
    rows = (rows || []).map(function (j) { return migrateJam(j); });
    if (opts.genre && opts.genre !== "all") {
      rows = rows.filter(function (j) {
        return (j.genres || []).indexOf(opts.genre) >= 0;
      });
    }
    if (opts.keyword) {
      var q = String(opts.keyword).toLowerCase().trim();
      if (q) {
        rows = rows.filter(function (j) {
          var blob = [
            j.title, j.theme, j.keywords, j.rules, (j.genres || []).join(" "),
          ].join(" ").toLowerCase();
          return blob.indexOf(q) >= 0;
        });
      }
    }
    if (opts.phase && opts.phase !== "all") {
      rows = rows.filter(function (j) { return jamPhase(j) === opts.phase; });
    }
    if (opts.jamType && opts.jamType !== "all") {
      rows = rows.filter(function (j) { return (j.jamType || "game") === opts.jamType; });
    }
    if (opts.hideAdult && !opts.viewerIsAdult) {
      rows = rows.filter(function (j) { return !requiresAgeGate(j); });
    }
    var sort = opts.sort || "date";
    if (sort === "prize") {
      rows.sort(function (a, b) {
        var pa = prizePoolTotal(a);
        var pb = prizePoolTotal(b);
        if (pb !== pa) return pb - pa;
        return String(b.publishedAt || b.createdAt || "").localeCompare(String(a.publishedAt || a.createdAt || ""));
      });
    } else if (sort === "title") {
      rows.sort(function (a, b) {
        return String(a.title || "").localeCompare(String(b.title || ""));
      });
    } else {
      rows.sort(function (a, b) {
        return String(b.submissionStart || b.publishedAt || b.createdAt || "")
          .localeCompare(String(a.submissionStart || a.publishedAt || a.createdAt || ""));
      });
    }
    return rows;
  }

  function readAll() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function writeAll(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list || []));
    } catch (e) { /* quota */ }
  }

  function findJam(jamId) {
    return readAll().find(function (j) { return j.id === jamId; }) || null;
  }

  function saveJam(jam) {
    var list = readAll();
    var idx = list.findIndex(function (j) { return j.id === jam.id; });
    jam.updatedAt = new Date().toISOString();
    if (idx >= 0) list[idx] = jam;
    else list.unshift(jam);
    writeAll(list);
    if (
      jam.status === "published" &&
      jam.hostUserId &&
      window.ScenaCloud &&
      ScenaCloud.upsertGameJam
    ) {
      ScenaCloud.upsertGameJam(jam.hostUserId, jam);
    }
    return jam;
  }

  var cloudJamPromise = null;

  function fetchCloudJams() {
    if (cloudJamPromise) return cloudJamPromise;
    if (!window.ScenaCloud || !ScenaCloud.listPublishedGameJams) {
      cloudJamPromise = Promise.resolve([]);
      return cloudJamPromise;
    }
    cloudJamPromise = ScenaCloud.listPublishedGameJams().catch(function () {
      return [];
    });
    return cloudJamPromise;
  }

  function mergeJamLists(localRows, cloudRows) {
    var byId = {};
    (localRows || []).forEach(function (j) {
      byId[j.id] = migrateJam(j);
    });
    (cloudRows || []).forEach(function (j) {
      var existing = byId[j.id];
      if (!existing || String(j.updatedAt || "").localeCompare(String(existing.updatedAt || "")) >= 0) {
        byId[j.id] = migrateJam(j);
        if (!readAll().some(function (x) { return x.id === j.id; })) {
          var importList = readAll();
          importList.unshift(byId[j.id]);
          writeAll(importList);
        }
      }
    });
    return Object.keys(byId).map(function (id) { return byId[id]; });
  }

  function withMergedJams(work) {
    return fetchCloudJams().then(function (cloudRows) {
      var merged = mergeJamLists(readAll().slice(), cloudRows);
      return work(merged);
    });
  }

  function newId() {
    return "jam_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function parseIso(value) {
    if (!value) return null;
    var d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  function formatWhen(iso) {
    var d = parseIso(iso);
    if (!d) return "—";
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  function formatDucats(n) {
    if (window.ScenaWallet && ScenaWallet.formatDucats) return ScenaWallet.formatDucats(n);
    n = Math.max(0, parseInt(n, 10) || 0);
    return n === 1 ? "1 Ducat" : n + " Ducats";
  }

  function jamPhase(jam) {
    var now = Date.now();
    var subStart = parseIso(jam.submissionStart);
    var subEnd = parseIso(jam.submissionEnd);
    var judgeEnd = parseIso(jam.judgingEnd);
    if (jam.status !== "published") return "draft";
    if (subStart && now < subStart.getTime()) return "upcoming";
    if (subEnd && now <= subEnd.getTime()) return "submissions";
    if (judgeEnd && now <= judgeEnd.getTime()) return "judging";
    return "closed";
  }

  function applyJamFreePromo(userId, listing, jam) {
    if (!listing || !listing.id || !jam || !jam.judgingEnd) return Promise.resolve(listing);
    if (!window.ScenaMarketplace || !ScenaMarketplace.setJamFreeUntil) return Promise.resolve(listing);
    return ScenaMarketplace.setJamFreeUntil(userId, listing.id, jam.judgingEnd).then(function () {
      listing.jam_free_until = jam.judgingEnd;
      listing.jam_free = true;
      return listing;
    }).catch(function () {
      // Local enrichment still covers shop UI via jamFreeUntilByListingId
      return listing;
    });
  }

  function jamFreeUntilByListingIdSync(rows) {
    var map = {};
    (rows || []).forEach(function (jam) {
      migrateJam(jam);
      if (!isAssetJam(jam) || jam.status !== "published") return;
      var phase = jamPhase(jam);
      if (phase !== "submissions" && phase !== "judging") return;
      var until = jam.judgingEnd;
      if (!until) return;
      (jam.submissions || []).forEach(function (s) {
        if (!s || s.disqualified || !s.listingId) return;
        var prev = map[s.listingId] ? new Date(map[s.listingId]).getTime() : 0;
        var next = new Date(until).getTime();
        if (!prev || next > prev) map[s.listingId] = until;
      });
    });
    return map;
  }

  function requiresAgeGate(jam) {
    if (!jam) return false;
    migrateJam(jam);
    return !!jam.ageRestricted;
  }

  function validateJamSpec(spec) {
    spec = spec || {};
    var title = String(spec.title || "").trim();
    if (title.length < 3) throw new Error("Jam title must be at least 3 characters.");
    if (!String(spec.theme || "").trim()) throw new Error("Add a theme for your jam.");
    if (!String(spec.rules || "").trim()) throw new Error("Add rules so entrants know what to make.");
    var tagline = String(spec.tagline || "").trim();
    if (tagline.length > 140) throw new Error("Home page tagline must be 140 characters or less.");

    var genres = Array.isArray(spec.genres) ? spec.genres.slice() : [];
    var flags = Array.isArray(spec.contentFlags) ? spec.contentFlags.slice() : [];
    var ageRestricted = !!spec.ageRestricted || flags.length > 0;

    var subStart = parseIso(spec.submissionStart);
    var subEnd = parseIso(spec.submissionEnd);
    var judgeEnd = parseIso(spec.judgingEnd);
    if (!subStart || !subEnd || !judgeEnd) throw new Error("Set submission and judging dates.");
    if (subEnd.getTime() <= subStart.getTime()) throw new Error("Submission end must be after submission start.");
    if (judgeEnd.getTime() < subEnd.getTime()) throw new Error("Judging end must be on or after submission end.");

    var hostContribution = Math.max(0, parseInt(spec.hostContribution, 10) || 0);
    var participantMode = spec.participantPrizeMode || "none";
    var participantMin = Math.max(0, parseInt(spec.participantMin, 10) || 0);
    if (participantMode === "required" && participantMin <= 0) {
      throw new Error("Set a minimum Ducat contribution when participation is required.");
    }

    var coverStyle = normalizeCoverStyle(spec.coverStyle);
    if (coverStyle.mode === "photo" && coverStyle.imageDataUrl.length > 280000) {
      throw new Error("Cover photo is too large — use a smaller image.");
    }

    var jamType = spec.jamType === "asset" ? "asset" : "game";
    var assetSubmissionMode = spec.assetSubmissionMode || (jamType === "asset" ? "new_listing" : "either");
    if (ASSET_SUBMISSION_MODES.every(function (m) { return m.id !== assetSubmissionMode; })) {
      assetSubmissionMode = jamType === "asset" ? "new_listing" : "either";
    }
    var allowedCategories = Array.isArray(spec.allowedCategories) ? spec.allowedCategories.slice() : [];
    allowedCategories = allowedCategories.filter(function (id) {
      return ASSET_CATEGORIES.some(function (c) { return c.id === id; });
    });

    if (window.ScenaContentPolicy && ScenaContentPolicy.assertJamText) {
      ScenaContentPolicy.assertJamText({
        tagline: tagline,
        rules: String(spec.rules || "").trim(),
      });
    }

    var prizeEnabled = !!spec.prizeEnabled;
    var winnerMode = spec.winnerMode || (jamType === "asset" ? "auto_rating" : "auto_likes");
    var allowedModes = winnerModesFor(jamType, prizeEnabled).map(function (m) { return m.id; });
    if (allowedModes.indexOf(winnerMode) < 0) {
      winnerMode = jamType === "asset" ? "auto_rating" : "auto_likes";
      if (prizeEnabled === false && spec.winnerMode === "unranked") winnerMode = "unranked";
      if (allowedModes.indexOf(winnerMode) < 0) winnerMode = allowedModes[0] || "host_picks";
    }
    if (prizeEnabled && winnerMode === "unranked") {
      throw new Error("Unranked jams cannot have a Ducat prize — turn off prizes or pick a ranking mode.");
    }
    var winnerCount = winnerMode === "unranked" ? 0 : clampWinnerCount(spec.winnerCount || 1);
    var prizeSplits = winnerMode === "unranked" ? [] : normalizePrizeSplits(spec.prizeSplits, winnerCount || 1);
    if (prizeEnabled && winnerMode !== "unranked") {
      var splitSum = prizeSplits.reduce(function (a, b) { return a + b; }, 0);
      if (splitSum !== 100) {
        throw new Error("Prize split percentages must add up to exactly 100% (currently " + splitSum + "%).");
      }
      if (prizeSplits.some(function (p) { return p < 0; })) {
        throw new Error("Prize split percentages cannot be negative.");
      }
    }

    return {
      title: title,
      tagline: tagline,
      theme: String(spec.theme || "").trim(),
      rules: String(spec.rules || "").trim(),
      keywords: String(spec.keywords || "").trim(),
      genres: genres,
      contentFlags: flags,
      ageRestricted: ageRestricted,
      jamType: jamType,
      assetSubmissionMode: assetSubmissionMode,
      allowedCategories: allowedCategories,
      requireFreeListing: jamType === "asset" ? !!spec.requireFreeListing : false,
      coverStyle: coverStyle,
      submissionStart: subStart.toISOString(),
      submissionEnd: subEnd.toISOString(),
      judgingEnd: judgeEnd.toISOString(),
      submissionMode: spec.submissionMode || "either",
      winnerMode: winnerMode,
      winnerCount: winnerCount,
      prizeSplits: prizeSplits,
      prizeEnabled: prizeEnabled,
      hostContribution: hostContribution,
      participantPrizeMode: participantMode,
      participantMin: participantMin,
    };
  }

  function prizePoolTotal(jam) {
    if (!jam || !jam.prize) return 0;
    var base = Math.max(0, parseInt(jam.prize.hostContribution, 10) || 0);
    var extra = Object.keys(jam.prize.contributions || {}).reduce(function (sum, uid) {
      return sum + Math.max(0, parseInt(jam.prize.contributions[uid], 10) || 0);
    }, 0);
    return base + extra;
  }

  function walletSpend(userId, amount, jamId) {
    amount = Math.max(0, parseInt(amount, 10) || 0);
    if (!amount) return Promise.resolve();
    if (!window.ScenaWallet) return Promise.reject(new Error("Wallet unavailable."));
    return ScenaWallet.spendBalance(userId, amount, "jam_prize", jamId || null);
  }

  function walletPayout(hostUserId, jamId, winnerUserId, amount) {
    amount = Math.max(0, parseInt(amount, 10) || 0);
    if (!amount) return Promise.resolve();
    if (!window.ScenaWallet) return Promise.reject(new Error("Wallet unavailable."));
    return ScenaWallet.jamPayoutWinner(hostUserId, jamId, winnerUserId, amount);
  }

  function walletRefundEmptyPrizePool(userId, jamId) {
    if (!window.ScenaWallet) return Promise.reject(new Error("Wallet unavailable."));
    if (ScenaWallet.jamRefundEmptyPrizePool) {
      return ScenaWallet.jamRefundEmptyPrizePool(userId, jamId);
    }
    if (ScenaWallet.jamRefundPrizeToHost) {
      return ScenaWallet.jamRefundPrizeToHost(userId, jamId);
    }
    return Promise.reject(new Error("Wallet unavailable."));
  }

  function activeSubmissionCount(jam) {
    return (jam.submissions || []).filter(function (s) { return s && !s.disqualified; }).length;
  }

  function refundEmptyPrizePool(jam, actingUserId) {
    if (!jam || !jam.prizeEnabled) return Promise.resolve(jam);
    if (jam.prize && (jam.prize.paidOut || jam.prize.refunded)) return Promise.resolve(jam);
    if (jamPhase(jam) !== "closed") return Promise.resolve(jam);
    if (activeSubmissionCount(jam) > 0) return Promise.resolve(jam);

    var total = prizePoolTotal(jam);
    var actor = actingUserId || jam.hostUserId;
    var markRefunded = function (extra) {
      jam.prize = jam.prize || {};
      jam.prize.refunded = true;
      jam.prize.refundedAt = new Date().toISOString();
      if (extra) Object.assign(jam.prize, extra);
      return saveJam(jam);
    };

    if (total <= 0) return Promise.resolve(markRefunded({ refundedAmount: 0 }));

    return walletRefundEmptyPrizePool(actor, jam.id).then(function (result) {
      return markRefunded({
        refundedAmount: (result && result.refunded) != null ? result.refunded : total,
        refunds: (result && result.refunds) || null,
      });
    }).catch(function (err) {
      var msg = String((err && err.message) || "");
      if (/no prize pool/i.test(msg) || /already/i.test(msg)) {
        return markRefunded({ refundedAmount: 0, refundNote: msg });
      }
      return Promise.reject(err);
    });
  }

  function checkWalletBalance(userId, needed) {
    needed = Math.max(0, parseInt(needed, 10) || 0);
    if (!needed) return Promise.resolve();
    if (!window.ScenaWallet || !ScenaWallet.checkBalance) {
      return Promise.reject(new Error("Sign in with Supabase to use Ducat prizes."));
    }
    return ScenaWallet.checkBalance(userId, needed);
  }

  function validateSubmission(jam, userId, series, episode) {
    if (!jam || jam.status !== "published") throw new Error("This jam is not accepting entries.");
    if (!isGameJam(jam)) throw new Error("This is an asset jam — submit a marketplace listing instead.");
    if (jamPhase(jam) !== "submissions") throw new Error("Submissions are closed for this jam.");
    if (!series || !episode) throw new Error("Pick a live episode to submit.");
    if (!window.ScenaStore) throw new Error("Studio data unavailable.");
    if (!ScenaStore.isEpisodePublic || !ScenaStore.isEpisodePublic(episode)) {
      if (!episode.isLive) throw new Error("Episode must be published (live) before you submit.");
    }

    var subStart = parseIso(jam.submissionStart);
    var seriesCreated = parseIso(series.createdAt);
    var mode = jam.submissionMode || "either";

    if (mode === "new_series") {
      if (!seriesCreated || !subStart || seriesCreated.getTime() < subStart.getTime()) {
        throw new Error("This jam requires a series started during the submission window.");
      }
    } else if (mode === "new_episode") {
      if (seriesCreated && subStart && seriesCreated.getTime() >= subStart.getTime()) {
        throw new Error("This jam requires a new episode on an existing series, not a brand-new series.");
      }
      var ordered = ScenaStore.orderedEpisodes ? ScenaStore.orderedEpisodes(series) : (series.episodes || []);
      var live = ordered.filter(function (ep) {
        return ScenaStore.isEpisodePublic ? ScenaStore.isEpisodePublic(ep) : ep.isLive;
      });
      if (live.length < 1 || live[live.length - 1].id !== episode.id) {
        throw new Error("Submit your newest published episode for this jam.");
      }
    }

    if ((jam.submissions || []).some(function (s) {
      return s.userId === userId && s.seriesId === series.id && s.episodeId === episode.id;
    })) {
      throw new Error("You already submitted this episode.");
    }
  }

  function assetMadeDuringJam(jam, entry) {
    if (!entry || entry.source !== "made") return false;
    var subStart = parseIso(jam && jam.submissionStart);
    var created = parseIso(entry.createdAt || entry.updatedAt);
    if (!subStart || !created) return false;
    return created.getTime() >= subStart.getTime();
  }

  function validateAssetLibraryEntry(jam, userId, entry) {
    if (!jam || jam.status !== "published") throw new Error("This jam is not accepting entries.");
    if (!isAssetJam(jam)) throw new Error("This is a game jam — submit a published episode instead.");
    if (jamPhase(jam) !== "submissions") throw new Error("Submissions are closed for this jam.");
    if (!entry || !entry.id) throw new Error("Pick an asset from your library.");
    if (entry.source !== "made") {
      throw new Error("Only assets you created can be submitted — purchased assets cannot be entered.");
    }
    if (!entry.bundle) throw new Error("This library entry has no asset data.");
    var mode = jam.assetSubmissionMode || "new_listing";
    if (mode === "existing_listing") {
      throw new Error("This jam only accepts existing marketplace listings — publish your asset to the shop first.");
    }
    if (mode !== "existing_listing" && !assetMadeDuringJam(jam, entry)) {
      throw new Error("Only assets you made during this jam’s submission window can be entered.");
    }
    var cats = jam.allowedCategories || [];
    if (cats.length && cats.indexOf(entry.category) < 0) {
      throw new Error("This jam only accepts: " + cats.join(", ") + ".");
    }
    if ((jam.submissions || []).some(function (s) {
      return s.userId === userId && s.libraryEntryId === entry.id;
    })) {
      throw new Error("You already submitted this library asset.");
    }
  }

  function libraryEntryToAssetEntry(userId, profile, entry) {
    return {
      id: "sub_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
      entryType: "asset",
      userId: userId,
      userName: (profile && profile.displayName) || "Creator",
      libraryEntryId: entry.id,
      listingId: entry.listingId || null,
      listingTitle: entry.title || "Untitled asset",
      category: entry.category || "pack",
      preview_data_url: entry.preview_data_url || "",
      submittedAt: new Date().toISOString(),
      likes: [],
      ratings: {},
      marketplaceRatingAvg: 0,
      marketplaceRatingCount: 0,
    };
  }

  function validateAssetListing(jam, userId, listing, opts) {
    opts = opts || {};
    if (!jam || jam.status !== "published") throw new Error("This jam is not accepting entries.");
    if (!isAssetJam(jam)) throw new Error("This is a game jam — submit a published episode instead.");
    if (jamPhase(jam) !== "submissions") throw new Error("Submissions are closed for this jam.");
    if (!listing || !listing.id) throw new Error("Pick a marketplace listing to submit.");
    if (listing.seller_id && listing.seller_id !== userId) {
      throw new Error("You can only submit listings you published.");
    }
    var cats = jam.allowedCategories || [];
    if (cats.length && cats.indexOf(listing.category) < 0) {
      throw new Error("This jam only accepts: " + cats.join(", ") + ".");
    }
    var mode = jam.assetSubmissionMode || "either";
    if (mode === "new_listing" && opts.viaExisting) {
      throw new Error("This jam only accepts newly published listings from your library.");
    }
    if (mode === "existing_listing" && opts.viaNewPublish) {
      throw new Error("This jam only accepts listings you already had live before submitting.");
    }
    if ((jam.submissions || []).some(function (s) {
      return s.listingId === listing.id || (s.userId === userId && s.listingId === listing.id);
    })) {
      throw new Error("This listing is already submitted to this jam.");
    }
    if ((jam.submissions || []).some(function (s) {
      return s.userId === userId && s.listingId === listing.id;
    })) {
      throw new Error("You already submitted this listing.");
    }
  }

  function listingToAssetEntry(userId, profile, listing, libraryEntryId) {
    return {
      id: "sub_" + Date.now().toString(36),
      entryType: "asset",
      userId: userId,
      userName: (profile && profile.displayName) || "Creator",
      listingId: listing.id,
      libraryEntryId: libraryEntryId || null,
      listingTitle: listing.title || "Untitled asset",
      category: listing.category || "pack",
      preview_data_url: listing.preview_data_url || "",
      submittedAt: new Date().toISOString(),
      likes: [],
      ratings: {},
      marketplaceRatingAvg: Number(listing.rating_avg) || 0,
      marketplaceRatingCount: parseInt(listing.rating_count, 10) || 0,
    };
  }

  function hostPickButtonsHtml(jam, submissionId) {
    var count = clampWinnerCount(jam.winnerCount || 1);
    var placed = getWinnerIds(jam);
    var currentPlace = placed.indexOf(submissionId);
    var buttons = "";
    for (var i = 0; i < count; i++) {
      var on = currentPlace === i;
      buttons +=
        '<button type="button" class="btn btn-sm ' + (on ? "btn-primary" : "btn-ghost") +
          ' jam-pick-btn" data-pick-sub="' + escapeAttr(submissionId) +
          '" data-pick-place="' + (i + 1) + '">' +
          (on ? "✓ " : "") + escapeHtml(ordinalPlace(i + 1)) +
        "</button>";
    }
    return '<div class="jam-pick-places">' + buttons + "</div>";
  }

  function assetRatingControlsHtml(jam, sub, ctx) {
    if (sub.disqualified) {
      return '<span class="jam-dq-badge">Disqualified' +
        (sub.disqualifiedReason ? ": " + escapeHtml(sub.disqualifiedReason) : "") +
        "</span>";
    }
    var stats = submissionAvgRating(sub);
    var my = ctx.userId && sub.ratings ? sub.ratings[ctx.userId] : null;
    var label =
      '<span class="jam-rating-label">' +
        (stats.count
          ? "★ " + stats.avg.toFixed(1) + " (" + stats.count + ")"
          : "Not rated yet") +
      "</span>";
    if (jamPhase(jam) !== "judging" || !ctx.userId || sub.userId === ctx.userId) {
      return label;
    }
    var stars = "";
    for (var i = 1; i <= 5; i++) {
      stars +=
        '<button type="button" class="mp-star-btn jam-rate-btn' + (my >= i ? " is-on" : "") +
          '" data-rate-sub="' + escapeAttr(sub.id) + '" data-stars="' + i +
          '" aria-label="' + i + ' stars">★</button>';
    }
    return label + '<div class="mp-stars jam-entry-stars">' + stars + "</div>";
  }

  function hostModerationButtonsHtml(jam, sub, isHost) {
    if (!isHost || jamPhase(jam) !== "judging") return "";
    if (sub.disqualified) {
      return (
        '<button type="button" class="btn btn-sm btn-ghost jam-reinstate-btn" data-reinstate-sub="' +
          escapeAttr(sub.id) + '">Reinstate</button>'
      );
    }
    return (
      '<button type="button" class="btn btn-sm btn-ghost jam-dq-btn" data-dq-sub="' +
        escapeAttr(sub.id) + '" title="Remove from judging for being off topic">Disqualify (off topic)</button>'
    );
  }

  function autoPickWinner(jam) {
    var ids = autoPickWinners(jam);
    return ids[0] || null;
  }

  function autoPickWinners(jam) {
    var subs = (jam.submissions || []).slice().filter(function (s) { return !s.disqualified; });
    if (!subs.length) return [];
    var count = jam.winnerMode === "unranked" ? 0 : clampWinnerCount(jam.winnerCount || 1);
    if (!count) return [];
    var mode = jam.winnerMode || "auto_likes";
    subs.sort(function (a, b) {
      if (mode === "auto_rating") {
        var ra = submissionAvgRating(a);
        var rb = submissionAvgRating(b);
        if (rb.avg !== ra.avg) return rb.avg - ra.avg;
        if (rb.count !== ra.count) return rb.count - ra.count;
      } else {
        var la = (a.likes || []).length;
        var lb = (b.likes || []).length;
        if (lb !== la) return lb - la;
      }
      return String(a.submittedAt || "").localeCompare(String(b.submittedAt || ""));
    });
    return subs.slice(0, Math.min(count, subs.length)).map(function (s) { return s.id; });
  }

  function distributePrize(jam) {
    if (!jam.prizeEnabled || jam.winnerMode === "unranked") return Promise.resolve(jam);
    if (jam.prize && (jam.prize.paidOut || jam.prize.refunded)) return Promise.resolve(jam);
    var placed = getWinnerIds(jam);
    if (!placed.some(Boolean)) return Promise.resolve(jam);
    if (jam.prize && jam.prize.paidOut) return Promise.resolve(jam);
    var total = prizePoolTotal(jam);
    if (total <= 0) return Promise.resolve(jam);

    var winnerCount = clampWinnerCount(jam.winnerCount || 1);
    var splits = normalizePrizeSplits(jam.prizeSplits, winnerCount);
    var filled = [];
    placed.forEach(function (id, i) {
      if (!id) return;
      var sub = (jam.submissions || []).find(function (s) { return s.id === id; });
      if (!sub || !sub.userId) return;
      filled.push({ id: id, userId: sub.userId, weight: splits[i] != null ? splits[i] : 0, place: i + 1 });
    });
    if (!filled.length) return Promise.resolve(jam);

    var weightSum = filled.reduce(function (a, r) { return a + r.weight; }, 0);
    var paySplits;
    if (weightSum <= 0) {
      paySplits = defaultPrizeSplits(filled.length);
    } else {
      var rawPct = filled.map(function (r) { return (r.weight / weightSum) * 100; });
      paySplits = rawPct.map(function (r) { return Math.floor(r); });
      var pctSum = paySplits.reduce(function (a, b) { return a + b; }, 0);
      var pctRem = 100 - pctSum;
      var pctOrder = rawPct.map(function (r, i) { return { i: i, frac: r - paySplits[i] }; })
        .sort(function (a, b) { return b.frac - a.frac || a.i - b.i; });
      for (var p = 0; p < pctRem; p++) paySplits[pctOrder[p % pctOrder.length].i] += 1;
    }
    var amounts = allocatePrizeShares(total, paySplits);

    var chain = Promise.resolve();
    var payouts = [];
    filled.forEach(function (row, i) {
      var amount = amounts[i] || 0;
      if (!amount) return;
      payouts.push({ submissionId: row.id, userId: row.userId, amount: amount, place: row.place });
      chain = chain.then(function () {
        return walletPayout(jam.hostUserId, jam.id, row.userId, amount);
      });
    });

    return chain.then(function () {
      jam.prize = jam.prize || {};
      jam.prize.paidOut = true;
      jam.prize.paidOutAt = new Date().toISOString();
      jam.prize.payouts = payouts;
      return saveJam(jam);
    });
  }

  function tryPayoutIfHost(jam, userId) {
    if (!jam || !userId) return Promise.resolve(jam);
    if (jam.winnerMode === "unranked") return Promise.resolve(jam);
    if (jam.prize && (jam.prize.paidOut || jam.prize.refunded)) return Promise.resolve(jam);
    if (jamPhase(jam) !== "closed") return Promise.resolve(jam);

    // No eligible entries (including all-disqualified) → refund each contributor their stake.
    // Any signed-in user can trigger; ledger pays only original donors (anti host-fraud).
    if (activeSubmissionCount(jam) === 0) {
      return refundEmptyPrizePool(jam, userId);
    }

    if (jam.hostUserId !== userId) return Promise.resolve(jam);

    var ids = getWinnerIds(jam).filter(Boolean);
    if (!ids.length) return Promise.resolve(jam);
    var needed = Math.min(
      clampWinnerCount(jam.winnerCount || 1),
      activeSubmissionCount(jam)
    );
    if (ids.length < needed && jam.winnerMode === "host_picks") return Promise.resolve(jam);
    return distributePrize(jam);
  }

  function finalizeIfDue(jam) {
    if (!jam || jam.status !== "published") return jam;
    if (jamPhase(jam) !== "closed") return jam;
    if (jam.winnerMode === "unranked") return jam;
    if (getWinnerIds(jam).some(Boolean)) return jam;
    if (activeSubmissionCount(jam) === 0) return jam;
    if (jam.winnerMode === "auto_likes" || jam.winnerMode === "auto_rating") {
      setWinnerIds(jam, autoPickWinners(jam));
      return saveJam(jam);
    }
    return jam;
  }

  window.ScenaJams = {
    SUBMISSION_MODES: SUBMISSION_MODES,
    ASSET_SUBMISSION_MODES: ASSET_SUBMISSION_MODES,
    ASSET_CATEGORIES: ASSET_CATEGORIES,
    WINNER_MODES: WINNER_MODES,
    PARTICIPANT_PRIZE_MODES: PARTICIPANT_PRIZE_MODES,
    jamTypeLabel: jamTypeLabel,
    isAssetJam: isAssetJam,
    isGameJam: isGameJam,

    list: function (opts) {
      opts = opts || {};
      return withMergedJams(function (rows) {
        rows = rows.slice().map(migrateJam);
        if (opts.publishedOnly) rows = rows.filter(function (j) { return j.status === "published"; });
        if (opts.hostUserId) rows = rows.filter(function (j) { return j.hostUserId === opts.hostUserId; });
        rows.forEach(finalizeIfDue);
        return queryJams(rows, opts);
      });
    },

    groupBySprint: groupBySprint,
    queryJams: queryJams,
    migrateJam: migrateJam,
    jamGenreLabels: jamGenreLabels,

    listHomeSubmissionFeed: function (opts) {
      opts = opts || {};
      var perJam = Math.max(1, parseInt(opts.perJam, 10) || 4);
      return withMergedJams(function (merged) {
      var rows = merged.slice().map(migrateJam).filter(function (j) {
        return j.status === "published";
      });
      rows.forEach(finalizeIfDue);
      // Landing page is game jams only — asset jams live in the marketplace.
      rows = rows.filter(function (j) {
        return (j.jamType || "game") !== "asset";
      });
      rows = rows.filter(function (j) {
        if (opts.hideAdult && !opts.viewerIsAdult && requiresAgeGate(j)) return false;
        var phase = jamPhase(j);
        if (phase !== "submissions" && phase !== "judging") return false;
        var activeSubs = (j.submissions || []).filter(function (s) { return !s.disqualified; });
        return activeSubs.length > 0;
      });

      function jamPopularityScore(jam) {
        var subs = jam.submissions || [];
        var likes = subs.reduce(function (sum, s) {
          return sum + (s.likes || []).length;
        }, 0);
        var pool = jam.prizeEnabled ? prizePoolTotal(jam) : 0;
        var phase = jamPhase(jam);
        var score = subs.length * 100 + likes * 25 + Math.min(pool, 5000);
        if (phase === "judging") score += 500;
        return score;
      }

      function mapSubmissionPreview(jam, subs) {
        return subs.slice(0, perJam).map(function (s) {
          if (submissionEntryType(s) === "asset") {
            return {
              id: s.id,
              entryType: "asset",
              listingTitle: s.listingTitle || "Asset",
              category: s.category || "",
              userName: s.userName,
              submittedAt: s.submittedAt,
              previewDataUrl: s.preview_data_url || "",
              viewHref: "/studio#/library/shop",
              likes: (s.likes || []).length,
            };
          }
          return {
            id: s.id,
            entryType: "game",
            seriesTitle: s.seriesTitle,
            episodeTitle: s.episodeTitle,
            userName: s.userName,
            submittedAt: s.submittedAt,
            playHref: "/play?series=" + encodeURIComponent(s.seriesId) +
              "&episode=" + encodeURIComponent(s.episodeId),
            likes: (s.likes || []).length,
          };
        });
      }

      function toFeedGroup(jam) {
        var phase = jamPhase(jam);
        var subs = (jam.submissions || []).slice().sort(function (a, b) {
          if (phase === "judging") {
            var la = (a.likes || []).length;
            var lb = (b.likes || []).length;
            if (lb !== la) return lb - la;
          }
          return String(b.submittedAt || "").localeCompare(String(a.submittedAt || ""));
        });
        return {
          jamId: jam.id,
          jamTitle: jam.title,
          jamType: jam.jamType || "game",
          tagline: String(jam.tagline || jam.theme || "").trim(),
          theme: jam.theme,
          coverStyle: normalizeCoverStyle(jam.coverStyle),
          phase: phase,
          prizePool: jam.prizeEnabled ? prizePoolTotal(jam) : 0,
          ageRestricted: requiresAgeGate(jam),
          href: "/studio#/jams/" + jam.id,
          totalSubmissions: subs.length,
          submissions: mapSubmissionPreview(jam, subs),
        };
      }

      function toMenuItem(jam) {
        var tagline = String(jam.tagline || jam.theme || "").trim();
        return {
          jamId: jam.id,
          jamTitle: jam.title,
          jamType: jam.jamType || "game",
          tagline: tagline,
          taglinePreview: tagline.length > 120 ? tagline.slice(0, 117) + "…" : tagline,
          theme: jam.theme,
          coverStyle: normalizeCoverStyle(jam.coverStyle),
          phase: jamPhase(jam),
          prizePool: jam.prizeEnabled ? prizePoolTotal(jam) : 0,
          ageRestricted: requiresAgeGate(jam),
          href: "/studio#/jams/" + jam.id,
          totalSubmissions: (jam.submissions || []).length,
        };
      }

      if (!rows.length) return Promise.resolve({ featured: null, others: [] });

      rows.sort(function (a, b) {
        return jamPopularityScore(b) - jamPopularityScore(a);
      });

      return Promise.resolve({
        featured: toFeedGroup(rows[0]),
        others: rows.slice(1).map(toMenuItem),
      });
      });
    },

    get: function (jamId, opts) {
      opts = opts || {};
      var jam = findJam(jamId);
      if (jam) jam = finalizeIfDue(migrateJam(jam));
      if (jam && opts.userId) {
        return tryPayoutIfHost(jam, opts.userId);
      }
      return Promise.resolve(jam);
    },

    createDraft: function (userId, profile, spec) {
      if (!userId) return Promise.reject(new Error("Sign in to host a jam."));
      var validated = validateJamSpec(spec);
      var jam = {
        id: newId(),
        hostUserId: userId,
        hostName: (profile && profile.displayName) || "Host",
        status: "draft",
        submissions: [],
        winnerSubmissionId: null,
        winnerSubmissionIds: [],
        prize: { hostContribution: 0, contributions: {}, paidOut: false },
        createdAt: new Date().toISOString(),
      };
      Object.assign(jam, validated);
      jam.prize.hostContribution = validated.hostContribution;
      jam.prizeEnabled = validated.prizeEnabled;
      return Promise.resolve(saveJam(jam));
    },

    publish: function (userId, jamId) {
      if (!userId) return Promise.reject(new Error("Sign in to publish a jam."));
      var jam = findJam(jamId);
      if (!jam) return Promise.reject(new Error("Jam not found."));
      if (jam.hostUserId !== userId) return Promise.reject(new Error("Only the host can publish this jam."));
      if (jam.status === "published") return Promise.resolve(jam);

      var tagline = String(jam.tagline || "").trim();
      if (tagline.length < 10) {
        return Promise.reject(new Error("Add a home page tagline (at least 10 characters) before publishing."));
      }

      var contribution = jam.prizeEnabled ? Math.max(0, parseInt(jam.hostContribution, 10) || 0) : 0;
      return checkWalletBalance(userId, contribution).then(function () {
        var chain = Promise.resolve();
        if (contribution > 0) {
          chain = walletSpend(userId, contribution, jam.id).then(function () {
            jam.prize = jam.prize || { contributions: {} };
            jam.prize.hostContribution = contribution;
            jam.prize.hostFundedAt = new Date().toISOString();
          });
        }
        return chain.then(function () {
          jam.status = "published";
          jam.publishedAt = new Date().toISOString();
          return saveJam(jam);
        });
      });
    },

    updateJam: function (userId, jamId, spec) {
      if (!userId) return Promise.reject(new Error("Sign in to edit a jam."));
      var jam = findJam(jamId);
      if (!jam) return Promise.reject(new Error("Jam not found."));
      if (jam.hostUserId !== userId) return Promise.reject(new Error("Only the host can edit this jam."));
      var validated = validateJamSpec(spec);
      var prevType = jam.jamType === "asset" ? "asset" : "game";
      var nextType = validated.jamType === "asset" ? "asset" : "game";
      var hasSubs = (jam.submissions || []).length > 0;
      if (hasSubs && nextType !== prevType) {
        return Promise.reject(new Error("You can't switch jam type after entries have been submitted."));
      }
      // If the form omitted jamType, keep the existing type.
      if (!spec || !spec.jamType) {
        validated.jamType = prevType;
        if (prevType === "asset" && !validated.assetSubmissionMode) {
          validated.assetSubmissionMode = jam.assetSubmissionMode || "new_listing";
        }
      }
      var published = jam.status === "published";
      var funded = Math.max(0, parseInt(jam.prize && jam.prize.hostContribution, 10) || 0);

      if (published) {
        if (!validated.prizeEnabled && funded > 0) {
          return Promise.reject(new Error("You cannot disable Ducat rewards after funding a prize pool."));
        }
        if (validated.prizeEnabled && validated.hostContribution < funded) {
          return Promise.reject(new Error(
            "You cannot reduce your Ducat contribution after publishing. Add more from the jam page instead."
          ));
        }
        validated.hostContribution = funded;
      }

      Object.assign(jam, validated);
      jam.prize = jam.prize || { contributions: {}, paidOut: false };
      if (!published) jam.prize.hostContribution = validated.hostContribution;
      jam.prizeEnabled = validated.prizeEnabled;
      return Promise.resolve(saveJam(jam));
    },

    addHostPrize: function (userId, jamId, amount) {
      if (!userId) return Promise.reject(new Error("Sign in to fund a prize."));
      amount = Math.max(0, parseInt(amount, 10) || 0);
      if (!amount) return Promise.reject(new Error("Enter how many Ducats to add."));
      var jam = findJam(jamId);
      if (!jam) return Promise.reject(new Error("Jam not found."));
      if (jam.hostUserId !== userId) return Promise.reject(new Error("Only the host can add to the prize pool."));
      if (jam.status !== "published") return Promise.reject(new Error("Publish the jam before adding more Ducats."));
      if (!jam.prizeEnabled) return Promise.reject(new Error("This jam does not have Ducat rewards enabled."));
      if (jam.prize && jam.prize.paidOut) return Promise.reject(new Error("The prize has already been paid out."));
      if (jam.prize && jam.prize.refunded) {
        return Promise.reject(new Error("This prize pool was already returned (no entries)."));
      }

      return checkWalletBalance(userId, amount).then(function () {
        return walletSpend(userId, amount, jam.id);
      }).then(function () {
        jam.prize = jam.prize || { contributions: {} };
        jam.prize.hostContribution = Math.max(0, parseInt(jam.prize.hostContribution, 10) || 0) + amount;
        jam.hostContribution = jam.prize.hostContribution;
        jam.prize.lastTopUpAt = new Date().toISOString();
        return saveJam(jam);
      });
    },

    submitEntry: function (userId, profile, jamId, pick) {
      if (!userId) return Promise.reject(new Error("Sign in to submit to a jam."));
      var jam = findJam(jamId);
      if (!jam) return Promise.reject(new Error("Jam not found."));
      if (requiresAgeGate(jam) && window.ScenaProfile && !ScenaProfile.isAdultVerified(profile)) {
        return Promise.reject(new Error("Confirm you are 18+ on your account before joining age-restricted jams."));
      }

      var series = pick.series;
      var episode = pick.episode;
      validateSubmission(jam, userId, series, episode);

      var participantMode = jam.participantPrizeMode || "none";
      var min = Math.max(0, parseInt(jam.participantMin, 10) || 0);
      var contribute = Math.max(0, parseInt(pick.contribution, 10) || 0);
      if (jam.prizeEnabled && participantMode === "required" && contribute < min) {
        return Promise.reject(new Error("This jam requires at least " + formatDucats(min) + " toward the prize pool."));
      }
      if (jam.prizeEnabled && participantMode === "none") contribute = 0;

      var entry = {
        id: "sub_" + Date.now().toString(36),
        entryType: "game",
        userId: userId,
        userName: (profile && profile.displayName) || "Creator",
        seriesId: series.id,
        episodeId: episode.id,
        seriesTitle: series.title || "Untitled",
        episodeTitle: episode.title || ("Episode " + (episode.number || "")),
        submittedAt: new Date().toISOString(),
        likes: [],
      };

      var chain = contribute > 0
        ? checkWalletBalance(userId, contribute).then(function () {
            return walletSpend(userId, contribute, jam.id);
          })
        : Promise.resolve();
      return chain.then(function () {
        if (contribute > 0) {
          jam.prize = jam.prize || { contributions: {} };
          jam.prize.contributions[userId] = (parseInt(jam.prize.contributions[userId], 10) || 0) + contribute;
        }
        jam.submissions = jam.submissions || [];
        jam.submissions.push(entry);
        return saveJam(jam);
      });
    },

    submitAssetEntry: function (userId, profile, jamId, pick) {
      if (!userId) return Promise.reject(new Error("Sign in to submit to a jam."));
      pick = pick || {};
      var jam = findJam(jamId);
      if (!jam) return Promise.reject(new Error("Jam not found."));
      migrateJam(jam);
      if (requiresAgeGate(jam) && window.ScenaProfile && !ScenaProfile.isAdultVerified(profile)) {
        return Promise.reject(new Error("Confirm you are 18+ on your account before joining age-restricted jams."));
      }

      var participantMode = jam.participantPrizeMode || "none";
      var min = Math.max(0, parseInt(jam.participantMin, 10) || 0);
      var contribute = Math.max(0, parseInt(pick.contribution, 10) || 0);
      if (jam.prizeEnabled && participantMode === "required" && contribute < min) {
        return Promise.reject(new Error("This jam requires at least " + formatDucats(min) + " toward the prize pool."));
      }
      if (jam.prizeEnabled && participantMode === "none") contribute = 0;

      var chain = Promise.resolve(null);

      if (pick.directLibrary && pick.libraryEntryId) {
        if (!window.ScenaAssetLibrary) {
          return Promise.reject(new Error("Asset library unavailable."));
        }
        chain = ScenaAssetLibrary.get(userId, pick.libraryEntryId).then(function (entry) {
          validateAssetLibraryEntry(jam, userId, entry);
          return entry;
        });
        return chain.then(function (entry) {
          var assetEntry = libraryEntryToAssetEntry(userId, profile, entry);
          var payChain = contribute > 0
            ? checkWalletBalance(userId, contribute).then(function () {
                return walletSpend(userId, contribute, jam.id);
              })
            : Promise.resolve();
          return payChain.then(function () {
            if (contribute > 0) {
              jam.prize = jam.prize || { contributions: {} };
              jam.prize.contributions[userId] = (parseInt(jam.prize.contributions[userId], 10) || 0) + contribute;
            }
            jam.submissions = jam.submissions || [];
            jam.submissions.push(assetEntry);
            return saveJam(jam);
          });
        });
      }

      if (pick.listing) {
        validateAssetListing(jam, userId, pick.listing, { viaExisting: true });
        chain = Promise.resolve(pick.listing);
      } else if (pick.libraryEntryId) {
        if (!window.ScenaAssetLibrary || !ScenaAssetLibrary.publishFromLibrary) {
          return Promise.reject(new Error("Asset library unavailable."));
        }
        chain = ScenaAssetLibrary.get(userId, pick.libraryEntryId).then(function (entry) {
          validateAssetLibraryEntry(jam, userId, entry);
          return ScenaAssetLibrary.publishFromLibrary(userId, pick.libraryEntryId, {
            title: pick.title,
            description: pick.description || "",
            category: pick.category,
            // Keep list price; jam promo makes it free until judging ends.
            priceDucats: Math.max(0, parseInt(pick.priceDucats, 10) || 0),
          });
        }).then(function (result) {
          return ScenaMarketplace.getListing(result.id, userId).then(function (listing) {
            if (!listing) {
              listing = {
                id: result.id,
                seller_id: userId,
                title: pick.title || "Jam entry",
                category: pick.category || "pack",
                price_ducats: Math.max(0, parseInt(pick.priceDucats, 10) || 0),
                preview_data_url: pick.previewDataUrl || "",
              };
            } else if (!listing.seller_id) {
              listing.seller_id = userId;
            }
            validateAssetListing(jam, userId, listing, { viaNewPublish: true });
            return listing;
          });
        });
      } else {
        return Promise.reject(new Error("Pick a library asset to publish or an existing listing."));
      }

      return chain.then(function (listing) {
        return applyJamFreePromo(userId, listing, jam).then(function (promoListing) {
          var entry = listingToAssetEntry(userId, profile, promoListing || listing, pick.libraryEntryId || null);
          var payChain = contribute > 0
            ? checkWalletBalance(userId, contribute).then(function () {
                return walletSpend(userId, contribute, jam.id);
              })
            : Promise.resolve();
          return payChain.then(function () {
            if (contribute > 0) {
              jam.prize = jam.prize || { contributions: {} };
              jam.prize.contributions[userId] = (parseInt(jam.prize.contributions[userId], 10) || 0) + contribute;
            }
            jam.submissions = jam.submissions || [];
            jam.submissions.push(entry);
            return saveJam(jam);
          });
        });
      });
    },

    toggleLike: function (userId, jamId, submissionId) {
      if (!userId) return Promise.reject(new Error("Sign in to like entries."));
      var jam = findJam(jamId);
      if (!jam) return Promise.reject(new Error("Jam not found."));
      if (jamPhase(jam) === "submissions") throw new Error("Likes open after submissions close.");
      var sub = (jam.submissions || []).find(function (s) { return s.id === submissionId; });
      if (!sub) throw new Error("Entry not found.");
      if (sub.disqualified) throw new Error("This entry was disqualified.");
      sub.likes = sub.likes || [];
      var idx = sub.likes.indexOf(userId);
      if (idx >= 0) sub.likes.splice(idx, 1);
      else sub.likes.push(userId);
      saveJam(jam);
      return Promise.resolve({ count: sub.likes.length, liked: idx < 0 });
    },

    pickWinner: function (hostUserId, jamId, submissionId, place) {
      var jam = findJam(jamId);
      if (!jam) return Promise.reject(new Error("Jam not found."));
      migrateJam(jam);
      if (jam.hostUserId !== hostUserId) return Promise.reject(new Error("Only the host can pick winners."));
      if (jam.winnerMode !== "host_picks") {
        return Promise.reject(new Error("This jam does not use host-picked winners."));
      }
      if (jamPhase(jam) === "submissions") return Promise.reject(new Error("Wait until submissions close."));
      var sub = (jam.submissions || []).find(function (s) { return s.id === submissionId; });
      if (!sub) return Promise.reject(new Error("Entry not found."));
      if (sub.disqualified) return Promise.reject(new Error("This entry was disqualified."));
      var count = clampWinnerCount(jam.winnerCount || 1);
      var ids = getWinnerIds(jam);
      while (ids.length < count) ids.push(null);
      ids = ids.slice(0, count).map(function (id) { return id === submissionId ? null : id; });
      var placeIndex = place != null ? Math.max(0, parseInt(place, 10) - 1) : -1;
      if (placeIndex < 0 || placeIndex >= count) {
        placeIndex = ids.findIndex(function (id) { return !id; });
        if (placeIndex < 0) placeIndex = 0;
      }
      ids[placeIndex] = submissionId;
      setWinnerIds(jam, ids);
      jam = saveJam(jam);
      var filled = getWinnerIds(jam).filter(Boolean).length;
      var needed = Math.min(count, (jam.submissions || []).filter(function (s) { return !s.disqualified; }).length);
      if (filled >= needed) return distributePrize(jam);
      return Promise.resolve(jam);
    },

    rateJamEntry: function (userId, jamId, submissionId, stars) {
      if (!userId) return Promise.reject(new Error("Sign in to rate entries."));
      stars = Math.max(1, Math.min(5, parseInt(stars, 10) || 0));
      if (!stars) return Promise.reject(new Error("Pick 1–5 stars."));
      var jam = findJam(jamId);
      if (!jam) return Promise.reject(new Error("Jam not found."));
      migrateJam(jam);
      if (!isAssetJam(jam)) return Promise.reject(new Error("Only asset jam entries use star ratings."));
      if (jamPhase(jam) === "submissions") {
        return Promise.reject(new Error("Ratings open after submissions close."));
      }
      if (jamPhase(jam) === "closed") {
        return Promise.reject(new Error("Judging has ended."));
      }
      var sub = (jam.submissions || []).find(function (s) { return s.id === submissionId; });
      if (!sub) return Promise.reject(new Error("Entry not found."));
      if (sub.disqualified) return Promise.reject(new Error("This entry was disqualified."));
      if (sub.userId === userId) return Promise.reject(new Error("You cannot rate your own entry."));
      sub.ratings = sub.ratings || {};
      sub.ratings[userId] = stars;
      var chain = Promise.resolve();
      if (sub.listingId && window.ScenaMarketplace && ScenaMarketplace.rateListing) {
        chain = ScenaMarketplace.rateListing(userId, sub.listingId, stars).then(function (result) {
          if (result) {
            sub.marketplaceRatingAvg = result.rating_avg;
            sub.marketplaceRatingCount = result.rating_count;
          }
        }).catch(function () { /* jam-local rating still counts */ });
      }
      return chain.then(function () {
        saveJam(jam);
        var stats = submissionAvgRating(sub);
        return { avg: stats.avg, count: stats.count, my_rating: stars };
      });
    },

    /** Host removes an off-topic / invalid entry while judging (voting) is still live. */
    disqualifyEntry: function (hostUserId, jamId, submissionId, reason) {
      var jam = findJam(jamId);
      if (!jam) return Promise.reject(new Error("Jam not found."));
      migrateJam(jam);
      if (jam.hostUserId !== hostUserId) {
        return Promise.reject(new Error("Only the host can disqualify entries."));
      }
      if (jamPhase(jam) !== "judging") {
        return Promise.reject(new Error("You can only disqualify while judging / voting is live."));
      }
      var sub = (jam.submissions || []).find(function (s) { return s.id === submissionId; });
      if (!sub) return Promise.reject(new Error("Entry not found."));
      if (sub.disqualified) return Promise.resolve(jam);
      sub.disqualified = true;
      sub.disqualifiedAt = new Date().toISOString();
      sub.disqualifiedReason = String(reason || "Off topic").trim() || "Off topic";
      // Drop from any winner slots
      var placed = getWinnerIds(jam);
      if (placed.indexOf(submissionId) >= 0) {
        setWinnerIds(jam, placed.map(function (id) { return id === submissionId ? null : id; }));
      }
      return Promise.resolve(saveJam(jam));
    },

    reinstateEntry: function (hostUserId, jamId, submissionId) {
      var jam = findJam(jamId);
      if (!jam) return Promise.reject(new Error("Jam not found."));
      migrateJam(jam);
      if (jam.hostUserId !== hostUserId) {
        return Promise.reject(new Error("Only the host can reinstate entries."));
      }
      if (jamPhase(jam) !== "judging") {
        return Promise.reject(new Error("You can only reinstate while judging is still live."));
      }
      var sub = (jam.submissions || []).find(function (s) { return s.id === submissionId; });
      if (!sub) return Promise.reject(new Error("Entry not found."));
      sub.disqualified = false;
      delete sub.disqualifiedAt;
      delete sub.disqualifiedReason;
      return Promise.resolve(saveJam(jam));
    },

    /** Active asset jams for the marketplace shop strip. */
    listMarketplaceAssetJams: function (opts) {
      opts = opts || {};
      return withMergedJams(function (merged) {
        var rows = merged.slice().map(migrateJam).filter(function (j) {
          if (j.status !== "published") return false;
          if (!isAssetJam(j)) return false;
          if (opts.hideAdult && !opts.viewerIsAdult && requiresAgeGate(j)) return false;
          var phase = jamPhase(j);
          return phase === "submissions" || phase === "judging";
        });
        rows.sort(function (a, b) {
          return String(b.submissionEnd || "").localeCompare(String(a.submissionEnd || ""));
        });
        return rows.slice(0, Math.max(1, parseInt(opts.limit, 10) || 8)).map(function (jam) {
          var active = (jam.submissions || []).filter(function (s) { return !s.disqualified; });
          return {
            id: jam.id,
            title: jam.title,
            tagline: String(jam.tagline || jam.theme || "").trim(),
            phase: jamPhase(jam),
            prizePool: jam.prizeEnabled ? prizePoolTotal(jam) : 0,
            entryCount: active.length,
            href: "#/jams/" + jam.id,
            ageRestricted: requiresAgeGate(jam),
          };
        });
      });
    },

    renderMarketplaceAssetJamSection: function (jams) {
      jams = jams || [];
      if (!jams.length) {
        return (
          '<section class="marketplace-asset-jams">' +
            '<div class="marketplace-asset-jams-head">' +
              "<h3>Asset jams</h3>" +
              '<a class="btn btn-sm btn-ghost" href="#/jams/new/asset">Host an asset jam</a>' +
            "</div>" +
            '<p class="field-hint">No live asset jams right now — host one for creators making packs this week.</p>' +
          "</section>"
        );
      }
      var cards = jams.map(function (j) {
        return (
          '<a class="marketplace-asset-jam-card" href="' + escapeAttr(j.href) + '">' +
            '<span class="jam-type-badge jam-type-badge--asset">Asset jam</span>' +
            "<strong>" + escapeHtml(j.title) + "</strong>" +
            '<span class="field-hint">' + escapeHtml(j.tagline || "Theme challenge") + "</span>" +
            '<span class="marketplace-asset-jam-meta">' +
              escapeHtml(j.phase) +
              " · " + escapeHtml(String(j.entryCount)) + " entries" +
              (j.prizePool > 0 ? " · " + escapeHtml(formatDucats(j.prizePool)) : "") +
            "</span>" +
          "</a>"
        );
      }).join("");
      return (
        '<section class="marketplace-asset-jams">' +
          '<div class="marketplace-asset-jams-head">' +
            "<div><h3>Asset jams</h3>" +
            '<p class="field-hint">Theme challenges for packs you make — not on the home page.</p></div>' +
            '<a class="btn btn-sm btn-secondary" href="#/jams/asset">Browse asset jams</a>' +
          "</div>" +
          '<div class="marketplace-asset-jam-grid">' + cards + "</div>" +
        "</section>"
      );
    },

    requiresAgeGate: requiresAgeGate,
    jamPhase: jamPhase,
    jamFreeUntilByListingId: function () {
      return withMergedJams(function (merged) {
        return jamFreeUntilByListingIdSync(merged);
      });
    },
    prizePoolTotal: prizePoolTotal,
    formatWhen: formatWhen,
    formatDucats: formatDucats,
    validateJamSpec: validateJamSpec,
    bindCoverStyleEditor: bindCoverStyleEditor,
    normalizeCoverStyle: normalizeCoverStyle,

    renderBrowse: function (jams, opts) {
      opts = opts || {};
      var genreChips = genreTagDefs().map(function (g) {
        return '<button type="button" class="jam-filter-chip' +
          (opts.genre === g.key ? " is-active" : "") +
          '" data-jam-genre="' + escapeAttr(g.key) + '">' + escapeHtml(g.label) + "</button>";
      }).join("");

      var toolbar =
        '<div class="jam-browse-toolbar">' +
          '<div class="jam-browse-type">' +
            '<button type="button" class="jam-filter-chip' + ((!opts.jamType || opts.jamType === "all") ? " is-active" : "") +
              '" data-jam-type="all">All jams</button>' +
            '<button type="button" class="jam-filter-chip' + (opts.jamType === "game" ? " is-active" : "") +
              '" data-jam-type="game">Game jams</button>' +
            '<button type="button" class="jam-filter-chip' + (opts.jamType === "asset" ? " is-active" : "") +
              '" data-jam-type="asset">Asset jams</button>' +
          "</div>" +
          '<div class="jam-browse-row">' +
            '<input type="search" class="jam-browse-search" id="jamBrowseSearch" placeholder="Search title, theme, keywords…" value="' +
              escapeAttr(opts.keyword || "") + '">' +
            '<select class="jam-browse-sort" id="jamBrowseSort">' +
              '<option value="date"' + ((opts.sort || "date") === "date" ? " selected" : "") + ">Newest sprint</option>" +
              '<option value="prize"' + (opts.sort === "prize" ? " selected" : "") + ">Highest prize</option>" +
              '<option value="title"' + (opts.sort === "title" ? " selected" : "") + ">Title A–Z</option>" +
            "</select>" +
            '<select class="jam-browse-phase" id="jamBrowsePhase">' +
              '<option value="all"' + ((opts.phase || "all") === "all" ? " selected" : "") + ">All phases</option>" +
              '<option value="upcoming"' + (opts.phase === "upcoming" ? " selected" : "") + ">Upcoming</option>" +
              '<option value="submissions"' + (opts.phase === "submissions" ? " selected" : "") + ">Open submissions</option>" +
              '<option value="judging"' + (opts.phase === "judging" ? " selected" : "") + ">Judging</option>" +
              '<option value="closed"' + (opts.phase === "closed" ? " selected" : "") + ">Closed</option>" +
            "</select>" +
          "</div>" +
          '<div class="jam-browse-genres">' +
            '<button type="button" class="jam-filter-chip' + ((!opts.genre || opts.genre === "all") ? " is-active" : "") +
              '" data-jam-genre="all">All genres</button>' +
            genreChips +
          "</div>" +
        "</div>";

      if (!jams.length) {
        return toolbar + '<div class="jam-empty"><p>No jams match these filters.</p></div>';
      }

      var sprints = groupBySprint(jams);
      var body = sprints.map(function (sprint) {
        return (
          '<section class="jam-sprint-section">' +
            '<h2 class="jam-sprint-title">' + escapeHtml(sprint.label) + "</h2>" +
            ScenaJams.renderList(sprint.jams, opts) +
          "</section>"
        );
      }).join("");

      return toolbar + '<div class="jam-sprint-list">' + body + "</div>";
    },

    renderList: function (jams, opts) {
      opts = opts || {};
      if (!jams.length) {
        return '<div class="jam-empty"><p>No game jams yet.</p>' +
          (opts.canHost ? '<p class="field-hint">Host one — set the theme, rules, dates, and optional Ducat prizes.</p>' : "") +
          "</div>";
      }
      return (
        '<div class="jam-grid">' +
        jams.map(function (jam) {
          var phase = jamPhase(jam);
          var pool = jam.prizeEnabled ? prizePoolTotal(jam) : 0;
          var genreLine = jamGenreLabels(jam).slice(0, 3).join(" · ");
          return (
            '<a class="jam-card" href="#/jams/' + escapeAttr(jam.id) + '">' +
              renderJamCover(jam.coverStyle, { compact: true, title: jam.title }) +
              '<div class="jam-card-body">' +
              '<div class="jam-card-head">' +
                '<h3>' + escapeHtml(jam.title) + "</h3>" +
                '<span class="jam-phase jam-phase--' + escapeAttr(phase) + '">' + escapeHtml(phase) + "</span>" +
              "</div>" +
              '<p class="jam-card-type">' + escapeHtml(jamTypeLabel(jam.jamType)) + "</p>" +
              '<p class="jam-card-theme">' + escapeHtml(jam.tagline || jam.theme) + "</p>" +
              (jam.tagline && jam.tagline !== jam.theme
                ? '<p class="jam-card-theme-sub field-hint">Theme: ' + escapeHtml(jam.theme) + "</p>"
                : "") +
              (genreLine ? '<p class="jam-card-genres">' + escapeHtml(genreLine) + "</p>" : "") +
              '<p class="jam-card-meta">Host: ' + escapeHtml(jam.hostName || "Creator") +
                (jam.ageRestricted ? ' · <span class="jam-age">18+</span>' : "") +
              "</p>" +
              (pool > 0
                ? '<p class="jam-card-prize">' + escapeHtml(formatDucats(pool)) + " prize pool</p>"
                : '<p class="jam-card-prize jam-card-prize--none">No Ducat prize</p>') +
              "</div>" +
            "</a>"
          );
        }).join("") +
        "</div>"
      );
    },

    renderForm: function (draft, opts) {
      opts = opts || {};
      draft = draft || {};
      migrateJam(draft);
      var genreChecks = genreTagDefs().map(function (f) {
        var on = (draft.genres || []).indexOf(f.key) >= 0;
        return (
          '<label class="check-row">' +
            '<input type="checkbox" data-jam-genre="' + escapeAttr(f.key) + '"' + (on ? " checked" : "") + ">" +
            escapeHtml(f.label) +
          "</label>"
        );
      }).join("");
      var matureChecks = contentFlags().map(function (f) {
        var on = (draft.contentFlags || []).indexOf(f.key) >= 0;
        return (
          '<label class="check-row jam-mature-row">' +
            '<input type="checkbox" data-jam-mature="' + escapeAttr(f.key) + '"' + (on ? " checked" : "") + ">" +
            escapeHtml(f.label) +
          "</label>"
        );
      }).join("");

      var subModes = SUBMISSION_MODES.map(function (m) {
        return '<option value="' + escapeAttr(m.id) + '"' +
          ((draft.submissionMode || "either") === m.id ? " selected" : "") + ">" +
          escapeHtml(m.label) + "</option>";
      }).join("");

      var jamType = draft.jamType || opts.jamType || "game";
      var isAsset = jamType === "asset";

      var assetSubModes = ASSET_SUBMISSION_MODES.map(function (m) {
        return '<option value="' + escapeAttr(m.id) + '"' +
          ((draft.assetSubmissionMode || (isAsset ? "new_listing" : "either")) === m.id ? " selected" : "") + ">" +
          escapeHtml(m.label) + "</option>";
      }).join("");

      var assetCatChecks = ASSET_CATEGORIES.map(function (c) {
        var on = (draft.allowedCategories || []).indexOf(c.id) >= 0;
        return (
          '<label class="check-row">' +
            '<input type="checkbox" data-jam-asset-cat="' + escapeAttr(c.id) + '"' +
              (isAsset ? "" : " disabled") + (on ? " checked" : "") + ">" +
            escapeHtml(c.label) +
          "</label>"
        );
      }).join("");

      var winModes = winnerModesFor(jamType, !!draft.prizeEnabled).map(function (m) {
        return '<option value="' + escapeAttr(m.id) + '"' +
          ((draft.winnerMode || (isAsset ? "auto_rating" : "auto_likes")) === m.id ? " selected" : "") + ">" +
          escapeHtml(m.label) + "</option>";
      }).join("");

      var winnerCount = draft.winnerMode === "unranked" ? 0 : clampWinnerCount(draft.winnerCount || 1);
      var prizeSplits = draft.winnerMode === "unranked"
        ? []
        : normalizePrizeSplits(draft.prizeSplits, winnerCount || 1);
      var winnerCountOpts = "";
      for (var wi = 1; wi <= MAX_WINNERS; wi++) {
        winnerCountOpts +=
          '<option value="' + wi + '"' + (winnerCount === wi ? " selected" : "") + ">" +
          wi + (wi === 1 ? " winner" : " winners") + "</option>";
      }

      // Always render both requirement blocks so hosts can switch type before any entries.
      var entryRequirements =
        '<section class="form-section" id="jamGameEntryReqs"' + (isAsset ? " hidden" : "") + ">" +
          "<h2>Entry requirements</h2>" +
          '<div class="field"><label>What can entrants submit?</label><select name="submissionMode"' +
            (isAsset ? " disabled" : "") + ">" + subModes + "</select></div>" +
        "</section>" +
        '<section class="form-section" id="jamAssetEntryReqs"' + (isAsset ? "" : " hidden") + ">" +
          "<h2>Asset entry requirements</h2>" +
          '<p class="field-hint">Entrants submit assets they <strong>made</strong> in Studio → My assets during the jam window. Purchased shop assets cannot be entered.</p>' +
          '<div class="field"><label>What can entrants submit?</label><select name="assetSubmissionMode"' +
            (isAsset ? "" : " disabled") + ">" + assetSubModes + "</select></div>" +
          '<div class="field"><label>Allowed categories</label><div class="check-grid">' + assetCatChecks +
            '</div><p class="field-hint">Leave all unchecked to allow every category.</p></div>' +
          '<label class="check-row"><input type="checkbox" name="requireFreeListing"' +
            (isAsset ? "" : " disabled") +
            (draft.requireFreeListing !== false ? " checked" : "") +
            "> Prefer free list price (0 Ducats). Jam entries are free during the jam either way — paid prices return after voting ends.</label>" +
        "</section>" +
        '<section class="form-section" id="jamWinnerSection">' +
          "<h2>Winners &amp; ranking</h2>" +
          '<div class="field"><label>How winners are decided</label><select name="winnerMode" id="jamWinnerMode">' +
            winModes + "</select>" +
            '<p class="field-hint" id="jamWinnerModeHint"></p></div>' +
          '<div class="field" id="jamWinnerCountField"' + (draft.winnerMode === "unranked" ? " hidden" : "") + ">" +
            "<label>Number of winners</label><select name=\"winnerCount\" id=\"jamWinnerCount\">" +
            winnerCountOpts + "</select>" +
            '<p class="field-hint">1–10 placing winners. With a prize pool, set how the pot splits below.</p></div>' +
          '<div id="jamPrizeSplitWrap"' + (!draft.prizeEnabled || draft.winnerMode === "unranked" ? " hidden" : "") + ">" +
            "<label>Prize split</label>" +
            '<p class="field-hint">Percentages must total <strong>100%</strong>. Payouts use whole Ducats only (remainders go to the largest fractional shares).</p>' +
            '<div class="jam-split-chart" id="jamPrizeSplitChart">' +
              renderPrizeSplitChartHtml(prizeSplits, draft.hostContribution || (draft.prize && draft.prize.hostContribution) || 0) +
            "</div>" +
            '<p class="jam-split-sum" id="jamPrizeSplitSum"></p>' +
          "</div>" +
        "</section>";

      var partModes = PARTICIPANT_PRIZE_MODES.map(function (m) {
        return '<option value="' + escapeAttr(m.id) + '"' +
          ((draft.participantPrizeMode || "none") === m.id ? " selected" : "") + ">" +
          escapeHtml(m.label) + "</option>";
      }).join("");

      function dtLocal(iso) {
        var d = parseIso(iso);
        if (!d) return "";
        var pad = function (n) { return n < 10 ? "0" + n : String(n); };
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
          "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
      }

      var published = !!opts.published;
      var canChangeType = !(draft.submissions || []).length;
      var funded = Math.max(0, parseInt((draft.prize && draft.prize.hostContribution) || draft.hostContribution, 10) || 0);
      var hostContribField = published
        ? '<div class="field"><label>Your contribution (locked)</label>' +
            '<input type="number" name="hostContribution" min="' + escapeAttr(String(funded)) + '" value="' +
            escapeAttr(String(funded)) + '" readonly>' +
            '<p class="field-hint">Funded Ducats cannot be removed after publishing. Add more on the jam page.</p></div>'
        : '<div class="field"><label>Your contribution (Ducats)</label><input type="number" name="hostContribution" min="0" max="99999" value="' +
            escapeAttr(String(draft.hostContribution || 0)) + '"></div>';
      var jamTypeField = canChangeType
        ? '<div class="field"><label>Jam type</label><select name="jamType" id="jamTypeSelect">' +
            '<option value="game"' + (jamType === "game" ? " selected" : "") + ">Game jam (series / episodes)</option>" +
            '<option value="asset"' + (jamType === "asset" ? " selected" : "") + ">Asset jam (library assets you made)</option>" +
          "</select>" +
          '<p class="field-hint">Asset jams accept packs you created in My assets during the jam — not purchased assets, and not series. ' +
            (published ? "You can still switch type until the first entry is submitted." : "Choose before publishing — you can switch until someone submits.") +
          "</p></div>"
        : '<input type="hidden" name="jamType" value="' + escapeAttr(jamType) + '">' +
          '<p class="jam-type-badge jam-type-badge--' + escapeAttr(jamType) + '">' + escapeHtml(jamTypeLabel(jamType)) + "</p>" +
          '<p class="field-hint">Jam type is locked after the first submission.</p>';
      return (
        '<form class="jam-form" id="jamForm">' +
          jamTypeField +
          '<div class="field"><label>Jam title</label><input type="text" name="title" maxlength="80" value="' +
            escapeAttr(draft.title || "") + '" required></div>' +
          '<div class="field"><label>Home page tagline</label><input type="text" name="tagline" maxlength="140" value="' +
            escapeAttr(draft.tagline || "") + '" placeholder="One line for readers on Discover — what is this jam about?">' +
            '<p class="field-hint">Shown on the home page with recent entries. Required before you publish (10–140 characters).</p></div>' +
          renderCoverStyleEditor(draft) +
          '<div class="field"><label>Theme</label><input type="text" name="theme" maxlength="120" value="' +
            escapeAttr(draft.theme || "") + '" placeholder="What should entrants explore?" required></div>' +
          '<div class="field"><label>Search keywords</label><input type="text" name="keywords" maxlength="200" value="' +
            escapeAttr(draft.keywords || "") + '" placeholder="Optional — comma-separated tags for browse/search"></div>' +
          '<div class="field"><label>Rules</label><textarea name="rules" rows="4" maxlength="2000" required>' +
            escapeHtml(draft.rules || "") + "</textarea>" +
            '<p class="field-hint">Stay within Arleco content guidelines.</p></div>' +
          '<section class="form-section"><h2>Genres</h2><div class="check-grid">' + genreChecks + "</div></section>" +
          '<section class="form-section"><h2>Mature content (18+)</h2>' +
            '<p class="field-hint">Any mature label automatically marks this jam as 18+.</p>' +
            '<div class="check-grid jam-mature-grid">' + matureChecks + "</div>" +
            '<p class="field-hint jam-age-note"' + (jamHasMatureFlags(draft) ? "" : " hidden") +
              ' id="jamAutoAgeNote">This jam will be shown as <strong>18+</strong>.</p></section>' +
          '<section class="form-section"><h2>Schedule</h2>' +
            '<div class="field-row">' +
              '<div class="field"><label>Submissions open</label><input type="datetime-local" name="submissionStart" value="' +
                escapeAttr(dtLocal(draft.submissionStart)) + '" required></div>' +
              '<div class="field"><label>Submissions close</label><input type="datetime-local" name="submissionEnd" value="' +
                escapeAttr(dtLocal(draft.submissionEnd)) + '" required></div>' +
            "</div>" +
            '<div class="field"><label>Judging ends</label><input type="datetime-local" name="judgingEnd" value="' +
              escapeAttr(dtLocal(draft.judgingEnd)) + '" required></div></section>' +
          entryRequirements +
          '<section class="form-section"><h2>Prize pool (optional)</h2>' +
            '<label class="check-row"><input type="checkbox" name="prizeEnabled" id="jamPrizeEnabled"' +
              (draft.prizeEnabled ? " checked" : "") + "> Offer Ducat rewards</label>" +
            '<div class="jam-prize-fields" id="jamPrizeFields"' + (draft.prizeEnabled ? "" : " hidden") + ">" +
              hostContribField +
              '<div class="field"><label>Participant contributions</label><select name="participantPrizeMode">' + partModes + "</select></div>" +
              '<p class="field-hint jam-contrib-warn">Participant Ducats fund the winner pot. ' +
              "If the jam closes with <strong>no eligible entries</strong>, everyone is refunded what they put in — " +
              "you only keep your own host contribution, not participant add-ins. " +
              "Disqualifying every entry also triggers that full per-person refund.</p>" +
              '<div class="field"><label>Minimum per entrant (if required)</label><input type="number" name="participantMin" min="0" max="9999" value="' +
              escapeAttr(String(draft.participantMin || 0)) + '"></div>' +
              (opts.balance != null
                ? '<p class="field-hint">Your balance: ' + escapeHtml(formatDucats(opts.balance)) + "</p>"
                : "") +
            "</div></section>" +
        "</form>"
      );
    },

    readForm: function (form) {
      if (!form) return {};
      var genres = [];
      form.querySelectorAll("[data-jam-genre]").forEach(function (el) {
        if (el.checked) genres.push(el.getAttribute("data-jam-genre"));
      });
      var flags = [];
      form.querySelectorAll("[data-jam-mature]").forEach(function (el) {
        if (el.checked) flags.push(el.getAttribute("data-jam-mature"));
      });
      var assetCats = [];
      form.querySelectorAll("[data-jam-asset-cat]").forEach(function (el) {
        if (el.checked) assetCats.push(el.getAttribute("data-jam-asset-cat"));
      });
      return {
        title: form.title && form.title.value,
        tagline: form.tagline && form.tagline.value,
        theme: form.theme && form.theme.value,
        rules: form.rules && form.rules.value,
        keywords: form.keywords && form.keywords.value,
        genres: genres,
        contentFlags: flags,
        ageRestricted: flags.length > 0,
        jamType: form.jamType && form.jamType.value,
        assetSubmissionMode: form.assetSubmissionMode && form.assetSubmissionMode.value,
        allowedCategories: assetCats,
        requireFreeListing: Boolean(form.requireFreeListing && form.requireFreeListing.checked),
        submissionStart: form.submissionStart && form.submissionStart.value,
        submissionEnd: form.submissionEnd && form.submissionEnd.value,
        judgingEnd: form.judgingEnd && form.judgingEnd.value,
        submissionMode: form.submissionMode && form.submissionMode.value,
        winnerMode: form.winnerMode && form.winnerMode.value,
        winnerCount: form.winnerCount && form.winnerCount.value,
        prizeSplits: Array.prototype.map.call(form.querySelectorAll("[data-prize-split]"), function (el) {
          return Math.max(0, parseInt(el.value, 10) || 0);
        }),
        prizeEnabled: Boolean(form.prizeEnabled && form.prizeEnabled.checked),
        hostContribution: form.hostContribution && form.hostContribution.value,
        participantPrizeMode: form.participantPrizeMode && form.participantPrizeMode.value,
        participantMin: form.participantMin && form.participantMin.value,
        coverStyle: readCoverStyleFromForm(form),
      };
    },

    /** Keep winner-mode options + split chart in sync with jam type / prize toggle. */
    syncWinnerFormUi: function (root, opts) {
      opts = opts || {};
      root = root || document;
      var form = root.querySelector ? root.querySelector("#jamForm") : null;
      if (!form) return;
      var typeEl = form.elements.jamType;
      var jamType = (typeEl && typeEl.value) === "asset" ? "asset" : "game";
      var prizeOn = !!(form.prizeEnabled && form.prizeEnabled.checked);
      var modeSel = form.elements.winnerMode || root.querySelector("#jamWinnerMode");
      var countField = root.querySelector("#jamWinnerCountField");
      var countSel = root.querySelector("#jamWinnerCount");
      var splitWrap = root.querySelector("#jamPrizeSplitWrap");
      var splitChart = root.querySelector("#jamPrizeSplitChart");
      var sumEl = root.querySelector("#jamPrizeSplitSum");
      var hint = root.querySelector("#jamWinnerModeHint");
      var modes = winnerModesFor(jamType, prizeOn);

      if (modeSel && opts.rebuildModes !== false) {
        var keep = modeSel.value;
        modeSel.innerHTML = modes.map(function (m) {
          return '<option value="' + escapeAttr(m.id) + '"' +
            (m.id === keep ? " selected" : "") + ">" + escapeHtml(m.label) + "</option>";
        }).join("");
        if (modes.every(function (m) { return m.id !== modeSel.value; })) {
          modeSel.value = modes[0] ? modes[0].id : "host_picks";
        }
      }
      if (modeSel && hint) {
        var meta = modes.find(function (m) { return m.id === modeSel.value; });
        hint.textContent = (meta && meta.hint) || "";
      }

      var mode = modeSel ? modeSel.value : "host_picks";
      var unranked = mode === "unranked";
      if (countField) countField.hidden = unranked;
      if (splitWrap) splitWrap.hidden = !prizeOn || unranked;
      if (unranked || !countSel) {
        if (sumEl) {
          sumEl.textContent = "";
          sumEl.classList.remove("is-invalid", "is-valid");
        }
        return;
      }

      var n = clampWinnerCount(countSel.value || 1);
      if (String(countSel.value) !== String(n)) countSel.value = String(n);

      var inputs = splitChart ? splitChart.querySelectorAll("[data-prize-split]") : [];
      var existing = Array.prototype.map.call(inputs, function (el) {
        return Math.max(0, parseInt(el.value, 10) || 0);
      });
      var countChanged = existing.length !== n;
      var splits = countChanged ? defaultPrizeSplits(n) : existing;
      var hostContrib = form.hostContribution ? parseInt(form.hostContribution.value, 10) || 0 : 0;

      if (countChanged && splitChart) {
        splitChart.innerHTML = renderPrizeSplitChartHtml(splits, hostContrib);
      } else if (splitChart) {
        var amounts = allocatePrizeShares(hostContrib, splits);
        Array.prototype.forEach.call(splitChart.querySelectorAll(".jam-split-row"), function (row, i) {
          var bar = row.querySelector(".jam-split-bar");
          var duc = row.querySelector(".jam-split-ducats");
          var pct = splits[i] || 0;
          if (bar) bar.style.width = Math.max(2, Math.min(100, pct)) + "%";
          if (duc) duc.textContent = String(amounts[i] || 0) + " ♦";
        });
      }

      var sum = splits.reduce(function (a, b) { return a + b; }, 0);
      if (sumEl) {
        sumEl.textContent = "Total: " + sum + "%" + (sum === 100 ? " ✓" : " — must equal 100%");
        sumEl.classList.toggle("is-invalid", sum !== 100);
        sumEl.classList.toggle("is-valid", sum === 100);
      }
    },

    renderDetail: function (jam, ctx) {
      ctx = ctx || {};
      if (!jam) return "<p>Jam not found.</p>";
      migrateJam(jam);
      var phase = jamPhase(jam);
      var pool = jam.prizeEnabled ? prizePoolTotal(jam) : 0;
      var isHost = ctx.userId && jam.hostUserId === ctx.userId;
      var subs = jam.submissions || [];
      var winnerIds = getWinnerIds(jam);
      var winner = winnerIds.find(Boolean)
        ? subs.find(function (s) { return s.id === winnerIds.find(Boolean); })
        : null;

      var subsHtml = subs.length
        ? subs.map(function (s) {
            var likes = (s.likes || []).length;
            var liked = ctx.userId && (s.likes || []).indexOf(ctx.userId) >= 0;
            var placeIndex = winnerIds.indexOf(s.id);
            var isWinner = placeIndex >= 0 && !s.disqualified;
            var placeBadge = isWinner
              ? '<span class="jam-place-badge">' + escapeHtml(ordinalPlace(placeIndex + 1)) + "</span>"
              : "";
            var pickBtns = isHost && jam.winnerMode === "host_picks" && phase === "judging" && !s.disqualified
              ? hostPickButtonsHtml(jam, s.id)
              : "";
            var modBtns = hostModerationButtonsHtml(jam, s, isHost);
            var dqClass = s.disqualified ? " jam-entry--disqualified" : "";
            if (submissionEntryType(s) === "asset") {
              var thumb = s.preview_data_url
                ? 'style="background-image:url(' + s.preview_data_url + ')"'
                : 'data-category="' + escapeAttr(s.category || "pack") + '"';
              var showLikes = jam.winnerMode === "auto_likes";
              return (
                '<div class="jam-entry jam-entry--asset' + (isWinner ? " jam-entry--winner" : "") + dqClass + '">' +
                  '<span class="jam-entry-thumb" ' + thumb + "></span>" +
                  '<div class="jam-entry-head">' +
                    placeBadge +
                    '<strong>' + escapeHtml(s.listingTitle || "Asset") + "</strong>" +
                    '<span class="field-hint">' + escapeHtml(s.category || "asset") + " · " + escapeHtml(s.userName) + "</span>" +
                  "</div>" +
                  '<div class="jam-entry-actions">' +
                    (showLikes && !s.disqualified ? '<span class="jam-likes">' + likes + " ♥</span>" : "") +
                    assetRatingControlsHtml(jam, s, ctx) +
                    (showLikes && phase === "judging" && ctx.userId && !s.disqualified
                      ? '<button type="button" class="btn btn-sm btn-ghost jam-like-btn" data-like-sub="' +
                          escapeAttr(s.id) + '">' + (liked ? "Unlike" : "Like") + "</button>"
                      : "") +
                    pickBtns +
                    modBtns +
                    '<a class="btn btn-sm" href="/studio#/library/shop">View shop</a>' +
                  "</div>" +
                "</div>"
              );
            }
            return (
              '<div class="jam-entry' + (isWinner ? " jam-entry--winner" : "") + dqClass + '">' +
                '<div class="jam-entry-head">' +
                  placeBadge +
                  '<strong>' + escapeHtml(s.seriesTitle) + "</strong>" +
                  '<span class="field-hint">' + escapeHtml(s.episodeTitle) + " · " + escapeHtml(s.userName) + "</span>" +
                  (s.disqualified
                    ? '<span class="jam-dq-badge">Disqualified' +
                        (s.disqualifiedReason ? ": " + escapeHtml(s.disqualifiedReason) : "") +
                      "</span>"
                    : "") +
                "</div>" +
                '<div class="jam-entry-actions">' +
                  (!s.disqualified ? '<span class="jam-likes">' + likes + " ♥</span>" : "") +
                  (phase === "judging" && ctx.userId && jam.winnerMode !== "unranked" && !s.disqualified
                    ? '<button type="button" class="btn btn-sm btn-ghost jam-like-btn" data-like-sub="' +
                        escapeAttr(s.id) + '">' + (liked ? "Unlike" : "Like") + "</button>"
                    : "") +
                  pickBtns +
                  modBtns +
                  '<a class="btn btn-sm" href="/play?series=' + encodeURIComponent(s.seriesId) +
                    "&episode=" + encodeURIComponent(s.episodeId) + '">Play</a>' +
                "</div>" +
              "</div>"
            );
          }).join("")
        : '<p class="field-hint">No submissions yet.</p>';

      var hostActions = "";
      if (isHost) {
        if (jam.status === "draft") {
          hostActions =
            '<a class="btn btn-ghost" href="#/jams/' + escapeAttr(jam.id) + '/edit">Edit</a>' +
            '<button type="button" class="btn btn-primary" id="jamPublishBtn">Publish jam</button>';
        } else {
          hostActions =
            '<a class="btn btn-ghost" href="#/jams/' + escapeAttr(jam.id) + '/edit">Edit jam</a>';
        }
      }

      var addPrizePanel = "";
      if (isHost && jam.status === "published" && jam.prizeEnabled && !(jam.prize && (jam.prize.paidOut || jam.prize.refunded))) {
        addPrizePanel =
          '<section class="form-section jam-add-prize-panel">' +
            "<h2>Add to prize pool</h2>" +
            '<p class="field-hint">You cannot remove funded Ducats, but you can add more anytime before payout.</p>' +
            '<div class="field-row">' +
              '<div class="field"><label>Additional Ducats</label><input type="number" id="jamAddPrizeAmount" min="1" max="99999" value="10"></div>' +
              '<button type="button" class="btn btn-secondary" id="jamAddPrizeBtn">Add Ducats</button>' +
            "</div>" +
          "</section>";
      }

      var submitPanel = "";
      if (phase === "submissions" && ctx.userId && jam.status === "published") {
        var needContrib = jam.prizeEnabled && jam.participantPrizeMode === "required";
        var contribField = jam.prizeEnabled && jam.participantPrizeMode !== "none"
          ? '<div class="field"><label>Add to prize pool (Ducats)' +
              (needContrib ? " — required" : "") + '</label><input type="number" id="jamSubmitContrib" min="' +
              (needContrib ? String(jam.participantMin || 0) : "0") + '" value="' +
              (needContrib ? String(jam.participantMin || 0) : "0") + '"></div>' +
              '<p class="field-hint jam-contrib-warn"><strong>Prize contributions stay in the pot for winners.</strong> ' +
              "If the jam ends with <strong>no eligible entries</strong> (including if every entry is disqualified), " +
              "each person gets <strong>their own</strong> Ducats back — the host only recovers what they funded.</p>"
          : "";
        var ageWarn = requiresAgeGate(jam) && !ctx.adultVerified
          ? '<p class="field-hint jam-age-warning">This jam is 18+. Confirm your age on <a href="/account">Account</a> before submitting.</p>'
          : "";

        if (isAssetJam(jam)) {
          var libEntries = ctx.libraryEntries || [];
          var libOpts = libEntries.map(function (e) {
            return '<option value="' + escapeAttr(e.id) + '">' +
              escapeHtml((e.title || "Untitled") + " · " + (e.category || "asset")) + "</option>";
          }).join("");
          var listOpts = (ctx.sellerListings || []).map(function (l) {
            return '<option value="' + escapeAttr(l.id) + '">' + escapeHtml(l.title || "Listing") + "</option>";
          }).join("");
          var mode = jam.assetSubmissionMode || "new_listing";
          var showPublish = mode === "either";
          var showExisting = mode === "existing_listing";
          var showDirect = mode !== "existing_listing";
          submitPanel =
            '<section class="form-section jam-submit-panel jam-submit-panel--asset">' +
              "<h2>Submit your asset</h2>" +
              ageWarn +
              '<p class="field-hint">Submit an asset you <strong>created during this jam</strong> (Studio → My assets). Purchased assets and older library packs are not eligible.</p>' +
              (showDirect
                ? '<div class="jam-asset-submit-block" id="jamAssetLibraryBlock">' +
                    '<h3 class="jam-asset-submit-subhead">From my library</h3>' +
                    '<div class="field"><label>Library asset (made during jam)</label><select id="jamSubmitLibrary">' +
                      (libOpts || '<option value="">No eligible assets yet — save one to My assets during the jam window</option>') +
                    "</select></div>" +
                    '<p class="field-hint">Save characters, stages, or packs to <strong>My assets</strong> from the story editor after the jam starts, then pick them here.</p>' +
                    '<button type="button" class="btn btn-primary" id="jamSubmitAssetDirectBtn"' +
                      (libOpts ? "" : " disabled") + ">Submit asset</button>" +
                  "</div>"
                : "") +
              (showPublish
                ? '<div class="jam-asset-submit-block" id="jamAssetPublishBlock">' +
                    '<h3 class="jam-asset-submit-subhead">Publish to shop &amp; submit</h3>' +
                    '<div class="field"><label>Library asset</label><select id="jamSubmitLibraryPublish">' +
                      (libOpts || '<option value="">No eligible assets in library</option>') +
                    "</select></div>" +
                    '<div class="field"><label>Listing title</label><input type="text" id="jamSubmitAssetTitle" maxlength="80" placeholder="Title for the shop listing"></div>' +
                    '<div class="field"><label>Description</label><textarea id="jamSubmitAssetDesc" rows="2" maxlength="400" placeholder="What buyers get…"></textarea></div>' +
                    (jam.requireFreeListing
                      ? '<p class="field-hint">This jam prefers a free list price (0 Ducats). Either way, jam entries stay free in the shop until voting ends.</p>'
                      : '<p class="field-hint">Paid list prices stay on the listing — shoppers get them free until this jam’s voting ends.</p>') +
                    '<button type="button" class="btn btn-secondary" id="jamSubmitAssetPublishBtn"' +
                      (libOpts ? "" : " disabled") + ">Publish &amp; submit</button>" +
                  "</div>"
                : "") +
              (showExisting
                ? '<div class="jam-asset-submit-block" id="jamAssetExistingBlock">' +
                    '<h3 class="jam-asset-submit-subhead">Existing shop listing</h3>' +
                    '<div class="field"><label>Your live listing</label><select id="jamSubmitListing">' +
                      (listOpts || '<option value="">No listings yet</option>') +
                    "</select></div>" +
                    '<button type="button" class="btn btn-secondary" id="jamSubmitAssetListingBtn">Submit listing</button>' +
                  "</div>"
                : "") +
              contribField +
            "</section>";
        } else {
          var seriesOpts = (ctx.seriesList || []).map(function (s) {
            return '<option value="' + escapeAttr(s.id) + '">' + escapeHtml(s.title || "Untitled") + "</option>";
          }).join("");
          submitPanel =
            '<section class="form-section jam-submit-panel">' +
              "<h2>Submit your entry</h2>" +
              ageWarn +
              '<div class="field"><label>Series</label><select id="jamSubmitSeries">' + seriesOpts + "</select></div>" +
              '<div class="field"><label>Episode</label><select id="jamSubmitEpisode"></select></div>' +
              contribField +
              '<button type="button" class="btn btn-primary" id="jamSubmitBtn">Submit entry</button>' +
            "</section>";
        }
      }

      var buyPanel = "";
      if (window.ScenaWallet && ScenaWallet.renderBuyDucatsPanel) {
        buyPanel =
          '<section class="form-section" id="jamBuyDucatsPanel" hidden>' +
            ScenaWallet.renderBuyDucatsPanel({ message: "You need more Ducats to fund this jam." }) +
          "</section>";
      }

      return (
        '<div class="page jam-detail">' +
          renderJamCover(jam.coverStyle, { featured: true, detail: true, title: jam.title, hideGlyph: true }) +
          '<div class="page-head jam-detail-head">' +
            "<div><p class=\"jam-type-badge jam-type-badge--" + escapeAttr(jam.jamType || "game") + "\">" +
              escapeHtml(jamTypeLabel(jam.jamType)) + "</p><h1>" + escapeHtml(jam.title) + "</h1>" +
              '<p class="jam-detail-tagline">' + escapeHtml(jam.tagline || jam.theme) + "</p>" +
              '<p class="field-hint jam-detail-theme-label">Theme: ' + escapeHtml(jam.theme) + "</p>" +
              '<p class="field-hint">Host: ' + escapeHtml(jam.hostName) +
                " · " + escapeHtml(phase) +
                (jam.ageRestricted ? ' · <span class="jam-age">18+</span>' : "") +
              "</p></div>" +
            (isHost ? hostActions : "") +
          "</div>" +
          buyPanel +
          '<section class="form-section"><h2>Rules</h2><div class="jam-rules">' +
            escapeHtml(jam.rules).replace(/\n/g, "<br>") + "</div></section>" +
          '<section class="form-section jam-schedule">' +
            "<h2>Schedule</h2>" +
            "<ul>" +
              "<li>Submissions: " + escapeHtml(formatWhen(jam.submissionStart)) + " – " +
                escapeHtml(formatWhen(jam.submissionEnd)) + "</li>" +
              "<li>Judging until: " + escapeHtml(formatWhen(jam.judgingEnd)) + "</li>" +
            "</ul></section>" +
          (pool > 0
            ? '<section class="form-section"><h2>Prize</h2><p>' + escapeHtml(formatDucats(pool)) +
                " total" +
                (jam.prizeSplits && jam.prizeSplits.length
                  ? '<span class="field-hint"> · Split: ' +
                    escapeHtml(jam.prizeSplits.map(function (p, i) {
                      return ordinalPlace(i + 1) + " " + p + "%";
                    }).join(", ")) + "</span>"
                  : "") +
                (winnerIds.filter(Boolean).length
                  ? '<span class="field-hint"> · Placed: ' +
                    escapeHtml(winnerIds.filter(Boolean).map(function (id) {
                      var w = subs.find(function (s) { return s.id === id; });
                      return ordinalPlace(winnerIds.indexOf(id) + 1) + " " + ((w && w.userName) || "?");
                    }).join(", ")) + "</span>"
                  : "") +
                (jam.prize && jam.prize.refunded
                  ? '<span class="field-hint"> · Refunded to contributors (no eligible entries)</span>'
                  : "") +
              "</p></section>"
            : (jam.prize && jam.prize.refunded
                ? '<section class="form-section"><h2>Prize</h2><p class="field-hint">Pool refunded to each contributor — this jam had no eligible entries.</p></section>'
                : (jam.winnerMode === "unranked"
                ? '<section class="form-section"><h2>Ranking</h2><p class="field-hint">Unranked showcase — no official winners.</p></section>'
                : ""))) +
          addPrizePanel +
          submitPanel +
          '<section class="form-section"><h2>Entries (' + subs.length + ")</h2>" + subsHtml + "</section>" +
        "</div>"
      );
    },

    renderAgeGate: function (jam) {
      return (
        '<div class="jam-age-gate page">' +
          '<h1>Age-restricted jam</h1>' +
          '<p><strong>' + escapeHtml(jam.title) + "</strong> is labeled 18+ because of mature content.</p>" +
          '<p class="field-hint">Confirm you are 18 or older on your <a href="/account">Account</a> page, then return here.</p>' +
          '<a class="btn btn-primary" href="/account">Go to Account</a>' +
          ' <a class="btn btn-ghost" href="#/jams">Back to jams</a>' +
        "</div>"
      );
    },
  };
})();
