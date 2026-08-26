import { type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { LoadingState } from "@/components/LoadingState";
import { StatusBadge } from "@/components/StatusBadge";
import { useNetworkState } from "@/app/useNetworkState";
import { useDirectory } from "@/data/DirectoryContext";
import { saveRecent } from "@/data/offline";
import { readPadDirectionsOffline } from "@/data/offlineRoutes";
import { mapDisplayCoordinate, mapDisplayCoordinateLabel } from "@/data/mapDisplayCoordinates";
import { currentReleasedGoogleHandoff, loadReleasedGoogleHandoff } from "@/data/releasedGoogleHandoff";
import { verifiedDriverEntrancePinUrl } from "@/data/googleDestination";
import { loadDriverRouteChoices } from "@/data/routeChoices";
import { buildPendingPadStatus, loadPadStatus } from "@/data/status";
import type { DriverPadStatus, DriverRouteChoice, PadSummary, PadWellIdentifierRow } from "@/data/types";
import type { ReleasedGoogleHandoffPlan } from "@/data/googleRoute";
import { loadPadWellRows } from "@/data/wellRows";
import { buildPadIdentifierGroups, padIdentifierSummary } from "./padIdentifiers";
import { PadMapPreview } from "./PadMapPreview";
import "./PadPageLayout.css";

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

function displayWrittenDirections(value: string) {
  return value.replace(/\\r\\n|\\n|\\r/g, "\n");
}

export interface GoogleHandoffView {
  available: boolean;
  state: DriverPadStatus["google"]["publicState"];
  routeUrl: string | null;
  reason: string;
}

interface LoadedPadWellRows {
  recordKey: string;
  rows: PadWellIdentifierRow[] | null;
}

export function buildGoogleHandoffView(
  status: DriverPadStatus,
  exactRouteDisplayed: boolean,
  selectedRouteIsPrimary: boolean,
  releasedRouteUrl: string | null = null,
  online = true,
): GoogleHandoffView {
  if (!online) {
    return {
      available: false,
      state: "unavailable",
      routeUrl: null,
      reason: "Reconnect to confirm and open the reviewed approved-route handoff.",
    };
  }
  const liveStatusAvailable = selectedRouteIsPrimary
    && exactRouteDisplayed
    && status.google.publicState === "ready"
    && Boolean(status.google.routeUrl);
  const releasedPackageAvailable = selectedRouteIsPrimary && Boolean(releasedRouteUrl);
  const available = liveStatusAvailable || releasedPackageAvailable;
  const state = available ? "ready" : status.google.publicState === "ready" ? "unavailable" : status.google.publicState;
  const reason = !selectedRouteIsPrimary
    ? "The selected approved route is available in BrineSearch only."
    : exactRouteDisplayed
      ? "Use the BrineSearch map and approved steps; no single exact Google Maps handoff is available."
      : "No exact approved route is available for a Google handoff.";
  return { available, state, routeUrl: releasedPackageAvailable ? releasedRouteUrl : liveStatusAvailable ? status.google.routeUrl : null, reason };
}

export type FixedNavigationAction =
  | { kind: "approved_route"; href: string; detail: string; ariaLabel: string }
  | { kind: "destination_pin"; href: string; detail: string; ariaLabel: string }
  | { kind: "unavailable"; href: null; detail: string; ariaLabel: string };

export function buildFixedNavigationAction(view: GoogleHandoffView, pad: PadSummary): FixedNavigationAction {
  if (view.available && view.routeUrl) return {
    kind: "approved_route",
    href: view.routeUrl,
    detail: "Reviewed approved route",
    ariaLabel: "Navigate the reviewed approved route in Google Maps",
  };
  const pinUrl = destinationPinUrl(pad);
  if (pinUrl) return {
    kind: "destination_pin",
    href: pinUrl,
    detail: "GPS destination only · not an approved route",
    ariaLabel: "Open the verified driver entrance in Google Maps; destination only, not a BrineSearch-approved route",
  };
  return {
    kind: "unavailable",
    href: null,
    detail: "No verified driver entrance",
    ariaLabel: "Navigation unavailable because this pad has no verified driver entrance",
  };
}

export function FixedNavigateAction({ view, pad }: { view: GoogleHandoffView; pad: PadSummary }) {
  const action = buildFixedNavigationAction(view, pad);
  return <nav className="pad-fixed-navigation" aria-label="Pad navigation">
    {action.href ? <a className={`navigate-action is-${action.kind.replaceAll("_", "-")}`} href={action.href} target="_blank" rel="noreferrer" aria-label={action.ariaLabel} data-navigation-kind={action.kind}>
      <Icon name={action.kind === "approved_route" ? "route" : "location"}/>
      <span><strong>Navigate</strong><small>{action.detail}</small></span>
      <b aria-hidden="true">↗</b>
    </a> : <button className="navigate-action is-unavailable" type="button" disabled aria-label={action.ariaLabel} data-navigation-kind={action.kind}>
      <Icon name="location"/>
      <span><strong>Navigate</strong><small>{action.detail}</small></span>
      <b aria-hidden="true">—</b>
    </button>}
  </nav>;
}

export function destinationPinUrl(pad: PadSummary) {
  return verifiedDriverEntrancePinUrl(pad);
}

export function PadGpsActions({ pad }: { pad: PadSummary }) {
  const [copied, setCopied] = useState(false);
  const coordinate = mapDisplayCoordinate(pad);
  const pinUrl = destinationPinUrl(pad);
  if (!coordinate) return null;
  const coordinateText = `${coordinate.latitude.toFixed(6)},${coordinate.longitude.toFixed(6)}`;
  const locationLabel = mapDisplayCoordinateLabel(pad);
  const copyGps = async () => {
    try {
      await navigator.clipboard.writeText(`${coordinate.latitude},${coordinate.longitude}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  };
  return <aside className="pad-gps-actions" aria-label="Pad map location tools">
    <small className="pad-gps-role">{locationLabel}</small>
    <div className="pad-gps-inline">
      {pinUrl
        ? <a className="pad-gps-coordinate-link mono" href={pinUrl} target="_blank" rel="noreferrer" aria-label={`Open ${coordinateText} in Google Maps; destination pin only, not an approved route`}>{coordinateText}</a>
        : <strong className="mono">{coordinateText}</strong>}
      <button type="button" className={`pad-gps-copy-pill${copied ? " is-copied" : ""}`} onClick={copyGps} aria-label={copied ? `${locationLabel} GPS coordinates copied` : `Copy ${locationLabel.toLowerCase()} GPS coordinates`}><span aria-hidden="true">COPY</span></button>
      <span className="pad-gps-copy-status" role="status" aria-live="polite">{copied ? "GPS copied" : ""}</span>
    </div>
    <span className="pad-gps-boundary">{pinUrl ? "Pin only · not an approved route" : "Display only · no navigation"}</span>
  </aside>;
}

export function currentStatusForPad(
  resolvedStatus: DriverPadStatus | null,
  pad: { padId: string; recordRevision: string },
) {
  return resolvedStatus?.padId === pad.padId
    && resolvedStatus.recordRevision === pad.recordRevision
    ? resolvedStatus
    : null;
}

export type PadRouteConnectionState = "checking" | "live" | "session-checked" | "saved-reviewed" | "offline" | "unavailable";

export function padRouteConnectionState(status: DriverPadStatus | null, online: boolean): PadRouteConnectionState {
  if (!online) return "offline";
  if (!status) return "checking";
  if (status.loadProvenance === "live_response") return "live";
  if (status.loadProvenance === "session_cache") return "session-checked";
  if (status.loadProvenance === "device_cache") return "saved-reviewed";
  return "unavailable";
}

export function displayedRouteForChoice(status: DriverPadStatus, choice: DriverRouteChoice | null) {
  const selectedRouteIsPrimary = !choice || choice.routeGroup === "primary";
  return {
    selectedRouteIsPrimary,
    steps: choice?.routeGroup === "alternate" ? choice.steps : status.routeSteps,
    geometry: choice?.routeGroup === "alternate" ? choice.geometry : status.route.geometry,
  };
}

export function PadPage() {
  const { padId = "" } = useParams();
  const navigate = useNavigate();
  const online = useNetworkState();
  const { findPad, favorites, toggleFavorite, loading, snapshot } = useDirectory();
  const pad = findPad(decodeURIComponent(padId));
  const [resolvedStatus, setStatus] = useState<DriverPadStatus | null>(null);
  const [releasedHandoff, setReleasedHandoff] = useState<ReleasedGoogleHandoffPlan | null | undefined>(undefined);
  const [routeChoices, setRouteChoices] = useState<DriverRouteChoice[]>([]);
  const [selectedRouteKey, setSelectedRouteKey] = useState("");
  const [loadedWellRows, setLoadedWellRows] = useState<LoadedPadWellRows | null>(null);

  useEffect(() => {
    if (!pad) return;
    let cancelled = false;
    setStatus(null);
    setReleasedHandoff(undefined);
    setRouteChoices([]);
    setSelectedRouteKey("");
    setLoadedWellRows(null);
    const recordKey = `${pad.padId}:${pad.recordRevision}`;
    saveRecent(pad).catch(() => undefined);
    loadReleasedGoogleHandoff(pad).then((plan) => {
      if (!cancelled) setReleasedHandoff(plan);
    });
    if (online) {
      readPadDirectionsOffline(pad).then((cached) => {
        if (!cancelled && cached) setStatus((current) => current || cached);
      });
    }
    loadPadStatus(pad, snapshot?.sourceState).then((next) => {
      if (cancelled) return;
      setStatus(next);
      if (online && next.dataState === "live" && next.route.state === "ready" && next.route.source === "exact_graph" && next.graph.state === "active_current") {
        loadDriverRouteChoices(pad).then((choices) => {
          if (cancelled) return;
          setRouteChoices(choices);
          setSelectedRouteKey(choices[0]?.routeKey || "");
        });
      }
    });
    loadPadWellRows(pad, snapshot?.sourceState).then((rows) => {
      if (!cancelled) setLoadedWellRows({ recordKey, rows });
    });
    return () => { cancelled = true; };
  }, [online, pad, snapshot?.sourceState]);

  if (loading) return <LoadingState message="Loading pad details…"/>;
  if (!pad) return <section className="page-state"><h1>Pad not found</h1><p>This link may refer to a removed or superseded record.</p><Link to="/search" className="button-primary">Return to Search</Link></section>;
  const currentResolvedStatus = currentStatusForPad(resolvedStatus, pad);
  const padRecordKey = `${pad.padId}:${pad.recordRevision}`;
  const wellRows = loadedWellRows?.recordKey === padRecordKey ? loadedWellRows.rows : undefined;
  const status = currentResolvedStatus || buildPendingPadStatus(pad, snapshot?.sourceState);
  const currentRouteChoices = currentResolvedStatus ? routeChoices : [];
  const connectionState = padRouteConnectionState(currentResolvedStatus, online);
  const connectionLabel = connectionState === "offline" ? "Offline" : connectionState === "live" ? "Live" : connectionState === "session-checked" ? "Ready" : connectionState === "saved-reviewed" ? "Saved reviewed" : connectionState === "unavailable" ? "Unavailable" : "Checking";
  const hasSavedReviewedStatus = status.loadProvenance === "device_cache";
  const offlineCacheMiss = !online && !hasSavedReviewedStatus;

  const favorite = favorites.has(pad.padId);
  const identifierGroups = buildPadIdentifierGroups(pad);
  const selectedRouteChoice = currentRouteChoices.find((choice) => choice.routeKey === selectedRouteKey) || currentRouteChoices[0] || null;
  const displayedRoute = displayedRouteForChoice(status, selectedRouteChoice);
  const selectedRouteIsPrimary = displayedRoute.selectedRouteIsPrimary;
  const displayedRouteSteps = displayedRoute.steps;
  const displayedRouteGeometry = displayedRoute.geometry;
  const currentReleasedHandoffPlan = online ? currentReleasedGoogleHandoff(releasedHandoff, pad) : null;
  const exactRouteDisplayed = status.route.state === "ready"
    && status.route.source === "exact_graph"
    && status.graph.state === "active_current"
    && displayedRouteSteps.length > 0
    && displayedRouteGeometry !== null;
  const googleHandoff = buildGoogleHandoffView(
    status,
    exactRouteDisplayed,
    selectedRouteIsPrimary,
    currentReleasedHandoffPlan?.singleUrl || null,
    online,
  );
  const hasSavedRouteFallback = displayedRouteSteps.length === 0 && Boolean(pad.structuredRoadSequence || status.route.writtenDirections);

  return <article className="pad-page has-fixed-navigation">
    <header className="pad-topbar"><button className="icon-button" onClick={() => navigate(-1)} aria-label="Go back"><Icon name="back"/></button><span>Pad details</span><span className="pad-topbar-spacer" aria-hidden="true"/></header>
    <section className="pad-header-block" aria-labelledby="pad-detail-title">
      <div className="pad-header-primary">
        <section className="pad-hero">
          <div><span className="eyebrow">{pad.recordType === "disposal" ? "DISPOSAL" : "FIELD PAD"}</span><h1 id="pad-detail-title">{pad.padName}</h1><p className="pad-company">{pad.company}</p><PadGpsActions pad={pad}/><div className="pad-header-actions" role="group" aria-label="Pad actions"><button type="button" className={`pad-header-action ${favorite ? "is-favorite" : ""}`} aria-label={favorite ? `Remove ${pad.padName} from saved locations` : `Save ${pad.padName}`} aria-pressed={favorite} onClick={() => toggleFavorite(pad.padId)}><Icon name="saved"/>{favorite ? "Saved" : "Save"}</button><button type="button" className="pad-header-action" aria-label={`Share ${pad.padName}`} onClick={() => navigator.share?.({ title: `${pad.padName} · BrineSearch`, url: location.href }).catch(() => undefined)}><Icon name="share"/>Share</button></div></div>
        </section>
        <div className="pad-header-map-slot">
          <PadMapPreview pad={pad} status={status} routeGeometry={displayedRouteGeometry}/>
        </div>
      </div>
    </section>

    <details className="detail-card pad-well-card" open><summary><span><strong>Pad and well information</strong><small>{wellRows?.length ? `${wellRows.length} synchronized well rows` : padIdentifierSummary(pad)}</small></span><span>⌄</span></summary>
      <div className="pad-location-grid"><div><small>Address / location</small><strong>{pad.address || "Not listed"}</strong></div><div className="pad-administrative-location"><small>County / township / state</small><strong><Icon name="location"/>{[pad.county, pad.township, pad.state].filter(Boolean).join(" · ") || "Location not listed"}</strong></div></div>
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

    {currentRouteChoices.length > 1 && <section className="driver-route-choice-card" aria-labelledby="driver-route-choice-title">
      <div><span className="eyebrow">APPROVED ROUTE CHOICE</span><h2 id="driver-route-choice-title">Choose the route you want to view</h2><p>Every option shown here independently passed the exact route, current graph, verified destination, and public projection gates.</p></div>
      <div className="driver-route-choice-buttons">{currentRouteChoices.map((choice) => <button key={choice.routeKey} type="button" className={choice.routeKey === selectedRouteChoice?.routeKey ? "is-selected" : ""} aria-pressed={choice.routeKey === selectedRouteChoice?.routeKey} onClick={() => setSelectedRouteKey(choice.routeKey)}><strong>{choice.label}</strong><span>{choice.steps.length} exact {choice.steps.length === 1 ? "road step" : "road steps"}</span></button>)}</div>
      <small>Choosing a route changes the highlighted BrineSearch route. Google publication remains a separate safety gate.</small>
    </section>}

    <section className="route-steps-card">
      <div className="section-heading"><div><span className="eyebrow">ROAD SEQUENCE</span><h2>{displayedRouteSteps.length ? "Approved route" : hasSavedRouteFallback ? "Saved BrineSearch route" : "No structured route"}</h2></div></div>
      {displayedRouteSteps.length ? <ol className="route-step-list">{displayedRouteSteps.map((step) => <li key={`${step.order}-${step.displayName}`} className={`route-step step-${step.kind}`}><span className="step-number">{step.order}</span><div><strong>{step.displayName}</strong><p>{step.instruction}</p>{(step.verifiedDesignations.length > 0 || semanticLabel(step.kind)) && <div className="designation-row">{step.verifiedDesignations.map((name) => <span key={name}>{name}</span>)}{semanticLabel(step.kind) && <b>{semanticLabel(step.kind)}</b>}</div>}</div>{step.distanceMiles !== null && <small>{step.distanceMiles.toFixed(1)} mi</small>}</li>)}</ol>
         : hasSavedRouteFallback ? <div className="readiness-column"><StatusBadge status={status.route.state}/><strong>Legacy saved directions</strong>{pad.structuredRoadSequence && <p>{pad.structuredRoadSequence}</p>}<p>Saved BrineSearch directions are available below. This is not a verified structured route, and the Google Maps handoff stays disabled until approval is complete.</p></div>
        : <p className="card-empty">No approved structured road cards or saved BrineSearch directions are publicly available yet.</p>}
    </section>

    {status.route.writtenDirections && <details className="detail-card" open><summary><span><strong>Written field directions</strong><small>Saved wording · verify current conditions</small></span><span>⌄</span></summary><p className="written-directions">{displayWrittenDirections(status.route.writtenDirections)}</p></details>}

    <details className="detail-card pad-readiness-details"><summary><span><strong>Route status</strong><small><b role="status" aria-live="polite" aria-atomic="true">{connectionLabel}</b> · route, graph, and navigation handoff</small></span><span aria-hidden="true">⌄</span></summary>
      <div className="pad-readiness-content">
        <div className={`pad-connection-badge is-${connectionState}`}><span aria-hidden="true"/><strong>{connectionLabel}</strong><small>{connectionState === "live" ? "Completed route check for this pad revision" : connectionState === "session-checked" ? "Completed route check reused for this pad revision" : connectionState === "checking" ? "Checking this route once for the current app session" : hasSavedReviewedStatus ? "Device-stored reviewed route information" : connectionState === "offline" ? "No reviewed route is saved on this device" : "No reviewed route response is available"}</small></div>
        {connectionState !== "live" && connectionState !== "session-checked" && <div className="stale-banner"><Icon name="offline"/><div><strong>{offlineCacheMiss ? "Offline · not cached" : connectionState === "checking" ? "Checking reviewed route status" : connectionState === "unavailable" ? "Route check unavailable" : "Saved reviewed directions"}</strong><span>{offlineCacheMiss ? "Open this pad once while online to save reviewed directions on this device." : connectionState === "unavailable" ? "No live or device-stored route response was found. No route authority was inferred." : `No new route authority was inferred. Saved record update: ${dateLabel(pad.updatedAt)}`}</span></div></div>}
        <div className="section-heading"><div><span className="eyebrow">ROUTE READINESS</span><h2>Current authority</h2></div><span className="readiness-updated">Checked {dateLabel(status.route.lastVerifiedAt)}</span></div>
        <div className="readiness-grid">
          <StatusColumn icon="route" label="ROUTE SOURCE" detail={status.route.safeReason || "BrineSearch route authority."}><StatusBadge status={status.route.state}/><strong>{status.route.source.replaceAll("_", " ")}</strong></StatusColumn>
          <StatusColumn icon="graph" label="ROAD GRAPH" detail={`${status.graph.county || pad.county || "County not listed"} · ${dateLabel(status.graph.lastVerifiedAt)}`}><StatusBadge status={status.graph.state}/><strong>{status.graph.publicSource || "Public graph status"}</strong></StatusColumn>
          <StatusColumn icon="google" label="GOOGLE HANDOFF" detail={googleHandoff.available ? "One reviewed mobile handoff is bound to this exact BrineSearch route. Approval begins at its verified ingress." : googleHandoff.reason}><StatusBadge status={googleHandoff.state}/><strong>{googleHandoff.available ? "Approved route action available" : "No exact Google handoff"}</strong></StatusColumn>
        </div>
      </div>
    </details>
    <details className="detail-card"><summary><span><strong>Data source and freshness</strong><small>Record status, identity, coordinate role, and revision</small></span><span>⌄</span></summary><div className="detail-grid"><div><small>Operating status</small><strong>{pad.operatingStatus || "Not listed"}</strong></div><div><small>Record ID</small><strong className="mono">{pad.canonicalId || pad.legacyId || pad.padId}</strong></div><div><small>Record revision</small><strong>{pad.recordRevision}</strong></div><div><small>Map coordinate</small><strong>{mapDisplayCoordinateLabel(pad)}</strong></div><div><small>Google handoff state</small><strong>{googleHandoff.state.replaceAll("_", " ")}</strong></div></div></details>
    <p className="safety-footer">BrineSearch route data does not guarantee present road, weather, gate, or site conditions. Follow company and field safety requirements.</p>
    <FixedNavigateAction view={googleHandoff} pad={pad}/>
  </article>;
}
