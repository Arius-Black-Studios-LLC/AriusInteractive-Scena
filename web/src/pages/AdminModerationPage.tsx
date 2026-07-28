import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLegacyBundle } from "../hooks/useLegacyBundle";
import { DELIST_REASONS } from "../components/AdminDelistControl";
import "./AdminModerationPage.css";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function targetHref(row: Record<string, unknown>): string | null {
  const type = String(row.targetType || "");
  const id = String(row.targetId || "");
  if (!id) return null;
  if (type === "series") return `/series?series=${encodeURIComponent(id)}`;
  if (type === "jam") return `/jams/${encodeURIComponent(id)}`;
  if (type === "listing") return `/studio#/library/shop`;
  return null;
}

export function AdminModerationPage() {
  const { isAdmin } = useAuth();
  const { ready, error } = useLegacyBundle("admin", [
    "studio.css",
    "scena-logo.css",
    "arleco-theme.css",
  ]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reports, setReports] = useState<Array<Record<string, unknown>>>([]);
  const [actionReason, setActionReason] = useState<string>(DELIST_REASONS[0]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const reload = useCallback(() => {
    if (!window.ScenaAdmin) return Promise.reject(new Error("Admin module not loaded."));
    setLoading(true);
    setLoadError(null);
    return window.ScenaAdmin.listContentReports!()
      .then((reportRows) => {
        setReports((reportRows as Array<Record<string, unknown>>) || []);
      })
      .catch((err: Error) => setLoadError(err.message || "Could not load reports."))
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

  async function delistFromReport(row: Record<string, unknown>) {
    const type = String(row.targetType || "");
    const id = String(row.targetId || "");
    const meta = (row.targetMeta || {}) as Record<string, unknown>;
    const admin = window.ScenaAdmin!;
    if (type === "series") {
      const ownerId = String(meta.ownerId || meta.owner_id || "");
      if (!ownerId) throw new Error("Report is missing series owner — open the series page to delist.");
      await admin.setSeriesModeration!({
        ownerId,
        seriesId: id,
        hidden: true,
        reason: actionReason,
      });
    } else if (type === "jam") {
      await admin.hideGameJam!(id, actionReason);
    } else if (type === "listing") {
      await admin.removeMarketplaceListing!(id, actionReason);
    } else if (type === "comment") {
      await admin.hideComment!(id, actionReason);
    } else {
      throw new Error("Unknown report target.");
    }
    await admin.resolveContentReport!(String(row.reportId), "resolved");
  }

  if (error || loadError) {
    return (
      <div>
        <p className="admin-mod-error">{error || loadError}</p>
        <Link to="/">Home</Link>
      </div>
    );
  }

  if (!ready || loading) {
    return <div className="admin-mod-loading">Loading reports…</div>;
  }

  if (!isAdmin) return null;

  const openReports = reports.filter((r) => r.status === "open");
  const closedReports = reports.filter((r) => r.status !== "open");

  return (
    <>
      {toast ? <p className="admin-mod-toast">{toast}</p> : null}

      <label className="admin-mod-reason-bar">
        Delist reason for report actions
        <select value={actionReason} onChange={(e) => setActionReason(e.target.value)}>
          {DELIST_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>

      <section className="admin-mod-panel">
        <h2>
          Open reports{openReports.length ? ` (${openReports.length})` : ""}
        </h2>
        {openReports.length === 0 ? (
          <p className="admin-mod-empty">No open reports. Delist anything you find while browsing.</p>
        ) : (
          openReports.map((row) => {
            const href = targetHref(row);
            return (
              <article className="admin-mod-card" key={String(row.reportId)}>
                <header>
                  <strong>{String(row.targetType)}</strong>
                  <span className="admin-mod-badge">open</span>
                </header>
                <p className="admin-mod-meta">
                  {String(row.reporterName)} · {formatDate(row.createdAt as string)}
                </p>
                <p>
                  <strong>{String(row.reason)}</strong>
                  {row.details ? ` — ${String(row.details)}` : ""}
                </p>
                <p className="admin-mod-meta">Target: {String(row.targetId)}</p>
                <div className="admin-mod-actions">
                  {href ? (
                    <Link className="btn btn-ghost btn-sm" to={href}>
                      Open target
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() =>
                      runAction(() => delistFromReport(row), "Delisted and report resolved.")
                    }
                  >
                    Delist + resolve
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      runAction(
                        () =>
                          window.ScenaAdmin!.resolveContentReport!(String(row.reportId), "resolved"),
                        "Report resolved.",
                      )
                    }
                  >
                    Resolve only
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      runAction(
                        () =>
                          window.ScenaAdmin!.resolveContentReport!(String(row.reportId), "dismissed"),
                        "Report dismissed.",
                      )
                    }
                  >
                    Dismiss
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>

      {closedReports.length ? (
        <section className="admin-mod-panel">
          <h2>Recently closed</h2>
          {closedReports.slice(0, 20).map((row) => (
            <article className="admin-mod-card is-muted" key={String(row.reportId)}>
              <header>
                <strong>{String(row.targetType)}</strong>
                <span className="admin-mod-badge">{String(row.status)}</span>
              </header>
              <p className="admin-mod-meta">
                {String(row.reporterName)} · {formatDate(row.createdAt as string)}
              </p>
              <p>
                <strong>{String(row.reason)}</strong>
              </p>
            </article>
          ))}
        </section>
      ) : null}

      <p className="admin-mod-hint">
        Tip: on series and jam pages, use the admin <strong>Delist…</strong> control with a preset
        reason — the creator is notified of what was taken down and why.
      </p>
    </>
  );
}
