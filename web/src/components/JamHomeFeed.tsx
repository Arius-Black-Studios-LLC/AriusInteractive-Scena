import { Link } from "react-router-dom";
import type { JamHomeFeedGroup } from "../lib/jams";
import { formatJamPhase, formatSubmittedWhen } from "../lib/jams";
import "./JamHomeFeed.css";

type Props = {
  groups: JamHomeFeedGroup[];
};

export function JamHomeFeed({ groups }: Props) {
  if (!groups.length) return null;

  return (
    <section className="section container jam-home-section" id="jam-entries">
      <div className="section-head">
        <div>
          <h2>Game jam entries</h2>
          <span className="section-meta">Recent submissions by jam</span>
        </div>
        <a className="btn btn-ghost btn-sm" href="/studio#/jams">
          Browse all jams
        </a>
      </div>
      <div className="jam-home-feed">
        {groups.map((group) => (
          <article className="jam-home-group" key={group.jamId}>
            <header className="jam-home-group-head">
              <div>
                <a className="jam-home-group-title" href={group.href}>
                  {group.jamTitle}
                </a>
                <p className="jam-home-tagline">{group.tagline}</p>
                <p className="jam-home-meta">
                  <span className={"jam-home-phase jam-home-phase--" + group.phase}>
                    {formatJamPhase(group.phase)}
                  </span>
                  {group.ageRestricted ? <span className="jam-home-age">18+</span> : null}
                  {group.prizePool > 0 ? (
                    <span>{group.prizePool.toLocaleString()} Ducat prize</span>
                  ) : null}
                  <span>
                    {group.totalSubmissions} entr{group.totalSubmissions === 1 ? "y" : "ies"}
                  </span>
                </p>
              </div>
              <a className="btn btn-sm btn-ghost" href={group.href}>
                Jam page
              </a>
            </header>
            <ul className="jam-home-entries">
              {group.submissions.map((sub) => (
                <li className="jam-home-entry" key={sub.id}>
                  <div className="jam-home-entry-body">
                    <strong>{sub.seriesTitle}</strong>
                    <span className="jam-home-entry-meta">
                      {sub.episodeTitle} · {sub.userName}
                      {sub.submittedAt ? " · " + formatSubmittedWhen(sub.submittedAt) : ""}
                    </span>
                  </div>
                  <div className="jam-home-entry-actions">
                    {group.phase === "judging" && sub.likes > 0 ? (
                      <span className="jam-home-likes">{sub.likes} ♥</span>
                    ) : null}
                    <Link className="btn btn-sm btn-primary" to={sub.playHref}>
                      Play
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
