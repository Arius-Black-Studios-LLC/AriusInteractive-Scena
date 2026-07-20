/**
 * Scena Conservatory — Celeste mascot + sample stage flats for lessons
 */
(function () {
  window.ScenaLearnMascots = [
    {
      id: "celeste",
      name: "Celeste",
      color: "#4a5a8a",
      spriteLabel: "neutral",
      image: "assets/mascots/scena-mascot-celeste.png",
      role: "Usher",
      tagline: "Mysterious moon usher",
    },
  ];

  window.ScenaLearnMascots.cast = function (series, mascotId, selectedProfileId) {
    var mascot = ScenaLearnMascots.find(function (m) { return m.id === mascotId; });
    if (!mascot || !window.ScenaStore) return null;

    series.characterProfiles = series.characterProfiles || [];
    var profile = selectedProfileId ? ScenaStore.getCharacter(series, selectedProfileId) : null;

    if (!profile) {
      profile = {
        id: ScenaStore.assetUid("ch"),
        name: mascot.name,
        color: mascot.color,
        sprites: [],
      };
      series.characterProfiles.push(profile);
    }

    profile.name = profile.name || mascot.name;
    profile.color = profile.color || mascot.color;
    profile.sprites = profile.sprites || [];

    var exists = profile.sprites.some(function (s) {
      return s.label === mascot.spriteLabel && s.dataUrl === mascot.image;
    });
    if (!exists) {
      profile.sprites.push({
        id: ScenaStore.assetUid("sp"),
        label: mascot.spriteLabel,
        dataUrl: mascot.image,
      });
    }

    return profile.id;
  };

  window.ScenaLearnStageFlats = {
    name: "Empty theater",
    layers: {
      bg: "assets/stages/stage-layer-bg.png",
      mg: "assets/stages/stage-layer-mg.png",
      fg: "assets/stages/stage-layer-fg.png",
    },
    apply: function (series, selectedStageId) {
      if (!window.ScenaStore) return null;
      series.backgroundScenes = series.backgroundScenes || [];
      var stage = selectedStageId ? ScenaStore.getBackground(series, selectedStageId) : null;
      if (!stage) {
        stage = {
          id: ScenaStore.assetUid("bg"),
          name: ScenaLearnStageFlats.name,
          layers: { bg: null, mg: null, fg: null },
        };
        series.backgroundScenes.push(stage);
      }
      stage.name = stage.name || ScenaLearnStageFlats.name;
      stage.layers = {
        bg: ScenaLearnStageFlats.layers.bg,
        mg: ScenaLearnStageFlats.layers.mg,
        fg: ScenaLearnStageFlats.layers.fg,
      };
      return stage.id;
    },
  };
})();
