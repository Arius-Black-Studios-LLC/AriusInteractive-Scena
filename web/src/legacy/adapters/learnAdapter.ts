import { getLessonMeta, listLessonMeta, type LessonCatalogEntry } from "../../domain/learn/lessonCatalog";
import type {
  LegacyLearnLesson,
  LessonMeta,
  LessonValidationResult,
} from "../../domain/learn/types";
import type { LearnPort, LearnSandboxHandle } from "../ports/LearnPort";

function mergeLesson(legacy: LegacyLearnLesson, meta?: LessonCatalogEntry): LegacyLearnLesson {
  if (!meta) return legacy;
  return { ...legacy, ...meta };
}

export const learnAdapter: LearnPort = {
  listLessons(): LessonMeta[] {
    return listLessonMeta();
  },

  getLesson(id: string): LegacyLearnLesson | null {
    const meta = getLessonMeta(id);
    const legacy = (window.ScenaLearnLessons || []).find((lesson) => lesson.id === id) as
      | LegacyLearnLesson
      | undefined;
    if (!legacy) return null;
    return mergeLesson(legacy, meta);
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
