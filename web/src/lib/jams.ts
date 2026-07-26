import type { CSSProperties } from "react";

export type JamCoverStyle = {
  mode: "preset" | "solid" | "gradient" | "photo";
  preset?: string;
  color?: string;
  gradientFrom?: string;
  gradientTo?: string;
  angle?: number;
  imageDataUrl?: string;
};

export type JamHomeGameSubmission = {
  id: string;
  entryType: "game";
  seriesTitle: string;
  episodeTitle: string;
  userName: string;
  submittedAt: string;
  playHref: string;
  likes: number;
};

export type JamHomeAssetSubmission = {
  id: string;
  entryType: "asset";
  listingTitle: string;
  category: string;
  userName: string;
  submittedAt: string;
  previewDataUrl?: string;
  viewHref: string;
  likes: number;
};

export type JamHomeSubmission = JamHomeGameSubmission | JamHomeAssetSubmission;

export type JamHomeFeedGroup = {
  jamId: string;
  jamTitle: string;
  jamType?: "game" | "asset";
  tagline: string;
  theme: string;
  coverStyle?: JamCoverStyle;
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
  jamType?: "game" | "asset";
  tagline: string;
  taglinePreview: string;
  theme: string;
  coverStyle?: JamCoverStyle;
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

const PRESET_GRADIENTS: Record<string, string> = {
  a: "linear-gradient(135deg, #fde8ef 0%, #f5c2d4 100%)",
  b: "linear-gradient(135deg, #fff3e0 0%, #ffd59a 100%)",
  c: "linear-gradient(135deg, #e8eaf6 0%, #9fa8da 100%)",
  d: "linear-gradient(135deg, #e0f2f1 0%, #80cbc4 100%)",
  e: "linear-gradient(135deg, #fce4ec 0%, #f48fb1 100%)",
  f: "linear-gradient(135deg, #ede7f6 0%, #b39ddb 100%)",
  g: "linear-gradient(145deg, #ff6b6b 0%, #feca57 100%)",
  h: "linear-gradient(145deg, #2d6a4f 0%, #95d5b2 100%)",
};

export function jamCoverBackground(style?: JamCoverStyle | null): CSSProperties {
  const normalized = style || { mode: "preset", preset: "a" };
  if (normalized.mode === "photo" && normalized.imageDataUrl) {
    return {
      backgroundImage: `url(${normalized.imageDataUrl})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  if (normalized.mode === "solid" && normalized.color) {
    return { background: normalized.color };
  }
  if (normalized.mode === "gradient" && normalized.gradientFrom && normalized.gradientTo) {
    const angle = normalized.angle ?? 135;
    return {
      background: `linear-gradient(${angle}deg, ${normalized.gradientFrom}, ${normalized.gradientTo})`,
    };
  }
  const preset = normalized.preset && PRESET_GRADIENTS[normalized.preset] ? normalized.preset : "a";
  return { background: PRESET_GRADIENTS[preset] };
}

export function jamTypeLabel(jamType?: string): string {
  return jamType === "asset" ? "Asset jam" : "Game jam";
}

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

export function isAssetSubmission(sub: JamHomeSubmission): sub is JamHomeAssetSubmission {
  return sub.entryType === "asset";
}
