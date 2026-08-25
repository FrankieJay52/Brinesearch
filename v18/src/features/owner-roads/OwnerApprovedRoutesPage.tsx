import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  type MapMouseEvent,
  type StyleSpecification,
} from "maplibre-gl";
import { Link } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { LoadingState } from "@/components/LoadingState";
import { useDirectory } from "@/data/DirectoryContext";
import { useOwnerAccess } from "@/data/OwnerAccessContext";
import { authorizeCompanyRoadOverlayRelease } from "@/data/companyRoads";
import { loadPadStatus } from "@/data/status";
import type { DriverPadStatus } from "@/data/types";
import {
  loadOwnerPadOptions,
  loadOwnerRoadDetail,
  loadOwnerRoadViewport,
  ownerRoadClasses,
  ownerRoadStatuses,
  type OwnerPadOption,
  type OwnerRoadBounds,
  type OwnerRoadClass,
  type OwnerRoadDetail,
  type OwnerRoadFeature,
  type OwnerRoadStatus,
} from "@/data/ownerRoads";
import {
  ownerRoadCollection,
  ownerRoadCompanyOptions,
  ownerRoadCoverage,
  ownerRoadFeatureBounds,
  ownerRoadFeaturesBounds,
  ownerRoadFeatureLimit,
  ownerRoadJurisdiction,
  ownerRoadPadOptions,
  ownerRoadPadSearchResults,
  ownerRoadRouteLabel,
  ownerRoadSelection,
  ownerRoadStateCode,
  ownerRoadStatusColors,
  ownerRoadStatusLabels,
  ownerRoadViewportRequestKey,
} from "./ownerRoadMapModel";
import "./owner-approved-routes.css";

const mapStyle = import.meta.env.VITE_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty";
const fallbackMapStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "owner-map-offline-background", type: "background", paint: { "background-color": "#102938" } }],
};
const sourceId = "brinesearch-owner-roads";
const roadCasingLayerId = "brinesearch-owner-roads-casing";
const roadLayerId = "brinesearch-owner-roads-line";
const selectedPadHaloLayerId = "brinesearch-owner-pad-road-halo";
const selectedPadLayerId = "brinesearch-owner-pad-road-line";
const selectedHaloLayerId = "brinesearch-owner-road-selected-halo";
const selectedLayerId = "brinesearch-owner-road-selected";
const padSourceId = "brinesearch-owner-selected-pad";
const padLayerId = "brinesearch-owner-selected-pad-marker";
const fullscreenFadeSourceId = "brinesearch-owner-fullscreen-fade";
const fullscreenFadeLayerId = "brinesearch-owner-fullscreen-fade-layer";
const defaultCenter: [number, number] = [-80.72, 40.05];
const defaultStatuses = new Set<OwnerRoadStatus>(ownerRoadStatuses);
const viewportMoveDelay = 240;
const viewportRequestTimeout = 15_000;
const roadResultPageSize = 60;

const roadClassLabels: Record<OwnerRoadClass, string> = {
  interstate: "Interstate",
  us_route: "U.S. Route",
  state_route: "State route",
  county: "County road",
  township: "Township road",
  municipal: "Municipal road",
  local: "Local road",
  ramp: "Ramp",
  other: "Other",
};

const routeSystemOptions = [
  ["1", "Interstate · Ohio"], ["IR", "Interstate · West Virginia"],
  ["2", "U.S. Route · Ohio"], ["US", "U.S. Route · West Virginia"],
  ["3", "State route · Ohio"], ["SR", "State route · West Virginia"],
  ["PennDOT NLF", "State route · Pennsylvania"],
] as const;

type MapState = "starting" | "loading" | "ready" | "warning" | "error";

function colorExpression() {
  return [
    "match", ["get", "approvalStatus"],
    "approved_by_policy", ownerRoadStatusColors.approved_by_policy,
    "explicitly_approved", ownerRoadStatusColors.explicitly_approved,
    "candidate", ownerRoadStatusColors.candidate,
    "held", ownerRoadStatusColors.held,
    "restricted", ownerRoadStatusColors.restricted,
    ownerRoadStatusColors.reference_only,
  ] as never;
}

function emptyCollection() {
  return { type: "FeatureCollection" as const, features: [] };
}

function ensureOwnerRoadLayers(map: MapLibreMap) {
  if (!map.getSource(sourceId)) map.addSource(sourceId, { type: "geojson", data: emptyCollection() });
  if (!map.getSource(padSourceId)) map.addSource(padSourceId, { type: "geojson", data: emptyCollection() });
  const before = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
  if (!map.getLayer(roadCasingLayerId)) map.addLayer({
    id: roadCasingLayerId,
    type: "line",
    source: sourceId,
    paint: { "line-color": "rgba(5, 14, 23, .86)", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 4, 14, 8, 18, 12] as never, "line-opacity": .95 },
    layout: { "line-cap": "round", "line-join": "round" },
  }, before);
  if (!map.getLayer(roadLayerId)) map.addLayer({
    id: roadLayerId,
    type: "line",
    source: sourceId,
    paint: { "line-color": colorExpression(), "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2, 14, 4.5, 18, 7] as never, "line-opacity": ["case", ["==", ["get", "approvalStatus"], "reference_only"], .55, .9] as never },
    layout: { "line-cap": "round", "line-join": "round" },
  }, before);
  const padFocus = ["==", ["get", "padFocused"], true] as never;
  if (!map.getLayer(selectedPadHaloLayerId)) map.addLayer({
    id: selectedPadHaloLayerId,
    type: "line",
    source: sourceId,
    filter: padFocus,
    paint: { "line-color": "rgba(255,255,255,.96)", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 8, 14, 13, 18, 18] as never, "line-opacity": .96 },
    layout: { "line-cap": "round", "line-join": "round" },
  }, before);
  if (!map.getLayer(selectedPadLayerId)) map.addLayer({
    id: selectedPadLayerId,
    type: "line",
    source: sourceId,
    filter: padFocus,
    paint: { "line-color": "#62ddc6", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 8, 18, 12] as never, "line-opacity": 1 },
    layout: { "line-cap": "round", "line-join": "round" },
  }, before);
  const noSelection = ["==", ["get", "identityId"], ""] as never;
  if (!map.getLayer(selectedHaloLayerId)) map.addLayer({
    id: selectedHaloLayerId,
    type: "line",
    source: sourceId,
    filter: noSelection,
    paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 9, 14, 15, 18, 20] as never, "line-opacity": .96 },
    layout: { "line-cap": "round", "line-join": "round" },
  }, before);
  if (!map.getLayer(selectedLayerId)) map.addLayer({
    id: selectedLayerId,
    type: "line",
    source: sourceId,
    filter: noSelection,
    paint: { "line-color": "#ffbe3d", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 9, 18, 13] as never, "line-opacity": 1 },
    layout: { "line-cap": "round", "line-join": "round" },
  }, before);
  if (!map.getLayer(padLayerId)) map.addLayer({
    id: padLayerId,
    type: "circle",
    source: padSourceId,
    paint: { "circle-radius": 8, "circle-color": "#62ddc6", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 },
  }, before);
}

