/**
 * Scena Learn — interactive lesson sandbox
 * Graph and resource lessons use the real ScenaGraphEditor in learn mode.
 */
(function () {
  function ScenaLearnSandbox(container, lesson, callbacks) {
    this.container = container;
    this.lesson = lesson;
    this.onChange = callbacks.onChange || function () {};
    this.state = lesson.setup();
    this.graph = null;

    this.state.episodes = this.state.episodes || [];
    this.state.nodes = this.state.nodes || [];
    this.state.edges = this.state.edges || [];
    this.state.metrics = this.state.metrics || [];
    this.state.characterProfiles = this.state.characterProfiles || [];
    this.state.backgroundScenes = this.state.backgroundScenes || [];
    this.state.assets = this.state.assets || [];
    if (window.ScenaStore && ScenaStore.ensureDefaultAudio) {
      ScenaStore.ensureDefaultAudio(this.state);
    }

    var self = this;
    var learnResourcesTab = null;
    if (lesson.mode === "resources") {
      if (lesson.id === "setup-character") learnResourcesTab = "characters";
      else if (lesson.id === "setup-stage") learnResourcesTab = "stages";
    }

    this.graph = new ScenaGraphEditor(container, {
      series: this.state,
      learnMode: true,
      learnResourcesTab: learnResourcesTab,
      learnPreviewPlay: !!lesson.learnPreviewPlay,
      learnEpisodes: !!lesson.learnEpisodes,
      learnSoundSettings: !!lesson.learnSoundSettings,
      learnKeyItemsPanel: !!lesson.learnKeyItemsPanel,
      learnHighlightPorts: learnResourcesTab ? null : (this.state.highlightPorts || null),
      learnValidate: function (series) {
        return lesson.validate(series);
      },
      onLearnChange: function (result) {
        self.onChange(result);
      },
    });

    if (lesson.id === "inherit-visuals" && this.graph.selectNode) {
      this.graph.selectNode("beat1");
    }
    if (lesson.id === "sound-design" && this.graph.selectNode) {
      this.graph.selectNode("curtain");
    }
    if (lesson.id === "metric-dialogue-branches" && this.graph.selectNode) {
      this.graph.selectNode("metric_router");
    }
    if (lesson.id === "route-gate-if-else" && this.graph.selectNode) {
      this.graph.selectNode("merge");
    }
    if (lesson.id === "choices-simple" && this.graph.selectNode) {
      this.graph.selectNode("fork");
    }
    if (lesson.id === "choices-one-gate" && this.graph.selectNode) {
      this.graph.selectNode("foyer_fork");
    }
    if (lesson.id === "choices-two-required" && this.graph.selectNode) {
      this.graph.selectNode("prep_fork");
    }
    if (lesson.id === "choices-or-same-path" && this.graph.selectNode) {
      this.graph.selectNode("parlor");
    }
    if (lesson.id === "metrics-affection-supplies" && this.graph.selectNode) {
      this.graph.selectNode("invite");
    }
  }

  window.ScenaLearnSandbox = ScenaLearnSandbox;
})();
