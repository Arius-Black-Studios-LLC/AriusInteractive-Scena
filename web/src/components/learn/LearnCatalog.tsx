import { LearnBadgePanel } from "./LearnBadgePanel";
import { LearnLessonCard } from "./LearnLessonCard";
import { LearnProgressBar } from "./LearnProgressBar";
import { useLearnCatalog } from "../../hooks/useLearnCatalog";

export function LearnCatalog() {
  const { lessons, completedIds } = useLearnCatalog();
  const doneCount = lessons.filter((l) => completedIds.includes(l.id)).length;

  return (
    <div className="learn-catalog">
      <header className="learn-hero">
        <p className="learn-eyebrow">Tutorials</p>
        <h1>Learn the editor step by step</h1>
        <p className="learn-lede">
          Practice in the real creator studio. Complete each lesson to earn badges as you master
          branching stories.
        </p>
        <LearnProgressBar completed={doneCount} total={lessons.length} />
      </header>

      <LearnBadgePanel />

      <div className="learn-lesson-grid">
        {lessons.map((lesson) => (
          <LearnLessonCard
            key={lesson.id}
            lesson={lesson}
            completed={completedIds.includes(lesson.id)}
          />
        ))}
      </div>
    </div>
  );
}