function syncFullscreenPresentation(map: MapLibreMap, fullscreen: boolean) {
  if (fullscreen) {
    if (!map.getSource(fullscreenFadeSourceId)) map.addSource(fullscreenFadeSourceId, {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] },
      },
    });
    if (!map.getLayer(fullscreenFadeLayerId)) map.addLayer({
      id: fullscreenFadeLayerId,
      type: "fill",
      source: fullscreenFadeSourceId,
      paint: { "fill-color": getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#07131f", "fill-opacity": .5 },
    });
    for (const layerId of [roadCasingLayerId, roadLayerId, selectedPadHaloLayerId, selectedPadLayerId, selectedHaloLayerId, selectedLayerId, padLayerId]) {
      if (map.getLayer(layerId)) map.moveLayer(layerId);
    }
    return;
  }
  if (map.getLayer(fullscreenFadeLayerId)) map.removeLayer(fullscreenFadeLayerId);
  if (map.getSource(fullscreenFadeSourceId)) map.removeSource(fullscreenFadeSourceId);
  const before = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
  for (const layerId of [roadCasingLayerId, roadLayerId, selectedPadHaloLayerId, selectedPadLayerId, selectedHaloLayerId, selectedLayerId, padLayerId]) {
    if (map.getLayer(layerId)) map.moveLayer(layerId, before);
  }
}

function syncRoadFeatures(map: MapLibreMap, features: OwnerRoadFeature[], padFocused = false) {
  if (!map.getSource(sourceId)) return;
  (map.getSource(sourceId) as GeoJSONSource).setData(ownerRoadCollection(features, padFocused));
}

function syncSelectedRoad(map: MapLibreMap, identityId: string | null) {
  const filter = ["==", ["get", "identityId"], identityId || ""] as never;
  if (map.getLayer(selectedHaloLayerId)) map.setFilter(selectedHaloLayerId, filter);
  if (map.getLayer(selectedLayerId)) map.setFilter(selectedLayerId, filter);
}

function syncSelectedPad(map: MapLibreMap, pad: OwnerPadOption | null) {
  const data = pad && pad.latitude !== null && pad.longitude !== null ? {
    type: "FeatureCollection" as const,
    features: [{ type: "Feature" as const, properties: { padId: pad.padId, padName: pad.padName }, geometry: { type: "Point" as const, coordinates: [pad.longitude, pad.latitude] } }],
  } : emptyCollection();
  if (map.getSource(padSourceId)) (map.getSource(padSourceId) as GeoJSONSource).setData(data);
}

function fitRoadBounds(map: MapLibreMap, bounds: OwnerRoadBounds) {
  const samePoint = Math.abs(bounds.east - bounds.west) < .00001 && Math.abs(bounds.north - bounds.south) < .00001;
  if (samePoint) map.easeTo({ center: [bounds.west, bounds.south], zoom: Math.max(map.getZoom(), 15), duration: 280 });
  else map.fitBounds(new LngLatBounds([bounds.west, bounds.south], [bounds.east, bounds.north]), { padding: 72, maxZoom: 16, duration: 300 });
}

function formatDate(value: string | null) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Unavailable";
}

function connectedRoadLabel(road: OwnerRoadDetail["junctions"][number]["connectedRoads"][number]) {
  const route = [road.routeSystem, road.routeNumber].filter(Boolean).join(" ");
  const jurisdiction = [road.stateCode, road.countyName || road.countyCode, road.township, road.municipality].filter(Boolean).join(" · ");
  return [road.roadNameAtJunction || road.displayName, route || road.roadClass.replaceAll("_", " "), jurisdiction].filter(Boolean).join(" — ");
}

function ConnectedPadList({ pads, onChoosePad, compact = false }: {
  pads: OwnerRoadDetail["pads"];
  onChoosePad: (padId: string) => void;
  compact?: boolean;
}) {
  const groups = [...pads.reduce((grouped, pad) => {
    const company = pad.company.trim() || "Company unavailable";
    const companyPads = grouped.get(company) || [];
    companyPads.push(pad);
    grouped.set(company, companyPads);
    return grouped;
  }, new Map<string, OwnerRoadDetail["pads"]>())]
    .sort(([left], [right]) => left.localeCompare(right));
  if (!groups.length) return <p>No current saved pad-route use.</p>;
  return <div className={`owner-road-pad-groups${compact ? " is-compact" : ""}`}>{groups.map(([company, companyPads]) => <section key={company}>
    <header><strong>{company}</strong><small>{companyPads.length} connected {companyPads.length === 1 ? "pad" : "pads"}</small></header>
    <ul>{companyPads.sort((left, right) => left.padName.localeCompare(right.padName) || left.padId.localeCompare(right.padId)).map((pad) => <li key={pad.padId}>
      <span><strong>{pad.padName}</strong><small>{pad.occurrenceCount} exact saved route {pad.occurrenceCount === 1 ? "step" : "steps"}</small></span>
      <span className="owner-road-pad-actions"><button type="button" onClick={() => onChoosePad(pad.padId)}>Show roads</button><Link to={`/pad/${pad.padId}`}>Pad card</Link></span>
    </li>)}</ul>
  </section>)}</div>;
}

function FullscreenRoadInspector({ detail, displayFeature, loading, error, onClose, onChoosePad }: {
  detail: OwnerRoadDetail | null;
  displayFeature: OwnerRoadFeature | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onChoosePad: (padId: string) => void;
}) {
  const road = detail || displayFeature?.properties || null;
  return <aside className="owner-map-road-inspector" aria-label="Selected exact road and connected pads">
    <header>
      <span><small>SELECTED EXACT ROAD</small><strong>{road?.displayName || "Loading road…"}</strong></span>
      <button type="button" onClick={onClose} aria-label="Close selected road details"><Icon name="close"/></button>
    </header>
    {road && <span className={`owner-road-status status-${road.approvalStatus}`}>{ownerRoadStatusLabels[road.approvalStatus]}</span>}
    {loading && <p>Loading exact connected pads…</p>}
    {error && <p className="is-error" role="alert">{error}</p>}
    {detail && <>
      <p>{ownerRoadJurisdiction(detail)} · {detail.sourceIdentityKey}</p>
      <div className="owner-map-connected-heading"><strong>Pads connected by saved exact route use</strong><small>{detail.pads.length} {detail.pads.length === 1 ? "pad" : "pads"}</small></div>
      <ConnectedPadList pads={detail.pads} onChoosePad={onChoosePad} compact/>
      <small className="owner-map-road-proof">Connections come only from the exact saved route occurrence returned for this road. Proximity and name matching are not used.</small>
    </>}
  </aside>;
}

