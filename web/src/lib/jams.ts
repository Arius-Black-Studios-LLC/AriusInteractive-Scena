export type JamHomeSubmission = {
  id: string;
  seriesTitle: string;
  episodeTitle: string;
  userName: string;
  submittedAt: string;
  playHref: string;
  likes: number;
};

export type JamHomeFeedGroup = {
  jamId: string;
  jamTitle: string;
  tagline: string;
  theme: string;
  phase: string;
  prizePool: number;
  ageRestricted: boolean;
  href: string;
  totalSubmissions: number;
  submissions: JamHomeSubmission[];
};

export type JamHomeMenuItem = {
  jamId: string;
  jamTitle: string;
  tagline: string;
  taglinePreview: string;
  theme: string;
  phase: string;
  prizePool: number;
  ageRestricted: boolean;
  href: string;
  totalSubmissions: number;
};

export type JamHomeSpotlight = {
  featured: JamHomeFeedGroup | null;
  others: JamHomeMenuItem[];
};

export function formatJamPhase(phase: string): string {
  if (phase === "submissions") return "Open for entries";
  if (phase === "judging") return "Judging";
  if (phase === "upcoming") return "Starting soon";
  if (phase === "closed") return "Closed";
  return phase;
}

export function formatSubmittedWhen(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function jamMenuIconLabel(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
