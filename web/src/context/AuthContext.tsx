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
  profileLoading: boolean;
  isAdmin: boolean;
  configured: boolean;
  signIn: (email: string, role?: string, postLogin?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LegacySession>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
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

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || !session) {
      setIsAdmin(false);
      setProfileLoading(false);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);
    loadLegacyScripts(["scena-auth.js", "scena-profile.js"])
      .then(() => window.ScenaProfile?.get(userId, session))
      .then((profile) => {
        if (cancelled) return;
        setIsAdmin(!!profile?.isAdmin);
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  const refreshProfile = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId || !session) {
      setIsAdmin(false);
      return;
    }
    setProfileLoading(true);
    try {
      await loadLegacyScripts(["scena-auth.js", "scena-profile.js"]);
      window.ScenaProfile?.clearCache?.(userId);
      const profile = await window.ScenaProfile?.get(userId, session);
      setIsAdmin(!!profile?.isAdmin);
    } catch {
      setIsAdmin(false);
    } finally {
      setProfileLoading(false);
    }
  }, [session]);

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
    setIsAdmin(false);
  }, []);

  const value = useMemo(
    () => ({
      session,
      userId: session?.user?.id ?? null,
      loading,
      profileLoading,
      isAdmin,
      configured,
      signIn,
      signOut,
      refresh,
      refreshProfile,
    }),
    [session, loading, profileLoading, isAdmin, configured, signIn, signOut, refresh, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
