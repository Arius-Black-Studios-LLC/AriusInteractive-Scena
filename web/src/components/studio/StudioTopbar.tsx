import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { DucatBalance } from "../DucatBalance";
import { useStudioContext } from "../../context/StudioContext";

export function StudioTopbar() {
  const { signOut } = useAuth();
  const { userEmail } = useStudioContext();
  const navigate = useNavigate();

  return (
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
        <DucatBalance className="ducat-hud--studio" />
        <span className="user-email" id="studioUserEmail">
          {userEmail}
        </span>
        <Link className="btn btn-ghost btn-sm" to="/account">
          Account
        </Link>
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
  );
}
