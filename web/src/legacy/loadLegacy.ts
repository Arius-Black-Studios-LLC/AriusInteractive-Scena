const SUPABASE_CDN =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";

let configInjected = false;
let supabaseLoaded = false;
const loaded = new Set<string>();

export function injectLegacyConfig(): void {
  if (configInjected) return;
  const cfg = {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL || "",
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
    authRedirectUrl:
      import.meta.env.VITE_AUTH_REDIRECT_URL || `${window.location.origin}/`,
  };
  window.ARLECO_CONFIG = cfg;
  window.SCENA_CONFIG = cfg;
  configInjected = true;
}

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

export async function loadSupabaseCdn(): Promise<void> {
  if (supabaseLoaded || window.supabase) {
    supabaseLoaded = true;
    return;
  }
  await loadScript(SUPABASE_CDN);
  supabaseLoaded = true;
}

export async function loadLegacyScripts(paths: string[]): Promise<void> {
  injectLegacyConfig();
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
    "learn-app.js",
  ],
  feedback: ["scena-feedback.js"],
} as const;

export async function loadLegacyBundle(
  bundle: keyof typeof LEGACY_BUNDLES,
): Promise<void> {
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
