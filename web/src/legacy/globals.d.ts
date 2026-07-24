/* Legacy globals bridged from docs/*.js — storage keys unchanged for user data compatibility */

export type LegacySession = {
  user: { id: string; email?: string };
} | null;

export type CatalogEntry = {
  id: string;
  title: string;
  description: string;
  genres: string;
  epLabel?: string;
  href: string;
  cover: string;
  flags: string[];
  readersLabel?: string;
  readersThisWeekLabel?: string;
  chaptersReadThisWeekLabel?: string;
  thumbStyle?: string;
  isDemo?: boolean;
  genreKeys?: string[];
  isAgeRestricted?: boolean;
};

declare global {
  interface Window {
    ARLECO_CONFIG?: {
      supabaseUrl: string;
      supabaseAnonKey: string;
      authRedirectUrl?: string;
    };
    SCENA_CONFIG?: Window["ARLECO_CONFIG"];
    supabase?: {
      createClient: (
        url: string,
        key: string,
        opts?: Record<string, unknown>,
      ) => unknown;
    };
    ScenaAuth?: {
      isConfigured: () => boolean;
      init: () => Promise<LegacySession>;
      signInWithEmail: (email: string, role?: string, path?: string) => Promise<void>;
      signOut: () => Promise<void>;
      getClient: () => unknown;
      onSessionChange?: (session: LegacySession) => void;
    };
    ScenaCatalog?: {
      listDiscover: (userId: string | null) => Promise<CatalogEntry[]>;
      resolveSeries: (seriesId: string, userId: string | null) => Promise<unknown>;
      fetchReaderStats: () => Promise<unknown>;
      enrichReaderStats: (entries: CatalogEntry[], stats: unknown) => unknown;
      renderDiscoverGrid?: (el: HTMLElement, entries: CatalogEntry[], bundle: unknown) => void;
    };
    ScenaJams?: {
      listHomeSubmissionFeed: (opts: Record<string, unknown>) => Promise<
        Array<{
          jamId: string;
          jamTitle: string;
          tagline: string;
          theme: string;
          phase: string;
          prizePool: number;
          ageRestricted: boolean;
          href: string;
          totalSubmissions: number;
          submissions: Array<{
            id: string;
            seriesTitle: string;
            episodeTitle: string;
            userName: string;
            submittedAt: string;
            playHref: string;
            likes: number;
          }>;
        }>
      >;
    };
    ScenaStore?: Record<string, unknown>;
    ScenaProgress?: Record<string, unknown>;
    ScenaPlayer?: new (
      container: HTMLElement,
      series: unknown,
      options: Record<string, unknown>,
    ) => {
      startEpisode: (episode: unknown, opts?: Record<string, unknown>) => boolean;
      destroy: () => void;
    };
    ScenaProfile?: {
      get: (userId: string, session: LegacySession) => Promise<Record<string, unknown>>;
      update: (
        userId: string,
        patch: Record<string, unknown>,
        ctx: Record<string, unknown>,
      ) => Promise<Record<string, unknown>>;
      authorSnapshot: (profile: Record<string, unknown>) => Record<string, unknown>;
      isAdultVerified?: (profile?: Record<string, unknown>) => boolean;
      seriesNeedsAgeGate?: (series: { contentFlags?: string[] }) => boolean;
    };
    ScenaAccount?: {
      renderPage: (profile: Record<string, unknown>, ctx: Record<string, unknown>) => string;
      bindPage: (profile: Record<string, unknown>, ctx: Record<string, unknown>) => void;
      paintTopbar: (
        el: HTMLElement | null,
        profile: Record<string, unknown>,
        ctx: Record<string, unknown>,
      ) => void;
    };
    ScenaLearnApp?: { start: (userId: string | null) => void };
    ScenaLearnLessons?: Array<Record<string, unknown>>;
    ScenaLearnSandbox?: new (
      container: HTMLElement,
      lesson: Record<string, unknown>,
      callbacks: { onChange: (result: { ok: boolean; message?: string; hint?: string }) => void },
    ) => { graph?: { destroy?: () => void } };
    ScenaBadges?: {
      all: Array<{
        id: string;
        title: string;
        description: string;
        icon: string;
        category: string;
      }>;
      init: (userId?: string | null) => Promise<unknown>;
      checkAll: (userId?: string | null) => unknown;
      getProgress: (userId?: string | null) => Record<string, unknown>;
      isUnlocked: (badgeId: string, userId?: string | null) => boolean;
      lessonBadgeId: (lessonId: string) => string;
      recordLessonComplete: (lessonId: string, userId?: string | null) => unknown[];
      renderSummary: (container: HTMLElement, userId?: string | null) => void;
      renderGrid: (container: HTMLElement, opts?: { userId?: string | null }) => void;
      showUnlockCelebration: (
        badges: unknown[],
        toast: (msg: string) => void,
      ) => void;
      _defaultToast?: (msg: string) => void;
    };
    ScenaStudio?: {
      start: (session: LegacySession) => void;
      navigate?: (hashPath: string) => void;
      toast?: (message: string) => void;
    };
    ScenaGraphEditor?: new (
      container: HTMLElement,
      options: Record<string, unknown>,
    ) => {
      openEpisodeFromGraph?: (episodeId: string) => void;
      selectNode?: (nodeId: string) => void;
    };
    ScenaGraphEditorBridge?: import("./ports/GraphEditorPort").GraphEditorPort;
    ScenaFeedback?: {
      mountHomepage: (id: string) => void;
      fetchPublicReviews: () => Promise<unknown[]>;
    };
    ScenaComments?: { load: (seriesId: string, episodeId: string) => Promise<void> };
    ScenaHearts?: { load: (seriesId: string, episodeId: string) => Promise<void> };
    ScenaWallet?: {
      load: (userId: string) => Promise<{ balance?: number; purchased?: boolean }>;
      getBalance: (userId: string) => number;
      formatDucats: (n: number) => string;
      renderPackGrid: (opts?: { buttonClass?: string }) => string;
      bindPackButtons: (
        root: HTMLElement | null,
        scopeId: string,
        onSuccess?: (result?: { redirecting?: boolean; purchased?: boolean }) => void,
        onError?: (err: Error) => void,
      ) => void;
      purchasePack?: (
        scopeId: string,
        packId: string,
      ) => Promise<{ redirecting?: boolean; purchased?: boolean }>;
    };
    ScenaDemo?: { getSeries: (id: string) => unknown };
  }
}

export {};
