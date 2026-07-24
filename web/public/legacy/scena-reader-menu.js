/**
 * Arleco — in-game reader menu (transcript, inventory, audio settings)
 * Attaches to a .preview-frame / .player-frame element during play.
 */
(function (root) {
  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  function ScenaReaderMenu(frameEl, hooks) {
    this.frameEl = frameEl;
    this.hooks = hooks || {};
    this.menuOpen = false;
    this.menuTab = "log";
    this.mounted = false;
  }

  ScenaReaderMenu.prototype.getSeries = function () {
    return this.hooks.getSeries ? this.hooks.getSeries() : null;
  };

  ScenaReaderMenu.prototype.getMenuConfig = function () {
    var series = this.getSeries();
    if (!series || !root.ScenaStore) {
      return {
        enabled: true,
        showTranscript: true,
        showInventory: true,
        showAudioSettings: true,
        inventoryDisplay: "grid",
        showInventoryHud: false,
      };
    }
    return ScenaStore.resolveReaderMenu(series);
  };

  ScenaReaderMenu.prototype.availableTabs = function () {
    var menu = this.getMenuConfig();
    var tabs = [];
    if (menu.showTranscript !== false) tabs.push({ id: "log", label: "Transcript" });
    if (menu.showInventory !== false) tabs.push({ id: "inventory", label: "Inventory" });
    if (menu.showAudioSettings !== false) tabs.push({ id: "settings", label: "Audio" });
    return tabs;
  };

  ScenaReaderMenu.prototype.mount = function () {
    if (!this.frameEl || this.mounted) return;
    this.mounted = true;
    if (!this.frameEl.classList.contains("player-frame")) {
      this.frameEl.classList.add("player-frame");
    }
    var markup =
      '<button type="button" class="player-menu-btn" id="playerMenuBtn" aria-label="Reader menu" aria-expanded="false" aria-controls="playerMenuBackdrop">' +
        '<span class="player-menu-btn-icon" aria-hidden="true">☰</span>' +
        '<span class="player-menu-btn-label">Menu</span>' +
      '</button>' +
      '<div class="player-menu-backdrop" id="playerMenuBackdrop" hidden>' +
        '<div class="player-menu-panel" role="dialog" aria-modal="true" aria-labelledby="playerMenuTitle">' +
          '<header class="player-menu-header">' +
            '<h2 class="player-menu-title" id="playerMenuTitle">Menu</h2>' +
            '<button type="button" class="player-menu-close" id="playerMenuClose" aria-label="Close menu">×</button>' +
          '</header>' +
          '<nav class="player-menu-tabs" id="playerMenuTabs" aria-label="Menu sections"></nav>' +
          '<div class="player-menu-body" id="playerMenuBody"></div>' +
        '</div>' +
      '</div>';
    this.frameEl.insertAdjacentHTML("beforeend", markup);
    this.menuBtn = this.frameEl.querySelector("#playerMenuBtn");
    this.menuBackdrop = this.frameEl.querySelector("#playerMenuBackdrop");
    this.menuBody = this.frameEl.querySelector("#playerMenuBody");
    this.menuTabsEl = this.frameEl.querySelector("#playerMenuTabs");
    this.bind();
    this.sync();
  };

  ScenaReaderMenu.prototype.bind = function () {
    var self = this;
    if (!this.menuBtn || this.menuBtn.dataset.bound === "1") return;
    this.menuBtn.dataset.bound = "1";
    this.menuBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      self.toggle();
    });
    var closeBtn = this.frameEl.querySelector("#playerMenuClose");
    if (closeBtn) closeBtn.addEventListener("click", function () { self.close(); });
    if (this.menuBackdrop) {
      this.menuBackdrop.addEventListener("click", function (e) {
        if (e.target === self.menuBackdrop) self.close();
      });
    }
  };

  ScenaReaderMenu.prototype.renderTabs = function () {
    var self = this;
    if (!this.menuTabsEl) return;
    var tabs = this.availableTabs();
    if (!tabs.length) {
      this.menuTabsEl.innerHTML = "";
      return;
    }
    if (tabs.every(function (t) { return t.id !== self.menuTab; })) {
      this.menuTab = tabs[0].id;
    }
    this.menuTabsEl.innerHTML = tabs.map(function (t) {
      return '<button type="button" class="player-menu-tab' +
        (t.id === self.menuTab ? " is-active" : "") +
        '" data-menu-tab="' + escapeAttr(t.id) + '">' + escapeHtml(t.label) + '</button>';
    }).join("");
    this.menuTabsEl.querySelectorAll(".player-menu-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        self.menuTab = tab.getAttribute("data-menu-tab") || "log";
        self.menuTabsEl.querySelectorAll(".player-menu-tab").forEach(function (t) {
          t.classList.toggle("is-active", t === tab);
        });
        self.renderBody();
      });
    });
  };

  ScenaReaderMenu.prototype.sync = function () {
    var menu = this.getMenuConfig();
    var tabs = this.availableTabs();
    if (!this.menuBtn) return;
    if (menu.enabled === false || !tabs.length) {
      this.menuBtn.hidden = true;
      this.close();
      return;
    }
    this.menuBtn.hidden = false;
    this.renderTabs();
    if (this.menuOpen) this.renderBody();
    this.renderKeyItemsHud();
  };

  ScenaReaderMenu.prototype.open = function (tab) {
    var menu = this.getMenuConfig();
    if (menu.enabled === false || !this.availableTabs().length) return;
    if (tab) this.menuTab = tab;
    this.menuOpen = true;
    if (this.menuBackdrop) this.menuBackdrop.hidden = false;
    if (this.menuBtn) this.menuBtn.setAttribute("aria-expanded", "true");
    if (this.frameEl) this.frameEl.classList.add("player-frame--menu-open");
    this.renderTabs();
    this.renderBody();
  };

  ScenaReaderMenu.prototype.close = function () {
    this.menuOpen = false;
    if (this.menuBackdrop) this.menuBackdrop.hidden = true;
    if (this.menuBtn) this.menuBtn.setAttribute("aria-expanded", "false");
    if (this.frameEl) this.frameEl.classList.remove("player-frame--menu-open");
  };

  ScenaReaderMenu.prototype.toggle = function () {
    if (this.menuOpen) this.close();
    else this.open();
  };

  ScenaReaderMenu.prototype.renderBody = function () {
    if (!this.menuBody) return;
    if (this.menuTab === "inventory") {
      this.menuBody.innerHTML = this.renderInventoryPanel();
    } else if (this.menuTab === "settings") {
      this.menuBody.innerHTML = this.renderSettingsPanel();
      this.bindSettingsPanel();
    } else {
      this.menuBody.innerHTML = this.renderDialogueLogPanel();
    }
  };

  ScenaReaderMenu.prototype.getDialogueLog = function () {
    return this.hooks.getDialogueLog ? this.hooks.getDialogueLog() : [];
  };

  ScenaReaderMenu.prototype.getKeyItems = function () {
    return this.hooks.getKeyItems ? this.hooks.getKeyItems() : {};
  };

  ScenaReaderMenu.prototype.getMetrics = function () {
    return this.hooks.getMetrics ? this.hooks.getMetrics() : {};
  };

  ScenaReaderMenu.prototype.renderInventoryMetricRows = function (rows, menu) {
    if (!rows.length) return "";
    if (menu.inventoryDisplay === "list") {
      return '<ul class="player-inventory-list">' + rows.map(function (row) {
        var metric = row.metric;
        var val = row.value;
        var display = typeof val === "number" && val % 1 !== 0 ? val.toFixed(1) : String(val);
        return '<li><span class="player-inventory-name">' + escapeHtml(metric.displayName || metric.key) +
          ': <strong>' + escapeHtml(display) + '</strong></span></li>';
      }).join("") + '</ul>';
    }
    return '<div class="player-inventory-grid">' + rows.map(function (row) {
      var metric = row.metric;
      var val = row.value;
      var display = typeof val === "number" && val % 1 !== 0 ? val.toFixed(1) : String(val);
      var icon = metric.dataUrl
        ? '<span class="player-inventory-icon" style="background-image:url(' + metric.dataUrl + ')"></span>'
        : '<span class="player-inventory-icon player-inventory-icon--metric" aria-hidden="true">◎</span>';
      return '<div class="player-inventory-cell" title="' + escapeAttr(metric.displayName || metric.key) + '">' +
        icon +
        '<span class="player-inventory-label">' + escapeHtml(metric.displayName || metric.key) + '</span>' +
        '<span class="player-inventory-qty">' + escapeHtml(display) + '</span>' +
      '</div>';
    }).join("") + '</div>';
  };

  ScenaReaderMenu.prototype.renderInventoryKeyItemRows = function (rows, menu) {
    if (!rows.length) return "";
    if (menu.inventoryDisplay === "list") {
      return '<ul class="player-inventory-list">' + rows.map(function (row) {
        var asset = row.asset;
        return '<li><span class="player-inventory-name">' + escapeHtml(asset.label || "Item") + '</span></li>';
      }).join("") + '</ul>';
    }
    return '<div class="player-inventory-grid">' + rows.map(function (row) {
      var asset = row.asset;
      var icon = asset.dataUrl
        ? '<span class="player-inventory-icon" style="background-image:url(' + asset.dataUrl + ')"></span>'
        : '<span class="player-inventory-icon player-inventory-icon--empty">◆</span>';
      return '<div class="player-inventory-cell" title="' + escapeAttr(asset.description || "") + '">' +
        icon +
        '<span class="player-inventory-label">' + escapeHtml(asset.label || "Item") + '</span>' +
      '</div>';
    }).join("") + '</div>';
  };

  ScenaReaderMenu.prototype.renderDialogueLogPanel = function () {
    var log = this.getDialogueLog();
    if (!log.length) {
      return '<p class="player-menu-empty">No dialogue yet — lines appear here as you read.</p>';
    }
    return '<div class="player-log-list">' + log.map(function (entry) {
      var speaker = entry.speaker && entry.speaker !== "Narration"
        ? '<strong class="player-log-speaker">' + escapeHtml(entry.speaker) + '</strong>'
        : "";
      return '<article class="player-log-entry">' + speaker +
        '<p class="player-log-text">' + escapeHtml(entry.text) + '</p></article>';
    }).join("") + '</div>';
  };

  ScenaReaderMenu.prototype.renderInventoryPanel = function () {
    var series = this.getSeries();
    var menu = this.getMenuConfig();
    if (!series || !root.ScenaStore) {
      return '<p class="player-menu-empty">Inventory is unavailable.</p>';
    }
    var metricRows = ScenaStore.listVisibleInventoryMetrics(series, this.getMetrics());
    var keyRows = ScenaStore.listVisibleKeyItems(series, this.getKeyItems());
    if (!metricRows.length && !keyRows.length) {
      return '<p class="player-menu-empty">Your inventory is empty. Hidden items and scores never appear here.</p>';
    }
    var html = "";
    if (metricRows.length) {
      html += '<section class="player-inventory-section">' +
        '<h3 class="player-inventory-section-title">Metrics</h3>' +
        this.renderInventoryMetricRows(metricRows, menu) +
      '</section>';
    }
    if (keyRows.length) {
      html += '<section class="player-inventory-section">' +
        '<h3 class="player-inventory-section-title">Key items</h3>' +
        this.renderInventoryKeyItemRows(keyRows, menu) +
      '</section>';
    }
    return html;
  };

  ScenaReaderMenu.prototype.renderSettingsPanel = function () {
    var prefs = root.ScenaAudio ? ScenaAudio.getPrefs() : { masterVolume: 1, bgmVolume: 0.65, sfxVolume: 0.85, muted: false };
    var parallax = this.hooks.getParallaxEnabled ? this.hooks.getParallaxEnabled() : false;
    return '<div class="player-settings">' +
      '<label class="player-setting-row">' +
        '<span>Master volume</span>' +
        '<input type="range" id="playerVolMaster" min="0" max="100" step="1" value="' + Math.round(prefs.masterVolume * 100) + '">' +
        '<span class="player-setting-val" id="playerVolMasterVal">' + Math.round(prefs.masterVolume * 100) + '%</span>' +
      '</label>' +
      '<label class="player-setting-row">' +
        '<span>Music</span>' +
        '<input type="range" id="playerVolBgm" min="0" max="100" step="1" value="' + Math.round(prefs.bgmVolume * 100) + '">' +
        '<span class="player-setting-val" id="playerVolBgmVal">' + Math.round(prefs.bgmVolume * 100) + '%</span>' +
      '</label>' +
      '<label class="player-setting-row">' +
        '<span>Effects &amp; voice</span>' +
        '<input type="range" id="playerVolSfx" min="0" max="100" step="1" value="' + Math.round(prefs.sfxVolume * 100) + '">' +
        '<span class="player-setting-val" id="playerVolSfxVal">' + Math.round(prefs.sfxVolume * 100) + '%</span>' +
      '</label>' +
      '<label class="player-setting-row player-setting-row--check">' +
        '<input type="checkbox" id="playerMuted"' + (prefs.muted ? " checked" : "") + '>' +
        '<span>Mute all audio</span>' +
      '</label>' +
      '<label class="player-setting-row player-setting-row--check">' +
        '<input type="checkbox" id="playerParallax"' + (parallax ? " checked" : "") + '>' +
        '<span>Stage parallax (desktop)</span>' +
      '</label>' +
    '</div>';
  };

  ScenaReaderMenu.prototype.bindSettingsPanel = function () {
    if (!root.ScenaAudio || !this.menuBody) return;
    var self = this;
    function pct(el) { return (parseInt(el.value, 10) || 0) / 100; }
    function sync() {
      var master = self.menuBody.querySelector("#playerVolMaster");
      var bgm = self.menuBody.querySelector("#playerVolBgm");
      var sfx = self.menuBody.querySelector("#playerVolSfx");
      var muted = self.menuBody.querySelector("#playerMuted");
      var parallax = self.menuBody.querySelector("#playerParallax");
      ScenaAudio.setPrefs({
        masterVolume: master ? pct(master) : 1,
        bgmVolume: bgm ? pct(bgm) : 0.65,
        sfxVolume: sfx ? pct(sfx) : 0.85,
        muted: muted ? muted.checked : false,
      });
      if (master) {
        var mv = self.menuBody.querySelector("#playerVolMasterVal");
        if (mv) mv.textContent = master.value + "%";
      }
      if (bgm) {
        var bv = self.menuBody.querySelector("#playerVolBgmVal");
        if (bv) bv.textContent = bgm.value + "%";
      }
      if (sfx) {
        var sv = self.menuBody.querySelector("#playerVolSfxVal");
        if (sv) sv.textContent = sfx.value + "%";
      }
      if (parallax && self.hooks.setParallaxEnabled) {
        self.hooks.setParallaxEnabled(parallax.checked);
      }
    }
    this.menuBody.querySelectorAll("#playerVolMaster, #playerVolBgm, #playerVolSfx, #playerMuted, #playerParallax").forEach(function (el) {
      el.addEventListener("input", sync);
      el.addEventListener("change", sync);
    });
  };

  ScenaReaderMenu.prototype.renderKeyItemsHud = function () {
    var menu = this.getMenuConfig();
    if (!menu.showInventoryHud || menu.showInventory === false) {
      var hud = this.frameEl && this.frameEl.querySelector("#playerKeyItems");
      if (hud) { hud.hidden = true; hud.innerHTML = ""; }
      return;
    }
    var series = this.getSeries();
    if (!this.frameEl || !series || !root.ScenaStore) return;
    var hud = this.frameEl.querySelector("#playerKeyItems");
    if (!hud) {
      hud = document.createElement("div");
      hud.className = "player-key-items";
      hud.id = "playerKeyItems";
      hud.setAttribute("aria-label", "Inventory");
      this.frameEl.appendChild(hud);
    }
    var rows = ScenaStore.listVisibleHudKeyItems(series, this.getKeyItems());
    if (!rows.length) {
      hud.hidden = true;
      hud.innerHTML = "";
      return;
    }
    hud.hidden = false;
    hud.innerHTML = rows.map(function (row) {
      var asset = row.asset;
      var count = row.count;
      var icon = asset.dataUrl
        ? '<span class="player-key-item-icon" style="background-image:url(' + asset.dataUrl + ')"></span>'
        : '<span class="player-key-item-icon player-key-item-icon--placeholder" aria-hidden="true">◆</span>';
      var qty = "";
      return '<div class="player-key-item" title="' + escapeAttr(asset.description || asset.label || "") + '">' +
        icon +
        '<span class="player-key-item-label">' + escapeHtml(asset.label || "Item") + qty + '</span>' +
      '</div>';
    }).join("");
  };

  ScenaReaderMenu.prototype.onInventoryChanged = function () {
    this.renderKeyItemsHud();
    if (this.menuOpen && this.menuTab === "inventory") this.renderBody();
  };

  ScenaReaderMenu.prototype.onDialogueAppended = function () {
    if (this.menuOpen && this.menuTab === "log") this.renderBody();
  };

  root.ScenaReaderMenu = ScenaReaderMenu;
})(typeof window !== "undefined" ? window : globalThis);
