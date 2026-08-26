import { useEffect, useRef, useState } from "react";
import { AttributionControl, LngLatBounds, Map as MapLibreMap, Marker, type StyleSpecification } from "maplibre-gl";
import { mapDisplayCoordinate, mapDisplayCoordinateLabel } from "@/data/mapDisplayCoordinates";
import type { DriverPadStatus, DriverRouteGeometry, PadSummary } from "@/data/types";

const mapStyle = import.meta.env.VITE_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty";
const fallbackMapStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "pad-preview-background", type: "background", paint: { "background-color": "#dce9e7" } }],
};
type MapPoint = [number, number];

export function routePoints(geometry: DriverRouteGeometry | null): MapPoint[] {
  if (!geometry) return [];
  return geometry.features.flatMap((feature) => feature.geometry.type === "LineString"
    ? feature.geometry.coordinates
    : feature.geometry.coordinates.flat());
}

/**
 * Frames only reviewed geometry and the already-selected display coordinate.
 * Adding the marker to the frame keeps a verified entrance visible without
 * extending, snapping, or otherwise changing the approved route.
 */
export function padMapFramePoints(geometry: DriverRouteGeometry | null, marker: MapPoint | null): MapPoint[] {
  const points = routePoints(geometry);
  return marker ? [...points, marker] : points;
}

export function padMapFrameOptions(expanded: boolean) {
  return {
    padding: expanded
      ? { top: 58, right: 58, bottom: 58, left: 58 }
      : { top: 14, right: 14, bottom: 24, left: 14 },
    maxZoom: expanded ? 15 : 14.5,
    duration: 0,
  } as const;
}

export function collapseCompactAttribution(host: ParentNode | null) {
  const attribution = host?.querySelector<HTMLElement>(".maplibregl-ctrl-attrib");
  attribution?.removeAttribute("open");
  attribution?.classList.remove("maplibregl-compact-show");
}

function framePadMap(map: MapLibreMap, points: MapPoint[], expanded: boolean) {
  if (!points.length) return;
  if (points.length === 1) {
    map.jumpTo({ center: points[0], zoom: expanded ? 15 : 14.5 });
    return;
  }
  const bounds = points.reduce((next, point) => next.extend(point), new LngLatBounds(points[0], points[0]));
  map.fitBounds(bounds, padMapFrameOptions(expanded));
}

function routeLines(geometry: DriverRouteGeometry | null): MapPoint[][] {
  if (!geometry) return [];
  return geometry.features.flatMap((feature) => feature.geometry.type === "LineString"
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates);
}

/**
 * Draws the reviewed geometry above the basemap canvas. Keeping this small
 * overlay independent of the tile/style worker means the exact line remains
 * visible even when the optional basemap has to use its offline background.
 */
