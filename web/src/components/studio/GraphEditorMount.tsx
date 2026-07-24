import { useEffect, useRef } from "react";
import { graphEditorAdapter } from "../../legacy/adapters/graphEditorAdapter";
import type { GraphEditorOptions } from "../../legacy/ports/GraphEditorPort";

type Props = {
  options: GraphEditorOptions;
  openEpisodeId?: string | null;
  className?: string;
};

/**
 * React shell for the legacy ScenaGraphEditor. Keeps the graph widget behind
 * GraphEditorPort so we can replace the canvas incrementally later.
 */
export function GraphEditorMount({ options, openEpisodeId, className }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = rootRef.current;
    if (!container) return;

    const handle = graphEditorAdapter.create(container, options);

    if (openEpisodeId) {
      window.setTimeout(() => {
        handle.openEpisodeFromGraph?.(openEpisodeId);
      }, 0);
    }

    return () => handle.destroy?.();
  }, [options, openEpisodeId]);

  return <div ref={rootRef} className={className ?? "page-wide graph-editor-mount"} />;
}
