/**
 * Arleco graph editor — Unity-style workspace: inspector | preview+graph | resources
 */
(function () {
  function uid(prefix) {
    return (prefix || "n") + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  function eventClientXY(e) {
    if (e.touches && e.touches.length) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if (e.changedTouches && e.changedTouches.length) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  function pinchDistance(touches) {
    if (!touches || touches.length < 2) return 0;
    var dx = touches[1].clientX - touches[0].clientX;
    var dy = touches[1].clientY - touches[0].clientY;
    return Math.hypot(dx, dy);
  }

  function isoToLocalDatetimeInput(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" +
      pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function localDatetimeToIso(value) {
    if (!value) return null;
    var d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  function formatPublishWhen(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function ScenaGraphEditor(container, options) {
    options = options || {};
    this.container = container;
    this.series = options.series;
    ScenaStore.normalizeSeries(this.series);
    this.onChange = options.onChange || function () { return { ok: true }; };
    this.onSaveError = options.onSaveError || function () {};
    this.onEpisodePublished = options.onEpisodePublished || null;
    this.feedbackUserId = options.feedbackUserId || null;
    this.feedbackProfile = options.feedbackProfile || null;
    this.feedbackContainer = options.feedbackContainer || null;
    this.learnMode = !!options.learnMode;
    this.learnValidate = options.learnValidate || null;
    this.onLearnChange = options.onLearnChange || null;
    this.learnHighlightPorts = options.learnHighlightPorts || null;
    this.learnResourcesTab = options.learnResourcesTab || null;
    this.learnPreviewPlay = !!options.learnPreviewPlay;
    this.learnEpisodes = !!options.learnEpisodes;
    this.learnSoundSettings = !!options.learnSoundSettings;
    this.learnKeyItemsPanel = !!options.learnKeyItemsPanel;
    this.learnSidePanel = this.learnSoundSettings || this.learnKeyItemsPanel;
    this.selectedId = null;
    this.selectedEdgeId = null;
    this.resourceTab = this.learnSoundSettings
      ? "audio"
      : (this.learnKeyItemsPanel ? "keyitems" : (this.learnResourcesTab || "characters"));
    this.selectedResourceId = null;
    this.connectFrom = null;
    this.connectChoiceId = null;
    this.tempLine = null;
    this.connectFromPort = null;
    this.connectDragActive = false;
    this.pan = { x: 40, y: 40 };
    this.zoom = 1;
    this.isPanning = false;
    this.panStart = null;
    this.pinchState = null;
    this.ignoreMouseUntil = 0;
    this.mobileDrawer = null;
    this.pendingNodePointer = null;
    this.dragNode = null;
    this.dragStart = null;
    this.dragEl = null;
    this.previewRatio = 0.42;
    this.isResizingCenter = false;
    this.isDirty = false;
    this.boundaryPlacementMode = false;
    this.dragBoundary = null;
    this.selectedBoundaryId = null;
    this.unlockedEpisodeEdits = {};
    this.playMode = false;
    this.playNodeId = null;
    this.playMetrics = null;
    this.playKeyItems = null;
    this.playEnded = false;
    this.playEndMessage = "";
    this.playEpisodeId = null;
    this.playChoicesMade = [];
    this.previewDialogueLog = [];
    this.readerMenu = null;
    this.currentBgmAssetId = null;
    this.blockDragGhost = null;
    try {
      this.parallaxEnabled = localStorage.getItem("scena.previewParallax") !== "0";
    } catch (e) {
      this.parallaxEnabled = true;
    }
    this.boundMove = this.onMouseMove.bind(this);
    this.boundUp = this.onMouseUp.bind(this);
    this.boundTouchMove = this.onTouchMove.bind(this);
    this.boundTouchEnd = this.onTouchEnd.bind(this);
    this.boundConnectMove = this.onConnectMove.bind(this);
    this.boundConnectUp = this.onConnectUp.bind(this);
    this.renderShell();
    if (this.wrap) this.bindCanvasEvents();
    if (!this.learnMode) {
      this.bindCenterResizer();
      this.bindGlobalKeys();
      this.applyCenterSplit();
      this.applyPreviewUi();
    } else if (this.learnPreviewPlay) {
      this.bindCenterResizer();
      this.bindGlobalKeys();
      this.applyCenterSplit();
    }
    this.paintAll();
    if (this.learnSidePanel) {
      this.renderResourcesPanel();
    }
    if (this.learnMode) this.notifyLearnChange();
  }

  ScenaGraphEditor.prototype.getBlockCatalog = function () {
    return [
      { category: "Story", spawn: "dialogue", label: "Dialogue", hint: "Single scene line — wire Next to continue", icon: "▭", tone: "dialogue" },
      { category: "Story", spawn: "choice", label: "Choices", hint: "Branching options — gate each path by metric or prior choice", icon: "⑂", tone: "choice" },
      { category: "Metrics", spawn: "logic", label: "Metrics", hint: "Adjust a score or tally — auto-advances", icon: "◎", tone: "logic" },
      { category: "Inventory", spawn: "key-item", label: "Key item", hint: "Grant or take a unique item — auto-advances", icon: "◆", tone: "key-item" },
      { category: "Routing", spawn: "flow-gate", label: "Flow gate", hint: "Silent if/else routing — stack checks, no scene change", icon: "⎇", tone: "flow-gate" },
    ];
  };

  ScenaGraphEditor.prototype.nodeSpawnOffset = function (spawnType) {
    if (spawnType === "logic" || spawnType === "key-item") return { width: 120, height: 88 };
    if (spawnType === "flow-gate" || spawnType === "choice-router" || spawnType === "metric-router" || spawnType === "router") {
      return { width: 240, height: 120 };
    }
    return { width: 220, height: 88 };
  };

  ScenaGraphEditor.prototype.renderBlockShelfMarkup = function () {
    var catalog = this.getBlockCatalog();
    var groups = {};
    catalog.forEach(function (block) {
      if (!groups[block.category]) groups[block.category] = [];
      groups[block.category].push(block);
    });
    var html = '<div class="block-shelf-head">' +
      '<h3 class="block-shelf-title">Blocks</h3>' +
      '<p class="block-shelf-lede">Drag onto the graph, then wire Cue plugs.</p>' +
      '</div><div class="block-shelf-scroll">';
    Object.keys(groups).forEach(function (category) {
      html += '<div class="block-shelf-group"><p class="block-shelf-group-label">' + escapeHtml(category) + '</p><div class="block-shelf-items">';
      groups[category].forEach(function (block) {
        html += '<button type="button" class="block-shelf-item block-shelf-item--' + escapeAttr(block.tone) + '" data-block-spawn="' + escapeAttr(block.spawn) + '" title="' + escapeAttr(block.hint) + '">' +
          '<span class="block-shelf-icon" aria-hidden="true">' + escapeHtml(block.icon) + '</span>' +
          '<span class="block-shelf-copy">' +
            '<span class="block-shelf-label">' + escapeHtml(block.label) + '</span>' +
            '<span class="block-shelf-hint">' + escapeHtml(block.hint) + '</span>' +
          '</span></button>';
      });
      html += '</div></div>';
    });
    html += '</div>';
    return html;
  };

  ScenaGraphEditor.prototype.renderSpawnMenuMarkup = function () {
    var catalog = this.getBlockCatalog();
    var groups = {};
    catalog.forEach(function (block) {
      if (!groups[block.category]) groups[block.category] = [];
      groups[block.category].push(block);
    });
    var html = '<p class="spawn-menu-label">Add &amp; connect</p>';
    Object.keys(groups).forEach(function (category) {
      html += '<div class="spawn-menu-group"><p class="spawn-menu-group-label">' + escapeHtml(category) + '</p>';
      groups[category].forEach(function (block) {
        html += '<button type="button" class="spawn-menu-item spawn-menu-item--' + escapeAttr(block.tone) + '" data-spawn="' + escapeAttr(block.spawn) + '" title="' + escapeAttr(block.hint) + '">' +
          '<span class="spawn-menu-icon">' + escapeHtml(block.icon) + '</span>' +
          '<span>' + escapeHtml(block.label) + '</span></button>';
      });
      html += '</div>';
    });
    return html;
  };

  ScenaGraphEditor.prototype.renderBlockShelf = function () {
    if (!this.blockShelf) return;
    this.blockShelf.innerHTML = this.renderBlockShelfMarkup();
    this.bindBlockShelf();
  };

  ScenaGraphEditor.prototype.renderSpawnMenu = function () {
    if (!this.spawnMenu) return;
    this.spawnMenu.innerHTML = this.renderSpawnMenuMarkup();
    this.bindSpawnMenu();
  };

  ScenaGraphEditor.prototype.blockShelfPrefKey = function () {
    return "scena.blockShelfOpen." + (this.series && this.series.id ? this.series.id : "default");
  };

  ScenaGraphEditor.prototype.applyBlockShelfState = function (open, opts) {
    opts = opts || {};
    var centerGraph = this.container.querySelector(".center-graph");
    if (!this.blockShelf || !this.blockShelfToggle || !centerGraph) return;
    this.blockShelfOpen = !!open;
    centerGraph.classList.toggle("is-block-shelf-open", this.blockShelfOpen);
    this.blockShelf.classList.toggle("block-shelf--collapsed", !this.blockShelfOpen);
    this.blockShelfToggle.setAttribute("aria-expanded", this.blockShelfOpen ? "true" : "false");
    this.blockShelfToggle.title = this.blockShelfOpen ? "Hide block palette" : "Show block palette";
    var icon = this.blockShelfToggle.querySelector(".block-shelf-toggle-icon");
    if (icon) icon.textContent = this.blockShelfOpen ? "◂" : "▸";
    if (!this.isMobileLayout()) {
      try {
        localStorage.setItem(this.blockShelfPrefKey(), this.blockShelfOpen ? "1" : "0");
      } catch (e) { /* ignore */ }
    }
    if (!opts.skipChrome && this.isMobileLayout()) {
      this.mobileDrawer = this.blockShelfOpen ? "blocks" : (this.mobileDrawer === "blocks" ? null : this.mobileDrawer);
      this.syncMobileChrome();
    }
  };

  ScenaGraphEditor.prototype.bindBlockShelfToggle = function () {
    var self = this;
    if (this.learnMode) return;
    this.blockShelfToggle = this.container.querySelector("#blockShelfToggle");
    if (!this.blockShelfToggle || this.blockShelfToggle.dataset.bound === "1") return;
    this.blockShelfToggle.dataset.bound = "1";
    var stored = null;
    try { stored = localStorage.getItem(this.blockShelfPrefKey()); } catch (e) { /* ignore */ }
    if (this.isMobileLayout()) {
      this.applyBlockShelfState(false, { skipChrome: true });
    } else {
      this.applyBlockShelfState(stored === "1");
    }
    this.blockShelfToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      if (self.isMobileLayout()) {
        self.setMobileDrawer(self.mobileDrawer === "blocks" ? null : "blocks");
      } else {
        self.applyBlockShelfState(!self.blockShelfOpen);
      }
    });
  };

  ScenaGraphEditor.prototype.bindSpawnMenu = function () {
    var self = this;
    if (!this.spawnMenu) return;
    this.spawnMenu.querySelectorAll("[data-spawn]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        self.spawnConnectedNode(btn.getAttribute("data-spawn"));
      });
    });
  };

  ScenaGraphEditor.prototype.bindBlockShelf = function () {
    var self = this;
    if (!this.blockShelf) return;
    this.blockShelf.querySelectorAll("[data-block-spawn]").forEach(function (el) {
      function startFromPointer(e, clientX, clientY) {
        e.preventDefault();
        self.startBlockPaletteDrag(el.getAttribute("data-block-spawn"), clientX, clientY, el);
      }
      el.addEventListener("mousedown", function (e) {
        if (self.shouldIgnoreMouse()) return;
        if (e.button !== 0) return;
        startFromPointer(e, e.clientX, e.clientY);
      });
      el.addEventListener("touchstart", function (e) {
        if (e.touches.length !== 1) return;
        self.markTouchPointer();
        startFromPointer(e, e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: false });
    });
  };

  ScenaGraphEditor.prototype.startBlockPaletteDrag = function (spawnType, clientX, clientY, sourceEl) {
    var self = this;
    var labelEl = sourceEl && sourceEl.querySelector(".block-shelf-label");
    var ghost = document.createElement("div");
    ghost.className = "block-drag-ghost";
    ghost.textContent = labelEl ? labelEl.textContent : spawnType;
    document.body.appendChild(ghost);
    this.blockDragGhost = ghost;

    var move = function (e) {
      if (e.touches) e.preventDefault();
      var pt = eventClientXY(e);
      ghost.style.transform = "translate(" + (pt.x + 12) + "px," + (pt.y + 12) + "px)";
    };
    var up = function (e) {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", up);
      document.removeEventListener("touchcancel", up);
      if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
      self.blockDragGhost = null;
      var wrap = self.wrap;
      var pt = eventClientXY(e);
      if (wrap) {
        var rect = wrap.getBoundingClientRect();
        if (pt.x >= rect.left && pt.x <= rect.right && pt.y >= rect.top && pt.y <= rect.bottom) {
          var canvasPt = self.clientToCanvas(pt.x, pt.y);
          var size = self.nodeSpawnOffset(spawnType);
          var newId = self.addNodeAt(spawnType, canvasPt.x - size.width / 2, canvasPt.y - size.height / 2);
          if (self.connectFrom) {
            self.completeConnect(newId);
          } else {
            self.selectNode(newId);
          }
          if (!self.learnMode) self.markDirty();
          else self.notifyLearnChange();
          if (self.isMobileLayout()) self.setMobileDrawer(null);
        } else if (self.connectFrom) {
          self.cancelConnect();
        }
      }
    };

    move({ clientX: clientX, clientY: clientY });
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", up);
    document.addEventListener("touchcancel", up);
  };

  ScenaGraphEditor.prototype.workspaceResourceModalMarkup = function () {
    return '<div class="workspace-modal-backdrop" id="workspaceModal" hidden>' +
      '<div class="modal" role="dialog">' +
        '<h2 id="workspaceModalTitle">Create</h2>' +
        '<div id="workspaceModalBody"></div>' +
        '<div class="modal-actions">' +
          '<button type="button" class="btn" id="workspaceModalCancel">Cancel</button>' +
          '<button type="button" class="btn btn-primary" id="workspaceModalSave">Create</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  };

  ScenaGraphEditor.prototype.episodeEditorModalMarkup = function () {
    return '<div class="workspace-modal-backdrop" id="episodeEditorModal" hidden>' +
      '<div class="modal" role="dialog" aria-labelledby="episodeEditorHeading">' +
        '<h2 id="episodeEditorHeading">Episode details</h2>' +
        '<p class="field-hint">Everything inside the shaded box belongs to this chapter. Drag connections from the <strong>previous chapter\'s ending beat(s)</strong> into this region — those targets become <strong>CH.N IN</strong> entry beats. Different endings can lead to different chapter openings.</p>' +
        '<div class="field"><label>Episode title</label><input type="text" id="episodeEditorTitle" placeholder="Episode 1"></div>' +
        '<div class="field"><label>Short description</label><textarea id="episodeEditorBlurb" rows="2" placeholder="What readers see in the episode list"></textarea></div>' +
        '<div class="field"><label>Thumbnail</label>' +
          '<div class="episode-thumb-row">' +
            '<div class="upload-preview episode-thumb-preview" id="episodeEditorThumbPreview">400×600</div>' +
            '<label class="btn btn-sm">Upload<input type="file" accept="image/*" hidden id="episodeEditorThumbInput"></label>' +
          '</div></div>' +
        '<div class="field episode-status-field">' +
          '<p class="episode-status-line" id="episodeEditorStatusLine"></p>' +
          '<div class="field episode-publish-field" id="episodeEditorPublishField">' +
            '<label>Publishing</label>' +
            '<div class="episode-publish-modes">' +
              '<label class="episode-publish-mode"><input type="radio" name="episodePublishMode" value="now" checked> Publish immediately</label>' +
              '<label class="episode-publish-mode"><input type="radio" name="episodePublishMode" value="schedule"> Schedule for</label>' +
            '</div>' +
            '<input type="datetime-local" id="episodeEditorPublishAt" class="episode-publish-datetime" hidden>' +
            '<p class="field-hint" id="episodeEditorPublishHint">Readers see this chapter on Discover once it is live. Schedule a future date for timed drops or early-access windows later.</p>' +
          '</div>' +
          '<p class="field-hint">Title, description, and thumbnail save separately. Use the buttons below to publish or schedule.</p>' +
        '</div>' +
        '<div class="modal-actions episode-modal-actions">' +
          '<button type="button" class="btn btn-sm graph-play-btn" id="episodeEditorPlay">▶ Read episode</button>' +
          '<span class="episode-modal-actions-right">' +
            '<button type="button" class="btn btn-sm btn-primary" id="episodeEditorPublishNow">Publish now</button>' +
            '<button type="button" class="btn btn-sm" id="episodeEditorSchedule" hidden>Schedule publish</button>' +
            '<button type="button" class="btn btn-sm btn-ghost" id="episodeEditorUnpublish" hidden>Unpublish</button>' +
            '<button type="button" class="btn btn-sm btn-danger btn-ghost" id="episodeEditorRemoveRegion" hidden>Remove chapter region</button>' +
            '<button type="button" class="btn" id="episodeEditorCancel">Cancel</button>' +
            '<button type="button" class="btn btn-primary" id="episodeEditorSave">Save details</button>' +
          '</span>' +
        '</div>' +
      '</div></div>';
  };

  ScenaGraphEditor.prototype.renderLearnShell = function () {
    var rootClass = "workspace-editor workspace-editor--learn" +
      (this.learnPreviewPlay ? " workspace-editor--learn-play" : "") +
      (this.learnEpisodes ? " workspace-editor--learn-episodes" : "");
    var toolbar;
    if (this.learnEpisodes) {
      toolbar = '<div class="graph-toolbar learn-graph-toolbar learn-graph-toolbar--play">' +
        '<button type="button" class="btn btn-sm" id="addBoundaryBtn">+ Episode boundary</button>' +
        '<span class="learn-toolbar-hint">Draw a chapter line to the right of both epilogues — the shaded area left is Episode 1</span>' +
      '</div>';
    } else if (this.learnPreviewPlay) {
      toolbar = '<div class="graph-toolbar learn-graph-toolbar learn-graph-toolbar--play">' +
          '<div class="graph-toolbar-center">' +
            '<button type="button" class="btn btn-sm graph-play-btn" id="graphPlayBtn" title="Play from selected beat">▶ Play</button>' +
            '<button type="button" class="btn btn-sm" id="graphParallaxBtn" title="Toggle preview parallax">Parallax</button>' +
          '</div>' +
          '<span class="learn-toolbar-hint">Set visuals on the opening beat · ▶ Play to rehearse — toggle Parallax and move the mouse over the stage</span>' +
        '</div>';
    } else {
      toolbar = '<div class="graph-toolbar learn-graph-toolbar">' +
          '<span class="learn-toolbar-hint">Drag blocks from the shelf — or drag a Cue plug into blank space for the connect menu</span>' +
        '</div>';
    }
    var previewBlock = this.learnPreviewPlay
      ? '<div class="center-preview center-preview--learn">' +
          '<div class="preview-viewport">' +
            '<div class="preview-frame" id="gamePreview"></div>' +
          '</div>' +
        '</div>' +
        '<div class="center-resizer center-resizer--learn" id="centerResizer" title="Drag to resize preview / graph"></div>'
      : "";
    var boundariesLayer = this.learnEpisodes
      ? '<div class="graph-boundaries" id="graphBoundaries"></div>'
      : "";
    var soundBar = "";
    var sidePanelTabs = "";
    if (this.learnKeyItemsPanel) {
      sidePanelTabs += '<button type="button" class="resources-tab' +
        (this.resourceTab === "keyitems" ? " is-active" : "") +
        '" data-resource-tab="keyitems">Key items</button>';
    }
    if (this.learnSoundSettings) {
      sidePanelTabs += '<button type="button" class="resources-tab' +
        (this.resourceTab === "audio" ? " is-active" : "") +
        '" data-resource-tab="audio">Audio library</button>';
    }
    var resourcesAside = this.learnSidePanel
      ? '<aside class="panel-right workspace-resources workspace-resources--learn" id="workspaceResources">' +
          '<div class="resources-header">' +
            '<div class="resources-tabs" id="resourceTabs">' + sidePanelTabs + '</div>' +
            '<button type="button" class="btn btn-sm btn-primary" id="resourceCreateBtn">+ Create</button>' +
          '</div>' +
          '<div class="resources-split">' +
            '<div class="resources-list" id="resourcesList"></div>' +
            '<div class="resources-detail" id="resourcesDetail"></div>' +
          '</div>' +
        '</aside>'
      : "";
    var panelsClass = "workspace-panels workspace-panels--learn" +
      (this.learnSidePanel ? " workspace-panels--learn-sidepanel" : "");
    this.container.innerHTML =
      '<div class="' + rootClass + (this.learnSidePanel ? " workspace-editor--learn-sidepanel" : "") + '">' +
        toolbar +
        soundBar +
        '<div class="' + panelsClass + '">' +
          '<aside class="panel-left graph-inspector" id="graphInspector"></aside>' +
          '<div class="panel-center panel-center--learn" id="panelCenter">' +
            previewBlock +
            '<div class="center-graph center-graph--learn">' +
              '<aside class="block-shelf block-shelf--learn" id="blockShelf" aria-label="Block palette"></aside>' +
              '<div class="graph-canvas-wrap" id="graphCanvasWrap" tabindex="0">' +
                '<div class="graph-canvas" id="graphCanvas">' +
                  boundariesLayer +
                  '<svg class="graph-edges" id="graphEdges" width="100%" height="100%" viewBox="0 0 5000 4000" preserveAspectRatio="none"></svg>' +
                  '<svg class="graph-edges graph-edges-temp" id="graphEdgesTemp" width="100%" height="100%" viewBox="0 0 5000 4000" preserveAspectRatio="none"></svg>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          resourcesAside +
        '</div>' +
        '<div class="spawn-menu" id="spawnMenu" hidden></div>' +
        (this.learnSidePanel ? this.workspaceResourceModalMarkup() : "") +
        this.episodeEditorModalMarkup() +
      '</div>';
  };

  ScenaGraphEditor.prototype.renderLearnResourcesShell = function () {
    var tab = this.learnResourcesTab || "characters";
    var tabLabel = tab === "characters" ? "Characters" : tab === "stages" ? "Stages" : tab === "audio" ? "Audio" : "Metrics";
    var hint = tab === "characters"
      ? "Same character panel as the studio — follow the director's notes on the left"
      : "Same stage panel as the studio — follow the director's notes on the left";
    this.container.innerHTML =
      '<div class="workspace-editor workspace-editor--learn workspace-editor--learn-resources">' +
        '<div class="graph-toolbar learn-graph-toolbar">' +
          '<span class="learn-toolbar-hint">' + hint + '</span>' +
        '</div>' +
        '<div class="workspace-panels workspace-panels--learn-resources">' +
          '<aside class="panel-right workspace-resources workspace-resources--learn" id="workspaceResources">' +
            '<div class="resources-header">' +
              '<div class="resources-tabs" id="resourceTabs">' +
                '<button type="button" class="resources-tab is-active" data-resource-tab="' + tab + '">' + tabLabel + '</button>' +
              '</div>' +
              '<button type="button" class="btn btn-sm btn-primary" id="resourceCreateBtn">+ Create</button>' +
            '</div>' +
            (tab === "characters" ? '<div class="learn-mascot-bar" id="learnMascotBar"></div>' : "") +
            (tab === "stages" ? '<div class="learn-mascot-bar learn-stage-flats-bar" id="learnStageFlatsBar"></div>' : "") +
            '<div class="resources-split">' +
              '<div class="resources-list" id="resourcesList"></div>' +
              '<div class="resources-detail" id="resourcesDetail"></div>' +
            '</div>' +
          '</aside>' +
        '</div>' +
        this.workspaceResourceModalMarkup() +
      '</div>';
  };

  ScenaGraphEditor.prototype.renderLearnMascotBar = function () {
    var bar = this.container.querySelector("#learnMascotBar");
    if (!bar || !window.ScenaLearnMascots || bar.dataset.ready === "1") return;
    bar.dataset.ready = "1";
    bar.innerHTML =
      '<p class="learn-mascot-label">Arleco mascots — click to cast with a neutral sprite</p>' +
      '<div class="learn-mascot-grid">' +
        ScenaLearnMascots.map(function (m) {
          return '<button type="button" class="learn-mascot-card" data-mascot-id="' + m.id + '" title="' + escapeAttr(m.tagline) + '">' +
            '<span class="learn-mascot-thumb"><img src="' + escapeAttr(m.image) + '" alt=""></span>' +
            '<span class="learn-mascot-meta"><strong>' + escapeHtml(m.name) + '</strong>' +
            '<span class="learn-mascot-role">' + escapeHtml(m.role || "") + '</span>' +
            '<span>' + escapeHtml(m.tagline) + '</span></span></button>';
        }).join("") +
      '</div>';
    this.bindLearnMascots();
  };

  ScenaGraphEditor.prototype.renderLearnStageFlatsBar = function () {
    var bar = this.container.querySelector("#learnStageFlatsBar");
    if (!bar || !window.ScenaLearnStageFlats || bar.dataset.ready === "1") return;
    bar.dataset.ready = "1";
    var flats = ScenaLearnStageFlats;
    bar.innerHTML =
      '<p class="learn-mascot-label">Sample scenery — click to drop in three simple flats</p>' +
      '<button type="button" class="learn-stage-flats-btn" id="learnStageFlatsApply">' +
        '<span class="learn-stage-flats-previews">' +
          ["bg", "mg", "fg"].map(function (key) {
            return '<span class="learn-stage-flat-thumb"><img src="' + escapeAttr(flats.layers[key]) + '" alt=""></span>';
          }).join("") +
        '</span>' +
        '<span class="learn-stage-flats-copy"><strong>' + escapeHtml(flats.name) + '</strong>' +
        '<span>Background · middle · foreground</span></span></button>';
    this.bindLearnStageFlats();
  };

  ScenaGraphEditor.prototype.bindLearnStageFlats = function () {
    var self = this;
    var btn = this.container.querySelector("#learnStageFlatsApply");
    if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", function () {
      var id = ScenaLearnStageFlats.apply(self.series, self.selectedResourceId);
      if (id) self.selectedResourceId = id;
      self.markDirty();
      self.renderResourcesPanel();
    });
  };

  ScenaGraphEditor.prototype.bindLearnMascots = function () {
    var self = this;
    var bar = this.container.querySelector("#learnMascotBar");
    if (!bar || bar.dataset.bound === "1") return;
    bar.dataset.bound = "1";
    bar.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-mascot-id]");
      if (!btn) return;
      var id = ScenaLearnMascots.cast(self.series, btn.getAttribute("data-mascot-id"), self.selectedResourceId);
      if (id) self.selectedResourceId = id;
      self.markDirty();
      self.renderResourcesPanel();
    });
  };

  ScenaGraphEditor.prototype.renderShell = function () {
    if (this.learnMode && this.learnResourcesTab) {
      this.renderLearnResourcesShell();
      this.bindShellRefs();
      return;
    }
    if (this.learnMode) {
      this.renderLearnShell();
      this.bindShellRefs();
      return;
    }
    var self = this;
    this.container.innerHTML =
      '<div class="workspace-editor">' +
        '<div class="graph-toolbar graph-toolbar--studio">' +
          '<div class="graph-toolbar-desktop">' +
            '<button type="button" class="btn btn-sm graph-play-btn" id="graphPlayBtn" title="Play from selected beat">▶ Play</button>' +
            '<button type="button" class="btn btn-sm" id="validateGraphBtn" title="Check for orphans, dead ends, and region issues">Validate</button>' +
            '<span class="save-status" id="graphSaveStatus">Saved</span>' +
            '<button type="button" class="btn btn-sm btn-primary" id="graphSaveBtn" disabled>Save</button>' +
          '</div>' +
          '<div class="graph-toolbar-mobile" id="graphToolbarMobile">' +
            '<button type="button" class="btn btn-sm" id="mobileBlocksBtn" aria-expanded="false">Blocks</button>' +
            '<button type="button" class="btn btn-sm" id="mobilePlayBtn" aria-expanded="false">Play</button>' +
            '<button type="button" class="btn btn-sm" id="mobileInspectorBtn" aria-expanded="false">Inspector</button>' +
            '<button type="button" class="btn btn-sm" id="mobileAssetsBtn" aria-expanded="false">Assets</button>' +
            '<button type="button" class="btn btn-sm" id="mobileValidateBtn">Validate</button>' +
            '<button type="button" class="btn btn-sm btn-primary" id="mobileSaveBtn">Save</button>' +
          '</div>' +
        '</div>' +
        '<div class="mobile-panel-backdrop" id="mobilePanelBackdrop" hidden></div>' +
        '<div class="workspace-panels">' +
          '<aside class="panel-left graph-inspector" id="graphInspector"></aside>' +
          '<div class="panel-center" id="panelCenter">' +
            '<div class="center-preview">' +
              '<button type="button" class="mobile-preview-close" id="mobilePreviewClose" aria-label="Hide preview">×</button>' +
              '<div class="preview-viewport">' +
                '<div class="preview-frame" id="gamePreview"></div>' +
              '</div>' +
            '</div>' +
            '<div class="center-resizer" id="centerResizer" title="Drag to resize preview / graph"></div>' +
            '<div class="center-graph">' +
              '<button type="button" class="block-shelf-toggle" id="blockShelfToggle" aria-expanded="false" aria-controls="blockShelf" title="Show block palette">' +
                '<span class="block-shelf-toggle-icon" aria-hidden="true">▸</span>' +
                '<span class="block-shelf-toggle-label">Blocks</span>' +
              '</button>' +
              '<aside class="block-shelf block-shelf--collapsed" id="blockShelf" aria-label="Block palette"></aside>' +
              '<div class="graph-canvas-wrap" id="graphCanvasWrap" tabindex="0">' +
                '<div class="graph-canvas" id="graphCanvas">' +
                  '<div class="graph-boundaries" id="graphBoundaries"></div>' +
                  '<svg class="graph-edges" id="graphEdges" width="100%" height="100%" viewBox="0 0 5000 4000" preserveAspectRatio="none"></svg>' +
                  '<svg class="graph-edges graph-edges-temp" id="graphEdgesTemp" width="100%" height="100%" viewBox="0 0 5000 4000" preserveAspectRatio="none"></svg>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<aside class="panel-right workspace-resources" id="workspaceResources">' +
            '<div class="resources-header">' +
              '<div class="resources-tabs" id="resourceTabs">' +
                '<button type="button" class="resources-tab is-active" data-resource-tab="characters">Characters</button>' +
                '<button type="button" class="resources-tab" data-resource-tab="stages">Stages</button>' +
                '<button type="button" class="resources-tab" data-resource-tab="metrics">Metrics</button>' +
                '<button type="button" class="resources-tab" data-resource-tab="keyitems">Key items</button>' +
                '<button type="button" class="resources-tab" data-resource-tab="audio">Audio library</button>' +
                '<button type="button" class="resources-tab" data-resource-tab="store">Asset store</button>' +
              '</div>' +
              '<button type="button" class="btn btn-sm btn-primary" id="resourceCreateBtn">+ Create</button>' +
            '</div>' +
            '<div class="resources-split">' +
              '<div class="resources-list" id="resourcesList"></div>' +
              '<div class="resources-detail" id="resourcesDetail"></div>' +
            '</div>' +
          '</aside>' +
        '</div>' +
        '<div class="spawn-menu" id="spawnMenu" hidden></div>' +
        '<div class="workspace-modal-backdrop" id="workspaceModal" hidden>' +
          '<div class="modal" role="dialog">' +
            '<h2 id="workspaceModalTitle">Create</h2>' +
            '<div id="workspaceModalBody"></div>' +
            '<div class="modal-actions">' +
              '<button type="button" class="btn" id="workspaceModalCancel">Cancel</button>' +
              '<button type="button" class="btn btn-primary" id="workspaceModalSave">Create</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        this.episodeEditorModalMarkup() +
      '</div>';

    this.bindShellRefs();
  };

  ScenaGraphEditor.prototype.bindShellRefs = function () {
    var self = this;
    this.wrap = this.container.querySelector("#graphCanvasWrap");
    this.canvas = this.container.querySelector("#graphCanvas");
    this.edgesSvg = this.container.querySelector("#graphEdges");
    this.edgesTemp = this.container.querySelector("#graphEdgesTemp");
    this.inspector = this.container.querySelector("#graphInspector");
    this.previewEl = this.container.querySelector("#gamePreview");
    this.panelCenter = this.container.querySelector("#panelCenter");
    this.resourcesList = this.container.querySelector("#resourcesList");
    this.resourcesDetail = this.container.querySelector("#resourcesDetail");
    this.spawnMenu = this.container.querySelector("#spawnMenu");
    this.blockShelf = this.container.querySelector("#blockShelf");
    this.workspaceModal = this.container.querySelector("#workspaceModal");
    this.saveStatusEl = this.container.querySelector("#graphSaveStatus");
    this.saveBtn = this.container.querySelector("#graphSaveBtn");
    this.boundariesLayer = this.container.querySelector("#graphBoundaries");
    this.boundaryBtn = null;
    this.episodeContextBtn = null;
    this.validateBtn = this.container.querySelector("#validateGraphBtn");
    this.playBtn = this.container.querySelector("#graphPlayBtn");
    this.parallaxBtn = null;
    this.workspaceEditor = this.container.querySelector(".workspace-editor");
    this.mobileBlocksBtn = this.container.querySelector("#mobileBlocksBtn");
    this.mobilePlayBtn = this.container.querySelector("#mobilePlayBtn");
    this.mobilePreviewClose = this.container.querySelector("#mobilePreviewClose");
    this.mobileInspectorBtn = this.container.querySelector("#mobileInspectorBtn");
    this.mobileAssetsBtn = this.container.querySelector("#mobileAssetsBtn");
    this.mobileValidateBtn = this.container.querySelector("#mobileValidateBtn");
    this.mobileSaveBtn = this.container.querySelector("#mobileSaveBtn");
    this.mobileBackdrop = this.container.querySelector("#mobilePanelBackdrop");

    if (this.playBtn) {
      this.playBtn.addEventListener("click", function () {
        self.togglePlay();
      });
    }

    if (this.parallaxBtn) {
      this.parallaxBtn.addEventListener("click", function () {
        self.setParallaxEnabled(!self.parallaxEnabled);
      });
      this.updateParallaxToggle();
    }

    this.bindEpisodeEditorModal();

    if (this.saveBtn) {
      this.saveBtn.addEventListener("click", function () {
        self.saveNow();
      });
    }

    if (this.mobileSaveBtn) {
      this.mobileSaveBtn.addEventListener("click", function () {
        self.saveNow();
      });
    }

    if (this.validateBtn) {
      this.validateBtn.addEventListener("click", function () {
        self.showValidateGraph();
      });
    }

    if (this.mobileValidateBtn) {
      this.mobileValidateBtn.addEventListener("click", function () {
        self.showValidateGraph();
      });
    }

    if (this.boundaryBtn) {
      this.boundaryBtn.addEventListener("click", function () {
        self.toggleBoundaryPlacement();
      });
    }

    if (this.episodeContextBtn) {
      this.episodeContextBtn.addEventListener("click", function () {
        self.handleEpisodeContextBtn();
      });
    }

    if (this.boundariesLayer) {
      this.boundariesLayer.addEventListener("mousedown", function (e) {
        if (self.shouldIgnoreMouse()) return;
        self.handleBoundaryPointerDown(e, e.clientX);
      });
      this.boundariesLayer.addEventListener("touchstart", function (e) {
        if (e.touches.length !== 1) return;
        var line = e.target.closest(".episode-boundary");
        if (!line) return;
        e.stopPropagation();
        e.preventDefault();
        self.markTouchPointer();
        self.handleBoundaryPointerDown(e, e.touches[0].clientX);
      }, { passive: false });
    }

    this.container.querySelectorAll("[data-resource-tab]").forEach(function (btn) {
      if (self.learnResourcesTab) return;
      btn.addEventListener("click", function () {
        self.resourceTab = btn.getAttribute("data-resource-tab");
        self.selectedResourceId = null;
        self.container.querySelectorAll("[data-resource-tab]").forEach(function (b) {
          b.classList.toggle("is-active", b === btn);
        });
        var createBtn = self.container.querySelector("#resourceCreateBtn");
        if (createBtn) {
          createBtn.textContent = self.resourceTab === "store" ? "+ Sell pack" : "+ Create";
          createBtn.hidden = self.learnMode && self.resourceTab === "store";
        }
        self.renderResourcesPanel();
      });
    });

    var resourceCreateBtn = this.container.querySelector("#resourceCreateBtn");
    if (resourceCreateBtn) {
      resourceCreateBtn.addEventListener("click", function () {
        if (self.resourceTab === "store" && window.ScenaMarketplace) {
          self.openMarketplaceSellModal();
          return;
        }
        self.openCreateResourceModal();
      });
    }

    this.renderBlockShelf();
    this.renderSpawnMenu();
    this.bindBlockShelfToggle();

    if (!this.learnMode) {
      this.bindMobileDrawer();
      this.syncMobileChrome();
    }
    this.syncSaveUiVisibility();

    document.addEventListener("mousedown", function (e) {
      if (!self.spawnMenu || self.spawnMenu.hidden) return;
      if (!e.target.closest("#spawnMenu") && !e.target.closest(".graph-port-out")) {
        self.hideSpawnMenu();
      }
    });

    var modalCancel = this.container.querySelector("#workspaceModalCancel");
    if (modalCancel) {
      modalCancel.addEventListener("click", function () {
        self.closeModal();
      });
    }
    this.bindWorkspaceModal();
  };

  ScenaGraphEditor.prototype.bindWorkspaceModal = function () {
    var self = this;
    if (!this.workspaceModal || this.workspaceModal.dataset.bound === "1") return;
    this.workspaceModal.dataset.bound = "1";
    this.workspaceModal.addEventListener("click", function (e) {
      if (e.target.closest("#workspaceModalSave")) {
        e.preventDefault();
        if (self._workspaceModalMode === "validate") {
          self.closeModal();
          return;
        }
        if (self._workspaceModalMode === "marketplace_sell") {
          self.submitMarketplaceSellModal();
          return;
        }
        self.submitCreateResourceModal();
      }
    });
    this.workspaceModal.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target && e.target.id === "modalCreateName") {
        e.preventDefault();
        if (self._workspaceModalMode === "create") self.submitCreateResourceModal();
      }
    });
  };

  ScenaGraphEditor.prototype.resetWorkspaceModalChrome = function () {
    var cancelBtn = this.container.querySelector("#workspaceModalCancel");
    var saveBtn = this.container.querySelector("#workspaceModalSave");
    if (cancelBtn) cancelBtn.hidden = false;
    if (saveBtn) {
      saveBtn.hidden = false;
      saveBtn.disabled = false;
      saveBtn.textContent = "Create";
    }
  };

  ScenaGraphEditor.prototype.bindCenterResizer = function () {
    var self = this;
    var resizer = this.container.querySelector("#centerResizer");
    if (!resizer) return;

    resizer.addEventListener("mousedown", function (e) {
      e.preventDefault();
      self.isResizingCenter = true;
      document.body.classList.add("is-resizing-center");
      window.addEventListener("mousemove", onResizeMove);
      window.addEventListener("mouseup", onResizeUp);
    });

    function onResizeMove(e) {
      if (!self.isResizingCenter || !self.panelCenter) return;
      var rect = self.panelCenter.getBoundingClientRect();
      var ratio = (e.clientY - rect.top) / rect.height;
      self.previewRatio = Math.min(0.72, Math.max(0.18, ratio));
      self.applyCenterSplit();
    }

    function onResizeUp() {
      self.isResizingCenter = false;
      document.body.classList.remove("is-resizing-center");
      window.removeEventListener("mousemove", onResizeMove);
      window.removeEventListener("mouseup", onResizeUp);
    }
  };

  ScenaGraphEditor.prototype.applyCenterSplit = function () {
    if (!this.panelCenter) return;
    if (this.isMobileLayout()) {
      this.panelCenter.style.setProperty("--preview-ratio", "0");
      return;
    }
    this.panelCenter.style.setProperty("--preview-ratio", String(this.previewRatio));
  };

  ScenaGraphEditor.prototype.markTouchPointer = function () {
    this.ignoreMouseUntil = Date.now() + 700;
  };

  ScenaGraphEditor.prototype.shouldIgnoreMouse = function () {
    return Date.now() < this.ignoreMouseUntil;
  };

  ScenaGraphEditor.prototype.bindDragListeners = function () {
    window.addEventListener("mousemove", this.boundMove);
    window.addEventListener("mouseup", this.boundUp);
    window.addEventListener("touchmove", this.boundTouchMove, { passive: false });
    window.addEventListener("touchend", this.boundTouchEnd);
    window.addEventListener("touchcancel", this.boundTouchEnd);
  };

  ScenaGraphEditor.prototype.unbindDragListeners = function () {
    window.removeEventListener("mousemove", this.boundMove);
    window.removeEventListener("mouseup", this.boundUp);
    window.removeEventListener("touchmove", this.boundTouchMove);
    window.removeEventListener("touchend", this.boundTouchEnd);
    window.removeEventListener("touchcancel", this.boundTouchEnd);
  };

  ScenaGraphEditor.prototype.bindConnectListeners = function () {
    window.addEventListener("mousemove", this.boundConnectMove);
    window.addEventListener("mouseup", this.boundConnectUp);
    window.addEventListener("touchmove", this.boundConnectMove, { passive: false });
    window.addEventListener("touchend", this.boundConnectUp);
    window.addEventListener("touchcancel", this.boundConnectUp);
  };

  ScenaGraphEditor.prototype.unbindConnectListeners = function () {
    window.removeEventListener("mousemove", this.boundConnectMove);
    window.removeEventListener("mouseup", this.boundConnectUp);
    window.removeEventListener("touchmove", this.boundConnectMove);
    window.removeEventListener("touchend", this.boundConnectUp);
    window.removeEventListener("touchcancel", this.boundConnectUp);
  };

  ScenaGraphEditor.prototype.isMobileLayout = function () {
    return window.matchMedia("(max-width: 900px)").matches;
  };

  ScenaGraphEditor.prototype.syncSaveUiVisibility = function () {
    var hide = !!(this.learnMode || (this.series && this.series.templateSource));
    if (this.saveBtn) this.saveBtn.hidden = hide;
    if (this.mobileSaveBtn) this.mobileSaveBtn.hidden = hide;
    if (this.saveStatusEl) this.saveStatusEl.hidden = hide;
  };

  ScenaGraphEditor.prototype.nodeDimensions = function (node) {
    if (!node) return { width: 220, height: 88 };
    if (ScenaStore.isRouterNode(node)) return { width: 240, height: 100 };
    if (ScenaStore.isKeyItemGrant(node) || ScenaStore.shouldAutoAdvance(node)) {
      return { width: 120, height: 88 };
    }
    return { width: 220, height: 110 };
  };

  ScenaGraphEditor.prototype.focusNodeInView = function (node) {
    if (!node || !this.wrap) return;
    var size = this.nodeDimensions(node);
    var rect = this.wrap.getBoundingClientRect();
    this.pan.x = rect.width / 2 - (node.x + size.width / 2) * this.zoom;
    this.pan.y = rect.height / 2 - (node.y + size.height / 2) * this.zoom;
    this.applyTransform();
    this.refreshEpisodeContextBtn();
  };

  ScenaGraphEditor.prototype.startNodeDragFromPointer = function (pointer, clientX, clientY) {
    var self = this;
    var node = pointer.node;
    var begin = function () {
      self.selectNode(node.id, { skipConfirm: true });
      self.dragNode = node;
      self.dragEl = pointer.el;
      self.dragStart = { mouseX: clientX, mouseY: clientY, nodeX: node.x, nodeY: node.y };
    };
    var nodeWidth = pointer.isFlowGate ? 240 : ((pointer.isLogic || pointer.isKeyItem) ? 120 : 220);
    if (this.isNodePublished(node, nodeWidth)) {
      this.confirmPublishedEdit(node, begin, function () {
        self.dragNode = null;
        self.dragStart = null;
        self.dragEl = null;
      });
    } else {
      begin();
    }
  };

  ScenaGraphEditor.prototype.finishNodeTap = function (pointer) {
    var self = this;
    var applyTap = function () {
      self.selectNode(pointer.node.id, { skipConfirm: true });
      self.focusNodeInView(pointer.node);
      if (self.isMobileLayout()) self.setMobileDrawer("inspector");
    };
    var nodeWidth = pointer.isFlowGate ? 240 : ((pointer.isLogic || pointer.isKeyItem) ? 120 : 220);
    if (this.isNodePublished(pointer.node, nodeWidth)) {
      this.confirmPublishedEdit(pointer.node, applyTap, function () {});
    } else {
      applyTap();
    }
  };

  ScenaGraphEditor.prototype.armNodePointer = function (node, el, clientX, clientY, meta) {
    this.pendingNodePointer = {
      node: node,
      el: el,
      startX: clientX,
      startY: clientY,
      moved: false,
      isFlowGate: meta.isFlowGate,
      isLogic: meta.isLogic,
      isKeyItem: meta.isKeyItem,
    };
    this.bindDragListeners();
  };

  ScenaGraphEditor.prototype.toggleBoundaryPlacement = function () {
    this.boundaryPlacementMode = !this.boundaryPlacementMode;
    if (this.boundaryBtn) {
      this.boundaryBtn.classList.toggle("is-active", this.boundaryPlacementMode);
    }
    if (this.wrap) this.wrap.classList.toggle("is-boundary-mode", this.boundaryPlacementMode);
    this.setSaveStatus(this.boundaryPlacementMode
      ? "Click the graph to place an episode boundary line…"
      : (this.isDirty ? "Unsaved changes" : "Saved"));
  };

  ScenaGraphEditor.prototype.syncInspectorPanel = function () {
    if (!this.workspaceEditor || this.isMobileLayout()) return;
    var hasSelection = !!(this.selectedId || this.selectedEdgeId || this.selectedBoundaryId);
    this.workspaceEditor.classList.toggle("has-inspector-selection", hasSelection);
  };

  ScenaGraphEditor.prototype.syncMobileChrome = function () {
    var root = this.workspaceEditor;
    if (!root) return;
    var mobile = this.isMobileLayout();
    var drawer = mobile ? this.mobileDrawer : null;
    var sheetOpen = !!drawer;
    root.classList.toggle("is-mobile-sheet-open", sheetOpen);
    root.classList.toggle("is-mobile-inspector-open", drawer === "inspector");
    root.classList.toggle("is-mobile-assets-open", drawer === "assets");
    root.classList.toggle("is-mobile-block-shelf-open", drawer === "blocks");
    root.classList.toggle("is-mobile-preview-open", drawer === "preview");
    root.classList.toggle("is-mobile-resources-open", drawer === "assets");
    if (this.mobileBackdrop) {
      this.mobileBackdrop.hidden = !sheetOpen;
    }
    var blocksBtn = this.mobileBlocksBtn;
    var playBtn = this.mobilePlayBtn;
    var inspBtn = this.mobileInspectorBtn;
    var assetsBtn = this.mobileAssetsBtn;
    if (blocksBtn) {
      blocksBtn.classList.toggle("is-active", drawer === "blocks");
      blocksBtn.setAttribute("aria-expanded", drawer === "blocks" ? "true" : "false");
    }
    if (playBtn) {
      playBtn.classList.toggle("is-active", drawer === "preview");
      playBtn.setAttribute("aria-expanded", drawer === "preview" ? "true" : "false");
    }
    if (inspBtn) {
      inspBtn.classList.toggle("is-active", drawer === "inspector");
      inspBtn.setAttribute("aria-expanded", drawer === "inspector" ? "true" : "false");
    }
    if (assetsBtn) {
      assetsBtn.classList.toggle("is-active", drawer === "assets");
      assetsBtn.setAttribute("aria-expanded", drawer === "assets" ? "true" : "false");
    }
  };

  ScenaGraphEditor.prototype.handleMobilePlay = function () {
    if (this.mobileDrawer === "preview") {
      if (this.playMode) this.stopPlay();
      this.setMobileDrawer(null);
      return;
    }
    this.setMobileDrawer("preview");
    this.renderPreview();
    if (!this.playMode) this.startPlay();
  };

  ScenaGraphEditor.prototype.setMobileDrawer = function (drawer) {
    var next = drawer || null;
    if (this.isMobileLayout() && this.mobileDrawer === "preview" && next !== "preview" && this.playMode) {
      this.stopPlay();
    }
    if (this.isMobileLayout() && this.mobileDrawer === "blocks" && next !== "blocks") {
      this.applyBlockShelfState(false, { skipChrome: true });
    }
    this.mobileDrawer = next;
    if (next === "blocks" && this.isMobileLayout()) {
      this.applyBlockShelfState(true, { skipChrome: true });
    }
    if (next === "preview" && this.isMobileLayout()) {
      this.renderPreview();
    }
    this.syncMobileChrome();
  };

  ScenaGraphEditor.prototype.closeMobileDrawer = function () {
    this.setMobileDrawer(null);
  };

  ScenaGraphEditor.prototype.handleBoundaryPointerDown = function (e, clientX) {
    var line = e.target.closest(".episode-boundary");
    if (!line) return;
    e.stopPropagation();
    e.preventDefault();
    var ep = (this.series.episodes || []).find(function (item) {
      return item.id === line.dataset.episodeId;
    });
    if (!ep) return;
    this.selectedBoundaryId = ep.id;
    this.selectedEdgeId = null;
    this.selectNode(null);
    this.paintBoundaries();
    this.renderInspector();
    this.refreshEpisodeContextBtn();
    this.syncInspectorPanel();
    this.dragBoundary = {
      episode: ep,
      startX: ep.boundaryX,
      startMouseX: clientX,
    };
    this.bindDragListeners();
  };

  ScenaGraphEditor.prototype.bindMobileDrawer = function () {
    var self = this;
    if (!this.workspaceEditor || this.learnMode) return;
    self.syncMobileChrome();
    if (this.mobileBlocksBtn) {
      this.mobileBlocksBtn.addEventListener("click", function () {
        self.setMobileDrawer(self.mobileDrawer === "blocks" ? null : "blocks");
      });
    }
    if (this.mobilePlayBtn) {
      this.mobilePlayBtn.addEventListener("click", function () {
        self.handleMobilePlay();
      });
    }
    if (this.mobilePreviewClose) {
      this.mobilePreviewClose.addEventListener("click", function () {
        if (self.playMode) self.stopPlay();
        self.setMobileDrawer(null);
      });
    }
    if (this.mobileInspectorBtn) {
      this.mobileInspectorBtn.addEventListener("click", function () {
        self.setMobileDrawer(self.mobileDrawer === "inspector" ? null : "inspector");
      });
    }
    if (this.mobileAssetsBtn) {
      this.mobileAssetsBtn.addEventListener("click", function () {
        self.setMobileDrawer(self.mobileDrawer === "assets" ? null : "assets");
      });
    }
    if (this.mobileBackdrop) {
      this.mobileBackdrop.addEventListener("click", function () {
        self.closeMobileDrawer();
      });
    }
    window.addEventListener("resize", function () {
      if (!self.isMobileLayout()) {
        self.mobileDrawer = null;
        self.syncMobileChrome();
        self.syncInspectorPanel();
        if (self.mobileBackdrop) self.mobileBackdrop.hidden = true;
      } else {
        self.workspaceEditor.classList.remove("has-inspector-selection");
        self.syncMobileChrome();
      }
    });
  };

  ScenaGraphEditor.prototype.bindCanvasEvents = function () {
    var self = this;

    function canvasTargetBlocked(target) {
      return target.closest(".graph-node") || target.closest(".graph-port") || target.closest(".episode-boundary");
    }

    function startPan(clientX, clientY) {
      self.pinchState = null;
      self.isPanning = true;
      self.panStart = { x: clientX - self.pan.x, y: clientY - self.pan.y };
      self.wrap.classList.add("is-panning");
      self.selectNode(null);
      self.bindDragListeners();
    }

    this.wrap.addEventListener("mousedown", function (e) {
      if (self.shouldIgnoreMouse()) return;
      if (canvasTargetBlocked(e.target)) return;
      if (self.boundaryPlacementMode && e.button === 0) {
        e.preventDefault();
        var pt = self.clientToCanvas(e.clientX, e.clientY);
        self.addBoundaryAt(pt.x);
        return;
      }
      if (e.button === 0 || e.button === 1) {
        startPan(e.clientX, e.clientY);
      }
    });

    this.wrap.addEventListener("touchstart", function (e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        self.isPanning = false;
        self.panStart = null;
        self.pinchState = {
          distance: pinchDistance(e.touches),
          zoom: self.zoom,
        };
        self.wrap.classList.add("is-panning");
        self.bindDragListeners();
        return;
      }
      if (e.touches.length !== 1 || canvasTargetBlocked(e.target)) return;
      e.preventDefault();
      self.markTouchPointer();
      var pt = eventClientXY(e);
      startPan(pt.x, pt.y);
    }, { passive: false });

    this.wrap.addEventListener("wheel", function (e) {
      e.preventDefault();
      self.zoom = Math.min(2, Math.max(0.35, self.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
      self.applyTransform();
      self.refreshEpisodeContextBtn();
    }, { passive: false });

    this.wrap.addEventListener("keydown", function (e) {
      if (e.target.matches("input, textarea, select")) return;
      if (e.key === "Escape" && self.connectDragActive) {
        e.preventDefault();
        self.cancelConnect();
        return;
      }
      if (e.key === "Escape" && self.mobileDrawer) {
        e.preventDefault();
        self.closeMobileDrawer();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && self.selectedBoundaryId && !self.selectedId && !self.selectedEdgeId) {
        e.preventDefault();
        self.deleteEpisodeBoundary(self.selectedBoundaryId);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && self.selectedEdgeId) {
        e.preventDefault();
        self.deleteSelectedEdge();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && self.selectedId) {
        e.preventDefault();
        self.deleteSelected();
      }
    });
  };

  ScenaGraphEditor.prototype.onTouchMove = function (e) {
    if (e.touches && e.touches.length === 2 && this.pinchState) {
      e.preventDefault();
      var dist = pinchDistance(e.touches);
      if (this.pinchState.distance > 0) {
        var scale = dist / this.pinchState.distance;
        this.zoom = Math.min(2, Math.max(0.35, this.pinchState.zoom * scale));
        this.applyTransform();
        this.refreshEpisodeContextBtn();
      }
      return;
    }
    if (this.isPanning || this.dragNode || this.dragBoundary || this.connectDragActive) {
      e.preventDefault();
    }
    this.onMouseMove(e);
  };

  ScenaGraphEditor.prototype.onTouchEnd = function (e) {
    if (e.touches && e.touches.length >= 2) return;
    if (e.touches && e.touches.length === 1 && this.pinchState) {
      this.pinchState = null;
      return;
    }
    this.pinchState = null;
    this.onMouseUp(e);
  };

  ScenaGraphEditor.prototype.onMouseMove = function (e) {
    var pt = eventClientXY(e);
    if (this.pendingNodePointer && !this.dragNode) {
      if (Math.hypot(pt.x - this.pendingNodePointer.startX, pt.y - this.pendingNodePointer.startY) >= 6) {
        this.pendingNodePointer.moved = true;
        var pending = this.pendingNodePointer;
        this.pendingNodePointer = null;
        this.startNodeDragFromPointer(pending, pt.x, pt.y);
      }
    }
    if (this.isPanning && this.panStart) {
      this.pan.x = pt.x - this.panStart.x;
      this.pan.y = pt.y - this.panStart.y;
      this.applyTransform();
    }
    if (this.dragNode && this.dragStart) {
      var dx = (pt.x - this.dragStart.mouseX) / this.zoom;
      var dy = (pt.y - this.dragStart.mouseY) / this.zoom;
      this.dragNode.x = Math.max(0, this.dragStart.nodeX + dx);
      this.dragNode.y = Math.max(0, this.dragStart.nodeY + dy);
      if (this.dragEl) {
        this.dragEl.style.left = this.dragNode.x + "px";
        this.dragEl.style.top = this.dragNode.y + "px";
      }
      this.paintEdges();
    }
    if (this.dragBoundary) {
      var bdx = (pt.x - this.dragBoundary.startMouseX) / this.zoom;
      var newX = Math.round(this.dragBoundary.startX + bdx);
      var ep = this.dragBoundary.episode;
      var sorted = ScenaStore.sortedEpisodesByBoundary(this.series);
      var idx = sorted.findIndex(function (item) { return item.id === ep.id; });
      var minX = idx > 0 ? sorted[idx - 1].boundaryX + 60 : 80;
      var maxX = idx < sorted.length - 1 ? sorted[idx + 1].boundaryX - 60 : 4800;
      ep.boundaryX = Math.max(minX, Math.min(maxX, newX));
      this.paintBoundaries();
      this.paintNodes();
      this.paintEdges();
    }
  };

  ScenaGraphEditor.prototype.onMouseUp = function (e) {
    var wasPanning = this.isPanning;
    if (this.pendingNodePointer && !this.pendingNodePointer.moved && !this.dragNode) {
      this.finishNodeTap(this.pendingNodePointer);
    }
    this.pendingNodePointer = null;
    this.isPanning = false;
    this.panStart = null;
    if (this.dragBoundary) {
      this.dragBoundary = null;
      this.syncEpisodeGraphState();
      this.markDirty();
      this.refreshSaveStatus();
    }
    if (this.dragNode) {
      this.refreshEpisodeRegions();
      this.paintBoundaries();
      this.paintNodes();
      this.paintEdges();
    }
    if (this.dragNode && this.dragStart &&
        (this.dragNode.x !== this.dragStart.nodeX || this.dragNode.y !== this.dragStart.nodeY)) {
      this.markDirty();
    }
    this.dragNode = null;
    this.dragStart = null;
    this.dragEl = null;
    if (this.wrap) this.wrap.classList.remove("is-panning");
    this.pinchState = null;
    this.unbindDragListeners();
    if (wasPanning) this.refreshEpisodeContextBtn();
  };

  ScenaGraphEditor.prototype.onConnectMove = function (e) {
    if (!this.connectDragActive || !this.connectFrom || !this.tempLine || !this.connectFromPort) return;
    if (e.touches) e.preventDefault();
    var xy = eventClientXY(e);
    var pt = this.clientToCanvas(xy.x, xy.y);
    this.drawTempLine(this.connectFromPort, pt);
  };

  ScenaGraphEditor.prototype.endConnectDrag = function (keepConnectState) {
    if (this.connectDragActive) {
      this.unbindConnectListeners();
      this.connectDragActive = false;
    }
    this.tempLine = null;
    if (this.edgesTemp) this.edgesTemp.innerHTML = "";
    if (!keepConnectState) {
      this.connectFrom = null;
      this.connectChoiceId = null;
      this.connectFromPort = null;
    }
  };

  ScenaGraphEditor.prototype.onConnectUp = function (e) {
    if (!this.connectDragActive) return;
    var sourceId = this.connectFrom;
    var choiceId = this.connectChoiceId;
    this.endConnectDrag(true);
    if (!sourceId) return;

    this.connectFrom = sourceId;
    this.connectChoiceId = choiceId;

    var pointer = eventClientXY(e);
    var target = document.elementFromPoint(pointer.x, pointer.y);
    var portIn = target && target.closest ? target.closest(".graph-port-in") : null;
    if (portIn) {
      var nodeEl = portIn.closest(".graph-node");
      if (nodeEl) {
        this.completeConnect(nodeEl.dataset.id);
        return;
      }
    }
    if (target && target.closest && target.closest(".graph-port-out")) {
      this.cancelConnect();
      return;
    }
    if (target && target.closest && target.closest("#graphCanvasWrap")) {
      var pt = this.clientToCanvas(pointer.x, pointer.y);
      this.pendingSpawn = { x: pt.x, y: pt.y, screenX: pointer.x, screenY: pointer.y };
      this.showSpawnMenu(pointer.x, pointer.y);
      return;
    }
    this.cancelConnect();
  };

  ScenaGraphEditor.prototype.cancelConnect = function () {
    this.endConnectDrag(false);
    this.hideSpawnMenu();
    this.refreshSaveStatus();
  };

  ScenaGraphEditor.prototype.showSpawnMenu = function (screenX, screenY) {
    var editorRect = this.container.getBoundingClientRect();
    this.spawnMenu.style.left = (screenX - editorRect.left) + "px";
    this.spawnMenu.style.top = (screenY - editorRect.top) + "px";
    this.spawnMenu.hidden = false;
    this.setSaveStatus("Pick a node type…");
  };

  ScenaGraphEditor.prototype.hideSpawnMenu = function () {
    this.spawnMenu.hidden = true;
    this.pendingSpawn = null;
    if (this.connectFrom) this.endConnectDrag(false);
  };

  ScenaGraphEditor.prototype.spawnConnectedNode = function (type) {
    if (!this.pendingSpawn || !this.connectFrom) return;
    var sourceId = this.connectFrom;
    var choiceId = this.connectChoiceId;
    var x = this.pendingSpawn.x;
    var y = this.pendingSpawn.y;
    this.spawnMenu.hidden = true;
    this.pendingSpawn = null;
    var size = this.nodeSpawnOffset(type);
    var newId = this.addNodeAt(type, x - size.width / 2, y - size.height / 2);
    this.connectFrom = sourceId;
    this.connectChoiceId = choiceId;
    this.completeConnect(newId);
    this.selectNode(newId);
    var spawned = this.getNode(newId);
    if (spawned) this.focusNodeInView(spawned);
  };

  ScenaGraphEditor.prototype.clientToCanvas = function (cx, cy) {
    var rect = this.wrap.getBoundingClientRect();
    return {
      x: (cx - rect.left - this.pan.x) / this.zoom,
      y: (cy - rect.top - this.pan.y) / this.zoom,
    };
  };

  ScenaGraphEditor.prototype.applyTransform = function () {
    this.canvas.style.transform = "translate(" + this.pan.x + "px," + this.pan.y + "px) scale(" + this.zoom + ")";
  };

  ScenaGraphEditor.prototype.getNode = function (id) {
    this.ensureGraphArrays();
    return this.series.nodes.find(function (n) { return n.id === id; });
  };

  ScenaGraphEditor.prototype.effectivePresentation = function (node) {
    if (!node) return ScenaStore.resolvePresentation(this.series, null);
    return ScenaStore.resolvePresentation(this.series, node.id);
  };

  ScenaGraphEditor.prototype.nodeColor = function (node) {
    if (!node || node.type !== "beat") return null;
    var resolved = this.effectivePresentation(node);
    if (resolved.characterProfileId) {
      var profile = ScenaStore.getCharacter(this.series, resolved.characterProfileId);
      if (profile) return profile.color;
    }
    return null;
  };

  ScenaGraphEditor.prototype.refreshEpisodeRegions = function () {
    if (ScenaStore.updateEpisodeRegions) ScenaStore.updateEpisodeRegions(this.series);
    if (ScenaStore.syncEpisodeEntries) ScenaStore.syncEpisodeEntries(this.series);
  };

  ScenaGraphEditor.prototype.syncEpisodeGraphState = function () {
    if (ScenaStore.syncSeriesEpisodeState) {
      ScenaStore.syncSeriesEpisodeState(this.series);
    } else {
      this.refreshEpisodeRegions();
    }
    this.refreshEpisodeContextBtn();
  };

  ScenaGraphEditor.prototype.deleteEpisodeBoundary = function (episodeId) {
    var self = this;
    var ep = (this.series.episodes || []).find(function (item) { return item.id === episodeId; });
    if (!ep) return;
    if (ScenaStore.episodeHasNodes(this.series, ep)) {
      this.setSaveStatus("Remove all beats in this chapter region before deleting the boundary.");
      return;
    }
    var label = ep.title || ("Chapter " + ep.number);
    if (!window.confirm("Remove \"" + label + "\" from the graph? It will be unpublished and removed from the chapter list.")) return;
    var result = ScenaStore.deleteEpisodeRegion(this.series, episodeId);
    if (!result.ok) {
      this.setSaveStatus("Could not remove chapter region.");
      return;
    }
    delete this.unlockedEpisodeEdits[episodeId];
    this.selectedBoundaryId = null;
    this.syncEpisodeGraphState();
    this.paintAll();
    this.renderInspector();
    this.markDirty();
    this.setSaveStatus("Chapter region removed.");
  };

  ScenaGraphEditor.prototype.unpublishEpisodeNow = function (ep) {
    var self = this;
    if (!ep || this.learnMode) return;
    if (!ep.isLive) return;
    if (!window.confirm("Unpublish \"" + (ep.title || ("Chapter " + ep.number)) + "\"? Readers will no longer see it until you publish again.")) return;
    ScenaStore.unpublishEpisode(this.series, ep);
    delete this.unlockedEpisodeEdits[ep.id];
    this.syncEpisodeGraphState();
    this.paintAll();
    this.markDirty();
    this.saveNow(true).then(function (ok) {
      if (ok) self.setSaveStatus("Chapter " + ep.number + " unpublished.");
    });
  };

  ScenaGraphEditor.prototype.flowBadge = function (node) {
    if (!node || !node.data) return null;
    if (ScenaStore.sortedEpisodesByBoundary(this.series).length &&
        !ScenaStore.episodeForNode(this.series, node)) {
      return { text: "OFFSTAGE", cls: "is-orphan" };
    }
    if (node.data.isEnd) return { text: "FINIS", cls: "is-end" };
    if (ScenaStore.isStoryEntryBeat(this.series, node.id)) return { text: "CURTAIN UP", cls: "is-entry" };
    var epEntry = ScenaStore.isEpisodeEntryBeat(this.series, node.id);
    if (epEntry) return { text: "CH." + epEntry.number + " IN", cls: "is-ep-entry" };
    if (ScenaStore.isRouterNode(node)) return { text: "IF/ELSE", cls: "is-flow-gate" };
    if (ScenaStore.isKeyItemGrant(node)) return { text: "KEY", cls: "is-key-item" };
    if (ScenaStore.shouldAutoAdvance(node)) return { text: "METRICS", cls: "is-logic" };
    if (ScenaStore.hasChoices(node)) {
      var n = node.data.choices.length;
      return { text: n === 1 ? "1 PATH" : n + " PATHS", cls: "is-choice" };
    }
    var hasNext = (this.series.edges || []).some(function (e) {
      return e.source === node.id && !e.choiceId;
    });
    if (!hasNext) return { text: "DARK HOUSE", cls: "is-dead" };
    return { text: "CUE", cls: "is-next" };
  };

  ScenaGraphEditor.prototype.addNode = function () {
    return this.addNodeFromToolbar("beat");
  };

  ScenaGraphEditor.prototype.addNodeFromToolbar = function (type) {
    type = type || "dialogue";
    if (type === "beat") type = "dialogue";
    var size = this.nodeSpawnOffset(type);
    var x = 100 + this.series.nodes.length * 48;
    var y = 80 + this.series.nodes.length * 36;
    if (this.wrap) {
      var rect = this.wrap.getBoundingClientRect();
      var pt = this.clientToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
      x = pt.x - size.width / 2;
      y = pt.y - size.height / 2;
    }
    var id = this.addNodeAt(type, x, y);
    this.selectNode(id);
    return id;
  };

  ScenaGraphEditor.prototype.addNodeAt = function (type, x, y) {
    if (type === "beat") type = "dialogue";
    var id = uid("n");
    var firstMetric = (this.series.metrics && this.series.metrics[0] && this.series.metrics[0].key) || "";
    var data = ScenaStore.emptyBeatData({ dialogueText: "" });
    var beatKind = "story";
    var firstKeyItem = (ScenaStore.listKeyItemAssets(this.series)[0] || {}).id || "";
    if (type === "choice") {
      data.choices = [
        { id: uid("c"), label: "Option A", choiceText: "Option A" },
        { id: uid("c"), label: "Option B", choiceText: "Option B" },
      ];
    } else if (type === "key-item") {
      beatKind = "key-item";
      data.autoAdvance = true;
      data.grantsKeyItemId = firstKeyItem || null;
    } else if (type === "logic") {
      beatKind = "logic";
      data.autoAdvance = true;
      data.sets = [{
        metricKey: firstMetric,
        op: "add",
        value: 1,
      }];
    } else if (type === "flow-gate" || type === "choice-router" || type === "router") {
      beatKind = "flow-gate";
      data.autoAdvance = true;
      data.isRouteGate = true;
      data.sets = [];
      data.routeRules = [{
        id: uid("route"),
        label: "If…",
        checks: [{ type: "choice", choiceIds: [] }],
      }];
    } else if (type === "metric-router") {
      beatKind = "flow-gate";
      data.autoAdvance = true;
      data.isRouteGate = true;
      data.sets = [];
      data.routeRules = [{
        id: uid("route"),
        label: "If metric…",
        checks: firstMetric ? [{
          type: "metric",
          metricKey: firstMetric,
          op: "gte",
          value: 5,
        }] : [],
      }];
    } else {
      data.dialogueText = data.dialogueText || "";
    }
    data.beatKind = beatKind;
    var node = {
      id: id,
      type: "beat",
      x: x,
      y: y,
      data: data,
    };
    if (!this.series.entryNodeId) this.series.entryNodeId = id;
    this.ensureGraphArrays();
    this.series.nodes.push(node);
    this.paintAll();
    if (!this.learnMode) this.markDirty();
    else this.notifyLearnChange();
    return id;
  };

  ScenaGraphEditor.prototype.isEpisodeEditUnlocked = function (node) {
    if (!node) return false;
    var ep = ScenaStore.episodeForNode(this.series, node, 220);
    return Boolean(ep && this.unlockedEpisodeEdits[ep.id]);
  };

  ScenaGraphEditor.prototype.isNodePublished = function (node, width) {
    if (this.isEpisodeEditUnlocked(node)) return false;
    return ScenaStore.isNodeInPublishedEpisode(this.series, node, width);
  };

  ScenaGraphEditor.prototype.unlockEpisodeEdit = function (episodeId) {
    if (!episodeId) return;
    this.unlockedEpisodeEdits[episodeId] = true;
    var ep = (this.series.episodes || []).find(function (item) { return item.id === episodeId; });
    this.paintBoundaries();
    this.paintNodes();
    this.renderInspector();
    this.setSaveStatus("Ch. " + (ep && ep.number ? ep.number : "?") + " unlocked — edit freely. Unlock other chapters too if needed, then use Update when ready.");
    this.refreshEpisodeContextBtn();
  };

  ScenaGraphEditor.prototype.confirmPublishedEdit = function (node, onConfirm, onCancel) {
    if (!node || !this.isNodePublished(node)) {
      onConfirm();
      return;
    }
    var ep = ScenaStore.episodeForNode(this.series, node);
    if (ep && this.unlockedEpisodeEdits[ep.id]) {
      onConfirm();
      return;
    }
    var label = ep
      ? ("Episode " + ep.number + (ep.isLive ? " (live)" : ""))
      : "a published episode";
    var ok = window.confirm(
      "This beat sits in " + label + ", which is already published to readers.\n\n" +
      "Unlock this chapter for editing? You can unlock several chapters at once — use the toolbar Update button to republish each one when done."
    );
    if (ok) {
      if (ep) this.unlockEpisodeEdit(ep.id);
      onConfirm();
    } else if (onCancel) {
      onCancel();
    }
  };

  ScenaGraphEditor.prototype.addBoundaryAt = function (x) {
    this.series.episodes = this.series.episodes || [];
    ScenaStore.normalizeEpisodes(this.series);
    var sorted = ScenaStore.sortedEpisodesByBoundary(this.series);
    var minX = sorted.length ? sorted[sorted.length - 1].boundaryX + 80 : 100;
    if (x < minX) {
      this.setSaveStatus("Place the boundary further right — after the previous episode line.");
      return;
    }
    var target = this.series.episodes
      .filter(function (ep) { return typeof ep.boundaryX !== "number" || isNaN(ep.boundaryX); })
      .sort(function (a, b) { return a.number - b.number; })[0];
    if (!target) {
      var num = this.series.episodes.length + 1;
      target = {
        id: ScenaStore.assetUid("ep"),
        number: num,
        title: "Episode " + num,
        startNodeId: null,
        endNodeId: null,
        boundaryX: null,
        isLive: false,
        publishedAt: null,
      };
      this.series.episodes.push(target);
    }
    target.boundaryX = Math.round(x);
    this.boundaryPlacementMode = false;
    if (this.boundaryBtn) this.boundaryBtn.classList.remove("is-active");
    if (this.wrap) this.wrap.classList.remove("is-boundary-mode");
    this.selectedBoundaryId = target.id;
    this.syncEpisodeGraphState();
    this.markDirty();
    this.paintAll();
    this.showEpisodeEditorModal(target);
    this.setSaveStatus("Episode " + target.number + " — set title and thumbnail, then save.");
  };

  ScenaGraphEditor.prototype.paintBoundaries = function () {
    if (!this.boundariesLayer) return;
    var self = this;
    var sorted = ScenaStore.sortedEpisodesByBoundary(this.series);
    var html = "";
    var left = 0;
    sorted.forEach(function (ep) {
      var top = typeof ep.regionTop === "number" ? ep.regionTop : 0;
      var bottom = typeof ep.regionBottom === "number" ? ep.regionBottom : 720;
      var height = Math.max(120, bottom - top);
      if (typeof ep.boundaryX === "number" && !isNaN(ep.boundaryX)) {
        var shadeClass = self.unlockedEpisodeEdits[ep.id]
          ? "episode-region-shade--editing"
          : (ScenaStore.isEpisodePublic(ep)
            ? "episode-region-shade--live"
            : (ScenaStore.isEpisodeScheduled(ep)
              ? "episode-region-shade--scheduled"
              : "episode-region-shade--draft"));
        html += '<div class="episode-region-shade ' + shadeClass + '" data-episode-id="' + escapeAttr(ep.id) +
          '" style="left:' + left + "px;top:" + top + "px;width:" + (ep.boundaryX - left) +
          "px;height:" + height + 'px"></div>';
      }
      if (typeof ep.boundaryX !== "number" || isNaN(ep.boundaryX)) return;
      html +=
        '<div class="episode-boundary' + (self.selectedBoundaryId === ep.id ? " is-selected" : "") +
        (ScenaStore.isEpisodePublic(ep)
          ? " episode-boundary--live"
          : (ScenaStore.isEpisodeScheduled(ep) ? " episode-boundary--scheduled" : "")) +
        '" data-episode-id="' + escapeAttr(ep.id) + '" style="left:' + ep.boundaryX +
        "px;top:" + top + "px;height:" + height + 'px">' +
          '<div class="episode-boundary-label">' + escapeHtml(ep.title || ("Ep. " + ep.number)) +
          (ScenaStore.isEpisodePublic(ep)
            ? " · Live"
            : (ScenaStore.isEpisodeScheduled(ep)
              ? " · Scheduled"
              : " · Draft")) + '</div>' +
          '<div class="episode-boundary-line"></div>' +
        '</div>';
      left = ep.boundaryX;
    });
    this.boundariesLayer.innerHTML = html;
  };

  ScenaGraphEditor.prototype.deleteSelected = function () {
    if (!this.selectedId) return;
    var self = this;
    var node = this.getNode(this.selectedId);
    this.confirmPublishedEdit(node, function () {
      var id = self.selectedId;
      if (self.series.entryNodeId === id) self.series.entryNodeId = null;
      self.series.nodes = self.series.nodes.filter(function (n) { return n.id !== id; });
      self.series.edges = self.series.edges.filter(function (e) {
        return e.source !== id && e.target !== id;
      });
      self.selectNode(null);
      self.syncEpisodeGraphState();
      self.paintAll();
      self.markDirty();
    });
  };

  ScenaGraphEditor.prototype.deleteSelectedEdge = function () {
    if (!this.selectedEdgeId) return;
    var self = this;
    var edge = this.getEdge(this.selectedEdgeId);
    if (!edge) return;
    var srcNode = this.getNode(edge.source);
    this.confirmPublishedEdit(srcNode, function () {
      self.series.edges = (self.series.edges || []).filter(function (e) {
        return e.id !== self.selectedEdgeId;
      });
      self.selectedEdgeId = null;
      self.syncEpisodeGraphState();
      self.paintAll();
      self.markDirty();
    });
  };

  ScenaGraphEditor.prototype.selectNode = function (id, opts) {
    var self = this;
    opts = opts || {};
    if (this.playMode && !opts.fromPlay && id !== this.playNodeId) {
      this.stopPlay();
    }
    if (!id) {
      this.selectedId = null;
      this.selectedEdgeId = null;
      this.paintNodes();
      this.paintEdges();
      this.renderInspector();
      this.renderPreview();
      this.refreshEpisodeContextBtn();
      this.syncInspectorPanel();
      return;
    }
    var node = this.getNode(id);
    var apply = function () {
      self.selectedId = id;
      self.selectedEdgeId = null;
      self.selectedBoundaryId = null;
      if (self.wrap) self.wrap.focus({ preventScroll: true });
      self.paintBoundaries();
      self.paintNodes();
      self.paintEdges();
      self.renderInspector();
      self.renderPreview();
      self.refreshEpisodeContextBtn();
      self.syncInspectorPanel();
    };
    if (opts.skipConfirm || opts.fromPlay || !node || !this.isNodePublished(node)) {
      apply();
    } else {
      this.confirmPublishedEdit(node, apply);
    }
  };

  ScenaGraphEditor.prototype.selectEdge = function (edgeId, opts) {
    var self = this;
    opts = opts || {};
    if (!edgeId) {
      this.selectedEdgeId = null;
      this.paintEdges();
      this.renderInspector();
      this.syncInspectorPanel();
      return;
    }
    var edge = this.getEdge(edgeId);
    if (!edge) return;
    var srcNode = this.getNode(edge.source);
    var apply = function () {
      self.selectedEdgeId = edgeId;
      self.selectedId = null;
      self.selectedBoundaryId = null;
      if (self.wrap) self.wrap.focus({ preventScroll: true });
      self.paintBoundaries();
      self.paintNodes();
      self.paintEdges();
      self.renderInspector();
      self.refreshEpisodeContextBtn();
      self.syncInspectorPanel();
    };
    if (opts.skipConfirm || !srcNode || !this.isNodePublished(srcNode)) {
      apply();
    } else {
      this.confirmPublishedEdit(srcNode, apply);
    }
  };

  ScenaGraphEditor.prototype.findEntryNode = function () {
    return ScenaStore.resolveEntryNode(this.series);
  };

  ScenaGraphEditor.prototype.getOutgoingEdge = function (nodeId, choiceId) {
    return (this.series.edges || []).find(function (e) {
      if (e.source !== nodeId) return false;
      if (choiceId) return e.choiceId === choiceId;
      return !e.choiceId;
    }) || null;
  };

  ScenaGraphEditor.prototype.getEdge = function (edgeId) {
    return (this.series.edges || []).find(function (e) {
      return e.id === edgeId;
    }) || null;
  };

  ScenaGraphEditor.prototype.initPlayMetrics = function () {
    var metrics = {};
    (this.series.metrics || []).forEach(function (m) {
      if (m.key) metrics[m.key] = parseFloat(m.defaultValue) || 0;
    });
    return metrics;
  };

  ScenaGraphEditor.prototype.initPlayKeyItems = function () {
    return {};
  };

  ScenaGraphEditor.prototype.applyKeyItemGrant = function (node) {
    if (!node || !node.data || !node.data.grantsKeyItemId) return;
    if (!this.playKeyItems) this.playKeyItems = {};
    var delta = node.data.keyItemDelta != null ? node.data.keyItemDelta : 1;
    ScenaStore.applyKeyItemChange(this.playKeyItems, node.data.grantsKeyItemId, delta);
    if (this.readerMenu) this.readerMenu.onInventoryChanged();
  };

  ScenaGraphEditor.prototype.applyLogicSets = function (node) {
    if (!this.playMetrics || !node || !node.data) return;
    (node.data.sets || []).forEach(function (set) {
      if (!set.metricKey) return;
      var val = this.playMetrics[set.metricKey] || 0;
      var op = set.op || "add";
      var amount = parseFloat(set.value) || 0;
      if (op === "set") val = amount;
      else if (op === "add") val += amount;
      else if (op === "subtract") val -= amount;
      else if (op === "multiply") val *= amount;
      this.playMetrics[set.metricKey] = val;
    }, this);
    if (this.readerMenu) this.readerMenu.onInventoryChanged();
  };

  ScenaGraphEditor.prototype.updatePlayButton = function (playing) {
    if (!this.playBtn) return;
    if (playing) {
      this.playBtn.innerHTML = '<span class="graph-play-btn-icon graph-play-btn-icon--pause" aria-hidden="true"></span> Pause';
    } else {
      this.playBtn.textContent = "▶ Play";
    }
    this.playBtn.classList.toggle("is-playing", playing);
    this.playBtn.title = playing ? "Pause playback" : "Play from selected beat";
  };

  ScenaGraphEditor.prototype.ensurePreviewContentEl = function () {
    if (!this.previewEl) return null;
    var content = this.previewEl.querySelector("#previewContent");
    if (!content) {
      content = document.createElement("div");
      content.id = "previewContent";
      content.className = "preview-content";
      this.previewEl.appendChild(content);
    }
    return content;
  };

  ScenaGraphEditor.prototype.initReaderMenu = function () {
    if (this.readerMenu || !this.previewEl || !window.ScenaReaderMenu) return;
    var self = this;
    this.readerMenu = new ScenaReaderMenu(this.previewEl, {
      getSeries: function () { return self.series; },
      getDialogueLog: function () { return self.previewDialogueLog; },
      getKeyItems: function () { return self.playKeyItems; },
      getMetrics: function () { return self.playMetrics; },
      getParallaxEnabled: function () { return self.parallaxEnabled; },
      setParallaxEnabled: function (v) { self.setParallaxEnabled(v); },
    });
  };

  ScenaGraphEditor.prototype.teardownReaderMenu = function () {
    if (!this.readerMenu) return;
    this.readerMenu.close();
    if (this.previewEl) {
      this.previewEl.querySelectorAll("#playerMenuBtn, #playerMenuBackdrop, #playerKeyItems").forEach(function (el) {
        el.remove();
      });
      this.previewEl.classList.remove("player-frame--menu-open");
    }
    this.readerMenu = null;
  };

  ScenaGraphEditor.prototype.appendPreviewDialogueLog = function (speaker, text) {
    text = (text || "").trim();
    if (!text) return;
    speaker = speaker || "Narration";
    if (!this.previewDialogueLog) this.previewDialogueLog = [];
    var last = this.previewDialogueLog[this.previewDialogueLog.length - 1];
    if (last && last.speaker === speaker && last.text === text) return;
    this.previewDialogueLog.push({ speaker: speaker, text: text });
    if (this.previewDialogueLog.length > 500) this.previewDialogueLog.shift();
    if (this.readerMenu) this.readerMenu.onDialogueAppended();
  };

  ScenaGraphEditor.prototype.syncReaderMenu = function () {
    if (!this.playMode && !this.playEnded) {
      this.teardownReaderMenu();
      return;
    }
    this.initReaderMenu();
    if (this.readerMenu) {
      this.readerMenu.mount();
      this.readerMenu.sync();
    }
  };

  ScenaGraphEditor.prototype.togglePlay = function () {
    if (this.playMode) {
      this.stopPlay();
      return;
    }
    this.startPlay();
  };

  ScenaGraphEditor.prototype.startPlay = function () {
    this.playEpisodeId = null;
    var start = (this.selectedId && this.getNode(this.selectedId)) || this.findEntryNode();
    if (!start) {
      this.onSaveError("Nothing to play — select a beat or add one first.");
      return;
    }
    this.playMode = true;
    this.playEnded = false;
    this.playEndMessage = "";
    this.playChoicesMade = [];
    this.playNodeId = start.id;
    this.selectedId = start.id;
    this.playMetrics = this.initPlayMetrics();
    this.playKeyItems = this.initPlayKeyItems();
    this.previewDialogueLog = [];
    this.updatePlayButton(true);
    this.applyBeatBgm(start);
    this.processCurrentPlayNode();
  };

  ScenaGraphEditor.prototype.openEpisodeReader = function (episode) {
    if (!episode) return;
    if (this.learnMode) {
      this.startEpisodePlay(episode);
      return;
    }
    var self = this;
    var go = function () {
      window.location.href = ScenaStore.episodePlayUrl(self.series.id, episode.id, "studio");
    };
    if (this.isDirty) {
      ScenaStore.normalizeSeries(this.series);
      Promise.resolve(this.onChange(this.series)).then(function (result) {
        result = result || { ok: true };
        if (result.ok === false) {
          self.onSaveError((result.error || "Could not save before opening reader."));
          return;
        }
        self.isDirty = false;
        go();
      });
      return;
    }
    go();
  };

  ScenaGraphEditor.prototype.startEpisodePlay = function (episode) {
    if (!episode) return false;
    var start = ScenaStore.episodePlayStart(this.series, episode, 220);
    if (!start) {
      this.onSaveError("Nothing to play in this episode — add beats left of the chapter line.");
      return false;
    }
    this.closeEpisodeEditorModal();
    this.playEpisodeId = episode.id;
    this.playMode = true;
    this.playEnded = false;
    this.playEndMessage = "";
    this.playChoicesMade = [];
    this.playNodeId = start.id;
    this.selectedId = start.id;
    this.playMetrics = this.initPlayMetrics();
    this.playKeyItems = this.initPlayKeyItems();
    this.previewDialogueLog = [];
    this.updatePlayButton(true);
    this.applyBeatBgm(start);
    this.processCurrentPlayNode();
    return true;
  };

  ScenaGraphEditor.prototype.stopPlay = function () {
    if (window.ScenaAudio) ScenaAudio.stopBgm();
    this.currentBgmAssetId = null;
    this.teardownReaderMenu();
    this.playMode = false;
    this.playNodeId = null;
    this.playEpisodeId = null;
    this.playMetrics = null;
    this.playKeyItems = null;
    this.playEnded = false;
    this.playEndMessage = "";
    this.updatePlayButton(false);
    this.paintAll();
  };

  ScenaGraphEditor.prototype.finishPlay = function (message) {
    if (window.ScenaAudio) ScenaAudio.stopBgm();
    this.currentBgmAssetId = null;
    if (this.readerMenu) this.readerMenu.close();
    this.playMode = false;
    this.playNodeId = null;
    this.playEpisodeId = null;
    this.playEnded = true;
    this.playEndMessage = message || "The end.";
    this.updatePlayButton(false);
    this.paintNodes();
    this.renderPreview();
  };

  ScenaGraphEditor.prototype.playEpisodeAtBoundary = function () {
    if (!this.playEpisodeId) return null;
    return (this.series.episodes || []).find(function (ep) {
      return ep.id === this.playEpisodeId;
    }, this) || null;
  };

  ScenaGraphEditor.prototype.wouldLeaveEpisodePlay = function (targetNodeId) {
    if (!this.playEpisodeId) return false;
    var ep = this.playEpisodeAtBoundary();
    if (!ep) return false;
    var nextNode = this.getNode(targetNodeId);
    return !nextNode || !ScenaStore.isEpisodePlayTarget(this.series, nextNode, ep, 220);
  };

  ScenaGraphEditor.prototype.advancePlay = function (choiceId) {
    if (!this.playMode || !this.playNodeId) return;
    var node = this.getNode(this.playNodeId);
    if (!node) {
      this.finishPlay(this.playEpisodeId ? "Episode complete." : "Story ended.");
      return;
    }

    if (choiceId) {
      this.playChoicesMade.push(choiceId);
      var choiceEdge = this.getOutgoingEdge(node.id, choiceId);
      if (!choiceEdge) {
        this.finishPlay("That choice is not connected to another beat.");
        return;
      }
      if (this.wouldLeaveEpisodePlay(choiceEdge.target)) {
        this.finishPlay("Episode complete.");
        return;
      }
      this.playNodeId = choiceEdge.target;
      this.selectedId = this.playNodeId;
      this.processCurrentPlayNode();
      return;
    }

    if (ScenaStore.hasChoices(node)) return;

    if (node.data && node.data.isEnd) {
      this.finishPlay(this.playEpisodeId ? "Episode complete." : "The end.");
      return;
    }

    var nextEdge = this.getOutgoingEdge(node.id, null);
    if (!nextEdge) {
      this.finishPlay(this.playEpisodeId ? "Episode complete." : "Dead end — connect this beat to continue the story.");
      return;
    }
    if (this.wouldLeaveEpisodePlay(nextEdge.target)) {
      this.finishPlay("Episode complete.");
      return;
    }

    this.playNodeId = nextEdge.target;
    this.selectedId = this.playNodeId;
    this.processCurrentPlayNode();
  };

  ScenaGraphEditor.prototype.processCurrentPlayNode = function () {
    var safety = 0;
    while (this.playMode && this.playNodeId && safety < 500) {
      safety++;
      var node = this.getNode(this.playNodeId);
      if (!node) {
        this.finishPlay("Story ended.");
        return;
      }
      if (!ScenaStore.beatMeetsChoiceRequirements(node, this.playChoicesMade)) {
        var skipEdge = this.getOutgoingEdge(node.id, null);
        if (!skipEdge) {
          this.finishPlay(this.playEpisodeId ? "Episode complete." : "Beat skipped with no next connection.");
          return;
        }
        if (this.wouldLeaveEpisodePlay(skipEdge.target)) {
          this.finishPlay("Episode complete.");
          return;
        }
        this.playNodeId = skipEdge.target;
        this.selectedId = this.playNodeId;
        continue;
      }
      if (ScenaStore.isRouterNode(node)) {
        var routeEdge = ScenaStore.resolveRouterEdge(this.series, node, this.playChoicesMade, this.playMetrics || {}, this.playKeyItems || {});
        if (!routeEdge) {
          this.finishPlay(this.playEpisodeId ? "Episode complete." : "Route gate has no matching connection.");
          return;
        }
        if (this.wouldLeaveEpisodePlay(routeEdge.target)) {
          this.finishPlay("Episode complete.");
          return;
        }
        this.playNodeId = routeEdge.target;
        this.selectedId = this.playNodeId;
        continue;
      }
      if (ScenaStore.shouldAutoAdvance(node)) {
        if (ScenaStore.isKeyItemGrant(node)) {
          this.applyKeyItemGrant(node);
        } else {
          this.applyLogicSets(node);
        }
        var edge = this.getOutgoingEdge(node.id, null);
        if (!edge) {
          this.finishPlay(this.playEpisodeId ? "Episode complete." : "Metrics block has no next connection.");
          return;
        }
        if (this.wouldLeaveEpisodePlay(edge.target)) {
          this.finishPlay("Episode complete.");
          return;
        }
        this.playNodeId = edge.target;
        this.selectedId = this.playNodeId;
        continue;
      }
      if (ScenaStore.hasChoices(node)) {
        this.applyLogicSets(node);
      }
      break;
    }
    if (safety >= 500) {
      this.finishPlay("Too many logic beats in a row.");
      return;
    }
    if (this.playMode && this.playNodeId) {
      this.playBeatAudio(this.getNode(this.playNodeId));
    }
    this.paintAll();
  };

  ScenaGraphEditor.prototype.renderAudioAssetOptions = function (kind, selectedId) {
    var html = '<option value="">— None —</option>';
    ScenaStore.listAudioAssets(this.series, kind).forEach(function (a) {
      html += '<option value="' + a.id + '"' + (selectedId === a.id ? " selected" : "") + '>' + escapeHtml(a.label || "Untitled") + '</option>';
    });
    return html;
  };

  ScenaGraphEditor.prototype.renderAudioSection = function (node, data, isGraphRoot, isLogic) {
    var html = '<div class="inspector-section"><h4>Audio</h4>' +
      '<p class="field-hint">Your library lives in the <strong>Audio</strong> tab → upload clips or use Arleco defaults.</p>';

    if (!isLogic) {
      if (isGraphRoot) {
        html += '<p class="field-hint">Background music set on the opening beat carries through the story unless a beat overrides it.</p>' +
          '<div class="field"><label>Background music</label><select data-key="bgmAssetId">' +
          this.renderAudioAssetOptions("bgm", data.bgmAssetId) + '</select></div>';
      } else {
        html += '<label class="field-inline"><input type="checkbox" id="inspOverrideBgm"' +
          (data.overrideBgm ? " checked" : "") + '> Override background music</label>';
        if (data.overrideBgm) {
          html += '<div class="field"><label>Background music</label><select data-key="bgmAssetId">' +
            this.renderAudioAssetOptions("bgm", data.bgmAssetId) + '</select></div>';
        } else {
          html += '<div class="inherit-hint"><strong>Inherited music:</strong> ' +
            escapeHtml(ScenaStore.inheritedBgmLabel(this.series, node.id)) + '</div>';
        }
      }
      html += '<div class="field"><label>Voice line</label><select data-key="voiceAssetId">' +
        this.renderAudioAssetOptions("voice", data.voiceAssetId) + '</select></div>';
    }

    html += '<div class="field"><label>Sound effect (on enter)</label><select data-key="sfxAssetId">' +
      this.renderAudioAssetOptions("sfx", data.sfxAssetId) + '</select></div></div>';
    return html;
  };

  ScenaGraphEditor.prototype.applyBeatBgm = function (node) {
    if (!node || !window.ScenaAudio) return;
    var resolved = ScenaStore.resolveAudio(this.series, node.id);
    var assetId = resolved.bgmAssetId || null;
    if (assetId === this.currentBgmAssetId) return;
    this.currentBgmAssetId = assetId;
    if (!assetId) {
      ScenaAudio.stopBgm();
      return;
    }
    var asset = ScenaStore.getAudioAsset(this.series, assetId);
    if (asset && asset.dataUrl) ScenaAudio.playBgm(asset.dataUrl);
  };

  ScenaGraphEditor.prototype.playBeatEnterSfx = function (node) {
    if (!node || !node.data || !node.data.sfxAssetId || !window.ScenaAudio) return;
    var asset = ScenaStore.getAudioAsset(this.series, node.data.sfxAssetId);
    if (asset && asset.dataUrl) ScenaAudio.playOneShot(asset.dataUrl, 0.75);
  };

  ScenaGraphEditor.prototype.playBeatVoice = function (node) {
    if (!node || !node.data || !node.data.voiceAssetId || !window.ScenaAudio) return;
    var asset = ScenaStore.getAudioAsset(this.series, node.data.voiceAssetId);
    if (asset && asset.dataUrl) ScenaAudio.playOneShot(asset.dataUrl, 0.85);
  };

  ScenaGraphEditor.prototype.playBeatAudio = function (node) {
    if (!node) return;
    this.applyBeatBgm(node);
    this.playBeatEnterSfx(node);
    this.playBeatVoice(node);
  };

  ScenaGraphEditor.prototype.playClickSound = function () {
    if (!window.ScenaAudio) return;
    ScenaStore.ensureReaderUi(this.series);
    var id = (this.series.readerUi.sounds && this.series.readerUi.sounds.clickAssetId) ||
      ScenaStore.defaultClickAssetId();
    var asset = ScenaStore.getAudioAsset(this.series, id);
    if (asset && asset.dataUrl) ScenaAudio.playOneShot(asset.dataUrl, 0.55);
  };

  ScenaGraphEditor.prototype.bindPlayPreviewEvents = function (node) {
    var self = this;
    if (!this.previewEl || !node) return;
    if (this.readerMenu && this.readerMenu.menuOpen) return;

    this.previewEl.querySelectorAll(".preview-choice-btn[data-choice-id]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        self.playClickSound();
        self.advancePlay(btn.getAttribute("data-choice-id"));
      });
    });

    var continueEl = this.previewEl.querySelector(".preview-dialogue.is-clickable");
    if (continueEl) {
      continueEl.addEventListener("click", function () {
        self.playClickSound();
        self.advancePlay();
      });
    }
  };

  ScenaGraphEditor.prototype.renderPlayEnd = function () {
    var contentEl = this.ensurePreviewContentEl();
    if (!contentEl) return;
    contentEl.innerHTML =
      '<div class="preview-empty preview-empty--play-end">' +
        '<span class="preview-empty-label">' + escapeHtml(this.playEndMessage || "The end.") + '</span>' +
        '<button type="button" class="btn btn-sm btn-primary" id="previewPlayAgainBtn">▶ Play again</button>' +
      '</div>';
    var self = this;
    var again = contentEl.querySelector("#previewPlayAgainBtn");
    if (again) {
      again.addEventListener("click", function () {
        self.playEnded = false;
        self.startPlay();
      });
    }
  };

  ScenaGraphEditor.prototype.portPoint = function (nodeEl, portEl) {
    if (!portEl || !this.wrap) return { x: 0, y: 0 };
    var wrapRect = this.wrap.getBoundingClientRect();
    var portRect = portEl.getBoundingClientRect();
    return {
      x: (portRect.left + portRect.width / 2 - wrapRect.left - this.pan.x) / this.zoom,
      y: (portRect.top + portRect.height / 2 - wrapRect.top - this.pan.y) / this.zoom,
    };
  };

  ScenaGraphEditor.prototype.startConnect = function (sourceId, choiceId, portEl, nodeEl) {
    this.endConnectDrag(false);
    if (this.spawnMenu && !this.spawnMenu.hidden) {
      this.spawnMenu.hidden = true;
      this.pendingSpawn = null;
    }
    this.connectFrom = sourceId;
    this.connectChoiceId = choiceId || null;
    this.connectFromPort = this.portPoint(nodeEl, portEl);
    this.tempLine = true;
    this.connectDragActive = true;
    this.setSaveStatus("Drag to connect or release in blank space…");
    this.bindConnectListeners();
  };

  ScenaGraphEditor.prototype.ensureGraphArrays = function () {
    if (!this.series.nodes) this.series.nodes = [];
    if (!this.series.edges) this.series.edges = [];
  };

  ScenaGraphEditor.prototype.completeConnect = function (targetId) {
    this.ensureGraphArrays();
    if (!this.connectFrom || this.connectFrom === targetId) {
      this.cancelConnect();
      return;
    }
    var sourceId = this.connectFrom;
    var choiceId = this.connectChoiceId;
    var exists = this.series.edges.some(function (e) {
      return e.source === sourceId && e.target === targetId &&
        (e.choiceId || null) === (choiceId || null);
    });
    var added = false;
    if (!exists) {
      this.series.edges.push({ id: uid("e"), source: sourceId, target: targetId, choiceId: choiceId });
      if (ScenaStore.syncEpisodeEntries) ScenaStore.syncEpisodeEntries(this.series);
      added = true;
      if (!this.learnMode) this.markDirty();
    }
    this.connectFrom = null;
    this.connectChoiceId = null;
    this.connectFromPort = null;
    if (this.spawnMenu) {
      this.spawnMenu.hidden = true;
      this.pendingSpawn = null;
    }
    this.endConnectDrag(false);
    this.paintAll();
    if (this.learnMode && added) this.notifyLearnChange();
    this.refreshSaveStatus();
  };

  ScenaGraphEditor.prototype.drawTempLine = function (from, to) {
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    var mx = (from.x + to.x) / 2;
    path.setAttribute("d", "M" + from.x + "," + from.y + " C" + mx + "," + from.y + " " + mx + "," + to.y + " " + to.x + "," + to.y);
    path.setAttribute("class", "is-temp");
    this.edgesTemp.innerHTML = "";
    this.edgesTemp.appendChild(path);
  };

  ScenaGraphEditor.prototype.findOutputPort = function (srcEl, srcNode, edge) {
    if (ScenaStore.hasChoices(srcNode) && edge.choiceId) {
      return srcEl.querySelector('[data-choice-id="' + edge.choiceId + '"]');
    }
    if (ScenaStore.isLinearBeat(srcNode) && !edge.choiceId) {
      return srcEl.querySelector('[data-port="next"]');
    }
    if (edge.choiceId) {
      return srcEl.querySelector('[data-choice-id="' + edge.choiceId + '"]');
    }
    return srcEl.querySelector('[data-port="next"]');
  };

  ScenaGraphEditor.prototype.isLearnPortHighlighted = function (nodeId, choiceId) {
    if (!this.learnMode || !this.learnHighlightPorts) return false;
    for (var i = 0; i < this.learnHighlightPorts.length; i++) {
      var item = this.learnHighlightPorts[i];
      if (item.nodeId !== nodeId) continue;
      if (!choiceId && item.next) return true;
      if (choiceId && item.choiceIds && item.choiceIds.indexOf(choiceId) >= 0) return true;
    }
    return false;
  };

  ScenaGraphEditor.prototype.renderFlowRuleNodeChecks = function (rule) {
    var checks = ScenaStore.normalizeRouteChecks(rule);
    var joinWord = (rule && rule.matchMode === "or") ? "or" : "and";
    if (!checks.length) {
      return '<div class="graph-flow-route-checks">' +
        '<span class="graph-flow-check-pill graph-flow-check-pill--empty">Add checks</span>' +
      '</div>';
    }
    var html = '<div class="graph-flow-route-checks">';
    checks.forEach(function (check, ci) {
      if (ci > 0) {
        html += '<span class="graph-flow-check-join">' + escapeHtml(joinWord) + '</span>';
      }
      var label = ScenaStore.formatFlowCheckLabel(this.series, check) || "Check";
      html += '<span class="graph-flow-check-pill">' + escapeHtml(label) + '</span>';
    }, this);
    html += '</div>';
    return html;
  };

  ScenaGraphEditor.prototype.summarizeFlowRuleLabel = function (rule) {
    var checks = ScenaStore.normalizeRouteChecks(rule);
    if (rule.label) return rule.label;
    if (!checks.length) return "route";
    return checks.map(function (check) {
      if (check.type === "choice") {
        var n = (check.choiceIds || []).length;
        return n ? (n + " choice" + (n === 1 ? "" : "s")) : "any choice";
      }
      if (check.type === "metric") {
        return ScenaStore.formatMetricRequirementLabel(this.series, check) || "metric";
      }
      if (check.type === "keyItem") {
        return ScenaStore.formatKeyItemRequirementLabel(this.series, { assetId: check.assetId, mode: check.mode });
      }
      return "";
    }, this).filter(Boolean).join(" " + ((rule && rule.matchMode === "or") ? "or" : "and") + " ");
  };

  ScenaGraphEditor.prototype.paintNodes = function () {
    var self = this;
    this.ensureGraphArrays();
    this.canvas.querySelectorAll(".graph-node").forEach(function (el) { el.remove(); });

    this.series.nodes.forEach(function (node) {
      if (node.type !== "beat") ScenaStore.migrateNode(node);
      var kind = ScenaStore.getBeatKind(node);
      var isFlowGate = kind === "flow-gate" || kind === "choice-route-gate" || kind === "route-gate" || kind === "metric-route-gate";
      var isKeyItem = kind === "key-item";
      var isLogic = kind === "logic";
      var hasChoices = kind === "story" && ScenaStore.hasChoices(node);
      var badge = self.flowBadge(node);
      var el = document.createElement("div");
      var nodeWidth = isFlowGate ? 240 : ((isLogic || isKeyItem) ? 120 : 220);
      var isPublished = self.isNodePublished(node, nodeWidth);
      var inEpisode = Boolean(ScenaStore.episodeForNode(self.series, node, nodeWidth));
      var offstage = !inEpisode && ScenaStore.sortedEpisodesByBoundary(self.series).length > 0;
      el.className = "graph-node graph-node--beat" + (self.selectedId === node.id ? " is-selected" : "") +
        (self.playMode && self.playNodeId === node.id ? " is-playing" : "") +
        (isPublished ? " graph-node--published" : "") +
        (inEpisode && !isPublished ? " graph-node--in-episode" : "") +
        (offstage ? " graph-node--offstage" : "");
      if (isFlowGate) {
        el.classList.add("graph-node--mechanism", "graph-node--flow-gate");
      } else if (isKeyItem) {
        el.classList.add("graph-node--mechanism", "graph-node--key-item");
      } else if (isLogic) {
        el.classList.add("graph-node--mechanism", "graph-node--logic");
      } else if (hasChoices) {
        el.classList.add("graph-node--choices");
        if ((node.data.choices || []).some(function (c) { return ScenaStore.choiceHasAnyGate(c); })) {
          el.classList.add("graph-node--gated-choice");
        }
      } else {
        el.classList.add("graph-node--speech");
        var color = self.nodeColor(node);
        if (color) {
          el.style.setProperty("--beat-accent", color);
        }
      }
      el.dataset.id = node.id;
      el.dataset.type = "beat";
      el.style.left = node.x + "px";
      el.style.top = node.y + "px";

      var body = "";
      var portsIn = '<div class="graph-port graph-port-in" data-port="in" title="Input"></div>';
      var portOutEdge = "";

      if (isFlowGate) {
        body =
          (badge ? '<span class="graph-flow-badge graph-flow-badge--' + badge.cls + '">' + badge.text + '</span>' : "") +
          '<div class="graph-node-logic-label">Flow gate</div>' +
          '<div class="graph-node-router-rules">';
        (node.data.routeRules || []).forEach(function (rule, idx) {
          var prefix = idx === 0 ? "If" : "Else if";
          var routeTitle = rule.label ? escapeHtml(rule.label) : "";
          var choiceHint = self.isLearnPortHighlighted(node.id, rule.id) ? " graph-port--hint" : "";
          body += '<div class="graph-choice-row graph-choice-row--route">' +
            '<div class="graph-flow-route-copy">' +
              '<div class="graph-flow-route-head"><strong>' + prefix + '</strong>' +
                (routeTitle ? ' <span class="graph-flow-route-name">' + routeTitle + '</span>' : "") +
              '</div>' +
              self.renderFlowRuleNodeChecks(rule) +
            '</div>' +
            '<div class="graph-port graph-port-out' + choiceHint + '" data-port="route" data-choice-id="' + escapeAttr(rule.id) + '" title="Route"></div>' +
          '</div>';
        });
        var elseHint = self.isLearnPortHighlighted(node.id, ScenaStore.ROUTE_ELSE_ID) ? " graph-port--hint" : "";
        body += '<div class="graph-choice-row graph-choice-row--route">' +
          '<span class="graph-choice-label"><strong>Else</strong> default</span>' +
          '<div class="graph-port graph-port-out' + elseHint + '" data-port="route" data-choice-id="' + escapeAttr(ScenaStore.ROUTE_ELSE_ID) + '" title="Else route"></div>' +
        '</div></div>';
      } else if (isKeyItem) {
        var grantAsset = ScenaStore.getKeyItemAsset(self.series, node.data.grantsKeyItemId);
        var grantLabel = (grantAsset && grantAsset.label) || "Pick item";
        var itemDelta = node.data.keyItemDelta != null ? node.data.keyItemDelta : 1;
        var itemAction = itemDelta < 0 ? "Take" : "Give";
        var grantIcon = grantAsset && grantAsset.dataUrl
          ? '<span class="graph-node-key-icon" style="background-image:url(' + grantAsset.dataUrl + ')"></span>'
          : '<span class="graph-node-key-icon graph-node-key-icon--empty">◆</span>';
        body =
          (badge ? '<span class="graph-flow-badge graph-flow-badge--' + badge.cls + '">' + badge.text + '</span>' : "") +
          '<div class="graph-node-logic-label">Key item · ' + escapeHtml(itemAction) + '</div>' +
          grantIcon +
          '<div class="graph-node-logic-detail">' + escapeHtml(grantLabel) + '</div>';
        if (ScenaStore.isLinearBeat(node)) {
          var keyNextHint = self.isLearnPortHighlighted(node.id, null) ? " graph-port--hint" : "";
          portOutEdge = '<div class="graph-port graph-port-out graph-port-out--edge' + keyNextHint + '" data-port="next" title="Next — drag to connect"></div>';
        }
      } else if (isLogic) {
        var set = (node.data.sets && node.data.sets[0]) || {};
        var metric = (self.series.metrics || []).find(function (m) { return m.key === set.metricKey; });
        var metricLabel = (metric && (metric.displayName || metric.key)) || set.metricKey || "metric";
        var displayVal = parseFloat(set.value) || 0;
        var valLabel = (displayVal > 0 ? "+" : "") + displayVal;
        body =
          (badge ? '<span class="graph-flow-badge graph-flow-badge--' + badge.cls + '">' + badge.text + '</span>' : "") +
          '<div class="graph-node-logic-label">Metrics</div>' +
          '<div class="graph-node-logic-detail">' + escapeHtml(metricLabel) + '<br><span>' + valLabel + '</span></div>';
        if (ScenaStore.isLinearBeat(node)) {
          var nextHint = self.isLearnPortHighlighted(node.id, null) ? " graph-port--hint" : "";
          portOutEdge = '<div class="graph-port graph-port-out graph-port-out--edge' + nextHint + '" data-port="next" title="Next — drag to connect"></div>';
        }
      } else {
        var resolved = self.effectivePresentation(node);
        var speakerNode = { data: { characterProfileId: resolved.characterProfileId } };
        var speaker = ScenaStore.speakerDisplayName(speakerNode, self.series);
        var dialoguePreview = node.data.dialogueText || "";
        if (!dialoguePreview && node.data.dialogue && node.data.dialogue[0]) {
          dialoguePreview = node.data.dialogue[0].text || "";
        }
        body =
          (badge ? '<span class="graph-flow-badge graph-flow-badge--' + badge.cls + '">' + badge.text + '</span>' : "") +
          '<div class="graph-node-speaker">' + escapeHtml(speaker) + '</div>' +
          '<div class="graph-node-dialogue">' + escapeHtml(dialoguePreview || "(empty beat)") + '</div>';

        if (hasChoices) {
          body += '<div class="graph-node-choices">';
          (node.data.choices || []).forEach(function (ch) {
            var label = ch.choiceText || ch.label || "Choice";
            var gateBadge = "";
            ScenaStore.normalizeChoiceChecks(ch).forEach(function (check) {
              if (check.type === "choice") {
                gateBadge += ' <span class="graph-choice-prior" title="Requires prior choice">◆</span>';
              } else if (check.type === "metric") {
                gateBadge += ' <span class="graph-choice-metric" title="' +
                  escapeAttr(ScenaStore.formatMetricRequirementLabel(self.series, check)) + '">◎</span>';
              } else if (check.type === "keyItem") {
                gateBadge += ' <span class="graph-choice-keyitem" title="' +
                  escapeAttr(ScenaStore.formatKeyItemRequirementLabel(self.series, check)) + '">◆</span>';
              }
            });
            var choiceHint = self.isLearnPortHighlighted(node.id, ch.id) ? " graph-port--hint" : "";
            body += '<div class="graph-choice-row">' +
              '<span class="graph-choice-label">' + escapeHtml(label) + gateBadge + '</span>' +
              '<div class="graph-port graph-port-out' + choiceHint + '" data-port="choice" data-choice-id="' + ch.id + '" title="Connect: ' + escapeAttr(label) + '"></div>' +
            '</div>';
          });
          body += '</div>';
        } else if (ScenaStore.isLinearBeat(node)) {
          var speechNextHint = self.isLearnPortHighlighted(node.id, null) ? " graph-port--hint" : "";
          portOutEdge = '<div class="graph-port graph-port-out graph-port-out--edge' + speechNextHint + '" data-port="next" title="Next — drag to connect"></div>';
        }
      }

      el.innerHTML = portsIn + '<div class="graph-node-body">' + body + '</div>' + portOutEdge;

      var nodeMeta = { isFlowGate: isFlowGate, isLogic: isLogic, isKeyItem: isKeyItem };

      el.addEventListener("mousedown", function (e) {
        if (self.shouldIgnoreMouse()) return;
        if (e.target.closest(".graph-port")) return;
        e.stopPropagation();
        e.preventDefault();
        self.armNodePointer(node, el, e.clientX, e.clientY, nodeMeta);
      });

      el.addEventListener("touchstart", function (e) {
        if (e.touches.length !== 1) return;
        if (e.target.closest(".graph-port")) return;
        e.stopPropagation();
        e.preventDefault();
        self.markTouchPointer();
        self.armNodePointer(node, el, e.touches[0].clientX, e.touches[0].clientY, nodeMeta);
      }, { passive: false });

      el.querySelectorAll(".graph-port-out").forEach(function (port) {
        function onPortDown(e) {
          e.stopPropagation();
          e.preventDefault();
          self.startConnect(node.id, port.getAttribute("data-choice-id"), port, el);
        }
        port.addEventListener("mousedown", function (e) {
          if (self.shouldIgnoreMouse()) return;
          onPortDown(e);
        });
        port.addEventListener("touchstart", function (e) {
          if (e.touches.length !== 1) return;
          e.stopPropagation();
          e.preventDefault();
          self.markTouchPointer();
          onPortDown(e);
        }, { passive: false });
      });

      self.canvas.appendChild(el);
    });
  };

  ScenaGraphEditor.prototype.ensureEdgesLayer = function () {
    if (!this.canvas) return;
    if (!this.edgesSvg || !this.canvas.contains(this.edgesSvg)) {
      this.edgesSvg = this.canvas.querySelector("#graphEdges");
    }
    if (!this.edgesTemp || !this.canvas.contains(this.edgesTemp)) {
      this.edgesTemp = this.canvas.querySelector("#graphEdgesTemp");
    }
  };

  ScenaGraphEditor.prototype.paintEdges = function () {
    var self = this;
    this.ensureGraphArrays();
    this.ensureEdgesLayer();
    if (!this.edgesSvg) return;
    this.edgesSvg.innerHTML = "";
    var nodeEls = {};
    this.canvas.querySelectorAll(".graph-node").forEach(function (el) {
      nodeEls[el.dataset.id] = el;
    });

    this.series.edges.forEach(function (edge) {
      var srcNode = self.getNode(edge.source);
      var srcEl = nodeEls[edge.source];
      var tgtEl = nodeEls[edge.target];
      if (!srcEl || !tgtEl || !srcNode) return;

      var portOut = self.findOutputPort(srcEl, srcNode, edge);
      var portIn = tgtEl.querySelector(".graph-port-in");
      if (!portOut || !portIn) return;

      var tgtNode = self.getNode(edge.target);
      var srcEp = ScenaStore.episodeForNode(self.series, srcNode);
      var tgtEp = tgtNode ? ScenaStore.episodeForNode(self.series, tgtNode) : null;
      var p1 = self.portPoint(srcEl, portOut);
      var p2 = self.portPoint(tgtEl, portIn);
      var mx = (p1.x + p2.x) / 2;
      var d = "M" + p1.x + "," + p1.y + " C" + mx + "," + p1.y + " " + mx + "," + p2.y + " " + p2.x + "," + p2.y;

      var group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("class", "graph-edge");
      group.setAttribute("data-edge-id", edge.id);
      if (self.selectedEdgeId === edge.id) {
        group.classList.add("is-edge-selected");
      } else if (self.selectedId === edge.source || self.selectedId === edge.target) {
        group.classList.add("is-node-linked");
      }
      if (srcEp && tgtEp && srcEp.id !== tgtEp.id) {
        group.classList.add("is-cross-chapter");
      }

      var hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
      hit.setAttribute("class", "graph-edge-hit");
      hit.setAttribute("d", d);

      var line = document.createElementNS("http://www.w3.org/2000/svg", "path");
      line.setAttribute("class", "graph-edge-line");
      line.setAttribute("d", d);
      if (self.learnMode) {
        line.setAttribute("stroke", "#7c1128");
        line.setAttribute("stroke-width", "2.5");
      }

      hit.addEventListener("mousedown", function (e) {
        if (self.shouldIgnoreMouse()) return;
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        self.selectEdge(edge.id);
      });
      hit.addEventListener("touchstart", function (e) {
        if (e.touches.length !== 1) return;
        e.stopPropagation();
        e.preventDefault();
        self.markTouchPointer();
        self.selectEdge(edge.id);
      }, { passive: false });

      group.appendChild(hit);
      group.appendChild(line);
      self.edgesSvg.appendChild(group);
    });
  };

  ScenaGraphEditor.prototype.paintAll = function () {
    if (this.learnResourcesTab) {
      if (this.learnResourcesTab === "characters") this.renderLearnMascotBar();
      if (this.learnResourcesTab === "stages") this.renderLearnStageFlatsBar();
      this.renderResourcesPanel();
      return;
    }
    if (this.boundariesLayer && ScenaStore.sortedEpisodesByBoundary(this.series).length) {
      var missingRegions = (this.series.episodes || []).some(function (ep) {
        return typeof ep.boundaryX === "number" && typeof ep.regionTop !== "number";
      });
      if (missingRegions) this.refreshEpisodeRegions();
    }
    this.applyTransform();
    if (this.boundariesLayer) this.paintBoundaries();
    this.paintNodes();
    this.paintEdges();
    this.renderInspector();
    this.renderPreview();
    this.renderResourcesPanel();
    this.refreshEpisodeContextBtn();
    this.syncInspectorPanel();
  };

  ScenaGraphEditor.prototype.applyPreviewUi = function () {
    if (!this.previewEl) return;
    var ui = ScenaStore.resolveReaderUi(this.series);
    var parts = String(ui.aspectRatio || "16:9").split(":");
    var aw = parseInt(parts[0], 10) || 16;
    var ah = parseInt(parts[1], 10) || 9;
    var el = this.previewEl;
    el.style.setProperty("--preview-aspect-w", String(aw));
    el.style.setProperty("--preview-aspect-h", String(ah));
    el.style.setProperty("--ui-dialogue-bg", ui.colors.dialogueBg);
    el.style.setProperty("--ui-dialogue-text", ui.colors.dialogueText);
    el.style.setProperty("--ui-accent", ui.colors.accent);
    el.style.setProperty("--ui-choice-bg", ui.colors.choiceBg);
    el.style.setProperty("--ui-choice-text", ui.colors.choiceText);
    el.style.setProperty("--ui-choice-border", ui.colors.choiceBorder);
    el.style.setProperty("--ui-speaker", ui.colors.speaker);
    el.style.setProperty("--ui-dialogue-scale", String(ui.sizes.dialogueScale || 1));
    el.style.setProperty("--ui-choice-scale", String(ui.sizes.choiceScale || 1));
    el.style.setProperty("--ui-corner-radius", String(ui.sizes.cornerRadius || 6) + "px");
    el.className = "preview-frame player-frame preview-ui--" + ui.preset +
      " preview-shape-dialogue--" + ui.shapes.dialogue +
      " preview-shape-choice--" + ui.shapes.choice;
    if (ui.customSprites.dialogueBox) {
      el.style.setProperty("--ui-dialogue-sprite", "url(" + ui.customSprites.dialogueBox + ")");
      el.dataset.customDialogue = "1";
    } else {
      el.style.removeProperty("--ui-dialogue-sprite");
      delete el.dataset.customDialogue;
    }
    if (ui.customSprites.choiceButton) {
      el.style.setProperty("--ui-choice-sprite", "url(" + ui.customSprites.choiceButton + ")");
      el.dataset.customChoice = "1";
    } else {
      el.style.removeProperty("--ui-choice-sprite");
      delete el.dataset.customChoice;
    }
  };

  ScenaGraphEditor.prototype.renderPreview = function () {
    if (!this.previewEl) return;
    this.applyPreviewUi();
    var self = this;
    var contentEl = this.ensurePreviewContentEl();
    if (!contentEl) return;

    if (this.playEnded) {
      this.renderPlayEnd();
      this.syncReaderMenu();
      return;
    }

    var node = null;
    if (this.playMode && this.playNodeId) {
      node = this.getNode(this.playNodeId);
    } else {
      node = this.selectedId ? this.getNode(this.selectedId) : null;
    }

    if (!node) {
      contentEl.innerHTML =
        '<div class="preview-empty">' +
          '<span class="preview-empty-label">Game preview</span>' +
          '<p>' + (this.playMode ? "Playing…" : "Select a story beat to preview, or press ▶ Play to run from it.") + '</p>' +
        '</div>';
      this.syncReaderMenu();
      return;
    }

    if (node.type !== "beat") ScenaStore.migrateNode(node);
    var data = node.data || {};
    var isPlaying = this.playMode && this.playNodeId === node.id;

    if (isPlaying && ScenaStore.shouldAutoAdvance(node)) {
      return;
    }

    if (ScenaStore.isRouterNode(node)) {
      var rules = data.routeRules || [];
      var ruleLines = rules.map(function (rule, idx) {
        var prefix = idx === 0 ? "If" : "Else if";
        return prefix + " " + self.summarizeFlowRuleLabel(rule);
      });
      ruleLines.push("Else → default");
      var routerTag = "Flow gate";
      var header = '<div class="preview-node-tag">' + escapeHtml(isPlaying ? "Now playing" : routerTag) +
        ' · ' + escapeHtml(ScenaStore.nodeLabel(node)) + '</div>';
      var stageHtml = '<div class="preview-stage preview-stage--logic preview-stage--flow-gate"><span class="preview-logic-icon">⎇</span></div>';
      var hint = "Silent branch — routes by your checks, no dialogue or stage change.";
      var dialogueHtml = '<div class="preview-dialogue preview-dialogue--logic preview-dialogue--flow-gate"><p>' +
        escapeHtml(ruleLines.join(" · ")) +
        '</p><p class="field-hint">' + (isPlaying ? "Auto-routing…" : hint) + '</p></div>';
      contentEl.innerHTML = header + stageHtml + dialogueHtml;
      this.syncReaderMenu();
      return;
    }

    var tagPrefix = isPlaying ? "Now playing" : (ScenaStore.shouldAutoAdvance(node) ? "Metrics block" : "Story beat");

    if (ScenaStore.shouldAutoAdvance(node)) {
      var set = (data.sets && data.sets[0]) || {};
      var metric = (this.series.metrics || []).find(function (m) { return m.key === set.metricKey; });
      var metricVal = (this.playMetrics && set.metricKey) ? this.playMetrics[set.metricKey] : null;
      var header = '<div class="preview-node-tag">' + escapeHtml(tagPrefix) + ' · ' + escapeHtml(ScenaStore.nodeLabel(node)) + '</div>';
      var stageHtml = '<div class="preview-stage preview-stage--logic"><span class="preview-logic-icon">⚙</span></div>';
      var dialogueHtml = '<div class="preview-dialogue preview-dialogue--logic"><p>' +
        escapeHtml((metric && (metric.displayName || metric.key)) || set.metricKey || "metric") +
        " " + (set.op || "add") + " " + (set.value || 0) +
        (metricVal !== null ? " → now " + metricVal : "") +
        '</p><p class="field-hint">' + (isPlaying ? "Auto-advancing…" : "Auto-advances — no dialogue or stage change.") + '</p></div>';
      contentEl.innerHTML = header + stageHtml + dialogueHtml;
      this.syncReaderMenu();
      return;
    }

    var resolved = this.effectivePresentation(node);
    var speakerNode = { data: { characterProfileId: resolved.characterProfileId } };
    var speaker = ScenaStore.speakerDisplayName(speakerNode, this.series);
    var header = '<div class="preview-node-tag">' + escapeHtml(tagPrefix) + ' · ' + escapeHtml(ScenaStore.nodeLabel(node)) + '</div>';

    var bg = resolved.backgroundSceneId ? ScenaStore.getBackground(this.series, resolved.backgroundSceneId) : null;
    var layers = (bg && bg.layers) || {};
    var stageClass = "preview-stage";
    var canParallax = layers.bg && layers.mg && layers.fg;
    if (canParallax && this.parallaxEnabled) stageClass += " preview-stage--parallax";
    var stageHtml =
      '<div class="' + stageClass + '">' +
        '<div class="preview-layer preview-layer-bg" style="' + (layers.bg ? "background-image:url(" + layers.bg + ")" : "") + '"></div>' +
        '<div class="preview-layer preview-layer-mg" style="' + (layers.mg ? "background-image:url(" + layers.mg + ")" : "") + '"></div>';

    var spriteUrl = "";
    if (resolved.characterProfileId && resolved.spriteId) {
      var sprites = ScenaStore.spritesForProfile(this.series, resolved.characterProfileId);
      var sp = sprites.find(function (s) { return s.id === resolved.spriteId; });
      if (sp) spriteUrl = sp.dataUrl || "";
    }
    var slot = resolved.slot || "center";
    stageHtml +=
        '<div class="preview-character preview-character--' + slot + '"' +
          (spriteUrl ? ' style="background-image:url(' + spriteUrl + ')"' : "") + '></div>' +
        '<div class="preview-layer preview-layer-fg" style="' + (layers.fg ? "background-image:url(" + layers.fg + ")" : "") + '"></div>' +
      '</div>';

    var dialogueResolved = ScenaStore.resolveBeatDialogue(node);
    var dialogueText = dialogueResolved.text;
    if (!dialogueText && data.dialogue && data.dialogue[0]) dialogueText = data.dialogue[0].text || "";

    if (isPlaying && ScenaStore.getBeatKind(node) === "story") {
      this.appendPreviewDialogueLog(speaker, dialogueText);
    }

    var dialogueHtml = "";
    if (ScenaStore.hasChoices(node)) {
      var previewChoices = isPlaying
        ? ScenaStore.filterVisibleChoices(node, this.playMetrics || {}, this.playChoicesMade || [], this.playKeyItems || {})
        : (data.choices || []);
      dialogueHtml =
        '<div class="preview-dialogue">' +
          (speaker !== "Narration" ? '<strong class="preview-speaker">' + escapeHtml(speaker) + '</strong>' : "") +
          (dialogueText ? '<p>' + escapeHtml(dialogueText) + '</p>' : "") +
        '</div>' +
        '<div class="preview-dialogue preview-dialogue--choices">' +
        (previewChoices.length
          ? previewChoices.map(function (c) {
            var gateLabels = ScenaStore.normalizeChoiceChecks(c).map(function (check) {
              if (check.type === "metric") return ScenaStore.formatMetricRequirementLabel(self.series, check);
              if (check.type === "keyItem") return ScenaStore.formatKeyItemRequirementLabel(self.series, check);
              if (check.type === "choice") return "prior choice";
              return "";
            }).filter(Boolean);
            var gateHint = gateLabels.length
              ? ' title="Requires ' + escapeAttr(gateLabels.join("; ")) + '"'
              : "";
            return '<button type="button" class="preview-choice-btn' + (isPlaying ? " is-clickable" : "") +
              '"' + gateHint + ' data-choice-id="' + escapeAttr(c.id) + '">' +
              escapeHtml(c.choiceText || c.label) + '</button>';
          }).join("")
          : '<p class="field-hint">No choices available at current metric values.</p>') +
        '</div>';
    } else {
      var endHint = (data.isEnd && isPlaying) ? '<p class="preview-continue-hint">Click to finish</p>' : "";
      var continueHint = (!data.isEnd && isPlaying) ? '<p class="preview-continue-hint">Click or press Space to continue</p>' : "";
      dialogueHtml =
        '<div class="preview-dialogue' + (isPlaying ? " is-clickable" : "") + '">' +
          (speaker !== "Narration" ? '<strong class="preview-speaker">' + escapeHtml(speaker) + '</strong>' : "") +
          '<p>' + escapeHtml(dialogueText || "…") + '</p>' +
          continueHint + endHint +
        '</div>';
    }

    contentEl.innerHTML = header + stageHtml + dialogueHtml;
    if (canParallax && this.parallaxEnabled) {
      this.bindPreviewParallax();
    }
    if (isPlaying) this.bindPlayPreviewEvents(node);
    this.syncReaderMenu();
  };

  ScenaGraphEditor.prototype.setParallaxEnabled = function (enabled) {
    this.parallaxEnabled = !!enabled;
    try {
      localStorage.setItem("scena.previewParallax", this.parallaxEnabled ? "1" : "0");
    } catch (e) { /* ignore */ }
    this.updateParallaxToggle();
    this.renderPreview();
  };

  ScenaGraphEditor.prototype.updateParallaxToggle = function () {
    if (!this.parallaxBtn) return;
    this.parallaxBtn.classList.toggle("is-active", this.parallaxEnabled);
    this.parallaxBtn.setAttribute("aria-pressed", this.parallaxEnabled ? "true" : "false");
    this.parallaxBtn.title = this.parallaxEnabled
      ? "Parallax on — click to turn off"
      : "Parallax off — click to turn on";
  };

  ScenaGraphEditor.prototype.resetPreviewParallax = function (stage) {
    if (!stage) {
      stage = this.previewEl && this.previewEl.querySelector(".preview-stage");
    }
    if (!stage) return;
    stage.style.transform = "";
    stage.onmousemove = null;
    stage.onmouseleave = null;
    stage.querySelectorAll(".preview-layer-bg, .preview-layer-mg, .preview-layer-fg").forEach(function (layer) {
      layer.style.backgroundPosition = "50% 50%";
    });
  };

  ScenaGraphEditor.prototype.bindPreviewParallax = function () {
    if (!this.previewEl || !this.parallaxEnabled) return;
    var stage = this.previewEl.querySelector(".preview-stage");
    if (!stage) return;
    var bg = stage.querySelector(".preview-layer-bg");
    var mg = stage.querySelector(".preview-layer-mg");
    var fg = stage.querySelector(".preview-layer-fg");
    if (!bg || !mg || !fg) return;

    var center = "50% 50%";
    var self = this;

    function applyParallax(clientX, clientY) {
      if (!self.parallaxEnabled) return;
      var rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var x = (clientX - rect.left) / rect.width - 0.5;
      var y = (clientY - rect.top) / rect.height - 0.5;

      stage.style.transform =
        "perspective(900px) rotateX(" + (y * 2).toFixed(2) + "deg) rotateY(" + (x * -2.8).toFixed(2) + "deg)";

      var shiftX = x * 0.45;
      var shiftY = y * 0.3;
      bg.style.backgroundPosition = (50 + shiftX * 0.9) + "% " + (50 + shiftY * 0.9) + "%";
      mg.style.backgroundPosition = (50 + shiftX) + "% " + (50 + shiftY) + "%";
      fg.style.backgroundPosition = (50 + shiftX * 1.1) + "% " + (50 + shiftY * 1.1) + "%";
    }

    function resetParallax() {
      self.resetPreviewParallax(stage);
    }

    resetParallax();

    stage.onmousemove = function (e) {
      applyParallax(e.clientX, e.clientY);
    };
    stage.onmouseleave = resetParallax;
  };

  ScenaGraphEditor.prototype.renderResourcesPanel = function () {
    if (!this.resourcesList || !this.resourcesDetail) return;
    var self = this;
    var tab = this.resourceTab;

    if (tab === "store" && window.ScenaMarketplace) {
      this.renderMarketplacePanel();
      return;
    }

    var split = this.container.querySelector(".resources-split");
    if (split) split.classList.remove("resources-split--store");

    var listHtml = "";

    if (tab === "characters") {
      ScenaStore.ensureProfiles(this.series).forEach(function (p) {
        listHtml += '<button type="button" class="resource-list-item' +
          (self.selectedResourceId === p.id ? " is-active" : "") +
          '" data-resource-id="' + p.id + '">' +
          '<span class="resource-swatch" style="background:' + (p.color || "#888") + '"></span>' +
          escapeHtml(p.name || "Unnamed") +
        '</button>';
      });
      if (!listHtml) listHtml = '<p class="resource-list-empty">No characters yet.</p>';
    } else if (tab === "stages") {
      ScenaStore.ensureBackgrounds(this.series).forEach(function (b) {
        listHtml += '<button type="button" class="resource-list-item' +
          (self.selectedResourceId === b.id ? " is-active" : "") +
          '" data-resource-id="' + b.id + '">' + escapeHtml(b.name || "Unnamed stage") + '</button>';
      });
      if (!listHtml) listHtml = '<p class="resource-list-empty">No stages yet.</p>';
    } else if (tab === "audio") {
      ScenaStore.ensureDefaultAudio(this.series);
      var defaults = ScenaStore.listAudioAssets(this.series).filter(function (a) { return a.isDefault; });
      var custom = ScenaStore.listAudioAssets(this.series).filter(function (a) { return !a.isDefault; });
      if (defaults.length) {
        listHtml += '<p class="resource-list-heading">Arleco defaults</p>';
        defaults.forEach(function (a) {
          listHtml += self.renderAudioListItem(a);
        });
      }
      if (custom.length) {
        listHtml += '<p class="resource-list-heading">Your library</p>';
        custom.forEach(function (a) {
          listHtml += self.renderAudioListItem(a);
        });
      }
      if (!defaults.length && !custom.length) {
        listHtml = '<p class="resource-list-empty">No audio yet — click <strong>+ Upload</strong> to add your own clips.</p>';
      }
    } else if (tab === "keyitems") {
      ScenaStore.listKeyItemAssets(this.series).forEach(function (asset) {
        listHtml += '<button type="button" class="resource-list-item resource-list-item--keyitem' +
          (self.selectedResourceId === asset.id ? " is-active" : "") +
          '" data-resource-id="' + asset.id + '">' +
          (asset.dataUrl
            ? '<span class="resource-keyitem-icon" style="background-image:url(' + asset.dataUrl + ')"></span>'
            : '<span class="resource-keyitem-icon resource-keyitem-icon--empty">◆</span>') +
          '<span class="resource-keyitem-meta"><strong>' + escapeHtml(asset.label || "Untitled") + '</strong>' +
          '<span class="resource-keyitem-visibility">' +
            (asset.hiddenFromPlayer ? "Hidden from player" : (asset.hiddenFromInventory ? "Hidden from inventory" : "Visible")) +
          '</span></span>' +
        '</button>';
      });
      if (!listHtml) listHtml = '<p class="resource-list-empty">No key items yet.</p>';
    } else if (tab === "metrics") {
      (this.series.metrics || []).forEach(function (m, i) {
        m = ScenaStore.normalizeMetric(m);
        var rid = "metric_" + i;
        var icon = m.dataUrl
          ? '<span class="resource-metric-icon" style="background-image:url(' + m.dataUrl + ')"></span>'
          : '<span class="resource-metric-icon resource-metric-icon--empty" aria-hidden="true">◎</span>';
        listHtml += '<button type="button" class="resource-list-item resource-list-item--metric' +
          (self.selectedResourceId === rid ? " is-active" : "") +
          '" data-resource-id="' + rid + '" data-metric-idx="' + i + '">' +
          icon +
          '<span class="resource-metric-meta"><strong>' + escapeHtml(m.displayName || m.key || "Untitled metric") + '</strong>' +
          '<span class="resource-metric-visibility">' +
            (m.hiddenFromPlayer ? "Hidden from player" : (m.hiddenFromInventory ? "Hidden from inventory" : "Visible")) +
          '</span></span>' +
        '</button>';
      });
      if (!listHtml) listHtml = '<p class="resource-list-empty">No metrics yet.</p>';
    } else {
      listHtml = '<p class="resource-list-empty">Select a tab above.</p>';
    }

    this.resourcesList.innerHTML = listHtml;
    var createBtn = this.container.querySelector("#resourceCreateBtn");
    if (createBtn) createBtn.textContent = tab === "audio" ? "+ Upload" : "+ Create";
    this.resourcesList.querySelectorAll(".resource-list-item").forEach(function (btn) {
      btn.addEventListener("click", function () {
        self.selectedResourceId = btn.getAttribute("data-resource-id");
        self.renderResourcesPanel();
      });
    });

    this.renderResourceDetail();
  };

  ScenaGraphEditor.prototype.renderAudioListItem = function (asset) {
    var self = this;
    return '<button type="button" class="resource-list-item resource-list-item--audio' +
      (self.selectedResourceId === asset.id ? " is-active" : "") +
      '" data-resource-id="' + asset.id + '">' +
      '<span class="resource-audio-icon" aria-hidden="true">♪</span>' +
      '<span class="resource-audio-meta"><strong>' + escapeHtml(asset.label || "Untitled") + '</strong>' +
      '<span class="resource-audio-kind">' + escapeHtml(ScenaStore.audioKindLabel(asset.kind)) +
      (asset.isDefault ? " · built-in" : "") + '</span></span>' +
    '</button>';
  };

  ScenaGraphEditor.prototype.bindAudioQuickUpload = function () {
    var self = this;
    var input = this.resourcesDetail && this.resourcesDetail.querySelector("#resAudioQuickUpload");
    if (!input || input.dataset.bound === "1") return;
    input.dataset.bound = "1";
    input.addEventListener("change", function () {
      var file = input.files[0];
      if (!file) return;
      var label = window.prompt("Clip name:", file.name.replace(/\.[^.]+$/, ""));
      if (!label) return;
      ScenaStore.fileToAudioDataUrl(file, { seriesId: self.series.id }).then(function (result) {
        var kind = window.prompt("Type: bgm, voice, sfx, or ui", "sfx") || "sfx";
        if (["bgm", "voice", "sfx", "ui"].indexOf(kind) < 0) kind = "sfx";
        var asset = {
          id: ScenaStore.assetUid("aud"),
          label: label.trim(),
          kind: kind,
          dataUrl: result.dataUrl,
          mimeType: result.mimeType,
        };
        ScenaStore.ensureAssets(self.series).push(asset);
        self.selectedResourceId = asset.id;
        self.markDirty();
        self.renderResourcesPanel();
        if (!self.learnMode) self.saveNow();
      }).catch(function (err) {
        self.onSaveError((err && err.message) || "Could not upload audio.");
      });
    });
  };

  ScenaGraphEditor.prototype.renderResourceDetail = function () {
    var self = this;
    var tab = this.resourceTab;
    var id = this.selectedResourceId;
    var html = "";

    if (!id) {
      if (tab === "audio") {
        html = '<div class="resource-detail-empty resource-detail-empty--audio">' +
          '<h4>Audio library</h4>' +
          '<p>Upload MP3 or WAV clips for background music, voice acting, and sound effects.</p>' +
          '<label class="btn btn-primary btn-sm">+ Upload audio<input type="file" accept="audio/*" hidden id="resAudioQuickUpload"></label>' +
          '<p class="field-hint">Arleco defaults (left list) ship with every project. Assign clips on each beat under <strong>Audio</strong> in the inspector.</p>' +
        '</div>';
        this.resourcesDetail.innerHTML = html;
        this.bindAudioQuickUpload();
        return;
      }
      if (tab === "keyitems") {
        html = '<div class="resource-detail-empty">' +
          '<h4>Key items</h4>' +
          '<p>Inventory tokens the reader can collect — keys, letters, clues. Hidden items stay off the inventory HUD but still gate story logic.</p>' +
          '<p class="field-hint">Click <strong>+ Create</strong> to add one, then wire a <strong>Key item</strong> block on the graph to grant it.</p>' +
        '</div>';
        this.resourcesDetail.innerHTML = html;
        return;
      }
      html = '<div class="resource-detail-empty"><p>Select a resource from the list, or click <strong>+ Create</strong>.</p></div>';
      this.resourcesDetail.innerHTML = html;
      return;
    }

    if (tab === "characters") {
      var profile = ScenaStore.getCharacter(this.series, id);
      if (!profile) { this.resourcesDetail.innerHTML = ""; return; }
      var sprites = (profile.sprites || []).map(function (s) {
        return '<div class="sprite-chip" style="background-image:url(' + (s.dataUrl || "") + ')"><span>' + escapeHtml(s.label) + '</span></div>';
      }).join("");
      html =
        '<h4>Character</h4>' +
        '<div class="field"><label>Name</label><input type="text" id="resCharName" value="' + escapeAttr(profile.name) + '"></div>' +
        '<div class="field"><label>Color</label><input type="color" id="resCharColor" value="' + escapeAttr(profile.color || "#888888") + '"></div>' +
        '<div class="field"><label>Sprites</label><div class="sprite-grid">' + (sprites || '<span class="field-hint">No sprites</span>') + '</div>' +
        '<label class="btn btn-sm">+ Add sprite<input type="file" accept="image/*" hidden id="resSpriteUpload"></label></div>' +
        '<button type="button" class="btn btn-sm btn-danger" id="resDeleteChar">Delete character</button>';
    } else if (tab === "stages") {
      var bg = ScenaStore.getBackground(this.series, id);
      if (!bg) { this.resourcesDetail.innerHTML = ""; return; }
      var layers = bg.layers || { bg: null, mg: null, fg: null };
      html =
        '<h4>Stage</h4>' +
        '<div class="field"><label>Name</label><input type="text" id="resStageName" value="' + escapeAttr(bg.name) + '"></div>' +
        '<div class="layer-row">' +
          this.layerSlot("Background", "bg", layers.bg) +
          this.layerSlot("Middle", "mg", layers.mg) +
          this.layerSlot("Foreground", "fg", layers.fg) +
        '</div>' +
        '<p class="field-hint">1080p (1920×1080) PNG/JPG supported. Background & middle layers save as JPEG; foreground keeps transparency.</p>' +
        '<button type="button" class="btn btn-sm btn-danger" id="resDeleteStage">Delete stage</button>';
    } else if (tab === "audio") {
      var asset = ScenaStore.getAudioAsset(this.series, id);
      if (!asset) { this.resourcesDetail.innerHTML = ""; return; }
      var kindOpts = (ScenaStore.AUDIO_KINDS || []).map(function (k) {
        return '<option value="' + k.id + '"' + (asset.kind === k.id ? " selected" : "") + '>' + escapeHtml(k.label) + '</option>';
      }).join("");
      html =
        '<h4>Audio clip</h4>' +
        '<div class="field"><label>Name</label><input type="text" id="resAudioName" value="' + escapeAttr(asset.label || "") + '"></div>' +
        '<div class="field"><label>Type</label><select id="resAudioKind">' + kindOpts + '</select>' +
        '<p class="field-hint" id="resAudioKindHint"></p></div>' +
        '<div class="audio-preview-row">' +
          '<button type="button" class="btn btn-sm" id="resAudioPreview">▶ Preview</button>' +
          '<label class="btn btn-sm">Replace file<input type="file" accept="audio/*" hidden id="resAudioUpload"></label>' +
        '</div>' +
        '<button type="button" class="btn btn-sm btn-danger" id="resDeleteAudio">Delete clip</button>';
      if (asset.isDefault) {
        html = html.replace('id="resDeleteAudio">Delete clip</button>', 'id="resDeleteAudio" hidden>Delete clip</button>');
      }
    } else if (tab === "keyitems") {
      var keyAsset = ScenaStore.getKeyItemAsset(this.series, id);
      if (!keyAsset) { this.resourcesDetail.innerHTML = ""; return; }
      html =
        '<h4>Key item</h4>' +
        '<div class="field"><label>Name</label><input type="text" id="resKeyItemName" value="' + escapeAttr(keyAsset.label || "") + '"></div>' +
        '<div class="field"><label>Description</label><textarea id="resKeyItemDesc" rows="3">' + escapeHtml(keyAsset.description || "") + '</textarea>' +
        '<p class="field-hint">Shown as a tooltip when the item is visible in the reader inventory.</p></div>' +
        '<label class="field-inline"><input type="checkbox" id="resKeyItemHiddenPlayer"' + (keyAsset.hiddenFromPlayer ? " checked" : "") + '> Hidden from player</label>' +
        '<label class="field-inline"><input type="checkbox" id="resKeyItemHiddenInventory"' + (keyAsset.hiddenFromInventory ? " checked" : "") + '> Hidden from inventory</label>' +
        '<div class="field"><label>Icon</label>' +
        '<div class="resource-keyitem-preview" id="resKeyItemPreview"' + (keyAsset.dataUrl ? ' style="background-image:url(' + keyAsset.dataUrl + ')"' : "") + '>' +
        (keyAsset.dataUrl ? "" : "◆") + '</div>' +
        this.renderKeyItemIconPicker(keyAsset.dataUrl, "resKeyItemIconPicker") +
        '<label class="btn btn-sm">Upload custom<input type="file" accept="image/*" hidden id="resKeyItemIconUpload"></label></div>' +
        '<button type="button" class="btn btn-sm btn-danger" id="resDeleteKeyItem">Delete key item</button>';
    } else {
      var idx = parseInt(String(id).replace("metric_", ""), 10);
      var metric = (this.series.metrics || [])[idx];
      if (!metric) { this.resourcesDetail.innerHTML = ""; return; }
      html =
        '<h4>Metric</h4>' +
        '<div class="field"><label>Key</label><input type="text" id="resMetricKey" value="' + escapeAttr(metric.key) + '"></div>' +
        '<div class="field"><label>Display name</label><input type="text" id="resMetricLabel" value="' + escapeAttr(metric.displayName || "") + '"></div>' +
        '<div class="field"><label>Default value</label><input type="number" id="resMetricDefault" value="' + (metric.defaultValue || 0) + '"></div>' +
        '<label class="field-inline"><input type="checkbox" id="resMetricHiddenPlayer"' + (metric.hiddenFromPlayer ? " checked" : "") + '> Hidden from player</label>' +
        '<label class="field-inline"><input type="checkbox" id="resMetricHiddenInventory"' + (metric.hiddenFromInventory ? " checked" : "") + '> Hidden from inventory</label>' +
        '<p class="field-hint">Hidden from player removes the score everywhere. Hidden from inventory keeps it off the inventory menu but still allows on-screen tallies when visible to the player.</p>' +
        '<div class="field"><label>Icon</label>' +
        '<div class="resource-keyitem-preview" id="resMetricPreview"' + (metric.dataUrl ? ' style="background-image:url(' + metric.dataUrl + ')"' : "") + '>' +
        (metric.dataUrl ? "" : "◎") + '</div>' +
        this.renderKeyItemIconPicker(metric.dataUrl, "resMetricIconPicker") +
        '<label class="btn btn-sm">Upload custom<input type="file" accept="image/*" hidden id="resMetricIconUpload"></label></div>' +
        '<button type="button" class="btn btn-sm btn-danger" id="resDeleteMetric">Delete metric</button>';
    }

    this.resourcesDetail.innerHTML = html;
    var metricIdx = tab === "metrics" ? parseInt(String(id).replace("metric_", ""), 10) : NaN;
    this.bindResourceDetail(tab, id, metricIdx);
  };

  ScenaGraphEditor.prototype.renderKeyItemIconPicker = function (selectedUrl, pickerId) {
    var icons = window.ScenaKeyItem ? ScenaKeyItem.listDefaultIcons() : [];
    var html = '<div class="keyitem-icon-picker-wrap">' +
      '<p class="field-hint keyitem-icon-picker-count">' + icons.length + ' built-in icons — pick one or upload custom below.</p>' +
      '<div class="keyitem-icon-picker" id="' + escapeAttr(pickerId || "keyItemIconPicker") + '">';
    if (!icons.length) {
      html += '<p class="field-hint keyitem-icon-picker-empty">Icon library failed to load — refresh the page.</p>';
    }
    icons.forEach(function (icon) {
      var selected = selectedUrl === icon.dataUrl ? " is-selected" : "";
      html += '<button type="button" class="keyitem-icon-option' + selected + '" data-icon-id="' + escapeAttr(icon.id) + '" title="' + escapeAttr(icon.label) + '">' +
        '<span class="keyitem-icon-option-img" style="background-image:url(' + icon.dataUrl + ')"></span></button>';
    });
    html += "</div></div>";
    return html;
  };

  ScenaGraphEditor.prototype.keyItemIconUrlFromButton = function (btn) {
    if (!btn) return null;
    var id = btn.getAttribute("data-icon-id");
    if (id && window.ScenaKeyItem) {
      var icon = ScenaKeyItem.getDefaultIcon(id);
      if (icon) return icon.dataUrl;
    }
    return btn.getAttribute("data-icon-url");
  };

  ScenaGraphEditor.prototype.updateKeyItemIconPreview = function (previewEl, url) {
    if (!previewEl) return;
    if (url) {
      previewEl.style.backgroundImage = "url(" + url + ")";
      previewEl.textContent = "";
    } else {
      previewEl.style.backgroundImage = "";
      previewEl.textContent = "◆";
    }
  };

  ScenaGraphEditor.prototype.bindKeyItemIconPicker = function (container, onPick, previewEl) {
    var self = this;
    if (!container) return;
    container.querySelectorAll(".keyitem-icon-option").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var url = self.keyItemIconUrlFromButton(btn);
        container.querySelectorAll(".keyitem-icon-option").forEach(function (b) { b.classList.remove("is-selected"); });
        btn.classList.add("is-selected");
        self.updateKeyItemIconPreview(previewEl, url);
        onPick(url);
      });
    });
  };

  ScenaGraphEditor.prototype.layerSlot = function (label, key, dataUrl) {
    return '<div class="layer-slot">' +
      '<span class="layer-slot-label">' + label + '</span>' +
      '<div class="layer-slot-preview" style="' + (dataUrl ? "background-image:url(" + dataUrl + ")" : "") + '">' + (dataUrl ? "" : "+") + '</div>' +
      '<label class="btn btn-sm">Upload<input type="file" accept="image/*" hidden data-layer-key="' + key + '"></label></div>';
  };

  ScenaGraphEditor.prototype.bindResourceDetail = function (tab, id, metricIdx) {
    var self = this;

    function persist() {
      self.markDirty();
      self.renderResourcesPanel();
      if (!self.learnMode) {
        self.renderInspector();
        self.renderPreview();
        self.saveNow();
      }
    }

    if (tab === "characters") {
      var profile = ScenaStore.getCharacter(this.series, id);
      if (!profile) return;
      var nameEl = this.resourcesDetail.querySelector("#resCharName");
      var colorEl = this.resourcesDetail.querySelector("#resCharColor");
      if (nameEl) nameEl.addEventListener("input", function () {
        profile.name = nameEl.value.trim();
        profile.color = colorEl.value;
        persist();
      });
      if (colorEl) colorEl.addEventListener("input", function () {
        profile.color = colorEl.value;
        persist();
      });
      var upload = this.resourcesDetail.querySelector("#resSpriteUpload");
      if (upload) upload.addEventListener("change", function () {
        var file = upload.files[0];
        if (!file) return;
        var label = window.prompt("Pose name (e.g. happy, angry):", file.name.replace(/\.[^.]+$/, ""));
        if (!label) return;
        ScenaStore.fileToDataUrl(file, { purpose: "sprite", seriesId: self.series.id }).then(function (url) {
          profile.sprites = profile.sprites || [];
          profile.sprites.push({ id: ScenaStore.assetUid("sp"), label: label.trim(), dataUrl: url });
          persist();
        }).catch(function (err) {
          self.onSaveError((err && err.message) || "Could not upload sprite.");
        });
      });
      var del = this.resourcesDetail.querySelector("#resDeleteChar");
      if (del) del.addEventListener("click", function () {
        if (!window.confirm("Delete this character?")) return;
        self.series.characterProfiles = self.series.characterProfiles.filter(function (p) { return p.id !== id; });
        self.selectedResourceId = null;
        persist();
      });
    } else if (tab === "stages") {
      var bg = ScenaStore.getBackground(this.series, id);
      if (!bg) return;
      var stageName = this.resourcesDetail.querySelector("#resStageName");
      if (stageName) stageName.addEventListener("input", function () {
        bg.name = stageName.value.trim();
        persist();
      });
      this.resourcesDetail.querySelectorAll("[data-layer-key]").forEach(function (input) {
        input.addEventListener("change", function () {
          var file = input.files[0];
          if (!file) return;
          var layerKey = input.getAttribute("data-layer-key");
          ScenaStore.fileToDataUrl(file, { purpose: "stage-" + layerKey, seriesId: self.series.id }).then(function (url) {
            if (!bg.layers) bg.layers = { bg: null, mg: null, fg: null };
            bg.layers[layerKey] = url;
            persist();
          }).catch(function (err) {
            self.onSaveError((err && err.message) || "Could not upload layer.");
          });
        });
      });
      var delStage = this.resourcesDetail.querySelector("#resDeleteStage");
      if (delStage) delStage.addEventListener("click", function () {
        if (!window.confirm("Delete this stage?")) return;
        self.series.backgroundScenes = self.series.backgroundScenes.filter(function (b) { return b.id !== id; });
        self.selectedResourceId = null;
        persist();
      });
    } else if (tab === "audio") {
      var asset = ScenaStore.getAudioAsset(this.series, id);
      if (!asset) return;
      var nameEl = this.resourcesDetail.querySelector("#resAudioName");
      var kindEl = this.resourcesDetail.querySelector("#resAudioKind");
      var hintEl = this.resourcesDetail.querySelector("#resAudioKindHint");
      function syncKindHint() {
        if (!hintEl || !kindEl) return;
        var kind = (ScenaStore.AUDIO_KINDS || []).find(function (k) { return k.id === kindEl.value; });
        hintEl.textContent = kind ? kind.hint : "";
      }
      syncKindHint();
      if (nameEl) nameEl.addEventListener("input", function () {
        asset.label = nameEl.value.trim();
        persist();
      });
      if (kindEl) kindEl.addEventListener("change", function () {
        asset.kind = kindEl.value;
        syncKindHint();
        persist();
      });
      var previewBtn = this.resourcesDetail.querySelector("#resAudioPreview");
      if (previewBtn) previewBtn.addEventListener("click", function () {
        if (asset.dataUrl && window.ScenaAudio) ScenaAudio.playOneShot(asset.dataUrl);
      });
      var upload = this.resourcesDetail.querySelector("#resAudioUpload");
      if (upload) upload.addEventListener("change", function () {
        var file = upload.files[0];
        if (!file) return;
        ScenaStore.fileToAudioDataUrl(file, { seriesId: self.series.id }).then(function (result) {
          asset.dataUrl = result.dataUrl;
          asset.mimeType = result.mimeType;
          persist();
        }).catch(function (err) {
          self.onSaveError((err && err.message) || "Could not upload audio.");
        });
      });
      var delAudio = this.resourcesDetail.querySelector("#resDeleteAudio");
      if (delAudio) delAudio.addEventListener("click", function () {
        if (asset.isDefault) {
          self.onSaveError("Built-in Arleco clips cannot be deleted.");
          return;
        }
        if (!window.confirm("Delete this audio clip?")) return;
        self.series.assets = ScenaStore.ensureAssets(self.series).filter(function (a) { return a.id !== id; });
        self.selectedResourceId = null;
        persist();
      });
    } else if (tab === "keyitems") {
      var keyAsset = ScenaStore.getKeyItemAsset(this.series, id);
      if (!keyAsset) return;
      var keyName = this.resourcesDetail.querySelector("#resKeyItemName");
      var keyDesc = this.resourcesDetail.querySelector("#resKeyItemDesc");
      var keyHiddenPlayer = this.resourcesDetail.querySelector("#resKeyItemHiddenPlayer");
      var keyHiddenInventory = this.resourcesDetail.querySelector("#resKeyItemHiddenInventory");
      function syncKeyItemFields() {
        keyAsset.label = keyName ? keyName.value.trim() : keyAsset.label;
        keyAsset.description = keyDesc ? keyDesc.value.trim() : "";
        keyAsset.hiddenFromPlayer = keyHiddenPlayer ? keyHiddenPlayer.checked : false;
        keyAsset.hiddenFromInventory = keyHiddenInventory ? keyHiddenInventory.checked : false;
        delete keyAsset.hidden;
      }
      if (keyName) keyName.addEventListener("input", function () { syncKeyItemFields(); persist(); });
      if (keyDesc) keyDesc.addEventListener("input", function () { syncKeyItemFields(); persist(); });
      if (keyHiddenPlayer) keyHiddenPlayer.addEventListener("change", function () { syncKeyItemFields(); persist(); });
      if (keyHiddenInventory) keyHiddenInventory.addEventListener("change", function () { syncKeyItemFields(); persist(); });
      var previewEl = this.resourcesDetail.querySelector("#resKeyItemPreview");
      this.bindKeyItemIconPicker(this.resourcesDetail.querySelector("#resKeyItemIconPicker"), function (url) {
        keyAsset.dataUrl = url;
        persist();
      }, previewEl);
      var iconUpload = this.resourcesDetail.querySelector("#resKeyItemIconUpload");
      if (iconUpload) iconUpload.addEventListener("change", function () {
        var file = iconUpload.files[0];
        if (!file) return;
        ScenaStore.fileToDataUrl(file, { purpose: "key-item", seriesId: self.series.id }).then(function (url) {
          keyAsset.dataUrl = url;
          var picker = self.resourcesDetail.querySelector("#resKeyItemIconPicker");
          if (picker) picker.querySelectorAll(".keyitem-icon-option").forEach(function (b) { b.classList.remove("is-selected"); });
          self.updateKeyItemIconPreview(previewEl, url);
          persist();
        }).catch(function (err) {
          self.onSaveError((err && err.message) || "Could not upload icon.");
        });
      });
      var delKey = this.resourcesDetail.querySelector("#resDeleteKeyItem");
      if (delKey) delKey.addEventListener("click", function () {
        if (!window.confirm("Delete this key item?")) return;
        self.series.assets = ScenaStore.ensureAssets(self.series).filter(function (a) { return a.id !== id; });
        self.selectedResourceId = null;
        persist();
      });
    } else if (tab === "metrics") {
      var metric = this.series.metrics[metricIdx];
      if (!metric) return;
      ScenaStore.normalizeMetric(metric);
      function syncMetricFields() {
        metric.key = self.resourcesDetail.querySelector("#resMetricKey").value.trim();
        metric.displayName = self.resourcesDetail.querySelector("#resMetricLabel").value.trim();
        metric.defaultValue = parseFloat(self.resourcesDetail.querySelector("#resMetricDefault").value) || 0;
        metric.hiddenFromPlayer = self.resourcesDetail.querySelector("#resMetricHiddenPlayer").checked;
        metric.hiddenFromInventory = self.resourcesDetail.querySelector("#resMetricHiddenInventory").checked;
        delete metric.hidden;
      }
      ["#resMetricKey", "#resMetricLabel", "#resMetricDefault", "#resMetricHiddenPlayer", "#resMetricHiddenInventory"].forEach(function (sel) {
        var el = self.resourcesDetail.querySelector(sel);
        if (!el) return;
        el.addEventListener("input", function () { syncMetricFields(); persist(); });
        el.addEventListener("change", function () { syncMetricFields(); persist(); });
      });
      var metricPreviewEl = this.resourcesDetail.querySelector("#resMetricPreview");
      this.bindKeyItemIconPicker(this.resourcesDetail.querySelector("#resMetricIconPicker"), function (url) {
        metric.dataUrl = url;
        syncMetricFields();
        persist();
      }, metricPreviewEl);
      var metricIconUpload = this.resourcesDetail.querySelector("#resMetricIconUpload");
      if (metricIconUpload) metricIconUpload.addEventListener("change", function () {
        var file = metricIconUpload.files[0];
        if (!file) return;
        ScenaStore.fileToDataUrl(file, { purpose: "metric-icon", seriesId: self.series.id }).then(function (url) {
          metric.dataUrl = url;
          var picker = self.resourcesDetail.querySelector("#resMetricIconPicker");
          if (picker) picker.querySelectorAll(".keyitem-icon-option").forEach(function (b) { b.classList.remove("is-selected"); });
          self.updateKeyItemIconPreview(metricPreviewEl, url);
          syncMetricFields();
          persist();
        }).catch(function (err) {
          self.onSaveError((err && err.message) || "Could not upload icon.");
        });
      });
      var delMetric = this.resourcesDetail.querySelector("#resDeleteMetric");
      if (delMetric) delMetric.addEventListener("click", function () {
        self.series.metrics.splice(metricIdx, 1);
        self.selectedResourceId = null;
        persist();
      });
    }
  };

  ScenaGraphEditor.prototype.openCreateResourceModal = function () {
    var self = this;
    if (!this.workspaceModal) {
      this.onSaveError("Create dialog failed to open — refresh the page.");
      return;
    }
    var tab = this.resourceTab;
    this._createResourceTab = tab;
    this._workspaceModalMode = "create";
    var titleEl = this.container.querySelector("#workspaceModalTitle");
    var bodyEl = this.container.querySelector("#workspaceModalBody");
    if (!titleEl || !bodyEl) {
      this.onSaveError("Create dialog failed to open — refresh the page.");
      return;
    }
    var title = tab === "characters" ? "New character"
      : tab === "stages" ? "New stage"
      : tab === "audio" ? "Upload audio"
      : tab === "keyitems" ? "New key item"
      : "New metric";
    var placeholder = tab === "characters" ? "Mira"
      : tab === "stages" ? "Cafe interior"
      : tab === "audio" ? "Curtain rustle"
      : tab === "keyitems" ? "Brass key"
      : "affection";
    titleEl.textContent = title;
    this.resetWorkspaceModalChrome();
    if (tab === "audio") {
      var kindOpts = (ScenaStore.AUDIO_KINDS || []).map(function (k, i) {
        return '<option value="' + k.id + '"' + (i === 0 ? " selected" : "") + '>' + escapeHtml(k.label) + '</option>';
      }).join("");
      bodyEl.innerHTML =
        '<div class="field"><label>Name</label><input type="text" id="modalCreateName" placeholder="' + escapeAttr(placeholder) + '" autofocus></div>' +
        '<div class="field"><label>Type</label><select id="modalAudioKind">' + kindOpts + '</select></div>' +
        '<div class="field"><label>Audio file</label><input type="file" accept="audio/*" id="modalAudioFile">' +
        '<p class="field-hint">MP3, WAV, or OGG — under 12 MB.</p></div>';
    } else if (tab === "keyitems") {
      var defaultIcon = window.ScenaKeyItem ? ScenaKeyItem.iconForLabel("") : null;
      this._modalKeyItemIconUrl = defaultIcon ? defaultIcon.dataUrl : null;
      bodyEl.innerHTML =
        '<div class="field"><label>Name</label><input type="text" id="modalCreateName" placeholder="' + escapeAttr(placeholder) + '" autofocus></div>' +
        '<div class="field"><label>Icon</label>' +
        '<div class="resource-keyitem-preview" id="modalCreateKeyItemPreview"' +
        (this._modalKeyItemIconUrl ? ' style="background-image:url(' + this._modalKeyItemIconUrl + ')"' : "") + '>' +
        (this._modalKeyItemIconUrl ? "" : "◆") + '</div>' +
        this.renderKeyItemIconPicker(this._modalKeyItemIconUrl, "modalCreateKeyItemIconPicker") +
        '<label class="btn btn-sm">Upload custom<input type="file" accept="image/*" hidden id="modalCreateKeyItemIconUpload"></label></div>';
    } else {
      bodyEl.innerHTML =
        '<div class="field"><label>Name</label><input type="text" id="modalCreateName" placeholder="' + escapeAttr(placeholder) + '" autofocus></div>';
    }
    this.workspaceModal.hidden = false;
    var nameInput = this.container.querySelector("#modalCreateName");
    if (nameInput) {
      nameInput.focus();
      if (nameInput.select) nameInput.select();
    }
    if (tab === "keyitems") {
      var modalPreview = this.container.querySelector("#modalCreateKeyItemPreview");
      this.bindKeyItemIconPicker(this.container.querySelector("#modalCreateKeyItemIconPicker"), function (url) {
        self._modalKeyItemIconUrl = url;
      }, modalPreview);
      if (nameInput) {
        nameInput.addEventListener("input", function () {
          var suggested = window.ScenaKeyItem ? ScenaKeyItem.iconForLabel(nameInput.value.trim()) : null;
          if (!suggested) return;
          self._modalKeyItemIconUrl = suggested.dataUrl;
          self.updateKeyItemIconPreview(modalPreview, suggested.dataUrl);
          var picker = self.container.querySelector("#modalCreateKeyItemIconPicker");
          if (!picker) return;
          picker.querySelectorAll(".keyitem-icon-option").forEach(function (btn) {
            btn.classList.toggle("is-selected", self.keyItemIconUrlFromButton(btn) === suggested.dataUrl);
          });
        });
      }
      var modalIconUpload = this.container.querySelector("#modalCreateKeyItemIconUpload");
      if (modalIconUpload) modalIconUpload.addEventListener("change", function () {
        var file = modalIconUpload.files[0];
        if (!file) return;
        ScenaStore.fileToDataUrl(file, { purpose: "key-item", seriesId: self.series.id }).then(function (url) {
          self._modalKeyItemIconUrl = url;
          var picker = self.container.querySelector("#modalCreateKeyItemIconPicker");
          if (picker) picker.querySelectorAll(".keyitem-icon-option").forEach(function (b) { b.classList.remove("is-selected"); });
          self.updateKeyItemIconPreview(modalPreview, url);
        }).catch(function (err) {
          self.onSaveError((err && err.message) || "Could not upload icon.");
        });
      });
    }
  };

  ScenaGraphEditor.prototype.submitCreateResourceModal = function () {
    var self = this;
    var tab = this._createResourceTab || this.resourceTab;
    var nameEl = this.container.querySelector("#modalCreateName");
    var name = nameEl ? nameEl.value.trim() : "";
    if (!name) {
      this.onSaveError("Enter a name first.");
      if (nameEl) nameEl.focus();
      return;
    }
    var saveBtn = this.container.querySelector("#workspaceModalSave");
    if (saveBtn) saveBtn.disabled = true;

    try {
      if (tab === "characters") {
        if (!this.series.characterProfiles) this.series.characterProfiles = [];
        var p = { id: ScenaStore.assetUid("ch"), name: name, color: ScenaStore.colorFromName(name), sprites: [] };
        this.series.characterProfiles.push(p);
        this.selectedResourceId = p.id;
        this.closeModal();
        this.markDirty();
        this.renderResourcesPanel();
        if (!this.learnMode) this.saveNow();
      } else if (tab === "stages") {
        if (!this.series.backgroundScenes) this.series.backgroundScenes = [];
        var b = { id: ScenaStore.assetUid("bg"), name: name, layers: { bg: null, mg: null, fg: null } };
        this.series.backgroundScenes.push(b);
        this.selectedResourceId = b.id;
        this.closeModal();
        this.markDirty();
        this.renderResourcesPanel();
        if (!this.learnMode) this.saveNow();
      } else if (tab === "audio") {
        var fileInput = this.container.querySelector("#modalAudioFile");
        var file = fileInput && fileInput.files[0];
        if (!file) {
          if (saveBtn) saveBtn.disabled = false;
          this.onSaveError("Choose an audio file to upload.");
          return;
        }
        var kind = this.container.querySelector("#modalAudioKind").value || "sfx";
        ScenaStore.fileToAudioDataUrl(file, { seriesId: this.series.id }).then(function (result) {
          var asset = {
            id: ScenaStore.assetUid("aud"),
            label: name,
            kind: kind,
            dataUrl: result.dataUrl,
            mimeType: result.mimeType,
          };
          ScenaStore.ensureAssets(self.series).push(asset);
          self.selectedResourceId = asset.id;
          self.closeModal();
          self.markDirty();
          self.renderResourcesPanel();
          if (!self.learnMode) self.saveNow();
        }).catch(function (err) {
          if (saveBtn) saveBtn.disabled = false;
          self.onSaveError((err && err.message) || "Could not upload audio.");
        });
      } else if (tab === "keyitems") {
        if (!this.series.assets) this.series.assets = [];
        var iconUrl = this._modalKeyItemIconUrl || null;
        var asset = ScenaStore.createKeyItemAsset(this.series, { label: name, hidden: false, dataUrl: iconUrl });
        this.selectedResourceId = asset.id;
        this.closeModal();
        this.markDirty();
        this.renderResourcesPanel();
        if (!this.learnMode) this.saveNow();
      } else if (tab === "metrics") {
        this.series.metrics = this.series.metrics || [];
        var idx = this.series.metrics.length;
        this.series.metrics.push({
          key: name,
          displayName: name,
          defaultValue: 0,
          hiddenFromPlayer: false,
          hiddenFromInventory: false,
          dataUrl: null,
        });
        this.selectedResourceId = "metric_" + idx;
        this.closeModal();
        this.markDirty();
        this.renderResourcesPanel();
        if (!this.learnMode) this.saveNow();
      }
    } catch (err) {
      if (saveBtn) saveBtn.disabled = false;
      this.onSaveError((err && err.message) || "Could not create resource.");
    }
  };

  ScenaGraphEditor.prototype.showValidateGraph = function () {
    var result = ScenaStore.validateGraph(this.series);
    var titleEl = this.container.querySelector("#workspaceModalTitle");
    var bodyEl = this.container.querySelector("#workspaceModalBody");
    var saveBtn = this.container.querySelector("#workspaceModalSave");
    var cancelBtn = this.container.querySelector("#workspaceModalCancel");
    if (!this.workspaceModal || !bodyEl) return;

    if (titleEl) {
      titleEl.textContent = result.ok
        ? "Graph validation passed"
        : "Graph validation — " + result.errorCount + " error(s), " + result.warnCount + " warning(s)";
    }

    var html = "";
    if (!result.issues.length) {
      html = '<p class="field-hint">No issues found. Every beat is reachable, inside a chapter region, and connected.</p>';
    } else {
      html = '<ul class="validate-graph-list">';
      result.issues.forEach(function (issue) {
        var cls = issue.severity === "error" ? "validate-graph-item--error" : "validate-graph-item--warn";
        html += '<li class="validate-graph-item ' + cls + '">' + escapeHtml(issue.message) + "</li>";
      });
      html += "</ul>";
    }
    bodyEl.innerHTML = html;

    if (saveBtn) {
      saveBtn.textContent = "Close";
    }
    if (cancelBtn) cancelBtn.hidden = true;
    this._createResourceTab = null;
    this._workspaceModalMode = "validate";
    this.workspaceModal.hidden = false;
  };

  ScenaGraphEditor.prototype.closeModal = function () {
    if (!this.workspaceModal) return;
    this.workspaceModal.hidden = true;
    this._createResourceTab = null;
    this._workspaceModalMode = null;
    this.resetWorkspaceModalChrome();
  };

  ScenaGraphEditor.prototype.showEpisodeEditorModal = function (episode) {
    var modal = this.container.querySelector("#episodeEditorModal");
    if (!modal || !episode) return;
    this.editingEpisodeId = episode.id;
    modal.hidden = false;
    var titleEl = modal.querySelector("#episodeEditorTitle");
    var blurbEl = modal.querySelector("#episodeEditorBlurb");
    var preview = modal.querySelector("#episodeEditorThumbPreview");
    if (titleEl) titleEl.value = episode.title || "";
    if (blurbEl) blurbEl.value = episode.shortDescription || "";
    var statusEl = modal.querySelector("#episodeEditorStatusLine");
    if (statusEl) {
      var status = ScenaStore.episodePublishStatus(episode);
      var when = ScenaStore.episodePublishAt(episode);
      if (status === "live") {
        statusEl.innerHTML = '<span class="status-pill is-live">Live</span> since ' + escapeHtml(formatPublishWhen(when)) + ' — use <strong>Unpublish</strong> to take offline.';
      } else if (status === "scheduled") {
        statusEl.innerHTML = '<span class="status-pill is-scheduled">Scheduled</span> for ' + escapeHtml(formatPublishWhen(when)) + '.';
      } else {
        statusEl.innerHTML = '<span class="status-pill">Draft</span> — publish now or pick a date below.';
      }
    }
    var publishField = modal.querySelector("#episodeEditorPublishField");
    var publishAtInput = modal.querySelector("#episodeEditorPublishAt");
    var publishNowBtn = modal.querySelector("#episodeEditorPublishNow");
    var scheduleBtn = modal.querySelector("#episodeEditorSchedule");
    var modeRadios = modal.querySelectorAll('input[name="episodePublishMode"]');
    var status = ScenaStore.episodePublishStatus(episode);
    if (publishField) publishField.hidden = status === "live";
    if (publishNowBtn) {
      publishNowBtn.hidden = status === "live";
      publishNowBtn.textContent = status === "scheduled" ? "Publish now" : "Publish now";
    }
    if (scheduleBtn) scheduleBtn.hidden = status === "live";
    if (publishAtInput) {
      publishAtInput.value = isoToLocalDatetimeInput(ScenaStore.episodePublishAt(episode));
      publishAtInput.hidden = true;
    }
    modeRadios.forEach(function (radio) {
      radio.checked = radio.value === (status === "scheduled" ? "schedule" : "now");
      radio.disabled = status === "live";
    });
    function syncPublishModeUi() {
      var mode = modal.querySelector('input[name="episodePublishMode"]:checked');
      var isSchedule = mode && mode.value === "schedule";
      if (publishAtInput) publishAtInput.hidden = !isSchedule;
      if (publishNowBtn) publishNowBtn.hidden = isSchedule || status === "live";
      if (scheduleBtn) scheduleBtn.hidden = !isSchedule || status === "live";
    }
    modeRadios.forEach(function (radio) {
      radio.onchange = syncPublishModeUi;
    });
    syncPublishModeUi();
    var unpublishBtn = modal.querySelector("#episodeEditorUnpublish");
    var removeBtn = modal.querySelector("#episodeEditorRemoveRegion");
    if (unpublishBtn) unpublishBtn.hidden = !episode.isLive;
    if (removeBtn) {
      removeBtn.hidden = ScenaStore.episodeHasNodes(this.series, episode);
      removeBtn.disabled = ScenaStore.episodeHasNodes(this.series, episode);
    }
    if (preview) {
      if (episode.thumbnailDataUrl) {
        preview.style.backgroundImage = "url(" + episode.thumbnailDataUrl + ")";
        preview.textContent = "";
      } else {
        preview.style.backgroundImage = "";
        preview.textContent = "400×600";
      }
    }
    if (titleEl) titleEl.focus();
  };

  ScenaGraphEditor.prototype.closeEpisodeEditorModal = function () {
    var modal = this.container.querySelector("#episodeEditorModal");
    if (modal) modal.hidden = true;
    this.editingEpisodeId = null;
  };

  ScenaGraphEditor.prototype.applyEpisodeEditorFields = function (ep, modal) {
    if (!ep || !modal) return;
    var titleEl = modal.querySelector("#episodeEditorTitle");
    var blurbEl = modal.querySelector("#episodeEditorBlurb");
    ep.title = titleEl ? titleEl.value.trim() : "";
    ep.shortDescription = blurbEl ? blurbEl.value.trim() : "";
  };

  ScenaGraphEditor.prototype.bindEpisodeEditorModal = function () {
    var self = this;
    var modal = this.container.querySelector("#episodeEditorModal");
    if (!modal || modal.dataset.bound === "1") return;
    modal.dataset.bound = "1";

    var cancel = modal.querySelector("#episodeEditorCancel");
    var save = modal.querySelector("#episodeEditorSave");
    var playBtn = modal.querySelector("#episodeEditorPlay");
    var unpublishBtn = modal.querySelector("#episodeEditorUnpublish");
    var publishNowBtn = modal.querySelector("#episodeEditorPublishNow");
    var scheduleBtn = modal.querySelector("#episodeEditorSchedule");
    var removeBtn = modal.querySelector("#episodeEditorRemoveRegion");
    var upload = modal.querySelector("#episodeEditorThumbInput");

    if (cancel) cancel.addEventListener("click", function () { self.closeEpisodeEditorModal(); });
    modal.addEventListener("click", function (e) {
      if (e.target === modal) self.closeEpisodeEditorModal();
    });

    if (upload) {
      upload.addEventListener("change", function () {
        var file = upload.files[0];
        if (!file || !self.editingEpisodeId) return;
        var ep = (self.series.episodes || []).find(function (item) { return item.id === self.editingEpisodeId; });
        if (!ep) return;
        ScenaStore.fileToDataUrl(file, { purpose: "episode-thumb", seriesId: self.series.id }).then(function (url) {
          ep.thumbnailDataUrl = url;
          var preview = modal.querySelector("#episodeEditorThumbPreview");
          if (preview) {
            preview.style.backgroundImage = "url(" + url + ")";
            preview.textContent = "";
          }
        }).catch(function (err) {
          self.onSaveError((err && err.message) || "Could not upload thumbnail.");
        });
      });
    }

    if (playBtn) {
      playBtn.addEventListener("click", function () {
        var ep = (self.series.episodes || []).find(function (item) { return item.id === self.editingEpisodeId; });
        if (!ep) return;
        self.applyEpisodeEditorFields(ep, modal);
        self.markDirty();
        self.openEpisodeReader(ep);
      });
    }

    if (unpublishBtn) {
      unpublishBtn.addEventListener("click", function () {
        var ep = (self.series.episodes || []).find(function (item) { return item.id === self.editingEpisodeId; });
        if (!ep) return;
        self.closeEpisodeEditorModal();
        self.unpublishEpisodeNow(ep);
      });
    }

    if (publishNowBtn) {
      publishNowBtn.addEventListener("click", function () {
        var ep = (self.series.episodes || []).find(function (item) { return item.id === self.editingEpisodeId; });
        if (!ep) return;
        self.applyEpisodeEditorFields(ep, modal);
        self.closeEpisodeEditorModal();
        self.commitEpisodePublish(ep, { when: "now" });
      });
    }

    if (scheduleBtn) {
      scheduleBtn.addEventListener("click", function () {
        var ep = (self.series.episodes || []).find(function (item) { return item.id === self.editingEpisodeId; });
        if (!ep) return;
        var atInput = modal.querySelector("#episodeEditorPublishAt");
        var at = atInput ? localDatetimeToIso(atInput.value) : null;
        if (!at) {
          self.onSaveError("Pick a date and time to schedule this chapter.");
          return;
        }
        if (new Date(at) <= new Date()) {
          self.onSaveError("Schedule time must be in the future — use Publish now for immediate release.");
          return;
        }
        self.applyEpisodeEditorFields(ep, modal);
        self.closeEpisodeEditorModal();
        self.commitEpisodePublish(ep, { when: "schedule", at: at });
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        var epId = self.editingEpisodeId;
        self.closeEpisodeEditorModal();
        if (epId) self.deleteEpisodeBoundary(epId);
      });
    }

    if (save) {
      save.addEventListener("click", function () {
        var ep = (self.series.episodes || []).find(function (item) { return item.id === self.editingEpisodeId; });
        if (!ep) return;
        self.applyEpisodeEditorFields(ep, modal);
        self.closeEpisodeEditorModal();
        self.markDirty();
        self.paintAll();
        self.saveNow(true).then(function (ok) {
          if (ok && !self.learnMode) {
            self.setSaveStatus("Chapter details saved.");
          }
          self.refreshEpisodeContextBtn();
        });
      });
    }
  };

  ScenaGraphEditor.prototype.commitEpisodePublish = function (ep, opts) {
    if (!ep || this.learnMode) return Promise.resolve(false);
    var self = this;
    opts = opts || { when: "now" };
    var validation = ScenaStore.validateGraph(this.series);
    if (!validation.ok) {
      var metricErrors = (validation.issues || []).filter(function (item) {
        return item.severity === "error";
      });
      var preview = metricErrors.slice(0, 3).map(function (item) { return item.message; }).join("\n");
      if (metricErrors.length > 3) preview += "\n…and " + (metricErrors.length - 3) + " more.";
      this.onSaveError(
        "Cannot publish — fix " + validation.errorCount + " validation error(s) first. You can still save as draft.\n\n" +
        (preview || "Open Validate graph for details.")
      );
      this.showValidateGraph();
      return Promise.resolve(false);
    }
    var wasLive = ScenaStore.isEpisodePublic(ep);
    var wasScheduled = ScenaStore.isEpisodeScheduled(ep);
    ScenaStore.publishEpisode(this.series, ep, opts);
    delete this.unlockedEpisodeEdits[ep.id];
    this.syncEpisodeGraphState();
    this.markDirty();
    this.paintAll();
    return this.saveNow(true).then(function (ok) {
      if (ok && !wasLive && !wasScheduled && opts.when !== "schedule" && self.onEpisodePublished) {
        self.onEpisodePublished(ep);
      }
      if (ok) {
        var when = ScenaStore.episodePublishAt(ep);
        if (opts.when === "schedule") {
          self.setSaveStatus("Chapter " + ep.number + " scheduled for " + formatPublishWhen(when) + ".");
        } else if (wasLive || wasScheduled) {
          self.setSaveStatus("Chapter " + ep.number + " updated — live on Discover.");
        } else {
          self.setSaveStatus("Chapter " + ep.number + " published — live on Discover.");
        }
      }
      if (ok && window.ScenaFeedback && self.feedbackUserId && self.feedbackContainer) {
        ScenaFeedback.afterPublish(self.feedbackUserId, self.feedbackProfile, self.feedbackContainer);
      }
      self.refreshEpisodeContextBtn();
      return ok;
    });
  };

  ScenaGraphEditor.prototype.publishEpisodeNow = function (ep) {
    return this.commitEpisodePublish(ep, { when: "now" });
  };

  ScenaGraphEditor.prototype.getContextEpisode = function () {
    if (this.selectedId) {
      var node = this.getNode(this.selectedId);
      if (node) {
        var nodeEp = ScenaStore.episodeForNode(this.series, node);
        if (nodeEp) return nodeEp;
      }
    }
    if (this.selectedBoundaryId) {
      return (this.series.episodes || []).find(function (ep) {
        return ep.id === this.selectedBoundaryId;
      }, this) || null;
    }
    return this.episodeAtViewportCenter();
  };

  ScenaGraphEditor.prototype.episodeAtViewportCenter = function () {
    if (!this.wrap) return null;
    var rect = this.wrap.getBoundingClientRect();
    var pt = this.clientToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return ScenaStore.episodeAtCanvasPoint(this.series, pt.x, pt.y);
  };

  ScenaGraphEditor.prototype.refreshEpisodeContextBtn = function () {
    var btn = this.episodeContextBtn;
    if (!btn || this.learnMode) return;
    var ep = this.getContextEpisode();
    if (!ep) {
      btn.disabled = true;
      btn.textContent = "No chapter in view";
      btn.title = "Pan the graph so a chapter region is centered, or select a beat";
      btn.className = "btn btn-sm btn-episode-context";
      return;
    }
    btn.disabled = false;
    var unlocked = !!this.unlockedEpisodeEdits[ep.id];
    var title = ep.title || ("Episode " + ep.number);
    var pubStatus = ScenaStore.episodePublishStatus(ep);
    if (pubStatus === "draft") {
      btn.textContent = "Publish Ch. " + ep.number;
      btn.title = "Save graph and publish " + title + " immediately";
      btn.className = "btn btn-sm btn-primary btn-episode-context";
    } else if (pubStatus === "scheduled") {
      btn.textContent = "Scheduled Ch. " + ep.number;
      btn.title = formatPublishWhen(ScenaStore.episodePublishAt(ep)) + " — click to open chapter details";
      btn.className = "btn btn-sm btn-episode-context btn-episode-context--scheduled";
    } else if (!unlocked) {
      btn.textContent = "Unlock Ch. " + ep.number;
      btn.title = "Unlock " + title + " for editing (you can unlock multiple chapters)";
      btn.className = "btn btn-sm btn-episode-context btn-episode-context--unlock";
    } else {
      btn.textContent = "Update Ch. " + ep.number;
      btn.title = "Save graph and republish " + title + " to Discover";
      btn.className = "btn btn-sm btn-primary btn-episode-context btn-episode-context--update";
    }
  };

  ScenaGraphEditor.prototype.handleEpisodeContextBtn = function () {
    var ep = this.getContextEpisode();
    if (!ep) return;
    var pubStatus = ScenaStore.episodePublishStatus(ep);
    if (pubStatus === "scheduled") {
      this.selectedBoundaryId = ep.id;
      this.showEpisodeEditorModal(ep);
      return;
    }
    if (pubStatus === "live" && !this.unlockedEpisodeEdits[ep.id]) {
      this.unlockEpisodeEdit(ep.id);
      return;
    }
    this.selectedBoundaryId = ep.id;
    this.publishEpisodeNow(ep);
  };

  ScenaGraphEditor.prototype.openEpisodeFromGraph = function (episodeId) {
    var ep = (this.series.episodes || []).find(function (item) { return item.id === episodeId; });
    if (!ep) return;
    this.selectedBoundaryId = ep.id;
    this.selectNode(null);
    this.showEpisodeEditorModal(ep);
  };

  ScenaGraphEditor.prototype.renderInspector = function () {
    if (!this.inspector) return;
    var node = this.selectedId ? this.getNode(this.selectedId) : null;
    try {
      this.renderInspectorInner(node);
    } catch (err) {
      console.error(err);
      this.inspector.innerHTML =
        '<h3>Story beat</h3>' +
        '<p class="field-hint field-hint--warn">' + escapeHtml((err && err.message) || "Could not load beat settings.") + '</p>';
      if (this.onSaveError) this.onSaveError((err && err.message) || "Could not load inspector.");
    }
  };

  ScenaGraphEditor.prototype.renderInspectorInner = function (node) {
    var self = this;
    var html = "";

    if (!node) {
      if (this.selectedEdgeId) {
        var edge = this.getEdge(this.selectedEdgeId);
        if (edge) {
          var srcNode = this.getNode(edge.source);
          var tgtNode = this.getNode(edge.target);
          var srcText = srcNode && srcNode.data ? (srcNode.data.dialogueText || "Beat") : "Beat";
          var tgtText = tgtNode && tgtNode.data ? (tgtNode.data.dialogueText || "Beat") : "Beat";
          var choiceHint = "";
          if (edge.choiceId && srcNode && srcNode.data && srcNode.data.choices) {
            var ch = srcNode.data.choices.find(function (c) { return c.id === edge.choiceId; });
            if (ch) choiceHint = ' via <strong>' + escapeHtml(ch.label || ch.choiceText || "choice") + "</strong>";
          }
          html =
            "<h3>Connection</h3>" +
            "<p class=\"field-hint\">From <em>" + escapeHtml(String(srcText).slice(0, 60)) + "</em>" + choiceHint +
            " to <em>" + escapeHtml(String(tgtText).slice(0, 60)) + "</em>.</p>" +
            '<div class="inspector-actions"><button type="button" class="btn btn-danger btn-sm" id="deleteEdgeBtn">Delete connection</button></div>' +
            "<p class=\"field-hint\">Press <kbd>Delete</kbd> to remove this line.</p>";
          this.inspector.innerHTML = html;
          var delEdge = this.inspector.querySelector("#deleteEdgeBtn");
          if (delEdge) delEdge.addEventListener("click", function () { self.deleteSelectedEdge(); });
          return;
        }
      }
      if (this.selectedBoundaryId) {
        var ep = (this.series.episodes || []).find(function (item) {
          return item.id === self.selectedBoundaryId;
        });
        if (ep) {
          var nodeCount = ScenaStore.nodesInEpisode(this.series, ep).length;
          html =
            '<h3>Chapter ' + ep.number + '</h3>' +
            '<p class="field-hint">' + escapeHtml(ep.title || "Untitled chapter") +
            (ep.isLive ? ' · <span class="status-pill is-live">Live</span>' : ' · <span class="status-pill">Draft</span>') +
            '</p>' +
            '<div class="inspector-section">' +
              '<p class="field-hint">' + nodeCount + ' beat' + (nodeCount === 1 ? "" : "s") + ' in this region.</p>' +
              (ep.isLive
                ? '<button type="button" class="btn btn-sm btn-ghost" id="inspectorUnpublishEpisode">Unpublish chapter</button> '
                : "") +
              (nodeCount === 0
                ? '<button type="button" class="btn btn-sm btn-danger" id="inspectorRemoveEpisodeRegion">Remove chapter region</button>'
                : '<p class="field-hint">Delete all beats here before removing the chapter region (select boundary, press Delete).</p>') +
              '<button type="button" class="btn btn-sm" id="inspectorEditEpisodeDetails" style="margin-top:8px">Edit title &amp; thumbnail</button>' +
            '</div>';
          this.inspector.innerHTML = html;
          var unpublish = this.inspector.querySelector("#inspectorUnpublishEpisode");
          if (unpublish) unpublish.addEventListener("click", function () { self.unpublishEpisodeNow(ep); });
          var removeRegion = this.inspector.querySelector("#inspectorRemoveEpisodeRegion");
          if (removeRegion) removeRegion.addEventListener("click", function () { self.deleteEpisodeBoundary(ep.id); });
          var editDetails = this.inspector.querySelector("#inspectorEditEpisodeDetails");
          if (editDetails) editDetails.addEventListener("click", function () { self.showEpisodeEditorModal(ep); });
          return;
        }
      }
      html =
        '<h3>Story beat</h3>' +
        (this.learnMode
          ? '<div class="graph-inspector-empty">Select a beat to edit dialogue or logic. Drag from a Next or Choice plug to connect — release on blank canvas to spawn a new beat.</div>'
          : '<div class="graph-inspector-empty">Select a story beat to edit dialogue, stage, choices, or logic.</div>' +
            '<div class="inspector-actions">' +
              '<button type="button" class="btn btn-sm" id="inspectorAddBoundary">+ Episode boundary</button>' +
            '</div>' +
            '<p class="field-hint">Open <strong>Blocks</strong> to drag new beats onto the graph. Drag from a Next or Choice plug into blank space to spawn a connected beat.</p>' +
            '<p class="field-hint">Upload audio in <strong>Assets</strong> — Arleco defaults are included automatically.</p>');
      this.inspector.innerHTML = html;
      var addBoundary = this.inspector.querySelector("#inspectorAddBoundary");
      if (addBoundary) {
        addBoundary.addEventListener("click", function () {
          self.toggleBoundaryPlacement();
        });
      }
      return;
    }

    if (node.type !== "beat") ScenaStore.migrateNode(node);
    var data = node.data || {};
    var isStoryEntry = ScenaStore.isStoryEntryBeat(this.series, node.id);
    var epEntry = ScenaStore.isEpisodeEntryBeat(this.series, node.id);
    var nodeEpisode = ScenaStore.episodeForNode(this.series, node);
    var prevEpisode = nodeEpisode ? ScenaStore.previousEpisode(this.series, nodeEpisode) : null;
    var isGraphRoot = ScenaStore.isEntryBeat(this.series, node.id);
    var kind = ScenaStore.getBeatKind(node);
    var isFlowGate = kind === "flow-gate" || kind === "choice-route-gate" || kind === "route-gate" || kind === "metric-route-gate";
    var isLogic = kind === "logic";
    var isKeyItem = kind === "key-item";
    var isPresentation = ScenaStore.isPresentationBeatKind(kind);

    html = '<h3>' + escapeHtml(ScenaStore.beatKindTitle(kind)) + '</h3>' +
      '<p class="inspector-beat-id field-hint">' + escapeHtml(node.id) +
      (isStoryEntry ? ' · <strong>Story opens here</strong>' : "") +
      (epEntry && !isStoryEntry ? ' · <strong>Chapter ' + epEntry.number + ' entry</strong>' : "") +
      (isFlowGate ? ' · <strong>If / else routing</strong>' : "") +
      (isLogic ? ' · <strong>Auto-advance</strong>' : "") +
      (isKeyItem ? ' · <strong>Inventory change</strong>' : "") +
      '</p>';

    if (this.isNodePublished(node)) {
      var pubEp = ScenaStore.episodeForNode(this.series, node);
      html += '<div class="inspector-published-warn">' +
        '<strong>Published material</strong> — This beat is in Episode ' + (pubEp ? pubEp.number : "?") +
        ', which is live. Use <strong>Unlock Ch. ' + (pubEp ? pubEp.number : "?") + '</strong> in the toolbar to edit.</div>';
    }

    if (isFlowGate) {
      html += this.renderFlowGateRulesSection(data);
    } else if (isKeyItem) {
      var keyItemOpts = '<option value="">— select key item —</option>';
      ScenaStore.listKeyItemAssets(this.series).forEach(function (asset) {
        keyItemOpts += '<option value="' + escapeAttr(asset.id) + '"' +
          (data.grantsKeyItemId === asset.id ? " selected" : "") + '>' +
          escapeHtml(asset.label || asset.id) + (asset.hidden ? " (hidden)" : "") + '</option>';
      });
      var itemDelta = data.keyItemDelta != null ? data.keyItemDelta : 1;
      html += '<div class="inspector-section"><h4>Key item</h4>' +
        '<p class="field-hint">Unique tokens — readers either have this item or they do not. For stackable supplies (potions, lockpicks), define a <strong>Metric</strong> and change it with <strong>Metrics</strong> blocks.</p>' +
        '<div class="field"><label>Key item</label><select data-key="grantsKeyItemId">' + keyItemOpts + '</select></div>' +
        '<div class="field key-item-delta-toggle">' +
          '<label class="field-inline"><input type="radio" name="keyItemDelta" value="1"' + (itemDelta >= 0 ? " checked" : "") + '> Give item</label>' +
          '<label class="field-inline"><input type="radio" name="keyItemDelta" value="-1"' + (itemDelta < 0 ? " checked" : "") + '> Take item</label>' +
        '</div>' +
        (ScenaStore.listKeyItemAssets(this.series).length
          ? ""
          : '<p class="field-hint field-hint--warn">No key items yet — open the Key items tab and click + Create.</p>') +
        '</div>';
    } else if (isLogic) {
      html += '<div class="inspector-section"><h4>Metrics</h4>' +
        '<p class="field-hint">Silent beat that adjusts a score or tally, then auto-advances. Speaker, stage, and dialogue are not used here.</p>' +
        '<p class="field-hint"><strong>Amount:</strong> a positive number adds to the metric; a negative number subtracts.</p>';
      var logicMetricOpts = '<option value="">— metric —</option>';
      var logicMetricKey = (data.sets && data.sets[0] && data.sets[0].metricKey) || "";
      (this.series.metrics || []).forEach(function (m) {
        logicMetricOpts += '<option value="' + escapeAttr(m.key) + '"' + (logicMetricKey === m.key ? " selected" : "") + '>' + escapeHtml(m.displayName || m.key) + '</option>';
      });
      html += '<div class="field"><label>Adjust metric</label><select data-key="metricKey">' + logicMetricOpts + '</select></div>';
      html += this.field("Amount", "metricValue", String((data.sets && data.sets[0] && data.sets[0].value) || 1), "number");
      html += '<label class="field-inline"><input type="checkbox" id="inspIsEnd"' + (data.isEnd ? " checked" : "") + '> Story ending beat</label>';
      html += this.renderAudioSection(node, data, isGraphRoot, true);
      html += '</div>';
    } else if (isPresentation) {
      html += '<div class="inspector-section"><h4>Visual</h4>';

      if (isGraphRoot) {
        html += '<p class="field-hint">Opening beat — where the story begins. Set stage, character, and background music here; later beats inherit unless overridden.</p>';
        html += this.renderStageFields(data);
        html += this.renderCharacterFields(data);
      } else {
        html += '<label class="field-inline"><input type="checkbox" id="inspOverrideStage"' +
          (data.overrideStage ? " checked" : "") + '> Override stage</label>';
        if (data.overrideStage) {
          html += this.renderStageFields(data);
        } else {
          html += '<div class="inherit-hint"><strong>Inherited stage:</strong> ' +
            escapeHtml(ScenaStore.inheritedStageLabel(this.series, node.id)) + '</div>';
        }

        html += '<label class="field-inline" style="margin-top:12px"><input type="checkbox" id="inspOverrideCharacter"' +
          (data.overrideCharacter ? " checked" : "") + '> Override character</label>';
        if (data.overrideCharacter) {
          html += this.renderCharacterFields(data);
        } else {
          html += '<div class="inherit-hint"><strong>Inherited character:</strong> ' +
            escapeHtml(ScenaStore.inheritedCharacterLabel(this.series, node.id)) + '</div>';
        }
      }

      html += '</div>';

      html += '<div class="field"><label>Dialogue</label><textarea id="inspDialogue" rows="5">' +
        escapeHtml(data.dialogueText || (data.dialogue || []).map(function (d) {
          return (d.speaker ? d.speaker + ": " : "") + d.text;
        }).join("\n")) +
        '</textarea>' +
        '<p class="field-hint">One line per beat. Use a <strong>Flow gate</strong> upstream to branch to alternate beats.</p></div>';

      if (ScenaStore.hasChoices(node)) {
        html += '<div class="inspector-section"><h4>Choices</h4>' +
          '<p class="field-hint">Each option gets its own output plug on the active branch. ' +
          'Optionally require prior choices and/or a metric — readers only see options they qualify for.</p>' +
          this.renderInspectorChoiceList(data) +
          '</div>';
      }

      html += '<div class="inspector-section"><h4>Ending</h4>' +
        '<label class="field-inline"><input type="checkbox" id="inspIsEnd"' + (data.isEnd ? " checked" : "") + '> Story ending beat</label>' +
        '<p class="field-hint">FINIS hides the Cue plug — uncheck if another chapter continues from this beat.</p></div>';

      html += this.renderAudioSection(node, data, isGraphRoot, false);
    }

    if (ScenaStore.isStoryEntryBeat(this.series, node.id)) {
      html += '<p class="field-hint">★ Where the whole story begins (Curtain Up).</p>';
    } else if (epEntry) {
      html += '<p class="field-hint">★ Chapter ' + epEntry.number +
        ' entry — readers land here when they finish the previous chapter on a route that connects to this beat.</p>';
    } else if (nodeEpisode && prevEpisode) {
      html += '<button type="button" class="btn btn-sm" id="setChapterEntryBtn">Mark as Chapter ' +
        nodeEpisode.number + ' entry</button>';
      html += '<p class="field-hint">Entry beats should sit inside the chapter box and receive a connection from the previous chapter.</p>';
    } else if (!nodeEpisode) {
      html += '<p class="field-hint">This beat is outside every chapter region — move it into a shaded box to publish it.</p>';
    } else {
      html += '<button type="button" class="btn btn-sm" id="setEntryBtn">Set as story opening beat</button>';
    }

    if (prevEpisode) {
      var crossIn = (this.series.edges || []).filter(function (e) {
        if (e.target !== node.id) return false;
        var src = self.getNode(e.source);
        return src && ScenaStore.nodeInEpisode(self.series, src, prevEpisode);
      });
      if (crossIn.length) {
        html += '<p class="field-hint"><strong>Chapter link:</strong> connected from previous chapter' +
          (crossIn.length > 1 ? " (" + crossIn.length + " routes)" : "") + ".</p>";
      } else if (nodeEpisode && ScenaStore.previousEpisode(this.series, nodeEpisode)) {
        html += '<p class="field-hint field-hint--warn">No connection from the previous chapter yet — drag a line from that chapter\'s ending beat to here.</p>';
      }
    }

    html += '<div class="inspector-actions"><button type="button" class="btn btn-danger btn-sm" id="deleteNodeBtn">Delete beat</button></div>';

    this.inspector.innerHTML = html;

    this.inspector.querySelectorAll("input[data-key], select[data-key], textarea#inspDialogue").forEach(function (el) {
      el.addEventListener("input", function () { self.applyInspector(node); });
      el.addEventListener("change", function () {
        self.applyInspector(node);
        if (el.getAttribute("data-key") === "characterProfileId") self.renderInspector();
      });
    });

    var isEnd = this.inspector.querySelector("#inspIsEnd");
    if (isEnd) isEnd.addEventListener("change", function () { self.applyInspector(node); });

    var overrideStage = this.inspector.querySelector("#inspOverrideStage");
    if (overrideStage) {
      overrideStage.addEventListener("change", function () {
        if (overrideStage.checked && !data.backgroundSceneId) {
          var inh = ScenaStore.resolvePresentation(self.series, node.id);
          data.backgroundSceneId = inh.backgroundSceneId;
          data.overrideStage = true;
        } else {
          data.overrideStage = overrideStage.checked;
        }
        self.renderInspector();
        self.applyInspector(node);
      });
    }

    var overrideChar = this.inspector.querySelector("#inspOverrideCharacter");
    if (overrideChar) {
      overrideChar.addEventListener("change", function () {
        if (overrideChar.checked && !data.characterProfileId) {
          var inh = ScenaStore.resolvePresentation(self.series, node.id);
          data.characterProfileId = inh.characterProfileId;
          data.spriteId = inh.spriteId;
          data.slot = inh.slot || "center";
          data.overrideCharacter = true;
        } else {
          data.overrideCharacter = overrideChar.checked;
        }
        self.renderInspector();
        self.applyInspector(node);
      });
    }

    var overrideBgm = this.inspector.querySelector("#inspOverrideBgm");
    if (overrideBgm) {
      overrideBgm.addEventListener("change", function () {
        if (overrideBgm.checked && !data.bgmAssetId) {
          var inhAudio = ScenaStore.resolveAudio(self.series, node.id);
          data.bgmAssetId = inhAudio.bgmAssetId;
          data.overrideBgm = true;
        } else {
          data.overrideBgm = overrideBgm.checked;
        }
        self.renderInspector();
        self.applyInspector(node);
      });
    }

    var delBtn = this.inspector.querySelector("#deleteNodeBtn");
    if (delBtn) delBtn.addEventListener("click", function () { self.deleteSelected(); });

    var entryBtn = this.inspector.querySelector("#setEntryBtn");
    if (entryBtn) entryBtn.addEventListener("click", function () {
      self.series.entryNodeId = node.id;
      if (nodeEpisode) {
        nodeEpisode.startNodeId = node.id;
        nodeEpisode.entryNodeIds = [node.id];
      }
      if (ScenaStore.syncEpisodeEntries) ScenaStore.syncEpisodeEntries(self.series);
      self.markDirty();
      self.paintAll();
      self.renderInspector();
    });

    var chapterEntryBtn = this.inspector.querySelector("#setChapterEntryBtn");
    if (chapterEntryBtn) chapterEntryBtn.addEventListener("click", function () {
      if (!nodeEpisode) return;
      nodeEpisode.entryNodeIds = nodeEpisode.entryNodeIds || [];
      if (nodeEpisode.entryNodeIds.indexOf(node.id) < 0) nodeEpisode.entryNodeIds.push(node.id);
      if (!nodeEpisode.startNodeId) nodeEpisode.startNodeId = node.id;
      if (ScenaStore.syncEpisodeEntries) ScenaStore.syncEpisodeEntries(self.series);
      self.markDirty();
      self.paintAll();
      self.renderInspector();
    });

    var addChoice = this.inspector.querySelector("#addChoiceBtn");
    if (addChoice) addChoice.addEventListener("click", function () {
      node.data.choices = node.data.choices || [];
      var wasLinear = node.data.choices.length === 0;
      node.data.choices.push({ id: uid("c"), label: "New option", choiceText: "New option" });
      if (wasLinear) {
        self.series.edges = self.series.edges.filter(function (e) {
          return !(e.source === node.id && !e.choiceId);
        });
      }
      node.data.autoAdvance = false;
      self.renderInspector();
      self.paintAll();
      self.markDirty();
    });

    this.inspector.querySelectorAll("[data-remove-choice]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = parseInt(btn.getAttribute("data-remove-choice"), 10);
        var removed = node.data.choices[idx];
        node.data.choices.splice(idx, 1);
        if (removed) {
          self.series.edges = self.series.edges.filter(function (e) {
            return !(e.source === node.id && e.choiceId === removed.id);
          });
        }
        self.renderInspector();
        self.paintAll();
        self.markDirty();
      });
    });

    this.inspector.querySelectorAll("[data-choice-label]").forEach(function (input, i) {
      input.addEventListener("input", function () {
        if (node.data.choices[i]) {
          node.data.choices[i].label = input.value;
          node.data.choices[i].choiceText = input.value;
        }
        self.paintNodes();
        self.markDirty();
      });
    });

    this.inspector.querySelectorAll("[data-choice-gate-match]").forEach(function (select) {
      select.addEventListener("change", function () {
        var row = select.closest(".choice-row");
        if (!row) return;
        var idx = parseInt(row.getAttribute("data-choice-idx"), 10);
        var choice = node.data.choices[idx];
        if (!choice) return;
        choice.gateMatchMode = select.value === "or" ? "or" : "and";
        self.renderInspector();
        self.paintNodes();
        self.markDirty();
      });
    });

    this.inspector.querySelectorAll(".choice-add-check").forEach(function (select) {
      select.addEventListener("change", function () {
        var val = select.value;
        if (!val) return;
        var choiceIdx = parseInt(select.getAttribute("data-choice-idx"), 10);
        var choice = node.data.choices[choiceIdx];
        if (!choice) return;
        choice.requiresChecks = ScenaStore.normalizeChoiceChecks(choice);
        if (val === "choice") {
          choice.requiresChecks.push({ type: "choice", choiceIds: [] });
        } else if (val === "metric") {
          var firstMetric = (self.series.metrics && self.series.metrics[0] && self.series.metrics[0].key) || "";
          choice.requiresChecks.push({
            type: "metric",
            metricKey: firstMetric,
            op: "gte",
            value: 1,
          });
        } else if (val === "keyItem-has" || val === "keyItem-missing") {
          var firstItem = (ScenaStore.listKeyItemAssets(self.series)[0] || {}).id || "";
          choice.requiresChecks.push({
            type: "keyItem",
            assetId: firstItem,
            mode: val === "keyItem-missing" ? "missing" : "has",
          });
        }
        if (!choice.gateMatchMode) choice.gateMatchMode = "and";
        ScenaStore.syncChoiceGateFields(choice);
        select.value = "";
        self.renderInspector();
        self.paintAll();
        self.markDirty();
      });
    });

    this.inspector.querySelectorAll("[data-route-match-mode]").forEach(function (select, i) {
      select.addEventListener("change", function () {
        if (node.data.routeRules[i]) {
          node.data.routeRules[i].matchMode = select.value === "or" ? "or" : "and";
        }
        self.paintNodes();
        self.markDirty();
      });
    });

    var addRouteRule = this.inspector.querySelector("#addRouteRuleBtn");
    if (addRouteRule) addRouteRule.addEventListener("click", function () {
      node.data.routeRules = node.data.routeRules || [];
      node.data.routeRules.push({
        id: uid("route"),
        label: "Else if…",
        matchMode: "and",
        checks: [],
      });
      self.renderInspector();
      self.paintAll();
      self.markDirty();
    });

    this.inspector.querySelectorAll(".flow-add-check").forEach(function (select) {
      select.addEventListener("change", function () {
        var val = select.value;
        if (!val) return;
        var routeIdx = parseInt(select.getAttribute("data-route-idx"), 10);
        var rule = node.data.routeRules[routeIdx];
        if (!rule) return;
        rule.checks = ScenaStore.normalizeRouteChecks(rule);
        if (val === "choice") {
          rule.checks.push({ type: "choice", choiceIds: [] });
        } else if (val === "metric") {
          var firstMetric = (self.series.metrics && self.series.metrics[0] && self.series.metrics[0].key) || "";
          rule.checks.push({
            type: "metric",
            metricKey: firstMetric,
            op: "gte",
            value: 5,
          });
        } else if (val === "keyItem-has" || val === "keyItem-missing") {
          var firstItem = (ScenaStore.listKeyItemAssets(self.series)[0] || {}).id || "";
          rule.checks.push({
            type: "keyItem",
            assetId: firstItem,
            mode: val === "keyItem-missing" ? "missing" : "has",
          });
        }
        select.value = "";
        self.renderInspector();
        self.paintAll();
        self.markDirty();
      });
    });

    this.inspector.querySelectorAll("[data-remove-check]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var block = btn.closest(".flow-check-block");
        var choiceStack = btn.closest(".choice-gate-stack");
        var stack = btn.closest(".flow-rule-stack");
        if (!block) return;
        var checkIdx = parseInt(block.getAttribute("data-check-idx"), 10);
        if (choiceStack) {
          var choiceIdx = parseInt(choiceStack.getAttribute("data-choice-idx"), 10);
          var choice = node.data.choices[choiceIdx];
          if (!choice) return;
          choice.requiresChecks = ScenaStore.normalizeChoiceChecks(choice);
          choice.requiresChecks.splice(checkIdx, 1);
          ScenaStore.syncChoiceGateFields(choice);
          self.renderInspector();
          self.paintAll();
          self.markDirty();
          return;
        }
        if (!stack) return;
        var routeIdx = parseInt(stack.getAttribute("data-route-idx"), 10);
        var rule = node.data.routeRules[routeIdx];
        if (!rule) return;
        rule.checks = ScenaStore.normalizeRouteChecks(rule);
        rule.checks.splice(checkIdx, 1);
        self.renderInspector();
        self.paintAll();
        self.markDirty();
      });
    });

    this.inspector.querySelectorAll("[data-flow-metric-key], [data-flow-metric-op], [data-flow-metric-value], [data-flow-keyitem-asset]").forEach(function (el) {
      el.addEventListener("input", function () { self.applyInspector(node); self.markDirty(); });
      el.addEventListener("change", function () { self.applyInspector(node); self.markDirty(); });
    });

    this.inspector.querySelectorAll('input[name="keyItemDelta"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        data.keyItemDelta = parseInt(radio.value, 10) || 1;
        self.applyInspector(node);
        self.paintNodes();
        self.markDirty();
      });
    });

    this.inspector.querySelectorAll("[data-remove-route]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = parseInt(btn.getAttribute("data-remove-route"), 10);
        var removed = node.data.routeRules[idx];
        node.data.routeRules.splice(idx, 1);
        if (removed) {
          self.series.edges = self.series.edges.filter(function (e) {
            return !(e.source === node.id && e.choiceId === removed.id);
          });
        }
        self.renderInspector();
        self.paintAll();
        self.markDirty();
      });
    });

    this.inspector.querySelectorAll("[data-route-label]").forEach(function (input, i) {
      input.addEventListener("input", function () {
        if (node.data.routeRules[i]) node.data.routeRules[i].label = input.value;
        self.paintNodes();
        self.markDirty();
      });
    });

    this.bindChoicePickers(node, function (picker) {
      var routeRow = picker.closest(".flow-rule-stack") || picker.closest(".route-rule-row");
      if (routeRow) {
        self.applyInspector(node);
        return;
      }
      if (picker.closest(".choice-gate-stack")) {
        self.applyInspector(node);
        self.paintNodes();
        return;
      }
      if (picker.getAttribute("data-key") === "requiresChoiceIds") {
        node.data.requiresChoiceIds = self.readChoicePickerIds(picker);
      }
      if (picker.getAttribute("data-variant-idx") != null) {
        self.applyInspector(node);
      }
    });

    this.inspector.querySelectorAll("[data-route-metric-key], [data-route-metric-op], [data-route-metric-value]").forEach(function (el) {
      el.addEventListener("input", function () { self.applyInspector(node); self.markDirty(); });
      el.addEventListener("change", function () { self.applyInspector(node); self.markDirty(); });
    });
  };

  ScenaGraphEditor.prototype.renderChoicePicker = function (selectedIds, opts) {
    opts = opts || {};
    var choices = ScenaStore.listSeriesChoices(this.series);
    var selected = selectedIds || [];
    var attrs = ' class="choice-picker"';
    if (opts.key) attrs = ' class="choice-picker" data-key="' + escapeAttr(opts.key) + '"';
    if (opts.routeIdx != null) attrs = ' class="choice-picker" data-route-idx="' + opts.routeIdx + '"';
    if (opts.checkIdx != null) attrs += ' data-check-idx="' + opts.checkIdx + '"';
    if (opts.variantIdx != null) attrs = ' class="choice-picker" data-variant-idx="' + opts.variantIdx + '"';
    if (opts.choiceIdx != null) attrs = ' class="choice-picker" data-choice-idx="' + opts.choiceIdx + '"';

    var html = "<div" + attrs + ">";
    html += '<div class="choice-picker-chips">';
    if (!selected.length) {
      html += '<span class="choice-picker-empty">No choices selected</span>';
    }
    selected.forEach(function (id) {
      html += this.renderChoiceChip(id, choices);
    }, this);
    html += "</div>";

    if (choices.length) {
      var groups = {};
      choices.forEach(function (c) {
        var groupKey = (c.episodeNumber != null ? c.episodeNumber : 999) + "|" + c.episodeTitle;
        if (!groups[groupKey]) {
          groups[groupKey] = { number: c.episodeNumber, title: c.episodeTitle, items: [] };
        }
        groups[groupKey].items.push(c);
      });
      html += '<select class="choice-picker-add"><option value="">+ Pick a prior choice…</option>';
      Object.keys(groups).sort(function (a, b) {
        var ga = groups[a];
        var gb = groups[b];
        var na = ga.number != null ? ga.number : 9999;
        var nb = gb.number != null ? gb.number : 9999;
        return na - nb || ga.title.localeCompare(gb.title);
      }).forEach(function (groupKey) {
        var group = groups[groupKey];
        var available = group.items.filter(function (c) { return selected.indexOf(c.id) < 0; });
        if (!available.length) return;
        var groupLabel = group.number != null
          ? ("Ch. " + group.number + " · " + group.title)
          : group.title;
        html += '<optgroup label="' + escapeAttr(groupLabel) + '">';
        available.forEach(function (c) {
          var optionLabel = c.label;
          if (c.dialoguePreview) optionLabel += ' — "' + c.dialoguePreview + '"';
          html += '<option value="' + escapeAttr(c.id) + '">' + escapeHtml(optionLabel) + "</option>";
        });
        html += "</optgroup>";
      });
      html += "</select>";
    } else {
      html += '<p class="field-hint">Add choice beats earlier in the story first.</p>';
    }

    html += "</div>";
    return html;
  };

  ScenaGraphEditor.prototype.renderChoiceChip = function (choiceId, catalog) {
    catalog = catalog || ScenaStore.listSeriesChoices(this.series);
    var meta = catalog.find(function (c) { return c.id === choiceId; });
    var label = meta ? meta.label : choiceId;
    var html = '<span class="choice-chip" data-choice-id="' + escapeAttr(choiceId) + '">' +
      '<span class="choice-chip-text">' +
      '<strong class="choice-chip-label">' + escapeHtml(label) + "</strong>";
    if (meta && meta.dialoguePreview) {
      html += '<span class="choice-chip-context">From: “' + escapeHtml(meta.dialoguePreview) + "”</span>";
    }
    if (meta && meta.episodeNumber != null) {
      html += '<span class="choice-chip-meta">Ch. ' + meta.episodeNumber + "</span>";
    }
    html += '</span><button type="button" class="choice-chip-remove" title="Remove">×</button></span>';
    return html;
  };

  ScenaGraphEditor.prototype.readChoicePickerIds = function (pickerEl) {
    if (!pickerEl) return [];
    var ids = [];
    pickerEl.querySelectorAll(".choice-chip[data-choice-id]").forEach(function (chip) {
      var id = chip.getAttribute("data-choice-id");
      if (id && ids.indexOf(id) < 0) ids.push(id);
    });
    return ids;
  };

  ScenaGraphEditor.prototype.bindChoicePickers = function (node, onChange) {
    var self = this;
    this.inspector.querySelectorAll(".choice-picker").forEach(function (picker) {
      if (picker.dataset.bound) return;
      picker.dataset.bound = "1";

      picker.addEventListener("click", function (e) {
        if (!e.target.classList.contains("choice-chip-remove")) return;
        var chip = e.target.closest(".choice-chip");
        if (chip) chip.remove();
        var chips = picker.querySelector(".choice-picker-chips");
        if (chips && !chips.querySelector(".choice-chip") && !picker.querySelector(".choice-picker-empty")) {
          chips.insertAdjacentHTML("beforeend", '<span class="choice-picker-empty">No choices selected</span>');
        }
        if (onChange) onChange(picker);
        self.markDirty();
      });

      var addSelect = picker.querySelector(".choice-picker-add");
      if (addSelect) {
        addSelect.addEventListener("change", function () {
          var id = addSelect.value;
          if (!id) return;
          if (picker.querySelector('.choice-chip[data-choice-id="' + id + '"]')) {
            addSelect.value = "";
            return;
          }
          var empty = picker.querySelector(".choice-picker-empty");
          if (empty) empty.remove();
          var chips = picker.querySelector(".choice-picker-chips");
          chips.insertAdjacentHTML("beforeend", self.renderChoiceChip(id));
          addSelect.value = "";
          if (onChange) onChange(picker);
          self.markDirty();
        });
      }
    });
  };

  ScenaGraphEditor.prototype.renderInspectorChoiceList = function (data) {
    var self = this;
    var html = '<div class="choice-list" id="choiceList">';
    (data.choices || []).forEach(function (ch, i) {
      ch = ScenaStore.syncChoiceGateFields(ch);
      var checks = ScenaStore.normalizeChoiceChecks(ch);
      var gateCount = checks.length;
      var gateMode = ch.gateMatchMode === "or" ? "or" : "and";
      html += '<div class="choice-row choice-row--stacked" data-choice-idx="' + i + '">' +
        '<div class="choice-row-main">' +
          '<input type="text" data-choice-label value="' + escapeAttr(ch.choiceText || ch.label || "") + '">' +
          '<button type="button" class="btn btn-sm btn-ghost" data-remove-choice="' + i + '">×</button>' +
        '</div>' +
        '<div class="choice-req-section">' +
          '<p class="choice-req-heading">Show only when</p>';
      if (gateCount > 1) {
        html += '<div class="choice-gate-match">' +
          '<label class="choice-gate-match-label">Requirements match</label>' +
          '<select data-choice-gate-match>' +
            '<option value="and"' + (gateMode === "and" ? " selected" : "") + '>All (AND)</option>' +
            '<option value="or"' + (gateMode === "or" ? " selected" : "") + '>Any (OR)</option>' +
          '</select></div>';
      }
      html += '<div class="flow-check-stack choice-req-stack choice-gate-stack" data-choice-idx="' + i + '">';
      if (!checks.length) {
        html += '<p class="field-hint choice-req-empty">Add a requirement below to hide this option until it passes.</p>';
      }
      checks.forEach(function (check, checkIdx) {
        html += self.renderFlowCheckBlock(i, checkIdx, check, { choiceIdx: i });
      });
      html += '</div>' +
        '<select class="choice-add-check" data-choice-idx="' + i + '">' +
          '<option value="">+ Add requirement</option>' +
          '<option value="choice">Prior choice…</option>' +
          '<option value="metric">Score or tally…</option>' +
          '<option value="keyItem-has">Has item…</option>' +
          '<option value="keyItem-missing">Missing item…</option>' +
        '</select>' +
        (gateCount
          ? '<p class="field-hint choice-metric-hint">' +
            (gateCount > 1 && gateMode === "or"
              ? "Hidden until any requirement passes."
              : "Hidden until every requirement passes.") +
            '</p>'
          : "") +
        '</div></div>';
    });
    html += '</div><button type="button" class="btn btn-sm" id="addChoiceBtn">+ Add choice</button>';
    return html;
  };

  ScenaGraphEditor.prototype.renderFlowCheckBlock = function (ruleIdx, checkIdx, check, context) {
    var self = this;
    context = context || {};
    check = check || {};
    var type = check.type || "choice";
    var html = '<div class="flow-check-block" data-check-idx="' + checkIdx + '" data-check-type="' + escapeAttr(type) + '">' +
      '<span class="flow-check-connector" aria-hidden="true"></span>' +
      '<div class="flow-check-body">';
    var pickerOpts = context.choiceIdx != null
      ? { choiceIdx: context.choiceIdx, checkIdx: checkIdx }
      : { routeIdx: ruleIdx, checkIdx: checkIdx };
    if (type === "choice") {
      html += '<span class="flow-check-type-label">Player picked…</span>' +
        self.renderChoicePicker(check.choiceIds || [], pickerOpts);
    } else if (type === "metric") {
      var metricOps = ScenaStore.metricCompareOps();
      var metricGateOpts = '<option value="">— metric —</option>';
      (self.series.metrics || []).forEach(function (m) {
        metricGateOpts += '<option value="' + escapeAttr(m.key) + '"' +
          (check.metricKey === m.key ? " selected" : "") + '>' + escapeHtml(m.displayName || m.key) + '</option>';
      });
      var opOpts = "";
      metricOps.forEach(function (op) {
        opOpts += '<option value="' + op.id + '"' + ((check.op || "gte") === op.id ? " selected" : "") + '>' +
          escapeHtml(op.label) + '</option>';
      });
      html += '<span class="flow-check-type-label">Score or tally…</span>' +
        '<div class="choice-metric-gate flow-check-metric">' +
          '<select data-flow-metric-key>' + metricGateOpts + '</select>' +
          '<select data-flow-metric-op">' + opOpts + '</select>' +
          '<input type="number" data-flow-metric-value value="' + escapeAttr(String(check.value != null ? check.value : 0)) + '">' +
        '</div>';
    } else if (type === "keyItem") {
      var keyItemOpts = '<option value="">— item —</option>';
      ScenaStore.listKeyItemAssets(self.series).forEach(function (asset) {
        keyItemOpts += '<option value="' + escapeAttr(asset.id) + '"' +
          (check.assetId === asset.id ? " selected" : "") + '>' + escapeHtml(asset.label || asset.id) + '</option>';
      });
      var modeLabel = (check.mode || "has") === "missing" ? "Missing item…" : "Has item…";
      html += '<span class="flow-check-type-label">' + escapeHtml(modeLabel) + '</span>' +
        '<select data-flow-keyitem-asset class="flow-check-keyitem-select">' + keyItemOpts + '</select>' +
        '<input type="hidden" data-flow-keyitem-mode value="' + escapeAttr(check.mode || "has") + '">';
    }
    html += '<button type="button" class="btn btn-sm btn-ghost flow-check-remove" data-remove-check="' + checkIdx + '" title="Remove check">×</button>' +
      '</div></div>';
    return html;
  };

  ScenaGraphEditor.prototype.renderFlowGateRulesSection = function (data) {
    var self = this;
    var rules = data.routeRules || [];
    var html = '<div class="inspector-section"><h4>Flow routes</h4>' +
      '<p class="field-hint">Stack checks inside each route. Default: <strong>all must pass</strong>. Switch to <strong>any</strong> for OR logic. ' +
      'Routes are checked top to bottom. Connect each output plug to a different beat. <strong>Else</strong> is the fallback.</p>' +
      '<div class="route-rule-list flow-rule-list" id="routeRuleList">';
    rules.forEach(function (rule, idx) {
      var checks = ScenaStore.normalizeRouteChecks(rule);
      var matchMode = rule.matchMode === "or" ? "or" : "and";
      html += '<div class="flow-rule-stack route-rule-row" data-route-idx="' + idx + '">' +
        '<div class="field"><label>' + (idx === 0 ? "If label" : "Else if label") + '</label>' +
        '<input type="text" data-route-label value="' + escapeAttr(rule.label || "") + '" placeholder="Secret path"></div>' +
        '<div class="field flow-match-mode">' +
          '<label>Checks match when</label>' +
          '<select data-route-match-mode>' +
            '<option value="and"' + (matchMode === "and" ? " selected" : "") + '>All of these pass</option>' +
            '<option value="or"' + (matchMode === "or" ? " selected" : "") + '>Any of these pass</option>' +
          '</select>' +
        '</div>' +
        '<div class="flow-check-stack">';
      if (!checks.length) {
        html += '<p class="field-hint flow-check-empty">No checks yet — add one below.</p>';
      }
      checks.forEach(function (check, checkIdx) {
        html += self.renderFlowCheckBlock(idx, checkIdx, check);
      });
      html += '</div>' +
        '<select class="flow-add-check" data-route-idx="' + idx + '">' +
          '<option value="">+ Add check</option>' +
          '<option value="choice">Player picked…</option>' +
          '<option value="metric">Score or tally…</option>' +
          '<option value="keyItem-has">Has item…</option>' +
          '<option value="keyItem-missing">Missing item…</option>' +
        '</select>' +
        '<button type="button" class="btn btn-sm btn-ghost" data-remove-route="' + idx + '">Remove route</button>' +
      '</div>';
    });
    html += '</div><button type="button" class="btn btn-sm" id="addRouteRuleBtn">+ Else if route</button>' +
      '<p class="field-hint" style="margin-top:12px">Drag from the <strong>Else</strong> plug for the default branch when nothing matches.</p></div>';
    return html;
  };

  ScenaGraphEditor.prototype.readFlowChecksFromRow = function (row) {
    var self = this;
    var checks = [];
    row.querySelectorAll(".flow-check-block").forEach(function (block) {
      var type = block.getAttribute("data-check-type") || "choice";
      if (type === "choice") {
        var picker = block.querySelector(".choice-picker");
        checks.push({ type: "choice", choiceIds: picker ? self.readChoicePickerIds(picker) : [] });
      } else if (type === "metric") {
        var keyEl = block.querySelector("[data-flow-metric-key]");
        var opEl = block.querySelector("[data-flow-metric-op]");
        var valEl = block.querySelector("[data-flow-metric-value]");
        var key = keyEl ? keyEl.value : "";
        if (key) {
          checks.push({
            type: "metric",
            metricKey: key,
            op: (opEl && opEl.value) || "gte",
            value: valEl ? (parseFloat(valEl.value) || 0) : 0,
          });
        }
      } else if (type === "keyItem") {
        var assetEl = block.querySelector("[data-flow-keyitem-asset]");
        var modeEl = block.querySelector("[data-flow-keyitem-mode]");
        var assetId = assetEl ? assetEl.value : "";
        if (assetId) {
          checks.push({
            type: "keyItem",
            assetId: assetId,
            mode: (modeEl && modeEl.value) || "has",
          });
        }
      }
    });
    return checks;
  };

  ScenaGraphEditor.prototype.renderMetricRouteRulesSection = function (data) {
    var self = this;
    var metricOps = ScenaStore.metricCompareOps();
    var rules = data.routeRules || [];
    var html = '<div class="inspector-section"><h4>Metric routes</h4>' +
      '<p class="field-hint">Checked top to bottom against the reader\'s current metrics. ' +
      'Connect each output plug to a different path. <strong>Else</strong> is the fallback.</p>' +
      '<div class="route-rule-list" id="routeRuleList">';
    rules.forEach(function (rule, idx) {
      var req = rule.requiresMetric || {};
      var metricGateOpts = '<option value="">— metric —</option>';
      (self.series.metrics || []).forEach(function (m) {
        metricGateOpts += '<option value="' + escapeAttr(m.key) + '"' +
          (req.metricKey === m.key ? " selected" : "") + '>' + escapeHtml(m.displayName || m.key) + '</option>';
      });
      var opOpts = "";
      metricOps.forEach(function (op) {
        opOpts += '<option value="' + op.id + '"' + ((req.op || "gte") === op.id ? " selected" : "") + '>' +
          escapeHtml(op.label) + '</option>';
      });
      html += '<div class="route-rule-row" data-route-idx="' + idx + '">' +
        '<div class="field"><label>' + (idx === 0 ? "If label" : "Else if label") + '</label>' +
        '<input type="text" data-route-label value="' + escapeAttr(rule.label || "") + '" placeholder="High trust"></div>' +
        '<div class="field"><label>Metric condition</label></div>' +
        '<div class="choice-metric-gate">' +
          '<select data-route-metric-key>' + metricGateOpts + '</select>' +
          '<select data-route-metric-op">' + opOpts + '</select>' +
          '<input type="number" data-route-metric-value value="' + escapeAttr(String(req.value != null ? req.value : 0)) + '">' +
        '</div>' +
        '<button type="button" class="btn btn-sm btn-ghost" data-remove-route="' + idx + '">Remove</button>' +
      '</div>';
    });
    html += '</div><button type="button" class="btn btn-sm" id="addRouteRuleBtn">+ Else if route</button>' +
      '<p class="field-hint" style="margin-top:12px">Drag from the <strong>Else</strong> plug for the default branch.</p></div>';
    return html;
  };

  ScenaGraphEditor.prototype.readRouteRulesFromInspector = function (existing, kind) {
    var rules = [];
    var prior = existing || [];
    var isFlowGate = kind === "flow-gate" || kind === "choice-route-gate" || kind === "route-gate" || kind === "metric-route-gate";
    this.inspector.querySelectorAll(".route-rule-row").forEach(function (row, i) {
      var labelEl = row.querySelector("[data-route-label]");
      var rule = {
        id: (prior[i] && prior[i].id) ? prior[i].id : uid("route"),
        label: labelEl ? labelEl.value.trim() : "",
      };
      if (isFlowGate) {
        rule.checks = this.readFlowChecksFromRow(row);
        var matchEl = row.querySelector("[data-route-match-mode]");
        rule.matchMode = (matchEl && matchEl.value === "or") ? "or" : "and";
        rules.push(rule);
        return;
      }
      if (kind === "metric-route-gate") {
        var keyEl = row.querySelector("[data-route-metric-key]");
        var opEl = row.querySelector("[data-route-metric-op]");
        var valEl = row.querySelector("[data-route-metric-value]");
        var key = keyEl ? keyEl.value : "";
        if (key) {
          rule.requiresMetric = {
            metricKey: key,
            op: (opEl && opEl.value) || "gte",
            value: valEl ? (parseFloat(valEl.value) || 0) : 0,
          };
        }
        rules.push(rule);
        return;
      }
      var picker = row.querySelector(".choice-picker");
      rule.choiceIds = picker ? this.readChoicePickerIds(picker) : [];
      rules.push(rule);
    }, this);
    return rules;
  };

  ScenaGraphEditor.prototype.renderStageFields = function (data) {
    var bgs = ScenaStore.ensureBackgrounds(this.series);
    var bgOpts = '<option value="">— None —</option>';
    bgs.forEach(function (b) {
      bgOpts += '<option value="' + b.id + '"' + (data.backgroundSceneId === b.id ? " selected" : "") + '>' + escapeHtml(b.name) + '</option>';
    });
    return '<div class="field"><label>Stage</label><select data-key="backgroundSceneId">' + bgOpts + '</select></div>';
  };

  ScenaGraphEditor.prototype.renderCharacterFields = function (data) {
    var profiles = ScenaStore.ensureProfiles(this.series);
    var profileOpts = '<option value="">— Narration / none —</option>';
    profiles.forEach(function (p) {
      profileOpts += '<option value="' + p.id + '"' + (data.characterProfileId === p.id ? " selected" : "") + '>' + escapeHtml(p.name) + '</option>';
    });
    var sprites = ScenaStore.spritesForProfile(this.series, data.characterProfileId);
    var spriteOpts = '<option value="">— None —</option>';
    sprites.forEach(function (s) {
      spriteOpts += '<option value="' + s.id + '"' + (data.spriteId === s.id ? " selected" : "") + '>' + escapeHtml(s.label) + '</option>';
    });
    return '<div class="field"><label>Character profile</label><select data-key="characterProfileId">' + profileOpts + '</select></div>' +
      '<div class="field"><label>Sprite pose</label><select data-key="spriteId">' + spriteOpts + '</select></div>' +
      '<div class="field"><label>Stage slot</label><select data-key="slot">' +
      ["left", "center", "right"].map(function (s) {
        return '<option value="' + s + '"' + (data.slot === s ? " selected" : "") + '>' + s + '</option>';
      }).join("") + '</select></div>';
  };

  ScenaGraphEditor.prototype.field = function (label, key, value, hint, type) {
    type = type || "text";
    return '<div class="field"><label>' + label + '</label><input type="' + type + '" data-key="' + key + '" value="' + escapeAttr(value) + '">' +
      (hint ? '<p class="field-hint">' + hint + '</p>' : '') + '</div>';
  };

  ScenaGraphEditor.prototype.applyInspector = function (node) {
    if (node.type !== "beat") ScenaStore.migrateNode(node);
    var data = node.data;
    var kind = ScenaStore.getBeatKind(node);
    var isEntry = ScenaStore.isEntryBeat(this.series, node.id);

    if (ScenaStore.isPresentationBeatKind(kind)) {
      if (isEntry) {
        data.overrideStage = false;
        data.overrideCharacter = false;
      } else {
        var oStage = this.inspector.querySelector("#inspOverrideStage");
        var oChar = this.inspector.querySelector("#inspOverrideCharacter");
        if (oStage) data.overrideStage = oStage.checked;
        if (oChar) data.overrideCharacter = oChar.checked;
      }

      if (isEntry || data.overrideStage) {
        var stageEl = this.inspector.querySelector('[data-key="backgroundSceneId"]');
        if (stageEl) data.backgroundSceneId = stageEl.value || null;
      }

      if (isEntry || data.overrideCharacter) {
        var profileEl = this.inspector.querySelector('[data-key="characterProfileId"]');
        var spriteEl = this.inspector.querySelector('[data-key="spriteId"]');
        var slotEl = this.inspector.querySelector('[data-key="slot"]');
        if (profileEl) data.characterProfileId = profileEl.value || null;
        if (spriteEl) data.spriteId = spriteEl.value || null;
        if (slotEl) data.slot = slotEl.value || "center";
      }

      var resolved = this.effectivePresentation(node);
      var profileName = ScenaStore.speakerDisplayName(
        { data: { characterProfileId: resolved.characterProfileId } },
        this.series
      );
      if (profileName === "Narration") profileName = "";

      var dialogueEl = this.inspector.querySelector("#inspDialogue");
      if (dialogueEl) {
        var dialogueRaw = dialogueEl.value;
        data.dialogueText = dialogueRaw.trim();
        data.dialogue = dialogueRaw.split("\n").filter(Boolean).map(function (line) {
          var idx = line.indexOf(":");
          if (idx > 0) return { speaker: line.slice(0, idx).trim(), text: line.slice(idx + 1).trim() };
          return { speaker: profileName, text: line.trim() };
        });
      }

      var self = this;
      this.inspector.querySelectorAll(".choice-gate-stack").forEach(function (stack) {
        var idx = parseInt(stack.getAttribute("data-choice-idx"), 10);
        if (!data.choices[idx]) return;
        data.choices[idx].requiresChecks = self.readFlowChecksFromRow(stack);
        var row = stack.closest(".choice-row");
        var matchEl = row ? row.querySelector("[data-choice-gate-match]") : null;
        if (matchEl) {
          data.choices[idx].gateMatchMode = matchEl.value === "or" ? "or" : "and";
        }
        ScenaStore.syncChoiceGateFields(data.choices[idx]);
      });
    }

    var endEl = this.inspector.querySelector("#inspIsEnd");
    if (endEl) data.isEnd = endEl.checked;

    if (isEntry || data.overrideBgm) {
      var bgmEl = this.inspector.querySelector('[data-key="bgmAssetId"]');
      if (bgmEl) data.bgmAssetId = bgmEl.value || null;
    }
    var voiceEl = this.inspector.querySelector('[data-key="voiceAssetId"]');
    if (voiceEl) data.voiceAssetId = voiceEl.value || null;
    var sfxEl = this.inspector.querySelector('[data-key="sfxAssetId"]');
    if (sfxEl) data.sfxAssetId = sfxEl.value || null;

    var metricEl = this.inspector.querySelector('[data-key="metricKey"]');
    var valEl = this.inspector.querySelector('[data-key="metricValue"]');
    if (kind === "logic" && metricEl && valEl) {
      var key = metricEl.value;
      var val = parseFloat(valEl.value) || 0;
      data.sets = key ? [{ metricKey: key, op: "add", value: val }] : [];
      data.autoAdvance = true;
    }

    if (kind === "key-item") {
      var grantEl = this.inspector.querySelector('[data-key="grantsKeyItemId"]');
      if (grantEl) {
        data.grantsKeyItemId = grantEl.value || null;
        data.autoAdvance = true;
        data.beatKind = "key-item";
      }
      var deltaRadio = this.inspector.querySelector('input[name="keyItemDelta"]:checked');
      if (deltaRadio) data.keyItemDelta = parseInt(deltaRadio.value, 10) || 1;
    }

    if (ScenaStore.isRouterNode(node)) {
      data.isRouteGate = true;
      data.autoAdvance = true;
      data.beatKind = "flow-gate";
      if (this.inspector.querySelector("#routeRuleList")) {
        data.routeRules = this.readRouteRulesFromInspector(data.routeRules, data.beatKind);
      }
    }

    this.paintNodes();
    this.paintEdges();
    this.renderPreview();
    this.markDirty();
  };

  ScenaGraphEditor.prototype.notifyLearnChange = function () {
    if (!this.learnMode || !this.learnValidate || !this.onLearnChange) return;
    var result = this.learnValidate(this.series);
    this.onLearnChange(result || { ok: false });
  };

  ScenaGraphEditor.prototype.markDirty = function () {
    if (this.learnMode) {
      this.notifyLearnChange();
      return;
    }
    this.isDirty = true;
    this.setSaveStatus("Unsaved changes");
  };

  ScenaGraphEditor.prototype.saveNow = function (force) {
    if (!force && !this.isDirty) return Promise.resolve(true);
    this.setSaveStatus("Saving…");
    ScenaStore.normalizeSeries(this.series);
    var self = this;
    return Promise.resolve(this.onChange(this.series)).then(function (result) {
      result = result || { ok: true };
      if (result.ok === false) {
        self.isDirty = true;
        self.setSaveStatus("Save failed");
        if (result.local) {
          self.onSaveError((result.error || "Cloud save failed.") + " Your copy is saved in this browser.");
        } else {
          self.onSaveError(result.error || "Could not save.");
        }
        return false;
      }
      self.isDirty = false;
      self.setSaveStatus(result.imagesPending ? "Saved (images local)" : (result.cloud ? "Saved to cloud" : "Saved"));
      if (window.ScenaFeedback && self.feedbackUserId && self.feedbackContainer) {
        ScenaFeedback.afterSave(self.feedbackUserId, self.feedbackProfile, self.feedbackContainer);
      }
      return true;
    });
  };

  ScenaGraphEditor.prototype.refreshSaveStatus = function () {
    this.setSaveStatus(this.isDirty ? "Unsaved changes" : "Saved");
  };

  ScenaGraphEditor.prototype.setSaveStatus = function (text) {
    if (this.saveStatusEl) {
      this.saveStatusEl.textContent = text;
      this.saveStatusEl.classList.toggle("is-saving", text.indexOf("Saving") >= 0);
      this.saveStatusEl.classList.toggle("is-unsaved", text.indexOf("Unsaved") >= 0);
    }
    if (this.saveBtn) {
      this.saveBtn.disabled = !this.isDirty || text.indexOf("Saving") >= 0;
    }
  };

  ScenaGraphEditor.prototype.bindGlobalKeys = function () {
    var self = this;
    window.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        self.saveNow();
        return;
      }
      if (e.target.matches("input, textarea, select")) return;
      if (self.playMode && e.key === "Escape") {
        e.preventDefault();
        if (self.readerMenu) {
          if (self.readerMenu.menuOpen) self.readerMenu.close();
          else if (!self.playEnded) self.readerMenu.open();
        }
        return;
      }
      if (self.playMode && (self.readerMenu && self.readerMenu.menuOpen)) return;
      if (self.playMode && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        self.advancePlay();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && self.selectedEdgeId) {
        e.preventDefault();
        self.deleteSelectedEdge();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && self.selectedId) {
        e.preventDefault();
        self.deleteSelected();
      }
    });
  };

  ScenaGraphEditor.prototype.renderMarketplacePanel = function () {
    var self = this;
    var shell = this.container.querySelector("#workspaceResources");
    if (!shell) return;

    self.marketplaceCategory = self.marketplaceCategory || "";
    self.marketplaceQuery = self.marketplaceQuery || "";
    self.marketplaceSelectedId = self.marketplaceSelectedId || "";

    var split = shell.querySelector(".resources-split");
    if (split) split.classList.add("resources-split--store");

    var userId = self.feedbackUserId || null;
    var balancePromise = window.ScenaWallet && userId
      ? ScenaWallet.load(userId).then(function () { return ScenaWallet.getBalance(userId); })
      : Promise.resolve(null);

    balancePromise.then(function (balance) {
      return ScenaMarketplace.loadListings({
        category: self.marketplaceCategory,
        query: self.marketplaceQuery,
      }).then(function (listings) {
        var detailHtml = "";
        if (self.marketplaceSelectedId) {
          return ScenaMarketplace.getListing(self.marketplaceSelectedId, userId).then(function (listing) {
            detailHtml = ScenaMarketplace.renderListingDetail(listing, { showPackUpsell: true });
            return { listings: listings, detailHtml: detailHtml, balance: balance };
          });
        }
        return { listings: listings, detailHtml: detailHtml, balance: balance };
      });
    }).then(function (payload) {
      var html = ScenaMarketplace.renderStorePanel(payload.listings, {
        category: self.marketplaceCategory,
        query: self.marketplaceQuery,
        selectedId: self.marketplaceSelectedId,
        detailHtml: payload.detailHtml,
        balance: payload.balance,
      });
      self.resourcesList.innerHTML = "";
      self.resourcesDetail.innerHTML = html;
      self.bindMarketplacePanel(payload.balance);
    });
  };

  ScenaGraphEditor.prototype.bindMarketplacePanel = function (balance) {
    var self = this;
    var root = this.resourcesDetail;
    if (!root) return;

    root.querySelectorAll("[data-marketplace-category]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        self.marketplaceCategory = btn.getAttribute("data-marketplace-category") || "";
        self.marketplaceSelectedId = "";
        self.renderMarketplacePanel();
      });
    });

    var search = root.querySelector(".marketplace-search");
    if (search) {
      search.addEventListener("change", function () {
        self.marketplaceQuery = search.value.trim();
        self.marketplaceSelectedId = "";
        self.renderMarketplacePanel();
      });
      search.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          self.marketplaceQuery = search.value.trim();
          self.marketplaceSelectedId = "";
          self.renderMarketplacePanel();
        }
      });
    }

    root.querySelectorAll("[data-listing-id]").forEach(function (btn) {
      if (btn.classList.contains("marketplace-acquire-btn")) return;
      btn.addEventListener("click", function () {
        self.marketplaceSelectedId = btn.getAttribute("data-listing-id");
        self.renderMarketplacePanel();
      });
    });

    root.querySelectorAll(".marketplace-acquire-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var listingId = btn.getAttribute("data-listing-id");
        if (!listingId) return;
        var userId = self.feedbackUserId;
        if (!userId) {
          self.onSaveError("Sign in to get assets from the store.");
          return;
        }
        btn.disabled = true;
        ScenaMarketplace.purchase(userId, listingId).then(function (result) {
          var imported = ScenaMarketplace.importBundleToSeries(self.series, result.bundle);
          if (!imported.ok) throw new Error("Could not import asset pack.");
          self.markDirty();
          return self.saveNow(true);
        }).then(function (ok) {
          btn.disabled = false;
          if (ok !== false) {
            self.setSaveStatus("Asset pack added to project.");
            self.resourceTab = "characters";
            self.container.querySelectorAll("[data-resource-tab]").forEach(function (b) {
              b.classList.toggle("is-active", b.getAttribute("data-resource-tab") === "characters");
            });
            var split = self.container.querySelector(".resources-split");
            if (split) split.classList.remove("resources-split--store");
            self.renderResourcesPanel();
          }
        }).catch(function (err) {
          btn.disabled = false;
          self.onSaveError((err && err.message) || "Purchase failed.");
        });
      });
    });

    if (window.ScenaWallet && self.feedbackUserId) {
      ScenaWallet.bindPackButtons(root, self.feedbackUserId, function () {
        self.renderMarketplacePanel();
      }, function (err) {
        self.onSaveError((err && err.message) || "Could not buy Ducats.");
      });
    }
  };

  ScenaGraphEditor.prototype.openMarketplaceSellModal = function () {
    var self = this;
    if (!window.ScenaMarketplace || !this.workspaceModal) return;
    if (!this.feedbackUserId) {
      this.onSaveError("Sign in to sell assets on the marketplace.");
      return;
    }

    this._workspaceModalMode = "marketplace_sell";
    this.container.querySelector("#workspaceModalTitle").textContent = "Sell asset pack";
    this.container.querySelector("#workspaceModalBody").innerHTML =
      ScenaMarketplace.renderSellModalBody(this.series);
    this.container.querySelector("#workspaceModalSave").textContent = "Publish listing";
    this.workspaceModal.hidden = false;
  };

  ScenaGraphEditor.prototype.submitMarketplaceSellModal = function () {
    var self = this;
    var modal = this.container;
    var title = (modal.querySelector("#mpSellTitle") || {}).value || "";
    var desc = (modal.querySelector("#mpSellDesc") || {}).value || "";
    var category = (modal.querySelector("#mpSellCategory") || {}).value || "pack";
    var price = parseInt((modal.querySelector("#mpSellPrice") || {}).value, 10) || 0;
    var source = (modal.querySelector("#mpSellSource") || {}).value || "";
    var saveBtn = modal.querySelector("#workspaceModalSave");

    title = title.trim();
    if (title.length < 2) {
      this.onSaveError("Enter a listing title.");
      return;
    }
    if (!source) {
      this.onSaveError("Pick a character, stage, or asset to sell.");
      return;
    }

    var parts = source.split(":");
    var spec = { title: title, description: desc, category: category, priceDucats: Math.max(0, price) };
    if (parts[0] === "char") spec.characterId = parts[1];
    else if (parts[0] === "stage") spec.stageId = parts[1];
    else if (parts[0] === "asset") spec.assetId = parts[1];

    var built = ScenaMarketplace.buildBundleFromSeries(this.series, spec);
    if (built.empty) {
      this.onSaveError("Could not build asset pack from selection.");
      return;
    }

    if (saveBtn) saveBtn.disabled = true;
    ScenaMarketplace.publishListing(this.feedbackUserId, {
      title: title,
      description: desc,
      category: category,
      priceDucats: Math.max(0, price),
      bundle: built.bundle,
      previewDataUrl: built.preview,
      sellerName: (this.feedbackProfile && this.feedbackProfile.displayName) || "Creator",
    }).then(function () {
      self.closeModal();
      self.setSaveStatus("Listing published on the asset store.");
      if (self.resourceTab === "store") self.renderMarketplacePanel();
    }).catch(function (err) {
      if (saveBtn) saveBtn.disabled = false;
      self.onSaveError((err && err.message) || "Could not publish listing.");
    });
  };

  window.ScenaGraphEditor = ScenaGraphEditor;
})();
