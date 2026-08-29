import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GeolocateControl,
  LngLatBounds,
  Map as MapLibreMap,
  type MapMouseEvent,
  NavigationControl,
  type StyleSpecification,
} from "maplibre-gl";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useNetworkState } from "@/app/useNetworkState";
import { Icon } from "@/components/Icon";
import { LoadingState } from "@/components/LoadingState";
import { StatusBadge } from "@/components/StatusBadge";
import { useDirectory } from "@/data/DirectoryContext";
import { useCompanyRoads } from "@/data/CompanyRoadsContext";
import { padDestinationNavigationUrl, padDestinationPinUrl, trustedPadDestination } from "@/data/googleDestination";
import { readPadDirectionsOffline } from "@/data/offlineRoutes";
import { mapDisplayCoordinateLabel } from "@/data/mapDisplayCoordinates";
import {
  currentReleasedGoogleHandoff,
  loadReleasedGoogleHandoff,
  releasedGoogleNavigationUrl,
  type ReleasedGoogleHandoffLoad,
} from "@/data/releasedGoogleHandoff";
import { graphStateSupportsRoute, loadPadStatus } from "@/data/status";
import { loadDriverRouteChoices } from "@/data/routeChoices";
import { reviewedNavigationCandidateForPad, reviewedNavigationSafetyHoldForPad } from "@/data/reviewedNavigationCandidates";
import { closestPadSearchResults, distanceMilesFromPad, nearbyDistanceLabel, nearbyPadResultsHeading } from "@/data/search";
import type { CompanyRoadOverlayRow, DriverPadStatus, DriverRouteChoice, DriverRouteGeometry, PadSummary } from "@/data/types";
import {
  coincidentLocationsNeedChooser,
  emptyMapCoordinateNotice,
  filterMapRows,
  groupCoincidentProjectedPads,
  hasSafeCoordinate,
  mapCompanyOptions,
  mapDisplayCoordinate,
  mapGoogleHandoffState,
  mapMarkerVisualStyle,
  mapOverlayMarkerState,
  mapRoadSelectionForCompany,
  mapRowsCoordinateExtent,
  selectedMapRouteIsPrimary,
  mapViewerModeFromParam,
  type MapViewerMode,
} from "./mapModel";
import { MapApprovedRouteLink, MapDestinationPinLink, MapReviewedRouteLink } from "./MapApprovedRouteLink";
import {
  firstSymbolLayerAfterLines,
  highwayReferenceCasingLayerId,
  highwayReferenceLayerSpecifications,
  highwayReferenceLineLayerId,
  libertyHighwayReferenceSource,
} from "./highwayReference";
import {
  selectedPadFieldDirectionDisplayForPad,
  type SelectedPadFieldDirectionDisplay,
  type SelectedPadFieldDirectionLineString,
} from "./selectedPadFieldDirectionDisplay";
import {
  ascentPadRoadDisplayForPad,
  ascentPadRoadDisplaysForDirectory,
  type AscentPadRoadDisplay,
} from "./ascentPadRoadDisplays";
import { ascentPadPersistentRedDisplaysForDirectory } from "./ascentPadRedContinuations";
import {
  ascentPadApproachMapDisplays,
  loadAscentPadApproachesForDirectory,
  type AscentPadApproachMapDisplay,
  type AscentPadApproachRecord,
} from "./ascentPadApproaches";
import {
  ascentPadRoadLayerIdsInPaintOrder,
  ascentPadRoadSourceId,
  clearAscentPadRoadLayers,
  syncAscentPadRoadLayers,
  syncAscentPadRoadSelection,
  type AscentPadRoadLayerDisplay,
} from "./ascentPadRoadLayers";
import { padSearchResultsReadyForQuery, usePadSearchLocation } from "@/features/search/usePadSearchLocation";

const mapStyle = import.meta.env.VITE_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty";
const fallbackMapStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "offline-background", type: "background", paint: { "background-color": "#102938" } }],
};
const mapStyleTimeoutMs = 8_000;
const companyRoadSourceId = "brinesearch-company-roads";
const companyRoadCasingLayerId = "brinesearch-company-roads-casing";
const companyRoadLineLayerId = "brinesearch-company-roads-line";
const roadModeFadeSourceId = "brinesearch-road-mode-fade";
const roadModeFadeLayerId = "brinesearch-road-mode-fade-layer";

type MapRenderState = "loading" | "ready" | "degraded" | "error";

interface PadHitTarget {
  rows: PadSummary[];
  radius: number;
  x: number;
  y: number;
}

function companyRoadCollection(rows: CompanyRoadOverlayRow[]) {
  return {
    type: "FeatureCollection" as const,
    features: rows.map((row) => ({
      type: "Feature" as const,
      properties: { ordinal: row.ordinal },
      geometry: row.geometry,
    })),
  };
}

function clearCompanyRoadLayers(map: MapLibreMap) {
  for (const layerId of [companyRoadLineLayerId, companyRoadCasingLayerId]) {
    try {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "none");
    } catch {
      // A style replacement can remove a layer between checking and hiding it.
    }
    try {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    } catch {
      // Hidden layers remain fail-closed if style cleanup races this removal.
    }
  }
  try {
    if (map.getSource(companyRoadSourceId)) map.removeSource(companyRoadSourceId);
  } catch {
    // A style replacement can remove the source between checking and cleanup.
  }
}

function syncCompanyRoadLayers(map: MapLibreMap, rows: CompanyRoadOverlayRow[]) {
  if (!rows.length) {
    // Removing the old source synchronously prevents a previous authorized
    // selection from lingering while a new selection is being validated.
    clearCompanyRoadLayers(map);
    return true;
  }
  try {
    // Hide and replace the source as one bounded overlay operation. MapLibre's
    // public source update is asynchronous in this version, so replacement
    // guarantees that a prior company selection cannot remain visible while
    // the new GeoJSON is prepared by the worker.
    clearCompanyRoadLayers(map);
    map.addSource(companyRoadSourceId, { type: "geojson", data: companyRoadCollection(rows) });
    if (!map.getSource(companyRoadSourceId)) throw new Error("Company-road source was rejected");

    const firstSymbolLayer = firstSymbolLayerAfterLines(map.getStyle());
    if (!map.getLayer(companyRoadCasingLayerId)) {
      map.addLayer({
        id: companyRoadCasingLayerId,
        type: "line",
        source: companyRoadSourceId,
        paint: { "line-color": "rgba(7, 19, 31, .76)", "line-width": 7, "line-opacity": .82 },
        layout: { "line-cap": "round", "line-join": "round" },
      }, firstSymbolLayer);
    }
    if (!map.getLayer(companyRoadLineLayerId)) {
      map.addLayer({
        id: companyRoadLineLayerId,
        type: "line",
        source: companyRoadSourceId,
        paint: { "line-color": "#14b8a6", "line-width": 4, "line-opacity": .86 },
        layout: { "line-cap": "round", "line-join": "round" },
      }, firstSymbolLayer);
    }
    if (!map.getLayer(companyRoadCasingLayerId) || !map.getLayer(companyRoadLineLayerId)) throw new Error("Company-road layers were rejected");
    return true;
  } catch {
    clearCompanyRoadLayers(map);
    return false;
  }
}

function clearHighwayReferenceLayers(map: MapLibreMap) {
  for (const layerId of [highwayReferenceLineLayerId, highwayReferenceCasingLayerId]) {
    try {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    } catch {
      // A style replacement can remove these presentation layers first. The
      // reference owns no source because it reuses Liberty's vector source.
    }
  }
}

function syncHighwayReferenceLayers(map: MapLibreMap) {
  clearHighwayReferenceLayers(map);
  try {
    const source = libertyHighwayReferenceSource(map.getStyle());
    if (!source) return false;
    const firstSymbolLayer = firstSymbolLayerAfterLines(map.getStyle());
    const [casing, line] = highwayReferenceLayerSpecifications(source);
    map.addLayer(casing, firstSymbolLayer);
    map.addLayer(line, firstSymbolLayer);
    if (!map.getLayer(highwayReferenceCasingLayerId) || !map.getLayer(highwayReferenceLineLayerId)) {
      throw new Error("Highway-reference layers were rejected");
    }
    return true;
  } catch {
    clearHighwayReferenceLayers(map);
    return false;
  }
}

function clearRoadModeFade(map: MapLibreMap) {
  try {
    if (map.getLayer(roadModeFadeLayerId)) map.removeLayer(roadModeFadeLayerId);
  } catch {
    // A style replacement can remove the presentation layer first.
  }
  try {
    if (map.getSource(roadModeFadeSourceId)) map.removeSource(roadModeFadeSourceId);
  } catch {
    // The fade is presentation-only and remains safe if cleanup races a style load.
  }
}

