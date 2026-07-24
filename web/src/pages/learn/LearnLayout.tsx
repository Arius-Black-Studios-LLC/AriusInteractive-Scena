import { Link, Outlet } from "react-router-dom";
import { LearnProvider, useLearnContext } from "../../context/LearnContext";
import { LearnHeader } from "../../components/learn/LearnHeader";
import "./learn.css";

function LearnShell() {
  const { ready, error } = useLearnContext();

  if (error) {
    return (
      <div className="learn-loading">
        <p>{error}</p>
        <Link to="/">Home</Link>
      </div>
    );
  }

  if (!ready) {
    return <div className="learn-loading">Loading lessons…</div>;
  }

  return (
    <>
      <LearnHeader />
      <main className="learn-main">
        <Outlet />
      </main>
    </>
  );
}

export function LearnLayout() {
  return (
    <LearnProvider>
      <div className="learn-shell">
        <LearnShell />
        <div className="toast learn-toast" id="learnToast" role="status" aria-live="polite" />
      </div>
    </LearnProvider>
  );
}
