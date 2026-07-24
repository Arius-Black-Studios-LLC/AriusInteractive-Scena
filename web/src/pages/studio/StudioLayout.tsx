import { Link } from "react-router-dom";
import { StudioProvider, useStudioContext } from "../../context/StudioContext";
import { StudioEpisodeModal, StudioToast } from "../../components/studio/StudioChrome";
import { StudioTopbar } from "../../components/studio/StudioTopbar";
import "./studio.css";

function StudioShell() {
  const { ready, error, bootError } = useStudioContext();

  if (error || bootError) {
    return (
      <div className="studio-loading">
        <p>{error || bootError}</p>
        <Link to="/">Back home</Link>
      </div>
    );
  }

  if (!ready) {
    return <div className="studio-loading">Loading creator studio…</div>;
  }

  return (
    <>
      <div className="loading-screen" id="loading" hidden>
        Loading…
      </div>
      <div className="studio-shell" id="app">
        <StudioTopbar />
        <div className="studio-body">
          <aside className="studio-sidebar" id="studioSidebar" aria-label="Studio navigation" />
          <main className="studio-main" id="studioMain" />
        </div>
      </div>
      <StudioEpisodeModal />
      <StudioToast />
    </>
  );
}

export function StudioLayout() {
  return (
    <StudioProvider>
      <StudioShell />
    </StudioProvider>
  );
}
