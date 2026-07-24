import type { LegacySession } from "../globals.d.ts";
import { badgeAdapter } from "./badgeAdapter";
import { learnAdapter } from "./learnAdapter";

export { badgeAdapter } from "./badgeAdapter";
export { learnAdapter } from "./learnAdapter";

export function startStudio(session: LegacySession): void {
  if (!window.ScenaStudio?.start) {
    throw new Error("Studio modules failed to load.");
  }
  window.ScenaStudio.start(session);
}

export function mountHomepageReviews(anchorId: string): void {
  window.ScenaFeedback?.mountHomepage(anchorId);
}

/** @deprecated Conservatory is React-routed; use learnAdapter + badgeAdapter */
export function startLearnApp(userId: string | null): void {
  void badgeAdapter.init(userId).then(() => badgeAdapter.checkAll(userId));
}
