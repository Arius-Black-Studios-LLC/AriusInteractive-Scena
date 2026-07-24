import type { GraphEditorHandle, GraphEditorPort } from "../ports/GraphEditorPort";

type LegacyGraphEditor = GraphEditorHandle & {
  openEpisodeFromGraph: (episodeId: string) => void;
};

export const graphEditorAdapter: GraphEditorPort = {
  create(container, options) {
    const Editor = window.ScenaGraphEditor;
    if (!Editor) {
      throw new Error("Graph editor failed to load.");
    }

    const instance = new Editor(container, options) as LegacyGraphEditor;

    return {
      openEpisodeFromGraph(episodeId) {
        instance.openEpisodeFromGraph?.(episodeId);
      },
      selectNode(nodeId) {
        instance.selectNode?.(nodeId);
      },
      destroy() {
        container.innerHTML = "";
      },
    };
  },
};
