/**
 * Arleco — built-in audio library (included in every project).
 */
(function () {
  window.ScenaDefaultAudio = [
    {
      id: "def_bgm_hum",
      label: "Theater hum",
      kind: "bgm",
      dataUrl: "assets/audio/theater-hum.wav",
      mimeType: "audio/wav",
      isDefault: true,
    },
    {
      id: "def_sfx_curtain",
      label: "Curtain rustle",
      kind: "sfx",
      dataUrl: "assets/audio/curtain-rustle.wav",
      mimeType: "audio/wav",
      isDefault: true,
    },
    {
      id: "def_ui_tap",
      label: "Button tap",
      kind: "ui",
      dataUrl: "assets/audio/button-tap.wav",
      mimeType: "audio/wav",
      isDefault: true,
    },
    {
      id: "def_voice_narration",
      label: "Sample narration",
      kind: "voice",
      dataUrl: "assets/audio/voice-narration.wav",
      mimeType: "audio/wav",
      isDefault: true,
    },
  ];
})();
