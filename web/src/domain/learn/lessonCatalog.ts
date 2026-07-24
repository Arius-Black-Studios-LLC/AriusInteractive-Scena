import type { LessonMeta } from "./types";

export type LessonCatalogEntry = LessonMeta & {
  mode: "graph" | "resources";
};

/** Conservatory curriculum metadata — runtime setup/validate remain in docs/learn-lessons.js */
export const LESSON_CATALOG: LessonCatalogEntry[] = [
  {
    id: "connect-two-nodes",
    title: "The through-line",
    category: "Blocking & cues",
    order: 1,
    mode: "graph",
    summary: "Link two beats into one unbroken scene — the thread that carries an act forward.",
  },
  {
    id: "spawn-from-port",
    title: "Entrance from the wings",
    category: "Blocking & cues",
    order: 2,
    mode: "graph",
    summary: "When the next moment doesn't exist yet, bring it on from the wings.",
  },
  {
    id: "logic-metrics-reconverge",
    title: "Peripeteia & return",
    category: "Subtext & fate",
    order: 3,
    mode: "graph",
    summary:
      "Three paths diverge through silent Metrics block, then the plot reconverges — Aristotle's reversal in miniature.",
  },
  {
    id: "metric-add-subtract",
    title: "Fate's ledger",
    category: "Subtext & fate",
    order: 4,
    mode: "graph",
    summary:
      "Add and subtract from a hidden score using signed amounts — no separate operation control.",
  },
  {
    id: "setup-character",
    title: "Casting call",
    category: "Wardrobe & scenery",
    order: 5,
    mode: "resources",
    summary: "Add a player to the dramatis personae — name, color, and pose.",
  },
  {
    id: "setup-stage",
    title: "Painted scene",
    category: "Wardrobe & scenery",
    order: 6,
    mode: "resources",
    summary: "Build a layered backdrop — the painted flats behind your dialogue.",
  },
  {
    id: "inherit-visuals",
    title: "Curtain rise",
    category: "Blocking & cues",
    order: 7,
    mode: "graph",
    summary: "Set stage and player on the opening beat — inheritance and override.",
  },
  {
    id: "publish-episode",
    title: "Opening night",
    category: "The house",
    order: 8,
    mode: "graph",
    summary: "Draw a chapter line — everything left is Episode 1, even with two endings.",
  },
  {
    id: "sound-design",
    title: "Orchestration",
    category: "Production",
    order: 9,
    mode: "graph",
    summary: "Layer inherited BGM, voice lines, and sound effects on your beats.",
  },
  {
    id: "route-gate-if-else",
    title: "The fork remembered",
    category: "Blocking & cues",
    order: 10,
    mode: "graph",
    summary:
      "Use a Flow gate when paths merge again — branch on a choice from far back in the story.",
  },
  {
    id: "chapter-memory-routes",
    title: "Two chapter openings",
    category: "The house",
    order: 11,
    mode: "graph",
    summary:
      "Split a whole chapter by prior choice — the Café at Sunset pattern with cross-chapter wires.",
  },
  {
    id: "metric-dialogue-branches",
    title: "Dialogue by the numbers",
    category: "Subtext & fate",
    order: 12,
    mode: "graph",
    summary: "Branch to different dialogue beats when a metric crosses a threshold.",
  },
  {
    id: "key-items-flow",
    title: "Keys in the flow",
    category: "Subtext & fate",
    order: 13,
    mode: "graph",
    summary:
      "Create a key item, grant it after a choice, branch with a Flow gate, and hide a choice until the reader has the item.",
  },
  {
    id: "choices-simple",
    title: "Fork in the road",
    category: "Blocking & cues",
    order: 14,
    mode: "graph",
    summary: "Wire a Choices block with plain options — every path visible, no hidden requirements.",
  },
  {
    id: "choices-one-gate",
    title: "Whispers only",
    category: "Subtext & fate",
    order: 15,
    mode: "graph",
    summary: "Hide one option until the reader made an earlier choice — the rest stay visible.",
  },
  {
    id: "choices-two-required",
    title: "Two ways in",
    category: "Subtext & fate",
    order: 16,
    mode: "graph",
    summary: "One fork — key, lockpick, or nothing. One Unlock choice appears with either tool.",
  },
  {
    id: "choices-or-same-path",
    title: "Both halves of the ticket",
    category: "Subtext & fate",
    order: 17,
    mode: "graph",
    summary: "Old-house puzzle — both medallions in one run before the door will open.",
  },
  {
    id: "metrics-affection-supplies",
    title: "Hearts & tallies",
    category: "Subtext & fate",
    order: 18,
    mode: "graph",
    summary:
      "Hidden affection unlocks a special route; potion tallies rise and fall through Metrics blocks.",
  },
];

export function getLessonMeta(id: string): LessonCatalogEntry | undefined {
  return LESSON_CATALOG.find((lesson) => lesson.id === id);
}

export function listLessonMeta(): LessonCatalogEntry[] {
  return LESSON_CATALOG.slice().sort((a, b) => a.order - b.order);
}
