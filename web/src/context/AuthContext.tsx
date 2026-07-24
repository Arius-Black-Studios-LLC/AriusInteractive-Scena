import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loadLegacyScripts } from "../legacy/loadLegacy";
import type { LegacySession } from "../legacy/globals.d.ts";

type AuthContextValue = {
  session: LegacySession;
  userId: string | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, role?: string, postLogin?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LegacySession>(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);

  const refresh = useCallback(async () => {
    await loadLegacyScripts(["scena-auth.js"]);
    const auth = window.ScenaAuth;
    if (!auth?.isConfigured()) {
      setConfigured(false);
      setSession(null);
      setLoading(false);
      return;
    }
    setConfigured(true);
    auth.onSessionChange = (next) => {
      setSession(next);
      setLoading(false);
    };
    const next = await auth.init();
    setSession(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, [refresh]);

  const signIn = useCallback(
    async (email: string, role?: string, postLogin?: string) => {
      if (postLogin) {
        try {
          sessionStorage.setItem("scena_post_login", postLogin);
        } catch {
          /* private mode */
        }
      }
      await loadLegacyScripts(["scena-auth.js"]);
      if (!window.ScenaAuth) throw new Error("Auth failed to load.");
      await window.ScenaAuth.signInWithEmail(email, role, postLogin);
    },
    [],
  );

  const signOut = useCallback(async () => {
    await loadLegacyScripts(["scena-auth.js"]);
    await window.ScenaAuth?.signOut();
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({
      session,
      userId: session?.user?.id ?? null,
      loading,
      configured,
      signIn,
      signOut,
      refresh,
    }),
    [session, loading, configured, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
