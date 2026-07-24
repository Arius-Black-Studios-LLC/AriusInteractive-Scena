import type {
  LegacyLearnLesson,
  LessonMeta,
  LessonValidationResult,
} from "../../domain/learn/types";

export type LearnSandboxHandle = {
  destroy: () => void;
};

export interface LearnPort {
  listLessons(): LessonMeta[];
  getLesson(id: string): LegacyLearnLesson | null;
  createSandbox(
    container: HTMLElement,
    lesson: LegacyLearnLesson,
    onChange: (result: LessonValidationResult) => void,
  ): LearnSandboxHandle;
}
