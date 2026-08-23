import { useEffect, useRef, useState } from "react";
import { AttributionControl, LngLatBounds, Map as MapLibreMap, Marker } from "maplibre-gl";
import type { DriverPadStatus, DriverRouteGeometry, PadSummary } from "@/data/types";

const mapStyle = import.meta.env.VITE_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty";

function routePoints(geometry: DriverRouteGeometry | null): [number, number][] {
  if (!geometry) return [];
  return geometry.features.flatMap((feature) => feature.geometry.type === "LineString"
    ? feature.geometry.coordinates
    : feature.geometry.coordinates.flat());
}

export function PadMapPreview({ pad, status }: { pad: PadSummary; status: DriverPadStatus }) {
  const host = useRef<HTMLDivElement | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  useEffect(() => {
    if (!host.current) return;
    setMapError(null);
    const points = routePoints(status.route.geometry);
    const destination = status.destination.available && status.destination.latitude !== null && status.destination.longitude !== null
      ? [status.destination.longitude, status.destination.latitude] as [number, number]
      : pad.coordinate ? [pad.coordinate.longitude, pad.coordinate.latitude] as [number, number] : null;
    const center = destination ?? points[0];
    if (!center) return;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({ container: host.current, style: mapStyle, center, zoom: 12.5, interactive: true, attributionControl: false });
      map.addControl(new AttributionControl({ compact: true }));
      if (destination) new Marker({ color: status.destination.available ? "#52e4bd" : "#f0b45d" }).setLngLat(destination).addTo(map);
    } catch {
      setMapError("Map preview could not start. The verified status above remains authoritative.");
      return;
    }
    const loadDeadline = window.setTimeout(() => {
      setMapError("Map detail did not load. The verified status above remains authoritative.");
    }, 8_000);
    map.once("load", () => {
      window.clearTimeout(loadDeadline);
      if (!status.route.geometry || !points.length) return;
      try {
        map.addSource("brinesearch-approved-route", { type: "geojson", data: status.route.geometry });
        map.addLayer({ id: "brinesearch-approved-route-casing", type: "line", source: "brinesearch-approved-route", paint: { "line-color": "#07131f", "line-width": 8, "line-opacity": 0.85 } });
        map.addLayer({ id: "brinesearch-approved-route", type: "line", source: "brinesearch-approved-route", paint: { "line-color": "#52e4bd", "line-width": 5, "line-opacity": 0.96 } });
        const bounds = points.reduce((next, point) => next.extend(point), new LngLatBounds(points[0], points[0]));
        map.fitBounds(bounds, { padding: 42, maxZoom: 14, duration: 0 });
      } catch {
        setMapError("Approved route detail could not be drawn. No substitute route was inferred.");
      }
    });
    return () => {
      window.clearTimeout(loadDeadline);
      map.remove();
    };
  }, [pad, status]);
  if (!pad.coordinate && !status.route.geometry) return <div className="pad-map-empty">No mapped driver location</div>;
  return <div className="pad-map-shell">
    <div className="pad-map-preview" ref={host} aria-label={`Map preview and approved route for ${pad.padName}`}/>
    {mapError && <div className="pad-map-warning" role="alert">{mapError}</div>}
  </div>;
}
