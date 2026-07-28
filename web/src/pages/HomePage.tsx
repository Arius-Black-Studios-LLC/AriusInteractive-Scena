import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SeriesCard } from "../components/SeriesCard";
import { useAuth } from "../context/AuthContext";
import { useLegacyBundle } from "../hooks/useLegacyBundle";
import { mountHomepageReviews } from "../legacy/adapters";
import { FeaturedPicks, type FeaturedEntry } from "../components/FeaturedPicks";
import { JamHomeFeed } from "../components/JamHomeFeed";
import {
  ADULT_GENRE_FILTERS,
  CATEGORY_SECTIONS,
  GENRE_FILTERS,
  entriesForCategory,
  type CatalogEntryExt,
  visibleEntries,
} from "../lib/catalog";
import type { JamHomeSpotlight } from "../lib/jams";
import "./HomePage.css";

const HERO_WORDS = ["choose", "branch", "discover", "play"];

type HeroStats = {
  liveSeries: number;
  episodes: number;
  chaptersRead: number;
};

type ContinueRow = {
  entry: CatalogEntryExt;
  href: string;
  resumeLabel: string;
};

type LikedUpdateRow = {
  entry: CatalogEntryExt;
  href: string;
  updatedAt: string;
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

function genreOverlapScore(entry: CatalogEntryExt, tasteKeys: Set<string>): number {
  const keys = entry.genreKeys || [];
  let score = 0;
  keys.forEach((k) => {
    if (tasteKeys.has(k)) score += 3;
  });
  (entry.flags || []).forEach((f) => {
    if (tasteKeys.has(String(f).toLowerCase())) score += 1;
  });
  return score;
}

export function HomePage() {
  const { userId, session } = useAuth();
  const [filter, setFilter] = useState("all");
  const [adultFilter, setAdultFilter] = useState("all_adult");
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState<CatalogEntryExt[]>([]);
  const [featuredPicks, setFeaturedPicks] = useState<FeaturedEntry[]>([]);
  const [viewerIsAdult, setViewerIsAdult] = useState(false);
  const [jamSpotlight, setJamSpotlight] = useState<JamHomeSpotlight>({
    featured: null,
    others: [],
  });
  const [continueRows, setContinueRows] = useState<ContinueRow[]>([]);
  const [likedUpdates, setLikedUpdates] = useState<LikedUpdateRow[]>([]);
  const [heroWordIdx, setHeroWordIdx] = useState(0);
  const [heroWordChanging, setHeroWordChanging] = useState(false);
  const [stats, setStats] = useState<HeroStats>({
    liveSeries: 0,
    episodes: 0,
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
      window.ScenaCatalog.listFeatured?.(userId) ?? Promise.resolve([]),
      window.ScenaCatalog.fetchReaderStats(),
    ])
      .then(([list, featured, cloudStats]) => {
        const readerBundle = window.ScenaCatalog!.enrichReaderStats(list, cloudStats) as {
          entries?: CatalogEntryExt[];
          chaptersReadThisWeek?: number;
        };

        const rows = (readerBundle.entries || list || []).map((entry) =>
          mapEntry(entry as CatalogEntryExt & { readersThisWeekLabel?: string; liveCount?: number }),
        );

        setEntries(rows);
        setFeaturedPicks(
          (featured || []).map((entry) => mapEntry(entry as CatalogEntryExt)) as FeaturedEntry[],
        );

        const episodeTotal = (list || []).reduce(
          (sum, entry) => sum + ((entry as { liveCount?: number }).liveCount || 0),
          0,
        );
        setStats({
          liveSeries: list.length,
          episodes: episodeTotal,
          chaptersRead: readerBundle.chaptersReadThisWeek || 0,
        });
      })
      .catch(() => {
        setEntries([]);
        setFeaturedPicks([]);
        setStats({ liveSeries: 0, episodes: 0, chaptersRead: 0 });
      });
  }, [ready, userId]);

  useEffect(() => {
    if (!ready || !window.ScenaJams?.listHomeSubmissionFeed) return;
    window.ScenaJams.listHomeSubmissionFeed({
      hideAdult: true,
      viewerIsAdult,
      perJam: 4,
    })
      .then((data) =>
        setJamSpotlight(
          (data as JamHomeSpotlight) || { featured: null, others: [] },
        ),
      )
      .catch(() => setJamSpotlight({ featured: null, others: [] }));
  }, [ready, viewerIsAdult]);

  useEffect(() => {
    if (!ready || !userId || !entries.length || !window.ScenaProgress?.listContinueReading) {
      setContinueRows([]);
      return;
    }
    const scope = window.ScenaProgress.scopeFromUser?.(userId) || userId;
    window.ScenaProgress.listContinueReading(scope, entries)
      .then((rows) => setContinueRows((rows as ContinueRow[]) || []))
      .catch(() => setContinueRows([]));
  }, [ready, userId, entries]);

  useEffect(() => {
    if (!ready || !userId || !entries.length || !window.ScenaHearts?.listMyHeartedSeries) {
      setLikedUpdates([]);
      return;
    }
    const byId = new Map(entries.map((e) => [e.id, e]));
    window.ScenaHearts.listMyHeartedSeries(userId)
      .then((hearted) => {
        const rows: LikedUpdateRow[] = [];
        (hearted || []).forEach((h: { seriesId: string; lastHeartedAt?: string }) => {
          const entry = byId.get(h.seriesId);
          if (!entry) return;
          const updatedAt = entry.updatedAt || "";
          if (!updatedAt) return;
          const heartedAt = h.lastHeartedAt ? new Date(h.lastHeartedAt).getTime() : 0;
          const updatedMs = new Date(updatedAt).getTime();
          if (!updatedMs || updatedMs <= heartedAt) return;
          rows.push({
            entry,
            href: entry.href,
            updatedAt,
          });
        });
        rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
        setLikedUpdates(rows.slice(0, 8));
      })
      .catch(() => setLikedUpdates([]));
  }, [ready, userId, entries]);

  useEffect(() => {
    if (!ready) return;
    mountHomepageReviews("creatorReviewsMount");
  }, [ready]);

  const safeFeatured = useMemo(
    () => featuredPicks.filter((e) => viewerIsAdult || !e.isAgeRestricted),
    [featuredPicks, viewerIsAdult],
  );

  const safeEntries = useMemo(
    () => entries.filter((e) => viewerIsAdult || !e.isAgeRestricted),
    [entries, viewerIsAdult],
  );

  const recommended = useMemo(() => {
    const taste = new Set<string>();
    [...continueRows.map((r) => r.entry), ...likedUpdates.map((r) => r.entry), ...safeFeatured].forEach(
      (entry) => {
        (entry.genreKeys || []).forEach((k) => taste.add(k));
        (entry.flags || []).forEach((f) => taste.add(String(f).toLowerCase()));
      },
    );
    const skip = new Set([
      ...continueRows.map((r) => r.entry.id),
      ...likedUpdates.map((r) => r.entry.id),
      ...safeFeatured.map((e) => e.id),
    ]);
    const scored = safeEntries
      .filter((e) => !skip.has(e.id))
      .map((e) => ({ e, score: genreOverlapScore(e, taste) }))
      .filter((x) => (taste.size ? x.score > 0 : true))
      .sort((a, b) => b.score - a.score || String(b.e.updatedAt || "").localeCompare(String(a.e.updatedAt || "")));
    const picks = (scored.length ? scored : safeEntries.map((e) => ({ e, score: 0 }))).slice(0, 8);
    return picks.map((p) => p.e);
  }, [safeEntries, continueRows, likedUpdates, safeFeatured]);

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

      <FeaturedPicks picks={safeFeatured} />

      <JamHomeFeed spotlight={jamSpotlight} />

      {continueRows.length ? (
        <section className="section container" id="continue-reading">
          <div className="section-head">
            <div>
              <h2>Continue reading</h2>
              <span className="section-meta">Pick up where you left off</span>
            </div>
          </div>
          <div className="discover-grid discover-grid--rail">
            {continueRows.map((row) => (
              <div className="home-continue-card" key={row.entry.id}>
                <SeriesCard entry={row.entry} />
                <Link className="btn btn-sm btn-primary home-continue-btn" to={row.href}>
                  Continue · {row.resumeLabel}
                </Link>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {likedUpdates.length ? (
        <section className="section container" id="liked-updates">
          <div className="section-head">
            <div>
              <h2>New chapters in series you liked</h2>
              <span className="section-meta">Sorted by newest updates</span>
            </div>
          </div>
          <div className="discover-grid discover-grid--rail">
            {likedUpdates.map((row) => (
              <SeriesCard key={`liked-${row.entry.id}`} entry={row.entry} />
            ))}
          </div>
        </section>
      ) : null}

      {recommended.length ? (
        <section className="section container" id="recommended">
          <div className="section-head">
            <div>
              <h2>Recommended for you</h2>
              <span className="section-meta">
                {userId ? "Based on what you’ve been reading and liking" : "Popular stories to start with"}
              </span>
            </div>
          </div>
          <div className="discover-grid discover-grid--rail">
            {recommended.map((entry) => (
              <SeriesCard key={`rec-${entry.id}`} entry={entry} />
            ))}
          </div>
        </section>
      ) : null}

      {CATEGORY_SECTIONS.slice(0, 2).map((section) => {
        const picks = entriesForCategory(safeEntries, section.id, 4);
        if (picks.length < 1) return null;
        return (
          <section className="section container home-category-section" key={section.id}>
            <div className="section-head">
              <h2>More in {section.label}</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setFilter(section.id);
                  document.getElementById("discover")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Search {section.label}
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
          <h2>Search & browse</h2>
          <span className="section-meta">Refine by category · Human-written · Indie creators</span>
        </div>
        <div className="discover-toolbar">
          <input
            className="search-input"
            type="search"
            placeholder="Search series, genres, tags…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search series"
          />
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
        </div>
        <div className="discover-grid">
          {filtered.length ? (
            filtered.map((entry) => <SeriesCard key={entry.id} entry={entry} />)
          ) : (
            <p className="empty-state">
              {safeEntries.length
                ? "No series match that filter."
                : "No published series yet. Publish yours in Studio."}
            </p>
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
        <Link to="/jams">Browse game jams</Link>
      </section>
    </>
  );
}
