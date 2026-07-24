import type { BadgeProgress } from "../../domain/learn/types";
import type { BadgeDefinition } from "../../domain/badges/types";
import type { BadgePort, BadgeUnlock } from "../ports/BadgePort";

function defaultProgress(): BadgeProgress {
  return {
    unlocked: [],
    stats: {
      lessonsCompleted: [],
      seriesCount: 0,
      publishedEpisodes: 0,
      totalReaders: 0,
    },
  };
}

export const badgeAdapter: BadgePort = {
  async init(userId) {
    if (!window.ScenaBadges?.init) return;
    await window.ScenaBadges.init(userId);
  },

  checkAll(userId) {
    window.ScenaBadges?.checkAll(userId ?? undefined);
  },

  listBadges(category) {
    const all = (window.ScenaBadges?.all || []) as BadgeDefinition[];
    if (!category) return all;
    return all.filter((badge) => badge.category === category);
  },

  getProgress(userId) {
    if (!window.ScenaBadges?.getProgress) return defaultProgress();
    return window.ScenaBadges.getProgress(userId ?? undefined) as BadgeProgress;
  },

  getLaurelSummary(userId) {
    const progress = this.getProgress(userId);
    const total = this.listBadges().length;
    return { unlocked: progress.unlocked.length, total };
  },

  isUnlocked(badgeId, userId) {
    return window.ScenaBadges?.isUnlocked(badgeId, userId ?? undefined) ?? false;
  },

  lessonBadgeId(lessonId) {
    return window.ScenaBadges?.lessonBadgeId
      ? window.ScenaBadges.lessonBadgeId(lessonId)
      : `lesson_${lessonId}`;
  },

  isLessonComplete(lessonId, userId) {
    const progress = this.getProgress(userId);
    return progress.stats.lessonsCompleted.includes(lessonId);
  },

  recordLessonComplete(lessonId, userId) {
    if (!window.ScenaBadges?.recordLessonComplete) return [];
    return (window.ScenaBadges.recordLessonComplete(lessonId, userId ?? undefined) ||
      []) as BadgeUnlock[];
  },

  showUnlockCelebration(badges, toast) {
    window.ScenaBadges?.showUnlockCelebration(badges, toast);
  },
};
