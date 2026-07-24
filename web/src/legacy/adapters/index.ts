import type { LegacySession } from "../globals.d.ts";
import { badgeAdapter } from "./badgeAdapter";
import { studioAdapter } from "./studioAdapter";

export { badgeAdapter } from "./badgeAdapter";
export { graphEditorAdapter } from "./graphEditorAdapter";
export { learnAdapter } from "./learnAdapter";
export { studioAdapter } from "./studioAdapter";
export function startStudio(session: LegacySession): Promise<void> {
  return studioAdapter.boot(session);
}

export function mountHomepageReviews(anchorId: string): void {
  window.ScenaFeedback?.mountHomepage(anchorId);
}

/** @deprecated Conservatory is React-routed; use learnAdapter + badgeAdapter */
export function startLearnApp(userId: string | null): void {
  void badgeAdapter.init(userId).then(() => badgeAdapter.checkAll(userId));
}
