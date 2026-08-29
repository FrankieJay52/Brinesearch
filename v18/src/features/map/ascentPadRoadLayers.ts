import type { FilterSpecification, GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { firstSymbolLayerAfterLines, highwayReferenceCasingLayerId } from "./highwayReference";
import type { AscentPadApproachMapDisplay } from "./ascentPadApproaches";
import type { AscentPadRoadDisplay } from "./ascentPadRoadDisplays";

export type AscentPadRoadLayerDisplay = AscentPadRoadDisplay | AscentPadApproachMapDisplay;

export const ascentPadRoadSourceId = "brinesearch-ascent-pad-road-lines";
export const ascentPadRoadRedCasingLayerId = "brinesearch-ascent-pad-road-red-casing";
export const ascentPadRoadRedLineLayerId = "brinesearch-ascent-pad-road-red-line";
export const ascentPadRoadGpsCasingLayerId = "brinesearch-ascent-pad-road-gps-casing";
export const ascentPadRoadGpsLineLayerId = "brinesearch-ascent-pad-road-gps-line";
export const ascentPadRoadUnverifiedCasingLayerId = "brinesearch-ascent-pad-road-unverified-casing";
export const ascentPadRoadUnverifiedLineLayerId = "brinesearch-ascent-pad-road-unverified-line";
export const ascentPadRoadTealCasingLayerId = "brinesearch-ascent-pad-road-teal-casing";
export const ascentPadRoadTealLineLayerId = "brinesearch-ascent-pad-road-teal-line";
export const ascentPadRoadSelectedCasingLayerId = "brinesearch-ascent-pad-road-selected-casing";
export const ascentPadRoadSelectedLineLayerId = "brinesearch-ascent-pad-road-selected-line";

export const ascentPadRoadLayerIdsInPaintOrder = [
  ascentPadRoadRedCasingLayerId,
  ascentPadRoadRedLineLayerId,
  ascentPadRoadGpsCasingLayerId,
  ascentPadRoadGpsLineLayerId,
  ascentPadRoadUnverifiedCasingLayerId,
  ascentPadRoadUnverifiedLineLayerId,
  ascentPadRoadTealCasingLayerId,
  ascentPadRoadTealLineLayerId,
  ascentPadRoadSelectedCasingLayerId,
  ascentPadRoadSelectedLineLayerId,
] as const;

const redFilter: FilterSpecification = ["==", ["get", "colorRole"], "red"];
const gpsFilter: FilterSpecification = ["==", ["get", "colorRole"], "gps"];
const unverifiedFilter: FilterSpecification = ["==", ["get", "colorRole"], "unverified"];
const tealFilter: FilterSpecification = ["==", ["get", "colorRole"], "teal"];

function displayLines(display: AscentPadRoadLayerDisplay) {
  return "lines" in display
    ? display.lines
    : [display.arrival, display.gpsLeg, display.redContinuation].filter((line) => line !== null);
}

export function ascentPadRoadCollection(displays: readonly AscentPadRoadLayerDisplay[]) {
  return {
    type: "FeatureCollection" as const,
    features: displays.flatMap((display) => displayLines(display).map((line) => ({
      type: "Feature" as const,
      properties: {
        padId: display.padId,
        company: display.company,
        colorRole: line.colorRole,
        label: line.label,
      },
      geometry: {
        type: "LineString" as const,
        coordinates: line.coordinates.map(([longitude, latitude]) => [longitude, latitude] as [number, number]),
      },
    }))),
  };
}

function selectedFilter(selectedPadId: string | null): FilterSpecification {
  return [
    "all",
    ["==", ["get", "colorRole"], "teal"],
    ["==", ["get", "padId"], selectedPadId || "__none__"],
  ];
}

function allLayersExist(map: MapLibreMap) {
  return ascentPadRoadLayerIdsInPaintOrder.every((layerId) => Boolean(map.getLayer(layerId)));
}

function anyLayerExists(map: MapLibreMap) {
  return ascentPadRoadLayerIdsInPaintOrder.some((layerId) => Boolean(map.getLayer(layerId)));
}

function setLayerVisibility(map: MapLibreMap, visible: boolean) {
  for (const layerId of ascentPadRoadLayerIdsInPaintOrder) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }
}

export function clearAscentPadRoadLayers(map: MapLibreMap) {
  for (const layerId of [...ascentPadRoadLayerIdsInPaintOrder].reverse()) {
    try {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    } catch {
      // Style replacement can remove a layer between checking and cleanup.
    }
  }
  try {
    if (map.getSource(ascentPadRoadSourceId)) map.removeSource(ascentPadRoadSourceId);
  } catch {
    // The exact-record display fails closed if source cleanup races a style load.
  }
}

export function syncAscentPadRoadSelection(map: MapLibreMap, selectedPadId: string | null) {
  const filter = selectedFilter(selectedPadId);
  try {
    if (map.getLayer(ascentPadRoadSelectedCasingLayerId)) {
      map.setFilter(ascentPadRoadSelectedCasingLayerId, filter);
    }
    if (map.getLayer(ascentPadRoadSelectedLineLayerId)) {
      map.setFilter(ascentPadRoadSelectedLineLayerId, filter);
    }
  } catch {
    // Losing optional emphasis never changes the persistent verified line.
  }
}

