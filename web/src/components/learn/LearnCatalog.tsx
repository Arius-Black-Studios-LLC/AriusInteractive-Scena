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
        <p className="learn-eyebrow">The Conservatory</p>
        <h1>Stagecraft for the digital house</h1>
        <p className="learn-lede">
          Rehearse in the real editor. Complete each scene to earn laurels — badges drawn from
          classical theatre.
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
