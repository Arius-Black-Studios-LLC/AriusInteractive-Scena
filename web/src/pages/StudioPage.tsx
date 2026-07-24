import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLegacyBundle } from "../hooks/useLegacyBundle";
import "./StudioPage.css";

export function StudioPage() {
  const { session, userId, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { ready, error } = useLegacyBundle("studio", [
    "studio.css",
    "play.css",
    "scena-logo.css",
    "arleco-theme.css",
  ]);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!userId || !session) {
      try {
        sessionStorage.setItem("scena_post_login", "/studio");
      } catch {
        /* ignore */
      }
      navigate("/?login=studio", { replace: true });
      return;
    }
    if (!ready || !window.ScenaStudio) return;

    const store = window.ScenaStore as { ready?: (id: string) => Promise<void> };
    store.ready?.(userId)
      .catch(() => undefined)
      .finally(() => {
        try {
          window.ScenaStudio?.start(session);
        } catch (err) {
          setBootError(err instanceof Error ? err.message : "Could not open studio.");
        }
      });
  }, [authLoading, userId, session, ready, navigate]);

  if (error || bootError) {
    return (
      <div className="studio-loading">
        <p>{error || bootError}</p>
        <Link to="/">Back home</Link>
      </div>
    );
  }

  if (authLoading || !ready || !userId) {
    return <div className="studio-loading">Loading creator studio…</div>;
  }

  return (
    <>
      <div className="loading-screen" id="loading" hidden>
        Loading…
      </div>
      <div className="studio-shell" id="app">
        <header className="studio-topbar">
          <div className="studio-topbar-left">
            <Link className="studio-logo" to="/">
              <span className="logo-mark" aria-hidden="true" />
              <span className="logo-text">Arleco</span>
            </Link>
            <span className="studio-topbar-tagline">Creator studio</span>
          </div>
          <div className="studio-topbar-center" id="studioTopbarCenter">
            <div className="studio-search-wrap" id="studioSearchWrap" hidden>
              <input
                className="studio-search-input"
                id="studioSeriesSearch"
                type="search"
                placeholder="Search series…"
                aria-label="Search series"
              />
            </div>
          </div>
          <div className="studio-topbar-right">
            <span className="user-email" id="studioUserEmail" />
            <Link className="btn btn-ghost btn-sm" to="/learn">
              Conservatory
            </Link>
            <Link className="btn btn-ghost btn-sm" to="/">
              View site
            </Link>
            <button
              type="button"
              className="btn btn-sm"
              id="signOutBtn"
              onClick={() => signOut().then(() => navigate("/"))}
            >
              Log out
            </button>
          </div>
        </header>
        <div className="studio-body">
          <aside className="studio-sidebar" id="studioSidebar" aria-label="Studio navigation" />
          <main className="studio-main" id="studioMain" />
        </div>
      </div>

      <div className="modal-backdrop" id="episodeModal" aria-hidden="true">
        <div className="modal" role="dialog" aria-labelledby="episodeModalTitle">
          <h2 id="episodeModalTitle">New episode</h2>
          <div id="episodeModalBody" />
          <div className="modal-actions">
            <button type="button" className="btn" id="episodeModalCancel">
              Cancel
            </button>
            <button type="button" className="btn btn-primary" id="episodeModalSave">
              Save episode
            </button>
          </div>
        </div>
      </div>

      <div className="toast" id="studioToast" role="status" aria-live="polite" />
    </>
  );
}
