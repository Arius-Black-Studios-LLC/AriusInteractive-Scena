/**
 * Arleco — preview / reader audio (BGM loop + one-shot SFX/UI) with volume prefs.
 */
(function () {
  var PREFS_KEY = "scena.audio.prefs.v1";

  function clamp01(n) {
    n = parseFloat(n);
    if (isNaN(n)) return 1;
    return Math.max(0, Math.min(1, n));
  }

  function ScenaAudioEngine() {
    this.bgmEl = null;
    this.bgmUrl = "";
    this.masterVolume = 1;
    this.bgmVolume = 0.65;
    this.sfxVolume = 0.85;
    this.muted = false;
    this.loadPrefs();
  }

  ScenaAudioEngine.prototype.loadPrefs = function () {
    try {
      var raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      var prefs = JSON.parse(raw);
      if (prefs.masterVolume != null) this.masterVolume = clamp01(prefs.masterVolume);
      if (prefs.bgmVolume != null) this.bgmVolume = clamp01(prefs.bgmVolume);
      if (prefs.sfxVolume != null) this.sfxVolume = clamp01(prefs.sfxVolume);
      if (prefs.muted != null) this.muted = !!prefs.muted;
    } catch (e) { /* ignore */ }
  };

  ScenaAudioEngine.prototype.savePrefs = function () {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        masterVolume: this.masterVolume,
        bgmVolume: this.bgmVolume,
        sfxVolume: this.sfxVolume,
        muted: this.muted,
      }));
    } catch (e) { /* ignore */ }
  };

  ScenaAudioEngine.prototype.getPrefs = function () {
    return {
      masterVolume: this.masterVolume,
      bgmVolume: this.bgmVolume,
      sfxVolume: this.sfxVolume,
      muted: this.muted,
    };
  };

  ScenaAudioEngine.prototype.setPrefs = function (prefs) {
    if (!prefs) return;
    if (prefs.masterVolume != null) this.masterVolume = clamp01(prefs.masterVolume);
    if (prefs.bgmVolume != null) this.bgmVolume = clamp01(prefs.bgmVolume);
    if (prefs.sfxVolume != null) this.sfxVolume = clamp01(prefs.sfxVolume);
    if (prefs.muted != null) this.muted = !!prefs.muted;
    this.savePrefs();
    if (this.bgmEl && this.bgmUrl) {
      this.bgmEl.volume = this.effectiveBgmVolume();
    }
  };

  ScenaAudioEngine.prototype.effectiveBgmVolume = function () {
    if (this.muted) return 0;
    return clamp01(this.masterVolume) * clamp01(this.bgmVolume);
  };

  ScenaAudioEngine.prototype.effectiveSfxVolume = function (scale) {
    if (this.muted) return 0;
    var base = clamp01(this.masterVolume) * clamp01(this.sfxVolume);
    if (typeof scale === "number") base *= clamp01(scale);
    return base;
  };

  ScenaAudioEngine.prototype.ensureBgm = function () {
    if (!this.bgmEl) {
      this.bgmEl = new Audio();
      this.bgmEl.loop = true;
    }
    this.bgmEl.volume = this.effectiveBgmVolume();
    return this.bgmEl;
  };

  ScenaAudioEngine.prototype.playBgm = function (url) {
    if (!url || this.muted) return;
    if (this.bgmUrl === url && this.bgmEl && !this.bgmEl.paused) {
      this.bgmEl.volume = this.effectiveBgmVolume();
      return;
    }
    var el = this.ensureBgm();
    this.bgmUrl = url;
    el.src = url;
    el.currentTime = 0;
    el.volume = this.effectiveBgmVolume();
    el.play().catch(function () {});
  };

  ScenaAudioEngine.prototype.stopBgm = function () {
    this.bgmUrl = "";
    if (!this.bgmEl) return;
    this.bgmEl.pause();
    this.bgmEl.currentTime = 0;
    this.bgmEl.removeAttribute("src");
  };

  ScenaAudioEngine.prototype.playOneShot = function (url, volume) {
    if (!url || this.muted) return;
    var clip = new Audio(url);
    clip.volume = this.effectiveSfxVolume(typeof volume === "number" ? volume : 1);
    clip.play().catch(function () {});
  };

  ScenaAudioEngine.prototype.setMuted = function (muted) {
    this.muted = !!muted;
    this.savePrefs();
    if (this.muted) this.stopBgm();
    else if (this.bgmUrl) this.playBgm(this.bgmUrl);
  };

  window.ScenaAudio = new ScenaAudioEngine();
})();
