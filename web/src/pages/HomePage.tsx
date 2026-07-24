import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SeriesCard } from "../components/SeriesCard";
import { useAuth } from "../context/AuthContext";
import { useLegacyBundle } from "../hooks/useLegacyBundle";
import { mountHomepageReviews } from "../legacy/adapters";
import {
  ADULT_GENRE_FILTERS,
  CATEGORY_SECTIONS,
  DEMO_SERIES,
  GENRE_FILTERS,
  entriesForCategory,
  type CatalogEntryExt,
  visibleEntries,
} from "../lib/catalog";
import "./HomePage.css";

const HERO_WORDS = ["choose", "branch", "discover", "play"];

type HeroStats = {
  liveSeries: number;
  episodes: number;
  chaptersRead: number;
};

function formatChaptersRead(count: number): string {
  if (count <= 0) return "0";
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(count);
}

function mapEntry(entry: CatalogEntryExt & { readersThisWeekLabel?: string; liveCount?: number }) {
  return {
    ...entry,
    readersLabel: entry.readersThisWeekLabel || undefined,
    href: entry.href.startsWith("/") ? entry.href : `/series?series=${entry.id}`,
  };
}

export function HomePage() {
  const { userId, session } = useAuth();
  const [filter, setFilter] = useState("all");
  const [adultFilter, setAdultFilter] = useState("all_adult");
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState<CatalogEntryExt[]>(DEMO_SERIES);
  const [viewerIsAdult, setViewerIsAdult] = useState(false);
  const [heroWordIdx, setHeroWordIdx] = useState(0);
  const [heroWordChanging, setHeroWordChanging] = useState(false);
  const [stats, setStats] = useState<HeroStats>({
    liveSeries: DEMO_SERIES.length,
    episodes: 4,
    chaptersRead: 0,
  });

  const { ready } = useLegacyBundle("reader", ["scena-logo.css", "arleco-theme.css"]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setHeroWordChanging(true);
      window.setTimeout(() => {
        setHeroWordIdx((i) => (i + 1) % HERO_WORDS.length);
        setHeroWordChanging(false);
      }, 320);
    }, 3200);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!userId || !session || !window.ScenaProfile) {
      setViewerIsAdult(false);
      return;
    }
    window.ScenaProfile.get(userId, session)
      .then((profile) => {
        setViewerIsAdult(Boolean(window.ScenaProfile?.isAdultVerified?.(profile)));
      })
      .catch(() => setViewerIsAdult(false));
  }, [userId, session, ready]);

  useEffect(() => {
    if (!ready || !window.ScenaCatalog) return;

    Promise.all([
      window.ScenaCatalog.listDiscover(userId),
      window.ScenaCatalog.fetchReaderStats(),
    ])
      .then(([list, cloudStats]) => {
        const readerBundle = window.ScenaCatalog!.enrichReaderStats(list, cloudStats) as {
          entries?: CatalogEntryExt[];
          chaptersReadThisWeek?: number;
        };

        const rows = (readerBundle.entries || list || []).map((entry) =>
          mapEntry(entry as CatalogEntryExt & { readersThisWeekLabel?: string; liveCount?: number }),
        );

        if (rows.length) setEntries(rows);

        const episodeTotal = (list || []).reduce(
          (sum, entry) => sum + ((entry as { liveCount?: number }).liveCount || 0),
          0,
        );
        setStats({
          liveSeries: list.length || DEMO_SERIES.length,
          episodes: episodeTotal || 4,
          chaptersRead: readerBundle.chaptersReadThisWeek || 0,
        });
      })
      .catch(() => {
        /* keep demo fallback */
      });
  }, [ready, userId]);

  useEffect(() => {
    if (!ready) return;
    mountHomepageReviews("creatorReviewsMount");
  }, [ready]);

  const safeEntries = useMemo(
    () => entries.filter((e) => viewerIsAdult || !e.isAgeRestricted),
    [entries, viewerIsAdult],
  );

  const filtered = useMemo(
    () =>
      visibleEntries(entries, {
        filter,
        search,
        viewerIsAdult,
      }),
    [entries, filter, search, viewerIsAdult],
  );

  const adultFiltered = useMemo(
    () =>
      visibleEntries(entries, {
        filter: adultFilter,
        search,
        viewerIsAdult,
        adultOnly: true,
      }),
    [entries, adultFilter, search, viewerIsAdult],
  );

  return (
    <>
      <div className="hero-wrap">
        <div className="hero-bg" aria-hidden="true">
          <div className="hero-blob hero-blob--1" />
          <div className="hero-blob hero-blob--2" />
          <div className="hero-grid" />
        </div>
        <section className="hero container">
          <div className="hero-accent-line" aria-hidden="true" />
          <div className="hero-badges">
            <span className="hero-badge hero-badge--beta">Early beta</span>
            <span className="hero-badge hero-badge--human">Human-made stories only</span>
          </div>
          <h1>
            <span className="word">Stories</span>{" "}
            <span className="word">
              you{" "}
              <span className={`hero-rotate${heroWordChanging ? " is-changing" : ""}`}>
                {HERO_WORDS[heroWordIdx]}
              </span>
              .
            </span>
          </h1>
          <p className="hero-lede">
            An indie platform for episodic visual novels — built for readers and independent
            creators, not algorithms.
          </p>
          <p className="hero-trust">
            <strong>No AI-generated fiction.</strong> Every chapter is written, edited, and
            published by real people. We&apos;re in early beta — the platform is still growing,
            but the stories are already here.
          </p>
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="hero-stat-num">{formatChaptersRead(stats.chaptersRead)}</div>
              <div className="hero-stat-label">Chapters read this week</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-num">{stats.liveSeries}</div>
              <div className="hero-stat-label">Live series</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-num">{stats.episodes}</div>
              <div className="hero-stat-label">Episodes published</div>
            </div>
          </div>
          <div className="hero-actions">
            <a className="btn btn-primary" href="#discover">
              Browse series
            </a>
            <Link className="btn btn-secondary" to="/studio">
              Publish your story
            </Link>
          </div>
        </section>
      </div>

      <section className="section container" id="featured">
        <div className="section-head section-head--center">
          <h2>Featured</h2>
          <span className="section-meta">Staff picks</span>
        </div>
        <div className="featured-grid">
          <Link className="featured-card featured-card--hero" to="/series?series=signal-lost">
            <div className="featured-visual featured-visual--c">
              <span className="badge">Read free</span>
            </div>
            <div className="featured-body">
              <div className="featured-eyebrow">Editor&apos;s pick</div>
              <h3 className="featured-title">Signal Lost</h3>
              <p className="featured-desc">
                A sci-fi mystery aboard Kerberos-9 — comms dead, crew uneasy, and something
                knocking inside the hull.
              </p>
              <p className="featured-meta">by Lotus Wave · 2 chapters · ~10 min each</p>
            </div>
          </Link>
          <div className="featured-side">
            <Link className="featured-card featured-card--side" to="/series?series=cafe-at-sunset">
              <div className="featured-visual featured-visual--b" />
              <div className="featured-body">
                <h3 className="featured-title">Café at Sunset</h3>
                <p className="featured-desc">
                  Two playable chapters of cozy romance and too much matcha.
                </p>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {CATEGORY_SECTIONS.map((section) => {
        const picks = entriesForCategory(safeEntries, section.id, 4);
        if (picks.length < 1) return null;
        return (
          <section className="section container home-category-section" key={section.id}>
            <div className="section-head">
              <h2>Recommended in {section.label}</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setFilter(section.id);
                  document.getElementById("discover")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                See all
              </button>
            </div>
            <div className="discover-grid discover-grid--rail">
              {picks.map((entry) => (
                <SeriesCard key={`${section.id}-${entry.id}`} entry={entry} />
              ))}
            </div>
          </section>
        );
      })}

      <section className="section container creator-reviews-section">
        <div id="creatorReviewsMount" />
      </section>

      <section className="section container" id="discover">
        <div className="section-head section-head--center">
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
            placeholder="Search series, genres, tags…"
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

      {viewerIsAdult ? (
        <section className="section container home-adult-section" id="discover-adult">
          <div className="section-head section-head--center">
            <h2>18+ stories</h2>
            <span className="section-meta">Age-restricted · Verified adults only</span>
          </div>
          <div className="discover-toolbar">
            <div className="filter-bar">
              {ADULT_GENRE_FILTERS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={`filter-chip filter-chip--adult${adultFilter === chip.id ? " is-active" : ""}`}
                  onClick={() => setAdultFilter(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
          <div className="discover-grid">
            {adultFiltered.length ? (
              adultFiltered.map((entry) => <SeriesCard key={`adult-${entry.id}`} entry={entry} />)
            ) : (
              <p className="empty-state">No age-restricted series match that filter yet.</p>
            )}
          </div>
        </section>
      ) : null}

      <section className="section container home-links">
        <Link to="/blog">Creator guides on the blog</Link>
        <Link to="/learn">Learn in the Conservatory</Link>
        <a href="/studio#/jams">Browse game jams</a>
      </section>
    </>
  );
}
