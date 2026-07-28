/**
 * Reusable pixel art library picker + dual import UI (computer upload + pixel editor).
 */
(function (root) {
  var MODAL_ID = "scenaPixelArtPickerModal";

  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  function kindLabel(kind) {
    if (kind === "background") return "Background";
    if (kind === "ui") return "UI sprite";
    if (kind === "character") return "Character";
    return "Pixel art";
  }

  function assetToDataUrl(asset) {
    if (!asset) return "";
    if (asset.dataUrl) return asset.dataUrl;
    if (Array.isArray(asset.frames) && asset.frames.length) return asset.frames[0] || "";
    return "";
  }

  function listAssets(userId, kind) {
    if (!window.ScenaStore || !userId) return { items: [], fallback: false };
    var filtered = kind && kind !== "all";
    var items = ScenaStore.listUserArtFolder(userId, filtered ? kind : null);
    if (!items.length && filtered) {
      return { items: ScenaStore.listUserArtFolder(userId, null), fallback: true };
    }
    return { items: items, fallback: false };
  }

  function ensureModal() {
    var modal = document.getElementById(MODAL_ID);
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.className = "modal-backdrop pixel-art-picker-backdrop";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML =
      '<div class="modal pixel-art-picker-modal" role="dialog" aria-labelledby="pixelArtPickerTitle">' +
        '<h2 id="pixelArtPickerTitle">Choose from pixel editor</h2>' +
        '<p class="field-hint pixel-art-picker-hint" id="pixelArtPickerHint" hidden></p>' +
        '<div class="pixel-art-picker-list" id="pixelArtPickerList"></div>' +
        '<div class="modal-actions">' +
          '<a class="btn btn-sm btn-ghost" href="#/pixel" id="pixelArtPickerOpenEditor">Open Pixel editor</a>' +
          '<button type="button" class="btn" id="pixelArtPickerCancel">Cancel</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(modal);
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });
    modal.querySelector("#pixelArtPickerCancel").addEventListener("click", closeModal);
    return modal;
  }

  function closeModal() {
    var modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    modal._onSelect = null;
  }

  function openModal(opts) {
    opts = opts || {};
    var userId = opts.userId;
    var kind = opts.kind || "all";
    var onSelect = opts.onSelect;
    var title = opts.title || "Choose from pixel editor";

    if (!userId) {
      if (typeof opts.onError === "function") opts.onError("Sign in to use saved pixel art.");
      return;
    }
    if (!window.ScenaStore) {
      if (typeof opts.onError === "function") opts.onError("Pixel art library is unavailable.");
      return;
    }

    var modal = ensureModal();
    var titleEl = modal.querySelector("#pixelArtPickerTitle");
    var hintEl = modal.querySelector("#pixelArtPickerHint");
    var listEl = modal.querySelector("#pixelArtPickerList");
    if (titleEl) titleEl.textContent = title;

    var payload = listAssets(userId, kind);
    var items = payload.items;

    if (hintEl) {
      if (payload.fallback && kind && kind !== "all") {
        hintEl.hidden = false;
        hintEl.textContent = "No " + kindLabel(kind).toLowerCase() + " art saved — showing all pixel art.";
      } else {
        hintEl.hidden = true;
        hintEl.textContent = "";
      }
    }

    if (!items.length) {
      listEl.innerHTML =
        '<p class="field-hint pixel-art-picker-empty">No saved pixel art yet — open Pixel editor to create some.</p>';
    } else {
      listEl.innerHTML = items.map(function (item) {
        var thumb = escapeAttr(assetToDataUrl(item));
        var frameCount = (item.frames && item.frames.length) || 1;
        var meta = escapeHtml(kindLabel(item.kind)) + " · " + item.width + "×" + item.height +
          (frameCount > 1 ? " · " + frameCount + " frames" : "");
        return (
          '<button type="button" class="pixel-art-item pixel-art-picker-item" data-art-id="' + escapeAttr(item.id) + '">' +
            '<span class="pixel-art-thumb" style="background-image:url(' + thumb + ')"></span>' +
            '<span class="pixel-art-meta">' +
              "<strong>" + escapeHtml(item.name) + "</strong>" +
              "<span>" + meta + "</span>" +
            "</span>" +
          "</button>"
        );
      }).join("");
      listEl.querySelectorAll("[data-art-id]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-art-id");
          var asset = ScenaStore.getUserArtAsset(userId, id);
          var dataUrl = assetToDataUrl(asset);
          if (!dataUrl) return;
          closeModal();
          if (typeof onSelect === "function") {
            onSelect(dataUrl, {
              id: asset.id,
              name: asset.name,
              kind: asset.kind,
              width: asset.width,
              height: asset.height,
            });
          }
        });
      });
    }

    modal._onSelect = onSelect;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  }

  function renderImportActions(opts) {
    opts = opts || {};
    var accept = opts.accept || "image/*";
    var uploadLabel = opts.uploadLabel || "Import from computer";
    var pixelLabel = opts.pixelLabel || "Import from pixel editor";
    var kind = opts.kind || "all";
    var uploadPart = opts.uploadHtml;
    if (!uploadPart) {
      uploadPart =
        '<label class="btn btn-sm">' + escapeHtml(uploadLabel) +
        '<input type="file" accept="' + escapeAttr(accept) + '" hidden' +
        (opts.inputId ? ' id="' + escapeAttr(opts.inputId) + '"' : "") +
        (opts.inputName ? ' name="' + escapeAttr(opts.inputName) + '"' : "") +
        (opts.inputAttrs ? " " + opts.inputAttrs : "") +
        "></label>";
    }
    var pixelAttrs = ' data-pixel-art-kind="' + escapeAttr(kind) + '"';
    if (opts.pixelBtnId) pixelAttrs += ' id="' + escapeAttr(opts.pixelBtnId) + '"';
    if (opts.pixelBtnAttrs) pixelAttrs += " " + opts.pixelBtnAttrs;
    return (
      '<div class="art-import-actions">' +
        uploadPart +
        '<button type="button" class="btn btn-sm btn-secondary pixel-art-pick-btn"' + pixelAttrs + ">" +
          escapeHtml(pixelLabel) +
        "</button>" +
      "</div>"
    );
  }

  function bindPixelPickButton(btn, opts) {
    if (!btn) return;
    btn.addEventListener("click", function () {
      openModal({
        userId: opts.userId,
        kind: opts.kind || btn.getAttribute("data-pixel-art-kind") || "all",
        title: opts.title,
        onError: opts.onError,
        onSelect: opts.onSelect,
      });
    });
  }

  function bindFileUpload(input, opts) {
    if (!input) return;
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      input.value = "";
      if (!file) return;
      var purpose = (opts && opts.purpose) || "default";
      var seriesId = opts && opts.seriesId;
      ScenaStore.fileToDataUrl(file, { purpose: purpose, seriesId: seriesId }).then(function (url) {
        if (opts && opts.previewEl) {
          opts.previewEl.style.backgroundImage = "url(" + url + ")";
          opts.previewEl.textContent = "";
          opts.previewEl.classList.add("upload-preview--filled");
        }
        if (typeof opts.onApply === "function") opts.onApply(url, { source: "upload", fileName: file.name });
        if (opts && opts.toast) opts.toast("Image uploaded");
      }).catch(function (err) {
        if (opts && opts.onError) opts.onError((err && err.message) || "Could not upload image.");
        else if (opts && opts.toast) opts.toast((err && err.message) || "Could not upload image.");
      });
    });
  }

  function bindDualImport(opts) {
    opts = opts || {};
    bindFileUpload(opts.fileInput, {
      purpose: opts.purpose,
      seriesId: opts.seriesId,
      previewEl: opts.previewEl,
      toast: opts.toast,
      onError: opts.onError,
      onApply: opts.onApply,
    });
    bindPixelPickButton(opts.pixelBtn, {
      userId: opts.userId,
      kind: opts.kind,
      title: opts.pickerTitle,
      onError: opts.onError,
      onSelect: function (url, meta) {
        if (opts.previewEl) {
          opts.previewEl.style.backgroundImage = "url(" + url + ")";
          opts.previewEl.textContent = "";
          opts.previewEl.classList.add("upload-preview--filled");
        }
        if (typeof opts.onApply === "function") opts.onApply(url, Object.assign({ source: "pixel" }, meta || {}));
        if (opts.toast) opts.toast("Pixel art applied");
      },
    });
  }

  root.ScenaPixelArtPicker = {
    open: openModal,
    openPixelArtPicker: openModal,
    assetToDataUrl: assetToDataUrl,
    renderImportActions: renderImportActions,
    bindPixelPickButton: bindPixelPickButton,
    bindFileUpload: bindFileUpload,
    bindDualImport: bindDualImport,
    close: closeModal,
  };
})(window);