export function syncAscentPadRoadLayers(
  map: MapLibreMap,
  displays: readonly AscentPadRoadLayerDisplay[],
  selectedPadId: string | null,
) {
  const data = ascentPadRoadCollection(displays);
  try {
    const existingSource = map.getSource(ascentPadRoadSourceId);
    const completeExistingLayers = allLayersExist(map);
    if (existingSource && completeExistingLayers) {
      const geoJsonSource = existingSource as GeoJSONSource;
      if (typeof geoJsonSource.setData !== "function") throw new Error("Ascent GPS-line source is not GeoJSON");
      geoJsonSource.setData(data);
      syncAscentPadRoadSelection(map, selectedPadId);
      setLayerVisibility(map, displays.length > 0);
      return true;
    }

    // Style replacement can leave a partial source/layer family. Rebuild only
    // that exceptional state; ordinary filter and directory changes stay on
    // the existing native source so phone pans do not pay eight layer rebuilds.
    if (existingSource || anyLayerExists(map)) clearAscentPadRoadLayers(map);
    if (!displays.length) return true;

    map.addSource(ascentPadRoadSourceId, {
      type: "geojson",
      data,
    });
    if (!map.getSource(ascentPadRoadSourceId)) throw new Error("Ascent GPS-line source was rejected");

    const firstSymbolLayer = firstSymbolLayerAfterLines(map.getStyle());
    const belowHighways = map.getLayer(highwayReferenceCasingLayerId)
      ? highwayReferenceCasingLayerId
      : firstSymbolLayer;
    map.addLayer({
      id: ascentPadRoadRedCasingLayerId,
      type: "line",
      source: ascentPadRoadSourceId,
      filter: redFilter,
      paint: { "line-color": "rgba(7, 19, 31, .9)", "line-width": 8, "line-opacity": .96 },
      layout: { "line-cap": "round", "line-join": "round" },
    }, belowHighways);
    map.addLayer({
      id: ascentPadRoadRedLineLayerId,
      type: "line",
      source: ascentPadRoadSourceId,
      filter: redFilter,
      paint: { "line-color": "#ef4444", "line-width": 4.5, "line-opacity": .98 },
      layout: { "line-cap": "round", "line-join": "round" },
    }, belowHighways);
    map.addLayer({
      id: ascentPadRoadGpsCasingLayerId,
      type: "line",
      source: ascentPadRoadSourceId,
      filter: gpsFilter,
      paint: {
        "line-color": "rgba(30, 41, 59, .9)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 2.4, 10, 3.4, 14, 4.8],
        "line-opacity": .9,
      },
      layout: { "line-cap": "round", "line-join": "round" },
    }, firstSymbolLayer);
    map.addLayer({
      id: ascentPadRoadGpsLineLayerId,
      type: "line",
      source: ascentPadRoadSourceId,
      filter: gpsFilter,
      paint: {
        "line-color": "#94a3b8",
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.1, 10, 1.8, 14, 2.7],
        "line-opacity": .96,
      },
      layout: { "line-cap": "round", "line-join": "round" },
    }, firstSymbolLayer);
    map.addLayer({
      id: ascentPadRoadUnverifiedCasingLayerId,
      type: "line",
      source: ascentPadRoadSourceId,
      filter: unverifiedFilter,
      paint: {
        "line-color": "rgba(30, 41, 59, .92)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 5, 10, 6.5, 14, 8],
        "line-opacity": .94,
      },
      layout: { "line-cap": "round", "line-join": "round" },
    }, firstSymbolLayer);
    map.addLayer({
      id: ascentPadRoadUnverifiedLineLayerId,
      type: "line",
      source: ascentPadRoadSourceId,
      filter: unverifiedFilter,
      paint: {
        "line-color": "#94a3b8",
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 2.4, 10, 3.4, 14, 4.8],
        "line-opacity": .98,
      },
      layout: { "line-cap": "round", "line-join": "round" },
    }, firstSymbolLayer);
    map.addLayer({
      id: ascentPadRoadTealCasingLayerId,
      type: "line",
      source: ascentPadRoadSourceId,
      filter: tealFilter,
      paint: { "line-color": "rgba(7, 19, 31, .88)", "line-width": 8, "line-opacity": .94 },
      layout: { "line-cap": "round", "line-join": "round" },
    }, firstSymbolLayer);
    map.addLayer({
      id: ascentPadRoadTealLineLayerId,
      type: "line",
      source: ascentPadRoadSourceId,
      filter: tealFilter,
      paint: { "line-color": "#2dd4bf", "line-width": 4.5, "line-opacity": .96 },
      layout: { "line-cap": "round", "line-join": "round" },
    }, firstSymbolLayer);
    map.addLayer({
      id: ascentPadRoadSelectedCasingLayerId,
      type: "line",
      source: ascentPadRoadSourceId,
      filter: selectedFilter(selectedPadId),
      paint: { "line-color": "rgba(7, 19, 31, .95)", "line-width": 10, "line-opacity": .98 },
      layout: { "line-cap": "round", "line-join": "round" },
    }, firstSymbolLayer);
    map.addLayer({
      id: ascentPadRoadSelectedLineLayerId,
      type: "line",
      source: ascentPadRoadSourceId,
      filter: selectedFilter(selectedPadId),
      paint: { "line-color": "#7ef8d8", "line-width": 6, "line-opacity": 1 },
      layout: { "line-cap": "round", "line-join": "round" },
    }, firstSymbolLayer);
    if (ascentPadRoadLayerIdsInPaintOrder.some((layerId) => !map.getLayer(layerId))) {
      throw new Error("Ascent GPS-line layers were rejected");
    }
    setLayerVisibility(map, true);
    return true;
  } catch {
    clearAscentPadRoadLayers(map);
    return false;
  }
}
