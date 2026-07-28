import { Link } from "react-router-dom";
import { SeriesCard } from "../components/SeriesCard";
import { FeaturedPicks } from "../components/FeaturedPicks";
import { JamHomeFeed } from "../components/JamHomeFeed";
import { ADULT_GENRE_FILTERS, CATEGORY_SECTIONS, GENRE_FILTERS } from "../lib/catalog";
import { useDiscoverData } from "../hooks/useDiscoverData";
import "./HomePage.css";

export function DiscoverPage() {
  const {
    filter,
    setFilter,
    adultFilter,
    setAdultFilter,
    search,
    setSearch,
    safeFeatured,
    safeEntries,
    jamSpotlight,
    continueRows,
    likedUpdates,
    recommended,
    filtered,
    adultFiltered,
    viewerIsAdult,
    entriesForCategory,
  } = useDiscoverData();

  return (
    <>
      <section className="discover-page-hero container">
        <h1>Discover stories</h1>
        <p className="discover-page-lede">
          Browse indie visual novels — episodic chapters, branching choices, human-written fiction.
        </p>
      </section>

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
                {continueRows.length || likedUpdates.length
                  ? "Based on what you've been reading and liking"
                  : "Popular stories to start with"}
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
        const picks = entriesForCategory(section.id, 4);
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
                  document.getElementById("discover-browse")?.scrollIntoView({ behavior: "smooth" });
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

      <section className="section container" id="discover-browse">
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
    </>
  );
}
