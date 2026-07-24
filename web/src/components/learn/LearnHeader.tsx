import { Link } from "react-router-dom";
import { DucatBalance } from "../DucatBalance";

export function LearnHeader() {
  return (
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
      <DucatBalance className="ducat-hud--learn" />
    </header>
  );
}
