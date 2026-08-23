import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { LoadingState } from "@/components/LoadingState";
import { useDirectory } from "@/data/DirectoryContext";
import { resolveDirectoryPad } from "@/data/directory";
import { migrateRecentIdentity, readRecentLocations, resolveRecentIdentities, type RecentLocation } from "@/data/offline";
import type { PadSummary } from "@/data/types";

function sourceLabel(sourceState: string | undefined) {
  if (sourceState === "live_current") return "Current live directory";
  if (sourceState === "live_stale") return "Complete snapshot · newer data available";
  if (sourceState === "cached_live") return "Saved live directory";
  if (sourceState === "cached_stale") return "Saved older directory · update needed";
  if (sourceState === "packaged_fallback") return "Packaged fallback directory";
  return "Directory unavailable";
}

export function SavedPage() {
  const { snapshot, loading, favorites, toggleFavorite } = useDirectory();
  const [recentLocations, setRecentLocations] = useState<RecentLocation[]>([]);
  const savedPads = (snapshot?.rows || []).filter((pad) => favorites.has(pad.padId));
  const unavailableFavoriteCount = Math.max(0, favorites.size - savedPads.length);
  const recentPads = useMemo(() => recentLocations.flatMap((recent) => {
    const pad = snapshot ? resolveDirectoryPad(snapshot.rows, recent.padId) : null;
    return pad && !favorites.has(pad.padId) ? [{ pad, openedAt: recent.openedAt }] : [];
  }), [favorites, recentLocations, snapshot]);

  useEffect(() => {
    let active = true;
    readRecentLocations(8).then((rows) => {
      if (!active) return;
      if (!snapshot) {
        setRecentLocations(rows);
        return;
      }
      const resolved = resolveRecentIdentities(rows, (padId) => resolveDirectoryPad(snapshot.rows, padId)?.padId || null);
      setRecentLocations(resolved.recents);
      Promise.all(resolved.migrations.map(({ from, to }) => migrateRecentIdentity(from, to))).catch(() => undefined);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [snapshot]);

  if (loading) return <LoadingState message="Loading saved locations…"/>;

  return <section className="content-page saved-page">
    <header className="page-heading">
      <span className="eyebrow">SAVED ON THIS DEVICE</span>
      <h1>Saved locations</h1>
      <p>Keep the pads you use most close at hand. Saving a location does not change its route approval or verification state.</p>
    </header>

    <aside className="offline-summary-card">
      <span className="offline-summary-icon"><Icon name="offline"/></span>
      <div>
        <strong>{sourceLabel(snapshot?.sourceState)}</strong>
        <p>{snapshot ? `${snapshot.counts.locations.toLocaleString()} locations are loaded from this complete directory source.` : "No complete directory source is available."}</p>
      </div>
    </aside>

    {savedPads.length > 0 && <div className="saved-list" aria-label="Saved locations">
      {savedPads.map((pad) => <article className="saved-card" key={pad.padId}>
        <Link to={`/pad/${encodeURIComponent(pad.padId)}`} className="saved-card-link">
          <span className={`result-symbol result-${pad.recordType}`}><Icon name={pad.recordType === "disposal" ? "location" : "route"}/></span>
          <span className="saved-card-copy">
            <small>{pad.recordType === "disposal" ? "DISPOSAL" : pad.company || "FIELD LOCATION"}</small>
            <strong>{pad.padName}</strong>
            <span>{[pad.county, pad.township, pad.state].filter(Boolean).join(" · ") || "Location not listed"}</span>
          </span>
          <span className="result-arrow" aria-hidden="true">›</span>
        </Link>
        <button className="saved-remove" type="button" onClick={() => toggleFavorite(pad.padId)} aria-label={`Remove ${pad.padName} from saved locations`}>
          <Icon name="saved"/> Remove
        </button>
      </article>)}
    </div>}

    {savedPads.length === 0 && <EmptyState icon="saved" title="No favorites yet" body="Open a pad or disposal and tap the bookmark. It will appear here without changing any field data."/>}

    {unavailableFavoriteCount > 0 && <p className="inline-warning saved-unavailable-note">
      <Icon name="offline"/>{unavailableFavoriteCount} saved {unavailableFavoriteCount === 1 ? "location is" : "locations are"} not present in this complete directory snapshot. BrineSearch will not substitute a different record.
    </p>}

    {recentPads.length > 0 && <section className="saved-recent-section" aria-labelledby="recent-locations-heading">
      <header><span className="eyebrow">RECENT</span><h2 id="recent-locations-heading">Recently opened</h2></header>
      <div className="saved-list" aria-label="Recently opened locations">
        {recentPads.map(({ pad, openedAt }: { pad: PadSummary; openedAt: string }) => <Link to={`/pad/${encodeURIComponent(pad.padId)}`} className="saved-card-link saved-recent-card" key={pad.padId}>
          <span className={`result-symbol result-${pad.recordType}`}><Icon name={pad.recordType === "disposal" ? "location" : "route"}/></span>
          <span className="saved-card-copy"><small>{pad.company || "FIELD LOCATION"}</small><strong>{pad.padName}</strong><span>Opened {new Date(openedAt).toLocaleString()}</span></span>
          <span className="result-arrow" aria-hidden="true">›</span>
        </Link>)}
      </div>
    </section>}
  </section>;
}
