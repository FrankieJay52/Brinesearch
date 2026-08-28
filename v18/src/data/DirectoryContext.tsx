import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from "react";
import { loadDirectorySnapshot, resolveDirectoryFavoriteIds, resolveDirectoryPad } from "./directory";
import { migrateFavoriteIdentity, readActiveSnapshot, readFavoriteIds, saveCompleteSnapshot, setFavorite } from "./offline";
import { loadPadReferencesResult, type PadReferenceLoadResult } from "./padReferences";
import { clearReleasedGoogleHandoffCache } from "./releasedGoogleHandoff";
import { clearDriverRouteChoiceCache } from "./routeChoices";
import { clearCompletedPadStatusCache } from "./status";
import type { DirectorySnapshot, PadSummary } from "./types";
import { clearPadWellRowCache } from "./wellRows";

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

export function directoryAuthorityVersionChanged(
  current: DirectorySnapshot | null,
  next: DirectorySnapshot,
) {
  return !current
    || current.snapshotId !== next.snapshotId
    || current.sourceRevision !== next.sourceRevision;
}

/**
 * Resolves the complete live directory before publishing it to page effects.
 * This prevents a GPS-less row from starting route work that is immediately
 * cancelled and restarted when its exact saved reference arrives.
 */
export async function loadDirectoryForDisplay(
  loadBase: () => Promise<DirectorySnapshot> = loadDirectorySnapshot,
  loadReferences: (snapshot: DirectorySnapshot) => Promise<PadReferenceLoadResult> = loadPadReferencesResult,
  online = typeof navigator === "undefined" || navigator.onLine,
) {
  const base = await loadBase();
  if (!online || base.sourceState !== "live_current") return { snapshot: base, persistable: false };
  const references = await loadReferences(base);
  return references.verified
    ? { snapshot: references.snapshot, persistable: true }
    : { snapshot: { ...references.snapshot, sourceState: "live_stale" as const }, persistable: false };
}

export function DirectoryProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState<DirectorySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const snapshotRef = useRef<DirectorySnapshot | null>(null);
  const favoriteIdsRef = useRef<Set<string>>(new Set());
  const favoriteWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const snapshotWriteQueue = useRef<Promise<void>>(Promise.resolve());
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

    const applySnapshot = (nextSnapshot: DirectorySnapshot, favoriteIds?: string[], persist = true) => {
      if (cancelled) return;
      snapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);
      setError(null);
      applyFavoriteIds(nextSnapshot, favoriteIds || [...favoriteIdsRef.current]);
      if (persist && (nextSnapshot.sourceState === "live_current" || nextSnapshot.sourceState === "live_stale")) {
        const write = snapshotWriteQueue.current.then(() => saveCompleteSnapshot(nextSnapshot));
        snapshotWriteQueue.current = write.catch(() => undefined);
      }
    };

    const markLiveDataStale = () => {
      setSnapshot((current) => {
        if (!current || (current.sourceState !== "live_current" && current.sourceState !== "live_stale")) return current;
        const next = navigator.onLine
          ? { ...current, sourceState: "live_stale" as const }
          : { ...current, sourceState: current.sourceState === "live_stale" ? "cached_stale" as const : "cached_live" as const };
        snapshotRef.current = next;
        return next;
      });
    };

    const refresh = async () => {
      if (refreshInFlight || !navigator.onLine) return;
      refreshInFlight = true;
      try {
        const nextDirectory = await loadDirectoryForDisplay();
        if (!nextDirectory.persistable && snapshotRef.current) {
          markLiveDataStale();
          if (!cancelled) setError("Latest complete directory check is unavailable. Showing the last checked copy.");
          return;
        }
        // A five-minute freshness read of the same immutable directory must
        // not discard every completed per-pad check. That made a revisited pad
        // pay the full status cost again even though its exact record and
        // destination had not changed. A new snapshot/revision still clears
        // every dependent cache, and Settings retains its explicit refresh.
        if (directoryAuthorityVersionChanged(snapshotRef.current, nextDirectory.snapshot)) {
          clearCompletedPadStatusCache();
          clearReleasedGoogleHandoffCache();
          clearDriverRouteChoiceCache();
          clearPadWellRowCache();
        }
        applySnapshot(nextDirectory.snapshot, undefined, nextDirectory.persistable);
      } catch (reason) {
        markLiveDataStale();
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Directory unavailable");
      } finally {
        refreshInFlight = false;
      }
    };

    refreshInFlight = true;
    // Offline startup may use the last complete device copy immediately. An
    // online startup never flashes a potentially stale cached destination
    // before the current directory and its exact references are checked.
    if (!navigator.onLine) readActiveSnapshot().then((cached) => {
      if (cancelled || !cached || snapshotRef.current) return;
      applySnapshot(cached);
      setLoading(false);
    }).catch(() => undefined);

    loadDirectoryForDisplay()
      .then((nextDirectory) => {
        applySnapshot(nextDirectory.snapshot, undefined, nextDirectory.persistable);
        if (!nextDirectory.persistable && !cancelled) {
          setError("Latest complete directory check is unavailable. Pads without a checked GPS reference remain unavailable until retry.");
        }
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
