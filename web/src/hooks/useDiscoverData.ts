import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLegacyBundle } from "./useLegacyBundle";
import type { FeaturedEntry } from "../components/FeaturedPicks";
import {
  entriesForCategory,
  type CatalogEntryExt,
  visibleEntries,
} from "../lib/catalog";
import type { JamHomeSpotlight } from "../lib/jams";

export type ContinueRow = {
  entry: CatalogEntryExt;
  href: string;
  resumeLabel: string;
};

export type LikedUpdateRow = {
  entry: CatalogEntryExt;
  href: string;
  updatedAt: string;
};

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

export function useDiscoverData() {
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

  const { ready } = useLegacyBundle("reader", ["scena-logo.css", "arleco-theme.css"]);

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
    ])
      .then(([list, featured]) => {
        const rows = (list || []).map((entry) =>
          mapEntry(entry as CatalogEntryExt & { readersThisWeekLabel?: string; liveCount?: number }),
        );

        setEntries(rows);
        setFeaturedPicks(
          (featured || []).map((entry) => mapEntry(entry as CatalogEntryExt)) as FeaturedEntry[],
        );
      })
      .catch(() => {
        setEntries([]);
        setFeaturedPicks([]);
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
        setJamSpotlight((data as JamHomeSpotlight) || { featured: null, others: [] }),
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
          rows.push({ entry, href: entry.href, updatedAt });
        });
        rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
        setLikedUpdates(rows.slice(0, 8));
      })
      .catch(() => setLikedUpdates([]));
  }, [ready, userId, entries]);

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

  return {
    ready,
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
    entriesForCategory: (sectionId: string, limit: number) =>
      entriesForCategory(safeEntries, sectionId, limit),
  };
}
