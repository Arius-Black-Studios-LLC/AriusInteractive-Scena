import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLegacyBundle } from "../hooks/useLegacyBundle";
import "./PlayPage.css";

export function PlayPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { userId, session } = useAuth();
  const rootRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<{ destroy: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState("");
  const { ready, error: loadError } = useLegacyBundle("player", [
    "studio.css",
    "play.css",
    "scena-logo.css",
    "arleco-theme.css",
  ]);

  const seriesId = params.get("series");
  const episodeId = params.get("episode");
  const fromStudio = params.get("from") === "studio";
  const restartChapter = params.get("restart") === "1";

  useEffect(() => {
    if (!ready || !seriesId) return;
    if (!episodeId) {
      navigate(`/series?series=${encodeURIComponent(seriesId)}`, { replace: true });
      return;
    }

    const store = window.ScenaStore as Record<string, (...args: unknown[]) => unknown>;
    const progress = window.ScenaProgress as Record<string, (...args: unknown[]) => unknown>;
    const catalog = window.ScenaCatalog;
    const Player = window.ScenaPlayer;

    if (!store || !progress || !Player) {
      setError("Player modules failed to load.");
      return;
    }

    let cancelled = false;
    const scopeId = progress.scopeFromUser(userId) as string;

    (async () => {
      await (store.ready as (id: string | null) => Promise<void>)(userId);
      const series = catalog?.resolveSeries
        ? await catalog.resolveSeries(seriesId, userId)
        : (store.getSeries as (id: string | null, sid: string) => unknown)(userId, seriesId) ||
          window.ScenaDemo?.getSeries(seriesId);

      if (!series || cancelled) {
        setError("Story not found.");
        return;
      }

      (store.normalizeSeries as (s: unknown) => void)(series);
      (store.ensureDefaultAudio as (s: unknown) => void)(series);

      const episodes = ((series as { episodes?: { id: string }[] }).episodes) || [];
      const episode = episodes.find((ep) => ep.id === episodeId);
      if (!episode) {
        setError("Episode not found.");
        return;
      }

      await (progress.ready as (scope: string, sid: string) => Promise<void>)(scopeId, seriesId);

      if (
        !fromStudio &&
        !(progress.isEpisodeUnlocked as (scope: string, s: unknown, ep: unknown) => boolean)(
          scopeId,
          series,
          episode,
        )
      ) {
        navigate(`/series?series=${encodeURIComponent(seriesId)}&locked=${encodeURIComponent(episodeId)}`, {
          replace: true,
        });
        return;
      }

      await window.ScenaComments?.load(seriesId, episodeId);
      await window.ScenaHearts?.load(seriesId, episodeId);

      const userProfile =
        userId && window.ScenaProfile
          ? await window.ScenaProfile.get(userId, session)
          : null;

      if (cancelled || !rootRef.current) return;

      playerRef.current?.destroy();
      const player = new Player(rootRef.current, series, {
        episode,
        fromStudio,
        userProfile,
        progressScopeId: scopeId,
        restartChapter,
        onError: setError,
      });

      if (!(player.startEpisode(episode, { restart: restartChapter }) as boolean)) {
        setError("This episode has no playable beats yet.");
        return;
      }

      playerRef.current = player;
      setMeta(
        `${(series as { title?: string }).title || "Story"} · ${
          (episode as { title?: string }).title ||
          `Chapter ${(episode as { number?: number }).number || "?"}`
        }`,
      );
    })().catch(() => setError("Could not load story."));

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [
    ready,
    seriesId,
    episodeId,
    userId,
    session,
    fromStudio,
    restartChapter,
    navigate,
  ]);

  if (loadError || error) {
    return (
      <div className="player-loading">
        <p>{loadError || error}</p>
        <Link to="/">Back to Discover</Link>
      </div>
    );
  }

  if (!ready || !seriesId) {
    return <div className="player-loading">Opening story…</div>;
  }

  return (
    <div className="player-shell">
      <div className="player-topbar">
        <Link
          className="player-back"
          to={
            fromStudio
              ? `/studio#/series/${encodeURIComponent(seriesId!)}/episodes`
              : `/series?series=${encodeURIComponent(seriesId!)}`
          }
        >
          ← {fromStudio ? "Back to studio" : "Chapters"}
        </Link>
        <span className="player-topbar-meta">{meta}</span>
        {userId ? (
          <Link className="player-account-link" to="/account">
            Account
          </Link>
        ) : null}
      </div>
      <div ref={rootRef} id="playerRoot" />
    </div>
  );
}
