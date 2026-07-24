import type { CatalogEntry } from "../legacy/globals.d.ts";

export type { CatalogEntry };

export const DEMO_SERIES: CatalogEntry[] = [
  {
    id: "signal-lost",
    title: "Signal Lost",
    description:
      "Sci-fi mystery aboard Kerberos-9 — long chapters, dead comms, and a signal from inside the hull.",
    genres: "scifi horror",
    epLabel: "Ch. 1–2",
    href: "/series?series=signal-lost",
    cover: "c",
    flags: ["Sci-fi", "Strong language"],
    isDemo: true,
  },
  {
    id: "cafe-at-sunset",
    title: "Café at Sunset",
    description: "A cozy romance with two playable chapters and too much matcha.",
    genres: "romance",
    epLabel: "Ch. 1–2",
    href: "/series?series=cafe-at-sunset",
    cover: "b",
    flags: ["Romance"],
    isDemo: true,
  },
];

export const GENRE_FILTERS = [
  { id: "all", label: "All" },
  { id: "romance", label: "Romance" },
  { id: "horror", label: "Horror" },
  { id: "comedy", label: "Comedy" },
  { id: "scifi", label: "Sci-fi" },
] as const;

export function matchesGenre(entry: CatalogEntry, filter: string): boolean {
  if (filter === "all") return true;
  return entry.genres.toLowerCase().includes(filter);
}

export function matchesSearch(entry: CatalogEntry, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  return (
    entry.title.toLowerCase().includes(q) ||
    entry.description.toLowerCase().includes(q)
  );
}
