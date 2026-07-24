/**
 * Arleco — playable demo series for the public home page.
 */
(function () {
  var NODE_SPACING = 280;
  var LANE_OFFSET = 420;

  function svgBg(top, bottom, extra) {
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540">' +
        "<defs><linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\"0.15\" y2=\"1\">" +
          "<stop offset=\"0%\" stop-color=\"" + top + "\"/>" +
          "<stop offset=\"100%\" stop-color=\"" + bottom + "\"/>" +
        "</linearGradient></defs>" +
        "<rect width=\"100%\" height=\"100%\" fill=\"url(#g)\"/>" +
        (extra || "") +
      "</svg>";
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }

  function logicBeat(id, x, y, metricKey, value) {
    return beat(id, x, y, {
      autoAdvance: true,
      sets: [{ metricKey: metricKey, op: "add", value: typeof value === "number" ? value : 1 }],
    });
  }

  function nodeCoord(nodes, id, axis) {
    var node = nodes.find(function (item) { return item.id === id; });
    return node ? node[axis] : (axis === "x" ? 0 : 180);
  }

  function midCoord(nodes, aId, bId, axis) {
    return (nodeCoord(nodes, aId, axis) + nodeCoord(nodes, bId, axis)) / 2;
  }

  function routeGate(id, x, y, rules) {
    return beat(id, x, y, {
      beatKind: "choice-route-gate",
      autoAdvance: true,
      isRouteGate: true,
      sets: [],
      routeRules: rules,
    });
  }

  function beat(id, x, y, data, defaultBg) {
    return {
      id: id,
      type: "beat",
      x: x,
      y: y,
      data: Object.assign({
        characterProfileId: null,
        spriteId: null,
        slot: "center",
        backgroundSceneId: defaultBg,
        overrideStage: false,
        overrideCharacter: false,
        dialogueText: "",
        dialogue: [],
        choices: [],
        autoAdvance: false,
        isEnd: false,
        sets: [],
        bgmAssetId: null,
        voiceAssetId: null,
        sfxAssetId: null,
        overrideBgm: false,
      }, data),
    };
  }

  function edge(id, source, target, choiceId) {
    return { id: id, source: source, target: target, choiceId: choiceId || null };
  }

  function speaker(id, name, color) {
    return { id: id, name: name, color: color, sprites: [] };
  }

  function bg(id, name, top, bottom, extra) {
    return {
      id: id,
      name: name,
      layers: { bg: svgBg(top, bottom, extra), mg: null, fg: null },
    };
  }

  /** Build a linear beat chain; each step: { id, text, who?, bg?, choices?, isEnd?, y? } */
  function chain(steps, opts) {
    opts = opts || {};
    var nodes = [];
    var edges = [];
    var x = opts.startX || 40;
    var y = opts.y || 180;
    var spacing = opts.spacing || NODE_SPACING;
    var defaultBg = opts.defaultBg;
    var prev = null;

    steps.forEach(function (step) {
      var data = {
        dialogueText: step.text,
        isEnd: !!step.isEnd,
      };
      if (step.who) {
        data.characterProfileId = step.who;
        data.overrideCharacter = true;
      }
      if (step.bg) data.backgroundSceneId = step.bg;
      if (step.choices) data.choices = step.choices;
      if (step.requiresChoiceIds) data.requiresChoiceIds = step.requiresChoiceIds;

      var node = beat(step.id, x, step.y != null ? step.y : y, data, defaultBg);
      nodes.push(node);
      if (prev) edges.push(edge("e_" + prev + "_" + step.id, prev, step.id));
      prev = step.id;
      x += spacing;
    });

    return {
      nodes: nodes,
      edges: edges,
      lastX: x - spacing,
      lastId: prev,
    };
  }

  function buildCafeAtSunset() {
    var BG = "bg_cafe";
    var CH_MIRA = "ch_mira";
    var CH_REN = "ch_ren";
    var CH_SORA = "ch_sora";
    var C_REN = "c_ren";
    var C_SORA = "c_sora";

    var ep1a = chain([
      { id: "cafe_open", text: "Rain draws silver lines down the café windows. Inside, the air is warm with matcha and cinnamon." },
      { id: "cafe_arrive", text: "You take the last open table by the window. Outside, the streetlights bloom one by one." },
      { id: "cafe_mira", who: CH_MIRA, text: "Mira sets a cup in front of you. \"Closing shift starts soon,\" she says. \"Stay as long as you like.\"" },
      { id: "cafe_fork", text: "Two people glance your way from across the room. The evening suddenly feels like a choice.", choices: [
        { id: C_REN, label: "Wave Ren over", choiceText: "Wave Ren over" },
        { id: C_SORA, label: "Ask Sora to join you", choiceText: "Ask Sora to join you" },
      ] },
    ], { defaultBg: BG, startX: 40 });

    var branchX = ep1a.lastX + NODE_SPACING;
    var renPath = chain([
      { id: "cafe_ren", who: CH_REN, text: "Ren slides into the chair. \"You always pick the window seat,\" they murmur." },
    ], { defaultBg: BG, startX: branchX, y: 100 });

    var soraPath = chain([
      { id: "cafe_sora", who: CH_SORA, text: "Sora laughs softly. \"I saved you from drinking plain water. You're welcome.\"" },
    ], { defaultBg: BG, startX: branchX, y: 100 + LANE_OFFSET });

    var ep1Boundary = branchX + NODE_SPACING + 200;
    var ep2StartX = ep1Boundary + 80;

    var ep2_ren = chain([
      { id: "ep2_ren_open", who: CH_REN, text: "Ren is already at the window table when you arrive — two cups waiting, rain forgotten." },
      { id: "ep2_ren_talk", who: CH_REN, text: "\"I didn't know if you'd come,\" Ren says quietly. \"But I hoped you would.\"" },
      { id: "ep2_ren_end", who: CH_REN, text: "After closing, Ren walks you to the corner. The city feels honest in the amber light.", isEnd: true, endingLabel: "Ren's evening" },
    ], { defaultBg: BG, startX: ep2StartX, y: 100 });

    var ep2_sora = chain([
      { id: "ep2_sora_open", who: CH_SORA, text: "Sora saved your seat and the best light. Your cup has another tiny sun sketched on the sleeve." },
      { id: "ep2_sora_talk", who: CH_SORA, text: "\"Golden hour is a team sport,\" Sora laughs. \"You're on my roster now.\"" },
      { id: "ep2_sora_end", who: CH_SORA, text: "Sora takes your hand after closing and names constellations between the streetlights.", isEnd: true, endingLabel: "Sora's evening" },
    ], { defaultBg: BG, startX: ep2StartX, y: 100 + LANE_OFFSET });

    var nodes = ep1a.nodes.concat(
      renPath.nodes, soraPath.nodes,
      ep2_ren.nodes, ep2_sora.nodes
    );
    var edges = ep1a.edges.concat(
      renPath.edges, soraPath.edges,
      ep2_ren.edges, ep2_sora.edges
    );

    nodes.push(logicBeat(
      "cafe_warmth",
      midCoord(nodes, "cafe_mira", "cafe_fork", "x"),
      nodeCoord(nodes, "cafe_mira", "y"),
      "warmth",
      1
    ));
    edges.forEach(function (e) {
      if (e.source === "cafe_mira" && e.target === "cafe_fork") e.target = "cafe_warmth";
    });
    edges.push(edge("e_cafe_warmth", "cafe_warmth", "cafe_fork"));

    edges.push(edge("e4r", "cafe_fork", "cafe_ren", C_REN));
    edges.push(edge("e4s", "cafe_fork", "cafe_sora", C_SORA));
    edges.push(edge("e_ep1_ren_ep2", "cafe_ren", "ep2_ren_open"));
    edges.push(edge("e_ep1_sora_ep2", "cafe_sora", "ep2_sora_open"));

    nodes.push(logicBeat(
      "ep2_ren_warmth",
      midCoord(nodes, "ep2_ren_open", "ep2_ren_talk", "x"),
      nodeCoord(nodes, "ep2_ren_open", "y"),
      "warmth",
      1
    ));
    nodes.push(logicBeat(
      "ep2_sora_warmth",
      midCoord(nodes, "ep2_sora_open", "ep2_sora_talk", "x"),
      nodeCoord(nodes, "ep2_sora_open", "y"),
      "warmth",
      1
    ));
    edges.forEach(function (e) {
      if (e.source === "ep2_ren_open" && e.target === "ep2_ren_talk") e.target = "ep2_ren_warmth";
      if (e.source === "ep2_sora_open" && e.target === "ep2_sora_talk") e.target = "ep2_sora_warmth";
    });
    edges.push(edge("e_ep2_ren_w", "ep2_ren_warmth", "ep2_ren_talk"));
    edges.push(edge("e_ep2_sora_w", "ep2_sora_warmth", "ep2_sora_talk"));

    var ep2Boundary = Math.max(ep2_ren.lastX, ep2_sora.lastX) + NODE_SPACING + 200;

    return {
      id: "cafe-at-sunset",
      title: "Café at Sunset",
      slug: "cafe-at-sunset",
      shortDescription: "A cozy romance with two routes and too much matcha.",
      longDescription:
        "Rain streaks the windows of a corner café where the golden hour lasts just long enough " +
        "to change your evening. Choose who you sit with — if anyone — and see who shows up tomorrow.",
      thumbnailDataUrl: svgBg("#d4b8c8", "#7a6a82"),
      bannerDataUrl: svgBg("#f0b896", "#5a4868"),
      contentFlags: ["romance"],
      status: "published",
      createdAt: "2026-01-01T12:00:00.000Z",
      updatedAt: "2026-06-01T12:00:00.000Z",
      entryNodeId: "cafe_open",
      metrics: [{ key: "warmth", displayName: "Warmth", defaultValue: 0 }],
      assets: [],
      characterProfiles: [
        speaker(CH_MIRA, "Mira", "#c4a882"),
        speaker(CH_REN, "Ren", "#6e7a8a"),
        speaker(CH_SORA, "Sora", "#d4849a"),
      ],
      backgroundScenes: [
        bg(BG, "Corner café at dusk", "#f4c4a8", "#6e5878",
          '<rect y="62%" width="100%" height="38%" fill="rgba(40,28,24,0.35)"/>'),
      ],
      nodes: nodes,
      edges: edges,
      episodes: [
        { id: "cafe-ep-1", number: 1, title: "Last Table by the Window", boundaryX: ep1Boundary, isLive: true, publishedAt: "2026-01-15T18:00:00.000Z",
          branchEndings: [
            { id: "ren", label: "Ren's route", exitNodeId: "cafe_ren", choiceIds: [C_REN] },
            { id: "sora", label: "Sora's route", exitNodeId: "cafe_sora", choiceIds: [C_SORA] },
          ],
        },
        { id: "cafe-ep-2", number: 2, title: "Golden Hour Notes", startNodeId: "ep2_ren_open", boundaryX: ep2Boundary, isLive: true, publishedAt: "2026-02-01T18:00:00.000Z",
          entryNodeIds: ["ep2_ren_open", "ep2_sora_open"],
          branchEndings: [
            { id: "ren-evening", label: "Ren's evening", exitNodeId: "ep2_ren_end", choiceIds: [C_REN] },
            { id: "sora-evening", label: "Sora's evening", exitNodeId: "ep2_sora_end", choiceIds: [C_SORA] },
          ],
        },
      ],
      readerUi: null,
    };
  }

  function buildSignalLost() {
    var BG_BRIDGE = "sig_bridge";
    var BG_CORRIDOR = "sig_corridor";
    var BG_LAB = "sig_lab";
    var BG_DOCK = "sig_dock";
    var CH_VOSS = "sig_voss";
    var CH_KAI = "sig_kai";
    var CH_SEVEN = "sig_seven";
    var C_LAB = "sig_c_lab";
    var C_ANT = "sig_c_ant";
    var C_TRUST = "sig_c_trust";
    var C_DOUBT = "sig_c_doubt";

    var ep1a = chain([
      { id: "s1_01", text: "Cold air hits your lungs. The cryo bay hisses open, and the station greets you with silence — no fans, no voices, no hum beneath the floor." },
      { id: "s1_02", text: "Your name is on the bunk tag. The date says you slept forty-one days. That can't be right. The mission briefing said two weeks." },
      { id: "s1_03", who: CH_VOSS, text: "Commander Voss waits on the bridge, hands folded behind her back. \"You're awake. Good. We lost contact with Earth six hours ago — and I don't mean static. I mean nothing.\"" },
      { id: "s1_04", text: "The main viewscreen shows Kerberos-9 hanging in the black, a pale moon caught in its gravity. No traffic lanes. No supply pings. No hails at all." },
      { id: "s1_05", who: CH_SEVEN, text: "A calm synthetic voice fills the room. \"I am Unit-7. Crew calls me Seven. I have preserved forty-one days of logs you may review when you are ready to be afraid.\"" },
      { id: "s1_06", who: CH_KAI, text: "Kai leans against the nav console, dark circles under his eyes. \"Before you ask — yes, we tried every band. Yes, we shouted. The void didn't even echo.\"" },
      { id: "s1_07", text: "Seven pulls up a timeline. Life support: stable. Reactor: stable. Comms array: physically intact. Signal path: severed somewhere the instruments can't see." },
      { id: "s1_08", bg: BG_CORRIDOR, text: "The corridor lights stutter as you leave the bridge. Each footstep sounds too loud, like the station is listening." },
      { id: "s1_09", text: "Wall panels show hairline cracks you don't remember from training sims. Someone patched them with tape and wrote dates in marker — all recent." },
      { id: "s1_10", who: CH_KAI, text: "\"We picked up a whisper last night,\" Kai says. \"Not on comms. On the hardline. Someone breathing inside the hull.\"" },
      { id: "s1_11", text: "Two paths branch on your map: the lab wing where Voss sealed the samples, or the exterior antenna on Dock C.", choices: [
        { id: C_LAB, label: "Search the lab first", choiceText: "Search the lab first" },
        { id: C_ANT, label: "Check the antenna", choiceText: "Check the antenna" },
      ] },
    ], { defaultBg: BG_BRIDGE, startX: 40 });

    var s1_lab = chain([
      { id: "s1_lab_01", bg: BG_LAB, text: "The lab smells like ozone and preserved tissue. Sample lockers line the wall — each labeled in Voss's precise handwriting." },
      { id: "s1_lab_02", who: CH_VOSS, text: "\"Don't touch the red seals,\" Voss says over comms. \"Those cores came from the moon fracture. We never finished the analysis.\"" },
      { id: "s1_lab_03", text: "Seven overlays scan data on your visor. One locker is warm to the touch. Warm like something inside is still metabolizing." },
    ], { defaultBg: BG_LAB, startX: ep1a.lastX + NODE_SPACING, y: 100 });

    var s1_ant = chain([
      { id: "s1_ant_01", bg: BG_DOCK, text: "Dock C opens onto the stars. The antenna tower rises above you, a needle of metal pointing at nothing." },
      { id: "s1_ant_02", who: CH_KAI, text: "Kai runs a gloved hand along the relay housing. \"Hardware's fine. Something's jamming us locally — like the station is broadcasting silence on purpose.\"" },
      { id: "s1_ant_03", text: "For one second the status light flares green. A ping returns from inside the station, not from orbit. From beneath your feet." },
    ], { defaultBg: BG_DOCK, startX: ep1a.lastX + NODE_SPACING, y: 100 + LANE_OFFSET });

    var mergeX = ep1a.lastX + NODE_SPACING * 2 + 440;
    var ep1b = chain([
      { id: "s1_12", bg: BG_BRIDGE, text: "Back on the bridge, Seven rotates a holographic map. The ping source moves — slow, deliberate — through decks you sealed weeks ago." },
      { id: "s1_13", who: CH_VOSS, text: "\"This station has twelve crew berths. I accounted for every soul on board.\" Voss's voice doesn't waver. \"Every soul but one.\"" },
      { id: "s1_14", who: CH_KAI, text: "Kai slams a fist on the console. \"Then explain the breathing, Commander. Explain why the cryo logs show you waking up twice.\"" },
      { id: "s1_15", who: CH_SEVEN, text: "\"I can answer the second question,\" Seven says. \"Commander Voss entered cryo on day three. She exited on day three. She also exited on day thirty-nine.\"" },
      { id: "s1_16", text: "The bridge goes quiet except for the reactor's distant pulse. Voss doesn't deny it. She watches you instead, measuring your reaction." },
      { id: "s1_17", who: CH_VOSS, text: "\"We all agreed to hide the fracture data until relief arrived. I kept us alive. That is the only confession I owe tonight.\"" },
      { id: "s1_18", who: CH_SEVEN, text: "\"Incoming signal,\" Seven interrupts. \"Origin: medical bay, deck four. Payload: voice, human, unknown language translated as one word — your name.\"" },
      { id: "s1_19", text: "The lights die. Emergency strips paint the bridge in red. Somewhere deep in the hull, something knocks three times on metal." },
      { id: "s1_20", who: CH_KAI, text: "\"That's not a malfunction,\" Kai whispers. \"That's a knock.\" Your heartbeat is louder than the alarm." },
    ], { defaultBg: BG_BRIDGE, startX: mergeX });

    var ch2RouterX = ep1b.lastX + NODE_SPACING;
    var ROUTE_LAB = "route_lab";
    var ROUTE_ANT = "route_ant";
    var ROUTE_ELSE = "__scena_else__";

    var s2_router = routeGate("s2_router", ch2RouterX, 180, [
      { id: ROUTE_LAB, label: "Lab route", choiceIds: [C_LAB] },
      { id: ROUTE_ANT, label: "Antenna route", choiceIds: [C_ANT] },
    ]);

    var flavorX = ch2RouterX + NODE_SPACING;
    var s2_lab_open = chain([
      { id: "s2_lab_01", bg: BG_LAB, who: CH_VOSS, text: "You still smell ozone from the sample lockers. Whatever you found in the lab follows you toward medical bay like a second shadow." },
    ], { defaultBg: BG_LAB, startX: flavorX, y: 100 });

    var s2_ant_open = chain([
      { id: "s2_ant_01", bg: BG_DOCK, who: CH_KAI, text: "Dock C's wind is still in your ears. The antenna ping — from beneath the hull — won't leave your thoughts as you head to deck four." },
    ], { defaultBg: BG_DOCK, startX: flavorX, y: 100 + LANE_OFFSET });

    var ep2mergeX = flavorX + NODE_SPACING;
    var ep2a = chain([
      { id: "s2_02", bg: BG_CORRIDOR, text: "Deck four is colder than the rest of the station. Your breath fogs inside your helmet seal. Seven's flashlight cuts a path through drifting dust." },
      { id: "s2_03", who: CH_SEVEN, text: "\"Medical bay power draw spiked twelve minutes ago. No crew member logged entry. I would note that the bay's inner lock opened from the inside.\"" },
      { id: "s2_04", text: "A streak of handprint blood smears the access panel. The pattern is wrong — too many fingers, or not enough." },
      { id: "s2_05", who: CH_KAI, text: "Kai catches your arm. \"We go together. If Voss lied about cryo, she lied about the moon cores too. I won't let you walk in alone.\"" },
      { id: "s2_06", bg: BG_LAB, text: "Medical bay has been rearranged. Beds pushed aside. Monitors face the wall. In the center sits a radio rig built from scrap and bone-white cable." },
      { id: "s2_07", who: CH_VOSS, text: "Voss stands beside the rig, unarmed, exhausted. \"I tried to tell you at the bridge. The signal isn't from outside. It's a message we sent ourselves — from tomorrow.\"" },
      { id: "s2_08", text: "The radio clicks. A voice pours out — your voice — describing the station's destruction in detail that hasn't happened yet." },
      { id: "s2_09", who: CH_SEVEN, text: "\"Translation confidence: ninety-seven percent. Recommendation: do not trust temporal echoes. Secondary recommendation: you never listen to me.\"" },
      { id: "s2_10", text: "The echo says to vent Dock C. The echo says to purge the lab seals. The echo says only one of you will leave Kerberos-9 alive." },
      { id: "s2_11", text: "Voss turns to you. \"I need a choice before the others hear the full recording. Help me destroy the rig, or help me send the warning to Earth — even if Earth never answers.\"", choices: [
        { id: C_TRUST, label: "Trust Voss — send the warning", choiceText: "Trust Voss — send the warning" },
        { id: C_DOUBT, label: "Smash the rig — cut the signal", choiceText: "Smash the rig — cut the signal" },
      ] },
    ], { defaultBg: BG_BRIDGE, startX: ep2mergeX });

    var s2_trust = chain([
      { id: "s2_trust_01", who: CH_VOSS, text: "Voss's hands shake as she keys the sequence. \"If they're still out there, they'll know we found the fracture — and what it sings.\"" },
      { id: "s2_trust_02", who: CH_SEVEN, text: "\"Transmission launched. Return ping detected.\" Seven pauses. \"Ping source: lunar surface. Distance: zero meters. We are standing on the thing that answered.\"" },
    ], { defaultBg: BG_BRIDGE, startX: ep2a.lastX + NODE_SPACING });

    var s2_doubt = chain([
      { id: "s2_doubt_01", who: CH_KAI, text: "Kai wrenches the rig apart. Sparks rain across the floor. \"No more futures. No more whispers. We fix the station with our hands.\"" },
      { id: "s2_doubt_02", who: CH_SEVEN, text: "\"Signal terminated.\" Seven's tone is almost gentle. \"However, the knock on deck four has begun again. Frequency: matching your heartbeat.\"" },
    ], { defaultBg: BG_LAB, startX: ep2a.lastX + NODE_SPACING, y: 100 + LANE_OFFSET });

    var ep2endX = ep2a.lastX + NODE_SPACING * 3 + 440;
    var ep2c = chain([
      { id: "s2_12", bg: BG_DOCK, text: "Dock C shudders. Through the viewport, the moon's fracture line pulses with a faint light — not reflected sunlight. Something beneath the regolith is awake." },
      { id: "s2_13", who: CH_KAI, text: "\"Relief ship isn't coming,\" Kai says. \"Maybe it never was. Maybe we were always the rescue party for something buried down there.\"" },
      { id: "s2_14", who: CH_VOSS, text: "Voss meets your eyes. \"Chapter two ends here, but the story doesn't. Tomorrow we take the elevator to the fracture. Tonight — you decide who stands watch.\"" },
      { id: "s2_15", who: CH_SEVEN, text: "\"I will stand watch,\" Seven says. \"I do not sleep. I do not flinch. I also do not forgive liars — but I protect crew. That includes you.\"" },
      { id: "s2_16", text: "The station exhales. Somewhere, the unknown signal folds itself into the walls and waits. You still don't know who knocked. You know they will knock again.", isEnd: true },
    ], { defaultBg: BG_DOCK, startX: ep2endX });

    var nodes = ep1a.nodes.concat(
      s1_lab.nodes, s1_ant.nodes, ep1b.nodes,
      [s2_router], s2_lab_open.nodes, s2_ant_open.nodes,
      ep2a.nodes, s2_trust.nodes, s2_doubt.nodes, ep2c.nodes
    );
    var edges = ep1a.edges.concat(
      s1_lab.edges, s1_ant.edges, ep1b.edges,
      s2_lab_open.edges, s2_ant_open.edges,
      ep2a.edges,
      s2_trust.edges, s2_doubt.edges,
      ep2c.edges
    );
    edges.push(edge("e_s1_lab", "s1_11", "s1_lab_01", C_LAB));
    edges.push(edge("e_s1_ant", "s1_11", "s1_ant_01", C_ANT));
    edges.push(edge("e_lab_merge", "s1_lab_03", "s1_12"));
    edges.push(edge("e_ant_merge", "s1_ant_03", "s1_12"));
    edges.push(edge("e_ep1_ch2", "s1_20", "s2_router"));
    edges.push(edge("e_route_lab", "s2_router", "s2_lab_01", ROUTE_LAB));
    edges.push(edge("e_route_ant", "s2_router", "s2_ant_01", ROUTE_ANT));
    edges.push(edge("e_route_else", "s2_router", "s2_02", ROUTE_ELSE));
    edges.push(edge("e_lab_s2", "s2_lab_01", "s2_02"));
    edges.push(edge("e_ant_s2", "s2_ant_01", "s2_02"));
    edges.push(edge("e_s2_trust", "s2_11", "s2_trust_01", C_TRUST));
    edges.push(edge("e_s2_doubt", "s2_11", "s2_doubt_01", C_DOUBT));
    edges.push(edge("e_trust_merge", "s2_trust_02", "s2_12"));
    edges.push(edge("e_doubt_merge", "s2_doubt_02", "s2_12"));

    nodes.push(logicBeat(
      "s1_trust_tick",
      midCoord(nodes, "s1_05", "s1_06", "x"),
      nodeCoord(nodes, "s1_05", "y"),
      "trust",
      5
    ));
    nodes.push(logicBeat(
      "s2_signal_tick",
      midCoord(nodes, "s2_02", "s2_03", "x"),
      nodeCoord(nodes, "s2_02", "y"),
      "signal",
      8
    ));
    nodes.push(logicBeat(
      "s2_trust_logic",
      midCoord(nodes, "s2_trust_01", "s2_trust_02", "x"),
      nodeCoord(nodes, "s2_trust_01", "y"),
      "trust",
      10
    ));
    nodes.push(logicBeat(
      "s2_doubt_logic",
      midCoord(nodes, "s2_doubt_01", "s2_doubt_02", "x"),
      nodeCoord(nodes, "s2_doubt_01", "y"),
      "trust",
      -8
    ));

    edges.forEach(function (e) {
      if (e.source === "s1_05" && e.target === "s1_06") e.target = "s1_trust_tick";
    });
    edges.push(edge("e_s1_trust", "s1_trust_tick", "s1_06"));

    edges.forEach(function (e) {
      if (e.source === "s2_02" && e.target === "s2_03") e.target = "s2_signal_tick";
    });
    edges.push(edge("e_s2_signal", "s2_signal_tick", "s2_03"));

    edges.forEach(function (e) {
      if (e.source === "s2_trust_01" && e.target === "s2_trust_02") e.target = "s2_trust_logic";
    });
    edges.push(edge("e_s2_trust_logic", "s2_trust_logic", "s2_trust_02"));

    edges.forEach(function (e) {
      if (e.source === "s2_doubt_01" && e.target === "s2_doubt_02") e.target = "s2_doubt_logic";
    });
    edges.push(edge("e_s2_doubt_logic", "s2_doubt_logic", "s2_doubt_02"));

    var ep1Boundary = 5100;
    var ep2Boundary = 9720;

    return {
      id: "signal-lost",
      title: "Signal Lost",
      slug: "signal-lost",
      shortDescription: "Sci-fi mystery aboard a station that stopped answering hails.",
      longDescription:
        "Kerberos-9 went quiet six hours ago — not static, not interference, but absolute silence. " +
        "Wake from cryo, walk the dead corridors, and trace a signal that shouldn't exist inside the hull.",
      thumbnailDataUrl: svgBg("#1a2438", "#0a0e18"),
      bannerDataUrl: svgBg("#2a3550", "#0c1220"),
      contentFlags: ["scifi", "strong language"],
      status: "published",
      createdAt: "2026-02-01T12:00:00.000Z",
      updatedAt: "2026-06-15T12:00:00.000Z",
      entryNodeId: "s1_01",
      metrics: [
        { key: "trust", displayName: "Crew trust", defaultValue: 50, hidden: false },
        { key: "signal", displayName: "Signal clarity", defaultValue: 35, hidden: false },
      ],
      assets: [],
      characterProfiles: [
        speaker(CH_VOSS, "Commander Voss", "#5a7a9a"),
        speaker(CH_KAI, "Kai", "#8a9aaa"),
        speaker(CH_SEVEN, "Seven", "#4a9d8f"),
      ],
      backgroundScenes: [
        bg(BG_BRIDGE, "Station bridge", "#0c1424", "#1a2840"),
        bg(BG_CORRIDOR, "Service corridor", "#14141c", "#242430"),
        bg(BG_LAB, "Research lab", "#0a1810", "#142820"),
        bg(BG_DOCK, "Exterior dock", "#050810", "#142038",
          '<circle cx="120" cy="80" r="1.2" fill="rgba(255,255,255,0.5)"/><circle cx="340" cy="140" r="0.8" fill="rgba(255,255,255,0.35)"/><circle cx="780" cy="60" r="1" fill="rgba(255,255,255,0.45)"/>'),
      ],
      nodes: nodes,
      edges: edges,
      episodes: [
        { id: "signal-ep-1", number: 1, title: "Silent Hail", startNodeId: "s1_01", boundaryX: ep1Boundary, isLive: true, publishedAt: "2026-03-01T18:00:00.000Z",
          branchEndings: [
            { id: "lab", label: "Lab route", exitNodeId: "s1_20", choiceIds: ["sig_c_lab"] },
            { id: "antenna", label: "Antenna route", exitNodeId: "s1_20", choiceIds: ["sig_c_ant"] },
          ],
        },
        { id: "signal-ep-2", number: 2, title: "Ghost Frequency", startNodeId: "s2_router", boundaryX: ep2Boundary, isLive: true, publishedAt: "2026-03-15T18:00:00.000Z",
          entryNodeIds: ["s2_router"],
          branchEndings: [
            { id: "trust", label: "Trust Voss", exitNodeId: "s2_16", choiceIds: ["sig_c_trust"] },
            { id: "doubt", label: "Smash the rig", exitNodeId: "s2_16", choiceIds: ["sig_c_doubt"] },
          ],
        },
      ],
      readerUi: null,
    };
  }

  var BUILDERS = {
    "cafe-at-sunset": buildCafeAtSunset,
    "signal-lost": buildSignalLost,
  };

  var TEMPLATE_CATALOG = [
    {
      id: "cafe-at-sunset",
      title: "Café at Sunset",
      description: "Romance demo — Ch.2 picks up from where Ch.1 ended (Ren vs Sora path). Contrast with Signal Lost's Route Gate.",
    },
    {
      id: "signal-lost",
      title: "Signal Lost",
      description: "Sci-fi demo — lab vs antenna in ch.1, Route Gate in ch.2, trust vs doubt fork.",
    },
  ];

  var cache = {};

  window.ScenaDemo = {
    BUILDERS: BUILDERS,
    TEMPLATE_CATALOG: TEMPLATE_CATALOG,

    listTemplates: function () {
      return TEMPLATE_CATALOG.slice();
    },

    templateIds: function () {
      return TEMPLATE_CATALOG.map(function (t) { return t.id; });
    },

    isDemo: function (seriesId) {
      return !!BUILDERS[seriesId];
    },

    getSeries: function (seriesId) {
      var build = BUILDERS[seriesId];
      if (!build) return null;
      if (!cache[seriesId]) cache[seriesId] = build();
      var copy = JSON.parse(JSON.stringify(cache[seriesId]));
      if (window.ScenaStore && ScenaStore.normalizeSeries) {
        ScenaStore.normalizeSeries(copy);
      }
      return copy;
    },

    getEpisode: function (seriesId, episodeId) {
      var series = this.getSeries(seriesId);
      if (!series) return null;
      return (series.episodes || []).find(function (ep) { return ep.id === episodeId; }) || null;
    },

    firstEpisodeId: function (seriesId) {
      var series = this.getSeries(seriesId);
      if (!series || !series.episodes || !series.episodes.length) return null;
      var ordered = window.ScenaStore && ScenaStore.orderedEpisodes
        ? ScenaStore.orderedEpisodes(series)
        : series.episodes.slice().sort(function (a, b) { return (a.number || 0) - (b.number || 0); });
      return ordered[0] ? ordered[0].id : null;
    },

    episodePlayUrl: function (seriesId, episodeId) {
      if (window.ScenaStore && ScenaStore.episodePlayUrl) {
        return ScenaStore.episodePlayUrl(seriesId, episodeId);
      }
      return "/play?series=" + encodeURIComponent(seriesId) +
        "&episode=" + encodeURIComponent(episodeId);
    },

    playUrl: function (seriesId) {
      if (window.ScenaProgress && ScenaProgress.seriesMenuUrl) {
        return ScenaProgress.seriesMenuUrl(seriesId);
      }
      var epId = this.firstEpisodeId(seriesId);
      return epId ? this.episodePlayUrl(seriesId, epId) : "/series?series=" + encodeURIComponent(seriesId);
    },

    seriesMenuUrl: function (seriesId) {
      return "/series?series=" + encodeURIComponent(seriesId);
    },
  };
})();
