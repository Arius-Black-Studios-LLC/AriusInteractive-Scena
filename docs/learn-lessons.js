/**

 * Arleco Learn — interactive editor lessons (Conservatory curriculum)

 */

(function () {

  function beat(id, x, y, data) {

    return {

      id: id,

      type: "beat",

      x: x,

      y: y,

      data: ScenaStore.emptyBeatData(data || {}),

    };

  }



  function getNode(state, id) {

    return (state.nodes || []).find(function (n) { return n.id === id; }) || null;

  }



  function edgeBetween(edges, source, target, choiceId) {

    return (edges || []).some(function (e) {

      if (e.source !== source || e.target !== target) return false;

      return (e.choiceId || null) === (choiceId || null);

    });

  }



  function outgoingFrom(edges, sourceId, choiceId) {

    return (edges || []).find(function (e) {

      if (e.source !== sourceId) return false;

      if (choiceId) return e.choiceId === choiceId;

      return !e.choiceId;

    }) || null;

  }

  var ROUTE_ELSE_ID = ScenaStore.ROUTE_ELSE_ID;

  function routeEdgeToTarget(edges, routerId, targetId, routeId) {
    return (edges || []).find(function (e) {
      return e.source === routerId &&
        e.target === targetId &&
        e.choiceId === routeId;
    }) || null;
  }

  function findKeyItemRouteRule(router, keyId, mode) {
    mode = mode || "has";
    return (router.data.routeRules || []).find(function (r) {
      return ScenaStore.normalizeRouteChecks(r).some(function (c) {
        return c.type === "keyItem" && c.assetId === keyId && (c.mode || "has") === mode;
      });
    }) || null;
  }

  function findRouteEdgeToTarget(state, router, targetId, predicate) {
    return (state.edges || []).find(function (e) {
      if (e.source !== router.id || e.target !== targetId) return false;
      if (!e.choiceId || e.choiceId === ROUTE_ELSE_ID) return false;
      var rule = (router.data.routeRules || []).find(function (r) { return r.id === e.choiceId; });
      return rule && (!predicate || predicate(rule));
    }) || null;
  }



  function routeGate(id, x, y, rules) {
    return beat(id, x, y, {
      beatKind: "flow-gate",
      isRouteGate: true,
      autoAdvance: true,
      routeRules: rules || [],
      sets: [],
    });
  }

  function keyItemBeat(id, x, y, assetId, delta) {
    return beat(id, x, y, {
      beatKind: "key-item",
      autoAdvance: true,
      grantsKeyItemId: assetId || null,
      keyItemDelta: delta != null ? delta : 1,
    });
  }

  function logicBeat(id, x, y, set) {
    return beat(id, x, y, {
      beatKind: "logic",
      autoAdvance: true,
      sets: [set || { metricKey: "", op: "add", value: 1 }],
    });
  }

  function findLogicAfterChoice(state, fromId, choiceId) {
    var edge = outgoingFrom(state.edges, fromId, choiceId);
    if (!edge) return null;
    var node = getNode(state, edge.target);
    if (node && ScenaStore.getBeatKind(node) === "logic") return node;
    return null;
  }

  function logicAdjustsMetric(node, metricKey, op, value) {
    if (!node || !node.data || !node.data.sets) return false;
    return node.data.sets.some(function (set) {
      if ((set.metricKey || "") !== metricKey) return false;
      var setOp = set.op || "add";
      var setVal = parseFloat(set.value);
      if (isNaN(setVal)) setVal = 0;
      var effectiveOp = setOp;
      var effectiveVal = setVal;
      if (setOp === "add" && setVal < 0) {
        effectiveOp = "subtract";
        effectiveVal = Math.abs(setVal);
      } else if (setOp === "subtract" && setVal < 0) {
        effectiveVal = Math.abs(setVal);
      }
      if (op && effectiveOp !== op) return false;
      if (value != null && parseFloat(effectiveVal) !== parseFloat(value)) return false;
      return true;
    });
  }

  function findMetricRouteRule(router, metricKey, op, value) {
    return (router.data.routeRules || []).find(function (r) {
      return ScenaStore.normalizeRouteChecks(r).some(function (c) {
        return c.type === "metric" && c.metricKey === metricKey &&
          (op ? (c.op || "gte") === op : true) &&
          (value != null ? parseFloat(c.value) === parseFloat(value) : true);
      });
    }) || null;
  }

  function findKeyGrantNode(state, keyId) {
    var found = null;
    (state.nodes || []).forEach(function (n) {
      if (ScenaStore.getBeatKind(n) === "key-item" && n.data.grantsKeyItemId === keyId) found = n;
    });
    return found;
  }

  function pathFromChoiceReaches(state, fromId, choiceId, targetId) {
    var edge = outgoingFrom(state.edges, fromId, choiceId);
    if (!edge) return false;
    return pathFromNodeReaches(state, edge.target, targetId);
  }

  function pathFromNodeReaches(state, fromId, targetId) {
    if (!fromId || !targetId) return false;
    if (fromId === targetId) return true;
    var seen = {};
    var queue = [fromId];
    while (queue.length) {
      var id = queue.shift();
      if (id === targetId) return true;
      if (seen[id]) continue;
      seen[id] = true;
      (state.edges || []).forEach(function (e) {
        if (e.source === id && queue.indexOf(e.target) < 0) queue.push(e.target);
      });
    }
    return false;
  }

  function findChoiceRouteGateAfter(state, fromId) {
    var edge = outgoingFrom(state.edges, fromId, null);
    if (!edge) return null;
    var node = getNode(state, edge.target);
    if (node && ScenaStore.isRouterNode(node)) return node;
    return null;
  }

  function findFlowGateAfter(state, fromId) {
    return findChoiceRouteGateAfter(state, fromId);
  }

  function findMetricRouteGateAfter(state, fromId) {
    return findFlowGateAfter(state, fromId);
  }

  function findChoice(state, nodeId, labelPart) {

    var node = getNode(state, nodeId);

    if (!node || !node.data || !node.data.choices) return null;

    var needle = String(labelPart || "").toLowerCase();

    return node.data.choices.find(function (c) {

      var text = (c.choiceText || c.label || "").toLowerCase();

      return text.indexOf(needle) >= 0;

    }) || null;

  }



  function findMetricByKey(state, key) {
    return (state.metrics || []).find(function (m) {
      return m && m.key === key;
    }) || null;
  }

  function choiceMetricGateMatches(choice, state, metricKey, minValue) {
    if (!choice) return false;
    return (ScenaStore.normalizeChoiceChecks(choice) || []).some(function (req) {
      if (req.type !== "metric" || !req.metricKey) return false;
      var metric = findMetricByKey(state, req.metricKey);
      if (!metric) return false;
      if (metricKey && metric.key !== metricKey && !/lockpick/i.test(metric.displayName || "")) {
        return false;
      }
      var val = parseFloat(req.value);
      if (isNaN(val)) val = 0;
      var threshold = minValue != null ? parseFloat(minValue) : 1;
      if (isNaN(threshold)) threshold = 1;
      var op = req.op || "gte";
      if (op === "gt") return val > threshold;
      if (op === "gte") return val >= threshold;
      if (op === "lt") return val < threshold;
      if (op === "lte") return val <= threshold;
      if (op === "eq") return val === threshold;
      if (op === "neq") return val !== threshold;
      return val >= threshold;
    });
  }

  function countGatedChoices(node) {

    if (!node || !node.data || !node.data.choices) return 0;

    return node.data.choices.filter(function (c) {

      return ScenaStore.choiceHasAnyGate(c);

    }).length;

  }


  var LESSON_CELESTE_ID = "ch_celeste";

  var LESSON_SPRITE_ID = "sp_celeste_neutral";

  var LESSON_STAGE_ID = "bg_empty_theater";

  var LESSON_EPISODE_ID = "ep_lesson_1";



  function lessonCelesteProfile() {

    return {

      id: LESSON_CELESTE_ID,

      name: "Celeste",

      color: "#4a5a8a",

      sprites: [{

        id: LESSON_SPRITE_ID,

        label: "neutral",

        dataUrl: "assets/mascots/scena-mascot-celeste.png",

      }],

    };

  }



  function lessonTheaterStage() {

    return {

      id: LESSON_STAGE_ID,

      name: "Empty theater",

      layers: {

        bg: "assets/stages/stage-layer-bg.png",

        mg: "assets/stages/stage-layer-mg.png",

        fg: "assets/stages/stage-layer-fg.png",

      },

    };

  }



  window.ScenaLearnLessons = [

    {

      id: "connect-two-nodes",

      title: "The through-line",

      category: "Blocking & cues",

      order: 1,

      mode: "graph",

      summary: "Link two beats into one unbroken scene — the thread that carries an act forward.",

      instructions:

        "<p>Every play moves beat by beat, like blocking on the stage floor.</p>" +

        "<ol><li>Find the <strong>Next</strong> plug on the left beat.</li>" +

        "<li>Drag to the <strong>Input</strong> plug on the right beat.</li>" +

        "<li>Release — the through-line is set.</li></ol>" +

        "<p class=\"learn-tip\">When the connection is correct, this act completes automatically.</p>",

      setup: function () {

        return {

          entryNodeId: "intro",

          nodes: [

            beat("intro", 80, 140, { dialogueText: "The door creaks open…" }),

            beat("next", 400, 140, { dialogueText: "You step inside." }),

          ],

          edges: [],

          metrics: [],

          characterProfiles: [],

          backgroundScenes: [],

        };

      },

      validate: function (state) {

        if (edgeBetween(state.edges, "intro", "next", null)) {

          return { ok: true, message: "The through-line holds — your opening beat flows into the next." };

        }

        return { ok: false, hint: "Drag from the Next plug on the left beat to the Input plug on the right beat." };

      },

    },

    {

      id: "spawn-from-port",

      title: "Entrance from the wings",

      category: "Blocking & cues",

      order: 2,

      mode: "graph",

      summary: "When the next moment doesn't exist yet, bring it on from the wings.",

      instructions:

        "<p>Actors enter from the wings when the script demands a new presence. So do beats.</p>" +

        "<ol><li>Drag from the highlighted <strong>Next</strong> plug.</li>" +

        "<li>Release on empty canvas — not on another beat.</li>" +

        "<li>Choose <strong>Dialogue</strong> from the <strong>Add &amp; connect</strong> menu.</li></ol>" +

        "<p class=\"learn-tip\">The newcomer should appear already connected to the first beat.</p>",

      setup: function () {

        return {

          entryNodeId: "solo",

          nodes: [beat("solo", 120, 160, { dialogueText: "And then…" })],

          edges: [],

          metrics: [],

          characterProfiles: [],

          backgroundScenes: [],

          highlightPorts: [{ nodeId: "solo", next: true }],

        };

      },

      validate: function (state) {

        var edge = outgoingFrom(state.edges, "solo", null);

        if (!edge) {

          return { ok: false, hint: "Drag from the Next plug into blank space and choose Dialogue from the Add & connect menu." };

        }

        var target = getNode(state, edge.target);

        if (!target || target.id === "solo") {

          return { ok: false, hint: "Spawn a new beat — don't loop back to the same node." };

        }

        if (ScenaStore.shouldAutoAdvance(target)) {

          return { ok: false, hint: "Choose Dialogue from the menu, not Metrics." };

        }

        return { ok: true, message: "A clean entrance — new beat on stage and already in cue." };

      },

    },

    {

      id: "logic-metrics-reconverge",

      title: "Peripeteia & return",

      category: "Subtext & fate",

      order: 3,

      mode: "graph",

      summary: "Three paths diverge through silent Metrics block, then the plot reconverges — Aristotle's reversal in miniature.",

      instructions:

        "<p>A classic device: the audience chooses a path, hidden machinery adjusts fate, then all roads meet again.</p>" +

        "<ol><li>The <strong>Choices</strong> block has <strong>three Choice plugs</strong> — one per option.</li>" +

        "<li>From each Choice plug, drag into blank space and choose <strong>Metrics block</strong> from the <strong>Add &amp; connect</strong> menu (or drag Metrics block from the <strong>Blocks</strong> shelf).</li>" +

        "<li>Select each Metrics block and set its metric: <strong>Trust</strong>, <strong>Gold</strong>, or <strong>Risk</strong>.</li>" +

        "<li>Connect every Metrics block's <strong>Next</strong> plug to the shared beat on the right.</li></ol>" +

        "<p class=\"learn-tip\">Metrics blocks have no dialogue — only the subtext the house never sees.</p>",

      setup: function () {

        var c1 = "ch_a";

        var c2 = "ch_b";

        var c3 = "ch_c";

        return {

          entryNodeId: "fork",

          nodes: [

            beat("fork", 60, 160, {

              dialogueText: "Three paths lie ahead.",

              choices: [

                { id: c1, label: "Trust the guide", choiceText: "Trust the guide" },

                { id: c2, label: "Take the gold", choiceText: "Take the gold" },

                { id: c3, label: "Risk it all", choiceText: "Risk it all" },

              ],

            }),

            beat("merge", 720, 180, { dialogueText: "Either way, the story continues here." }),

          ],

          edges: [],

          metrics: [

            { key: "trust", displayName: "Trust", defaultValue: 0 },

            { key: "gold", displayName: "Gold", defaultValue: 0 },

            { key: "risk", displayName: "Risk", defaultValue: 0 },

          ],

          characterProfiles: [],

          backgroundScenes: [],

          highlightPorts: [{ nodeId: "fork", choiceIds: [c1, c2, c3] }],

        };

      },

      validate: function (state) {

        var fork = getNode(state, "fork");

        if (!fork || !fork.data.choices || fork.data.choices.length < 3) {

          return { ok: false, hint: "Something went wrong with the lesson setup." };

        }

        var expected = [

          { choiceId: fork.data.choices[0].id, metric: "trust", label: "Trust the guide" },

          { choiceId: fork.data.choices[1].id, metric: "gold", label: "Take the gold" },

          { choiceId: fork.data.choices[2].id, metric: "risk", label: "Risk it all" },

        ];

        for (var i = 0; i < expected.length; i++) {

          var spec = expected[i];

          var fromChoice = outgoingFrom(state.edges, "fork", spec.choiceId);

          if (!fromChoice) {

            return { ok: false, hint: "Connect \"" + spec.label + "\" to a Metrics block." };

          }

          var logic = getNode(state, fromChoice.target);

          if (!logic || !ScenaStore.shouldAutoAdvance(logic)) {

            return { ok: false, hint: "The \"" + spec.label + "\" path needs a Metrics block — spawn one from that Choice plug or drag it from the Blocks shelf." };

          }

          var set = logic.data.sets && logic.data.sets[0];

          if (!set || set.metricKey !== spec.metric) {

            return { ok: false, hint: "Select the Metrics block after \"" + spec.label + "\" and set metric to " + spec.metric + "." };

          }

          var toMerge = outgoingFrom(state.edges, logic.id, null);

          if (!toMerge || toMerge.target !== "merge") {

            return { ok: false, hint: "Connect the Metrics block after \"" + spec.label + "\" to the shared beat on the right." };

          }

        }

        return { ok: true, message: "Peripeteia mastered — paths diverge in subtext, then reconverge on stage." };

      },

    },

    {

      id: "metric-add-subtract",

      title: "Fate's ledger",

      category: "Subtext & fate",

      order: 4,

      mode: "graph",

      summary: "Add and subtract from a hidden score using signed amounts — no separate operation control.",

      instructions:

        "<p>Metrics blocks change metrics silently. The inspector has one <strong>Amount</strong> field — the sign does the work:</p>" +

        "<ul><li><strong>Positive</strong> (e.g. <em>5</em>) adds to the metric</li>" +

        "<li><strong>Negative</strong> (e.g. <em>-2</em>) subtracts from it</li></ul>" +

        "<p>Two Metrics blocks sit between the dialogue beats. Wire the full chain, then set each ledger entry.</p>" +

        "<ol><li>Connect: left beat → first Metrics block → second Metrics block → right beat.</li>" +

        "<li>First Metrics block — metric <strong>Trust</strong>, amount <strong>5</strong> (adds).</li>" +

        "<li>Second Metrics block — metric <strong>Risk</strong>, amount <strong>-2</strong> (subtracts).</li></ol>" +

        "<p class=\"learn-tip\">Each Metrics block shows its signed amount on the graph — <em>Trust +5</em> and <em>Risk -2</em>.</p>",

      setup: function () {

        return {

          entryNodeId: "before",

          nodes: [

            beat("before", 60, 160, { dialogueText: "They watch you carefully." }),

            beat("mech_add", 360, 160, { autoAdvance: true, sets: [{ metricKey: "", op: "add", value: 1 }] }),

            beat("mech_sub", 660, 160, { autoAdvance: true, sets: [{ metricKey: "", op: "add", value: 1 }] }),

            beat("after", 960, 160, { dialogueText: "Something shifts between you." }),

          ],

          edges: [],

          metrics: [
            { key: "trust", displayName: "Trust", defaultValue: 0 },
            { key: "risk", displayName: "Risk", defaultValue: 0 },
          ],

          characterProfiles: [],

          backgroundScenes: [],

        };

      },

      validate: function (state) {

        if (!edgeBetween(state.edges, "before", "mech_add", null)) {

          return { ok: false, hint: "Connect the left beat to the first Metrics block." };

        }

        if (!edgeBetween(state.edges, "mech_add", "mech_sub", null)) {

          return { ok: false, hint: "Connect the first Metrics block to the second." };

        }

        if (!edgeBetween(state.edges, "mech_sub", "after", null)) {

          return { ok: false, hint: "Connect the second Metrics block to the right beat." };

        }

        var addNode = getNode(state, "mech_add");

        var subNode = getNode(state, "mech_sub");

        var addSet = addNode && addNode.data.sets && addNode.data.sets[0];

        var subSet = subNode && subNode.data.sets && subNode.data.sets[0];

        if (!addSet || addSet.metricKey !== "trust") {

          return { ok: false, hint: "Select the first Metrics block and set metric to Trust." };

        }

        if (parseFloat(addSet.value) !== 5) {

          return { ok: false, hint: "First Metrics block: enter amount 5 (positive adds to Trust)." };

        }

        if (!subSet || subSet.metricKey !== "risk") {

          return { ok: false, hint: "Select the second Metrics block and set metric to Risk." };

        }

        if (parseFloat(subSet.value) !== -2) {

          return { ok: false, hint: "Second Metrics block: metric Risk, amount -2 (negative subtracts)." };

        }

        return { ok: true, message: "Two ledgers touched — Trust +5, Risk -2, and the house never saw the math." };

      },

    },

    {

      id: "setup-character",

      title: "Casting call",

      category: "Wardrobe & scenery",

      order: 5,

      mode: "resources",

      summary: "Add a player to the dramatis personae — name, color, and pose.",

      instructions:

        "<p>Before the curtain rises, every player is cast and costumed.</p>" +

        "<ol><li>Click a <strong>Arleco mascot</strong> below — each one is a theater role with a transparent neutral sprite.</li>" +

        "<li>Select your character in the list — set <strong>Name</strong> and <strong>Color</strong> if you like.</li>" +

        "<li>Confirm a <strong>neutral</strong> sprite appears in the detail panel (mascots add one automatically).</li></ol>" +

        "<p class=\"learn-tip\">You can also upload your own PNG via <strong>+ Add sprite</strong> — same as the studio.</p>",

      setup: function () {

        return {

          nodes: [],

          edges: [],

          metrics: [],

          characterProfiles: [],

          backgroundScenes: [],

        };

      },

      validate: function (state) {

        var profiles = state.characterProfiles || [];

        if (!profiles.length) {

          return { ok: false, hint: "Call your first player — click + Create in the Characters panel." };

        }

        var p = profiles[0];

        if (!p.name || !p.name.trim()) {

          return { ok: false, hint: "Give your player a name for the program." };

        }

        if (!p.sprites || !p.sprites.length) {

          return { ok: false, hint: "Add at least one sprite — use + Add sprite in the detail panel." };

        }

        return { ok: true, message: "Casting complete — assign them on beats when you block your scenes." };

      },

    },

    {

      id: "setup-stage",

      title: "Painted scene",

      category: "Wardrobe & scenery",

      order: 6,

      mode: "resources",

      summary: "Build a layered backdrop — the painted flats behind your dialogue.",

      instructions:

        "<p>From the Globe's heavens to modern scenic design, stories need a world behind the words.</p>" +

        "<ol><li>Click <strong>Empty theater</strong> below to add three simple flats, <em>or</em> use <strong>+ Create</strong> and upload your own.</li>" +

        "<li>Select your stage and confirm <strong>Background</strong>, <strong>Middle</strong>, and <strong>Foreground</strong> layers.</li></ol>" +

        "<p class=\"learn-tip\">Same Stages panel as the studio — list on the left, layer uploads on the right.</p>",

      setup: function () {

        return {

          nodes: [],

          edges: [],

          metrics: [],

          characterProfiles: [],

          backgroundScenes: [],

        };

      },

      validate: function (state) {

        var scenes = state.backgroundScenes || [];

        if (!scenes.length) {

          return { ok: false, hint: "Create a stage — click + Create in the Stages panel." };

        }

        var s = scenes[0];

        if (!s.name || !s.name.trim()) {

          return { ok: false, hint: "Name your scene for the playbill." };

        }

        var layers = s.layers || {};

        if (!layers.bg || !layers.mg || !layers.fg) {

          return { ok: false, hint: "Set all three layers — background, middle, and foreground." };

        }

        return { ok: true, message: "Scenery set — assign it on your opening beat where the story begins." };

      },

    },

    {

      id: "inherit-visuals",

      title: "Curtain rise",

      category: "Blocking & cues",

      order: 7,

      mode: "graph",

      learnPreviewPlay: true,

      summary: "Set stage and player on the opening beat — inheritance and override.",

      instructions:

        "<p>These four beats have dialogue but no visuals yet. Celeste and the empty theater are in your resources — you block them on the script.</p>" +

        "<ol><li>Select the <strong>opening beat</strong> (leftmost). Under <strong>Visual</strong>, set <strong>Stage</strong> to <em>Empty theater</em>, <strong>Character</strong> to <em>Celeste</em>, and pose <em>neutral</em>.</li>" +

        "<li>Select beat 2 — notice it <strong>inherits</strong> stage and player (no Override boxes).</li>" +

        "<li>On beat 3, check <strong>Override character</strong>, keep Celeste, and set <strong>Stage slot</strong> to <em>left</em>.</li>" +

        "<li>Press <strong>▶ Play</strong>, click through all four beats, and move your mouse over the preview — the three flats drift subtly with your cursor.</li></ol>" +

        "<p class=\"learn-tip\">Same inheritance rules as the studio: opening beat sets the default; later beats inherit unless you override.</p>",

      setup: function () {

        return {

          entryNodeId: "beat1",

          nodes: [

            beat("beat1", 40, 120, { dialogueText: "The house lights dim. Footsteps echo in an empty theater." }),

            beat("beat2", 340, 120, { dialogueText: "Every story needs a stage. Set yours on the opening beat." }),

            beat("beat3", 640, 120, { dialogueText: "Now override me — same player, new blocking." }),

            beat("beat4", 940, 120, { dialogueText: "The flats hold. Curtain down.", isEnd: true }),

          ],

          edges: [

            { id: "e1", source: "beat1", target: "beat2" },

            { id: "e2", source: "beat2", target: "beat3" },

            { id: "e3", source: "beat3", target: "beat4" },

          ],

          metrics: [],

          characterProfiles: [lessonCelesteProfile()],

          backgroundScenes: [lessonTheaterStage()],

        };

      },

      validate: function (state) {

        var beat1 = getNode(state, "beat1");

        var beat2 = getNode(state, "beat2");

        var beat3 = getNode(state, "beat3");



        if (!beat1) {

          return { ok: false, hint: "Select the opening beat on the left." };

        }



        if (!beat1.data.backgroundSceneId || beat1.data.backgroundSceneId !== LESSON_STAGE_ID) {

          return { ok: false, hint: "On the opening beat, set Stage to Empty theater." };

        }

        if (!beat1.data.characterProfileId || beat1.data.characterProfileId !== LESSON_CELESTE_ID) {

          return { ok: false, hint: "On the opening beat, set Character to Celeste." };

        }

        if (!beat1.data.spriteId || beat1.data.spriteId !== LESSON_SPRITE_ID) {

          return { ok: false, hint: "On the opening beat, choose Celeste's neutral pose." };

        }



        if (!beat2) {

          return { ok: false, hint: "Connect all four beats — the through-line should already be set." };

        }

        if (beat2.data.overrideStage || beat2.data.overrideCharacter) {

          return { ok: false, hint: "Beat 2 should inherit — leave Override stage and Override character unchecked." };

        }

        var inherited = ScenaStore.resolvePresentation(state, "beat2");

        if (inherited.backgroundSceneId !== LESSON_STAGE_ID || inherited.characterProfileId !== LESSON_CELESTE_ID) {

          return { ok: false, hint: "Beat 2 should inherit the same stage and Celeste from the opening beat." };

        }



        if (!beat3) {

          return { ok: false, hint: "Select beat 3 to practice an override." };

        }

        if (!beat3.data.overrideCharacter) {

          return { ok: false, hint: "On beat 3, check Override character to break inheritance." };

        }

        if (beat3.data.characterProfileId !== LESSON_CELESTE_ID) {

          return { ok: false, hint: "On beat 3, keep Celeste — only her blocking changes." };

        }

        if (beat3.data.slot !== "left") {

          return { ok: false, hint: "On beat 3 with Override character, set Stage slot to left." };

        }



        return { ok: true, message: "Blocking mastered — stage and player flow downstream until you override." };

      },

    },

    {

      id: "publish-episode",

      title: "Opening night",

      category: "The house",

      order: 8,

      mode: "graph",

      learnEpisodes: true,

      summary: "Draw a chapter line — everything left is Episode 1, even with two endings.",

      instructions:

        "<p>This scene branches to <strong>two endings</strong>, then keeps going with an epilogue on each path. One episode can contain all of it.</p>" +

        "<ol><li>Click <strong>+ Episode boundary</strong> and place a vertical line <em>to the right</em> of both epilogue beats.</li>" +

        "<li>When the line lands, set the <strong>episode title</strong>, blurb, and thumbnail in the dialog.</li>" +

        "<li>Notice the <strong>shaded region</strong> left of the line — that is Episode 1 territory on the graph.</li>" +

        "<li>Click the shaded background anytime to reopen the episode panel — playtest with <strong>▶ Play episode</strong>, or click <strong>Publish Ch. 1</strong> in the toolbar when you are ready for opening night.</li></ol>" +

        "<p class=\"learn-tip\">Draft chapters are only for you until you publish. You can play either way from the episode panel.</p>",

      setup: function () {

        var cLight = "ch_light";

        var cWings = "ch_wings";

        return {

          entryNodeId: "open",

          nodes: [

            beat("open", 40, 180, {

              dialogueText: "Curtain up. The house waits for your choice.",

              backgroundSceneId: LESSON_STAGE_ID,

              characterProfileId: LESSON_CELESTE_ID,

              spriteId: LESSON_SPRITE_ID,

            }),

            beat("fork", 340, 180, {

              dialogueText: "Two paths. Two endings. One episode.",

              choices: [

                { id: cLight, label: "Step into the light", choiceText: "Step into the light" },

                { id: cWings, label: "Stay in the wings", choiceText: "Stay in the wings" },

              ],

            }),

            beat("path_light", 640, 60, { dialogueText: "You cross the lit stage." }),

            beat("path_wings", 640, 300, { dialogueText: "You watch from the shadow." }),

            beat("end_light", 940, 60, { dialogueText: "Ending: Applause rises from the dark." }),

            beat("end_wings", 940, 300, { dialogueText: "Ending: The curtain falls in silence." }),

            beat("tag_light", 1240, 60, { dialogueText: "Epilogue: Backstage, the crew exhales." }),

            beat("tag_wings", 1240, 300, { dialogueText: "Epilogue: A note waits on the prop table." }),

          ],

          edges: [

            { id: "e_open", source: "open", target: "fork" },

            { id: "e_light", source: "fork", target: "path_light", choiceId: cLight },

            { id: "e_wings", source: "fork", target: "path_wings", choiceId: cWings },

            { id: "e_pl", source: "path_light", target: "end_light" },

            { id: "e_pw", source: "path_wings", target: "end_wings" },

            { id: "e_el", source: "end_light", target: "tag_light" },

            { id: "e_ew", source: "end_wings", target: "tag_wings" },

          ],

          metrics: [],

          characterProfiles: [lessonCelesteProfile()],

          backgroundScenes: [lessonTheaterStage()],

          episodes: [{

            id: LESSON_EPISODE_ID,

            number: 1,

            title: "",

            shortDescription: "",

            thumbnailDataUrl: "",

            boundaryX: null,

            isLive: false,

            publishedAt: null,

          }],

        };

      },

      validate: function (state) {

        var ep = (state.episodes || []).find(function (e) { return e.id === LESSON_EPISODE_ID; });

        if (!ep || typeof ep.boundaryX !== "number" || isNaN(ep.boundaryX)) {

          return { ok: false, hint: "Click + Episode boundary and place a line to the right of both epilogue beats." };

        }

        var tagLight = getNode(state, "tag_light");

        var tagWings = getNode(state, "tag_wings");

        var nodeWidth = 220;

        if (!tagLight || !tagWings) {

          return { ok: false, hint: "Keep the pre-wired scene intact — both epilogue beats should be on the graph." };

        }

        if (ScenaStore.nodeCenterX(tagLight, nodeWidth) >= ep.boundaryX ||

            ScenaStore.nodeCenterX(tagWings, nodeWidth) >= ep.boundaryX) {

          return { ok: false, hint: "Move the chapter line further right — it must include both epilogues inside Episode 1." };

        }

        if (!ep.title || !ep.title.trim()) {

          return { ok: false, hint: "Set an episode title in the dialog (click the shaded region to reopen it)." };

        }

        return { ok: true, message: "Episode 1 is bounded — use Publish Ch. 1 in the toolbar when you are ready for opening night." };

      },

    },

    {

      id: "sound-design",

      title: "Orchestration",

      category: "Production",

      order: 9,

      mode: "graph",

      learnPreviewPlay: true,

      learnSoundSettings: true,

      summary: "Layer inherited BGM, voice lines, and sound effects on your beats.",

      instructions:

        "<p>A scene needs ambience, recorded lines, and one-shot cues.</p>" +

        "<ol><li>Open the <strong>Audio library</strong> tab on the right — Arleco defaults are already there. Use <strong>+ Upload</strong> to add your own clips anytime.</li>" +

        "<li>Select the opening beat <strong>Curtain</strong>. Under <strong>Audio</strong>, set <strong>Background music</strong> to <em>Theater hum</em> and <strong>Sound effect</strong> to <em>Curtain rustle</em>.</li>" +

        "<li>Select the <strong>fork</strong> beat and assign <strong>Sample narration</strong> as the <strong>Voice line</strong>.</li>" +

        "<li>Press <strong>▶ Play</strong> — hear the hum loop, rustle on enter, narration on the fork, and a tap when you choose.</li></ol>" +

        "<p class=\"learn-tip\">Music inherits like stage — set it on the opening beat, override later if needed. Button clicks use the built-in tap unless you change them under Series settings.</p>",

      setup: function () {

        return {

          entryNodeId: "curtain",

          nodes: [

            beat("curtain", 60, 180, {

              dialogueText: "The houselights dim. The audience holds its breath.",

              backgroundSceneId: LESSON_STAGE_ID,

              characterProfileId: LESSON_CELESTE_ID,

              spriteId: LESSON_SPRITE_ID,

            }),

            beat("fork", 360, 180, {

              dialogueText: "Curtain up — or one more beat of silence?",

              choices: [

                { id: "c_up", label: "Raise the curtain", choiceText: "Raise the curtain" },

                { id: "c_hold", label: "Hold for tension", choiceText: "Hold for tension" },

              ],

            }),

            beat("tag_up", 660, 80, { dialogueText: "The curtain rises on a full house." }),

            beat("tag_hold", 660, 280, { dialogueText: "Silence stretches — then applause." }),

          ],

          edges: [

            { id: "e1", source: "curtain", target: "fork", choiceId: null },

            { id: "e2", source: "fork", target: "tag_up", choiceId: "c_up" },

            { id: "e3", source: "fork", target: "tag_hold", choiceId: "c_hold" },

          ],

          metrics: [],

          characterProfiles: [lessonCelesteProfile()],

          backgroundScenes: [lessonTheaterStage()],

        };

      },

      validate: function (state) {

        ScenaStore.ensureDefaultAudio(state);

        var curtain = getNode(state, "curtain");

        if (!curtain || curtain.data.bgmAssetId !== "def_bgm_hum") {

          return { ok: false, hint: "Select the Curtain beat and set Background music to Theater hum." };

        }

        if (!curtain || curtain.data.sfxAssetId !== "def_sfx_curtain") {

          return { ok: false, hint: "Select the Curtain beat and set Sound effect to Curtain rustle." };

        }

        var fork = getNode(state, "fork");

        if (!fork || fork.data.voiceAssetId !== "def_voice_narration") {

          return { ok: false, hint: "Select the fork beat and set Voice line to Sample narration." };

        }

        return { ok: true, message: "Orchestration complete — inherited music, voice, and cues are wired." };

      },

    },

    {

      id: "route-gate-if-else",

      title: "The fork remembered",

      category: "Blocking & cues",

      order: 10,

      mode: "graph",

      summary: "Use a Flow gate when paths merge again — branch on a choice from far back in the story.",

      instructions:

        "<p>Sometimes chapter one splits apart, then everyone meets at the same beat. Later you need different dialogue depending on an <em>old</em> choice — that is a <strong>Flow gate</strong> (if / else routing).</p>" +

        "<ol><li>Drag <strong>Flow gate</strong> from the <strong>Blocks</strong> shelf (under Routing).</li>" +

        "<li>Connect <strong>Months later…</strong> into the flow gate's <strong>Next</strong> plug.</li>" +

        "<li>Select the flow gate. Under <strong>Flow routes</strong>, add a check for <strong>Sit with Ren</strong> and connect that output to <strong>Ren's memory</strong>.</li>" +

        "<li>Add an <strong>Else if</strong> route for <strong>Sit with Sora</strong> → connect to <strong>Sora's memory</strong>.</li>" +

        "<li>Connect the <strong>Else</strong> plug to <strong>Neutral memory</strong> (readers who match neither).</li></ol>" +

        "<p class=\"learn-tip\">Flow gates are silent — no dialogue on the node. They pick which <em>Next</em> path to follow based on stacked checks.</p>",

      setup: function () {

        var cRen = "c_ren";

        var cSora = "c_sora";

        return {

          entryNodeId: "open",

          nodes: [

            beat("open", 40, 200, { dialogueText: "Rain on the café windows. One table left." }),

            beat("fork", 300, 200, {

              dialogueText: "Who do you sit with?",

              choices: [

                { id: cRen, label: "Sit with Ren", choiceText: "Sit with Ren" },

                { id: cSora, label: "Sit with Sora", choiceText: "Sit with Sora" },

              ],

            }),

            beat("path_ren", 560, 40, { dialogueText: "Ren talks about old maps." }),

            beat("path_sora", 560, 360, { dialogueText: "Sora steals your umbrella." }),

            beat("merge", 820, 200, { dialogueText: "Months later, you return to the same street." }),

            beat("flavor_ren", 1280, 40, { dialogueText: "Ren's memory: the window seat still feels like yours." }),

            beat("flavor_sora", 1280, 360, { dialogueText: "Sora's memory: two cups, still warm." }),

            beat("flavor_neutral", 1280, 200, { dialogueText: "You remember the rain more than the company." }),

          ],

          edges: [

            { id: "e1", source: "open", target: "fork" },

            { id: "e2", source: "fork", target: "path_ren", choiceId: cRen },

            { id: "e3", source: "fork", target: "path_sora", choiceId: cSora },

            { id: "e4", source: "path_ren", target: "merge" },

            { id: "e5", source: "path_sora", target: "merge" },

          ],

          metrics: [],

          characterProfiles: [],

          backgroundScenes: [],

          highlightPorts: [{ nodeId: "merge", choiceIds: [null] }],

        };

      },

      validate: function (state) {

        var fork = getNode(state, "fork");

        if (!fork || !fork.data.choices || fork.data.choices.length < 2) {

          return { ok: false, hint: "Something went wrong with the lesson setup." };

        }

        var cRen = fork.data.choices[0].id;

        var cSora = fork.data.choices[1].id;

        var router = findChoiceRouteGateAfter(state, "merge");

        if (!router) {

          return { ok: false, hint: "Connect Months later… to a Flow gate (Routing shelf)." };

        }

        var rules = router.data.routeRules || [];

        var renRule = rules.find(function (r) {
          var checks = ScenaStore.normalizeRouteChecks(r);
          return checks.some(function (c) {
            return c.type === "choice" && (c.choiceIds || []).indexOf(cRen) >= 0;
          }) || (r.choiceIds || []).indexOf(cRen) >= 0;
        });

        var soraRule = rules.find(function (r) {
          var checks = ScenaStore.normalizeRouteChecks(r);
          return checks.some(function (c) {
            return c.type === "choice" && (c.choiceIds || []).indexOf(cSora) >= 0;
          }) || (r.choiceIds || []).indexOf(cSora) >= 0;
        });

        if (!renRule) {

          return { ok: false, hint: "Add a flow gate route with a check for Sit with Ren." };

        }

        if (!soraRule) {

          return { ok: false, hint: "Add an Else if route with a check for Sit with Sora." };

        }

        if (!outgoingFrom(state.edges, router.id, renRule.id)) {

          return { ok: false, hint: "Connect the Ren rule output to Ren's memory." };

        }

        if (!outgoingFrom(state.edges, router.id, soraRule.id)) {

          return { ok: false, hint: "Connect the Sora rule output to Sora's memory." };

        }

        if (!outgoingFrom(state.edges, router.id, ROUTE_ELSE_ID)) {

          return { ok: false, hint: "Connect the Else plug to Neutral memory." };

        }

        return { ok: true, message: "Flow gate mastered — distant choices steer the path without replaying old scenes." };

      },

    },

    {

      id: "chapter-memory-routes",

      title: "Two chapter openings",

      category: "The house",

      order: 11,

      mode: "graph",

      learnEpisodes: true,

      summary: "Split a whole chapter by prior choice — the Café at Sunset pattern with cross-chapter wires.",

      instructions:

        "<p>When chapter two should be <em>completely different</em> depending on chapter one, wire each chapter-one ending directly into its own chapter-two opening — like <strong>Café at Sunset</strong>.</p>" +

        "<ol><li>Notice the shaded regions — chapter one left, chapter two right.</li>" +

        "<li>Select <strong>Ren's evening</strong>. It shows a <strong>FINIS</strong> badge because it is marked as a story ending — that hides the outgoing <strong>Next</strong> plug. Uncheck <strong>Story ending beat</strong> in the inspector so the Next plug comes back.</li>" +

        "<li>Do the same for <strong>Sora's evening</strong> — uncheck <strong>Story ending beat</strong> there too.</li>" +

        "<li>Drag a line from <strong>Ren's evening</strong> to <strong>Ren's chapter two</strong>.</li>" +

        "<li>Drag a line from <strong>Sora's evening</strong> to <strong>Sora's chapter two</strong>.</li></ol>" +

        "<p class=\"learn-tip\">Each chapter-two opening is a plain dialogue beat wired from the matching chapter-one fork — no route gate needed. The graph connection carries the route. Uncheck <strong>Story ending beat</strong> on chapter-one finales if another chapter continues from them.</p>",

      setup: function () {

        var cRen = "cafe_ren";

        var cSora = "cafe_sora";

        return {

          entryNodeId: "cafe_open",

          nodes: [

            beat("cafe_open", 40, 200, { dialogueText: "The café glows at sunset." }),

            beat("cafe_fork", 300, 200, {

              dialogueText: "Who joins you?",

              choices: [

                { id: cRen, label: "Sit with Ren", choiceText: "Sit with Ren" },

                { id: cSora, label: "Sit with Sora", choiceText: "Sit with Sora" },

              ],

            }),

            beat("cafe_ren_end", 560, 40, { dialogueText: "Ren's evening — quiet and close.", isEnd: true }),

            beat("cafe_sora_end", 560, 360, { dialogueText: "Sora's evening — loud and bright.", isEnd: true }),

            beat("ep2_ren", 900, 40, { dialogueText: "Chapter two: Ren saved your window table." }),

            beat("ep2_sora", 900, 360, { dialogueText: "Chapter two: Sora ordered for both of you." }),

            beat("ep2_shared", 1180, 200, { dialogueText: "Both routes meet again at closing time." }),

          ],

          edges: [

            { id: "e1", source: "cafe_open", target: "cafe_fork" },

            { id: "e2", source: "cafe_fork", target: "cafe_ren_end", choiceId: cRen },

            { id: "e3", source: "cafe_fork", target: "cafe_sora_end", choiceId: cSora },

          ],

          episodes: [

            { id: "ep_c1", number: 1, title: "Chapter 1", boundaryX: 820, isLive: false },

            { id: "ep_c2", number: 2, title: "Chapter 2", boundaryX: 1420,

              entryNodeIds: ["ep2_ren", "ep2_sora"], isLive: false },

          ],

          metrics: [],

          characterProfiles: [],

          backgroundScenes: [],

        };

      },

      validate: function (state) {

        var fork = getNode(state, "cafe_fork");

        if (!fork || !fork.data.choices || fork.data.choices.length < 2) {

          return { ok: false, hint: "Something went wrong with the lesson setup." };

        }

        var renEnd = getNode(state, "cafe_ren_end");

        var soraEnd = getNode(state, "cafe_sora_end");

        if (renEnd && renEnd.data.isEnd) {

          return { ok: false, hint: "Select Ren's evening and uncheck Story ending beat — FINIS hides the Next plug you need to link chapter two." };

        }

        if (soraEnd && soraEnd.data.isEnd) {

          return { ok: false, hint: "Select Sora's evening and uncheck Story ending beat so its Next plug appears." };

        }

        if (!edgeBetween(state.edges, "cafe_ren_end", "ep2_ren", null)) {

          return { ok: false, hint: "Connect Ren's evening to Ren's chapter two." };

        }

        if (!edgeBetween(state.edges, "cafe_sora_end", "ep2_sora", null)) {

          return { ok: false, hint: "Connect Sora's evening to Sora's chapter two." };

        }

        return { ok: true, message: "Two chapter openings wired — each playthrough gets its own version of chapter two." };

      },

    },

    {

      id: "metric-dialogue-branches",

      title: "Dialogue by the numbers",

      category: "Subtext & fate",

      order: 12,

      mode: "graph",

      learnPreviewPlay: true,

      summary: "Branch to different dialogue beats when a metric crosses a threshold.",

      instructions:

        "<p>When the next beat should change based on <strong>Trust</strong> or another metric, use a <strong>Flow gate</strong>.</p>" +

        "<ol><li>The chain is wired through two Metrics blocks to a <strong>Flow gate</strong>.</li>" +

        "<li>Select the gate. Under <strong>Flow routes</strong>, add a check: metric <strong>Trust</strong>, <strong>≥ at least</strong>, value <strong>5</strong>.</li>" +

        "<li>Wire that branch to <strong>Warm greeting</strong> (They light up when they see you.).</li>" +

        "<li>Wire the gate's <strong>Else</strong> plug to <strong>Cold greeting</strong>.</li>" +

        "<li>Press <strong>▶ Play</strong> — after the Trust boosts you should see the warm line.</li></ol>" +

        "<p class=\"learn-tip\">Metrics blocks change metrics silently. Flow gates pick which path to follow when stacked checks pass.</p>",

      setup: function () {

        return {

          entryNodeId: "open",

          nodes: [

            beat("open", 40, 180, { dialogueText: "A stranger watches from the doorway." }),

            beat("trust_a", 280, 180, {

              beatKind: "logic",

              autoAdvance: true,

              sets: [{ metricKey: "trust", op: "add", value: 3 }],

            }),

            beat("trust_b", 480, 180, {

              beatKind: "logic",

              autoAdvance: true,

              sets: [{ metricKey: "trust", op: "add", value: 3 }],

            }),

            beat("metric_router", 680, 180, {

              beatKind: "flow-gate",

              autoAdvance: true,

              isRouteGate: true,

              routeRules: [],

            }),

            beat("greeting_warm", 920, 80, { dialogueText: "They light up when they see you." }),

            beat("greeting_cold", 920, 280, { dialogueText: "They keep their distance. Trust is still low." }),

          ],

          edges: [

            { id: "e1", source: "open", target: "trust_a" },

            { id: "e2", source: "trust_a", target: "trust_b" },

            { id: "e3", source: "trust_b", target: "metric_router" },

            { id: "e4", source: "metric_router", target: "greeting_cold", choiceId: ROUTE_ELSE_ID },

          ],

          metrics: [{ key: "trust", displayName: "Trust", defaultValue: 0 }],

          characterProfiles: [],

          backgroundScenes: [],

        };

      },

      validate: function (state) {

        var router = findMetricRouteGateAfter(state, "trust_b");

        if (!router) {

          return { ok: false, hint: "Connect the second Metrics block to a Flow gate." };

        }

        var rules = router.data.routeRules || [];

        var warmRule = rules.find(function (r) {
          return ScenaStore.normalizeRouteChecks(r).some(function (c) {
            return c.type === "metric" && c.metricKey === "trust" && (c.op || "gte") === "gte" && parseFloat(c.value) === 5;
          });
        });

        if (!warmRule) {

          return { ok: false, hint: "Add a flow gate check: Trust ≥ 5." };

        }

        var warmEdge = outgoingFrom(state.edges, router.id, warmRule.id);

        if (!warmEdge || warmEdge.target !== "greeting_warm") {

          return { ok: false, hint: "Wire the Trust ≥ 5 branch to Warm greeting." };

        }

        var elseEdge = outgoingFrom(state.edges, router.id, ROUTE_ELSE_ID);

        if (!elseEdge || elseEdge.target !== "greeting_cold") {

          return { ok: false, hint: "Wire the Else plug to Cold greeting." };

        }

        return { ok: true, message: "Flow gate set — warm line when Trust earns it, cold on Else." };

      },

    },

    {

      id: "key-items-flow",

      title: "Keys in the flow",

      category: "Subtext & fate",

      order: 13,

      mode: "graph",

      learnPreviewPlay: true,

      learnKeyItemsPanel: true,

      summary: "Create a key item, grant it after a choice, branch with a Flow gate, and hide a choice until the reader has the item.",

      instructions:

        "<p>Inventory items unlock new paths — like picking up a key and finding a hidden door later.</p>" +

        "<ol><li>Open the <strong>Key items</strong> tab and click <strong>+ Create</strong> to add a <strong>Brass key</strong> (unique — readers either have it or not).</li>" +

        "<li>Wire <strong>Take the key</strong> to a <strong>Key item</strong> block set to <strong>Give</strong>, then into <strong>The gate…</strong>.</li>" +

        "<li>Connect <strong>The gate…</strong> to the <strong>Flow gate</strong>. On its <strong>If</strong> route, add <strong>Has item…</strong> brass key and wire that plug to <strong>Gate opens</strong>.</li>" +

        "<li>Wire the Flow gate <strong>Else</strong> plug to <strong>Gate stays shut</strong>.</li>" +

        "<li>On <strong>Secret knock</strong>, set <strong>Try the secret knock</strong> to require <strong>Has item</strong> brass key.</li>" +

        "<li>Press <strong>▶ Play</strong> — take the key path and try the secret knock.</li></ol>" +

        "<p class=\"learn-tip\">Key items are one-of-a-kind (mansion keys, badges). Stackable supplies like potions or lockpicks belong in <strong>Metrics</strong> — change them with Metrics blocks.</p>",

      setup: function () {

        var KEY_ID = "ki_brass_key";

        var cTake = "c_take_key";

        var cSkip = "c_skip_key";

        return {

          entryNodeId: "open",

          assets: [],

          nodes: [

            beat("open", 40, 200, { dialogueText: "A desk drawer sticks half-open in the hallway." }),

            beat("fork", 280, 200, {

              dialogueText: "Do you search the desk?",

              choices: [

                { id: cTake, label: "Take the key", choiceText: "Take the key" },

                { id: cSkip, label: "Skip the desk", choiceText: "Skip the desk" },

              ],

            }),

            keyItemBeat("grant_key", 520, 80, null, 1),

            beat("skip_path", 520, 320, { dialogueText: "You leave the drawer alone." }),

            beat("gate_beat", 760, 200, { dialogueText: "The gate… a brass lock waits on the other side." }),

            routeGate("flow_gate", 980, 200, [{
              id: "route_has_key",
              label: "Has brass key",
              matchMode: "and",
              checks: [],
            }]),

            beat("gate_open", 1220, 80, { dialogueText: "Gate opens — the key still fits." }),

            beat("gate_shut", 1220, 320, { dialogueText: "Gate stays shut. No key, no entry." }),

            beat("secret_fork", 520, 480, {

              dialogueText: "Secret knock",

              choices: [

                { id: "c_knock", label: "Try the secret knock", choiceText: "Try the secret knock" },

                { id: "c_pass", label: "Keep walking", choiceText: "Keep walking" },

              ],

            }),

            beat("knock_ok", 760, 480, { dialogueText: "A panel slides aside." }),

          ],

          edges: [

            { id: "e1", source: "open", target: "fork" },

            { id: "e2", source: "fork", target: "skip_path", choiceId: cSkip },

            { id: "e3", source: "skip_path", target: "gate_beat" },

          ],

          metrics: [],

          characterProfiles: [],

          backgroundScenes: [],

          highlightPorts: [

            { nodeId: "fork", choiceIds: [cTake] },

            { nodeId: "gate_beat", choiceIds: [null] },

            { nodeId: "flow_gate", choiceIds: ["route_has_key", ROUTE_ELSE_ID] },

          ],

        };

      },

      validate: function (state) {

        var keyAssets = (state.assets || []).filter(function (a) {
          return a && a.kind === (window.ScenaKeyItem ? ScenaKeyItem.KIND : "keyItem");
        });

        if (!keyAssets.length) {

          return { ok: false, hint: "Create a key item in the Key items tab (e.g. Brass key)." };

        }

        var keyId = keyAssets[0].id;

        var fork = getNode(state, "fork");

        if (!fork || !fork.data.choices || !fork.data.choices.length) {

          return { ok: false, hint: "Lesson setup error — fork beat missing." };

        }

        var cTake = fork.data.choices[0].id;

        var grantNode = null;

        (state.nodes || []).forEach(function (n) {
          if (ScenaStore.getBeatKind(n) === "key-item" && n.data.grantsKeyItemId === keyId) grantNode = n;
        });

        if (!grantNode) {

          return { ok: false, hint: "Add a Key item block that gives the brass key." };

        }

        keyId = grantNode.data.grantsKeyItemId || keyId;

        if (!edgeBetween(state.edges, "fork", grantNode.id, cTake)) {

          return { ok: false, hint: "Wire Take the key to the Key item block." };

        }

        if (!edgeBetween(state.edges, grantNode.id, "gate_beat", null) &&
            !outgoingFrom(state.edges, grantNode.id, null)) {

          return { ok: false, hint: "Connect the Key item block into The gate… beat." };

        }

        var router = findFlowGateAfter(state, "gate_beat");

        if (!router) {

          return { ok: false, hint: "Connect The gate… to a Flow gate." };

        }

        var hasKeyRule = findKeyItemRouteRule(router, keyId, "has");

        if (!hasKeyRule) {

          return { ok: false, hint: "Add a Flow gate route with a Has item… check for your key." };

        }

        var keyRouteEdge = routeEdgeToTarget(state.edges, router.id, "gate_open", hasKeyRule.id) ||
          findRouteEdgeToTarget(state, router, "gate_open", function (rule) {
            return ScenaStore.normalizeRouteChecks(rule).some(function (c) {
              return c.type === "keyItem" && c.assetId === keyId && (c.mode || "has") === "has";
            });
          });

        if (!keyRouteEdge) {

          return { ok: false, hint: "Drag from the If route plug (Has item check) on the Flow gate to Gate opens." };

        }

        var elseEdge = routeEdgeToTarget(state.edges, router.id, "gate_shut", ROUTE_ELSE_ID) ||
          outgoingFrom(state.edges, router.id, ROUTE_ELSE_ID);

        if (!elseEdge || elseEdge.target !== "gate_shut") {

          return { ok: false, hint: "Connect the Else plug to Gate stays shut." };

        }

        var secretFork = getNode(state, "secret_fork");

        var gatedChoice = secretFork && (secretFork.data.choices || []).find(function (c) {
          return c.requiresKeyItem && c.requiresKeyItem.assetId === keyId &&
            (c.requiresKeyItem.mode || "has") === "has";
        });

        if (!gatedChoice) {

          return { ok: false, hint: "On Secret knock, gate Try the secret knock with Requires item (has)." };

        }

        return { ok: true, message: "Key items wired — grant after choice, branch on inventory, and hide gated options." };

      },

    },

    {

      id: "choices-simple",

      title: "Fork in the road",

      category: "Blocking & cues",

      order: 14,

      mode: "graph",

      learnPreviewPlay: true,

      summary: "Wire a Choices block with plain options — every path visible, no hidden requirements.",

      instructions:

        "<p>Not every fork needs secrets. Start with a simple branch every reader can see.</p>" +

        "<ol><li>Select the <strong>Which way?</strong> Choices block.</li>" +

        "<li>Wire <strong>Take the stairs</strong> to <strong>You climb.</strong></li>" +

        "<li>Wire <strong>Take the elevator</strong> to <strong>The elevator hums.</strong></li>" +

        "<li>Leave <strong>Show only when</strong> toggles off on every option — no gates yet.</li>" +

        "<li>Press <strong>▶ Play</strong> and confirm both options appear.</li></ol>" +

        "<p class=\"learn-tip\">Choice plugs are on the right of the block — one per option. Story beats use sharp corners; silent blocks use rounded pastel boxes.</p>",

      setup: function () {

        return {

          entryNodeId: "intro",

          nodes: [

            beat("intro", 40, 200, { dialogueText: "The lobby stretches ahead." }),

            beat("fork", 280, 200, {

              dialogueText: "Which way?",

              choices: [

                { id: "c_stairs", label: "Take the stairs", choiceText: "Take the stairs" },

                { id: "c_lift", label: "Take the elevator", choiceText: "Take the elevator" },

              ],

            }),

            beat("stairs", 520, 120, { dialogueText: "You climb." }),

            beat("lift", 520, 280, { dialogueText: "The elevator hums." }),

          ],

          edges: [

            { id: "e_intro_fork", source: "intro", target: "fork", choiceId: null },

          ],

          metrics: [],

          characterProfiles: [],

          backgroundScenes: [],

          assets: [],

        };

      },

      validate: function (state) {

        var fork = getNode(state, "fork");

        if (!fork || !fork.data.choices || fork.data.choices.length < 2) {

          return { ok: false, hint: "Keep the Which way? Choices block with both options." };

        }

        if (countGatedChoices(fork) > 0) {

          return { ok: false, hint: "Turn off every Show only when toggle — this lesson is plain choices only." };

        }

        if (!edgeBetween(state.edges, "fork", "stairs", "c_stairs")) {

          return { ok: false, hint: "Wire Take the stairs to You climb." };

        }

        if (!edgeBetween(state.edges, "fork", "lift", "c_lift")) {

          return { ok: false, hint: "Wire Take the elevator to The elevator hums." };

        }

        return { ok: true, message: "Simple fork set — every reader sees every path." };

      },

    },

    {

      id: "choices-one-gate",

      title: "Whispers only",

      category: "Subtext & fate",

      order: 15,

      mode: "graph",

      learnPreviewPlay: true,

      summary: "Hide one option until the reader made an earlier choice — the rest stay visible.",

      instructions:

        "<p>Only the options that need a secret should be gated. Everyone can still leave or wait.</p>" +

        "<ol><li>Open the <strong>Study door?</strong> Choices block in the inspector.</li>" +

        "<li>On <strong>Slip into the study</strong>, turn on <strong>Prior choice</strong> only.</li>" +

        "<li>Add <strong>Share Ren's secret</strong> from the earlier scene.</li>" +

        "<li>Leave <strong>Go upstairs</strong> and <strong>Wait in the foyer</strong> without any toggles.</li>" +

        "<li>Wire each choice to its beat. Press <strong>▶ Play</strong> — play without the secret first, then replay after sharing.</li></ol>" +

        "<p class=\"learn-tip\">You do not gate every line — just the one that needs memory of an earlier pick.</p>",

      setup: function () {

        var cSecret = "c_ren_secret";

        return {

          entryNodeId: "hall",

          nodes: [

            beat("hall", 40, 200, {

              dialogueText: "Ren pulls you aside in the hall.",

              choices: [

                { id: cSecret, label: "Share Ren's secret", choiceText: "Share Ren's secret" },

                { id: "c_nod", label: "Nod and move on", choiceText: "Nod and move on" },

              ],

            }),

            beat("hall_after", 280, 200, { dialogueText: "The moment passes." }),

            beat("foyer_fork", 520, 200, {

              dialogueText: "Study door?",

              choices: [

                { id: "c_up", label: "Go upstairs", choiceText: "Go upstairs" },

                { id: "c_wait", label: "Wait in the foyer", choiceText: "Wait in the foyer" },

                { id: "c_study", label: "Slip into the study", choiceText: "Slip into the study" },

              ],

            }),

            beat("upstairs", 760, 80, { dialogueText: "The stairs creak." }),

            beat("foyer", 760, 200, { dialogueText: "You wait." }),

            beat("study", 760, 320, { dialogueText: "The study is quiet — Ren's secret opened the way." }),

          ],

          edges: [

            { id: "e1", source: "hall", target: "hall_after", choiceId: cSecret },

            { id: "e1b", source: "hall", target: "hall_after", choiceId: "c_nod" },

            { id: "e2", source: "hall_after", target: "foyer_fork", choiceId: null },

          ],

          metrics: [],

          characterProfiles: [],

          backgroundScenes: [],

          assets: [],

        };

      },

      validate: function (state) {

        var fork = getNode(state, "foyer_fork");

        if (!fork) return { ok: false, hint: "Keep the Study door? Choices block." };

        var secretChoice = findChoice(state, "foyer_fork", "study");

        var openChoice = findChoice(state, "foyer_fork", "upstairs");

        if (!secretChoice || !openChoice) {

          return { ok: false, hint: "Keep all three options on Study door?" };

        }

        if (!ScenaStore.choiceHasPriorChoiceGate(secretChoice)) {

          return { ok: false, hint: "Turn on Prior choice for Slip into the study and pick Share Ren's secret." };

        }

        var required = secretChoice.requiresChoiceIds || [];

        if (required.indexOf("c_ren_secret") < 0) {

          return { ok: false, hint: "Slip into the study should require Share Ren's secret." };

        }

        if (ScenaStore.choiceHasAnyGate(openChoice)) {

          return { ok: false, hint: "Go upstairs should stay open — no Show only when toggles." };

        }

        var gatedCount = countGatedChoices(fork);

        if (gatedCount !== 1) {

          return { ok: false, hint: "Only Slip into the study should be gated — one condition, one hidden option." };

        }

        if (!edgeBetween(state.edges, "foyer_fork", "study", secretChoice.id)) {

          return { ok: false, hint: "Wire Slip into the study to the study beat." };

        }

        return { ok: true, message: "One whispered path — visible only after the earlier secret." };

      },

    },

    {

      id: "choices-two-required",

      title: "Two ways in",

      category: "Subtext & fate",

      order: 16,

      mode: "graph",

      learnPreviewPlay: true,

      learnKeyItemsPanel: true,

      summary: "One fork — key, lockpick, or nothing. One Unlock choice appears with either tool.",

      instructions:

        "<p>Three choices on one beat, then the corridor. At the door, only <strong>two options</strong> — Unlock or Walk away.</p>" +

        "<ol><li>In <strong>Key items</strong>, create <strong>Brass key</strong>.</li>" +

        "<li>Wire <strong>Grab the brass key</strong> through a <strong>Key item</strong> (Give) block into the corridor.</li>" +

        "<li>Wire <strong>Grab a lockpick</strong> through a <strong>Logic</strong> block (+1 Lockpicks) into the same corridor.</li>" +

        "<li><strong>Go down the corridor</strong> is already wired — empty-handed.</li>" +

        "<li>On <strong>Locked door</strong>, keep only <strong>Unlock the door</strong> and <strong>Walk away</strong>.</li>" +

        "<li>On Unlock, use <strong>+ Add requirement</strong> twice — one <strong>Has item</strong> (brass key) and one <strong>Score or tally</strong> (Lockpicks, At least 1). Set <strong>Requirements match → Any (OR)</strong>.</li>" +

        "<li>Wire <strong>Unlock the door</strong> to <strong>The lock clicks…</strong> and <strong>Walk away</strong> to <strong>You leave the door shut.</strong></li>" +

        "<li>Press <strong>▶ Play</strong> three times — key, lockpick, then empty-handed. With no tool, only Walk away shows.</li></ol>" +

        "<p class=\"learn-tip\">OR on one choice — key or lockpick unlocks the same line. Readers never hold both tools.</p>",

      setup: function () {

        var cKey = "c_key";

        var cPick = "c_pick";

        var cCorridor = "c_corridor";

        return {

          entryNodeId: "arrival",

          assets: [],

          metrics: [{ key: "lockpicks", displayName: "Lockpicks", defaultValue: 0 }],

          nodes: [

            beat("arrival", 40, 300, { dialogueText: "A locked archive door waits at the end of the corridor." }),

            beat("prep_fork", 320, 300, {

              dialogueText: "Before you go down the corridor…",

              choices: [

                { id: cKey, label: "Grab the brass key", choiceText: "Grab the brass key" },

                { id: cPick, label: "Grab a lockpick", choiceText: "Grab a lockpick" },

                { id: cCorridor, label: "Go down the corridor", choiceText: "Go down the corridor" },

              ],

            }),

            keyItemBeat("grant_key", 640, 40, null, 1),

            logicBeat("grant_pick", 640, 560, { metricKey: "lockpicks", op: "add", value: 1 }),

            beat("corridor", 980, 300, { dialogueText: "The corridor ends at the locked archive door." }),

            beat("door", 1300, 300, {

              dialogueText: "Locked door",

              choices: [

                { id: "c_unlock", label: "Unlock the door", choiceText: "Unlock the door" },

                { id: "c_walk", label: "Walk away", choiceText: "Walk away" },

              ],

            }),

            beat("inside", 1620, 180, { dialogueText: "The lock clicks. You're in." }),

            beat("away", 1620, 480, { dialogueText: "You leave the door shut." }),

          ],

          edges: [

            { id: "e0", source: "arrival", target: "prep_fork", choiceId: null },

            { id: "e_corridor", source: "prep_fork", target: "corridor", choiceId: cCorridor },

            { id: "e_to_door", source: "corridor", target: "door", choiceId: null },

          ],

          characterProfiles: [],

          backgroundScenes: [],

          highlightPorts: [

            { nodeId: "prep_fork", choiceIds: [cKey, cPick] },

            { nodeId: "door", choiceIds: ["c_unlock", "c_walk"] },

          ],

        };

      },

      validate: function (state) {

        var keyAsset = (state.assets || []).find(function (a) {

          return a && a.kind === "keyItem" && /key/i.test(a.label || "");

        });

        if (!keyAsset) {

          return { ok: false, hint: "Create a Brass key in the Key items tab." };

        }

        if (!(state.metrics || []).some(function (m) { return m && m.key === "lockpicks"; })) {

          return { ok: false, hint: "Something went wrong — Lockpicks metric is missing from setup." };

        }

        var fork = getNode(state, "prep_fork");

        if (!fork || !fork.data.choices || fork.data.choices.length < 3) {

          return { ok: false, hint: "Keep all three options on Before you go down the corridor…" };

        }

        if (!edgeBetween(state.edges, "prep_fork", "corridor", "c_corridor")) {

          return { ok: false, hint: "Keep Go down the corridor wired into the corridor." };

        }

        if (!pathFromChoiceReaches(state, "prep_fork", "c_corridor", "door")) {

          return { ok: false, hint: "Connect the corridor into Locked door." };

        }

        if (!pathFromChoiceReaches(state, "prep_fork", "c_key", "door")) {

          return { ok: false, hint: "Wire Grab the brass key through the key grant into the corridor and door." };

        }

        if (!pathFromChoiceReaches(state, "prep_fork", "c_pick", "door")) {

          return { ok: false, hint: "Wire Grab a lockpick through a +1 Lockpicks Metrics block into the corridor and door." };

        }

        var grantKey = findKeyGrantNode(state, keyAsset.id);

        if (!grantKey) {

          return { ok: false, hint: "Add a Key item block on the key path that gives the brass key." };

        }

        if (!pathFromNodeReaches(state, grantKey.id, "door")) {

          return { ok: false, hint: "Connect the key grant through the corridor to Locked door." };

        }

        var grantPick = findLogicAfterChoice(state, "prep_fork", "c_pick");

        if (!grantPick) grantPick = getNode(state, "grant_pick");

        if (!grantPick || !logicAdjustsMetric(grantPick, "lockpicks", "add", 1)) {

          return { ok: false, hint: "Wire Grab a lockpick through a Metrics block that adds Lockpicks (+1)." };

        }

        if (!pathFromNodeReaches(state, grantPick.id, "door")) {

          return { ok: false, hint: "Connect the lockpick path through the corridor to Locked door." };

        }

        var door = getNode(state, "door");

        if (!door) return { ok: false, hint: "Keep the Locked door Choices block." };

        var walkAway = findChoice(state, "door", "walk");

        if (!walkAway) {

          return { ok: false, hint: "Keep Walk away on Locked door." };

        }

        if (!door.data.choices || door.data.choices.length !== 2) {

          return { ok: false, hint: "Locked door should have exactly two options — Unlock the door and Walk away." };

        }

        var unlock = findChoice(state, "door", "unlock");

        if (!unlock) {

          return { ok: false, hint: "Keep Unlock the door on Locked door." };

        }

        if (!ScenaStore.normalizeChoiceChecks(unlock).some(function (check) {
          return check.type === "keyItem" && check.assetId === keyAsset.id && (check.mode || "has") === "has";
        })) {

          return { ok: false, hint: "Add a Has item check for the brass key on Unlock the door." };

        }

        if (!choiceMetricGateMatches(unlock, state, "lockpicks", 1)) {

          return { ok: false, hint: "Add a Score or tally check on Unlock the door — Lockpicks, At least 1." };

        }

        if ((unlock.gateMatchMode || "and") !== "or") {

          return { ok: false, hint: "Set Unlock the door requirements to match Any (OR) — key or lockpick." };

        }

        if (ScenaStore.choiceHasAnyGate(walkAway)) {

          return { ok: false, hint: "Walk away should stay open — no Show only when toggles." };

        }

        if (countGatedChoices(door) !== 1) {

          return { ok: false, hint: "Only Unlock the door should be gated." };

        }

        if (!edgeBetween(state.edges, "door", "inside", unlock.id)) {

          return { ok: false, hint: "Wire Unlock the door to The lock clicks…" };

        }

        if (!edgeBetween(state.edges, "door", "away", walkAway.id)) {

          return { ok: false, hint: "Wire Walk away to You leave the door shut." };

        }

        return { ok: true, message: "One Unlock choice — key or lockpick via OR, or walk away empty-handed." };

      },

    },

    {

      id: "choices-or-same-path",

      title: "Both halves of the ticket",

      category: "Subtext & fate",

      order: 17,

      mode: "graph",

      learnPreviewPlay: true,

      learnKeyItemsPanel: true,

      summary: "Old-house puzzle — both medallions in one run before the door will open.",

      instructions:

        "<p>Like a torn ticket stub, the door needs <strong>both halves</strong> from the same walkthrough. Inventory carries forward beat to beat.</p>" +

        "<ol><li>In <strong>Key items</strong>, create <strong>Sun medallion</strong> and <strong>Moon medallion</strong>.</li>" +

        "<li>Wire <strong>You pick up the locket…</strong> → <strong>The locket</strong> → <strong>Turn it over</strong> → <strong>Key item</strong> (Give Sun medallion) → <strong>The stairs lead up…</strong></li>" +

        "<li>Wire <strong>The stairs lead up…</strong> → the landing → <strong>Lift the shade</strong> → <strong>Key item</strong> (Give Moon medallion) → <strong>Back in the entry hall…</strong></li>" +

        "<li>On <strong>Front door → Unlock the front door</strong>, add requirements for <strong>both halves</strong>: either two <strong>Prior choice</strong> checks (Turn it over + Lift the shade), or two <strong>Has item</strong> checks (Sun + Moon medallion).</li>" +

        "<li>Leave <strong>Stay for now</strong> open. Wire <strong>Unlock the front door</strong> to <strong>You escape into the night…</strong></li>" +

        "<li>Press <strong>▶ Play</strong> once — both medallions should land in inventory before the door, then escape.</li></ol>" +

        "<p class=\"learn-tip\">AND logic in one playthrough: both finds must happen on the way to the door. Skip Turn it over or Lift the shade and Unlock stays hidden.</p>",

      setup: function () {

        var cTurnOver = "c_turn_over";

        var cLiftShade = "c_lift_shade";

        return {

          entryNodeId: "entry",

          assets: [],

          metrics: [],

          nodes: [

            beat("entry", 40, 300, { dialogueText: "The mansion seals shut behind you. The front door has two empty slots." }),

            beat("parlor", 300, 300, { dialogueText: "Dusty parlor. A silver locket glints on the mantel." }),

            beat("loocket_close", 580, 300, { dialogueText: "You pick up the locket and study it up close." }),

            beat("inspect_fork", 860, 300, {

              dialogueText: "The locket",

              choices: [

                { id: cTurnOver, label: "Turn it over", choiceText: "Turn it over" },

                { id: "c_put_back", label: "Put it back", choiceText: "Put it back" },

              ],

            }),

            keyItemBeat("grant_sun", 1140, 40, null, 1),

            beat("stairwell", 1420, 300, { dialogueText: "The stairs lead up. The locket pocket weighs heavy." }),

            beat("upstairs", 1700, 300, { dialogueText: "Upstairs landing. An oil lamp sputters by the window." }),

            beat("lamp_fork", 1980, 300, {

              dialogueText: "The lamp",

              choices: [

                { id: cLiftShade, label: "Lift the shade", choiceText: "Lift the shade" },

                { id: "c_move_on", label: "Move on", choiceText: "Move on" },

              ],

            }),

            keyItemBeat("grant_moon", 2260, 40, null, 1),

            beat("hall", 2540, 300, { dialogueText: "Back in the entry hall. Both medallions rest in your pockets." }),

            beat("door_fork", 2820, 300, {

              dialogueText: "Front door",

              choices: [

                { id: "c_unlock", label: "Unlock the front door", choiceText: "Unlock the front door" },

                { id: "c_stay", label: "Stay for now", choiceText: "Stay for now" },

              ],

            }),

            beat("escape", 3100, 180, { dialogueText: "Both medallions click home. You escape into the night." }),

            beat("stay_put", 3100, 480, { dialogueText: "The door stays sealed. Something is still missing." }),

          ],

          edges: [

            { id: "e0", source: "entry", target: "parlor", choiceId: null },

            { id: "e1", source: "parlor", target: "loocket_close", choiceId: null },

            { id: "e2", source: "loocket_close", target: "inspect_fork", choiceId: null },

            { id: "e3", source: "stairwell", target: "upstairs", choiceId: null },

            { id: "e4", source: "hall", target: "door_fork", choiceId: null },

          ],

          characterProfiles: [],

          backgroundScenes: [],

          highlightPorts: [

            { nodeId: "inspect_fork", choiceIds: [cTurnOver] },

            { nodeId: "stairwell", choiceIds: [null] },

            { nodeId: "lamp_fork", choiceIds: [cLiftShade] },

            { nodeId: "door_fork", choiceIds: ["c_unlock"] },

          ],

        };

      },

      validate: function (state) {

        var medallions = (state.assets || []).filter(function (a) {

          return a && a.kind === "keyItem" && /medallion/i.test(a.label || "");

        });

        if (medallions.length < 2) {

          return { ok: false, hint: "Create Sun medallion and Moon medallion in the Key items tab." };

        }

        var sunAsset = medallions.find(function (a) { return /sun/i.test(a.label || ""); });

        var moonAsset = medallions.find(function (a) { return /moon/i.test(a.label || ""); });

        if (!sunAsset || !moonAsset) {

          return { ok: false, hint: "Name your key items Sun medallion and Moon medallion." };

        }

        if (!pathFromNodeReaches(state, "parlor", "inspect_fork")) {

          return { ok: false, hint: "Wire the parlor through You pick up the locket… into The locket." };

        }

        var grantSun = findKeyGrantNode(state, sunAsset.id);

        var grantMoon = findKeyGrantNode(state, moonAsset.id);

        if (!grantSun) {

          return { ok: false, hint: "Add a Key item block on the locket path that gives the Sun medallion." };

        }

        if (!grantMoon) {

          return { ok: false, hint: "Add a Key item block on the lamp path that gives the Moon medallion." };

        }

        if (!pathFromChoiceReaches(state, "inspect_fork", "c_turn_over", "stairwell")) {

          return { ok: false, hint: "Wire Turn it over through the Sun medallion grant into The stairs lead up…" };

        }

        if (!pathFromNodeReaches(state, grantSun.id, "upstairs")) {

          return { ok: false, hint: "Continue the Sun medallion path through the stairs into the upstairs landing." };

        }

        if (!pathFromChoiceReaches(state, "lamp_fork", "c_lift_shade", "hall")) {

          return { ok: false, hint: "Wire Lift the shade through the Moon medallion grant into Back in the entry hall…" };

        }

        if (!pathFromNodeReaches(state, grantMoon.id, "hall")) {

          return { ok: false, hint: "Connect the Moon medallion path into the entry hall." };

        }

        if (!pathFromNodeReaches(state, "upstairs", "hall")) {

          return { ok: false, hint: "Wire the upstairs landing through the lamp into the entry hall." };

        }

        var doorFork = getNode(state, "door_fork");

        if (!doorFork) return { ok: false, hint: "Keep the Front door Choices block." };

        var unlock = findChoice(state, "door_fork", "unlock");

        var stay = findChoice(state, "door_fork", "stay");

        if (!unlock || !stay) {

          return { ok: false, hint: "Keep Unlock the front door and Stay for now on Front door." };

        }

        if (!ScenaStore.choiceHasAnyGate(unlock)) {

          return { ok: false, hint: "Add requirements on Unlock the front door — both prior choices or both medallions." };

        }

        var priorIds = ScenaStore.choicePriorChoiceIds(unlock);

        var hasBothPrior = priorIds.indexOf("c_turn_over") >= 0 && priorIds.indexOf("c_lift_shade") >= 0;

        var hasBothKeys = ScenaStore.choiceRequiresKeyItems(unlock, [sunAsset.id, moonAsset.id]);

        if (!hasBothPrior && !hasBothKeys) {

          return { ok: false, hint: "Unlock the front door needs both Turn it over and Lift the shade, or Has item checks for both medallions." };

        }

        if (ScenaStore.choiceHasAnyGate(stay)) {

          return { ok: false, hint: "Stay for now should stay open." };

        }

        if (countGatedChoices(doorFork) !== 1) {

          return { ok: false, hint: "Only Unlock the front door should be gated." };

        }

        if (!edgeBetween(state.edges, "door_fork", "escape", unlock.id)) {

          return { ok: false, hint: "Wire Unlock the front door to You escape into the night…" };

        }

        return { ok: true, message: "One run, two medallions in inventory — both before the door opens." };

      },

    },

    {

      id: "metrics-affection-supplies",

      title: "Hearts & tallies",

      category: "Subtext & fate",

      order: 18,

      mode: "graph",

      learnPreviewPlay: true,

      summary: "Hidden affection unlocks a special route; potion tallies rise and fall through Metrics blocks.",

      instructions:

        "<p>Not every value belongs in inventory. <strong>Affection</strong> is a hidden score; <strong>Potions</strong> is a tally you can spend down.</p>" +

        "<ol><li>Wire <strong>Stay and talk</strong> through the <strong>Metrics block</strong> (+2 Affection) into <strong>A note arrives…</strong></li>" +

        "<li>On the <strong>Flow gate</strong>, add a check: <strong>Affection ≥ 4</strong> → wire to <strong>Meet me backstage</strong>. Wire <strong>Else</strong> to <strong>Thank you for a lovely evening</strong>.</li>" +

        "<li>Wire <strong>The apothecary shelf…</strong> → <strong>Metrics block</strong> (+1 Potions) → <strong>Your hands shake…</strong></li>" +

        "<li>Gate <strong>Drink a potion</strong> with a <strong>Score or tally</strong> check (Potions, At least 1). Wire it through a <strong>Logic</strong> block with Amount <strong>−1</strong> on Potions → <strong>The shaking stops</strong>.</li>" +

        "<li>Press <strong>▶ Play</strong> — earn affection for the secret note, spend a potion to recover.</li></ol>" +

        "<p class=\"learn-tip\">Metrics are invisible to readers unless you surface them in dialogue. Use them for romance scores, supplies, money, or any number that goes up and down.</p>",

      setup: function () {

        var cStay = "c_stay";

        var cGo = "c_go";

        var cDrink = "c_drink";

        return {

          entryNodeId: "hall",

          nodes: [

            beat("hall", 40, 300, { dialogueText: "The conservatory hall empties after rehearsal." }),

            beat("invite", 320, 120, {

              dialogueText: "Ren linger at the stage door.",

              choices: [

                { id: cStay, label: "Stay and talk", choiceText: "Stay and talk" },

                { id: cGo, label: "Head home", choiceText: "Head home" },

              ],

            }),

            logicBeat("affection_up", 600, 40, { metricKey: "affection", op: "add", value: 2 }),

            beat("cold_exit", 600, 220, { dialogueText: "You wave from the sidewalk." }),

            beat("later", 880, 120, { dialogueText: "A note arrives the next day." }),

            routeGate("affection_gate", 1160, 120, [{

              id: "route_close",

              label: "Close bond",

              matchMode: "and",

              checks: [],

            }]),

            beat("intimate", 1440, 40, { dialogueText: "Meet me backstage — the note reads." }),

            beat("polite", 1440, 220, { dialogueText: "Thank you for a lovely evening." }),

            beat("apothecary", 320, 520, { dialogueText: "The apothecary shelf gleams." }),

            logicBeat("stock_potion", 600, 520, { metricKey: "potions", op: "add", value: 1 }),

            beat("injured", 880, 520, {

              dialogueText: "Your hands shake before the next scene.",

              choices: [

                { id: cDrink, label: "Drink a potion", choiceText: "Drink a potion" },

                { id: "c_tough", label: "Push through", choiceText: "Push through" },

              ],

            }),

            logicBeat("use_potion", 1160, 480, { metricKey: "potions", op: "subtract", value: 1 }),

            beat("steady", 1440, 460, { dialogueText: "The shaking stops." }),

            beat("wobble", 1440, 580, { dialogueText: "You white-knuckle the script." }),

          ],

          edges: [

            { id: "e1", source: "hall", target: "invite" },

            { id: "e2", source: "invite", target: "cold_exit", choiceId: cGo },

            { id: "e3", source: "cold_exit", target: "later" },

            { id: "e4", source: "later", target: "affection_gate" },

            { id: "e5", source: "affection_gate", target: "polite", choiceId: ROUTE_ELSE_ID },

            { id: "e6", source: "hall", target: "apothecary" },

            { id: "e7", source: "injured", target: "wobble", choiceId: "c_tough" },

          ],

          metrics: [

            { key: "affection", displayName: "Affection", defaultValue: 0 },

            { key: "potions", displayName: "Potions", defaultValue: 0 },

          ],

          characterProfiles: [],

          backgroundScenes: [],

          highlightPorts: [

            { nodeId: "invite", choiceIds: [cStay] },

            { nodeId: "later", choiceIds: [null] },

            { nodeId: "affection_gate", choiceIds: ["route_close", ROUTE_ELSE_ID] },

            { nodeId: "apothecary", choiceIds: [null] },

            { nodeId: "injured", choiceIds: [cDrink] },

          ],

        };

      },

      validate: function (state) {

        var affectionMetric = (state.metrics || []).find(function (m) { return m && m.key === "affection"; });

        var potionsMetric = (state.metrics || []).find(function (m) { return m && m.key === "potions"; });

        if (!affectionMetric || !potionsMetric) {

          return { ok: false, hint: "Lesson setup error — Affection and Potions metrics missing." };

        }

        var fork = getNode(state, "invite");

        if (!fork || !fork.data.choices || !fork.data.choices.length) {

          return { ok: false, hint: "Lesson setup error — invite beat missing." };

        }

        var cStay = findChoice(state, "invite", "stay");

        if (!cStay) cStay = fork.data.choices[0];

        var affectionLogic = findLogicAfterChoice(state, "invite", cStay.id);

        if (!affectionLogic || !logicAdjustsMetric(affectionLogic, "affection", "add", 2)) {

          return { ok: false, hint: "Wire Stay and talk through a Metrics block that adds +2 Affection." };

        }

        if (!edgeBetween(state.edges, affectionLogic.id, "later", null) &&
            !outgoingFrom(state.edges, affectionLogic.id, null)) {

          return { ok: false, hint: "Connect the Affection Metrics block into A note arrives…" };

        }

        var router = findFlowGateAfter(state, "later");

        if (!router) {

          return { ok: false, hint: "Connect A note arrives… to the Flow gate." };

        }

        var closeRule = findMetricRouteRule(router, "affection", "gte", 4);

        if (!closeRule) {

          return { ok: false, hint: "Add a Flow gate check: Affection ≥ 4." };

        }

        var closeEdge = routeEdgeToTarget(state.edges, router.id, "intimate", closeRule.id) ||

          findRouteEdgeToTarget(state, router, "intimate", function (rule) {

            return ScenaStore.normalizeRouteChecks(rule).some(function (c) {

              return c.type === "metric" && c.metricKey === "affection" && (c.op || "gte") === "gte" && parseFloat(c.value) === 4;

            });

          });

        if (!closeEdge) {

          return { ok: false, hint: "Wire the Affection ≥ 4 route to Meet me backstage." };

        }

        var elseEdge = routeEdgeToTarget(state.edges, router.id, "polite", ROUTE_ELSE_ID) ||

          outgoingFrom(state.edges, router.id, ROUTE_ELSE_ID);

        if (!elseEdge || elseEdge.target !== "polite") {

          return { ok: false, hint: "Wire the Else plug to Thank you for a lovely evening." };

        }

        if (!edgeBetween(state.edges, "apothecary", "stock_potion", null) &&

            !outgoingFrom(state.edges, "apothecary", null)) {

          return { ok: false, hint: "Wire The apothecary shelf… to the +1 Potions Metrics block." };

        }

        var stockNode = getNode(state, "stock_potion");

        if (!stockNode || !logicAdjustsMetric(stockNode, "potions", "add", 1)) {

          return { ok: false, hint: "Set the shelf Metrics block to add +1 Potions." };

        }

        if (!edgeBetween(state.edges, "stock_potion", "injured", null) &&

            !outgoingFrom(state.edges, "stock_potion", null)) {

          return { ok: false, hint: "Connect the Potions Metrics block into Your hands shake…" };

        }

        var drinkChoice = findChoice(state, "injured", "potion");

        if (!drinkChoice) {

          return { ok: false, hint: "Keep the Drink a potion choice on Your hands shake…" };

        }

        var drinkMetric = ScenaStore.choiceFirstMetricCheck(drinkChoice);

        if (!drinkMetric ||

            drinkMetric.metricKey !== "potions" ||

            (drinkMetric.op || "gte") !== "gte" ||

            parseFloat(drinkMetric.value) < 1) {

          return { ok: false, hint: "Add a Score or tally check on Drink a potion — Potions, At least 1." };

        }

        var useNode = findLogicAfterChoice(state, "injured", drinkChoice.id);

        if (!useNode || !logicAdjustsMetric(useNode, "potions", "subtract", 1)) {

          return { ok: false, hint: "Wire Drink a potion to a Metrics block, set Potions Amount to −1, then connect to The shaking stops." };

        }

        if (!edgeBetween(state.edges, useNode.id, "steady", null) &&

            !outgoingFrom(state.edges, useNode.id, null)) {

          return { ok: false, hint: "Connect the spend Metrics block to The shaking stops." };

        }

        return { ok: true, message: "Hidden affection for special routes, potion tally for consumables." };

      },

    },

  ];

})();


