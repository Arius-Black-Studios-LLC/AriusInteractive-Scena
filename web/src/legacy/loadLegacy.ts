const SUPABASE_CDN =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";

let configInjected = false;
let configReady: Promise<void> | null = null;
let supabaseLoaded = false;
const loaded = new Set<string>();

function loadScript(src: string): Promise<void> {
  if (loaded.has(src)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-legacy-src="${src}"]`);
    if (existing) {
      loaded.add(src);
      resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = false;
    el.dataset.legacySrc = src;
    el.onload = () => {
      loaded.add(src);
      resolve();
    };
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(el);
  });
}

/** Loads docs/scena-config.js when Vite env vars are empty, then merges into window.ARLECO_CONFIG */
export async function ensureLegacyConfig(): Promise<void> {
  if (configInjected) return;
  if (configReady) return configReady;

  configReady = (async () => {
    const hasEnv = Boolean(
      import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
    );
    if (!hasEnv) {
      try {
        await loadScript("/legacy/scena-config.js");
      } catch {
        /* optional local config file */
      }
    }

    const existing = (window.ARLECO_CONFIG || window.SCENA_CONFIG || {}) as NonNullable<
      Window["ARLECO_CONFIG"]
    >;
    const cfg = {
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL || existing.supabaseUrl || "",
      supabaseAnonKey:
        import.meta.env.VITE_SUPABASE_ANON_KEY || existing.supabaseAnonKey || "",
      authRedirectUrl:
        import.meta.env.VITE_AUTH_REDIRECT_URL ||
        existing.authRedirectUrl ||
        `${window.location.origin}/`,
    };
    window.ARLECO_CONFIG = cfg;
    window.SCENA_CONFIG = cfg;
    configInjected = true;
  })();

  return configReady;
}

export async function loadSupabaseCdn(): Promise<void> {
  if (supabaseLoaded || window.supabase) {
    supabaseLoaded = true;
    return;
  }
  await loadScript(SUPABASE_CDN);
  supabaseLoaded = true;
}

export async function loadLegacyScripts(paths: string[]): Promise<void> {
  await ensureLegacyConfig();
  await loadSupabaseCdn();
  for (const file of paths) {
    await loadScript(`/legacy/${file}`);
  }
}

export const LEGACY_BUNDLES = {
  reader: [
    "scena-cloud.js",
    "studio-store.js",
    "scena-demo-series.js",
    "scena-catalog.js",
    "scena-progress.js",
    "scena-feedback.js",
  ],
  player: [
    "scena-cloud.js",
    "studio-store.js",
    "scena-demo-series.js",
    "scena-catalog.js",
    "scena-progress.js",
    "scena-default-audio.js",
    "scena-key-item-icons.js",
    "scena-key-item.js",
    "scena-comments.js",
    "scena-hearts.js",
    "scena-profile.js",
    "scena-audio.js",
    "scena-reader-menu.js",
    "scena-player.js",
  ],
  account: ["scena-profile.js", "scena-account.js"],
  studio: [
    "scena-cloud.js",
    "studio-store.js",
    "scena-badges.js",
    "scena-default-audio.js",
    "scena-key-item-icons.js",
    "scena-key-item.js",
    "scena-progress.js",
    "scena-wallet.js",
    "scena-feedback.js",
    "scena-marketplace.js",
    "scena-asset-library.js",
    "scena-jams.js",
    "scena-audio.js",
    "scena-reader-menu.js",
    "studio-graph.js",
    "studio-app.js",
  ],
  learn: [
    "scena-cloud.js",
    "studio-store.js",
    "scena-default-audio.js",
    "scena-key-item-icons.js",
    "scena-key-item.js",
    "scena-audio.js",
    "scena-reader-menu.js",
    "studio-graph.js",
    "scena-badges.js",
    "learn-lessons.js",
    "learn-sandbox.js",
    "learn-mascots.js",
  ],
} as const;

export type LegacyBundle = keyof typeof LEGACY_BUNDLES;

export async function loadLegacyBundle(bundle: LegacyBundle): Promise<void> {
  await loadLegacyScripts(["scena-auth.js", ...LEGACY_BUNDLES[bundle]]);
}

export function loadLegacyStylesheets(files: string[]): void {
  for (const file of files) {
    const href = `/legacy/${file}`;
    if (document.querySelector(`link[data-legacy-href="${href}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.legacyHref = href;
    document.head.appendChild(link);
  }
}
