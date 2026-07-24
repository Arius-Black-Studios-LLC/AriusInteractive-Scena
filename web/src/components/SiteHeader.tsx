import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./SiteHeader.css";

type Props = {
  onOpenLogin: () => void;
};

export function SiteHeader({ onOpenLogin }: Props) {
  const { userId, signOut } = useAuth();

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
          <Link to="/learn">Conservatory</Link>
        </nav>
        <div className="site-header-actions">
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
          <Link className="btn btn-primary btn-sm" to="/studio">
            Creator studio
          </Link>
        </div>
      </div>
    </header>
  );
}
