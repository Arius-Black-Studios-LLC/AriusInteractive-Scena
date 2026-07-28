import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLegacyBundle } from "../hooks/useLegacyBundle";
import "./AdminModerationPage.css";

type Tab = "reports" | "comments" | "series" | "jams" | "listings";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function AdminModerationPage() {
  const { session, userId, loading: authLoading, isAdmin, profileLoading } = useAuth();
  const navigate = useNavigate();
  const { ready, error } = useLegacyBundle("admin", [
    "studio.css",
    "scena-logo.css",
    "arleco-theme.css",
  ]);

  const [tab, setTab] = useState<Tab>("reports");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reports, setReports] = useState<Array<Record<string, unknown>>>([]);
  const [comments, setComments] = useState<Array<Record<string, unknown>>>([]);
  const [series, setSeries] = useState<Array<Record<string, unknown>>>([]);
  const [jams, setJams] = useState<Array<Record<string, unknown>>>([]);
  const [listings, setListings] = useState<Array<Record<string, unknown>>>([]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!userId || !session) {
      navigate("/?login=account", { replace: true });
      return;
    }
    if (!isAdmin) navigate("/", { replace: true });
  }, [authLoading, profileLoading, userId, session, isAdmin, navigate]);

  const reload = useCallback(() => {
    if (!window.ScenaAdmin) return Promise.reject(new Error("Admin module not loaded."));
    setLoading(true);
    setLoadError(null);
    const admin = window.ScenaAdmin;
    const soft = (p: Promise<unknown> | undefined, fallback: unknown[]) =>
      (p ?? Promise.resolve(fallback)).catch(() => fallback);
    return Promise.all([
      soft(admin.listContentReports?.(), []),
      soft(admin.listRecentComments?.(), []),
      soft(admin.listPublishedSeries?.(), []),
      soft(admin.listGameJams?.(), []),
      soft(admin.listMarketplaceListings?.(), []),
    ])
      .then(([reportRows, commentRows, seriesRows, jamRows, listingRows]) => {
        setReports((reportRows as Array<Record<string, unknown>>) || []);
        setComments((commentRows as Array<Record<string, unknown>>) || []);
        setSeries((seriesRows as Array<Record<string, unknown>>) || []);
        setJams((jamRows as Array<Record<string, unknown>>) || []);
        setListings((listingRows as Array<Record<string, unknown>>) || []);
      })
      .catch((err: Error) => setLoadError(err.message || "Could not load moderation queue."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!ready || !isAdmin) return;
    reload();
  }, [ready, isAdmin, reload]);

  async function runAction(action: () => Promise<unknown>, successMsg: string) {
    try {
      await action();
      showToast(successMsg);
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Action failed.");
    }
  }

  if (error || loadError) {
    return (
      <div className="admin-mod-page container">
        <p className="admin-mod-error">{error || loadError}</p>
        <Link to="/">Home</Link>
      </div>
    );
  }

  if (authLoading || profileLoading || !ready || loading) {
    return <div className="admin-mod-loading">Loading moderation…</div>;
  }

  if (!isAdmin) return null;

  const openReports = reports.filter((r) => r.status === "open").length;

  return (
    <div className="admin-mod-page container">
      <header className="admin-mod-head">
        <div>
          <p className="admin-mod-eyebrow">Platform admin</p>
          <h1>Moderation</h1>
          <p className="admin-mod-lede">
            Review reports, hide comments, delist series descriptions, and remove jam or marketplace
            listings.
          </p>
        </div>
        <div className="admin-mod-head-actions">
          <Link className="btn btn-ghost btn-sm" to="/admin/featured">
            Staff picks
          </Link>
          <Link className="btn btn-ghost btn-sm" to="/">
            Home
          </Link>
        </div>
      </header>

      <div className="admin-mod-tabs" role="tablist">
        {(
          [
            ["reports", `Reports${openReports ? ` (${openReports})` : ""}`],
            ["comments", "Comments"],
            ["series", "Series"],
            ["jams", "Game jams"],
            ["listings", "Marketplace"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={`admin-mod-tab${tab === id ? " is-active" : ""}`}
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "reports" ? (
        <div className="admin-mod-panel">
          {reports.length === 0 ? (
            <p className="admin-mod-empty">No reports yet.</p>
          ) : (
            reports.map((row) => (
              <article className="admin-mod-card" key={String(row.reportId)}>
                <header>
                  <strong>{String(row.targetType)}</strong>
                  <span className="admin-mod-badge">{String(row.status)}</span>
                </header>
                <p className="admin-mod-meta">
                  {String(row.reporterName)} · {formatDate(row.createdAt as string)}
                </p>
                <p>
                  <strong>{String(row.reason)}</strong>
                  {row.details ? ` — ${String(row.details)}` : ""}
                </p>
                <p className="admin-mod-meta">Target: {String(row.targetId)}</p>
                {row.status === "open" ? (
                  <div className="admin-mod-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() =>
                        runAction(
                          () => window.ScenaAdmin!.resolveContentReport!(String(row.reportId), "resolved"),
                          "Report resolved.",
                        )
                      }
                    >
                      Mark resolved
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        runAction(
                          () => window.ScenaAdmin!.resolveContentReport!(String(row.reportId), "dismissed"),
                          "Report dismissed.",
                        )
                      }
                    >
                      Dismiss
                    </button>
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>
      ) : null}

      {tab === "comments" ? (
        <div className="admin-mod-panel">
          {comments.length === 0 ? (
            <p className="admin-mod-empty">No comments in cloud yet.</p>
          ) : (
            comments.map((row) => (
              <article
                className={`admin-mod-card${row.hiddenAt ? " is-muted" : ""}`}
                key={String(row.commentId)}
              >
                <p className="admin-mod-meta">
                  {String(row.authorName)} · {formatDate(row.createdAt as string)}
                </p>
                <p>{String(row.body)}</p>
                <p className="admin-mod-meta">
                  Series {String(row.seriesId)} · episode {String(row.episodeId)}
                </p>
                {row.hiddenAt ? (
                  <p className="admin-mod-warn">Hidden: {String(row.hiddenReason || "moderation")}</p>
                ) : null}
                <div className="admin-mod-actions">
                  {row.hiddenAt ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        runAction(
                          () => window.ScenaAdmin!.unhideComment!(String(row.commentId)),
                          "Comment restored.",
                        )
                      }
                    >
                      Unhide
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        const reason = window.prompt("Reason for hiding this comment?", "Policy violation");
                        if (!reason) return;
                        runAction(
                          () => window.ScenaAdmin!.hideComment!(String(row.commentId), reason),
                          "Comment hidden.",
                        );
                      }}
                    >
                      Hide comment
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      ) : null}

      {tab === "series" ? (
        <div className="admin-mod-panel">
          {series.length === 0 ? (
            <p className="admin-mod-empty">No published series.</p>
          ) : (
            series.map((row) => (
              <article
                className={`admin-mod-card${row.adminHidden ? " is-muted" : ""}`}
                key={String(row.seriesId)}
              >
                <h2>{String(row.title)}</h2>
                <p>{String(row.description || "No description.")}</p>
                <p className="admin-mod-meta">
                  {String(row.liveChapterCount)} live chapters · owner {String(row.ownerId)}
                </p>
                {row.adminHidden ? (
                  <p className="admin-mod-warn">Hidden: {String(row.adminHiddenReason || "moderation")}</p>
                ) : null}
                <div className="admin-mod-actions">
                  {row.adminHidden ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        runAction(
                          () =>
                            window.ScenaAdmin!.setSeriesModeration!({
                              ownerId: String(row.ownerId),
                              seriesId: String(row.seriesId),
                              hidden: false,
                            }),
                          "Series restored to discover.",
                        )
                      }
                    >
                      Restore listing
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        const reason = window.prompt(
                          "Reason for hiding this series from discover/play?",
                          "Policy violation",
                        );
                        if (!reason) return;
                        const clear = window.confirm(
                          "Also clear short & long descriptions from the series listing?",
                        );
                        runAction(
                          () =>
                            window.ScenaAdmin!.setSeriesModeration!({
                              ownerId: String(row.ownerId),
                              seriesId: String(row.seriesId),
                              hidden: true,
                              reason,
                              clearDescriptions: clear,
                            }),
                          "Series hidden from public.",
                        );
                      }}
                    >
                      Hide from public
                    </button>
                  )}
                  <Link
                    className="btn btn-ghost btn-sm"
                    to={`/series?series=${encodeURIComponent(String(row.seriesId))}`}
                  >
                    View page
                  </Link>
                </div>
              </article>
            ))
          )}
        </div>
      ) : null}

      {tab === "jams" ? (
        <div className="admin-mod-panel">
          {jams.length === 0 ? (
            <p className="admin-mod-empty">
              No jams in cloud yet. Jams sync when hosts publish them (after this update is deployed).
            </p>
          ) : (
            jams.map((row) => (
              <article
                className={`admin-mod-card${row.hiddenAt ? " is-muted" : ""}`}
                key={String(row.jamId)}
              >
                <h2>{String(row.title)}</h2>
                <p>{String(row.tagline)}</p>
                {row.rules ? <p className="admin-mod-rules">{String(row.rules)}</p> : null}
                <p className="admin-mod-meta">
                  Host {String(row.hostName)} · {String(row.submissionCount)} submissions ·{" "}
                  {String(row.status)}
                </p>
                {row.hiddenAt ? (
                  <p className="admin-mod-warn">Hidden: {String(row.hiddenReason || "moderation")}</p>
                ) : null}
                <div className="admin-mod-actions">
                  {row.hiddenAt ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        runAction(
                          () => window.ScenaAdmin!.unhideGameJam!(String(row.jamId)),
                          "Jam restored.",
                        )
                      }
                    >
                      Unhide jam
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        const reason = window.prompt("Reason for hiding this jam?", "Policy violation");
                        if (!reason) return;
                        runAction(
                          () => window.ScenaAdmin!.hideGameJam!(String(row.jamId), reason),
                          "Jam hidden from browse.",
                        );
                      }}
                    >
                      Hide jam
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      ) : null}

      {tab === "listings" ? (
        <div className="admin-mod-panel">
          {listings.length === 0 ? (
            <p className="admin-mod-empty">No marketplace listings.</p>
          ) : (
            listings.map((row) => (
              <article className="admin-mod-card" key={String(row.listingId)}>
                <h2>{String(row.title)}</h2>
                <p>{String(row.description || "No description.")}</p>
                <p className="admin-mod-meta">
                  {String(row.sellerName)} · {String(row.category)} · {String(row.status)}
                </p>
                <div className="admin-mod-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      const reason = window.prompt(
                        "Reason for removing this marketplace listing?",
                        "Policy violation",
                      );
                      if (!reason) return;
                      runAction(
                        () =>
                          window.ScenaAdmin!.removeMarketplaceListing!(String(row.listingId), reason),
                        "Listing removed.",
                      );
                    }}
                  >
                    Remove listing
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      ) : null}

      {toast ? (
        <div className="toast admin-mod-toast is-show" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
