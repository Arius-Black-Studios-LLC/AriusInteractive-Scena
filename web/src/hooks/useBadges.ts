import { useMemo } from "react";
import type { BadgeDefinition, LaurelSummary } from "../domain/badges/types";
import { badgeAdapter } from "../legacy/adapters";
import { useLearnContext } from "../context/LearnContext";

export type BadgeViewModel = BadgeDefinition & { unlocked: boolean };

export function useBadges(category?: string): {
  badges: BadgeViewModel[];
  summary: LaurelSummary;
} {
  const { userId, ready, progressTick } = useLearnContext();

  return useMemo(() => {
    if (!ready) {
      return { badges: [], summary: { unlocked: 0, total: 0 } };
    }
    const definitions = badgeAdapter.listBadges(category);
    const summary = badgeAdapter.getLaurelSummary(userId);
    const badges = definitions.map((badge) => ({
      ...badge,
      unlocked: badgeAdapter.isUnlocked(badge.id, userId),
    }));
    return { badges, summary };
  }, [ready, userId, progressTick, category]);
}
