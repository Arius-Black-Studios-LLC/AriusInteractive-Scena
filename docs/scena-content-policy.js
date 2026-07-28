/**
 * Arleco — UGC text policy (client-side pre-check; server enforces via SQL).
 * Blocks severe profanity and slurs in comments, listings, etc.
 */
(function () {
  /* Word-boundary patterns after normalizeContentText() — keep in sync with supabase-content-policy.sql */
  var BLOCKED_TERMS = [
    "fuck", "fucking", "fucker", "motherfucker", "shit", "shitty", "bullshit",
    "bitch", "bastard", "cunt", "dick", "pussy", "whore", "slut",
    "nigger", "nigga", "faggot", "fag", "retard", "retarded",
    "kike", "spic", "chink", "wetback",
  ];

  var BLOCK_MESSAGE =
    "This text includes language that isn't allowed. Edit it and try again.";

  function normalizeContentText(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[@4]/g, "a")
      .replace(/[3]/g, "e")
      .replace(/[1!|]/g, "i")
      .replace(/[0]/g, "o")
      .replace(/[$5]/g, "s")
      .replace(/[7+]/g, "t")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/(.)\1{2,}/g, "$1$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  function termPattern(term) {
    return new RegExp("(?:^|\\s)" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:\\s|$)", "i");
  }

  function findViolation(text) {
    var norm = normalizeContentText(text);
    if (!norm) return null;
    for (var i = 0; i < BLOCKED_TERMS.length; i++) {
      if (termPattern(BLOCKED_TERMS[i]).test(norm)) return BLOCKED_TERMS[i];
    }
    return null;
  }

  window.ScenaContentPolicy = {
    BLOCK_MESSAGE: BLOCK_MESSAGE,

    normalize: normalizeContentText,

    check: function (text) {
      var hit = findViolation(text);
      if (hit) {
        return { ok: false, message: BLOCK_MESSAGE };
      }
      return { ok: true, message: "" };
    },

    assertAllowed: function (text) {
      var result = this.check(text);
      if (!result.ok) {
        throw new Error(result.message);
      }
      return true;
    },

    checkFields: function (values) {
      var list = values || [];
      for (var i = 0; i < list.length; i++) {
        var result = this.check(list[i]);
        if (!result.ok) return result;
      }
      return { ok: true, message: "" };
    },

    assertSeriesDescriptions: function (series) {
      series = series || {};
      return this.checkFields([series.shortDescription, series.longDescription]);
    },

    assertJamText: function (spec) {
      spec = spec || {};
      var result = this.checkFields([spec.tagline, spec.rules]);
      if (!result.ok) throw new Error(result.message);
      return true;
    },

    assertProfileName: function (displayName) {
      return this.assertAllowed(displayName);
    },
  };
})();
