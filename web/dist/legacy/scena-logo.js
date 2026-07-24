/**
 * Arleco — inject app icon into logo marks site-wide
 */
(function () {
  var ICON_SRC = "/arleco-icon.png";

  function mount() {
    document.querySelectorAll(".logo-mark").forEach(function (el) {
      if (el.querySelector("img.logo-img")) return;
      el.innerHTML =
        '<img class="logo-img" src="' +
        ICON_SRC +
        '" alt="" width="32" height="32" decoding="async" />';
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
