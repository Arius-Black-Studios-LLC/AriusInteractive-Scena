import { Link } from "react-router-dom";
import type { JamCoverStyle } from "../lib/jams";
import {
  formatJamPhase,
  formatSubmittedWhen,
  isAssetSubmission,
  jamCoverBackground,
  jamMenuIconLabel,
  jamTypeLabel,
  type JamHomeSubmission,
} from "../lib/jams";
import "../pages/JamPages.css";

export type PlayerJamCard = {
  jamId: string;
  jamTitle: string;
  jamType?: string;
  description: string;
  theme?: string;
  coverStyle?: JamCoverStyle;
  phase: string;
  prizePool: number;
  ageRestricted: boolean;
  href: string;
  totalSubmissions: number;
  studioHref?: string;
};

export type PlayerJamDetail = {
  jamId: string;
  jamTitle: string;
  jamType?: string;
  description: string;
  theme?: string;
  rules?: string;
  coverStyle?: JamCoverStyle;
  phase: string;
  prizePool: number;
  ageRestricted: boolean;
  hostName?: string;
  freeDuringJam?: boolean;
  studioHref?: string;
  ageGated?: boolean;
  submissions: JamHomeSubmission[];
};

export function JamCover({
  title,
  coverStyle,
  className,
  jamType,
  hideGlyph,
}: {
  title: string;
  coverStyle?: JamCoverStyle | null;
  className?: string;
  jamType?: string;
  hideGlyph?: boolean;
}) {
  const showGlyph = !hideGlyph && jamType !== "asset";
  return (
    <div className={"jam-page-cover" + (className ? ` ${className}` : "")} style={jamCoverBackground(coverStyle)}>
      {showGlyph ? <span aria-hidden="true">{jamMenuIconLabel(title)}</span> : null}
    </div>
  );
}

export function SubmissionCarousel({
  submissions,
  freeDuringJam,
}: {
  submissions: JamHomeSubmission[];
  freeDuringJam?: boolean;
}) {
  if (!submissions.length) {
    return <p className="jam-page-empty">No submissions yet — check back soon.</p>;
  }

  return (
    <div className="jam-page-carousel" role="list">
      {submissions.map((sub) => (
        <article className="jam-page-carousel-card" key={sub.id} role="listitem">
          <div className="jam-page-carousel-body">
            <strong>{isAssetSubmission(sub) ? sub.listingTitle : sub.seriesTitle}</strong>
            <span className="jam-page-carousel-meta">
              {isAssetSubmission(sub)
                ? `${sub.category} · ${sub.userName}`
                : `${sub.episodeTitle} · ${sub.userName}`}
              {sub.submittedAt ? ` · ${formatSubmittedWhen(sub.submittedAt)}` : ""}
            </span>
            {freeDuringJam && !isAssetSubmission(sub) ? (
              <span className="jam-page-free-pill">Free during jam</span>
            ) : null}
            {sub.likes > 0 ? <span className="jam-page-likes">{sub.likes} ♥</span> : null}
          </div>
          {isAssetSubmission(sub) ? (
            <a className="btn btn-sm btn-primary" href={sub.viewHref}>
              View
            </a>
          ) : (
            <Link className="btn btn-sm btn-primary" to={sub.playHref}>
              Play
            </Link>
          )}
        </article>
      ))}
    </div>
  );
}

export function JamMetaLine({
  jamType,
  phase,
  ageRestricted,
  prizePool,
  totalSubmissions,
}: {
  jamType?: string;
  phase: string;
  ageRestricted?: boolean;
  prizePool?: number;
  totalSubmissions?: number;
}) {
  return (
    <p className="jam-page-meta">
      <span className={"jam-type-badge jam-type-badge--" + (jamType || "game")}>{jamTypeLabel(jamType)}</span>
      <span className={"jam-home-phase jam-home-phase--" + phase}>{formatJamPhase(phase)}</span>
      {ageRestricted ? <span className="jam-home-age">18+</span> : null}
      {prizePool && prizePool > 0 ? <span>{prizePool.toLocaleString()} Ducat prize</span> : null}
      {typeof totalSubmissions === "number" ? (
        <span>
          {totalSubmissions} entr{totalSubmissions === 1 ? "y" : "ies"}
        </span>
      ) : null}
    </p>
  );
}
