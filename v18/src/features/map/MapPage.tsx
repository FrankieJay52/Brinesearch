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
import { readPadDirectionsOffline } from "@/data/offlineRoutes";
import { mapDisplayCoordinateLabel } from "@/data/mapDisplayCoordinates";
import { loadPadStatus } from "@/data/status";
import { loadDriverRouteChoices } from "@/data/routeChoices";
import type { CompanyRoadOverlayRow, DriverPadStatus, DriverRouteChoice, DriverRouteGeometry, PadSummary } from "@/data/types";
import {
  coincidentLocationsNeedChooser,
  emptyMapCoordinateNotice,
  filterMapRows,
  groupCoincidentProjectedPads,
  hasSafeCoordinate,
  mapDisplayCoordinate,
  mapPadSearchResults,
  mapViewerModeFromParam,
  type MapViewerMode,
} from "./mapModel";

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

    const firstSymbolLayer = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
    if (!map.getLayer(companyRoadCasingLayerId)) {
      map.addLayer({
        id: companyRoadCasingLayerId,
        type: "line",
        source: companyRoadSourceId,
        paint: { "line-color": "rgba(7, 19, 31, .76)", "line-width": 7, "line-opacity": 1 },
        layout: { "line-cap": "round", "line-join": "round" },
      }, firstSymbolLayer);
    }
    if (!map.getLayer(companyRoadLineLayerId)) {
      map.addLayer({
        id: companyRoadLineLayerId,
        type: "line",
        source: companyRoadSourceId,
        paint: { "line-color": "rgba(240, 180, 93, .9)", "line-width": 3.5, "line-opacity": 1 },
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

function syncMapPresentation(map: MapLibreMap, roadMode: boolean, isolateSelectedRoute: boolean) {
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
      if (map.getLayer(companyRoadCasingLayerId)) map.moveLayer(companyRoadCasingLayerId);
      if (map.getLayer(companyRoadLineLayerId)) map.moveLayer(companyRoadLineLayerId);
    } else {
      clearRoadModeFade(map);
    }

    if (map.getLayer(companyRoadCasingLayerId)) {
      map.setPaintProperty(companyRoadCasingLayerId, "line-opacity", roadMode && isolateSelectedRoute ? .22 : 1);
    }
    if (map.getLayer(companyRoadLineLayerId)) {
      map.setPaintProperty(companyRoadLineLayerId, "line-color", roadMode ? "#52e4bd" : "rgba(240, 180, 93, .9)");
      map.setPaintProperty(companyRoadLineLayerId, "line-opacity", roadMode && isolateSelectedRoute ? .16 : 1);
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

function pointColor(row: PadSummary, coordinate = mapDisplayCoordinate(row)) {
  if (coordinate?.role === "driver_entrance") return "#52e4bd";
  if (row.recordType === "disposal") return "#70a8ff";
  return "#f0b45d";
}

function drawStableLocationMarker(
  context: CanvasRenderingContext2D,
  group: ReturnType<typeof groupCoincidentProjectedPads>[number],
  selectedId: string | null,
) {
  const selectedPoint = selectedId ? group.points.find((point) => point.row.padId === selectedId) : null;
  const point = selectedPoint || group.points[0];
  const row = point.row;
  const selected = Boolean(selectedPoint);
  const stacked = group.rows.length > 1;
  const radius = selected ? 8 : 5.5;

  if (selected) {
    context.beginPath();
    context.arc(group.x, group.y, 12, 0, Math.PI * 2);
    context.fillStyle = "rgba(255, 255, 255, .26)";
    context.fill();
  }

  const drawDot = (x: number, y: number, fill: string) => {
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = selected ? "#ffffff" : "#07131f";
    context.lineWidth = selected ? 3 : 2;
    context.stroke();
  };

  if (stacked) {
    // Exact-coordinate duplicates use a stable double marker. It never
    // absorbs nearby locations or changes membership while the map moves.
    drawDot(group.x - 3, group.y + 3, "#d9fbf5");
    drawDot(group.x + 3, group.y - 3, pointColor(row, point.coordinate));
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

function drawPadOverlay(
  map: MapLibreMap,
  canvas: HTMLCanvasElement,
  rows: PadSummary[],
  geometry: DriverRouteGeometry | null,
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
  drawRoute(context, map, geometry);

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

  for (const group of groups) {
    const marker = drawStableLocationMarker(context, group, selectedId);
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locationChoices, setLocationChoices] = useState<PadSummary[] | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<DriverPadStatus | null>(null);
  const [routeChoices, setRouteChoices] = useState<DriverRouteChoice[]>([]);
  const [selectedRouteKey, setSelectedRouteKey] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "pad" | "disposal">("all");
  const [mapRenderState, setMapRenderState] = useState<MapRenderState>("loading");
  const [mapNotice, setMapNotice] = useState("Loading basemap and mapped locations…");
  const [companyRoadRenderFailed, setCompanyRoadRenderFailed] = useState(false);
  const mapHost = useRef<HTMLDivElement | null>(null);
  const padOverlay = useRef<HTMLCanvasElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const visibleRowsRef = useRef(snapshot?.rows || []);
  const selectedRouteRef = useRef<DriverRouteGeometry | null>(null);
  const companyRoadRowsRef = useRef<CompanyRoadOverlayRow[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const hitTargetsRef = useRef<PadHitTarget[]>([]);
  const drawOverlayRef = useRef<(() => void) | null>(null);
  const syncCompanyRoadLayersRef = useRef<(() => void) | null>(null);
  const companyRoadRenderFailedRef = useRef(false);
  const viewerModeRef = useRef<MapViewerMode>(viewerMode);
  const isolateSelectedRouteRef = useRef(false);
  const pendingRouteFitRef = useRef(false);
  const previousRoadSelectionRef = useRef<"all" | string | null>(null);
  const roadModeWasActiveRef = useRef(false);
  const navigate = useNavigate();

  const fullscreen = viewerMode !== "standard";
  const roadMode = viewerMode === "roads";
  const selectedRoadCompany = companyRoads.selection && companyRoads.selection !== "all" ? companyRoads.selection : null;
  const visibleRows = useMemo(
    () => filterMapRows(snapshot?.rows || [], typeFilter, selectedRoadCompany),
    [selectedRoadCompany, snapshot, typeFilter],
  );
  const visibleMappedCount = useMemo(() => visibleRows.filter(hasSafeCoordinate).length, [visibleRows]);
  const searchResults = useMemo(() => mapPadSearchResults(snapshot?.rows || [], mapSearch), [mapSearch, snapshot]);
  const selected = snapshot?.rows.find((row) => row.padId === selectedId) || null;
  const selectedCoordinate = selected ? mapDisplayCoordinate(selected) : null;
  const selectedRouteChoice = routeChoices.find((choice) => choice.routeKey === selectedRouteKey) || routeChoices[0] || null;
  const selectedRouteGeometry = selectedRouteChoice?.geometry || selectedStatus?.route.geometry || null;
  visibleRowsRef.current = visibleRows;
  selectedRouteRef.current = selectedRouteGeometry;
  companyRoadRowsRef.current = companyRoads.overlay?.rows || [];
  selectedIdRef.current = selectedId;
  viewerModeRef.current = viewerMode;
  isolateSelectedRouteRef.current = roadMode && Boolean(selectedId);

  const focusPad = useCallback((row: PadSummary) => {
    setLocationChoices(null);
    setSelectedId(row.padId);
    setMapSearch(row.padName);
    setMapSearchOpen(false);
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
    if (roadMode && !roadModeWasActiveRef.current) {
      previousRoadSelectionRef.current = companyRoads.selection;
      roadModeWasActiveRef.current = true;
      return;
    }
    if (!roadMode && roadModeWasActiveRef.current) {
      roadModeWasActiveRef.current = false;
      const previousSelection = previousRoadSelectionRef.current;
      previousRoadSelectionRef.current = null;
      if (companyRoads.selection !== previousSelection) companyRoads.selectRoads(previousSelection);
    }
  }, [companyRoads, roadMode]);

  useEffect(() => {
    if (roadMode && companyRoads.availability.state === "ready" && companyRoads.selection !== "all") {
      companyRoads.selectRoads("all");
    }
  }, [companyRoads, roadMode]);

  useEffect(() => {
    if (roadMode) setTypeFilter((current) => current === "pad" ? current : "pad");
  }, [roadMode]);

  useEffect(() => {
    let cancelled = false;
    setSelectedStatus(null);
    setRouteChoices([]);
    setSelectedRouteKey("");
    if (selected) {
      if (online) {
        readPadDirectionsOffline(selected).then((cached) => {
          if (!cancelled && cached) setSelectedStatus((current) => current || cached);
        });
      }
      loadPadStatus(selected, snapshot?.sourceState).then((status) => {
        if (cancelled) return;
        setSelectedStatus(status);
        if (online && status.dataState === "live" && status.route.state === "ready" && status.route.source === "exact_graph" && status.graph.state === "active_current") {
          loadDriverRouteChoices(selected).then((choices) => {
            if (cancelled) return;
            setRouteChoices(choices);
            setSelectedRouteKey(choices[0]?.routeKey || "");
          });
        }
      });
    }
    return () => { cancelled = true; };
  }, [online, selected, snapshot?.sourceState]);

  useEffect(() => {
    if (!selectedStatus || !selected || !pendingRouteFitRef.current || !mapRef.current) return;
    pendingRouteFitRef.current = false;
    const lines = routeLines(selectedRouteGeometry);
    const coordinate = mapDisplayCoordinate(selected);
    if (!lines.length || !coordinate) return;
    const bounds = new LngLatBounds([coordinate.longitude, coordinate.latitude], [coordinate.longitude, coordinate.latitude]);
    for (const line of lines) for (const coordinate of line) bounds.extend(coordinate);
    mapRef.current.fitBounds(bounds, { padding: fullscreen ? 64 : 84, maxZoom: 15, duration: 520 });
  }, [fullscreen, selected, selectedRouteGeometry, selectedStatus]);

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

    const drawOverlay = () => {
      if (!padOverlay.current || !mapHost.current) return;
      let result: ReturnType<typeof drawPadOverlay>;
      try {
        result = drawPadOverlay(map, padOverlay.current, visibleRowsRef.current, selectedRouteRef.current, selectedIdRef.current);
      } catch {
        hitTargetsRef.current = [];
        setMapRenderState("error");
        setMapNotice("Mapped locations could not be rendered. Search remains available.");
        return;
      }
      hitTargetsRef.current = result.targets;
      mapHost.current.dataset.padInputFeatures = String(result.inputCount);
      mapHost.current.dataset.padRenderedFeatures = String(result.renderedCount);
      mapHost.current.dataset.fallbackApplied = String(fallbackApplied);
      if (result.inputCount === 0) {
        setMapRenderState(fallbackApplied ? "degraded" : basemapReady ? "ready" : "loading");
        setMapNotice(emptyMapCoordinateNotice(visibleRowsRef.current.length));
      } else if (result.renderedCount > 0) {
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
        setMapRenderState("error");
        setMapNotice("Mapped locations could not be rendered. Search remains available.");
      }
    };

    const scheduleOverlayDraw = () => {
      if (drawFrame !== null) window.cancelAnimationFrame(drawFrame);
      drawFrame = window.requestAnimationFrame(() => {
        drawFrame = null;
        drawOverlay();
      });
    };
    drawOverlayRef.current = drawOverlay;

    const syncRoadLayers = () => {
      if (!styleReady) return;
      const failed = !syncCompanyRoadLayers(map, companyRoadRowsRef.current) && companyRoadRowsRef.current.length > 0;
      syncMapPresentation(map, viewerModeRef.current === "roads", isolateSelectedRouteRef.current);
      companyRoadRenderFailedRef.current = failed;
      setCompanyRoadRenderFailed(failed);
      if (failed) {
        setMapRenderState("degraded");
        setMapNotice("Approved route roads could not be drawn. They were hidden; mapped locations remain available.");
      }
      scheduleOverlayDraw();
    };
    syncCompanyRoadLayersRef.current = syncRoadLayers;

    const applyFallbackStyle = () => {
      if (basemapReady || fallbackApplied) return;
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
    map.on("move", scheduleOverlayDraw);
    map.on("resize", scheduleOverlayDraw);
    map.on("click", (event: MapMouseEvent) => {
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
      clearRoadModeFade(map);
      map.remove();
      mapRef.current = null;
    };
  }, [focusPad, loading]);

  useEffect(() => { syncCompanyRoadLayersRef.current?.(); }, [companyRoads.overlay, selectedId, viewerMode]);
  useEffect(() => { drawOverlayRef.current?.(); }, [visibleRows, selectedRouteGeometry, selectedId]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      mapRef.current?.resize();
      drawOverlayRef.current?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [viewerMode]);

  if (loading) return <LoadingState message="Loading the field map…"/>;
  if (!snapshot || error) return <section className="page-state"><h1>Map unavailable</h1><p>{error || "No complete directory is available."}</p></section>;

  return <section className={`map-page${fullscreen ? " map-fullscreen" : ""}${roadMode ? " map-road-mode" : ""}`} data-viewer-mode={viewerMode}>
    <div className="map-stage">
      <div ref={mapHost} className="map-canvas" aria-label="BrineSearch pad map"/>
      <canvas ref={padOverlay} className="map-point-overlay" aria-hidden="true"/>
    </div>
    <div className="map-control-stack">
      <div className="map-view-toolbar" aria-label="Map view mode">
        <span><Icon name={roadMode ? "route" : "map"}/><strong>{roadMode ? "Approved roads" : fullscreen ? "Full-screen map" : "Map viewer"}</strong></span>
        <div>
          <button type="button" className={viewerMode === "fullscreen" ? "active" : ""} aria-pressed={viewerMode === "fullscreen"} onClick={() => changeViewerMode("fullscreen")}><Icon name="expand"/>{fullscreen ? "Map" : "Full screen"}</button>
          <button type="button" className={roadMode ? "active" : ""} aria-pressed={roadMode} onClick={() => changeViewerMode("roads")}><Icon name="route"/>Roads</button>
          {fullscreen && <button type="button" className="map-view-exit" onClick={() => changeViewerMode("standard")}><Icon name="close"/>Exit</button>}
        </div>
      </div>
      <div className="map-search-card">
        <form className="map-inline-search" onSubmit={(event) => { event.preventDefault(); if (searchResults[0]) focusPad(searchResults[0]); }}>
          <Icon name="search"/>
          <input type="search" value={mapSearch} onChange={(event) => { setMapSearch(event.target.value.slice(0, 120)); setMapSearchOpen(true); }} onFocus={() => setMapSearchOpen(true)} placeholder="Search pad name on this map" aria-label="Search pad name on map" autoComplete="off"/>
          {mapSearch && <button type="button" onClick={() => { setMapSearch(""); setMapSearchOpen(false); }} aria-label="Clear map search"><Icon name="close"/></button>}
        </form>
        {mapSearchOpen && mapSearch.trim() && <div className="map-inline-results" role="listbox" aria-label="Mapped pad matches">
          {searchResults.length ? searchResults.map((row) => <button key={row.padId} type="button" role="option" aria-selected={row.padId === selectedId} onClick={() => focusPad(row)}>
            <span><strong>{row.padName}</strong><small>{[row.company, row.county, row.state].filter(Boolean).join(" · ")}</small></span><Icon name="location"/>
          </button>) : <p>No safe map point matches that pad name.</p>}
          <button type="button" className="map-search-all" onClick={() => navigate("/search/all")}>Search the complete directory <span>→</span></button>
        </div>}
        <div className="filter-row" aria-label="Map filters">
          {roadMode ? <button type="button" className="active" aria-pressed="true">Field pads</button> : (["all", "pad", "disposal"] as const).map((filter) => <button key={filter} className={typeFilter === filter ? "active" : ""} aria-pressed={typeFilter === filter} onClick={() => { setLocationChoices(null); setTypeFilter(filter); }}>{filter === "all" ? "All locations" : filter === "pad" ? "Pads" : "Disposals"}</button>)}
        </div>
        {companyRoads.availability.state === "ready" && <>{roadMode ? <div className="map-road-mode-authority"><Icon name="route"/><span><strong>Exact approved roads only</strong><small>Background roads are faded. Held, candidate, stale, guessed, and unpublished roads stay hidden.</small></span></div> : <label className="company-road-filter">
          <span><Icon name="company"/>Approved route roads by company</span>
          <select value={companyRoads.selection || ""} onChange={(event) => { setSelectedId(null); setLocationChoices(null); companyRoads.selectRoads(event.target.value ? event.target.value : null); }} aria-label="Show approved route roads by company">
            <option value="">Roads off</option>
            <option value="all">All approved route roads</option>
            {companyRoads.availability.companies.map((company) => <option key={company} value={company}>{company}</option>)}
          </select>
        </label>}
        <p className="company-road-authority" role="status" aria-live="polite">{companyRoadRenderFailed ? "Approved route roads could not be drawn and are hidden. No route-road geometry was inferred." : companyRoads.loading ? "Loading exact approved roads… Choose Roads off to cancel." : companyRoads.error || (companyRoads.overlay ? `${companyRoads.overlay.rows.length.toLocaleString()} exact approved route-road sections shown for ${companyRoads.selection === "all" ? "all available companies" : companyRoads.selection}. This is the released route-ready subset, not a complete company road inventory.` : companyRoads.availability.reason || "Choose one company or All. Only exact server-approved route roads are shown; held, stale, legacy-only, guessed, and unpublished roads remain hidden.")}</p>
        </>}
        {roadMode && companyRoads.availability.state !== "ready" && <div className="map-road-mode-authority is-held"><Icon name="route"/><span><strong>Approved-road layer unavailable</strong><small>{companyRoads.availability.reason || "Nothing was inferred or substituted."}</small></span></div>}
      </div>
      <div className="map-data-note"><span className={`data-dot data-${snapshot.sourceState}`}/><strong>{visibleMappedCount.toLocaleString()}</strong> safe map points · {(visibleRows.length - visibleMappedCount).toLocaleString()} still missing {selectedRoadCompany ? `for ${selectedRoadCompany}` : ""}</div>
      <div className={`map-render-notice map-render-${mapRenderState}`} role={mapRenderState === "error" ? "alert" : "status"} data-map-render-state={mapRenderState}>
        <span/>{mapNotice}
      </div>
    </div>
    {locationChoices ? <aside className="map-cluster-chooser" role="dialog" aria-modal="false" aria-labelledby="map-cluster-title">
      <header><div><span className="selection-kicker">SAME EXACT POINT</span><h2 id="map-cluster-title">Choose one of {locationChoices.length}</h2></div><button className="selection-close" onClick={() => setLocationChoices(null)} aria-label="Close location chooser"><Icon name="close"/></button></header>
      <p>These records share the same stored coordinate. Select the exact pad or disposal you want to review.</p>
      <div className="map-cluster-list">{locationChoices.map((row) => <button key={row.padId} type="button" className="map-cluster-choice" onClick={() => focusPad(row)}>
        <span><small>{row.recordType === "disposal" ? "DISPOSAL" : row.company || "FIELD PAD"}</small><strong>{row.padName}</strong><span>{[row.county, row.state].filter(Boolean).join(", ") || "Location not listed"}</span></span><b>Select</b>
      </button>)}</div>
    </aside> : selected ? <article className="map-selection-card">
      <button className="selection-close" onClick={() => { pendingRouteFitRef.current = false; setSelectedId(null); }} aria-label="Close selected pad"><Icon name="close"/></button>
      <div className="selection-kicker">{selected.recordType === "disposal" ? "DISPOSAL" : "FIELD PAD"}</div>
      <h2>{selected.padName}</h2>
      <p>{selected.company} · {[selected.county, selected.state].filter(Boolean).join(", ")}</p>
      <div className="selection-statuses">{selectedStatus ? <><StatusBadge status={selectedStatus.route.state} label={selectedStatus.route.source.replaceAll("_", " ")}/><StatusBadge status={selectedStatus.google.publicState} label={`Google ${selectedStatus.google.publicState.replaceAll("_", " ")}`}/></> : <span className="mini-badge muted">Checking selected pad status…</span>}</div>
      {routeChoices.length > 1 && <div className="map-route-choice" aria-label="Choose exact approved route">{routeChoices.map((choice) => <button key={choice.routeKey} type="button" className={choice.routeKey === selectedRouteChoice?.routeKey ? "is-selected" : ""} aria-pressed={choice.routeKey === selectedRouteChoice?.routeKey} onClick={() => { pendingRouteFitRef.current = true; setSelectedRouteKey(choice.routeKey); }}><strong>{choice.label}</strong><small>{choice.steps.length} exact steps</small></button>)}</div>}
      {selectedStatus && <p className={`selection-route-note${selectedRouteGeometry ? " is-ready" : " is-held"}`}>{selectedRouteGeometry ? `${selectedRouteChoice?.label ? `${selectedRouteChoice.label} · ` : ""}Exact approved inbound route highlighted. Other approved roads are subdued while this pad is selected.` : "No exact approved inbound route is currently public for this pad. No route line was inferred."}</p>}
      {selectedCoordinate && <div className="map-coordinate-reference">
        <span><strong>{mapDisplayCoordinateLabel(selected)}</strong><small>{selectedCoordinate.latitude.toFixed(6)}, {selectedCoordinate.longitude.toFixed(6)}</small></span>
        <button type="button" onClick={() => navigator.clipboard.writeText(`${selectedCoordinate.latitude.toFixed(6)}, ${selectedCoordinate.longitude.toFixed(6)}`).catch(() => undefined)}>Copy GPS</button>
      </div>}
      {selected.structuredRoadSequence && <div className="map-saved-road-sequence"><strong>Saved road sequence</strong><span>{selected.structuredRoadSequence}</span></div>}
      {selectedCoordinate?.role !== "driver_entrance" && <div className="inline-warning"><Icon name="location"/>{selectedCoordinate?.role === "reference" ? "This exact official pad/wellhead reference is displayed only to locate the record. It is not a driver entrance, route endpoint, approved route, or permission to launch Google navigation." : selectedCoordinate ? "This exact saved GPS is displayed for field checking only. It is not a verified entrance, an approved route, or permission to launch Google navigation." : "No safe GPS is available for this record. Nothing was inferred or placed on the map."}</div>}
      <button className="button-primary" onClick={() => navigate(`/pad/${encodeURIComponent(selected.padId)}`)}>Open pad details <span>→</span></button>
    </article> : <aside className="map-legend-card"><strong>BrineSearch road truth</strong>{roadMode && <span><i className="legend-line approved"/>Exact approved route road</span>}<span><i className="legend-dot ready"/>Verified entrance</span><span><i className="legend-dot review"/>Reference point · not an entrance</span><span><i className="legend-dot disposal"/>Disposal</span></aside>}
  </section>;
}
