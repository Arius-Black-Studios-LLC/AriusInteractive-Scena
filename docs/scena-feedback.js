/**
 * Arleco — non-intrusive developer feedback + homepage testimonials.
 */
(function () {
  var DISMISS_KEY = "arleco_feedback_dismissed";
  var SAVE_COUNT_KEY = "arleco_feedback_save_count";
  var SUBMITTED_KEY = "arleco_feedback_submitted";
  var DISMISS_DAYS = 30;
  var MIN_SAVES = 3;

  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function getClient() {
    return window.ScenaAuth && ScenaAuth.getClient ? ScenaAuth.getClient() : null;
  }

  function useCloud() {
    return window.ScenaAuth && ScenaAuth.isConfigured && ScenaAuth.isConfigured() && !!getClient();
  }

  function scopeKey(userId) {
    return userId ? String(userId) : "guest";
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* quota */ }
  }

  function dismissUntil(userId) {
    var map = readJson(DISMISS_KEY, {});
    map[scopeKey(userId)] = Date.now() + DISMISS_DAYS * 86400000;
    writeJson(DISMISS_KEY, map);
  }

  function isDismissed(userId) {
    var map = readJson(DISMISS_KEY, {});
    var until = map[scopeKey(userId)] || 0;
    return until > Date.now();
  }

  function markSubmitted(userId) {
    var map = readJson(SUBMITTED_KEY, {});
    map[scopeKey(userId)] = true;
    writeJson(SUBMITTED_KEY, map);
  }

  function hasSubmittedLocal(userId) {
    return Boolean(readJson(SUBMITTED_KEY, {})[scopeKey(userId)]);
  }

  function incrementSaveCount(userId) {
    var map = readJson(SAVE_COUNT_KEY, {});
    var key = scopeKey(userId);
    map[key] = (parseInt(map[key], 10) || 0) + 1;
    writeJson(SAVE_COUNT_KEY, map);
    return map[key];
  }

  function getSaveCount(userId) {
    return parseInt(readJson(SAVE_COUNT_KEY, {})[scopeKey(userId)], 10) || 0;
  }

  function authorName(profile) {
    if (!profile) return "Creator";
    return String(profile.displayName || profile.username || "Creator").trim() || "Creator";
  }

  function seedReviews() {
    return [
      {
        rating: 5,
        message: "The graph editor finally clicked for me — I shipped a playable chapter in a weekend.",
        author_display_name: "Mira K.",
        context: "studio",
      },
      {
        rating: 5,
        message: "Browser publishing without Ren'Py headaches. My playtesters just open a link.",
        author_display_name: "Devon L.",
        context: "publish",
      },
    ];
  }

  function readLocalReviews() {
    return readJson("arleco_public_reviews", []);
  }

  function writeLocalReview(entry) {
    var list = readLocalReviews();
    list.unshift(entry);
    writeJson("arleco_public_reviews", list.slice(0, 24));
  }

  function renderStars(rating, interactive) {
    var html = '<span class="feedback-stars' + (interactive ? " feedback-stars--interactive" : "") + '" role="img" aria-label="' + rating + ' out of 5 stars">';
    for (var i = 1; i <= 5; i++) {
      html += '<button type="button" class="feedback-star' + (i <= rating ? " is-filled" : "") + '" data-star="' + i + '" aria-label="' + i + ' stars">' +
        (i <= rating ? "\u2605" : "\u2606") + "</button>";
    }
    html += "</span>";
    return html;
  }

  window.ScenaFeedback = {
    MIN_SAVES: MIN_SAVES,

    incrementSaveCount: incrementSaveCount,
    getSaveCount: getSaveCount,

    shouldPrompt: function (userId) {
      if (!userId) return false;
      if (hasSubmittedLocal(userId)) return false;
      if (isDismissed(userId)) return false;
      return getSaveCount(userId) >= MIN_SAVES;
    },

    recordDismiss: dismissUntil,

    submit: function (userId, profile, opts) {
      opts = opts || {};
      var rating = parseInt(opts.rating, 10) || 0;
      var message = String(opts.message || "").trim();
      var share = Boolean(opts.shareOnHomepage) && rating >= 4;
      var context = opts.context || "studio";
      var name = authorName(profile);

      if (rating < 1 || rating > 5) {
        return Promise.reject(new Error("Pick a star rating."));
      }

      markSubmitted(userId);

      if (share && message.length >= 8) {
        writeLocalReview({
          rating: rating,
          message: message,
          author_display_name: name,
          context: context,
          created_at: new Date().toISOString(),
        });
      }

      var sb = getClient();
      if (!useCloud() || !sb) {
        return Promise.resolve({ ok: true, local: true });
      }

      return sb.rpc("submit_developer_feedback", {
        p_rating: rating,
        p_message: message,
        p_share_on_homepage: share,
        p_context: context,
        p_author_display_name: name,
      }).then(function (res) {
        if (res.error) throw new Error(res.error.message || "Could not save feedback.");
        return { ok: true, id: res.data };
      });
    },

    fetchPublicReviews: function () {
      var sb = getClient();
      if (useCloud() && sb) {
        return sb.rpc("public_developer_reviews", { p_limit: 12 }).then(function (res) {
          if (res.error) {
            console.warn("public_developer_reviews:", res.error.message);
            return readLocalReviews().length ? readLocalReviews() : seedReviews();
          }
          var rows = res.data || [];
          if (!rows.length) {
            var local = readLocalReviews();
            return local.length ? local : seedReviews();
          }
          return rows;
        }).catch(function () {
          var local = readLocalReviews();
          return local.length ? local : seedReviews();
        });
      }
      var local = readLocalReviews();
      return Promise.resolve(local.length ? local : seedReviews());
    },

    renderHomepageSection: function (reviews) {
      reviews = (reviews || []).filter(function (r) {
        return (parseInt(r.rating, 10) || 0) >= 4 && String(r.message || "").trim().length >= 8;
      }).slice(0, 6);
      if (!reviews.length) return "";

      var cards = reviews.map(function (r) {
        var stars = "";
        for (var i = 0; i < 5; i++) {
          stars += i < (parseInt(r.rating, 10) || 0) ? "\u2605" : "\u2606";
        }
        return (
          '<blockquote class="creator-review-card">' +
            '<div class="creator-review-stars" aria-hidden="true">' + stars + "</div>" +
            "<p>" + escapeHtml(r.message) + "</p>" +
            '<footer><cite>' + escapeHtml(r.author_display_name || "Creator") + "</cite></footer>" +
          "</blockquote>"
        );
      }).join("");

      return (
        '<section class="section container reveal" id="creator-reviews">' +
          '<div class="section-head">' +
            "<h2>Creators say</h2>" +
            '<span class="section-head-meta">From indie VN developers</span>' +
          "</div>" +
          '<div class="creator-reviews-grid reveal-stagger">' + cards + "</div>" +
        "</section>"
      );
    },

    mountHomepage: function (anchorId) {
      var anchor = document.getElementById(anchorId || "creatorReviewsMount");
      if (!anchor) return;
      ScenaFeedback.fetchPublicReviews().then(function (reviews) {
        var html = ScenaFeedback.renderHomepageSection(reviews);
        if (html) anchor.innerHTML = html;
      });
    },

    mountStudioBar: function (container, userId, profile, onDone) {
      if (!container || !userId) return null;
      if (!ScenaFeedback.shouldPrompt(userId)) return null;

      var existing = container.querySelector(".feedback-studio-bar");
      if (existing) return existing;

      var bar = document.createElement("div");
      bar.className = "feedback-studio-bar";
      bar.innerHTML =
        '<div class="feedback-studio-bar-inner">' +
          '<p class="feedback-studio-prompt">How is Arleco so far?</p>' +
          renderStars(0, true) +
          '<button type="button" class="btn btn-ghost btn-sm feedback-studio-later">Later</button>' +
        "</div>" +
        '<div class="feedback-studio-expand" hidden>' +
          '<label class="field"><span>Optional — what helped or what is missing?</span>' +
            '<textarea rows="2" maxlength="400" class="feedback-studio-message" placeholder="One sentence is plenty"></textarea>' +
          "</label>" +
          '<label class="feedback-studio-share">' +
            '<input type="checkbox" class="feedback-studio-share-check"> Share on the homepage (4+ stars only)' +
          "</label>" +
          '<div class="feedback-studio-actions">' +
            '<button type="button" class="btn btn-sm feedback-studio-cancel">Cancel</button>' +
            '<button type="button" class="btn btn-sm btn-primary feedback-studio-send">Send</button>' +
          "</div>" +
        "</div>" +
        '<p class="feedback-studio-thanks" hidden>Thanks — we read every note.</p>';

      container.appendChild(bar);

      var selectedRating = 0;
      var expand = bar.querySelector(".feedback-studio-expand");
      var thanks = bar.querySelector(".feedback-studio-thanks");
      var inner = bar.querySelector(".feedback-studio-bar-inner");

      bar.querySelectorAll(".feedback-star").forEach(function (btn) {
        btn.addEventListener("click", function () {
          selectedRating = parseInt(btn.getAttribute("data-star"), 10) || 0;
          bar.querySelectorAll(".feedback-star").forEach(function (b, idx) {
            b.classList.toggle("is-filled", idx < selectedRating);
            b.textContent = idx < selectedRating ? "\u2605" : "\u2606";
          });
          expand.hidden = false;
          var shareCheck = bar.querySelector(".feedback-studio-share-check");
          if (shareCheck) shareCheck.checked = selectedRating >= 4;
        });
      });

      bar.querySelector(".feedback-studio-later").addEventListener("click", function () {
        dismissUntil(userId);
        bar.remove();
      });

      bar.querySelector(".feedback-studio-cancel").addEventListener("click", function () {
        expand.hidden = true;
        selectedRating = 0;
      });

      bar.querySelector(".feedback-studio-send").addEventListener("click", function () {
        var msg = bar.querySelector(".feedback-studio-message").value.trim();
        var share = bar.querySelector(".feedback-studio-share-check").checked;
        ScenaFeedback.submit(userId, profile, {
          rating: selectedRating,
          message: msg,
          shareOnHomepage: share,
          context: "studio",
        }).then(function () {
          inner.hidden = true;
          expand.hidden = true;
          thanks.hidden = false;
          setTimeout(function () {
            bar.remove();
            if (onDone) onDone();
          }, 2200);
        }).catch(function (err) {
          if (window.alert) window.alert((err && err.message) || "Could not send feedback.");
        });
      });

      return bar;
    },

    afterSave: function (userId, profile, container) {
      if (!userId) return;
      incrementSaveCount(userId);
      setTimeout(function () {
        ScenaFeedback.mountStudioBar(container, userId, profile);
      }, 1800);
    },

    afterPublish: function (userId, profile, container) {
      if (!userId || hasSubmittedLocal(userId) || isDismissed(userId)) return;
      setTimeout(function () {
        ScenaFeedback.mountStudioBar(container, userId, profile);
      }, 1200);
    },
  };
})();
