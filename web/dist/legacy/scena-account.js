/**
 * Arleco — shared account profile page UI (readers and creators).
 */
(function () {
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  function field(label, name, value, hint) {
    return (
      '<div class="field"><label>' + label + '</label>' +
      '<input type="text" name="' + name + '" value="' + escapeAttr(value || "") + '">' +
      (hint ? '<p class="field-hint">' + hint + "</p>" : "") +
      "</div>"
    );
  }

  function renderPage(profile, ctx) {
    profile = profile || {};
    ctx = ctx || {};
    var userEmail = ctx.userEmail || profile.email || "";
    var pronounList = (window.ScenaProfile && ScenaProfile.PRONOUN_OPTIONS)
      ? ScenaProfile.PRONOUN_OPTIONS.slice()
      : ["", "she/her", "he/him", "they/them"];
    if (profile.pronouns && pronounList.indexOf(profile.pronouns) < 0) {
      pronounList.push(profile.pronouns);
    }
    var pronounOpts = pronounList.map(function (p) {
      var label = p || "— prefer not to say —";
      return '<option value="' + escapeAttr(p) + '"' + (profile.pronouns === p ? " selected" : "") + ">" +
        escapeHtml(label) + "</option>";
    }).join("");

    return (
      '<div class="page">' +
        '<div class="page-head">' +
          '<div><h1>Account</h1><p>Your public profile appears on episode comments — display name, photo, username, and pronouns.</p></div>' +
          '<button type="button" class="btn btn-primary" id="saveAccountBtn">Save profile</button>' +
        "</div>" +
        '<form id="accountForm" class="account-settings">' +
          '<section class="form-section">' +
            "<h2>Public profile</h2>" +
            '<div class="account-avatar-row">' +
              '<div id="accountAvatarPreview">' +
                (window.ScenaProfile ? ScenaProfile.renderAvatar(profile, "account-avatar-preview") : "") +
              "</div>" +
              '<div class="account-avatar-actions">' +
                '<label class="btn btn-sm">Upload photo<input type="file" id="accountAvatarUpload" accept="image/*" hidden></label>' +
                '<button type="button" class="btn btn-sm btn-ghost" id="accountAvatarClear" type="button">Remove photo</button>' +
                '<p class="field-hint">Square images work best. Shown beside your comments.</p>' +
              "</div>" +
            "</div>" +
            field("Display name", "displayName", profile.displayName, "How your name appears on comments") +
            field("Username", "username", profile.username, "Optional @handle — 3–24 letters, numbers, or underscores") +
            '<div class="field"><label>Pronouns</label><select name="pronouns">' + pronounOpts + "</select>" +
              '<p class="field-hint">Shown in parentheses after your name on comments.</p></div>' +
          "</section>" +
          '<section class="form-section">' +
            "<h2>Mature content</h2>" +
            '<label class="check-row">' +
              '<input type="checkbox" id="accountAdultVerify"' +
                (profile.adultVerifiedAt ? " checked" : "") + ">" +
              "I am 18 or older and may view age-restricted visual novels and game jams" +
            "</label>" +
            '<p class="field-hint">Required for stories and jams labeled with sexual content. We store your confirmation on this account.</p>' +
          "</section>" +
          '<section class="form-section">' +
            "<h2>Sign-in</h2>" +
            '<div class="field"><label>Email</label><input type="email" name="email" value="' +
              escapeAttr(profile.email || userEmail) + '" readonly><p class="field-hint">Used for magic-link login — not shown on comments.</p></div>' +
          "</section>" +
        "</form>" +
      "</div>"
    );
  }

  function bindPage(profile, ctx) {
    profile = profile || {};
    ctx = ctx || {};
    var userId = ctx.userId;
    var userEmail = ctx.userEmail || "";
    var toast = ctx.toast || function () {};
    var onSaved = ctx.onSaved || function () {};
    var draftAvatar = profile.avatarUrl || "";
    var preview = $("#accountAvatarPreview");
    var form = $("#accountForm");

    function paintAvatar() {
      if (!preview || !window.ScenaProfile) return;
      var draft = Object.assign({}, profile, { avatarUrl: draftAvatar });
      preview.innerHTML = ScenaProfile.renderAvatar(draft, "account-avatar-preview");
    }

    var upload = $("#accountAvatarUpload");
    if (upload) {
      upload.addEventListener("change", function () {
        var file = upload.files && upload.files[0];
        if (!file) return;
        if (file.size > 500000) {
          toast("Use a smaller image (under 500 KB) for your profile photo.");
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          draftAvatar = reader.result;
          paintAvatar();
        };
        reader.readAsDataURL(file);
      });
    }

    var clearBtn = $("#accountAvatarClear");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        draftAvatar = "";
        paintAvatar();
      });
    }

    var saveBtn = $("#saveAccountBtn");
    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        if (!window.ScenaProfile) return;
        var adultEl = $("#accountAdultVerify");
        var patch = {
          displayName: form.querySelector('[name="displayName"]').value,
          username: form.querySelector('[name="username"]').value,
          pronouns: form.querySelector('[name="pronouns"]').value,
          avatarUrl: draftAvatar,
          adultVerifiedAt: adultEl && adultEl.checked ? new Date().toISOString() : "",
        };
        ScenaProfile.update(userId, patch, { user: { id: userId, email: userEmail } })
          .then(function (next) {
            onSaved(next);
            toast("Profile saved");
          })
          .catch(function (err) {
            toast((err && err.message) || "Could not save profile.");
          });
      });
    }
  }

  function paintTopbar(el, profile, ctx) {
    ctx = ctx || {};
    if (!el) return;
    if (!profile || !window.ScenaProfile) {
      el.textContent = ctx.userEmail || "";
      el.className = "user-email";
      el.onclick = null;
      return;
    }
    el.className = "user-email topbar-profile";
    el.title = ctx.title || "Your account";
    el.innerHTML =
      ScenaProfile.renderAvatar(profile, "topbar-avatar") +
      '<span class="topbar-profile-name">' + escapeHtml(profile.displayName || ctx.userEmail || "") + "</span>";
    if (ctx.onClick) {
      el.onclick = ctx.onClick;
    } else {
      el.onclick = null;
    }
  }

  window.ScenaAccount = {
    renderPage: renderPage,
    bindPage: bindPage,
    paintTopbar: paintTopbar,
  };
})();
