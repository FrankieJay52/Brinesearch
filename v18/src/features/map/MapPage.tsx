import { useEffect, useMemo, useRef, useState } from "react";
import {
  GeolocateControl,
  LngLatBounds,
  Map as MapLibreMap,
  type MapMouseEvent,
  NavigationControl,
  type StyleSpecification,
} from "maplibre-gl";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { LoadingState } from "@/components/LoadingState";
import { StatusBadge } from "@/components/StatusBadge";
import { useDirectory } from "@/data/DirectoryContext";
import { useCompanyRoads } from "@/data/CompanyRoadsContext";
import { loadPadStatus } from "@/data/status";
import type { CompanyRoadOverlayRow, DriverPadStatus, DriverRouteGeometry, PadSummary } from "@/data/types";
import { clusterNeedsChooser, emptyMapCoordinateNotice, filterMapRows, groupProjectedPads, hasSafeCoordinate } from "./mapModel";

const mapStyle = import.meta.env.VITE_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty";
const fallbackMapStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "offline-background", type: "background", paint: { "background-color": "#102938" } }],
};
const mapStyleTimeoutMs = 8_000;
const clusterExpansionMaxZoom = 14;
const companyRoadSourceId = "brinesearch-company-roads";
const companyRoadCasingLayerId = "brinesearch-company-roads-casing";
const companyRoadLineLayerId = "brinesearch-company-roads-line";

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

function routeLines(geometry: DriverRouteGeometry | null) {
  if (!geometry) return [];
  return geometry.features.flatMap((feature) => feature.geometry.type === "LineString"
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates);
}

function pointColor(row: PadSummary) {
  if (row.coordinate?.role === "driver_entrance") return "#52e4bd";
  if (row.recordType === "disposal") return "#70a8ff";
  return "#f0b45d";
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

  const safeRows = rows.filter(hasSafeCoordinate);
  const projected = safeRows.map((row) => {
    const point = map.project([row.coordinate!.longitude, row.coordinate!.latitude]);
    return { row, x: point.x, y: point.y };
  }).filter((point) => point.x >= -40 && point.x <= width + 40 && point.y >= -40 && point.y <= height + 40);
  const cellSize = map.getZoom() >= 13 ? 26 : map.getZoom() >= 10 ? 38 : 52;
  const groups = groupProjectedPads(projected, cellSize);
  const targets: PadHitTarget[] = [];

  for (const group of groups) {
    const selected = selectedId ? group.rows.some((row) => row.padId === selectedId) : false;
    if (group.rows.length > 1) {
      const radius = group.rows.length >= 200 ? 28 : group.rows.length >= 50 ? 23 : 18;
      context.beginPath();
      context.arc(group.x, group.y, radius, 0, Math.PI * 2);
      context.fillStyle = "#58d6c8";
      context.fill();
      context.strokeStyle = selected ? "#ffffff" : "#07131f";
      context.lineWidth = selected ? 4 : 3;
      context.stroke();
      context.fillStyle = "#07131f";
      context.font = "800 12px system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(group.rows.length > 999 ? "999+" : String(group.rows.length), group.x, group.y);
      targets.push({ ...group, radius: radius + 5 });
      continue;
    }
    const row = group.rows[0];
    const radius = selected ? 10 : 7;
    context.beginPath();
    context.arc(group.x, group.y, radius, 0, Math.PI * 2);
    context.fillStyle = pointColor(row);
    context.fill();
    context.strokeStyle = selected ? "#ffffff" : "#07131f";
    context.lineWidth = selected ? 4 : 2.5;
    context.stroke();
    targets.push({ ...group, radius: radius + 6 });
  }

  return { inputCount: safeRows.length, renderedCount: groups.length, targets };
}

