import type { BadgeProgress } from "../../domain/learn/types";
import type { BadgeDefinition, LaurelSummary } from "../../domain/badges/types";

export type BadgeUnlock = {
  id: string;
  title: string;
  icon: string;
  description?: string;
};

export interface BadgePort {
  init(userId: string | null): Promise<void>;
  checkAll(userId: string | null): void;
  listBadges(category?: string): BadgeDefinition[];
  getProgress(userId: string | null): BadgeProgress;
  getLaurelSummary(userId: string | null): LaurelSummary;
  isUnlocked(badgeId: string, userId: string | null): boolean;
  lessonBadgeId(lessonId: string): string;
  isLessonComplete(lessonId: string, userId: string | null): boolean;
  recordLessonComplete(lessonId: string, userId: string | null): BadgeUnlock[];
  showUnlockCelebration(badges: BadgeUnlock[], toast: (message: string) => void): void;
}
