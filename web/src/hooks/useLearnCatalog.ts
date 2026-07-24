import { useMemo } from "react";
import type { LearnCatalogState } from "../domain/learn/types";
import { badgeAdapter, learnAdapter } from "../legacy/adapters";
import { useLearnContext } from "../context/LearnContext";

export function useLearnCatalog(): LearnCatalogState {
  const { userId, ready, progressTick } = useLearnContext();

  return useMemo(() => {
    if (!ready) {
      return { lessons: [], completedIds: [], progress: null };
    }
    const lessons = learnAdapter.listLessons();
    const progress = badgeAdapter.getProgress(userId);
    return {
      lessons,
      completedIds: progress.stats.lessonsCompleted,
      progress,
    };
    // progressTick forces re-read after lesson completion
  }, [ready, userId, progressTick]);
}
