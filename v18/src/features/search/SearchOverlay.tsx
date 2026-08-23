import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { useDirectory } from "@/data/DirectoryContext";
import { searchDirectory } from "@/data/search";
import type { SearchFilters } from "@/data/types";
import "./search-overlay.css";

type QuickSearchType = Extract<SearchFilters["type"], "all" | "pad" | "disposal">;

const quickFilters: { value: QuickSearchType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pad", label: "Pads" },
  { value: "disposal", label: "Disposals" },
];

export function SearchOverlay() {
  const { snapshot } = useDirectory();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<QuickSearchType>("all");
  const normalizedQuery = query.trim();
  const results = useMemo(
    () => normalizedQuery.length < 2
      ? []
      : searchDirectory(snapshot?.rows || [], normalizedQuery, { type, route: "all" }, 8),
    [normalizedQuery, snapshot, type],
  );

  useEffect(() => {
    inputRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") navigate("/", { replace: true });
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [navigate]);

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
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Pad, company, API, well, road…"
          aria-label="Quick search BrineSearch"
          role="combobox"
          aria-expanded={normalizedQuery.length >= 2}
          aria-controls="quick-search-results"
          autoComplete="off"
        />
        {query && <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); inputRef.current?.focus(); }}><Icon name="close"/></button>}
      </div>

      <div className="search-overlay-filters" aria-label="Quick search result type">
        {quickFilters.map((filter) => <button type="button" key={filter.value} className={type === filter.value ? "active" : ""} aria-pressed={type === filter.value} onClick={() => setType(filter.value)}>{filter.label}</button>)}
      </div>

      <div id="quick-search-results" className="search-overlay-results" role="listbox" aria-live="polite">
        {normalizedQuery.length < 2 ? <div className="search-overlay-prompt"><Icon name="search"/><strong>Start typing</strong><p>Enter at least two characters. Results use the same exact BrineSearch directory rules as full search.</p></div>
          : results.length ? results.map((pad) => <button
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
            : <div className="search-overlay-prompt"><Icon name="search"/><strong>No exact match</strong><p>Try another pad spelling, API, company, well, county, or reviewed road name. BrineSearch will not guess.</p></div>}
      </div>

      <footer className="search-overlay-footer">
        <button type="button" className="button-secondary" onClick={openFullSearch}><Icon name="search"/> Open full search</button>
        <small>{snapshot?.counts.locations.toLocaleString() || "No"} directory locations loaded</small>
      </footer>
    </aside>
  </>;
}
