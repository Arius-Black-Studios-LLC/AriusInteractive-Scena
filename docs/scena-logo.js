/**
 * Arleco — inject theatrical logo mark (proscenium + curtains + spotlight)
 */
(function () {
  var SVG =
    '<svg class="logo-svg" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M5.5 26.5V15.2Q16 8.2 26.5 15.2v11.3H5.5Z" fill="#101010"/>' +
      '<ellipse class="logo-spot" cx="16" cy="23.6" rx="6.2" ry="2.8" fill="#FF8C00" opacity="0.22"/>' +
      '<ellipse class="logo-spot" cx="16" cy="23.1" rx="3.6" ry="2" fill="#FFD700" opacity="0.88"/>' +
      '<ellipse cx="16" cy="22.6" rx="1.2" ry="0.55" fill="#FFFFFF" opacity="0.55"/>' +
      '<g class="logo-curtain-left">' +
        '<path d="M7 16.2c1.1-.9 2.2-1.1 3.4-.6V26c-1.3-.6-2.5-.9-3.4-1.2V16.2Z" fill="#C0392B"/>' +
        '<path d="M7 16.2c1.1-.9 2.2-1.1 3.4-.6l-.8 1.4-2.6-.8V16.2Z" fill="#FF6600" opacity="0.85"/>' +
        '<path d="M9.2 17.2V25.2" stroke="#FF8C00" stroke-width="0.6" opacity="0.35"/>' +
      '</g>' +
      '<g class="logo-curtain-right">' +
        '<path d="M25 16.2c-1.1-.9-2.2-1.1-3.4-.6V26c1.3-.6 2.5-.9 3.4-1.2V16.2Z" fill="#C0392B"/>' +
        '<path d="M25 16.2c-1.1-.9-2.2-1.1-3.4-.6l.8 1.4 2.6-.8V16.2Z" fill="#FF6600" opacity="0.85"/>' +
        '<path d="M22.8 17.2V25.2" stroke="#FF8C00" stroke-width="0.6" opacity="0.35"/>' +
      '</g>' +
      '<path d="M4.25 26.75V14.35Q16 4.75 27.75 14.35v12.4" stroke="#141414" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M4.75 26.25V14.85Q16 6.25 27.25 14.85v11.4" stroke="#FF8C00" stroke-width="0.65" stroke-linecap="round" opacity="0.28"/>' +
      '<circle cx="16" cy="8.8" r="1.05" fill="#FFD700"/>' +
      '<path d="M16 10.2v3.2" stroke="#FFD700" stroke-width="0.55" stroke-linecap="round" opacity="0.35"/>' +
    '</svg>';

  function mount() {
    document.querySelectorAll(".logo-mark").forEach(function (el) {
      if (el.querySelector("svg")) return;
      el.innerHTML = SVG;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
