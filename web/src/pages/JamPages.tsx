import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLegacyBundle } from "../hooks/useLegacyBundle";
import {
  JamCover,
  JamMetaLine,
  SubmissionCarousel,
  type PlayerJamCard,
  type PlayerJamDetail,
} from "../components/JamPlayerBits";
import { AdminDelistControl } from "../components/AdminDelistControl";
import "./JamPages.css";

export function JamsPage() {
  const { userId, session } = useAuth();
  const { ready } = useLegacyBundle("reader", ["scena-logo.css", "arleco-theme.css"]);
  const [query, setQuery] = useState("");
  const [viewerIsAdult, setViewerIsAdult] = useState(false);
  const [jams, setJams] = useState<PlayerJamCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId || !session || !window.ScenaProfile) {
      setViewerIsAdult(false);
      return;
    }
    window.ScenaProfile.get(userId, session)
      .then((profile) => setViewerIsAdult(Boolean(window.ScenaProfile?.isAdultVerified?.(profile))))
      .catch(() => setViewerIsAdult(false));
  }, [userId, session, ready]);

  useEffect(() => {
    if (!ready || !window.ScenaJams?.listPlayerJamDiscover) {
      setLoading(false);
      return;
    }
    setLoading(true);
    window.ScenaJams.listPlayerJamDiscover({
      query,
      hideAdult: true,
      viewerIsAdult,
      limit: 40,
    })
      .then((rows) => setJams((rows as PlayerJamCard[]) || []))
      .catch(() => setJams([]))
      .finally(() => setLoading(false));
  }, [ready, query, viewerIsAdult]);

  return (
    <main className="jam-pages container">
      <header className="jam-pages-head">
        <div>
          <p className="jam-pages-eyebrow">Play · Discover</p>
          <h1>Game jams</h1>
          <p className="jam-pages-lede">
            Browse live challenges and play entries. Stories that are usually paid are free while a jam
            is accepting entries or judging. To submit your own work, open Creator studio.
          </p>
        </div>
        <Link className="btn btn-secondary btn-sm" to="/studio#/jams">
          Host or enter in Studio
        </Link>
      </header>

      <div className="jam-pages-toolbar">
        <input
          type="search"
          className="search-input"
          placeholder="Search jams…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search game jams"
        />
      </div>

      {loading ? <p className="empty-state">Loading jams…</p> : null}
      {!loading && !jams.length ? (
        <p className="empty-state">No game jams match that search right now.</p>
      ) : null}

      <div className="jam-pages-grid">
        {jams.map((jam) => (
          <article className="jam-pages-card" key={jam.jamId}>
            <JamCover title={jam.jamTitle} coverStyle={jam.coverStyle} jamType={jam.jamType} />
            <div className="jam-pages-card-body">
              <Link className="jam-pages-card-title" to={jam.href}>
                {jam.jamTitle}
              </Link>
              <JamMetaLine
                jamType={jam.jamType}
                phase={jam.phase}
                ageRestricted={jam.ageRestricted}
                prizePool={jam.prizePool}
                totalSubmissions={jam.totalSubmissions}
              />
              <p className="jam-pages-card-desc">{jam.description || "Theme challenge"}</p>
              <Link className="btn btn-sm btn-primary" to={jam.href}>
                View submissions
              </Link>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}

export function JamDetailPage() {
  const { jamId = "" } = useParams();
  const { userId, session, isAdmin } = useAuth();
  const { ready } = useLegacyBundle("reader", ["scena-logo.css", "arleco-theme.css"]);
  const [viewerIsAdult, setViewerIsAdult] = useState(false);
  const [detail, setDetail] = useState<PlayerJamDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !session || !window.ScenaProfile) {
      setViewerIsAdult(false);
      return;
    }
    window.ScenaProfile.get(userId, session)
      .then((profile) => setViewerIsAdult(Boolean(window.ScenaProfile?.isAdultVerified?.(profile))))
      .catch(() => setViewerIsAdult(false));
  }, [userId, session, ready]);

  useEffect(() => {
    if (!ready || !jamId || !window.ScenaJams?.getPlayerJamDetail) return;
    window.ScenaJams.getPlayerJamDetail(jamId, { hideAdult: true, viewerIsAdult })
      .then((row) => {
        if (!row) {
          setError("Jam not found.");
          setDetail(null);
          return;
        }
        setDetail(row as PlayerJamDetail);
        setError(null);
      })
      .catch(() => {
        setError("Could not load this jam.");
        setDetail(null);
      });
  }, [ready, jamId, viewerIsAdult]);

  if (error) {
    return (
      <main className="jam-pages container">
        <p className="empty-state">{error}</p>
        <Link to="/jams">Back to game jams</Link>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="jam-pages container">
        <p className="empty-state">Loading…</p>
      </main>
    );
  }

  if (detail.ageGated) {
    return (
      <main className="jam-pages container">
        <p className="empty-state">This jam is age-restricted. Verify your age in Account to view it.</p>
        <Link to="/account">Open account</Link>
      </main>
    );
  }

  return (
    <main className="jam-pages container jam-detail-page">
      <p className="jam-pages-crumb">
        <Link to="/jams">Game jams</Link> / {detail.jamTitle}
      </p>
      <header className="jam-detail-head">
        <JamCover
          title={detail.jamTitle}
          coverStyle={detail.coverStyle}
          jamType={detail.jamType}
          className="jam-page-cover--lg"
        />
        <div>
          <h1>{detail.jamTitle}</h1>
          <JamMetaLine
            jamType={detail.jamType}
            phase={detail.phase}
            ageRestricted={detail.ageRestricted}
            prizePool={detail.prizePool}
            totalSubmissions={detail.submissions.length}
          />
          <p className="jam-detail-desc">{detail.description}</p>
          {detail.freeDuringJam ? (
            <p className="jam-detail-free-note">
              Entries that are usually paid are free to play while this jam is live.
            </p>
          ) : null}
          <div className="jam-detail-actions">
            <Link className="btn btn-ghost btn-sm" to="/studio#/jams">
              Enter this jam in Studio
            </Link>
            {isAdmin ? (
              <AdminDelistControl
                targetType="jam"
                targetId={detail.jamId}
                targetTitle={detail.jamTitle}
              />
            ) : null}
          </div>
        </div>
      </header>

      <section className="jam-detail-subs">
        <h2>Submissions</h2>
        <SubmissionCarousel submissions={detail.submissions} freeDuringJam={detail.freeDuringJam} />
      </section>
    </main>
  );
}