function syncMapPresentation(map: MapLibreMap, roadMode: boolean) {
  try {
    if (roadMode) {
      if (!map.getSource(roadModeFadeSourceId)) map.addSource(roadModeFadeSourceId, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]],
          },
        },
      });
      if (!map.getLayer(roadModeFadeLayerId)) {
        const fadeColor = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#07131f";
        map.addLayer({
          id: roadModeFadeLayerId,
          type: "fill",
          source: roadModeFadeSourceId,
          paint: { "fill-color": fadeColor, "fill-opacity": .62 },
        });
      }
    } else {
      clearRoadModeFade(map);
    }

    // Keep the same truthful road hierarchy in both standard and Roads modes:
    // red local continuation, highways, released network, neutral GPS tethers,
    // solid named-road arrivals, then the selected exact Ascent arrival
    // brightest. Proved road-after-last-pad references are red features in this
    // shared source, so they are never rebuilt or double-painted separately.
    for (const layerId of ascentPadRoadLayerIdsInPaintOrder.slice(0, 2)) {
      if (map.getLayer(layerId)) map.moveLayer(layerId);
    }
    if (map.getLayer(highwayReferenceCasingLayerId)) map.moveLayer(highwayReferenceCasingLayerId);
    if (map.getLayer(highwayReferenceLineLayerId)) map.moveLayer(highwayReferenceLineLayerId);
    if (map.getLayer(companyRoadCasingLayerId)) map.moveLayer(companyRoadCasingLayerId);
    if (map.getLayer(companyRoadLineLayerId)) map.moveLayer(companyRoadLineLayerId);
    for (const layerId of ascentPadRoadLayerIdsInPaintOrder.slice(2, 4)) {
      if (map.getLayer(layerId)) map.moveLayer(layerId);
    }
    for (const layerId of ascentPadRoadLayerIdsInPaintOrder.slice(4)) {
      if (map.getLayer(layerId)) map.moveLayer(layerId);
    }

    if (map.getLayer(companyRoadCasingLayerId)) {
      map.setPaintProperty(companyRoadCasingLayerId, "line-opacity", .82);
    }
    if (map.getLayer(companyRoadLineLayerId)) {
      // Exact released roads stay teal in every map view. The separately
      // reviewed selected-pad route is the brighter canvas line above them.
      map.setPaintProperty(companyRoadLineLayerId, "line-color", "#14b8a6");
      map.setPaintProperty(companyRoadLineLayerId, "line-opacity", .86);
    }
  } catch {
    clearRoadModeFade(map);
  }
}

function routeLines(geometry: DriverRouteGeometry | null) {
  if (!geometry) return [];
  return geometry.features.flatMap((feature) => feature.geometry.type === "LineString"
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates);
}

function ascentApproachHoldReason(reason: string) {
  if (reason === "no_exact_last_interstate_us_or_state_highway") return "No exact last Interstate, U.S., or state highway road identity is on file.";
  if (reason === "no_exact_intersection_or_candidate_highway_start") return "No bounded highway start passed the identity and distance checks.";
  if (reason === "candidate_start_lacks_exact_master_last_highway_road_id_anchor") return "No candidate start had exact master last-highway road ID evidence.";
  if (reason === "candidate_start_exceeds_25_air_miles_from_destination") return "The exact last-highway anchor was more than 25 air miles from the saved GPS.";
  if (reason === "all_osrm_candidates_failed") return "No build-time route candidate passed the bounded approach checks.";
  if (reason === "no_routed_section_matches_ordered_exact_master_roads") return "No routed section matched the ordered exact public-road identities.";
  return "The stored approach did not pass the fail-closed display checks.";
}

function pointColor(row: PadSummary, coordinate = mapDisplayCoordinate(row)) {
  if (coordinate?.role === "driver_entrance") return "#52e4bd";
  if (row.recordType === "disposal") return "#70a8ff";
  return "#f0b45d";
}

function drawStableLocationMarker(
  context: CanvasRenderingContext2D,
  group: ReturnType<typeof groupCoincidentProjectedPads>[number],
  selectedId: string | null,
  zoom: number,
) {
  const selectedPoint = selectedId ? group.points.find((point) => point.row.padId === selectedId) : null;
  const point = selectedPoint || group.points[0];
  const row = point.row;
  const selected = Boolean(selectedPoint);
  const stacked = group.rows.length > 1;
  const visual = mapMarkerVisualStyle(zoom, selected);
  const radius = visual.radius;

  if (selected) {
    context.beginPath();
    context.arc(group.x, group.y, 12, 0, Math.PI * 2);
    context.fillStyle = "rgba(255, 255, 255, .26)";
    context.fill();
  }

  const drawDot = (x: number, y: number, fill: string) => {
    const previousAlpha = context.globalAlpha;
    context.globalAlpha = visual.opacity;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = selected ? "#ffffff" : "#07131f";
    context.lineWidth = visual.strokeWidth;
    context.stroke();
    context.globalAlpha = previousAlpha;
  };

  if (stacked) {
    // Exact-coordinate duplicates use a stable double marker. It never
    // absorbs nearby locations or changes membership while the map moves.
    drawDot(group.x - visual.stackOffset, group.y + visual.stackOffset, "#d9fbf5");
    drawDot(group.x + visual.stackOffset, group.y - visual.stackOffset, pointColor(row, point.coordinate));
  } else {
    drawDot(group.x, group.y, pointColor(row, point.coordinate));
  }

  return { selected, radius: selected ? 17 : stacked ? 15 : 12 };
}

