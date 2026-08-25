import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from "react";
import { loadDirectorySnapshot, resolveDirectoryFavoriteIds, resolveDirectoryPad } from "./directory";
import { migrateFavoriteIdentity, readFavoriteIds, saveCompleteSnapshot, setFavorite } from "./offline";
import { loadPadReferences } from "./padReferences";
import type { DirectorySnapshot, PadSummary } from "./types";

type DirectoryContextValue = {
  snapshot: DirectorySnapshot | null;
  loading: boolean;
  error: string | null;
  favorites: Set<string>;
  findPad: (id: string) => PadSummary | null;
  toggleFavorite: (id: string) => Promise<void>;
};

const DirectoryContext = createContext<DirectoryContextValue | null>(null);
const directoryFreshnessMs = 5 * 60 * 1_000;

export function directoryNeedsRevalidation(snapshot: DirectorySnapshot | null, now = Date.now()) {
  if (!snapshot) return false;
  if (snapshot.sourceState !== "live_current") return true;
  if (!snapshot.lastVerifiedAt) return true;
  const verifiedAt = Date.parse(snapshot.lastVerifiedAt);
  return Number.isNaN(verifiedAt) || now - verifiedAt >= directoryFreshnessMs;
}

export function DirectoryProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState<DirectorySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const snapshotRef = useRef<DirectorySnapshot | null>(null);
  const favoriteIdsRef = useRef<Set<string>>(new Set());
  const favoriteWriteQueue = useRef<Promise<void>>(Promise.resolve());
  snapshotRef.current = snapshot;

  useEffect(() => {
    let cancelled = false;
    let refreshInFlight = false;

    const applyFavoriteIds = (nextSnapshot: DirectorySnapshot, favoriteIds: string[]) => {
      if (cancelled) return;
      const resolvedFavorites = resolveDirectoryFavoriteIds(
        nextSnapshot.rows,
        favoriteIds,
      );
      favoriteIdsRef.current = resolvedFavorites.favoriteIds;
      setFavorites(resolvedFavorites.favoriteIds);
      if (resolvedFavorites.migrations.length) {
        const migrationRun = favoriteWriteQueue.current.then(async () => {
          for (const { from, to } of resolvedFavorites.migrations) await migrateFavoriteIdentity(from, to);
        });
        favoriteWriteQueue.current = migrationRun.catch(() => undefined);
      }
    };

    const applySnapshot = (nextSnapshot: DirectorySnapshot, favoriteIds?: string[]) => {
      if (cancelled) return;
      snapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);
      setError(null);
      applyFavoriteIds(nextSnapshot, favoriteIds || [...favoriteIdsRef.current]);
      if (nextSnapshot.sourceState === "live_current" || nextSnapshot.sourceState === "live_stale") saveCompleteSnapshot(nextSnapshot).catch(() => undefined);
    };

    const enrichMapReferences = (baseSnapshot: DirectorySnapshot) => {
      if (baseSnapshot.sourceState !== "live_current" || !navigator.onLine) return;
      loadPadReferences(baseSnapshot).then((enriched) => {
        if (cancelled || enriched === baseSnapshot) return;
        if (snapshotRef.current?.snapshotId !== baseSnapshot.snapshotId) return;
        applySnapshot(enriched);
      }).catch(() => undefined);
    };

    const markLiveDataStale = () => {
      setSnapshot((current) => {
        if (!current || (current.sourceState !== "live_current" && current.sourceState !== "live_stale")) return current;
        if (navigator.onLine) return { ...current, sourceState: "live_stale" };
        return { ...current, sourceState: current.sourceState === "live_stale" ? "cached_stale" : "cached_live" };
      });
    };

    const refresh = async () => {
      if (refreshInFlight || !navigator.onLine) return;
      refreshInFlight = true;
      markLiveDataStale();
      try {
        const nextSnapshot = await loadDirectorySnapshot();
        applySnapshot(nextSnapshot);
        enrichMapReferences(nextSnapshot);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Directory unavailable");
      } finally {
        refreshInFlight = false;
      }
    };

    refreshInFlight = true;
    loadDirectorySnapshot()
      .then((nextSnapshot) => {
        applySnapshot(nextSnapshot);
        enrichMapReferences(nextSnapshot);
      })
      .catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : "Directory unavailable"))
      .finally(() => {
        refreshInFlight = false;
        if (!cancelled) setLoading(false);
      });
    const favoriteIdsPromise = readFavoriteIds().catch(() => [] as string[]);
    favoriteWriteQueue.current = favoriteIdsPromise.then(() => undefined);
    favoriteIdsPromise.then((favoriteIds) => {
      if (cancelled) return;
      const current = snapshotRef.current;
      if (current) applyFavoriteIds(current, favoriteIds);
      else favoriteIdsRef.current = new Set(favoriteIds);
    });

    // Retry every non-current state while online. This lets a visible app
    // recover from a transient RPC/cache fallback without waiting for a new
    // online or visibility event.
    const freshnessCheck = window.setInterval(() => {
      if (directoryNeedsRevalidation(snapshotRef.current)) refresh().catch(() => undefined);
    }, 30_000);
    const visibilityRefresh = () => {
      if (document.visibilityState === "visible" && directoryNeedsRevalidation(snapshotRef.current)) {
        refresh().catch(() => undefined);
      }
    };
    const onlineRefresh = () => refresh().catch(() => undefined);
    const offlineHold = () => markLiveDataStale();
    document.addEventListener("visibilitychange", visibilityRefresh);
    window.addEventListener("online", onlineRefresh);
    window.addEventListener("offline", offlineHold);
    return () => {
      cancelled = true;
      window.clearInterval(freshnessCheck);
      document.removeEventListener("visibilitychange", visibilityRefresh);
      window.removeEventListener("online", onlineRefresh);
      window.removeEventListener("offline", offlineHold);
    };
  }, []);

  const value = useMemo<DirectoryContextValue>(
    () => ({
      snapshot,
      loading,
      error,
      favorites,
      findPad: (id) => snapshot ? resolveDirectoryPad(snapshot.rows, id) : null,
      toggleFavorite: async (id) => {
        const operation = favoriteWriteQueue.current.then(async () => {
          const next = new Set(favoriteIdsRef.current);
          const favorite = !next.has(id);
          if (favorite) next.add(id);
          else next.delete(id);
          await setFavorite(id, favorite);
          favoriteIdsRef.current = next;
          setFavorites(next);
        });
        favoriteWriteQueue.current = operation.catch(() => undefined);
        await operation.catch(() => undefined);
      },
    }),
    [snapshot, loading, error, favorites],
  );

  return <DirectoryContext.Provider value={value}>{children}</DirectoryContext.Provider>;
}

export function useDirectory() {
  const context = useContext(DirectoryContext);
  if (!context) throw new Error("useDirectory must be used inside DirectoryProvider");
  return context;
}
