/**
 * Typed facades over window.* legacy globals.
 * React pages depend on these adapters — not on concrete legacy script internals (DIP).
 */
import type { LegacySession } from "./globals.d.ts";

export function startLearnApp(userId: string | null): void {
  if (!window.ScenaLearnApp?.start) {
    throw new Error("Conservatory modules failed to load.");
  }
  window.ScenaLearnApp.start(userId);
}

export function startStudio(session: LegacySession): void {
  if (!window.ScenaStudio?.start) {
    throw new Error("Studio modules failed to load.");
  }
  window.ScenaStudio.start(session);
}

export function mountHomepageReviews(anchorId: string): void {
  window.ScenaFeedback?.mountHomepage(anchorId);
}
