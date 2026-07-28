export type CreatorReview = {
  rating: number;
  message: string;
  author: string;
  feature?: string;
};

/** Demo testimonials — merged with live submissions when available. */
export const CREATOR_REVIEWS: CreatorReview[] = [
  {
    rating: 5,
    author: "Mira K.",
    feature: "Story editor",
    message:
      "Mapping branches on the graph before I write dialogue makes planning and plotting so much easier — I can see the whole story at once. Can't wait to see how deep the editor gets.",
  },
  {
    rating: 5,
    author: "Devon L.",
    feature: "Publishing",
    message:
      "Browser publishing without Ren'Py headaches. My playtesters just open a link. Eager to see what release tools and analytics look like as Arleco grows.",
  },
  {
    rating: 5,
    author: "Sora T.",
    feature: "Pixel art",
    message:
      "The pixel sprite tools live right inside the studio — I sketched a walk cycle without bouncing between apps. Really curious how the asset library and sharing will evolve.",
  },
  {
    rating: 5,
    author: "Alex R.",
    feature: "Tutorials",
    message:
      "The guided tutorials run in the real editor, not a fake demo. I finished my first branching scene in one afternoon. Excited for more advanced lessons as the platform matures.",
  },
  {
    rating: 5,
    author: "Jordan M.",
    feature: "Discover",
    message:
      "Discover feels like a curated shelf, not an algorithm dump. I binged three indie series in a weekend and picked up exactly where I left off. Hope the catalog keeps growing.",
  },
  {
    rating: 5,
    author: "Priya N.",
    feature: "Reader UI",
    message:
      "Dialogue boxes, name plates, and choice buttons already feel like a proper VN player in the browser. Looking forward to seeing how custom themes and UI polish develop.",
  },
  {
    rating: 5,
    author: "Casey W.",
    feature: "Game jams",
    message:
      "Game jams gave me a deadline, a theme, and a community — shipped a mini episode in two weeks. Can't wait to see how jam tooling and showcases expand on Arleco.",
  },
];

export function starsForRating(rating: number): string {
  const n = Math.min(5, Math.max(0, Math.round(rating)));
  return "\u2605".repeat(n) + "\u2606".repeat(5 - n);
}