function drawApprovedRouteOverlay(map: MapLibreMap, canvas: HTMLCanvasElement | null, geometry: DriverRouteGeometry | null) {
  if (!canvas) return 0;
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
  if (!context) return 0;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  const lines = routeLines(geometry);
  if (!lines.length) return 0;
  const stroke = (color: string, lineWidth: number) => {
    context.beginPath();
    for (const line of lines) {
      line.forEach((coordinate, index) => {
        const point = map.project(coordinate);
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
    }
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
  };
  stroke("rgba(7, 19, 31, .88)", 8);
  stroke("#52e4bd", 5);
  return lines.length;
}

export function PadMapPreview({ pad, status, routeGeometry = status.route.geometry }: { pad: PadSummary; status: DriverPadStatus; routeGeometry?: DriverRouteGeometry | null }) {
  const host = useRef<HTMLDivElement | null>(null);
  const routeOverlay = useRef<HTMLCanvasElement | null>(null);
  const attributionHost = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<MapLibreMap | null>(null);
  const expandedRef = useRef(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  expandedRef.current = expanded;
  useEffect(() => {
    if (!host.current) return;
    setMapError(null);
    const points = routePoints(routeGeometry);
    const displayCoordinate = mapDisplayCoordinate(pad);
    const destination = status.destination.available && status.destination.latitude !== null && status.destination.longitude !== null
      ? [status.destination.longitude, status.destination.latitude] as [number, number]
      : displayCoordinate ? [displayCoordinate.longitude, displayCoordinate.latitude] as [number, number] : null;
    const center = destination ?? points[0];
    const framePoints = padMapFramePoints(routeGeometry, destination);
    if (!center) return;
    host.current.dataset.routeFeatureCount = String(routeGeometry?.features.length || 0);
    host.current.dataset.framePointCount = String(framePoints.length);
    host.current.dataset.destination = destination ? `${destination[1].toFixed(6)},${destination[0].toFixed(6)}` : "unavailable";
    host.current.dataset.routeOverlayReady = "false";
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({ container: host.current, style: mapStyle, center, zoom: 12.5, interactive: true, attributionControl: false });
      mapInstance.current = map;
      map.addControl(new AttributionControl({ compact: true }));
      const attribution = host.current.querySelector<HTMLElement>(".maplibregl-ctrl-attrib");
      if (attribution && attributionHost.current) attributionHost.current.appendChild(attribution);
      collapseCompactAttribution(attributionHost.current);
      if (destination) new Marker({ color: status.destination.available ? "#52e4bd" : "#f0b45d" }).setLngLat(destination).addTo(map);
    } catch {
      setMapError("Map preview could not start. The verified status above remains authoritative.");
      return;
    }
    const drawRouteOverlay = () => {
      const renderedLines = drawApprovedRouteOverlay(map, routeOverlay.current, routeGeometry);
      if (host.current) host.current.dataset.routeOverlayReady = String(renderedLines > 0);
    };
    let overlayFrame: number | null = null;
    const scheduleRouteOverlay = () => {
      if (overlayFrame !== null) window.cancelAnimationFrame(overlayFrame);
      overlayFrame = window.requestAnimationFrame(() => {
        overlayFrame = null;
        drawRouteOverlay();
      });
    };
    map.on("move", scheduleRouteOverlay);
    map.on("resize", scheduleRouteOverlay);
    let styleReady = false;
    let fallbackApplied = false;
    const loadDeadline = window.setTimeout(() => {
      if (!styleReady && !fallbackApplied) {
        fallbackApplied = true;
        try {
          map.setStyle(fallbackMapStyle);
        } catch {
          setMapError("Map detail did not load. The verified status above remains authoritative.");
        }
      }
    }, 8_000);
    const drawVerifiedMap = () => {
      window.clearTimeout(loadDeadline);
      styleReady = true;
      try {
        framePadMap(map, framePoints, expandedRef.current);
        map.triggerRepaint();
        scheduleRouteOverlay();
      } catch {
        if (host.current) host.current.dataset.routeOverlayReady = "false";
        setMapError("Approved route detail could not be drawn. No substitute route was inferred.");
      }
    };
    const recoverMissingStyle = () => {
      if (styleReady || fallbackApplied) return;
      fallbackApplied = true;
      try {
        map.setStyle(fallbackMapStyle);
      } catch {
        setMapError("Map preview could not load. The verified status above remains authoritative.");
      }
    };
    map.on("style.load", drawVerifiedMap);
    map.on("error", recoverMissingStyle);
    const toggleMapSize = (event: { originalEvent?: Event }) => {
      const target = event.originalEvent?.target;
      if (target instanceof Element && target.closest(".maplibregl-ctrl")) return;
      setExpanded((current) => !current);
    };
    map.on("click", toggleMapSize);
    return () => {
      window.clearTimeout(loadDeadline);
      if (overlayFrame !== null) window.cancelAnimationFrame(overlayFrame);
      map.off("click", toggleMapSize);
      map.off("move", scheduleRouteOverlay);
      map.off("resize", scheduleRouteOverlay);
      map.off("style.load", drawVerifiedMap);
      map.off("error", recoverMissingStyle);
      mapInstance.current = null;
      map.remove();
    };
  }, [pad, routeGeometry, status]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const map = mapInstance.current;
      if (!map) return;
      map.resize();
      const displayCoordinate = mapDisplayCoordinate(pad);
      const destination = status.destination.available && status.destination.latitude !== null && status.destination.longitude !== null
        ? [status.destination.longitude, status.destination.latitude] as MapPoint
        : displayCoordinate ? [displayCoordinate.longitude, displayCoordinate.latitude] as MapPoint : null;
      framePadMap(map, padMapFramePoints(routeGeometry, destination), expanded);
      map.triggerRepaint();
      const renderedLines = drawApprovedRouteOverlay(map, routeOverlay.current, routeGeometry);
      if (host.current) host.current.dataset.routeOverlayReady = String(renderedLines > 0);
      if (!expanded) collapseCompactAttribution(attributionHost.current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [expanded, pad, routeGeometry, status.destination.available, status.destination.latitude, status.destination.longitude]);
  if (!mapDisplayCoordinate(pad) && !routeGeometry) return <div className="pad-map-empty">No safe mapped location</div>;
  return <section
    className={`pad-map-shell ${expanded ? "is-expanded" : "is-compact"}`}
    aria-label={`${expanded ? "Expanded" : "Compact"} map for ${pad.padName}`}
    data-route-features={routeGeometry?.features.length || 0}
    data-status-route-features={status.route.geometry?.features.length || 0}
    data-route-steps={status.routeSteps.length}
  >
    <div className="pad-map-preview" aria-label={`Map preview and approved route for ${pad.padName}`}>
      <div className="pad-map-renderer" ref={host}/>
      <canvas className="pad-map-route-overlay" ref={routeOverlay} aria-hidden="true"/>
    </div>
    <div className="pad-map-toolbar">
      <div className="pad-map-attribution-host" ref={attributionHost}/>
      <button type="button" className="pad-map-size-toggle" aria-expanded={expanded} aria-label={expanded ? "Shrink pad map" : "Expand pad map"} onClick={() => setExpanded((current) => !current)}>
        {expanded ? <><span aria-hidden="true">×</span> Shrink map</> : <><span aria-hidden="true">↗</span> Expand</>}
      </button>
    </div>
    {mapDisplayCoordinate(pad)?.role === "reference" && <div className="pad-map-warning" role="note">{mapDisplayCoordinateLabel(pad)}. Display only; it cannot launch navigation.</div>}
    {mapError && <div className="pad-map-warning" role="alert">{mapError}</div>}
  </section>;
}
