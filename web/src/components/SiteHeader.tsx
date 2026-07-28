import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { loadLegacyBundle } from "../legacy/loadLegacy";
import { DucatBalance } from "./DucatBalance";
import "./SiteHeader.css";

type Props = {
  onOpenLogin: () => void;
};

export function SiteHeader({ onOpenLogin }: Props) {
  const { userId, signOut, isAdmin, profileLoading } = useAuth();
  const [openReports, setOpenReports] = useState(0);

  useEffect(() => {
    if (!userId || !isAdmin) {
      setOpenReports(0);
      return;
    }
    let cancelled = false;
    const load = () => {
      loadLegacyBundle("admin")
        .then(() => window.ScenaAdmin?.countOpenReports?.() ?? Promise.resolve(0))
        .then((n) => {
          if (!cancelled) setOpenReports(Number(n) || 0);
        })
        .catch(() => {
          if (!cancelled) setOpenReports(0);
        });
    };
    load();
    const id = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [userId, isAdmin]);

  return (
    <header className="site-header">
      <div className="site-header-inner container">
        <Link className="site-logo" to="/">
          <span className="logo-mark" aria-hidden="true" />
          <span className="logo-text">Arleco</span>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          <a href="/#discover">Discover</a>
          <a href="/#featured">Featured</a>
          <Link to="/blog">Blog</Link>
          <Link to="/forums">Forums</Link>
          <Link to="/learn">Conservatory</Link>
          <Link to="/jams">Game jams</Link>
        </nav>
        <div className="site-header-actions">
          <DucatBalance />
          {userId && !profileLoading && isAdmin ? (
            <>
              <Link
                className="btn btn-ghost btn-sm site-mod-link"
                to="/admin/moderation"
                aria-label={
                  openReports
                    ? `Moderation, ${openReports} open report${openReports === 1 ? "" : "s"}`
                    : "Moderation"
                }
              >
                Moderation
                {openReports > 0 ? (
                  <span className="site-mod-alert" title={`${openReports} open reports`}>
                    !
                  </span>
                ) : null}
              </Link>
            </>
          ) : null}
          {userId ? (
            <>
              <Link className="btn btn-ghost btn-sm" to="/account">
                Account
              </Link>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => signOut()}>
                Log out
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenLogin}>
              Log in
            </button>
          )}
          <Link className="btn btn-primary btn-sm site-studio-link" to="/studio">
            Creator studio
          </Link>
        </div>
      </div>
    </header>
  );
}
