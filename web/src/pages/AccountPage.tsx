import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLegacyBundle } from "../hooks/useLegacyBundle";
import "./AccountPage.css";

export function AccountPage() {
  const { session, userId, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement>(null);
  const { ready, error } = useLegacyBundle("account", [
    "studio.css",
    "scena-logo.css",
    "arleco-theme.css",
  ]);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!userId || !session) {
      try {
        sessionStorage.setItem("scena_post_login", "/account");
      } catch {
        /* ignore */
      }
      navigate("/?login=account", { replace: true });
      return;
    }
    if (!ready || !mainRef.current || !window.ScenaAccount || !window.ScenaProfile) return;

    window.ScenaProfile.get(userId, session)
      .then((profile) => {
        if (!mainRef.current) return;
        mainRef.current.innerHTML = window.ScenaAccount!.renderPage(profile, {
          userId,
          userEmail: session.user.email || "",
          toast: (msg: string) => {
            const el = document.getElementById("accountToast");
            if (!el) return;
            el.textContent = msg;
            el.classList.add("is-show");
            window.setTimeout(() => el.classList.remove("is-show"), 2600);
          },
          onSaved: () => undefined,
        });
        window.ScenaAccount!.bindPage(profile, {
          userId,
          userEmail: session.user.email || "",
          toast: (msg: string) => {
            const el = document.getElementById("accountToast");
            if (!el) return;
            el.textContent = msg;
            el.classList.add("is-show");
            window.setTimeout(() => el.classList.remove("is-show"), 2600);
          },
          onSaved: () => undefined,
        });
        const emailEl = document.getElementById("accountUserEmail");
        window.ScenaAccount!.paintTopbar(emailEl, profile, {
          userEmail: session.user.email || "",
        });
      })
      .catch(() => setBootError("Could not load profile."));
  }, [authLoading, userId, session, ready, navigate]);

  if (error || bootError) {
    return (
      <div className="account-loading">
        <p>{error || bootError}</p>
        <Link to="/">Home</Link>
      </div>
    );
  }

  if (authLoading || !ready) {
    return <div className="account-loading">Checking session…</div>;
  }

  return (
    <div className="studio-shell" id="app">
      <header className="studio-topbar">
        <div className="studio-topbar-left">
          <Link className="studio-logo" to="/">
            <span className="logo-mark" aria-hidden="true" />
            <span className="logo-text">Arleco</span>
          </Link>
          <span className="account-tag">Account</span>
        </div>
        <div className="studio-topbar-right">
          <span className="user-email" id="accountUserEmail" />
          <Link className="btn btn-ghost btn-sm" to="/studio">
            Creator studio
          </Link>
          <Link className="btn btn-ghost btn-sm" to="/">
            Discover
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
      <div className="studio-body studio-body--solo">
        <main className="studio-main" id="accountMain" ref={mainRef}>
          <div className="page">
            <p className="field-hint">Loading profile…</p>
          </div>
        </main>
      </div>
      <div className="toast" id="accountToast" role="status" aria-live="polite" />
    </div>
  );
}
