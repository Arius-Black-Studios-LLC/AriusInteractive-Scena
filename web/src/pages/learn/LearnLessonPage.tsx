import { Navigate, useParams } from "react-router-dom";
import { LearnLessonRunner } from "../../components/learn/LearnLessonRunner";
import { learnAdapter } from "../../legacy/adapters";
export function LearnLessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>();

  if (!lessonId) return <Navigate to="/learn" replace />;

  const lesson = learnAdapter.getLesson(lessonId);
  if (!lesson) return <Navigate to="/learn" replace />;

  return <LearnLessonRunner key={lesson.id} lesson={lesson} />;
}
