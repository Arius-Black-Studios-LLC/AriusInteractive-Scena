import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CreatorReviewsCarousel } from "../components/CreatorReviewsCarousel";
import { LandingDemos } from "../components/LandingDemos";
import { useLegacyBundle } from "../hooks/useLegacyBundle";
import "./HomePage.css";

const HERO_WORDS = ["create", "branch", "read", "play"];

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

export function HomePage() {
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
    if (!ready || !window.ScenaCatalog) return;

    Promise.all([
      window.ScenaCatalog.listDiscover(null),
      window.ScenaCatalog.fetchReaderStats(),
    ])
      .then(([list, cloudStats]) => {
        const readerBundle = window.ScenaCatalog!.enrichReaderStats(list, cloudStats) as {
          chaptersReadThisWeek?: number;
        };

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
        setStats({ liveSeries: 0, episodes: 0, chaptersRead: 0 });
      });
  }, [ready]);

  return (
    <>
      <div className="hero-wrap">
        <div className="hero-bg" aria-hidden="true">
          <div className="hero-blob hero-blob--1" />
          <div className="hero-blob hero-blob--2" />
          <div className="hero-grid" />
        </div>
        <section className="hero container hero--landing">
          <div className="hero-accent-line" aria-hidden="true" />
          <div className="hero-badges">
            <span className="hero-badge hero-badge--beta">Early beta</span>
            <span className="hero-badge hero-badge--human">Human-made stories only</span>
          </div>
          <h1>
            <span className="word">Visual novels</span>{" "}
            <span className="word">
              you{" "}
              <span className={`hero-rotate${heroWordChanging ? " is-changing" : ""}`}>
                {HERO_WORDS[heroWordIdx]}
              </span>
              .
            </span>
          </h1>
          <p className="hero-lede">
            Arleco is an indie platform for episodic visual novels — a browser reader, a graph-based
            creator studio, and guided tutorials for new storytellers.
          </p>
          <p className="hero-trust">
            <strong>No AI-generated fiction.</strong> Every chapter is written, edited, and published
            by real people.
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
            <Link className="btn btn-primary" to="/discover">
              Discover stories
            </Link>
            <Link className="btn btn-secondary" to="/tutorials">
              Start tutorials
            </Link>
            <Link className="btn btn-ghost" to="/studio">
              Creator studio
            </Link>
          </div>
        </section>
      </div>

      <LandingDemos />

      <CreatorReviewsCarousel />

      <section className="section container home-how-it-works">
        <div className="section-head section-head--center">
          <h2>How Arleco works</h2>
          <span className="section-meta">Three paths — read, learn, or publish</span>
        </div>
        <div className="home-pillars">
          <article className="home-pillar">
            <h3>Read in the browser</h3>
            <p>
              Episodic chapters with dialogue, characters, and choices that branch the story. No
              download required — pick up where you left off when you log in.
            </p>
            <Link to="/discover">Browse the catalog →</Link>
          </article>
          <article className="home-pillar">
            <h3>Learn with tutorials</h3>
            <p>
              Step-by-step lessons in the real editor — wire beats, cast characters, set metrics,
              and publish your first episode.
            </p>
            <Link to="/tutorials">Open tutorials →</Link>
          </article>
          <article className="home-pillar">
            <h3>Create & publish</h3>
            <p>
              The creator studio is a graph editor for branching fiction. Draft chapters, validate
              your graph, and go live when a chapter is ready.
            </p>
            <Link to="/studio">Open creator studio →</Link>
          </article>
        </div>
      </section>

      <section className="section container home-tutorials-cta">
        <div className="home-tutorials-banner">
          <div>
            <p className="home-tutorials-eyebrow">New to interactive fiction?</p>
            <h2>Tutorials walk you through the editor</h2>
            <p>
              Eighteen guided lessons — from linking your first beats to publishing an episode.
              Earn badges as you complete each scene.
            </p>
          </div>
          <Link className="btn btn-primary" to="/tutorials">
            Start tutorials
          </Link>
        </div>
      </section>

      <section className="section container home-links">
        <Link to="/discover">Discover stories</Link>
        <Link to="/tutorials">Tutorials</Link>
        <Link to="/blog">Creator guides on the blog</Link>
        <Link to="/jams">Browse game jams</Link>
      </section>
    </>
  );
}
