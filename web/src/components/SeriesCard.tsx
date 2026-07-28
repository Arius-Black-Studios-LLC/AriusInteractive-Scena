import { Link } from "react-router-dom";
import type { CatalogEntry } from "../lib/catalog";
import "./SeriesCard.css";

type Props = {
  entry: CatalogEntry;
};

function thumbnailUrl(entry: CatalogEntry): string | null {
  const ext = entry as CatalogEntry & { thumbnailDataUrl?: string };
  if (ext.thumbnailDataUrl) return ext.thumbnailDataUrl;
  const style = entry.thumbStyle || "";
  const match = style.match(/url\(([^)]+)\)/);
  return match ? match[1].replace(/^["']|["']$/g, "") : null;
}

export function SeriesCard({ entry }: Props) {
  const imageUrl = thumbnailUrl(entry);
  const body = (
    <>
      <div
        className={
          "series-card-thumb" +
          (imageUrl ? " series-card-thumb--image" : ` series-card-thumb--${entry.cover}`)
        }
        style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
      >
        {entry.epLabel ? <span className="series-card-ep">{entry.epLabel}</span> : null}
      </div>
      <div className="series-card-body">
        <div className="series-card-title">{entry.title}</div>
        <div className="series-card-desc">{entry.description}</div>
        {entry.readersLabel ? (
          <div className="series-card-readers">{entry.readersLabel} readers this week</div>
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
