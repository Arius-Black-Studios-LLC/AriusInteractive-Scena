import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SeriesCard } from "../components/SeriesCard";
import { useAuth } from "../context/AuthContext";
import { useLegacyBundle } from "../hooks/useLegacyBundle";
import {
  DEMO_SERIES,
  GENRE_FILTERS,
  matchesGenre,
  matchesSearch,
  type CatalogEntry,
} from "../lib/catalog";
import "./HomePage.css";

function mapEntry(entry: CatalogEntry & { chaptersReadThisWeekLabel?: string }) {
  return {
    ...entry,
    readersLabel: entry.chaptersReadThisWeekLabel || entry.readersLabel,
    href: entry.href.startsWith("/") ? entry.href : `/series?series=${entry.id}`,
  };
}

export function HomePage() {
  const { userId } = useAuth();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState(DEMO_SERIES);
  const { ready } = useLegacyBundle("reader", ["scena-logo.css", "arleco-theme.css"]);

  useEffect(() => {
    if (!ready || !window.ScenaCatalog) return;
    Promise.all([
      window.ScenaCatalog.listDiscover(userId),
      window.ScenaCatalog.fetchReaderStats(),
    ])
      .then(([list, stats]) => {
        const bundle = window.ScenaCatalog!.enrichReaderStats(list, stats) as {
          entries?: CatalogEntry[];
        };
        const rows = (bundle.entries || list || []).map((entry) =>
          mapEntry(entry as CatalogEntry & { chaptersReadThisWeekLabel?: string }),
        );
        if (rows.length) setEntries(rows);
      })
      .catch(() => {
        /* keep demo fallback */
      });
  }, [ready, userId]);

  useEffect(() => {
    if (!ready || !window.ScenaFeedback) return;
    window.ScenaFeedback.mountHomepage("creatorReviewsMount");
  }, [ready]);

  const filtered = useMemo(
    () => entries.filter((e) => matchesGenre(e, filter) && matchesSearch(e, search)),
    [entries, filter, search],
  );

  return (
    <>
      <section className="hero">
        <div className="hero-bg" aria-hidden="true">
          <div className="hero-blob hero-blob--1" />
          <div className="hero-blob hero-blob--2" />
        </div>
        <div className="container hero-inner">
          <div className="hero-badges">
            <span className="hero-badge">Early beta</span>
            <span className="hero-badge hero-badge--gold">Human-made stories only</span>
          </div>
          <h1>
            Stories you <span className="hero-accent">choose</span>.
          </h1>
          <p className="hero-lede">
            An indie platform for episodic visual novels — built for readers and independent
            creators, not algorithms.
          </p>
          <p className="hero-trust">
            <strong>No AI-generated fiction.</strong> Every chapter is written and published by
            real people.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary" href="#discover">
              Browse series
            </a>
            <Link className="btn btn-secondary" to="/studio">
              Publish your story
            </Link>
          </div>
        </div>
      </section>

      <section className="section container" id="featured">
        <div className="section-head">
          <h2>Featured</h2>
          <span className="section-meta">Staff picks</span>
        </div>
        <div className="featured-grid">
          <Link className="featured-hero" to="/series?series=signal-lost">
            <div className="featured-visual featured-visual--c">
              <span className="featured-badge">Read free</span>
            </div>
            <div className="featured-body">
              <div className="featured-eyebrow">Editor&apos;s pick</div>
              <h3>Signal Lost</h3>
              <p>A sci-fi mystery aboard Kerberos-9 — comms dead, crew uneasy, and something knocking inside the hull.</p>
            </div>
          </Link>
          <Link className="featured-side" to="/series?series=cafe-at-sunset">
            <div className="featured-visual featured-visual--b" />
            <div className="featured-body">
              <h3>Café at Sunset</h3>
              <p>Two playable chapters of cozy romance and too much matcha.</p>
            </div>
          </Link>
        </div>
      </section>

      <div id="creatorReviewsMount" />

      <section className="section container" id="discover">
        <div className="section-head">
          <h2>Discover</h2>
          <span className="section-meta">Human-written · Indie creators</span>
        </div>
        <div className="discover-toolbar">
          <div className="filter-bar">
            {GENRE_FILTERS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`filter-chip${filter === chip.id ? " is-active" : ""}`}
                onClick={() => setFilter(chip.id)}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <input
            className="search-input"
            type="search"
            placeholder="Search series…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search series"
          />
        </div>
        <div className="discover-grid">
          {filtered.length ? (
            filtered.map((entry) => <SeriesCard key={entry.id} entry={entry} />)
          ) : (
            <p className="empty-state">No series match that filter.</p>
          )}
        </div>
      </section>

      <section className="section container home-links">
        <Link to="/blog">Creator guides on the blog</Link>
        <Link to="/learn">Learn in the Conservatory</Link>
      </section>
    </>
  );
}
