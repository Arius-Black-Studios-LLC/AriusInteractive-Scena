import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { useLegacyBundle } from "../hooks/useLegacyBundle";
import { badgeAdapter } from "../legacy/adapters";

type LearnContextValue = {
  ready: boolean;
  error: string | null;
  userId: string | null;
  showToast: (message: string) => void;
  refreshProgress: () => void;
  progressTick: number;
};

const LearnContext = createContext<LearnContextValue | null>(null);

export function LearnProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const { ready: bundleReady, error } = useLegacyBundle("learn", [
    "studio.css",
    "play.css",
    "learn.css",
    "scena-logo.css",
    "arleco-theme.css",
  ]);
  const [booted, setBooted] = useState(false);
  const [progressTick, setProgressTick] = useState(0);

  const showToast = useCallback((message: string) => {
    const el = document.getElementById("learnToast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("is-show");
    window.setTimeout(() => el.classList.remove("is-show"), 3200);
  }, []);

  const refreshProgress = useCallback(() => {
    setProgressTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!bundleReady) {
      setBooted(false);
      return;
    }
    let cancelled = false;
    badgeAdapter
      .init(userId)
      .then(() => {
        if (cancelled) return;
        badgeAdapter.checkAll(userId);
        if (window.ScenaBadges) {
          window.ScenaBadges._defaultToast = showToast;
        }
        setBooted(true);
      })
      .catch(() => {
        if (!cancelled) setBooted(true);
      });
    return () => {
      cancelled = true;
    };
  }, [bundleReady, userId, showToast]);

  const value = useMemo(
    () => ({
      ready: bundleReady && booted,
      error,
      userId,
      showToast,
      refreshProgress,
      progressTick,
    }),
    [bundleReady, booted, error, userId, showToast, refreshProgress, progressTick],
  );

  return <LearnContext.Provider value={value}>{children}</LearnContext.Provider>;
}

export function useLearnContext() {
  const ctx = useContext(LearnContext);
  if (!ctx) throw new Error("useLearnContext must be used within LearnProvider");
  return ctx;
}
