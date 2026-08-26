import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { useDirectory } from "@/data/DirectoryContext";
import { closestPadSearchResults, type SearchOrigin } from "@/data/search";
import "./search-overlay.css";

type LocationState = "idle" | "locating" | "ready" | "denied" | "unavailable";

export function SearchOverlay() {
  const { snapshot } = useDirectory();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(false);
  const locationRequestedRef = useRef(false);
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState<SearchOrigin | null>(null);
  const [locationState, setLocationState] = useState<LocationState>("idle");
  const normalizedQuery = query.trim();
  const results = useMemo(
    () => closestPadSearchResults(snapshot?.rows || [], query, origin, 7),
    [origin, query, snapshot],
  );

  const requestLocation = useCallback(() => {
    if (locationRequestedRef.current) return;
    locationRequestedRef.current = true;
    if (!navigator.geolocation) {
      setLocationState("unavailable");
      return;
    }
    setLocationState("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mountedRef.current) return;
        setOrigin({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocationState("ready");
      },
      (error) => {
        if (!mountedRef.current) return;
        setLocationState(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300_000 },
    );
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
    requestLocation();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") navigate("/", { replace: true });
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [navigate, requestLocation]);

  const close = () => navigate("/", { replace: true });
  const openFullSearch = () => navigate(`/search/all${normalizedQuery ? `?q=${encodeURIComponent(normalizedQuery)}` : ""}`);

  return <>
    <button type="button" className="search-overlay-backdrop" aria-label="Close search" onClick={close}/>
    <aside className="search-overlay-panel" role="dialog" aria-modal="true" aria-labelledby="quick-search-title">
      <header className="search-overlay-header">
        <div><span className="eyebrow">QUICK SEARCH</span><h1 id="quick-search-title">Find a location</h1></div>
        <button type="button" className="icon-button" aria-label="Close search" onClick={close}><Icon name="close"/></button>
      </header>

      <div className="search-overlay-command">
        <Icon name="search"/>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value.slice(0, 120))}
          onFocus={requestLocation}
          placeholder="Search pad name…"
          aria-label="Search pads"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={results.length > 0}
          aria-controls="quick-search-results"
          autoComplete="off"
        />
        {query && <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); inputRef.current?.focus(); }}><Icon name="close"/></button>}
      </div>

      <div className="search-overlay-nearby-heading" role="status" aria-live="polite">
        <strong>{normalizedQuery ? "Closest matching pads" : "7 closest pads"}</strong>
        {locationState === "ready" && <span>Nearest first</span>}
      </div>

      <div id="quick-search-results" className="search-overlay-results" role="listbox" aria-live="polite">
        {results.length ? results.map((pad) => <button
            type="button"
            role="option"
            aria-selected="false"
            className="search-overlay-result"
            key={pad.padId}
            onClick={() => navigate(`/pad/${encodeURIComponent(pad.padId)}`)}
          >
            <span className={`search-overlay-symbol search-overlay-${pad.recordType}`}><Icon name={pad.recordType === "disposal" ? "location" : "route"}/></span>
            <span className="search-overlay-copy"><small>{pad.recordType === "disposal" ? "DISPOSAL" : pad.company.toUpperCase()}</small><strong>{pad.padName}</strong><span>{[pad.county, pad.township, pad.state].filter(Boolean).join(" · ") || "Location not listed"}</span></span>
            <span className="result-arrow" aria-hidden="true">›</span>
          </button>)
          : <div className="search-overlay-prompt"><Icon name="search"/><strong>{normalizedQuery ? "No exact pad-name match" : locationState === "locating" || locationState === "idle" ? "Finding nearby pads…" : "Start typing a pad name"}</strong><p>{normalizedQuery ? "Try another pad spelling. BrineSearch will not guess." : locationState === "denied" || locationState === "unavailable" ? "Enable location to see the 7 closest pads. Name search still works." : "Using this device location to order nearby pads."}</p></div>}
      </div>

      {(locationState === "denied" || locationState === "unavailable") && normalizedQuery && <p className="search-overlay-location-note" role="note">Enable location to rank matches by distance. Name search still works.</p>}

      <footer className="search-overlay-footer">
        <button type="button" className="button-secondary" onClick={openFullSearch}><Icon name="search"/> Open full search</button>
        <small>{snapshot?.counts.locations.toLocaleString() || "No"} directory locations loaded</small>
      </footer>
    </aside>
  </>;
}
