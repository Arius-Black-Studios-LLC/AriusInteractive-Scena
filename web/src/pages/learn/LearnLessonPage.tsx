import { Navigate, useParams } from "react-router-dom";
import { LearnLessonRunner } from "../../components/learn/LearnLessonRunner";
import { learnAdapter } from "../../legacy/adapters";
import { useLearnContext } from "../../context/LearnContext";

export function LearnLessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const { ready } = useLearnContext();

  if (!lessonId) return <Navigate to="/learn" replace />;
  if (!ready) return null;

  const lesson = learnAdapter.getLesson(lessonId);
  if (!lesson) return <Navigate to="/learn" replace />;

  return <LearnLessonRunner key={lesson.id} lesson={lesson} />;
}
