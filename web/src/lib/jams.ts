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
