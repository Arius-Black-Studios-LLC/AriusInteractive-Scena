import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { DucatBalance } from "../components/DucatBalance";
import { useLegacyBundle } from "../hooks/useLegacyBundle";
import "./AccountPage.css";

export function AccountPage() {
  const { session, userId, loading: authLoading, signOut, isAdmin, profileLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement>(null);
  const { ready, error } = useLegacyBundle("account", [
    "studio.css",
    "scena-logo.css",
    "arleco-theme.css",
  ]);
  const [bootError, setBootError] = useState<string | null>(null);
  const [modNotices, setModNotices] = useState<
    Array<{ noticeId: string; title: string; reason: string; createdAt?: string; readAt?: string | null }>
  >([]);

  useEffect(() => {
    refreshProfile().catch(() => undefined);
  }, [refreshProfile]);

  useEffect(() => {
    if (!ready || !userId || !window.ScenaAdmin?.listMyModerationNotices) {
      setModNotices([]);
      return;
    }
    window.ScenaAdmin.listMyModerationNotices(20)
      .then((rows) => {
        setModNotices(
          (rows || []).map((r) => ({
            noticeId: String(r.noticeId || ""),
            title: String(r.title || "Your content"),
            reason: String(r.reason || ""),
            createdAt: r.createdAt ? String(r.createdAt) : "",
            readAt: r.readAt ? String(r.readAt) : null,
          })),
        );
      })
      .catch(() => setModNotices([]));
  }, [ready, userId]);

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
    <div className="account-shell" id="app">
      <header className="account-topbar">
        <div className="account-topbar-left">
          <Link className="account-logo" to="/">
            <span className="logo-mark" aria-hidden="true" />
            <span className="logo-text">Arleco</span>
          </Link>
          <span className="account-tag">Account settings</span>
        </div>
        <div className="account-topbar-right">
          <DucatBalance className="ducat-hud--studio" />
          {!profileLoading && isAdmin ? (
            <>
              <Link className="btn btn-ghost btn-sm" to="/admin/moderation">
                Moderation
              </Link>
            </>
          ) : null}
          <span className="user-email" id="accountUserEmail" />
          <Link className="btn btn-ghost btn-sm" to="/">
            Discover
          </Link>
          <Link className="btn btn-ghost btn-sm" to="/studio">
            Creator studio
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
      <div className="account-body">
        {modNotices.length ? (
          <section className="account-mod-notices container">
            <h2>Moderation notices</h2>
            <p className="field-hint">Content taken down by platform moderation.</p>
            <ul>
              {modNotices.map((n) => (
                <li key={n.noticeId} className={n.readAt ? "is-read" : ""}>
                  <strong>{n.title}</strong>
                  <span> was removed. Reason: {n.reason}</span>
                  {!n.readAt ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        window.ScenaAdmin?.markModerationNoticeRead?.(n.noticeId)
                          .then(() =>
                            setModNotices((prev) =>
                              prev.map((x) =>
                                x.noticeId === n.noticeId
                                  ? { ...x, readAt: new Date().toISOString() }
                                  : x,
                              ),
                            ),
                          )
                          .catch(() => undefined);
                      }}
                    >
                      Mark read
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <main className="account-main" id="accountMain" ref={mainRef}>
          <div className="page">
            <p className="field-hint">Loading profile…</p>
          </div>
        </main>
      </div>
      <div className="toast" id="accountToast" role="status" aria-live="polite" />
    </div>
  );
}
