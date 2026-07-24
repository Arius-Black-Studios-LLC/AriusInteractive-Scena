/**
 * Arleco Learn — lesson catalog + runner
 */
(function () {
  var sandbox = null;
  var learnUserId = null;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function toast(msg) {
    var el = $("#learnToast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-show");
    setTimeout(function () { el.classList.remove("is-show"); }, 3200);
  }

  if (window.ScenaBadges) {
    ScenaBadges._defaultToast = toast;
  }

  function isComplete(id) {
    if (!window.ScenaBadges) return false;
    var p = ScenaBadges.getProgress(learnUserId);
    return (p.stats.lessonsCompleted || []).indexOf(id) >= 0;
  }

  function markComplete(id) {
    if (!window.ScenaBadges) return [];
    return ScenaBadges.recordLessonComplete(id, learnUserId);
  }

  function parseRoute() {
    var hash = location.hash.replace(/^#/, "") || "/";
    var parts = hash.split("/").filter(Boolean);
    if (parts[0] === "lesson" && parts[1]) return { view: "lesson", id: parts[1] };
    return { view: "catalog" };
  }

  function getLesson(id) {
    return (window.ScenaLearnLessons || []).find(function (l) { return l.id === id; }) || null;
  }

  function sortedLessons() {
    return (window.ScenaLearnLessons || []).slice().sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });
  }

  function renderCatalog() {
    var main = $("#learnMain");
    var lessons = sortedLessons();
    var progress = window.ScenaBadges ? ScenaBadges.getProgress(learnUserId) : { stats: { lessonsCompleted: [] } };
    var completed = progress.stats.lessonsCompleted || [];
    var doneCount = lessons.filter(function (l) { return completed.indexOf(l.id) >= 0; }).length;

    main.innerHTML =
      '<div class="learn-catalog">' +
        '<header class="learn-hero">' +
          '<p class="learn-eyebrow">The Conservatory</p>' +
          '<h1>Stagecraft for the digital house</h1>' +
          '<p class="learn-lede">Rehearse in the real editor. Complete each scene to earn laurels — badges drawn from classical theatre.</p>' +
          '<div class="learn-progress-bar">' +
            '<div class="learn-progress-fill" style="width:' + Math.round((doneCount / Math.max(1, lessons.length)) * 100) + '%"></div>' +
          '</div>' +
          '<p class="learn-progress-text">' + doneCount + ' of ' + lessons.length + ' acts mastered</p>' +
        '</header>' +
        '<section class="learn-badges-section">' +
          '<div class="learn-badges-head">' +
            '<h2>Your laurels</h2>' +
            '<div id="learnBadgeSummary"></div>' +
          '</div>' +
          '<div id="learnBadgeGrid"></div>' +
        '</section>' +
        '<div class="learn-lesson-grid">' +
          lessons.map(function (l) {
            var done = completed.indexOf(l.id) >= 0;
            var badgeUnlocked = window.ScenaBadges && ScenaBadges.isUnlocked("lesson_" + l.id, learnUserId);
            return '<a class="learn-lesson-card' + (done ? " is-complete" : "") + '" href="#/lesson/' + l.id + '">' +
              '<span class="learn-lesson-category">' + escapeHtml(l.category) + '</span>' +
              '<h2>' + escapeHtml(l.title) + '</h2>' +
              '<p>' + escapeHtml(l.summary) + '</p>' +
              '<span class="learn-lesson-status">' +
                (badgeUnlocked ? "🏛 Laurel earned · " : "") +
                (done ? "✓ Complete" : "Take the stage →") +
              '</span>' +
            '</a>';
          }).join("") +
        '</div>' +
      '</div>';

    if (window.ScenaBadges) {
      ScenaBadges.renderSummary($("#learnBadgeSummary"), learnUserId);
      ScenaBadges.renderGrid($("#learnBadgeGrid"), { userId: learnUserId });
    }
  }

  function renderLesson(id) {
    var lesson = getLesson(id);
    var main = $("#learnMain");
    if (!lesson) {
      location.hash = "#/";
      return;
    }

    var done = isComplete(id);
    main.innerHTML =
      '<div class="learn-lesson">' +
        '<nav class="learn-lesson-nav">' +
          '<a href="#/" class="learn-back">← All acts</a>' +
          '<span class="learn-lesson-category">' + escapeHtml(lesson.category) + '</span>' +
        '</nav>' +
        '<div class="learn-lesson-layout">' +
          '<aside class="learn-instructions">' +
            '<h1>' + escapeHtml(lesson.title) + '</h1>' +
            '<div class="learn-instructions-body">' + lesson.instructions + '</div>' +
            '<div class="learn-task-status" id="learnTaskStatus">' +
              (done
                ? '<div class="learn-task-done"><strong>✓ Completed</strong><p>You can replay anytime.</p></div>'
                : '<div class="learn-task-pending"><strong>Your task</strong><p id="learnHint">Follow the steps — progress checks automatically.</p></div>') +
            '</div>' +
            '<div class="learn-lesson-actions" id="learnLessonActions" hidden>' +
              '<button type="button" class="btn btn-primary" id="learnNextBtn">Next act →</button>' +
              '<a href="#/" class="btn btn-ghost">Back to catalog</a>' +
            '</div>' +
          '</aside>' +
          '<div class="learn-sandbox-wrap" id="learnSandbox"></div>' +
        '</div>' +
      '</div>';

    sandbox = new ScenaLearnSandbox($("#learnSandbox"), lesson, {
      onChange: function (result) {
        var hintEl = $("#learnHint");
        var statusEl = $("#learnTaskStatus");
        var actionsEl = $("#learnLessonActions");
        if (result.ok) {
          var newly = markComplete(id);
          if (window.ScenaBadges) ScenaBadges.showUnlockCelebration(newly, toast);
          if (statusEl) {
            statusEl.innerHTML =
              '<div class="learn-task-done is-just-completed">' +
                '<strong>✓ Act complete!</strong>' +
                '<p>' + escapeHtml(result.message || "Well done.") + '</p>' +
              '</div>';
          }
          if (actionsEl) actionsEl.hidden = false;
        } else if (hintEl && result.hint) {
          hintEl.textContent = result.hint;
        }
      },
    });

    if (done) {
      var actionsEl = $("#learnLessonActions");
      if (actionsEl) actionsEl.hidden = false;
    }

    var nextBtn = $("#learnNextBtn");
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        var lessons = sortedLessons();
        var idx = lessons.findIndex(function (l) { return l.id === id; });
        if (idx >= 0 && idx < lessons.length - 1) {
          location.hash = "#/lesson/" + lessons[idx + 1].id;
        } else {
          location.hash = "#/";
        }
      });
    }
  }

  function render() {
    var route = parseRoute();
    if (route.view === "lesson") renderLesson(route.id);
    else renderCatalog();
  }

  window.ScenaLearnApp = {
    start: function (userId) {
      learnUserId = userId || null;
      var boot = window.ScenaBadges
        ? ScenaBadges.init(learnUserId).then(function () { ScenaBadges.checkAll(learnUserId); })
        : Promise.resolve();
      boot.then(function () {
        window.addEventListener("hashchange", render);
        if (!location.hash) location.hash = "#/";
        render();
      });
    },
  };
})();
