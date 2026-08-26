import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { useDirectory } from "@/data/DirectoryContext";
import { closestPadSearchResults, distanceMilesFromPad, nearbyDistanceLabel, nearbyPadResultsHeading } from "@/data/search";
import { padSearchResultsReady, usePadSearchLocation } from "./usePadSearchLocation";
import "./search-overlay.css";

export function SearchOverlay() {
  const { snapshot } = useDirectory();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [visibleViewport, setVisibleViewport] = useState({ height: 0, offsetTop: 0 });
  const { origin, state: locationState, requestLocation, retryLocation } = usePadSearchLocation();
  const normalizedQuery = query.trim();
  const resultsReady = padSearchResultsReady(locationState, origin);
  const resultsHeading = nearbyPadResultsHeading(query, origin);
  const results = useMemo(
    () => resultsReady ? closestPadSearchResults(snapshot?.rows || [], query, origin, 7) : [],
    [origin, query, resultsReady, snapshot],
  );

  useEffect(() => {
    inputRef.current?.focus();
    requestLocation();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") navigate("/", { replace: true });
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [navigate, requestLocation]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const syncVisibleViewport = () => setVisibleViewport({
      height: Math.max(240, Math.round(viewport?.height ?? window.innerHeight)),
      offsetTop: Math.max(0, Math.round(viewport?.offsetTop ?? 0)),
    });
    syncVisibleViewport();
    viewport?.addEventListener("resize", syncVisibleViewport);
    viewport?.addEventListener("scroll", syncVisibleViewport);
    window.addEventListener("resize", syncVisibleViewport);
    return () => {
      viewport?.removeEventListener("resize", syncVisibleViewport);
      viewport?.removeEventListener("scroll", syncVisibleViewport);
      window.removeEventListener("resize", syncVisibleViewport);
    };
  }, []);

  const close = () => navigate("/", { replace: true });
  const openFullSearch = () => navigate(`/search/all${normalizedQuery ? `?q=${encodeURIComponent(normalizedQuery)}` : ""}`);
  const viewportStyle = visibleViewport.height ? {
    "--search-visible-height": `${visibleViewport.height}px`,
    "--search-visible-top": `${visibleViewport.offsetTop}px`,
  } as CSSProperties : undefined;

  return <>
    <button type="button" className="search-overlay-backdrop" aria-label="Close search" onClick={close}/>
    <aside className={`search-overlay-panel${visibleViewport.height > 0 && visibleViewport.height <= 620 ? " is-compact" : ""}`} style={viewportStyle} role="dialog" aria-modal="true" aria-labelledby="quick-search-title">
      <header className="search-overlay-header">
        <div><span className="eyebrow">QUICK SEARCH</span><h1 id="quick-search-title">Find a location</h1></div>
      </header>

      <div className="search-overlay-command">
        <Icon name="search"/>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value.slice(0, 120))}
          onFocus={() => requestLocation()}
          placeholder="Search pad name…"
          aria-label="Search pads"
          aria-controls="quick-search-results"
          autoComplete="off"
        />
        {query && <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); inputRef.current?.focus(); }}><Icon name="close"/></button>}
        <button type="button" className="search-overlay-inline-close" aria-label="Close search" onClick={close}><Icon name="close"/></button>
      </div>

      <div className="search-overlay-nearby-heading">
        <strong>{resultsHeading}</strong>
        <button type="button" onClick={retryLocation} disabled={locationState === "locating"}>
          {locationState === "ready" ? "Refresh phone GPS" : locationState === "locating" ? "Finding phone…" : "Use phone GPS"}
        </button>
      </div>

      <div id="quick-search-results" className="search-overlay-results" role="region" aria-label="Pad search results" aria-live="polite">
        {results.length ? results.map((pad) => {
          const distance = nearbyDistanceLabel(distanceMilesFromPad(pad, origin));
          return <button
            type="button"
            className="search-overlay-result"
            key={pad.padId}
            onClick={() => navigate(`/pad/${encodeURIComponent(pad.padId)}`)}
          >
            <span className={`search-overlay-symbol search-overlay-${pad.recordType}`}><Icon name={pad.recordType === "disposal" ? "location" : "route"}/></span>
            <span className="search-overlay-copy"><small>{pad.recordType === "disposal" ? "DISPOSAL" : pad.company.toUpperCase()}</small><strong>{pad.padName}</strong><span>{[pad.county, pad.township, pad.state].filter(Boolean).join(" · ") || "Location not listed"}{distance ? ` · ${distance}` : ""}</span></span>
            <span className="result-arrow" aria-hidden="true">›</span>
          </button>;
        })
          : <div className="search-overlay-prompt"><Icon name="search"/><strong>{!resultsReady ? "Finding pads near this phone…" : normalizedQuery ? "No exact pad-name match" : "Phone location is needed"}</strong><p>{!resultsReady ? "Using the phone's current GPS position to order the seven nearest pads." : normalizedQuery ? "Try another pad spelling. BrineSearch will not guess." : "Enable location, then tap Use phone GPS. Name search still works without it."}</p></div>}
      </div>

      {(locationState === "denied" || locationState === "unavailable") && <p className="search-overlay-location-note" role="note">Enable Location for BrineSearch to rank pads from this phone. Exact name search remains available.</p>}

      <footer className="search-overlay-footer">
        <button type="button" className="button-secondary" onClick={openFullSearch}><Icon name="search"/> Open full search</button>
        <small>{snapshot?.counts.locations.toLocaleString() || "No"} directory locations loaded</small>
      </footer>
    </aside>
  </>;
}
