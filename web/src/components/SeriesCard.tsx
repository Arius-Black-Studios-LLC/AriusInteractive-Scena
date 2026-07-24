import { Link } from "react-router-dom";
import type { CatalogEntry } from "../lib/catalog";
import "./SeriesCard.css";

type Props = {
  entry: CatalogEntry;
};

export function SeriesCard({ entry }: Props) {
  const body = (
    <>
      <div className={`series-card-thumb series-card-thumb--${entry.cover}`}>
        {entry.epLabel ? <span className="series-card-ep">{entry.epLabel}</span> : null}
      </div>
      <div className="series-card-body">
        <div className="series-card-title">{entry.title}</div>
        <div className="series-card-desc">{entry.description}</div>
        {entry.readersLabel ? (
          <div className="series-card-readers">{entry.readersLabel}</div>
        ) : null}
        {entry.flags.length > 0 ? (
          <div className="series-card-flags">
            {entry.flags.map((flag) => (
              <span className="flag" key={flag}>
                {flag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );

  const href = entry.href.startsWith("/series")
    ? entry.href.replace("/series?series=", "/series?series=")
    : entry.href;

  if (href.startsWith("/series")) {
    return (
      <div className="series-card-wrap">
        <Link className="series-card" to={href}>
          {body}
        </Link>
      </div>
    );
  }

  return (
    <div className="series-card-wrap">
      <a className="series-card" href={href}>
        {body}
      </a>
    </div>
  );
}
