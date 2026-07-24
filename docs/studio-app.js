/**
 * Arleco creator studio — SPA router + views
 */
(function () {
  var userId = null;
  var userEmail = "";
  var userProfile = null;
  var graphEditor = null;
  var toastTimer = null;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function toast(msg) {
    var el = $("#studioToast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("is-show"); }, 2600);
  }

  function persistSeries(series, okMessage) {
    return ScenaStore.saveSeries(userId, series).then(function (result) {
      if (!result.ok) {
        if (result.local) {
          toast((result.error || "Cloud save failed.") + " Your copy is saved in this browser.");
        } else {
          toast(result.error || "Could not save.");
        }
        return false;
      }
      if (result.warning) showStorageBanner(result.warning);
      if (okMessage) toast(okMessage);
      else if (result.imagesPending) toast("Saved to cloud (images still local — set up storage bucket)");
      else if (result.cloud) toast("Saved to cloud");
      else toast("Saved");
      return true;
    });
  }

  function showStorageBanner(message) {
    var existing = $("#storageSetupBanner");
    if (existing) {
      existing.textContent = message;
      existing.hidden = false;
      return;
    }
    var bar = document.createElement("div");
    bar.id = "storageSetupBanner";
    bar.className = "storage-setup-banner";
    bar.textContent = message;
    var topbar = $(".studio-topbar");
    if (topbar && topbar.parentNode) {
      topbar.parentNode.insertBefore(bar, topbar.nextSibling);
    }
  }

  function parseRoute() {
    var hash = location.hash.replace(/^#/, "") || "/";
    var parts = hash.split("/").filter(Boolean);
    if (parts.length === 0) return { view: "dashboard" };
    if (parts[0] === "account") {
      window.location.replace("/account");
      return { view: "dashboard" };
    }
    if (parts[0] === "library") return { view: "library", libraryTab: parts[1] === "shop" ? "shop" : "assets" };
    if (parts[0] === "shop") return { view: "library", libraryTab: "shop" };
    if (parts[0] === "jams") {
      if (parts[1] === "new") return { view: "jams", jamMode: "new" };
      if (parts[2] === "edit" && parts[1]) return { view: "jams", jamMode: "edit", jamId: parts[1] };
      if (parts[1]) return { view: "jams", jamMode: "detail", jamId: parts[1] };
      return { view: "jams", jamMode: "list" };
    }
    if (parts[0] === "series" && parts[1]) {
      var seriesId = parts[1];
      if (parts[2] === "settings") return { view: "settings", seriesId: seriesId };
      if (parts[2] === "graph") return { view: "graph", seriesId: seriesId };
      if (parts[2] === "resources") return { view: "resources", seriesId: seriesId, tab: parts[3] || "characters" };
      if (parts[2] === "episodes") return { view: "episodes", seriesId: seriesId };
      var savedView = "graph";
      try {
        var stored = sessionStorage.getItem("scena.studioView." + seriesId);
        if (stored === "episodes" || stored === "settings" || stored === "graph") savedView = stored;
      } catch (e) { /* ignore */ }
      return { view: savedView, seriesId: seriesId };
    }
    return { view: "dashboard" };
  }

  function rememberStudioView(seriesId, view) {
    if (!seriesId || !view || view === "resources") return;
    try { sessionStorage.setItem("scena.studioView." + seriesId, view); } catch (e) { /* ignore */ }
  }

  function navigate(hash) {
    var normalized = hash.charAt(0) === "#" ? hash.slice(1) : hash;
    if (!normalized || normalized.charAt(0) !== "/") normalized = "/" + normalized;
    if (normalized === "/account" || normalized.indexOf("/account/") === 0) {
      window.location.assign("/account");
      return;
    }
    var parts = normalized.split("/").filter(Boolean);
    if (parts[0] === "series" && parts[1] && parts[2]) {
      rememberStudioView(parts[1], parts[2] === "resources" ? "graph" : parts[2]);
    }
    var current = location.hash.replace(/^#/, "") || "/";
    location.hash = normalized;
    if (current === normalized) render();
  }

  function formatDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function episodeStatusLabel(ep) {
    if (!window.ScenaStore || !ScenaStore.episodePublishStatus) {
      return ep.isLive ? "Live" : "Draft";
    }
    var status = ScenaStore.episodePublishStatus(ep);
    if (status === "live") return "Live";
    if (status === "scheduled") return "Scheduled";
    return "Draft";
  }

  function episodeStatusClass(ep) {
    var status = window.ScenaStore && ScenaStore.episodePublishStatus
      ? ScenaStore.episodePublishStatus(ep)
      : (ep.isLive ? "live" : "draft");
    return status === "live" ? " is-live" : (status === "scheduled" ? " is-scheduled" : "");
  }

  function renderShell(activeView, series) {
    var sidebar = $("#studioSidebar");
    var isSeries = Boolean(series);

    var nav = "";
    if (isSeries) {
      nav +=
        '<div class="sidebar-series-title">' + escapeHtml(series.title || "Untitled series") + '</div>' +
        '<div class="sidebar-section-label">Workspace</div>' +
        sidebarLink("#/series/" + series.id + "/graph", "Story editor", activeView === "graph") +
        sidebarLink("#/series/" + series.id + "/episodes", "Episodes", activeView === "episodes") +
        '<div class="sidebar-section-label">Series</div>' +
        sidebarLink("#/series/" + series.id + "/settings", "Settings", activeView === "settings");
    }

    sidebar.innerHTML =
      '<div class="sidebar-section-label">Creator</div>' +
      sidebarLink("#/", "My series", activeView === "dashboard") +
      sidebarLink("#/library", "My assets", activeView === "library") +
      sidebarLink("#/jams", "Game jams", activeView === "jams") +
      nav;

    sidebar.querySelectorAll(".sidebar-link").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        navigate(a.getAttribute("href").replace(/^#/, ""));
      });
    });
  }

  function sidebarLink(href, label, active) {
    return '<a class="sidebar-link' + (active ? " is-active" : "") + '" href="' + href + '">' + label + "</a>";
  }

  function destroyGraphEditor() {
    if (graphEditor && graphEditor.destroy) {
      graphEditor.destroy();
    }
    graphEditor = null;
  }

  function mountGraphEditor(container, opts) {
    if (window.ScenaGraphEditorBridge && window.ScenaGraphEditorBridge.create) {
      return window.ScenaGraphEditorBridge.create(container, opts);
    }
    return new ScenaGraphEditor(container, opts);
  }

  function render() {
    var route = parseRoute();
    var main = $("#studioMain");
    if (!main) return;
    destroyGraphEditor();
    updateTopbarForRoute(route);

    try {
      renderRoute(route, main);
    } catch (err) {
      console.error(err);
      toast((err && err.message) || "Could not load this page.");
    }
  }

  function updateTopbarForRoute(route) {
    var center = $("#studioTopbarCenter");
    var wrap = $("#studioSearchWrap");
    var input = $("#studioSeriesSearch");
    var showSearch = route.view === "dashboard";
    if (center) center.classList.toggle("is-visible", showSearch);
    if (wrap) wrap.hidden = !showSearch;
    if (input && !showSearch) input.value = "";
  }

  function applyDashboardSearch(query) {
    var q = (query || "").trim().toLowerCase();
    var visible = 0;
    document.querySelectorAll(".series-card:not(.series-card--template)").forEach(function (card) {
      var title = (card.querySelector("h3") && card.querySelector("h3").textContent || "").toLowerCase();
      var desc = (card.querySelector("p") && card.querySelector("p").textContent || "").toLowerCase();
      var match = !q || title.indexOf(q) !== -1 || desc.indexOf(q) !== -1;
      card.hidden = !match;
      if (match) visible += 1;
    });
    document.querySelectorAll(".series-card--template").forEach(function (card) {
      var title = (card.querySelector("h3") && card.querySelector("h3").textContent || "").toLowerCase();
      var desc = (card.querySelector("p") && card.querySelector("p").textContent || "").toLowerCase();
      var match = !q || title.indexOf(q) !== -1 || desc.indexOf(q) !== -1;
      card.hidden = !match;
      if (match) visible += 1;
    });
    var empty = $("#dashboardSearchEmpty");
    if (empty) empty.hidden = visible > 0 || !q;
  }

  function bindDashboardSearch() {
    var input = $("#studioSeriesSearch");
    if (!input || input.dataset.bound === "1") return;
    input.dataset.bound = "1";
    input.addEventListener("input", function () {
      applyDashboardSearch(input.value);
    });
  }

  function renderRoute(route, main) {

    if (route.view === "dashboard") {
      ScenaStore.setActiveSeries(null);
      renderShell("dashboard", null);
      main.innerHTML = renderDashboard();
      bindDashboard();
      return;
    }

    if (route.view === "library") {
      ScenaStore.setActiveSeries(null);
      renderShell("library", null);
      renderLibraryPage(main, route.libraryTab || "assets");
      return;
    }

    if (route.view === "jams") {
      ScenaStore.setActiveSeries(null);
      renderShell("jams", null);
      renderJamsPage(main, route);
      return;
    }

    var series = ScenaStore.getSeries(userId, route.seriesId);
    if (!series) {
      toast("Series not found — it may still be saving.");
      navigate("/");
      return;
    }

    ScenaStore.setActiveSeries(series.id);
    rememberStudioView(series.id, route.view);
    renderShell(route.view, series);

    if (route.view === "settings") {
      main.innerHTML = renderSettingsForm(series);
      try {
        bindSettingsForm();
      } catch (err) {
        console.error(err);
        toast("Settings form failed to load — try refreshing the page.");
      }
    } else if (route.view === "graph") {
      main.innerHTML = '<div class="page-wide" id="graphRoot"></div>';
      var graphOpts = {
        series: series,
        feedbackUserId: userId,
        feedbackProfile: userProfile,
        feedbackContainer: document.getElementById("app") || document.body,
        onChange: function (updated) {
          return ScenaStore.saveSeries(userId, updated).then(function (result) {
            if (result.warning) showStorageBanner(result.warning);
            return result;
          });
        },
        onSaveError: function (msg) {
          toast(msg || "Save failed");
        },
        onEpisodePublished: function () {
          if (window.ScenaBadges) {
            awardBadges(ScenaBadges.recordEpisodePublished(userId));
          }
        },
      };
      graphEditor = mountGraphEditor($("#graphRoot"), graphOpts);
      var openKey = "scena.openEpisode." + series.id;
      var openId = sessionStorage.getItem(openKey);
      if (openId) {
        sessionStorage.removeItem(openKey);
        setTimeout(function () { graphEditor.openEpisodeFromGraph(openId); }, 0);
      }
    } else if (route.view === "resources") {
      navigate("/series/" + series.id + "/graph");
      return;
    } else if (route.view === "episodes") {
      main.innerHTML = renderEpisodes(series);
      bindEpisodes(series);
    }
  }

  function paintTopbarProfile(profile) {
    if (!window.ScenaAccount) return;
    ScenaAccount.paintTopbar($("#studioUserEmail"), profile, {
      userEmail: userEmail,
      title: "Edit account profile",
      onClick: function () {
        window.location.assign("/account");
      },
    });
  }

  function awardBadges(newly) {
    if (!window.ScenaBadges || !newly || !newly.length) return;
    ScenaBadges.showUnlockCelebration(newly, toast);
  }

  function renderTemplateSection() {
    if (!window.ScenaDemo || !ScenaDemo.listTemplates) return "";
    var templates = ScenaDemo.listTemplates();
    var cards = templates.map(function (t) {
      var imported = ScenaStore.listSeries(userId).find(function (s) {
        return s.templateSource === t.id;
      });
      var actions = imported
        ? ('<button type="button" class="btn btn-primary btn-sm" data-open-graph="' + imported.id + '">Open graph</button>' +
           '<span class="series-card-tag">In your account</span>')
        : ('<button type="button" class="btn btn-primary btn-sm" data-import-template="' + escapeAttr(t.id) + '">Import graph</button>');
      return (
        '<article class="series-card series-card--template">' +
          '<div class="series-card-body">' +
            '<h3>' + escapeHtml(t.title) + '</h3>' +
            '<p>' + escapeHtml(t.description || "") + '</p>' +
            '<div class="series-card-actions">' + actions + '</div>' +
          '</div>' +
        '</article>'
      );
    }).join("");

    return (
      '<section class="studio-templates-panel">' +
        '<div class="studio-badges-head">' +
          '<h2>Example graphs</h2>' +
          '<p class="field-hint">Import a full branching demo into your account to inspect how episodes connect.</p>' +
        '</div>' +
        '<div class="series-grid series-grid--templates">' + cards + '</div>' +
      '</section>'
    );
  }

  function renderDashboard() {
    var list = ScenaStore.listSeries(userId).filter(function (s) { return !s.templateSource; });
    var html =
      '<div class="page page-dashboard">' +
        '<div class="dashboard-layout">' +
          '<div class="dashboard-main">' +
            '<div class="page-head">' +
              '<div><h1>My series</h1><p>Create and publish episodic visual novels.</p></div>' +
              '<button type="button" class="btn btn-primary" id="newSeriesBtn">New series</button>' +
            '</div>' +
            renderTemplateSection();

    if (list.length === 0) {
      html +=
        '<div class="empty-state">' +
          '<h2>No series yet</h2>' +
          '<p>Set up your listing, build your story graph, and publish your first episode.</p>' +
          '<button type="button" class="btn btn-primary" id="newSeriesBtn2">Create your first series</button>' +
        '</div>';
    } else {
      html += '<div class="series-grid">';
      list.forEach(function (s) {
        var live = ScenaStore.hasPublishedEpisodes(s);
        html +=
          '<article class="series-card">' +
            '<div class="series-card-thumb' + (s.thumbnailDataUrl ? "" : " is-empty") + '" style="' + (s.thumbnailDataUrl ? "background-image:url(" + s.thumbnailDataUrl + ")" : "") + '">' +
              '<span class="series-card-status' + (live ? " is-live" : "") + '">' + (live ? "Live" : "Draft") + '</span>' +
            '</div>' +
            '<div class="series-card-body">' +
              '<h3>' + escapeHtml(s.title || "Untitled") + '</h3>' +
              '<p>' + escapeHtml(s.shortDescription || "No description yet.") + '</p>' +
              '<div class="series-card-meta">Updated ' + formatDate(s.updatedAt) + '</div>' +
              '<div class="series-card-actions">' +
                '<button type="button" class="btn btn-primary btn-sm" data-open-graph="' + s.id + '">Open graph</button>' +
                '<button type="button" class="btn btn-sm" data-open-settings="' + s.id + '">Settings</button>' +
                '<button type="button" class="btn btn-danger btn-sm" data-delete-series="' + s.id + '">Delete</button>' +
              '</div>' +
            '</div>' +
          '</article>';
      });
      html += '</div>';
    }

    html +=
          '<p class="field-hint dashboard-search-empty" id="dashboardSearchEmpty" hidden>No series match your search.</p>' +
          '</div>' +
          '<aside class="studio-badges-panel" aria-label="Your laurels">' +
            '<div class="studio-badges-head">' +
              '<h2>Your laurels</h2>' +
              '<div id="studioBadgeSummary"></div>' +
              '<a class="btn btn-sm btn-ghost" href="/learn">The Conservatory →</a>' +
            '</div>' +
            '<div class="studio-badges-scroll">' +
              '<div id="studioBadgeGrid"></div>' +
            '</div>' +
          '</aside>' +
        '</div>' +
      '</div>';
    return html;
  }

  function paintDashboardBadges() {
    if (!window.ScenaBadges) return;
    ScenaBadges.renderSummary($("#studioBadgeSummary"), userId);
    ScenaBadges.renderGrid($("#studioBadgeGrid"), { userId: userId });
  }

  function bindDashboard() {
    bindDashboardSearch();
    applyDashboardSearch($("#studioSeriesSearch") ? $("#studioSeriesSearch").value : "");
    var creating = false;
    function goNew() {
      if (creating) return;
      creating = true;
      var btns = [$("#newSeriesBtn"), $("#newSeriesBtn2")].filter(Boolean);
      btns.forEach(function (b) {
        b.disabled = true;
        if (b.id === "newSeriesBtn") b.textContent = "Creating…";
        else b.textContent = "Creating your first series…";
      });
      ScenaStore.createSeries(userId).then(function (s) {
        if (window.ScenaBadges) {
          awardBadges(ScenaBadges.recordSeriesCreated(userId));
        }
        ScenaStore.setActiveSeries(s.id);
        navigate("/series/" + s.id + "/settings");
      }).catch(function (err) {
        toast((err && err.message) || "Could not create series.");
        creating = false;
        btns.forEach(function (b) {
          b.disabled = false;
          if (b.id === "newSeriesBtn") b.textContent = "New series";
          else b.textContent = "Create your first series";
        });
      });
    }
    var b1 = $("#newSeriesBtn");
    var b2 = $("#newSeriesBtn2");
    if (b1) b1.addEventListener("click", goNew);
    if (b2) b2.addEventListener("click", goNew);
    paintDashboardBadges();

    document.querySelectorAll("[data-open-graph]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        navigate("/series/" + btn.getAttribute("data-open-graph") + "/graph");
      });
    });
    document.querySelectorAll("[data-open-settings]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        navigate("/series/" + btn.getAttribute("data-open-settings") + "/settings");
      });
    });
    document.querySelectorAll("[data-delete-series]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var seriesId = btn.getAttribute("data-delete-series");
        var s = ScenaStore.getSeries(userId, seriesId);
        var title = (s && s.title) || "Untitled";
        if (!confirm('Delete "' + title + '"? This cannot be undone.')) return;
        btn.disabled = true;
        ScenaStore.deleteSeries(userId, seriesId).then(function () {
          toast("Series deleted");
          render();
        }).catch(function (err) {
          btn.disabled = false;
          toast((err && err.message) || "Could not delete series.");
        });
      });
    });
    document.querySelectorAll("[data-import-template]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var templateId = btn.getAttribute("data-import-template");
        btn.disabled = true;
        ScenaStore.importTemplateSeries(userId, templateId).then(function (series) {
          toast("Imported \"" + (series.title || "template") + "\" — open the graph to explore.");
          render();
        }).catch(function (err) {
          btn.disabled = false;
          toast((err && err.message) || "Could not import template.");
        });
      });
    });
  }

  function renderReaderUiSection(series) {
    ScenaStore.ensureReaderUi(series);
    var ui = series.readerUi;
    var resolved = ScenaStore.resolveReaderUi(series);
    var presets = [
      { id: "scena-classic", name: "Classic", desc: "Teal accent, dark dialogue bar" },
      { id: "scena-minimal", name: "Minimal", desc: "Clean lines, subtle UI" },
      { id: "scena-frame", name: "Stage frame", desc: "Gold proscenium look" },
      { id: "custom", name: "Custom", desc: "Full control + your sprites" },
    ];
    var presetCards = presets.map(function (p) {
      return '<button type="button" class="ui-preset-card' + (ui.preset === p.id ? " is-active" : "") +
        '" data-ui-preset="' + p.id + '"><strong>' + escapeHtml(p.name) + '</strong><span>' + escapeHtml(p.desc) + '</span></button>';
    }).join("");

    var uiAssets = ScenaStore.listAudioAssets(series, "ui");
    var clickOpts = '<option value="">— Default (Button tap) —</option>' + uiAssets.map(function (a) {
      return '<option value="' + a.id + '"' + (ui.sounds.clickAssetId === a.id ? " selected" : "") + '>' + escapeHtml(a.label) + '</option>';
    }).join("");

    return (
      '<section class="form-section" id="readerUiSection">' +
        '<h2>Reader UI</h2>' +
        '<p class="field-hint">Applies to the whole series — dialogue box, choice buttons, and preview aspect ratio. Preview updates in the Story editor.</p>' +
        '<div class="ui-preset-cards" id="uiPresetCards">' + presetCards + '</div>' +
        '<div class="ui-settings-grid">' +
          '<div class="field"><label>Aspect ratio</label>' +
            '<select name="uiAspectRatio">' +
              '<option value="16:9"' + (ui.aspectRatio === "16:9" ? " selected" : "") + '>16:9 landscape</option>' +
              '<option value="9:16"' + (ui.aspectRatio === "9:16" ? " selected" : "") + '>9:16 portrait</option>' +
              '<option value="4:3"' + (ui.aspectRatio === "4:3" ? " selected" : "") + '>4:3 classic</option>' +
            '</select></div>' +
          '<div class="field"><label>Dialogue shape</label>' +
            '<select name="uiDialogueShape">' +
              ["bar", "minimal", "frame", "box"].map(function (s) {
                return '<option value="' + s + '"' + (ui.shapes.dialogue === s ? " selected" : "") + '>' + s + '</option>';
              }).join("") +
            '</select></div>' +
          '<div class="field"><label>Choice shape</label>' +
            '<select name="uiChoiceShape">' +
              ["rounded", "pill", "underline", "frame"].map(function (s) {
                return '<option value="' + s + '"' + (ui.shapes.choice === s ? " selected" : "") + '>' + s + '</option>';
              }).join("") +
            '</select></div>' +
          '<div class="field"><label>Accent color</label><input type="color" name="uiAccent" value="' + escapeAttr(resolved.colors.accent || "#2a9d8f") + '"></div>' +
          '<div class="field"><label>Speaker color</label><input type="color" name="uiSpeaker" value="' + escapeAttr(resolved.colors.speaker || "#2a9d8f") + '"></div>' +
          '<div class="field"><label>Choice text</label><input type="color" name="uiChoiceText" value="' + escapeAttr(resolved.colors.choiceText || "#ffffff") + '"></div>' +
          '<div class="field"><label>Dialogue scale</label><input type="range" name="uiDialogueScale" min="0.7" max="1.4" step="0.05" value="' + (ui.sizes.dialogueScale || 1) + '"><span class="field-hint" id="uiDialogueScaleVal">' + (ui.sizes.dialogueScale || 1) + '×</span></div>' +
          '<div class="field"><label>Choice scale</label><input type="range" name="uiChoiceScale" min="0.7" max="1.4" step="0.05" value="' + (ui.sizes.choiceScale || 1) + '"><span class="field-hint" id="uiChoiceScaleVal">' + (ui.sizes.choiceScale || 1) + '×</span></div>' +
          '<div class="field"><label>Corner radius</label><input type="range" name="uiCornerRadius" min="0" max="24" step="1" value="' + (ui.sizes.cornerRadius || 6) + '"><span class="field-hint" id="uiCornerRadiusVal">' + (ui.sizes.cornerRadius || 6) + 'px</span></div>' +
        '</div>' +
        '<div class="form-row" style="margin-top:16px">' +
          '<div class="field">' +
            '<label>Custom dialogue box sprite</label>' +
            '<div class="ui-sprite-preview" id="uiDialogueSpritePreview" style="' + (ui.customSprites.dialogueBox ? "background-image:url(" + ui.customSprites.dialogueBox + ")" : "") + '"></div>' +
            '<input type="file" accept="image/*" id="uiDialogueSpriteInput">' +
            '<button type="button" class="btn btn-sm btn-ghost" id="uiDialogueSpriteClear"' + (ui.customSprites.dialogueBox ? "" : " hidden") + '>Remove</button>' +
            '<p class="field-hint">PNG with transparency recommended. Best on Custom preset.</p>' +
          '</div>' +
          '<div class="field">' +
            '<label>Custom choice button sprite</label>' +
            '<div class="ui-sprite-preview" id="uiChoiceSpritePreview" style="' + (ui.customSprites.choiceButton ? "background-image:url(" + ui.customSprites.choiceButton + ")" : "") + '"></div>' +
            '<input type="file" accept="image/*" id="uiChoiceSpriteInput">' +
            '<button type="button" class="btn btn-sm btn-ghost" id="uiChoiceSpriteClear"' + (ui.customSprites.choiceButton ? "" : " hidden") + '>Remove</button>' +
          '</div>' +
        '</div>' +
        '<div class="sound-settings-block">' +
          '<h3>In-game menu</h3>' +
          '<p class="field-hint">Readers open the ☰ menu (top right during play) for transcript, inventory, and audio. Turn sections off for minimalist stories.</p>' +
          '<div class="ui-settings-grid">' +
            '<div class="field"><label class="field-inline">' +
              '<input type="checkbox" name="uiMenuEnabled"' + (ui.menu && ui.menu.enabled !== false ? " checked" : "") + '> ' +
              'Show reader menu during play</label></div>' +
            '<div class="field"><label class="field-inline">' +
              '<input type="checkbox" name="uiShowTranscript"' + (ui.menu && ui.menu.showTranscript !== false ? " checked" : "") + '> ' +
              'Transcript tab</label></div>' +
            '<div class="field"><label class="field-inline">' +
              '<input type="checkbox" name="uiShowInventory"' + (ui.menu && ui.menu.showInventory !== false ? " checked" : "") + '> ' +
              'Inventory tab</label></div>' +
            '<div class="field"><label class="field-inline">' +
              '<input type="checkbox" name="uiShowAudioSettings"' + (ui.menu && ui.menu.showAudioSettings !== false ? " checked" : "") + '> ' +
              'Audio settings tab</label></div>' +
            '<div class="field"><label>Inventory layout</label>' +
              '<select name="uiInventoryDisplay">' +
                '<option value="grid"' + ((ui.menu && ui.menu.inventoryDisplay === "grid") ? " selected" : "") + '>Grid — icons and labels</option>' +
                '<option value="list"' + ((ui.menu && ui.menu.inventoryDisplay === "list") ? " selected" : "") + '>List — names and quantities</option>' +
              '</select></div>' +
            '<div class="field"><label class="field-inline">' +
              '<input type="checkbox" name="uiShowInventoryHud"' + (ui.menu && ui.menu.showInventoryHud ? " checked" : "") + '> ' +
              'Show compact inventory HUD on screen (in addition to menu)</label></div>' +
          '</div>' +
        '</div>' +
        '<div class="sound-settings-block">' +
          '<h3>UI sound</h3>' +
          '<p class="field-hint">Background music is set per beat on the story graph (inherited like stage). Upload clips in <strong>Story editor → Audio library</strong>.</p>' +
          '<div class="field">' +
            '<label>Button click</label>' +
            '<div class="sound-field-row">' +
              '<select name="uiClickAsset">' + clickOpts + '</select>' +
              '<button type="button" class="btn btn-sm" id="uiClickPreviewBtn">▶ Preview</button>' +
            '</div>' +
            '<p class="field-hint">Leave on default to use the built-in tap sound.</p>' +
          '</div>' +
        '</div>' +
      '</section>'
    );
  }

  function collectReaderUi(form, series) {
    ScenaStore.ensureReaderUi(series);
    var ui = series.readerUi;
    var presetActive = document.querySelector("#uiPresetCards .ui-preset-card.is-active");
    if (presetActive) ui.preset = presetActive.getAttribute("data-ui-preset");
    var aspect = form.querySelector('[name="uiAspectRatio"]');
    if (aspect) ui.aspectRatio = aspect.value;
    var dialogueShape = form.querySelector('[name="uiDialogueShape"]');
    var choiceShape = form.querySelector('[name="uiChoiceShape"]');
    var uiAccent = form.querySelector('[name="uiAccent"]');
    var uiSpeaker = form.querySelector('[name="uiSpeaker"]');
    var uiChoiceText = form.querySelector('[name="uiChoiceText"]');
    var uiDialogueScale = form.querySelector('[name="uiDialogueScale"]');
    var uiChoiceScale = form.querySelector('[name="uiChoiceScale"]');
    var uiCornerRadius = form.querySelector('[name="uiCornerRadius"]');
    if (dialogueShape) ui.shapes.dialogue = dialogueShape.value;
    if (choiceShape) ui.shapes.choice = choiceShape.value;
    if (uiAccent) ui.colors.accent = uiAccent.value;
    if (uiSpeaker) ui.colors.speaker = uiSpeaker.value;
    if (uiChoiceText) ui.colors.choiceText = uiChoiceText.value;
    if (uiDialogueScale) ui.sizes.dialogueScale = parseFloat(uiDialogueScale.value) || 1;
    if (uiChoiceScale) ui.sizes.choiceScale = parseFloat(uiChoiceScale.value) || 1;
    if (uiCornerRadius) ui.sizes.cornerRadius = parseInt(uiCornerRadius.value, 10) || 6;
    if (!ui.sounds) ui.sounds = { clickAssetId: null };
    if (!ui.menu) ui.menu = {
      enabled: true,
      showTranscript: true,
      showInventory: true,
      showAudioSettings: true,
      inventoryDisplay: "grid",
      showInventoryHud: false,
    };
    var clickSel = form.querySelector('[name="uiClickAsset"]');
    if (clickSel) ui.sounds.clickAssetId = clickSel.value || null;
    var menuEnabled = form.querySelector('[name="uiMenuEnabled"]');
    if (menuEnabled) ui.menu.enabled = menuEnabled.checked;
    var showTranscript = form.querySelector('[name="uiShowTranscript"]');
    if (showTranscript) ui.menu.showTranscript = showTranscript.checked;
    var showInventory = form.querySelector('[name="uiShowInventory"]');
    if (showInventory) ui.menu.showInventory = showInventory.checked;
    var showAudioSettings = form.querySelector('[name="uiShowAudioSettings"]');
    if (showAudioSettings) ui.menu.showAudioSettings = showAudioSettings.checked;
    var invDisplay = form.querySelector('[name="uiInventoryDisplay"]');
    if (invDisplay) ui.menu.inventoryDisplay = invDisplay.value === "list" ? "list" : "grid";
    var invHud = form.querySelector('[name="uiShowInventoryHud"]');
    if (invHud) ui.menu.showInventoryHud = invHud.checked;
  }

  function renderSettingsForm(series) {
    if (window.ScenaStore && ScenaStore.migrateSeriesTaxonomy) ScenaStore.migrateSeriesTaxonomy(series);
    var genreChips = ScenaStore.GENRE_TAGS.map(function (f) {
      var on = (series.genres || []).indexOf(f.key) >= 0;
      return '<button type="button" class="flag-chip' + (on ? " is-on" : "") + '" data-genre="' + f.key + '">' + f.label + '</button>';
    }).join("");
    var matureChips = ScenaStore.MATURE_CONTENT_FLAGS.map(function (f) {
      var on = (series.contentFlags || []).indexOf(f.key) >= 0;
      return '<button type="button" class="flag-chip flag-chip--mature' + (on ? " is-on" : "") + '" data-mature-flag="' + f.key + '">' + f.label + '</button>';
    }).join("");

    return (
      '<div class="page">' +
        '<div class="page-head">' +
          '<div><h1>Series settings</h1><p>Listing info and content flags. Build your story in the Graph editor.</p></div>' +
          '<div style="display:flex;gap:8px">' +
            (series.id ? '<button type="button" class="btn btn-danger btn-sm" id="deleteSeriesBtn">Delete</button>' : '') +
            '<button type="button" class="btn btn-primary" id="saveSettingsBtn">Save</button>' +
          '</div>' +
        '</div>' +
        '<form id="settingsForm">' +
          '<section class="form-section">' +
            '<h2>Basics</h2>' +
            field("Title", "title", series.title, "Required for listing") +
            field("URL slug", "slug", series.slug || ScenaStore.slugify(series.title), "arleco.app/s/your-slug") +
            field("Short description", "shortDescription", series.shortDescription, "Max 160 chars — grid card blurb", true) +
            field("Long description", "longDescription", series.longDescription, "Series detail page body", true, 5) +
          '</section>' +
          '<section class="form-section">' +
            '<h2>Listing images</h2>' +
            '<div class="form-row">' +
              '<div class="field">' +
                '<label>Thumbnail</label>' +
                '<div class="upload-preview' + (series.thumbnailDataUrl ? "" : "") + '" id="thumbPreview" style="' + (series.thumbnailDataUrl ? "background-image:url(" + series.thumbnailDataUrl + ")" : "") + '">' + (series.thumbnailDataUrl ? "" : "400×600") + '</div>' +
                '<input type="file" accept="image/*" id="thumbInput">' +
              '</div>' +
              '<div class="field">' +
                '<label>Banner</label>' +
                '<div class="upload-preview is-banner" id="bannerPreview" style="' + (series.bannerDataUrl ? "background-image:url(" + series.bannerDataUrl + ")" : "") + '">' + (series.bannerDataUrl ? "" : "800×400") + '</div>' +
                '<input type="file" accept="image/*" id="bannerInput">' +
              '</div>' +
            '</div>' +
          '</section>' +
          '<section class="form-section">' +
            '<h2>Genres</h2>' +
            '<p class="field-hint">Pick what kind of story this is — used for discover and search.</p>' +
            '<div class="flag-chips" id="genreChips">' + genreChips + '</div>' +
          '</section>' +
          '<section class="form-section">' +
            '<h2>Mature content (18+)</h2>' +
            '<p class="field-hint">Any selection here marks the series as 18+ and hides it from readers who have not confirmed their age.</p>' +
            '<div class="flag-chips" id="matureFlagChips">' + matureChips + '</div>' +
          '</section>' +
          renderReaderUiSection(series) +
          '<section class="form-section form-section--danger">' +
            '<h2>Reset for playtesting</h2>' +
            '<p class="field-hint">' +
              (series.templateSource
                ? "Restore the graph from the original template, "
                : "Keep your current graph, ") +
              "set every chapter except chapter 1 to <strong>draft</strong>, publish chapter 1, and clear your personal reading progress for this story." +
            '</p>' +
            '<button type="button" class="btn btn-danger btn-sm" id="resetSeriesBtn">Reset to chapter 1 only</button>' +
          '</section>' +
          '<p class="field-hint" style="margin-top:16px">Story metrics and branching logic live in the <a href="#/series/' + series.id + '/graph">Graph editor</a>.</p>' +
        '</form>' +
      '</div>'
    );
  }

  function field(label, name, value, hint, textarea, rows) {
    var input = textarea
      ? '<textarea name="' + name + '" rows="' + (rows || 3) + '">' + escapeHtml(value || "") + '</textarea>'
      : '<input type="text" name="' + name + '" value="' + escapeAttr(value || "") + '">';
    return '<div class="field"><label>' + label + '</label>' + input + (hint ? '<p class="field-hint">' + hint + '</p>' : '') + '</div>';
  }

  function updateSidebarSeriesTitle(series) {
    var el = document.querySelector(".sidebar-series-title");
    if (el && series) el.textContent = series.title || "Untitled series";
  }

  function bindSettingsForm() {
    var route = parseRoute();
    var series = ScenaStore.getSeries(userId, route.seriesId);
    if (!series) return;

    var form = $("#settingsForm");
    if (!form) return;
    var saveTimer;
    function scheduleAutoSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        try {
          collectSettingsForm(form, series);
          persistSeries(series);
          updateSidebarSeriesTitle(series);
        } catch (err) {
          console.error(err);
          toast("Could not save settings — try again.");
        }
      }, 600);
    }

    bindImageUpload("#thumbInput", "#thumbPreview", function (url) { series.thumbnailDataUrl = url; scheduleAutoSave(); }, "thumb", series.id);
    bindImageUpload("#bannerInput", "#bannerPreview", function (url) { series.bannerDataUrl = url; scheduleAutoSave(); }, "banner", series.id);

    var titleField = form.querySelector('[name="title"]');
    var slugField = form.querySelector('[name="slug"]');
    if (titleField && slugField) {
      titleField.addEventListener("input", function (e) {
        if (!slugField.dataset.touched) slugField.value = ScenaStore.slugify(e.target.value);
      });
      slugField.addEventListener("input", function () {
        slugField.dataset.touched = "1";
      });
    }

    form.querySelectorAll("input, textarea").forEach(function (el) {
      el.addEventListener("input", scheduleAutoSave);
    });
    [$("#genreChips"), $("#matureFlagChips")].forEach(function (chipRoot) {
      if (!chipRoot) return;
      chipRoot.querySelectorAll(".flag-chip").forEach(function (chip) {
        chip.addEventListener("click", function () {
          chip.classList.toggle("is-on");
          scheduleAutoSave();
        });
      });
    });

    var presetCards = document.querySelectorAll("#uiPresetCards .ui-preset-card");
    if (presetCards.length) {
      presetCards.forEach(function (card) {
        card.addEventListener("click", function () {
          document.querySelectorAll("#uiPresetCards .ui-preset-card").forEach(function (c) {
            c.classList.remove("is-active");
          });
          card.classList.add("is-active");
          series.readerUi.preset = card.getAttribute("data-ui-preset");
          var preset = ScenaStore.READER_UI_PRESETS[series.readerUi.preset];
          if (preset && preset.colors) {
            var uiAccent = form.querySelector('[name="uiAccent"]');
            var uiSpeaker = form.querySelector('[name="uiSpeaker"]');
            var uiChoiceText = form.querySelector('[name="uiChoiceText"]');
            if (uiAccent) uiAccent.value = preset.colors.accent;
            if (uiSpeaker) uiSpeaker.value = preset.colors.speaker;
            if (uiChoiceText) uiChoiceText.value = preset.colors.choiceText;
          }
          if (preset && preset.shapes) {
            var uiDialogueShape = form.querySelector('[name="uiDialogueShape"]');
            var uiChoiceShape = form.querySelector('[name="uiChoiceShape"]');
            if (uiDialogueShape) uiDialogueShape.value = preset.shapes.dialogue;
            if (uiChoiceShape) uiChoiceShape.value = preset.shapes.choice;
          }
          scheduleAutoSave();
        });
      });
    }

    form.querySelectorAll('[name^="ui"]').forEach(function (el) {
      el.addEventListener("input", function () {
        if (el.name === "uiDialogueScale") {
          $("#uiDialogueScaleVal").textContent = el.value + "×";
        } else if (el.name === "uiChoiceScale") {
          $("#uiChoiceScaleVal").textContent = el.value + "×";
        } else if (el.name === "uiCornerRadius") {
          $("#uiCornerRadiusVal").textContent = el.value + "px";
        }
        scheduleAutoSave();
      });
      el.addEventListener("change", function () {
        if (el.name === "uiClickAsset") {
          var clickBtn = $("#uiClickPreviewBtn");
          if (clickBtn) clickBtn.disabled = false;
        }
        scheduleAutoSave();
      });
    });

    bindSoundPreview("#uiClickPreviewBtn", '[name="uiClickAsset"]', series, false);

    bindImageUpload("#uiDialogueSpriteInput", "#uiDialogueSpritePreview", function (url) {
      series.readerUi.customSprites.dialogueBox = url;
      series.readerUi.preset = "custom";
      document.querySelectorAll("#uiPresetCards .ui-preset-card").forEach(function (c) {
        c.classList.toggle("is-active", c.getAttribute("data-ui-preset") === "custom");
      });
      $("#uiDialogueSpriteClear").hidden = false;
      scheduleAutoSave();
    }, "reader-ui-dialogue", series.id);
    bindImageUpload("#uiChoiceSpriteInput", "#uiChoiceSpritePreview", function (url) {
      series.readerUi.customSprites.choiceButton = url;
      series.readerUi.preset = "custom";
      document.querySelectorAll("#uiPresetCards .ui-preset-card").forEach(function (c) {
        c.classList.toggle("is-active", c.getAttribute("data-ui-preset") === "custom");
      });
      $("#uiChoiceSpriteClear").hidden = false;
      scheduleAutoSave();
    }, "reader-ui-choice", series.id);

    var clearDlg = $("#uiDialogueSpriteClear");
    if (clearDlg) clearDlg.addEventListener("click", function () {
      series.readerUi.customSprites.dialogueBox = null;
      $("#uiDialogueSpritePreview").style.backgroundImage = "";
      clearDlg.hidden = true;
      scheduleAutoSave();
    });
    var clearCh = $("#uiChoiceSpriteClear");
    if (clearCh) clearCh.addEventListener("click", function () {
      series.readerUi.customSprites.choiceButton = null;
      $("#uiChoiceSpritePreview").style.backgroundImage = "";
      clearCh.hidden = true;
      scheduleAutoSave();
    });

    var saveSettingsBtn = $("#saveSettingsBtn");
    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener("click", function () {
        collectSettingsForm(form, series);
        persistSeries(series, "Series saved");
      });
    }

    var delBtn = $("#deleteSeriesBtn");
    if (delBtn) {
      delBtn.addEventListener("click", function () {
        if (confirm("Delete this series? This cannot be undone.")) {
          ScenaStore.deleteSeries(userId, series.id).then(function () {
            toast("Series deleted");
            navigate("/");
          }).catch(function (err) {
            toast((err && err.message) || "Could not delete series.");
          });
        }
      });
    }

    var resetBtn = $("#resetSeriesBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        var graphNote = series.templateSource
          ? "The story graph will be restored from the template.\n\n"
          : "Your graph edits will be kept.\n\n";
        if (!confirm(
          graphNote +
          "Only chapter 1 will stay live — all later chapters become drafts.\n\n" +
          "Your reading progress for this story will also be cleared.\n\n" +
          "Continue?"
        )) {
          return;
        }
        resetBtn.disabled = true;
        ScenaStore.resetSeriesForCreator(userId, series.id).then(function (result) {
          var msg = result && result.restoredGraph
            ? "Series reset — template restored, chapter 1 live."
            : "Series reset — chapter 1 live, later chapters locked.";
          toast(msg);
          navigate("/series/" + series.id + "/graph");
        }).catch(function (err) {
          resetBtn.disabled = false;
          toast((err && err.message) || "Could not reset series.");
        });
      });
    }
  }

  function collectSettingsForm(form, series) {
    var titleEl = form.querySelector('[name="title"]');
    var slugEl = form.querySelector('[name="slug"]');
    var shortEl = form.querySelector('[name="shortDescription"]');
    var longEl = form.querySelector('[name="longDescription"]');
    if (titleEl) series.title = titleEl.value.trim();
    if (slugEl) series.slug = ScenaStore.slugify(slugEl.value.trim() || series.title);
    if (shortEl) series.shortDescription = shortEl.value.trim();
    if (longEl) series.longDescription = longEl.value.trim();
    series.genres = [];
    series.contentFlags = [];
    var genreChips = $("#genreChips");
    if (genreChips) {
      genreChips.querySelectorAll(".flag-chip.is-on").forEach(function (c) {
        series.genres.push(c.getAttribute("data-genre"));
      });
    }
    var matureChips = $("#matureFlagChips");
    if (matureChips) {
      matureChips.querySelectorAll(".flag-chip.is-on").forEach(function (c) {
        series.contentFlags.push(c.getAttribute("data-mature-flag"));
      });
    }
    if (form.querySelector("#readerUiSection")) collectReaderUi(form, series);
  }

  function bindSoundPreview(btnSel, selectSel, series, isBgm) {
    var btn = $(btnSel);
    var select = document.querySelector(selectSel);
    if (!btn || !window.ScenaAudio) return;
    btn.addEventListener("click", function () {
      var assetId = select && select.value ? select.value : ScenaStore.defaultClickAssetId();
      var asset = ScenaStore.getAudioAsset(series, assetId);
      if (!asset || !asset.dataUrl) return;
      ScenaAudio.playOneShot(asset.dataUrl, 0.55);
    });
  }

  function bindImageUpload(inputSel, previewSel, cb, purpose, seriesId) {
    var input = $(inputSel);
    if (!input) return;
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) return;
      ScenaStore.fileToDataUrl(file, { purpose: purpose || "default", seriesId: seriesId }).then(function (url) {
        cb(url);
        var prev = $(previewSel);
        prev.style.backgroundImage = "url(" + url + ")";
        prev.textContent = "";
        toast("Image uploaded");
      }).catch(function (err) { toast(err.message); });
    });
  }

  function renderResources(series, tab) {
    var tabs = [
      { id: "characters", label: "Characters" },
      { id: "backgrounds", label: "Backgrounds" },
      { id: "effect", label: "Effects" },
      { id: "audio", label: "Audio" },
    ];
    var tabHtml = tabs.map(function (t) {
      return '<button type="button" class="resources-tab' + (tab === t.id ? " is-active" : "") + '" data-tab="' + t.id + '">' + t.label + '</button>';
    }).join("");

    var main = "";

    if (tab === "characters") {
      var profiles = ScenaStore.ensureProfiles(series);
      main = '<div class="resources-toolbar"><button type="button" class="btn btn-primary btn-sm" id="addProfileBtn">+ New character</button></div>';
      if (!profiles.length) {
        main += '<p class="field-hint">Create character profiles — name, color, and sprite poses (happy, sad, etc.).</p>';
      }
      profiles.forEach(function (p) {
        var spriteGrid = (p.sprites || []).map(function (s) {
          return '<div class="sprite-chip" style="background-image:url(' + (s.dataUrl || "") + ')"><span>' + escapeHtml(s.label) + '</span></div>';
        }).join("");
        main += '<article class="profile-card" data-profile-id="' + p.id + '">' +
          '<div class="profile-card-head">' +
            '<span class="profile-color" style="background:' + (p.color || "#888") + '"></span>' +
            '<input type="text" class="profile-name-input" value="' + escapeAttr(p.name) + '" placeholder="Character name">' +
            '<button type="button" class="btn btn-sm btn-ghost" data-delete-profile="' + p.id + '">Delete</button>' +
          '</div>' +
          '<div class="sprite-grid">' + (spriteGrid || '<span class="field-hint">No sprites yet</span>') + '</div>' +
          '<label class="btn btn-sm">+ Add sprite <input type="file" accept="image/*" hidden data-sprite-upload="' + p.id + '"></label>' +
        '</article>';
      });
    } else if (tab === "backgrounds") {
      var scenes = ScenaStore.ensureBackgrounds(series);
      main = '<div class="resources-toolbar"><button type="button" class="btn btn-primary btn-sm" id="addBgSceneBtn">+ New background scene</button></div>';
      if (!scenes.length) {
        main += '<p class="field-hint">Background scenes have up to 3 parallax layers: back, middle, front.</p>';
      }
      scenes.forEach(function (b) {
        var layers = b.layers || { bg: null, mg: null, fg: null };
        main += '<article class="bg-scene-card" data-bg-id="' + b.id + '">' +
          '<div class="profile-card-head">' +
            '<input type="text" class="profile-name-input" value="' + escapeAttr(b.name) + '" placeholder="Scene name">' +
            '<button type="button" class="btn btn-sm btn-ghost" data-delete-bg="' + b.id + '">Delete</button>' +
          '</div>' +
          '<div class="layer-row">' +
            layerSlot("Background", "bg", layers.bg, b.id) +
            layerSlot("Middle", "mg", layers.mg, b.id) +
            layerSlot("Foreground", "fg", layers.fg, b.id) +
          '</div></article>';
      });
    } else {
      var assets = (series.assets || []).filter(function (a) { return a.category === tab; });
      main = '<div class="dropzone" id="assetDropzone">Drop files here or <label style="color:var(--scena-accent);cursor:pointer"><input type="file" id="assetFileInput" hidden accept="image/*,audio/*">browse</label></div>' +
        '<div class="resources-grid" id="resourcesGrid">' +
        (assets.length ? assets.map(function (a) {
          return '<article class="asset-card"><div class="asset-thumb" style="' + (a.dataUrl ? "background-image:url(" + a.dataUrl + ")" : "") + '">' +
            (a.dataUrl ? "" : (tab === "audio" ? "♪" : "🖼")) + '</div><div class="asset-card-body"><strong>' +
            escapeHtml(a.label) + '</strong></div></article>';
        }).join("") : '<p class="field-hint">No assets yet.</p>') +
        '</div>';
    }

    return (
      '<div class="page page-wide">' +
        '<div class="page-head" style="padding:24px 32px 0;margin:0">' +
          '<div><h1>Project resources</h1><p>Character sheets, parallax backgrounds, effects, and audio.</p></div>' +
        '</div>' +
        '<div class="resources-layout">' +
          '<nav class="resources-tabs">' + tabHtml + '</nav>' +
          '<div class="resources-main" id="resourcesMain">' + main + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function layerSlot(label, key, dataUrl, sceneId) {
    return '<div class="layer-slot">' +
      '<span class="layer-slot-label">' + label + '</span>' +
      '<div class="layer-slot-preview" style="' + (dataUrl ? "background-image:url(" + dataUrl + ")" : "") + '">' +
        (dataUrl ? "" : "+") +
      '</div>' +
      '<label class="btn btn-sm">Upload<input type="file" accept="image/*" hidden data-layer="' + key + '" data-bg-scene="' + sceneId + '"></label>' +
    '</div>';
  }

  function bindResources(series, tab) {
    document.querySelectorAll(".resources-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        navigate("/series/" + series.id + "/resources/" + btn.getAttribute("data-tab"));
      });
    });

    function persist() {
      persistSeries(series);
    }

    if (tab === "characters") {
      var addProfile = $("#addProfileBtn");
      if (addProfile) addProfile.addEventListener("click", function () {
        var name = prompt("Character name:", "Mira");
        if (!name) return;
        series.characterProfiles.push({
          id: ScenaStore.assetUid("ch"),
          name: name.trim(),
          color: ScenaStore.colorFromName(name),
          sprites: [],
        });
        persist();
        render();
      });

      document.querySelectorAll(".profile-name-input").forEach(function (input) {
        input.addEventListener("change", function () {
          var card = input.closest("[data-profile-id], [data-bg-id]");
          if (!card) return;
          if (card.dataset.profileId) {
            var p = ScenaStore.getCharacter(series, card.dataset.profileId);
            if (p) { p.name = input.value.trim(); p.color = ScenaStore.colorFromName(p.name); }
          } else if (card.dataset.bgId) {
            var b = ScenaStore.getBackground(series, card.dataset.bgId);
            if (b) b.name = input.value.trim();
          }
          persist();
        });
      });

      document.querySelectorAll("[data-delete-profile]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!confirm("Delete this character profile?")) return;
          series.characterProfiles = series.characterProfiles.filter(function (p) {
            return p.id !== btn.getAttribute("data-delete-profile");
          });
          persist();
          render();
        });
      });

      document.querySelectorAll("[data-sprite-upload]").forEach(function (input) {
        input.addEventListener("change", function () {
          var file = input.files[0];
          if (!file) return;
          var profileId = input.getAttribute("data-sprite-upload");
          var label = prompt("Pose name (e.g. happy, angry):", file.name.replace(/\.[^.]+$/, ""));
          if (!label) return;
          ScenaStore.fileToDataUrl(file, { purpose: "sprite", seriesId: series.id }).then(function (url) {
            var profile = ScenaStore.getCharacter(series, profileId);
            if (!profile) return;
            profile.sprites = profile.sprites || [];
            profile.sprites.push({ id: ScenaStore.assetUid("sp"), label: label.trim(), dataUrl: url });
            persist();
            toast("Sprite added");
            render();
          }).catch(function (err) { toast(err.message); });
        });
      });
      return;
    }

    if (tab === "backgrounds") {
      var addBg = $("#addBgSceneBtn");
      if (addBg) addBg.addEventListener("click", function () {
        var name = prompt("Background scene name:", "Cafe interior");
        if (!name) return;
        series.backgroundScenes.push({
          id: ScenaStore.assetUid("bg"),
          name: name.trim(),
          layers: { bg: null, mg: null, fg: null },
        });
        persist();
        render();
      });

      document.querySelectorAll("[data-delete-bg]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!confirm("Delete this background scene?")) return;
          series.backgroundScenes = series.backgroundScenes.filter(function (b) {
            return b.id !== btn.getAttribute("data-delete-bg");
          });
          persist();
          render();
        });
      });

      document.querySelectorAll("[data-layer]").forEach(function (input) {
        input.addEventListener("change", function () {
          var file = input.files[0];
          if (!file) return;
          var sceneId = input.getAttribute("data-bg-scene");
          var layerKey = input.getAttribute("data-layer");
          ScenaStore.fileToDataUrl(file, { purpose: "stage-" + layerKey, seriesId: series.id }).then(function (url) {
            var scene = ScenaStore.getBackground(series, sceneId);
            if (!scene) return;
            if (!scene.layers) scene.layers = { bg: null, mg: null, fg: null };
            scene.layers[layerKey] = url;
            persist();
            toast("Layer uploaded");
            render();
          }).catch(function (err) { toast(err.message); });
        });
      });

      document.querySelectorAll(".profile-name-input").forEach(function (input) {
        input.addEventListener("change", function () {
          var card = input.closest("[data-bg-id]");
          if (!card) return;
          var b = ScenaStore.getBackground(series, card.dataset.bgId);
          if (b) b.name = input.value.trim();
          persist();
        });
      });
      return;
    }

    function uploadFile(file) {
      if (!file) return;
      var label = prompt("Asset label (e.g. happy, cafe_night):", file.name.replace(/\.[^.]+$/, ""));
      if (!label) return;
      var groupName = null;
      if (tab === "character" || tab === "background") {
        groupName = prompt(tab === "character" ? "Character name:" : "Scene name:", "");
        if (!groupName) return;
      }
      var isAudio = file.type.indexOf("audio") >= 0;
      var p = isAudio
        ? Promise.resolve("")
        : ScenaStore.fileToDataUrl(file, { seriesId: series.id }).catch(function () { return ""; });
      p.then(function (dataUrl) {
        series.assets = series.assets || [];
        series.assets.push({
          id: "a_" + Date.now(),
          category: tab,
          groupName: groupName,
          label: label.trim(),
          dataUrl: dataUrl,
          mimeType: file.type,
        });
        ScenaStore.saveSeries(userId, series).then(function (result) {
          if (!result.ok) toast(result.error || "Could not save.");
          else toast("Added to project resources");
          render();
        });
      });
    }

    var fileInput = $("#assetFileInput");
    fileInput.addEventListener("change", function () { uploadFile(fileInput.files[0]); });

    var dz = $("#assetDropzone");
    dz.addEventListener("dragover", function (e) { e.preventDefault(); dz.classList.add("is-dragover"); });
    dz.addEventListener("dragleave", function () { dz.classList.remove("is-dragover"); });
    dz.addEventListener("drop", function (e) {
      e.preventDefault();
      dz.classList.remove("is-dragover");
      uploadFile(e.dataTransfer.files[0]);
    });
  }

  function renderEpisodes(series) {
    var ordered = ScenaStore.orderedEpisodes(series);
    var rows = ordered.map(function (ep) {
      var region = ScenaStore.episodeRegionSummary(series, ep);
      var pubStatus = ScenaStore.episodePublishStatus(ep);
      var unpublishBtn = (ep.isLive)
        ? (' <button type="button" class="btn btn-sm btn-ghost" data-unpublish-episode="' + ep.id + '">Unpublish</button>')
        : "";
      var publishWhen = ScenaStore.episodePublishAt(ep);
      var dateCell = pubStatus === "draft"
        ? "—"
        : formatDateTime(publishWhen) + (pubStatus === "scheduled" ? " (scheduled)" : "");
      return '<tr>' +
        '<td>Ch. ' + ep.number + '</td>' +
        '<td>' + escapeHtml(ep.title) + '</td>' +
        '<td>' + escapeHtml(region) + '</td>' +
        '<td><span class="status-pill' + episodeStatusClass(ep) + '">' + episodeStatusLabel(ep) + '</span></td>' +
        '<td>' + escapeHtml(dateCell) + '</td>' +
        '<td>' +
          '<button type="button" class="btn btn-sm graph-play-btn" data-play-episode="' + ep.id + '">▶ Read</button> ' +
          '<button type="button" class="btn btn-sm" data-edit-episode="' + ep.id + '">Edit</button>' +
          unpublishBtn +
        '</td>' +
      '</tr>';
    }).join("");

    if (!rows) {
      rows = '<tr><td colspan="6" class="field-hint" style="padding:24px">No episodes yet. Open the Story editor and drop an episode boundary on the graph.</td></tr>';
    }

    return (
      '<div class="page">' +
        '<div class="page-head">' +
          '<div><h1>Episodes</h1><p>Chapters are ordered by how they connect from the story opening. Publish immediately or schedule a go-live date from the chapter details panel in the graph editor.</p></div>' +
        '</div>' +
        '<table class="episodes-table">' +
          '<thead><tr><th>#</th><th>Title</th><th>Region</th><th>Status</th><th>Published</th><th>Actions</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>'
    );
  }

  function bindEpisodes(series) {
    document.querySelectorAll("[data-play-episode]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        window.location.href = ScenaStore.episodePlayUrl(
          series.id,
          btn.getAttribute("data-play-episode"),
          "studio"
        );
      });
    });

    document.querySelectorAll("[data-edit-episode]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        sessionStorage.setItem("scena.openEpisode." + series.id, btn.getAttribute("data-edit-episode"));
        navigate("/series/" + series.id + "/graph");
      });
    });

    document.querySelectorAll("[data-unpublish-episode]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var epId = btn.getAttribute("data-unpublish-episode");
        var ep = (series.episodes || []).find(function (item) { return item.id === epId; });
        if (!ep || !ep.isLive) return;
        if (!window.confirm("Unpublish \"" + (ep.title || ("Chapter " + ep.number)) + "\"? Readers will no longer see it on Discover until you publish again.")) return;
        ScenaStore.unpublishEpisode(series, ep);
        ScenaStore.saveSeries(userId, series).then(function (result) {
          if (!result.ok) toast(result.error || "Could not save.");
          else {
            toast("Chapter unpublished.");
            render();
          }
        });
      });
    });
  }

  function showEpisodeModal(series, episode) {
    var modal = $("#episodeModal");
    var nodeOpts = series.nodes.map(function (n) {
      return '<option value="' + n.id + '">' + escapeHtml(ScenaStore.nodeLabel(n)) + " (" + n.type + ")</option>";
    }).join("");

    var num = episode ? episode.number : (series.episodes.length + 1);
    var defaultStart = episode ? episode.startNodeId : (series.episodes.length === 0
      ? ScenaStore.resolveEntryNodeId(series)
      : (series.episodes[series.episodes.length - 1] && series.episodes[series.episodes.length - 1].endNodeId));

    $("#episodeModalBody").innerHTML =
      field("Episode title", "epTitle", episode ? episode.title : "Episode " + num) +
      '<p class="field-hint">In the Story editor, click <strong>+ Episode boundary</strong> to place a vertical line where this episode ends. Everything to the left of that line belongs to this episode — even branching paths with different endings.</p>' +
      '<div class="form-row">' +
        '<div class="field"><label>Start node (optional fallback)</label><select name="startNode"><option value="">— use graph boundary —</option>' + nodeOpts + '</select></div>' +
        '<div class="field"><label>End node (optional fallback)</label><select name="endNode"><option value="">— use graph boundary —</option>' + nodeOpts + '</select></div>' +
      '</div>';

    var startSel = $('select[name="startNode"]');
    var endSel = $('select[name="endNode"]');
    if (defaultStart) startSel.value = defaultStart;
    if (episode) {
      startSel.value = episode.startNodeId || "";
      endSel.value = episode.endNodeId || "";
    } else if (series.nodes.length > 1) {
      endSel.value = series.nodes[series.nodes.length - 1].id;
    }

    modal.classList.add("is-open");
    modal.dataset.seriesId = series.id;
    modal.dataset.episodeId = episode ? episode.id : "";
  }

  function bindEpisodeModal() {
    var modal = $("#episodeModal");
    $("#episodeModalCancel").addEventListener("click", function () { modal.classList.remove("is-open"); });
    modal.addEventListener("click", function (e) { if (e.target === modal) modal.classList.remove("is-open"); });

    $("#episodeModalSave").addEventListener("click", function () {
      var series = ScenaStore.getSeries(userId, modal.dataset.seriesId);
      if (!series) return;
      var title = $('input[name="epTitle"]').value.trim() || "Episode";
      var startNodeId = $('select[name="startNode"]').value || null;
      var endNodeId = $('select[name="endNode"]').value || null;

      series.episodes = series.episodes || [];
      if (modal.dataset.episodeId) {
        var ep = series.episodes.find(function (e) { return e.id === modal.dataset.episodeId; });
        ep.title = title;
        ep.startNodeId = startNodeId;
        ep.endNodeId = endNodeId;
      } else {
        series.episodes.push({
          id: "ep_" + Date.now(),
          number: series.episodes.length + 1,
          title: title,
          startNodeId: startNodeId,
          endNodeId: endNodeId,
          boundaryX: null,
          isLive: false,
          publishedAt: null,
        });
      }
      persistSeries(series, "Episode saved").then(function (ok) {
        if (!ok) return;
        modal.classList.remove("is-open");
        render();
      });
    });
  }

  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  var libraryUiState = { tab: "assets", category: "", query: "", selectedId: "", shopCategory: "", shopQuery: "", shopSelectedId: "" };
  var jamBrowseState = { genre: "all", keyword: "", sort: "date", phase: "all" };

  function listUserSeries() {
    return ScenaStore.listSeries(userId).filter(function (s) { return !s.templateSource; });
  }

  function renderLibraryPage(main, tab) {
    libraryUiState.tab = tab || "assets";
    if (!window.ScenaAssetLibrary) {
      main.innerHTML = '<div class="page"><p class="field-hint">Asset library failed to load.</p></div>';
      return;
    }
    main.innerHTML =
      '<div class="page page-library">' +
        '<div class="page-head">' +
          '<div><h1>Asset library</h1>' +
          '<p>Reuse characters, stages, and audio across projects. Purchased assets stay yours — import anytime without paying again.</p></div>' +
        '</div>' +
        '<div id="libraryRoot" class="library-root"><p class="field-hint">Loading…</p></div>' +
        '<div class="workspace-modal-backdrop" id="librarySellModal" hidden>' +
          '<div class="modal" role="dialog">' +
            '<h2 id="librarySellTitle">Sell on marketplace</h2>' +
            '<div id="librarySellBody"></div>' +
            '<div class="modal-actions">' +
              '<button type="button" class="btn" id="librarySellCancel">Cancel</button>' +
              '<button type="button" class="btn btn-primary" id="librarySellSave">Publish listing</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    paintLibraryRoot();
  }

  function paintLibraryRoot() {
    var root = $("#libraryRoot");
    if (!root) return;

    if (libraryUiState.tab === "shop") {
      paintLibraryShop(root);
      return;
    }

    ScenaAssetLibrary.list(userId, {
      category: libraryUiState.category,
      query: libraryUiState.query,
    }).then(function (entries) {
      var detailHtml = "";
      var seriesList = listUserSeries();
      if (libraryUiState.selectedId) {
        return ScenaAssetLibrary.get(userId, libraryUiState.selectedId).then(function (entry) {
          detailHtml = ScenaAssetLibrary.renderEntryDetail(entry, {
            seriesList: seriesList,
            selectedSeriesId: seriesList[0] ? seriesList[0].id : "",
            showRemove: entry && entry.source === "made",
            showSell: entry && entry.source === "made",
            importLabel: "Import to series",
          });
          return { entries: entries, detailHtml: detailHtml };
        });
      }
      return { entries: entries, detailHtml: detailHtml };
    }).then(function (payload) {
      root.innerHTML = ScenaAssetLibrary.renderPanel(payload.entries, {
        category: libraryUiState.category,
        query: libraryUiState.query,
        selectedId: libraryUiState.selectedId,
        detailHtml: payload.detailHtml,
        pageTab: "assets",
      });
      bindLibraryAssetsPanel(root);
      bindLibrarySellModal();
    });
  }

  function paintLibraryShop(root) {
    if (!window.ScenaMarketplace) {
      root.innerHTML = '<p class="field-hint">Marketplace unavailable.</p>';
      return;
    }
    var balancePromise = window.ScenaWallet
      ? ScenaWallet.load(userId).then(function (w) {
          if (w && w.purchased) toast("Payment received — Ducats added to your wallet.");
          return ScenaWallet.getBalance(userId);
        })
      : Promise.resolve(null);

    balancePromise.then(function (balance) {
      return ScenaMarketplace.loadListings({
        category: libraryUiState.shopCategory,
        query: libraryUiState.shopQuery,
      }).then(function (listings) {
        var detailHtml = "";
        if (libraryUiState.shopSelectedId) {
          return ScenaMarketplace.getListing(libraryUiState.shopSelectedId, userId).then(function (listing) {
            detailHtml = ScenaMarketplace.renderListingDetail(listing, { showPackUpsell: true });
            return { listings: listings, detailHtml: detailHtml, balance: balance };
          });
        }
        return { listings: listings, detailHtml: detailHtml, balance: balance };
      });
    }).then(function (payload) {
      var shopHtml = ScenaMarketplace.renderStorePanel(payload.listings, {
        category: libraryUiState.shopCategory,
        query: libraryUiState.shopQuery,
        selectedId: libraryUiState.shopSelectedId,
        detailHtml: payload.detailHtml,
        balance: payload.balance,
      });
      root.innerHTML = ScenaAssetLibrary.renderPanel([], {
        pageTab: "shop",
        shopHtml: shopHtml,
      });
      bindLibraryShopPanel(root);
    });
  }

  function bindLibraryAssetsPanel(root) {
    root.querySelectorAll("[data-library-page]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var page = btn.getAttribute("data-library-page");
        libraryUiState.tab = page === "shop" ? "shop" : "assets";
        if (page === "shop") navigate("/library/shop");
        else navigate("/library");
      });
    });
    root.querySelectorAll("[data-library-category]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        libraryUiState.category = btn.getAttribute("data-library-category") || "";
        libraryUiState.selectedId = "";
        paintLibraryRoot();
      });
    });
    var search = root.querySelector(".library-search");
    if (search) {
      search.addEventListener("change", function () {
        libraryUiState.query = search.value.trim();
        libraryUiState.selectedId = "";
        paintLibraryRoot();
      });
    }
    root.querySelectorAll(".library-card").forEach(function (btn) {
      btn.addEventListener("click", function () {
        libraryUiState.selectedId = btn.getAttribute("data-library-id");
        paintLibraryRoot();
      });
    });
    root.querySelectorAll(".library-import-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var entryId = btn.getAttribute("data-library-id");
        var select = root.querySelector(".library-series-select");
        var seriesId = select ? select.value : "";
        if (!seriesId) {
          toast("Create a series first, then import.");
          return;
        }
        var series = ScenaStore.getSeries(userId, seriesId);
        if (!series) {
          toast("Series not found.");
          return;
        }
        btn.disabled = true;
        ScenaAssetLibrary.importToSeries(series, entryId, userId).then(function (imported) {
          if (!imported.ok) throw new Error("Import failed.");
          return ScenaStore.saveSeries(userId, series);
        }).then(function (result) {
          btn.disabled = false;
          if (result && result.ok) toast("Imported into “" + (series.title || "series") + "”. Open the graph to use it.");
          else toast("Imported locally — open the story editor to use it.");
        }).catch(function (err) {
          btn.disabled = false;
          toast((err && err.message) || "Could not import.");
        });
      });
    });
    root.querySelectorAll(".library-remove-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var entryId = btn.getAttribute("data-library-id");
        if (!entryId || !window.confirm("Remove this asset from your library? Projects you already imported into are unchanged.")) return;
        ScenaAssetLibrary.remove(userId, entryId).then(function () {
          libraryUiState.selectedId = "";
          toast("Removed from library.");
          paintLibraryRoot();
        });
      });
    });
    root.querySelectorAll(".library-sell-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openLibrarySellModal(btn.getAttribute("data-library-id"));
      });
    });
  }

  var librarySellEntryId = null;

  function openLibrarySellModal(entryId) {
    librarySellEntryId = entryId;
    var modal = $("#librarySellModal");
    if (!modal || !window.ScenaAssetLibrary) return;
    ScenaAssetLibrary.get(userId, entryId).then(function (entry) {
      if (!entry) return;
      $("#librarySellBody").innerHTML = ScenaAssetLibrary.renderSellModalBody(entry);
      modal.hidden = false;
    });
  }

  function closeLibrarySellModal() {
    librarySellEntryId = null;
    var modal = $("#librarySellModal");
    if (modal) modal.hidden = true;
  }

  function bindLibrarySellModal() {
    var modal = $("#librarySellModal");
    if (!modal || modal.dataset.bound === "1") return;
    modal.dataset.bound = "1";
    $("#librarySellCancel").addEventListener("click", closeLibrarySellModal);
    modal.addEventListener("click", function (e) { if (e.target === modal) closeLibrarySellModal(); });
    $("#librarySellSave").addEventListener("click", function () {
      if (!librarySellEntryId) return;
      var title = ($("#libSellTitle") || {}).value || "";
      var desc = ($("#libSellDesc") || {}).value || "";
      var category = ($("#libSellCategory") || {}).value || "pack";
      var price = parseInt(($("#libSellPrice") || {}).value, 10) || 0;
      if (title.trim().length < 2) {
        toast("Enter a listing title.");
        return;
      }
      ScenaAssetLibrary.publishFromLibrary(userId, librarySellEntryId, {
        title: title.trim(),
        description: desc.trim(),
        category: category,
        priceDucats: price,
        sellerName: (userProfile && userProfile.displayName) || userEmail || "Creator",
      }).then(function () {
        closeLibrarySellModal();
        toast("Listed on the asset store.");
        paintLibraryRoot();
      }).catch(function (err) {
        toast((err && err.message) || "Could not publish listing.");
      });
    });
  }

  function bindLibraryShopPanel(root) {
    root.querySelectorAll("[data-library-page]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var page = btn.getAttribute("data-library-page");
        libraryUiState.tab = page === "shop" ? "shop" : "assets";
        if (page === "shop") navigate("/library/shop");
        else navigate("/library");
      });
    });
    root.querySelectorAll("[data-marketplace-category]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        libraryUiState.shopCategory = btn.getAttribute("data-marketplace-category") || "";
        libraryUiState.shopSelectedId = "";
        paintLibraryRoot();
      });
    });
    var search = root.querySelector(".marketplace-search");
    if (search) {
      search.addEventListener("change", function () {
        libraryUiState.shopQuery = search.value.trim();
        libraryUiState.shopSelectedId = "";
        paintLibraryRoot();
      });
    }
    root.querySelectorAll("[data-listing-id]").forEach(function (btn) {
      if (btn.classList.contains("marketplace-acquire-btn")) return;
      btn.addEventListener("click", function () {
        libraryUiState.shopSelectedId = btn.getAttribute("data-listing-id");
        paintLibraryRoot();
      });
    });
    root.querySelectorAll(".marketplace-acquire-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var listingId = btn.getAttribute("data-listing-id");
        if (!listingId) return;
        btn.disabled = true;
        ScenaMarketplace.purchase(userId, listingId).then(function (result) {
          return ScenaMarketplace.getListing(listingId, userId).then(function (listing) {
            if (window.ScenaAssetLibrary && listing) {
              ScenaAssetLibrary.recordPurchase(userId, Object.assign({}, listing, { bundle: result.bundle || listing.bundle }));
            }
            return result;
          });
        }).then(function () {
          btn.disabled = false;
          toast("Added to your library — import into any project from My assets.");
          libraryUiState.tab = "assets";
          libraryUiState.selectedId = "";
          navigate("/library");
        }).catch(function (err) {
          btn.disabled = false;
          toast((err && err.message) || "Purchase failed.");
        });
      });
    });
    if (window.ScenaWallet) {
      ScenaWallet.bindPackButtons(root, userId, function (result) {
        if (result && result.redirecting) return;
        if (result && result.purchased) toast("Payment received — Ducats added to your wallet.");
        paintLibraryRoot();
      }, function (err) {
        toast((err && err.message) || "Could not buy Ducats.");
      });
    }
  }

  function handleJamNeedDucats(root, err, onRetry) {
    if (!err || err.code !== "NEED_DUCATS") {
      toast((err && err.message) || "Something went wrong.");
      return false;
    }
    toast(err.message + " Buy Ducats below, then try again.");
    var panel = root && $("#jamBuyDucatsPanel", root);
    if (panel) {
      panel.hidden = false;
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (window.ScenaWallet) {
        ScenaWallet.bindPackButtons(panel, userId, function () {
          toast("After payment completes, try again.");
          if (onRetry) onRetry();
        }, function (buyErr) {
          toast((buyErr && buyErr.message) || "Purchase failed.");
        });
      }
    } else {
      navigate("/library/shop");
    }
    return true;
  }

  function loadJamFormBalance() {
    return window.ScenaWallet
      ? ScenaWallet.load(userId).then(function (w) {
          if (w && w.purchased) toast("Payment received — Ducats added to your wallet.");
          return ScenaWallet.getBalance(userId);
        })
      : Promise.resolve(null);
  }

  function renderJamsPage(main, route) {
    if (!window.ScenaJams) {
      main.innerHTML = '<div class="page"><p class="field-hint">Game jams module failed to load.</p></div>';
      return;
    }

    if (route.jamMode === "new") {
      loadJamFormBalance().then(function (balance) {
        main.innerHTML =
          '<div class="page page-jams">' +
            '<div class="page-head">' +
              '<div><h1>Host a game jam</h1>' +
              '<p>Set theme, rules, schedule, entry requirements, and optional Ducat prizes.</p></div>' +
              '<button type="button" class="btn btn-primary" id="jamSaveDraftBtn">Save &amp; continue</button>' +
            "</div>" +
            ScenaJams.renderForm({}, { balance: balance }) +
          "</div>";
        bindJamForm(main);
      });
      return;
    }

    if (route.jamMode === "edit" && route.jamId) {
      ScenaJams.get(route.jamId, { userId: userId }).then(function (jam) {
        if (!jam) {
          main.innerHTML = '<div class="page"><p class="field-hint">Jam not found.</p></div>';
          return;
        }
        if (jam.hostUserId !== userId) {
          main.innerHTML = '<div class="page"><p class="field-hint">Only the host can edit this jam.</p></div>';
          return;
        }
        loadJamFormBalance().then(function (balance) {
          var published = jam.status === "published";
          main.innerHTML =
            '<div class="page page-jams">' +
              '<div class="page-head">' +
                '<div><h1>' + (published ? "Edit jam" : "Edit draft") + "</h1>" +
                '<p>Update theme, rules, schedule, and entry settings.</p></div>' +
                '<button type="button" class="btn btn-primary" id="jamSaveDraftBtn">Save changes</button>' +
                ' <a class="btn btn-ghost" href="#/jams/' + escapeAttr(jam.id) + '">Back</a>' +
              "</div>" +
              ScenaJams.renderForm(jam, { balance: balance, published: published }) +
            "</div>";
          bindJamForm(main, jam);
        });
      });
      return;
    }

    if (route.jamMode === "detail" && route.jamId) {
      ScenaJams.get(route.jamId, { userId: userId }).then(function (jam) {
        if (!jam) {
          main.innerHTML = '<div class="page"><p class="field-hint">Jam not found.</p></div>';
          return;
        }
        if (ScenaJams.requiresAgeGate(jam) && window.ScenaProfile &&
            !ScenaProfile.isAdultVerified(userProfile)) {
          main.innerHTML = ScenaJams.renderAgeGate(jam);
          return;
        }
        var seriesList = listUserSeries();
        main.innerHTML = ScenaJams.renderDetail(jam, {
          userId: userId,
          adultVerified: window.ScenaProfile && ScenaProfile.isAdultVerified(userProfile),
          seriesList: seriesList,
        });
        bindJamDetail(main, jam, seriesList);
      });
      return;
    }

    ScenaJams.list({
      publishedOnly: true,
      genre: jamBrowseState.genre,
      keyword: jamBrowseState.keyword,
      sort: jamBrowseState.sort,
      phase: jamBrowseState.phase,
      hideAdult: true,
      viewerIsAdult: window.ScenaProfile && ScenaProfile.isAdultVerified(userProfile),
    }).then(function (published) {
      ScenaJams.list({ hostUserId: userId }).then(function (mine) {
        var browseOpts = {
          genre: jamBrowseState.genre,
          keyword: jamBrowseState.keyword,
          sort: jamBrowseState.sort,
          phase: jamBrowseState.phase,
          canHost: true,
        };
        main.innerHTML =
          '<div class="page page-jams">' +
            '<div class="page-head">' +
              '<div><h1>Game jams</h1><p>Browse by sprint week — filter by genre, prize pool, or keywords.</p></div>' +
              '<a class="btn btn-primary" href="#/jams/new">Host a jam</a>' +
            "</div>" +
            (mine.filter(function (j) { return j.status === "draft"; }).length
              ? '<section class="form-section"><h2>Your drafts</h2>' +
                  ScenaJams.renderList(mine.filter(function (j) { return j.status === "draft"; }), { canHost: true }) +
                "</section>"
              : "") +
            '<section class="form-section"><h2>Browse jams</h2>' +
              ScenaJams.renderBrowse(published, browseOpts) +
            "</section>" +
          "</div>";
        bindJamBrowse(main);
      });
    });
  }

  function bindJamBrowse(root) {
    function repaint() {
      render();
    }
    root.querySelectorAll("[data-jam-genre]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        jamBrowseState.genre = btn.getAttribute("data-jam-genre") || "all";
        repaint();
      });
    });
    var search = $("#jamBrowseSearch", root);
    if (search) {
      search.addEventListener("change", function () {
        jamBrowseState.keyword = search.value.trim();
        repaint();
      });
      search.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          jamBrowseState.keyword = search.value.trim();
          repaint();
        }
      });
    }
    var sortSel = $("#jamBrowseSort", root);
    if (sortSel) {
      sortSel.addEventListener("change", function () {
        jamBrowseState.sort = sortSel.value || "date";
        repaint();
      });
    }
    var phaseSel = $("#jamBrowsePhase", root);
    if (phaseSel) {
      phaseSel.addEventListener("change", function () {
        jamBrowseState.phase = phaseSel.value || "all";
        repaint();
      });
    }
    root.querySelectorAll(".jam-card").forEach(function (card) {
      card.addEventListener("click", function (e) {
        e.preventDefault();
        navigate(card.getAttribute("href").replace(/^#/, ""));
      });
    });
  }

  function bindJamForm(root, existingJam) {
    var form = $("#jamForm", root);
    if (!form) return;
    var prizeToggle = $("#jamPrizeEnabled", root);
    var prizeFields = $("#jamPrizeFields", root);
    if (prizeToggle && prizeFields) {
      prizeToggle.addEventListener("change", function () {
        prizeFields.hidden = !prizeToggle.checked;
      });
    }
    form.querySelectorAll("[data-jam-mature]").forEach(function (el) {
      el.addEventListener("change", function () {
        var note = $("#jamAutoAgeNote", root);
        if (!note) return;
        var any = false;
        form.querySelectorAll("[data-jam-mature]").forEach(function (box) {
          if (box.checked) any = true;
        });
        note.hidden = !any;
      });
    });
    var saveBtn = $("#jamSaveDraftBtn", root);
    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        var spec;
        try {
          spec = ScenaJams.readForm(form);
          ScenaJams.validateJamSpec(spec);
        } catch (err) {
          toast((err && err.message) || "Fix the form and try again.");
          return;
        }
        saveBtn.disabled = true;
        var savePromise = existingJam
          ? ScenaJams.updateJam(userId, existingJam.id, spec)
          : ScenaJams.createDraft(userId, userProfile, spec);
        savePromise.then(function (jam) {
          toast(existingJam ? "Jam updated." : "Jam saved — publish when ready.");
          navigate("/jams/" + jam.id);
        }).catch(function (err) {
          saveBtn.disabled = false;
          toast((err && err.message) || "Could not save jam.");
        });
      });
    }
  }

  function bindJamDetail(root, jam, seriesList) {
    var publishBtn = $("#jamPublishBtn", root);
    if (publishBtn) {
      publishBtn.addEventListener("click", function () {
        publishBtn.disabled = true;
        ScenaJams.publish(userId, jam.id).then(function () {
          toast("Jam published!");
          render();
        }).catch(function (err) {
          publishBtn.disabled = false;
          if (!handleJamNeedDucats(root, err, function () {
            publishBtn.click();
          })) {
            toast((err && err.message) || "Could not publish jam.");
          }
        });
      });
    }

    var addPrizeBtn = $("#jamAddPrizeBtn", root);
    if (addPrizeBtn) {
      addPrizeBtn.addEventListener("click", function () {
        var amountEl = $("#jamAddPrizeAmount", root);
        var amount = amountEl ? amountEl.value : 0;
        addPrizeBtn.disabled = true;
        ScenaJams.addHostPrize(userId, jam.id, amount).then(function () {
          toast("Prize pool increased.");
          render();
        }).catch(function (err) {
          addPrizeBtn.disabled = false;
          if (!handleJamNeedDucats(root, err, function () {
            addPrizeBtn.click();
          })) {
            toast((err && err.message) || "Could not add Ducats.");
          }
        });
      });
    }

    var buyPanel = $("#jamBuyDucatsPanel", root);
    if (buyPanel && window.ScenaWallet) {
      ScenaWallet.bindPackButtons(buyPanel, userId, function () {
        toast("After payment completes, try again.");
      }, function (err) {
        toast((err && err.message) || "Purchase failed.");
      });
    }

    var seriesSel = $("#jamSubmitSeries", root);
    var epSel = $("#jamSubmitEpisode", root);
    function paintEpisodes() {
      if (!seriesSel || !epSel) return;
      var sid = seriesSel.value;
      var series = seriesList.find(function (s) { return s.id === sid; });
      if (!series) {
        epSel.innerHTML = "";
        return;
      }
      var eps = ScenaStore.orderedEpisodes(series).filter(function (ep) {
        return ScenaStore.isEpisodePublic ? ScenaStore.isEpisodePublic(ep) : ep.isLive;
      });
      epSel.innerHTML = eps.map(function (ep) {
        return '<option value="' + escapeAttr(ep.id) + '">' +
          escapeHtml(ep.title || ("Episode " + (ep.number || ""))) + "</option>";
      }).join("");
    }
    if (seriesSel) {
      paintEpisodes();
      seriesSel.addEventListener("change", paintEpisodes);
    }

    var submitBtn = $("#jamSubmitBtn", root);
    if (submitBtn) {
      submitBtn.addEventListener("click", function () {
        var sid = seriesSel && seriesSel.value;
        var eid = epSel && epSel.value;
        var series = seriesList.find(function (s) { return s.id === sid; });
        var episode = series && (series.episodes || []).find(function (ep) { return ep.id === eid; });
        var contribEl = $("#jamSubmitContrib", root);
        var contribution = contribEl ? contribEl.value : 0;
        submitBtn.disabled = true;
        ScenaJams.submitEntry(userId, userProfile, jam.id, {
          series: series,
          episode: episode,
          contribution: contribution,
        }).then(function () {
          toast("Entry submitted!");
          render();
        }).catch(function (err) {
          submitBtn.disabled = false;
          if (!handleJamNeedDucats(root, err, function () {
            submitBtn.click();
          })) {
            toast((err && err.message) || "Could not submit.");
          }
        });
      });
    }

    root.querySelectorAll(".jam-like-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var subId = btn.getAttribute("data-like-sub");
        ScenaJams.toggleLike(userId, jam.id, subId).then(function () {
          render();
        }).catch(function (err) {
          toast((err && err.message) || "Could not update like.");
        });
      });
    });

    root.querySelectorAll(".jam-pick-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var subId = btn.getAttribute("data-pick-sub");
        ScenaJams.pickWinner(userId, jam.id, subId).then(function () {
          toast("Winner chosen — prize sent if funded.");
          render();
        }).catch(function (err) {
          toast((err && err.message) || "Could not pick winner.");
        });
      });
    });
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  function waitForStudioShell(callback, triesLeft) {
    if ($("#studioMain") && $("#studioSidebar")) {
      callback();
      return;
    }
    if (triesLeft <= 0) {
      throw new Error("Studio shell not mounted.");
    }
    requestAnimationFrame(function () {
      waitForStudioShell(callback, triesLeft - 1);
    });
  }

  window.ScenaStudio = {
    navigate: navigate,
    toast: toast,
    start: function (session) {
      userId = session.user.id;
      userEmail = session.user.email || "";

      waitForStudioShell(function () {
        var emailEl = $("#studioUserEmail");
        if (emailEl) emailEl.textContent = userEmail;

        function bootApp() {
          if (window.ScenaCloud && ScenaCloud.checkStorage) {
            ScenaCloud.checkStorage().then(function (result) {
              if (!result.ok) showStorageBanner(result.error || ScenaCloud.setupHint);
            });
          }
          window.addEventListener("hashchange", render);
          bindEpisodeModal();
          if (!location.hash) location.hash = "#/";
          render();
        }

        function afterProfile() {
          var badgesReady = window.ScenaBadges
            ? ScenaBadges.init(userId).then(function () { return ScenaBadges.checkAll(userId); })
            : Promise.resolve();
          var templatesReady = window.ScenaDemo && ScenaStore.ensureTemplateImports
            ? ScenaStore.ensureTemplateImports(userId, ScenaDemo.templateIds())
            : Promise.resolve();
          Promise.all([badgesReady, templatesReady]).then(function (results) {
            var newly = results[0];
            bootApp();
            if (newly && newly.length) awardBadges(newly);
          }).catch(function () { bootApp(); });
        }

        if (window.ScenaProfile) {
          ScenaProfile.get(userId, session).then(function (profile) {
            userProfile = profile;
            paintTopbarProfile(profile);
            afterProfile();
          }).catch(function () { afterProfile(); });
        } else {
          afterProfile();
        }
      }, 120);
    },
  };
})();
