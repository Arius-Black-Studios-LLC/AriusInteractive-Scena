export type GraphEditorSaveResult = {
  ok?: boolean;
  warning?: string;
  error?: string;
  cloud?: boolean;
  local?: boolean;
  imagesPending?: boolean;
};

export type GraphEditorOptions = {
  series: unknown;
  feedbackUserId?: string | null;
  feedbackProfile?: unknown;
  feedbackContainer?: HTMLElement | null;
  onChange: (series: unknown) => Promise<GraphEditorSaveResult> | GraphEditorSaveResult;
  onSaveError?: (message: string) => void;
  onEpisodePublished?: () => void;
  learnMode?: boolean;
  learnResourcesTab?: string | null;
  learnPreviewPlay?: boolean;
  learnEpisodes?: boolean;
  learnSoundSettings?: boolean;
  learnKeyItemsPanel?: boolean;
  learnHighlightPorts?: unknown;
  learnValidate?: (series: unknown) => { ok: boolean; message?: string; hint?: string };
  onLearnChange?: (result: { ok: boolean; message?: string; hint?: string }) => void;
};

export type GraphEditorHandle = {
  openEpisodeFromGraph?: (episodeId: string) => void;
  selectNode?: (nodeId: string) => void;
  destroy?: () => void;
};

export interface GraphEditorPort {
  create(container: HTMLElement, options: GraphEditorOptions): GraphEditorHandle;
}
