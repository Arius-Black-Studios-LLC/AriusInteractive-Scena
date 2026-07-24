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

  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  function contentFlags() {
    return (window.ScenaStore && ScenaStore.CONTENT_FLAGS) || [];
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
    if (jam.ageRestricted) return true;
    return (jam.contentFlags || []).indexOf("sexual_content") >= 0;
  }

  function validateJamSpec(spec) {
    spec = spec || {};
    var title = String(spec.title || "").trim();
    if (title.length < 3) throw new Error("Jam title must be at least 3 characters.");
    if (!String(spec.theme || "").trim()) throw new Error("Add a theme for your jam.");
    if (!String(spec.rules || "").trim()) throw new Error("Add rules so entrants know what to make.");

    var flags = Array.isArray(spec.contentFlags) ? spec.contentFlags.slice() : [];
    var ageRestricted = !!spec.ageRestricted;
    if (flags.indexOf("sexual_content") >= 0 && !ageRestricted) {
      throw new Error("Jams with sexual content must be age-restricted (18+).");
    }

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

    return {
      title: title,
      theme: String(spec.theme || "").trim(),
      rules: String(spec.rules || "").trim(),
      contentFlags: flags,
      ageRestricted: ageRestricted || flags.indexOf("sexual_content") >= 0,
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

  function walletSpend(userId, amount) {
    amount = Math.max(0, parseInt(amount, 10) || 0);
    if (!amount) return Promise.resolve();
    if (!window.ScenaWallet) return Promise.reject(new Error("Wallet unavailable."));
    return ScenaWallet.spendBalance(userId, amount, "jam_prize", null);
  }

  function walletCredit(userId, amount) {
    amount = Math.max(0, parseInt(amount, 10) || 0);
    if (!amount) return Promise.resolve();
    if (!window.ScenaWallet) return Promise.reject(new Error("Wallet unavailable."));
    return ScenaWallet.creditBalance(userId, amount, "jam_prize");
  }

  function validateSubmission(jam, userId, series, episode) {
    if (!jam || jam.status !== "published") throw new Error("This jam is not accepting entries.");
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
    return walletCredit(winner.userId, total).then(function () {
      jam.prize = jam.prize || {};
      jam.prize.paidOut = true;
      jam.prize.paidOutAt = new Date().toISOString();
      return saveJam(jam);
    });
  }

  function finalizeIfDue(jam) {
    if (!jam || jam.status !== "published") return jam;
    if (jamPhase(jam) !== "closed") return jam;
    if (jam.winnerSubmissionId) return jam;
    if (jam.winnerMode === "auto_likes") {
      jam.winnerSubmissionId = autoPickWinner(jam);
      jam = saveJam(jam);
      return distributePrize(jam);
    }
    return jam;
  }

  window.ScenaJams = {
    SUBMISSION_MODES: SUBMISSION_MODES,
    WINNER_MODES: WINNER_MODES,
    PARTICIPANT_PRIZE_MODES: PARTICIPANT_PRIZE_MODES,

    list: function (opts) {
      opts = opts || {};
      var rows = readAll().slice();
      if (opts.publishedOnly) rows = rows.filter(function (j) { return j.status === "published"; });
      if (opts.hostUserId) rows = rows.filter(function (j) { return j.hostUserId === opts.hostUserId; });
      rows.forEach(finalizeIfDue);
      rows.sort(function (a, b) {
        return String(b.publishedAt || b.createdAt || "").localeCompare(String(a.publishedAt || a.createdAt || ""));
      });
      return Promise.resolve(rows);
    },

    get: function (jamId) {
      var jam = findJam(jamId);
      if (jam) jam = finalizeIfDue(jam);
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

      var contribution = jam.prizeEnabled ? Math.max(0, parseInt(jam.hostContribution, 10) || 0) : 0;
      var chain = Promise.resolve();
      if (contribution > 0) {
        chain = walletSpend(userId, contribution).then(function () {
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
        userId: userId,
        userName: (profile && profile.displayName) || "Creator",
        seriesId: series.id,
        episodeId: episode.id,
        seriesTitle: series.title || "Untitled",
        episodeTitle: episode.title || ("Episode " + (episode.number || "")),
        submittedAt: new Date().toISOString(),
        likes: [],
      };

      var chain = contribute > 0 ? walletSpend(userId, contribute) : Promise.resolve();
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
          return (
            '<a class="jam-card" href="#/jams/' + escapeAttr(jam.id) + '">' +
              '<div class="jam-card-head">' +
                '<h3>' + escapeHtml(jam.title) + "</h3>" +
                '<span class="jam-phase jam-phase--' + escapeAttr(phase) + '">' + escapeHtml(phase) + "</span>" +
              "</div>" +
              '<p class="jam-card-theme">' + escapeHtml(jam.theme) + "</p>" +
              '<p class="jam-card-meta">Host: ' + escapeHtml(jam.hostName || "Creator") +
                (jam.ageRestricted ? ' · <span class="jam-age">18+</span>' : "") +
              "</p>" +
              (pool > 0
                ? '<p class="jam-card-prize">' + escapeHtml(formatDucats(pool)) + " prize pool</p>"
                : '<p class="jam-card-prize jam-card-prize--none">No Ducat prize</p>') +
            "</a>"
          );
        }).join("") +
        "</div>"
      );
    },

    renderForm: function (draft, opts) {
      opts = opts || {};
      draft = draft || {};
      var flags = contentFlags();
      var flagChecks = flags.map(function (f) {
        var on = (draft.contentFlags || []).indexOf(f.key) >= 0;
        return (
          '<label class="check-row">' +
            '<input type="checkbox" data-jam-flag="' + escapeAttr(f.key) + '"' + (on ? " checked" : "") + ">" +
            escapeHtml(f.label) +
          "</label>"
        );
      }).join("");

      var subModes = SUBMISSION_MODES.map(function (m) {
        return '<option value="' + escapeAttr(m.id) + '"' +
          ((draft.submissionMode || "either") === m.id ? " selected" : "") + ">" +
          escapeHtml(m.label) + "</option>";
      }).join("");

      var winModes = WINNER_MODES.map(function (m) {
        return '<option value="' + escapeAttr(m.id) + '"' +
          ((draft.winnerMode || "auto_likes") === m.id ? " selected" : "") + ">" +
          escapeHtml(m.label) + "</option>";
      }).join("");

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

      return (
        '<form class="jam-form" id="jamForm">' +
          '<div class="field"><label>Jam title</label><input type="text" name="title" maxlength="80" value="' +
            escapeAttr(draft.title || "") + '" required></div>' +
          '<div class="field"><label>Theme</label><input type="text" name="theme" maxlength="120" value="' +
            escapeAttr(draft.theme || "") + '" placeholder="What should entrants explore?" required></div>' +
          '<div class="field"><label>Rules</label><textarea name="rules" rows="4" maxlength="2000" required>' +
            escapeHtml(draft.rules || "") + "</textarea>" +
            '<p class="field-hint">Stay within Arleco content guidelines. Adult jams must be labeled and age-restricted.</p></div>' +
          '<section class="form-section"><h2>Content labels</h2><div class="check-grid">' + flagChecks + "</div>" +
            '<label class="check-row jam-age-row">' +
              '<input type="checkbox" name="ageRestricted" id="jamAgeRestricted"' +
                ((draft.ageRestricted || (draft.contentFlags || []).indexOf("sexual_content") >= 0) ? " checked" : "") + ">" +
              "Age-restricted (18+) — required for sexual content" +
            "</label></section>" +
          '<section class="form-section"><h2>Schedule</h2>' +
            '<div class="field-row">' +
              '<div class="field"><label>Submissions open</label><input type="datetime-local" name="submissionStart" value="' +
                escapeAttr(dtLocal(draft.submissionStart)) + '" required></div>' +
              '<div class="field"><label>Submissions close</label><input type="datetime-local" name="submissionEnd" value="' +
                escapeAttr(dtLocal(draft.submissionEnd)) + '" required></div>' +
            "</div>" +
            '<div class="field"><label>Judging ends</label><input type="datetime-local" name="judgingEnd" value="' +
              escapeAttr(dtLocal(draft.judgingEnd)) + '" required></div></section>' +
          '<section class="form-section"><h2>Entry requirements</h2>' +
            '<div class="field"><label>What can entrants submit?</label><select name="submissionMode">' + subModes + "</select></div>" +
            '<div class="field"><label>Winner selection</label><select name="winnerMode">' + winModes + "</select></div></section>" +
          '<section class="form-section"><h2>Prize pool (optional)</h2>' +
            '<label class="check-row"><input type="checkbox" name="prizeEnabled" id="jamPrizeEnabled"' +
              (draft.prizeEnabled ? " checked" : "") + "> Offer Ducat rewards</label>" +
            '<div class="jam-prize-fields" id="jamPrizeFields"' + (draft.prizeEnabled ? "" : " hidden") + ">" +
              '<div class="field"><label>Your contribution (Ducats)</label><input type="number" name="hostContribution" min="0" max="99999" value="' +
                escapeAttr(String(draft.hostContribution || 0)) + '"></div>' +
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
      var flags = [];
      form.querySelectorAll("[data-jam-flag]").forEach(function (el) {
        if (el.checked) flags.push(el.getAttribute("data-jam-flag"));
      });
      var sexual = flags.indexOf("sexual_content") >= 0;
      return {
        title: form.title && form.title.value,
        theme: form.theme && form.theme.value,
        rules: form.rules && form.rules.value,
        contentFlags: flags,
        ageRestricted: sexual || Boolean(form.ageRestricted && form.ageRestricted.checked),
        submissionStart: form.submissionStart && form.submissionStart.value,
        submissionEnd: form.submissionEnd && form.submissionEnd.value,
        judgingEnd: form.judgingEnd && form.judgingEnd.value,
        submissionMode: form.submissionMode && form.submissionMode.value,
        winnerMode: form.winnerMode && form.winnerMode.value,
        prizeEnabled: Boolean(form.prizeEnabled && form.prizeEnabled.checked),
        hostContribution: form.hostContribution && form.hostContribution.value,
        participantPrizeMode: form.participantPrizeMode && form.participantPrizeMode.value,
        participantMin: form.participantMin && form.participantMin.value,
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

      var submitPanel = "";
      if (phase === "submissions" && ctx.userId && jam.status === "published") {
        var seriesOpts = (ctx.seriesList || []).map(function (s) {
          return '<option value="' + escapeAttr(s.id) + '">' + escapeHtml(s.title || "Untitled") + "</option>";
        }).join("");
        var needContrib = jam.prizeEnabled && jam.participantPrizeMode === "required";
        submitPanel =
          '<section class="form-section jam-submit-panel">' +
            "<h2>Submit your entry</h2>" +
            (requiresAgeGate(jam) && !ctx.adultVerified
              ? '<p class="field-hint jam-age-warning">This jam is 18+. Confirm your age on <a href="/account">Account</a> before submitting.</p>'
              : "") +
            '<div class="field"><label>Series</label><select id="jamSubmitSeries">' + seriesOpts + "</select></div>" +
            '<div class="field"><label>Episode</label><select id="jamSubmitEpisode"></select></div>' +
            (jam.prizeEnabled && jam.participantPrizeMode !== "none"
              ? '<div class="field"><label>Add to prize pool (Ducats)' +
                  (needContrib ? " — required" : "") + '</label><input type="number" id="jamSubmitContrib" min="' +
                  (needContrib ? String(jam.participantMin || 0) : "0") + '" value="' +
                  (needContrib ? String(jam.participantMin || 0) : "0") + '"></div>'
              : "") +
            '<button type="button" class="btn btn-primary" id="jamSubmitBtn">Submit entry</button>' +
          "</section>";
      }

      return (
        '<div class="page jam-detail">' +
          '<div class="page-head">' +
            "<div><h1>" + escapeHtml(jam.title) + "</h1>" +
              '<p class="jam-detail-theme">' + escapeHtml(jam.theme) + "</p>" +
              '<p class="field-hint">Host: ' + escapeHtml(jam.hostName) +
                " · " + escapeHtml(phase) +
                (jam.ageRestricted ? ' · <span class="jam-age">18+</span>' : "") +
              "</p></div>" +
            (isHost && jam.status === "draft"
              ? '<button type="button" class="btn btn-primary" id="jamPublishBtn">Publish jam</button>'
              : "") +
          "</div>" +
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
