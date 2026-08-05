import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LoginModal } from "../../components/LoginModal";
import { useAuth } from "../../context/AuthContext";
import { StudioProvider, useStudioContext } from "../../context/StudioContext";
import { StudioEpisodeModal, StudioToast } from "../../components/studio/StudioChrome";
import { StudioTopbar } from "../../components/studio/StudioTopbar";
import "./studio.css";

/** Creator Studio needs a pointer + room for the graph editor. Phones/tablets get a gate for now. */
const DESKTOP_STUDIO_MQ = "(min-width: 1024px)";

function useDesktopStudioOk() {
  const [ok, setOk] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(DESKTOP_STUDIO_MQ).matches : true
  );

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_STUDIO_MQ);
    const sync = () => setOk(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return ok;
}

function StudioDesktopGate() {
  return (
    <main className="studio-desktop-gate">
      <div className="studio-desktop-gate-card">
        <p className="studio-desktop-gate-eyebrow">Creator Studio</p>
        <h1>Desktop only — for now</h1>
        <p>
          The story graph and asset tools need a larger screen and a mouse or trackpad.
          Open Arleco on a computer to write, publish, and sell.
        </p>
        <p className="studio-desktop-gate-aside">
          Reading works great on phone and tablet. A dedicated <strong>Arleco Studio</strong> tablet
          app and <strong>Arleco Reader</strong> are on the roadmap — this web studio stays desktop-first.
        </p>
        <div className="studio-desktop-gate-actions">
          <Link className="btn btn-primary" to="/discover">
            Discover stories
          </Link>
          <Link className="btn btn-ghost" to="/account">
            Account
          </Link>
        </div>
      </div>
    </main>
  );
}

function StudioAuthGate() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");

  function open(mode: "login" | "signup") {
    setAuthMode(mode);
    setLoginOpen(true);
  }

  return (
    <main className="studio-auth-gate">
      <div className="studio-auth-network" aria-hidden="true">
        <span className="studio-auth-line line-a" />
        <span className="studio-auth-line line-b" />
        <span className="studio-auth-line line-c" />
        <span className="studio-auth-node node-a">Scene</span>
        <span className="studio-auth-node node-b">Choice</span>
        <span className="studio-auth-node node-c">Ending</span>
        <span className="studio-auth-node node-d">Character</span>
      </div>
      <section className="studio-auth-card">
        <p className="studio-desktop-gate-eyebrow">Arleco Creator Studio</p>
        <h1>Connect every scene into a story worth exploring.</h1>
        <p>
          Build branching visual novels with a visual story graph, scene tools, previews,
          publishing, and cloud saves.
        </p>
        <div className="studio-auth-actions">
          <button className="btn btn-primary" type="button" onClick={() => open("signup")}>
            Create a free account
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => open("login")}>
            Log in
          </button>
        </div>
        <Link className="studio-auth-home-link" to="/">Explore Arleco first →</Link>
      </section>
      <LoginModal
        key={authMode}
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        postLogin="/studio"
        initialMode={authMode}
      />
    </main>
  );
}

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
  const desktopOk = useDesktopStudioOk();
  const { userId, loading } = useAuth();

  if (!desktopOk) {
    return <StudioDesktopGate />;
  }

  if (loading) {
    return <div className="studio-loading">Connecting to Creator Studio…</div>;
  }

  if (!userId) {
    return <StudioAuthGate />;
  }

  return (
    <StudioProvider>
      <StudioShell />
    </StudioProvider>
  );
}
