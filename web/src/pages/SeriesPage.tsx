import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLegacyBundle } from "../hooks/useLegacyBundle";
import "./SeriesPage.css";

type Episode = {
  id: string;
  number?: number;
  title?: string;
  isLive?: boolean;
};

type SaveRow = {
  id: string;
  label: string;
  summary: string;
  isActive: boolean;
  resumeEpisodeId?: string | null;
  hasCheckpoint?: boolean;
};

export function SeriesPage() {
  const [params] = useSearchParams();
  const { userId } = useAuth();
  const seriesId = params.get("series");
  const lockedEp = params.get("locked");
  const { ready, error: loadError } = useLegacyBundle("reader", [
    "studio.css",
    "series.css",
    "scena-logo.css",
    "arleco-theme.css",
  ]);

  const [title, setTitle] = useState("Loading…");
  const [description, setDescription] = useState("");
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [saves, setSaves] = useState<SaveRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scopeId, setScopeId] = useState("anon");
  const [seriesData, setSeriesData] = useState<unknown>(null);

  function refreshSaves(series: unknown, scope: string) {
    const progress = window.ScenaProgress as Record<string, (...args: unknown[]) => unknown>;
    if (!progress?.listSaves) return;
    const rows = progress.listSaves(scope, seriesId!, series) as SaveRow[];
    setSaves(rows);
  }

  useEffect(() => {
    if (!ready || !seriesId) return;

    const store = window.ScenaStore as Record<string, (...args: unknown[]) => unknown>;
    const progress = window.ScenaProgress as Record<string, (...args: unknown[]) => unknown>;
    const catalog = window.ScenaCatalog;

    let cancelled = false;

    (async () => {
      const scope = progress.scopeFromUser(userId) as string;
      setScopeId(scope);
      await (store.ready as (id: string | null) => Promise<void>)(userId);

      const series = catalog?.resolveSeries
        ? await catalog.resolveSeries(seriesId, userId)
        : (store.getSeries as (id: string | null, sid: string) => unknown)(userId, seriesId) ||
          window.ScenaDemo?.getSeries(seriesId);

      if (!series || cancelled) {
        setError("Series not found.");
        return;
      }

      (store.normalizeSeries as (s: unknown) => void)(series);
      await (progress.ready as (scope: string, sid: string) => Promise<void>)(scope, seriesId);

      const s = series as { title?: string; shortDescription?: string; longDescription?: string };
      setTitle(s.title || "Untitled");
      setDescription(s.shortDescription || s.longDescription || "");

      const eps = (
        store.orderedEpisodes as (ser: unknown) => Episode[]
      )(series).filter((ep) => ep.isLive);
      setEpisodes(eps);
      setSeriesData(series);
      refreshSaves(series, scope);

      if (lockedEp) {
        setError("Finish the previous chapter to unlock this one.");
      }
    })().catch(() => setError("Could not load chapters."));

    return () => {
      cancelled = true;
    };
  }, [ready, seriesId, userId, lockedEp]);

  function playUrl(episodeId: string, restart = false) {
    const progress = window.ScenaProgress as { playUrl: (sid: string, eid: string, r?: boolean) => string };
    return progress.playUrl(seriesId!, episodeId, restart);
  }

  function isUnlocked(ep: Episode) {
    const progress = window.ScenaProgress as {
      isEpisodeUnlocked: (scope: string, series: unknown, ep: Episode) => boolean;
    };
    if (!progress || !seriesData) return false;
    return progress.isEpisodeUnlocked(scopeId, seriesData, ep);
  }

  function lockReason(ep: Episode) {
    const progress = window.ScenaProgress as {
      lockReason: (scope: string, series: unknown, ep: Episode) => string;
    };
    return progress?.lockReason(scopeId, seriesData, ep) || "";
  }

  function episodeProgress(ep: Episode) {
    const progress = window.ScenaProgress as {
      get: (scope: string, sid: string) => { episodes: Record<string, { completed?: boolean; checkpoint?: unknown }> };
    };
    const bundle = progress.get(scopeId, seriesId!);
    return bundle.episodes[ep.id] || {};
  }

  function activateSave(saveId: string) {
    const progress = window.ScenaProgress as {
      setActiveSave: (scope: string, sid: string, saveId: string) => void;
    };
    progress.setActiveSave(scopeId, seriesId!, saveId);
    window.location.reload();
  }

  function newSave() {
    const label = window.prompt("Save file name:", "Playthrough");
    if (!label) return;
    const progress = window.ScenaProgress as {
      createSave: (scope: string, sid: string, label: string) => void;
    };
    progress.createSave(scopeId, seriesId!, label.trim());
    window.location.reload();
  }

  if (!seriesId) {
    return (
      <div className="series-loading">
        <p>Missing series link.</p>
        <Link to="/">Discover</Link>
      </div>
    );
  }

  if (loadError || error) {
    return (
      <div className="series-loading">
        <p>{loadError || error}</p>
        <Link to="/">Discover</Link>
      </div>
    );
  }

  if (!ready) {
    return <div className="series-loading">Loading chapters…</div>;
  }

  return (
    <div className="series-shell">
      <header className="series-header">
        <Link className="series-back" to="/">
          ← Discover
        </Link>
        {userId ? (
          <div className="series-header-actions">
            <Link className="series-account-link" to="/account">
              Account
            </Link>
          </div>
        ) : null}
        <div className="series-hero">
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
      </header>

      <main className="series-main container">
        <section className="series-saves">
          <div className="series-saves-toolbar">
            <h2>Save files</h2>
            <button type="button" className="btn btn-sm btn-primary" onClick={newSave}>
              + New
            </button>
          </div>
          <div className="series-save-list">
            {saves.map((save) => (
              <button
                key={save.id}
                type="button"
                className={`series-save-row${save.isActive ? " is-active" : ""}`}
                onClick={() => activateSave(save.id)}
              >
                <strong>{save.label}</strong>
                <span>{save.summary}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="series-chapters">
          <h2>Chapters</h2>
          <div className="series-chapter-list">
            {episodes.map((ep) => {
              const unlocked = isUnlocked(ep);
              const rec = episodeProgress(ep);
              const status = rec.completed
                ? "Completed"
                : rec.checkpoint
                  ? "In progress"
                  : unlocked
                    ? "Ready"
                    : "Locked";
              return (
                <article
                  key={ep.id}
                  className={`series-chapter${unlocked ? "" : " series-chapter--locked"}`}
                >
                  <div className="series-chapter-head">
                    <span>Chapter {ep.number || "?"}</span>
                    <span>{status}</span>
                  </div>
                  <h3>{ep.title || `Chapter ${ep.number}`}</h3>
                  {!unlocked ? <p className="series-chapter-lock">{lockReason(ep)}</p> : null}
                  <div className="series-chapter-actions">
                    {unlocked ? (
                      <>
                        <Link className="btn btn-primary btn-sm" to={playUrl(ep.id)}>
                          {rec.checkpoint ? "Continue" : "Play"}
                        </Link>
                        {rec.completed || rec.checkpoint ? (
                          <Link className="btn btn-ghost btn-sm" to={playUrl(ep.id, true)}>
                            Restart
                          </Link>
                        ) : null}
                      </>
                    ) : (
                      <button type="button" className="btn btn-primary btn-sm" disabled>
                        Locked
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