export function MapPage() {
  const { snapshot, loading, error } = useDirectory();
  const companyRoads = useCompanyRoads();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clusterChoices, setClusterChoices] = useState<PadSummary[] | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<DriverPadStatus | null>(null);
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
  const navigate = useNavigate();

  const selectedRoadCompany = companyRoads.selection && companyRoads.selection !== "all" ? companyRoads.selection : null;
  const visibleRows = useMemo(
    () => filterMapRows(snapshot?.rows || [], typeFilter, selectedRoadCompany),
    [selectedRoadCompany, snapshot, typeFilter],
  );
  const visibleMappedCount = useMemo(() => visibleRows.filter(hasSafeCoordinate).length, [visibleRows]);
  const selected = snapshot?.rows.find((row) => row.padId === selectedId) || null;
  visibleRowsRef.current = visibleRows;
  selectedRouteRef.current = selectedStatus?.route.geometry || null;
  companyRoadRowsRef.current = companyRoads.overlay?.rows || [];
  selectedIdRef.current = selectedId;

  useEffect(() => {
    let cancelled = false;
    setSelectedStatus(null);
    if (selected) loadPadStatus(selected, snapshot?.sourceState).then((status) => {
      if (!cancelled) setSelectedStatus(status);
    });
    return () => { cancelled = true; };
  }, [selected, snapshot?.sourceState]);

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
        setClusterChoices(null);
        return;
      }
      if (target.rows.length === 1) {
        setClusterChoices(null);
        setSelectedId(target.rows[0].padId);
        return;
      }
      if (clusterNeedsChooser(target.rows, map.getZoom(), clusterExpansionMaxZoom)) {
        setSelectedId(null);
        setClusterChoices(target.rows.slice().sort((left, right) => left.padName.localeCompare(right.padName) || left.company.localeCompare(right.company) || left.padId.localeCompare(right.padId)));
        return;
      }
      setClusterChoices(null);
      const bounds = new LngLatBounds();
      for (const row of target.rows) bounds.extend([row.coordinate!.longitude, row.coordinate!.latitude]);
      map.fitBounds(bounds, { padding: 72, maxZoom: Math.min(clusterExpansionMaxZoom, map.getZoom() + 3), duration: 420 });
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
      map.remove();
      mapRef.current = null;
    };
  }, [loading]);

  useEffect(() => { syncCompanyRoadLayersRef.current?.(); }, [companyRoads.overlay]);
  useEffect(() => { drawOverlayRef.current?.(); }, [visibleRows, selectedStatus, selectedId]);

  if (loading) return <LoadingState message="Loading the field map…"/>;
  if (!snapshot || error) return <section className="page-state"><h1>Map unavailable</h1><p>{error || "No complete directory is available."}</p></section>;

  return <section className="map-page">
    <div className="map-stage">
      <div ref={mapHost} className="map-canvas" aria-label="BrineSearch pad map"/>
      <canvas ref={padOverlay} className="map-point-overlay" aria-hidden="true"/>
    </div>
    <div className="map-control-stack">
      <div className="map-search-card">
        <button className="map-search-button" onClick={() => navigate("/search")}><Icon name="search"/><span>Pad, company, API, well, road…</span></button>
        <div className="filter-row" aria-label="Map filters">
          {(["all", "pad", "disposal"] as const).map((filter) => <button key={filter} className={typeFilter === filter ? "active" : ""} aria-pressed={typeFilter === filter} onClick={() => { setClusterChoices(null); setTypeFilter(filter); }}>{filter === "all" ? "All locations" : filter === "pad" ? "Pads" : "Disposals"}</button>)}
        </div>
        {companyRoads.availability.state === "ready" && <><label className="company-road-filter">
          <span><Icon name="company"/>Approved route roads by company</span>
          <select value={companyRoads.selection || ""} onChange={(event) => { setSelectedId(null); setClusterChoices(null); companyRoads.selectRoads(event.target.value ? event.target.value : null); }} aria-label="Show approved route roads by company">
            <option value="">Roads off</option>
            <option value="all">All approved route roads</option>
            {companyRoads.availability.companies.map((company) => <option key={company} value={company}>{company}</option>)}
          </select>
        </label>
        <p className="company-road-authority" role="status" aria-live="polite">{companyRoadRenderFailed ? "Approved route roads could not be drawn and are hidden. No route-road geometry was inferred." : companyRoads.loading ? "Loading exact approved roads… Choose Roads off to cancel." : companyRoads.error || (companyRoads.overlay ? `${companyRoads.overlay.rows.length.toLocaleString()} exact approved route-road sections shown for ${companyRoads.selection === "all" ? "all available companies" : companyRoads.selection}. This is the released route-ready subset, not a complete company road inventory.` : companyRoads.availability.reason || "Choose one company or All. Only exact server-approved route roads are shown; held, stale, legacy-only, guessed, and unpublished roads remain hidden.")}</p>
        </>}
      </div>
      <div className="map-data-note"><span className={`data-dot data-${snapshot.sourceState}`}/><strong>{visibleMappedCount.toLocaleString()}</strong> mapped · {visibleRows.length.toLocaleString()} {selectedRoadCompany ? `for ${selectedRoadCompany}` : "shown"}</div>
      <div className={`map-render-notice map-render-${mapRenderState}`} role={mapRenderState === "error" ? "alert" : "status"} data-map-render-state={mapRenderState}>
        <span/>{mapNotice}
      </div>
    </div>
    {clusterChoices ? <aside className="map-cluster-chooser" role="dialog" aria-modal="false" aria-labelledby="map-cluster-title">
      <header><div><span className="selection-kicker">MULTIPLE LOCATIONS</span><h2 id="map-cluster-title">Choose one of {clusterChoices.length}</h2></div><button className="selection-close" onClick={() => setClusterChoices(null)} aria-label="Close location chooser"><Icon name="close"/></button></header>
      <p>These locations share this map area. Select the exact pad or disposal you want to review.</p>
      <div className="map-cluster-list">{clusterChoices.map((row) => <button key={row.padId} type="button" className="map-cluster-choice" onClick={() => { setClusterChoices(null); setSelectedId(row.padId); }}>
        <span><small>{row.recordType === "disposal" ? "DISPOSAL" : row.company || "FIELD PAD"}</small><strong>{row.padName}</strong><span>{[row.county, row.state].filter(Boolean).join(", ") || "Location not listed"}</span></span><b>Select</b>
      </button>)}</div>
    </aside> : selected ? <article className="map-selection-card">
      <button className="selection-close" onClick={() => setSelectedId(null)} aria-label="Close selected pad"><Icon name="close"/></button>
      <div className="selection-kicker">{selected.recordType === "disposal" ? "DISPOSAL" : "FIELD PAD"}</div>
      <h2>{selected.padName}</h2>
      <p>{selected.company} · {[selected.county, selected.state].filter(Boolean).join(", ")}</p>
      <div className="selection-statuses">{selectedStatus ? <><StatusBadge status={selectedStatus.route.state} label={selectedStatus.route.source.replaceAll("_", " ")}/><StatusBadge status={selectedStatus.google.publicState} label={`Google ${selectedStatus.google.publicState.replaceAll("_", " ")}`}/></> : <span className="mini-badge muted">Checking selected pad status…</span>}</div>
      {selected.coordinate?.role !== "driver_entrance" && <div className="inline-warning"><Icon name="location"/>Saved point shown for reference; driver entrance still requires public verification.</div>}
      <button className="button-primary" onClick={() => navigate(`/pad/${encodeURIComponent(selected.padId)}`)}>Open pad details <span>→</span></button>
    </article> : <aside className="map-legend-card"><strong>BrineSearch road truth</strong><span><i className="legend-dot ready"/>Verified entrance</span><span><i className="legend-dot review"/>Saved point · review</span><span><i className="legend-dot disposal"/>Disposal</span></aside>}
  </section>;
}
