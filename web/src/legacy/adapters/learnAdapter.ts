import type {
  LegacyLearnLesson,
  LessonMeta,
  LessonValidationResult,
} from "../../domain/learn/types";
import type { LearnPort, LearnSandboxHandle } from "../ports/LearnPort";

function toMeta(lesson: LegacyLearnLesson): LessonMeta {
  return {
    id: lesson.id,
    title: lesson.title,
    category: lesson.category,
    order: lesson.order,
    summary: lesson.summary,
  };
}

export const learnAdapter: LearnPort = {
  listLessons() {
    const lessons = (window.ScenaLearnLessons || []) as LegacyLearnLesson[];
    return lessons
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(toMeta);
  },

  getLesson(id) {
    const lesson = (window.ScenaLearnLessons || []).find((l) => l.id === id) as
      | LegacyLearnLesson
      | undefined;
    return lesson ?? null;
  },

  createSandbox(container, lesson, onChange) {
    const Sandbox = window.ScenaLearnSandbox;
    if (!Sandbox) {
      throw new Error("Lesson sandbox failed to load.");
    }

    const instance = new Sandbox(container, lesson, { onChange });
    const graph = (instance as { graph?: { destroy?: () => void } }).graph;

    const handle: LearnSandboxHandle = {
      destroy() {
        graph?.destroy?.();
        container.innerHTML = "";
      },
    };

    return handle;
  },
};
