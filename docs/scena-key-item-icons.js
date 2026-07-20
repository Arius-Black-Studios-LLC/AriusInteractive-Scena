/**
 * Scena — built-in key item icon library (SVG data URLs).
 */
(function (global) {
  var FG = "#6b5520";
  var BG = "#f0ead4";
  var ACC = "#c9a227";
  var MUTED = "#9a8450";

  function wrap(body) {
    return "data:image/svg+xml," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img">' +
      '<rect width="64" height="64" rx="14" fill="' + BG + '"/>' +
      body +
      "</svg>"
    );
  }

  function p(d, fill) {
    return '<path fill="' + (fill || FG) + '" d="' + d + '"/>';
  }

  function r(x, y, w, h, rx, fill) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (rx || 0) + '" fill="' + (fill || FG) + '"/>';
  }

  function c(cx, cy, rad, fill) {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + rad + '" fill="' + (fill || FG) + '"/>';
  }

  function poly(points, fill) {
    return '<polygon fill="' + (fill || FG) + '" points="' + points + '"/>';
  }

  function line(x1, y1, x2, y2, stroke, sw) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + (stroke || FG) + '" stroke-width="' + (sw || 3) + '" stroke-linecap="round"/>';
  }

  function icon(id, label, body) {
    return { id: id, label: label, dataUrl: wrap(body) };
  }

  var ICONS = [
    icon("key", "Key", c(24, 24, 9) + r(30, 24, 18, 6, 2) + r(44, 24, 6, 6, 1) + r(44, 34, 6, 6, 1) + r(44, 44, 6, 6, 1)),
    icon("old-key", "Old key", c(22, 22, 8) + r(28, 22, 16, 5, 2) + r(40, 22, 5, 5, 1) + r(40, 31, 5, 5, 1) + r(40, 40, 5, 5, 1) + c(22, 22, 4, MUTED)),
    icon("padlock", "Padlock", r(20, 28, 24, 22, 4) + r(24, 18, 16, 14, 8, "none") + '<path fill="none" stroke="' + FG + '" stroke-width="4" d="M26 28v-6a6 6 0 0 1 12 0v6"/>'),
    icon("lock-open", "Unlocked", r(20, 30, 24, 20, 4) + '<path fill="none" stroke="' + FG + '" stroke-width="4" stroke-linecap="round" d="M26 30v-8a6 6 0 0 1 10-4"/>'),
    icon("chest", "Chest", r(14, 24, 36, 24, 4) + r(14, 36, 36, 4, 0, ACC) + r(28, 30, 8, 8, 2, ACC)),
    icon("safe", "Safe", r(16, 18, 32, 34, 4) + c(32, 35, 8, MUTED) + c(32, 35, 3, ACC)),
    icon("door", "Door", r(18, 12, 28, 44, 3) + c(40, 34, 3, ACC)),
    icon("gate", "Gate", r(14, 16, 8, 40, 2) + r(42, 16, 8, 40, 2) + r(22, 22, 20, 4, 1) + r(22, 34, 20, 4, 1) + r(22, 46, 20, 4, 1)),
    icon("scroll", "Scroll", r(18, 16, 28, 36, 2) + r(16, 16, 6, 10, 3) + r(42, 16, 6, 10, 3) + line(24, 26, 40, 26, MUTED, 2) + line(24, 34, 38, 34, MUTED, 2)),
    icon("book", "Book", r(18, 14, 14, 38, 2) + r(32, 14, 14, 38, 2, ACC) + line(32, 14, 32, 52, FG, 2)),
    icon("open-book", "Open book", '<path fill="' + FG + '" d="M12 18h20v34H14a2 2 0 0 1-2-2V18zm20 0h20v32a2 2 0 0 1-2 2H32V18z"/>'),
    icon("letter", "Letter", r(16, 18, 32, 28, 3) + poly("32,30 42,38 22,38") + line(22, 42, 42, 42, MUTED, 2)),
    icon("envelope", "Envelope", r(14, 20, 36, 26, 3) + poly("14,20 32,36 50,20")),
    icon("map", "Map", r(16, 16, 32, 36, 3) + poly("16,16 40,16 48,24 48,52 16,52") + c(28, 30, 4, ACC) + c(38, 40, 3, MUTED)),
    icon("newspaper", "Newspaper", r(16, 14, 32, 38, 3) + r(20, 20, 12, 10, 1, MUTED) + line(20, 36, 44, 36, MUTED, 2) + line(20, 42, 40, 42, MUTED, 2)),
    icon("contract", "Contract", r(18, 12, 28, 42, 3) + line(22, 22, 42, 22, MUTED, 2) + line(22, 30, 42, 30, MUTED, 2) + line(22, 38, 36, 38, MUTED, 2) + p("M36 44l4 4 8-10-3-3-5 6-2-2z", ACC)),
    icon("photo", "Photo", r(14, 18, 36, 30, 3) + c(32, 33, 10, MUTED) + c(24, 26, 4, ACC)),
    icon("id-card", "ID card", r(14, 20, 36, 26, 4) + c(24, 33, 6) + r(34, 26, 12, 4, 1, MUTED) + r(34, 34, 16, 3, 1, MUTED)),
    icon("passport", "Passport", r(18, 14, 28, 38, 3) + c(32, 28, 8, ACC) + line(22, 40, 42, 40, MUTED, 2)),
    icon("gem", "Gem", poly("32,14 48,28 32,50 16,28")),
    icon("diamond", "Diamond", poly("32,12 50,32 32,52 14,32", ACC)),
    icon("ruby", "Ruby", poly("32,14 46,32 32,48 18,32", "#8b2942")),
    icon("emerald", "Emerald", poly("32,14 46,32 32,48 18,32", "#2a7a52")),
    icon("sapphire", "Sapphire", poly("32,14 46,32 32,48 18,32", "#2a4a8b")),
    icon("coin", "Coin", c(32, 32, 14, ACC) + c(32, 32, 9, BG) + c(32, 32, 6, ACC)),
    icon("coins", "Coins", c(24, 36, 10, ACC) + c(38, 36, 10, ACC) + c(31, 26, 10, ACC)),
    icon("gold-bar", "Gold bar", r(16, 26, 32, 16, 3, ACC) + r(20, 22, 24, 6, 2, ACC)),
    icon("crown", "Crown", poly("14,40 20,22 28,34 32,18 36,34 44,22 50,40")),
    icon("tiara", "Tiara", poly("16,38 22,24 32,30 42,24 48,38") + c(32, 22, 3, ACC)),
    icon("ring", "Ring", '<circle cx="32" cy="34" r="12" fill="none" stroke="' + ACC + '" stroke-width="5"/><circle cx="32" cy="22" r="5"/>'),
    icon("necklace", "Necklace", '<path fill="none" stroke="' + ACC + '" stroke-width="4" d="M18 36c0-10 6-18 14-18s14 8 14 18"/><circle cx="32" cy="38" r="5"/>'),
    icon("pearl", "Pearl", c(32, 32, 14, "#e8e0d0") + c(28, 26, 4, "#fff")),
    icon("potion", "Potion", r(26, 34, 12, 18, 3) + r(28, 18, 8, 18, 2) + r(30, 14, 4, 6, 1) + r(26, 40, 12, 6, 2, "#6b3a7a")),
    icon("flask", "Flask", r(28, 36, 8, 16, 2) + r(26, 22, 12, 16, 4) + r(30, 16, 4, 8, 1)),
    icon("vial", "Vial", r(29, 20, 6, 30, 3) + r(27, 16, 10, 6, 2) + r(29, 38, 6, 8, 2, "#4a90c4")),
    icon("apple", "Apple", c(32, 34, 12, "#8b3a3a") + line(32, 22, 32, 16, FG, 3) + r(34, 16, 8, 4, 2, "#2a7a3a")),
    icon("bread", "Bread", r(16, 26, 32, 16, 8, "#c9a86c") + line(20, 30, 44, 30, "#a08050", 2)),
    icon("meat", "Meat", r(18, 28, 28, 14, 7, "#8b4a4a") + r(36, 30, 12, 10, 5, "#a06060")),
    icon("fish", "Fish", p("M12 32c8-10 20-12 30-8l10-6v28l-10-6c-10 4-22 2-30-8z") + c(36, 28, 2, "#fff")),
    icon("cake", "Cake", r(18, 30, 28, 14, 3, "#d4a574") + r(16, 24, 32, 8, 2, "#f0c8a0") + c(24, 20, 2, ACC) + c(32, 18, 2, ACC) + c(40, 20, 2, ACC)),
    icon("coffee", "Coffee", r(22, 24, 20, 24, 4) + r(26, 18, 12, 8, 2) + r(42, 28, 6, 12, 2, "none") + '<path fill="none" stroke="' + FG + '" stroke-width="3" d="M42 28h4a4 4 0 0 1 0 8h-4"/>'),
    icon("wine", "Wine", p("M26 16h12l-2 14a6 6 0 0 1-8 0L26 16z") + r(30, 36, 4, 12, 1) + r(24, 48, 16, 4, 2) + r(26, 30, 12, 8, 2, "#6b2040")),
    icon("tea", "Tea", r(20, 28, 22, 16, 4) + r(24, 20, 14, 10, 2) + r(42, 30, 8, 2, 1) + line(46, 22, 46, 30, FG, 2)),
    icon("bottle", "Bottle", r(27, 30, 10, 20, 3) + r(29, 16, 6, 16, 2) + r(28, 12, 8, 6, 2)),
    icon("hammer", "Hammer", r(18, 34, 22, 8, 2) + r(36, 18, 8, 24, 2)),
    icon("wrench", "Wrench", p("M42 18a8 8 0 0 0-11 11l-9 9 4 4 9-9a8 8 0 0 0 7-15z")),
    icon("screwdriver", "Screwdriver", r(30, 14, 4, 28, 1) + r(24, 40, 16, 8, 2, ACC)),
    icon("knife", "Knife", p("M18 42l20-24 8 8-20 24z") + r(18, 42, 10, 6, 2)),
    icon("scissors", "Scissors", '<circle cx="22" cy="40" r="6" fill="none" stroke="' + FG + '" stroke-width="3"/><circle cx="22" cy="24" r="6" fill="none" stroke="' + FG + '" stroke-width="3"/><line x1="26" y1="36" x2="42" y2="18" stroke="' + FG + '" stroke-width="3"/><line x1="26" y1="28" x2="42" y2="46" stroke="' + FG + '" stroke-width="3"/>'),
    icon("rope", "Rope", '<path fill="none" stroke="' + ACC + '" stroke-width="4" d="M18 20c8 8 8 16 0 24s-8 16 0 24"/>'),
    icon("ladder", "Ladder", line(22, 16, 22, 50) + line(42, 16, 42, 50) + line(22, 24, 42, 24) + line(22, 34, 42, 34) + line(22, 44, 42, 44)),
    icon("shovel", "Shovel", r(30, 14, 4, 26, 1) + p("M18 40h28l-6 10H24z")),
    icon("pickaxe", "Pickaxe", line(20, 44, 44, 20, FG, 4) + line(20, 20, 44, 44, FG, 4) + r(28, 38, 8, 12, 2)),
    icon("fishing-rod", "Fishing rod", line(18, 48, 46, 16, FG, 3) + '<path fill="none" stroke="' + MUTED + '" stroke-width="2" d="M46 16v12"/>'),
    icon("sword", "Sword", p("M30 12h4v34h-4z") + p("M24 42h16l-2 8H26z") + p("M28 10h8l-2 4h-4z", ACC)),
    icon("dagger", "Dagger", p("M30 14h4v30h-4z") + p("M26 40h12l-4 10h-4z") + c(32, 12, 3, ACC)),
    icon("axe", "Axe", line(32, 16, 32, 48, FG, 4) + p("M32 18l16 8-8 14z")),
    icon("bow", "Bow", '<path fill="none" stroke="' + FG + '" stroke-width="4" d="M44 16c-12 8-12 24 0 32"/>'),
    icon("arrow", "Arrow", line(18, 32, 46, 32) + poly("46,32 38,26 38,38") + poly("18,32 24,28 24,36")),
    icon("shield", "Shield", p("M32 14l16 6v14c0 12-8 18-16 22-8-4-16-10-16-22V20z")),
    icon("bomb", "Bomb", c(30, 34, 12) + line(38, 24, 46, 16, FG, 3) + c(46, 16, 2, ACC)),
    icon("flower", "Flower", c(32, 32, 6, ACC) + c(32, 20, 5, "#d46a8a") + c(32, 44, 5, "#d46a8a") + c(20, 32, 5, "#d46a8a") + c(44, 32, 5, "#d46a8a")),
    icon("rose", "Rose", c(32, 28, 10, "#b03050") + poly("32,38 28,50 36,50", "#2a7a3a") + line(32, 38, 32, 50, "#2a7a3a", 3)),
    icon("leaf", "Leaf", p("M32 48c-8-10-8-22 0-32 8 10 8 22 0 32z", "#3a8a4a") + line(32, 16, 32, 48, "#2a6a3a", 2)),
    icon("acorn", "Acorn", c(32, 36, 12, "#8b5a2a") + r(24, 18, 16, 10, 6, "#6b4a2a")),
    icon("mushroom", "Mushroom", r(18, 28, 28, 16, 6, "#b04040") + r(26, 28, 12, 18, 4, "#e8dcc8")),
    icon("feather", "Feather", p("M20 44c8-16 16-24 28-28 0 10-4 18-10 24-6 6-12 8-18 4z")),
    icon("shell", "Shell", p("M20 36c4-12 10-18 12-18s8 6 12 18c-6 8-18 8-24 0z", "#e8c8a8")),
    icon("bone", "Bone", r(20, 28, 24, 8, 4, "#e8e0d0") + c(20, 32, 6, "#e8e0d0") + c(44, 32, 6, "#e8e0d0")),
    icon("skull", "Skull", c(32, 30, 14, "#e8e0d0") + c(26, 28, 3, FG) + c(38, 28, 3, FG) + r(28, 36, 8, 4, 2, FG)),
    icon("phone", "Phone", r(22, 14, 20, 36, 4) + c(32, 44, 2, MUTED)),
    icon("laptop", "Laptop", r(16, 22, 32, 20, 3) + r(12, 42, 40, 6, 2)),
    icon("camera", "Camera", r(16, 24, 32, 20, 4) + c(32, 34, 8, MUTED) + c(44, 28, 4)),
    icon("radio", "Radio", r(16, 22, 32, 24, 4) + c(24, 32, 4, ACC) + c(34, 32, 4, ACC) + line(40, 18, 48, 12, FG, 3)),
    icon("battery", "Battery", r(18, 24, 32, 18, 3) + r(50, 30, 4, 6, 1) + r(22, 28, 10, 10, 1, ACC)),
    icon("usb", "USB drive", r(24, 20, 16, 28, 3) + r(28, 14, 8, 8, 1) + r(30, 34, 4, 8, 1, ACC)),
    icon("chip", "Chip", r(20, 20, 24, 24, 3) + line(20, 26, 14, 26) + line(20, 32, 14, 32) + line(20, 38, 14, 38) + line(44, 26, 50, 26) + line(44, 32, 50, 32) + line(44, 38, 50, 38)),
    icon("wand", "Wand", line(20, 44, 44, 20, ACC, 4) + c(44, 20, 4, ACC)),
    icon("crystal-ball", "Crystal ball", c(32, 30, 14, "#8ab4d4") + r(24, 42, 16, 6, 2) + c(28, 26, 3, "#fff")),
    icon("amulet", "Amulet", '<path fill="none" stroke="' + ACC + '" stroke-width="3" d="M32 16v8"/><circle cx="32" cy="36" r="12" fill="' + FG + '"/>'),
    icon("talisman", "Talisman", poly("32,16 44,28 38,46 26,46 20,28") + c(32, 32, 5, ACC)),
    icon("rune", "Rune", r(22, 16, 20, 32, 2) + line(32, 22, 32, 42, ACC, 4) + line(26, 30, 38, 30, ACC, 4)),
    icon("hat", "Hat", r(14, 34, 36, 8, 2) + r(22, 20, 20, 16, 2)),
    icon("glove", "Glove", p("M24 22h8v20c0 6-4 10-8 10h-4V30h4V22zm8 8h8v22c0 6-4 10-8 10")),
    icon("boot", "Boot", p("M22 20h12v18H22zm12 30H18v-8h22v8c0 4-4 6-6 6z")),
    icon("mask", "Mask", p("M16 30c0-10 8-16 16-16s16 6 16 16c-4 8-10 12-16 12s-12-4-16-12z") + c(26, 32, 3, FG) + c(38, 32, 3, FG)),
    icon("glasses", "Glasses", '<circle cx="24" cy="34" r="8" fill="none" stroke="' + FG + '" stroke-width="3"/><circle cx="40" cy="34" r="8" fill="none" stroke="' + FG + '" stroke-width="3"/><line x1="32" y1="34" x2="32" y2="34" stroke="' + FG + '" stroke-width="3"/>'),
    icon("watch", "Watch", c(32, 32, 12, "none") + '<circle cx="32" cy="32" r="12" fill="none" stroke="' + FG + '" stroke-width="3"/>' + line(32, 32, 32, 24, FG, 3) + line(32, 32, 38, 32, FG, 3)),
    icon("heart", "Heart", p("M32 48c-12-8-18-16-18-24a10 10 0 0 1 18-6 10 10 0 0 1 18 6c0 8-6 16-18 24z", "#b04050")),
    icon("star", "Star", p("M32 14l6 14 14 2-10 10 2 14-12-7-12 7 2-14-10-10 14-2z", ACC)),
    icon("flag", "Flag", line(20, 16, 20, 50, FG, 3) + poly("20,16 44,24 20,32")),
    icon("trophy", "Trophy", p("M22 18h20v8c0 8-4 14-10 16-6-2-10-8-10-16v-8z") + r(26, 42, 12, 6, 2) + r(22, 48, 20, 4, 2)),
    icon("medal", "Medal", c(32, 38, 12, ACC) + poly("26,18 32,28 38,18") + line(28, 18, 26, 28, ACC, 3) + line(36, 18, 38, 28, ACC, 3)),
    icon("bell", "Bell", p("M32 16c-8 0-12 8-12 16v8h24v-8c0-8-4-16-12-16z") + r(28, 44, 8, 4, 2)),
    icon("candle", "Candle", r(30, 24, 4, 22, 1) + c(32, 20, 4, ACC) + r(28, 46, 8, 4, 2)),
    icon("lantern", "Lantern", r(24, 20, 16, 24, 4) + line(32, 14, 32, 20) + c(32, 32, 5, ACC)),
    icon("torch", "Torch", r(28, 28, 8, 22, 2) + c(32, 20, 8, ACC)),
    icon("compass", "Compass", c(32, 32, 16, "none") + '<circle cx="32" cy="32" r="16" fill="none" stroke="' + FG + '" stroke-width="3"/>' + poly("32,20 36,32 32,44 28,32", ACC)),
    icon("telescope", "Telescope", r(18, 28, 28, 8, 4) + r(40, 26, 10, 12, 3) + c(18, 32, 4)),
    icon("magnifier", "Magnifier", c(28, 28, 10, "none") + '<circle cx="28" cy="28" r="10" fill="none" stroke="' + FG + '" stroke-width="4"/>' + line(34, 34, 46, 46, FG, 4)),
    icon("gift", "Gift", r(18, 28, 28, 22, 3, "#b04050") + r(16, 22, 32, 8, 2, ACC) + line(32, 22, 32, 50, ACC, 3)),
    icon("box", "Box", r(16, 24, 32, 24, 3) + line(16, 24, 48, 24, ACC, 3) + line(32, 24, 32, 48, ACC, 3)),
    icon("puzzle", "Puzzle", p("M18 18h12v8h8v12h-8v8H18V18zm8 8h8v8h-8z")),
    icon("ticket", "Ticket", r(16, 22, 32, 20, 3) + line(32, 22, 32, 42, MUTED, 2) + c(32, 32, 4, ACC)),
    icon("badge", "Badge", poly("32,14 42,20 42,34 32,50 22,34 22,20") + c(32, 30, 6, ACC)),
    icon("fingerprint", "Fingerprint", c(32, 32, 14, "none") + '<path fill="none" stroke="' + FG + '" stroke-width="2" d="M32 20v24M26 24c0 8 2 12 6 16M38 24c0 8-2 12-6 16M22 28c0 12 4 18 10 20M42 28c0 12-4 18-10 20"/>'),
    icon("flame", "Flame", p("M32 48c-8-6-10-14-6-20 2 4 4 4 6 0 2 8 8 12 0 8-6 12-10 8z", ACC)),
    icon("snowflake", "Snowflake", line(32, 16, 32, 48) + line(18, 24, 46, 40) + line(46, 24, 18, 40) + c(32, 32, 4, ACC)),
    icon("sun", "Sun", c(32, 32, 10, ACC) + line(32, 14, 32, 18) + line(32, 46, 32, 50) + line(14, 32, 18, 32) + line(46, 32, 50, 32)),
    icon("moon", "Moon", c(34, 32, 14, ACC) + c(40, 32, 12, BG)),
    icon("cloud", "Cloud", p("M20 40h28c6 0 10-4 10-10a8 8 0 0 0-15-4 10 10 0 0 0-19 2c-2 0-4 2-4 6s2 6 6 6z")),
    icon("lightning", "Lightning", poly("34,14 22,34 30,34 26,50 42,28 34,28")),
    icon("anchor", "Anchor", c(32, 20, 6) + line(32, 26, 32, 46) + line(20, 40, 44, 40) + line(32, 46, 22, 50) + line(32, 46, 42, 50)),
    icon("ship", "Ship", p("M12 40h40l-6 8H18z") + line(32, 16, 32, 40) + poly("32,16 40,28 24,28")),
    icon("car", "Car", r(14, 30, 36, 14, 4) + c(22, 44, 5) + c(42, 44, 5) + r(18, 24, 28, 8, 3)),
    icon("bike", "Bike", c(22, 40, 8, "none") + '<circle cx="22" cy="40" r="8" fill="none" stroke="' + FG + '" stroke-width="3"/>' + c(42, 40, 8, "none") + '<circle cx="42" cy="40" r="8" fill="none" stroke="' + FG + '" stroke-width="3"/>' + line(22, 40, 32, 28) + line(32, 28, 42, 40)),
    icon("house", "House", poly("32,14 50,30 50,48 14,48 14,30") + r(26, 34, 12, 14, 1, BG)),
    icon("wallet", "Wallet", r(16, 22, 32, 24, 4) + r(36, 28, 8, 12, 2, ACC)),
    icon("briefcase", "Briefcase", r(16, 26, 32, 20, 3) + r(26, 18, 12, 10, 2) + line(16, 34, 48, 34, ACC, 2)),
    icon("backpack", "Backpack", r(20, 22, 24, 28, 6) + r(26, 16, 12, 8, 3) + r(24, 32, 16, 8, 2, MUTED)),
    icon("sack", "Sack", p("M32 16c-10 0-14 12-14 22 0 10 6 18 14 18s14-8 14-18c0-10-4-22-14-22z") + line(32, 16, 32, 10, FG, 3)),
    icon("hourglass", "Hourglass", p("M22 16h20v6l-10 10 10 10v6H22v-6l10-10-10-10z")),
    icon("clock", "Clock", c(32, 32, 16, "none") + '<circle cx="32" cy="32" r="16" fill="none" stroke="' + FG + '" stroke-width="3"/>' + line(32, 32, 32, 22) + line(32, 32, 40, 32)),
    icon("calendar", "Calendar", r(16, 18, 32, 34, 4) + r(16, 18, 32, 10, 0, ACC) + line(24, 14, 24, 22) + line(40, 14, 40, 22)),
    icon("music-note", "Music note", p("M38 18v26c-2-2-6-2-8 0s-2 6 0 8 6 2 8 0V18z") + r(38, 14, 10, 6, 2)),
    icon("paintbrush", "Paintbrush", line(20, 44, 44, 20, FG, 4) + r(40, 16, 8, 8, 2, ACC)),
    icon("palette", "Palette", p("M18 32c0-10 8-18 18-18 8 0 14 6 14 14 0 6-4 10-10 10H28c-6 0-10-4-10-6z") + c(24, 28, 2, "#b04050") + c(32, 24, 2, "#2a7a52") + c(40, 30, 2, ACC)),
    icon("quill", "Quill", line(20, 46, 46, 18, FG, 3) + poly("46,18 42,26 50,24")),
    icon("ink", "Ink", r(22, 20, 20, 28, 3) + r(26, 14, 8, 8, 2) + r(24, 36, 16, 8, 2, "#1a1a2a")),
    icon("stamp", "Stamp", r(20, 16, 24, 16, 3) + r(18, 32, 28, 16, 2) + r(24, 40, 16, 6, 2)),
    icon("wax-seal", "Wax seal", c(32, 32, 14, "#8b3030") + c(32, 32, 8, "#a04040") + p("M28 20h8l-2 4h-4z", ACC)),
    icon("mirror", "Mirror", c(32, 30, 14, "none") + '<circle cx="32" cy="30" r="14" fill="none" stroke="' + FG + '" stroke-width="3"/>' + r(28, 44, 8, 6, 2)),
    icon("crystal", "Crystal", poly("32,12 46,28 38,50 26,50 18,28", "#7ab4d4")),
    icon("egg", "Egg", p("M32 16c-8 0-12 12-12 22s4 18 12 18 12-8 12-18-4-22-12-22z", "#e8dcc8")),
    icon("honey", "Honey", r(24, 22, 16, 24, 3, ACC) + r(28, 16, 8, 8, 2, ACC)),
    icon("cheese", "Cheese", p("M18 40l14-20 20 8-8 20z", "#f0c860") + c(28, 32, 3, MUTED)),
    icon("carrot", "Carrot", p("M32 48l-6-28 6-8 6 8-6 28z", "#e08030") + poly("26,14 32,8 38,14", "#2a7a3a")),
    icon("pizza", "Pizza", p("M16 44l16-28 20 16z", "#e8a040") + c(30, 34, 3, "#b04040") + c(36, 38, 3, "#2a7a3a")),
    icon("cookie", "Cookie", c(32, 32, 14, "#c9a060") + c(26, 28, 2, "#6b4a2a") + c(38, 34, 2, "#6b4a2a") + c(30, 38, 2, "#6b4a2a")),
    icon("ice-cream", "Ice cream", c(32, 24, 12, "#f0c8d8") + p("M26 34l6 18 6-18z", "#c9a060")),
    icon("balloon", "Balloon", c(32, 26, 12, "#d04060") + line(32, 38, 32, 50, FG, 2)),
    icon("kite", "Kite", poly("32,16 46,32 32,44 18,32") + line(32, 44, 32, 50)),
    icon("dice", "Dice", r(20, 20, 24, 24, 4) + c(28, 28, 3) + c(36, 36, 3)),
    icon("cards", "Cards", r(18, 22, 18, 24, 2) + r(28, 18, 18, 24, 2, ACC)),
    icon("chess", "Chess piece", r(26, 36, 12, 12, 2) + r(28, 24, 8, 14, 2) + c(32, 20, 6)),
    icon("yarn", "Yarn", c(32, 32, 14, "#d46a8a") + '<path fill="none" stroke="' + MUTED + '" stroke-width="2" d="M20 32c0-8 6-14 12-14"/>'),
    icon("sewing", "Needle", line(32, 14, 32, 48, FG, 3) + poly("32,14 36,20 28,20") + line(28, 36, 36, 44, ACC, 2)),
    icon("umbrella", "Umbrella", p("M16 34c0-10 8-16 16-16s16 6 16 16") + line(32, 34, 32, 50, FG, 3)),
    icon("rain", "Rain drop", p("M32 14c-6 10-10 16-10 22a10 10 0 0 0 20 0c0-6-4-12-10-22z", "#4a90c4")),
    icon("planet", "Planet", c(32, 32, 14, "#6a8ab4") + c(40, 28, 4, ACC) + '<ellipse cx="32" cy="32" rx="20" ry="6" fill="none" stroke="' + MUTED + '" stroke-width="2"/>'),
    icon("rocket", "Rocket", p("M32 12l8 20h-6v16h-4V32h-6z") + poly("32,48 26,54 38,54") + c(32, 24, 3, ACC)),
    icon("ufo", "UFO", p("M16 36h32l-4 8H20z") + c(32, 30, 10, MUTED) + c(32, 26, 5, ACC)),
    icon("ghost", "Ghost", p("M22 20h20v22c-3-2-6-2-8 0-2-2-5-2-8 0-2-2-4-2-4 0V20z", "#e8e0f0") + c(28, 30, 2, FG) + c(36, 30, 2, FG)),
    icon("paw", "Paw print", c(32, 38, 8) + c(22, 28, 4) + c(42, 28, 4) + c(26, 22, 4) + c(38, 22, 4)),
    icon("bone-toy", "Dog bone", r(18, 30, 28, 8, 4, "#e8dcc8") + c(18, 30, 6, "#e8dcc8") + c(46, 30, 6, "#e8dcc8")),
    icon("fishbone", "Fish bone", line(32, 16, 32, 48, FG, 3) + line(24, 26, 40, 26) + line(26, 36, 38, 36) + line(28, 44, 36, 44)),
    icon("microphone", "Microphone", r(28, 16, 8, 18, 4) + r(22, 34, 20, 10, 6) + line(32, 34, 32, 44, FG, 3)),
    icon("headphones", "Headphones", '<path fill="none" stroke="' + FG + '" stroke-width="4" d="M20 36a12 12 0 0 1 24 0"/><rect x="14" y="36" width="8" height="14" rx="3"/><rect x="42" y="36" width="8" height="14" rx="3"/>'),
    icon("film", "Film reel", c(32, 32, 14, "none") + '<circle cx="32" cy="32" r="14" fill="none" stroke="' + FG + '" stroke-width="3"/>' + c(32, 32, 4) + c(32, 22, 2) + c(32, 42, 2) + c(22, 32, 2) + c(42, 32, 2)),
    icon("clapper", "Clapperboard", r(16, 28, 32, 18, 2) + poly("16,28 48,28 40,18 20,18") + line(24, 28, 30, 18) + line(34, 28, 40, 18)),
    icon("microscope", "Microscope", r(28, 36, 8, 12, 2) + r(22, 28, 20, 6, 2) + r(28, 18, 8, 12, 2)),
    icon("beaker", "Beaker", p("M26 18h12l-4 22H22z") + line(22, 40, 38, 40) + r(24, 34, 10, 4, 1, "#4a90c4")),
    icon("dna", "DNA", '<path fill="none" stroke="' + FG + '" stroke-width="3" d="M24 18c8 4 8 12 0 16s-8 12 0 16M40 18c-8 4-8 12 0 16s8 12 0 16"/>'),
    icon("magnet", "Magnet", p("M22 22h8v18c-4 4-8 0-8-8V22zm12 0h8v10c0 8-4 12-8 8V22z", "#b04040")),
    icon("lightbulb", "Light bulb", c(32, 28, 12, ACC) + r(26, 38, 12, 8, 2) + line(28, 42, 36, 42, MUTED, 2)),
    icon("plug", "Plug", r(24, 18, 16, 22, 3) + r(28, 40, 8, 8, 2) + r(26, 14, 4, 6, 1) + r(34, 14, 4, 6, 1)),
    icon("keycard", "Key card", r(16, 22, 32, 22, 4) + r(20, 28, 14, 3, 1, MUTED) + r(20, 34, 10, 3, 1, MUTED)),
    icon("qr-code", "QR code", r(18, 18, 28, 28, 3) + r(22, 22, 8, 8, 1) + r(34, 22, 8, 8, 1) + r(22, 34, 8, 8, 1) + r(36, 38, 6, 6, 1)),
    icon("tag", "Price tag", p("M18 22h16l14 14-10 10L18 22z") + c(24, 28, 3, ACC)),
    icon("shopping-bag", "Shopping bag", p("M20 24h24l-2 24H22z") + '<path fill="none" stroke="' + FG + '" stroke-width="3" d="M26 24v-4a6 6 0 0 1 12 0v4"/>'),
    icon("receipt", "Receipt", r(22, 14, 20, 38, 2) + line(26, 22, 38, 22, MUTED, 2) + line(26, 30, 38, 30, MUTED, 2) + line(26, 38, 34, 38, MUTED, 2)),
    icon("toolbox", "Toolbox", r(16, 28, 32, 18, 3) + r(24, 20, 16, 10, 2) + r(28, 16, 8, 6, 2)),
    icon("anvil", "Anvil", p("M18 40h28l-4 6H22z") + r(24, 30, 16, 12, 2)),
    icon("gear", "Gear", c(32, 32, 8, "none") + '<circle cx="32" cy="32" r="8" fill="none" stroke="' + FG + '" stroke-width="4"/>' + r(30, 16, 4, 6, 1) + r(30, 42, 4, 6, 1) + r(16, 30, 6, 4, 1) + r(42, 30, 6, 4, 1)),
    icon("chain", "Chain", c(24, 24, 6, "none") + '<circle cx="24" cy="24" r="6" fill="none" stroke="' + FG + '" stroke-width="3"/>' + c(40, 40, 6, "none") + '<circle cx="40" cy="40" r="6" fill="none" stroke="' + FG + '" stroke-width="3"/>' + line(28, 28, 36, 36, FG, 3)),
    icon("handcuffs", "Handcuffs", c(22, 32, 8, "none") + '<circle cx="22" cy="32" r="8" fill="none" stroke="' + FG + '" stroke-width="3"/>' + c(42, 32, 8, "none") + '<circle cx="42" cy="32" r="8" fill="none" stroke="' + FG + '" stroke-width="3"/>' + line(30, 32, 34, 32, FG, 3)),
    icon("evidence", "Evidence bag", r(20, 18, 24, 32, 2) + r(24, 14, 16, 6, 2) + r(26, 28, 12, 10, 1, MUTED)),
    icon("caution", "Caution tape", r(14, 28, 36, 10, 1, ACC) + line(18, 28, 24, 38, FG, 3) + line(30, 28, 36, 38, FG, 3) + line(42, 28, 48, 38, FG, 3)),
    icon("fire-extinguisher", "Fire extinguisher", r(26, 20, 12, 28, 3, "#b04040") + r(28, 14, 8, 8, 2) + r(24, 44, 16, 6, 2)),
    icon("first-aid", "First aid", r(18, 22, 28, 24, 4, "#b04040") + line(32, 28, 32, 40, "#fff", 4) + line(26, 34, 38, 34, "#fff", 4)),
    icon("pill", "Pill", r(20, 30, 24, 10, 5) + line(32, 30, 32, 40, "#fff", 2)),
    icon("syringe", "Syringe", r(28, 18, 8, 24, 2) + poly("32,14 36,18 28,18") + r(26, 42, 12, 4, 2)),
    icon("tooth", "Tooth", p("M32 16c-6 0-10 8-10 16 0 6 4 14 10 22 6-8 10-16 10-22 0-8-4-16-10-16z", "#e8e0d0")),
    icon("eye", "Eye", p("M16 32c6-8 14-12 16-12s10 4 16 12c-6 8-14 12-16 12s-10-4-16-12z") + c(32, 32, 5, ACC)),
    icon("ear", "Ear", p("M36 18c8 0 12 8 12 16s-6 16-14 16c-2 0-4-2-4-6v-8c0-4 2-6 6-6 2 0 4 2 4 6", "none") + '<path fill="none" stroke="' + FG + '" stroke-width="3" d="M36 18c8 0 12 8 12 16s-6 16-14 16"/>'),
    icon("brain", "Brain", p("M32 18c-8 0-14 6-14 14 0 4 2 8 6 10-2 6 2 12 8 12s10-6 10-12c4-2 6-6 6-10 0-8-6-14-16-14z", "#d46a8a")),
    icon("hand", "Hand", p("M24 22h6v20c0 4-2 6-6 6h-2V30h2V22zm8 4h6v18c0 4-2 6-6 6")),
    icon("footprint", "Footprint", p("M28 20c0-4 2-6 4-6s4 2 4 6v4h-8v-4zm-4 10c0-4 2-6 4-6s4 2 4 6v6h-8v-6zm8 0c0-4 2-6 4-6s4 2 4 6v8h-8v-8z")),
    icon("signpost", "Signpost", r(30, 16, 4, 34, 1) + r(18, 22, 22, 8, 2) + r(32, 34, 18, 8, 2, ACC)),
    icon("treasure-map", "Treasure map", r(16, 18, 32, 30, 2) + poly("16,18 44,18 48,24 48,48 16,48") + c(36, 38, 4, ACC) + p("M34 36l4 4 6-8", ACC)),
    icon("whistle", "Whistle", p("M20 30h20l8 4v8l-8 4H20z") + c(20, 34, 4) + r(40, 32, 6, 8, 2)),
    icon("stopwatch", "Stopwatch", c(32, 34, 14, "none") + '<circle cx="32" cy="34" r="14" fill="none" stroke="' + FG + '" stroke-width="3"/>' + r(30, 14, 4, 8, 1) + line(32, 34, 32, 26)),
    icon("binoculars", "Binoculars", c(24, 32, 10, "none") + '<circle cx="24" cy="32" r="10" fill="none" stroke="' + FG + '" stroke-width="3"/>' + c(40, 32, 10, "none") + '<circle cx="40" cy="32" r="10" fill="none" stroke="' + FG + '" stroke-width="3"/>' + r(28, 28, 8, 4, 1)),
    icon("satellite", "Satellite", r(28, 30, 8, 8, 1) + r(14, 28, 12, 4, 1) + r(38, 28, 12, 4, 1) + line(32, 30, 32, 20) + c(32, 18, 3, ACC)),
    icon("printer", "Printer", r(16, 28, 32, 16, 3) + r(20, 18, 24, 12, 2) + r(22, 40, 20, 6, 1, MUTED)),
    icon("envelope-open", "Open envelope", p("M14 24l18 14 18-14v22H14z") + poly("14,24 32,38 50,24")),
    icon("archive", "Archive box", r(16, 22, 32, 26, 3) + r(14, 18, 36, 6, 2) + line(16, 22, 48, 22, ACC, 2)),
    icon("folder", "Folder", p("M14 22h14l4 4h18v22H14z", ACC) + r(14, 26, 36, 20, 2)),
    icon("document", "Document", r(20, 14, 24, 38, 3) + line(24, 24, 40, 24, MUTED, 2) + line(24, 32, 40, 32, MUTED, 2) + line(24, 40, 34, 40, MUTED, 2)),
    icon("clipboard", "Clipboard", r(20, 16, 24, 38, 3) + r(26, 12, 12, 8, 2) + line(24, 28, 40, 28, MUTED, 2) + line(24, 36, 40, 36, MUTED, 2)),
    icon("pen", "Pen", line(18, 46, 46, 18, ACC, 4) + poly("46,18 40,22 44,26")),
    icon("pencil", "Pencil", line(18, 46, 46, 18, ACC, 4) + poly("46,18 42,24 48,22") + line(18, 46, 14, 50, "#f0c860", 4)),
    icon("eraser", "Eraser", r(22, 28, 20, 12, 3, "#f0a0a0") + r(22, 28, 8, 12, 1, "#e08080")),
    icon("ruler", "Ruler", r(16, 28, 32, 10, 2) + line(20, 28, 20, 34) + line(26, 28, 26, 32) + line(32, 28, 32, 34) + line(38, 28, 38, 32)),
    icon("compass-draw", "Drawing compass", line(32, 16, 32, 48, FG, 3) + line(32, 48, 20, 36, FG, 3) + line(32, 48, 44, 36, FG, 3) + c(32, 16, 3, ACC)),
    icon("scarf", "Scarf", p("M20 20c8 4 12 10 12 18v12H20V20zm12 18c4-4 8-6 12-4v16H32V38z", "#b04040")),
    icon("tie", "Necktie", p("M28 16h8l-4 20 4 18h-8l4-18z", ACC)),
    icon("coat", "Coat", p("M24 18h16l4 34H20z") + line(32, 18, 32, 52, ACC, 2)),
    icon("umbrella-closed", "Closed umbrella", line(32, 48, 32, 20, FG, 3) + p("M32 20c-10 0-14 6-14 12h28c0-6-4-12-14-12z")),
    icon("snowman", "Snowman", c(32, 40, 10, "#e8f0f8") + c(32, 26, 7, "#e8f0f8") + c(29, 24, 1, FG) + c(35, 24, 1, FG) + c(32, 28, 1, FG)),
    icon("christmas-tree", "Tree", poly("32,12 44,40 20,40") + r(28, 40, 8, 10, 1, "#6b4a2a")),
    icon("pumpkin", "Pumpkin", c(32, 34, 14, "#e08030") + line(32, 20, 32, 14, "#2a7a3a", 3) + c(28, 32, 2, FG) + c(36, 32, 2, FG)),
    icon("candy", "Candy", r(22, 26, 20, 14, 6, "#d04060") + poly("22,26 14,22 14,30") + poly("42,26 50,22 50,30")),
    icon("lollipop", "Lollipop", line(32, 28, 32, 50, FG, 3) + c(32, 22, 10, "#d04060")),
    icon("chocolate", "Chocolate", r(18, 22, 28, 22, 3, "#6b4a2a") + line(18, 33, 46, 33, "#8b6a4a", 2) + line(32, 22, 32, 44, "#8b6a4a", 2)),
    icon("spoon", "Spoon", p("M32 14c-4 0-6 4-6 8s2 8 6 8 6-4 6-8-2-8-6-8z") + r(30, 30, 4, 18, 2)),
    icon("fork", "Fork", r(30, 24, 4, 26, 1) + r(26, 14, 3, 12, 1) + r(30, 14, 4, 12, 1) + r(35, 14, 3, 12, 1)),
    icon("plate", "Plate", c(32, 34, 16, "none") + '<circle cx="32" cy="34" r="16" fill="none" stroke="' + FG + '" stroke-width="3"/>'),
    icon("cup", "Cup", p("M22 24h20v18c0 4-4 8-10 8s-10-4-10-8V24z") + r(42, 28, 6, 10, 2, "none") + '<path fill="none" stroke="' + FG + '" stroke-width="2" d="M42 28h4a3 3 0 0 1 0 6h-4"/>'),
    icon("martini", "Martini", p("M20 22h24l-12 18z") + r(30, 40, 4, 10, 1) + r(24, 50, 16, 4, 2) + c(32, 28, 4, "#4a90c4")),
    icon("popcorn", "Popcorn", r(20, 32, 24, 16, 3, "#e04040") + c(26, 26, 5, "#f0e8d0") + c(32, 22, 6, "#f0e8d0") + c(38, 26, 5, "#f0e8d0")),
    icon("ticket-gold", "Golden ticket", r(14, 24, 36, 18, 3, ACC) + line(32, 24, 32, 42, MUTED, 2)),
    icon("spell-scroll", "Spell scroll", r(18, 18, 28, 32, 2) + r(16, 18, 6, 8, 3) + r(42, 18, 6, 8, 3) + p("M28 28l4 4 8-8", ACC)),
    icon("hourglass-gold", "Golden hourglass", p("M22 16h20v6l-10 10 10 10v6H22v-6l10-10-10-10z", ACC)),
    icon("silver-key", "Silver key", c(24, 24, 9, MUTED) + r(30, 24, 18, 6, 2, MUTED) + r(44, 24, 6, 6, 1, MUTED) + r(44, 34, 6, 6, 1, MUTED)),
    icon("golden-key", "Golden key", c(24, 24, 9, ACC) + r(30, 24, 18, 6, 2, ACC) + r(44, 24, 6, 6, 1, ACC) + r(44, 34, 6, 6, 1, ACC)),
    icon("broken-key", "Broken key", c(22, 22, 8) + r(28, 22, 10, 5, 2) + line(38, 24, 44, 18, FG, 3)),
    icon("treasure-chest", "Treasure chest", r(12, 26, 40, 22, 4) + r(12, 36, 40, 4, 0, ACC) + r(28, 30, 8, 8, 2, ACC) + c(32, 28, 2, FG)),
    icon("locked-book", "Locked book", r(18, 14, 14, 38, 2) + r(32, 14, 14, 38, 2, ACC) + r(28, 28, 8, 10, 2) + c(32, 33, 2, ACC)),
    icon("mystery-box", "Mystery box", r(16, 20, 32, 32, 4) + line(16, 36, 48, 36, ACC, 3) + c(32, 28, 6, MUTED) + line(28, 28, 36, 36, MUTED, 2) + line(36, 28, 28, 36, MUTED, 2)),
    icon("love-letter", "Love letter", r(16, 18, 32, 28, 3) + p("M32 30c-4 4-8 6-12 4 4-2 8-2 12 0 4-2 8-2 12-4-4 2-8 4-12 4z", "#b04050")),
    icon("broken-heart", "Broken heart", p("M32 48c-6-4-10-10-10-16 0-6 4-10 10-10 2 0 4 1 6 2 2-1 4-2 6-2 6 0 10 4 10 10 0 6-4 12-10 16z", "#b04050") + line(32, 22, 32, 48, FG, 2)),
    icon("friendship", "Friendship", c(24, 34, 8, "#d46a8a") + c(40, 34, 8, "#d46a8a") + p("M24 34c4-6 8-8 8-8s4 2 8 8", "none") + '<path fill="none" stroke="' + ACC + '" stroke-width="3" d="M24 34c4-6 8-8 8-8s4 2 8 8"/>'),
    icon("music-cd", "CD", c(32, 32, 14, "none") + '<circle cx="32" cy="32" r="14" fill="none" stroke="' + FG + '" stroke-width="3"/>' + c(32, 32, 4, ACC)),
    icon("gamepad", "Gamepad", r(16, 26, 32, 16, 6) + c(24, 34, 4, MUTED) + r(38, 30, 4, 8, 2) + r(44, 32, 4, 4, 1)),
    icon("joystick", "Joystick", r(28, 18, 8, 14, 4) + r(18, 36, 28, 12, 6) + c(32, 14, 4, ACC)),
    icon("trophy-silver", "Silver trophy", p("M22 18h20v8c0 8-4 14-10 16-6-2-10-8-10-16v-8z", MUTED) + r(26, 42, 12, 6, 2) + r(22, 48, 20, 4, 2)),
    icon("trophy-gold", "Gold trophy", p("M22 18h20v8c0 8-4 14-10 16-6-2-10-8-10-16v-8z", ACC) + r(26, 42, 12, 6, 2, ACC) + r(22, 48, 20, 4, 2, ACC)),
    icon("sparkle", "Sparkle", line(32, 14, 32, 50, ACC, 3) + line(14, 32, 50, 32, ACC, 3) + line(20, 20, 44, 44, ACC, 2) + line(44, 20, 20, 44, ACC, 2)),
    icon("magic-dust", "Magic dust", c(20, 24, 3, ACC) + c(32, 18, 4, ACC) + c(44, 26, 3, ACC) + c(26, 38, 3, ACC) + c(38, 42, 4, ACC) + c(32, 32, 5, "#d4a0ff")),
    icon("portal", "Portal", c(32, 32, 16, "none") + '<circle cx="32" cy="32" r="16" fill="none" stroke="' + ACC + '" stroke-width="4"/>' + c(32, 32, 8, "#8a60d4")),
    icon("shield-cross", "Holy shield", p("M32 14l16 6v14c0 12-8 18-16 22-8-4-16-10-16-22V20z") + line(32, 24, 32, 40, ACC, 3) + line(26, 32, 38, 32, ACC, 3)),
    icon("skull-cross", "Skull mark", c(32, 28, 10, "#e8e0d0") + line(20, 44, 44, 44, FG, 3) + line(20, 44, 44, 50, FG, 3)),
    icon("poison", "Poison", c(32, 36, 12) + line(38, 24, 46, 16, FG, 3) + c(46, 16, 2, "#2a7a3a") + c(28, 34, 3, "#2a7a3a")),
    icon("antidote", "Antidote", r(29, 18, 6, 30, 3) + r(27, 14, 10, 6, 2) + r(29, 36, 6, 10, 2, "#2a7a52")),
    icon("sunflower", "Sunflower", c(32, 28, 8, ACC) + c(32, 18, 5, "#e08030") + c(32, 38, 5, "#e08030") + c(22, 28, 5, "#e08030") + c(42, 28, 5, "#e08030") + line(32, 36, 32, 50, "#2a7a3a", 3)),
    icon("clover", "Clover", c(32, 28, 6, "#2a7a3a") + c(24, 24, 5, "#2a7a3a") + c(40, 24, 5, "#2a7a3a") + c(32, 36, 5, "#2a7a3a") + line(32, 34, 32, 50, "#2a7a3a", 3)),
    icon("cactus", "Cactus", r(28, 24, 8, 26, 4, "#2a7a3a") + r(20, 30, 8, 6, 3, "#2a7a3a") + r(36, 26, 8, 6, 3, "#2a7a3a")),
    icon("tree", "Tree", poly("32,14 48,40 16,40", "#2a7a3a") + r(28, 40, 8, 10, 1, "#6b4a2a")),
    icon("campfire", "Campfire", poly("32,48 22,36 28,36z", ACC) + poly("32,48 42,36 36,36z", ACC) + line(32, 48, 32, 52, FG, 3)),
    icon("tent", "Tent", poly("32,16 48,48 16,48") + line(32, 16, 32, 48, ACC, 2)),
    icon("sleeping-bag", "Sleeping bag", r(18, 28, 28, 14, 7, "#4a6a8a") + c(18, 35, 7, "#4a6a8a")),
    icon("flashlight-item", "Flashlight", r(28, 20, 8, 24, 2) + r(24, 40, 16, 8, 3) + c(32, 18, 3, ACC)),
    icon("matches", "Matches", r(28, 16, 8, 28, 1, "#b04040") + r(26, 44, 12, 6, 2, "#6b4a2a")),
    icon("camp-knife", "Camp knife", p("M30 14h4v28h-4z") + p("M26 38h12l-4 10h-4z") + r(28, 12, 8, 4, 1, MUTED)),
  ];

  function hashLabel(label) {
    var s = String(label || "").toLowerCase().trim();
    var h = 0;
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function listDefaultIcons() {
    return ICONS.slice();
  }

  function getDefaultIcon(id) {
    return ICONS.find(function (icon) { return icon.id === id; }) || null;
  }

  function defaultIconDataUrl(id) {
    var icon = getDefaultIcon(id);
    return icon ? icon.dataUrl : null;
  }

  function iconForLabel(label) {
    if (!ICONS.length) return null;
    var idx = hashLabel(label) % ICONS.length;
    return ICONS[idx];
  }

  function iconForKeyword(label) {
    var s = String(label || "").toLowerCase();
    if (!s) return iconForLabel("");
    var match = ICONS.find(function (icon) {
      return s.indexOf(icon.id.replace(/-/g, " ")) >= 0 || s.indexOf(icon.label.toLowerCase()) >= 0;
    });
    return match || iconForLabel(label);
  }

  global.ScenaKeyItemIcons = {
    list: listDefaultIcons,
    get: getDefaultIcon,
    dataUrl: defaultIconDataUrl,
    forLabel: iconForLabel,
    forKeyword: iconForKeyword,
  };
})(window);