function drawRoute(
  context: CanvasRenderingContext2D,
  map: MapLibreMap,
  geometry: DriverRouteGeometry | null,
) {
  // Teal is a display of separately reviewed named-road geometry. Rendering
  // this line does not create graph, road, or public-Google authority.
  const lines = routeLines(geometry);
  if (!lines.length) return;
  const stroke = (color: string, width: number) => {
    context.beginPath();
    for (const line of lines) {
      line.forEach((coordinate, index) => {
        const point = map.project(coordinate);
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
    }
    context.strokeStyle = color;
    context.lineWidth = width;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
  };
  stroke("rgba(7, 19, 31, .88)", 9);
  stroke("#52e4bd", 5);
}

function drawSelectedPadFieldDirectionLine(
  context: CanvasRenderingContext2D,
  map: MapLibreMap,
  line: SelectedPadFieldDirectionLineString,
  color: string,
  width: number,
) {
  context.beginPath();
  line.coordinates.forEach((coordinate, index) => {
    const point = map.project(coordinate);
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke();
}

function drawSelectedPadFieldDirectionDisplay(
  context: CanvasRenderingContext2D,
  map: MapLibreMap,
  display: SelectedPadFieldDirectionDisplay | null,
) {
  if (!display) return;
  // Both legs are an owner-requested display bound to the selected BANNOCK
  // record. Teal is arrival; red is the outbound road reference, never a
  // closure or restriction. The saved GPS remains a separate marker and no
  // straight connector is inferred across its offset from the road centerline.
  drawSelectedPadFieldDirectionLine(context, map, display.inbound, "rgba(7, 19, 31, .88)", 9);
  drawSelectedPadFieldDirectionLine(context, map, display.outbound, "rgba(7, 19, 31, .88)", 9);
  drawSelectedPadFieldDirectionLine(context, map, display.inbound, "#52e4bd", 5);
  drawSelectedPadFieldDirectionLine(context, map, display.outbound, "#ef4444", 5);
}

function drawApprovedRoadNetwork(
  context: CanvasRenderingContext2D,
  map: MapLibreMap,
  rows: CompanyRoadOverlayRow[],
) {
  if (!rows.length) return;
  context.beginPath();
  for (const row of rows) {
    const lines = row.geometry.type === "LineString" ? [row.geometry.coordinates] : row.geometry.coordinates;
    for (const line of lines) {
      line.forEach((coordinate, index) => {
        const point = map.project(coordinate);
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
    }
  }
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "rgba(7, 19, 31, .76)";
  context.lineWidth = 7;
  context.globalAlpha = .82;
  context.stroke();
  context.strokeStyle = "#14b8a6";
  context.lineWidth = 4;
  context.globalAlpha = .86;
  context.stroke();
  context.globalAlpha = 1;
}

function drawPadOverlay(
  map: MapLibreMap,
  canvas: HTMLCanvasElement,
  rows: PadSummary[],
  approvedRoadRows: CompanyRoadOverlayRow[],
  geometry: DriverRouteGeometry | null,
  fieldDirectionDisplay: SelectedPadFieldDirectionDisplay | null,
  selectedId: string | null,
) {
  const width = map.getContainer().clientWidth;
  const height = map.getContainer().clientHeight;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const targetWidth = Math.max(1, Math.round(width * pixelRatio));
  const targetHeight = Math.max(1, Math.round(height * pixelRatio));
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) return { inputCount: 0, renderedCount: 0, targets: [] as PadHitTarget[] };
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  // If the remote basemap style fails, render the same validated released
  // rows on the existing canvas. This is a renderer fallback, not a geometry
  // fallback; MapLibre and canvas never draw the network at the same time.
  drawApprovedRoadNetwork(context, map, approvedRoadRows);
  // Partial and handoff pad geometry rendered on this canvas is selection-only.
  // Exact-record arrivals that end at saved GPS use the persistent native
  // Ascent layer; the authorized company-road network remains separate below it.
  drawRoute(context, map, selectedId ? geometry : null);
  drawSelectedPadFieldDirectionDisplay(
    context,
    map,
    selectedId === fieldDirectionDisplay?.padId ? fieldDirectionDisplay : null,
  );

  const safeRows = rows.flatMap((row) => {
    const coordinate = mapDisplayCoordinate(row);
    return coordinate ? [{ row, coordinate }] : [];
  });
  const projected = safeRows.map(({ row, coordinate }) => {
    const point = map.project([coordinate.longitude, coordinate.latitude]);
    return { row, coordinate, x: point.x, y: point.y };
  }).filter((point) => point.x >= -40 && point.x <= width + 40 && point.y >= -40 && point.y <= height + 40);
  const groups = groupCoincidentProjectedPads(projected);
  const targets: PadHitTarget[] = [];
  const markerZoom = map.getZoom();

  for (const group of groups) {
    const marker = drawStableLocationMarker(context, group, selectedId, markerZoom);
    targets.push({ ...group, radius: marker.radius });
  }

  return { inputCount: safeRows.length, renderedCount: groups.length, targets };
}

export function MapPage() {
  const { snapshot, loading, error } = useDirectory();
  const online = useNetworkState();
  const companyRoads = useCompanyRoads();
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewerMode, setViewerMode] = useState<MapViewerMode>(() => mapViewerModeFromParam(searchParams.get("view")));
  const [mapSearch, setMapSearch] = useState("");
  const [mapSearchOpen, setMapSearchOpen] = useState(false);
  const [mapFiltersOpen, setMapFiltersOpen] = useState(false);
  const [companyFilter, setCompanyFilter] = useState<"all" | string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locationChoices, setLocationChoices] = useState<PadSummary[] | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<DriverPadStatus | null>(null);
  const [releasedHandoff, setReleasedHandoff] = useState<ReleasedGoogleHandoffLoad | undefined>(undefined);
  const [routeChoices, setRouteChoices] = useState<DriverRouteChoice[]>([]);
  const [routeChoicesRecordKey, setRouteChoicesRecordKey] = useState<string | null>(null);
  const [selectedRouteKey, setSelectedRouteKey] = useState("");
  const [selectedNamedApproachKey, setSelectedNamedApproachKey] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "pad" | "disposal">("all");
  const [mapRenderState, setMapRenderState] = useState<MapRenderState>("loading");
  const [mapNotice, setMapNotice] = useState("Loading basemap and mapped locations…");
  const [highwayReferenceReady, setHighwayReferenceReady] = useState(false);
  const [mapControlsCollapsed, setMapControlsCollapsed] = useState(false);
  const [ascentPadRoadsReady, setAscentPadRoadsReady] = useState(false);
  const [ascentPadApproaches, setAscentPadApproaches] = useState<AscentPadApproachRecord[]>([]);
  const [ascentPadApproachesLoaded, setAscentPadApproachesLoaded] = useState(false);
  const [companyRoadRenderFailed, setCompanyRoadRenderFailed] = useState(false);
  const { origin: mapSearchOrigin, state: mapSearchLocationState, requestLocation: requestMapSearchLocation, retryLocation: retryMapSearchLocation } = usePadSearchLocation();
  const mapHost = useRef<HTMLDivElement | null>(null);
  const padOverlay = useRef<HTMLCanvasElement | null>(null);
  const mapControlToggleRef = useRef<HTMLButtonElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const visibleRowsRef = useRef(snapshot?.rows || []);
  const selectedRouteRef = useRef<DriverRouteGeometry | null>(null);
  const selectedFieldDirectionDisplayRef = useRef<SelectedPadFieldDirectionDisplay | null>(null);
  const ascentPadRoadDisplaysRef = useRef<AscentPadRoadLayerDisplay[]>([]);
  const companyRoadRowsRef = useRef<CompanyRoadOverlayRow[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const hitTargetsRef = useRef<PadHitTarget[]>([]);
  const drawOverlayRef = useRef<(() => void) | null>(null);
  const syncCompanyRoadLayersRef = useRef<(() => void) | null>(null);
  const companyRoadRenderFailedRef = useRef(false);
  const viewerModeRef = useRef<MapViewerMode>(viewerMode);
  const pendingRouteFitRef = useRef(false);
  const previousCompanyFilterRef = useRef<"all" | string>(companyFilter);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setAscentPadApproaches([]);
    setAscentPadApproachesLoaded(false);
    if (!snapshot) return () => { cancelled = true; };
    loadAscentPadApproachesForDirectory(snapshot.rows).then((records) => {
      if (!cancelled) {
        setAscentPadApproaches(records);
        setAscentPadApproachesLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, [snapshot]);

  const fullscreen = viewerMode !== "standard";
  const roadMode = viewerMode === "roads";
  const selectedCompany = companyFilter === "all" ? null : companyFilter;
  const companyOptions = useMemo(() => mapCompanyOptions(snapshot?.rows || []), [snapshot]);
  const selectedCompanyHasApprovedRoads = companyFilter === "all"
    || companyRoads.availability.companies.includes(companyFilter);
  const requestedRoadSelection = mapRoadSelectionForCompany(
    companyFilter,
    companyRoads.availability.companies,
    companyRoads.availability.state === "ready",
  );
  // A company filter is a pad filter even when that operator has zero
  // released exact road rows. Suppress stale overlay data until its embedded
  // selection matches this one unified pad-and-road scope.
  const visibleCompanyRoadOverlay = requestedRoadSelection
    && companyRoads.selection === requestedRoadSelection
    && companyRoads.overlay?.selection === requestedRoadSelection
    ? companyRoads.overlay
    : null;
  const companyScopedRows = useMemo(
    () => filterMapRows(snapshot?.rows || [], "all", selectedCompany),
    [selectedCompany, snapshot],
  );
  const visibleRows = useMemo(
    () => filterMapRows(companyScopedRows, typeFilter, null),
    [companyScopedRows, typeFilter],
  );
  const ascentPadRoadDisplays = useMemo(
    () => ascentPadRoadDisplaysForDirectory(snapshot?.rows || []),
    [snapshot],
  );
  const ascentPadPersistentRedDisplays = useMemo(
    () => ascentPadPersistentRedDisplaysForDirectory(snapshot?.rows || []),
    [snapshot],
  );
  const ascentPadApproachDisplays = useMemo<AscentPadApproachMapDisplay[]>(
    () => ascentPadApproachMapDisplays(ascentPadApproaches),
    [ascentPadApproaches],
  );
  const visibleAscentPadRoadDisplays = useMemo(
    () => typeFilter !== "disposal" && (companyFilter === "all" || companyFilter === "Ascent")
      ? ascentPadRoadDisplays
      : [],
    [ascentPadRoadDisplays, companyFilter, typeFilter],
  );
  const visibleAscentPadApproachDisplays = useMemo(
    () => typeFilter !== "disposal" && (companyFilter === "all" || companyFilter === "Ascent")
      ? ascentPadApproachDisplays
      : [],
    [ascentPadApproachDisplays, companyFilter, typeFilter],
  );
  const visibleAscentPadPersistentRedDisplays = useMemo(
    () => typeFilter !== "disposal" && (companyFilter === "all" || companyFilter === "Ascent")
      ? ascentPadPersistentRedDisplays
      : [],
    [ascentPadPersistentRedDisplays, companyFilter, typeFilter],
  );
  const visibleAscentRoadLayerDisplays = useMemo<AscentPadRoadLayerDisplay[]>(
    () => [...visibleAscentPadRoadDisplays, ...visibleAscentPadApproachDisplays, ...visibleAscentPadPersistentRedDisplays],
    [visibleAscentPadApproachDisplays, visibleAscentPadPersistentRedDisplays, visibleAscentPadRoadDisplays],
  );
  const ascentPadRoadScopeDetail = visibleAscentPadRoadDisplays.length
    ? ` ${visibleAscentPadRoadDisplays.length} reviewed Ascent route${visibleAscentPadRoadDisplays.length === 1 ? "" : "s"} remain visible in this scope. Solid teal follows the reviewed named roads; any thin solid neutral GPS-only tether is unapproved and never an approved road.${visibleAscentPadApproachDisplays.length ? ` ${visibleAscentPadApproachDisplays.length} additional measured last-highway approaches are loaded; exact matched sections are solid teal and unresolved access stays visible as solid neutral/unapproved geometry.` : ""}`
    : "";
  const companyRoadScopeStatus = companyRoadRenderFailed
    ? `Approved route roads could not be drawn and are hidden. ${selectedCompany ? `${selectedCompany} pads remain filtered.` : "All pads remain visible."} No route-road geometry was inferred.`
    : companyRoads.availability.state !== "ready"
      ? `${selectedCompany ? `${selectedCompany} pads are shown.` : "All pads are shown."} ${companyRoads.availability.reason || "Approved route roads are unavailable; nothing was inferred."}`
      : selectedCompany && !selectedCompanyHasApprovedRoads
        ? `${selectedCompany} pads are shown. No released exact approved roads are available for this company; nothing was inferred.`
        : companyRoads.loading || companyRoads.selection !== requestedRoadSelection
          ? `Loading exact approved roads for ${selectedCompany || "all companies"}…`
          : companyRoads.error
            ? `${selectedCompany ? `${selectedCompany} pads remain filtered.` : "All pads remain visible."} ${companyRoads.error}`
            : visibleCompanyRoadOverlay
              ? `${visibleCompanyRoadOverlay.rows.length.toLocaleString()} exact approved route-road sections shown in teal for ${selectedCompany || "all available companies"}. ${selectedCompany ? `Only ${selectedCompany} pads and released approved roads are shown.` : "All pads and all released approved roads are shown."}${ascentPadRoadScopeDetail} Proved red road-after-last-pad references for BANNOCK and CARLOS are each included once in the shared Ascent layer. A held State-1 or graph stamp does not block this reviewed display; only unreviewed, invalid, or stale record bindings stay hidden. This is the checked display subset, not a complete statewide or company road inventory.`
              : `${selectedCompany ? `${selectedCompany} pads are shown.` : "All pads are shown."} No released exact approved roads are available for this scope; nothing was inferred.`;
  const mapSearchReady = padSearchResultsReadyForQuery(mapSearchLocationState, mapSearchOrigin, mapSearch);
  const searchResults = useMemo(
    () => mapSearchReady ? closestPadSearchResults(companyScopedRows, mapSearch, mapSearchOrigin, 7) : [],
    [companyScopedRows, mapSearch, mapSearchOrigin, mapSearchReady],
  );
  const selected = snapshot?.rows.find((row) => row.padId === selectedId) || null;
  const selectedFieldDirectionDisplay = selected ? selectedPadFieldDirectionDisplayForPad(selected) : null;
  const selectedAscentPadRoadDisplay = selected ? ascentPadRoadDisplayForPad(selected) : null;
  const boundSelectedAscentPadApproach = selected
    ? ascentPadApproaches.find((approach) => approach.padId === selected.padId) || null
    : null;
  const selectedCoordinate = selected ? mapDisplayCoordinate(selected) : null;
  const selectedPinUrl = selected ? padDestinationPinUrl(selected) : null;
  const selectedGpsNavigationUrl = selected ? padDestinationNavigationUrl(selected) : null;
  const selectedGpsDestination = selected ? trustedPadDestination(selected) : null;
  const selectedReviewedNavigationCandidate = selected ? reviewedNavigationCandidateForPad(selected) : null;
  const selectedReviewedNavigationSafetyHold = selected ? reviewedNavigationSafetyHoldForPad(selected) : null;
  const currentSelectedStatus = selected
    && selectedStatus?.padId === selected.padId
    && selectedStatus.recordRevision === selected.recordRevision ? selectedStatus : null;
  const selectedRecordKey = selected ? `${selected.padId}:${selected.recordRevision}` : null;
  const currentRouteChoices = routeChoicesRecordKey === selectedRecordKey ? routeChoices : [];
  const currentNamedApproaches = currentSelectedStatus?.namedApproaches || [];
  const selectedNamedApproach = currentNamedApproaches.length === 1
    ? currentNamedApproaches[0]
    : currentNamedApproaches.find((approach) => approach.approachKey === selectedNamedApproachKey) || null;
  const namedSelectionRequired = currentNamedApproaches.length > 1 && !selectedNamedApproach;
  const selectedRouteChoice = currentNamedApproaches.length
    ? null
    : currentRouteChoices.find((choice) => choice.routeKey === selectedRouteKey) || currentRouteChoices[0] || null;
  const selectedRouteIsPrimary = selectedMapRouteIsPrimary(
    selectedNamedApproach?.routeGroup || null,
    selectedRouteChoice?.routeGroup || null,
  );
  const currentReleasedHandoffPlan = currentReleasedGoogleHandoff(releasedHandoff, selected);
  const liveApprovedNavigationUrl = !currentNamedApproaches.length && selectedRouteIsPrimary
    && currentSelectedStatus?.route.state === "ready"
    && (currentSelectedStatus.route.source === "exact_graph" || currentSelectedStatus.route.source === "exact_graph_handoff")
    && graphStateSupportsRoute(currentSelectedStatus.route.source, currentSelectedStatus.graph.state)
    && currentSelectedStatus.google.publicState === "ready"
    ? currentSelectedStatus.google.routeUrl
    : null;
  const promotedNavigationUrl = online && !currentNamedApproaches.length
      ? liveApprovedNavigationUrl || releasedGoogleNavigationUrl(
        currentReleasedHandoffPlan,
        selectedRouteIsPrimary ? "primary" : "alternate",
      )
      : null;
  const eligibleReviewedNavigation = selectedRouteIsPrimary && !selectedNamedApproach && !namedSelectionRequired
    ? selectedReviewedNavigationCandidate
    : null;
  // Frozen named-road navigation is an everyday driver artifact, not a
  // State-1 fallback. Keep it available while optional live status loads.
  const selectedReviewedNavigation = eligibleReviewedNavigation;
  // Preserve an already-working record-bound URL. Promoted release metadata
  // may supply Cologie's existing link, but it never replaces a reviewed link.
  const approvedNavigationUrl = selectedNamedApproach?.navigationUrl
    || (!selectedReviewedNavigation ? promotedNavigationUrl : null);
  const selectedRoadSequence = selectedReviewedNavigation?.reviewedRoadSequence || (!approvedNavigationUrl ? selected?.structuredRoadSequence || "" : "");
  const approvedNavigationDetail = selectedNamedApproach
    ? selectedNamedApproach.finalLegMode === "google_to_saved_gps_unapproved"
      ? "Directed named roads to the handoff, then an unnamed GPS final leg"
      : "Reviewed named roads to the saved pin"
    : liveApprovedNavigationUrl && currentSelectedStatus?.route.source === "exact_graph_handoff"
      ? "Directed named roads to the handoff, then an unnamed GPS final leg"
      : "Reviewed named roads to the saved pin";
  const selectedGoogleState = currentNamedApproaches.length
    ? selectedNamedApproach ? "ready" : "unavailable"
    : currentSelectedStatus
      ? mapGoogleHandoffState(currentSelectedStatus.google.publicState, Boolean(approvedNavigationUrl), selectedRouteIsPrimary)
      : approvedNavigationUrl ? "ready" : null;
  const selectedGoogleLabel = selectedNamedApproach
    ? selectedNamedApproach.finalLegMode === "google_to_saved_gps_unapproved"
      ? `${selectedNamedApproach.approachLabel} core + GPS`
      : `${selectedNamedApproach.approachLabel} ready`
    : namedSelectionRequired ? "Choose approach"
    : currentSelectedStatus?.route.source === "exact_graph_handoff" && selectedGoogleState === "ready"
      ? "Named roads + GPS"
      : selectedGoogleState ? `Google ${selectedGoogleState.replaceAll("_", " ")}` : "";
  // Every supplied reviewed named-road feature is displayable while graph and
  // public-Google authority remain held. A working static Google handoff never
  // suppresses separately supplied pad-bound geometry. With no reviewed geometry, draw no teal.
  const selectedRouteGeometry = selectedNamedApproach
    ? selectedNamedApproach.geometry
    : namedSelectionRequired ? null
    : selectedRouteChoice?.routeGroup === "alternate"
    ? selectedRouteChoice.geometry
    : currentSelectedStatus?.route.geometry || null;
  // Batch 2 is a measured fallback. Field-specific, reviewed Batch-1, and
  // live/reviewed selected geometry always keep selection authority ahead of it.
  const activeSelectedAscentPadApproach = !selectedFieldDirectionDisplay
    && !selectedAscentPadRoadDisplay
    && !selectedRouteGeometry
    ? boundSelectedAscentPadApproach
    : null;
  const activeSelectedAscentPadApproachDisplay = activeSelectedAscentPadApproach
    ? ascentPadApproachDisplays.find((display) => display.padId === activeSelectedAscentPadApproach.padId) || null
    : null;
  const activeSelectedAscentPadApproachHasTeal = activeSelectedAscentPadApproachDisplay?.lines
    .some((line) => line.colorRole === "teal") === true;
  visibleRowsRef.current = visibleRows;
  selectedRouteRef.current = selectedAscentPadRoadDisplay || activeSelectedAscentPadApproach
    ? null
    : selectedRouteGeometry;
  selectedFieldDirectionDisplayRef.current = selectedFieldDirectionDisplay;
  ascentPadRoadDisplaysRef.current = visibleAscentRoadLayerDisplays;
  companyRoadRowsRef.current = visibleCompanyRoadOverlay?.rows || [];
  selectedIdRef.current = selectedId;
  viewerModeRef.current = viewerMode;

  const focusPad = useCallback((row: PadSummary) => {
    setLocationChoices(null);
    setSelectedId(row.padId);
    setMapSearch(row.padName);
    setMapSearchOpen(false);
    setMapFiltersOpen(false);
    if (window.matchMedia("(max-width: 760px)").matches) {
      setMapControlsCollapsed(true);
      window.requestAnimationFrame(() => mapControlToggleRef.current?.focus({ preventScroll: true }));
    }
    pendingRouteFitRef.current = true;
    const coordinate = mapDisplayCoordinate(row);
    if (coordinate && mapRef.current) {
      mapRef.current.easeTo({
        center: [coordinate.longitude, coordinate.latitude],
        zoom: Math.max(mapRef.current.getZoom(), 13),
        duration: 420,
      });
    }
  }, []);

  const changeViewerMode = (nextMode: MapViewerMode) => {
    if (nextMode === "roads") setTypeFilter("pad");
    setViewerMode(nextMode);
    const nextParams = new URLSearchParams(searchParams);
    if (nextMode === "standard") nextParams.delete("view");
    else nextParams.set("view", nextMode === "roads" ? "roads" : "map");
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    const requestedMode = mapViewerModeFromParam(searchParams.get("view"));
    setViewerMode((current) => current === requestedMode ? current : requestedMode);
  }, [searchParams]);

  useEffect(() => {
    if (!fullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [fullscreen]);

  useEffect(() => {
    // The single company choice always filters pads. It requests roads only
    // when that exact company has released rows; otherwise the road scope is
    // deliberately empty instead of leaking another company's overlay.
    if (companyRoads.selection !== requestedRoadSelection) {
      companyRoads.selectRoads(requestedRoadSelection);
    }
  }, [companyRoads.selection, companyRoads.selectRoads, requestedRoadSelection]);

  useEffect(() => {
    if (roadMode) setTypeFilter((current) => current === "pad" ? current : "pad");
  }, [roadMode]);

  useEffect(() => {
    let cancelled = false;
    setSelectedStatus(null);
    setReleasedHandoff(undefined);
    setRouteChoices([]);
    setRouteChoicesRecordKey(null);
    setSelectedRouteKey("");
    setSelectedNamedApproachKey("");
    if (selected) {
      // Load promoted frozen releases without gating the ordinary named-road
      // candidate or GPS destination while this optional request is pending.
      loadReleasedGoogleHandoff(selected).then((result) => {
        if (!cancelled) setReleasedHandoff(result);
      });
      if (online) {
        readPadDirectionsOffline(selected).then((cached) => {
          if (!cancelled && cached) setSelectedStatus((current) => current || cached);
        });
      }
      loadPadStatus(selected, snapshot?.sourceState).then((status) => {
        if (cancelled) return;
        setSelectedStatus(status);
        const namedApproaches = status.namedApproaches || [];
        setSelectedNamedApproachKey(namedApproaches.length === 1 ? namedApproaches[0].approachKey : "");
        if (!namedApproaches.length && online && status.dataState === "live" && status.route.state === "ready" && status.route.source === "exact_graph" && status.graph.state === "active_current") {
          loadDriverRouteChoices(selected).then((choices) => {
            if (cancelled) return;
            setRouteChoices(choices);
            setRouteChoicesRecordKey(`${selected.padId}:${selected.recordRevision}`);
            setSelectedRouteKey(choices[0]?.routeKey || "");
          });
        }
      });
    }
    return () => { cancelled = true; };
  }, [online, selected, snapshot?.sourceState]);

  useEffect(() => {
    if (!selected || !pendingRouteFitRef.current || !mapRef.current) return;
    // Do not consume a pending Ascent fit before the lazily split fallback
    // catalog resolves. Otherwise a held record can briefly fit stale status
    // geometry before its pin-only result is known.
    if (selected.company === "Ascent" && !ascentPadApproachesLoaded) return;
    if (!selectedFieldDirectionDisplay && !selectedAscentPadRoadDisplay && !activeSelectedAscentPadApproach && !currentSelectedStatus) return;
    pendingRouteFitRef.current = false;
    const lines = selectedAscentPadRoadDisplay
      ? [
          selectedAscentPadRoadDisplay.arrival.coordinates,
          ...(selectedAscentPadRoadDisplay.gpsLeg ? [selectedAscentPadRoadDisplay.gpsLeg.coordinates] : []),
          ...(selectedAscentPadRoadDisplay.redContinuation ? [selectedAscentPadRoadDisplay.redContinuation.coordinates] : []),
          ...(selectedFieldDirectionDisplay
            ? [selectedFieldDirectionDisplay.inbound.coordinates, selectedFieldDirectionDisplay.outbound.coordinates]
            : []),
        ]
      : activeSelectedAscentPadApproach
        ? activeSelectedAscentPadApproachDisplay?.lines.map((line) => line.coordinates) || []
      : selectedFieldDirectionDisplay
        ? [selectedFieldDirectionDisplay.inbound.coordinates, selectedFieldDirectionDisplay.outbound.coordinates]
        : routeLines(selectedRouteGeometry);
    const coordinate = mapDisplayCoordinate(selected);
    if (!coordinate || (!lines.length && !activeSelectedAscentPadApproach)) return;
    const bounds = new LngLatBounds([coordinate.longitude, coordinate.latitude], [coordinate.longitude, coordinate.latitude]);
    for (const line of lines) for (const coordinate of line) bounds.extend(coordinate);
    mapRef.current.fitBounds(bounds, { padding: fullscreen ? 64 : 84, maxZoom: 15, duration: 520 });
  }, [activeSelectedAscentPadApproach, activeSelectedAscentPadApproachDisplay, ascentPadApproachesLoaded, currentSelectedStatus, fullscreen, selected, selectedAscentPadRoadDisplay, selectedFieldDirectionDisplay, selectedRouteGeometry]);

  useEffect(() => {
    if (!mapHost.current || !padOverlay.current || mapRef.current) return;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: mapHost.current,
        style: mapStyle,
        center: [-80.72, 40.08],
        zoom: 7.25,
        attributionControl: { compact: true },
      });
    } catch {
      setMapRenderState("error");
      setMapNotice("The map renderer could not start. Search remains available.");
      return;
    }
    let styleReady = false;
    let basemapReady = false;
    let fallbackApplied = false;
    let drawFrame: number | null = null;
    let overlayInteractionActive = false;
    let overlayDirty = true;

    const clearOverlayForInteraction = () => {
      const canvas = padOverlay.current;
      if (!canvas) return;
      const context = canvas.getContext("2d");
      if (context) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
      // Targets are screen-space coordinates. Keeping them while the map is
      // moving could open a pad that is no longer under the driver's finger.
      hitTargetsRef.current = [];
      map.getCanvas().style.cursor = "";
    };

    const drawOverlay = () => {
      if (!padOverlay.current || !mapHost.current) return;
      if (overlayInteractionActive) {
        overlayDirty = true;
        return;
      }
      let result: ReturnType<typeof drawPadOverlay>;
      try {
        result = drawPadOverlay(
          map,
          padOverlay.current,
          visibleRowsRef.current,
          fallbackApplied ? companyRoadRowsRef.current : [],
          selectedRouteRef.current,
          selectedFieldDirectionDisplayRef.current,
          selectedIdRef.current,
        );
      } catch {
        hitTargetsRef.current = [];
        setMapRenderState("error");
        setMapNotice("Mapped locations could not be rendered. Search remains available.");
        return;
      }
      overlayDirty = false;
      hitTargetsRef.current = result.targets;
      mapHost.current.dataset.padInputFeatures = String(result.inputCount);
      mapHost.current.dataset.padRenderedFeatures = String(result.renderedCount);
      mapHost.current.dataset.fallbackApplied = String(fallbackApplied);
      const markerState = mapOverlayMarkerState(result.inputCount, result.renderedCount);
      if (markerState === "empty") {
        setMapRenderState(fallbackApplied ? "degraded" : basemapReady ? "ready" : "loading");
        setMapNotice(emptyMapCoordinateNotice(visibleRowsRef.current.length));
      } else if (markerState === "visible") {
        if (companyRoadRenderFailedRef.current) {
          setMapRenderState("degraded");
          setMapNotice("Approved route roads could not be drawn. They were hidden; mapped locations remain available.");
        } else {
          setMapRenderState(fallbackApplied ? "degraded" : basemapReady ? "ready" : "loading");
          setMapNotice(fallbackApplied
            ? "Basemap unavailable. Mapped locations remain visible on a reference background."
            : basemapReady
              ? "Basemap and mapped locations ready."
              : "Mapped locations ready; basemap detail is still loading.");
        }
      } else {
        // A filtered company can be valid but entirely outside the current
        // camera after the driver inspected another operator. That is a normal
        // viewport state, not a canvas failure; the company-change effect below
        // fits these exact saved coordinates and moveend redraws them once.
        setMapRenderState(fallbackApplied ? "degraded" : basemapReady ? "ready" : "loading");
        setMapNotice("Filtered mapped locations are outside the current view. Zoom out or choose another company.");
      }
    };

    const scheduleOverlayDraw = () => {
      overlayDirty = true;
      if (overlayInteractionActive) return;
      if (drawFrame !== null) window.cancelAnimationFrame(drawFrame);
      drawFrame = window.requestAnimationFrame(() => {
        drawFrame = null;
        drawOverlay();
      });
    };
    drawOverlayRef.current = drawOverlay;

    const syncRoadLayers = () => {
      if (!styleReady) return;
      // Thin connected highways come only from Liberty's transportation
      // source/layer and its structured U.S. route-network identity, clipped
      // to the confirmed pad-county footprint. They are context, never an
      // approved BrineSearch route. Exact approved rows are added afterward.
      const highwayReady = fallbackApplied ? false : syncHighwayReferenceLayers(map);
      setHighwayReferenceReady(highwayReady);
      // A failed remote style uses the canvas network above. Clear MapLibre's
      // copy so the authorized rows are never double-painted.
      const mapLibreRoadRows = fallbackApplied ? [] : companyRoadRowsRef.current;
      const failed = !syncCompanyRoadLayers(map, mapLibreRoadRows) && mapLibreRoadRows.length > 0;
      const ascentPadRoadsSynced = syncAscentPadRoadLayers(
        map,
        ascentPadRoadDisplaysRef.current,
        selectedIdRef.current,
      );
      setAscentPadRoadsReady(ascentPadRoadDisplaysRef.current.length > 0 && ascentPadRoadsSynced);
      syncMapPresentation(map, viewerModeRef.current === "roads");
      companyRoadRenderFailedRef.current = failed;
      setCompanyRoadRenderFailed(failed);
      if (failed) {
        setMapRenderState("degraded");
        setMapNotice("Approved route roads could not be drawn. They were hidden; mapped locations remain available.");
      } else if (!ascentPadRoadsSynced) {
        setMapRenderState("degraded");
        setMapNotice("The reviewed Ascent route lines could not be drawn and are hidden. Mapped locations remain available.");
      }
      scheduleOverlayDraw();
    };
    syncCompanyRoadLayersRef.current = syncRoadLayers;

    const applyFallbackStyle = () => {
      // `style.load` proves the remote basemap contract is usable even when
      // slow road tiles have not completed the broader MapLibre `load` event.
      // Do not replace that valid, still-loading road network with the blank
      // fallback merely because a phone connection needs more than 8 seconds.
      if (basemapReady || styleReady || fallbackApplied) return;
      fallbackApplied = true;
      styleReady = false;
      setMapRenderState("degraded");
      setMapNotice("Basemap unavailable. Mapped locations remain visible on a reference background.");
      try {
        map.setStyle(fallbackMapStyle);
      } catch {
        setMapRenderState("error");
        setMapNotice("The fallback map background could not start. Search remains available.");
        return;
      }
      scheduleOverlayDraw();
    };

    map.on("style.load", () => {
      styleReady = true;
      syncRoadLayers();
      if (fallbackApplied) {
        setMapRenderState("degraded");
        setMapNotice("Basemap unavailable. Mapped locations remain visible on a reference background.");
      }
      scheduleOverlayDraw();
    });
    map.on("load", () => {
      basemapReady = true;
      scheduleOverlayDraw();
    });
    map.on("error", (event) => {
      if ((event as typeof event & { sourceId?: string }).sourceId === ascentPadRoadSourceId) {
        clearAscentPadRoadLayers(map);
        setAscentPadRoadsReady(false);
        setMapRenderState("degraded");
        setMapNotice("The reviewed Ascent route lines could not be drawn and are hidden. Mapped locations remain available.");
        return;
      }
      if ((event as typeof event & { sourceId?: string }).sourceId === companyRoadSourceId) {
        clearCompanyRoadLayers(map);
        const failed = companyRoadRowsRef.current.length > 0;
        companyRoadRenderFailedRef.current = failed;
        setCompanyRoadRenderFailed(failed);
        if (failed) {
          setMapRenderState("degraded");
          setMapNotice("Approved route roads could not be drawn. They were hidden; mapped locations remain available.");
        }
        scheduleOverlayDraw();
        return;
      }
      if (!styleReady) applyFallbackStyle();
      else if (!fallbackApplied) {
        setMapRenderState("loading");
        setMapNotice("Mapped locations ready; some basemap detail is still loading.");
      }
    });
    map.on("movestart", () => {
      overlayInteractionActive = true;
      overlayDirty = true;
      if (drawFrame !== null) {
        window.cancelAnimationFrame(drawFrame);
        drawFrame = null;
      }
      // Projecting every directory row and repainting every marker on each
      // phone pan/zoom frame competes with MapLibre's tile and road renderer.
      // Remove the screen-space overlay once, let native roads move smoothly,
      // then rebuild exact markers and hit targets after the camera settles.
      clearOverlayForInteraction();
    });
    map.on("moveend", () => {
      overlayInteractionActive = false;
      scheduleOverlayDraw();
    });
    map.on("resize", scheduleOverlayDraw);
    map.on("click", (event: MapMouseEvent) => {
      // A tap can land after moveend but before its queued animation frame.
      // Refresh synchronously so click selection always uses final coordinates.
      if (!overlayInteractionActive && overlayDirty) {
        if (drawFrame !== null) {
          window.cancelAnimationFrame(drawFrame);
          drawFrame = null;
        }
        drawOverlay();
      }
      const target = [...hitTargetsRef.current].reverse().find((candidate) => Math.hypot(event.point.x - candidate.x, event.point.y - candidate.y) <= candidate.radius);
      if (!target) {
        setLocationChoices(null);
        return;
      }
      if (target.rows.length === 1) {
        focusPad(target.rows[0]);
        return;
      }
      if (coincidentLocationsNeedChooser(target.rows)) {
        setSelectedId(null);
        setLocationChoices(target.rows.slice().sort((left, right) => left.padName.localeCompare(right.padName) || left.company.localeCompare(right.company) || left.padId.localeCompare(right.padId)));
        return;
      }
      setLocationChoices(null);
    });
    map.on("mousemove", (event: MapMouseEvent) => {
      const overTarget = hitTargetsRef.current.some((target) => Math.hypot(event.point.x - target.x, event.point.y - target.y) <= target.radius);
      map.getCanvas().style.cursor = overTarget ? "pointer" : "";
    });

    const styleTimeout = window.setTimeout(applyFallbackStyle, mapStyleTimeoutMs);
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), "top-right");
    const resizeObserver = new ResizeObserver(() => {
      map.resize();
      scheduleOverlayDraw();
    });
    resizeObserver.observe(mapHost.current);
    mapRef.current = map;
    scheduleOverlayDraw();
    return () => {
      window.clearTimeout(styleTimeout);
      if (drawFrame !== null) window.cancelAnimationFrame(drawFrame);
      resizeObserver.disconnect();
      drawOverlayRef.current = null;
      syncCompanyRoadLayersRef.current = null;
      hitTargetsRef.current = [];
      clearHighwayReferenceLayers(map);
      clearAscentPadRoadLayers(map);
      clearRoadModeFade(map);
      map.remove();
      mapRef.current = null;
    };
  }, [focusPad, loading, navigate]);

  useEffect(() => { syncCompanyRoadLayersRef.current?.(); }, [visibleAscentRoadLayerDisplays, visibleCompanyRoadOverlay, viewerMode]);
  useEffect(() => {
    if (mapRef.current) syncAscentPadRoadSelection(mapRef.current, selectedId);
  }, [selectedId]);
  useEffect(() => { drawOverlayRef.current?.(); }, [visibleRows, selectedRouteGeometry, selectedFieldDirectionDisplay, selectedId]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      mapRef.current?.resize();
      drawOverlayRef.current?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [viewerMode]);

  useEffect(() => {
    const previousCompanyFilter = previousCompanyFilterRef.current;
    previousCompanyFilterRef.current = companyFilter;
    if (previousCompanyFilter === companyFilter || !mapRef.current) return;

    const extent = mapRowsCoordinateExtent(companyScopedRows);
    if (!extent) return;
    if (extent.coordinateCount === 1) {
      mapRef.current.easeTo({ center: extent.southWest, zoom: 13, duration: 420 });
      return;
    }
    mapRef.current.fitBounds(new LngLatBounds(extent.southWest, extent.northEast), {
      padding: fullscreen ? 64 : 84,
      maxZoom: 11.5,
      duration: 420,
    });
  }, [companyFilter, companyScopedRows, fullscreen]);

  if (loading) return <LoadingState message="Loading the field map…"/>;
  if (!snapshot || error) return <section className="page-state"><h1>Map unavailable</h1><p>{error || "No complete directory is available."}</p></section>;

  return <section className={`map-page${fullscreen ? " map-fullscreen" : ""}${roadMode ? " map-road-mode" : ""}`} data-viewer-mode={viewerMode}>
    <div className="map-stage">
      <div ref={mapHost} className="map-canvas" aria-label="BrineSearch pad map"/>
      <canvas ref={padOverlay} className="map-point-overlay" aria-hidden="true"/>
    </div>
    <div className={`map-control-stack${mapControlsCollapsed ? " is-collapsed" : ""}`}>
      <button
        ref={mapControlToggleRef}
        type="button"
        className="map-control-toggle"
        aria-expanded={!mapControlsCollapsed}
        aria-controls="map-primary-controls"
        aria-label={mapControlsCollapsed ? "Show map controls" : "Collapse map controls to the left"}
        onClick={() => {
          if (!mapControlsCollapsed) {
            setMapSearchOpen(false);
            setMapFiltersOpen(false);
          }
          setMapControlsCollapsed((collapsed) => !collapsed);
        }}
      ><Icon name={mapControlsCollapsed ? "control" : "back"}/>{mapControlsCollapsed && <span>Map controls</span>}</button>
      <div id="map-primary-controls" className="map-primary-controls" hidden={mapControlsCollapsed}>
      <div className="map-view-toolbar" aria-label="Map view mode">
        <span><Icon name={roadMode ? "route" : "map"}/><strong>{roadMode ? "Road network" : fullscreen ? "Full-screen map" : "Map viewer"}</strong></span>
        <div>
          {!fullscreen && <button type="button" aria-pressed="false" onClick={() => changeViewerMode("fullscreen")}><Icon name="expand"/>Full screen</button>}
          <button type="button" className={roadMode ? "active" : ""} aria-pressed={roadMode} onClick={() => changeViewerMode("roads")}><Icon name="route"/>Roads</button>
          {fullscreen && <button type="button" className="map-view-exit" onClick={() => changeViewerMode("standard")}><Icon name="close"/>Exit</button>}
        </div>
      </div>
      <div className={`map-search-card${mapFiltersOpen ? " is-expanded" : ""}`}>
        <form className="map-inline-search" onSubmit={(event) => { event.preventDefault(); if (searchResults[0]) focusPad(searchResults[0]); }}>
          <Icon name="search"/>
          <input type="search" value={mapSearch} onChange={(event) => { setMapSearch(event.target.value.slice(0, 120)); setMapSearchOpen(true); if (mapSearchLocationState === "idle") requestMapSearchLocation(); }} onFocus={() => { setMapSearchOpen(true); requestMapSearchLocation(); }} placeholder="Search pads" aria-label="Search pad name on map" aria-controls="map-nearest-pad-results" autoComplete="off"/>
          {mapSearch && <button type="button" onClick={() => { setMapSearch(""); setMapSearchOpen(true); requestMapSearchLocation(); }} aria-label="Clear map search"><Icon name="close"/></button>}
          <button
            type="button"
            className="map-filter-toggle"
            aria-expanded={mapFiltersOpen}
            aria-controls="map-filter-panel"
            aria-label={`${mapFiltersOpen ? "Hide" : "Show"} map filters`}
            data-active={typeFilter !== "all" || Boolean(selectedCompany)}
            onClick={() => setMapFiltersOpen((open) => !open)}
          ><Icon name="control"/><span>Filters</span></button>
        </form>
        {mapSearchOpen && <div id="map-nearest-pad-results" className="map-inline-results" role="region" aria-label="Pad search results" aria-live="polite">
          <div className="map-inline-results-heading"><strong>{nearbyPadResultsHeading(mapSearch, mapSearchOrigin)}</strong><span>{mapSearchLocationState === "ready" ? "From this phone" : mapSearchLocationState === "locating" ? "Finding phone…" : "Phone GPS needed"}</span></div>
          {searchResults.length ? searchResults.map((row) => {
            const distance = nearbyDistanceLabel(distanceMilesFromPad(row, mapSearchOrigin));
            return <button key={row.padId} type="button" aria-pressed={row.padId === selectedId} onClick={() => focusPad(row)}>
              <span><strong>{row.padName}</strong><small>{[row.company, row.county, row.state, distance].filter(Boolean).join(" · ")}</small></span><Icon name="location"/>
            </button>;
          }) : <div className="map-inline-search-prompt"><p>{!mapSearchReady ? "Using this phone's current GPS to find nearby pads…" : mapSearch.trim() ? "No pad name matches that text." : "Allow location to see the seven closest pads."}</p>{mapSearchReady && !mapSearchOrigin && <button type="button" onClick={retryMapSearchLocation}>Use phone GPS</button>}</div>}
          <button type="button" className="map-search-all" onClick={() => navigate("/search/all")}>Search the complete directory <span>→</span></button>
        </div>}
        <div id="map-filter-panel" className="map-filter-panel" hidden={!mapFiltersOpen}>
          <div className="filter-row" aria-label="Map filters">
            {roadMode ? <button type="button" className="active" aria-pressed="true">Field pads</button> : (["all", "pad", "disposal"] as const).map((filter) => <button key={filter} className={typeFilter === filter ? "active" : ""} aria-pressed={typeFilter === filter} onClick={() => { setLocationChoices(null); setTypeFilter(filter); }}>{filter === "all" ? "All locations" : filter === "pad" ? "Pads" : "Disposals"}</button>)}
          </div>
          {roadMode && companyRoads.availability.state === "ready" && <div className="map-road-mode-authority"><Icon name="route"/><span><strong>Highway reference + {visibleAscentPadRoadDisplays.length} reviewed Ascent routes + {visibleAscentPadApproachDisplays.length} measured approaches</strong><small>Thin teal is the basemap Interstate, U.S., and state highway reference inside counties with pads. Stronger solid teal is exact approved-road geometry, a reviewed Ascent named-road display, or an exact matched section of a measured last-highway approach. Solid neutral approach/access lines are unresolved and unapproved; thinner solid neutral GPS-only links are tethers, not road geometry. Fail-closed and pin-only records add no line. The proved red outbound references are BANNOCK by Black Oak Road to OH-149 and CARLOS by Airport Road / CR-82 to US-40. A held State-1 or graph stamp does not block reviewed display; invalid or stale record bindings stay hidden.</small></span></div>}
          <label className="company-road-filter">
            <span><Icon name="company"/>Pads + approved roads</span>
            <select value={companyFilter} onChange={(event) => { setSelectedId(null); setLocationChoices(null); setCompanyFilter(event.target.value); }} aria-label="Filter pads and approved roads by company">
              <option value="all">All pads + all approved roads</option>
              {companyOptions.map((company) => <option key={company} value={company}>{company}</option>)}
            </select>
          </label>
          <p className="company-road-authority" role="status" aria-live="polite">{companyRoadScopeStatus}</p>
          {roadMode && companyRoads.availability.state !== "ready" && <div className="map-road-mode-authority is-held"><Icon name="route"/><span><strong>{highwayReferenceReady ? "Highway reference only" : "Road layers unavailable"}</strong><small>{highwayReferenceReady ? "Thin teal highways are basemap reference only; no approved-route geometry is being claimed." : companyRoads.availability.reason || "Nothing was inferred or substituted."}</small></span></div>}
        </div>
      </div>
      </div>
      <div className={`map-render-notice map-render-${mapRenderState}`} role={mapRenderState === "error" ? "alert" : "status"} data-map-render-state={mapRenderState}>
        <span/>{mapNotice}
      </div>
    </div>
    {ascentPadRoadsReady && <p className="sr-only">Reviewed Ascent route lines shown: {visibleAscentPadRoadDisplays.map((display) => display.padName).join(", ")}. Count: {visibleAscentPadRoadDisplays.length}. Measured last-highway approach lines shown: {visibleAscentPadApproachDisplays.length}. Solid teal is exact matched named-road display. Solid neutral access lines are unresolved and unapproved; thinner solid neutral GPS tethers are not road geometry.</p>}
    {ascentPadRoadsReady && (visibleAscentPadRoadDisplays.some((display) => display.redContinuation) || visibleAscentPadPersistentRedDisplays.length > 0) && <p className="sr-only">Red outbound road references shown: BANNOCK by Black Oak Road to OH-149; CARLOS by Airport Road / CR-82 to US-40. Red is a directional reference, not a closure, restriction, or approved road.</p>}
    {locationChoices ? <aside className="map-cluster-chooser" role="dialog" aria-modal="false" aria-labelledby="map-cluster-title">
      <header><div><span className="selection-kicker">SAME EXACT POINT</span><h2 id="map-cluster-title">Choose one of {locationChoices.length}</h2></div><button className="selection-close" onClick={() => setLocationChoices(null)} aria-label="Close location chooser"><Icon name="close"/></button></header>
      <p>These records share the same stored coordinate. Select the exact pad or disposal you want to review.</p>
      <div className="map-cluster-list">{locationChoices.map((row) => <button key={row.padId} type="button" className="map-cluster-choice" onClick={() => focusPad(row)}>
        <span><small>{row.recordType === "disposal" ? "DISPOSAL" : row.company || "FIELD PAD"}</small><strong>{row.padName}</strong><span>{[row.county, row.state].filter(Boolean).join(", ") || "Location not listed"}</span></span><b>Select</b>
      </button>)}</div>
    </aside> : selected ? <article className="map-selection-card">
      <header className="map-selection-header"><div>
        <div className="selection-kicker">{selected.recordType === "disposal" ? "DISPOSAL" : "FIELD PAD"}</div>
        <h2>{selected.padName}</h2>
        <p className="selection-subtitle">{selected.company} · {[selected.county, selected.state].filter(Boolean).join(", ")}</p>
      </div><button className="selection-close" onClick={() => { pendingRouteFitRef.current = false; setSelectedId(null); }} aria-label="Close selected pad"><Icon name="close"/></button></header>
      {currentNamedApproaches.length > 1 && <div className="map-route-choice" aria-label="Choose reviewed named approach">{currentNamedApproaches.map((approach) => <button key={approach.approachKey} type="button" className={approach.approachKey === selectedNamedApproach?.approachKey ? "is-selected" : ""} aria-pressed={approach.approachKey === selectedNamedApproach?.approachKey} onClick={() => { pendingRouteFitRef.current = true; setSelectedNamedApproachKey(approach.approachKey); }}><strong>{approach.approachLabel}</strong><small>{approach.steps.length} exact steps{approach.finalLegMode === "google_to_saved_gps_unapproved" ? " · GPS-only final leg" : ""}</small></button>)}</div>}
      {!currentNamedApproaches.length && currentRouteChoices.length > 1 && <div className="map-route-choice" aria-label="Choose exact approved route">{currentRouteChoices.map((choice) => <button key={choice.routeKey} type="button" className={choice.routeKey === selectedRouteChoice?.routeKey ? "is-selected" : ""} aria-pressed={choice.routeKey === selectedRouteChoice?.routeKey} onClick={() => { pendingRouteFitRef.current = true; setSelectedRouteKey(choice.routeKey); }}><strong>{choice.label}</strong><small>{choice.steps.length} exact steps</small></button>)}</div>}
      {selectedCoordinate && <div className="map-coordinate-reference">
        <span><strong>{mapDisplayCoordinateLabel(selected)}</strong>{selectedPinUrl
          ? <a className="map-coordinate-pin" href={selectedPinUrl} target="_blank" rel="noreferrer" aria-label={`Open ${selectedCoordinate.latitude.toFixed(6)}, ${selectedCoordinate.longitude.toFixed(6)} in Google Maps; destination pin only, no reviewed named-road sequence`}>{selectedCoordinate.latitude.toFixed(6)}, {selectedCoordinate.longitude.toFixed(6)}</a>
          : <small>{selectedCoordinate.latitude.toFixed(6)}, {selectedCoordinate.longitude.toFixed(6)}</small>}</span>
        {approvedNavigationUrl ? <MapApprovedRouteLink routeUrl={approvedNavigationUrl} padName={selected.padName} detail={approvedNavigationDetail} approachLabel={selectedNamedApproach?.approachLabel}/>
          : selectedReviewedNavigation ? <MapReviewedRouteLink routeUrl={selectedReviewedNavigation.routeUrl} padName={selected.padName} detail={selectedReviewedNavigation.detail} ownerApproval={selectedReviewedNavigation.ownerApproval}/>
          : selectedGpsNavigationUrl && selectedGpsDestination ? <MapDestinationPinLink pinUrl={selectedGpsNavigationUrl} padName={selected.padName} sourceLabel={selectedGpsDestination.label}/>
          : namedSelectionRequired ? <small className="map-google-link-state">Choose one reviewed named-road approach</small>
           : <small className="map-google-link-state">No trusted GPS destination</small>}
      </div>}
      {selectedReviewedNavigationSafetyHold && <div className="inline-warning map-route-safety-alert" role="alert"><Icon name="location"/><strong>{selectedReviewedNavigationSafetyHold.title}.</strong> {selectedReviewedNavigationSafetyHold.detail}. GPS destination only until corrected.</div>}
      {selectedFieldDirectionDisplay && <div className="selected-pad-field-direction" role="note" aria-label="BANNOCK selected road directions">
        <span><i className="legend-line selected"/><strong>Teal arrival</strong><small>OH-331 → Lafferty-Bannock Road / CR-10 → BANNOCK</small></span>
        <span><i className="legend-line exit"/><strong>Red exit reference</strong><small>BANNOCK road seam → Lafferty-Bannock / CR-10 → Black Oak Road → OH-149</small></span>
        <p>Red is not a restriction or closure. The marker stays at the exact saved GPS. Any separate thin solid neutral road-to-GPS tether is unapproved and is not road geometry. Display only—the Google Navigate link and road authority are unchanged.</p>
      </div>}
      {selectedAscentPadRoadDisplay && <div className="selected-pad-field-direction" role="note" aria-label={`${selected.padName} reviewed Ascent route`}>
        <span><i className="legend-line selected"/><strong>Reviewed named roads · solid teal</strong><small>{selectedAscentPadRoadDisplay.reviewedRoadSequence}</small></span>
        {selectedAscentPadRoadDisplay.gpsLeg && <span><i className="legend-line gps-tether"/><strong>GPS-only tether</strong><small>{selectedAscentPadRoadDisplay.gpsLeg.label} · thin solid neutral · not road geometry</small></span>}
        <p>{selectedAscentPadRoadDisplay.redContinuation
          ? "The checked non-state road beyond this last pad is red to the next highway junction. State and U.S. routes remain teal."
          : `No red continuation is drawn: ${selectedAscentPadRoadDisplay.redDecision.reason}`}</p>
        <p>Display only—the saved GPS, Google Navigate link, and route authority are unchanged. A thin solid neutral GPS-only tether does not approve or name that movement as a road.</p>
      </div>}
      {activeSelectedAscentPadApproach && <div className="selected-pad-field-direction" role="note" aria-label={`${selected.padName} last-highway approach`}>
        <span><i className={activeSelectedAscentPadApproach.status === "ROUTED_DISPLAY" ? `legend-line ${activeSelectedAscentPadApproachHasTeal ? "selected" : "unverified"}` : "legend-dot review"}/><strong>{activeSelectedAscentPadApproach.status === "ROUTED_DISPLAY" ? "Measured last-highway approach" : "GPS pin only"}</strong><small>{activeSelectedAscentPadApproach.lastHighway?.displayRoad || "No exact highway road identity"} → saved GPS{activeSelectedAscentPadApproach.start?.authority === "candidate_nearest_highway_point" ? " · candidate highway point, not approved handoff" : activeSelectedAscentPadApproach.start?.authority === "exact_highway_next_road_intersection" ? " · exact road intersection start" : ""}</small></span>
        {activeSelectedAscentPadApproach.status === "ROUTED_DISPLAY" ? <>
          <ol className="map-approach-section-list">{activeSelectedAscentPadApproach.directions.map((direction) => <li key={direction.directionOrder} className={direction.authority !== "named_public_road" ? "is-unapproved" : undefined}><span>{direction.directionOrder}</span><div><strong>{direction.displayName}</strong><small>{direction.instruction}</small></div><b>{direction.distanceMiles?.toFixed(2)} mi</b></li>)}</ol>
          <p><strong>Measured road sections: {activeSelectedAscentPadApproach.mileage.roadDistanceMiles?.toFixed(2)} mi.</strong> {activeSelectedAscentPadApproach.gpsTether?.nontrivial ? "No total-to-GPS mileage is shown." : "Road-section total only."} The straight GPS tether ({activeSelectedAscentPadApproach.gpsTether?.distanceMiles.toFixed(2)} mi) is excluded because it is not road geometry.</p>
          <p>Exact identity matches are solid teal. After the first mismatch, access remains visible as a solid neutral, unapproved line. Genuinely unnamed sections and unverified sections are labeled separately.</p>
        </> : <p>No approach line or measured mileage is shown because this record failed closed. {ascentApproachHoldReason(activeSelectedAscentPadApproach.reason)} The saved GPS remains available.</p>}
      </div>}
      <details className="map-route-status"><summary><strong>Route status</strong><span>View</span></summary><div className="map-route-status-content">
        {selectedAscentPadRoadDisplay && <div className="selected-pad-route-key"><i className="legend-line selected"/><strong>Reviewed named roads · bright solid teal</strong></div>}
        {selectedAscentPadRoadDisplay?.gpsLeg && <div className="selected-pad-route-key"><i className="legend-line gps-tether"/><strong>GPS-only tether · thin solid neutral · not road geometry</strong></div>}
        {activeSelectedAscentPadApproachHasTeal && <div className="selected-pad-route-key"><i className="legend-line selected"/><strong>Exact approach sections · bright solid teal</strong></div>}
        {activeSelectedAscentPadApproachDisplay?.lines.some((line) => line.colorRole === "unverified") && <div className="selected-pad-route-key"><i className="legend-line unverified"/><strong>Graph-identified or unverified access · solid neutral · unapproved</strong></div>}
        {activeSelectedAscentPadApproachDisplay?.lines.some((line) => line.colorRole === "gps") && <div className="selected-pad-route-key"><i className="legend-line gps-tether"/><strong>Straight GPS tether · thin solid neutral · not road geometry</strong></div>}
        {!selectedFieldDirectionDisplay && !selectedAscentPadRoadDisplay && !activeSelectedAscentPadApproach && (selectedRouteGeometry && <div className="selected-pad-route-key"><i className="legend-line selected"/><strong>Selected pad route · bright teal</strong></div>)}
        <div className="selection-statuses">{currentSelectedStatus && selectedGoogleState ? <><StatusBadge status={currentSelectedStatus.route.state} label="Named-road status"/><StatusBadge status={selectedReviewedNavigation ? "ready" : selectedGoogleState} label={selectedReviewedNavigation ? "Named roads ready" : selectedGoogleLabel}/></> : approvedNavigationUrl ? <><StatusBadge status="ready" label="Named roads ready"/><StatusBadge status="ready" label="Google ready"/></> : selectedReviewedNavigation ? <StatusBadge status="ready" label="Named roads ready"/> : <span className="mini-badge muted">Checking selected pad status…</span>}</div>
        {selectedFieldDirectionDisplay
          ? <p className="selection-route-note is-ready">BANNOCK selected display: solid teal arrives from OH-331; red exits by Black Oak Road to OH-149. Any thin solid neutral link from the reviewed road to the exact GPS is a straight unapproved GPS-only tether, never a named or approved road.</p>
          : selectedAscentPadRoadDisplay
            ? <p className="selection-route-note is-ready">{selected.padName} is highlighted through its reviewed named roads in solid teal.{selectedAscentPadRoadDisplay.gpsLeg ? " The final thin solid neutral segment is a straight unapproved GPS-only tether, not road geometry." : " The reviewed line reaches the saved GPS without a separate tether."} Display creates no new road or release authority.</p>
          : activeSelectedAscentPadApproach
            ? <p className={`selection-route-note${activeSelectedAscentPadApproach.status === "ROUTED_DISPLAY" ? " is-ready" : " is-held"}`}>{activeSelectedAscentPadApproach.status === "ROUTED_DISPLAY" ? `${activeSelectedAscentPadApproach.start?.authority === "exact_highway_next_road_intersection" ? "The stored approach begins at an exact highway-road intersection." : "The stored approach begins at a bounded candidate point on the last named highway; that point is not an approved handoff."} Solid teal authority still comes only from exact road-identity matching and ends permanently at the first mismatch; unresolved sections remain visible as solid neutral/unapproved geometry.` : "Approach geometry failed closed. Only the exact saved GPS pin is shown; no route line or mileage is inferred."}</p>
          : currentSelectedStatus && <p className={`selection-route-note${selectedRouteGeometry ? " is-ready" : " is-held"}`}>{selectedNamedApproach ? selectedNamedApproach.finalLegMode === "google_to_saved_gps_unapproved" ? `${selectedNamedApproach.approachLabel} · directed named roads highlighted to the reviewed handoff · unnamed final movement is not shown as a named road.` : `${selectedNamedApproach.approachLabel} · reviewed named roads highlighted to the saved pin.` : namedSelectionRequired ? "Choose one reviewed named-road approach. GPS destination navigation remains available; no teal line is selected." : selectedRouteGeometry ? currentSelectedStatus.route.source === "exact_graph_handoff" ? "Reviewed named roads highlighted to their handoff · saved pad GPS shown separately." : `${selectedRouteChoice?.label ? `${selectedRouteChoice.label} · ` : ""}Reviewed named roads highlighted · teal is display, not new authority.` : selectedReviewedNavigation?.ownerApproval ? `${selectedReviewedNavigation.ownerApproval.evidence === "exact_named_road_identities" ? "Owner-approved named-road directions" : "Owner-approved Google directions"} · no separately reviewed display geometry exists, so no teal line is inferred.` : "No reviewed named-road display geometry · no teal line inferred."}</p>}
        {!selectedReviewedNavigationSafetyHold && selectedRoadSequence && <details className="map-saved-road-sequence"><summary><strong>{selectedReviewedNavigation ? "Reviewed named-road sequence" : "Saved road sequence"}</strong><span>View</span></summary><p>{selectedRoadSequence}</p></details>}
        {selectedCoordinate?.role !== "driver_entrance" && <div className="inline-warning"><Icon name="location"/>{selectedAscentPadRoadDisplay?.gpsLeg ? "The marker is the saved GPS destination. The thin solid neutral final segment is an unapproved GPS-only tether—not road geometry or an approved road." : selectedReviewedNavigation ? selectedReviewedNavigation.finalLegNotice || "Reviewed Google directions are available for this exact pad. The map point remains the saved destination; no entrance or graph authority is inferred." : selectedNamedApproach?.finalLegMode === "google_to_saved_gps_unapproved" ? `${selectedNamedApproach.approachLabel} uses reviewed named roads to its handoff. The remaining movement to this GPS destination is unnamed and not highlighted.` : currentSelectedStatus?.route.source === "exact_graph_handoff" && currentSelectedStatus.destination.role === "saved_pad_destination" ? "This is the saved pad GPS destination. The named-road highlight stops at its reviewed handoff; the final unnamed access is not highlighted." : selected.mapReference?.kind === "official_wellhead_reference" ? "This frozen ODNR wellhead GPS is the destination reference. With no reviewed named-road sequence, Google chooses the GPS-only path." : selected.mapReference?.kind === "official_pad_reference" ? "This frozen ODNR pad GPS is the destination reference. With no reviewed named-road sequence, Google chooses the GPS-only path." : selectedCoordinate ? "This saved pad GPS is the destination. With no reviewed named-road sequence, Google chooses the GPS-only path." : "No safe GPS is available for this record. Nothing was inferred or placed on the map."}</div>}
      </div></details>
      <button className="button-primary" onClick={() => navigate(`/pad/${encodeURIComponent(selected.padId)}`)}>Open pad details <span>→</span></button>
    </article> : <aside className="map-legend-card"><strong>BrineSearch road layers</strong>{highwayReferenceReady && <span><i className="legend-line highway"/>Pad-county Interstate / U.S. / state reference · thin teal</span>}<span><i className="legend-line approved"/>Exact approved route road · stronger teal</span>{ascentPadRoadsReady && <><span><i className="legend-line selected"/>Reviewed Ascent named roads · solid teal</span>{visibleAscentPadApproachDisplays.some((display) => display.lines.some((line) => line.colorRole === "teal")) && <span><i className="legend-line selected"/>Exact measured approach sections · solid teal</span>}{visibleAscentPadApproachDisplays.some((display) => display.lines.some((line) => line.colorRole === "unverified")) && <span><i className="legend-line unverified"/>Graph-identified or unverified access · solid neutral · unapproved</span>}{(visibleAscentPadRoadDisplays.some((display) => display.gpsLeg) || visibleAscentPadApproachDisplays.some((display) => display.lines.some((line) => line.colorRole === "gps"))) && <span><i className="legend-line gps-tether"/>GPS-only tether · thin solid neutral · not road geometry</span>}{(visibleAscentPadRoadDisplays.some((display) => display.redContinuation) || visibleAscentPadPersistentRedDisplays.length > 0) && <span><i className="legend-line exit"/>BANNOCK to OH-149 + CARLOS via Airport Rd / CR-82 to US-40 · red</span>}</>}<span><i className="legend-dot ready"/>Verified entrance</span><span><i className="legend-dot review"/>Reference point · not an entrance</span><span><i className="legend-dot disposal"/>Disposal</span></aside>}
  </section>;
}
