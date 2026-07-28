import { Link } from "react-router-dom";
import type { CatalogEntryExt } from "../lib/catalog";
import "./FeaturedPicks.css";

export type FeaturedEntry = CatalogEntryExt & {
  featuredEyebrow?: string;
  creatorName?: string;
  bannerDataUrl?: string;
  liveCount?: number;
};

type Props = {
  picks: FeaturedEntry[];
};

function featuredImageUrl(entry: FeaturedEntry): string | null {
  if (entry.bannerDataUrl) return entry.bannerDataUrl;
  if (entry.thumbnailDataUrl) return entry.thumbnailDataUrl;
  const match = (entry.thumbStyle || "").match(/url\(([^)]+)\)/);
  return match ? match[1].replace(/^["']|["']$/g, "") : null;
}

function chapterMeta(entry: FeaturedEntry): string {
  const parts: string[] = [];
  if (entry.creatorName) parts.push(`by ${entry.creatorName}`);
  const count = entry.liveCount || 0;
  if (count > 0) parts.push(count === 1 ? "1 chapter" : `${count} chapters`);
  else if (entry.epLabel) parts.push(entry.epLabel);
  return parts.join(" · ");
}

function FeaturedCard({
  entry,
  hero = false,
}: {
  entry: FeaturedEntry;
  hero?: boolean;
}) {
  const imageUrl = featuredImageUrl(entry);
  const href = entry.href.startsWith("/") ? entry.href : `/series?series=${entry.id}`;
  const eyebrow = entry.featuredEyebrow || (hero ? "Editor's pick" : "");
  const meta = chapterMeta(entry);
  const flagLimit = hero ? 4 : 2;

  return (
    <Link
      className={`featured-card${hero ? " featured-card--hero" : " featured-card--side"}`}
      to={href}
    >
      <div
        className={
          "featured-visual" +
          (imageUrl ? " featured-visual--image" : ` featured-visual--${entry.cover}`)
        }
        style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
      >
        {hero && entry.epLabel ? <span className="badge">{entry.epLabel}</span> : null}
      </div>
      <div className="featured-body">
        {eyebrow ? <div className="featured-eyebrow">{eyebrow}</div> : null}
        <h3 className="featured-title">{entry.title}</h3>
        <p className="featured-desc">{entry.description}</p>
        {entry.flags.length > 0 ? (
          <div className="flags">
            {entry.flags.slice(0, flagLimit).map((flag) => (
              <span className="flag" key={flag}>
                {flag}
              </span>
            ))}
          </div>
        ) : null}
        {meta ? <p className="featured-meta">{meta}</p> : null}
      </div>
    </Link>
  );
}

export function FeaturedPicks({ picks }: Props) {
  if (!picks.length) return null;

  const hero = picks[0];
  const side = picks.slice(1, 3);

  return (
    <section className="section container" id="featured">
      <div className="section-head section-head--center">
        <h2>Featured</h2>
        <span className="section-meta">Staff picks</span>
      </div>
      <div className={"featured-grid" + (side.length ? "" : " featured-grid--solo")}>
        <FeaturedCard entry={hero} hero />
        {side.length > 0 ? (
          <div className="featured-side">
            {side.map((entry) => (
              <FeaturedCard key={entry.id} entry={entry} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