function OwnerRoadDetails({ detail, displayFeature, loading, error, onFocus, onChoosePad }: { detail: OwnerRoadDetail | null; displayFeature: OwnerRoadFeature | null; loading: boolean; error: string | null; onFocus: (bounds: OwnerRoadBounds) => void; onChoosePad: (padId: string) => void }) {
  const [copyNotice, setCopyNotice] = useState("");
  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyNotice(`${label} copied.`);
      window.setTimeout(() => setCopyNotice(""), 1_500);
    } catch {
      setCopyNotice("Clipboard unavailable. Select the value and copy it manually.");
    }
  };
  if (loading) return <div className="owner-road-detail-state">Loading exact road details…</div>;
  if (error) return <div className="owner-road-detail-state is-error" role="alert">{error}</div>;
  if (!detail) return <div className="owner-road-detail-state">Select a map line or road result to highlight its exact authoritative identity.</div>;
  return <article className="owner-road-detail-card">
    <header>
      <div><span className={`owner-road-status status-${detail.approvalStatus}`}>{ownerRoadStatusLabels[detail.approvalStatus]}</span><h2>{detail.displayName}</h2><p>{ownerRoadJurisdiction(detail)}</p></div>
      <button type="button" className="button-secondary" onClick={() => detail.bounds && onFocus(detail.bounds)} disabled={!detail.bounds}>Focus map</button>
    </header>
    <section className="owner-road-identity-callout">
      <span>Exact official identity</span><code>{detail.sourceIdentityKey}</code>
      <button type="button" onClick={() => copy(detail.sourceIdentityKey, "Identity")}>Copy identity</button>
    </section>
    {displayFeature?.properties.displayBoundary === "pad_endpoint_projection" && <p className="owner-road-detail-boundary">
      <strong>Selected-pad display boundary:</strong> {displayFeature.properties.displayName} stops at this pad&apos;s exact-road projection, {Math.round(displayFeature.properties.endpointOffsetMeters || 0)} m from its GPS marker. This Candidate line does not extend approval, route, graph, or Google authority.
    </p>}
    {copyNotice && <p className="owner-copy-notice" role="status">{copyNotice}</p>}
    <dl className="owner-road-detail-grid">
      <dt>Canonical name</dt><dd>{detail.canonicalName || "No verified canonical mapping"}</dd>
      <dt>Aliases</dt><dd>{detail.aliases.join(", ") || "None recorded"}</dd>
      <dt>Structured route</dt><dd>{detail.routeDesignation || "No exact structured route designation"}</dd>
      <dt>Road type</dt><dd>{roadClassLabels[detail.roadClass]}</dd>
      <dt>Approval basis</dt><dd>{detail.approvalBasis}</dd>
      <dt>Access / drivable</dt><dd>{detail.publicAccessStatus} / {detail.drivableStatus}</dd>
      <dt>Truck evidence</dt><dd>{detail.truckStatus || "No positive exact truck-route evidence"}</dd>
      <dt>Restriction</dt><dd>{detail.restrictionSummary || "None in exact evidence"}</dd>
      <dt>Held warning</dt><dd>{detail.holdSummary || "None"}</dd>
      <dt>Geometry</dt><dd>{detail.geometryStatus} · {detail.geometrySegmentCount.toLocaleString()} source segment{detail.geometrySegmentCount === 1 ? "" : "s"}</dd>
      <dt>Source</dt><dd>{[detail.sourceAgency, detail.sourceDataset, detail.sourceVersion].filter(Boolean).join(" · ")}</dd>
      <dt>Source record</dt><dd>{detail.sourceRecordIds.join(", ") || "Unavailable"}</dd>
      <dt>Current graph</dt><dd>{detail.graphSummary || "No release-current graph for this county"}</dd>
      <dt>Verified / sourced</dt><dd>{formatDate(detail.verificationDate)}</dd>
    </dl>
    <section className="owner-road-related">
      <h3>Pads using this exact road</h3>
      <ConnectedPadList pads={detail.pads} onChoosePad={onChoosePad}/>
    </section>
    <section className="owner-road-related">
      <header><h3>Release-current physical junctions</h3><small>{detail.knownPhysicalJunctions.toLocaleString()} known{detail.junctionsTruncated ? " · first 100 returned" : ""}</small></header>
      {detail.junctions.length ? <ul>{detail.junctions.map((junction) => <li key={junction.junctionId}>
        <button type="button" onClick={() => copy(`${junction.latitude.toFixed(7)}, ${junction.longitude.toFixed(7)}`, "Junction coordinates")}>{junction.latitude.toFixed(7)}, {junction.longitude.toFixed(7)}</button>
        <small>{junction.connectedRoads.map(connectedRoadLabel).join("; ") || "No connected-road identity available"}</small>
      </li>)}</ul> : <p>No release-current physical junctions are available for this identity.</p>}
    </section>
  </article>;
}

function AccessBoundary({ state, message, onRefresh }: { state: "signed_out" | "denied" | "error"; message: string; onRefresh: () => void }) {
  return <section className="content-page owner-routes-access-page">
    <header className="subpage-topbar"><Link to="/settings" className="icon-button" aria-label="Back to Settings"><Icon name="back"/></Link><span>Approved Routes Map</span><span className="topbar-spacer"/></header>
    <section className="feature-hold-card owner-routes-access-card">
      <Icon name="control"/>
      <span className="eyebrow">OWNER ONLY</span>
      <h1>{state === "signed_out" ? "Sign in before opening the road map" : state === "denied" ? "Owner access is required" : "Owner access is unavailable"}</h1>
      <p>{message}</p>
      <p className="owner-access-separation">Authentication stays inside V18. After a successful sign-in, you return directly to this map with its normal Back path intact.</p>
      <div className="owner-access-actions">
        <button type="button" className="button-primary" onClick={onRefresh}><Icon name="update"/> Check access again</button>
        <Link to="/sign-in?next=/settings/approved-routes" className="button-secondary"><Icon name="account"/> {state === "signed_out" ? "Sign in to V18" : "Owner account"}</Link>
      </div>
    </section>
  </section>;
}

