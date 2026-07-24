import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useLegacyBundle } from "../hooks/useLegacyBundle";
import { studioAdapter, graphEditorAdapter } from "../legacy/adapters";

type StudioContextValue = {
  ready: boolean;
  error: string | null;
  bootError: string | null;
  userEmail: string;
  navigateStudio: (hashPath: string) => void;
  showToast: (message: string) => void;
};

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const { session, userId, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { ready: bundleReady, error: bundleError } = useLegacyBundle("studio", [
    "studio.css",
    "play.css",
    "scena-logo.css",
    "arleco-theme.css",
  ]);
  const [booted, setBooted] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    if (!bundleReady) return;
    window.ScenaGraphEditorBridge = graphEditorAdapter;
    return () => {
      delete window.ScenaGraphEditorBridge;
    };
  }, [bundleReady]);

  useEffect(() => {
    if (authLoading) return;
    if (!userId || !session) {
      try {
        sessionStorage.setItem("scena_post_login", "/studio");
      } catch {
        /* ignore */
      }
      navigate("/?login=studio", { replace: true });
      return;
    }
    if (!bundleReady) {
      setBooted(false);
      return;
    }

    let cancelled = false;
    studioAdapter
      .boot(session)
      .then(() => {
        if (!cancelled) {
          setBooted(true);
          setBootError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setBootError(err instanceof Error ? err.message : "Could not open studio.");
          setBooted(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, userId, session, bundleReady, navigate]);

  const navigateStudio = useCallback((hashPath: string) => {
    studioAdapter.navigate(hashPath);
  }, []);

  const showToast = useCallback((message: string) => {
    studioAdapter.showToast(message);
  }, []);

  const value = useMemo(
    () => ({
      ready: bundleReady && booted,
      error: bundleError,
      bootError,
      userEmail: session?.user?.email || "",
      navigateStudio,
      showToast,
    }),
    [
      bundleReady,
      booted,
      bundleError,
      bootError,
      session?.user?.email,
      navigateStudio,
      showToast,
    ],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudioContext() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudioContext must be used within StudioProvider");
  return ctx;
}
