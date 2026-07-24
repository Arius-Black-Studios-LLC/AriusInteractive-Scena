import type { CatalogEntry } from "../legacy/globals.d.ts";

export type { CatalogEntry };

export type CatalogEntryExt = CatalogEntry & {
  genreKeys?: string[];
  isAgeRestricted?: boolean;
};

export const DEMO_SERIES: CatalogEntryExt[] = [
  {
    id: "signal-lost",
    title: "Signal Lost",
    description:
      "Sci-fi mystery aboard Kerberos-9 — long chapters, dead comms, and a signal from inside the hull.",
    genres: "scifi horror",
    genreKeys: ["scifi", "horror"],
    epLabel: "Ch. 1–2",
    href: "/series?series=signal-lost",
    cover: "c",
    flags: ["Sci-fi", "Horror", "Strong language"],
    isDemo: true,
    isAgeRestricted: true,
  },
  {
    id: "cafe-at-sunset",
    title: "Café at Sunset",
    description: "A cozy romance with two playable chapters and too much matcha.",
    genres: "romance slice_of_life",
    genreKeys: ["romance", "slice_of_life"],
    epLabel: "Ch. 1–2",
    href: "/series?series=cafe-at-sunset",
    cover: "b",
    flags: ["Romance", "Slice of life"],
    isDemo: true,
    isAgeRestricted: false,
  },
];

/** Main discover filters — general audience genres */
export const GENRE_FILTERS = [
  { id: "all", label: "All" },
  { id: "romance", label: "Romance" },
  { id: "slice_of_life", label: "Slice of life" },
  { id: "comedy", label: "Comedy" },
  { id: "scifi", label: "Sci-fi" },
  { id: "fantasy", label: "Fantasy" },
  { id: "horror", label: "Horror" },
  { id: "mystery", label: "Mystery" },
  { id: "drama", label: "Drama" },
] as const;

/** Featured category rows on the home page */
export const CATEGORY_SECTIONS = [
  { id: "romance", label: "Romance" },
  { id: "scifi", label: "Sci-fi" },
  { id: "fantasy", label: "Fantasy" },
  { id: "horror", label: "Horror" },
  { id: "comedy", label: "Comedy" },
  { id: "slice_of_life", label: "Slice of life" },
] as const;

/** 18+ browse chips — only shown when viewer is verified adult */
export const ADULT_GENRE_FILTERS = [
  { id: "all_adult", label: "All 18+" },
  { id: "sexual_content", label: "Sexual themes" },
  { id: "gore", label: "Gore" },
  { id: "nudity", label: "Nudity" },
  { id: "violence", label: "Violence" },
  { id: "suggestive_themes", label: "Suggestive themes" },
] as const;

export function entryGenreKeys(entry: CatalogEntryExt): string[] {
  if (entry.genreKeys?.length) return entry.genreKeys;
  return entry.genres.toLowerCase().split(/\s+/).filter(Boolean);
}

export function matchesGenre(entry: CatalogEntryExt, filter: string): boolean {
  if (filter === "all" || filter === "all_adult") return true;
  const keys = entryGenreKeys(entry);
  if (keys.includes(filter)) return true;
  return entry.genres.toLowerCase().includes(filter.replace(/_/g, " "));
}

export function matchesAdultFilter(entry: CatalogEntryExt, filter: string): boolean {
  if (!entry.isAgeRestricted) return false;
  if (filter === "all_adult") return true;
  const blob = [entry.genres, ...(entry.flags || [])].join(" ").toLowerCase();
  return blob.includes(filter.replace(/_/g, " "));
}

export function matchesSearch(entry: CatalogEntryExt, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  return (
    entry.title.toLowerCase().includes(q) ||
    entry.description.toLowerCase().includes(q) ||
    entry.genres.toLowerCase().includes(q) ||
    (entry.flags || []).some((f) => f.toLowerCase().includes(q))
  );
}

export function entriesForCategory(entries: CatalogEntryExt[], genreId: string, limit = 4): CatalogEntryExt[] {
  return entries.filter((e) => !e.isAgeRestricted && matchesGenre(e, genreId)).slice(0, limit);
}

export function visibleEntries(
  entries: CatalogEntryExt[],
  opts: { filter: string; search: string; viewerIsAdult: boolean; adultOnly?: boolean },
): CatalogEntryExt[] {
  return entries.filter((entry) => {
    if (opts.adultOnly) {
      if (!opts.viewerIsAdult) return false;
      if (!entry.isAgeRestricted) return false;
      return matchesAdultFilter(entry, opts.filter) && matchesSearch(entry, opts.search);
    }
    if (entry.isAgeRestricted && !opts.viewerIsAdult) return false;
    return matchesGenre(entry, opts.filter) && matchesSearch(entry, opts.search);
  });
}
