import { useEffect, useState } from "react";
import { loadLegacyBundle, loadLegacyStylesheets } from "../legacy/loadLegacy";

export function useLegacyBundle(
  bundle: Parameters<typeof loadLegacyBundle>[0],
  styles: string[] = [],
) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadLegacyStylesheets(styles);
    loadLegacyBundle(bundle)
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load modules.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bundle, styles.join("|")]);

  return { ready, error };
}
