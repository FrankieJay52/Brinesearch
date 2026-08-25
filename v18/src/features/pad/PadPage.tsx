import { type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { LoadingState } from "@/components/LoadingState";
import { StatusBadge } from "@/components/StatusBadge";
import { useDirectory } from "@/data/DirectoryContext";
import { saveRecent } from "@/data/offline";
import { loadDriverRouteChoices } from "@/data/routeChoices";
import { loadPadStatus } from "@/data/status";
import type { DriverPadStatus, DriverRouteChoice, PadWellIdentifierRow } from "@/data/types";
import { loadPadWellRows } from "@/data/wellRows";
import { buildPadIdentifierGroups, padIdentifierSummary } from "./padIdentifiers";
import { PadMapPreview } from "./PadMapPreview";

function StatusColumn({ icon, label, children, detail }: { icon: "route" | "graph" | "google"; label: string; children: ReactNode; detail: string }) {
  return <div className="readiness-column"><span className="readiness-icon"><Icon name={icon}/></span><small>{label}</small>{children}<p>{detail}</p></div>;
}

function dateLabel(value: string | null) {
  if (!value) return "Not yet publicly verified";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function semanticLabel(kind: DriverPadStatus["routeSteps"][number]["kind"]) {
  if (kind === "shared_begin") return "Shared pavement begins — no turn inferred";
  if (kind === "shared_end") return "Shared pavement ends";
  if (kind === "name_change") return "Road name changes — continue without turning";
  return null;
}

export function PadPage() {
  const { padId = "" } = useParams();
  const navigate = useNavigate();
  const { findPad, favorites, toggleFavorite, loading, snapshot } = useDirectory();
  const pad = findPad(decodeURIComponent(padId));
  const [status, setStatus] = useState<DriverPadStatus | null>(null);
  const [routeChoices, setRouteChoices] = useState<DriverRouteChoice[]>([]);
  const [selectedRouteKey, setSelectedRouteKey] = useState("");
  const [wellRows, setWellRows] = useState<PadWellIdentifierRow[] | null | undefined>(undefined);

  useEffect(() => {
    if (!pad) return;
    let cancelled = false;
    setStatus(null);
    setRouteChoices([]);
    setSelectedRouteKey("");
    setWellRows(undefined);
    saveRecent(pad).catch(() => undefined);
    loadPadStatus(pad, snapshot?.sourceState).then((next) => !cancelled && setStatus(next));
    loadDriverRouteChoices(pad).then((choices) => {
      if (cancelled) return;
      setRouteChoices(choices);
      setSelectedRouteKey(choices[0]?.routeKey || "");
    });
    loadPadWellRows(pad, snapshot?.sourceState).then((next) => !cancelled && setWellRows(next));
    return () => { cancelled = true; };
  }, [pad, snapshot?.sourceState]);

  if (loading) return <LoadingState message="Loading pad details…"/>;
  if (!pad) return <section className="page-state"><h1>Pad not found</h1><p>This link may refer to a removed or superseded record.</p><Link to="/search" className="button-primary">Return to Search</Link></section>;
  if (!status) return <LoadingState message={`Checking ${pad.padName} route status…`}/>;

  const favorite = favorites.has(pad.padId);
  const identifierGroups = buildPadIdentifierGroups(pad);
  const selectedRouteChoice = routeChoices.find((choice) => choice.routeKey === selectedRouteKey) || routeChoices[0] || null;
  const displayedRouteSteps = selectedRouteChoice?.steps || status.routeSteps;
  const displayedRouteGeometry = selectedRouteChoice?.geometry || status.route.geometry;
  const selectedRouteIsPrimary = !selectedRouteChoice || selectedRouteChoice.routeGroup === "primary";
  const hasSavedRouteFallback = displayedRouteSteps.length === 0 && Boolean(pad.structuredRoadSequence || status.route.writtenDirections);
  const destinationUrl = status.destination.available && status.destination.latitude !== null && status.destination.longitude !== null
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${status.destination.latitude},${status.destination.longitude}`)}`
    : null;

  return <article className="pad-page">
    <header className="pad-topbar"><button className="icon-button" onClick={() => navigate(-1)} aria-label="Go back"><Icon name="back"/></button><span>Pad details</span><button className={`icon-button ${favorite ? "is-favorite" : ""}`} onClick={() => toggleFavorite(pad.padId)} aria-label={favorite ? "Remove favorite" : "Save favorite"}><Icon name="saved"/></button></header>
    <section className="pad-hero">
      <div><span className="eyebrow">{pad.recordType === "disposal" ? "DISPOSAL" : "FIELD PAD"}</span><h1>{pad.padName}</h1><p className="pad-company">{pad.company}</p><p className="pad-location"><Icon name="location"/>{[pad.county, pad.township, pad.state].filter(Boolean).join(" · ") || "Location not listed"}</p></div>
      <button className="share-button" onClick={() => navigator.share?.({ title: `${pad.padName} · BrineSearch`, url: location.href }).catch(() => undefined)}><Icon name="share"/>Share</button>
    </section>

    {status.dataState !== "live" && <div className="stale-banner"><Icon name="offline"/><div><strong>{status.dataState === "fallback" ? "Packaged fallback record" : "Saved record"}</strong><span>Route and graph status may be unavailable. Last record update: {dateLabel(pad.updatedAt)}</span></div></div>}

    {routeChoices.length > 1 && <section className="driver-route-choice-card" aria-labelledby="driver-route-choice-title">
      <div><span className="eyebrow">APPROVED ROUTE CHOICE</span><h2 id="driver-route-choice-title">Choose the route you want to view</h2><p>Every option shown here independently passed the exact route, current graph, verified destination, and public projection gates.</p></div>
      <div className="driver-route-choice-buttons">{routeChoices.map((choice) => <button key={choice.routeKey} type="button" className={choice.routeKey === selectedRouteChoice?.routeKey ? "is-selected" : ""} aria-pressed={choice.routeKey === selectedRouteChoice?.routeKey} onClick={() => setSelectedRouteKey(choice.routeKey)}><strong>{choice.label}</strong><span>{choice.steps.length} exact {choice.steps.length === 1 ? "road step" : "road steps"}</span></button>)}</div>
      <small>Choosing a route changes the highlighted BrineSearch route. Google publication remains a separate safety gate.</small>
    </section>}

    <section className="pad-route-layout">
      <PadMapPreview pad={pad} status={status} routeGeometry={displayedRouteGeometry}/>
      <div className="route-action-panel">
        <span className="eyebrow">DRIVER ACTION</span>
        {selectedRouteIsPrimary && status.google.publicState === "ready" && status.google.routeUrl ? <a className="navigate-action" href={status.google.routeUrl} target="_blank" rel="noreferrer"><Icon name="route"/><span><strong>{status.googleRouteChunks.length > 1 ? `Open route 1 of ${status.googleRouteChunks.length}` : "Open approved route"}</strong><small>Current public Google route</small></span><b>↗</b></a>
          : destinationUrl ? <a className="navigate-action destination-only" href={destinationUrl} target="_blank" rel="noreferrer"><Icon name="location"/><span><strong>Open destination pin</strong><small>Destination only—not an approved route</small></span><b>↗</b></a>
          : <div className="navigate-unavailable"><Icon name="location"/><span><strong>No verified navigation target</strong><small>{status.route.writtenDirections ? "Use only the current reviewed directions shown below." : "Wait for a current public route or verified destination."}</small></span></div>}
        {selectedRouteIsPrimary && status.googleRouteChunks.length > 1 && <div className="route-chunk-list" aria-label="Approved route sections">{status.googleRouteChunks.slice(1).map((chunk) => <a key={chunk.chunk} href={chunk.url} target="_blank" rel="noreferrer">Open route {chunk.chunk} of {status.googleRouteChunks.length}<span>↗</span></a>)}</div>}
        {status.google.publicState !== "ready" && <p className="route-safety-note"><strong>Google route:</strong> {status.google.safeReason || "No current public approved route is available."}</p>}
      </div>
    </section>

    <section className="readiness-card">
      <div className="section-heading"><div><span className="eyebrow">ROUTE READINESS</span><h2>What is safe to use</h2></div><span className="readiness-updated">Checked {dateLabel(status.route.lastVerifiedAt)}</span></div>
      <div className="readiness-grid">
        <StatusColumn icon="route" label="ROUTE SOURCE" detail={status.route.safeReason || "BrineSearch route authority."}><StatusBadge status={status.route.state}/><strong>{status.route.source.replaceAll("_", " ")}</strong></StatusColumn>
        <StatusColumn icon="graph" label="ROAD GRAPH" detail={`${status.graph.county || pad.county || "County not listed"} · ${dateLabel(status.graph.lastVerifiedAt)}`}><StatusBadge status={status.graph.state}/><strong>{status.graph.publicSource || "Public graph status"}</strong></StatusColumn>
        <StatusColumn icon="google" label="PUBLIC GOOGLE" detail={status.google.safeReason || "Public availability only; private evidence is owner-only."}><StatusBadge status={status.google.publicState}/><strong>{status.google.publicState === "ready" ? "Approved route available" : "No launchable public route"}</strong></StatusColumn>
      </div>
    </section>

    <section className="route-steps-card">
      <div className="section-heading"><div><span className="eyebrow">ROAD SEQUENCE</span><h2>{displayedRouteSteps.length ? `${selectedRouteChoice ? `${selectedRouteChoice.label} · ` : ""}${displayedRouteSteps.length} route steps` : hasSavedRouteFallback ? "Saved BrineSearch route" : "No structured route"}</h2></div></div>
      {displayedRouteSteps.length ? <ol className="route-step-list">{displayedRouteSteps.map((step) => <li key={`${step.order}-${step.displayName}`} className={`route-step step-${step.kind}`}><span className="step-number">{step.order}</span><div><strong>{step.displayName}</strong><p>{step.instruction}</p>{(step.verifiedDesignations.length > 0 || semanticLabel(step.kind)) && <div className="designation-row">{step.verifiedDesignations.map((name) => <span key={name}>{name}</span>)}{semanticLabel(step.kind) && <b>{semanticLabel(step.kind)}</b>}</div>}</div>{step.distanceMiles !== null && <small>{step.distanceMiles.toFixed(1)} mi</small>}</li>)}</ol>
        : hasSavedRouteFallback ? <div className="readiness-column"><StatusBadge status={status.route.state}/><strong>Legacy saved directions</strong>{pad.structuredRoadSequence && <p>{pad.structuredRoadSequence}</p>}<p>Saved BrineSearch directions are available below. This is not a verified structured route, and Google route launch stays disabled until approval is complete.</p></div>
        : <p className="card-empty">No approved structured road cards or saved BrineSearch directions are publicly available yet.</p>}
    </section>

    {status.route.writtenDirections && <details className="detail-card" open><summary><span><strong>Written field directions</strong><small>Saved wording · verify current conditions</small></span><span>⌄</span></summary><p className="written-directions">{status.route.writtenDirections}</p></details>}
    <details className="detail-card pad-well-card" open><summary><span><strong>Pad and well information</strong><small>{wellRows?.length ? `${wellRows.length} synchronized well rows` : padIdentifierSummary(pad)}</small></span><span>⌄</span></summary>
      <div className="pad-location-grid"><div><small>Address / location</small><strong>{pad.address || "Not listed"}</strong></div><div><small>Operating status</small><strong>{pad.operatingStatus || "Not listed"}</strong></div></div>
      <section className="pad-identifier-board" aria-labelledby="pad-identifiers-title">
        <header><div><span className="eyebrow">PUBLIC WELL IDENTIFIERS</span><h3 id="pad-identifiers-title">Well names, APIs, and properties</h3></div></header>
        {wellRows === undefined ? <p className="pad-identifier-loading">Loading reviewed well rows…</p>
          : wellRows?.length ? <div className="pad-well-table-shell"><table className="pad-well-table"><caption>Reviewed well, API, and property pairings</caption><colgroup><col className="well-column"/><col className="api-column"/><col className="property-column"/></colgroup><thead><tr><th scope="col">Well name</th><th scope="col">API</th><th scope="col">Property</th></tr></thead><tbody>{wellRows.map((row, index) => <tr key={`${index}-${row.wellName || ""}-${row.apiNumber || ""}-${row.propertyNumber || ""}`}><td>{row.wellName || "—"}</td><td>{row.apiNumber || "—"}</td><td>{row.propertyNumber || "—"}</td></tr>)}</tbody></table></div>
          : <div className="pad-identifier-grid">
            {identifierGroups.map((group) => <section className={`pad-identifier-group identifier-${group.key}`} key={group.key} aria-label={group.label}>
              <header><strong>{group.label}</strong><span>{group.values.length}</span></header>
              {group.values.length ? <ul>{group.values.map((value) => <li key={value}>{value}</li>)}</ul> : <p>Not listed</p>}
            </section>)}
          </div>}
        {wellRows !== undefined && <p className="pad-identifier-note">{wellRows?.length ? "Each row preserves the reviewed production well, API, and property relationship." : "The synchronized row contract is unavailable, so identifiers remain grouped by type and are not paired."}</p>}
      </section>
    </details>
    <details className="detail-card"><summary><span><strong>Data source and freshness</strong><small>Record identity, coordinate role, and revision</small></span><span>⌄</span></summary><div className="detail-grid"><div><small>Record ID</small><strong className="mono">{pad.canonicalId || pad.legacyId || pad.padId}</strong></div><div><small>Record revision</small><strong>{pad.recordRevision}</strong></div><div><small>Coordinate role</small><strong>{pad.coordinate?.role.replaceAll("_", " ") || "No coordinate"}</strong></div><div><small>Public Google state</small><strong>{status.google.publicState.replaceAll("_", " ")}</strong></div></div></details>
    <p className="safety-footer">BrineSearch route data does not guarantee present road, weather, gate, or site conditions. Follow company and field safety requirements.</p>
  </article>;
}
