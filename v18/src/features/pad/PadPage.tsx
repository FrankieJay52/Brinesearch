import { type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { LoadingState } from "@/components/LoadingState";
import { StatusBadge } from "@/components/StatusBadge";
import { useNetworkState } from "@/app/useNetworkState";
import { useDirectory } from "@/data/DirectoryContext";
import { useOwnerAccess } from "@/data/OwnerAccessContext";
import { saveRecent } from "@/data/offline";
import { readPadDirectionsOffline } from "@/data/offlineRoutes";
import { mapDisplayCoordinate, mapDisplayCoordinateLabel } from "@/data/mapDisplayCoordinates";
import {
  currentReleasedGoogleHandoff,
  loadReleasedGoogleHandoff,
  type ReleasedGoogleHandoffLoad,
} from "@/data/releasedGoogleHandoff";
import { padDestinationNavigationUrl, padDestinationPinUrl, trustedPadDestination } from "@/data/googleDestination";
import { loadDriverRouteChoices } from "@/data/routeChoices";
import { parseSavedDirectionReference, type SavedDirectionReference, type SavedDirectionReferenceInput } from "@/data/savedDirectionReference";
import { reviewedNavigationCandidateForPad, reviewedNavigationSafetyHoldForPad, reviewedNavigationSequenceItems, type ReviewedNavigationCandidate } from "@/data/reviewedNavigationCandidates";
import { buildPendingPadStatus, graphStateSupportsRoute, loadPadStatus } from "@/data/status";
import type { DriverNamedApproach, DriverPadStatus, DriverRouteChoice, PadSummary, PadWellIdentifierRow } from "@/data/types";
import { loadPadWellRows } from "@/data/wellRows";
import { buildPadIdentifierGroups, padIdentifierSummary } from "./padIdentifiers";
import { PadMapPreview } from "./PadMapPreview";
import { ownerGoogleVerifyDestination } from "@/features/owner-google-verify/ownerGoogleVerifyModel";
import {
  ascentPadApproachDirectionAuthorityLabel,
  loadAscentPadApproachForPad,
  type AscentPadApproachRecord,
} from "@/features/map/ascentPadApproaches";
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

export function ReviewedWrittenDirections({ value, reference: suppliedReference }: { value?: string; reference?: SavedDirectionReference }) {
  const reference = suppliedReference ?? parseSavedDirectionReference({ directionsClear: value ?? null });
  if (!reference) return null;
  if (!reference.structured) return <p className="written-directions">{reference.displayText}</p>;
  return <div className="reviewed-written-directions">
    {reference.orderedBlocks.map((block) => block.kind === "sequence"
      ? <div className="reviewed-route-sequence" key={`sequence-${block.sourceIndex}`}><small>ROAD SEQUENCE</small><p>{block.value}</p></div>
      : block.kind === "steps"
        ? <ol aria-label="Saved written driving directions" start={block.steps[0].number} key={`steps-${block.sourceIndex}`}>{block.steps.map((step) => <li key={`${step.number}-${step.instruction}`}><span>{step.number}</span><p>{step.instruction}</p></li>)}</ol>
        : <div className="saved-direction-notes" aria-label="Additional saved direction notes" key={`notes-${block.sourceIndex}`}>{block.values.map((note, noteIndex) => <p key={`${noteIndex}-${note}`}>{note}</p>)}</div>)}
  </div>;
}

export function shouldShowSavedWrittenDirections({
  hasSafetyHold,
  hasWrittenDirections,
}: {
  hasSafetyHold: boolean;
  hasWrittenDirections: boolean;
}) {
  return !hasSafetyHold && hasWrittenDirections;
}

export function savedDirectionReferenceInputs(
  route: Pick<DriverPadStatus["route"], "writtenDirections" | "writtenDirectionsSource">,
  padWrittenDirections: string | null | undefined,
): SavedDirectionReferenceInput {
  if (route.writtenDirectionsSource === "directions_clear" && route.writtenDirections) {
    return { directionsClear: route.writtenDirections };
  }
  if (route.writtenDirections) {
    // A written_directions marker, or an older payload with no marker, must
    // remain unstructured. Never infer reviewed sections from raw prose.
    return { writtenDirections: route.writtenDirections };
  }
  return { writtenDirections: padWrittenDirections ?? null };
}

export function savedDirectionsNeedReviewedRouteWarning({
  reviewedCandidate,
  displayedRouteStepCount,
  namedApproach,
  hasMeasuredDisplayRoute,
}: {
  reviewedCandidate: Pick<ReviewedNavigationCandidate, "padId"> | null;
  displayedRouteStepCount: number;
  namedApproach: Pick<DriverNamedApproach, "approachKey"> | null;
  hasMeasuredDisplayRoute: boolean;
}) {
  return reviewedCandidate !== null || displayedRouteStepCount > 0 || namedApproach !== null || hasMeasuredDisplayRoute;
}

export function SavedFieldDirections({
  value,
  directionsClear,
  writtenDirections,
  mayDifferFromReviewedRoute = false,
}: {
  value?: string;
  directionsClear?: string | null;
  writtenDirections?: string | null;
  mayDifferFromReviewedRoute?: boolean;
}) {
  const reference = parseSavedDirectionReference({
    directionsClear: directionsClear ?? value ?? null,
    writtenDirections: writtenDirections ?? null,
  });
  if (!reference) return null;
  return <section className="saved-field-directions" aria-labelledby="saved-field-directions-title">
    <header><div><strong id="saved-field-directions-title">Saved field directions</strong><small>Original road wording and mileage</small></div><span>Text only · no teal geometry</span></header>
    {mayDifferFromReviewedRoute && <p className="saved-directions-mismatch" role="note">Reference only: these older saved directions may not match the route display or Google handoff shown above.</p>}
    <ReviewedWrittenDirections reference={reference}/>
    <p className="saved-directions-boundary">Road names and mileage are shown exactly as saved. No missing mileage or road geometry was inferred.</p>
  </section>;
}

export interface GoogleHandoffView {
  available: boolean;
  state: DriverPadStatus["google"]["publicState"];
  routeUrl: string | null;
  reason: string;
  mode: "exact_full_route" | "exact_core_destination" | "named_approach" | null;
  approachLabel: string | null;
  finalLegMode: DriverNamedApproach["finalLegMode"] | null;
  selectionRequired: boolean;
  selectedRouteIsPrimary: boolean;
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
  namedApproach: DriverNamedApproach | null = null,
  namedSelectionRequired = false,
): GoogleHandoffView {
  if (!online) {
    return {
      available: false,
      state: "unavailable",
      routeUrl: null,
      reason: "Reconnect to open the reviewed named-road handoff.",
      mode: null,
      approachLabel: null,
      finalLegMode: null,
      selectionRequired: false,
      selectedRouteIsPrimary,
    };
  }
  if (namedSelectionRequired) {
    return {
      available: false,
      state: "unavailable",
      routeUrl: null,
      reason: "Choose one reviewed approach before opening navigation.",
      mode: null,
      approachLabel: null,
      finalLegMode: null,
      selectionRequired: true,
      selectedRouteIsPrimary: false,
    };
  }
  if (namedApproach) {
    return {
      available: true,
      state: "ready",
      routeUrl: namedApproach.navigationUrl,
      reason: namedApproach.finalLegMode === "google_to_saved_gps_unapproved"
        ? "Directed named roads end at the reviewed handoff; the unnamed final movement is destination-only."
        : "Google follows the selected reviewed named roads to the saved pin.",
      mode: "named_approach",
      approachLabel: namedApproach.approachLabel,
      finalLegMode: namedApproach.finalLegMode,
      selectionRequired: false,
      selectedRouteIsPrimary: namedApproach.routeGroup === "primary",
    };
  }
  const cachedFrozenReleaseAvailable = status.loadProvenance === "device_cache"
    && status.route.state === "ready"
    && status.route.source === "exact_graph_handoff"
    && status.graph.state === "verified_release"
    && status.routeSteps.length > 0
    && status.destination.available
    && status.destination.role === "saved_pad_destination";
  const statusRouteAvailable = selectedRouteIsPrimary
    && (exactRouteDisplayed || cachedFrozenReleaseAvailable)
    && status.google.publicState === "ready"
    && Boolean(status.google.routeUrl);
  const releasedPackageAvailable = selectedRouteIsPrimary && Boolean(releasedRouteUrl);
  const available = statusRouteAvailable || releasedPackageAvailable;
  const state = available ? "ready" : status.google.publicState === "ready" ? "unavailable" : status.google.publicState;
  const reason = !selectedRouteIsPrimary
    ? "The selected named-road sequence is available in BrineSearch only."
    : exactRouteDisplayed
      ? "Use the BrineSearch map and named-road steps; no single Google Maps handoff is available."
      : "No reviewed named-road Google handoff is available.";
  return {
    available,
    state,
    routeUrl: statusRouteAvailable ? status.google.routeUrl : releasedPackageAvailable ? releasedRouteUrl : null,
    reason,
    mode: available
      ? status.route.source === "exact_graph_handoff" && statusRouteAvailable
        ? "exact_core_destination"
        : "exact_full_route"
      : null,
    approachLabel: null,
    finalLegMode: null,
    selectionRequired: false,
    selectedRouteIsPrimary,
  };
}

export type FixedNavigationAction =
  | { kind: "approved_route"; href: string; title: string; detail: string; ariaLabel: string }
  | { kind: "reviewed_route"; href: string; title: string; detail: string; ariaLabel: string }
  | { kind: "destination_pin"; href: string; title: string; detail: string; ariaLabel: string }
  | { kind: "unavailable"; href: null; title: string; detail: string; ariaLabel: string };

export function buildFixedNavigationAction(
  view: GoogleHandoffView,
  pad: PadSummary,
  reviewedCandidate: ReviewedNavigationCandidate | null = reviewedNavigationCandidateForPad(pad),
): FixedNavigationAction {
  const googleRouteAction: FixedNavigationAction | null = view.available && view.routeUrl ? {
    kind: "approved_route",
    href: view.routeUrl,
    title: "GET DIRECTIONS",
    detail: view.mode === "named_approach" && view.approachLabel
      ? `${view.approachLabel} · ${view.finalLegMode === "google_to_saved_gps_unapproved" ? "named roads then unnamed access" : "named roads to saved pin"}`
      : view.mode === "exact_core_destination" ? "Named roads then unnamed access" : "Named roads to saved pin",
    ariaLabel: view.mode === "named_approach"
      ? `Navigate ${view.approachLabel} in Google Maps using its reviewed named-road controls${view.finalLegMode === "google_to_saved_gps_unapproved" ? "; final unnamed movement is destination-only" : ""}`
      : view.mode === "exact_core_destination"
      ? "Navigate the reviewed named roads, then continue to the saved GPS destination in Google Maps"
      : "Navigate the reviewed named roads to the saved pin in Google Maps",
  } : null;
  // A selected named approach is itself the pad's reviewed working handoff.
  if (googleRouteAction && view.mode === "named_approach") return googleRouteAction;
  if (view.selectionRequired) {
    const destinationUrl = padDestinationNavigationUrl(pad);
    const destination = trustedPadDestination(pad);
    if (destinationUrl && destination) return {
      kind: "destination_pin",
      href: destinationUrl,
      title: "GET DIRECTIONS",
      detail: `GPS destination only · ${destination.label} · choose an approach for reviewed roads`,
      ariaLabel: `Navigate to the ${destination.label.toLowerCase()} in Google Maps; GPS destination only, or choose one reviewed approach for BrineSearch road guidance`,
    };
    return {
      kind: "unavailable",
      href: null,
      title: "GET DIRECTIONS",
      detail: view.reason,
      ariaLabel: "Choose one reviewed named approach before navigation",
    };
  }
  if (view.selectedRouteIsPrimary && reviewedCandidate) return {
    kind: "reviewed_route",
    href: reviewedCandidate.routeUrl,
    title: "GET DIRECTIONS",
    detail: reviewedCandidate.ownerApproval
      ? `${reviewedCandidate.ownerApproval.evidence === "exact_named_road_identities" ? "Owner-approved named-road directions" : "Owner-approved directions"} in Google Maps · ${reviewedCandidate.detail}`
      : `Owner-reviewed route in Google Maps · ${reviewedCandidate.detail}`,
    ariaLabel: [
      reviewedCandidate.ownerApproval
        ? `Open the owner-approved ${pad.padName} directions in Google Maps`
        : `Open the owner-reviewed ${pad.padName} route in Google Maps`,
      reviewedCandidate.detail,
      reviewedCandidate.finalLegNotice,
      "graph route lines, public Google release, and approved-road overlays remain separate",
    ].filter(Boolean).join("; "),
  };
  // Preserve an already-working record-bound URL byte-for-byte. A later
  // State-1 release does not outrank or silently replace it.
  if (googleRouteAction) return googleRouteAction;
  const destinationUrl = padDestinationNavigationUrl(pad);
  const destination = trustedPadDestination(pad);
  if (destinationUrl && destination) return {
    kind: "destination_pin",
    href: destinationUrl,
    title: "GET DIRECTIONS",
    detail: `GPS destination only · ${destination.label} · no reviewed named-road sequence`,
    ariaLabel: `Navigate to the ${destination.label.toLowerCase()} in Google Maps; GPS destination only because no reviewed named-road sequence is available`,
  };
  return {
    kind: "unavailable",
    href: null,
    title: "GET DIRECTIONS",
    detail: "No trusted GPS destination",
    ariaLabel: "Navigation unavailable because this pad has no explicitly sourced GPS destination",
  };
}

export function FixedNavigateAction({ view, pad }: { view: GoogleHandoffView; pad: PadSummary }) {
  const action = buildFixedNavigationAction(view, pad);
  return <nav className="pad-fixed-navigation" aria-label="Pad navigation">
    {action.href ? <a className={`navigate-action is-${action.kind.replaceAll("_", "-")}`} href={action.href} target="_blank" rel="noreferrer" aria-label={action.ariaLabel} data-navigation-kind={action.kind}>
      <Icon name={action.kind === "approved_route" || action.kind === "reviewed_route" ? "route" : "location"}/>
      <span><strong>{action.title}</strong></span>
      <b aria-hidden="true">↗</b>
    </a> : <button className="navigate-action is-unavailable" type="button" disabled aria-label={action.ariaLabel} data-navigation-kind={action.kind}>
      <Icon name="location"/>
      <span><strong>{action.title}</strong></span>
      <b aria-hidden="true">—</b>
    </button>}
  </nav>;
}

export function ReviewedRouteFallback({ candidate, state }: { candidate: ReviewedNavigationCandidate; state: DriverPadStatus["route"]["state"] }) {
  const sequenceItems = reviewedNavigationSequenceItems(candidate);
  const ownerApproved = Boolean(candidate.ownerApproval);
  const exactNamedRoads = candidate.ownerApproval?.evidence === "exact_named_road_identities";
  return <div className="reviewed-route-fallback">
    <div className="reviewed-route-fallback-heading"><StatusBadge status={ownerApproved ? "ready" : state} label={ownerApproved ? "Owner approved" : undefined}/><strong>{ownerApproved ? exactNamedRoads ? "Owner-approved named-road sequence" : "Owner-approved direction sequence" : "Owner-reviewed sequence"}</strong></div>
    {sequenceItems.length ? <ol className="route-step-list reviewed-route-step-list" aria-label={ownerApproved ? "Owner-approved direction steps" : "Owner-reviewed direction steps"}>{sequenceItems.map((item, index) => <li className="route-step step-road" key={`${index}-${item}`}><span className="step-number">{index + 1}</span><div><strong>{item}</strong></div></li>)}</ol>
      : <p className="reviewed-route-sequence-text">No reviewed road sequence is available.</p>}
    {candidate.finalLegNotice && <p className="reviewed-route-boundary"><Icon name="location"/>{candidate.finalLegNotice}</p>}
  </div>;
}

export function destinationPinUrl(pad: PadSummary) {
  return padDestinationPinUrl(pad);
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
        ? <a className="pad-gps-coordinate-link mono" href={pinUrl} target="_blank" rel="noreferrer" aria-label={`Open ${coordinateText} in Google Maps; destination pin only, no reviewed named-road sequence`}>{coordinateText}</a>
        : <strong className="mono">{coordinateText}</strong>}
      <button type="button" className={`pad-gps-copy-pill${copied ? " is-copied" : ""}`} onClick={copyGps} aria-label={copied ? `${locationLabel} GPS coordinates copied` : `Copy ${locationLabel.toLowerCase()} GPS coordinates`}><span aria-hidden="true">COPY</span></button>
      <span className="pad-gps-copy-status" role="status" aria-live="polite">{copied ? "GPS copied" : ""}</span>
    </div>
    <span className="pad-gps-boundary">{pinUrl ? "GPS destination only · named roads not yet reviewed" : "Display only · no navigation"}</span>
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

export function displayedRouteForChoice(
  status: DriverPadStatus,
  choice: DriverRouteChoice | null,
  namedApproach: DriverNamedApproach | null = null,
  namedSelectionRequired = false,
) {
  if (namedSelectionRequired) return { selectedRouteIsPrimary: false, steps: [], geometry: null };
  if (namedApproach) return {
    selectedRouteIsPrimary: namedApproach.routeGroup === "primary",
    steps: namedApproach.steps,
    geometry: namedApproach.geometry,
  };
  const selectedRouteIsPrimary = !choice || choice.routeGroup === "primary";
  return {
    selectedRouteIsPrimary,
    steps: choice?.routeGroup === "alternate" ? choice.steps : status.routeSteps,
    geometry: choice?.routeGroup === "alternate" ? choice.geometry : status.route.geometry,
  };
}

function approachHoldReason(reason: string) {
  if (reason === "no_exact_last_interstate_us_or_state_highway") return "No exact last Interstate, U.S., or state highway road identity is on file.";
  if (reason === "no_exact_intersection_or_candidate_highway_start") return "No bounded highway start passed the identity and distance checks.";
  if (reason === "candidate_start_lacks_exact_master_last_highway_road_id_anchor") return "No candidate start had exact master last-highway road ID evidence.";
  if (reason === "candidate_start_exceeds_25_air_miles_from_destination") return "The exact last-highway anchor was more than 25 air miles from the saved GPS.";
  if (reason === "all_osrm_candidates_failed") return "No build-time route candidate passed the bounded approach checks.";
  if (reason === "no_routed_section_matches_ordered_exact_master_roads") return "No routed section matched the ordered exact public-road identities.";
  return "The stored approach did not pass the fail-closed display checks.";
}

export function AscentPadApproachDirections({ approach }: { approach: AscentPadApproachRecord }) {
  if (approach.status !== "ROUTED_DISPLAY") return <div className="ascent-approach-hold" role="note">
    <strong>GPS pin only</strong>
    <p>{approachHoldReason(approach.reason)} No candidate line, turn mileage, or route total is shown.</p>
    {approach.structuredRoadSequence && <p><strong>Saved road sequence · text only:</strong> {approach.structuredRoadSequence}</p>}
  </div>;
  return <section className="ascent-measured-approach" aria-label="Measured last-highway approach">
    <header><div><strong>{approach.lastHighway?.displayRoad} → saved GPS</strong><small>{approach.start?.authority === "exact_highway_next_road_intersection" ? "Exact highway-road intersection start" : "Bounded candidate point on the last named highway · not an approved handoff"} · display only</small></div><span>{approach.directions.length} sections</span></header>
    <ol className="route-step-list ascent-approach-step-list">{approach.directions.map((direction) => <li key={direction.directionOrder} className={`route-step${direction.authority !== "named_public_road" ? " is-unapproved" : ""}`}>
      <span className="step-number">{direction.directionOrder}</span>
      <div><strong>{direction.displayName}</strong><p>{direction.instruction}</p><div className="designation-row"><b>{ascentPadApproachDirectionAuthorityLabel(direction)}</b></div></div>
      {direction.distanceMiles !== null && <small>{direction.distanceMiles.toFixed(2)} mi</small>}
    </li>)}</ol>
    <footer>
      <strong>Measured road sections: {approach.mileage.roadDistanceMiles?.toFixed(2)} mi</strong>
      <span>{approach.gpsTether?.nontrivial ? "No total-to-GPS mileage is shown." : "Road-section total only."} The separate straight GPS tether ({approach.gpsTether?.distanceMiles.toFixed(2)} mi) is not road geometry and is excluded.</span>
      <small>Solid teal stops permanently at the first identity mismatch. Everything after that point stays visible as a solid neutral, unapproved line; genuinely unnamed and unverified sections are labeled separately.</small>
    </footer>
  </section>;
}

export function PadPage() {
  const { padId = "" } = useParams();
  const navigate = useNavigate();
  const online = useNetworkState();
  const { findPad, favorites, toggleFavorite, loading, snapshot } = useDirectory();
  const { access } = useOwnerAccess();
  const pad = findPad(decodeURIComponent(padId));
  const [resolvedStatus, setStatus] = useState<DriverPadStatus | null>(null);
  const [releasedHandoff, setReleasedHandoff] = useState<ReleasedGoogleHandoffLoad | undefined>(undefined);
  const [routeChoices, setRouteChoices] = useState<DriverRouteChoice[]>([]);
  const [selectedRouteKey, setSelectedRouteKey] = useState("");
  const [selectedNamedApproachKey, setSelectedNamedApproachKey] = useState("");
  const [loadedWellRows, setLoadedWellRows] = useState<LoadedPadWellRows | null>(null);
  const [ascentPadApproach, setAscentPadApproach] = useState<AscentPadApproachRecord | null>(null);

  useEffect(() => {
    if (!pad) return;
    let cancelled = false;
    setStatus(null);
    setReleasedHandoff(undefined);
    setRouteChoices([]);
    setSelectedRouteKey("");
    setSelectedNamedApproachKey("");
    setLoadedWellRows(null);
    setAscentPadApproach(null);
    const recordKey = `${pad.padId}:${pad.recordRevision}`;
    saveRecent(pad).catch(() => undefined);
    // This optional frozen release supplies an existing promoted link only
    // where no record-bound working handoff exists. Its lookup never closes
    // everyday Navigate and never replaces a working URL.
    loadReleasedGoogleHandoff(pad).then((result) => {
      if (!cancelled) setReleasedHandoff(result);
    });
    if (online) {
      readPadDirectionsOffline(pad).then((cached) => {
        if (!cancelled && cached) setStatus((current) => current || cached);
      });
    }
    loadPadStatus(pad, snapshot?.sourceState).then((next) => {
      if (cancelled) return;
      setStatus(next);
      const namedApproaches = next.namedApproaches || [];
      setSelectedNamedApproachKey(namedApproaches.length === 1 ? namedApproaches[0].approachKey : "");
      if (!namedApproaches.length && online && next.dataState === "live" && next.route.state === "ready" && next.route.source === "exact_graph" && next.graph.state === "active_current") {
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
    if (pad.company === "Ascent") {
      loadAscentPadApproachForPad(pad).then((approach) => {
        if (!cancelled) setAscentPadApproach(approach);
      });
    }
    return () => { cancelled = true; };
  }, [online, pad, snapshot?.sourceState]);

  if (loading) return <LoadingState message="Loading pad details…"/>;
  if (!pad) return <section className="page-state"><h1>Pad not found</h1><p>This link may refer to a removed or superseded record.</p><Link to="/search" className="button-primary">Return to Search</Link></section>;
  const currentResolvedStatus = currentStatusForPad(resolvedStatus, pad);
  const currentAscentPadApproach = ascentPadApproach?.padId === pad.padId
    && ascentPadApproach.recordRevision === pad.recordRevision
    ? ascentPadApproach
    : null;
  const padRecordKey = `${pad.padId}:${pad.recordRevision}`;
  const wellRows = loadedWellRows?.recordKey === padRecordKey ? loadedWellRows.rows : undefined;
  const status = currentResolvedStatus || buildPendingPadStatus(pad, snapshot?.sourceState);
  const currentRouteChoices = currentResolvedStatus ? routeChoices : [];
  const currentNamedApproaches = currentResolvedStatus?.namedApproaches || [];
  const connectionState = padRouteConnectionState(currentResolvedStatus, online);
  const connectionLabel = connectionState === "offline" ? "Offline" : connectionState === "live" ? "Live" : connectionState === "session-checked" ? "Checked" : connectionState === "saved-reviewed" ? "Saved reviewed" : connectionState === "unavailable" ? "Unavailable" : "Checking";
  const hasSavedReviewedStatus = status.loadProvenance === "device_cache";
  const offlineCacheMiss = !online && !hasSavedReviewedStatus;

  const favorite = favorites.has(pad.padId);
  const ownerVerifyDestination = ownerGoogleVerifyDestination(pad);
  const identifierGroups = buildPadIdentifierGroups(pad);
  const selectedNamedApproach = currentNamedApproaches.length === 1
    ? currentNamedApproaches[0]
    : currentNamedApproaches.find((approach) => approach.approachKey === selectedNamedApproachKey) || null;
  const namedSelectionRequired = currentNamedApproaches.length > 1 && !selectedNamedApproach;
  const selectedRouteChoice = currentNamedApproaches.length
    ? null
    : currentRouteChoices.find((choice) => choice.routeKey === selectedRouteKey) || currentRouteChoices[0] || null;
  const displayedRoute = displayedRouteForChoice(status, selectedRouteChoice, selectedNamedApproach, namedSelectionRequired);
  const selectedRouteIsPrimary = displayedRoute.selectedRouteIsPrimary;
  const displayedRouteSteps = displayedRoute.steps;
  const displayedRouteGeometry = displayedRoute.geometry;
  const displayedMapStatus = selectedNamedApproach ? {
    ...status,
    destination: {
      available: true,
      role: selectedNamedApproach.destination.role,
      latitude: selectedNamedApproach.destination.latitude,
      longitude: selectedNamedApproach.destination.longitude,
    },
  } : status;
  const exactRouteDisplayed = status.route.state === "ready"
    && (status.route.source === "exact_graph" || status.route.source === "exact_graph_handoff")
    && graphStateSupportsRoute(status.route.source, status.graph.state)
    && displayedRouteSteps.length > 0
    && displayedRouteGeometry !== null;
  const currentReleasedHandoffPlan = online ? currentReleasedGoogleHandoff(releasedHandoff, pad) : null;
  const googleHandoff = buildGoogleHandoffView(
    status,
    exactRouteDisplayed,
    selectedRouteIsPrimary,
    currentReleasedHandoffPlan?.singleUrl || null,
    online,
    selectedNamedApproach,
    namedSelectionRequired,
  );
  const reviewedNavigationCandidate = reviewedNavigationCandidateForPad(pad);
  const eligibleReviewedNavigationCandidate = selectedRouteIsPrimary
    && googleHandoff.mode !== "named_approach"
    && !namedSelectionRequired
    ? reviewedNavigationCandidate
    : null;
  // Everyday driver navigation does not wait for State-1 receipt checks. A
  // frozen named-road handoff is immediately usable and remains byte-stable.
  const activeReviewedNavigationCandidate = eligibleReviewedNavigationCandidate;
  const reviewedNavigationSafetyHold = reviewedNavigationSafetyHoldForPad(pad);
  const hasReviewedRouteFallback = !reviewedNavigationSafetyHold && Boolean(activeReviewedNavigationCandidate?.reviewedRoadSequence) && displayedRouteSteps.length === 0;
  const activeAscentPadApproach = !reviewedNavigationSafetyHold
    && !namedSelectionRequired
    && displayedRouteSteps.length === 0
    && !hasReviewedRouteFallback
    ? currentAscentPadApproach
    : null;
  const hasSavedRouteFallback = !reviewedNavigationSafetyHold && !hasReviewedRouteFallback && displayedRouteSteps.length === 0 && Boolean(pad.structuredRoadSequence || status.route.writtenDirections);
  const savedDirectionInputs = savedDirectionReferenceInputs(
    status.route,
    pad.writtenDirections,
  );
  const savedDirectionReference = parseSavedDirectionReference(savedDirectionInputs);
  const hasSavedWrittenDirections = shouldShowSavedWrittenDirections({
    hasSafetyHold: Boolean(reviewedNavigationSafetyHold),
    hasWrittenDirections: Boolean(savedDirectionReference),
  });

  return <article className="pad-page has-fixed-navigation">
    <header className="pad-topbar"><button className="icon-button" onClick={() => navigate(-1)} aria-label="Go back"><Icon name="back"/></button><span>Pad details</span><span className="pad-topbar-spacer" aria-hidden="true"/></header>
    <section className="pad-header-block" aria-labelledby="pad-detail-title">
      <div className="pad-header-primary">
        <section className="pad-hero">
          <div><span className="eyebrow">{pad.recordType === "disposal" ? "DISPOSAL" : "FIELD PAD"}</span><h1 id="pad-detail-title">{pad.padName}</h1><p className="pad-company">{pad.company}</p><PadGpsActions pad={pad}/><div className="pad-header-actions" role="group" aria-label="Pad actions"><button type="button" className={`pad-header-action ${favorite ? "is-favorite" : ""}`} aria-label={favorite ? `Remove ${pad.padName} from saved locations` : `Save ${pad.padName}`} aria-pressed={favorite} onClick={() => toggleFavorite(pad.padId)}><Icon name="saved"/>{favorite ? "Saved" : "Save"}</button><button type="button" className="pad-header-action" aria-label={`Share ${pad.padName}`} onClick={() => navigator.share?.({ title: `${pad.padName} · BrineSearch`, url: location.href }).catch(() => undefined)}><Icon name="share"/>Share</button></div>{access.state === "owner" && ownerVerifyDestination && <Link className="pad-owner-google-verify" to={`/settings/verify-route/${encodeURIComponent(pad.padId)}`}><Icon name="map"/><span><strong>Verify route on free map</strong><small>No paid key · owner draft only · Navigate unchanged</small></span></Link>}</div>
        </section>
        <div className="pad-header-map-slot">
          <PadMapPreview pad={pad} status={displayedMapStatus} routeGeometry={displayedRouteGeometry}/>
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

    {currentNamedApproaches.length > 1 && <section className="driver-route-choice-card" aria-labelledby="driver-named-approach-title">
      <div><span className="eyebrow">REVIEWED APPROACH</span><h2 id="driver-named-approach-title">Choose how you are approaching</h2><p>Each option is a separately reviewed named-road sequence. Choose one before its steps, teal display line, and navigation action are shown.</p></div>
      <div className="driver-route-choice-buttons">{currentNamedApproaches.map((approach) => <button key={approach.approachKey} type="button" className={approach.approachKey === selectedNamedApproach?.approachKey ? "is-selected" : ""} aria-pressed={approach.approachKey === selectedNamedApproach?.approachKey} onClick={() => setSelectedNamedApproachKey(approach.approachKey)}><strong>{approach.approachLabel}</strong><span>{approach.steps.length} exact {approach.steps.length === 1 ? "road step" : "road steps"}{approach.finalLegMode === "google_to_saved_gps_unapproved" ? " · GPS-only final leg" : ""}</span></button>)}</div>
      <small>Google receives only the selected approach's reviewed controls. It does not choose among BrineSearch alternatives.</small>
    </section>}

    {!currentNamedApproaches.length && currentRouteChoices.length > 1 && <section className="driver-route-choice-card" aria-labelledby="driver-route-choice-title">
      <div><span className="eyebrow">APPROVED ROUTE CHOICE</span><h2 id="driver-route-choice-title">Choose the route you want to view</h2><p>Every option shown here independently passed the exact route, current graph, verified destination, and public projection gates.</p></div>
      <div className="driver-route-choice-buttons">{currentRouteChoices.map((choice) => <button key={choice.routeKey} type="button" className={choice.routeKey === selectedRouteChoice?.routeKey ? "is-selected" : ""} aria-pressed={choice.routeKey === selectedRouteChoice?.routeKey} onClick={() => setSelectedRouteKey(choice.routeKey)}><strong>{choice.label}</strong><span>{choice.steps.length} exact {choice.steps.length === 1 ? "road step" : "road steps"}</span></button>)}</div>
      <small>Choosing a route changes the highlighted BrineSearch route. Google publication remains a separate safety gate.</small>
    </section>}

    <section className="route-steps-card">
      <div className="section-heading"><div><span className="eyebrow">ROAD SEQUENCE</span><h2>{reviewedNavigationSafetyHold ? reviewedNavigationSafetyHold.title : displayedRouteSteps.length ? selectedNamedApproach ? `Named roads · ${selectedNamedApproach.approachLabel}` : status.route.source === "exact_graph_handoff" ? "Named roads to handoff" : "Named roads to saved pin" : namedSelectionRequired ? "Choose a reviewed approach" : hasReviewedRouteFallback ? activeReviewedNavigationCandidate?.ownerApproval ? activeReviewedNavigationCandidate.ownerApproval.evidence === "exact_named_road_identities" ? "Owner-approved road sequence" : "Owner-approved directions" : "Reviewed route sequence" : activeAscentPadApproach ? "Last highway to saved GPS" : hasSavedRouteFallback ? "Saved BrineSearch route" : "No structured route"}</h2></div></div>
      {reviewedNavigationSafetyHold ? <div className="inline-warning" role="alert"><Icon name="location"/><strong>{reviewedNavigationSafetyHold.detail}</strong> BILINOVICH navigation is GPS destination only while its replacement route is traced backward from the pad.</div>
        : displayedRouteSteps.length ? <ol className="route-step-list">{displayedRouteSteps.map((step) => <li key={`${step.order}-${step.displayName}`} className={`route-step step-${step.kind}`}><span className="step-number">{step.order}</span><div><strong>{step.displayName}</strong><p>{step.instruction}</p>{(step.verifiedDesignations.length > 0 || semanticLabel(step.kind)) && <div className="designation-row">{step.verifiedDesignations.map((name) => <span key={name}>{name}</span>)}{semanticLabel(step.kind) && <b>{semanticLabel(step.kind)}</b>}</div>}</div>{step.distanceMiles !== null && <small>{step.distanceMiles.toFixed(1)} mi</small>}</li>)}</ol>
        : namedSelectionRequired ? <p className="card-empty">Select one reviewed named approach above. Until then, only GPS destination navigation is available.</p>
        : hasReviewedRouteFallback && activeReviewedNavigationCandidate ? <ReviewedRouteFallback candidate={activeReviewedNavigationCandidate} state={status.route.state}/>
        : activeAscentPadApproach ? <AscentPadApproachDirections approach={activeAscentPadApproach}/>
        : hasSavedRouteFallback ? <div className="readiness-column"><StatusBadge status={status.route.state}/><strong>Legacy saved directions</strong>{pad.structuredRoadSequence && !status.route.writtenDirections && <p>{pad.structuredRoadSequence}</p>}<p>Saved BrineSearch directions remain text. They do not create teal geometry; GPS-only navigation may use Google-selected roads.</p></div>
        : <p className="card-empty">No reviewed named-road sequence is on file. Navigation uses the sourced GPS destination only, and no teal line is inferred.</p>}
      {displayedRouteSteps.length > 0 && (selectedNamedApproach?.finalLegMode === "google_to_saved_gps_unapproved"
        ? <div className="inline-warning" role="note"><Icon name="location"/>The teal named-road display ends at the reviewed handoff. The unnamed final movement to the saved pin is not named or highlighted.</div>
        : status.route.source === "exact_graph_handoff" ? <div className="inline-warning" role="note"><Icon name="location"/>The teal named-road display ends at the reviewed handoff. The saved pad GPS remains the separate destination.</div>
        : null)}
      {hasSavedWrittenDirections && <SavedFieldDirections {...savedDirectionInputs} mayDifferFromReviewedRoute={savedDirectionsNeedReviewedRouteWarning({ reviewedCandidate: activeReviewedNavigationCandidate, displayedRouteStepCount: displayedRouteSteps.length, namedApproach: selectedNamedApproach, hasMeasuredDisplayRoute: activeAscentPadApproach?.status === "ROUTED_DISPLAY" })}/>}
    </section>

    <details className="detail-card pad-readiness-details"><summary><span><strong>Route status</strong><small><b role="status" aria-live="polite" aria-atomic="true">{connectionLabel}</b> · route, graph, and navigation handoff</small></span><span aria-hidden="true">⌄</span></summary>
      <div className="pad-readiness-content">
        <div className={`pad-connection-badge is-${connectionState}`}><span aria-hidden="true"/><strong>{connectionLabel}</strong><small>{connectionState === "live" ? "Completed route check for this pad revision" : connectionState === "session-checked" ? "Completed route check reused for this pad revision" : connectionState === "checking" ? "Checking this route once for the current app session" : hasSavedReviewedStatus ? "Device-stored reviewed route information" : connectionState === "offline" ? "No reviewed route is saved on this device" : "No reviewed route response is available"}</small></div>
        {connectionState !== "live" && connectionState !== "session-checked" && <div className="stale-banner"><Icon name="offline"/><div><strong>{offlineCacheMiss ? "Offline · not cached" : connectionState === "checking" ? "Checking reviewed route status" : connectionState === "unavailable" ? "Route check unavailable" : "Saved reviewed directions"}</strong><span>{offlineCacheMiss ? "Open this pad once while online to save reviewed directions on this device." : connectionState === "unavailable" ? "No live or device-stored route response was found. No route authority was inferred." : `No new route authority was inferred. Saved record update: ${dateLabel(pad.updatedAt)}`}</span></div></div>}
        <div className="section-heading"><div><span className="eyebrow">ROUTE READINESS</span><h2>Current authority</h2></div><span className="readiness-updated">Checked {dateLabel(status.route.lastVerifiedAt)}</span></div>
        <div className="readiness-grid">
          <StatusColumn icon="route" label="ROUTE SOURCE" detail={status.route.safeReason || "BrineSearch route authority."}><StatusBadge status={status.route.state}/><strong>{status.route.source.replaceAll("_", " ")}</strong></StatusColumn>
          <StatusColumn icon="graph" label="ROAD GRAPH" detail={`${status.graph.county || pad.county || "County not listed"} · ${dateLabel(status.graph.lastVerifiedAt)}`}><StatusBadge status={status.graph.state}/><strong>{status.graph.publicSource || "Public graph status"}</strong></StatusColumn>
          <StatusColumn icon="google" label="GOOGLE HANDOFF" detail={activeReviewedNavigationCandidate ? activeReviewedNavigationCandidate.finalLegNotice || "Reviewed mobile directions are available now. State-1 graph and public-Google authority remain separate." : googleHandoff.available ? "One reviewed named-road handoff is bound to this exact pad and destination." : googleHandoff.reason}><StatusBadge status={activeReviewedNavigationCandidate ? "ready" : googleHandoff.state} label={activeReviewedNavigationCandidate ? "Named roads ready" : undefined}/><strong>{activeReviewedNavigationCandidate ? "Named-road directions available" : googleHandoff.available ? googleHandoff.approachLabel ? `${googleHandoff.approachLabel} action available` : "Named-road action available" : googleHandoff.selectionRequired ? "Choose a reviewed approach" : "No reviewed named-road handoff"}</strong></StatusColumn>
        </div>
      </div>
    </details>
    <details className="detail-card"><summary><span><strong>Data source and freshness</strong><small>Record status, identity, coordinate role, and revision</small></span><span>⌄</span></summary><div className="detail-grid"><div><small>Operating status</small><strong>{pad.operatingStatus || "Not listed"}</strong></div><div><small>Record ID</small><strong className="mono">{pad.canonicalId || pad.legacyId || pad.padId}</strong></div><div><small>Record revision</small><strong>{pad.recordRevision}</strong></div><div><small>Map coordinate</small><strong>{mapDisplayCoordinateLabel(pad)}</strong></div><div><small>Google handoff state</small><strong>{googleHandoff.state.replaceAll("_", " ")}</strong></div></div></details>
    <p className="safety-footer">BrineSearch route data does not guarantee present road, weather, gate, or site conditions. Follow company and field safety requirements.</p>
    <FixedNavigateAction view={googleHandoff} pad={pad}/>
  </article>;
}
