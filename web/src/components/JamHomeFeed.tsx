import { useState } from "react";
import { Link } from "react-router-dom";
import type { JamHomeMenuItem, JamHomeSpotlight } from "../lib/jams";
import {
  formatJamPhase,
  formatSubmittedWhen,
  jamMenuIconLabel,
} from "../lib/jams";
import "./JamHomeFeed.css";

type Props = {
  spotlight: JamHomeSpotlight;
};

export function JamHomeFeed({ spotlight }: Props) {
  const { featured, others } = spotlight;
  const [previewId, setPreviewId] = useState<string | null>(null);

  if (!featured) return null;

  const previewJam = others.find((item) => item.jamId === previewId) || null;

  return (
    <section className="section container jam-home-section" id="jam-entries">
      <div className="section-head">
        <div>
          <h2>Game jams</h2>
          <span className="section-meta">Play entries from active jams</span>
        </div>
        <a className="btn btn-ghost btn-sm" href="/studio#/jams">
          Browse all jams
        </a>
      </div>

      <article className="jam-home-featured">
        <header className="jam-home-featured-head">
          <div>
            <a className="jam-home-featured-title" href={featured.href}>
              {featured.jamTitle}
            </a>
            <p className="jam-home-tagline">{featured.tagline}</p>
            <p className="jam-home-meta">
              <span className={"jam-home-phase jam-home-phase--" + featured.phase}>
                {formatJamPhase(featured.phase)}
              </span>
              {featured.ageRestricted ? <span className="jam-home-age">18+</span> : null}
              {featured.prizePool > 0 ? (
                <span>{featured.prizePool.toLocaleString()} Ducat prize</span>
              ) : null}
              <span>
                {featured.totalSubmissions} entr
                {featured.totalSubmissions === 1 ? "y" : "ies"}
              </span>
            </p>
          </div>
          <a className="btn btn-sm btn-primary" href={featured.href}>
            Full jam post
          </a>
        </header>

        <ul className="jam-home-entries">
          {featured.submissions.map((sub) => (
            <li className="jam-home-entry" key={sub.id}>
              <div className="jam-home-entry-body">
                <strong>{sub.seriesTitle}</strong>
                <span className="jam-home-entry-meta">
                  {sub.episodeTitle} · {sub.userName}
                  {sub.submittedAt ? " · " + formatSubmittedWhen(sub.submittedAt) : ""}
                </span>
              </div>
              <div className="jam-home-entry-actions">
                {featured.phase === "judging" && sub.likes > 0 ? (
                  <span className="jam-home-likes">{sub.likes} ♥</span>
                ) : null}
                <Link className="btn btn-sm btn-primary" to={sub.playHref}>
                  Play
                </Link>
              </div>
            </li>
          ))}
        </ul>
        {featured.totalSubmissions > featured.submissions.length ? (
          <footer className="jam-home-featured-foot">
            <a className="btn btn-ghost btn-sm" href={featured.href}>
              See all {featured.totalSubmissions} submissions
            </a>
          </footer>
        ) : null}
      </article>

      {others.length ? (
        <div className="jam-home-others">
          <h3 className="jam-home-others-title">More jams with entries</h3>
          <div className="jam-home-menu" role="list">
            {others.map((item) => (
              <button
                key={item.jamId}
                type="button"
                className={
                  "jam-home-menu-icon" + (previewId === item.jamId ? " jam-home-menu-icon--active" : "")
                }
                role="listitem"
                title={item.jamTitle}
                aria-expanded={previewId === item.jamId}
                onClick={() => setPreviewId(previewId === item.jamId ? null : item.jamId)}
              >
                <span className="jam-home-menu-glyph" aria-hidden="true">
                  {jamMenuIconLabel(item.jamTitle)}
                </span>
                <span className="jam-home-menu-name">{item.jamTitle}</span>
              </button>
            ))}
          </div>

          {previewJam ? (
            <JamPreviewPanel jam={previewJam} onClose={() => setPreviewId(null)} />
          ) : (
            <p className="jam-home-menu-hint">Tap a jam icon to preview its listing.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function JamPreviewPanel({
  jam,
  onClose,
}: {
  jam: JamHomeMenuItem;
  onClose: () => void;
}) {
  return (
    <article className="jam-home-preview">
      <header className="jam-home-preview-head">
        <div>
          <h4>{jam.jamTitle}</h4>
          <p className="jam-home-meta">
            <span className={"jam-home-phase jam-home-phase--" + jam.phase}>
              {formatJamPhase(jam.phase)}
            </span>
            {jam.ageRestricted ? <span className="jam-home-age">18+</span> : null}
            {jam.prizePool > 0 ? (
              <span>{jam.prizePool.toLocaleString()} Ducat prize</span>
            ) : null}
            <span>
              {jam.totalSubmissions} entr{jam.totalSubmissions === 1 ? "y" : "ies"}
            </span>
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Close
        </button>
      </header>
      <p className="jam-home-preview-copy">{jam.taglinePreview}</p>
      {jam.theme && jam.theme !== jam.tagline ? (
        <p className="jam-home-preview-theme">Theme: {jam.theme}</p>
      ) : null}
      <div className="jam-home-preview-actions">
        <a className="btn btn-sm btn-primary" href={jam.href}>
          See all submissions
        </a>
        <a className="btn btn-sm btn-ghost" href={jam.href}>
          Read full post
        </a>
      </div>
    </article>
  );
}
