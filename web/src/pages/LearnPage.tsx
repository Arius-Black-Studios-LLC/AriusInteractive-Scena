import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLegacyBundle } from "../hooks/useLegacyBundle";
import "./LearnPage.css";

export function LearnPage() {
  const { userId } = useAuth();
  const { ready, error } = useLegacyBundle("learn", [
    "studio.css",
    "play.css",
    "learn.css",
    "scena-logo.css",
    "arleco-theme.css",
  ]);

  useEffect(() => {
    if (!ready || !window.ScenaLearnApp) return;
    window.ScenaLearnApp.start(userId);
  }, [ready, userId]);

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
    <div className="learn-shell">
      <header className="learn-header">
        <Link className="logo" to="/">
          <span className="logo-mark" aria-hidden="true" />
          <span className="logo-text">Arleco</span>
        </Link>
        <nav className="learn-header-nav" aria-label="Learn navigation">
          <Link to="/learn" className="is-active">
            Conservatory
          </Link>
          <Link to="/">Discover</Link>
          <Link to="/account">Account</Link>
          <Link to="/studio">Creator studio</Link>
        </nav>
      </header>
      <main className="learn-main" id="learnMain" />
      <div className="toast learn-toast" id="learnToast" role="status" aria-live="polite" />
    </div>
  );
}
