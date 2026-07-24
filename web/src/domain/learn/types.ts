/** Catalog-facing lesson metadata (no graph setup/validate). */
export type LessonMeta = {
  id: string;
  title: string;
  category: string;
  order: number;
  summary: string;
  mode?: "graph" | "resources";
};

export type LessonValidationResult = {
  ok: boolean;
  message?: string;
  hint?: string;
};

/** Full lesson runtime object — setup/validate stay in legacy until graph port. */
export type LegacyLearnLesson = LessonMeta & {
  instructions: string;
  mode?: "graph" | "resources";
  setup: () => unknown;
  validate: (series: unknown) => LessonValidationResult;
};

export type BadgeProgress = {
  unlocked: string[];
  stats: {
    lessonsCompleted: string[];
    seriesCount: number;
    publishedEpisodes: number;
    totalReaders: number;
  };
};

export type LearnCatalogState = {
  lessons: LessonMeta[];
  completedIds: string[];
  progress: BadgeProgress | null;
};
