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
  ownerRoadFeatureBounds,
  ownerRoadFeaturesBounds,
  ownerRoadFeatureLimit,
  ownerRoadJurisdiction,
  ownerRoadPadOptions,
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
const defaultCenter: [number, number] = [-80.72, 40.05];
const defaultStatuses = new Set<OwnerRoadStatus>(ownerRoadStatuses.filter((status) => status !== "reference_only"));
const viewportMoveDelay = 240;
const viewportRequestTimeout = 15_000;

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
  if (samePoint) map.easeTo({ center: [bounds.west, bounds.south], zoom: Math.max(map.getZoom(), 15), duration: 420 });
  else map.fitBounds(new LngLatBounds([bounds.west, bounds.south], [bounds.east, bounds.north]), { padding: 72, maxZoom: 16, duration: 420 });
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

function OwnerRoadDetails({ detail, loading, error, onFocus }: { detail: OwnerRoadDetail | null; loading: boolean; error: string | null; onFocus: (bounds: OwnerRoadBounds) => void }) {
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
      {detail.pads.length ? <ul>{detail.pads.map((pad) => <li key={pad.padId}><span><strong>{pad.padName}</strong><small>{pad.company || "Company unavailable"}</small></span><b>{pad.occurrenceCount} step{pad.occurrenceCount === 1 ? "" : "s"}</b></li>)}</ul> : <p>No current saved pad-route use.</p>}
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
  const [roadClasses, setRoadClasses] = useState<Set<OwnerRoadClass>>(() => new Set(ownerRoadClasses));
  const [statuses, setStatuses] = useState<Set<OwnerRoadStatus>>(() => new Set(defaultStatuses));
  const [mapState, setMapState] = useState<MapState>("starting");
  const [mapMessage, setMapMessage] = useState("Starting the owner road map…");
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
  const loadViewportRef = useRef<((force?: boolean) => void) | null>(null);
  const selectRoadRef = useRef<((identityId: string, focus: boolean) => void) | null>(null);

  featuresRef.current = features;
  selectedIdentityRef.current = selectedIdentityId;
  selectedPadIdRef.current = padId;

  const pads = useMemo(() => ownerRoadPadOptions(snapshot?.rows || [], protectedPads), [protectedPads, snapshot]);
  const directoryById = useMemo(() => new Map((snapshot?.rows || []).flatMap((pad) => pad.canonicalId ? [[pad.canonicalId, pad] as const] : [])), [snapshot]);
  const selectedPad = useMemo(() => pads.find((pad) => pad.padId === padId) || null, [padId, pads]);
  const selectedDirectoryPad = directoryById.get(padId) || null;
  const protectedPadIds = useMemo(() => new Set(protectedPads.map((pad) => pad.padId)), [protectedPads]);
  selectedPadRef.current = selectedPad;

  const clearRoads = useCallback((message: string) => {
    requestRef.current += 1;
    viewportController.current?.abort();
    viewportController.current = null;
    viewportInFlightKeyRef.current = null;
    viewportLoadedKeyRef.current = null;
    setFeatures([]);
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
    viewportMoveTimerRef.current = window.setTimeout(() => {
      viewportMoveTimerRef.current = null;
      loadViewportRef.current?.();
    }, delay);
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
      map = new MapLibreMap({ container: mapHost.current, style: mapStyle, center: defaultCenter, zoom: 10, attributionControl: { compact: true } });
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
      const hit = map.queryRenderedFeatures(event.point, { layers: [selectedLayerId, roadLayerId] })[0];
      const identityId = typeof hit?.properties?.identityId === "string" ? hit.properties.identityId : null;
      if (identityId) selectRoadRef.current?.(identityId, false);
    };
    const onMove = (event: MapMouseEvent) => {
      if (!map.getLayer(roadLayerId)) return;
      map.getCanvas().style.cursor = map.queryRenderedFeatures(event.point, { layers: [selectedLayerId, roadLayerId] }).length ? "pointer" : "";
    };
    map.on("style.load", onStyleLoad);
    map.on("error", onMapError);
    const onMoveEnd = () => scheduleViewportLoad();
    map.on("moveend", onMoveEnd);
    map.on("click", onClick);
    map.on("mousemove", onMove);
    map.on("mouseout", () => { map.getCanvas().style.cursor = ""; });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    let observedWidth = 0;
    let observedHeight = 0;
    const resizeObserver = new ResizeObserver(([entry]) => {
      const width = Math.round(entry?.contentRect.width || 0);
      const height = Math.round(entry?.contentRect.height || 0);
      if (!width || !height || width === observedWidth && height === observedHeight) return;
      observedWidth = width;
      observedHeight = height;
      map.resize();
    });
    resizeObserver.observe(mapHost.current);
    const styleTimeout = window.setTimeout(onMapError, 8_000);
    mapRef.current = map;
    setMapState("loading");
    return () => {
      window.clearTimeout(styleTimeout);
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
      map.easeTo({ center: [selectedPad.longitude, selectedPad.latitude], zoom: 9, duration: 420 });
    }
  }, [access.state, selectedPad]);

  const toggleClass = (roadClass: OwnerRoadClass) => setRoadClasses((current) => {
    const next = new Set(current); if (next.has(roadClass)) next.delete(roadClass); else next.add(roadClass); return next;
  });
  const toggleStatus = (status: OwnerRoadStatus) => setStatuses((current) => {
    const next = new Set(current); if (next.has(status)) next.delete(status); else next.add(status); return next;
  });
  const choosePad = (nextPadId: string) => {
    clearRoads(nextPadId ? "Loading exact roads for the selected location…" : "Loading the current exact-road view…");
    setMapState("loading");
    setPadId(nextPadId);
    setSelectedIdentityId(null);
    setDetail(null);
    setSelectedPadStatus(null);
    setSelectedPadStatusLoading(Boolean(nextPadId));
    fittedPadRef.current = null;
    if (!nextPadId) return;
    const nextPad = pads.find((pad) => pad.padId === nextPadId);
    const nextState = ownerRoadStateCode(nextPad?.state || "");
    if (nextState) setStateFilter(nextState);
    // A selected route must show every exact occurrence, including held,
    // restricted, and reference-only evidence. Color continues to state the
    // authority class; visual focus never upgrades approval.
    setStatuses(new Set(ownerRoadStatuses));
  };

  if (access.state === "checking") return <LoadingState message="Checking owner access…"/>;
  if (access.state !== "owner") return <AccessBoundary state={access.state} message={access.message} onRefresh={() => { void refresh(); }}/>;

  return <section className="content-page owner-routes-page">
    <header className="subpage-topbar"><Link to="/settings" className="icon-button" aria-label="Back to Settings"><Icon name="back"/></Link><span>Approved Routes Map</span><Link to="/sign-in?next=/settings/approved-routes" className="owner-account-link" aria-label="Open V18 owner account"><Icon name="account"/> Account</Link></header>
    <header className="owner-routes-hero">
      <div><span className="eyebrow">OWNER SETTINGS</span><h1>Approved Routes Map</h1><p>Inspect exact road identities, approval evidence, restrictions, route use, and release-current junctions. This view cannot edit or publish road truth.</p></div>
      <span className="owner-readonly-badge">READ ONLY</span>
    </header>

    <section className="owner-road-toolbar" aria-label="Owner road map filters">
      <label className="owner-road-search"><span><Icon name="search"/>Road or exact identity</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value.slice(0, 120))} placeholder="Name, route, jurisdiction, source identity…"/></label>
      <label><span>State</span><select value={stateFilter} onChange={(event) => setStateFilter(event.target.value as typeof stateFilter)}><option value="">OH + WV + PA</option><option value="OH">Ohio</option><option value="WV">West Virginia</option><option value="PA">Pennsylvania</option></select></label>
      <label><span>County</span><input value={countyFilter} onChange={(event) => setCountyFilter(event.target.value.slice(0, 100))} placeholder="Code or name"/></label>
      <label><span>Route system</span><select value={routeSystem} onChange={(event) => setRouteSystem(event.target.value)}><option value="">All exact systems</option>{routeSystemOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="owner-road-pad-filter"><span><Icon name="location"/>Location directions + graph roads</span><select value={padId} onChange={(event) => choosePad(event.target.value)}><option value="">All {pads.length.toLocaleString()} locations</option>{pads.map((pad) => {
        const directoryPad = directoryById.get(pad.padId);
        const evidence = protectedPadIds.has(pad.padId) ? "route prep" : directoryPad?.structuredRoadSequence ? "saved sequence" : "directory location";
        return <option key={pad.padId} value={pad.padId}>{pad.company ? `${pad.company} — ` : ""}{pad.padName} · {evidence}</option>;
      })}</select></label>
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
          <b className={features.length ? "is-ready" : "is-held"}>{features.length ? `${features.length} exact graph ${features.length === 1 ? "road" : "roads"} in view` : "No exact graph road in view"}</b>
          <b>{selectedPadStatusLoading ? "Checking reviewed directions…" : selectedPadStatus?.route.writtenDirections ? "Reviewed directions available" : "No reviewed directions published"}</b>
          {selectedPadStatus && <b>Route {selectedPadStatus.route.state.replaceAll("_", " ")} · graph {selectedPadStatus.graph.state.replaceAll("_", " ")}</b>}
        </div>
        {selectedDirectoryPad?.structuredRoadSequence && <div className="owner-pad-sequence"><span>Saved road sequence</span><p>{selectedDirectoryPad.structuredRoadSequence}</p></div>}
        {selectedPadStatus?.route.writtenDirections
          ? <details className="owner-pad-directions" open><summary>Reviewed field directions</summary><p>{selectedPadStatus.route.writtenDirections}</p></details>
          : !selectedPadStatusLoading && <p className="owner-pad-direction-hold">No reviewed public written directions are available for this location. Nothing was generated from private notes or inferred from road names.</p>}
        <p className="owner-pad-graph-note">Teal map lines are exact mapped road occurrences for this selected location from the current authoritative road identity layer. Gold marks the road being inspected. Held, restricted, unresolved, and reference-only roads keep their real status; missing gaps remain unplotted.</p>
      </div>
    </section>}

    <div className="owner-routes-workspace">
      <section className="owner-map-column">
        <div className="owner-map-shell">
          <div ref={mapHost} className="owner-map-canvas" aria-label="Interactive owner approved routes map"/>
          <div className={`owner-map-status is-${mapState}`} role={mapState === "error" ? "alert" : "status"}><span/>{mapMessage}</div>
        </div>
        <div className="owner-map-legend" aria-label="Road approval legend">{ownerRoadStatuses.map((status) => <span key={status}><i style={{ background: ownerRoadStatusColors[status] }}/>{ownerRoadStatusLabels[status]}</span>)}{padId && <strong className="owner-pad-focus-key">Selected location exact graph roads</strong>}<strong>Gold inspection road</strong><small>Reference-only roads are not approved. Location and road selection change display focus only.</small></div>
      </section>
      <aside className="owner-road-results" aria-label="Road results">
        <header><div><span className="eyebrow">CURRENT MAP VIEW</span><h2>Road identities</h2></div><b>{features.length.toLocaleString()}</b></header>
        <div className="owner-road-result-list">{features.length ? features.slice(0, 180).map((feature) => {
          const road = feature.properties; const selected = road.identityId === selectedIdentityId;
          return <button key={road.identityId} type="button" className={selected ? "is-selected" : ""} aria-pressed={selected} onClick={() => selectRoad(road.identityId, true)}>
            <span className="owner-road-result-heading"><i style={{ background: ownerRoadStatusColors[road.approvalStatus] }}/><strong>{road.displayName}</strong></span>
            <small>{ownerRoadJurisdiction(road)}</small><small>{ownerRoadRouteLabel(road)}</small><code>{road.sourceIdentityKey}</code>
            <span className={`owner-road-status status-${road.approvalStatus}`}>{ownerRoadStatusLabels[road.approvalStatus]}</span>
          </button>;
        }) : <p className="owner-road-empty">No exact identities are loaded in this view.</p>}</div>
        {features.length > 180 && <p className="owner-road-result-limit">The map shows {features.length.toLocaleString()} identities; this list shows the first 180. Narrow filters to inspect the rest.</p>}
      </aside>
    </div>

    <OwnerRoadDetails detail={detail} loading={detailLoading} error={detailError} onFocus={(bounds) => mapRef.current && fitRoadBounds(mapRef.current, bounds)}/>
    <footer className="owner-road-authority-note"><Icon name="control"/><span><strong>Authority stays separate.</strong> Viewing or selecting a road does not approve it, create route steps or geometry, change the graph, reconcile a route, or publish Google output.</span></footer>
  </section>;
}
