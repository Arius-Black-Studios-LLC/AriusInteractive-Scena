import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { LegacyLearnLesson } from "../../domain/learn/types";
import { badgeAdapter, learnAdapter } from "../../legacy/adapters";
import { useLearnContext } from "../../context/LearnContext";

type Props = {
  lesson: LegacyLearnLesson;
};

export function LearnLessonRunner({ lesson }: Props) {
  const { ready: learnReady, userId, showToast, refreshProgress } = useLearnContext();
  const navigate = useNavigate();
  const sandboxRef = useRef<HTMLDivElement>(null);
  const userIdRef = useRef(userId);
  const showToastRef = useRef(showToast);
  const refreshProgressRef = useRef(refreshProgress);
  userIdRef.current = userId;
  showToastRef.current = showToast;
  refreshProgressRef.current = refreshProgress;
  const [completed, setCompleted] = useState(() =>
    badgeAdapter.isLessonComplete(lesson.id, userId),
  );
  const [hint, setHint] = useState("Follow the steps — progress checks automatically.");
  const [message, setMessage] = useState<string | null>(null);
  const [showActions, setShowActions] = useState(completed);

  useEffect(() => {
    setCompleted(badgeAdapter.isLessonComplete(lesson.id, userId));
  }, [lesson.id, userId]);

  useEffect(() => {
    if (!learnReady) return;
    const container = sandboxRef.current;
    if (!container) return;

    const lessonDef = learnAdapter.getLesson(lesson.id);
    if (!lessonDef) return;

    const handle = learnAdapter.createSandbox(container, lessonDef, (result) => {
      if (result.ok) {
        // Defer React updates so legacy paintAll() finishes before any re-render.
        window.requestAnimationFrame(() => {
          const newly = badgeAdapter.recordLessonComplete(lesson.id, userIdRef.current);
          badgeAdapter.showUnlockCelebration(newly, showToastRef.current);
          refreshProgressRef.current();
          setCompleted(true);
          setMessage(result.message || "Well done.");
          setShowActions(true);
        });
      } else if (result.hint) {
        setHint(result.hint);
      }
    });

    return () => handle.destroy();
  }, [lesson.id, learnReady]);

  function goNext() {
    const lessons = learnAdapter.listLessons();
    const idx = lessons.findIndex((l) => l.id === lesson.id);
    if (idx >= 0 && idx < lessons.length - 1) {
      navigate(`/learn/${lessons[idx + 1]!.id}`);
    } else {
      navigate("/learn");
    }
  }

  return (
    <div className="learn-lesson">
      <nav className="learn-lesson-nav">
        <Link to="/learn" className="learn-back">
          ← All acts
        </Link>
        <span className="learn-lesson-category">{lesson.category}</span>
      </nav>
      <div className="learn-lesson-layout">
        <aside className="learn-instructions">
          <h1>{lesson.title}</h1>
          <div
            className="learn-instructions-body"
            dangerouslySetInnerHTML={{ __html: lesson.instructions }}
          />
          <div className="learn-task-status">
            {completed ? (
              <div className={`learn-task-done${message ? " is-just-completed" : ""}`}>
                <strong>{message ? "✓ Act complete!" : "✓ Completed"}</strong>
                <p>{message || "You can replay anytime."}</p>
              </div>
            ) : (
              <div className="learn-task-pending">
                <strong>Your task</strong>
                <p>{hint}</p>
              </div>
            )}
          </div>
          {showActions ? (
            <div className="learn-lesson-actions">
              <button type="button" className="btn btn-primary" onClick={goNext}>
                Next act →
              </button>
              <Link to="/learn" className="btn btn-ghost">
                Back to catalog
              </Link>
            </div>
          ) : null}
        </aside>
        <div className="learn-sandbox-wrap" ref={sandboxRef} id="learnSandbox">
          {!learnReady ? <div className="learn-sandbox-loading">Loading graph…</div> : null}
        </div>
      </div>
    </div>
  );
}
