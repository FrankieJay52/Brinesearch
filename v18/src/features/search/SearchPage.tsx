import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { LoadingState } from "@/components/LoadingState";
import { useDirectory } from "@/data/DirectoryContext";
import { useCompanyRoads } from "@/data/CompanyRoadsContext";
import { searchDirectory } from "@/data/search";
import { mapDisplayCoordinate, mapDisplayCoordinateLabel } from "@/data/mapDisplayCoordinates";
import type { PadSummary, SearchFilters } from "@/data/types";
import "./search.css";

const typeFilters: { value: SearchFilters["type"]; label: string }[] = [
  { value: "all", label: "All" }, { value: "pad", label: "Pads" }, { value: "disposal", label: "Disposals" }, { value: "road", label: "Roads" },
];

function sourceLabel(source: string | undefined) {
  if (source === "live_current") return "Live snapshot";
  if (source === "live_stale") return "Recently replaced snapshot";
  if (source === "cached_live") return "Saved live snapshot";
  if (source === "cached_stale") return "Saved older snapshot";
  if (source === "packaged_fallback") return "Packaged fallback";
  return "Directory unavailable";
}

function ResultCard({ pad }: { pad: PadSummary }) {
  return <Link className="result-card" to={`/pad/${encodeURIComponent(pad.padId)}`}>
    <div className={`result-symbol result-${pad.recordType}`}><Icon name={pad.recordType === "disposal" ? "location" : "route"}/></div>
    <div className="result-copy"><div className="result-kicker">{pad.recordType === "disposal" ? "DISPOSAL" : pad.company.toUpperCase()}</div><h2>{pad.padName}</h2><p>{[pad.county, pad.township, pad.state].filter(Boolean).join(" · ") || "Location not listed"}</p><div className="result-badges">{mapDisplayCoordinate(pad) ? <span className="mini-badge">{mapDisplayCoordinateLabel(pad)}</span> : <span className="mini-badge muted">No mapped location</span>}<span className="mini-badge muted">Open for route status</span></div></div>
    <span className="result-arrow">›</span>
  </Link>;
}

export function SearchPage() {
  const { snapshot, loading } = useDirectory();
  const companyRoads = useCompanyRoads();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const [filters, setFilters] = useState<SearchFilters>({ type: "all", route: "all" });
  const [mode, setMode] = useState<"locations" | "companies">("locations");
  const [selectedCompany, setSelectedCompany] = useState("");
  const [resultLimit, setResultLimit] = useState(80);
  const allResults = useMemo(
    () => searchDirectory(snapshot?.rows || [], query, filters, snapshot?.rows.length || 0),
    [snapshot, query, filters],
  );
  const results = allResults.slice(0, resultLimit);
  const companies = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of snapshot?.rows || []) {
      if (row.recordType === "disposal" && row.company.toLowerCase() === "disposals") continue;
      counts.set(row.company, (counts.get(row.company) || 0) + 1);
    }
    return [...counts].map(([company, count]) => ({ company, count })).sort((left, right) => left.company.localeCompare(right.company));
  }, [snapshot]);
  const companyResults = useMemo(() => (snapshot?.rows || [])
    .filter((row) => row.company === selectedCompany)
    .slice()
    .sort((left, right) => left.padName.localeCompare(right.padName) || left.recordType.localeCompare(right.recordType) || left.padId.localeCompare(right.padId)), [snapshot, selectedCompany]);
  const companyRoadsReady = selectedCompany !== "" && companyRoads.availability.state === "ready" && companyRoads.availability.companies.includes(selectedCompany);

  useEffect(() => {
    setResultLimit(80);
  }, [query, filters.type]);

  function chooseCompany(company: string) {
    setSelectedCompany(company);
    if (company && companyRoads.availability.state === "ready" && companyRoads.availability.companies.includes(company)) {
      companyRoads.selectRoads(company);
      navigate("/");
    }
  }

  if (loading) return <LoadingState message="Preparing search…"/>;
  return <section className="content-page search-page">
    <header className="page-heading"><span className="eyebrow">DIRECTORY</span><h1>Find the right location</h1><p>One search across pads, disposals, companies, identifiers, wells, and reviewed road names.</p></header>
    <div className="search-mode-tabs" role="tablist" aria-label="Search method">
      <button role="tab" aria-selected={mode === "locations"} className={mode === "locations" ? "active" : ""} onClick={() => setMode("locations")}><Icon name="search"/> Locations</button>
      <button role="tab" aria-selected={mode === "companies"} className={mode === "companies" ? "active" : ""} onClick={() => setMode("companies")}><Icon name="company"/> By company</button>
    </div>
    {mode === "locations" ? <>
      <div className="search-command">
        <Icon name="search"/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pad, API, company, well, road…" aria-label="Search BrineSearch"/>{query && <button onClick={() => setQuery("")} aria-label="Clear search"><Icon name="close"/></button>}
      </div>
      <div className="filter-row filter-scroll" aria-label="Search result type">{typeFilters.map((filter) => <button type="button" key={filter.value} aria-pressed={filters.type === filter.value} className={filters.type === filter.value ? "active" : ""} onClick={() => setFilters((current) => ({ ...current, type: filter.value }))}>{filter.label}</button>)}</div>
      <div className="result-summary"><strong>{allResults.length.toLocaleString()}</strong> {query ? "matching" : "starting"} results {results.length < allResults.length && <span>· showing {results.length.toLocaleString()}</span>} <span>· {sourceLabel(snapshot?.sourceState)}</span></div>
      <div className="result-list">{results.map((pad) => <ResultCard pad={pad} key={pad.padId}/>)}</div>
      {results.length < allResults.length && <button type="button" className="button-secondary search-show-more" onClick={() => setResultLimit((current) => current + 80)}>Show more results</button>}
      {!allResults.length && (
        <EmptyState icon="search" title={filters.type === "road" && !query.trim() ? "Enter a road name" : "No exact match"} body={filters.type === "road" && !query.trim() ? "Road mode shows only an explicitly reviewed road-name match. It never fills the list with unrelated locations." : "Try another pad spelling, API number, company, county, or verified road name. BrineSearch will not guess an ambiguous location."}/>
      )}
    </> : <>
      <label className="company-picker-card">
        <span><small>COMPANY DIRECTORY</small><strong>Choose a company</strong></span>
        <select value={selectedCompany} onChange={(event) => chooseCompany(event.target.value)} aria-label="Select company">
          <option value="">Select a company…</option>
          {companies.map(({ company, count }) => <option key={company} value={company}>{company} · {count.toLocaleString()} {count === 1 ? "location" : "locations"}</option>)}
        </select>
      </label>
      <div className="result-summary">{selectedCompany ? <><strong>{companyResults.length.toLocaleString()}</strong> locations for {selectedCompany}</> : <><strong>{companies.length.toLocaleString()}</strong> companies available</>} <span>· {sourceLabel(snapshot?.sourceState)}</span></div>
      {selectedCompany && companyRoadsReady && <aside className="company-road-hold company-road-ready" role="status"><Icon name="map"/><div><strong>{selectedCompany} is ready on the Map</strong><p>Choosing this company opens the Map with only its pads, disposals, and current exact approved route-road subset. Held, stale, legacy-only, guessed, or unpublished roads stay hidden.</p></div></aside>}
      {selectedCompany ? <div className="result-list">{companyResults.map((pad) => <ResultCard pad={pad} key={pad.padId}/>)}</div> : <div className="company-picker-prompt"><Icon name="company"/><strong>Select a company above</strong><p>Your browser opens its native picker. Choosing a company shows every matching pad and disposal without guessing.</p></div>}
    </>}
  </section>;
}
