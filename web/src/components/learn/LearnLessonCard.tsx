import { Link } from "react-router-dom";
import type { LessonMeta } from "../../domain/learn/types";
import { badgeAdapter } from "../../legacy/adapters";
import { useLearnContext } from "../../context/LearnContext";

type Props = {
  lesson: LessonMeta;
  completed: boolean;
};

export function LearnLessonCard({ lesson, completed }: Props) {
  const { userId } = useLearnContext();
  const badgeUnlocked = badgeAdapter.isUnlocked(badgeAdapter.lessonBadgeId(lesson.id), userId);

  return (
    <Link
      className={`learn-lesson-card${completed ? " is-complete" : ""}`}
      to={`/learn/${lesson.id}`}
    >
      <span className="learn-lesson-category">{lesson.category}</span>
      <h2>{lesson.title}</h2>
      <p>{lesson.summary}</p>
      <span className="learn-lesson-status">
        {badgeUnlocked ? "🏛 Laurel earned · " : ""}
        {completed ? "✓ Complete" : "Take the stage →"}
      </span>
    </Link>
  );
}
