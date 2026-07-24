/**
 * Arleco — immersive episode reader (public / creator preview).
 */
(function () {
  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  function ScenaPlayer(container, series, options) {
    options = options || {};
    this.container = container;
    this.series = series;
    this.episode = options.episode || null;
    this.fromStudio = !!options.fromStudio;
    this.userProfile = options.userProfile || null;
    this.progressScopeId = options.progressScopeId || "anon";
    this.restartChapter = !!options.restartChapter;
    this.onError = options.onError || function () {};
    this.currentBgmAssetId = null;

    this.playEpisodeId = this.episode ? this.episode.id : null;
    this.playNodeId = null;
    this.playMetrics = null;
    this.playKeyItems = null;
    this.choicesMade = [];
    this.carryForwardChoices = [];
    this.episodeChoicesMade = [];
    this.lastCompletion = null;
    this.playEnded = false;
    this.playEndMessage = "";
    this.parallaxEnabled = true;
    this.shellReady = false;
    this.replyToId = null;
    this.frozenBeatHtml = "";
    this.discussHintVisible = false;
    this.discussHintTimer = null;
    this.dialogueLog = [];
    this.readerMenu = null;

    try {
      this.parallaxEnabled = localStorage.getItem("scena.previewParallax") !== "0";
    } catch (e) { /* ignore */ }

    this.frameEl = document.createElement("div");
    this.frameEl.className = "preview-frame player-frame";
    this.frameEl.id = "playerFrame";
    this.container.appendChild(this.frameEl);
    this.ensureShell();

    this.boundKey = this.onKeyDown.bind(this);
    window.addEventListener("keydown", this.boundKey);
  }

  ScenaPlayer.prototype.destroy = function () {
    this.clearDiscussHintTimer();
    this.persistCheckpoint();
    if (window.ScenaProgress && this.progressScopeId && this.series) {
      ScenaProgress.flush(this.progressScopeId, this.series.id);
    }
    window.removeEventListener("keydown", this.boundKey);
    if (window.ScenaAudio) ScenaAudio.stopBgm();
  };

  ScenaPlayer.prototype.syncChoicesMade = function () {
    var combined = this.carryForwardChoices.slice();
    this.episodeChoicesMade.forEach(function (choiceId) {
      if (choiceId && combined.indexOf(choiceId) < 0) combined.push(choiceId);
    });
    this.choicesMade = combined;
  };

  ScenaPlayer.prototype.recordChoice = function (choiceId) {
    if (!choiceId) return;
    if (this.episodeChoicesMade.indexOf(choiceId) < 0) {
      this.episodeChoicesMade.push(choiceId);
    }
    this.syncChoicesMade();
  };

  ScenaPlayer.prototype.persistCheckpoint = function () {
    if (this.playEnded || !this.playEpisodeId || !this.playNodeId || !window.ScenaProgress) return;
    ScenaProgress.saveCheckpoint(this.progressScopeId, this.series.id, this.playEpisodeId, {
      playNodeId: this.playNodeId,
      metrics: this.playMetrics,
      keyItems: this.playKeyItems ? Object.assign({}, this.playKeyItems) : null,
      dialogueLog: (this.dialogueLog || []).slice(),
      choicesMade: this.episodeChoicesMade.slice(),
    });
    if (this.playKeyItems) {
      ScenaProgress.mergeEpisodeKeyItems(this.progressScopeId, this.series.id, this.playEpisodeId, this.playKeyItems);
    }
  };

  ScenaPlayer.prototype.resolveEndingKeys = function (exitNodeId) {
    if (!this.episode || !exitNodeId) return [];
    var branches = this.episode.branchEndings || [];
    if (branches.length) {
      var branchKeys = [];
      branches.forEach(function (branch) {
        var choiceIds = branch.choiceIds || [];
        var matched = choiceIds.some(function (choiceId) {
          return this.choicesMade.indexOf(choiceId) >= 0;
        }, this);
        if (matched && (!branch.exitNodeId || branch.exitNodeId === exitNodeId)) {
          branchKeys.push(this.episode.id + ":branch:" + branch.id);
        }
      }, this);
      if (branchKeys.length) return branchKeys;
    }
    return [this.episode.id + ":" + exitNodeId];
  };

  ScenaPlayer.prototype.seriesMenuHref = function () {
    if (this.fromStudio) {
      return "/studio#/series/" + encodeURIComponent(this.series.id) + "/episodes";
    }
    if (window.ScenaProgress && ScenaProgress.seriesMenuUrl) {
      return ScenaProgress.seriesMenuUrl(this.series.id);
    }
    return "/";
  };

  ScenaPlayer.prototype.getNode = function (id) {
    return (this.series.nodes || []).find(function (n) { return n.id === id; });
  };

  ScenaPlayer.prototype.effectivePresentation = function (node) {
    if (!node) return ScenaStore.resolvePresentation(this.series, null);
    return ScenaStore.resolvePresentation(this.series, node.id);
  };

  ScenaPlayer.prototype.getOutgoingEdge = function (nodeId, choiceId) {
    return (this.series.edges || []).find(function (e) {
      if (e.source !== nodeId) return false;
      if (choiceId) return e.choiceId === choiceId;
      return !e.choiceId;
    }) || null;
  };

  ScenaPlayer.prototype.initPlayMetrics = function () {
    var metrics = {};
    (this.series.metrics || []).forEach(function (m) {
      if (m.key) metrics[m.key] = parseFloat(m.defaultValue) || 0;
    });
    return metrics;
  };

  ScenaPlayer.prototype.initPlayKeyItems = function () {
    return {};
  };

  ScenaPlayer.prototype.applyKeyItemGrant = function (node) {
    if (!node || !node.data || !node.data.grantsKeyItemId) return;
    if (!this.playKeyItems) this.playKeyItems = {};
    var delta = node.data.keyItemDelta != null ? node.data.keyItemDelta : 1;
    ScenaStore.applyKeyItemChange(this.playKeyItems, node.data.grantsKeyItemId, delta);
    if (window.ScenaProgress) {
      ScenaProgress.mergeEpisodeKeyItems(this.progressScopeId, this.series.id, this.playEpisodeId, this.playKeyItems);
    }
    this.renderKeyItemsHud();
    if (this.readerMenu) this.readerMenu.onInventoryChanged();
  };

  ScenaPlayer.prototype.initReaderMenu = function () {
    if (this.readerMenu || !this.frameEl || !window.ScenaReaderMenu) return;
    var self = this;
    this.readerMenu = new ScenaReaderMenu(this.frameEl, {
      getSeries: function () { return self.series; },
      getDialogueLog: function () { return self.dialogueLog; },
      getKeyItems: function () { return self.playKeyItems; },
      getMetrics: function () { return self.playMetrics; },
      getParallaxEnabled: function () { return self.parallaxEnabled; },
      setParallaxEnabled: function (v) {
        self.parallaxEnabled = !!v;
        try { localStorage.setItem("scena.previewParallax", v ? "1" : "0"); } catch (e) { /* ignore */ }
      },
    });
  };

  ScenaPlayer.prototype.renderKeyItemsHud = function () {
    if (this.readerMenu) this.readerMenu.renderKeyItemsHud();
  };

  ScenaPlayer.prototype.appendDialogueLog = function (speaker, text) {
    text = (text || "").trim();
    if (!text) return;
    speaker = speaker || "Narration";
    var last = this.dialogueLog[this.dialogueLog.length - 1];
    if (last && last.speaker === speaker && last.text === text) return;
    this.dialogueLog.push({
      speaker: speaker,
      text: text,
      episodeNumber: this.episode ? this.episode.number : null,
    });
    if (this.dialogueLog.length > 500) this.dialogueLog.shift();
    if (this.readerMenu) this.readerMenu.onDialogueAppended();
  };

  ScenaPlayer.prototype.applyLogicSets = function (node) {
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

  ScenaPlayer.prototype.playEpisodeAtBoundary = function () {
    if (!this.playEpisodeId) return null;
    return (this.series.episodes || []).find(function (ep) {
      return ep.id === this.playEpisodeId;
    }, this) || null;
  };

  ScenaPlayer.prototype.wouldLeaveEpisodePlay = function (targetNodeId) {
    if (!this.playEpisodeId) return false;
    var ep = this.playEpisodeAtBoundary();
    if (!ep) return false;
    var nextNode = this.getNode(targetNodeId);
    return !nextNode || !ScenaStore.isEpisodePlayTarget(this.series, nextNode, ep, 220);
  };

  ScenaPlayer.prototype.playBeatEnterSfx = function (node) {
    if (!node || !node.data || !node.data.sfxAssetId || !window.ScenaAudio) return;
    var asset = ScenaStore.getAudioAsset(this.series, node.data.sfxAssetId);
    if (asset && asset.dataUrl) ScenaAudio.playOneShot(asset.dataUrl, 0.75);
  };

  ScenaPlayer.prototype.playBeatVoice = function (node) {
    if (!node || !node.data || !node.data.voiceAssetId || !window.ScenaAudio) return;
    var asset = ScenaStore.getAudioAsset(this.series, node.data.voiceAssetId);
    if (asset && asset.dataUrl) ScenaAudio.playOneShot(asset.dataUrl, 0.85);
  };

  ScenaPlayer.prototype.applyBeatBgm = function (node) {
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

  ScenaPlayer.prototype.playBeatAudio = function (node) {
    if (!node) return;
    this.applyBeatBgm(node);
    this.playBeatEnterSfx(node);
    this.playBeatVoice(node);
  };

  ScenaPlayer.prototype.playClickSound = function () {
    if (!window.ScenaAudio) return;
    ScenaStore.ensureReaderUi(this.series);
    var id = (this.series.readerUi.sounds && this.series.readerUi.sounds.clickAssetId) ||
      ScenaStore.defaultClickAssetId();
    var asset = ScenaStore.getAudioAsset(this.series, id);
    if (asset && asset.dataUrl) ScenaAudio.playOneShot(asset.dataUrl, 0.55);
  };

  ScenaPlayer.prototype.startEpisode = function (episode, opts) {
    opts = opts || {};
    if (!episode) return false;

    var restart = opts.restart != null ? !!opts.restart : this.restartChapter;
    this.restartChapter = false;
    this.episode = episode;
    this.playEpisodeId = episode.id;
    this.playEnded = false;
    this.playEndMessage = "";
    this.replyToId = null;
    this.choicesMade = [];
    this.carryForwardChoices = [];
    this.episodeChoicesMade = [];
    this.lastCompletion = null;

    if (restart && window.ScenaProgress) {
      ScenaProgress.restartEpisode(this.progressScopeId, this.series, episode);
    }

    if (window.ScenaProgress) {
      this.playMetrics = ScenaProgress.metricsForEpisodeStart(this.progressScopeId, this.series, episode);
      this.playKeyItems = ScenaProgress.keyItemsForEpisodeStart(this.progressScopeId, this.series, episode);
    } else {
      this.playMetrics = this.initPlayMetrics();
      this.playKeyItems = this.initPlayKeyItems();
    }

    var start = null;
    var checkpoint = null;
    this.carryForwardChoices = window.ScenaProgress
      ? ScenaProgress.priorChoicesMade(this.progressScopeId, this.series, episode)
      : [];

    if (!restart && window.ScenaProgress) {
      var rec = ScenaProgress.get(this.progressScopeId, this.series.id).episodes[episode.id];
      if (rec && rec.checkpoint) checkpoint = rec.checkpoint;
    }

    if (checkpoint && checkpoint.playNodeId) {
      start = this.getNode(checkpoint.playNodeId);
      if (checkpoint.metrics) this.playMetrics = Object.assign({}, checkpoint.metrics);
      if (checkpoint.keyItems) {
        this.playKeyItems = Object.assign({}, this.playKeyItems || {}, checkpoint.keyItems);
      }
      if (checkpoint.dialogueLog && checkpoint.dialogueLog.length) {
        this.dialogueLog = checkpoint.dialogueLog.slice();
      }
      this.episodeChoicesMade = (checkpoint.choicesMade || []).slice();
      this.syncChoicesMade();
    } else {
      var prevExit = null;
      if ((episode.number || 1) > 1) {
        var prev = ScenaStore.previousEpisode(this.series, episode);
        if (prev && window.ScenaProgress) {
          var prevRec = ScenaProgress.get(this.progressScopeId, this.series.id).episodes[prev.id];
          if (!prevRec || !prevRec.completed) {
            this.onError("Complete the previous chapter first.");
            return false;
          }
          prevExit = prevRec.exitNodeId;
        }
      }
      this.episodeChoicesMade = [];
      this.syncChoicesMade();
      start = ScenaStore.episodeContinuityStart(this.series, episode, prevExit, 220, this.choicesMade);
    }

    if (!start) {
      this.onError("Nothing to play in this episode.");
      return false;
    }

    this.playNodeId = start.id;
    this.beginDiscussHint();
    this.processCurrentPlayNode();
    if (window.ScenaCloud && ScenaCloud.recordEpisodeRead) {
      var readerId = this.progressScopeId && this.progressScopeId !== "anon"
        ? this.progressScopeId
        : null;
      ScenaCloud.recordEpisodeRead(this.series.id, episode.id, readerId);
    }
    return true;
  };

  ScenaPlayer.prototype.clearDiscussHintTimer = function () {
    if (this.discussHintTimer) {
      clearTimeout(this.discussHintTimer);
      this.discussHintTimer = null;
    }
  };

  ScenaPlayer.prototype.beginDiscussHint = function () {
    var self = this;
    this.clearDiscussHintTimer();
    this.discussHintVisible = true;
    this.discussHintTimer = setTimeout(function () {
      self.discussHintVisible = false;
      self.discussHintTimer = null;
      if (self.storyEl) {
        self.storyEl.classList.remove("player-story--discuss-hint");
      }
    }, 4000);
  };

  ScenaPlayer.prototype.readingStoryClassName = function () {
    return "player-story player-story--reading" +
      (this.discussHintVisible ? " player-story--discuss-hint" : "");
  };

  ScenaPlayer.prototype.finishPlay = function (message) {
    var exitNodeId = this.playNodeId;
    if (window.ScenaAudio) ScenaAudio.stopBgm();
    this.currentBgmAssetId = null;
    if (this.readerMenu) this.readerMenu.close();

    if (this.playEpisodeId && window.ScenaProgress && exitNodeId) {
      this.lastCompletion = ScenaProgress.completeEpisode({
        scopeId: this.progressScopeId,
        seriesId: this.series.id,
        episodeId: this.playEpisodeId,
        exitNodeId: exitNodeId,
        metrics: this.playMetrics,
        keyItems: this.playKeyItems ? Object.assign({}, this.playKeyItems) : null,
        dialogueLog: (this.dialogueLog || []).slice(),
        choicesMade: this.episodeChoicesMade.slice(),
        endingKeys: this.resolveEndingKeys(exitNodeId),
      });
    }

    this.playNodeId = null;
    this.playEnded = true;
    this.playEndMessage = message || "Chapter complete.";
    this.render();
  };

  ScenaPlayer.prototype.advancePlay = function (choiceId) {
    if (this.playEnded || !this.playNodeId) return;
    var node = this.getNode(this.playNodeId);
    if (!node) {
      this.finishPlay(this.playEpisodeId ? "Chapter complete." : "The end.");
      return;
    }

    if (choiceId) {
      this.recordChoice(choiceId);
      var choiceEdge = this.getOutgoingEdge(node.id, choiceId);
      if (!choiceEdge) return;
      if (this.wouldLeaveEpisodePlay(choiceEdge.target)) {
        this.finishPlay("Chapter complete.");
        return;
      }
      this.playNodeId = choiceEdge.target;
      this.processCurrentPlayNode();
      return;
    }

    if (ScenaStore.hasChoices(node)) return;

    if (node.data && node.data.isEnd) {
      this.finishPlay(this.playEpisodeId ? "Chapter complete." : "The end.");
      return;
    }

    var nextEdge = this.getOutgoingEdge(node.id, null);
    if (!nextEdge) {
      this.finishPlay(this.playEpisodeId ? "Chapter complete." : "The end.");
      return;
    }
    if (this.wouldLeaveEpisodePlay(nextEdge.target)) {
      this.finishPlay("Chapter complete.");
      return;
    }

    this.playNodeId = nextEdge.target;
    this.processCurrentPlayNode();
  };

  ScenaPlayer.prototype.processCurrentPlayNode = function () {
    var safety = 0;
    while (this.playNodeId && !this.playEnded && safety < 500) {
      safety++;
      var node = this.getNode(this.playNodeId);
      if (!node) {
        this.finishPlay("Chapter complete.");
        return;
      }
      if (!ScenaStore.beatMeetsChoiceRequirements(node, this.choicesMade)) {
        var skipEdge = this.getOutgoingEdge(node.id, null);
        if (!skipEdge) {
          this.finishPlay("Chapter complete.");
          return;
        }
        if (this.wouldLeaveEpisodePlay(skipEdge.target)) {
          this.finishPlay("Chapter complete.");
          return;
        }
        this.playNodeId = skipEdge.target;
        continue;
      }
      if (ScenaStore.isRouterNode(node)) {
        var routeEdge = ScenaStore.resolveRouterEdge(this.series, node, this.choicesMade, this.playMetrics || {}, this.playKeyItems || {});
        if (!routeEdge) {
          this.finishPlay("Chapter complete.");
          return;
        }
        if (this.wouldLeaveEpisodePlay(routeEdge.target)) {
          this.finishPlay("Chapter complete.");
          return;
        }
        this.playNodeId = routeEdge.target;
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
          this.finishPlay("Chapter complete.");
          return;
        }
        if (this.wouldLeaveEpisodePlay(edge.target)) {
          this.finishPlay("Chapter complete.");
          return;
        }
        this.playNodeId = edge.target;
        continue;
      }
      if (ScenaStore.hasChoices(node)) {
        this.applyLogicSets(node);
      }
      break;
    }
    if (safety >= 500) {
      this.finishPlay("Chapter complete.");
      return;
    }
    this.playBeatAudio(this.getNode(this.playNodeId));
    this.persistCheckpoint();
    this.render();
  };

  ScenaPlayer.prototype.applyReaderUi = function () {
    if (!this.frameEl) return;
    var ui = ScenaStore.resolveReaderUi(this.series);
    var parts = String(ui.aspectRatio || "16:9").split(":");
    var aw = parseInt(parts[0], 10) || 16;
    var ah = parseInt(parts[1], 10) || 9;
    var el = this.frameEl;
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
    this.initReaderMenu();
    if (this.readerMenu) {
      this.readerMenu.mount();
      this.readerMenu.sync();
    }
  };

  ScenaPlayer.prototype.ensureShell = function () {
    if (this.shellReady) return;
    this.shellReady = true;
    this.frameEl.innerHTML =
      '<div class="player-scroll" id="playerScroll">' +
        '<div class="player-story" id="playerStory"><div class="player-loading">Loading story…</div></div>' +
        '<section class="player-comments" id="playerCommentsSection" aria-label="Episode discussion">' +
          "<h2>Discussion</h2>" +
          '<p class="player-comments-lead">Scroll down from the story to comment, react, and reply.</p>' +
          '<p class="player-comment-status player-comment-status--global" id="playerCommentStatusGlobal" hidden></p>' +
          '<div class="player-comments-list" id="playerCommentsList"></div>' +
          '<div id="playerCommentComposerWrap"></div>' +
        "</section>" +
      "</div>";
    this.storyEl = this.frameEl.querySelector("#playerStory");
    this.scrollEl = this.frameEl.querySelector("#playerScroll");
    this.commentsSection = this.frameEl.querySelector("#playerCommentsSection");
    this.bindCommentsDelegation();
    this.initReaderMenu();
    if (this.readerMenu) this.readerMenu.mount();
  };

  ScenaPlayer.prototype.focusEndScreen = function () {
    var scrollEl = this.scrollEl || (this.frameEl && this.frameEl.querySelector("#playerScroll"));
    if (!scrollEl) return;
    scrollEl.scrollTo({ top: 0, behavior: "smooth" });
    var self = this;
    requestAnimationFrame(function () {
      scrollEl.scrollTop = 0;
    });
  };

  ScenaPlayer.prototype.renderEndScreenHtml = function () {
    var epTitle = this.episode && this.episode.title ? this.episode.title : "Chapter";
    var epNum = this.episode && this.episode.number ? this.episode.number : "";
    var seriesTitle = escapeHtml(this.series.title || "Story");
    var menuHref = this.seriesMenuHref();
    var menuLabel = this.fromStudio ? "← Back to studio" : "← Chapters";
    var nextEp = ScenaStore.nextEpisode(this.series, this.episode);
    var nextBtnHtml;
    var nextUnlocked = nextEp && (!window.ScenaProgress ||
      ScenaProgress.isEpisodeUnlocked(this.progressScopeId, this.series, nextEp));

    if (nextEp && nextUnlocked) {
      var nextUrl = ScenaStore.episodePlayUrl(this.series.id, nextEp.id, this.fromStudio ? "studio" : "");
      var nextLabel = nextEp.title ? nextEp.title : ("Chapter " + (nextEp.number || ""));
      nextBtnHtml =
        '<a class="btn btn-primary" id="playerNextEpisodeBtn" href="' + escapeAttr(nextUrl) + '">' +
          "Next chapter: " + escapeHtml(nextLabel) +
        "</a>";
    } else if (nextEp) {
      nextBtnHtml =
        '<button type="button" class="btn btn-primary is-disabled" id="playerNextEpisodeBtn" disabled aria-disabled="true" title="Finish the previous chapter first">' +
          "Next chapter locked" +
        "</button>";
    } else {
      nextBtnHtml =
        '<span class="player-end-series-done">You reached the end of this story.</span>';
    }

    var carryMetrics = window.ScenaProgress
      ? ScenaProgress.carryForwardPreview(this.progressScopeId, this.series, nextEp)
      : null;
    var statsHtml = nextEp ? this.renderMetricsPreview(carryMetrics) : "";
    var statsBlock = statsHtml
      ? ('<div class="player-end-carry">' +
          '<p class="player-end-carry-label">Stats carried to next chapter</p>' +
          statsHtml +
        "</div>")
      : "";

    var choicesBlock = "";
    if (this.episode && this.episodeChoicesMade.length && window.ScenaStore) {
      var choiceLabels = ScenaStore.resolveChoiceLabels(this.series, this.episode, this.episodeChoicesMade);
      if (choiceLabels.length) {
        choicesBlock =
          '<div class="player-end-choices">' +
            '<p class="player-end-carry-label">Choices this chapter</p>' +
            "<ul>" +
            choiceLabels.map(function (item) {
              return "<li>" + escapeHtml(item.label) + "</li>";
            }).join("") +
            "</ul>" +
          "</div>";
      }
    }

    return (
      '<div class="player-end-main">' +
        '<div class="player-end-badge" aria-hidden="true">✓</div>' +
        '<p class="player-end-eyebrow">' + seriesTitle + "</p>" +
        '<h2 class="player-end-title">Chapter complete</h2>' +
        (epNum ? ('<p class="player-end-chapter-name">Chapter ' + epNum + " · " + escapeHtml(epTitle) + "</p>") : "") +
        '<p class="player-end-message">' + escapeHtml(this.playEndMessage || "You finished this chapter.") + "</p>" +
        this.renderEndingsSummary() +
        choicesBlock +
        this.renderHeartButton() +
        statsBlock +
        '<div class="player-end-actions">' +
          nextBtnHtml +
          '<button type="button" class="btn btn-ghost" id="playerPlayAgainBtn">Restart chapter</button>' +
          '<a class="btn btn-ghost" href="' + escapeAttr(menuHref) + '">' + escapeHtml(menuLabel) + "</a>" +
        "</div>" +
        '<p class="player-end-discuss-hint">Scroll down for discussion</p>' +
      "</div>"
    );
  };

  ScenaPlayer.prototype.renderMetricsPreview = function (metrics) {
    var defs = ScenaStore.listVisibleHudMetrics(this.series, metrics);
    if (!defs.length) return "";
    var rows = defs.map(function (row) {
      var m = row.metric;
      var val = row.value;
      var display = typeof val === "number" && val % 1 !== 0 ? val.toFixed(1) : String(val);
      var icon = m.dataUrl
        ? '<span class="player-stat-icon" style="background-image:url(' + m.dataUrl + ')"></span>'
        : "";
      return (
        '<div class="player-stat-row">' +
          icon +
          '<span class="player-stat-label">' + escapeHtml(m.displayName || m.key) + "</span>" +
          '<span class="player-stat-value">' + escapeHtml(display) + "</span>" +
        "</div>"
      );
    }).join("");
    return '<div class="player-stats-preview">' + rows + "</div>";
  };

  ScenaPlayer.prototype.renderEndingsSummary = function () {
    if (!window.ScenaProgress) return "";
    var unlocked = ScenaProgress.countUnlockedEndings(this.progressScopeId, this.series.id);
    var total = ScenaProgress.countTotalEndings(this.series);
    if (!total) return "";
    return (
      '<p class="player-end-endings">' +
        "Endings unlocked: <strong>" + unlocked + " / " + total + "</strong>" +
      "</p>"
    );
  };

  ScenaPlayer.prototype.renderEndScreen = function () {
    this.ensureShell();
    if (!this.storyEl) return;
    this.storyEl.className = "player-story player-story--finished";
    this.storyEl.innerHTML = this.renderEndScreenHtml();
    this.bindEndScreenActions();
    this.refreshCommentsUI();
    this.focusEndScreen();
  };

  ScenaPlayer.prototype.bindEndScreenActions = function () {
    this.bindHeartButton();
    var self = this;
    var root = this.storyEl || this.frameEl;
    var again = root && root.querySelector("#playerPlayAgainBtn");
    if (again) {
      again.addEventListener("click", function () {
        self.playEnded = false;
        self.startEpisode(self.episode, { restart: true });
      });
    }
  };

  ScenaPlayer.prototype.refreshCommentsUI = function () {
    if (!this.commentsSection) return;
    var list = this.commentsSection.querySelector("#playerCommentsList");
    var composerWrap = this.commentsSection.querySelector("#playerCommentComposerWrap");
    if (list) this.renderCommentsList(list);
    if (composerWrap) composerWrap.innerHTML = this.renderCommentComposer();
  };

  ScenaPlayer.prototype.renderCommentItem = function (comment, isReply) {
    var self = this;
    var author = comment.author || {};
    var avatar = window.ScenaProfile ? ScenaProfile.renderAvatar(author) : "";
    var authorLine = window.ScenaProfile
      ? ScenaProfile.renderAuthorLine(author)
      : escapeHtml(author.displayName || "Reader");
    var reactions = (window.ScenaComments && ScenaComments.REACTIONS) || ["❤️", "👍", "😂", "✨"];
    var reactionHtml = reactions.map(function (emoji) {
      var count = ScenaComments.reactionCount(comment, emoji);
      var active = self.userProfile && ScenaComments.hasReaction(comment, emoji, self.userProfile);
      return (
        '<button type="button" class="comment-react-btn' + (active ? " is-active" : "") + '" data-react="' +
          escapeAttr(emoji) + '" data-comment-id="' + escapeAttr(comment.id) + '" aria-pressed="' +
          (active ? "true" : "false") + '">' +
          '<span class="comment-react-emoji">' + emoji + "</span>" +
          (count ? '<span class="comment-react-count">' + count + "</span>" : "") +
        "</button>"
      );
    }).join("");

    var repliesHtml = "";
    if (comment.replies && comment.replies.length) {
      repliesHtml =
        '<div class="player-comment-replies">' +
          comment.replies.map(function (r) { return self.renderCommentItem(r, true); }).join("") +
        "</div>";
    }

    return (
      '<article class="player-comment' + (isReply ? " player-comment--reply" : "") + '" data-comment-id="' + escapeAttr(comment.id) + '">' +
        '<div class="player-comment-head">' +
          avatar +
          '<div class="player-comment-meta">' +
            '<div class="player-comment-author">' + authorLine + "</div>" +
            '<div class="player-comment-date">' + escapeHtml(self.formatCommentDate(comment.createdAt)) + "</div>" +
          "</div>" +
        "</div>" +
        '<p class="player-comment-text">' + escapeHtml(comment.text) + "</p>" +
        '<div class="player-comment-actions">' +
          '<div class="player-comment-reactions">' + reactionHtml + "</div>" +
          '<button type="button" class="comment-reply-btn" data-reply-to="' + escapeAttr(comment.id) + '">Reply</button>' +
        "</div>" +
        repliesHtml +
      "</article>"
    );
  };

  ScenaPlayer.prototype.bindCommentsDelegation = function () {
    var self = this;
    if (!this.commentsSection || this.commentsSection.dataset.bound) return;
    this.commentsSection.dataset.bound = "1";

    this.commentsSection.addEventListener("click", function (e) {
      var reactBtn = e.target.closest("[data-react]");
      if (reactBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (!self.userProfile || !self.userProfile.id) {
          self.setCommentStatus("Sign in to react to comments.", true);
          return;
        }
        var result = ScenaComments.toggleReaction(
          self.series.id,
          self.episode.id,
          reactBtn.getAttribute("data-comment-id"),
          reactBtn.getAttribute("data-react"),
          self.userProfile
        );
        if (!result || !result.then) return;
        result.then(function (outcome) {
          if (!outcome) return;
          if (self.playClickSound) self.playClickSound();
          self.refreshCommentsUI();
        });
        return;
      }

      var replyBtn = e.target.closest("[data-reply-to]");
      if (replyBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (!self.userProfile || !self.userProfile.id) {
          self.setCommentStatus("Sign in to reply to comments.", true);
          return;
        }
        self.replyToId = replyBtn.getAttribute("data-reply-to");
        self.refreshCommentsUI();
        var composer = self.commentsSection.querySelector("#playerCommentForm textarea");
        if (composer) composer.focus();
        return;
      }

      var cancelReply = e.target.closest("[data-cancel-reply]");
      if (cancelReply) {
        e.preventDefault();
        self.replyToId = null;
        self.refreshCommentsUI();
      }
    });

    this.commentsSection.addEventListener("submit", function (e) {
      var form = e.target.closest("#playerCommentForm");
      if (!form) return;
      e.preventDefault();
      e.stopPropagation();
      if (!self.userProfile || !self.userProfile.id) return;
      var ta = form.querySelector("textarea");
      if (!ta) return;
      var text = ta.value.trim();
      if (!text) {
        self.setCommentStatus("Write something before posting.", true);
        return;
      }
      var posted = ScenaComments.add(
        self.series.id,
        self.episode.id,
        text,
        self.userProfile,
        self.replyToId
      );
      if (!posted || !posted.then) {
        self.setCommentStatus("Could not post comment. Try again.", true);
        return;
      }
      posted.then(function (comment) {
        if (!comment) {
          self.setCommentStatus("Could not post comment. Try again.", true);
          return;
        }
        ta.value = "";
        self.replyToId = null;
        self.setCommentStatus("");
        self.refreshCommentsUI();
      });
    });
  };

  ScenaPlayer.prototype.renderHeartButton = function () {
    if (!window.ScenaHearts || !this.episode) return "";

    var hearted = this.userProfile && this.userProfile.id
      ? ScenaHearts.isHearted(this.series.id, this.episode.id, this.userProfile)
      : false;
    var count = ScenaHearts.count(this.series.id, this.episode.id);
    var countLabel = count === 1 ? "1 reader loved this chapter" : count + " readers loved this chapter";

    if (!this.userProfile || !this.userProfile.id) {
      return (
        '<div class="player-end-heart">' +
          '<p class="player-heart-summary">' + escapeHtml(countLabel) + "</p>" +
          '<p class="player-heart-signin">' +
            '<a href="/">Sign in</a> to heart this chapter.' +
          "</p>" +
        "</div>"
      );
    }

    return (
      '<div class="player-end-heart">' +
        '<button type="button" class="player-heart-btn' + (hearted ? " is-active" : "") + '" id="playerHeartBtn" aria-pressed="' + (hearted ? "true" : "false") + '">' +
          '<span class="player-heart-icon" aria-hidden="true">' + (hearted ? "♥" : "♡") + "</span>" +
          '<span class="player-heart-label">' + (hearted ? "Loved" : "Love this chapter") + "</span>" +
        "</button>" +
        '<p class="player-heart-summary" id="playerHeartSummary">' + escapeHtml(countLabel) + "</p>" +
      "</div>"
    );
  };

  ScenaPlayer.prototype.paintHeartButton = function (hearted, count) {
    var root = this.storyEl || this.frameEl;
    var btn = root && root.querySelector("#playerHeartBtn");
    var summary = root && root.querySelector("#playerHeartSummary");
    if (!btn) return;

    btn.classList.toggle("is-active", !!hearted);
    btn.setAttribute("aria-pressed", hearted ? "true" : "false");
    btn.querySelector(".player-heart-icon").textContent = hearted ? "♥" : "♡";
    btn.querySelector(".player-heart-label").textContent = hearted ? "Loved" : "Love this chapter";

    if (summary) {
      summary.textContent = count === 1
        ? "1 reader loved this chapter"
        : count + " readers loved this chapter";
    }
  };

  ScenaPlayer.prototype.bindHeartButton = function () {
    var self = this;
    var root = this.storyEl || this.frameEl;
    var btn = root && root.querySelector("#playerHeartBtn");
    if (!btn || !window.ScenaHearts || !this.userProfile || !this.userProfile.id) return;

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (self.playClickSound) self.playClickSound();
      var result = ScenaHearts.toggle(self.series.id, self.episode.id, self.userProfile);
      if (!result || !result.then) return;
      result.then(function (outcome) {
        if (!outcome) return;
        self.paintHeartButton(outcome.hearted, outcome.count);
      });
    });
  };

  ScenaPlayer.prototype.formatCommentDate = function (iso) {
    try {
      return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch (e) {
      return "";
    }
  };

  ScenaPlayer.prototype.renderCommentComposer = function () {
    var replyBanner = "";
    if (this.replyToId && window.ScenaComments) {
      var parent = ScenaComments.findById(this.series.id, this.episode.id, this.replyToId);
      var replyName = parent && parent.author ? parent.author.displayName : "comment";
      replyBanner =
        '<div class="player-reply-banner">' +
          "Replying to <strong>" + escapeHtml(replyName) + "</strong> " +
          '<button type="button" class="comment-cancel-reply" data-cancel-reply>Cancel</button>' +
        "</div>";
    }

    if (this.userProfile && this.userProfile.id) {
      var avatar = window.ScenaProfile ? ScenaProfile.renderAvatar(this.userProfile, "comment-avatar comment-avatar--sm") : "";
      var authorLine = window.ScenaProfile
        ? ScenaProfile.renderAuthorLine(ScenaProfile.authorSnapshot(this.userProfile))
        : escapeHtml(this.userProfile.displayName || "Reader");
      var placeholder = this.replyToId ? "Write a reply…" : "Write a comment…";
      return (
        '<div class="player-comment-composer">' +
          replyBanner +
          '<div class="player-comment-as">' +
            avatar +
            '<div class="player-comment-as-text">' +
              '<span class="player-comment-as-label">' + (this.replyToId ? "Replying as" : "Commenting as") + "</span> " +
              '<span class="player-comment-as-name">' + authorLine + "</span>" +
            "</div>" +
            '<a class="player-comment-edit-profile" href="/account">Edit profile</a>' +
          "</div>" +
          '<form class="player-comment-form" id="playerCommentForm">' +
            '<textarea placeholder="' + escapeAttr(placeholder) + '" maxlength="2000" aria-label="Comment"></textarea>' +
            '<p class="player-comment-status" id="playerCommentStatus" hidden></p>' +
            '<button type="submit" class="btn btn-primary">' + (this.replyToId ? "Post reply" : "Post comment") + "</button>" +
          "</form>" +
        "</div>"
      );
    }
    return (
      '<p class="player-comments-signin">' +
        '<a href="/">Sign in</a> to comment, react, and reply with your profile.' +
      "</p>"
    );
  };

  ScenaPlayer.prototype.renderCommentsList = function (container) {
    if (!container || !window.ScenaComments || !this.episode) return;
    var comments = ScenaComments.list(this.series.id, this.episode.id);
    if (!comments.length) {
      container.innerHTML = '<p class="player-comments-empty">No comments yet. Be the first.</p>';
      return;
    }
    var self = this;
    container.innerHTML = comments.map(function (c) {
      return self.renderCommentItem(c, false);
    }).join("");
  };

  ScenaPlayer.prototype.setCommentStatus = function (message, isError) {
    var root = this.commentsSection || this.frameEl;
    var el = root && (root.querySelector("#playerCommentStatus") || root.querySelector("#playerCommentStatusGlobal"));
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      el.classList.remove("is-error");
      return;
    }
    el.hidden = false;
    el.textContent = message;
    el.classList.toggle("is-error", !!isError);
  };

  ScenaPlayer.prototype.bindCommentsForm = function () {
    /* handled by bindCommentsDelegation */
  };

  ScenaPlayer.prototype.render = function () {
    if (!this.frameEl) return;
    this.ensureShell();
    this.applyReaderUi();
    this.renderKeyItemsHud();

    if (this.playEnded) {
      this.renderEndScreen();
      return;
    }

    var node = this.getNode(this.playNodeId);
    if (!node || !this.storyEl) {
      if (this.storyEl) this.storyEl.innerHTML = '<div class="player-loading">Loading…</div>';
      return;
    }

    if (node.type !== "beat") ScenaStore.migrateNode(node);
    var data = node.data || {};

    if (ScenaStore.shouldAutoAdvance(node)) {
      var self = this;
      setTimeout(function () { self.processCurrentPlayNode(); }, 0);
      return;
    }

    var resolved = this.effectivePresentation(node);
    var speakerNode = { data: { characterProfileId: resolved.characterProfileId } };
    var speaker = ScenaStore.speakerDisplayName(speakerNode, this.series);

    var bg = resolved.backgroundSceneId ? ScenaStore.getBackground(this.series, resolved.backgroundSceneId) : null;
    var layers = (bg && bg.layers) || {};
    var stageClass = "preview-stage player-stage";
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

    var dialogueText = ScenaStore.resolveBeatDialogue(node).text;
    if (!dialogueText && data.dialogue && data.dialogue[0]) dialogueText = data.dialogue[0].text || "";

    if (ScenaStore.getBeatKind(node) === "story") {
      this.appendDialogueLog(speaker, dialogueText);
    }

    var dialogueHtml = "";
    if (ScenaStore.hasChoices(node)) {
      var visibleChoices = ScenaStore.filterVisibleChoices(node, this.playMetrics || {}, this.choicesMade || [], this.playKeyItems || {});
      dialogueHtml =
        '<div class="preview-dialogue player-dialogue">' +
          (speaker !== "Narration" ? '<strong class="preview-speaker">' + escapeHtml(speaker) + '</strong>' : "") +
          (dialogueText ? '<p class="player-dialogue-text">' + escapeHtml(dialogueText) + '</p>' : "") +
        '</div>' +
        '<div class="preview-dialogue preview-dialogue--choices player-choices">' +
        (visibleChoices.length
          ? visibleChoices.map(function (c) {
            return '<button type="button" class="preview-choice-btn is-clickable" data-choice-id="' + escapeAttr(c.id) + '">' +
              escapeHtml(c.choiceText || c.label) + '</button>';
          }).join("")
          : '<p class="player-dialogue-text">No choices available.</p>') +
        '</div>';
    } else {
      var continueHint = !data.isEnd
        ? '<p class="preview-continue-hint player-tap-hint">Tap to continue</p>'
        : '<p class="preview-continue-hint player-tap-hint">Tap to finish</p>';
      dialogueHtml =
        '<div class="preview-dialogue player-dialogue is-clickable">' +
          (speaker !== "Narration" ? '<strong class="preview-speaker">' + escapeHtml(speaker) + '</strong>' : "") +
          '<p class="player-dialogue-text">' + escapeHtml(dialogueText || "…") + '</p>' +
          continueHint +
        '</div>';
    }

    this.frozenBeatHtml = stageHtml + dialogueHtml;
    this.storyEl.className = this.readingStoryClassName();
    this.storyEl.innerHTML = '<div class="player-story-inner">' + this.frozenBeatHtml + "</div>";
    this.refreshCommentsUI();
    if (canParallax && this.parallaxEnabled) this.bindParallax();
    this.bindInput(node);
  };

  ScenaPlayer.prototype.bindInput = function (node) {
    var self = this;
    if (!this.storyEl || !node) return;

    if (this.readerMenu && this.readerMenu.menuOpen) {
      this.storyEl.onclick = null;
      return;
    }

    this.storyEl.querySelectorAll(".preview-choice-btn[data-choice-id]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        self.playClickSound();
        self.advancePlay(btn.getAttribute("data-choice-id"));
      });
    });

    if (ScenaStore.hasChoices(node)) {
      this.storyEl.onclick = null;
      return;
    }

    this.storyEl.onclick = function (e) {
      if (e.target.closest("button, a, input, textarea, select, .player-comments")) return;
      self.playClickSound();
      self.advancePlay();
    };
  };

  ScenaPlayer.prototype.bindParallax = function () {
    if (!this.storyEl || !this.parallaxEnabled) return;
    var stage = this.storyEl.querySelector(".preview-stage");
    if (!stage) return;
    var bg = stage.querySelector(".preview-layer-bg");
    var mg = stage.querySelector(".preview-layer-mg");
    var fg = stage.querySelector(".preview-layer-fg");
    if (!bg || !mg || !fg) return;

    var center = "50% 50%";
    stage.onmousemove = function (e) {
      var rect = stage.getBoundingClientRect();
      var nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      var ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      stage.style.transform = "rotateX(" + (-ny * 1.2).toFixed(2) + "deg) rotateY(" + (nx * 1.2).toFixed(2) + "deg)";
      bg.style.backgroundPosition = (50 + nx * 1.5).toFixed(1) + "% " + (50 + ny * 1).toFixed(1) + "%";
      mg.style.backgroundPosition = (50 + nx * 3).toFixed(1) + "% " + (50 + ny * 2).toFixed(1) + "%";
      fg.style.backgroundPosition = (50 + nx * 5).toFixed(1) + "% " + (50 + ny * 3).toFixed(1) + "%";
    };
    stage.onmouseleave = function () {
      stage.style.transform = "";
      bg.style.backgroundPosition = center;
      mg.style.backgroundPosition = center;
      fg.style.backgroundPosition = center;
    };
  };

  ScenaPlayer.prototype.onKeyDown = function (e) {
    if (e.target.matches("input, textarea, select")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      if (this.readerMenu) {
        if (this.readerMenu.menuOpen) this.readerMenu.close();
        else if (!this.playEnded) this.readerMenu.open();
      }
      return;
    }
    if (this.playEnded || (this.readerMenu && this.readerMenu.menuOpen)) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      this.playClickSound();
      this.advancePlay();
    }
  };

  window.ScenaPlayer = ScenaPlayer;
})();
