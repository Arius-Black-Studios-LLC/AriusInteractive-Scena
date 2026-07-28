/**
 * Arleco Studio — simple pixel art editor + series art folder (with frames / onion skin).
 */
(function (root) {
  var PALETTE = [
    "#000000", "#ffffff", "#9b9b9b", "#e53935", "#fb8c00", "#fdd835",
    "#43a047", "#1e88e5", "#8e24aa", "#6d4c41", "#26c6da", "#f48fb1",
    "#90a4ae", "#c0ca33", "#5c6bc0", "#ff7043",
  ];

  var SIZE_PRESETS = [16, 24, 32, 48, 64, 96, 128, 160, 256];
  var MAX_BRUSH = 32;
  var MAX_FRAMES = 32;
  var ONION_PREV = "rgba(220, 40, 40, 1)";
  var ONION_NEXT = "rgba(40, 180, 70, 1)";
  var ONION_ALPHA = 0.32;
  var SHAPE_TOOLS = {
    line: 1,
    circle: 1,
    circlefill: 1,
    rect: 1,
    rectfill: 1,
  };

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

  function blankDataUrl(w, h) {
    var c = document.createElement("canvas");
    c.width = Math.max(1, w || 1);
    c.height = Math.max(1, h || 1);
    return c.toDataURL("image/png");
  }

  function createEditor(opts) {
    var series = opts.series || null;
    var userId = opts.userId;
    var persist = opts.persist;
    var toast = opts.toast || function () {};
    var rootEl = opts.container;
    var artApi = opts.artApi || null;

    function listArt(kind) {
      if (artApi && artApi.list) return artApi.list(kind);
      if (series) return ScenaStore.listArtFolder(series, kind === "all" ? null : kind);
      return ScenaStore.listUserArtFolder(userId, kind === "all" ? null : kind);
    }
    function getArt(id) {
      if (artApi && artApi.get) return artApi.get(id);
      if (series) return ScenaStore.getArtAsset(series, id);
      return ScenaStore.getUserArtAsset(userId, id);
    }
    function upsertArt(asset) {
      if (artApi && artApi.upsert) return artApi.upsert(asset);
      if (series) return ScenaStore.upsertArtAsset(series, asset);
      return ScenaStore.upsertUserArtAsset(userId, asset);
    }
    function removeArt(id) {
      if (artApi && artApi.remove) return artApi.remove(id);
      if (series) return ScenaStore.removeArtAsset(series, id);
      return ScenaStore.removeUserArtAsset(userId, id);
    }
    function storeImage(dataUrl, assetId) {
      if (artApi && artApi.storeImage) return artApi.storeImage(dataUrl, assetId);
      return ScenaStore.storePixelDataUrl(dataUrl, {
        purpose: "pixel-art",
        seriesId: (series && series.id) || "_pixel",
        assetId: assetId,
      });
    }
    function afterSave() {
      if (persist) return Promise.resolve(persist(series));
      return Promise.resolve();
    }

    var state = {
      tool: "pencil",
      color: "#000000",
      opacity: 100,
      brushSize: 1,
      width: 64,
      height: 64,
      zoom: 8,
      filter: "all",
      editingId: null,
      dirty: false,
      painting: false,
      shapeStart: null,
      strokeSnapshot: null,
      lastPaint: null,
      undo: [],
      redo: [],
      frames: [null],
      frameIndex: 0,
      frameDelay: 120,
      onionSkin: true,
      playing: false,
      playTimer: null,
    };

    var canvas;
    var ctx;
    var display;
    var onionScratch = null;
    var frameImgCache = {};
    var onWindowUp = null;

    function currentFrameDataUrl() {
      return canvas ? canvas.toDataURL("image/png") : blankDataUrl(state.width, state.height);
    }

    function commitCurrentFrame() {
      if (!canvas) return;
      state.frames[state.frameIndex] = currentFrameDataUrl();
      delete frameImgCache[state.frameIndex];
    }

    function ensureFrameSlot(i) {
      if (!state.frames[i]) {
        state.frames[i] = blankDataUrl(state.width, state.height);
      }
    }

    function loadFrameImage(index, dataUrl, cb) {
      if (!dataUrl) {
        if (cb) cb(null);
        return;
      }
      var cached = frameImgCache[index];
      if (cached && cached.src === dataUrl && cached.complete) {
        if (cb) cb(cached);
        return;
      }
      var img = new Image();
      img.onload = function () {
        frameImgCache[index] = img;
        if (cb) cb(img);
      };
      img.onerror = function () {
        if (cb) cb(null);
      };
      img.src = dataUrl;
    }

    function tintedOnion(sourceImg, cssW, cssH, tint) {
      if (!onionScratch) onionScratch = document.createElement("canvas");
      onionScratch.width = Math.max(1, Math.round(cssW));
      onionScratch.height = Math.max(1, Math.round(cssH));
      var octx = onionScratch.getContext("2d");
      octx.imageSmoothingEnabled = false;
      octx.clearRect(0, 0, onionScratch.width, onionScratch.height);
      octx.drawImage(sourceImg, 0, 0, onionScratch.width, onionScratch.height);
      octx.globalCompositeOperation = "source-atop";
      octx.fillStyle = tint;
      octx.fillRect(0, 0, onionScratch.width, onionScratch.height);
      octx.globalCompositeOperation = "source-over";
      return onionScratch;
    }

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
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        paintDisplay();
        if (done) done();
      };
      img.src = dataUrl || blankDataUrl(canvas.width, canvas.height);
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

      var showOnion = state.onionSkin && !state.playing && state.frames.length > 1;
      if (showOnion) {
        var prevIdx = state.frameIndex - 1;
        var nextIdx = state.frameIndex + 1;
        if (prevIdx >= 0 && state.frames[prevIdx]) {
          var prevImg = frameImgCache[prevIdx];
          if (prevImg && prevImg.complete) {
            dctx.globalAlpha = ONION_ALPHA;
            dctx.drawImage(tintedOnion(prevImg, cssW, cssH, ONION_PREV), 0, 0);
            dctx.globalAlpha = 1;
          } else {
            loadFrameImage(prevIdx, state.frames[prevIdx], function () { paintDisplay(); });
          }
        }
        if (nextIdx < state.frames.length && state.frames[nextIdx]) {
          var nextImg = frameImgCache[nextIdx];
          if (nextImg && nextImg.complete) {
            dctx.globalAlpha = ONION_ALPHA;
            dctx.drawImage(tintedOnion(nextImg, cssW, cssH, ONION_NEXT), 0, 0);
            dctx.globalAlpha = 1;
          } else {
            loadFrameImage(nextIdx, state.frames[nextIdx], function () { paintDisplay(); });
          }
        }
      }

      dctx.drawImage(canvas, 0, 0, cssW, cssH);

      if (state.zoom >= 6 && !state.playing) {
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

    function getPixel(x, y) {
      var img = ctx.getImageData(x, y, 1, 1);
      return { r: img.data[0], g: img.data[1], b: img.data[2], a: img.data[3] };
    }

    function currentRgba() {
      var c = hexToRgba(state.color);
      c.a = Math.max(0, Math.min(255, Math.round((state.opacity / 100) * 255)));
      return c;
    }

    function brushSize() {
      return Math.max(1, Math.min(MAX_BRUSH, parseInt(state.brushSize, 10) || 1));
    }

    function isShapeTool(tool) {
      return !!SHAPE_TOOLS[tool];
    }

    function colorsMatch(a, b) {
      return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
    }

    function withPixels(fn) {
      var w = canvas.width;
      var h = canvas.height;
      var data = ctx.getImageData(0, 0, w, h);
      var px = data.data;
      function write(x, y, rgba) {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        var o = (y * w + x) * 4;
        px[o] = rgba.r;
        px[o + 1] = rgba.g;
        px[o + 2] = rgba.b;
        px[o + 3] = rgba.a;
      }
      fn(write, w, h);
      ctx.putImageData(data, 0, 0);
    }

    function stampBrush(write, cx, cy, rgba) {
      var size = brushSize();
      var half = Math.floor(size / 2);
      var dy;
      var dx;
      for (dy = 0; dy < size; dy++) {
        for (dx = 0; dx < size; dx++) {
          write(cx - half + dx, cy - half + dy, rgba);
        }
      }
    }

    function plotLine(write, x0, y0, x1, y1, rgba) {
      var dx = Math.abs(x1 - x0);
      var dy = Math.abs(y1 - y0);
      var sx = x0 < x1 ? 1 : -1;
      var sy = y0 < y1 ? 1 : -1;
      var err = dx - dy;
      while (true) {
        stampBrush(write, x0, y0, rgba);
        if (x0 === x1 && y0 === y1) break;
        var e2 = err * 2;
        if (e2 > -dy) {
          err -= dy;
          x0 += sx;
        }
        if (e2 < dx) {
          err += dx;
          y0 += sy;
        }
      }
    }

    function plotRect(write, x0, y0, x1, y1, rgba, filled) {
      var minX = Math.min(x0, x1);
      var maxX = Math.max(x0, x1);
      var minY = Math.min(y0, y1);
      var maxY = Math.max(y0, y1);
      var x;
      var y;
      if (filled) {
        for (y = minY; y <= maxY; y++) {
          for (x = minX; x <= maxX; x++) write(x, y, rgba);
        }
        return;
      }
      for (x = minX; x <= maxX; x++) {
        stampBrush(write, x, minY, rgba);
        stampBrush(write, x, maxY, rgba);
      }
      for (y = minY; y <= maxY; y++) {
        stampBrush(write, minX, y, rgba);
        stampBrush(write, maxX, y, rgba);
      }
    }

    function plotCircle(write, cx, cy, x1, y1, rgba, filled) {
      var rx = x1 - cx;
      var ry = y1 - cy;
      var r = Math.round(Math.sqrt(rx * rx + ry * ry));
      var x;
      var y;
      if (r <= 0) {
        stampBrush(write, cx, cy, rgba);
        return;
      }
      if (filled) {
        var r2 = r * r;
        for (y = cy - r; y <= cy + r; y++) {
          for (x = cx - r; x <= cx + r; x++) {
            if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2) write(x, y, rgba);
          }
        }
        return;
      }
      var half = brushSize() / 2;
      var outer = r + half;
      var inner = Math.max(0, r - half);
      var outer2 = outer * outer;
      var inner2 = inner * inner;
      for (y = Math.floor(cy - outer); y <= Math.ceil(cy + outer); y++) {
        for (x = Math.floor(cx - outer); x <= Math.ceil(cx + outer); x++) {
          var d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
          if (d2 <= outer2 && d2 >= inner2) write(x, y, rgba);
        }
      }
    }

    function drawStrokeSegment(x0, y0, x1, y1, rgba) {
      withPixels(function (write) {
        plotLine(write, x0, y0, x1, y1, rgba);
      });
    }

    function drawShape(x0, y0, x1, y1) {
      var rgba = currentRgba();
      withPixels(function (write) {
        if (state.tool === "line") plotLine(write, x0, y0, x1, y1, rgba);
        else if (state.tool === "rect") plotRect(write, x0, y0, x1, y1, rgba, false);
        else if (state.tool === "rectfill") plotRect(write, x0, y0, x1, y1, rgba, true);
        else if (state.tool === "circle") plotCircle(write, x0, y0, x1, y1, rgba, false);
        else if (state.tool === "circlefill") plotCircle(write, x0, y0, x1, y1, rgba, true);
      });
    }

    function captureStrokeSnapshot() {
      state.strokeSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    function restoreStrokeSnapshot() {
      if (state.strokeSnapshot) ctx.putImageData(state.strokeSnapshot, 0, 0);
    }

    function clearStrokeState() {
      state.painting = false;
      state.shapeStart = null;
      state.strokeSnapshot = null;
      state.lastPaint = null;
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

    function pickColorAt(p) {
      var c = getPixel(p.x, p.y);
      if (c.a < 8) return;
      state.color = rgbaToHex(c.r, c.g, c.b);
      state.opacity = Math.max(0, Math.min(100, Math.round((c.a / 255) * 100)));
      var colorInput = rootEl.querySelector("#pixelColor");
      if (colorInput) colorInput.value = state.color;
      syncToolUi();
    }

    function beginPaint(e) {
      if (state.playing) stopPlayback();
      var p = pixelFromEvent(e);
      if (state.tool === "eyedropper") {
        pickColorAt(p);
        return;
      }
      pushUndo();
      state.dirty = true;
      if (state.tool === "fill") {
        floodFill(p.x, p.y, currentRgba());
        paintDisplay();
        renderTimeline();
        return;
      }
      if (isShapeTool(state.tool)) {
        state.painting = true;
        state.shapeStart = p;
        captureStrokeSnapshot();
        drawShape(p.x, p.y, p.x, p.y);
        paintDisplay();
        return;
      }
      state.painting = true;
      state.lastPaint = p;
      var paintColor = state.tool === "eraser" ? { r: 0, g: 0, b: 0, a: 0 } : currentRgba();
      drawStrokeSegment(p.x, p.y, p.x, p.y, paintColor);
      paintDisplay();
      renderTimeline();
    }

    function continuePaint(e) {
      if (!state.painting) return;
      var p = pixelFromEvent(e);
      if (isShapeTool(state.tool) && state.shapeStart) {
        restoreStrokeSnapshot();
        drawShape(state.shapeStart.x, state.shapeStart.y, p.x, p.y);
        paintDisplay();
        return;
      }
      if (!state.lastPaint) return;
      var paintColor = state.tool === "eraser" ? { r: 0, g: 0, b: 0, a: 0 } : currentRgba();
      drawStrokeSegment(state.lastPaint.x, state.lastPaint.y, p.x, p.y, paintColor);
      state.lastPaint = p;
      paintDisplay();
    }

    function endPaint() {
      if (!state.painting) return;
      clearStrokeState();
      renderTimeline();
    }

    function resizeAllFrames(w, h, clear) {
      w = Math.max(8, Math.min(512, parseInt(w, 10) || 64));
      h = Math.max(8, Math.min(512, parseInt(h, 10) || 64));
      commitCurrentFrame();
      state.width = w;
      state.height = h;
      canvas.width = w;
      canvas.height = h;
      ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingEnabled = false;

      if (clear) {
        state.frames = [blankDataUrl(w, h)];
        state.frameIndex = 0;
        frameImgCache = {};
        ctx.clearRect(0, 0, w, h);
        paintDisplay();
      } else {
        var nextFrames = state.frames.map(function (src) {
          var c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          var cctx = c.getContext("2d");
          cctx.imageSmoothingEnabled = false;
          if (!src) return c.toDataURL("image/png");
          return src;
        });
        // redraw each frame scaled into new size asynchronously then continue
        var pending = nextFrames.length;
        var rebuilt = new Array(nextFrames.length);
        nextFrames.forEach(function (src, i) {
          var img = new Image();
          img.onload = function () {
            var c = document.createElement("canvas");
            c.width = w;
            c.height = h;
            var cctx = c.getContext("2d");
            cctx.imageSmoothingEnabled = false;
            cctx.drawImage(img, 0, 0);
            rebuilt[i] = c.toDataURL("image/png");
            pending--;
            if (pending === 0) {
              state.frames = rebuilt;
              frameImgCache = {};
              restoreFromDataUrl(state.frames[state.frameIndex]);
              renderTimeline();
            }
          };
          img.onerror = function () {
            rebuilt[i] = blankDataUrl(w, h);
            pending--;
            if (pending === 0) {
              state.frames = rebuilt;
              frameImgCache = {};
              restoreFromDataUrl(state.frames[state.frameIndex]);
              renderTimeline();
            }
          };
          img.src = src || blankDataUrl(1, 1);
        });
      }

      var wInput = rootEl.querySelector("#pixelWidth");
      var hInput = rootEl.querySelector("#pixelHeight");
      if (wInput) wInput.value = String(w);
      if (hInput) hInput.value = String(h);
      renderTimeline();
    }

    function goToFrame(index) {
      if (index < 0 || index >= state.frames.length) return;
      if (index === state.frameIndex) return;
      if (state.playing) stopPlayback();
      commitCurrentFrame();
      state.frameIndex = index;
      state.undo = [];
      state.redo = [];
      ensureFrameSlot(index);
      restoreFromDataUrl(state.frames[index]);
      renderTimeline();
      preloadOnionNeighbors();
    }

    function preloadOnionNeighbors() {
      var prev = state.frameIndex - 1;
      var next = state.frameIndex + 1;
      if (prev >= 0) loadFrameImage(prev, state.frames[prev], function () { paintDisplay(); });
      if (next < state.frames.length) loadFrameImage(next, state.frames[next], function () { paintDisplay(); });
    }

    function addFrame(afterIndex) {
      if (state.frames.length >= MAX_FRAMES) {
        toast("Max " + MAX_FRAMES + " frames.");
        return;
      }
      if (state.playing) stopPlayback();
      commitCurrentFrame();
      var insertAt = (afterIndex != null ? afterIndex : state.frameIndex) + 1;
      state.frames.splice(insertAt, 0, blankDataUrl(state.width, state.height));
      frameImgCache = {};
      state.frameIndex = insertAt;
      state.undo = [];
      state.redo = [];
      state.dirty = true;
      restoreFromDataUrl(state.frames[insertAt]);
      renderTimeline();
      preloadOnionNeighbors();
    }

    function duplicateFrame() {
      if (state.frames.length >= MAX_FRAMES) {
        toast("Max " + MAX_FRAMES + " frames.");
        return;
      }
      if (state.playing) stopPlayback();
      commitCurrentFrame();
      var copy = state.frames[state.frameIndex];
      state.frames.splice(state.frameIndex + 1, 0, copy);
      frameImgCache = {};
      state.frameIndex += 1;
      state.undo = [];
      state.redo = [];
      state.dirty = true;
      restoreFromDataUrl(state.frames[state.frameIndex]);
      renderTimeline();
      preloadOnionNeighbors();
    }

    function deleteFrame() {
      if (state.frames.length <= 1) {
        pushUndo();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        state.frames[0] = currentFrameDataUrl();
        state.dirty = true;
        paintDisplay();
        renderTimeline();
        return;
      }
      if (state.playing) stopPlayback();
      state.frames.splice(state.frameIndex, 1);
      frameImgCache = {};
      if (state.frameIndex >= state.frames.length) state.frameIndex = state.frames.length - 1;
      state.undo = [];
      state.redo = [];
      state.dirty = true;
      restoreFromDataUrl(state.frames[state.frameIndex]);
      renderTimeline();
      preloadOnionNeighbors();
    }

    function stopPlayback() {
      state.playing = false;
      if (state.playTimer) {
        clearInterval(state.playTimer);
        state.playTimer = null;
      }
      var playBtn = rootEl.querySelector("#pixelPlayBtn");
      if (playBtn) playBtn.textContent = "Play";
      // restore editing frame (may have advanced during play)
      ensureFrameSlot(state.frameIndex);
      restoreFromDataUrl(state.frames[state.frameIndex]);
      renderTimeline();
    }

    function togglePlayback() {
      if (state.playing) {
        stopPlayback();
        return;
      }
      if (state.frames.length < 2) {
        toast("Add another frame to play an animation.");
        return;
      }
      commitCurrentFrame();
      state.playing = true;
      var playBtn = rootEl.querySelector("#pixelPlayBtn");
      if (playBtn) playBtn.textContent = "Stop";
      state.playTimer = setInterval(function () {
        state.frameIndex = (state.frameIndex + 1) % state.frames.length;
        restoreFromDataUrl(state.frames[state.frameIndex]);
        renderTimeline();
      }, Math.max(40, state.frameDelay || 120));
      renderTimeline();
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
      var brushLabel = rootEl.querySelector("#pixelBrushVal");
      if (brushLabel) brushLabel.textContent = String(brushSize()) + "px";
      var brushInput = rootEl.querySelector("#pixelBrushSize");
      if (brushInput) brushInput.value = String(brushSize());
      var opacityLabel = rootEl.querySelector("#pixelOpacityVal");
      if (opacityLabel) opacityLabel.textContent = String(state.opacity) + "%";
      var opacityInput = rootEl.querySelector("#pixelOpacity");
      if (opacityInput) opacityInput.value = String(state.opacity);
      var colorInput = rootEl.querySelector("#pixelColor");
      if (colorInput) colorInput.value = state.color;
      var onionToggle = rootEl.querySelector("#pixelOnionToggle");
      if (onionToggle) onionToggle.checked = !!state.onionSkin;
      var delayInput = rootEl.querySelector("#pixelFrameDelay");
      if (delayInput) delayInput.value = String(state.frameDelay);
      var frameLabel = rootEl.querySelector("#pixelFrameLabel");
      if (frameLabel) {
        frameLabel.textContent = "Frame " + (state.frameIndex + 1) + " / " + state.frames.length;
      }
    }

    function renderTimeline() {
      syncToolUi();
      var strip = rootEl.querySelector("#pixelFrameStrip");
      if (!strip) return;
      commitCurrentFrame();
      strip.innerHTML = state.frames.map(function (src, i) {
        return (
          '<button type="button" class="pixel-frame-thumb' + (i === state.frameIndex ? " is-active" : "") +
            '" data-frame-index="' + i + '" title="Frame ' + (i + 1) + '">' +
            '<span class="pixel-frame-thumb-img" style="background-image:url(' + escapeAttr(src || "") + ')"></span>' +
            '<span class="pixel-frame-thumb-num">' + (i + 1) + "</span>" +
          "</button>"
        );
      }).join("");
      strip.querySelectorAll("[data-frame-index]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          goToFrame(parseInt(btn.getAttribute("data-frame-index"), 10));
        });
      });
    }

    function renderFolderList() {
      var list = rootEl.querySelector("#pixelArtList");
      if (!list) return;
      var items = listArt(state.filter === "all" ? "all" : state.filter);
      if (!items.length) {
        list.innerHTML = '<p class="field-hint pixel-art-empty">No sprites in this folder yet. Draw something and save it.</p>';
        return;
      }
      list.innerHTML = items.map(function (item) {
        var frameCount = (item.frames && item.frames.length) || 1;
        var meta = escapeHtml(kindLabel(item.kind)) + " · " + item.width + "×" + item.height +
          (frameCount > 1 ? " · " + frameCount + " frames" : "");
        return (
          '<button type="button" class="pixel-art-item' + (state.editingId === item.id ? " is-active" : "") +
            '" data-art-id="' + escapeAttr(item.id) + '">' +
            '<span class="pixel-art-thumb" style="background-image:url(' + escapeAttr(item.dataUrl) + ')"></span>' +
            "<span class=\"pixel-art-meta\">" +
              "<strong>" + escapeHtml(item.name) + "</strong>" +
              "<span>" + meta + "</span>" +
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
      var item = getArt(id);
      if (!item || !item.dataUrl) return;
      if (state.playing) stopPlayback();
      state.editingId = item.id;
      state.dirty = false;
      state.undo = [];
      state.redo = [];
      state.frameDelay = item.frameDelay || 120;
      state.width = item.width || 64;
      state.height = item.height || 64;
      canvas.width = state.width;
      canvas.height = state.height;
      ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingEnabled = false;
      var frames = (item.frames && item.frames.length) ? item.frames.slice() : [item.dataUrl];
      state.frames = frames.map(function (f) { return f || blankDataUrl(state.width, state.height); });
      state.frameIndex = 0;
      frameImgCache = {};
      restoreFromDataUrl(state.frames[0]);
      var nameInput = rootEl.querySelector("#pixelName");
      var kindInput = rootEl.querySelector("#pixelKind");
      if (nameInput) nameInput.value = item.name || "";
      if (kindInput) kindInput.value = item.kind || "character";
      var wInput = rootEl.querySelector("#pixelWidth");
      var hInput = rootEl.querySelector("#pixelHeight");
      if (wInput) wInput.value = String(state.width);
      if (hInput) hInput.value = String(state.height);
      renderFolderList();
      renderTimeline();
      preloadOnionNeighbors();
      toast("Loaded “" + item.name + "”");
    }

    function newCanvas() {
      if (state.playing) stopPlayback();
      state.editingId = null;
      state.dirty = false;
      state.undo = [];
      state.redo = [];
      state.frames = [blankDataUrl(state.width, state.height)];
      state.frameIndex = 0;
      frameImgCache = {};
      resizeAllFrames(state.width, state.height, true);
      var nameInput = rootEl.querySelector("#pixelName");
      if (nameInput) nameInput.value = "";
      renderFolderList();
      renderTimeline();
    }

    function saveArt() {
      if (state.playing) stopPlayback();
      commitCurrentFrame();
      var nameInput = rootEl.querySelector("#pixelName");
      var kindInput = rootEl.querySelector("#pixelKind");
      var name = (nameInput && nameInput.value.trim()) || "Untitled sprite";
      var kind = (kindInput && kindInput.value) || "character";
      var btn = rootEl.querySelector("#pixelSaveBtn");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Saving…";
      }
      var baseId = state.editingId || ("art_" + Date.now().toString(36));
      var uploads = state.frames.map(function (frameUrl, i) {
        return storeImage(frameUrl, baseId + "-f" + i);
      });
      Promise.all(uploads).then(function (urls) {
        var saved = upsertArt({
          id: state.editingId || baseId,
          name: name,
          kind: kind,
          width: canvas.width,
          height: canvas.height,
          dataUrl: urls[0],
          frames: urls,
          frameDelay: state.frameDelay,
        });
        state.editingId = saved.id;
        state.frames = urls.slice();
        state.dirty = false;
        frameImgCache = {};
        return afterSave().then(function () {
          renderFolderList();
          renderTimeline();
          toast(urls.length > 1 ? "Saved " + urls.length + " frames to Art folder." : "Saved to Art folder.");
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
      if (state.playing) stopPlayback();
      removeArt(state.editingId);
      afterSave().then(function () {
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
              '<p class="page-lead">Draw pixel sprites and short animations for any project. Onion skin shows the previous frame in red and the next in green. Saved art lives in your Pixel editor library.</p>' +
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
            '<div class="pixel-art-center">' +
              '<div class="pixel-art-stage-wrap">' +
                '<div class="pixel-art-stage" id="pixelStage">' +
                  '<canvas id="pixelDisplay" class="pixel-art-display"></canvas>' +
                "</div>" +
              "</div>" +
              '<div class="pixel-anim-bar">' +
                '<div class="pixel-anim-controls">' +
                  '<span class="pixel-frame-label" id="pixelFrameLabel">Frame 1 / 1</span>' +
                  '<button type="button" class="btn btn-sm btn-ghost" id="pixelPrevFrameBtn" title="Previous frame">‹</button>' +
                  '<button type="button" class="btn btn-sm btn-ghost" id="pixelNextFrameBtn" title="Next frame">›</button>' +
                  '<button type="button" class="btn btn-sm btn-secondary" id="pixelAddFrameBtn">Add frame</button>' +
                  '<button type="button" class="btn btn-sm btn-ghost" id="pixelDupFrameBtn">Duplicate</button>' +
                  '<button type="button" class="btn btn-sm btn-ghost" id="pixelDelFrameBtn">Delete frame</button>' +
                  '<button type="button" class="btn btn-sm btn-primary" id="pixelPlayBtn">Play</button>' +
                  '<label class="pixel-onion-label field-inline">' +
                    '<input type="checkbox" id="pixelOnionToggle" checked> Onion skin' +
                  "</label>" +
                  '<label class="pixel-delay-label">Delay' +
                    '<input type="number" id="pixelFrameDelay" min="40" max="1000" step="10" value="120"> ms' +
                  "</label>" +
                "</div>" +
                '<div class="pixel-onion-legend" aria-hidden="true">' +
                  '<span class="pixel-onion-prev">Prev (red)</span>' +
                  '<span class="pixel-onion-next">Next (green)</span>' +
                "</div>" +
                '<div class="pixel-frame-strip" id="pixelFrameStrip"></div>' +
              "</div>" +
            "</div>" +
            '<aside class="pixel-art-tools" aria-label="Tools">' +
              '<p class="game-ui-pane-label">Tools</p>' +
              '<div class="pixel-tool-row" id="pixelToolRow">' +
                '<button type="button" class="btn btn-sm is-active" data-pixel-tool="pencil">Pencil</button>' +
                '<button type="button" class="btn btn-sm btn-ghost" data-pixel-tool="eraser">Eraser</button>' +
                '<button type="button" class="btn btn-sm btn-ghost" data-pixel-tool="fill">Fill</button>' +
                '<button type="button" class="btn btn-sm btn-ghost" data-pixel-tool="eyedropper">Eyedrop</button>' +
                '<button type="button" class="btn btn-sm btn-ghost" data-pixel-tool="line">Line</button>' +
                '<button type="button" class="btn btn-sm btn-ghost" data-pixel-tool="circlefill">Circle</button>' +
                '<button type="button" class="btn btn-sm btn-ghost" data-pixel-tool="circle">Circle ○</button>' +
                '<button type="button" class="btn btn-sm btn-ghost" data-pixel-tool="rectfill">Box</button>' +
                '<button type="button" class="btn btn-sm btn-ghost" data-pixel-tool="rect">Box □</button>' +
              "</div>" +
              '<div class="field pixel-brush-field"><label>Brush size <span id="pixelBrushVal">1px</span></label>' +
                '<input type="range" id="pixelBrushSize" min="1" max="' + MAX_BRUSH + '" step="1" value="1">' +
                '<p class="field-hint">Pencil, eraser, line, and stroke shapes use this size.</p>' +
              "</div>" +
              '<div class="field"><label>Color</label>' +
                '<div class="pixel-color-row">' +
                  '<div class="pixel-color-controls">' +
                    '<input type="color" id="pixelColor" value="#000000">' +
                    '<div class="field pixel-opacity-field"><label>Opacity <span id="pixelOpacityVal">100%</span></label>' +
                      '<input type="range" id="pixelOpacity" min="0" max="100" step="1" value="100">' +
                    "</div>" +
                  "</div>" +
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
                '<input type="text" id="pixelName" maxlength="80" placeholder="e.g. hero_walk">' +
              "</div>" +
              '<div class="field"><label>Type</label>' +
                '<select id="pixelKind">' + kinds + "</select>" +
              "</div>" +
              '<div class="modal-actions" style="justify-content:flex-start;margin-top:8px">' +
                '<button type="button" class="btn btn-primary" id="pixelSaveBtn">Save to Art folder</button>' +
                '<button type="button" class="btn btn-ghost btn-sm" id="pixelDeleteBtn">Delete</button>' +
              "</div>" +
              '<p class="field-hint">Multi-frame sprites save as short animations in the Art folder. Drag shape tools from start to end to draw.</p>' +
            "</aside>" +
          "</div>" +
          '<canvas id="pixelBuffer" hidden></canvas>' +
        "</div>"
      );
    }

    function bind() {
      canvas = rootEl.querySelector("#pixelBuffer");
      display = rootEl.querySelector("#pixelDisplay");
      state.frames = [blankDataUrl(64, 64)];
      resizeAllFrames(64, 64, true);

      rootEl.querySelectorAll("[data-pixel-tool]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          state.tool = btn.getAttribute("data-pixel-tool");
          rootEl.querySelectorAll("[data-pixel-tool]").forEach(function (b) {
            var on = b === btn;
            b.classList.toggle("is-active", on);
            b.classList.toggle("btn-ghost", !on);
          });
        });
      });

      rootEl.querySelectorAll("[data-pixel-swatch]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          state.color = btn.getAttribute("data-pixel-swatch");
          state.opacity = 100;
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

      var opacity = rootEl.querySelector("#pixelOpacity");
      if (opacity) {
        opacity.addEventListener("input", function () {
          state.opacity = Math.max(0, Math.min(100, parseInt(opacity.value, 10) || 0));
          syncToolUi();
        });
      }

      var brush = rootEl.querySelector("#pixelBrushSize");
      if (brush) {
        brush.addEventListener("input", function () {
          state.brushSize = Math.max(1, Math.min(MAX_BRUSH, parseInt(brush.value, 10) || 1));
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
          if (state.dirty && !window.confirm("Resize canvas? All frames will be resized.")) return;
          pushUndo();
          resizeAllFrames(w, h, false);
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
        endPaint();
      };

      display.addEventListener("mousedown", function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        beginPaint(e);
      });
      display.addEventListener("mousemove", function (e) {
        continuePaint(e);
      });
      window.addEventListener("mouseup", onWindowUp);

      rootEl.querySelector("#pixelUndoBtn").addEventListener("click", function () {
        if (!state.undo.length) return;
        state.redo.push(canvas.toDataURL("image/png"));
        restoreFromDataUrl(state.undo.pop());
        state.dirty = true;
      });
      rootEl.querySelector("#pixelRedoBtn").addEventListener("click", function () {
        if (!state.redo.length) return;
        state.undo.push(canvas.toDataURL("image/png"));
        restoreFromDataUrl(state.redo.pop());
        state.dirty = true;
      });
      rootEl.querySelector("#pixelClearBtn").addEventListener("click", function () {
        pushUndo();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        state.dirty = true;
        paintDisplay();
        renderTimeline();
      });
      rootEl.querySelector("#pixelNewBtn").addEventListener("click", function () {
        if (state.dirty && !window.confirm("Start a new canvas? Unsaved pixels will be lost.")) return;
        newCanvas();
      });
      rootEl.querySelector("#pixelSaveBtn").addEventListener("click", saveArt);
      rootEl.querySelector("#pixelDeleteBtn").addEventListener("click", deleteCurrent);

      rootEl.querySelector("#pixelAddFrameBtn").addEventListener("click", function () { addFrame(); });
      rootEl.querySelector("#pixelDupFrameBtn").addEventListener("click", duplicateFrame);
      rootEl.querySelector("#pixelDelFrameBtn").addEventListener("click", deleteFrame);
      rootEl.querySelector("#pixelPrevFrameBtn").addEventListener("click", function () {
        goToFrame(Math.max(0, state.frameIndex - 1));
      });
      rootEl.querySelector("#pixelNextFrameBtn").addEventListener("click", function () {
        goToFrame(Math.min(state.frames.length - 1, state.frameIndex + 1));
      });
      rootEl.querySelector("#pixelPlayBtn").addEventListener("click", togglePlayback);
      rootEl.querySelector("#pixelOnionToggle").addEventListener("change", function (e) {
        state.onionSkin = !!e.target.checked;
        paintDisplay();
      });
      rootEl.querySelector("#pixelFrameDelay").addEventListener("change", function (e) {
        state.frameDelay = Math.max(40, Math.min(1000, parseInt(e.target.value, 10) || 120));
        e.target.value = String(state.frameDelay);
        state.dirty = true;
        if (state.playing) {
          stopPlayback();
          togglePlayback();
        }
      });

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
      renderTimeline();
      preloadOnionNeighbors();
    }

    rootEl.innerHTML = markup();
    bind();

    return {
      destroy: function () {
        clearStrokeState();
        if (state.playTimer) clearInterval(state.playTimer);
        state.playTimer = null;
        if (onWindowUp) window.removeEventListener("mouseup", onWindowUp);
        onWindowUp = null;
      },
    };
  }

  root.ScenaPixelArt = {
    mount: function (container, opts) {
      if (!container || !opts) return null;
      return createEditor({
        container: container,
        series: opts.series || null,
        userId: opts.userId,
        artApi: opts.artApi || null,
        persist: opts.persist || function () { return Promise.resolve(); },
        toast: opts.toast,
      });
    },
  };
})(typeof window !== "undefined" ? window : this);