export function OwnerApprovedRoutesPage() {
  const { access, refresh } = useOwnerAccess();
  const { snapshot } = useDirectory();
  const [features, setFeatures] = useState<OwnerRoadFeature[]>([]);
  const [protectedPads, setProtectedPads] = useState<OwnerPadOption[]>([]);
  const [selectedIdentityId, setSelectedIdentityId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OwnerRoadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedPadStatus, setSelectedPadStatus] = useState<DriverPadStatus | null>(null);
  const [selectedPadStatusLoading, setSelectedPadStatusLoading] = useState(false);
  const [stateFilter, setStateFilter] = useState<"OH" | "WV" | "PA" | "">("OH");
  const [countyFilter, setCountyFilter] = useState("");
  const [search, setSearch] = useState("");
  const [routeSystem, setRouteSystem] = useState("");
  const [padId, setPadId] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [padSearch, setPadSearch] = useState("");
  const [padPickerOpen, setPadPickerOpen] = useState(false);
  const [roadClasses, setRoadClasses] = useState<Set<OwnerRoadClass>>(() => new Set(ownerRoadClasses));
  const [statuses, setStatuses] = useState<Set<OwnerRoadStatus>>(() => new Set(defaultStatuses));
  const [mapState, setMapState] = useState<MapState>("starting");
  const [mapMessage, setMapMessage] = useState("Starting the owner road map…");
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [viewportTruncated, setViewportTruncated] = useState(false);
  const [visibleRoadLimit, setVisibleRoadLimit] = useState(roadResultPageSize);
  const [viewerReleaseBusy, setViewerReleaseBusy] = useState(false);
  const [viewerReleaseNotice, setViewerReleaseNotice] = useState("");
  const [viewerReleaseError, setViewerReleaseError] = useState(false);
  const mapHost = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const featuresRef = useRef<OwnerRoadFeature[]>([]);
  const selectedIdentityRef = useRef<string | null>(null);
  const selectedPadRef = useRef<OwnerPadOption | null>(null);
  const requestRef = useRef(0);
  const viewportController = useRef<AbortController | null>(null);
  const viewportInFlightKeyRef = useRef<string | null>(null);
  const viewportLoadedKeyRef = useRef<string | null>(null);
  const viewportMoveTimerRef = useRef<number | null>(null);
  const mapReadyRef = useRef(false);
  const selectedPadIdRef = useRef("");
  const fittedPadRef = useRef<string | null>(null);
  const fullscreenRef = useRef(false);
  const loadViewportRef = useRef<((force?: boolean) => void) | null>(null);
  const selectRoadRef = useRef<((identityId: string, focus: boolean) => void) | null>(null);

  featuresRef.current = features;
  selectedIdentityRef.current = selectedIdentityId;
  selectedPadIdRef.current = padId;
  fullscreenRef.current = mapFullscreen;

  const pads = useMemo(() => ownerRoadPadOptions(snapshot?.rows || [], protectedPads), [protectedPads, snapshot]);
  const companies = useMemo(() => ownerRoadCompanyOptions(pads), [pads]);
  const padSearchResults = useMemo(() => ownerRoadPadSearchResults(pads, companyFilter, padSearch), [companyFilter, padSearch, pads]);
  const directoryById = useMemo(() => new Map((snapshot?.rows || []).flatMap((pad) => pad.canonicalId ? [[pad.canonicalId, pad] as const] : [])), [snapshot]);
  const selectedPad = useMemo(() => pads.find((pad) => pad.padId === padId) || null, [padId, pads]);
  const selectedDirectoryPad = directoryById.get(padId) || null;
  const selectedFeature = useMemo(() => features.find((feature) => feature.properties.identityId === selectedIdentityId) || null, [features, selectedIdentityId]);
  const coverage = useMemo(() => ownerRoadCoverage(features), [features]);
  const protectedPadIds = useMemo(() => new Set(protectedPads.map((pad) => pad.padId)), [protectedPads]);
  selectedPadRef.current = selectedPad;

  const clearRoads = useCallback((message: string) => {
    requestRef.current += 1;
    viewportController.current?.abort();
    viewportController.current = null;
    viewportInFlightKeyRef.current = null;
    viewportLoadedKeyRef.current = null;
    setFeatures([]);
    setViewportTruncated(false);
    setSelectedIdentityId(null);
    if (mapRef.current?.getSource(sourceId)) syncRoadFeatures(mapRef.current, [], Boolean(selectedPadIdRef.current));
    if (mapRef.current) syncSelectedRoad(mapRef.current, null);
    setMapState("warning");
    setMapMessage(message);
  }, []);

  const loadViewport = useCallback(async (force = false) => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current || access.state !== "owner") return;
    if (!roadClasses.size) return clearRoads("Choose at least one road type. Nothing was inferred.");
    if (!statuses.size) return clearRoads("Choose at least one approval status. Nothing was inferred.");
    const bounds = map.getBounds();
    const request = {
      west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth(),
      zoom: Math.max(0, Math.min(19, Math.round(map.getZoom()))),
      state: stateFilter || null,
      county: countyFilter.trim() || null,
      roadClasses: [...roadClasses],
      routeSystems: routeSystem ? [routeSystem] : null,
      statuses: [...statuses],
      search: search.trim() || null,
      padId: padId || null,
      limit: ownerRoadFeatureLimit(map.getContainer().clientWidth),
    } satisfies Parameters<typeof loadOwnerRoadViewport>[0];
    const requestKey = ownerRoadViewportRequestKey(request);
    if (viewportInFlightKeyRef.current === requestKey || !force && viewportLoadedKeyRef.current === requestKey) return;
    const sequence = ++requestRef.current;
    viewportController.current?.abort();
    const controller = new AbortController();
    viewportController.current = controller;
    viewportInFlightKeyRef.current = requestKey;
    let timedOut = false;
    const requestTimeout = window.setTimeout(() => {
      if (sequence === requestRef.current && viewportController.current === controller) {
        timedOut = true;
        controller.abort();
      }
    }, viewportRequestTimeout);
    setMapState("loading");
    setMapMessage(featuresRef.current.length
      ? `Refreshing ${featuresRef.current.length.toLocaleString()} exact road identities…`
      : "Loading exact current road identities…");
    try {
      const viewport = await loadOwnerRoadViewport(request, controller.signal);
      if (sequence !== requestRef.current) return;
      viewportLoadedKeyRef.current = requestKey;
      setFeatures(viewport.features);
      setViewportTruncated(viewport.truncated);
      syncRoadFeatures(map, viewport.features, Boolean(padId));
      const nextSelection = ownerRoadSelection(viewport.features, selectedIdentityRef.current);
      if (nextSelection !== selectedIdentityRef.current) setSelectedIdentityId(nextSelection);
      syncSelectedRoad(map, nextSelection);
      const selectedName = viewport.features.find((feature) => feature.properties.identityId === nextSelection)?.properties.displayName;
      if (padId && viewport.features.length && fittedPadRef.current !== padId) {
        const routeBounds = ownerRoadFeaturesBounds(viewport.features);
        if (routeBounds) {
          fittedPadRef.current = padId;
          fitRoadBounds(map, routeBounds);
        }
      }
      if (viewport.zoomRequired) {
        setMapState("warning"); setMapMessage(`Zoom to level ${viewport.zoomRequired} or closer to load roads.`);
      } else if (viewport.truncated) {
        setMapState("warning"); setMapMessage(`Showing ${viewport.features.length.toLocaleString()} exact identities. Zoom in or narrow the filters.${padId ? " Selected-location graph roads are emphasized only where exact geometry was returned." : ""}`);
      } else if (!viewport.features.length) {
        setMapState("warning"); setMapMessage(padId
          ? "No exact graph-mapped road identity is available for this location in the current view. Reviewed directions remain display-only."
          : "No matching exact road identities are in this map view.");
      } else {
        const graphLabel = stateFilter === "OH" ? "Ohio graph road" : "exact graph road";
        setMapState("ready"); setMapMessage(padId
          ? `${viewport.features.length.toLocaleString()} ${graphLabel} ${viewport.features.length === 1 ? "identity" : "identities"} highlighted for the selected location in this view.${selectedName ? ` ${selectedName} has the gold inspection focus.` : ""}`
          : `${viewport.features.length.toLocaleString()} exact road ${viewport.features.length === 1 ? "identity" : "identities"} loaded in this view.${selectedName ? ` ${selectedName} is selected and highlighted.` : ""}`);
      }
    } catch (error) {
      if (sequence !== requestRef.current || mapRef.current !== map) return;
      if (timedOut) {
        viewportLoadedKeyRef.current = null;
        setMapState("error");
        setMapMessage("The exact-road request took too long. Move closer or tap Refresh view.");
        return;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        viewportLoadedKeyRef.current = null;
        setMapState("warning");
        setMapMessage("The exact-road request was interrupted. Tap Refresh view to try again.");
        return;
      }
      viewportLoadedKeyRef.current = null;
      setFeatures([]);
      setViewportTruncated(false);
      if (map.getSource(sourceId)) syncRoadFeatures(map, [], Boolean(padId));
      setMapState("error");
      setMapMessage(error instanceof Error ? error.message : "Owner road data could not be loaded.");
    } finally {
      window.clearTimeout(requestTimeout);
      if (sequence === requestRef.current) {
        viewportInFlightKeyRef.current = null;
        if (viewportController.current === controller) viewportController.current = null;
      }
    }
  }, [access.state, clearRoads, countyFilter, padId, roadClasses, routeSystem, search, stateFilter, statuses]);
  loadViewportRef.current = (force = false) => { void loadViewport(force); };

  const scheduleViewportLoad = useCallback((delay = viewportMoveDelay) => {
    if (viewportMoveTimerRef.current !== null) window.clearTimeout(viewportMoveTimerRef.current);
    const runWhenIdle = () => {
      if (mapRef.current?.isMoving()) {
        viewportMoveTimerRef.current = window.setTimeout(runWhenIdle, 100);
        return;
      }
      viewportMoveTimerRef.current = null;
      loadViewportRef.current?.();
    };
    viewportMoveTimerRef.current = window.setTimeout(runWhenIdle, delay);
  }, []);

  const selectRoad = useCallback((identityId: string, focus: boolean) => {
    setSelectedIdentityId(identityId);
    const map = mapRef.current;
    if (map) {
      syncSelectedRoad(map, identityId);
      if (focus) {
        const feature = featuresRef.current.find((road) => road.properties.identityId === identityId);
        const bounds = feature ? ownerRoadFeatureBounds(feature) : null;
        if (bounds) fitRoadBounds(map, bounds);
      }
    }
  }, []);
  selectRoadRef.current = selectRoad;

  const clearRoadSelection = useCallback(() => {
    setSelectedIdentityId(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
    if (mapRef.current) syncSelectedRoad(mapRef.current, null);
  }, []);

  const focusLoadedRoads = useCallback(() => {
    const map = mapRef.current;
    const bounds = ownerRoadFeaturesBounds(featuresRef.current);
    if (map && bounds) {
      fitRoadBounds(map, bounds);
      return;
    }
    const pad = selectedPadRef.current;
    if (map && pad?.latitude !== null && pad?.latitude !== undefined && pad.longitude !== null) {
      map.easeTo({ center: [pad.longitude, pad.latitude], zoom: Math.max(map.getZoom(), 13), duration: 280 });
    }
  }, []);

  useEffect(() => {
    setVisibleRoadLimit(roadResultPageSize);
  }, [features]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) {
      if (mapFullscreen) map.cooperativeGestures.disable();
      else map.cooperativeGestures.enable();
      if (mapReadyRef.current) syncFullscreenPresentation(map, mapFullscreen);
    }
    const resizeFrame = window.requestAnimationFrame(() => mapRef.current?.resize());
    if (!mapFullscreen) return () => window.cancelAnimationFrame(resizeFrame);
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMapFullscreen(false);
    };
    window.addEventListener("keydown", exitOnEscape);
    return () => {
      window.cancelAnimationFrame(resizeFrame);
      window.removeEventListener("keydown", exitOnEscape);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
    };
  }, [mapFullscreen]);

  useEffect(() => {
    if (!selectedIdentityId || access.state !== "owner") {
      setDetail(null); setDetailError(null); setDetailLoading(false); return;
    }
    const controller = new AbortController();
    setDetail(null); setDetailError(null); setDetailLoading(true);
    loadOwnerRoadDetail(selectedIdentityId, controller.signal).then(setDetail).catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) setDetailError(error instanceof Error ? error.message : "Road detail could not be loaded.");
    }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [access.state, selectedIdentityId]);

  useEffect(() => {
    let cancelled = false;
    setSelectedPadStatus(null);
    if (access.state !== "owner" || !selectedDirectoryPad) {
      setSelectedPadStatusLoading(false);
      return () => { cancelled = true; };
    }
    setSelectedPadStatusLoading(true);
    loadPadStatus(selectedDirectoryPad, snapshot?.sourceState)
      .then((status) => { if (!cancelled) setSelectedPadStatus(status); })
      .finally(() => { if (!cancelled) setSelectedPadStatusLoading(false); });
    return () => { cancelled = true; };
  }, [access.state, selectedDirectoryPad, snapshot?.sourceState]);

  useEffect(() => {
    if (access.state !== "owner") return;
    const controller = new AbortController();
    loadOwnerPadOptions(controller.signal).then(setProtectedPads).catch(() => setProtectedPads([]));
    return () => controller.abort();
  }, [access.state]);

  useEffect(() => {
    if (access.state !== "owner" || !mapHost.current || mapRef.current) return;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: mapHost.current,
        style: mapStyle,
        center: defaultCenter,
        zoom: 10,
        attributionControl: { compact: true },
        cooperativeGestures: true,
        dragRotate: false,
        touchPitch: false,
        pitchWithRotate: false,
        renderWorldCopies: false,
        fadeDuration: 0,
        trackResize: false,
        pixelRatio: Math.min(Math.max(window.devicePixelRatio || 1, 1), 2),
      });
      map.touchZoomRotate.disableRotation();
    } catch {
      setMapState("error"); setMapMessage("The map renderer could not start. Road results remain fail-closed."); return;
    }
    let styleReady = false;
    let fallbackApplied = false;
    const onStyleLoad = () => {
      styleReady = true;
      try {
        ensureOwnerRoadLayers(map);
        mapReadyRef.current = true;
        syncRoadFeatures(map, featuresRef.current, Boolean(selectedPadIdRef.current));
        syncSelectedRoad(map, selectedIdentityRef.current);
        syncSelectedPad(map, selectedPadRef.current);
        syncFullscreenPresentation(map, fullscreenRef.current);
        setMapMessage(fallbackApplied ? "Basemap unavailable. Exact road overlays remain available on a reference background." : "Map ready. Loading exact current road identities…");
        scheduleViewportLoad(0);
      } catch {
        setMapState("error"); setMapMessage("The exact road layers could not be created. No road geometry was substituted.");
      }
    };
    const onMapError = () => {
      if (!styleReady && !fallbackApplied) {
        fallbackApplied = true;
        setMapState("warning"); setMapMessage("Basemap unavailable. Starting a reference background for exact road overlays…");
        try { map.setStyle(fallbackMapStyle); } catch { setMapState("error"); setMapMessage("The map background could not start. No road geometry was substituted."); }
      }
    };
    const onClick = (event: MapMouseEvent) => {
      if (!map.getLayer(roadLayerId)) return;
      const hit = map.queryRenderedFeatures(event.point, { layers: [selectedLayerId, selectedPadLayerId, roadLayerId], validate: false })[0];
      const identityId = typeof hit?.properties?.identityId === "string" ? hit.properties.identityId : null;
      if (identityId) selectRoadRef.current?.(identityId, false);
    };
    let hoverFrame: number | null = null;
    let hoverPoint: [number, number] | null = null;
    const onMove = (event: MapMouseEvent) => {
      hoverPoint = [event.point.x, event.point.y];
      if (hoverFrame !== null) return;
      hoverFrame = window.requestAnimationFrame(() => {
        hoverFrame = null;
        if (!hoverPoint || !map.getLayer(roadLayerId)) return;
        map.getCanvas().style.cursor = map.queryRenderedFeatures(hoverPoint, { layers: [selectedLayerId, selectedPadLayerId, roadLayerId], validate: false }).length ? "pointer" : "";
      });
    };
    map.on("style.load", onStyleLoad);
    map.on("error", onMapError);
    const onMoveEnd = () => scheduleViewportLoad();
    map.on("moveend", onMoveEnd);
    map.on("click", onClick);
    const hoverEnabled = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (hoverEnabled) map.on("mousemove", onMove);
    map.on("mouseout", () => { map.getCanvas().style.cursor = ""; });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    let observedWidth = 0;
    let observedHeight = 0;
    let resizeFrame: number | null = null;
    const resizeObserver = new ResizeObserver(([entry]) => {
      const width = Math.round(entry?.contentRect.width || 0);
      const height = Math.round(entry?.contentRect.height || 0);
      if (!width || !height || width === observedWidth && height === observedHeight) return;
      observedWidth = width;
      observedHeight = height;
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        map.resize();
      });
    });
    resizeObserver.observe(mapHost.current);
    const styleTimeout = window.setTimeout(onMapError, 8_000);
    mapRef.current = map;
    setMapState("loading");
    return () => {
      window.clearTimeout(styleTimeout);
      if (hoverFrame !== null) window.cancelAnimationFrame(hoverFrame);
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      if (viewportMoveTimerRef.current !== null) window.clearTimeout(viewportMoveTimerRef.current);
      viewportMoveTimerRef.current = null;
      resizeObserver.disconnect();
      mapReadyRef.current = false;
      requestRef.current += 1;
      viewportController.current?.abort();
      viewportController.current = null;
      viewportInFlightKeyRef.current = null;
      viewportLoadedKeyRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [access.state, scheduleViewportLoad]);

  useEffect(() => {
    if (access.state !== "owner" || !mapRef.current || !mapReadyRef.current) return;
    scheduleViewportLoad(search || countyFilter ? 320 : 120);
    return () => {
      if (viewportMoveTimerRef.current !== null) window.clearTimeout(viewportMoveTimerRef.current);
      viewportMoveTimerRef.current = null;
    };
  }, [access.state, countyFilter, padId, roadClasses, routeSystem, scheduleViewportLoad, search, stateFilter, statuses]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.getSource(sourceId)) syncSelectedRoad(map, selectedIdentityId);
  }, [selectedIdentityId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || access.state !== "owner") return;
    syncSelectedPad(map, selectedPad);
    if (selectedPad?.latitude !== null && selectedPad?.latitude !== undefined && selectedPad.longitude !== null) {
      map.easeTo({ center: [selectedPad.longitude, selectedPad.latitude], zoom: 9, duration: 280 });
    }
  }, [access.state, selectedPad]);

  const toggleClass = (roadClass: OwnerRoadClass) => setRoadClasses((current) => {
    const next = new Set(current); if (next.has(roadClass)) next.delete(roadClass); else next.add(roadClass); return next;
  });
  const toggleStatus = (status: OwnerRoadStatus) => setStatuses((current) => {
    const next = new Set(current); if (next.has(status)) next.delete(status); else next.add(status); return next;
  });
  const choosePad = (nextPadId: string) => {
    const nextPad = pads.find((pad) => pad.padId === nextPadId) || null;
    clearRoads(nextPadId ? "Loading exact roads for the selected location…" : "Loading the current exact-road view…");
    setMapState("loading");
    setPadId(nextPadId);
    setPadSearch(nextPad?.padName || "");
    if (nextPad?.company) setCompanyFilter(nextPad.company);
    setPadPickerOpen(false);
    setSelectedIdentityId(null);
    setDetail(null);
    setSelectedPadStatus(null);
    setSelectedPadStatusLoading(Boolean(nextPadId));
    fittedPadRef.current = null;
    if (!nextPadId) return;
    const nextState = ownerRoadStateCode(nextPad?.state || "");
    if (nextState) setStateFilter(nextState);
    // A selected route must show every exact occurrence, including held,
    // restricted, and reference-only evidence. Color continues to state the
    // authority class; visual focus never upgrades approval.
    setStatuses(new Set(ownerRoadStatuses));
  };

  const chooseCompany = (nextCompany: string) => {
    setCompanyFilter(nextCompany);
    setPadSearch("");
    setPadPickerOpen(true);
    if (selectedPad && (!nextCompany || selectedPad.company !== nextCompany)) choosePad("");
  };

  const showAllRoads = () => {
    setCompanyFilter("");
    setPadSearch("");
    setPadPickerOpen(false);
    setSearch("");
    setCountyFilter("");
    setRouteSystem("");
    setRoadClasses(new Set(ownerRoadClasses));
    setStatuses(new Set(ownerRoadStatuses));
    choosePad("");
  };

  const authorizeViewerRelease = async () => {
    setViewerReleaseBusy(true);
    setViewerReleaseError(false);
    setViewerReleaseNotice("Authorizing one bounded approved-road viewer refresh…");
    try {
      const approval = await authorizeCompanyRoadOverlayRelease();
      setViewerReleaseNotice(`Authorized for the current directory until ${formatDate(approval.expiresAt)}. The one-time exact overlay refresh can now run.`);
    } catch (reason) {
      setViewerReleaseError(true);
      setViewerReleaseNotice(reason instanceof Error ? reason.message : "Approved-road viewer authorization failed.");
    } finally {
      setViewerReleaseBusy(false);
    }
  };

  if (access.state === "checking") return <LoadingState message="Checking owner access…"/>;
  if (access.state !== "owner") return <AccessBoundary state={access.state} message={access.message} onRefresh={() => { void refresh(); }}/>;

  return <section className="content-page owner-routes-page">
    <header className="subpage-topbar"><Link to="/settings" className="icon-button" aria-label="Back to Settings"><Icon name="back"/></Link><span>Approved Routes Map</span><Link to="/sign-in?next=/settings/approved-routes" className="owner-account-link" aria-label="Open V18 owner account"><Icon name="account"/> Account</Link></header>
    <header className="owner-routes-hero">
      <div><span className="eyebrow">OWNER SETTINGS</span><h1>Approved Routes Map</h1><p>Inspect exact road identities, approval evidence, restrictions, route use, and release-current junctions. This view cannot edit or publish road truth.</p></div>
      <span className="owner-readonly-badge">READ ONLY</span>
    </header>

    <section className="owner-viewer-release" aria-labelledby="owner-viewer-release-title">
      <Icon name="map"/>
      <div><span className="eyebrow">DRIVER MAP VIEWER</span><h2 id="owner-viewer-release-title">Approved-road display layer</h2><p>The driver viewer uses a separate exact, public-safe snapshot. Authorization lasts 15 minutes and does not approve roads, rebuild graphs, reconcile routes, or publish Google.</p></div>
      <div className="owner-viewer-release-actions"><Link to="/?view=roads" className="button-secondary"><Icon name="expand"/>Open viewer</Link><button type="button" className="button-primary" disabled={viewerReleaseBusy} onClick={() => { void authorizeViewerRelease(); }}><Icon name="control"/>{viewerReleaseBusy ? "Authorizing…" : "Authorize one refresh"}</button></div>
      {viewerReleaseNotice && <p className={`owner-viewer-release-notice${viewerReleaseError ? " is-error" : ""}`} role={viewerReleaseError ? "alert" : "status"}>{viewerReleaseNotice}</p>}
    </section>

    <section className="owner-road-toolbar" aria-label="Owner road map filters">
      <label className="owner-road-search"><span><Icon name="search"/>Road or exact identity</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value.slice(0, 120))} placeholder="Name, route, jurisdiction, source identity…"/></label>
      <label><span>State</span><select value={stateFilter} onChange={(event) => setStateFilter(event.target.value as typeof stateFilter)}><option value="">OH + WV + PA</option><option value="OH">Ohio</option><option value="WV">West Virginia</option><option value="PA">Pennsylvania</option></select></label>
      <label><span>County</span><input value={countyFilter} onChange={(event) => setCountyFilter(event.target.value.slice(0, 100))} placeholder="Code or name"/></label>
      <label><span>Route system</span><select value={routeSystem} onChange={(event) => setRouteSystem(event.target.value)}><option value="">All exact systems</option>{routeSystemOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div className="owner-road-pad-picker" onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPadPickerOpen(false);
      }}>
        <span className="owner-road-pad-picker-label"><Icon name="location"/>Company and exact pad</span>
        <div className="owner-road-pad-picker-fields">
          <label><span>Company</span><select value={companyFilter} onChange={(event) => chooseCompany(event.target.value)} aria-label="Separate pads by company"><option value="">All companies</option>{companies.map((company) => <option key={company} value={company}>{company}</option>)}</select></label>
          <label className="owner-road-pad-search"><span>Search pad</span><input type="search" value={padSearch} onChange={(event) => { setPadSearch(event.target.value.slice(0, 120)); setPadPickerOpen(true); }} onFocus={() => setPadPickerOpen(true)} placeholder="Type a pad name…" role="combobox" aria-autocomplete="list" aria-expanded={padPickerOpen} aria-controls="owner-road-pad-results"/></label>
        </div>
        {padPickerOpen && <div id="owner-road-pad-results" className="owner-road-pad-search-results" role="listbox" aria-label="Exact pad search results">
          {padSearchResults.length ? padSearchResults.map((pad) => {
            const directoryPad = directoryById.get(pad.padId);
            const evidence = protectedPadIds.has(pad.padId) ? "route prep" : directoryPad?.structuredRoadSequence ? "saved sequence" : "directory location";
            return <button key={pad.padId} type="button" role="option" aria-selected={pad.padId === padId} onClick={() => choosePad(pad.padId)}><strong>{pad.padName}</strong><span>{pad.company || "Company unavailable"} · {pad.state || "State unavailable"} · {evidence}</span></button>;
          }) : <p>No pad name contains that exact text for this company.</p>}
          {padSearchResults.length === 12 && <small>Showing the first 12 matches. Type more of the exact pad name to narrow the list.</small>}
        </div>}
        <div className="owner-road-pad-picker-actions">
          <button type="button" className={!padId ? "is-active" : ""} aria-pressed={!padId} onClick={showAllRoads}><Icon name="map"/>All roads in view</button>
          {selectedPad && <span><strong>{selectedPad.padName}</strong><small>{selectedPad.company || "Company unavailable"}</small><button type="button" onClick={() => choosePad("")} aria-label={`Clear ${selectedPad.padName}`}>Clear</button></span>}
        </div>
        <small className="owner-road-pad-picker-proof">Company separates the pad finder. All exact road statuses are included by default. Selecting a pad loads only its exact saved primary-route road evidence; no company route is inferred.</small>
      </div>
      <button type="button" className="button-secondary owner-road-refresh" onClick={() => { void loadViewport(true); }}><Icon name="update"/>Refresh view</button>
    </section>

    <details className="owner-road-layer-filters">
      <summary>Road layers and classifications</summary>
      <div>
        <fieldset><legend>Approval status</legend>{ownerRoadStatuses.map((status) => <label key={status}><input type="checkbox" checked={statuses.has(status)} onChange={() => toggleStatus(status)}/><i style={{ background: ownerRoadStatusColors[status] }}/><span>{ownerRoadStatusLabels[status]}</span></label>)}</fieldset>
        <fieldset><legend>Road type</legend>{ownerRoadClasses.map((roadClass) => <label key={roadClass}><input type="checkbox" checked={roadClasses.has(roadClass)} onChange={() => toggleClass(roadClass)}/><span>{roadClassLabels[roadClass]}</span></label>)}</fieldset>
      </div>
    </details>

    {selectedPad && <section className="owner-pad-route-context" aria-label="Selected location route context">
      <Icon name="route"/>
      <div className="owner-pad-route-body">
        <header>
          <span><strong>{selectedPad.company ? `${selectedPad.company} — ` : ""}{selectedPad.padName}</strong><small>{selectedDirectoryPad ? [selectedDirectoryPad.recordType === "disposal" ? "Disposal" : "Pad", selectedDirectoryPad.county, selectedDirectoryPad.state].filter(Boolean).join(" · ") : selectedPad.state || "Location"}</small></span>
          {selectedDirectoryPad && <Link to={`/pad/${selectedDirectoryPad.padId}`}>Open driver card</Link>}
        </header>
        <div className="owner-pad-route-badges">
          <b className={coverage.identityCount ? "is-ready" : "is-held"}>{coverage.identityCount ? `${coverage.occurrenceCount} mapped route ${coverage.occurrenceCount === 1 ? "occurrence" : "occurrences"} · ${coverage.identityCount} exact ${coverage.identityCount === 1 ? "identity" : "identities"}` : "No exact road evidence in view"}</b>
          <b className={viewportTruncated ? "is-held" : "is-ready"}>{viewportTruncated ? "Map-window limit reached · zoom closer" : "Current map window fully returned"}</b>
          {coverage.endpointCount>0 && <b className="is-ready">{coverage.endpointCount} pad endpoint {coverage.endpointCount === 1 ? "boundary" : "boundaries"} in view</b>}
          <b>{selectedPadStatusLoading ? "Checking reviewed directions…" : selectedPadStatus?.route.writtenDirections ? "Reviewed directions available" : "No reviewed directions published"}</b>
          {selectedPadStatus && <b>Route {selectedPadStatus.route.state.replaceAll("_", " ")} · graph {selectedPadStatus.graph.state.replaceAll("_", " ")}</b>}
        </div>
        {coverage.identityCount>0 && <div className="owner-pad-coverage-check" aria-label="Selected location exact-road coverage check">
          <span>Map-window authority check</span>
          <div>{ownerRoadStatuses.filter((status) => coverage.statusCounts[status]>0).map((status) => <b key={status}><i style={{ background: ownerRoadStatusColors[status] }}/>{coverage.statusCounts[status]} {ownerRoadStatusLabels[status]}</b>)}</div>
          <p>{viewportTruncated ? "This map window hit its safe response limit. Zoom closer before checking every returned identity." : "Every exact selected-pad identity returned for this map window is listed below."} This does not prove an unplotted route gap is mapped or approved; missing evidence stays blank.</p>
        </div>}
        {selectedDirectoryPad?.structuredRoadSequence && <div className="owner-pad-sequence"><span>Saved road sequence</span><p>{selectedDirectoryPad.structuredRoadSequence}</p></div>}
        {selectedPadStatus?.route.writtenDirections
          ? <details className="owner-pad-directions" open><summary>Reviewed field directions</summary><p>{selectedPadStatus.route.writtenDirections}</p></details>
          : !selectedPadStatusLoading && <p className="owner-pad-direction-hold">No reviewed public written directions are available for this location. Nothing was generated from private notes or inferred from road names.</p>}
        <p className="owner-pad-graph-note">Teal map lines are exact road evidence for this selected location. When a reviewed per-pad endpoint receipt exists, a non-approved local-road line stops at that pad&apos;s exact-road projection instead of continuing beyond it. Gold marks the road being inspected. Held, restricted, unresolved, and reference-only roads keep their real status; missing gaps remain unplotted.</p>
      </div>
    </section>}

    <div className="owner-routes-workspace">
      <section className={`owner-map-column${mapFullscreen ? " is-fullscreen" : ""}`} aria-label={mapFullscreen ? "Full-screen Road Manager map" : undefined}>
        <div className={`owner-map-shell${mapFullscreen && selectedIdentityId ? " has-road-inspector" : ""}`} data-fullscreen={mapFullscreen ? "true" : "false"}>
          <div ref={mapHost} className="owner-map-canvas" aria-label="Interactive owner approved routes map"/>
          <div className="owner-map-actions" aria-label="Road Manager map controls">
            <button type="button" onClick={() => setMapFullscreen((current) => !current)} aria-expanded={mapFullscreen}><Icon name={mapFullscreen ? "close" : "expand"}/>{mapFullscreen ? "Exit" : "Full screen"}</button>
            <button type="button" onClick={showAllRoads} aria-pressed={!padId}><Icon name="map"/>All roads</button>
            <button type="button" onClick={focusLoadedRoads} disabled={!coverage.identityCount}><Icon name="location"/>Fit exact roads</button>
          </div>
          {mapFullscreen && <div className="owner-map-fullscreen-summary" role="status">
            <span><strong>{selectedPad ? `${selectedPad.company ? `${selectedPad.company} — ` : ""}${selectedPad.padName}` : "Current map view"}</strong><small>{coverage.occurrenceCount} mapped route {coverage.occurrenceCount === 1 ? "occurrence" : "occurrences"} · {coverage.identityCount} exact {coverage.identityCount === 1 ? "identity" : "identities"}</small></span>
            <b className={viewportTruncated ? "is-held" : "is-ready"}>{viewportTruncated ? "Zoom closer to check all in this window" : "Map window checked"}</b>
          </div>}
          {mapFullscreen && selectedIdentityId && <FullscreenRoadInspector detail={detail} displayFeature={selectedFeature} loading={detailLoading} error={detailError} onClose={clearRoadSelection} onChoosePad={choosePad}/>}
          <div className={`owner-map-status is-${mapState}`} role={mapState === "error" ? "alert" : "status"}><span/>{mapMessage}</div>
        </div>
        <div className="owner-map-legend" aria-label="Road approval legend">{ownerRoadStatuses.map((status) => <span key={status}><i style={{ background: ownerRoadStatusColors[status] }}/>{ownerRoadStatusLabels[status]}</span>)}{padId && <strong className="owner-pad-focus-key">Selected location exact road evidence</strong>}<strong>Gold inspection road</strong><small>Reference-only and endpoint-display roads are not approved. Location and road selection change display focus only.</small></div>
      </section>
      <aside className="owner-road-results" aria-label="Road results">
        <header><div><span className="eyebrow">CURRENT MAP VIEW</span><h2>Road identities</h2></div><b>{features.length.toLocaleString()}</b></header>
        <div className="owner-road-result-list">{features.length ? features.slice(0, visibleRoadLimit).map((feature) => {
          const road = feature.properties; const selected = road.identityId === selectedIdentityId;
          return <button key={road.identityId} type="button" className={selected ? "is-selected" : ""} aria-pressed={selected} onClick={() => selectRoad(road.identityId, true)}>
            <span className="owner-road-result-heading"><i style={{ background: ownerRoadStatusColors[road.approvalStatus] }}/><strong>{road.displayName}</strong></span>
            <small>{ownerRoadJurisdiction(road)}</small><small>{ownerRoadRouteLabel(road)}</small><code>{road.sourceIdentityKey}</code>
            {road.displayBoundary === "pad_endpoint_projection" && <small>Ends at selected pad road projection · {Math.round(road.endpointOffsetMeters || 0)} m from GPS</small>}
            <span className={`owner-road-status status-${road.approvalStatus}`}>{ownerRoadStatusLabels[road.approvalStatus]}</span>
          </button>;
        }) : <p className="owner-road-empty">No exact identities are loaded in this view.</p>}</div>
        {features.length > visibleRoadLimit && <button type="button" className="owner-road-result-more" onClick={() => setVisibleRoadLimit((current) => Math.min(current + roadResultPageSize, features.length))}>Show {Math.min(roadResultPageSize, features.length-visibleRoadLimit)} more exact identities</button>}
        {viewportTruncated && <p className="owner-road-result-limit">The safe map response limit was reached. Zoom closer or narrow filters before treating this map window as checked.</p>}
      </aside>
    </div>

    <OwnerRoadDetails detail={detail} displayFeature={selectedFeature} loading={detailLoading} error={detailError} onFocus={(bounds) => mapRef.current && fitRoadBounds(mapRef.current, bounds)} onChoosePad={choosePad}/>
    <footer className="owner-road-authority-note"><Icon name="control"/><span><strong>Authority stays separate.</strong> Viewing or selecting a road does not approve it, create route steps or geometry, change the graph, reconcile a route, or publish Google output.</span></footer>
  </section>;
}
