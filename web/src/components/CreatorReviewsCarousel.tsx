import { useCallback, useEffect, useRef, useState } from "react";
import { CREATOR_REVIEWS, starsForRating, type CreatorReview } from "../lib/creatorReviews";
import "./CreatorReviewsCarousel.css";

const AUTO_ADVANCE_MS = 6000;

type CreatorReviewsCarouselProps = {
  reviews?: CreatorReview[];
};

export function CreatorReviewsCarousel({ reviews = CREATOR_REVIEWS }: CreatorReviewsCarouselProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const count = reviews.length;

  const goTo = useCallback(
    (next: number) => {
      if (count < 1) return;
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  const goPrev = useCallback(() => goTo(index - 1), [goTo, index]);
  const goNext = useCallback(() => goTo(index + 1), [goTo, index]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (count < 2 || paused || reducedMotion) return;
    const id = window.setInterval(() => goTo(index + 1), AUTO_ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [count, paused, reducedMotion, index, goTo]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    };

    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [goPrev, goNext]);

  if (count < 1) return null;

  return (
    <section
      className="section container creator-reviews-carousel"
      id="creator-reviews"
      aria-labelledby="creator-reviews-heading"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
    >
      <div className="section-head section-head--center">
        <h2 id="creator-reviews-heading">Creators say</h2>
        <span className="section-meta">From indie VN developers</span>
      </div>

      <div className="creator-reviews-carousel-frame">
        <div
          ref={viewportRef}
          className="creator-reviews-carousel-viewport"
          tabIndex={0}
          role="region"
          aria-roledescription="carousel"
          aria-label="Creator testimonials"
        >
          <div
            className={
              "creator-reviews-carousel-track" +
              (reducedMotion ? " creator-reviews-carousel-track--instant" : "")
            }
            style={{ transform: `translateX(-${index * 100}%)` }}
            aria-live="polite"
          >
            {reviews.map((review) => (
              <article
                key={`${review.author}-${review.feature}`}
                className="creator-reviews-carousel-slide"
                aria-hidden={reviews[index] !== review}
              >
                <blockquote className="creator-review-card">
                  <div
                    className="creator-review-stars"
                    aria-label={`${review.rating} out of 5 stars`}
                  >
                    {starsForRating(review.rating)}
                  </div>
                  <p>{review.message}</p>
                  <footer>
                    <cite>{review.author}</cite>
                    {review.feature ? (
                      <span className="creator-review-feature">{review.feature}</span>
                    ) : null}
                  </footer>
                </blockquote>
              </article>
            ))}
          </div>
        </div>

        {count > 1 ? (
          <div className="creator-reviews-carousel-nav">
            <button
              type="button"
              className="creator-reviews-carousel-btn"
              onClick={goPrev}
              aria-label="Previous review"
            >
              ‹
            </button>

            <ul className="creator-reviews-carousel-dots" aria-label="Review slides">
              {reviews.map((review, dotIndex) => (
                <li key={`dot-${review.author}`}>
                  <button
                    type="button"
                    className={
                      "creator-reviews-carousel-dot" +
                      (dotIndex === index ? " is-active" : "")
                    }
                    onClick={() => goTo(dotIndex)}
                    aria-label={`Go to review ${dotIndex + 1} of ${count}`}
                    aria-current={dotIndex === index ? "true" : undefined}
                  />
                </li>
              ))}
            </ul>

            <button
              type="button"
              className="creator-reviews-carousel-btn"
              onClick={goNext}
              aria-label="Next review"
            >
              ›
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
