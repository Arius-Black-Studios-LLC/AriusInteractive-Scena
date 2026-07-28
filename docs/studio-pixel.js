/**
 * Arleco Studio — simple pixel art editor + series art folder.
 */
(function (root) {
  var PALETTE = [
    "#000000", "#ffffff", "#9b9b9b", "#e53935", "#fb8c00", "#fdd835",
    "#43a047", "#1e88e5", "#8e24aa", "#6d4c41", "#26c6da", "#f48fb1",
    "#90a4ae", "#c0ca33", "#5c6bc0", "#ff7043",
  ];

  var SIZE_PRESETS = [16, 24, 32, 48, 64, 96, 128, 160, 256];

  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  function kindLabel(kind) {
    if (kind === "background") return "Background";
    if (kind === "ui") return "UI sprite";
    return "Character";
  }

  function hexToRgba(hex) {
    var h = String(hex || "#000000").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return { r: 0, g: 0, b: 0, a: 255 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 255 };
  }

  function rgbaToHex(r, g, b) {
    function p(n) {
      var s = Math.max(0, Math.min(255, n | 0)).toString(16);
      return s.length === 1 ? "0" + s : s;
    }
    return "#" + p(r) + p(g) + p(b);
  }

  function createEditor(opts) {
    var series = opts.series;
    var userId = opts.userId;
    var persist = opts.persist;
    var toast = opts.toast || function () {};
    var rootEl = opts.container;

    var state = {
      tool: "pencil",
      color: "#000000",
      width: 64,
      height: 64,
      zoom: 8,
      filter: "all",
      editingId: null,
      dirty: false,
      painting: false,
      undo: [],
      redo: [],
    };

    var canvas;
    var ctx;
    var display;
    var onWindowUp = null;

    function pushUndo() {
      if (!canvas) return;
      state.undo.push(canvas.toDataURL("image/png"));
      if (state.undo.length > 40) state.undo.shift();
      state.redo = [];
    }

    function restoreFromDataUrl(dataUrl, done) {
      var img = new Image();
      img.onload = function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        paintDisplay();
        if (done) done();
      };
      img.onerror = function () {
        if (done) done();
      };
      img.src = dataUrl;
    }

    function paintDisplay() {
      if (!display || !canvas) return;
      var dpr = window.devicePixelRatio || 1;
      var cssW = canvas.width * state.zoom;
      var cssH = canvas.height * state.zoom;
      display.width = Math.max(1, Math.round(cssW * dpr));
      display.height = Math.max(1, Math.round(cssH * dpr));
      display.style.width = cssW + "px";
      display.style.height = cssH + "px";
      var dctx = display.getContext("2d");
      dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dctx.imageSmoothingEnabled = false;
      dctx.clearRect(0, 0, cssW, cssH);
      dctx.drawImage(canvas, 0, 0, cssW, cssH);
      if (state.zoom >= 6) {
        dctx.strokeStyle = "rgba(255,255,255,0.08)";
        dctx.lineWidth = 1;
        for (var x = 0; x <= canvas.width; x++) {
          dctx.beginPath();
          dctx.moveTo(x * state.zoom + 0.5, 0);
          dctx.lineTo(x * state.zoom + 0.5, cssH);
          dctx.stroke();
        }
        for (var y = 0; y <= canvas.height; y++) {
          dctx.beginPath();
          dctx.moveTo(0, y * state.zoom + 0.5);
          dctx.lineTo(cssW, y * state.zoom + 0.5);
          dctx.stroke();
        }
      }
    }

    function pixelFromEvent(e) {
      var rect = display.getBoundingClientRect();
      var x = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width);
      var y = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height);
      return {
        x: Math.max(0, Math.min(canvas.width - 1, x)),
        y: Math.max(0, Math.min(canvas.height - 1, y)),
      };
    }

    function setPixel(x, y, rgba) {
      var img = ctx.getImageData(x, y, 1, 1);
      img.data[0] = rgba.r;
      img.data[1] = rgba.g;
      img.data[2] = rgba.b;
      img.data[3] = rgba.a;
      ctx.putImageData(img, x, y);
    }

    function getPixel(x, y) {
      var img = ctx.getImageData(x, y, 1, 1);
      return { r: img.data[0], g: img.data[1], b: img.data[2], a: img.data[3] };
    }

    function colorsMatch(a, b) {
      return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
    }

    function floodFill(sx, sy, fill) {
      var target = getPixel(sx, sy);
      if (colorsMatch(target, fill)) return;
      var w = canvas.width;
      var h = canvas.height;
      var data = ctx.getImageData(0, 0, w, h);
      var px = data.data;
      function read(i) {
        var o = i * 4;
        return { r: px[o], g: px[o + 1], b: px[o + 2], a: px[o + 3] };
      }
      function write(i, c) {
        var o = i * 4;
        px[o] = c.r;
        px[o + 1] = c.g;
        px[o + 2] = c.b;
        px[o + 3] = c.a;
      }
      var stack = [sy * w + sx];
      var seen = {};
      while (stack.length) {
        var i = stack.pop();
        if (seen[i]) continue;
        seen[i] = 1;
        if (!colorsMatch(read(i), target)) continue;
        write(i, fill);
        var x = i % w;
        var y = (i / w) | 0;
        if (x > 0) stack.push(i - 1);
        if (x < w - 1) stack.push(i + 1);
        if (y > 0) stack.push(i - w);
        if (y < h - 1) stack.push(i + w);
      }
      ctx.putImageData(data, 0, 0);
    }

    function applyTool(e, isStart) {
      var p = pixelFromEvent(e);
      if (state.tool === "eyedropper") {
        var c = getPixel(p.x, p.y);
        if (c.a < 8) return;
        state.color = rgbaToHex(c.r, c.g, c.b);
        var colorInput = rootEl.querySelector("#pixelColor");
        if (colorInput) colorInput.value = state.color;
        syncToolUi();
        return;
      }
      if (isStart) pushUndo();
      state.dirty = true;
      if (state.tool === "fill") {
        floodFill(p.x, p.y, hexToRgba(state.color));
      } else if (state.tool === "eraser") {
        setPixel(p.x, p.y, { r: 0, g: 0, b: 0, a: 0 });
      } else {
        setPixel(p.x, p.y, hexToRgba(state.color));
      }
      paintDisplay();
    }

    function resizeCanvas(w, h, clear) {
      w = Math.max(8, Math.min(512, parseInt(w, 10) || 64));
      h = Math.max(8, Math.min(512, parseInt(h, 10) || 64));
      var prev = null;
      if (canvas && !clear) {
        try { prev = canvas.toDataURL("image/png"); } catch (e) { prev = null; }
      }
      state.width = w;
      state.height = h;
      canvas.width = w;
      canvas.height = h;
      ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, w, h);
      if (prev) {
        restoreFromDataUrl(prev);
      } else {
        paintDisplay();
      }
      var wInput = rootEl.querySelector("#pixelWidth");
      var hInput = rootEl.querySelector("#pixelHeight");
      if (wInput) wInput.value = String(w);
      if (hInput) hInput.value = String(h);
    }

    function syncToolUi() {
      rootEl.querySelectorAll("[data-pixel-tool]").forEach(function (btn) {
        btn.classList.toggle("is-active", btn.getAttribute("data-pixel-tool") === state.tool);
      });
      rootEl.querySelectorAll("[data-pixel-swatch]").forEach(function (btn) {
        btn.classList.toggle("is-active", btn.getAttribute("data-pixel-swatch") === state.color.toLowerCase());
      });
      var zoomLabel = rootEl.querySelector("#pixelZoomVal");
      if (zoomLabel) zoomLabel.textContent = state.zoom + "×";
    }

    function renderFolderList() {
      var list = rootEl.querySelector("#pixelArtList");
      if (!list) return;
      var items = ScenaStore.listArtFolder(series, state.filter === "all" ? null : state.filter);
      if (!items.length) {
        list.innerHTML = '<p class="field-hint pixel-art-empty">No sprites in this folder yet. Draw something and save it.</p>';
        return;
      }
      list.innerHTML = items.map(function (item) {
        return (
          '<button type="button" class="pixel-art-item' + (state.editingId === item.id ? " is-active" : "") +
            '" data-art-id="' + escapeAttr(item.id) + '">' +
            '<span class="pixel-art-thumb" style="background-image:url(' + escapeAttr(item.dataUrl) + ')"></span>' +
            "<span class=\"pixel-art-meta\">" +
              "<strong>" + escapeHtml(item.name) + "</strong>" +
              "<span>" + escapeHtml(kindLabel(item.kind)) + " · " + item.width + "×" + item.height + "</span>" +
            "</span>" +
          "</button>"
        );
      }).join("");
      list.querySelectorAll("[data-art-id]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          loadArt(btn.getAttribute("data-art-id"));
        });
      });
    }

    function loadArt(id) {
      var item = ScenaStore.getArtAsset(series, id);
      if (!item || !item.dataUrl) return;
      state.editingId = item.id;
      state.dirty = false;
      state.undo = [];
      state.redo = [];
      resizeCanvas(item.width, item.height, true);
      restoreFromDataUrl(item.dataUrl);
      var nameInput = rootEl.querySelector("#pixelName");
      var kindInput = rootEl.querySelector("#pixelKind");
      if (nameInput) nameInput.value = item.name || "";
      if (kindInput) kindInput.value = item.kind || "character";
      renderFolderList();
      toast("Loaded “" + item.name + "”");
    }

    function newCanvas() {
      state.editingId = null;
      state.dirty = false;
      state.undo = [];
      state.redo = [];
      resizeCanvas(state.width, state.height, true);
      var nameInput = rootEl.querySelector("#pixelName");
      if (nameInput) nameInput.value = "";
      renderFolderList();
    }

    function saveArt() {
      var nameInput = rootEl.querySelector("#pixelName");
      var kindInput = rootEl.querySelector("#pixelKind");
      var name = (nameInput && nameInput.value.trim()) || "Untitled sprite";
      var kind = (kindInput && kindInput.value) || "character";
      var raw = canvas.toDataURL("image/png");
      var btn = rootEl.querySelector("#pixelSaveBtn");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Saving…";
      }
      ScenaStore.storePixelDataUrl(raw, {
        purpose: "pixel-art",
        seriesId: series.id,
        assetId: state.editingId || undefined,
      }).then(function (url) {
        var saved = ScenaStore.upsertArtAsset(series, {
          id: state.editingId || undefined,
          name: name,
          kind: kind,
          width: canvas.width,
          height: canvas.height,
          dataUrl: url,
        });
        state.editingId = saved.id;
        state.dirty = false;
        return persist(series).then(function () {
          renderFolderList();
          toast("Saved to Art folder.");
        });
      }).catch(function (err) {
        console.error(err);
        toast((err && err.message) || "Could not save sprite.");
      }).then(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Save to Art folder";
        }
      });
    }

    function deleteCurrent() {
      if (!state.editingId) {
        newCanvas();
        return;
      }
      if (!window.confirm("Remove this sprite from the Art folder?")) return;
      ScenaStore.removeArtAsset(series, state.editingId);
      persist(series).then(function () {
        newCanvas();
        toast("Removed from Art folder.");
      });
    }

    function markup() {
      var kinds = (ScenaStore.ART_KINDS || []).map(function (k) {
        return '<option value="' + k.id + '">' + escapeHtml(k.label) + "</option>";
      }).join("");
      var sizeOpts = SIZE_PRESETS.map(function (n) {
        return '<option value="' + n + '"' + (n === 64 ? " selected" : "") + ">" + n + "</option>";
      }).join("");
      var swatches = PALETTE.map(function (c) {
        return '<button type="button" class="pixel-swatch" data-pixel-swatch="' + c +
          '" style="background:' + c + '" title="' + c + '"></button>';
      }).join("");

      return (
        '<div class="page-wide pixel-art-page">' +
          '<header class="pixel-art-header">' +
            "<div>" +
              "<h1>Art</h1>" +
              '<p class="page-lead">Draw pixel sprites for this series. Save them to your Art folder as character, background, or UI art — then use them without importing files.</p>' +
            "</div>" +
          "</header>" +
          '<div class="pixel-art-workspace">' +
            '<aside class="pixel-art-folder" aria-label="Art folder">' +
              '<p class="game-ui-pane-label">Art folder</p>' +
              '<div class="pixel-art-filters" id="pixelFilterBar">' +
                '<button type="button" class="btn btn-sm is-active" data-art-filter="all">All</button>' +
                '<button type="button" class="btn btn-sm btn-ghost" data-art-filter="character">Character</button>' +
                '<button type="button" class="btn btn-sm btn-ghost" data-art-filter="background">Background</button>' +
                '<button type="button" class="btn btn-sm btn-ghost" data-art-filter="ui">UI</button>' +
              "</div>" +
              '<div class="pixel-art-list" id="pixelArtList"></div>' +
              '<button type="button" class="btn btn-sm btn-secondary" id="pixelNewBtn">New canvas</button>' +
            "</aside>" +
            '<div class="pixel-art-stage-wrap">' +
              '<div class="pixel-art-stage" id="pixelStage">' +
                '<canvas id="pixelDisplay" class="pixel-art-display"></canvas>' +
              "</div>" +
            "</div>" +
            '<aside class="pixel-art-tools" aria-label="Tools">' +
              '<p class="game-ui-pane-label">Tools</p>' +
              '<div class="pixel-tool-row" id="pixelToolRow">' +
                '<button type="button" class="btn btn-sm is-active" data-pixel-tool="pencil">Pencil</button>' +
                '<button type="button" class="btn btn-sm btn-ghost" data-pixel-tool="eraser">Eraser</button>' +
                '<button type="button" class="btn btn-sm btn-ghost" data-pixel-tool="fill">Fill</button>' +
                '<button type="button" class="btn btn-sm btn-ghost" data-pixel-tool="eyedropper">Eyedrop</button>' +
              "</div>" +
              '<div class="field"><label>Color</label>' +
                '<div class="pixel-color-row">' +
                  '<input type="color" id="pixelColor" value="#000000">' +
                  '<div class="pixel-swatches">' + swatches + "</div>" +
                "</div>" +
              "</div>" +
              '<div class="form-row pixel-size-row">' +
                '<div class="field"><label>Width</label>' +
                  '<select id="pixelWidthPreset">' + sizeOpts + "</select>" +
                  '<input type="number" id="pixelWidth" min="8" max="512" value="64">' +
                "</div>" +
                '<div class="field"><label>Height</label>' +
                  '<select id="pixelHeightPreset">' + sizeOpts + "</select>" +
                  '<input type="number" id="pixelHeight" min="8" max="512" value="64">' +
                "</div>" +
              "</div>" +
              '<button type="button" class="btn btn-sm btn-ghost" id="pixelApplySize">Apply canvas size</button>' +
              '<div class="field"><label>Zoom <span id="pixelZoomVal">8×</span></label>' +
                '<input type="range" id="pixelZoom" min="2" max="24" step="1" value="8">' +
              "</div>" +
              '<div class="pixel-tool-row">' +
                '<button type="button" class="btn btn-sm btn-ghost" id="pixelUndoBtn">Undo</button>' +
                '<button type="button" class="btn btn-sm btn-ghost" id="pixelRedoBtn">Redo</button>' +
                '<button type="button" class="btn btn-sm btn-ghost" id="pixelClearBtn">Clear</button>' +
              "</div>" +
              '<hr class="pixel-art-divider">' +
              '<p class="game-ui-pane-label">Save</p>' +
              '<div class="field"><label>Name</label>' +
                '<input type="text" id="pixelName" maxlength="80" placeholder="e.g. hero_idle">' +
              "</div>" +
              '<div class="field"><label>Type</label>' +
                '<select id="pixelKind">' + kinds + "</select>" +
              "</div>" +
              '<div class="modal-actions" style="justify-content:flex-start;margin-top:8px">' +
                '<button type="button" class="btn btn-primary" id="pixelSaveBtn">Save to Art folder</button>' +
                '<button type="button" class="btn btn-ghost btn-sm" id="pixelDeleteBtn">Delete</button>' +
              "</div>" +
              '<p class="field-hint">Sprites stay with this series under Art. Use Character / Background / UI so you can find them later.</p>' +
            "</aside>" +
          "</div>" +
          '<canvas id="pixelBuffer" hidden></canvas>' +
        "</div>"
      );
    }

    function bind() {
      canvas = rootEl.querySelector("#pixelBuffer");
      display = rootEl.querySelector("#pixelDisplay");
      resizeCanvas(64, 64, true);

      rootEl.querySelectorAll("[data-pixel-tool]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          state.tool = btn.getAttribute("data-pixel-tool");
          syncToolUi();
        });
      });

      rootEl.querySelectorAll("[data-pixel-swatch]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          state.color = btn.getAttribute("data-pixel-swatch");
          var colorInput = rootEl.querySelector("#pixelColor");
          if (colorInput) colorInput.value = state.color;
          syncToolUi();
        });
      });

      var colorInput = rootEl.querySelector("#pixelColor");
      if (colorInput) {
        colorInput.addEventListener("input", function () {
          state.color = colorInput.value;
          syncToolUi();
        });
      }

      function bindSizePreset(presetSel, numberSel) {
        var preset = rootEl.querySelector(presetSel);
        var number = rootEl.querySelector(numberSel);
        if (preset && number) {
          preset.addEventListener("change", function () {
            number.value = preset.value;
          });
        }
      }
      bindSizePreset("#pixelWidthPreset", "#pixelWidth");
      bindSizePreset("#pixelHeightPreset", "#pixelHeight");

      var applySize = rootEl.querySelector("#pixelApplySize");
      if (applySize) {
        applySize.addEventListener("click", function () {
          var w = rootEl.querySelector("#pixelWidth").value;
          var h = rootEl.querySelector("#pixelHeight").value;
          if (state.dirty && !window.confirm("Resize canvas? Artwork outside the new size may be cropped.")) return;
          pushUndo();
          resizeCanvas(w, h, false);
          state.dirty = true;
        });
      }

      var zoom = rootEl.querySelector("#pixelZoom");
      if (zoom) {
        zoom.addEventListener("input", function () {
          state.zoom = parseInt(zoom.value, 10) || 8;
          syncToolUi();
          paintDisplay();
        });
      }

    onWindowUp = function () {
      state.painting = false;
    };

    display.addEventListener("mousedown", function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      state.painting = state.tool === "pencil" || state.tool === "eraser";
      applyTool(e, true);
    });
    display.addEventListener("mousemove", function (e) {
      if (!state.painting) return;
      applyTool(e, false);
    });
    window.addEventListener("mouseup", onWindowUp);

      rootEl.querySelector("#pixelUndoBtn").addEventListener("click", function () {
        if (!state.undo.length) return;
        state.redo.push(canvas.toDataURL("image/png"));
        restoreFromDataUrl(state.undo.pop());
      });
      rootEl.querySelector("#pixelRedoBtn").addEventListener("click", function () {
        if (!state.redo.length) return;
        state.undo.push(canvas.toDataURL("image/png"));
        restoreFromDataUrl(state.redo.pop());
      });
      rootEl.querySelector("#pixelClearBtn").addEventListener("click", function () {
        pushUndo();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        state.dirty = true;
        paintDisplay();
      });
      rootEl.querySelector("#pixelNewBtn").addEventListener("click", function () {
        if (state.dirty && !window.confirm("Start a new canvas? Unsaved pixels will be lost.")) return;
        newCanvas();
      });
      rootEl.querySelector("#pixelSaveBtn").addEventListener("click", saveArt);
      rootEl.querySelector("#pixelDeleteBtn").addEventListener("click", deleteCurrent);

      rootEl.querySelectorAll("[data-art-filter]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          state.filter = btn.getAttribute("data-art-filter");
          rootEl.querySelectorAll("[data-art-filter]").forEach(function (b) {
            var on = b === btn;
            b.classList.toggle("is-active", on);
            b.classList.toggle("btn-ghost", !on);
          });
          renderFolderList();
        });
      });

      syncToolUi();
      renderFolderList();
    }

    rootEl.innerHTML = markup();
    bind();

    return {
      destroy: function () {
        state.painting = false;
        if (onWindowUp) window.removeEventListener("mouseup", onWindowUp);
        onWindowUp = null;
      },
    };
  }

  root.ScenaPixelArt = {
    mount: function (container, opts) {
      if (!container || !opts || !opts.series) return null;
      return createEditor({
        container: container,
        series: opts.series,
        userId: opts.userId,
        persist: opts.persist || function () { return Promise.resolve(); },
        toast: opts.toast,
      });
    },
  };
})(typeof window !== "undefined" ? window : this);
