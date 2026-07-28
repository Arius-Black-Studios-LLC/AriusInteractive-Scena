import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLegacyBundle } from "../hooks/useLegacyBundle";
import "./AdminFeaturedPage.css";

type AdminSeriesRow = {
  seriesId: string;
  ownerId: string;
  title: string;
  description: string;
  thumbnailDataUrl: string;
  bannerDataUrl: string;
  featured: boolean;
  featuredOrder: number | null;
  featuredEyebrow: string;
  liveChapterCount: number;
  updatedAt: string;
};

type DraftRow = {
  featured: boolean;
  featuredOrder: string;
  featuredEyebrow: string;
};

function draftFromRow(row: AdminSeriesRow): DraftRow {
  return {
    featured: row.featured,
    featuredOrder: row.featuredOrder != null ? String(row.featuredOrder) : "",
    featuredEyebrow: row.featuredEyebrow || "",
  };
}

export function AdminFeaturedPage() {
  const { isAdmin } = useAuth();
  const { ready, error } = useLegacyBundle("admin", [
    "studio.css",
    "scena-logo.css",
    "arleco-theme.css",
  ]);

  const [rows, setRows] = useState<AdminSeriesRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const loadRows = useCallback(() => {
    if (!window.ScenaAdmin) return Promise.reject(new Error("Admin module not loaded."));
    setLoading(true);
    setLoadError(null);
    return window.ScenaAdmin.listPublishedSeries()
      .then((list) => {
        const typed = list as AdminSeriesRow[];
        setRows(typed);
        const nextDrafts: Record<string, DraftRow> = {};
        typed.forEach((row) => {
          nextDrafts[row.seriesId] = draftFromRow(row);
        });
        setDrafts(nextDrafts);
      })
      .catch((err: Error) => {
        setLoadError(err.message || "Could not load published series.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!ready || !isAdmin || !window.ScenaAdmin) return;
    loadRows();
  }, [ready, isAdmin, loadRows]);

  const featuredCount = useMemo(
    () => Object.values(drafts).filter((d) => d.featured).length,
    [drafts],
  );

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? rows.slice()
      : rows.filter((row) => {
          const title = (row.title || "").toLowerCase();
          const desc = (row.description || "").toLowerCase();
          const id = (row.seriesId || "").toLowerCase();
          return title.includes(q) || desc.includes(q) || id.includes(q);
        });
    list.sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      const ao = a.featuredOrder ?? 99;
      const bo = b.featuredOrder ?? 99;
      if (ao !== bo) return ao - bo;
      return (a.title || "").localeCompare(b.title || "");
    });
    return list;
  }, [rows, query]);

  function updateDraft(seriesId: string, patch: Partial<DraftRow>) {
    setDrafts((prev) => ({
      ...prev,
      [seriesId]: { ...prev[seriesId], ...patch },
    }));
  }

  async function saveRow(row: AdminSeriesRow) {
    const draft = drafts[row.seriesId];
    if (!draft || !window.ScenaAdmin) return;

    const order = draft.featuredOrder.trim();
    let featuredOrder: number | null = null;
    if (draft.featured && order) {
      featuredOrder = parseInt(order, 10);
      if (!featuredOrder || featuredOrder < 1 || featuredOrder > 9) {
        showToast("Order must be 1–9 (1 = hero card).");
        return;
      }
    }

    if (draft.featured && featuredCount > 3 && !row.featured) {
      showToast("At most 3 staff picks show on the home page.");
      return;
    }

    setSavingId(row.seriesId);
    try {
      await window.ScenaAdmin.setSeriesFeatured({
        ownerId: row.ownerId,
        seriesId: row.seriesId,
        featured: draft.featured,
        featuredOrder: draft.featured ? featuredOrder : null,
        featuredEyebrow: draft.featured ? draft.featuredEyebrow.trim() : null,
      });
      showToast(draft.featured ? "Added to staff picks." : "Removed from staff picks.");
      await loadRows();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSavingId(null);
    }
  }

  if (error || loadError) {
    return (
      <div>
        <p className="admin-featured-error">{error || loadError}</p>
        <Link to="/">Home</Link>
      </div>
    );
  }

  if (!ready || loading) {
    return <div className="admin-featured-loading">Loading staff picks…</div>;
  }

  if (!isAdmin) return null;

  return (
    <div className="admin-featured-section">
      <div className="admin-featured-section-head">
        <div>
          <h2 className="admin-featured-section-title">Staff picks</h2>
          <p className="admin-featured-lede">
            Choose up to three published series for the home page Featured section. Order{" "}
            <strong>1</strong> is the hero card; <strong>2–3</strong> appear beside it.
          </p>
        </div>
        <Link className="btn btn-ghost btn-sm" to="/">
          View home page
        </Link>
      </div>

      <label className="admin-featured-lookup">
        <span>Look up series</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by series name…"
          autoComplete="off"
          aria-label="Search series by name"
        />
        {query.trim() ? (
          <span className="admin-featured-lookup-meta">
            {filteredRows.length} match{filteredRows.length === 1 ? "" : "es"}
          </span>
        ) : (
          <span className="admin-featured-lookup-meta">
            {featuredCount} featured · {rows.length} published
          </span>
        )}
      </label>

      {rows.length === 0 ? (
        <p className="admin-featured-empty">
          No published series yet. Creators need at least one live chapter before you can feature
          them.
        </p>
      ) : filteredRows.length === 0 ? (
        <p className="admin-featured-empty">
          No series match “{query.trim()}”. Try another title.
        </p>
      ) : (
        <div className="admin-featured-list">
          {filteredRows.map((row) => {
            const draft = drafts[row.seriesId] || draftFromRow(row);
            const imageUrl = row.bannerDataUrl || row.thumbnailDataUrl;
            return (
              <article className="admin-featured-row" key={row.seriesId}>
                <div
                  className="admin-featured-thumb"
                  style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
                />
                <div className="admin-featured-main">
                  <h2>{row.title}</h2>
                  <p>{row.description || "No description."}</p>
                  <p className="admin-featured-meta">
                    {row.liveChapterCount}{" "}
                    {row.liveChapterCount === 1 ? "live chapter" : "live chapters"}
                    {row.featured ? " · Currently featured" : ""}
                  </p>
                </div>
                <div className="admin-featured-controls">
                  <label className="admin-featured-check">
                    <input
                      type="checkbox"
                      checked={draft.featured}
                      onChange={(e) => updateDraft(row.seriesId, { featured: e.target.checked })}
                    />
                    Staff pick
                  </label>
                  <label className="admin-featured-field">
                    <span>Order</span>
                    <input
                      type="number"
                      min={1}
                      max={9}
                      placeholder="1"
                      disabled={!draft.featured}
                      value={draft.featuredOrder}
                      onChange={(e) =>
                        updateDraft(row.seriesId, { featuredOrder: e.target.value })
                      }
                    />
                  </label>
                  <label className="admin-featured-field admin-featured-field--wide">
                    <span>Eyebrow</span>
                    <input
                      type="text"
                      placeholder="Editor's pick"
                      disabled={!draft.featured}
                      value={draft.featuredEyebrow}
                      onChange={(e) =>
                        updateDraft(row.seriesId, { featuredEyebrow: e.target.value })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={savingId === row.seriesId}
                    onClick={() => saveRow(row)}
                  >
                    {savingId === row.seriesId ? "Saving…" : "Save"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {toast ? (
        <div className="toast admin-featured-toast is-show" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
