import { Link, NavLink, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./AdminModerationPage.css";

export function AdminModerationLayout() {
  const { session, userId, loading: authLoading, isAdmin, profileLoading } = useAuth();

  if (authLoading || profileLoading) {
    return <div className="admin-mod-loading">Loading moderation…</div>;
  }

  if (!userId || !session) {
    return <Navigate to="/?login=account" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="admin-mod-page container">
      <header className="admin-mod-head">
        <div>
          <p className="admin-mod-eyebrow">Platform admin</p>
          <h1>Moderation</h1>
          <p className="admin-mod-lede">
            Review reports, delist UGC, and curate staff picks for the home page.
          </p>
        </div>
        <div className="admin-mod-head-actions">
          <Link className="btn btn-ghost btn-sm" to="/">
            Home
          </Link>
        </div>
      </header>

      <nav className="admin-mod-tabs" aria-label="Moderation sections">
        <NavLink
          to="/admin/moderation"
          end
          className={({ isActive }) => "admin-mod-tab" + (isActive ? " is-active" : "")}
        >
          Reports
        </NavLink>
        <NavLink
          to="/admin/moderation/featured"
          className={({ isActive }) => "admin-mod-tab" + (isActive ? " is-active" : "")}
        >
          Staff picks
        </NavLink>
      </nav>

      <Outlet />
    </div>
  );
}
