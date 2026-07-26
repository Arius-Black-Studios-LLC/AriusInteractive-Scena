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
    { id: "auto_likes", label: "Most likes (automatic)", hint: "When judging ends, the entry with the most likes wins." },
    { id: "host_picks", label: "Host picks winner", hint: "You choose the winner after submissions close." },
  ];

  var PARTICIPANT_PRIZE_MODES = [
    { id: "none", label: "Host-funded only" },
    { id: "optional", label: "Participants may add Ducats" },
    { id: "required", label: "Participants must add Ducats" },
  ];

  var ASSET_SUBMISSION_MODES = [
    { id: "new_listing", label: "Publish from library only", hint: "Entrants list a new free asset pack created during the jam." },
    { id: "existing_listing", label: "Existing marketplace listing", hint: "Entrants submit a live listing they already published." },
    { id: "either", label: "New listing or existing", hint: "Either publish from library or link an existing listing." },
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
    if (!jam.jamType) jam.jamType = "game";
    if (!jam.assetSubmissionMode) jam.assetSubmissionMode = "either";
    if (!Array.isArray(jam.allowedCategories)) jam.allowedCategories = [];
    if (jam.requireFreeListing == null) jam.requireFreeListing = jam.jamType === "asset";
    if (!jam.coverStyle) jam.coverStyle = defaultCoverStyle();
    else jam.coverStyle = normalizeCoverStyle(jam.coverStyle);
    (jam.submissions || []).forEach(function (s) {
      if (!s.entryType) s.entryType = s.listingId ? "asset" : "game";
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
    return jam;
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
    var assetSubmissionMode = spec.assetSubmissionMode || "either";
    if (ASSET_SUBMISSION_MODES.every(function (m) { return m.id !== assetSubmissionMode; })) {
      assetSubmissionMode = "either";
    }
    var allowedCategories = Array.isArray(spec.allowedCategories) ? spec.allowedCategories.slice() : [];
    allowedCategories = allowedCategories.filter(function (id) {
      return ASSET_CATEGORIES.some(function (c) { return c.id === id; });
    });

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
      coverStyle: coverStyle,
      submissionStart: subStart.toISOString(),
      submissionEnd: subEnd.toISOString(),
      judgingEnd: judgeEnd.toISOString(),
      submissionMode: spec.submissionMode || "either",
      winnerMode: spec.winnerMode || "auto_likes",
      prizeEnabled: !!spec.prizeEnabled,
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

  function validateAssetListing(jam, userId, listing, opts) {
    opts = opts || {};
    if (!jam || jam.status !== "published") throw new Error("This jam is not accepting entries.");
    if (!isAssetJam(jam)) throw new Error("This is a game jam — submit a published episode instead.");
    if (jamPhase(jam) !== "submissions") throw new Error("Submissions are closed for this jam.");
    if (!listing || !listing.id) throw new Error("Pick a marketplace listing to submit.");
    if (listing.seller_id && listing.seller_id !== userId) {
      throw new Error("You can only submit listings you published.");
    }
    if (jam.requireFreeListing && Math.max(0, parseInt(listing.price_ducats, 10) || 0) > 0) {
      throw new Error("This asset jam requires free listings (0 Ducats).");
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
    };
  }

  function autoPickWinner(jam) {
    var subs = jam.submissions || [];
    if (!subs.length) return null;
    var best = subs.slice().sort(function (a, b) {
      var la = (a.likes || []).length;
      var lb = (b.likes || []).length;
      if (lb !== la) return lb - la;
      return String(a.submittedAt || "").localeCompare(String(b.submittedAt || ""));
    })[0];
    return best ? best.id : null;
  }

  function distributePrize(jam) {
    if (!jam.prizeEnabled || !jam.winnerSubmissionId) return Promise.resolve(jam);
    var total = prizePoolTotal(jam);
    if (total <= 0) return Promise.resolve(jam);
    var winner = (jam.submissions || []).find(function (s) { return s.id === jam.winnerSubmissionId; });
    if (!winner || !winner.userId) return Promise.resolve(jam);
    if (jam.prize && jam.prize.paidOut) return Promise.resolve(jam);
    return walletPayout(jam.hostUserId, jam.id, winner.userId, total).then(function () {
      jam.prize = jam.prize || {};
      jam.prize.paidOut = true;
      jam.prize.paidOutAt = new Date().toISOString();
      return saveJam(jam);
    });
  }

  function tryPayoutIfHost(jam, userId) {
    if (!jam || !userId || jam.hostUserId !== userId) return Promise.resolve(jam);
    if (!jam.winnerSubmissionId || (jam.prize && jam.prize.paidOut)) return Promise.resolve(jam);
    if (jamPhase(jam) !== "closed") return Promise.resolve(jam);
    return distributePrize(jam);
  }

  function finalizeIfDue(jam) {
    if (!jam || jam.status !== "published") return jam;
    if (jamPhase(jam) !== "closed") return jam;
    if (jam.winnerSubmissionId) return jam;
    if (jam.winnerMode === "auto_likes") {
      jam.winnerSubmissionId = autoPickWinner(jam);
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
      var rows = readAll().slice().map(migrateJam);
      if (opts.publishedOnly) rows = rows.filter(function (j) { return j.status === "published"; });
      if (opts.hostUserId) rows = rows.filter(function (j) { return j.hostUserId === opts.hostUserId; });
      rows.forEach(finalizeIfDue);
      return Promise.resolve(queryJams(rows, opts));
    },

    groupBySprint: groupBySprint,
    queryJams: queryJams,
    migrateJam: migrateJam,
    jamGenreLabels: jamGenreLabels,

    listHomeSubmissionFeed: function (opts) {
      opts = opts || {};
      var perJam = Math.max(1, parseInt(opts.perJam, 10) || 4);
      var rows = readAll().slice().map(migrateJam).filter(function (j) {
        return j.status === "published";
      });
      rows.forEach(finalizeIfDue);
      rows = rows.filter(function (j) {
        if (opts.hideAdult && !opts.viewerIsAdult && requiresAgeGate(j)) return false;
        var phase = jamPhase(j);
        if (phase !== "submissions" && phase !== "judging") return false;
        return (j.submissions || []).length > 0;
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

      if (pick.listing) {
        validateAssetListing(jam, userId, pick.listing, { viaExisting: true });
        chain = Promise.resolve(pick.listing);
      } else if (pick.libraryEntryId) {
        if (!window.ScenaAssetLibrary || !ScenaAssetLibrary.publishFromLibrary) {
          return Promise.reject(new Error("Asset library unavailable."));
        }
        chain = ScenaAssetLibrary.publishFromLibrary(userId, pick.libraryEntryId, {
          title: pick.title,
          description: pick.description || "",
          category: pick.category,
          priceDucats: jam.requireFreeListing ? 0 : Math.max(0, parseInt(pick.priceDucats, 10) || 0),
        }).then(function (result) {
          return ScenaMarketplace.getListing(result.id, userId).then(function (listing) {
            if (!listing) {
              listing = {
                id: result.id,
                seller_id: userId,
                title: pick.title || "Jam entry",
                category: pick.category || "pack",
                price_ducats: jam.requireFreeListing ? 0 : 0,
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
        var entry = listingToAssetEntry(userId, profile, listing, pick.libraryEntryId || null);
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
    },

    toggleLike: function (userId, jamId, submissionId) {
      if (!userId) return Promise.reject(new Error("Sign in to like entries."));
      var jam = findJam(jamId);
      if (!jam) return Promise.reject(new Error("Jam not found."));
      if (jamPhase(jam) === "submissions") throw new Error("Likes open after submissions close.");
      var sub = (jam.submissions || []).find(function (s) { return s.id === submissionId; });
      if (!sub) throw new Error("Entry not found.");
      sub.likes = sub.likes || [];
      var idx = sub.likes.indexOf(userId);
      if (idx >= 0) sub.likes.splice(idx, 1);
      else sub.likes.push(userId);
      saveJam(jam);
      return Promise.resolve({ count: sub.likes.length, liked: idx < 0 });
    },

    pickWinner: function (hostUserId, jamId, submissionId) {
      var jam = findJam(jamId);
      if (!jam) return Promise.reject(new Error("Jam not found."));
      if (jam.hostUserId !== hostUserId) return Promise.reject(new Error("Only the host can pick the winner."));
      if (jam.winnerMode !== "host_picks") return Promise.reject(new Error("This jam uses automatic likes for the winner."));
      if (jamPhase(jam) === "submissions") return Promise.reject(new Error("Wait until submissions close."));
      var sub = (jam.submissions || []).find(function (s) { return s.id === submissionId; });
      if (!sub) return Promise.reject(new Error("Entry not found."));
      jam.winnerSubmissionId = submissionId;
      jam = saveJam(jam);
      return distributePrize(jam);
    },

    requiresAgeGate: requiresAgeGate,
    jamPhase: jamPhase,
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

      var assetSubModes = ASSET_SUBMISSION_MODES.map(function (m) {
        return '<option value="' + escapeAttr(m.id) + '"' +
          ((draft.assetSubmissionMode || "either") === m.id ? " selected" : "") + ">" +
          escapeHtml(m.label) + "</option>";
      }).join("");

      var assetCatChecks = ASSET_CATEGORIES.map(function (c) {
        var on = (draft.allowedCategories || []).indexOf(c.id) >= 0;
        return (
          '<label class="check-row">' +
            '<input type="checkbox" data-jam-asset-cat="' + escapeAttr(c.id) + '"' + (on ? " checked" : "") + ">" +
            escapeHtml(c.label) +
          "</label>"
        );
      }).join("");

      var winModes = WINNER_MODES.map(function (m) {
        return '<option value="' + escapeAttr(m.id) + '"' +
          ((draft.winnerMode || "auto_likes") === m.id ? " selected" : "") + ">" +
          escapeHtml(m.label) + "</option>";
      }).join("");

      var jamType = draft.jamType || opts.jamType || "game";
      var isAsset = jamType === "asset";
      var entryRequirements = isAsset
        ? (
          '<section class="form-section"><h2>Asset entry requirements</h2>' +
            '<p class="field-hint">Entrants submit marketplace asset packs — characters, stages, items, audio, or bundles.</p>' +
            '<div class="field"><label>What can entrants submit?</label><select name="assetSubmissionMode">' + assetSubModes + "</select></div>" +
            '<div class="field"><label>Allowed categories</label><div class="check-grid">' + assetCatChecks +
              '</div><p class="field-hint">Leave all unchecked to allow every category.</p></div>' +
            '<label class="check-row"><input type="checkbox" name="requireFreeListing"' +
              (draft.requireFreeListing !== false ? " checked" : "") + "> Require free listings (0 Ducats)</label>" +
            '<div class="field"><label>Winner selection</label><select name="winnerMode">' + winModes + "</select></div></section>"
        )
        : (
          '<section class="form-section"><h2>Entry requirements</h2>' +
            '<div class="field"><label>What can entrants submit?</label><select name="submissionMode">' + subModes + "</select></div>" +
            '<div class="field"><label>Winner selection</label><select name="winnerMode">' + winModes + "</select></div></section>"
        );

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
      var funded = Math.max(0, parseInt((draft.prize && draft.prize.hostContribution) || draft.hostContribution, 10) || 0);
      var hostContribField = published
        ? '<div class="field"><label>Your contribution (locked)</label>' +
            '<input type="number" name="hostContribution" min="' + escapeAttr(String(funded)) + '" value="' +
            escapeAttr(String(funded)) + '" readonly>' +
            '<p class="field-hint">Funded Ducats cannot be removed after publishing. Add more on the jam page.</p></div>'
        : '<div class="field"><label>Your contribution (Ducats)</label><input type="number" name="hostContribution" min="0" max="99999" value="' +
            escapeAttr(String(draft.hostContribution || 0)) + '"></div>';
      return (
        '<form class="jam-form" id="jamForm">' +
          '<input type="hidden" name="jamType" value="' + escapeAttr(jamType) + '">' +
          '<p class="jam-type-badge jam-type-badge--' + escapeAttr(jamType) + '">' + escapeHtml(jamTypeLabel(jamType)) + "</p>" +
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
        prizeEnabled: Boolean(form.prizeEnabled && form.prizeEnabled.checked),
        hostContribution: form.hostContribution && form.hostContribution.value,
        participantPrizeMode: form.participantPrizeMode && form.participantPrizeMode.value,
        participantMin: form.participantMin && form.participantMin.value,
        coverStyle: readCoverStyleFromForm(form),
      };
    },

    renderDetail: function (jam, ctx) {
      ctx = ctx || {};
      if (!jam) return "<p>Jam not found.</p>";
      var phase = jamPhase(jam);
      var pool = jam.prizeEnabled ? prizePoolTotal(jam) : 0;
      var isHost = ctx.userId && jam.hostUserId === ctx.userId;
      var subs = jam.submissions || [];
      var winner = jam.winnerSubmissionId
        ? subs.find(function (s) { return s.id === jam.winnerSubmissionId; })
        : null;

      var subsHtml = subs.length
        ? subs.map(function (s) {
            var likes = (s.likes || []).length;
            var liked = ctx.userId && (s.likes || []).indexOf(ctx.userId) >= 0;
            var isWinner = jam.winnerSubmissionId === s.id;
            if (submissionEntryType(s) === "asset") {
              var thumb = s.preview_data_url
                ? 'style="background-image:url(' + s.preview_data_url + ')"'
                : 'data-category="' + escapeAttr(s.category || "pack") + '"';
              return (
                '<div class="jam-entry jam-entry--asset' + (isWinner ? " jam-entry--winner" : "") + '">' +
                  '<span class="jam-entry-thumb" ' + thumb + "></span>" +
                  '<div class="jam-entry-head">' +
                    '<strong>' + escapeHtml(s.listingTitle || "Asset") + "</strong>" +
                    '<span class="field-hint">' + escapeHtml(s.category || "asset") + " · " + escapeHtml(s.userName) + "</span>" +
                  "</div>" +
                  '<div class="jam-entry-actions">' +
                    '<span class="jam-likes">' + likes + " ♥</span>" +
                    (phase === "judging" && ctx.userId
                      ? '<button type="button" class="btn btn-sm btn-ghost jam-like-btn" data-like-sub="' +
                          escapeAttr(s.id) + '">' + (liked ? "Unlike" : "Like") + "</button>"
                      : "") +
                    (isHost && jam.winnerMode === "host_picks" && phase !== "submissions"
                      ? '<button type="button" class="btn btn-sm btn-primary jam-pick-btn" data-pick-sub="' +
                          escapeAttr(s.id) + '">Pick winner</button>'
                      : "") +
                    '<a class="btn btn-sm" href="/studio#/library/shop">View shop</a>' +
                  "</div>" +
                "</div>"
              );
            }
            return (
              '<div class="jam-entry' + (isWinner ? " jam-entry--winner" : "") + '">' +
                '<div class="jam-entry-head">' +
                  '<strong>' + escapeHtml(s.seriesTitle) + "</strong>" +
                  '<span class="field-hint">' + escapeHtml(s.episodeTitle) + " · " + escapeHtml(s.userName) + "</span>" +
                "</div>" +
                '<div class="jam-entry-actions">' +
                  '<span class="jam-likes">' + likes + " ♥</span>" +
                  (phase === "judging" && ctx.userId
                    ? '<button type="button" class="btn btn-sm btn-ghost jam-like-btn" data-like-sub="' +
                        escapeAttr(s.id) + '">' + (liked ? "Unlike" : "Like") + "</button>"
                    : "") +
                  (isHost && jam.winnerMode === "host_picks" && phase !== "submissions"
                    ? '<button type="button" class="btn btn-sm btn-primary jam-pick-btn" data-pick-sub="' +
                        escapeAttr(s.id) + '">Pick winner</button>'
                    : "") +
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
      if (isHost && jam.status === "published" && jam.prizeEnabled && !(jam.prize && jam.prize.paidOut)) {
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
              (needContrib ? String(jam.participantMin || 0) : "0") + '"></div>'
          : "";
        var ageWarn = requiresAgeGate(jam) && !ctx.adultVerified
          ? '<p class="field-hint jam-age-warning">This jam is 18+. Confirm your age on <a href="/account">Account</a> before submitting.</p>'
          : "";

        if (isAssetJam(jam)) {
          var libOpts = (ctx.libraryEntries || []).map(function (e) {
            return '<option value="' + escapeAttr(e.id) + '">' + escapeHtml(e.title || "Untitled") + "</option>";
          }).join("");
          var listOpts = (ctx.sellerListings || []).map(function (l) {
            return '<option value="' + escapeAttr(l.id) + '">' + escapeHtml(l.title || "Listing") + "</option>";
          }).join("");
          var mode = jam.assetSubmissionMode || "either";
          var showPublish = mode !== "existing_listing";
          var showExisting = mode !== "new_listing";
          submitPanel =
            '<section class="form-section jam-submit-panel jam-submit-panel--asset">' +
              "<h2>Submit your asset</h2>" +
              ageWarn +
              '<p class="field-hint">Publish an asset from your library or link an existing marketplace listing.</p>' +
              (showPublish
                ? '<div class="jam-asset-submit-block" id="jamAssetPublishBlock">' +
                    '<h3 class="jam-asset-submit-subhead">Publish from library</h3>' +
                    '<div class="field"><label>Library asset</label><select id="jamSubmitLibrary">' +
                      (libOpts || '<option value="">No made assets in library</option>') +
                    "</select></div>" +
                    '<div class="field"><label>Listing title</label><input type="text" id="jamSubmitAssetTitle" maxlength="80" placeholder="Title for the shop listing"></div>' +
                    '<div class="field"><label>Description</label><textarea id="jamSubmitAssetDesc" rows="2" maxlength="400" placeholder="What buyers get…"></textarea></div>' +
                    (jam.requireFreeListing
                      ? '<p class="field-hint">This jam requires free listings (0 Ducats).</p>'
                      : "") +
                    '<button type="button" class="btn btn-primary" id="jamSubmitAssetPublishBtn">Publish &amp; submit</button>' +
                  "</div>"
                : "") +
              (showExisting
                ? '<div class="jam-asset-submit-block" id="jamAssetExistingBlock">' +
                    '<h3 class="jam-asset-submit-subhead">Existing listing</h3>' +
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
                " total" + (winner ? " · Winner: " + escapeHtml(winner.userName) : "") + "</p></section>"
            : "") +
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
